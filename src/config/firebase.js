const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const { getMessaging } = require('firebase-admin/messaging');

const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');

let messaging = null;

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.cert(serviceAccount),
  });
  messaging = getMessaging();
  console.log('Firebase Admin initialized successfully.');
} else {
  console.warn('Firebase serviceAccountKey.json not found. Push notifications will be skipped.');
}

const sendPushNotification = async (tokens, title, body, data = {}) => {
  if (!messaging) {
    console.log(`[FCM Skipped] Push notification "${title}" not sent because Firebase is not configured.`);
    return;
  }
  
  if (!tokens || tokens.length === 0) return;

  const message = {
    notification: {
      title,
      body,
    },
    data,
    tokens,
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(response.successCount + ' messages were sent successfully');
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

module.exports = {
  sendPushNotification,
};
