const Sighting    = require('../models/Sighting');
const Report      = require('../models/Report');
const Notification = require('../models/Notification');
const User        = require('../models/User');
const { sendEmail, sightingVerifiedEmail, buildFoundText, caseId } = require('../config/email');

exports.createSighting = async (req, res) => {
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report)          return res.status(404).json({ success: false, message: 'Report not found' });
    if (!report.isPublic) return res.status(400).json({ success: false, message: 'Cannot add sighting to this report' });

    const sightingData = {
      ...req.body,
      report: req.params.reportId,
      submittedBy: req.user._id,
      status: 'pending',
      isPublic: false
    };
    if (typeof sightingData.location === 'string') sightingData.location = JSON.parse(sightingData.location);
    if (req.file) sightingData.photo = `/uploads/${req.file.filename}`;

    const sighting = await Sighting.create(sightingData);
    report.sightings.push(sighting._id);
    await report.save();

    // Notify admins
    const admins = await User.find({ role: 'admin' });
    await Promise.all(admins.map(admin =>
      Notification.create({
        user: admin._id, type: 'new_sighting',
        title: `New Sighting: ${report.missingPerson.name}`,
        message: `A community member reported spotting ${report.missingPerson.name} near ${sightingData.locationName || 'an unspecified location'}. Please review and verify.`,
        report: report._id
      })
    ));

    const io = req.app.get('io');
    if (io) io.to('admins').emit('new_sighting', { sighting, reportName: report.missingPerson.name });

    res.status(201).json({ success: true, sighting });
  } catch (error) {
    console.error('createSighting error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPublicSightings = async (req, res) => {
  try {
    const sightings = await Sighting.find({ report: req.params.reportId, isPublic: true })
      .populate('submittedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, sightings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllSightings = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const sightings = await Sighting.find(query)
      .populate('submittedBy', 'name email')
      .populate('report', 'missingPerson status location locationName')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, sightings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSightingStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    // Populate full report (need createdAt for caseId)
    const sighting = await Sighting.findById(req.params.id)
      .populate('report');

    if (!sighting) return res.status(404).json({ success: false, message: 'Sighting not found' });

    sighting.status      = status;
    if (adminNotes) sighting.adminNotes = adminNotes;
    sighting.isPublic    = (status === 'verified');
    sighting.verifiedBy  = req.user._id;
    await sighting.save();

    const io           = req.app.get('io');
    const report       = sighting.report;
    const personName   = report?.missingPerson?.name || 'Unknown Person';
    const locationName = sighting.locationName || report?.locationName || 'a nearby area';
    const cn           = report ? caseId(report) : '';

    // ── VERIFIED: mark case resolved + send "found" notifications ──────────
    if (status === 'verified' && report) {

      // Auto-resolve the parent report (stays public → shows "resolved" badge everywhere)
      await Report.findByIdAndUpdate(report._id, {
        status: 'resolved',
        resolvedAt: new Date(),
        isPublic: true
      });

      // --- Find nearby users (5 km) ---
      let nearbyUsers = [];
      const [lng, lat] = report.location?.coordinates || [0, 0];
      try {
        if (lng !== 0 || lat !== 0) {
          nearbyUsers = await User.find({
            role: 'user',
            location: {
              $near: {
                $geometry: { type: 'Point', coordinates: [lng, lat] },
                $maxDistance: 5000   // 5 km
              }
            }
          }).limit(500);
        }
      } catch (geoErr) { console.warn('Geo query failed:', geoErr.message); }

      // Fallback: users who previously got the missing-person alert
      if (nearbyUsers.length === 0) {
        const prevIds = await Notification.distinct('user', { report: report._id, type: 'new_report' });
        if (prevIds.length > 0) {
          nearbyUsers = await User.find({ _id: { $in: prevIds } });
        } else {
          nearbyUsers = await User.find({ role: 'user' }).limit(500);
        }
      }

      // Exact message: "Update: Sarah Mitchell has been safely found. Thank you for your support."
      const foundMsg   = buildFoundText(personName);
      const foundTitle = `✅ Update: ${personName} Has Been Safely Found`;

      // DB notifications for nearby users
      await Promise.all(nearbyUsers.map(u =>
        Notification.create({
          user: u._id, type: 'case_resolved',
          title: foundTitle,
          message: foundMsg,
          report: report._id
        })
      ));

      // Notify original report submitter separately
      if (report.submittedBy) {
        await Notification.create({
          user: report.submittedBy,
          type: 'case_resolved',
          title: foundTitle,
          message: `${foundMsg} Case ${cn} is now closed.`,
          report: report._id
        });
        if (io) {
          io.to(`user_${report.submittedBy}`).emit('case_resolved', {
            title: foundTitle,
            message: foundMsg,
            personName, locationName, reportId: report._id
          });
        }
      }

      // Real-time socket push to nearby users
      if (io) {
        nearbyUsers.forEach(u =>
          io.to(`user_${u._id}`).emit('case_resolved', {
            title: foundTitle, message: foundMsg, personName, locationName, reportId: report._id
          })
        );
        io.to('all_users').emit('case_resolved', { title: foundTitle, message: foundMsg, personName });
      }

      // Email nearby users
      const emailUsers = nearbyUsers.filter(u => u.email);
      if (emailUsers.length > 0) {
        const tpl = sightingVerifiedEmail(personName, locationName, report._id);
        console.log(`📧 Sending "found" emails to ${emailUsers.length} users…`);
        for (let i = 0; i < emailUsers.length; i += 10) {
          await Promise.allSettled(
            emailUsers.slice(i, i + 10).map(u => sendEmail({ to: u.email, ...tpl }))
          );
        }
      }

      console.log(`✅ Sighting verified → case resolved for ${personName} — notified ${nearbyUsers.length} users (5 km)`);
    }

    // ── REJECTED: only notify the sighting submitter ───────────────────────
    if (status === 'rejected') {
      await Notification.create({
        user: sighting.submittedBy,
        type: 'status_update',
        title: 'Sighting Could Not Be Verified',
        message: `Your reported sighting of ${personName} could not be verified at this time. Thank you for your effort — please submit again if you spot them.`,
        report: report?._id
      });
      if (io) {
        io.to(`user_${sighting.submittedBy}`).emit('notification', { type: 'sighting_rejected', personName });
      }
    }

    res.json({ success: true, sighting });
  } catch (error) {
    console.error('updateSightingStatus error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
