const crypto = require('crypto');

const generateOTP = () => {
  // Generates a 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const getOtpExpiry = (minutes = 5) => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date;
};

module.exports = {
  generateOTP,
  getOtpExpiry,
};
