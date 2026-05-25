const XLSX = require('xlsx');

const stripApostrophe = (val) => {
  if (val === null || val === undefined) return '';
  let s = String(val).trim();
  if (s.startsWith("'")) s = s.slice(1);
  return s.trim();
};

const parseNumber = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const cleaned = String(val).replace(/[,₹\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

const parseDate = (val) => {
  if (val === null || val === undefined || val === '') return null;
  // Already a Date object
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  // Excel serial number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0));
    return null;
  }
  const s = String(val).trim();
  if (!s) return null;

  // ISO format: yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Flipkart text format: "Apr 29, 2026 16:00:00" or "Apr 26, 2026"
  // JS Date parses these natively
  if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  // Numeric date: dd/MM/yyyy, MM/dd/yyyy, dd-MM-yyyy, MM-dd-yyyy
  // Flipkart CSVs use US format (header: "Invoice Date (mm/dd/yy)")
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    const ai = parseInt(a, 10);
    const bi = parseInt(b, 10);
    // Disambiguate: if first part > 12, it must be day (dd/MM); if second > 12, first is month (MM/dd)
    let day, mo;
    if (ai > 12) { day = ai; mo = bi; }
    else if (bi > 12) { mo = ai; day = bi; }
    else { mo = ai; day = bi; }   // default to US M/D for Flipkart files
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }

  // Last resort: let JS try
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
};

// ---------- PICKUP REPORT (CSV) ----------
// Reads as a sheet so we can rely on header names regardless of column order.
function parsePickupReport(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

  const findKey = (obj, candidates) => {
    const keys = Object.keys(obj);
    for (const c of candidates) {
      const k = keys.find((k) => k.trim().toLowerCase() === c.toLowerCase());
      if (k) return k;
    }
    return null;
  };

  if (!rows.length) return [];

  const sample = rows[0];
  const kOrderItemId = findKey(sample, ['ORDER ITEM ID', 'Order Item ID', 'OrderItemID']);
  const kOrderId     = findKey(sample, ['Order Id', 'Order ID', 'OrderId']);
  const kSku         = findKey(sample, ['SKU', 'Sku Id', 'SKU ID']);
  const kDispatch    = findKey(sample, ['Dispatch by date', 'Dispatch By Date', 'Dispatch Date']);
  const kTracking    = findKey(sample, ['Tracking ID', 'TrackingID', 'Tracking Id', 'tracking_id']);

  const result = [];
  for (const row of rows) {
    const orderItemId = kOrderItemId ? stripApostrophe(row[kOrderItemId]) : '';
    if (!orderItemId) continue;
    result.push({
      orderItemId,
      orderId:      kOrderId   ? stripApostrophe(row[kOrderId])   : null,
      skuId:        kSku       ? stripApostrophe(row[kSku])       : null,
      dispatchDate: kDispatch  ? parseDate(row[kDispatch])        : null,
      trackingId:   kTracking  ? stripApostrophe(row[kTracking])  : null,
    });
  }
  return result;
}

// ---------- SETTLEMENT REPORT (Excel, "Orders" sheet) ----------
// Row 0 = group headers (skip), Row 1 = column headers (skip), Row 2+ = data.
// Col 1 = Payment Date, Col 2 = Bank Settlement Value, Col 6 = Order ID, Col 7 = Order Item ID.
function parseSettlementReport(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  // Find "Orders" sheet (case-insensitive)
  const sheetName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'orders') || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

  const result = [];
  for (let i = 2; i < arr.length; i++) {
    const row = arr[i] || [];
    const orderItemId = stripApostrophe(row[7]);
    if (!orderItemId) continue;
    result.push({
      orderItemId,
      orderId:        stripApostrophe(row[6]) || null,
      paymentDate:    parseDate(row[1]),
      bankSettlement: parseNumber(row[2]),
    });
  }
  return result;
}

// ---------- RETURN REPORT (CSV or Excel) ----------
// Single column of Tracking IDs. Accept several header names; fallback to first column.
function parseReturnReport(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  if (!rows.length) {
    // Try header:1 fallback
    const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const ids = [];
    for (let i = 0; i < arr.length; i++) {
      const v = stripApostrophe(arr[i][0]);
      if (v && v.toLowerCase() !== 'tracking id' && v.toLowerCase() !== 'trackingid') ids.push(v);
    }
    return ids;
  }

  const sample = rows[0];
  const keys = Object.keys(sample);
  const candidates = ['Tracking ID', 'TrackingID', 'Tracking Id', 'tracking_id', 'tracking id'];
  let key = null;
  for (const c of candidates) {
    const k = keys.find((kk) => kk.trim().toLowerCase() === c.toLowerCase());
    if (k) { key = k; break; }
  }
  if (!key) key = keys[0]; // fallback

  const ids = [];
  for (const row of rows) {
    const v = stripApostrophe(row[key]);
    if (v) ids.push(v);
  }
  return ids;
}

// ---------- RETURN INCOMING REPORT (CSV) ----------
// Rich-metadata returns-in-transit file from Flipkart.
// Keys we use: Order Item ID (primary), Tracking ID (secondary),
// Return Status, Return Reason, Return Sub-reason, Return Requested Date.
function parseReturnIncomingReport(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

  const findKey = (obj, candidates) => {
    const keys = Object.keys(obj);
    for (const c of candidates) {
      const k = keys.find((k) => k.trim().toLowerCase() === c.toLowerCase());
      if (k) return k;
    }
    return null;
  };

  if (!rows.length) return [];

  const sample = rows[0];
  const kOrderItemId = findKey(sample, ['Order Item ID', 'ORDER ITEM ID', 'OrderItemID']);
  const kTracking    = findKey(sample, ['Tracking ID', 'TrackingID', 'Tracking Id']);
  const kStatus      = findKey(sample, ['Return Status', 'Status']);
  const kReason      = findKey(sample, ['Return Reason', 'Reason']);
  const kSubReason   = findKey(sample, ['Return Sub-reason', 'Return Sub Reason', 'Sub-reason', 'Sub Reason']);
  const kReqDate     = findKey(sample, ['Return Requested Date', 'Requested Date']);

  const result = [];
  for (const row of rows) {
    const orderItemId = kOrderItemId ? stripApostrophe(row[kOrderItemId]) : '';
    const trackingId = kTracking ? stripApostrophe(row[kTracking]) : '';
    if (!orderItemId && !trackingId) continue;
    result.push({
      orderItemId: orderItemId || null,
      trackingId: trackingId || null,
      returnStatus:        kStatus    ? stripApostrophe(row[kStatus])    : null,
      returnReason:        kReason    ? stripApostrophe(row[kReason])    : null,
      returnSubReason:     kSubReason ? stripApostrophe(row[kSubReason]) : null,
      returnRequestedDate: kReqDate   ? parseDate(row[kReqDate])         : null,
    });
  }
  return result;
}

module.exports = { parsePickupReport, parseSettlementReport, parseReturnReport, parseReturnIncomingReport, stripApostrophe };
