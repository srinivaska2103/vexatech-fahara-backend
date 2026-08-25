const auditService = require('../services/auditService');
const { AppError } = require('../middlewares/errorHandler');

const getAuditLogs = async (req, res, next) => {
  try {
    const data = await auditService.getAuditLogs(req.query);
    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

const getSecuritySessions = async (req, res, next) => {
  try {
    const data = await auditService.getSecuritySessions(req.query);
    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

const getLoginHistory = async (req, res, next) => {
  try {
    const data = await auditService.getLoginHistory(req.query);
    res.status(200).json({
      status: 'success',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

const terminateSession = async (req, res, next) => {
  try {
    await auditService.terminateSession(req.params.id);
    res.status(200).json({
      status: 'success',
      message: 'Session terminated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const terminateAllOtherSessions = async (req, res, next) => {
  try {
    // Assuming req.user has current session info in a real scenario
    const currentSessionId = req.headers['x-session-id']; 
    if (!currentSessionId) {
      return next(new AppError('Current session ID not provided', 400));
    }
    await auditService.terminateAllOtherSessions(currentSessionId, req.user.id);
    res.status(200).json({
      status: 'success',
      message: 'All other sessions terminated successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogs,
  getSecuritySessions,
  getLoginHistory,
  terminateSession,
  terminateAllOtherSessions
};
