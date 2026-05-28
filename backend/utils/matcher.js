const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Profit rule (shared across all platforms — Flipkart, Meesho, Amazon):
 *   Effectively returned (item back / platform paid nothing or charged us back):
 *     - isReturned = true,  OR
 *     - bankSettlement <= 0
 *   → profit = bankSettlement  (no cost subtracted — inventory considered recovered)
 *
 *   Otherwise (normal sale):
 *   → profit = bankSettlement - purchasePrice
 *
 * This rule works identically for Meesho:
 *   - RTO:    settlement 0  → profit 0       (item returned, kept inventory, no fee)
 *   - Return: settlement <0 → profit = that  (item returned, kept inventory, paid reverse fee)
 *   - Delivered: settlement - cost
 */
function computeProfit(order, cost) {
  const settlement = order.bankSettlement;
  if (settlement === null || settlement === undefined) return null;
  if (order.isReturned || settlement <= 0) return settlement;
  if (cost === null || cost === undefined) return null;
  return settlement - cost;
}

/**
 * Re-check each order for the user+platform and set isMatched + profit.
 * @param {string} userId
 * @param {string} platform  e.g. "flipkart" | "meesho" | "amazon"
 * @param {string[]|null} orderItemIds  optional subset to limit recompute
 */
async function matchOrdersForUser(userId, platform = 'flipkart', orderItemIds = null) {
  const whereClause = { userId, platform };
  if (orderItemIds && orderItemIds.length) whereClause.orderItemId = { in: orderItemIds };

  const orders = await prisma.order.findMany({ where: whereClause });

  // Preload SKU prices once, scoped to this platform
  const skuList = await prisma.sKU.findMany({ where: { userId, platform } });
  const priceMap = new Map(skuList.map((s) => [s.skuId, s.purchasePrice]));

  const updates = [];
  for (const o of orders) {
    if (o.hasPickup && o.hasSettlement) {
      const cost = o.skuId && priceMap.has(o.skuId) ? priceMap.get(o.skuId) : null;
      const profit = computeProfit(o, cost);
      updates.push(
        prisma.order.update({
          where: { id: o.id },
          data: { isMatched: true, purchasePrice: cost, profit },
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
 * Recalculate profit for every matched order for a single SKU on a platform.
 * Called whenever a SKU's purchase price is added or updated.
 */
async function recalcProfitsForSku(userId, platform, skuId) {
  const skuRow = await prisma.sKU.findUnique({
    where: { skuId_userId_platform: { skuId, userId, platform } },
  });
  if (!skuRow) return { updated: 0 };

  const orders = await prisma.order.findMany({
    where: { userId, platform, skuId, hasPickup: true, hasSettlement: true },
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
