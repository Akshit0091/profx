const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware, platformMiddleware } = require('../middleware/auth');
const { parsePickupReport, parseSettlementReport, parseReturnReport, parseReturnIncomingReport } = require('../utils/fileParser');
const { matchOrdersForUser } = require('../utils/matcher');

const router = express.Router();
const prisma = new PrismaClient();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authMiddleware, subscriptionMiddleware, platformMiddleware);

// ---------- PICKUP ----------
router.post('/pickup', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user.id;
    const platform = req.platform;
    const rows = parsePickupReport(req.file.buffer);

    let inserted = 0;
    let updated = 0;
    const touchedIds = [];

    for (const row of rows) {
      if (!row.orderItemId) continue;
      const existing = await prisma.order.findUnique({
        where: { orderItemId_userId_platform: { orderItemId: row.orderItemId, userId, platform } },
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
            platform,
            userId,
          },
        });
        inserted++;
      }
      touchedIds.push(row.orderItemId);
    }

    const matchResult = await matchOrdersForUser(userId, platform, touchedIds);
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
    const platform = req.platform;
    const rows = parseSettlementReport(req.file.buffer);
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const fileName = req.file.originalname || null;

    // Wipe prior contribution from this exact file
    await prisma.settlementEntry.deleteMany({ where: { userId, platform, fileHash } });

    // Insert fresh entries; collect touched orderItemIds
    const touched = new Set();
    const entries = [];
    rows.forEach((row, idx) => {
      if (!row.orderItemId) return;
      if (row.bankSettlement === null || row.bankSettlement === undefined) return;
      entries.push({
        userId,
        platform,
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
        where: { orderItemId_userId_platform: { orderItemId, userId, platform } },
      });
      if (!existing) {
        skipped++;
        if (skippedSample.length < 10) skippedSample.push(orderItemId);
        continue;
      }

      // Sum across ALL entries (this file + any previous files)
      const agg = await prisma.settlementEntry.aggregate({
        where: { userId, platform, orderItemId },
        _sum: { bankSettlement: true },
        _max: { paymentDate: true },
      });

      // Latest non-null orderId from any entry
      const latest = await prisma.settlementEntry.findFirst({
        where: { userId, platform, orderItemId, orderId: { not: null } },
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

    const matchResult = await matchOrdersForUser(userId, platform, Array.from(touched));
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
    const platform = req.platform;
    const trackingIds = parseReturnReport(req.file.buffer);

    let marked = 0;
    const notFound = [];
    const touchedIds = [];

    for (const tid of trackingIds) {
      if (!tid) continue;
      const orders = await prisma.order.findMany({ where: { userId, platform, trackingId: tid } });
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
    await matchOrdersForUser(userId, platform, touchedIds);

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
    const platform = req.platform;
    const rows = parseReturnIncomingReport(req.file.buffer);

    let marked = 0;
    let skipped = 0;
    const skippedSample = [];

    for (const row of rows) {
      // Prefer match by orderItemId, fall back to trackingId
      let order = null;
      if (row.orderItemId) {
        order = await prisma.order.findUnique({
          where: { orderItemId_userId_platform: { orderItemId: row.orderItemId, userId, platform } },
        });
      }
      if (!order && row.trackingId) {
        const matches = await prisma.order.findMany({
          where: { userId, platform, trackingId: row.trackingId },
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
      where: { userId: req.user.id, platform: req.platform, trackingId, isReturned: true },
    });
    if (!orders.length) return res.status(404).json({ error: 'No returned orders found for this tracking ID' });

    for (const o of orders) {
      await prisma.order.update({
        where: { id: o.id },
        data: { isReturned: false, returnDate: null },
      });
    }
    await matchOrdersForUser(req.user.id, req.platform, orders.map((o) => o.orderItemId));
    res.json({ success: true, undone: orders.length });
  } catch (err) {
    console.error('Undo return error:', err);
    res.status(500).json({ error: 'Failed to undo return' });
  }
});

// ---------- UPLOAD HISTORY ----------
// Returns all uploaded files (settlement + meesho) grouped by fileHash,
// with metadata: fileName, upload date, entry count, unique orders, platform.
// Derived purely from SettlementEntry — no new table needed.
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;

    // Group settlement entries by fileHash to reconstruct upload history
    const entries = await prisma.settlementEntry.findMany({
      where: { userId },
      select: {
        fileHash: true,
        fileName: true,
        platform: true,
        orderItemId: true,
        bankSettlement: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by fileHash
    const map = new Map();
    for (const e of entries) {
      if (!e.fileHash) continue;
      if (!map.has(e.fileHash)) {
        map.set(e.fileHash, {
          fileHash: e.fileHash,
          fileName: e.fileName || 'Unknown file',
          platform: e.platform,
          type: e.platform === 'meesho' ? 'meesho-payment' : 'settlement',
          uploadedAt: e.createdAt,
          entryCount: 0,
          orderIds: new Set(),
          totalSettlement: 0,
        });
      }
      const group = map.get(e.fileHash);
      group.entryCount++;
      group.orderIds.add(e.orderItemId);
      group.totalSettlement += e.bankSettlement || 0;
      // Keep the earliest createdAt as the upload date
      if (e.createdAt < group.uploadedAt) group.uploadedAt = e.createdAt;
    }

    const history = Array.from(map.values())
      .map((g) => ({
        fileHash: g.fileHash,
        fileHashShort: g.fileHash.slice(0, 12) + '…',
        fileName: g.fileName,
        platform: g.platform,
        type: g.type,
        uploadedAt: g.uploadedAt,
        entryCount: g.entryCount,
        uniqueOrders: g.orderIds.size,
        totalSettlement: Math.round(g.totalSettlement * 100) / 100,
      }))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.json({ history });
  } catch (err) {
    console.error('Upload history error:', err);
    res.status(500).json({ error: 'Failed to fetch upload history' });
  }
});

// ---------- DELETE / ROLLBACK A FILE ----------
// Removes all SettlementEntry rows for a given fileHash, then recomputes
// bankSettlement for every affected order from remaining entries.
// This cleanly undoes a file upload without touching other files' data.
router.delete('/file/:fileHash', async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileHash } = req.params;

    if (!fileHash || fileHash.length < 10) {
      return res.status(400).json({ error: 'Invalid file hash' });
    }

    // Find all entries for this file, to know which orders are affected
    const entries = await prisma.settlementEntry.findMany({
      where: { userId, fileHash },
      select: { orderItemId: true, platform: true, fileName: true },
    });

    if (!entries.length) {
      return res.status(404).json({ error: 'No upload found with this file hash' });
    }

    const platform = entries[0].platform;
    const fileName = entries[0].fileName;
    const affectedOrderIds = [...new Set(entries.map((e) => e.orderItemId))];

    // Delete all entries from this file
    const deleted = await prisma.settlementEntry.deleteMany({
      where: { userId, fileHash },
    });

    // Recompute bankSettlement for each affected order from remaining entries
    let recomputed = 0;
    let zeroed = 0;
    const touchedIds = [];

    for (const orderItemId of affectedOrderIds) {
      const order = await prisma.order.findUnique({
        where: { orderItemId_userId_platform: { orderItemId, userId, platform } },
      });
      if (!order) continue;

      // Sum remaining entries (from other files)
      const agg = await prisma.settlementEntry.aggregate({
        where: { userId, platform, orderItemId },
        _sum: { bankSettlement: true },
        _max: { paymentDate: true },
        _count: true,
      });

      const remainingSum = agg._sum.bankSettlement || 0;
      const hasRemaining = agg._count > 0;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          bankSettlement: remainingSum,
          hasSettlement: hasRemaining,
          paymentDate: hasRemaining ? (agg._max.paymentDate || order.paymentDate) : order.paymentDate,
        },
      });

      touchedIds.push(orderItemId);
      if (hasRemaining) recomputed++;
      else zeroed++;
    }

    // Re-run matcher for all affected orders
    if (touchedIds.length) {
      await matchOrdersForUser(userId, platform, touchedIds);
    }

    res.json({
      success: true,
      fileName,
      fileHash: fileHash.slice(0, 12) + '…',
      entriesDeleted: deleted.count,
      ordersRecomputed: recomputed,
      ordersZeroed: zeroed,
      totalAffected: affectedOrderIds.length,
    });
  } catch (err) {
    console.error('File delete/rollback error:', err);
    res.status(500).json({ error: 'Failed to delete file and rollback' });
  }
});

module.exports = router;
