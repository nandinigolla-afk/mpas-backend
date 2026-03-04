const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, adminOnly } = require('../middleware/auth');
const { createSighting, getPublicSightings, getAllSightings, updateSightingStatus } = require('../controllers/sightingController');

// Absolute path to uploads — same folder as reports
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

router.post('/report/:reportId', protect, upload.single('photo'), createSighting);
router.get('/report/:reportId',  getPublicSightings);
router.get('/',                  protect, adminOnly, getAllSightings);
router.put('/:id/status',        protect, adminOnly, updateSightingStatus);

module.exports = router;
