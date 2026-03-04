const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');
const {
  createReport, getPublicReports, getReportById, getUserReports,
  getAllReports, updateReportStatus, getStats
} = require('../controllers/reportController');

// Absolute path to uploads — works regardless of where Node is started from
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

// IMPORTANT: specific routes BEFORE parameterized routes
router.get('/public', optionalAuth, getPublicReports);
router.get('/my',     protect,               getUserReports);
router.get('/stats',  protect,               getStats);   // any logged-in user can see stats
router.get('/all',    protect, adminOnly,    getAllReports);
router.post('/',      protect, upload.single('photo'), createReport);
router.get('/:id',    optionalAuth,          getReportById);
router.put('/:id/status', protect, adminOnly, updateReportStatus);

module.exports = router;
