const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['new_report', 'status_update', 'new_sighting', 'case_resolved', 'admin_message'],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
