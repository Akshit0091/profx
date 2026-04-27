// routes/orders.js
const express = require("express");
const router = express.Router();
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware, subscriptionMiddleware } = require("../middleware/auth");

const prisma = new PrismaClient();
router.use(authMiddleware);

// ─── GET /api/orders ──────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      search = "", status = "all", sortBy = "createdAt",
      sortDir = "desc", page = "1", limit = "50",
      dateFrom, dateTo,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const where = { userId: req.userId };

    if (search) {
      where.OR = [
        { orderItemId: { contains: search, mode: "insensitive" } },
        { orderId:     { contains: search, mode: "insensitive" } },
        { skuId:       { contains: search, mode: "insensitive" } },
        { trackingId:  { contains: search, mode: "insensitive" } },
      ];
    }

    // Status filter
    if (status === "matched")   { where.isMatched = true; where.isReturned = false; }
    if (status === "pending")   { where.isMatched = false; where.isReturned = false; }
    if (status === "returned")  { where.isReturned = true; }

    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo)   where.paymentDate.lte = new Date(dateTo);
    }

    const validSort = ["createdAt", "profit", "paymentDate", "dispatchDate", "bankSettlement"];
    const orderField = validSort.includes(sortBy) ? sortBy : "createdAt";
    const orderDir   = sortDir === "asc" ? "asc" : "desc";

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip,
        take: limitNum,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      data: orders,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
});

// ─── DELETE /api/orders/all ───────────────────────────────────────────────────
router.delete("/all", async (req, res) => {
  try {
    const result = await prisma.order.deleteMany({ where: { userId: req.userId } });
    res.json({ success: true, message: `Deleted ${result.count} orders` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/orders/export ───────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId },
      orderBy: { paymentDate: "desc" },
    });

    const rows = orders.map((o) => ({
      "Order Item ID":       o.orderItemId,
      "Order ID":            o.orderId || "",
      "SKU ID":              o.skuId || "",
      "Tracking ID":         o.trackingId || "",
      "Dispatch Date":       o.dispatchDate ? o.dispatchDate.toISOString().split("T")[0] : "",
      "Payment Date":        o.paymentDate  ? o.paymentDate.toISOString().split("T")[0]  : "",
      "Bank Settlement (₹)": o.bankSettlement ?? "",
      "Purchase Price (₹)":  o.purchasePrice  ?? "",
      "Profit (₹)":          o.profit         ?? "",
      "Status": o.isReturned ? "Returned"
              : o.isMatched  ? (o.profit >= 0 ? "Profit" : "Loss")
              : "Pending",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Orders");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="profx-orders-${Date.now()}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: "Export failed" });
  }
});

module.exports = router;
