const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { sendDeactivationEmail } = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware, adminMiddleware);

router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 30);

    const [totalSellers, activeSellers, pendingSellers, expiredSellers, recentSignups] = await Promise.all([
      prisma.user.count({ where: { isAdmin: false } }),
      prisma.user.count({ where: { isAdmin: false, isActive: true } }),
      prisma.user.count({ where: { isAdmin: false, isActive: false } }),
      prisma.subscription.count({ where: { status: 'expired' } }),
      prisma.user.findMany({
        where: { isAdmin: false, createdAt: { gte: monthAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { subscription: true },
      }),
    ]);

    // Monthly revenue: sum of active subs that started in last 30 days
    const recentActiveSubs = await prisma.subscription.findMany({
      where: {
        status: 'active',
        currentPeriodStart: { gte: monthAgo },
      },
      select: { amount: true },
    });
    const monthlyRevenue = recentActiveSubs.reduce((s, x) => s + (x.amount || 0), 0) / 100; // in INR

    res.json({
      totalSellers,
      activeSellers,
      pendingSellers,
      expiredSellers,
      monthlyRevenue,
      recentSignups: recentSignups.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt,
        isActive: u.isActive,
        subscription: u.subscription,
      })),
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch admin dashboard' });
  }
});

router.get('/sellers', async (req, res) => {
  try {
    const { search = '', status = 'all', page = '1', limit = '50' } = req.query;
    const where = { isAdmin: false };
    if (search) {
      where.OR = [
        { email: { contains: String(search), mode: 'insensitive' } },
        { name:  { contains: String(search), mode: 'insensitive' } },
      ];
    }
    if (status === 'active')  where.isActive = true;
    if (status === 'pending') where.isActive = false;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * take;

    const [total, sellers] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: {
          subscription: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    res.json({
      sellers: sellers.map((s) => ({
        id: s.id,
        email: s.email,
        name: s.name,
        phone: s.phone,
        isActive: s.isActive,
        createdAt: s.createdAt,
        subscription: s.subscription,
        orderCount: s._count.orders,
      })),
      pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    console.error('Sellers list error:', err);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});

router.post('/sellers/:id/activate', async (req, res) => {
  try {
    const months = Math.max(1, Math.min(24, parseInt(req.body?.months, 10) || 1));

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { subscription: true },
    });
    if (!user) return res.status(404).json({ error: 'Seller not found' });

    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + months);

    if (user.subscription) {
      await prisma.subscription.update({
        where: { id: user.subscription.id },
        data: {
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: 'starter',
          amount: 59900 * months,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
      });
    }
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });

    res.json({ success: true, months, currentPeriodEnd: end });
  } catch (err) {
    console.error('Activate seller error:', err);
    res.status(500).json({ error: 'Failed to activate seller' });
  }
});

router.post('/sellers/:id/deactivate', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { subscription: true },
    });
    if (!user) return res.status(404).json({ error: 'Seller not found' });

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    if (user.subscription) {
      await prisma.subscription.update({
        where: { id: user.subscription.id },
        data: { status: 'cancelled' },
      });
    }
    sendDeactivationEmail(user);
    res.json({ success: true });
  } catch (err) {
    console.error('Deactivate seller error:', err);
    res.status(500).json({ error: 'Failed to deactivate seller' });
  }
});

router.delete('/sellers/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Seller not found' });
    if (user.isAdmin) return res.status(400).json({ error: 'Cannot delete an admin' });

    await prisma.user.delete({ where: { id: user.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete seller error:', err);
    res.status(500).json({ error: 'Failed to delete seller' });
  }
});

module.exports = router;
