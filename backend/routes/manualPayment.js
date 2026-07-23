const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const {
  sendWelcomeEmail,
  sendPaymentReceipt,
  notifyAdminManualPayment,
  sendManualPaymentRejected,
} = require('../utils/email');
const { ALL_PLATFORMS, PRICE_SINGLE, PRICE_ALL, sanitizePlans } = require('../utils/platforms');

const router = express.Router();
const prisma = new PrismaClient();

// Same selection logic as the Razorpay route, so both paths grant identically.
function resolvePlanSelection(body) {
  const planType = (body && body.planType) === 'all' ? 'all' : 'single';
  if (planType === 'all') {
    return { planType: 'all', platforms: [...ALL_PLATFORMS], amount: PRICE_ALL };
  }
  const platform = String((body && body.platform) || 'flipkart').toLowerCase();
  if (!ALL_PLATFORMS.includes(platform)) return null;
  return { planType: 'single', platforms: [platform], amount: PRICE_SINGLE };
}

// ---------------- SELLER ENDPOINTS ----------------
router.use('/my', authMiddleware);
router.use('/submit', authMiddleware);

// Current user's latest request — drives the "awaiting verification" state.
router.get('/my', async (req, res) => {
  try {
    const request = await prisma.paymentRequest.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ request });
  } catch (err) {
    console.error('Fetch my payment request error:', err);
    res.status(500).json({ error: 'Failed to load payment status' });
  }
});

// Seller submits a manual payment for review.
// Body: { planType, platform?, upiRef, payerNote? }
router.post('/submit', async (req, res) => {
  try {
    const selection = resolvePlanSelection(req.body);
    if (!selection) return res.status(400).json({ error: 'Invalid plan selection' });

    const upiRef = String(req.body?.upiRef || '').trim();
    if (upiRef.length < 4) {
      return res.status(400).json({ error: 'Please enter the UPI reference / UTR number from your payment' });
    }

    // Don't let a seller stack duplicate pending requests.
    const existingPending = await prisma.paymentRequest.findFirst({
      where: { userId: req.user.id, status: 'pending' },
    });
    if (existingPending) {
      return res.status(409).json({
        error: 'You already have a payment awaiting verification.',
        request: existingPending,
      });
    }

    const request = await prisma.paymentRequest.create({
      data: {
        userId: req.user.id,
        planType: selection.planType,
        platforms: selection.platforms,
        amount: selection.amount,
        upiRef,
        payerNote: String(req.body?.payerNote || '').slice(0, 500) || null,
      },
    });

    // Fire-and-forget: tell the admin there's something to verify.
    notifyAdminManualPayment(req.user, request);

    res.json({ success: true, request });
  } catch (err) {
    console.error('Submit payment request error:', err);
    res.status(500).json({ error: 'Failed to submit payment' });
  }
});

// ---------------- ADMIN ENDPOINTS ----------------
router.use('/admin', authMiddleware, adminMiddleware);

// List requests, newest first. ?status=pending|approved|rejected|all
router.get('/admin/requests', async (req, res) => {
  try {
    const status = String(req.query.status || 'pending');
    const where = status === 'all' ? {} : { status };
    const requests = await prisma.paymentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, email: true, name: true, phone: true, isActive: true, plans: true } },
      },
    });
    const pendingCount = await prisma.paymentRequest.count({ where: { status: 'pending' } });
    res.json({ requests, pendingCount });
  } catch (err) {
    console.error('List payment requests error:', err);
    res.status(500).json({ error: 'Failed to load payment requests' });
  }
});

// Approve a request — activates the seller using the SAME logic as Razorpay's
// /verify endpoint, including merging granted platforms into user.plans.
// Body: { months?: 1 }
router.post('/admin/requests/:id/approve', async (req, res) => {
  try {
    const months = Math.max(1, Math.min(24, parseInt(req.body?.months, 10) || 1));

    const request = await prisma.paymentRequest.findUnique({
      where: { id: req.params.id },
      include: { user: { include: { subscription: true } } },
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    const user = request.user;
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + months);

    // Subscription: create or update, mirroring /verify.
    let sub = user.subscription;
    if (!sub) {
      sub = await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: request.planType,
          amount: request.amount,
          status: 'pending',
        },
      });
    }
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        razorpayPaymentId: `MANUAL-${request.upiRef}`,
        plan: request.planType,
        status: 'active',
        amount: request.amount,
        currentPeriodStart: now,
        currentPeriodEnd: end,
      },
    });

    // CRITICAL: merge platforms into user.plans. Without this the account is
    // active but has no marketplaces unlocked.
    const existingPlans = Array.isArray(user.plans) ? user.plans : [];
    const mergedPlans = sanitizePlans([...existingPlans, ...request.platforms]);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true, plans: mergedPlans },
    });

    await prisma.paymentRequest.update({
      where: { id: request.id },
      data: {
        status: 'approved',
        reviewedAt: now,
        adminNote: String(req.body?.adminNote || '').slice(0, 500) || null,
      },
    });

    // Fire-and-forget emails, same as the Razorpay path.
    sendPaymentReceipt(updated, {
      amount: request.amount,
      paymentId: `UPI ${request.upiRef}`,
      nextBilling: end,
    });
    sendWelcomeEmail(updated);

    res.json({ success: true, plans: mergedPlans, currentPeriodEnd: end });
  } catch (err) {
    console.error('Approve payment request error:', err);
    res.status(500).json({ error: 'Failed to approve payment' });
  }
});

// Reject a request. Body: { adminNote? }
router.post('/admin/requests/:id/reject', async (req, res) => {
  try {
    const request = await prisma.paymentRequest.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    const adminNote = String(req.body?.adminNote || '').slice(0, 500) || null;
    await prisma.paymentRequest.update({
      where: { id: request.id },
      data: { status: 'rejected', reviewedAt: new Date(), adminNote },
    });

    sendManualPaymentRejected(request.user, adminNote);

    res.json({ success: true });
  } catch (err) {
    console.error('Reject payment request error:', err);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

module.exports = router;
