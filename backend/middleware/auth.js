const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { subscription: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const subscriptionMiddleware = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    // Admin always allowed
    if (user.isAdmin) return next();

    if (!user.isActive) {
      return res.status(403).json({
        error: 'Payment required to activate your account',
        code: 'PAYMENT_REQUIRED',
      });
    }
    const sub = user.subscription;
    if (!sub || sub.status !== 'active') {
      return res.status(403).json({
        error: 'Subscription is not active',
        code: 'PAYMENT_REQUIRED',
      });
    }
    if (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) < new Date()) {
      // Mark expired
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired' },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
      return res.status(403).json({
        error: 'Subscription expired',
        code: 'PAYMENT_REQUIRED',
      });
    }
    next();
  } catch (err) {
    console.error('Subscription middleware error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authMiddleware, subscriptionMiddleware, adminMiddleware };
