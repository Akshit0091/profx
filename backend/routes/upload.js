// routes/upload.js - File Upload & Processing

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authMiddleware, subscriptionMiddleware } = require("../middleware/auth");
const { parsePickupReport, parseSettlementReport, parseReturnReport } = require("../utils/fileParser");
const { processReport } = require("../utils/matcher");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (["csv", "xlsx", "xls"].includes(ext)) cb(null, true);
    else cb(new Error("Only CSV and Excel files are allowed"));
  },
});

router.use(authMiddleware);

// ─── POST /api/upload/pickup ──────────────────────────────────────────────────
router.post("/pickup", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    const records = parsePickupReport(req.file.buffer);
    const result = await processReport(req.userId, "pickup", records);
    res.json({
      success: true,
      message: `Pickup report processed: ${result.created} new, ${result.updated} updated`,
      data: { totalRecords: records.length, created: result.created, updated: result.updated, errors: result.errors },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── POST /api/upload/settlement ──────────────────────────────────────────────
router.post("/settlement", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    const records = parseSettlementReport(req.file.buffer);
    const result = await processReport(req.userId, "settlement", records);
    res.json({
      success: true,
      message: `Settlement report processed: ${result.created} new, ${result.updated} updated`,
      data: { totalRecords: records.length, created: result.created, updated: result.updated, errors: result.errors },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── POST /api/upload/returns ─────────────────────────────────────────────────
// Upload a return report with Tracking IDs → marks orders as Returned
router.post("/returns", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    // Parse tracking IDs from file
    const trackingIds = parseReturnReport(req.file.buffer);

    let marked = 0;
    let notFound = [];

    for (const trackingId of trackingIds) {
      // Find order with this tracking ID for this user
      const order = await prisma.order.findFirst({
        where: {
          userId: req.userId,
          trackingId: { equals: trackingId, mode: "insensitive" },
        },
      });

      if (!order) {
        notFound.push(trackingId);
        continue;
      }

      // Mark as returned — profit = 0, settlement = 0
      await prisma.order.update({
        where: { id: order.id },
        data: {
          isReturned:    true,
          returnDate:    new Date(),
          profit:        0,
          bankSettlement: order.bankSettlement !== null ? 0 : null,
        },
      });
      marked++;
    }

    res.json({
      success: true,
      message: `Return report processed: ${marked} orders marked as Returned`,
      data: {
        totalTrackingIds: trackingIds.length,
        marked,
        notFound: notFound.length,
        notFoundIds: notFound.slice(0, 10), // show first 10
      },
    });
  } catch (err) {
    console.error("Return upload error:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── POST /api/upload/undo-return ─────────────────────────────────────────────
// Undo a return for a specific tracking ID
router.post("/undo-return", async (req, res) => {
  try {
    const { trackingId } = req.body;
    if (!trackingId) return res.status(400).json({ success: false, message: "trackingId required" });

    const order = await prisma.order.findFirst({
      where: { userId: req.userId, trackingId },
    });

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // Recalculate profit if we have settlement + purchase price
    let profit = null;
    if (order.bankSettlement !== null && order.purchasePrice !== null) {
      profit = parseFloat((order.bankSettlement - order.purchasePrice).toFixed(2));
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { isReturned: false, returnDate: null, profit },
    });

    res.json({ success: true, message: "Return status removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to undo return" });
  }
});

module.exports = router;
