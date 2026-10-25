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

const WATERMARK_DEFAULTS = {
  text: 'SHOPPIX_INDIA',
  opacity: 3,            // percent — meant to be only just perceptible
  scale: 100,            // percent of the stock lettering size
  mode: 'tile',          // 'tile' | 'center'
  angle: -30,
};

// XML-escape, so an ampersand in the text can't break the SVG overlay.
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The watermark as an SVG covering the given area. Tiled mode repeats the text
 * on a rotated lattice so it cannot be cropped off; centred mode places one
 * line across the middle. Lettering is sized off the shorter edge, so it looks
 * the same on a square canvas and on a tall cover.
 */
function watermarkSvg(width, height, wm) {
  const text = esc(String(wm.text || '').trim());
  if (!text) return null;

  const opacity = Math.min(60, Math.max(0.5, Number(wm.opacity) || 0)) / 100;
  const scale = Math.min(400, Math.max(20, Number(wm.scale) || 100)) / 100;
  const angle = Number.isFinite(Number(wm.angle)) ? Number(wm.angle) : -30;
  const font = 'Arial, Helvetica, DejaVu Sans, sans-serif';
  const base = Math.min(width, height);

  if (wm.mode === 'center') {
    const size = Math.round((base / 14) * scale);
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="50%" y="50%" font-family="${font}" font-size="${size}" font-weight="bold"
        fill="#000000" fill-opacity="${opacity}" text-anchor="middle" dominant-baseline="middle"
        transform="rotate(${angle} ${width / 2} ${height / 2})">${text}</text>
</svg>`);
  }

  // Tile cell is sized off the text so long names don't overlap themselves.
  const size = Math.round((base / 40) * scale);
  const cellW = Math.round(size * (text.length * 0.62 + 5));
  const cellH = Math.round(size * 5.5);

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="wm" width="${cellW}" height="${cellH}" patternUnits="userSpaceOnUse"
             patternTransform="rotate(${angle})">
      <text x="0" y="${Math.round(cellH / 2)}" font-family="${font}" font-size="${size}"
            font-weight="bold" fill="#000000" fill-opacity="${opacity}">${text}</text>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#wm)"/>
</svg>`);
}

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

  const layers = [{ input: product, left, top }];

  // The watermark goes on before the quality search, so what gets measured and
  // compressed is the finished image rather than a clean one.
  if (opts.watermark) {
    const wm = { ...WATERMARK_DEFAULTS, ...opts.watermark };
    const svg = watermarkSvg(CANVAS, CANVAS, wm);
    if (svg) layers.push({ input: svg, left: 0, top: 0 });
  }

  const composed = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(layers)
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

/**
 * Watermark and nothing else: same pixels, same dimensions, same format. No
 * trim, no resize, no white canvas, no size targeting — the image comes back
 * as supplied with the lettering laid over it.
 */
async function watermarkOnly(imgBuf, overrides = {}) {
  const wm = { ...WATERMARK_DEFAULTS, ...overrides };
  const meta = await sharp(imgBuf).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error('Could not read the image dimensions');

  const svg = watermarkSvg(width, height, wm);
  let pipeline = sharp(imgBuf).rotate();            // honour any EXIF orientation
  if (svg) pipeline = pipeline.composite([{ input: svg, left: 0, top: 0 }]);

  // Keep PNG as PNG so transparency survives; everything else goes out as a
  // high-quality JPEG, which is what the marketplaces take.
  const isPng = meta.format === 'png';
  const buffer = isPng
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
    : await pipeline.jpeg({ quality: 94, mozjpeg: true }).toBuffer();

  return {
    buffer,
    ext: isPng ? 'png' : 'jpg',
    width,
    height,
    kb: Math.round((buffer.length / 1024) * 10) / 10,
  };
}

module.exports = { normalizeImage, watermarkOnly, toKbWindow, DEFAULTS, WATERMARK_DEFAULTS };
