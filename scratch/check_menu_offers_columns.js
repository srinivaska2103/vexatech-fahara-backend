require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../src/config/prisma');

async function check() {
  try {
    const cols = await prisma.$queryRawUnsafe("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'menu_offers'");
    console.log('Columns in menu_offers:', cols);
  } catch (err) {
    console.error('Error querying columns:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
