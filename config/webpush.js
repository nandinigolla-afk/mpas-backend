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
  if (!webpush) {
    console.warn('⚠️  Web Push not configured — skipping push notifications');
    return;
  }
  const User = require('../models/User');

  // Re-fetch users with pushSubscription field explicitly
  // (in case the caller's query didn't include it)
  const userIds = users.map(u => u._id);
  const freshUsers = await User.find({ _id: { $in: userIds }, pushSubscription: { $ne: null } })
    .select('_id pushSubscription email');

  if (freshUsers.length === 0) {
    console.log('🔔 No users with push subscriptions');
    return;
  }

  console.log(`🔔 Sending push to ${freshUsers.length} users...`);

  await Promise.allSettled(
    freshUsers.map(async (u) => {
      const result = await sendPush(u.pushSubscription, payload);
      if (result.expired) {
        await User.findByIdAndUpdate(u._id, { pushSubscription: null });
        console.log(`🔔 Removed expired subscription for ${u.email}`);
      }
    })
  );
  console.log(`🔔 Push sent to ${freshUsers.length} users`);
}

module.exports = { sendPush, sendPushToUsers, getVapidPublicKey: () => process.env.VAPID_PUBLIC_KEY || '' };
