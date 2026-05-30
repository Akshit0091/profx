const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware, platformMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Auth + subscription required for ALL routes.
router.use(authMiddleware, subscriptionMiddleware);

// ─── Combined routes go here — BEFORE platformMiddleware ───────────────────
// These aggregate across all owned platforms and must NOT go through
// platformMiddleware (which would 400 on x-platform: all).
// Access is controlled by requireAllPlatforms() inside each handler.
// ──────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// COMBINED (all-platforms) dashboard
// Aggregates across every platform the user owns. Gated to users
// who own all three platforms (or admins). Returns the SAME JSON
// shape as the single-platform endpoints above, so the frontend
// renders combined data with zero new field handling.
// ─────────────────────────────────────────────────────────────
const ALL_PLATFORMS = ['flipkart', 'meesho', 'amazon'];

function ownedPlatforms(user) {
  if (!user) return [];
  if (user.isAdmin) return [...ALL_PLATFORMS];
  const plans = Array.isArray(user.plans) ? user.plans : [];
  return ALL_PLATFORMS.filter((p) => plans.includes(p));
}

function ownsAll(user) {
  if (user && user.isAdmin) return true;
  const owned = ownedPlatforms(user);
  return ALL_PLATFORMS.every((p) => owned.includes(p));
}

// Gate: only all-three (or admin) users may hit combined routes.
function requireAllPlatforms(req, res, next) {
  if (!ownsAll(req.user)) {
    return res.status(403).json({ error: 'Combined view requires the all-platforms plan' });
  }
  next();
}

router.get('/combined/summary', requireAllPlatforms, async (req, res) => {
  try {
    const userId = req.user.id;
    const platforms = ownedPlatforms(req.user);
    const { start, end } = resolveRange(req.query);
    const dispatchFilter = { gte: start, lte: end };
    // platform IN [...] aggregates across every owned platform.
    const platformFilter = { in: platforms };

    const [totalOrders, matchedOrders, returnedOrders, returnIncomingOrders, pendingOrders, matchedRows, lossCount, profitCount] = await Promise.all([
      prisma.order.count({ where: { userId, platform: platformFilter, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, platform: platformFilter, isMatched: true, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, platform: platformFilter, isReturned: true, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, platform: platformFilter, returnIncoming: true, isReturned: false, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, platform: platformFilter, isMatched: false, dispatchDate: dispatchFilter } }),
      prisma.order.findMany({
        where: { userId, platform: platformFilter, isMatched: true, dispatchDate: dispatchFilter },
        select: { bankSettlement: true, purchasePrice: true, profit: true },
      }),
      prisma.order.count({
        where: { userId, platform: platformFilter, isMatched: true, dispatchDate: dispatchFilter, profit: { lt: 0 } },
      }),
      prisma.order.count({
        where: { userId, platform: platformFilter, isMatched: true, dispatchDate: dispatchFilter, profit: { gt: 0 } },
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
      platforms,               // extra: which platforms were summed (frontend may show this)
      combined: true,          // extra: flag so the UI can label the view
      rangeStart: start.toISOString(),
      rangeEnd:   end.toISOString(),
    });
  } catch (err) {
    console.error('Combined summary error:', err);
    res.status(500).json({ error: 'Failed to fetch combined summary' });
  }
});

router.get('/combined/chart/profit', requireAllPlatforms, async (req, res) => {
  try {
    const userId = req.user.id;
    const platforms = ownedPlatforms(req.user);
    const { start, end } = resolveRange(req.query);

    const orders = await prisma.order.findMany({
      where: {
        userId,
        platform: { in: platforms },
        isMatched: true,
        dispatchDate: { gte: start, lte: end },
      },
      select: { dispatchDate: true, bankSettlement: true, profit: true },
    });

    const map = new Map();
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
    console.error('Combined profit chart error:', err);
    res.status(500).json({ error: 'Failed to fetch combined chart' });
  }
});

router.get('/combined/chart/orders', requireAllPlatforms, async (req, res) => {
  try {
    const userId = req.user.id;
    const platforms = ownedPlatforms(req.user);
    const { start, end } = resolveRange(req.query);

    const orders = await prisma.order.findMany({
      where: { userId, platform: { in: platforms }, dispatchDate: { gte: start, lte: end } },
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
    console.error('Combined orders chart error:', err);
    res.status(500).json({ error: 'Failed to fetch combined chart' });
  }
});

router.get('/summary', platformMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.platform;
    const { start, end } = resolveRange(req.query);

    // Range filter on dispatchDate. Returned orders are INCLUDED so their
    // (possibly negative) profit hits the totals.
    const dispatchFilter = { gte: start, lte: end };

    const [totalOrders, matchedOrders, returnedOrders, returnIncomingOrders, pendingOrders, matchedRows, lossCount, profitCount] = await Promise.all([
      prisma.order.count({ where: { userId, platform, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, platform, isMatched: true, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, platform, isReturned: true, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, platform, returnIncoming: true, isReturned: false, dispatchDate: dispatchFilter } }),
      prisma.order.count({ where: { userId, platform, isMatched: false, dispatchDate: dispatchFilter } }),
      prisma.order.findMany({
        where: { userId, platform, isMatched: true, dispatchDate: dispatchFilter },
        select: { bankSettlement: true, purchasePrice: true, profit: true },
      }),
      prisma.order.count({
        where: { userId, platform, isMatched: true, dispatchDate: dispatchFilter, profit: { lt: 0 } },
      }),
      prisma.order.count({
        where: { userId, platform, isMatched: true, dispatchDate: dispatchFilter, profit: { gt: 0 } },
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

router.get('/chart/profit', platformMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.platform;
    const { start, end } = resolveRange(req.query);

    const orders = await prisma.order.findMany({
      where: {
        userId,
        platform,
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

router.get('/chart/orders', platformMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.platform;
    const { start, end } = resolveRange(req.query);

    const orders = await prisma.order.findMany({
      where: { userId, platform, dispatchDate: { gte: start, lte: end } },
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
