// routes/labelDedup.js
//
// npm install pdf-parse pdf-lib multer
//
// Mount in your main app:
//   const labelDedupRoutes = require('./routes/labelDedup');
//   app.use('/api/labels', requireAuth, labelDedupRoutes); // requireAuth = your existing auth middleware

const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

// Matches Meesho's "Order No." format, e.g. 316218282222232320_1
const ORDER_ID_REGEX = /(\d{15,20}_\d+)/;

/**
 * Extracts per-page text from a PDF buffer using pdf-parse's pagerender hook.
 * Returns an array of strings, one per page, in page order.
 */
async function getPageTexts(buffer) {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: (pageData) => {
      return pageData.getTextContent().then((textContent) => {
        const text = textContent.items.map((item) => item.str).join(' ');
        pages.push(text);
        return text;
      });
    },
  });
  return pages;
}

/**
 * POST /api/labels/check
 * multipart/form-data, field name: "files" (accepts multiple)
 *
 * Response:
 * {
 *   totalLabels: number,
 *   uniqueLabels: number,
 *   duplicates: [{ orderId, reason: 'already_printed' | 'duplicate_in_upload', fileName, pageNumber }],
 *   cleanPdfBase64: string  // only if uniqueLabels > 0
 * }
 */
router.post('/check', upload.array('files'), async (req, res) => {
  try {
    const userId = req.user.id; // adapt to however your auth middleware attaches the user
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // 1. Parse every uploaded PDF into { file, fileName, pageIndex, orderId, pdfDoc }
    const allLabels = [];
    const loadedDocs = [];

    for (const file of files) {
      const pageTexts = await getPageTexts(file.buffer);
      const pdfDoc = await PDFDocument.load(file.buffer);
      loadedDocs.push(pdfDoc);

      pageTexts.forEach((text, pageIndex) => {
        const match = text.match(ORDER_ID_REGEX);
        allLabels.push({
          fileName: file.originalname,
          docIndex: loadedDocs.length - 1,
          pageIndex,
          orderId: match ? match[1] : null,
        });
      });
    }

    const totalLabels = allLabels.length;

    // 2. Check against DB history for this user
    const candidateOrderIds = [...new Set(allLabels.map((l) => l.orderId).filter(Boolean))];
    const alreadyPrinted = await prisma.printedLabel.findMany({
      where: { userId, orderId: { in: candidateOrderIds } },
      select: { orderId: true },
    });
    const alreadyPrintedSet = new Set(alreadyPrinted.map((r) => r.orderId));

    // 3. Walk through labels in order, flagging duplicates (DB history OR repeated within this upload)
    const seenInBatch = new Set();
    const duplicates = [];
    const keepLabels = [];

    for (const label of allLabels) {
      if (!label.orderId) {
        // Couldn't extract an order ID — keep it, but flag for manual review
        duplicates.push({
          orderId: null,
          reason: 'order_id_not_found',
          fileName: label.fileName,
          pageNumber: label.pageIndex + 1,
        });
        keepLabels.push(label);
        continue;
      }

      if (alreadyPrintedSet.has(label.orderId)) {
        duplicates.push({
          orderId: label.orderId,
          reason: 'already_printed',
          fileName: label.fileName,
          pageNumber: label.pageIndex + 1,
        });
        continue; // drop from clean sheet
      }

      if (seenInBatch.has(label.orderId)) {
        duplicates.push({
          orderId: label.orderId,
          reason: 'duplicate_in_upload',
          fileName: label.fileName,
          pageNumber: label.pageIndex + 1,
        });
        continue; // drop from clean sheet
      }

      seenInBatch.add(label.orderId);
      keepLabels.push(label);
    }

    // 4. Build the clean output PDF from the kept pages, preserving order
    let cleanPdfBase64 = null;
    if (keepLabels.length > 0) {
      const outputDoc = await PDFDocument.create();
      for (const label of keepLabels) {
        const [copiedPage] = await outputDoc.copyPages(loadedDocs[label.docIndex], [label.pageIndex]);
        outputDoc.addPage(copiedPage);
      }
      const outputBytes = await outputDoc.save();
      cleanPdfBase64 = Buffer.from(outputBytes).toString('base64');
    }

    // 5. Record newly-printed unique order IDs in the DB
    const newOrderIds = keepLabels.map((l) => l.orderId).filter(Boolean);
    if (newOrderIds.length > 0) {
      await prisma.printedLabel.createMany({
        data: newOrderIds.map((orderId) => ({ userId, orderId })),
        skipDuplicates: true,
      });
    }

    return res.json({
      totalLabels,
      uniqueLabels: keepLabels.length,
      duplicates,
      cleanPdfBase64,
    });
  } catch (err) {
    console.error('Label dedup error:', err);
    return res.status(500).json({ error: 'Failed to process label sheets' });
  }
});

module.exports = router;
