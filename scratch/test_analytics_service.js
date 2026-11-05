require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const analyticsService = require(require('path').join(__dirname, '../src/services/analyticsService'));
const prisma = require(require('path').join(__dirname, '../src/config/prisma'));

async function main() {
  const cafe = await prisma.cafes.findFirst({
    where: { name: { contains: 'Srini', mode: 'insensitive' } },
    select: { id: true, name: true, owner_id: true }
  });
  console.log("Found cafe:", cafe);

  if (!cafe) {
    console.log("No cafe found!");
    return;
  }

  try {
    const res = await analyticsService.getCafeAnalytics(
      cafe.owner_id,
      cafe.id,
      '7days',
      null,
      null,
      'RESTAURANT_OWNER'
    );
    console.log("SUCCESS ANALYTICS RESULT:", JSON.stringify(res.kpi, null, 2));
  } catch (err) {
    console.error("ERROR IN getCafeAnalytics:", err);
  }
}

main().finally(() => prisma.$disconnect());

