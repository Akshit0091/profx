// routes/admin.js - Admin Panel API

const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { sendPaymentFailedEmail } = require("../utils/email");

const prisma = new PrismaClient();

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

// ─── GET /api/admin/dashboard ─────────────────────────────────────────────────
// Admin overview - all key metrics
router.get("/dashboard", async (req, res) => {
  try {
    const [totalSellers, activeSellers, pendingSellers, expiredSellers] = await Promise.all([
      prisma.user.count({ where: { isAdmin: false } }),
      prisma.user.count({ where: { isAdmin: false, isActive: true } }),
      prisma.user.count({ where: { isAdmin: false, isActive: false, subscription: { status: "pending" } } }),
      prisma.user.count({ where: { isAdmin: false, isActive: false, subscription: { status: "expired" } } }),
    ]);

    // Monthly revenue (active sellers × ₹599)
    const monthlyRevenue = activeSellers * 599;

    // Recent signups (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSignups = await prisma.user.count({
      where: { isAdmin: false, createdAt: { gte: thirtyDaysAgo } },
    });

    res.json({
      success: true,
      data: {
        totalSellers,
        activeSellers,
        pendingSellers,
        expiredSellers,
        monthlyRevenue,
        recentSignups,
      },
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
});

// ─── GET /api/admin/sellers ───────────────────────────────────────────────────
// List all sellers with their subscription status
router.get("/sellers", async (req, res) => {
  try {
    const { search, status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const where = { isAdmin: false };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    const [sellers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          subscription: true,
          _count: { select: { orders: true, skus: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    // Remove password from response
    const safe = sellers.map(({ password, ...s }) => s);

    res.json({
      success: true,
      data: safe,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch sellers" });
  }
});

// ─── POST /api/admin/sellers/:id/activate ────────────────────────────────────
// Manually activate a seller (e.g. after UPI payment)
router.post("/sellers/:id/activate", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { months = 1, paymentNote = "Manual activation by admin" } = req.body;

    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + months);

    await prisma.user.update({ where: { id }, data: { isActive: true } });

    await prisma.subscription.upsert({
      where: { userId: id },
      update: {
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        razorpayPaymentId: paymentNote,
      },
      create: {
        userId: id,
        status: "active",
        plan: "starter",
        amount: 59900,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        razorpayPaymentId: paymentNote,
      },
    });

    res.json({ success: true, message: `Seller activated for ${months} month(s)` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Activation failed" });
  }
});

// ─── POST /api/admin/sellers/:id/deactivate ───────────────────────────────────
// Manually deactivate a seller
router.post("/sellers/:id/deactivate", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    await prisma.user.update({ where: { id }, data: { isActive: false } });
    await prisma.subscription.update({
      where: { userId: id },
      data: { status: "expired" },
    });

    // Optionally send email
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) await sendPaymentFailedEmail(user.email, user.name);

    res.json({ success: true, message: "Seller deactivated" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Deactivation failed" });
  }
});

// ─── DELETE /api/admin/sellers/:id ───────────────────────────────────────────
// Delete a seller and all their data
router.delete("/sellers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.user.delete({ where: { id } }); // cascades to orders, skus, subscription
    res.json({ success: true, message: "Seller deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Delete failed" });
  }
});

// ─── GET /api/admin/sellers/:id/orders ───────────────────────────────────────
// View a specific seller's orders
router.get("/sellers/:id/orders", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const orders = await prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
});

module.exports = router;
