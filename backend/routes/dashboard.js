const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware, subscriptionMiddleware);

// Resolve { startDate, endDate } from query params.
// Priority: explicit startDate/endDate > month (YYYY-MM) > days fallback.
function resolveRange(query) {
  const now = new Date();

  if (query.startDate || query.endDate) {
    const start = query.startDate ? new Date(query.startDate) : new Date(0);
    const end = query.endDate ? new Date(query.endDate) : now;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (query.month) {
    // Format: YYYY-MM
    const m = String(query.month).match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      const yr = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const start = new Date(yr, mo, 1, 0, 0, 0, 0);
      const end = new Date(yr, mo + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
  }

  const days = Math.max(1, Math.min(365, parseInt(query.days, 10) || 30));
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dateKey(d) {
  // YYYY-MM-DD in local time so charts don't shift by UTC offset
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const { start, end } = resolveRange(req.query);

    // Range filter on dispatchDate. Returned orders are INCLUDED so their
    // (possibly negative) profit hits the totals.
    const dispatchFilter = { gte: start, lte: end };

    const [totalOrders, matchedOrders, returnedOrders, returnIncomingOrders, pendingOrders, matchedRows, lossCount, profitCount] = await Promise.all([
      prisma.order.count({ where: { userId, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, isMatched: true, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, isReturned: true, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, returnIncoming: true, isReturned: false, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, isMatched: false, dispatchDate: dispatchFilter } }),
      prisma.order.findMany({
        where: { userId, isMatched: true, dispatchDate: dispatchFilter },
        select: { bankSettlement: true, purchasePrice: true, profit: true },
      }),
      prisma.order.count({
        where: { userId, isMatched: true, dispatchDate: dispatchFilter, profit: { lt: 0 } },
      }),
      prisma.order.count({
        where: { userId, isMatched: true, dispatchDate: dispatchFilter, profit: { gt: 0 } },
      }),
    ]);

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    for (const o of matchedRows) {
      totalRevenue += o.bankSettlement || 0;
      totalCost    += o.purchasePrice  || 0;
      totalProfit  += o.profit         || 0;
    }
    const avgProfit = matchedRows.length ? totalProfit / matchedRows.length : 0;

    res.json({
      totalOrders,
      matchedOrders,
      pendingOrders,
      returnedOrders,
      returnIncomingOrders,
      lossOrders: lossCount,
      profitOrders: profitCount,
      totalRevenue,
      totalCost,
      totalProfit,
      avgProfit,
      rangeStart: start.toISOString(),
      rangeEnd:   end.toISOString(),
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.get('/chart/profit', async (req, res) => {
  try {
    const userId = req.user.id;
    const { start, end } = resolveRange(req.query);

    const orders = await prisma.order.findMany({
      where: {
        userId,
        isMatched: true,
        dispatchDate: { gte: start, lte: end },
      },
      select: { dispatchDate: true, bankSettlement: true, profit: true },
    });

    const map = new Map();
    // Seed every day in the range
    const cursor = new Date(start);
    while (cursor <= end) {
      map.set(dateKey(cursor), { date: dateKey(cursor), profit: 0, revenue: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const o of orders) {
      if (!o.dispatchDate) continue;
      const key = dateKey(new Date(o.dispatchDate));
      if (!map.has(key)) map.set(key, { date: key, profit: 0, revenue: 0 });
      const row = map.get(key);
      row.profit  += o.profit         || 0;
      row.revenue += o.bankSettlement || 0;
    }

    const data = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    res.json({ data, rangeStart: start.toISOString(), rangeEnd: end.toISOString() });
  } catch (err) {
    console.error('Profit chart error:', err);
    res.status(500).json({ error: 'Failed to fetch chart' });
  }
});

router.get('/chart/orders', async (req, res) => {
  try {
    const userId = req.user.id;
    const { start, end } = resolveRange(req.query);

    const orders = await prisma.order.findMany({
      where: { userId, dispatchDate: { gte: start, lte: end } },
      select: { dispatchDate: true, isMatched: true, isReturned: true, returnIncoming: true },
    });

    const map = new Map();
    const cursor = new Date(start);
    while (cursor <= end) {
      map.set(dateKey(cursor), {
        date: dateKey(cursor),
        total: 0,
        matched: 0,
        returned: 0,
        returnIncoming: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const o of orders) {
      if (!o.dispatchDate) continue;
      const key = dateKey(new Date(o.dispatchDate));
      if (!map.has(key)) map.set(key, { date: key, total: 0, matched: 0, returned: 0, returnIncoming: 0 });
      const row = map.get(key);
      row.total++;
      if (o.isMatched) row.matched++;
      if (o.isReturned) row.returned++;
      if (o.returnIncoming && !o.isReturned) row.returnIncoming++;
    }

    const data = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    res.json({ data, rangeStart: start.toISOString(), rangeEnd: end.toISOString() });
  } catch (err) {
    console.error('Orders chart error:', err);
    res.status(500).json({ error: 'Failed to fetch chart' });
  }
});

module.exports = router;
