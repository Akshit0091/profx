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
const { parseScanSource } = require('../utils/scanSources');

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

// How many photos to fetch at once. Sequential downloads made a batch of a
// hundred books take minutes; eight at a time is a large speed-up without
// hammering Meesho's CDN or exhausting the database connection pool.
const IMAGE_CONCURRENCY = 8;

// How long an indexed label stays scannable. A sheet is printed once and the
// parcels leave within days, but a seller may re-scan a held or returned parcel
// well after that, so the window is generous. The floor of 7 days is there so a
// mistyped env var can never wipe the week currently being packed.
const RETENTION_DAYS = Math.max(7, parseInt(process.env.SCAN_LABEL_RETENTION_DAYS, 10) || 90);

// Photos are deliberately NOT subject to this. They are keyed by SKU, not by
// order, and the same book ships for years — throwing one away would mean
// re-running the extension to learn something already known.

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

/**
 * Drops labels indexed longer ago than the retention window. Run on upload
 * rather than on a timer: uploading is the only thing that grows the table, and
 * this app has no scheduler to hang a nightly job from.
 *
 * Age is measured from when a label was first indexed, not last seen, so
 * re-uploading an old sheet does not keep stale orders alive indefinitely.
 */
async function purgeExpiredLabels(userId) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.scanLabel.deleteMany({
    where: { userId, createdAt: { lt: cutoff } },
  });
  return count;
}

/**
 * Runs an async job over every item, keeping `limit` of them in flight. Enough
 * to saturate the network without opening so many sockets to Meesho's CDN that
 * it starts refusing them, or so many database writes that the pool runs dry.
 */
async function mapWithLimit(items, limit, job) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await job(items[index]);
    }
  });
  await Promise.all(workers);
}

/**
 * Reduces a SKU to the part both documents agree on. A label sheet wraps
 * "Chapter-wise" into "Chapter- wise"; a manifest splits "Assistant" into
 * "A ssistant". Stripping to lowercase letters and digits made a real batch
 * of 340 agree across both, where 61 of the raw strings differed.
 */
function skuKeyOf(sku) {
  return String(sku || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * True when a stored row already says what this document says. SKUs are
 * compared on skuKey, not the raw string, so uploading both the label sheet
 * and the manifest for one batch is recognised as the same information twice
 * rather than 61 spurious corrections.
 */
function unchanged(existing, row) {
  return (
    existing.awb === row.awb &&
    existing.courier === row.courier &&
    existing.skuKey === row.skuKey &&
    existing.qty === (row.qty || 1) &&
    existing.size === row.size
  );
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

    // Either the Sub Order Labels sheet or the Supplier Manifest will do, and
    // the seller does not have to say which: each document is recognised from
    // its own contents. Both carry AWB, sub-order and SKU.
    let parsed = [];
    let units = 0;
    const kinds = [];
    for (const file of files) {
      let source;
      try {
        source = await parseScanSource(file.buffer);
      } catch (err) {
        return res.status(400).json({
          error: `Could not read "${file.originalname}". Is it a PDF?`,
        });
      }
      if (!source.kind) {
        return res.status(400).json({
          error: `"${file.originalname}" is not a Meesho label sheet or supplier manifest.`,
        });
      }
      parsed = parsed.concat(source.rows);
      units += source.units;
      kinds.push(source.kind);
    }

    const usable = parsed.filter((p) => p.subOrderId && p.sku);
    const unreadable = units - usable.length;

    // Last page wins if one sheet repeats a sub-order, which happens when the
    // seller downloads two overlapping ranges into the same PDF.
    const bySubOrder = new Map();
    for (const row of usable) bySubOrder.set(row.subOrderId, row);
    const repeatedInFile = usable.length - bySubOrder.size;

    const incoming = [...bySubOrder.values()].map((row) => ({
      subOrderId: row.subOrderId,
      orderNo: row.subOrderId.split('_')[0],
      awb: row.awb,
      courier: row.courier,
      sku: row.sku,
      skuKey: skuKeyOf(row.sku),
      qty: row.qty || 1,
      size: row.size,
    }));

    // Sheets overlap heavily in practice — a seller re-downloads the day's
    // labels and most of them are already indexed. Reading first means a
    // re-upload of 340 known labels writes nothing at all, instead of firing
    // 340 pointless updates at the database.
    const existing = await prisma.scanLabel.findMany({
      where: { userId, subOrderId: { in: incoming.map((r) => r.subOrderId) } },
      select: { subOrderId: true, awb: true, courier: true, sku: true, skuKey: true, qty: true, size: true },
    });
    const known = new Map(existing.map((r) => [r.subOrderId, r]));

    const toCreate = [];
    const toUpdate = [];
    let duplicates = 0;
    for (const row of incoming) {
      const prior = known.get(row.subOrderId);
      if (!prior) toCreate.push({ userId, ...row });
      else if (unchanged(prior, row)) duplicates += 1;
      else toUpdate.push(row);
    }

    if (toCreate.length) {
      // skipDuplicates covers the race of two uploads landing at once; the
      // unique index on (userId, subOrderId) is what actually guarantees it.
      await prisma.scanLabel.createMany({ data: toCreate, skipDuplicates: true });
    }
    for (const row of toUpdate) {
      const { subOrderId, ...data } = row;
      await prisma.scanLabel.update({
        where: { userId_subOrderId: { userId, subOrderId } },
        data,
      });
    }

    const purged = await purgeExpiredLabels(userId);

    // Tell the seller which of these still have no photo, so they know whether
    // running the extension is worth it before they start scanning. Counted by
    // skuKey, or a book pictured under the orders page's spelling would be
    // reported missing just because this document spells it differently.
    const skus = [...new Set(incoming.map((r) => r.skuKey))];
    const haveImages = await prisma.productImage.findMany({
      where: { userId, skuKey: { in: skus } },
      select: { skuKey: true },
    });
    const withImage = new Set(haveImages.map((r) => r.skuKey));

    res.json({
      success: true,
      pages: parsed.length,
      added: toCreate.length,
      duplicates,              // already stored, byte for byte — nothing written
      updated: toUpdate.length, // same order, but the sheet disagreed with the index
      repeatedInFile,
      unreadable,
      purged,
      sources: [...new Set(kinds)], // "labels", "manifest", or both
      retentionDays: RETENTION_DAYS,
      scannable: incoming.length,
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
          skuKey: skuKeyOf(sku),
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
    // Matched on skuKey as well as the raw string, so the same book spelled two
    // ways by two documents is not downloaded twice.
    const wantedKeys = [...needed.keys()].map(skuKeyOf);
    const existing = await prisma.productImage.findMany({
      where: { userId, OR: [{ sku: { in: [...needed.keys()] } }, { skuKey: { in: wantedKeys } }] },
      select: { sku: true, skuKey: true },
    });
    const pictured = new Set(existing.map((r) => r.skuKey));
    for (const sku of [...needed.keys()]) {
      if (pictured.has(skuKeyOf(sku))) needed.delete(sku);
    }

    // Fetched several at a time. One at a time meant a batch of 100 books took
    // as long as 100 round trips to Meesho's CDN laid end to end, which on a
    // modest host is minutes of the seller watching a progress line.
    let imagesSaved = 0;
    const imageErrors = [];

    await mapWithLimit([...needed.entries()], IMAGE_CONCURRENCY, async ([sku, { imageUrl, title }]) => {
      for (const url of upscaleMeeshoUrl(imageUrl)) {
        try {
          const { data, width, height } = await fetchImage(url);
          const shared = { data, width, height, sourceUrl: url, title, mimeType: 'image/webp' };
          await prisma.productImage.upsert({
            where: { userId_sku: { userId, sku } },
            update: shared,
            create: { userId, sku, skuKey: skuKeyOf(sku), ...shared },
          });
          imagesSaved += 1;
          return;
        } catch (err) {
          // fall through to the next candidate URL
        }
      }
      imageErrors.push(sku);
    });

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

    // Exact spelling first, so an exact match is never passed over for a
    // normalised one. The fallback is what lets a manifest-indexed order find
    // a photo the extension saved under the orders page's own spelling.
    let image = await prisma.productImage.findUnique({
      where: { userId_sku: { userId, sku: label.sku } },
    });
    if (!image && label.skuKey) {
      image = await prisma.productImage.findFirst({ where: { userId, skuKey: label.skuKey } });
    }

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
    const [labels, images, withAwb, oldest] = await Promise.all([
      prisma.scanLabel.count({ where: { userId } }),
      prisma.productImage.count({ where: { userId } }),
      prisma.scanLabel.count({ where: { userId, awb: { not: null } } }),
      prisma.scanLabel.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    const skus = await prisma.scanLabel.findMany({
      where: { userId },
      select: { skuKey: true },
      distinct: ['skuKey'],
    });
    const pictured = await prisma.productImage.findMany({
      where: { userId, skuKey: { in: skus.map((s) => s.skuKey) } },
      select: { skuKey: true },
      distinct: ['skuKey'],
    });

    res.json({
      labels,
      labelsWithAwb: withAwb,
      images,
      distinctSkus: skus.length,
      skusMissingImage: skus.length - pictured.length,
      retentionDays: RETENTION_DAYS,
      oldestLabelAt: oldest?.createdAt || null,
    });
  } catch (err) {
    console.error('Scan stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

module.exports = router;
