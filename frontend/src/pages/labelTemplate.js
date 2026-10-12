// Composes the Shoppix label sheet: logo band on top, the courier's label in
// the middle with its tax invoice cut away, and the coupon / website bar /
// thank-you block underneath.
//
// Every coordinate here is in PDF points on an A4 page (595 x 842) and was
// measured off the approved artwork, so the output lines up with it.
import { PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream, degrees, rgb } from 'pdf-lib';

export const PAGE_W = 595;
export const PAGE_H = 842;

const LABEL_BOTTOM = 322.1;   // where the label's bottom edge rests
const LABEL_CEILING = 702;    // the label may grow up to here before scaling
const FOOT_TOP = 305;

const COUPON = { x: 113.5, y: 215.5, w: 368, h: 86, stubW: 78 };
const BAR = { x: 0.8, y: 122.8, w: 593.4, h: 74.3, baseline: 22.9 };
const THANKS_BASE = 72.3;
const SUB_BASE = 55;

const BLACK = rgb(0.07, 0.07, 0.07);
const GREY = rgb(0.45, 0.47, 0.5);
const WHITE = rgb(1, 1, 1);

export const TEMPLATE_DEFAULTS = {
  logoOn: true,
  logoGreyscale: true,
  logoHeight: 100,
  couponOn: true,
  stubText: 'ORDER NOW!',
  flatText: 'FLAT',
  percentText: '10%',
  offText: 'OFF',
  codeLabel: 'USE CODE :',
  codeText: 'NEW10',
  barOn: true,
  barText: 'www.shoppixindia.com',
  thanksOn: true,
  thanksText: 'THANK YOU FOR YOUR ORDER!',
  subText: 'Every book is checked by hand before it leaves our shelf.',
};

/* ---------------------- reading the source label ---------------------- */

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
  const top = findContentTop(txt, height);
  return {
    width, height,
    hasInvoice: cut !== null,
    cut: cut === null ? null : cut - 1,
    top,
  };
}

/* ----------------------------- drawing ------------------------------- */

function dashedLine(page, x1, y1, x2, y2) {
  page.drawLine({
    start: { x: x1, y: y1 }, end: { x: x2, y: y2 },
    thickness: 1.4, color: BLACK, dashArray: [5, 3.5],
  });
}

// Saw-tooth edge down the right-hand side, the way a torn-off voucher looks.
function zigzag(page, x, yBottom, yTop, depth = 7, period = 11) {
  let y = yBottom;
  let out = true;
  let prev = { x: x - depth, y };
  while (y < yTop) {
    const next = Math.min(y + period / 2, yTop);
    const point = { x: out ? x : x - depth, y: next };
    page.drawLine({ start: prev, end: point, thickness: 1.4, color: BLACK });
    prev = point;
    y = next;
    out = !out;
  }
}

function drawCoupon(page, fonts, s) {
  const { bold } = fonts;
  const { x, y, w, h, stubW } = COUPON;

  // Left stub — solid black, with the call to action set sideways. Each word
  // gets its own line, stacked left to right, the way rotated text reads.
  const stub = (s.stubText || '').trim();
  page.drawRectangle({ x, y, width: stubW, height: h, color: BLACK });
  if (stub) {
    const words = stub.split(/\s+/).filter(Boolean);
    const longest = Math.max(...words.map((wd) => bold.widthOfTextAtSize(wd, 1)));
    const byLength = (h - 16) / longest;              // fits up the stub
    const byStack = (stubW - 14) / (words.length * 1.15); // fits across it
    const size = Math.max(7, Math.min(byLength, byStack, 30));
    const lead = size * 1.15;
    const firstCenter = x + stubW / 2 - ((words.length - 1) * lead) / 2;

    words.forEach((word, i) => {
      const len = bold.widthOfTextAtSize(word, size);
      page.drawText(word, {
        x: firstCenter + i * lead + size * 0.35,
        y: y + (h - len) / 2,
        size, font: bold, color: WHITE, rotate: degrees(90),
      });
    });
  }

  // dashed voucher body, torn down the right edge
  const bx = x + stubW;
  const bw = w - stubW;
  dashedLine(page, bx, y + h, bx + bw - 7, y + h);
  dashedLine(page, bx, y, bx + bw - 7, y);
  dashedLine(page, bx, y, bx, y + h);
  zigzag(page, bx + bw, y, y + h);

  // offer wording, laid out around the same proportions as the artwork
  const flat = (s.flatText || '').trim();
  const pct = (s.percentText || '').trim();
  const off = (s.offText || '').trim();
  const code = (s.codeText || '').trim();
  const label = (s.codeLabel || '').trim();

  const flatSize = 42;
  const pctSize = 47;
  const offSize = 39;
  const codeSize = 10;

  const codeLine = [label, code].filter(Boolean).join(' ');
  const codeTextW = bold.widthOfTextAtSize(codeLine, codeSize);
  const flatW = flat ? bold.widthOfTextAtSize(flat, flatSize) : 0;
  const leftW = Math.max(flatW, codeLine ? codeTextW + 18 : 0);
  const rightW = Math.max(
    pct ? bold.widthOfTextAtSize(pct, pctSize) : 0,
    off ? bold.widthOfTextAtSize(off, offSize) : 0
  );

  const gap = 16;
  const groupW = leftW + (leftW && rightW ? gap : 0) + rightW;
  const startX = bx + (bw - 7 - groupW) / 2;

  if (flat) {
    page.drawText(flat, {
      x: startX + (leftW - flatW) / 2, y: y + 35.9, size: flatSize, font: bold, color: BLACK,
    });
  }
  if (codeLine) {
    const boxW = Math.max(leftW, codeTextW + 18);
    const boxX = startX + (leftW - boxW) / 2;
    page.drawRectangle({ x: boxX, y: y + 13.7, width: boxW, height: 16.5, color: BLACK });
    page.drawText(codeLine, {
      x: boxX + (boxW - codeTextW) / 2, y: y + 18.6, size: codeSize, font: bold, color: WHITE,
    });
  }

  const rightX = startX + leftW + gap;
  if (pct) page.drawText(pct, { x: rightX, y: y + 46.7, size: pctSize, font: bold, color: BLACK });
  if (off) page.drawText(off, { x: rightX, y: y + 14.5, size: offSize, font: bold, color: BLACK });
}

function drawBar(page, fonts, s) {
  const text = (s.barText || '').trim();
  page.drawRectangle({ x: BAR.x, y: BAR.y, width: BAR.w, height: BAR.h, color: BLACK });
  if (!text) return;
  const size = Math.min(52, ((BAR.w - 90) * 100) / fonts.bold.widthOfTextAtSize(text, 100));
  const textW = fonts.bold.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_W - textW) / 2, y: BAR.y + BAR.baseline, size, font: fonts.bold, color: WHITE,
  });
}

function drawThanks(page, fonts, s) {
  const head = (s.thanksText || '').trim();
  const sub = (s.subText || '').trim();
  if (head) {
    const size = Math.min(29, ((PAGE_W - 110) * 100) / fonts.boldItalic.widthOfTextAtSize(head, 100));
    const w = fonts.boldItalic.widthOfTextAtSize(head, size);
    page.drawText(head, {
      x: (PAGE_W - w) / 2, y: THANKS_BASE, size, font: fonts.boldItalic, color: BLACK,
    });
  }
  if (sub) {
    const size = Math.min(10, ((PAGE_W - 120) * 100) / fonts.regular.widthOfTextAtSize(sub, 100));
    const w = fonts.regular.widthOfTextAtSize(sub, size);
    page.drawText(sub, { x: (PAGE_W - w) / 2, y: SUB_BASE, size, font: fonts.regular, color: GREY });
  }
}

/* ---------------------------- composition ---------------------------- */

/**
 * @param {File[]} files        raw label sheets straight from the seller panel
 * @param {object} settings     see TEMPLATE_DEFAULTS
 * @param {{bytes:Uint8Array,kind:'png'|'jpg'}|null} logo
 * @param {number} [pageLimit]  stop after this many pages (used by the preview)
 */
export async function buildSheet({ files, settings, logo, pageLimit }) {
  const out = await PDFDocument.create();
  const fonts = {
    regular: await out.embedFont(StandardFonts.Helvetica),
    bold: await out.embedFont(StandardFonts.HelveticaBold),
    boldItalic: await out.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  let logoImg = null;
  if (settings.logoOn && logo) {
    logoImg = logo.kind === 'jpg' ? await out.embedJpg(logo.bytes) : await out.embedPng(logo.bytes);
  }

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

      const page = out.addPage([PAGE_W, PAGE_H]);

      // Full size for as long as possible: grow up into the gap beneath the
      // logo first, then drop towards the coupon, and only scale as a last
      // resort — the courier's barcode should print at its original size.
      let bottom = LABEL_BOTTOM;
      if (labelH > LABEL_CEILING - bottom) bottom = Math.max(FOOT_TOP + 2, LABEL_CEILING - labelH);
      const room = LABEL_CEILING - bottom;
      const scale = labelH > room ? room / labelH : 1;
      if (scale < 1) scaled++;

      page.drawPage(label, {
        x: (PAGE_W - info.width * scale) / 2,
        y: bottom,
        width: info.width * scale,
        height: labelH * scale,
      });

      if (logoImg) {
        // Centred in the white space that is actually there — between the top
        // of this page's label and the edge of the sheet. Labels differ in
        // height, so a fixed band would leave the logo looking high on some
        // pages and low on others. The artwork has already had its blank edges
        // trimmed, so these are the true margins around the ink.
        const labelTop = bottom + labelH * scale;
        const bandH = PAGE_H - labelTop;
        let lh = Math.max(20, Number(settings.logoHeight) || 100);
        let lw = (logoImg.width / logoImg.height) * lh;
        const maxW = PAGE_W - 60;
        const maxH = Math.max(20, bandH - 16);
        const fit = Math.min(lw > maxW ? maxW / lw : 1, lh > maxH ? maxH / lh : 1);
        lw *= fit;
        lh *= fit;

        page.drawImage(logoImg, {
          x: (PAGE_W - lw) / 2,
          y: labelTop + (bandH - lh) / 2,
          width: lw,
          height: lh,
        });
      }

      if (settings.couponOn) drawCoupon(page, fonts, settings);
      if (settings.barOn) drawBar(page, fonts, settings);
      if (settings.thanksOn) drawThanks(page, fonts, settings);

      added++;
    }
    if (pageLimit && added >= pageLimit) break;
  }

  if (!out.getPageCount()) throw new Error('No pages found in the selected PDF(s).');
  return { bytes: await out.save(), pages: added, noInvoice, scaled };
}
