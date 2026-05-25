// One-time backfill: copy each Order's existing bankSettlement into a
// SettlementEntry so the accumulative model has the same starting state.
// Safe to run multiple times — uses fileHash="legacy" and replaces each run.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    where: { hasSettlement: true, bankSettlement: { not: null } },
    select: { userId: true, orderItemId: true, orderId: true, paymentDate: true, bankSettlement: true },
  });
  console.log(`Found ${orders.length} orders with existing settlement values`);

  // Wipe any prior legacy entries
  const del = await prisma.settlementEntry.deleteMany({ where: { fileHash: 'legacy' } });
  console.log(`Removed ${del.count} prior legacy entries`);

  // Insert one entry per order
  if (orders.length) {
    const entries = orders.map((o, idx) => ({
      userId: o.userId,
      orderItemId: o.orderItemId,
      orderId: o.orderId,
      paymentDate: o.paymentDate,
      bankSettlement: o.bankSettlement,
      fileHash: 'legacy',
      fileName: 'pre-accumulative-migration',
      rowIndex: idx,
    }));
    const ins = await prisma.settlementEntry.createMany({ data: entries });
    console.log(`Inserted ${ins.count} legacy settlement entries`);
  }
  console.log('Done. Your existing settlements are now preserved as "legacy" entries.');
  console.log('Future file uploads will accumulate on top of these.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
