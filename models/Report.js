const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  missingPerson: {
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    description: { type: String, required: true },
    photo: { type: String },
    lastSeenDate: { type: Date, required: true },
    distinguishingFeatures: { type: String },
    height: { type: String },
    weight: { type: String },
    hairColor: { type: String },
    eyeColor: { type: String },
    clothingDescription: { type: String }
  },
  location: {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  locationName: { type: String },
  status: {
    type: String,
    enum: ['pending', 'active', 'critical', 'resolved', 'rejected'],
    default: 'pending'
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contactInfo: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String }
  },
  sightings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sighting' }],
  adminNotes: { type: String },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date },
  resolvedAt: { type: Date },
  isPublic: { type: Boolean, default: false }
}, { timestamps: true });

reportSchema.index({ location: '2dsphere' });
reportSchema.index({ status: 1 });
reportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
