const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');
const { parsePickupReport, parseSettlementReport, parseReturnReport, parseReturnIncomingReport } = require('../utils/fileParser');
const { matchOrdersForUser } = require('../utils/matcher');

const router = express.Router();
const prisma = new PrismaClient();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authMiddleware, subscriptionMiddleware);

// ---------- PICKUP ----------
router.post('/pickup', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user.id;
    const rows = parsePickupReport(req.file.buffer);

    let inserted = 0;
    let updated = 0;
    const touchedIds = [];

    for (const row of rows) {
      if (!row.orderItemId) continue;
      const existing = await prisma.order.findUnique({
        where: { orderItemId_userId: { orderItemId: row.orderItemId, userId } },
      });

      if (existing) {
        await prisma.order.update({
          where: { id: existing.id },
          data: {
            orderId: row.orderId || existing.orderId,
            skuId: row.skuId || existing.skuId,
            dispatchDate: row.dispatchDate || existing.dispatchDate,
            trackingId: row.trackingId || existing.trackingId,
            hasPickup: true,
          },
        });
        updated++;
      } else {
        await prisma.order.create({
          data: {
            orderItemId: row.orderItemId,
            orderId: row.orderId || null,
            skuId: row.skuId || null,
            dispatchDate: row.dispatchDate || null,
            trackingId: row.trackingId || null,
            hasPickup: true,
            hasSettlement: false,
            isMatched: false,
            userId,
          },
        });
        inserted++;
      }
      touchedIds.push(row.orderItemId);
    }

    const matchResult = await matchOrdersForUser(userId, touchedIds);
    res.json({
      success: true,
      type: 'pickup',
      processed: rows.length,
      inserted,
      updated,
      matched: matchResult.updated,
    });
  } catch (err) {
    console.error('Pickup upload error:', err);
    res.status(500).json({ error: 'Failed to parse pickup report: ' + err.message });
  }
});

// ---------- SETTLEMENT ----------
// Multi-file accumulative model:
//  1. Hash file bytes → fileHash
//  2. Delete all entries with that fileHash (handles re-upload)
//  3. Insert every row from the file as a SettlementEntry
//  4. For every touched orderItemId, set Order.bankSettlement = SUM of all entries
router.post('/settlement', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user.id;
    const rows = parseSettlementReport(req.file.buffer);
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const fileName = req.file.originalname || null;

    // Wipe prior contribution from this exact file
    await prisma.settlementEntry.deleteMany({ where: { userId, fileHash } });

    // Insert fresh entries; collect touched orderItemIds
    const touched = new Set();
    const entries = [];
    rows.forEach((row, idx) => {
      if (!row.orderItemId) return;
      if (row.bankSettlement === null || row.bankSettlement === undefined) return;
      entries.push({
        userId,
        orderItemId: row.orderItemId,
        orderId: row.orderId || null,
        paymentDate: row.paymentDate || null,
        bankSettlement: row.bankSettlement,
        fileHash,
        fileName,
        rowIndex: idx,
      });
      touched.add(row.orderItemId);
    });
    if (entries.length) {
      await prisma.settlementEntry.createMany({ data: entries });
    }

    // Recompute each touched order's settlement = SUM of all its entries
    let updated = 0;
    let skipped = 0;
    const skippedSample = [];

    for (const orderItemId of touched) {
      const existing = await prisma.order.findUnique({
        where: { orderItemId_userId: { orderItemId, userId } },
      });
      if (!existing) {
        skipped++;
        if (skippedSample.length < 10) skippedSample.push(orderItemId);
        continue;
      }

      // Sum across ALL entries (this file + any previous files)
      const agg = await prisma.settlementEntry.aggregate({
        where: { userId, orderItemId },
        _sum: { bankSettlement: true },
        _max: { paymentDate: true },
      });

      // Latest non-null orderId from any entry
      const latest = await prisma.settlementEntry.findFirst({
        where: { userId, orderItemId, orderId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { orderId: true },
      });

      await prisma.order.update({
        where: { id: existing.id },
        data: {
          bankSettlement: agg._sum.bankSettlement,
          paymentDate: agg._max.paymentDate || existing.paymentDate,
          orderId: latest?.orderId || existing.orderId,
          hasSettlement: true,
        },
      });
      updated++;
    }

    const matchResult = await matchOrdersForUser(userId, Array.from(touched));
    res.json({
      success: true,
      type: 'settlement',
      processed: rows.length,
      entriesStored: entries.length,
      uniqueOrders: touched.size,
      updated,
      skipped,
      skippedSample,
      matched: matchResult.updated,
      fileHash: fileHash.slice(0, 12) + '…',
    });
  } catch (err) {
    console.error('Settlement upload error:', err);
    res.status(500).json({ error: 'Failed to parse settlement report: ' + err.message });
  }
});

// ---------- RETURN (Received — physically back) ----------
router.post('/returns', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user.id;
    const trackingIds = parseReturnReport(req.file.buffer);

    let marked = 0;
    const notFound = [];
    const touchedIds = [];

    for (const tid of trackingIds) {
      if (!tid) continue;
      const orders = await prisma.order.findMany({ where: { userId, trackingId: tid } });
      if (!orders.length) {
        notFound.push(tid);
        continue;
      }
      for (const o of orders) {
        await prisma.order.update({
          where: { id: o.id },
          data: {
            isReturned: true,
            returnDate: new Date(),
            // Returned overrides "incoming" — it's no longer incoming, it's here.
            returnIncoming: false,
          },
        });
        marked++;
        touchedIds.push(o.orderItemId);
      }
    }

    // Recompute profit from current settlement values (no zero-out anymore)
    await matchOrdersForUser(userId, touchedIds);

    res.json({
      success: true,
      type: 'returns',
      trackingIdsFound: trackingIds.length,
      ordersMarked: marked,
      notFound: notFound.length,
      notFoundSample: notFound.slice(0, 10),
    });
  } catch (err) {
    console.error('Return upload error:', err);
    res.status(500).json({ error: 'Failed to parse return report: ' + err.message });
  }
});

// ---------- RETURN INCOMING (on the way back) ----------
router.post('/return-incoming', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user.id;
    const rows = parseReturnIncomingReport(req.file.buffer);

    let marked = 0;
    let skipped = 0;
    const skippedSample = [];

    for (const row of rows) {
      // Prefer match by orderItemId, fall back to trackingId
      let order = null;
      if (row.orderItemId) {
        order = await prisma.order.findUnique({
          where: { orderItemId_userId: { orderItemId: row.orderItemId, userId } },
        });
      }
      if (!order && row.trackingId) {
        const matches = await prisma.order.findMany({
          where: { userId, trackingId: row.trackingId },
        });
        if (matches.length === 1) order = matches[0];
      }

      if (!order) {
        skipped++;
        if (skippedSample.length < 10) {
          skippedSample.push(row.orderItemId || row.trackingId);
        }
        continue;
      }

      // Don't override an already-received return; just enrich metadata.
      const shouldFlagIncoming = !order.isReturned;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          returnIncoming: shouldFlagIncoming ? true : order.returnIncoming,
          returnStatus: row.returnStatus || order.returnStatus,
          returnReason: row.returnReason || order.returnReason,
          returnSubReason: row.returnSubReason || order.returnSubReason,
          returnRequestedDate: row.returnRequestedDate || order.returnRequestedDate,
        },
      });
      marked++;
    }

    res.json({
      success: true,
      type: 'return-incoming',
      processed: rows.length,
      ordersMarked: marked,
      skipped,
      skippedSample,
    });
  } catch (err) {
    console.error('Return-incoming upload error:', err);
    res.status(500).json({ error: 'Failed to parse return-incoming report: ' + err.message });
  }
});

// ---------- UNDO RETURN ----------
router.post('/undo-return', async (req, res) => {
  try {
    const { trackingId } = req.body || {};
    if (!trackingId) return res.status(400).json({ error: 'trackingId is required' });

    const orders = await prisma.order.findMany({
      where: { userId: req.user.id, trackingId, isReturned: true },
    });
    if (!orders.length) return res.status(404).json({ error: 'No returned orders found for this tracking ID' });

    for (const o of orders) {
      await prisma.order.update({
        where: { id: o.id },
        data: { isReturned: false, returnDate: null },
      });
    }
    await matchOrdersForUser(req.user.id, orders.map((o) => o.orderItemId));
    res.json({ success: true, undone: orders.length });
  } catch (err) {
    console.error('Undo return error:', err);
    res.status(500).json({ error: 'Failed to undo return' });
  }
});

module.exports = router;
