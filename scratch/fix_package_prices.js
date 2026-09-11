require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function main() {
  const packages = await prisma.cafe_packages.findMany();
  for (const pkg of packages) {
    const inc = pkg.inclusions || {};
    const isFood = Boolean(inc.food);
    const isCake = Boolean(inc.cake);
    const isDecor = Boolean(inc.decoration);
    const isMusic = Boolean(inc.music);
    const isOther = Boolean(inc.other);

    let sum = 0;
    if (isFood && Array.isArray(inc.food_items)) inc.food_items.forEach(i => sum += Number(i.price) || 0);
    if (isCake && Array.isArray(inc.cake_items)) inc.cake_items.forEach(i => sum += Number(i.price) || 0);
    if (isDecor && Array.isArray(inc.decoration_items)) inc.decoration_items.forEach(i => sum += Number(i.price) || 0);
    if (isMusic && Array.isArray(inc.music_items)) inc.music_items.forEach(i => sum += Number(i.price) || 0);
    if (isOther && Array.isArray(inc.other_items)) inc.other_items.forEach(i => sum += Number(i.price) || 0);

    const correctPrice = sum > 0 ? sum : Number(pkg.price) || 0;
    console.log(`Package ID: ${pkg.id}, Old price: ${pkg.price}, Correct price: ${correctPrice}`);

    await prisma.cafe_packages.update({
      where: { id: pkg.id },
      data: { price: correctPrice }
    });
  }
  console.log('Finished updating package prices in DB.');
  await prisma.$disconnect();
}

main();
