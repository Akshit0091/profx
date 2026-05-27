const express = require('express');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');
const { matchOrdersForUser } = require('../utils/matcher');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware, subscriptionMiddleware);

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      search = '',
      status = 'all',
      starred,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortDir = 'desc',
      page = '1',
      limit = '50',
    } = req.query;

    const where = { userId };

    // Starred toggle — independent of status, can combine with anything
    if (starred === 'true' || starred === '1') where.isStarred = true;

    if (search) {
      where.OR = [
        { orderItemId: { contains: String(search), mode: 'insensitive' } },
        { orderId:     { contains: String(search), mode: 'insensitive' } },
        { skuId:       { contains: String(search), mode: 'insensitive' } },
        { trackingId:  { contains: String(search), mode: 'insensitive' } },
      ];
    }

    if (status === 'matched')         where.isMatched = true;
    if (status === 'pending')         { where.isMatched = false; where.isReturned = false; where.returnIncoming = false; }
    if (status === 'returned')        where.isReturned = true;
    if (status === 'return-incoming') { where.returnIncoming = true; where.isReturned = false; }
    if (status === 'profit')          { where.isMatched = true; where.profit = { gt: 0 }; }
    if (status === 'loss')            { where.isMatched = true; where.profit = { lt: 0 }; }

    if (dateFrom || dateTo) {
      where.dispatchDate = {};
      if (dateFrom) where.dispatchDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.dispatchDate.lte = end;
      }
    }

    const allowedSorts = ['createdAt', 'profit', 'paymentDate', 'dispatchDate', 'bankSettlement'];
    const sortField = allowedSorts.includes(String(sortBy)) ? String(sortBy) : 'createdAt';
    const sortOrder = String(sortDir) === 'asc' ? 'asc' : 'desc';

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * take;

    const [total, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { [sortField]: sortOrder },
        skip,
        take,
      }),
    ]);

    res.json({
      orders,
      pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error('Orders list error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

    const rows = orders.map((o) => ({
      'Order Item ID':    o.orderItemId,
      'Order ID':         o.orderId || '',
      'SKU':              o.skuId || '',
      'Tracking ID':      o.trackingId || '',
      'Dispatch Date':    fmt(o.dispatchDate),
      'Payment Date':     fmt(o.paymentDate),
      'Bank Settlement':  o.bankSettlement ?? '',
      'Purchase Price':   o.purchasePrice ?? '',
      'Profit':           o.profit ?? '',
      'Return Status':    o.isReturned ? 'Returned' : (o.returnIncoming ? 'Return Incoming' : 'Not Returned'),
      'Return Date':      fmt(o.returnDate),
      'Return Reason':    o.returnReason || '',
      'Return Sub-reason': o.returnSubReason || '',
      'Has Pickup':       o.hasPickup ? 'Yes' : 'No',
      'Has Settlement':   o.hasSettlement ? 'Yes' : 'No',
      'Is Matched':       o.isMatched ? 'Yes' : 'No',
      'Starred':          o.isStarred ? 'Yes' : 'No',
      'Created':          fmt(o.createdAt),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="profx-orders-${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export orders' });
  }
});

router.delete('/all', async (req, res) => {
  try {
    const result = await prisma.order.deleteMany({ where: { userId: req.user.id } });
    res.json({ success: true, deleted: result.count });
  } catch (err) {
    console.error('Delete all orders error:', err);
    res.status(500).json({ error: 'Failed to delete orders' });
  }
});

// Recompute profit for every order using the current rule.
// Useful after rule changes (e.g. returned orders → profit = settlement only).
router.post('/recalc', async (req, res) => {
  try {
    const result = await matchOrdersForUser(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Recalc error:', err);
    res.status(500).json({ error: 'Failed to recalculate profits' });
  }
});

// Manually flip a single order's returned status.
// PATCH /api/orders/:id/returned   { returned: true|false }
router.patch('/:id/returned', async (req, res) => {
  try {
    const { returned } = req.body || {};
    if (typeof returned !== 'boolean') {
      return res.status(400).json({ error: '"returned" must be true or false' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        isReturned: returned,
        returnDate: returned ? (order.returnDate || new Date()) : null,
        // Clearing returnIncoming when we mark fully returned mirrors the upload flow
        returnIncoming: returned ? false : order.returnIncoming,
      },
    });

    await matchOrdersForUser(req.user.id, [order.orderItemId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark-returned error:', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Toggle the "I've reviewed this" star on an order.
// Stars are user-managed review state, preserved across all uploads and recalcs.
// PATCH /api/orders/:id/star   { starred: true|false }
router.patch('/:id/star', async (req, res) => {
  try {
    const { starred } = req.body || {};
    if (typeof starred !== 'boolean') {
      return res.status(400).json({ error: '"starred" must be true or false' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        isStarred: starred,
        starredAt: starred ? new Date() : null,
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Star toggle error:', err);
    res.status(500).json({ error: 'Failed to update star' });
  }
});

// Manually override an order's settlement value.
// Implemented as a "manual" SettlementEntry so it survives future file uploads.
// PATCH /api/orders/:id/settlement   { bankSettlement: number | null }
router.patch('/:id/settlement', async (req, res) => {
  try {
    const { bankSettlement } = req.body || {};
    if (bankSettlement !== null && (typeof bankSettlement !== 'number' || !isFinite(bankSettlement))) {
      return res.status(400).json({ error: '"bankSettlement" must be a finite number or null' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // The manual override replaces any prior manual entries for this order
    // but does NOT touch file-sourced entries. We model it as a synthetic
    // fileHash unique to this order, so future settlement files contribute
    // additively and the manual line stays in the sum.
    const manualHash = `manual:${order.orderItemId}`;
    await prisma.settlementEntry.deleteMany({
      where: { userId: req.user.id, fileHash: manualHash },
    });
    if (bankSettlement !== null) {
      await prisma.settlementEntry.create({
        data: {
          userId: req.user.id,
          orderItemId: order.orderItemId,
          orderId: order.orderId,
          paymentDate: new Date(),
          bankSettlement,
          fileHash: manualHash,
          fileName: 'manual override',
          rowIndex: 0,
        },
      });
    }

    // Recompute the order's settlement as SUM of all its entries
    const agg = await prisma.settlementEntry.aggregate({
      where: { userId: req.user.id, orderItemId: order.orderItemId },
      _sum: { bankSettlement: true },
    });
    const newSum = agg._sum.bankSettlement;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        bankSettlement: newSum,
        hasSettlement: newSum !== null,
      },
    });

    await matchOrdersForUser(req.user.id, [order.orderItemId]);
    res.json({ success: true, newSettlement: newSum });
  } catch (err) {
    console.error('Edit-settlement error:', err);
    res.status(500).json({ error: 'Failed to update settlement' });
  }
});

module.exports = router;
