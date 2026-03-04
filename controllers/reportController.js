'use strict';
const Report       = require('../models/Report');
const Notification = require('../models/Notification');
const User         = require('../models/User');
const {
  sendEmail, missingPersonAlertEmail, resolvedEmail,
  buildMissingAlertText, buildFoundText, caseId,
} = require('../config/email');

/* ── helpers ────────────────────────────────────────────────────────── */
async function getNearbyUsers (coords) {
  const [lng, lat] = coords || [0, 0];

  // Try geo-proximity first (requires 2dsphere index + users with location set)
  if (lng !== 0 || lat !== 0) {
    try {
      const users = await User.find({
        role     : 'user',
        location : {
          $near : {
            $geometry   : { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: 5000,   // 5 km
          },
        },
      }).limit(500);
      if (users.length > 0) {
        console.log(`📍 Found ${users.length} nearby users within 5 km`);
        return users;
      }
    } catch (err) {
      console.warn('⚠️  Geo query failed (index missing?), falling back to all users:', err.message);
    }
  }

  // Fallback: everyone
  const all = await User.find({ role: 'user' }).limit(500);
  console.log(`📢 Broadcasting to all ${all.length} users (no geo match)`);
  return all;
}

async function sendBatch (users, emailFn) {
  const withEmail = users.filter(u => u.email);
  if (withEmail.length === 0) return;
  console.log(`📧 Sending emails to ${withEmail.length} users…`);
  for (let i = 0; i < withEmail.length; i += 10) {
    await Promise.allSettled(
      withEmail.slice(i, i + 10).map(u => sendEmail({ to: u.email, ...emailFn }))
    );
  }
}

/* ════════════════════════════════════════════════════════════════════ */

exports.createReport = async (req, res) => {
  try {
    const reportData = {
      ...req.body,
      submittedBy : req.user._id,
      status      : 'pending',
      isPublic    : false,
    };

    if (req.file) {
      const mp = typeof reportData.missingPerson === 'string'
        ? JSON.parse(reportData.missingPerson) : reportData.missingPerson;
      mp.photo = `/uploads/${req.file.filename}`;
      reportData.missingPerson = mp;
    }

    if (typeof reportData.missingPerson === 'string') reportData.missingPerson = JSON.parse(reportData.missingPerson);
    if (typeof reportData.location      === 'string') reportData.location      = JSON.parse(reportData.location);
    if (typeof reportData.contactInfo   === 'string') reportData.contactInfo   = JSON.parse(reportData.contactInfo);

    const report = await Report.create(reportData);

    // Notify admins
    const admins = await User.find({ role: 'admin' });
    await Promise.all(admins.map(admin => Notification.create({
      user   : admin._id,
      type   : 'new_report',
      title  : 'New Missing Person Report',
      message: `A new report for ${reportData.missingPerson.name} has been submitted and requires review.`,
      report : report._id,
    })));

    const io = req.app.get('io');
    if (io) io.to('admins').emit('new_report', { report });

    res.status(201).json({ success: true, report });
  } catch (err) {
    console.error('createReport error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPublicReports = async (req, res) => {
  try {
    const reports = await Report
      .find({ isPublic: true, status: { $in: ['active', 'critical', 'resolved'] } })
      .select('-contactInfo').sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getReportById = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).select('-contactInfo');
    if (!report || !report.isPublic)
      return res.status(404).json({ success: false, message: 'Report not found' });
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUserReports = async (req, res) => {
  try {
    const reports = await Report.find({ submittedBy: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = status ? { status } : {};
    const total = await Report.countDocuments(query);
    const reports = await Report.find(query)
      .populate('submittedBy', 'name email')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.json({ success: true, reports, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateReportStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const report = await Report.findById(req.params.id).populate('submittedBy', 'name email');
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const prevStatus = report.status;
    report.status = status;
    if (adminNotes) report.adminNotes = adminNotes;

    if (status === 'active' || status === 'critical') {
      report.isPublic   = true;
      report.verifiedBy = req.user._id;
      report.verifiedAt = new Date();
    }
    if (status === 'resolved') {
      report.isPublic   = true;
      report.resolvedAt = new Date();
    }
    if (status === 'rejected') {
      report.isPublic = false;
    }

    await report.save();

    const io  = req.app.get('io');
    const mp  = report.missingPerson;
    const cn  = caseId(report);

    /* ── ACTIVATED (pending → active / critical) ───────────────────── */
    if ((status === 'active' || status === 'critical') && prevStatus === 'pending') {
      const alertMsg   = buildMissingAlertText(report);
      const notifTitle = status === 'critical'
        ? `🚨 CRITICAL: ${mp.name} is Missing`
        : `⚠️ Community Alert: ${mp.name} is Missing`;

      const users = await getNearbyUsers(report.location?.coordinates);

      // In-app notifications
      await Promise.all(users.map(u => Notification.create({
        user   : u._id,
        type   : 'new_report',
        title  : notifTitle,
        message: alertMsg,
        report : report._id,
      })));

      // Socket
      if (io) {
        users.forEach(u => io.to(`user_${u._id}`).emit('new_alert', {
          title: notifTitle, message: alertMsg,
          report: { _id: report._id, missingPerson: mp, status, locationName: report.locationName },
        }));
        io.to('all_users').emit('new_alert', {
          title: notifTitle, message: alertMsg,
          report: { _id: report._id, missingPerson: mp, status, locationName: report.locationName },
        });
      }

      // Emails
      await sendBatch(users, missingPersonAlertEmail(report));
      console.log(`✅ Case activated: ${mp.name} — ${cn} — notified ${users.length} users`);
    }

    /* ── RESOLVED (admin manually marks resolved) ───────────────────── */
    if (status === 'resolved' && (prevStatus === 'active' || prevStatus === 'critical')) {
      const foundMsg   = buildFoundText(mp.name);
      const foundTitle = `✅ Update: ${mp.name} Has Been Safely Found`;

      // Who to notify: everyone who got the original alert
      const notifiedIds = await Notification.distinct('user', { report: report._id, type: 'new_report' });

      await Promise.all(notifiedIds.map(uid => Notification.create({
        user   : uid,
        type   : 'case_resolved',
        title  : foundTitle,
        message: foundMsg,
        report : report._id,
      })));

      if (io) {
        notifiedIds.forEach(uid => io.to(`user_${uid}`).emit('case_resolved', {
          title: foundTitle, message: foundMsg, personName: mp.name, reportId: report._id,
        }));
        io.to('all_users').emit('case_resolved', { title: foundTitle, message: foundMsg, personName: mp.name });
      }

      const resolvedUsers = await User.find({ _id: { $in: notifiedIds } });
      await sendBatch(resolvedUsers, resolvedEmail(mp.name));
      console.log(`✅ Case resolved: ${mp.name} — notified ${notifiedIds.length} users`);
    }

    /* ── Always notify the report submitter ─────────────────────────── */
    const submitterId = report.submittedBy._id || report.submittedBy;
    const submitterMsg =
      status === 'active'   ? `Your report for ${mp.name} has been verified and is now live to the community.`
      : status === 'critical' ? `Your report for ${mp.name} has been marked CRITICAL. Authorities have been alerted.`
      : status === 'resolved' ? buildFoundText(mp.name)
      : status === 'rejected' ? `Your report for ${mp.name} could not be verified. Contact support if you believe this is an error.`
      : `Your report for ${mp.name} status changed to ${status}.`;

    await Notification.create({
      user   : submitterId,
      type   : 'status_update',
      title  : `Report Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: submitterMsg,
      report : report._id,
    });

    if (io) io.to(`user_${submitterId}`).emit('notification', { type: 'status_update', status, personName: mp.name });

    res.json({ success: true, report });
  } catch (err) {
    console.error('updateReportStatus error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [total, active, critical, resolved, pending] = await Promise.all([
      Report.countDocuments(),
      Report.countDocuments({ status: 'active' }),
      Report.countDocuments({ status: 'critical' }),
      Report.countDocuments({ status: 'resolved' }),
      Report.countDocuments({ status: 'pending' }),
    ]);
    const recent = await Report.find().sort({ createdAt: -1 }).limit(5).populate('submittedBy', 'name');
    res.json({ success: true, stats: { total, active, critical, resolved, pending, recent } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
