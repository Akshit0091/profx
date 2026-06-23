const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware, platformMiddleware } = require('../middleware/auth');
const { recalcProfitsForSku } = require('../utils/matcher');
const { stripApostrophe } = require('../utils/fileParser');

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware, subscriptionMiddleware, platformMiddleware);

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const where = { userId: req.user.id, platform: req.platform };
    if (search) where.skuId = { contains: String(search), mode: 'insensitive' };
    const skus = await prisma.sKU.findMany({ where, orderBy: { skuId: 'asc' } });
    res.json({ skus });
  } catch (err) {
    console.error('SKU list error:', err);
    res.status(500).json({ error: 'Failed to fetch SKUs' });
  }
});

// SKUs that appear in orders but have no purchase price yet
router.get('/missing', async (req, res) => {
  try {
    const userId = req.user.id;
    const orderSkus = await prisma.order.findMany({
      where: { userId, platform: req.platform, skuId: { not: null } },
      select: { skuId: true },
      distinct: ['skuId'],
    });
    const existing = await prisma.sKU.findMany({
      where: { userId, platform: req.platform },
      select: { skuId: true },
    });
    const have = new Set(existing.map((s) => s.skuId));
    const missing = orderSkus
      .map((o) => o.skuId)
      .filter((sid) => sid && !have.has(sid));
    res.json({ missing });
  } catch (err) {
    console.error('Missing SKU error:', err);
    res.status(500).json({ error: 'Failed to compute missing SKUs' });
  }
});

// Export missing SKUs as Excel
router.get('/missing/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.platform;
    const orderSkus = await prisma.order.findMany({
      where: { userId, platform, skuId: { not: null } },
      select: { skuId: true },
      distinct: ['skuId'],
    });
    const existing = await prisma.sKU.findMany({
      where: { userId, platform },
      select: { skuId: true },
    });
    const have = new Set(existing.map((s) => s.skuId));
    const missing = orderSkus.map((o) => o.skuId).filter((sid) => sid && !have.has(sid));
    const data = missing.map((s) => ({ SKU_ID: s, Purchase_Price: '' }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Missing SKUs');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="profx-missing-skus-${platform}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('Missing SKU export error:', err);
    res.status(500).json({ error: 'Failed to export missing SKUs' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { skuId, purchasePrice } = req.body || {};
    if (!skuId || purchasePrice === undefined || purchasePrice === null || purchasePrice === '') {
      return res.status(400).json({ error: 'skuId and purchasePrice are required' });
    }
    const price = parseFloat(purchasePrice);
    if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Invalid purchasePrice' });

    const cleanSku = String(skuId).trim();
    const sku = await prisma.sKU.upsert({
      where: { skuId_userId_platform: { skuId: cleanSku, userId: req.user.id, platform: req.platform } },
      create: { skuId: cleanSku, purchasePrice: price, userId: req.user.id, platform: req.platform },
      update: { purchasePrice: price },
    });

    const recalc = await recalcProfitsForSku(req.user.id, req.platform, cleanSku);
    res.json({ success: true, sku, recalculated: recalc.updated });
  } catch (err) {
    console.error('SKU upsert error:', err);
    res.status(500).json({ error: 'Failed to save SKU' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { purchasePrice } = req.body || {};
    const price = parseFloat(purchasePrice);
    if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Invalid purchasePrice' });

    const existing = await prisma.sKU.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: 'SKU not found' });
    }
    const sku = await prisma.sKU.update({
      where: { id: req.params.id },
      data: { purchasePrice: price },
    });
    const recalc = await recalcProfitsForSku(req.user.id, sku.platform, sku.skuId);
    res.json({ success: true, sku, recalculated: recalc.updated });
  } catch (err) {
    console.error('SKU update error:', err);
    res.status(500).json({ error: 'Failed to update SKU' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.sKU.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: 'SKU not found' });
    }
    await prisma.sKU.delete({ where: { id: req.params.id } });
    // Wipe profit/purchasePrice on linked orders (same platform) so they revert
    await prisma.order.updateMany({
      where: { userId: req.user.id, platform: existing.platform, skuId: existing.skuId, isReturned: false },
      data: { profit: null, purchasePrice: null, isMatched: false },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('SKU delete error:', err);
    res.status(500).json({ error: 'Failed to delete SKU' });
  }
});

// Bulk CSV/XLSX: columns SKU_ID, Purchase_Price
router.post('/bulk', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let rows;
    const isCSV = (req.file.originalname || '').toLowerCase().endsWith('.csv');

    if (isCSV) {
      // Custom CSV parser — handles quoted fields with commas (xlsx can't)
      const str = req.file.buffer.toString('utf8');
      const lines = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
      if (!lines.length) return res.json({ success: true, inserted: 0, updated: 0 });

      function splitRow(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
          current += ch;
        }
        result.push(current.trim());
        return result;
      }

      const headers = splitRow(lines[0]);
      rows = lines.slice(1).map(line => {
        const vals = splitRow(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
    } else {
      // Excel files — use xlsx
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    }

    const findKey = (obj, candidates) => {
      const keys = Object.keys(obj);
      for (const c of candidates) {
        const k = keys.find((k) => k.trim().toLowerCase() === c.toLowerCase());
        if (k) return k;
      }
      return null;
    };

    if (!rows.length) return res.json({ success: true, inserted: 0, updated: 0 });

    const kSku   = findKey(rows[0], ['SKU_ID', 'SKU ID', 'sku_id', 'sku', 'SKU']);
    const kPrice = findKey(rows[0], ['Purchase_Price', 'Purchase Price', 'price', 'purchase_price', 'PurchasePrice']);
    if (!kSku || !kPrice) {
      return res.status(400).json({ error: 'CSV must contain SKU_ID and Purchase_Price columns' });
    }

    let inserted = 0;
    let updated = 0;
    const touchedSkus = [];

    for (const row of rows) {
      const skuId = stripApostrophe(row[kSku]);
      const price = parseFloat(String(row[kPrice]).replace(/[,₹\s]/g, ''));
      if (!skuId || isNaN(price)) continue;

      const existing = await prisma.sKU.findUnique({
        where: { skuId_userId_platform: { skuId, userId: req.user.id, platform: req.platform } },
      });
      if (existing) {
        await prisma.sKU.update({ where: { id: existing.id }, data: { purchasePrice: price } });
        updated++;
      } else {
        await prisma.sKU.create({ data: { skuId, purchasePrice: price, userId: req.user.id, platform: req.platform } });
        inserted++;
      }
      touchedSkus.push(skuId);
    }

    for (const s of touchedSkus) await recalcProfitsForSku(req.user.id, req.platform, s);

    res.json({ success: true, inserted, updated, total: rows.length });
  } catch (err) {
    console.error('Bulk SKU error:', err);
    res.status(500).json({ error: 'Failed to bulk upload SKUs: ' + err.message });
  }
});

// ---------- RATE CORRECTIONS ----------

// Get all SKU correction timestamps for the current user+platform
// Used by the Orders page to auto-badge loss orders.
router.get('/corrections', async (req, res) => {
  try {
    const skus = await prisma.sKU.findMany({
      where: { userId: req.user.id, platform: req.platform, ratesCorrectedAt: { not: null } },
      select: { skuId: true, ratesCorrectedAt: true },
    });
    const corrections = {};
    for (const s of skus) corrections[s.skuId] = s.ratesCorrectedAt;
    res.json({ corrections });
  } catch (err) {
    console.error('Corrections list error:', err);
    res.status(500).json({ error: 'Failed to fetch corrections' });
  }
});

// Mark a SKU's rates as corrected (sets timestamp to now)
router.post('/:id/mark-corrected', async (req, res) => {
  try {
    const existing = await prisma.sKU.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: 'SKU not found' });
    const sku = await prisma.sKU.update({
      where: { id: req.params.id },
      data: { ratesCorrectedAt: new Date() },
    });
    res.json({ success: true, skuId: sku.skuId, ratesCorrectedAt: sku.ratesCorrectedAt });
  } catch (err) {
    console.error('Mark corrected error:', err);
    res.status(500).json({ error: 'Failed to mark corrected' });
  }
});

// Clear the correction timestamp (reset)
router.post('/:id/unmark-corrected', async (req, res) => {
  try {
    const existing = await prisma.sKU.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: 'SKU not found' });
    await prisma.sKU.update({ where: { id: req.params.id }, data: { ratesCorrectedAt: null } });
    res.json({ success: true });
  } catch (err) {
    console.error('Unmark corrected error:', err);
    res.status(500).json({ error: 'Failed to unmark' });
  }
});

// Mark corrected by SKU ID (string, not DB id) — used by Orders page quick action
router.post('/mark-corrected-by-sku', async (req, res) => {
  try {
    const { skuId } = req.body || {};
    if (!skuId) return res.status(400).json({ error: 'skuId required' });
    const sku = await prisma.sKU.findUnique({
      where: { skuId_userId_platform: { skuId, userId: req.user.id, platform: req.platform } },
    });
    if (!sku) return res.status(404).json({ error: 'SKU not found — set a purchase price first' });
    const updated = await prisma.sKU.update({
      where: { id: sku.id },
      data: { ratesCorrectedAt: new Date() },
    });
    res.json({ success: true, skuId: updated.skuId, ratesCorrectedAt: updated.ratesCorrectedAt });
  } catch (err) {
    console.error('Mark corrected by SKU error:', err);
    res.status(500).json({ error: 'Failed to mark corrected' });
  }
});

// One-time migration: convert starred orders to rate corrections.
// Finds all starred orders, gets unique SKUs, sets ratesCorrectedAt on those SKUs.
router.post('/migrate-stars', async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.platform;
    const starred = await prisma.order.findMany({
      where: { userId, platform, isStarred: true, skuId: { not: null } },
      select: { skuId: true },
      distinct: ['skuId'],
    });
    const skuIds = starred.map(o => o.skuId).filter(Boolean);
    let migrated = 0;
    for (const skuId of skuIds) {
      const sku = await prisma.sKU.findUnique({
        where: { skuId_userId_platform: { skuId, userId, platform } },
      });
      if (sku && !sku.ratesCorrectedAt) {
        await prisma.sKU.update({ where: { id: sku.id }, data: { ratesCorrectedAt: new Date() } });
        migrated++;
      }
    }
    res.json({ success: true, starredSkus: skuIds.length, migrated });
  } catch (err) {
    console.error('Migrate stars error:', err);
    res.status(500).json({ error: 'Failed to migrate stars' });
  }
});

module.exports = router;
