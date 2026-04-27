// utils/matcher.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function processReport(userId, reportType, records) {
  let created = 0, updated = 0, errors = [];

  const skuList = await prisma.sKU.findMany({ where: { userId } });
  const skuMap = {};
  for (const s of skuList) skuMap[s.skuId.toLowerCase()] = s.purchasePrice;

  for (const record of records) {
    try {
      const { orderItemId } = record;

      const existing = await prisma.order.findFirst({
        where: { orderItemId, userId },
      });

      if (reportType === "pickup") {
        const updateData = {
          orderId:      record.orderId || existing?.orderId || null,
          skuId:        record.skuId || existing?.skuId || null,
          dispatchDate: record.dispatchDate || existing?.dispatchDate || null,
          trackingId:   record.trackingId || existing?.trackingId || null,
          hasPickup:    true,
        };

        if (existing?.hasSettlement) {
          const purchasePrice = lookupPrice(skuMap, record.skuId || existing?.skuId);
          updateData.isMatched     = true;
          updateData.purchasePrice = purchasePrice;
          // Don't override profit if order is returned
          if (!existing?.isReturned) {
            updateData.profit = (existing.bankSettlement !== null && purchasePrice !== null)
              ? parseFloat((existing.bankSettlement - purchasePrice).toFixed(2)) : null;
          }
        }

        if (existing) {
          await prisma.order.update({ where: { id: existing.id }, data: updateData });
          updated++;
        } else {
          await prisma.order.create({
            data: { orderItemId, userId, hasSettlement: false, isMatched: false, ...updateData },
          });
          created++;
        }

      } else {
        const updateData = {
          orderId:        record.orderId || existing?.orderId || null,
          bankSettlement: record.bankSettlement,
          paymentDate:    record.paymentDate || existing?.paymentDate || null,
          hasSettlement:  true,
        };

        if (existing?.hasPickup) {
          const skuId = existing.skuId || null;
          const purchasePrice = lookupPrice(skuMap, skuId);
          updateData.isMatched     = true;
          updateData.purchasePrice = purchasePrice;
          if (!existing?.isReturned) {
            updateData.profit = (record.bankSettlement !== null && purchasePrice !== null)
              ? parseFloat((record.bankSettlement - purchasePrice).toFixed(2)) : null;
          }
        }

        if (existing) {
          await prisma.order.update({ where: { id: existing.id }, data: updateData });
          updated++;
        } else {
          await prisma.order.create({
            data: { orderItemId, userId, hasPickup: false, isMatched: false, ...updateData },
          });
          created++;
        }
      }
    } catch (err) {
      errors.push(`OrderItemId ${record.orderItemId}: ${err.message}`);
    }
  }

  return { created, updated, errors };
}

async function recalculateProfits(userId) {
  const skuList = await prisma.sKU.findMany({ where: { userId } });
  const skuMap = {};
  for (const s of skuList) skuMap[s.skuId.toLowerCase()] = s.purchasePrice;

  const matched = await prisma.order.findMany({
    where: { userId, isMatched: true, skuId: { not: null }, isReturned: false },
  });

  for (const order of matched) {
    const purchasePrice = lookupPrice(skuMap, order.skuId);
    const profit = (order.bankSettlement !== null && purchasePrice !== null)
      ? parseFloat((order.bankSettlement - purchasePrice).toFixed(2)) : null;
    await prisma.order.update({ where: { id: order.id }, data: { purchasePrice, profit } });
  }
}

function lookupPrice(skuMap, skuId) {
  if (!skuId) return null;
  return skuMap[skuId.toLowerCase()] ?? null;
}

module.exports = { processReport, recalculateProfits };
