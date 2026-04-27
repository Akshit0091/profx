// routes/reset.js - Clear all orders for this user (dev utility)
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { authMiddleware } = require("../middleware/auth");

const prisma = new PrismaClient();
router.use(authMiddleware);

// DELETE /api/reset/orders - wipe all orders for logged in user
router.delete("/orders", async (req, res) => {
  try {
    const result = await prisma.order.deleteMany({ where: { userId: req.userId } });
    res.json({ success: true, message: `Deleted ${result.count} orders` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
