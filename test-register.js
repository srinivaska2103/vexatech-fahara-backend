const axios = require('axios');

async function main() {
  try {
    const res = await axios.post('http://localhost:5000/api/v1/auth/register', {
      name: 'Admin Test',
      email: 'admin_test_123@example.com',
      password: 'password123',
      roleName: 'ADMIN'
    });
    console.log('Success:', res.data);
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
}

main();
