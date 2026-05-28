// One-time backfill for the multi-platform migration.
// Safe to run multiple times (idempotent).
//
//   node backfill-platforms.js
//
// What it does:
//   1. Every existing user with an empty `plans` array gets ["flipkart"]
//      (they were all Flipkart sellers before multi-platform existed).
//   2. Existing Order / SKU / SettlementEntry rows already default to
//      platform="flipkart" via the schema, but we set them explicitly too,
//      in case any rows predate the default.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting multi-platform backfill...');

  // 1. Users with no plans -> flipkart
  const usersUpdated = await prisma.user.updateMany({
    where: { plans: { isEmpty: true } },
    data: { plans: ['flipkart'] },
  });
  console.log(`  Users set to ["flipkart"]: ${usersUpdated.count}`);

  // 2. Orders without platform (null/empty) -> flipkart
  //    (Prisma default handles new rows; this catches any legacy nulls.)
  const ordersUpdated = await prisma.order.updateMany({
    where: { OR: [{ platform: '' }, { platform: { equals: undefined } }] },
    data: { platform: 'flipkart' },
  });
  console.log(`  Orders backfilled: ${ordersUpdated.count}`);

  // 3. SKUs
  const skusUpdated = await prisma.sKU.updateMany({
    where: { OR: [{ platform: '' }, { platform: { equals: undefined } }] },
    data: { platform: 'flipkart' },
  });
  console.log(`  SKUs backfilled: ${skusUpdated.count}`);

  // 4. SettlementEntries
  const seUpdated = await prisma.settlementEntry.updateMany({
    where: { OR: [{ platform: '' }, { platform: { equals: undefined } }] },
    data: { platform: 'flipkart' },
  });
  console.log(`  SettlementEntries backfilled: ${seUpdated.count}`);

  console.log('Backfill complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
