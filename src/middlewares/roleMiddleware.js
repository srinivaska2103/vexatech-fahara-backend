const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles || !req.user.roles.name) {
      return res.status(403).json({ success: false, message: 'Forbidden: No role assigned' });
    }

    if (!roles.includes(req.user.roles.name)) {
      return res.status(403).json({ 
        success: false, 
        message: `Forbidden: User role ${req.user.roles.name} is not authorized` 
      });
    }
    
    next();
  };
};

module.exports = {
  authorizeRoles,
};
