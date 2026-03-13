'use strict';
// Web Push configuration
// VAPID keys must be set in Render environment variables.
// Generate once with: node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k);"
// Then set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on Render.

let webpush = null;

try {
  webpush = require('web-push');
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mail = `mailto:${process.env.EMAIL_USER || 'admin@mpas.com'}`;

  if (pub && priv) {
    webpush.setVapidDetails(mail, pub, priv);
    console.log('✅ Web Push ready (VAPID configured)');
  } else {
    console.warn('⚠️  Web Push: VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY not set — push notifications disabled');
    webpush = null;
  }
} catch (e) {
  console.warn('⚠️  web-push not installed:', e.message);
}

// Send a push notification to a single subscription
async function sendPush(subscription, payload) {
  if (!webpush || !subscription) return { success: false, reason: 'not_configured' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    // 410 = subscription expired/invalid — caller should delete it
    if (err.statusCode === 410 || err.statusCode === 404) {
      return { success: false, expired: true };
    }
    console.warn('Push failed:', err.message);
    return { success: false, error: err.message };
  }
}

// Send push to many users, clean up expired subscriptions
async function sendPushToUsers(users, payload) {
  if (!webpush) return;
  const User = require('../models/User');
  const withSub = users.filter(u => u.pushSubscription);
  if (withSub.length === 0) return;
  console.log(`🔔 Sending push to ${withSub.length} users...`);

  await Promise.allSettled(
    withSub.map(async (u) => {
      const result = await sendPush(u.pushSubscription, payload);
      if (result.expired) {
        // Clean up invalid subscription
        await User.findByIdAndUpdate(u._id, { pushSubscription: null });
      }
    })
  );
}

module.exports = { sendPush, sendPushToUsers, getVapidPublicKey: () => process.env.VAPID_PUBLIC_KEY || '' };
