// utils/fileParser.js
const XLSX = require("xlsx");

// Strip leading apostrophe that Flipkart CSV adds
function normalizeId(val) {
  if (!val) return "";
  return String(val).trim().replace(/^'+/, "").trim();
}

// ─── Parse Pickup Report (CSV) ────────────────────────────────────────────────
// Required: ORDER ITEM ID, Order Id, SKU, Dispatch by date
// Also captures: Tracking ID
function parsePickupReport(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) throw new Error("Pickup report is empty");

  const required = ["ORDER ITEM ID", "Order Id", "SKU", "Dispatch by date"];
  const missing = required.filter((col) => !rows[0].hasOwnProperty(col));
  if (missing.length)
    throw new Error(`Pickup report missing columns: ${missing.join(", ")}`);

  const records = [];
  for (const row of rows) {
    const orderItemId = normalizeId(row["ORDER ITEM ID"]);
    if (!orderItemId) continue;

    records.push({
      orderItemId,
      orderId:      normalizeId(row["Order Id"]),
      skuId:        String(row["SKU"] || "").trim(),
      dispatchDate: parseDate(row["Dispatch by date"]),
      trackingId:   String(row["Tracking ID"] || "").trim() || null,
    });
  }

  if (!records.length) throw new Error("No valid records in Pickup report");
  return records;
}

// ─── Parse Settlement Report (Excel → Orders sheet) ───────────────────────────
function parseSettlementReport(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  if (!workbook.SheetNames.includes("Orders"))
    throw new Error('Settlement report must contain an "Orders" sheet');

  const sheet = workbook.Sheets["Orders"];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (raw.length < 3) throw new Error("Settlement report has no data");

  const COLS = { paymentDate: 1, bankSettlement: 2, orderId: 6, orderItemId: 7 };
  const records = [];

  for (let i = 2; i < raw.length; i++) {
    const row = raw[i];
    const orderItemId = normalizeId(row[COLS.orderItemId]);
    if (!orderItemId || orderItemId === "undefined") continue;

    const bankSettlement = parseFloat(row[COLS.bankSettlement]);
    records.push({
      orderItemId,
      orderId:        normalizeId(row[COLS.orderId]),
      bankSettlement: isNaN(bankSettlement) ? 0 : bankSettlement,
      paymentDate:    parseDate(row[COLS.paymentDate]),
    });
  }

  if (!records.length) throw new Error("No valid records in Settlement report");
  return records;
}

// ─── Parse Return Report ──────────────────────────────────────────────────────
// Accepts CSV or Excel with a single column of Tracking IDs
// Column can be named: "Tracking ID", "TrackingID", "tracking_id", or just first column
function parseReturnReport(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) throw new Error("Return report is empty");

  const trackingIds = [];
  const first = rows[0];

  // Detect which column has tracking IDs
  const possibleCols = ["Tracking ID", "TrackingID", "tracking_id", "TRACKING ID", "Tracking Id"];
  let colName = possibleCols.find((c) => first.hasOwnProperty(c));

  // If no known column name, use the first column
  if (!colName) colName = Object.keys(first)[0];

  for (const row of rows) {
    const id = String(row[colName] || "").trim();
    if (id) trackingIds.push(id);
  }

  if (!trackingIds.length) throw new Error("No tracking IDs found in return report");
  return trackingIds;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = { parsePickupReport, parseSettlementReport, parseReturnReport };
