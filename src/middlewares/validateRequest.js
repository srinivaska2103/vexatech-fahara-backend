const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const errors = error.details.map((detail) => detail.message);
      console.error(`[ValidateRequest Failure] Path: ${req.originalUrl} | Errors:`, JSON.stringify(errors), '| Body:', JSON.stringify(req.body));
      return res.status(400).json({ success: false, errors });
    }
    req.body = value;
    next();
  };
};

module.exports = validateRequest;
