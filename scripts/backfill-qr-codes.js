require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../src/config/prisma');
const { generateQrCodeId } = require('../src/services/qrService');

async function backfillCafeQrCodes() {
  console.log('[QR Backfill] Starting idempotent backfill for cafes missing qr_code_id...');
  
  // Find all cafes without a qr_code_id
  const cafesWithoutQr = await prisma.cafes.findMany({
    where: {
      OR: [
        { qr_code_id: null },
        { qr_code_id: '' }
      ]
    },
    select: {
      id: true,
      name: true,
      qr_code_id: true
    }
  });

  console.log(`[QR Backfill] Found ${cafesWithoutQr.length} cafes requiring qr_code_id.`);

  let updatedCount = 0;
  for (const cafe of cafesWithoutQr) {
    let assigned = false;
    let attempts = 0;
    while (!assigned && attempts < 5) {
      attempts++;
      const newQrId = generateQrCodeId();
      try {
        await prisma.cafes.update({
          where: { id: cafe.id },
          data: { qr_code_id: newQrId }
        });
        assigned = true;
        updatedCount++;
        console.log(`[QR Backfill] Assigned ${newQrId} to cafe "${cafe.name}" (${cafe.id})`);
      } catch (err) {
        if (err.code === 'P2002') {
          console.warn(`[QR Backfill] Collision on ${newQrId}, retrying...`);
        } else {
          console.error(`[QR Backfill] Error updating cafe ${cafe.id}:`, err.message);
          break;
        }
      }
    }
  }

  console.log(`[QR Backfill] Completed. Successfully updated ${updatedCount} cafes.`);
  const total = await prisma.cafes.count();
  const withQr = await prisma.cafes.count({
    where: {
      qr_code_id: { not: null }
    }
  });
  console.log(`[QR Backfill] Verification: ${withQr}/${total} cafes have a persistent qr_code_id.`);
}

backfillCafeQrCodes()
  .catch(err => {
    console.error('[QR Backfill] Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
