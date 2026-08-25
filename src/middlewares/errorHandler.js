const fs = require('fs');
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  try {
    fs.writeFileSync('last_error.log', err.stack, 'utf8');
  } catch (e) {}
  
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle Multer / Cloudinary specific errors
  if (err.name === 'MulterError' || (err.message && err.message.includes('Cloudinary'))) {
    statusCode = 400; // Usually bad request
  }

  // Handle Prisma Unique Constraint Errors (P2002)
  if (err.code === 'P2002') {
    statusCode = 400;
    const target = err.meta?.target;
    if (Array.isArray(target) && target.includes('phone')) {
      message = 'An account with this phone number already exists.';
    } else if (Array.isArray(target) && target.includes('email')) {
      message = 'An account with this email address already exists.';
    } else if (typeof target === 'string' && target.includes('phone')) {
      message = 'An account with this phone number already exists.';
    } else if (typeof target === 'string' && target.includes('email')) {
      message = 'An account with this email address already exists.';
    } else {
      message = 'A record with this information already exists.';
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = errorHandler;
