const authService = require('../services/authService');

const register = async (req, res, next) => {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { email, id, otp } = req.body;
    const result = await authService.verifyRegistrationOtp(email || id, otp);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password, expectedRole, roleName } = req.body;
    const clientHeader = req.headers['x-app-client'] || req.headers['x-client-type'];
    const targetRole = expectedRole || roleName || (clientHeader === 'customer' ? 'CUSTOMER' : null);
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await authService.login(email, password, targetRole, clientIp);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const sendAdminOtp = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await authService.sendAdminLoginOtp(email, password, clientIp);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const verifyAdminLogin = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await authService.verifyAdminLoginOtp(email, otp, clientIp);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email, expectedRole, roleName } = req.body;
    const clientHeader = req.headers['x-app-client'] || req.headers['x-client-type'];
    const targetRole = expectedRole || roleName || (clientHeader === 'customer' ? 'CUSTOMER' : null);
    const result = await authService.forgotPassword(email, targetRole);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    const result = await authService.resetPassword(email, otp, newPassword);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    const result = await authService.refreshToken(token);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  verifyOtp,
  login,
  sendAdminOtp,
  verifyAdminLogin,
  forgotPassword,
  resetPassword,
  refreshToken,
};
