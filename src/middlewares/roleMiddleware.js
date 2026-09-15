const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles || !req.user.roles.name) {
      return res.status(403).json({ success: false, message: 'Forbidden: No role assigned' });
    }

    const userRole = req.user.roles.name;

    let allowed = roles.includes(userRole);
    if (!allowed && roles.includes('CAFE_OWNER') && userRole === 'WALKING_CAFE_OWNER') {
      allowed = true;
    }
    if (!allowed && roles.includes('WALKING_CAFE_OWNER') && userRole === 'CAFE_OWNER') {
      allowed = true;
    }

    if (!allowed) {
      return res.status(403).json({ 
        success: false, 
        message: `Forbidden: User role ${userRole} is not authorized` 
      });
    }
    
    next();
  };
};

module.exports = {
  authorizeRoles,
};
