/**
 * MPAS Email Service
 * ══════════════════════════════════════════════════════════
 *  HOW TO CONFIGURE (Gmail — easiest):
 *
 *  1. Enable 2-Step Verification on your Google account:
 *     https://myaccount.google.com/security
 *
 *  2. Create an App Password:
 *     https://myaccount.google.com/apppasswords
 *     → Select app: Mail  → Generate → copy the 16-char code
 *
 *  3. Create  backend/.env  (copy from .env.example) and set:
 *       EMAIL_USER=you@gmail.com
 *       EMAIL_PASS=abcd efgh ijkl mnop    ← spaces are OK
 *
 *  4. Restart the server — you'll see:
 *       ✅ Email ready → Gmail (you@gmail.com)
 * ══════════════════════════════════════════════════════════
 */

'use strict';

const nodemailer = require('nodemailer');

const CLIENT = process.env.CLIENT_URL || 'http://localhost:3000';

/* ── build transporter once at startup ─────────────────────────────── */
function _makeTransporter () {
  // Gmail App-Password (recommended)
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const pass = process.env.EMAIL_PASS.replace(/\s+/g, '');   // strip spaces
    console.log(`\n✅ Email service: Gmail (${process.env.EMAIL_USER})\n`);
    return nodemailer.createTransport({
      service : 'gmail',
      auth    : { user: process.env.EMAIL_USER, pass },
    });
  }

  // Custom SMTP (Outlook / Yahoo / SendGrid / etc.)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log(`\n✅ Email service: SMTP (${process.env.SMTP_HOST})\n`);
    return nodemailer.createTransport({
      host   : process.env.SMTP_HOST,
      port   : Number(process.env.SMTP_PORT) || 587,
      secure : process.env.SMTP_SECURE === 'true',
      auth   : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  // No credentials — log-only
  console.warn('\n⚠️  EMAIL NOT CONFIGURED');
  console.warn('   Emails will be printed to console instead of sent.');
  console.warn('   → Create backend/.env with EMAIL_USER + EMAIL_PASS\n');
  return null;
}

const transporter = _makeTransporter();

const FROM = process.env.EMAIL_FROM
  || (process.env.EMAIL_USER  ? `"MPAS Alert" <${process.env.EMAIL_USER}>`  : null)
  || (process.env.SMTP_USER   ? `"MPAS Alert" <${process.env.SMTP_USER}>`   : null)
  || '"MPAS Alert" <alerts@mpas.community>';

/* ── sendEmail ──────────────────────────────────────────────────────── */
async function sendEmail ({ to, subject, html, text }) {
  if (!transporter) {
    console.log('\n📧 ─── EMAIL LOG (not sent — no credentials) ────');
    console.log(`   To:      ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body:    ${(text || '').slice(0, 200)}…`);
    console.log('─────────────────────────────────────────────────\n');
    return { success: false, reason: 'not_configured' };
  }

  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html, text });
    console.log(`📧 Sent → ${to}  (id: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Email failed → ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/* ── helpers ────────────────────────────────────────────────────────── */
function _fmt (d) {
  if (!d) return 'an unknown time';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    + ' at '
    + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function caseId (report) {
  const year = new Date(report.createdAt || Date.now()).getFullYear();
  const tail = report._id.toString().slice(-4).toUpperCase();
  return `#MPR-${year}-${tail}`;
}

function buildMissingAlertText (report) {
  const mp = report.missingPerson || {};
  const cn = caseId(report);
  const parts = [mp.name];
  if (mp.age)       parts.push(String(mp.age));
  if (mp.gender)    parts.push(mp.gender);
  if (mp.height)    parts.push(mp.height);
  if (mp.weight)    parts.push(`${mp.weight} lbs`);
  if (mp.hairColor) parts.push(`${mp.hairColor} hair`);
  if (mp.eyeColor)  parts.push(`${mp.eyeColor} eyes`);
  const clothing = mp.clothingDescription ? ` wearing ${mp.clothingDescription}` : '';
  return (
    `Community Alert: ${parts.join(', ')}, reported missing. ` +
    `Last seen ${_fmt(mp.lastSeenDate)} near ${report.locationName || 'your area'}${clothing}. ` +
    `Case ${cn}. We urgently need your help\u2014report any sightings immediately.`
  );
}

function buildFoundText (name) {
  return `Update: ${name} has been safely found. Thank you for your support.`;
}

/* ── missingPersonAlertEmail ────────────────────────────────────────── */
function missingPersonAlertEmail (report) {
  const mp       = report.missingPerson || {};
  const cn       = caseId(report);
  const bodyText = buildMissingAlertText(report);

  const rows = [
    ['Age',      mp.age],
    ['Gender',   mp.gender],
    ['Height',   mp.height],
    ['Weight',   mp.weight ? `${mp.weight} lbs` : null],
    ['Hair',     mp.hairColor],
    ['Eyes',     mp.eyeColor],
    ['Last Seen', _fmt(mp.lastSeenDate)],
    ['Location', report.locationName],
    ['Clothing', mp.clothingDescription],
  ]
    .filter(([, v]) => v)
    .map(([l, v]) => `
      <tr>
        <td style="padding:7px 0;color:#6B7280;font-size:13px;width:110px;font-weight:500;vertical-align:top">${l}</td>
        <td style="padding:7px 0;color:#0D3B4C;font-size:13px;font-weight:600">${v}</td>
      </tr>`)
    .join('');

  return {
    subject : `🚨 Missing Person Alert: ${mp.name || 'Unknown'} — ${cn}`,
    text    : bodyText,
    html    : `<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
    </head>
    <body style="margin:0;padding:0;background:#e8edf2;font-family:Arial,sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf2;padding:24px 0">
    <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(13,59,76,.15)">

      <!-- header -->
      <tr><td style="background:#0D3B4C;padding:20px 28px">
        <table width="100%"><tr>
          <td><span style="font-size:20px;font-weight:800;color:#fff">MPAS</span></td>
          <td align="right"><span style="background:#E39A2D;color:#1a0e00;padding:4px 12px;border-radius:50px;font-size:11px;font-weight:700;text-transform:uppercase">Missing Person Alert</span></td>
        </tr></table>
      </td></tr>

      <!-- urgent banner -->
      <tr><td style="background:#dc2626;padding:12px 28px;text-align:center">
        <p style="margin:0;color:#fff;font-size:14px;font-weight:700">⚠️ URGENT — PLEASE READ AND SHARE</p>
      </td></tr>

      <!-- body -->
      <tr><td style="padding:24px 28px">
        <h1 style="margin:0 0 4px;font-size:22px;color:#0D3B4C;font-weight:800">${mp.name || 'Unknown'}</h1>
        <p style="margin:0 0 18px;color:#6B7280;font-size:13px">Case ${cn}</p>

        <table width="100%" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:18px">
          <tr><td style="padding:14px 18px">
            <table style="border-collapse:collapse;width:100%">${rows}</table>
          </td></tr>
        </table>

        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:18px">
          <p style="margin:0;color:#92400e;font-size:13.5px;line-height:1.7">
            <strong>We urgently need your help.</strong>
            If you have seen this person, please report immediately through MPAS or call <strong>112</strong>.
          </p>
        </div>

        <div style="text-align:center;margin-bottom:18px">
          <a href="${CLIENT}/sightings"
            style="display:inline-block;background:#E39A2D;color:#1a0e00;padding:12px 28px;border-radius:50px;text-decoration:none;font-weight:700;font-size:14px">
            Report a Sighting →
          </a>
        </div>

        <p style="color:#9ca3af;font-size:11.5px;text-align:center;line-height:1.6;margin:0">
          Emergency: 112 &nbsp;·&nbsp; Missing Child Helpline: 1098
        </p>
      </td></tr>

      <!-- footer -->
      <tr><td style="background:#0a1929;padding:14px 28px;text-align:center">
        <p style="margin:0;color:rgba(255,255,255,.4);font-size:11px">© 2026 MPAS — Missing Person Alert System</p>
      </td></tr>
    </table>
    </td></tr>
    </table>
    </body></html>`,
  };
}

/* ── sightingVerifiedEmail ──────────────────────────────────────────── */
function sightingVerifiedEmail (personName, locationName, reportId) {
  const foundText = buildFoundText(personName);
  return {
    subject : `✅ Update: ${personName} Has Been Safely Found`,
    text    : `${foundText} They were spotted near ${locationName}.`,
    html    : `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="margin:0;padding:0;background:#e8edf2;font-family:Arial,sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf2;padding:24px 0">
    <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(13,59,76,.15)">
      <tr><td style="background:#0D3B4C;padding:20px 28px">
        <span style="font-size:20px;font-weight:800;color:#fff">MPAS</span>
      </td></tr>
      <tr><td style="background:#16a34a;padding:12px 28px;text-align:center">
        <p style="margin:0;color:#fff;font-size:14px;font-weight:700">✅ CASE RESOLVED — PERSON FOUND</p>
      </td></tr>
      <tr><td style="padding:32px 28px;text-align:center">
        <div style="font-size:52px;margin-bottom:14px">🎉</div>
        <h1 style="margin:0 0 10px;font-size:22px;color:#0D3B4C;font-weight:800">${personName} Has Been Found</h1>
        <p style="color:#6B7280;font-size:14px;line-height:1.75;margin:0 0 20px">
          <strong>${personName}</strong> was safely spotted near <strong>${locationName}</strong>.
        </p>
        <div style="background:#dcfce7;border-radius:12px;padding:18px;margin-bottom:22px;border:1px solid #86efac">
          <p style="margin:0;color:#15803d;font-weight:600;font-size:14px;line-height:1.6">
            ${foundText}<br/>Your community efforts made a real difference. 💚
          </p>
        </div>
        <a href="${CLIENT}/alerts/${reportId}"
          style="display:inline-block;background:#0D3B4C;color:#fff;padding:12px 28px;border-radius:50px;text-decoration:none;font-weight:700;font-size:14px">
          View Case Details
        </a>
      </td></tr>
      <tr><td style="background:#0a1929;padding:14px 28px;text-align:center">
        <p style="margin:0;color:rgba(255,255,255,.4);font-size:11px">© 2026 MPAS — Emergency: 112</p>
      </td></tr>
    </table>
    </td></tr>
    </table>
    </body></html>`,
  };
}

/* ── resolvedEmail ──────────────────────────────────────────────────── */
function resolvedEmail (personName) {
  const foundText = buildFoundText(personName);
  return {
    subject : `✅ Update: ${personName} Has Been Safely Found`,
    text    : foundText,
    html    : `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
    <body style="margin:0;padding:0;background:#e8edf2;font-family:Arial,sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf2;padding:24px 0">
    <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(13,59,76,.15)">
      <tr><td style="background:#0D3B4C;padding:20px 28px">
        <span style="font-size:20px;font-weight:800;color:#fff">MPAS</span>
      </td></tr>
      <tr><td style="background:#16a34a;padding:12px 28px;text-align:center">
        <p style="margin:0;color:#fff;font-size:14px;font-weight:700">✅ CASE RESOLVED</p>
      </td></tr>
      <tr><td style="padding:32px 28px;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <h1 style="margin:0 0 10px;font-size:22px;color:#0D3B4C;font-weight:800">${personName} Has Been Found</h1>
        <div style="background:#dcfce7;border-radius:12px;padding:18px;margin:20px 0;border:1px solid #86efac">
          <p style="margin:0;color:#15803d;font-weight:600;font-size:14px">${foundText}</p>
        </div>
      </td></tr>
      <tr><td style="background:#0a1929;padding:14px 28px;text-align:center">
        <p style="margin:0;color:rgba(255,255,255,.4);font-size:11px">© 2026 MPAS — Emergency: 112</p>
      </td></tr>
    </table>
    </td></tr>
    </table>
    </body></html>`,
  };
}

module.exports = {
  sendEmail,
  missingPersonAlertEmail,
  sightingVerifiedEmail,
  resolvedEmail,
  buildMissingAlertText,
  buildFoundText,
  caseId,
};
