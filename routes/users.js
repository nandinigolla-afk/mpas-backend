const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getAllUsers, updateUserRole, toggleUserStatus } = require('../controllers/userController');

router.get('/', protect, adminOnly, getAllUsers);
router.put('/:id/role', protect, adminOnly, updateUserRole);
router.put('/:id/toggle', protect, adminOnly, toggleUserStatus);

module.exports = router;
