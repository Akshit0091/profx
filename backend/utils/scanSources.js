// utils/scanSources.js
//
// Two different Meesho PDFs can feed the scan index, and a seller should not
// have to tell us which one they are holding. Both are read for the same three
// keys — AWB, sub-order ID and SKU — so the only question is which parser to
// run, and the document answers that itself.
//
// They were checked against each other on a real 340-parcel batch: every
// sub-order, every AWB and every quantity agreed, and every SKU agreed once
// reduced to skuKey. Either document alone is therefore enough.

const { getPageTexts, parseLabelPages } = require('./labelParser');
const { parseManifestPages } = require('./manifestParser');

/**
 * A manifest names its own table ("Sub Order No.") and opens with a picklist.
 * A label page never says either, and always carries the invoice instead.
 */
function detectKind(pageTexts) {
  const manifestish = pageTexts.filter((t) => /Sub\s*Order\s*No/i.test(t) || /^.{0,80}Picklist/i.test(t)).length;
  const labelish = pageTexts.filter((t) => /Product Details/i.test(t) && /TAX INVOICE/i.test(t)).length;
  if (manifestish > labelish) return 'manifest';
  if (labelish > 0) return 'labels';
  return null;
}

/**
 * Reads whichever document this is into a common shape:
 *   { subOrderId, awb, courier, sku, qty, size }
 * Pages that cannot be read are returned too, so the caller can report how many
 * were dropped rather than quietly indexing fewer parcels than were printed.
 */
async function parseScanSource(buffer) {
  const pageTexts = await getPageTexts(buffer);
  const kind = detectKind(pageTexts);
  if (!kind) return { kind: null, rows: [], units: 0 };

  if (kind === 'manifest') {
    const rows = await parseManifestPages(pageTexts);
    return {
      kind,
      // A suspect row is one whose serial number did not follow the one above
      // it, meaning the sub-order was split in the wrong place. Those are
      // dropped rather than risk resolving a scan to the wrong book.
      rows: rows.filter((r) => !r.suspect),
      units: rows.length,
      unitLabel: 'rows',
    };
  }

  const rows = parseLabelPages(pageTexts);
  return { kind, rows, units: pageTexts.length, unitLabel: 'pages' };
}

module.exports = { parseScanSource, detectKind };
