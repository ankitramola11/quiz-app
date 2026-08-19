const multer = require('multer');

// Configure multer to use memory storage, since we only need the buffer for parsing
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Only accept pdf files
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

module.exports = upload;
