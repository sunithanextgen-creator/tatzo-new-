/*
Usage:
  npm run backfill-artist-visibility
  npm run backfill-artist-visibility -- --apply

Requires:
  FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json
  Optional FIREBASE_PROJECT_ID
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
const missingFlagPatch = (data, fields) => fields.reduce((patch, field) => {
  if (data[field] === undefined) patch[field] = true;
  return patch;
}, {});

(async () => {
  const approvedUsers = await db.collection('users')
    .where('role', '==', 'artist')
    .where('verificationStatus', '==', 'approved')
    .get();
  const changes = [];

  for (let offset = 0; offset < approvedUsers.docs.length; offset += 400) {
    const page = approvedUsers.docs.slice(offset, offset + 400);
    const artistRefs = page.map((userDoc) => db.collection('artists').doc(userDoc.id));
    const artistSnapshots = artistRefs.length ? await db.getAll(...artistRefs) : [];
    const artistByUid = new Map(artistSnapshots.map((snapshot) => [snapshot.id, snapshot]));
    const batch = db.batch();

    page.forEach((userDoc) => {
      const user = userDoc.data() || {};
      const uid = userDoc.id;
      const artistSnapshot = artistByUid.get(uid);
      const artist = artistSnapshot?.exists ? artistSnapshot.data() || {} : {};
      const userPatch = missingFlagPatch(user, ['postingEnabled', 'artistVisible', 'bookingVisible']);
      const artistPatch = missingFlagPatch(artist, ['isVisible', 'artistVisible', 'bookingVisible', 'postingEnabled']);

      if (!artistSnapshot?.exists) {
        Object.assign(artistPatch, {
          uid,
          role: 'artist',
          verificationStatus: 'approved',
          displayName: user.displayName || user.artistName || '',
          artistName: user.artistName || user.displayName || '',
          studioName: user.studioName || '',
          locationCity: user.locationCity || '',
          locationArea: user.locationArea || '',
          location: user.location || [user.locationArea, user.locationCity].filter(Boolean).join(', '),
          profileImageUrl: user.profileImageUrl || '',
          styles: Array.isArray(user.styles) ? user.styles : [],
        });
      } else if (artist.verificationStatus === undefined) {
        artistPatch.verificationStatus = 'approved';
      }

      if (Object.keys(userPatch).length) {
        changes.push({ uid, document: `users/${uid}`, fields: userPatch });
        if (applyChanges) batch.set(userDoc.ref, { ...userPatch, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      if (Object.keys(artistPatch).length) {
        changes.push({ uid, document: `artists/${uid}`, fields: artistPatch });
        if (applyChanges) batch.set(db.collection('artists').doc(uid), { ...artistPatch, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    });

    if (applyChanges) await batch.commit();
  }

  changes.forEach((change) => console.log(`[${applyChanges ? 'APPLY' : 'DRY-RUN'}] ${change.document}`, change.fields));
  console.log(`[backfill-artist-visibility] mode=${applyChanges ? 'apply' : 'dry-run'} approvedArtists=${approvedUsers.size} documents=${changes.length}`);
})().catch((error) => {
  console.error('[backfill-artist-visibility] failed', error);
  process.exit(1);
});
