// routes/payment.js - Razorpay Integration

const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware } = require("../middleware/auth");
const { sendWelcomeEmail, sendPaymentReceiptEmail, sendPaymentFailedEmail } = require("../utils/email");

const prisma = new PrismaClient();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLAN_AMOUNT = 59900; // ₹599 in paise

// ─── POST /api/payment/create-order ───────────────────────────────────────────
// Creates a Razorpay order for ₹599
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { subscription: true },
    });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isAdmin) return res.status(400).json({ success: false, message: "Admin accounts don't need payment" });

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: PLAN_AMOUNT,
      currency: "INR",
      receipt: `profx_${user.id}_${Date.now()}`,
      notes: {
        userId: String(user.id),
        email: user.email,
        plan: "starter",
      },
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      prefill: {
        email: user.email,
        name: user.name || "",
        contact: user.phone || "",
      },
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, message: "Failed to create payment order" });
  }
});

// ─── POST /api/payment/verify ─────────────────────────────────────────────────
// Verifies Razorpay payment signature and activates account
router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // Payment verified! Activate the user
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1); // 1 month from now

    await prisma.user.update({
      where: { id: req.userId },
      data: { isActive: true },
    });

    await prisma.subscription.upsert({
      where: { userId: req.userId },
      update: {
        status: "active",
        razorpayPaymentId: razorpay_payment_id,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      create: {
        userId: req.userId,
        status: "active",
        razorpayPaymentId: razorpay_payment_id,
        plan: "starter",
        amount: PLAN_AMOUNT,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // Send emails
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    await sendWelcomeEmail(user.email, user.name);
    await sendPaymentReceiptEmail(user.email, user.name, PLAN_AMOUNT, razorpay_payment_id);

    // Notify admin
    await sendPaymentReceiptEmail(
      process.env.ADMIN_EMAIL,
      "Admin",
      PLAN_AMOUNT,
      `New seller: ${user.email} | ${razorpay_payment_id}`
    );

    res.json({
      success: true,
      message: "Payment verified! Your account is now active.",
    });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ success: false, message: "Payment verification error" });
  }
});

// ─── POST /api/payment/webhook ────────────────────────────────────────────────
// Razorpay webhook for subscription renewals and failures
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body;

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature" });
    }

    const event = JSON.parse(body);
    console.log("Webhook event:", event.event);

    // Handle payment failed
    if (event.event === "payment.failed") {
      const email = event.payload?.payment?.entity?.email;
      if (email) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
          await prisma.subscription.update({ where: { userId: user.id }, data: { status: "expired" } });
          await sendPaymentFailedEmail(email, user.name);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ success: false });
  }
});

// ─── GET /api/payment/status ──────────────────────────────────────────────────
router.get("/status", authMiddleware, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId: req.userId } });
    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    res.json({
      success: true,
      data: {
        isActive: user?.isActive,
        subscription: sub,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to get status" });
  }
});

module.exports = router;
