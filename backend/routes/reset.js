const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware, platformMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authMiddleware, subscriptionMiddleware, platformMiddleware);

// Wipe a user's orders + SKUs + settlement entries FOR THE CURRENT PLATFORM only.
// (Their account, subscription, login, and other platforms' data stay intact.)
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.platform;
    const [orders, skus, entries] = await prisma.$transaction([
      prisma.order.deleteMany({ where: { userId, platform } }),
      prisma.sKU.deleteMany({ where: { userId, platform } }),
      prisma.settlementEntry.deleteMany({ where: { userId, platform } }),
    ]);
    res.json({
      success: true,
      platform,
      ordersDeleted: orders.count,
      skusDeleted: skus.count,
      settlementEntriesDeleted: entries.count,
    });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Failed to reset data' });
  }
});

module.exports = router;
