const jwt = require('jsonwebtoken');

const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const verifyTokenWithReason = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { decoded };
  } catch (error) {
    return { decoded: null, error: error.message };
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  verifyTokenWithReason,
};
