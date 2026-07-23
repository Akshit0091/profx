const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');
const { normalizeImage, DEFAULTS } = require('../utils/imageProcessor');

const router = express.Router();

// Memory storage only — nothing is written to disk, which also sidesteps
// Render's ephemeral filesystem being wiped on redeploy.
const MAX_FILES = 30;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: MAX_FILES },
});

// Cross-platform tool — no platformMiddleware.
router.use(authMiddleware, subscriptionMiddleware);

// ---------- SETTINGS ----------
router.get('/defaults', (req, res) => {
  res.json({ defaults: DEFAULTS, maxFiles: MAX_FILES });
});

// ---------- PROCESS A BATCH ----------
// Accepts up to MAX_FILES images under field "images".
// Returns a ZIP of the normalized JPEGs. Nothing is stored server-side.
router.post('/process', upload.array('images', MAX_FILES), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    // Optional per-request overrides from the UI.
    const overrides = {};
    const num = (v) => (v === undefined || v === '' ? undefined : Number(v));
    if (num(req.body.canvas)) overrides.canvas = num(req.body.canvas);
    if (num(req.body.targetAreaPct)) overrides.targetAreaPct = num(req.body.targetAreaPct);
    if (num(req.body.kbMin)) overrides.kbMin = num(req.body.kbMin);
    if (num(req.body.kbMax)) overrides.kbMax = num(req.body.kbMax);
    if (num(req.body.qualityFloor)) overrides.qualityFloor = num(req.body.qualityFloor);

    // Process everything BEFORE streaming, so failure counts can go in headers
    // (headers can't be set once the response body has started).
    // Sequential, not parallel — keeps peak memory inside a 512MB dyno.
    const processed = [];
    const failed = [];

    for (const f of files) {
      const base = String(f.originalname || 'image').replace(/\.[^.]+$/, '');
      try {
        const out = await normalizeImage(f.buffer, overrides);
        processed.push({ name: `${base}.jpg`, buffer: out.buffer });
      } catch (err) {
        console.error(`Image failed (${f.originalname}):`, err.message);
        failed.push(f.originalname);
      }
    }

    if (!processed.length) {
      return res.status(422).json({
        error: 'None of the uploaded files could be processed.',
        failed,
      });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="processed-images.zip"');
    res.setHeader('X-Processed-Count', String(processed.length));
    res.setHeader('X-Failed-Count', String(failed.length));
    res.setHeader('X-Failed-Files', encodeURIComponent(failed.join('|')));
    res.setHeader('Access-Control-Expose-Headers', 'X-Processed-Count, X-Failed-Count, X-Failed-Files');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      try { res.status(500).end(); } catch (_) { /* headers already sent */ }
    });
    archive.pipe(res);

    for (const p of processed) {
      archive.append(p.buffer, { name: p.name });
    }
    await archive.finalize();
  } catch (err) {
    console.error('Image process error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Processing failed: ' + err.message });
    }
  }
});

module.exports = router;
