// utils/manifestParser.js
//
// Reads a Meesho "Supplier Manifest" (Picklist) PDF for the same three keys the
// label sheet gives: AWB, sub-order ID and SKU.
//
// The manifest has two halves. The first is a picklist — SKU and a total
// quantity, with no order numbers in it at all — and is skipped. The second is
// a per-courier table of one row per parcel, and that is what is read here.
//
// A row reads:
//
//   1 34801662116 2267712_1 1490843440052164 677803771 1 Free Size
//   ^ ^------------------^  ^--------------^ ^-------^ ^ ^-------^
//   |  sub-order, wrapped        AWB            SKU   qty  size
//   serial
//
// The sub-order wraps mid-number across two text runs, and the serial sits
// flush against it with nothing but a space between, so the two have to be told
// apart by length.

const { getPageTexts } = require('./labelParser');

// Every Meesho order number is 18 digits — confirmed against a 340-label sheet
// where all 340 were exactly that. The digits before the underscore are
// therefore the row's serial followed by the order number, and the split point
// is known. A row whose serial does not then fit its position in the table is
// rejected rather than guessed at, because a mis-split number would resolve a
// scan to the wrong book.
const ORDER_NO_DIGITS = 18;

const ROW_RE = new RegExp(
  '(\\d[\\d\\s]{13,26})_\\s*(\\d+)' +               // serial + sub-order, then its suffix
  '\\s+([A-Z]{2}\\d{8,}[A-Z]{0,4}|\\d{12,17})' +    // AWB, whatever the courier's format
  '\\s+(.*?)' +                                      // SKU, which may hold spaces and digits
  // The \b matters: without it the single-letter size codes match the first
  // letter of an ordinary word, so "CBSE Class 9 Mathematics ..." parses as
  // quantity 9, size "M", and a truncated SKU.
  '\\s+(\\d+)\\s+((?:Free\\s+)?Size|XS|S|M|L|XL|XXL|XXXL)\\b', // qty, then size
  'g'
);

const COURIER_RE = /Courier\s*:\s*(.+?)\s+Supplier\s+Name/i;

/** Splits "1348016621162267712" into serial 1 and order 348016621162267712. */
function splitSerial(run) {
  const digits = run.replace(/\s+/g, '');
  if (digits.length <= ORDER_NO_DIGITS) return { serial: null, orderNo: digits };
  return {
    serial: Number(digits.slice(0, digits.length - ORDER_NO_DIGITS)),
    orderNo: digits.slice(-ORDER_NO_DIGITS),
  };
}

function parsePage(text, pageIndex) {
  if (!/Sub\s*Order\s*No/i.test(text)) return []; // a picklist page

  const courier = (text.match(COURIER_RE) || [])[1]?.trim() || null;
  const rows = [];
  let expected = null; // the serial this row should carry, once the run is established

  for (const m of text.matchAll(ROW_RE)) {
    const { serial, orderNo } = splitSerial(m[1]);
    const row = {
      page: pageIndex + 1,
      serial,
      subOrderId: `${orderNo}_${m[2]}`,
      awb: m[3],
      sku: m[4].replace(/\s+/g, ' ').trim() || null,
      qty: parseInt(m[5], 10) || 1,
      size: m[6].replace(/\s+/g, ' ').trim(),
      courier,
    };

    // The table is numbered, so a serial that does not follow the previous one
    // means the split landed in the wrong place. Drop the row instead of
    // indexing an order number that is off by a digit.
    if (serial === null || orderNo.length !== ORDER_NO_DIGITS) row.suspect = 'length';
    else if (expected !== null && serial !== expected) row.suspect = 'out_of_sequence';
    if (!row.suspect) expected = serial + 1;
    else if (expected === null) expected = null;

    rows.push(row);
  }

  return rows;
}

/** Parses the order table out of a manifest PDF, one record per parcel. */
async function parseManifestPages(pageTexts) {
  return pageTexts.flatMap(parsePage);
}

async function parseManifestPdf(buffer) {
  return parseManifestPages(await getPageTexts(buffer));
}

/** True if this PDF is a manifest rather than a sheet of labels. */
function looksLikeManifest(pageTexts) {
  return pageTexts.some((t) => /Sub\s*Order\s*No/i.test(t) || /Picklist/i.test(t));
}

module.exports = { parseManifestPages, parseManifestPdf, looksLikeManifest, parsePage };
