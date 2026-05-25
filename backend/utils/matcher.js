const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Profit rule:
 *   Effectively returned (item back / Flipkart paid nothing or charged us back):
 *     - isReturned = true,  OR
 *     - bankSettlement <= 0
 *   → profit = bankSettlement  (no cost subtracted — inventory considered recovered)
 *
 *   Otherwise (normal sale):
 *   → profit = bankSettlement - purchasePrice
 *
 * "Return Incoming" is NOT auto-treated as returned — the parcel could still
 * be lost in transit. Profit flips only when isReturned becomes true OR
 * when the settlement value is non-positive (Flipkart never paid us, or took
 * money back, which always indicates a return in practice).
 */
function computeProfit(order, cost) {
  const settlement = order.bankSettlement;
  if (settlement === null || settlement === undefined) return null;
  // Treat zero/negative settlement OR explicit return flag as "effectively returned"
  if (order.isReturned || settlement <= 0) return settlement;
  if (cost === null || cost === undefined) return null;
  return settlement - cost;
}

/**
 * After uploading pickup or settlement data, re-check each order for the user
 * and set isMatched + profit. Returned orders also get recomputed.
 */
async function matchOrdersForUser(userId, orderItemIds = null) {
  const whereClause = { userId };
  if (orderItemIds && orderItemIds.length) whereClause.orderItemId = { in: orderItemIds };

  const orders = await prisma.order.findMany({ where: whereClause });

  // Preload SKU prices once
  const skuList = await prisma.sKU.findMany({ where: { userId } });
  const priceMap = new Map(skuList.map((s) => [s.skuId, s.purchasePrice]));

  const updates = [];
  for (const o of orders) {
    if (o.hasPickup && o.hasSettlement) {
      const cost = o.skuId && priceMap.has(o.skuId) ? priceMap.get(o.skuId) : null;
      const profit = computeProfit(o, cost);
      updates.push(
        prisma.order.update({
          where: { id: o.id },
          data: {
            isMatched: true,
            purchasePrice: cost,
            profit,
          },
        })
      );
    } else if (o.isMatched) {
      updates.push(
        prisma.order.update({
          where: { id: o.id },
          data: { isMatched: false, profit: null, purchasePrice: null },
        })
      );
    }
  }

  if (updates.length) await prisma.$transaction(updates);
  return { totalEvaluated: orders.length, updated: updates.length };
}

/**
 * Recalculate profit for every matched order for a single SKU.
 * Called whenever a SKU's purchase price is added or updated.
 * Returned orders are recomputed too (their profit doesn't depend on cost,
 * but we keep purchasePrice in sync for reporting).
 */
async function recalcProfitsForSku(userId, skuId) {
  const skuRow = await prisma.sKU.findUnique({
    where: { skuId_userId: { skuId, userId } },
  });
  if (!skuRow) return { updated: 0 };

  const orders = await prisma.order.findMany({
    where: { userId, skuId, hasPickup: true, hasSettlement: true },
  });

  const updates = orders.map((o) =>
    prisma.order.update({
      where: { id: o.id },
      data: {
        purchasePrice: skuRow.purchasePrice,
        profit: computeProfit(o, skuRow.purchasePrice),
        isMatched: true,
      },
    })
  );

  if (updates.length) await prisma.$transaction(updates);
  return { updated: updates.length };
}

module.exports = { matchOrdersForUser, recalcProfitsForSku, computeProfit };
