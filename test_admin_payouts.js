const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:Admin%40123@localhost:5432/Faharadatabase' });

const axios = require('axios');
const jwt = require('jsonwebtoken');

async function testAdminPayouts() {
  const token = jwt.sign({ id: '123e4567-e89b-12d3-a456-426614174000', role: 'ADMIN' }, process.env.JWT_SECRET || 'fahara_secret_key_2026', { expiresIn: '1h' });
  
  try {
    const res = await axios.get('http://localhost:5000/api/v1/payments/admin/payouts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Payouts:', res.data.data.length);
    if(res.data.data.length > 0) {
      const payoutId = res.data.data[0].id;
      const detail = await axios.get(`http://localhost:5000/api/v1/payments/admin/payouts/${payoutId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Detail:', detail.data.data.reference_number);
    }
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}

testAdminPayouts();
