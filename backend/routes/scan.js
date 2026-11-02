// routes/scan.js
//
// Barcode scanning: point the phone at a printed shipping label and get the
// product photo back.
//
// Two feeds build the index this searches:
//   1. the label-sheet PDF, which carries AWB + sub-order + SKU per page, and
//   2. the browser extension, which is the only way to get the product photo,
//      since neither the label nor the manifest contains one.
// They meet on the sub-order ID.

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, subscriptionMiddleware } = require('../middleware/auth');
const { parseLabelPdf } = require('../utils/labelParser');

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

// Stored pictures are shown full-width on a phone and nothing more, so a long
// edge of 600px is already past what the screen can resolve.
const IMAGE_EDGE = 600;
const IMAGE_QUALITY = 80;

// Cross-platform by design, like supplier-orders: a label is a label whichever
// marketplace printed it, so there is deliberately no platformMiddleware here.
router.use(authMiddleware, subscriptionMiddleware);

// ---------- helpers ----------

/**
 * Barcode symbologies and courier label layouts disagree about punctuation and
 * case, so a scan is compared on a flattened form and tried as every key it
 * could plausibly be.
 */
function candidateKeys(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return null;

  // Scanners sometimes prepend an AIM identifier (]C1) or trail a checksum char.
  const cleaned = code.replace(/^\]\w\d/, '').replace(/[^A-Z0-9_]/g, '');
  if (!cleaned) return null;

  const keys = new Set([code, cleaned]);

  // "347365437691724416_1" and "347365437691724416" are the same order, and
  // either can be what the barcode holds.
  const withSuffix = cleaned.match(/^(\d{15,20})_(\d+)$/);
  if (withSuffix) keys.add(withSuffix[1]);
  if (/^\d{15,20}$/.test(cleaned)) keys.add(`${cleaned}_1`);

  return { cleaned, keys: [...keys] };
}

/** Fetches a product photo and shrinks it to something a phone can show. */
async function fetchImage(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 ProfX/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = Buffer.from(await res.arrayBuffer());
  if (raw.length < 100) throw new Error('empty response');

  const img = sharp(raw).resize(IMAGE_EDGE, IMAGE_EDGE, {
    fit: 'inside',
    withoutEnlargement: true,
  });
  const data = await img.webp({ quality: IMAGE_QUALITY }).toBuffer();
  const meta = await sharp(data).metadata();
  return { data, width: meta.width, height: meta.height };
}

/**
 * Meesho's CDN serves the same picture at several sizes via a suffix on the
 * filename; the orders table uses a thumbnail far too small to recognise a book
 * by. Asking for a larger variant costs nothing and the original stays as the
 * fallback if that variant doesn't exist.
 */
function upscaleMeeshoUrl(url) {
  const bigger = url.replace(/_\d{2,4}(\.[a-z]{3,4})(\?|$)/i, `_${IMAGE_EDGE}$1$2`);
  return bigger === url ? [url] : [bigger, url];
}

function toDataUrl(record) {
  if (!record) return null;
  return `data:${record.mimeType};base64,${Buffer.from(record.data).toString('base64')}`;
}

// ---------- 1. LABEL SHEET UPLOAD ----------
// multipart/form-data, field "files" (the Sub_Order_Labels PDF, several allowed)
//
// Builds the AWB <-> sub-order <-> SKU index. Re-uploading the same sheet is
// harmless: rows are matched on sub-order ID and updated in place.
router.post('/labels', upload.array('files', 20), async (req, res) => {
  try {
    const userId = req.user.id;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

    let parsed = [];
    for (const file of files) {
      try {
        parsed = parsed.concat(await parseLabelPdf(file.buffer));
      } catch (err) {
        return res.status(400).json({
          error: `Could not read "${file.originalname}". Is it the Sub Order Labels PDF from Meesho?`,
        });
      }
    }

    const usable = parsed.filter((p) => p.subOrderId && p.sku);
    const skipped = parsed.length - usable.length;

    // Last page wins if a sheet repeats a sub-order, which happens when the
    // seller downloads an overlapping range twice.
    const bySubOrder = new Map();
    for (const row of usable) bySubOrder.set(row.subOrderId, row);

    let saved = 0;
    for (const row of bySubOrder.values()) {
      const data = {
        orderNo: row.subOrderId.split('_')[0],
        awb: row.awb,
        courier: row.courier,
        sku: row.sku,
        qty: row.qty || 1,
        size: row.size,
      };
      await prisma.scanLabel.upsert({
        where: { userId_subOrderId: { userId, subOrderId: row.subOrderId } },
        update: data,
        create: { userId, subOrderId: row.subOrderId, ...data },
      });
      saved += 1;
    }

    // Tell the seller which of these still have no photo, so they know whether
    // running the extension is worth it before they start scanning.
    const skus = [...new Set([...bySubOrder.values()].map((r) => r.sku))];
    const haveImages = await prisma.productImage.findMany({
      where: { userId, sku: { in: skus } },
      select: { sku: true },
    });
    const withImage = new Set(haveImages.map((r) => r.sku));

    res.json({
      success: true,
      pages: parsed.length,
      saved,
      skipped,
      distinctSkus: skus.length,
      skusMissingImage: skus.filter((s) => !withImage.has(s)).length,
    });
  } catch (err) {
    console.error('Scan label upload error:', err);
    res.status(500).json({ error: 'Failed to read the label sheet: ' + err.message });
  }
});

// ---------- 2. EXTENSION INGEST ----------
// Body: { items: [{ subOrderId, sku?, title?, imageUrl }] }
//
// The extension reads the Meesho orders table, where the product photo lives.
// It cannot see the AWB, so rows it creates carry a null one until the label
// sheet fills it in.
router.post('/ingest', async (req, res) => {
  try {
    const userId = req.user.id;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'No items sent' });
    if (items.length > 1000) return res.status(400).json({ error: 'Too many items in one batch (max 1000)' });

    // The sheet's SKU is the trustworthy one, so existing rows win over
    // whatever the extension guessed from the page.
    const subOrderIds = items.map((i) => String(i.subOrderId || '')).filter(Boolean);
    const known = await prisma.scanLabel.findMany({
      where: { userId, subOrderId: { in: subOrderIds } },
      select: { subOrderId: true, sku: true },
    });
    const skuBySubOrder = new Map(known.map((r) => [r.subOrderId, r.sku]));

    // One image per SKU, so a batch of 300 orders of 40 books is 40 downloads.
    const needed = new Map();
    let rows = 0;
    let unresolved = 0;

    for (const item of items) {
      const subOrderId = String(item.subOrderId || '').trim();
      if (!subOrderId) continue;

      const sku = skuBySubOrder.get(subOrderId) || String(item.sku || '').trim();
      if (!sku) { unresolved += 1; continue; }

      const title = item.title ? String(item.title).slice(0, 500) : null;

      await prisma.scanLabel.upsert({
        where: { userId_subOrderId: { userId, subOrderId } },
        update: title ? { title } : {},
        create: {
          userId,
          subOrderId,
          orderNo: subOrderId.split('_')[0],
          sku,
          title,
          qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
        },
      });
      rows += 1;

      const imageUrl = String(item.imageUrl || '').trim();
      if (imageUrl && /^https?:\/\//i.test(imageUrl) && !needed.has(sku)) {
        needed.set(sku, { imageUrl, title });
      }
    }

    // Skip SKUs already pictured — re-running the extension should be cheap.
    const existing = await prisma.productImage.findMany({
      where: { userId, sku: { in: [...needed.keys()] } },
      select: { sku: true },
    });
    for (const row of existing) needed.delete(row.sku);

    let imagesSaved = 0;
    const imageErrors = [];
    for (const [sku, { imageUrl, title }] of needed) {
      let saved = false;
      for (const url of upscaleMeeshoUrl(imageUrl)) {
        try {
          const { data, width, height } = await fetchImage(url);
          await prisma.productImage.upsert({
            where: { userId_sku: { userId, sku } },
            update: { data, width, height, sourceUrl: url, title, mimeType: 'image/webp' },
            create: { userId, sku, data, width, height, sourceUrl: url, title, mimeType: 'image/webp' },
          });
          imagesSaved += 1;
          saved = true;
          break;
        } catch (err) {
          // fall through to the next candidate URL
        }
      }
      if (!saved) imageErrors.push(sku);
    }

    res.json({
      success: true,
      rows,
      unresolved,
      imagesSaved,
      imagesSkipped: existing.length,
      imageErrors: imageErrors.slice(0, 20),
    });
  } catch (err) {
    console.error('Scan ingest error:', err);
    res.status(500).json({ error: 'Failed to save: ' + err.message });
  }
});

// ---------- 3. LOOKUP ----------
// GET /api/scan/lookup?code=VL0085981395206
router.get('/lookup', async (req, res) => {
  try {
    const userId = req.user.id;
    const parsed = candidateKeys(req.query.code);
    if (!parsed) return res.status(400).json({ error: 'No code given' });

    const { cleaned, keys } = parsed;

    const label = await prisma.scanLabel.findFirst({
      where: {
        userId,
        OR: [{ awb: { in: keys } }, { subOrderId: { in: keys } }, { orderNo: { in: keys } }],
      },
    });

    if (!label) {
      return res.status(404).json({
        found: false,
        code: cleaned,
        reason: 'unknown_code',
        message: 'No label with this barcode. Upload the label sheet for this batch first.',
      });
    }

    const image = await prisma.productImage.findUnique({
      where: { userId_sku: { userId, sku: label.sku } },
    });

    res.json({
      found: true,
      code: cleaned,
      sku: label.sku,
      title: label.title,
      qty: label.qty,
      size: label.size,
      courier: label.courier,
      awb: label.awb,
      subOrderId: label.subOrderId,
      image: toDataUrl(image),
      imageMissing: !image,
    });
  } catch (err) {
    console.error('Scan lookup error:', err);
    res.status(500).json({ error: 'Lookup failed: ' + err.message });
  }
});

// ---------- 4. STATS ----------
// Powers the readiness line on the scan page and the extension popup.
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const [labels, images, withAwb] = await Promise.all([
      prisma.scanLabel.count({ where: { userId } }),
      prisma.productImage.count({ where: { userId } }),
      prisma.scanLabel.count({ where: { userId, awb: { not: null } } }),
    ]);

    const skus = await prisma.scanLabel.findMany({
      where: { userId },
      select: { sku: true },
      distinct: ['sku'],
    });
    const pictured = await prisma.productImage.findMany({
      where: { userId, sku: { in: skus.map((s) => s.sku) } },
      select: { sku: true },
    });

    res.json({
      labels,
      labelsWithAwb: withAwb,
      images,
      distinctSkus: skus.length,
      skusMissingImage: skus.length - pictured.length,
    });
  } catch (err) {
    console.error('Scan stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

module.exports = router;
