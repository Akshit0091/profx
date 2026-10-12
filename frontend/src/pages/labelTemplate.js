// Composes the branded label sheet: the seller's own artwork template is laid
// down as the page, and each courier label is cut out of its tax invoice and
// stamped into the blank middle of it.
//
// The branding is never redrawn in code — it is stamped as vector artwork from
// the template PDF, so the icons, fonts and spacing are exactly as designed.
import {
  PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, rgb,
  pushGraphicsState, popGraphicsState, setGraphicsState, rectangle, fill, setFillingColor,
} from 'pdf-lib';

export const TEMPLATE_URL = '/label-template.pdf';

// Breathing room between the label and the artwork above and below it.
const PAD_BELOW = 15;
const PAD_ABOVE = 6;

export const TEMPLATE_DEFAULTS = {
  logoGreyscale: true,
};

/* ------------------------- reading a PDF page ------------------------- */

function streamText(page) {
  const contents = page.node.Contents();
  if (!contents) return '';
  const parts = typeof contents.asArray === 'function'
    ? contents.asArray().map((ref) => page.node.context.lookup(ref))
    : [contents];
  let out = '';
  for (const part of parts) {
    if (part instanceof PDFRawStream) {
      try {
        const bytes = decodePDFRawStream(part).decode();
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        out += s;
      } catch (e) { /* unreadable stream, skip */ }
    }
  }
  return out;
}

// Every y a drawing operator touches, with the current translation applied.
function inkYs(txt, height) {
  const ys = [];
  let ty = 0;
  for (const raw of txt.split(/[\r\n]+/)) {
    const line = raw.trim();
    let m = /^q?\s*1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm$/.exec(line);
    if (m) { ty = parseFloat(m[2]); continue; }
    if (line === 'Q') { ty = 0; continue; }

    m = /^((?:-?[\d.]+\s+)+)(m|l|c|v|y|re)$/.exec(line);
    if (m) {
      const n = m[1].trim().split(/\s+/).map(Number);
      if (m[2] === 're') {
        ys.push(n[1] + ty, n[1] + n[3] + ty);
      } else {
        for (let i = 1; i < n.length; i += 2) ys.push(n[i] + ty);
      }
    }
  }
  const re = /([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) Tm/g;
  let t;
  while ((t = re.exec(txt))) ys.push(parseFloat(t[4]));

  // Td/Tm pairs that the loop above misses (text placed without a matrix)
  const re2 = /(-?[\d.]+)\s+(-?[\d.]+)\s+Td/g;
  while ((t = re2.exec(txt))) ys.push(parseFloat(t[2]));

  return ys.filter((y) => y >= 0 && y <= height);
}

/**
 * The tallest band of the template with no artwork in it — where the label goes.
 * Measured rather than hard-coded, so a redesigned template just works.
 */
export function findClearGap(page) {
  const { height } = page.getSize();
  const STEP = 2;
  const slots = new Array(Math.ceil(height / STEP)).fill(false);
  for (const y of inkYs(streamText(page), height)) {
    const i = Math.floor(y / STEP);
    // mark a little either side, so hairlines and glyph overhang still count
    for (let k = Math.max(0, i - 1); k <= Math.min(slots.length - 1, i + 1); k++) slots[k] = true;
  }

  let best = { start: 0, end: 0 };
  let run = -1;
  for (let i = 0; i <= slots.length; i++) {
    if (i < slots.length && !slots[i]) {
      if (run < 0) run = i;
    } else if (run >= 0) {
      if (i - run > best.end - best.start) best = { start: run, end: i };
      run = -1;
    }
  }
  return { bottom: best.start * STEP, top: best.end * STEP };
}

// Where the shipping label stops and the invoice starts: the full-width rule
// drawn immediately above the "TAX INVOICE" / "BILL OF SUPPLY" heading.
export function findInvoiceCut(txt) {
  let idx = txt.indexOf('(TAX INVOICE');
  if (idx < 0) idx = txt.indexOf('(BILL OF SUPPLY');
  if (idx < 0) return null;

  const before = txt.slice(Math.max(0, idx - 400), idx);
  const moves = [...before.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|Tm)/g)];
  if (!moves.length) return null;
  const headingY = parseFloat(moves[moves.length - 1][2]);

  const rules = [];
  const re = /(-?[\d.]+)\s+(-?[\d.]+)\s+m\s+(-?[\d.]+)\s+(-?[\d.]+)\s+l/g;
  let m;
  while ((m = re.exec(txt))) {
    const y1 = parseFloat(m[2]);
    const y2 = parseFloat(m[4]);
    if (Math.abs(y1 - y2) < 0.5 && Math.abs(parseFloat(m[3]) - parseFloat(m[1])) > 100) rules.push(y1);
  }
  const above = rules.filter((y) => y > headingY).sort((a, b) => a - b)[0];
  return above === undefined ? headingY + 12 : above;
}

function findContentTop(txt, height) {
  let top = -Infinity;
  const re = /(-?[\d.]+)\s+(-?[\d.]+)\s+(?:m|l|Td|Tm|re)\b/g;
  let m;
  while ((m = re.exec(txt))) {
    const y = parseFloat(m[2]);
    if (y >= 0 && y <= height) top = Math.max(top, y);
  }
  return Number.isFinite(top) ? top : height;
}

export function inspectPage(page) {
  const txt = streamText(page);
  const { width, height } = page.getSize();
  const cut = findInvoiceCut(txt);
  return {
    width,
    height,
    hasInvoice: cut !== null,
    cut: cut === null ? null : cut - 1,
    top: findContentTop(txt, height),
  };
}

/* ------------------------------ greyscale ----------------------------- */

// Drops colour from one band of the page: a zero-saturation fill composited
// with the Saturation blend mode keeps the brightness underneath and throws the
// hue away. It needs opaque paper beneath it, which the white page provides.
function greyscaleBand(doc, page, gsRef, y, h, width) {
  page.node.setExtGState(PDFName.of('GsGray'), gsRef);
  page.pushOperators(
    pushGraphicsState(),
    setGraphicsState('GsGray'),
    setFillingColor(rgb(0.5, 0.5, 0.5)),
    rectangle(0, y, width, h),
    fill(),
    popGraphicsState()
  );
}

/* ---------------------------- composition ----------------------------- */

/**
 * @param {File[]} files          raw label sheets from the seller panel
 * @param {Uint8Array} template   the branding artwork PDF
 * @param {object} settings       see TEMPLATE_DEFAULTS
 * @param {number} [pageLimit]    stop after this many pages (used by the preview)
 */
export async function buildSheet({ files, template, settings, pageLimit }) {
  const out = await PDFDocument.create();

  const tplDoc = await PDFDocument.load(template, { ignoreEncryption: true });
  const tplPage = tplDoc.getPage(0);
  const { width: PW, height: PH } = tplPage.getSize();
  const gap = findClearGap(tplPage);
  if (gap.top - gap.bottom < 120) {
    throw new Error('The branding template has no clear space in the middle for a label.');
  }
  const [tpl] = await out.embedPages([tplPage]);

  const gsRef = out.context.register(out.context.obj({ Type: 'ExtGState', BM: 'Saturation' }));

  const labelBottom = gap.bottom + PAD_BELOW;
  const ceiling = gap.top - PAD_ABOVE;

  let added = 0;
  let noInvoice = 0;
  let scaled = 0;

  for (const file of files) {
    const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const srcPages = src.getPages();

    for (let i = 0; i < srcPages.length; i++) {
      if (pageLimit && added >= pageLimit) break;
      const srcPage = srcPages[i];
      const info = inspectPage(srcPage);
      if (!info.hasInvoice) noInvoice++;

      const cutY = info.cut === null ? info.height * 0.25 : info.cut;
      const labelH = info.top - cutY;

      const [label] = await out.embedPages([srcPage], [
        { left: 0, bottom: cutY, right: info.width, top: Math.min(info.top + 1, info.height) },
      ]);

      const page = out.addPage([PW, PH]);
      page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: rgb(1, 1, 1) });
      page.drawPage(tpl, { x: 0, y: 0, width: PW, height: PH });
      if (settings.logoGreyscale) greyscaleBand(out, page, gsRef, gap.top, PH - gap.top, PW);

      // Full size for as long as possible: grow up into the gap under the logo
      // first, then drop towards the artwork below, and only scale as a last
      // resort — the courier's barcode should print at its original size.
      let bottom = labelBottom;
      if (labelH > ceiling - bottom) bottom = Math.max(gap.bottom + 2, ceiling - labelH);
      const room = ceiling - bottom;
      const scale = labelH > room ? room / labelH : 1;
      if (scale < 1) scaled++;

      page.drawPage(label, {
        x: (PW - info.width * scale) / 2,
        y: bottom,
        width: info.width * scale,
        height: labelH * scale,
      });

      added++;
    }
    if (pageLimit && added >= pageLimit) break;
  }

  if (!out.getPageCount()) throw new Error('No pages found in the selected PDF(s).');
  return { bytes: await out.save(), pages: added, noInvoice, scaled };
}
