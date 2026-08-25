require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Admin%40123@localhost:5432/Faharadatabase' });

const axios = require('axios');
const jwt = require('jsonwebtoken');

async function testAdminFinance() {
  try {
    const adminQuery = await pool.query(`SELECT id, email FROM users WHERE role_id = (SELECT id FROM roles WHERE name='ADMIN') LIMIT 1`);
    const admin = adminQuery.rows[0];
    
    const token = jwt.sign({ id: admin.id, role: 'ADMIN' }, process.env.JWT_SECRET || 'fahara_secret_key_2026', { expiresIn: '1d' });
    
    console.log('Fetching Revenue...');
    const revenueRes = await axios.get('http://localhost:5000/api/v1/payments/admin/revenue', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Revenue:', JSON.stringify(revenueRes.data, null, 2));

    console.log('Fetching Transactions...');
    const txRes = await axios.get('http://localhost:5000/api/v1/payments/admin/transactions', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Transactions:', txRes.data.data.length);
    
  } catch(e) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await pool.end();
  }
}

testAdminFinance();
