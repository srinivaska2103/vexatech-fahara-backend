require('dotenv').config();
const prisma = require('./src/config/prisma');
const jwtUtils = require('./src/utils/jwtUtils');
const axios = require('axios');

async function main() {
  const users = await prisma.users.findMany({ include: { roles: true } });
  const eventManager = users.find(u => u.roles?.name === 'EVENT_MANAGER');
  
  if (!eventManager) {
    console.log('No event manager found');
    return;
  }
  
  console.log('Event Manager:', eventManager.email);
  const token = jwtUtils.generateAccessToken({ id: eventManager.id });
  
  try {
    const res = await axios.get('http://localhost:5000/api/v1/bookings/cafe-bookings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Response status:', res.status);
    console.log('Response data:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('API Error:', err.response?.status, err.response?.data || err.message);
  }
}
main().finally(() => prisma.$disconnect());
