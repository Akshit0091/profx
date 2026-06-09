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

// Bulk CSV: columns SKU_ID, Purchase_Price
router.post('/bulk', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

    const findKey = (obj, candidates) => {
      const keys = Object.keys(obj);
      for (const c of candidates) {
        const k = keys.find((k) => k.trim().toLowerCase() === c.toLowerCase());
        if (k) return k;
      }
      return null;
    };

    if (!rows.length) return res.json({ success: true, inserted: 0, updated: 0 });

    const kSku   = findKey(rows[0], ['SKU_ID', 'SKU ID', 'sku_id', 'sku', 'SKU', 'Supplier SKU', 'supplier_sku', 'SKU Code', 'sku_code', 'Product SKU', 'product_sku', 'SKUID']);
    const kPrice = findKey(rows[0], ['Purchase_Price', 'Purchase Price', 'price', 'purchase_price', 'PurchasePrice', 'Cost', 'cost', 'Cost Price', 'cost_price', 'Buy Price', 'buy_price', 'PP', 'MRP', 'mrp', 'Rate', 'rate']);
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

module.exports = router;
