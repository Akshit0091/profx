// ── Marketplace image normalizer ──────────────────────────────────────
// Lifted from the Chirag Cataloger's non-AI path. Takes any product image
// and produces a marketplace-compliant JPEG:
//   • square white canvas (default 2000x2000)
//   • product trimmed of surrounding padding, centred, sized to ~TARGET_AREA_PCT
//     of the canvas AREA (converted to a linear dimension)
//   • JPEG quality binary-searched toward a KB window so files stay small
//     without ever dropping below a quality floor
//
// Everything runs in memory — nothing is written to disk.

const sharp = require('sharp');

const DEFAULTS = {
  canvas: 2000,          // output is canvas x canvas
  targetAreaPct: 67,     // product occupies ~this % of canvas area
  kbMin: 150,
  kbMax: 300,
  qualityFloor: 78,      // never degrade below this to hit the window
  qualityCeil: 95,
};

// Binary-search JPEG quality toward the KB window, clamped to the floor so a
// detailed photo is never wrecked just to hit a size target.
async function toKbWindow(buf, opts) {
  const { kbMin, kbMax, qualityFloor, qualityCeil } = opts;
  let lo = qualityFloor;
  let hi = qualityCeil;
  let best = null;
  const target = (kbMin + kbMax) / 2;

  for (let i = 0; i < 8; i++) {
    const q = Math.round((lo + hi) / 2);
    const out = await sharp(buf).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    const kb = out.length / 1024;
    if (!best || Math.abs(kb - target) < Math.abs(best.kb - target)) {
      best = { buf: out, q, kb };
    }
    if (kb > kbMax) hi = q - 1;
    else if (kb < kbMin) lo = q + 1;
    else return { buf: out, quality: q, kb };
  }
  return { buf: best.buf, quality: best.q, kb: best.kb };
}

// Main entry: image buffer in -> normalized JPEG buffer out.
async function normalizeImage(imgBuf, overrides = {}) {
  const opts = { ...DEFAULTS, ...overrides };
  const CANVAS = opts.canvas;

  // area% -> linear dimension
  const side = Math.round(CANVAS * Math.sqrt(opts.targetAreaPct / 100));

  const product = await sharp(imgBuf)
    .trim()                                    // strip residual background padding
    .resize(side, side, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();

  const m = await sharp(product).metadata();
  const left = Math.round((CANVAS - m.width) / 2);
  const top = Math.round((CANVAS - m.height) / 2);

  const composed = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: product, left, top }])
    .png()
    .toBuffer();

  const result = await toKbWindow(composed, opts);
  return {
    buffer: result.buf,
    quality: result.quality,
    kb: Math.round(result.kb * 10) / 10,
    width: CANVAS,
    height: CANVAS,
  };
}

module.exports = { normalizeImage, toKbWindow, DEFAULTS };
