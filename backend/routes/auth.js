const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();

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
    const { ALL_PLATFORMS } = require('../utils/platforms');
    const user = await prisma.user.create({
      data: {
        email: lowerEmail,
        password: hashed,
        name: name || null,
        phone: phone || null,
        isAdmin,
        isActive: isAdmin, // admin auto-active
        // Phase 1: default new sellers to Flipkart. Plan selection UI comes in Phase 2.
        // Admins get all platforms.
        plans: isAdmin ? ALL_PLATFORMS : ['flipkart'],
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
        plans: user.plans || [],
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
        plans: user.plans || [],
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
      plans: u.plans || [],
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

// ---------- GOOGLE LOGIN ----------
// Frontend sends the Google credential (ID token) after the user clicks
// "Sign in with Google". We verify it with Google's API, find or create
// the user, and return a JWT — same as email/password login.
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

    // Verify the ID token with Google
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!googleRes.ok) return res.status(401).json({ error: 'Invalid Google token' });
    const payload = await googleRes.json();

    if (!payload.email || payload.email_verified !== 'true') {
      return res.status(401).json({ error: 'Google email not verified' });
    }

    const lowerEmail = payload.email.toLowerCase();
    let user = await prisma.user.findUnique({
      where: { email: lowerEmail },
      include: { subscription: true },
    });

    // If user doesn't exist, create them (same as signup, minus password)
    if (!user) {
      const isAdmin = lowerEmail === ADMIN_EMAIL;
      const { ALL_PLATFORMS } = require('../utils/platforms');
      user = await prisma.user.create({
        data: {
          email: lowerEmail,
          password: await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10), // random password (Google users don't use it)
          name: payload.name || null,
          isAdmin,
          isActive: isAdmin,
          plans: isAdmin ? ALL_PLATFORMS : ['flipkart'],
        },
      });

      // Create pending subscription
      if (!isAdmin) {
        await prisma.subscription.create({
          data: { userId: user.id, plan: 'starter', amount: 59900, status: 'pending' },
        });
      } else {
        await prisma.subscription.create({
          data: {
            userId: user.id, plan: 'starter', amount: 0, status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 100)),
          },
        });
      }

      // Re-fetch with subscription
      user = await prisma.user.findUnique({
        where: { email: lowerEmail },
        include: { subscription: true },
      });
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, phone: user.phone,
        isAdmin: user.isAdmin, isActive: user.isActive, plans: user.plans || [],
        subscription: user.subscription ? {
          status: user.subscription.status,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
        } : null,
      },
    });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ error: 'Google login failed' });
  }
});

// ---------- FORGOT PASSWORD ----------
// Sends a reset link via Resend. Token is a short-lived JWT (1 hour).
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const lowerEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: lowerEmail } });

    // Always return success (don't reveal whether email exists)
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    // Generate a 1-hour reset token
    const resetToken = jwt.sign(
      { userId: user.id, email: lowerEmail, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const siteUrl = process.env.SITE_URL || 'https://profx.website';
    const resetLink = `${siteUrl}/reset-password?token=${resetToken}`;

    // Send email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'ProfX <noreply@profx.website>',
          to: [lowerEmail],
          subject: 'ProfX — Reset your password',
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
              <h2 style="margin: 0 0 16px;">Reset your password</h2>
              <p style="color: #475569; line-height: 1.6;">
                Click the button below to set a new password. This link expires in 1 hour.
              </p>
              <a href="${resetLink}" style="display: inline-block; margin: 20px 0; padding: 12px 24px; background: linear-gradient(135deg, #2563eb, #059669); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Reset Password →
              </a>
              <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
                If you didn't request this, ignore this email. Your password won't change.
              </p>
            </div>
          `,
        }),
      });
    } else {
      console.warn('RESEND_API_KEY not set — reset email not sent. Link:', resetLink);
    }

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process reset request' });
  }
});

// ---------- RESET PASSWORD ----------
// Verifies the reset token and updates the password.
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    res.json({ success: true, message: 'Password updated. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
