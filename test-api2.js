require('dotenv').config();
const jwt = require('jsonwebtoken');
const axios = require('axios');

async function testApi() {
  try {
    const token = jwt.sign({ id: '8568f746-6906-4e58-bbaa-4281d604eee0' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    console.log('Sending request to http://localhost:5000/api/v1/payments/create-order');
    const response = await axios.post('http://localhost:5000/api/v1/payments/create-order', {
      bookingId: 'c6a81346-d000-4035-a687-27eaf66d4dbf'
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log('Success:', response.data);
  } catch (error) {
    console.error('API Error Status:', error.response?.status);
    console.error('API Error Data:', error.response?.data);
    console.error('Message:', error.message);
  }
}

testApi();
