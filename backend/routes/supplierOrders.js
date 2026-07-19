const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');
const { parseMeeshoOrders, parseFlipkartOrders, collapseBySku } = require('../utils/supplierParser');
const { seriesTypeOf, normalizeTitle } = require('../utils/titleNormalizer');

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// NOTE: intentionally NO platformMiddleware. This feature is cross-platform by
// design (combines Meesho + Flipkart). Mappings are scoped by userId only.
router.use(authMiddleware, subscriptionMiddleware);

// ---------- PARSE UPLOADS ----------
// Accepts up to 2 files: field "meesho" and/or field "flipkart".
// Returns INDIVIDUAL orders (one row per order) for the checklist, split-ready
// by platform. Collapsing + mapping happens later in /resolve on the checked set.
router.post(
  '/parse',
  upload.fields([{ name: 'meesho', maxCount: 20 }, { name: 'flipkart', maxCount: 20 }]),
  async (req, res) => {
    try {
      const files = req.files || {};
      let orders = [];

      // Parse every uploaded file; rowIds are namespaced per file so they stay unique.
      (files.meesho || []).forEach((f, fileIdx) => {
        const parsed = parseMeeshoOrders(f.buffer);
        parsed.forEach((o) => { o.rowId = `${o.rowId}-f${fileIdx}`; });
        orders = orders.concat(parsed);
      });
      (files.flipkart || []).forEach((f, fileIdx) => {
        const parsed = parseFlipkartOrders(f.buffer);
        parsed.forEach((o) => { o.rowId = `${o.rowId}-f${fileIdx}`; });
        orders = orders.concat(parsed);
      });
      if (!orders.length) {
        return res.status(400).json({ error: 'No pending orders found in the uploaded file(s).' });
      }

      res.json({ success: true, count: orders.length, orders });
    } catch (err) {
      console.error('Supplier parse error:', err);
      res.status(500).json({ error: 'Failed to parse orders: ' + err.message });
    }
  }
);

// ---------- RESOLVE CHECKED ORDERS ----------
// Body: { orders: [{ platform, orderId, date, sku, rawTitle, qty }] }  (the checked subset)
// Collapses them by SKU and resolves against saved mappings.
router.post('/resolve', async (req, res) => {
  try {
    const userId = req.user.id;
    const { orders } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'No orders selected' });
    }

    const collapsed = collapseBySku(orders);

    const skus = collapsed.map((c) => c.sku);
    const mappings = await prisma.skuMapping.findMany({
      where: { userId, sku: { in: skus } },
      include: { supplierProduct: true },
    });
    const bySku = new Map();
    for (const m of mappings) {
      if (!bySku.has(m.sku)) bySku.set(m.sku, []);
      bySku.get(m.sku).push({
        mappingId: m.id,
        supplierProductId: m.supplierProductId,
        publisher: m.supplierProduct.publisher || '',
        title: m.supplierProduct.title,
        className: m.supplierProduct.className || '',
        qtyPerUnit: m.qtyPerUnit,
      });
    }

    const lines = collapsed.map((c) => ({
      sku: c.sku,
      totalQty: c.totalQty,
      refs: c.refs,
      dominant: c.dominant,
      mapped: bySku.has(c.sku),
      products: bySku.get(c.sku) || [],
    }));

    res.json({ success: true, count: lines.length, lines });
  } catch (err) {
    console.error('Supplier resolve error:', err);
    res.status(500).json({ error: 'Failed to resolve orders: ' + err.message });
  }
});

// ---------- TYPEAHEAD: search existing supplier products ----------
// Query params:
//   q         - title text; ALL words must be present (any order), ranked by closeness
//   publisher - if set, STRICT filter (exact, case-insensitive)
//   className - if set, STRICT filter (exact, case-insensitive)
router.get('/products/search', async (req, res) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim();
    const publisher = String(req.query.publisher || '').trim();
    const className = String(req.query.className || '').trim();

    // DB-level strict filters for publisher / class.
    const where = { userId };
    if (publisher) where.publisher = { startsWith: publisher, mode: 'insensitive' };
    if (className) where.className = { equals: className, mode: 'insensitive' };

    // Pull the candidate set (bounded), then word-rank in Node.
    const candidates = await prisma.supplierProduct.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    let products = candidates;

    if (q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = [];
      for (const p of candidates) {
        const title = (p.title || '').toLowerCase();
        // ALL typed words must appear somewhere in the title (any order).
        const allPresent = words.every((w) => title.includes(w));
        if (!allPresent) continue;
        // Closeness score: exact-prefix + whole-word matches rank higher.
        const titleWords = title.split(/\s+/);
        let score = 0;
        for (const w of words) {
          if (titleWords.includes(w)) score += 3;        // whole-word hit
          else if (title.includes(w)) score += 1;         // substring hit
          if (title.startsWith(w)) score += 2;            // title starts with it
        }
        // Shorter titles that fully match are usually the better pick.
        score += Math.max(0, 5 - Math.abs(titleWords.length - words.length));
        scored.push({ p, score });
      }
      scored.sort((a, b) => b.score - a.score);
      products = scored.slice(0, 15).map((s) => s.p);
    } else {
      products = candidates.slice(0, 15);
    }

    res.json({ products });
  } catch (err) {
    console.error('Product search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- MAP A SKU ----------
// Body: { sku, books: [{ supplierProductId? , publisher, title, className, qtyPerUnit }] }
// For each book: if supplierProductId given -> reuse; else create/find SupplierProduct.
// Replaces all existing mappings for this sku (clean re-map).
router.post('/map', async (req, res) => {
  try {
    const userId = req.user.id;
    const { sku, books } = req.body;
    if (!sku || !Array.isArray(books) || books.length === 0) {
      return res.status(400).json({ error: 'sku and at least one book are required' });
    }

    // Clear existing mappings for this sku (fresh remap)
    await prisma.skuMapping.deleteMany({ where: { userId, sku } });

    const created = [];
    for (const b of books) {
      const rawTitle = String(b.title || '').trim();
      if (!rawTitle) continue;
      const publisher = String(b.publisher || '').trim() || null;
      // Auto-normalize Olympiad series titles (MTG etc.) to canonical form.
      const title = normalizeTitle(rawTitle, publisher).normalized || rawTitle;
      const className = String(b.className || '').trim() || null;
      const qtyPerUnit = Math.max(1, parseInt(b.qtyPerUnit || 1, 10) || 1);

      let productId = b.supplierProductId;
      if (productId) {
        // verify ownership + apply edits
        const existing = await prisma.supplierProduct.findFirst({ where: { id: productId, userId } });
        if (!existing) productId = null;
        else {
          await prisma.supplierProduct.update({
            where: { id: productId },
            data: { publisher, title, className },
          });
        }
      }
      if (!productId) {
        const prod = await prisma.supplierProduct.create({
          data: { userId, publisher, title, className },
        });
        productId = prod.id;
      }

      const mapping = await prisma.skuMapping.create({
        data: { userId, sku, supplierProductId: productId, qtyPerUnit },
        include: { supplierProduct: true },
      });
      created.push({
        mappingId: mapping.id,
        supplierProductId: productId,
        publisher: mapping.supplierProduct.publisher || '',
        title: mapping.supplierProduct.title,
        className: mapping.supplierProduct.className || '',
        qtyPerUnit: mapping.qtyPerUnit,
      });
    }

    res.json({ success: true, sku, products: created });
  } catch (err) {
    console.error('Map error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- UNMAP A SKU ----------
router.post('/unmap', async (req, res) => {
  try {
    const userId = req.user.id;
    const { sku } = req.body;
    if (!sku) return res.status(400).json({ error: 'sku required' });
    await prisma.skuMapping.deleteMany({ where: { userId, sku } });
    res.json({ success: true });
  } catch (err) {
    console.error('Unmap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- NORMALIZE EXISTING TITLES (one-time migration) ----------
// GET  ?dryRun=1  -> preview what would change, writes nothing
// POST            -> applies the changes
// Only touches this user's own SupplierProducts. Titles that don't match an
// Olympiad series pattern are left exactly as they are.
async function runNormalize(userId, apply) {
  const products = await prisma.supplierProduct.findMany({ where: { userId } });
  const changes = [];
  for (const p of products) {
    const next = normalizeTitle(p.title, p.publisher).normalized;
    if (next && next !== p.title) {
      changes.push({ id: p.id, publisher: p.publisher || '', from: p.title, to: next });
    }
  }
  if (apply) {
    for (const c of changes) {
      await prisma.supplierProduct.update({ where: { id: c.id }, data: { title: c.to } });
    }
  }
  return { total: products.length, changed: changes.length, changes };
}

router.get('/normalize-titles', async (req, res) => {
  try {
    const result = await runNormalize(req.user.id, false);
    res.json({ success: true, dryRun: true, ...result });
  } catch (err) {
    console.error('Normalize preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/normalize-titles', async (req, res) => {
  try {
    const result = await runNormalize(req.user.id, true);
    res.json({ success: true, applied: true, ...result });
  } catch (err) {
    console.error('Normalize apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- GENERATE SUPPLIER SHEET ----------
// Body: { supplierName, lines: [{ publisher, title, className, qty }] }
// Printable A4 portrait format: merged bold title, bordered grid, fixed column
// widths (not stretched), Title wraps to next line inside its cell, Qty right-aligned.
router.post('/export', async (req, res) => {
  try {
    const { supplierName, lines } = req.body;
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'No lines to export' });
    }

    // Sort A→Z: Publisher → Series Type (read from the title) → Class → Title.
    // Blank values sort to the bottom within their group.
    const norm = (v) => String(v || '').trim().toLowerCase();
    const cmp = (a, b) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b);
    };
    const sortedLines = [...lines].sort((x, y) =>
      cmp(norm(x.publisher), norm(y.publisher)) ||
      cmp(norm(seriesTypeOf(x.title, x.publisher)), norm(seriesTypeOf(y.title, y.publisher))) ||
      cmp(norm(x.className), norm(y.className)) ||
      cmp(norm(x.title), norm(y.title))
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Order', {
      pageSetup: {
        paperSize: 9,            // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
      },
    });

    // Fixed column widths — matches the printable A4 sheet, no stretching.
    ws.columns = [{ width: 13.8 }, { width: 55.4 }, { width: 13 }, { width: 12.7 }];

    const thin = { style: 'thin' };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    // Black fill + white text style helpers.
    const blackFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };

    // Row 1 — supplier name, merged A1:D1, bold 18, centered.
    ws.mergeCells('A1:D1');
    const title = ws.getCell('A1');
    title.value = String(supplierName || 'CHIRAG BOOK CENTER');
    title.font = { bold: true, size: 18 };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ['A1', 'B1', 'C1', 'D1'].forEach((a) => { ws.getCell(a).border = border; });

    // Row 2 — headers, black fill + white text.
    ['Publisher', 'Title', 'Class', 'Qty'].forEach((h, i) => {
      const c = ws.getCell(2, i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = border;
      c.fill = blackFill;
    });

    // Data rows — Title wraps within the cell; long names flow to next line.
    sortedLines.forEach((l, idx) => {
      const r = idx + 3;
      const vals = [
        String(l.publisher || ''),
        String(l.title || ''),
        String(l.className || ''),
        parseInt(l.qty || 0, 10) || 0,
      ];
      vals.forEach((val, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = val;
        c.font = { size: 11 };
        c.border = border;
        if (i === 3) {
          c.alignment = { horizontal: 'right', vertical: 'top' };
        } else if (i === 1) {
          c.font = { size: 11 };
          c.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        } else {
          c.font = { size: 11 };
          c.alignment = { vertical: 'top', horizontal: 'left' };
        }
      });
    });

    const buf = await wb.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="supplier-order.xlsx"');
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
