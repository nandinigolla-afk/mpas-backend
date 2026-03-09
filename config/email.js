'use strict';

// Brevo HTTP API — works on Render free tier (no SMTP ports needed)
// Get your API key: brevo.com → Settings → API Keys → Generate

const CLIENT = process.env.CLIENT_URL || 'http://localhost:3000';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const FROM_EMAIL = process.env.EMAIL_USER || 'gollanandini45@gmail.com';
const FROM_NAME  = 'MPAS Alert';

async function sendEmail({ to, subject, html, text }) {
  if (!BREVO_API_KEY) {
    console.log(`📧 [NOT SENT — no BREVO_API_KEY] To: ${to} | Subject: ${subject}`);
    return { success: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'api-key':      BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender:   { name: FROM_NAME, email: FROM_EMAIL },
        to:       [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`📧 Sent → ${to} (id: ${data.messageId})`);
      return { success: true, messageId: data.messageId };
    } else {
      console.error(`❌ Email failed → ${to}:`, JSON.stringify(data));
      return { success: false, error: JSON.stringify(data) };
    }
  } catch (err) {
    console.error(`❌ Email failed → ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Log email status on startup
if (BREVO_API_KEY) {
  console.log(`\n✅ Email service: Brevo HTTP API (${FROM_EMAIL})\n`);
} else {
  console.warn('\n⚠️  EMAIL NOT CONFIGURED — add BREVO_API_KEY to Render environment\n');
}

function _fmt(d) {
  if (!d) return 'an unknown time';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    + ' at '
    + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function caseId(report) {
  return `#MPR-${new Date(report.createdAt || Date.now()).getFullYear()}-${report._id.toString().slice(-4).toUpperCase()}`;
}

function buildMissingAlertText(report) {
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
  return `Community Alert: ${parts.join(', ')}, reported missing. Last seen ${_fmt(mp.lastSeenDate)} near ${report.locationName || 'your area'}${clothing}. Case ${cn}. We urgently need your help\u2014report any sightings immediately.`;
}

function buildFoundText(name) {
  return `Update: ${name} has been safely found. Thank you for your support.`;
}

function missingPersonAlertEmail(report) {
  const mp  = report.missingPerson || {};
  const cn  = caseId(report);
  const txt = buildMissingAlertText(report);
  const rows = [
    ['Age', mp.age], ['Gender', mp.gender], ['Height', mp.height],
    ['Weight', mp.weight ? `${mp.weight} lbs` : null],
    ['Hair', mp.hairColor], ['Eyes', mp.eyeColor],
    ['Last Seen', _fmt(mp.lastSeenDate)],
    ['Location', report.locationName], ['Clothing', mp.clothingDescription],
  ].filter(([,v]) => v)
   .map(([l,v]) => `<tr><td style="padding:7px 0;color:#6B7280;font-size:13px;width:110px;font-weight:500">${l}</td><td style="padding:7px 0;color:#0D3B4C;font-size:13px;font-weight:600">${v}</td></tr>`)
   .join('');

  return {
    subject: `🚨 Missing Person Alert: ${mp.name || 'Unknown'} — ${cn}`,
    text: txt,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#e8edf2;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf2;padding:24px 0">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(13,59,76,.15)">
  <tr><td style="background:#0D3B4C;padding:20px 28px">
    <table width="100%"><tr>
      <td><span style="font-size:20px;font-weight:800;color:#fff">MPAS</span></td>
      <td align="right"><span style="background:#E39A2D;color:#1a0e00;padding:4px 12px;border-radius:50px;font-size:11px;font-weight:700">Missing Person Alert</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#dc2626;padding:12px 28px;text-align:center">
    <p style="margin:0;color:#fff;font-size:14px;font-weight:700">⚠️ URGENT — PLEASE READ AND SHARE</p>
  </td></tr>
  <tr><td style="padding:24px 28px">
    <h1 style="margin:0 0 4px;font-size:22px;color:#0D3B4C;font-weight:800">${mp.name || 'Unknown'}</h1>
    <p style="margin:0 0 18px;color:#6B7280;font-size:13px">Case ${cn}</p>
    <table width="100%" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:18px">
      <tr><td style="padding:14px 18px"><table style="width:100%">${rows}</table></td></tr>
    </table>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:18px">
      <p style="margin:0;color:#92400e;font-size:13.5px;line-height:1.7">
        <strong>We urgently need your help.</strong> Report immediately through MPAS or call <strong>112</strong>.
      </p>
    </div>
    <div style="text-align:center;margin-bottom:18px">
      <a href="${CLIENT}/sightings" style="display:inline-block;background:#E39A2D;color:#1a0e00;padding:12px 28px;border-radius:50px;text-decoration:none;font-weight:700;font-size:14px">Report a Sighting →</a>
    </div>
  </td></tr>
  <tr><td style="background:#0a1929;padding:14px 28px;text-align:center">
    <p style="margin:0;color:rgba(255,255,255,.4);font-size:11px">© 2026 MPAS — Emergency: 112</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
  };
}

function sightingVerifiedEmail(personName, locationName, reportId) {
  const foundText = buildFoundText(personName);
  return {
    subject: `✅ Update: ${personName} Has Been Safely Found`,
    text: `${foundText} They were spotted near ${locationName}.`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#e8edf2;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf2;padding:24px 0"><tr><td align="center">
<table style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;width:100%">
  <tr><td style="background:#0D3B4C;padding:20px 28px"><span style="font-size:20px;font-weight:800;color:#fff">MPAS</span></td></tr>
  <tr><td style="background:#16a34a;padding:12px 28px;text-align:center"><p style="margin:0;color:#fff;font-weight:700">✅ PERSON FOUND</p></td></tr>
  <tr><td style="padding:32px 28px;text-align:center">
    <div style="font-size:52px;margin-bottom:14px">🎉</div>
    <h1 style="margin:0 0 10px;font-size:22px;color:#0D3B4C;font-weight:800">${personName} Has Been Found</h1>
    <div style="background:#dcfce7;border-radius:12px;padding:18px;margin-bottom:22px;border:1px solid #86efac">
      <p style="margin:0;color:#15803d;font-weight:600;font-size:14px">${foundText}</p>
    </div>
    <a href="${CLIENT}/alerts/${reportId}" style="display:inline-block;background:#0D3B4C;color:#fff;padding:12px 28px;border-radius:50px;text-decoration:none;font-weight:700">View Case</a>
  </td></tr>
  <tr><td style="background:#0a1929;padding:14px 28px;text-align:center"><p style="margin:0;color:rgba(255,255,255,.4);font-size:11px">© 2026 MPAS</p></td></tr>
</table></td></tr></table></body></html>`,
  };
}

function resolvedEmail(personName) {
  const foundText = buildFoundText(personName);
  return {
    subject: `✅ Update: ${personName} Has Been Safely Found`,
    text: foundText,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#e8edf2;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf2;padding:24px 0"><tr><td align="center">
<table style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;width:100%">
  <tr><td style="background:#0D3B4C;padding:20px 28px"><span style="font-size:20px;font-weight:800;color:#fff">MPAS</span></td></tr>
  <tr><td style="background:#16a34a;padding:12px 28px;text-align:center"><p style="margin:0;color:#fff;font-weight:700">✅ CASE RESOLVED</p></td></tr>
  <tr><td style="padding:32px 28px;text-align:center">
    <h1 style="color:#0D3B4C">${personName} Has Been Found</h1>
    <div style="background:#dcfce7;border-radius:12px;padding:18px;border:1px solid #86efac">
      <p style="margin:0;color:#15803d;font-weight:600">${foundText}</p>
    </div>
  </td></tr>
</table></td></tr></table></body></html>`,
  };
}

module.exports = { sendEmail, missingPersonAlertEmail, sightingVerifiedEmail, resolvedEmail, buildMissingAlertText, buildFoundText, caseId };
