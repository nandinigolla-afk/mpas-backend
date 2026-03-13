'use strict';
const express = require('express');
const router  = express.Router();
const User    = require('../models/User');

// Temporary debug route — remove after fixing
// GET /api/debug/users-location
router.get('/users-location', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('name email location')
      .limit(50);

    const result = users.map(u => ({
      name       : u.name,
      email      : u.email,
      coordinates: u.location?.coordinates || 'NOT SET',
      hasLocation: u.location?.coordinates?.[0] !== 0 || u.location?.coordinates?.[1] !== 0,
    }));

    res.json({ total: result.length, users: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug/nearby?lng=XX&lat=YY&dist=5000
router.get('/nearby', async (req, res) => {
  try {
    const lng  = parseFloat(req.query.lng);
    const lat  = parseFloat(req.query.lat);
    const dist = parseInt(req.query.dist) || 5000;

    if (isNaN(lng) || isNaN(lat))
      return res.status(400).json({ error: 'Pass ?lng=XX&lat=YY' });

    const nearby = await User.find({
      role    : 'user',
      location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: dist } },
    }).select('name email location').limit(50);

    res.json({ searchCoords: [lng, lat], maxDistance: dist, found: nearby.length, users: nearby.map(u => ({ name: u.name, email: u.email, coords: u.location?.coordinates })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/debug/reports — show recent reports with their coordinates
router.get('/reports', async (req, res) => {
  try {
    const Report = require('../models/Report');
    const reports = await Report.find().sort({ createdAt: -1 }).limit(10)
      .select('missingPerson.name status location locationName createdAt');
    res.json({ reports: reports.map(r => ({
      name       : r.missingPerson?.name,
      status     : r.status,
      locationName: r.locationName,
      coordinates: r.location?.coordinates,
      createdAt  : r.createdAt,
    }))});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
