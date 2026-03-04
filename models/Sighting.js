const mongoose = require('mongoose');

const sightingSchema = new mongoose.Schema({
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  locationName: { type: String },
  description: { type: String, required: true },
  photo: { type: String },
  sightingDate: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  isPublic: { type: Boolean, default: false },
  adminNotes: { type: String },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

sightingSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Sighting', sightingSchema);
