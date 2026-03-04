const express = require('express');
const router = express.Router();
const { register, login, getMe, updateProfile } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);


// Test email — admin only. GET /api/auth/test-email?to=your@email.com
router.get('/test-email', protect, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Admin only' });

  const { sendEmail } = require('../config/email');
  const to = req.query.to || req.user.email;
  const result = await sendEmail({
    to,
    subject: '✅ MPAS Email Test',
    text: 'This is a test email from MPAS. If you received this, email is working correctly.',
    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:40px auto;padding:32px;border-radius:16px;background:#f0fdf4;border:2px solid #86efac">
      <h2 style="color:#15803d;margin:0 0 12px">✅ MPAS Email Test — Success!</h2>
      <p style="color:#166534;line-height:1.6">Your email service is configured correctly. Alerts will be sent when cases are approved.</p>
      <p style="color:#166534;font-size:13px;margin-top:16px">Sent to: <strong>${to}</strong></p>
    </div>`,
  });

  if (result.success) {
    res.json({ success: true, message: `Test email sent to ${to}`, messageId: result.messageId });
  } else if (result.reason === 'not_configured') {
    res.status(500).json({
      success: false,
      message: 'Email not configured. Add EMAIL_USER + EMAIL_PASS to backend/.env and restart.',
    });
  } else {
    res.status(500).json({ success: false, message: result.error });
  }
});

module.exports = router;
