const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getMyNotifications, markAsRead, markOneRead } = require('../controllers/notificationController');

router.get('/', protect, getMyNotifications);
router.put('/read-all', protect, markAsRead);
router.put('/:id/read', protect, markOneRead);

module.exports = router;
