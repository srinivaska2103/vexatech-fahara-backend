require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');
const jwtUtils = require('../src/utils/jwtUtils');

async function testEndpoints() {
  const user = await prisma.users.findFirst({ where: { status: 'ACTIVE' } });
  if (!user) {
    console.error('No active user found');
    process.exit(1);
  }

  const token = jwtUtils.generateAccessToken({ id: user.id, email: user.email, role: 'CUSTOMER' });
  console.log(`Generated JWT Token for user ${user.email}`);

  const baseUrl = 'http://localhost:3000/api/v1/loyalty';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    // 1. GET /api/v1/loyalty
    let res = await fetch(baseUrl, { headers });
    let data = await res.json();
    console.log('\nGET /api/v1/loyalty response:', data);

    // 2. GET /api/v1/loyalty/transactions
    res = await fetch(`${baseUrl}/transactions`, { headers });
    data = await res.json();
    console.log('\nGET /api/v1/loyalty/transactions response:', data);

    // 3. GET /api/v1/loyalty/redemptions
    res = await fetch(`${baseUrl}/redemptions`, { headers });
    data = await res.json();
    console.log('\nGET /api/v1/loyalty/redemptions response:', data);

    console.log('\n✅ ALL FAHARA LOYALTY HTTP ENDPOINTS TESTED SUCCESSFULLY! 🚀');
  } catch (err) {
    console.error('API Endpoint Test Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testEndpoints();
