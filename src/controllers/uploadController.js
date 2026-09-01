const uploadSingleImage = (req, res, next) => {
  try {
    const file = req.file || (req.files && req.files[0]);
    if (!file) {
      const error = new Error('No image provided');
      error.statusCode = 400;
      throw error;
    }
    
    res.status(200).json({
      success: true,
      data: {
        url: file.path,
        filename: file.filename,
      }
    });
  } catch (error) {
    next(error);
  }
};

const uploadMultipleImages = (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      const error = new Error('No images provided');
      error.statusCode = 400;
      throw error;
    }
    
    const urls = req.files.map(file => ({
      url: file.path,
      filename: file.filename,
    }));

    res.status(200).json({
      success: true,
      data: urls
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadSingleImage,
  uploadMultipleImages,
};
