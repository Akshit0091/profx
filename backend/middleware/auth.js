// middleware/auth.js - JWT + Subscription check

const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ─── Basic JWT auth ───────────────────────────────────────────────────────────
const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token provided" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.isAdmin = decoded.isAdmin;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

// ─── Active subscription check ────────────────────────────────────────────────
// Blocks access if subscription is not active
const subscriptionMiddleware = async (req, res, next) => {
  try {
    // Admins bypass subscription check
    if (req.isAdmin) return next();

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { subscription: true },
    });

    if (!user) return res.status(401).json({ success: false, message: "User not found" });

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account not active. Please complete payment.",
        code: "PAYMENT_REQUIRED",
      });
    }

    // Check subscription status
    const sub = user.subscription;
    if (!sub || sub.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Subscription expired or not found. Please renew.",
        code: "SUBSCRIPTION_EXPIRED",
      });
    }

    // Check if subscription period has ended
    if (sub.currentPeriodEnd && new Date() > new Date(sub.currentPeriodEnd)) {
      // Mark as expired
      await prisma.subscription.update({
        where: { userId: req.userId },
        data: { status: "expired" },
      });
      await prisma.user.update({
        where: { id: req.userId },
        data: { isActive: false },
      });
      return res.status(403).json({
        success: false,
        message: "Subscription expired. Please renew.",
        code: "SUBSCRIPTION_EXPIRED",
      });
    }

    next();
  } catch (err) {
    console.error("Subscription check error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── Admin only middleware ─────────────────────────────────────────────────────
const adminMiddleware = (req, res, next) => {
  if (!req.isAdmin) {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
};

module.exports = { authMiddleware, subscriptionMiddleware, adminMiddleware };
