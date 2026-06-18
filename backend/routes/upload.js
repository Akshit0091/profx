const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware, platformMiddleware } = require('../middleware/auth');
const { parsePickupReport, parseSettlementReport, parseReturnReport, parseReturnIncomingReport, parseMeeshoPayment } = require('../utils/fileParser');
const { matchOrdersForUser } = require('../utils/matcher');

const router = express.Router();
const prisma = new PrismaClient();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authMiddleware, subscriptionMiddleware, platformMiddleware);

// Helper: log every upload to UploadLog for history + rollback
async function logUpload({ userId, platform, type, fileName, fileHash, rowCount, inserted, updated, affectedIds }) {
  try {
    await prisma.uploadLog.create({
      data: { userId, platform, type, fileName: fileName || null, fileHash: fileHash || null, rowCount: rowCount || 0, inserted: inserted || 0, updated: updated || 0, affectedIds: affectedIds || [] },
    });
  } catch (err) {
    console.error('Failed to log upload:', err);
    // Non-fatal — don't break the upload response
  }
}

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
    await logUpload({ userId, platform, type: 'pickup', fileName: req.file.originalname, rowCount: rows.length, inserted, updated, affectedIds: touchedIds });
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
    await logUpload({ userId, platform, type: 'settlement', fileName: req.file.originalname, fileHash, rowCount: rows.length, inserted: entries.length, updated, affectedIds: Array.from(touched) });
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
    await logUpload({ userId, platform, type: 'returns', fileName: req.file.originalname, rowCount: trackingIds.length, inserted: marked, affectedIds: touchedIds });

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
    const markedIds = [];

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
      markedIds.push(order.orderItemId);
    }

    await logUpload({ userId, platform, type: 'return-incoming', fileName: req.file.originalname, rowCount: rows.length, inserted: marked, affectedIds: markedIds });
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

// ---------- MEESHO PAYMENT (single all-in-one file) ----------
router.post('/meesho-payment', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user.id;
    const platform = 'meesho';
    const rows = parseMeeshoPayment(req.file.buffer);
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const fileName = req.file.originalname || null;

    await prisma.settlementEntry.deleteMany({ where: { userId, platform, fileHash } });

    let inserted = 0;
    let updated = 0;
    let returns = 0;
    const touched = new Set();
    const entries = [];

    rows.forEach((row, idx) => {
      if (!row.orderItemId) return;
      if (row.bankSettlement === null || row.bankSettlement === undefined) return;
      entries.push({
        userId, platform, orderItemId: row.orderItemId, orderId: null,
        paymentDate: row.paymentDate || null, bankSettlement: row.bankSettlement,
        fileHash, fileName, rowIndex: idx,
      });
    });
    if (entries.length) {
      await prisma.settlementEntry.createMany({ data: entries });
    }

    for (const row of rows) {
      if (!row.orderItemId) continue;
      touched.add(row.orderItemId);
      if (row.isReturned) returns++;

      const existing = await prisma.order.findUnique({
        where: { orderItemId_userId_platform: { orderItemId: row.orderItemId, userId, platform } },
      });

      if (existing) {
        await prisma.order.update({
          where: { id: existing.id },
          data: {
            skuId: row.skuId || existing.skuId,
            dispatchDate: row.dispatchDate || existing.dispatchDate,
            paymentDate: row.paymentDate || existing.paymentDate,
            hasPickup: true, hasSettlement: true,
            isReturned: row.isReturned,
            returnType: row.returnType,
            returnDate: row.isReturned ? (existing.returnDate || new Date()) : null,
          },
        });
        updated++;
      } else {
        await prisma.order.create({
          data: {
            orderItemId: row.orderItemId, orderId: null,
            skuId: row.skuId || null,
            dispatchDate: row.dispatchDate || null,
            paymentDate: row.paymentDate || null,
            hasPickup: true, hasSettlement: true, isMatched: false,
            isReturned: row.isReturned, returnType: row.returnType,
            returnDate: row.isReturned ? new Date() : null,
            platform, userId,
          },
        });
        inserted++;
      }
    }

    for (const orderItemId of touched) {
      const order = await prisma.order.findUnique({
        where: { orderItemId_userId_platform: { orderItemId, userId, platform } },
      });
      if (!order) continue;
      const agg = await prisma.settlementEntry.aggregate({
        where: { userId, platform, orderItemId },
        _sum: { bankSettlement: true },
        _max: { paymentDate: true },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: {
          bankSettlement: agg._sum.bankSettlement,
          paymentDate: agg._max.paymentDate || order.paymentDate,
        },
      });
    }

    const matchResult = await matchOrdersForUser(userId, platform, Array.from(touched));
    await logUpload({ userId, platform, type: 'meesho-payment', fileName: req.file.originalname, fileHash, rowCount: rows.length, inserted, updated, affectedIds: Array.from(touched) });
    res.json({
      success: true, type: 'meesho-payment',
      processed: rows.length, inserted, updated, returns,
      uniqueOrders: touched.size, entriesStored: entries.length,
      matched: matchResult.updated,
      fileHash: fileHash.slice(0, 12) + '…',
    });
  } catch (err) {
    console.error('Meesho payment upload error:', err);
    res.status(500).json({ error: 'Failed to parse Meesho payment file: ' + err.message });
  }
});

// ---------- UPLOAD HISTORY ----------
// Returns all uploads: from UploadLog (new) + legacy SettlementEntry groupings (old).
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. UploadLog entries (new uploads going forward)
    const logs = await prisma.uploadLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, platform: true, type: true, fileName: true, fileHash: true,
        rowCount: true, inserted: true, updated: true, createdAt: true,
        affectedIds: true,
      },
    });

    // 2. Legacy settlement entries (uploads before UploadLog existed) — group by fileHash
    const logHashes = new Set(logs.filter((l) => l.fileHash).map((l) => l.fileHash));
    const legacyEntries = await prisma.settlementEntry.findMany({
      where: { userId },
      select: { fileHash: true, fileName: true, platform: true, orderItemId: true, bankSettlement: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const legacyMap = new Map();
    for (const e of legacyEntries) {
      if (!e.fileHash || logHashes.has(e.fileHash)) continue; // skip if already in UploadLog
      if (!legacyMap.has(e.fileHash)) {
        legacyMap.set(e.fileHash, {
          id: 'legacy_' + e.fileHash,
          platform: e.platform,
          type: e.platform === 'meesho' ? 'meesho-payment' : 'settlement',
          fileName: e.fileName || 'Unknown file',
          fileHash: e.fileHash,
          rowCount: 0, inserted: 0, updated: 0,
          createdAt: e.createdAt,
          affectedIds: new Set(),
          totalSettlement: 0,
          isLegacy: true,
        });
      }
      const g = legacyMap.get(e.fileHash);
      g.rowCount++;
      g.affectedIds.add(e.orderItemId);
      g.totalSettlement += e.bankSettlement || 0;
      if (e.createdAt < g.createdAt) g.createdAt = e.createdAt;
    }

    // 3. Merge and format
    const history = [
      ...logs.map((l) => ({
        id: l.id,
        platform: l.platform,
        type: l.type,
        fileName: l.fileName || 'Unknown file',
        fileHash: l.fileHash,
        uploadedAt: l.createdAt,
        rowCount: l.rowCount,
        inserted: l.inserted,
        updated: l.updated,
        affectedCount: l.affectedIds?.length || 0,
        isLegacy: false,
      })),
      ...Array.from(legacyMap.values()).map((g) => ({
        id: g.id,
        platform: g.platform,
        type: g.type,
        fileName: g.fileName,
        fileHash: g.fileHash,
        uploadedAt: g.createdAt,
        rowCount: g.rowCount,
        inserted: g.rowCount,
        updated: 0,
        affectedCount: g.affectedIds.size,
        totalSettlement: Math.round(g.totalSettlement * 100) / 100,
        isLegacy: true,
      })),
    ].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.json({ history });
  } catch (err) {
    console.error('Upload history error:', err);
    res.status(500).json({ error: 'Failed to fetch upload history' });
  }
});

// ---------- DELETE / ROLLBACK AN UPLOAD ----------
// Accepts either an UploadLog ID or a legacy fileHash (prefixed with 'legacy_').
// Rolls back based on type:
//   settlement/meesho: delete SettlementEntry by fileHash, recompute orders
//   pickup: delete orders that have no settlement (safe), clear pickup on others
//   returns: unmark orders as returned, recompute
//   return-incoming: unmark orders as returnIncoming
router.delete('/file/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    let log = null;
    let isLegacy = false;

    if (id.startsWith('legacy_')) {
      // Legacy settlement — no UploadLog entry, use fileHash directly
      const fileHash = id.replace('legacy_', '');
      const sample = await prisma.settlementEntry.findFirst({ where: { userId, fileHash } });
      if (!sample) return res.status(404).json({ error: 'No upload found' });
      log = {
        type: sample.platform === 'meesho' ? 'meesho-payment' : 'settlement',
        platform: sample.platform,
        fileHash,
        fileName: sample.fileName,
        affectedIds: [],
      };
      isLegacy = true;
    } else {
      log = await prisma.uploadLog.findUnique({ where: { id } });
      if (!log || log.userId !== userId) return res.status(404).json({ error: 'Upload not found' });
    }

    const { type, platform, fileHash, affectedIds } = log;
    let result = { type, fileName: log.fileName, rolled: 0 };

    // ── Settlement / Meesho: delete entries, recompute orders ──
    if (type === 'settlement' || type === 'meesho-payment') {
      if (!fileHash) return res.status(400).json({ error: 'No file hash — cannot rollback' });

      const entries = await prisma.settlementEntry.findMany({
        where: { userId, fileHash },
        select: { orderItemId: true },
      });
      const affectedOrderIds = [...new Set(entries.map((e) => e.orderItemId))];

      const deleted = await prisma.settlementEntry.deleteMany({ where: { userId, fileHash } });

      const touchedIds = [];
      for (const orderItemId of affectedOrderIds) {
        const order = await prisma.order.findUnique({
          where: { orderItemId_userId_platform: { orderItemId, userId, platform } },
        });
        if (!order) continue;
        const agg = await prisma.settlementEntry.aggregate({
          where: { userId, platform, orderItemId },
          _sum: { bankSettlement: true },
          _max: { paymentDate: true },
          _count: true,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: {
            bankSettlement: agg._sum.bankSettlement || 0,
            hasSettlement: agg._count > 0,
            paymentDate: agg._count > 0 ? (agg._max.paymentDate || order.paymentDate) : order.paymentDate,
          },
        });
        touchedIds.push(orderItemId);
      }
      if (touchedIds.length) await matchOrdersForUser(userId, platform, touchedIds);
      result.rolled = deleted.count;
      result.ordersRecomputed = touchedIds.length;
    }

    // ── Pickup: delete orders without settlement, clear pickup on others ──
    else if (type === 'pickup') {
      const ids = affectedIds || [];
      let deleted = 0;
      let cleared = 0;
      for (const orderItemId of ids) {
        const order = await prisma.order.findUnique({
          where: { orderItemId_userId_platform: { orderItemId, userId, platform } },
        });
        if (!order) continue;
        if (!order.hasSettlement) {
          // Safe to delete — no settlement data attached
          await prisma.order.delete({ where: { id: order.id } });
          deleted++;
        } else {
          // Has settlement — just clear pickup fields
          await prisma.order.update({
            where: { id: order.id },
            data: { hasPickup: false, trackingId: null },
          });
          cleared++;
        }
      }
      result.rolled = deleted;
      result.cleared = cleared;
    }

    // ── Returns received: unmark as returned ──
    else if (type === 'returns') {
      const ids = affectedIds || [];
      let unmarked = 0;
      for (const orderItemId of ids) {
        const order = await prisma.order.findUnique({
          where: { orderItemId_userId_platform: { orderItemId, userId, platform } },
        });
        if (!order || !order.isReturned) continue;
        await prisma.order.update({
          where: { id: order.id },
          data: { isReturned: false, returnDate: null },
        });
        unmarked++;
      }
      if (ids.length) await matchOrdersForUser(userId, platform, ids);
      result.rolled = unmarked;
    }

    // ── Return incoming: unmark as incoming ──
    else if (type === 'return-incoming') {
      const ids = affectedIds || [];
      let unmarked = 0;
      for (const orderItemId of ids) {
        const order = await prisma.order.findUnique({
          where: { orderItemId_userId_platform: { orderItemId, userId, platform } },
        });
        if (!order || !order.returnIncoming) continue;
        await prisma.order.update({
          where: { id: order.id },
          data: { returnIncoming: false },
        });
        unmarked++;
      }
      result.rolled = unmarked;
    }

    // Remove the UploadLog entry itself (if not legacy)
    if (!isLegacy) {
      await prisma.uploadLog.delete({ where: { id } }).catch(() => {});
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('File delete/rollback error:', err);
    res.status(500).json({ error: 'Failed to rollback upload: ' + err.message });
  }
});

module.exports = router;
