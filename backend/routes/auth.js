const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'pathakakshit17@gmail.com').toLowerCase();

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const lowerEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: lowerEmail } });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const isAdmin = lowerEmail === ADMIN_EMAIL;
    const user = await prisma.user.create({
      data: {
        email: lowerEmail,
        password: hashed,
        name: name || null,
        phone: phone || null,
        isAdmin,
        isActive: isAdmin, // admin auto-active
      },
    });

    // Create pending subscription for non-admins
    if (!isAdmin) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: 'starter',
          amount: 59900,
          status: 'pending',
        },
      });
    } else {
      // Admin gets a perpetual active sub (for middleware consistency, though admin bypasses)
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: 'starter',
          amount: 0,
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 100)),
        },
      });
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const lowerEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: lowerEmail },
      include: { subscription: true },
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        subscription: user.subscription
          ? {
              status: user.subscription.status,
              currentPeriodEnd: user.subscription.currentPeriodEnd,
            }
          : null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      isAdmin: u.isAdmin,
      isActive: u.isActive,
      subscription: u.subscription
        ? {
            status: u.subscription.status,
            currentPeriodEnd: u.subscription.currentPeriodEnd,
            currentPeriodStart: u.subscription.currentPeriodStart,
            plan: u.subscription.plan,
            amount: u.subscription.amount,
          }
        : null,
    },
  });
});

module.exports = router;
