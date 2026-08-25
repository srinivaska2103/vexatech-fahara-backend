const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testUpload() {
  try {
    const token = jwt.sign({ id: 1, role: 'OWNER' }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });

    const form = new FormData();
    // 1x1 pixel PNG
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync('dummy.png', pixel);
    
    form.append('image', fs.createReadStream('dummy.png'));

    const response = await axios.post('http://localhost:5000/api/v1/uploads', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Upload successful:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Server responded with error:', error.response.status, error.response.data);
    } else {
      console.error('Request failed:', error.message);
    }
  } finally {
    if (fs.existsSync('dummy.png')) {
      fs.unlinkSync('dummy.png');
    }
  }
}

testUpload();
