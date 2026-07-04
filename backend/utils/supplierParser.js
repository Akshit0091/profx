const XLSX = require('xlsx');

// Parse a CSV/XLSX buffer into an array of row objects (header-keyed).
function readRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

function pick(row, names) {
  for (const n of names) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === n.toLowerCase()) {
        const v = row[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  return '';
}

// Meesho: keep only "Reason for Credit Entry" === PENDING.
// Emits one object PER ORDER: { rowId, platform, orderId, date, sku, rawTitle, qty }.
function parseMeeshoOrders(buffer) {
  const rows = readRows(buffer);
  const out = [];
  rows.forEach((r, idx) => {
    const status = pick(r, ['Reason for Credit Entry']).toUpperCase();
    if (status !== 'PENDING') return;
    const sku = pick(r, ['SKU', 'Supplier SKU']);
    const rawTitle = pick(r, ['Product Name', 'Product']);
    const qty = parseInt(pick(r, ['Quantity', 'Qty']) || '0', 10) || 0;
    const orderId = pick(r, ['Sub Order No', 'Order No']);
    const date = pick(r, ['Order Date']);
    if (!sku && !rawTitle) return;
    out.push({ rowId: 'M-' + idx, platform: 'meesho', orderId, date, sku: sku || rawTitle, rawTitle, qty });
  });
  return out;
}

// Flipkart: keep only "Order State" === Approved.
// Emits one object PER ORDER: { rowId, platform, orderId, date, sku, rawTitle, qty }.
function parseFlipkartOrders(buffer) {
  const rows = readRows(buffer);
  const out = [];
  rows.forEach((r, idx) => {
    const state = pick(r, ['Order State']).toLowerCase();
    if (state !== 'approved') return;
    const sku = pick(r, ['SKU']);
    const rawTitle = pick(r, ['Product']);
    const qty = parseInt(pick(r, ['Quantity', 'Qty']) || '0', 10) || 0;
    const orderId = pick(r, ['Order Id', 'Order ID']);
    const date = pick(r, ['Ordered On', 'Dispatch by date']);
    if (!sku && !rawTitle) return;
    out.push({ rowId: 'F-' + idx, platform: 'flipkart', orderId, date, sku: sku || rawTitle, rawTitle, qty });
  });
  return out;
}

// Collapse a set of per-order rows into unique SKUs.
// Each unique SKU: total qty, dominant platform (higher qty wins, tie -> meesho),
// and per-platform sample refs (id + rawTitle).
function collapseBySku(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.sku;
    if (!map.has(key)) map.set(key, { sku: key, totalQty: 0, refs: {}, _pqty: {} });
    const entry = map.get(key);
    entry.totalQty += row.qty;
    entry._pqty[row.platform] = (entry._pqty[row.platform] || 0) + row.qty;
    if (!entry.refs[row.platform]) {
      entry.refs[row.platform] = { sampleOrderId: row.orderId, rawTitle: row.rawTitle, qty: 0 };
    }
    entry.refs[row.platform].qty += row.qty;
  }
  return Array.from(map.values()).map((e) => {
    const m = e._pqty.meesho || 0;
    const f = e._pqty.flipkart || 0;
    e.dominant = f > m ? 'flipkart' : 'meesho';
    delete e._pqty;
    return e;
  });
}

module.exports = { parseMeeshoOrders, parseFlipkartOrders, collapseBySku };
