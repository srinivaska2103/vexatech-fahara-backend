const axios = require('axios');

async function testApi() {
  try {
    const res1 = await axios.get('http://localhost:5000/api/v1/audit/sessions');
    console.log("Sessions API success:", res1.data);
  } catch(e) {
    console.error("Sessions API error:", e.response?.data || e.message);
  }

  try {
    const res2 = await axios.get('http://localhost:5000/api/v1/audit/login-history');
    console.log("History API success:", res2.data);
  } catch(e) {
    console.error("History API error:", e.response?.data || e.message);
  }
}

testApi();
