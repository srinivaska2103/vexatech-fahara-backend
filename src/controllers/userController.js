const userService = require('../services/userService');

const registerUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await userService.registerUser({ email, password });
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const result = await userService.getAllUsers(req.query, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const result = await userService.getUserById(req.params.id, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const result = await userService.updateUserStatus(req.params.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const deleteMe = async (req, res, next) => {
  try {
    const result = await userService.deleteUserAccount(req.user.id);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const result = await userService.deleteUserAccount(req.params.id);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const result = await userService.getUserById(req.user.id, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateOnboardingStatus = async (req, res, next) => {
  try {
    const { completed } = req.body;
    const result = await userService.updateOnboardingStatus(req.user.id, completed);
    res.status(200).json({
      success: true,
      message: 'Onboarding status updated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const result = await userService.updateProfile(req.user.id, req.body);
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  getUsers,
  getUserById,
  updateUserStatus,
  deleteMe,
  deleteUser,
  getMe,
  updateOnboardingStatus,
  updateProfile,
};

