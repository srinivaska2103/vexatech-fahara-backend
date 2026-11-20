const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isRaw = file.mimetype === 'application/pdf' || 
                  /\.(pdf|doc|docx|txt|zip|rar)$/i.test(file.originalname);

    if (isRaw) {
      return {
        folder: 'fahara_uploads',
        resource_type: 'raw',
      };
    }

    return {
      folder: 'fahara_uploads',
      resource_type: 'auto',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'heic', 'bmp', 'tiff'],
    };
  },
});

const upload = multer({ storage: storage });

module.exports = upload;
