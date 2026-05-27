const express = require('express');
const router = express.Router();
const { sendContactFormEmail } = require('../utils/email');

// In-memory rate limiter: max 5 submissions per IP per hour.
// Restarts when the server restarts, which is fine — Render restarts often,
// and we just want to stop accidental spam, not be a fortress.
const submissions = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip) {
  const now = Date.now();
  const arr = submissions.get(ip) || [];
  const recent = arr.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  submissions.set(ip, recent);
  return false;
}

// POST /api/contact
// Body: { name, email, subject, message }
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';

    // Validation
    if (!email || !message) {
      return res.status(400).json({ error: 'Email and message are required.' });
    }
    if (typeof message !== 'string' || message.trim().length < 3) {
      return res.status(400).json({ error: 'Please write a longer message.' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message is too long (max 5000 characters).' });
    }
    // Basic email shape check (not exhaustive — Resend will reject bad ones anyway)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Rate limit
    if (rateLimited(ip)) {
      return res.status(429).json({
        error: 'Too many submissions. Please try again in an hour, or email us directly at support.profx@gmail.com.',
      });
    }

    // Send
    const result = await sendContactFormEmail({ name, email, subject, message });
    if (!result) {
      // Email service unavailable (e.g. RESEND_API_KEY missing or Resend down)
      return res.status(503).json({
        error: 'We could not send your message right now. Please email us directly at support.profx@gmail.com.',
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return res.status(500).json({
      error: 'Something went wrong. Please email us directly at support.profx@gmail.com.',
    });
  }
});

module.exports = router;
