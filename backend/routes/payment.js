const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const {
  sendWelcomeEmail,
  sendPaymentReceipt,
  sendPaymentFailedEmail,
  notifyAdminNewSeller,
} = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

const AMOUNT_PAISE = 59900; // ₹599

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// Create Razorpay order for one-month payment
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    if (!razorpay) return res.status(500).json({ error: 'Razorpay is not configured' });

    const order = await razorpay.orders.create({
      amount: AMOUNT_PAISE,
      currency: 'INR',
      receipt: `profx_${req.user.id.slice(0, 10)}_${Date.now()}`,
      notes: { userId: req.user.id, email: req.user.email },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      user: {
        email: req.user.email,
        name: req.user.name || '',
        phone: req.user.phone || '',
      },
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify Razorpay payment signature and activate the user
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment fields' });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(body)
      .digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);

    // Ensure subscription row exists
    let sub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    if (!sub) {
      sub = await prisma.subscription.create({
        data: { userId: req.user.id, plan: 'starter', amount: AMOUNT_PAISE, status: 'pending' },
      });
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        razorpayPaymentId: razorpay_payment_id,
        razorpayCustomerId: razorpay_order_id, // store order ref here
        status: 'active',
        amount: AMOUNT_PAISE,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { isActive: true },
    });

    // Fire-and-forget emails (don't block response)
    sendPaymentReceipt(updated, {
      amount: AMOUNT_PAISE,
      paymentId: razorpay_payment_id,
      nextBilling: end,
    });
    sendWelcomeEmail(updated);
    notifyAdminNewSeller(updated);

    res.json({ success: true, message: 'Payment verified, account activated' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Razorpay webhook (configure in Razorpay dashboard with RAZORPAY_WEBHOOK_SECRET)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(200).json({ ok: true });

    const signature = req.headers['x-razorpay-signature'];
    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (signature !== expected) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(req.body.toString('utf8'));
    const event = payload.event;

    if (event === 'payment.failed') {
      const email = payload.payload?.payment?.entity?.email;
      if (email) {
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (user) sendPaymentFailedEmail(user);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook failed' });
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
  res.json({
    isActive: req.user.isActive,
    subscription: sub,
  });
});

module.exports = router;
