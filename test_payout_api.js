require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Admin%40123@localhost:5432/Faharadatabase' });
  try {
    const adminQuery = await pool.query(`SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name='ADMIN') LIMIT 1`);
    const token = jwt.sign({ id: adminQuery.rows[0].id, role: 'ADMIN' }, process.env.JWT_SECRET || 'fahara_secret_key_2026', { expiresIn: '1d' });
    
    // First, let's get the payouts to get a valid ID
    const getRes = await axios.get('http://localhost:5000/api/v1/payments/admin/payouts', { headers: { Authorization: `Bearer ${token}` } });
    if(getRes.data.data.length > 0) {
       const payoutId = getRes.data.data[0].id;
       console.log('Trying to complete payout:', payoutId);
       const res = await axios.post(`http://localhost:5000/api/v1/payments/admin/payouts/${payoutId}/complete`, {}, { headers: { Authorization: `Bearer ${token}` } });
       console.log(res.data);
    } else {
       console.log("No payouts found");
    }
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}
run();
