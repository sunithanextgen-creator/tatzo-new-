/*
Usage:
  node scripts/set-admin-claim.js <user-email-or-uid>

Requirements:
  1) Firebase service account JSON path in env FIREBASE_SERVICE_ACCOUNT
  2) Optional FIREBASE_PROJECT_ID (otherwise from service account)
*/

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const target = process.argv[2];
if (!target) {
  console.error('Missing target user email or uid.');
  process.exit(1);
}

const saPath = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saPath) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT to your service account JSON path.');
  process.exit(1);
}

const absolute = path.resolve(saPath);
if (!fs.existsSync(absolute)) {
  console.error('Service account file not found:', absolute);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(absolute, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
});

(async () => {
  try {
    let userRecord;
    if (target.includes('@')) {
      userRecord = await admin.auth().getUserByEmail(target);
    } else {
      userRecord = await admin.auth().getUser(target);
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    console.log('Admin claim set successfully for uid:', userRecord.uid);
    console.log('User must sign out and sign in again to refresh token.');
  } catch (err) {
    console.error('Failed to set admin claim:', err.message || err);
    process.exit(1);
  }
})();
