const axios = require('axios');

async function testHttp() {
  try {
    const res = await axios.get('http://localhost:3000/api/v1/cafes/79e55e5d-deb2-489a-9552-07fdad758af1/tables');
    console.log('HTTP GET Response Status:', res.status);
    console.log('Data:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('HTTP GET Error:', err.response?.status, err.response?.data || err.message);
  }
}

testHttp();
