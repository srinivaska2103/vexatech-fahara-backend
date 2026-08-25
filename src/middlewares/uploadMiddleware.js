const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'fahara_uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'heic', 'bmp', 'tiff'],
  },
});

const upload = multer({ storage: storage });

module.exports = upload;
