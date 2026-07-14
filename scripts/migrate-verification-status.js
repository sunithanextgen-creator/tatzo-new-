/*
Usage:
  npm run migrate-verification-status
  npm run migrate-verification-status -- --apply
*/

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const applyChanges = process.argv.includes('--apply');
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountPath) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT to your service account JSON path.');
  process.exit(1);
}
const absolutePath = path.resolve(serviceAccountPath);
if (!fs.existsSync(absolutePath)) {
  console.error('Service account file not found:', absolutePath);
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
});

const db = admin.firestore();

(async () => {
  const legacy = await db.collection('verifications').where('status', '==', 'pending').get();
  let changedUsers = 0;
  for (let offset = 0; offset < legacy.docs.length; offset += 400) {
    const page = legacy.docs.slice(offset, offset + 400);
    const userRefs = page.map((item) => db.collection('users').doc(item.id));
    const userSnapshots = userRefs.length ? await db.getAll(...userRefs) : [];
    const users = new Map(userSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    const batch = db.batch();

    page.forEach((verificationDoc) => {
      const uid = verificationDoc.id;
      console.log(`[${applyChanges ? 'APPLY' : 'DRY-RUN'}] verifications/${uid}: pending -> pending_verification`);
      if (applyChanges) batch.update(verificationDoc.ref, {
        status: 'pending_verification',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const userSnapshot = users.get(uid);
      const userStatus = userSnapshot?.exists ? userSnapshot.data()?.verificationStatus : undefined;
      if (userSnapshot?.exists && (userStatus === undefined || userStatus === 'pending')) {
        changedUsers += 1;
        console.log(`[${applyChanges ? 'APPLY' : 'DRY-RUN'}] users/${uid}: ${userStatus || 'missing'} -> pending_verification`);
        if (applyChanges) batch.set(userSnapshot.ref, {
          verificationStatus: 'pending_verification',
          verificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    if (applyChanges) await batch.commit();
  }
  console.log(`[migrate-verification-status] mode=${applyChanges ? 'apply' : 'dry-run'} verifications=${legacy.size} users=${changedUsers}`);
})().catch((error) => {
  console.error('[migrate-verification-status] failed', error);
  process.exit(1);
});
