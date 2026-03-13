const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getAllUsers, updateUserRole, toggleUserStatus } = require('../controllers/userController');

router.get('/', protect, adminOnly, getAllUsers);
router.put('/:id/role', protect, adminOnly, updateUserRole);
router.put('/:id/toggle', protect, adminOnly, toggleUserStatus);

// Update current user's location — called right after login
router.put('/location', protect, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat == null || lng == null)
      return res.status(400).json({ success: false, message: 'lat and lng required' });

    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user._id, {
      location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
    });
    console.log(`📍 Location updated for ${req.user.email}: [${lng}, ${lat}]`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
