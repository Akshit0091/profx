const express = require('express');
const multer = require('multer');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');
const { ALL_PLATFORMS } = require('../utils/platforms');

const router = express.Router();

// Nano Banana 2.1 accepts up to 14 reference images in one request.
const MAX_REFS = 14;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_REFS },
});

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 180000;

// Keyed by what the client sends, so the real model ids stay server-side and
// can be swapped when Google ships a new one.
const MODELS = {
  standard: 'gemini-nano-banana-2.1',
  premium: 'gemini-3-pro-image',
};
const SIZES = ['1K', '2K', '4K'];
const RATIOS = ['1:1', '4:5', '3:4', '5:4', '16:9', '9:16'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Same gate as Image Tools. It matters more here: every call spends real money
// on the account that owns GEMINI_API_KEY. Change this to `user.isAdmin` alone
// if generation should stay in-house.
const planGate = (req, res, next) => {
  const user = req.user;
  if (user && user.isAdmin) return next();
  const plans = Array.isArray(user?.plans) ? user.plans : [];
  if (!ALL_PLATFORMS.every((p) => plans.includes(p))) {
    return res.status(403).json({
      error: 'Product Images is available on the all-platform plan. Upgrade to unlock it.',
      code: 'PLAN_UPGRADE_REQUIRED',
    });
  }
  next();
};

router.use(authMiddleware, subscriptionMiddleware, planGate);

/** Pull the first image out of a response, whatever shape it arrives in. */
function findImage(node, depth = 0) {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findImage(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;

  if (typeof node.data === 'string' && node.data.length > 100) {
    return { data: node.data, mimeType: node.mime_type || node.mimeType || 'image/png' };
  }
  if (node.inlineData && typeof node.inlineData.data === 'string') {
    return { data: node.inlineData.data, mimeType: node.inlineData.mimeType || 'image/png' };
  }
  if (node.inline_data && typeof node.inline_data.data === 'string') {
    return { data: node.inline_data.data, mimeType: node.inline_data.mime_type || 'image/png' };
  }

  for (const key of Object.keys(node)) {
    const hit = findImage(node[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Any text the model returned — usually the reason it declined to draw. */
function findText(node, out = [], depth = 0) {
  if (!node || depth > 8) return out;
  if (Array.isArray(node)) {
    node.forEach((item) => findText(item, out, depth + 1));
    return out;
  }
  if (typeof node !== 'object') return out;
  if (typeof node.text === 'string' && node.text.trim()) out.push(node.text.trim());
  Object.keys(node).forEach((key) => findText(node[key], out, depth + 1));
  return out;
}

router.get('/config', (req, res) => {
  res.json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    maxRefs: MAX_REFS,
    models: Object.keys(MODELS),
    sizes: SIZES,
    ratios: RATIOS,
  });
});

/**
 * POST /api/image-gen/generate
 * multipart/form-data — field "images" (0..14 reference photos), plus
 * prompt, model, imageSize, aspectRatio.
 */
router.post('/generate', upload.array('images', MAX_REFS), async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Image generation is not configured on the server. GEMINI_API_KEY is missing.',
      code: 'NOT_CONFIGURED',
    });
  }

  const prompt = String(req.body.prompt || '').trim();
  if (prompt.length < 20) {
    return res.status(400).json({ error: 'Add the full prompt describing the image you want.' });
  }

  const model = MODELS[req.body.model] || MODELS.standard;
  const imageSize = SIZES.includes(req.body.imageSize) ? req.body.imageSize : '2K';
  const aspectRatio = RATIOS.includes(req.body.aspectRatio) ? req.body.aspectRatio : '1:1';

  const files = req.files || [];
  const bad = files.find((f) => !ALLOWED_MIME.includes(f.mimetype));
  if (bad) {
    return res.status(400).json({ error: `${bad.originalname} is not a JPG, PNG or WebP image.` });
  }

  const input = [
    { type: 'text', text: prompt },
    ...files.map((f) => ({
      type: 'image',
      mime_type: f.mimetype,
      data: f.buffer.toString('base64'),
    })),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const started = Date.now();
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model,
        input,
        response_format: {
          // JPEG is the only output type the endpoint accepts, and it is what
          // the marketplaces want for product shots anyway.
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: aspectRatio,
          image_size: imageSize,
        },
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload = null;
    try { payload = JSON.parse(raw); } catch (e) { /* non-JSON error body */ }

    if (!response.ok) {
      const message = payload?.error?.message || raw.slice(0, 300) || 'Unknown error';
      console.error('[image-gen] Gemini error', response.status, message);
      // The key and quota problems are the ones worth naming precisely.
      if (response.status === 400 && /API key/i.test(message)) {
        return res.status(502).json({ error: 'The Gemini API key was rejected. Check GEMINI_API_KEY.' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'Gemini rate limit or quota reached. Try again shortly.' });
      }
      // Naming a brand and asking for its logo to be removed reliably trips
      // this. Describing the area and asking for plain cover background there
      // does not, so point that out rather than just echoing Google.
      if (/safety|blocked|policy/i.test(message)) {
        return res.status(422).json({
          error: 'Gemini blocked this prompt on safety grounds. If it names a brand and asks to '
            + 'remove its logo, reword it: describe where the mark sits and ask for plain cover '
            + 'background there instead. The built-in template is already worded that way.',
        });
      }
      return res.status(502).json({ error: `Gemini refused the request (${response.status}): ${message}` });
    }

    const image = findImage(payload);
    if (!image) {
      const said = findText(payload).join(' ').slice(0, 400);
      console.error('[image-gen] no image in response', raw.slice(0, 500));
      return res.status(502).json({
        error: said
          ? `No image came back. The model said: ${said}`
          : 'No image came back from Gemini. Try rewording the prompt.',
      });
    }

    res.json({
      image: image.data,
      mimeType: image.mimeType,
      model,
      imageSize,
      aspectRatio,
      refs: files.length,
      ms: Date.now() - started,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Gemini took too long to answer. Try a smaller image size.' });
    }
    console.error('[image-gen] request failed', err);
    res.status(500).json({ error: 'Image generation failed. Try again.' });
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
