const jwtUtils = require('../utils/jwtUtils');
const userRepository = require('../repositories/userRepository');

const protect = async (req, res, next) => {
  let token;
  console.log(`[AuthMiddleware] Path: ${req.path}, Method: ${req.method}`);
  console.log(`[AuthMiddleware] Headers:`, req.headers.authorization ? 'Present' : 'Missing');

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    console.log('[AuthMiddleware] Error: Not authorized, no token');
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  const decoded = jwtUtils.verifyToken(token);
  if (!decoded) {
    console.log('[AuthMiddleware] Error: Not authorized, token failed');
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }

  try {
    const userId = decoded.id || decoded.userId || decoded.sub;
    let user = userId ? await userRepository.findUserById(userId) : null;
    if (!user && decoded.email) {
      user = await userRepository.findUserByEmail(decoded.email);
    }
    if (!user) {
      console.log('[AuthMiddleware] Error: User not found');
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[AuthMiddleware] Database error during user lookup:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error during authentication' });
  }
};

const optionalProtect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next();
  }

  const decoded = jwtUtils.verifyToken(token);
  if (!decoded) {
    return next();
  }

  try {
    const userId = decoded.id || decoded.userId || decoded.sub;
    let user = userId ? await userRepository.findUserById(userId) : null;
    if (!user && decoded.email) {
      user = await userRepository.findUserByEmail(decoded.email);
    }
    if (user) {
      req.user = user;
    }
  } catch (err) {
    console.error('[AuthMiddleware] Error in optional auth:', err.message);
  }
  next();
};

module.exports = {
  protect,
  optionalProtect,
};

