// routes/dashboard.js
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { authMiddleware, subscriptionMiddleware } = require("../middleware/auth");

const prisma = new PrismaClient();
router.use(authMiddleware);

// ─── GET /api/dashboard/summary ───────────────────────────────────────────────
router.get("/summary", async (req, res) => {
  try {
    const userId = req.userId;

    const [totalOrders, matchedOrders, pendingOrders, returnedOrders, lossOrders] = await Promise.all([
      prisma.order.count({ where: { userId } }),
      prisma.order.count({ where: { userId, isMatched: true, isReturned: false } }),
      prisma.order.count({ where: { userId, isMatched: false, isReturned: false } }),
      prisma.order.count({ where: { userId, isReturned: true } }),
      prisma.order.count({ where: { userId, isMatched: true, isReturned: false, profit: { lt: 0 } } }),
    ]);

    // Aggregates — exclude returned orders from revenue/profit
    const agg = await prisma.order.aggregate({
      where: { userId, isMatched: true, isReturned: false },
      _sum: { bankSettlement: true, purchasePrice: true, profit: true },
      _avg: { profit: true },
    });

    res.json({
      success: true,
      data: {
        totalOrders,
        matchedOrders,
        pendingOrders,
        returnedOrders,
        lossOrders,
        totalRevenue: agg._sum.bankSettlement || 0,
        totalCost:    agg._sum.purchasePrice  || 0,
        totalProfit:  agg._sum.profit         || 0,
        avgProfit:    agg._avg.profit         || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load summary" });
  }
});

// ─── GET /api/dashboard/chart/profit ──────────────────────────────────────────
router.get("/chart/profit", async (req, res) => {
  try {
    const userId = req.userId;
    const days   = parseInt(req.query.days || "30");
    const since  = new Date();
    since.setDate(since.getDate() - days);

    const orders = await prisma.order.findMany({
      where: { userId, isMatched: true, isReturned: false, paymentDate: { gte: since }, profit: { not: null } },
      select: { paymentDate: true, profit: true, bankSettlement: true },
      orderBy: { paymentDate: "asc" },
    });

    const grouped = {};
    for (const o of orders) {
      const date = o.paymentDate?.toISOString().split("T")[0];
      if (!date) continue;
      if (!grouped[date]) grouped[date] = { date, profit: 0, revenue: 0, orders: 0 };
      grouped[date].profit  += o.profit || 0;
      grouped[date].revenue += o.bankSettlement || 0;
      grouped[date].orders  += 1;
    }

    res.json({ success: true, data: Object.values(grouped) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load chart" });
  }
});

// ─── GET /api/dashboard/chart/orders ──────────────────────────────────────────
router.get("/chart/orders", async (req, res) => {
  try {
    const userId = req.userId;
    const days   = parseInt(req.query.days || "30");
    const since  = new Date();
    since.setDate(since.getDate() - days);

    const orders = await prisma.order.findMany({
      where: { userId, dispatchDate: { gte: since } },
      select: { dispatchDate: true, isMatched: true, isReturned: true },
      orderBy: { dispatchDate: "asc" },
    });

    const grouped = {};
    for (const o of orders) {
      const date = o.dispatchDate?.toISOString().split("T")[0];
      if (!date) continue;
      if (!grouped[date]) grouped[date] = { date, total: 0, matched: 0, returned: 0 };
      grouped[date].total    += 1;
      if (o.isMatched && !o.isReturned) grouped[date].matched   += 1;
      if (o.isReturned)                  grouped[date].returned  += 1;
    }

    res.json({ success: true, data: Object.values(grouped) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load chart" });
  }
});

module.exports = router;
