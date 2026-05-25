const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware, subscriptionMiddleware);

// Wipe a user's own orders + SKUs (their account, subscription, and login stay)
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const [orders, skus] = await prisma.$transaction([
      prisma.order.deleteMany({ where: { userId } }),
      prisma.sKU.deleteMany({ where: { userId } }),
    ]);
    res.json({
      success: true,
      ordersDeleted: orders.count,
      skusDeleted: skus.count,
    });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Failed to reset data' });
  }
});

module.exports = router;
