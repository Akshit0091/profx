// utils/labelParser.js
//
// Reads a Meesho "Sub Order Labels" PDF and pulls, for every page, the three
// keys that let a scanned barcode find its product: the courier AWB, the
// sub-order ID and the SKU.
//
// Every label page carries all three, so the label sheet alone is enough to
// build the scan index — the supplier manifest is only ever a cross-check.

const pdfParse = require('pdf-parse');

// Meesho's "Order No." — 15-20 digits, an underscore, then the item suffix.
// pdftotext and pdf.js both wrap this across two text runs, so whitespace
// inside the number has to be tolerated and stripped back out.
const SUB_ORDER_RE = /(\d[\d\s]{13,24}_\s*\d+)/;

// AWBs differ per courier: Valmo "VL0085981395206", Shadowfax "SF4410033176FPL",
// Delhivery "1490843440052164" (16 digits), Xpress Bees "134096155526126" (15).
// Matched only in the label half of the page, above the tax invoice, where the
// AWB is the sole token of this shape.
const AWB_RE = /\b([A-Z]{2}\d{8,}[A-Z]{0,4}|\d{12,17})\b/g;

const COURIERS = ['Valmo', 'Delhivery', 'Shadowfax', 'Xpress Bees', 'Ecom Express', 'Ekart'];

/** Splits a PDF buffer into one text string per page, in page order. */
async function getPageTexts(buffer) {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((tc) => {
        const text = tc.items.map((i) => i.str).join(' ');
        pages.push(text);
        return text;
      }),
  });
  return pages;
}

function cleanSubOrder(raw) {
  return raw.replace(/\s+/g, '');
}

/**
 * The product band reads "Order No. <SKU> <Size> <Qty> <Color> <subOrderId>".
 * The SKU is either a generated code ("-Cruc92q") or the seller's own title,
 * which can run to several hundred characters and wrap over many lines, so it
 * is captured as whatever sits between the header and the size/qty/colour cells.
 */
const PRODUCT_RE =
  // The \b after the size group matters: without it a bare "M" or "S" matches
  // the first letter of an ordinary word and truncates the SKU.
  /Order No\.?\s*([\s\S]*?)\s+((?:Free\s+)?Size|XS|S|M|L|XL|XXL|XXXL|\d+)\b\s+(\d+)\s+(\S+)\s+(\d[\d\s]{13,24}_\s*\d+)/i;

function extractProduct(text) {
  const m = text.match(PRODUCT_RE);
  if (!m) return { sku: null, size: null, qty: null, color: null };
  return {
    sku: m[1].replace(/\s+/g, ' ').trim() || null,
    size: m[2].replace(/\s+/g, ' ').trim(),
    qty: parseInt(m[3], 10),
    color: m[4] === 'NA' ? null : m[4],
  };
}

function parsePage(text, pageIndex) {
  // The AWB only ever appears above the invoice; cutting there avoids matching
  // the purchase-order number and the GSTIN that follow it.
  const labelHalf = text.split(/TAX INVOICE/i)[0] || text;

  const subMatch = text.match(SUB_ORDER_RE);
  const subOrderId = subMatch ? cleanSubOrder(subMatch[1]) : null;
  const orderNo = subOrderId ? subOrderId.split('_')[0] : null;

  let awb = null;
  for (const m of labelHalf.matchAll(AWB_RE)) {
    const candidate = m[1];
    if (orderNo && (candidate === orderNo || orderNo.includes(candidate))) continue;
    awb = candidate;
    break;
  }

  const courier = COURIERS.find((c) => labelHalf.includes(c)) || null;

  return { page: pageIndex + 1, awb, subOrderId, courier, ...extractProduct(text) };
}

/** One record per already-extracted page. */
function parseLabelPages(pageTexts) {
  return pageTexts.map(parsePage);
}

/** Parses a label-sheet PDF into one record per page. */
async function parseLabelPdf(buffer) {
  return parseLabelPages(await getPageTexts(buffer));
}

module.exports = { parseLabelPdf, parseLabelPages, parsePage, getPageTexts };
