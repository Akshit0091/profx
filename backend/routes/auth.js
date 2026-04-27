// routes/auth.js - ProfX Auth

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const generateToken = (userId, isAdmin) =>
  jwt.sign({ userId, isAdmin }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
// Creates account in "pending" state - activated after payment
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password required" });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({ success: false, message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);

    // Check if this is the admin email
    const isAdmin = email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();

    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: name || null,
        phone: phone || null,
        isAdmin,
        isActive: isAdmin, // Admin is always active, sellers need payment
      },
    });

    // Create pending subscription record for non-admins
    if (!isAdmin) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: "pending",
          plan: "starter",
          amount: 59900,
        },
      });
    }

    const token = generateToken(user.id, user.isAdmin);

    res.status(201).json({
      success: true,
      message: isAdmin ? "Admin account created" : "Account created. Please complete payment to activate.",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password required" });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { subscription: true },
    });
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ success: false, message: "Invalid email or password" });

    const token = generateToken(user.id, user.isAdmin);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        subscription: user.subscription ? {
          status: user.subscription.status,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
        } : null,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { subscription: true },
    });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        subscription: user.subscription ? {
          status: user.subscription.status,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
          plan: user.subscription.plan,
        } : null,
      },
    });
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

module.exports = router;
