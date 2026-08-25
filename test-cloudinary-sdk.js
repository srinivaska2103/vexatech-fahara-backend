require('dotenv').config();
const cloudinary = require('./src/config/cloudinary');
const fs = require('fs');

async function testCloudinary() {
  try {
    fs.writeFileSync('dummy.jpg', 'dummy data');
    const result = await cloudinary.uploader.upload('dummy.jpg', {
      folder: 'fahara_uploads'
    });
    console.log('Upload successful:', result);
  } catch (error) {
    console.error('Cloudinary error:', error);
  } finally {
    if (fs.existsSync('dummy.jpg')) fs.unlinkSync('dummy.jpg');
  }
}

testCloudinary();
