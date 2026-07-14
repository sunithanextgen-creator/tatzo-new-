/*
Usage:
  npm run backfill-artist-search-fields
  npm run backfill-artist-search-fields -- --apply
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
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id });
const db = admin.firestore();
const normalize = (value) => String(value || '').trim().toLowerCase();

(async () => {
  const artists = await db.collection('users').where('role', '==', 'artist').get();
  let changed = 0;
  for (let offset = 0; offset < artists.docs.length; offset += 400) {
    const batch = db.batch();
    const page = artists.docs.slice(offset, offset + 400);
    page.forEach((item) => {
      const data = item.data() || {};
      const target = {
        emailLower: normalize(data.email),
        artistNameLower: normalize(data.artistName || data.displayName),
        studioNameLower: normalize(data.studioName),
      };
      const patch = Object.fromEntries(Object.entries(target).filter(([key, value]) => data[key] !== value));
      if (!Object.keys(patch).length) return;
      changed += 1;
      console.log(`[${applyChanges ? 'APPLY' : 'DRY-RUN'}] users/${item.id}`, patch);
      if (applyChanges) batch.set(item.ref, { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    if (applyChanges) await batch.commit();
  }
  console.log(`[backfill-artist-search-fields] mode=${applyChanges ? 'apply' : 'dry-run'} artists=${artists.size} changed=${changed}`);
})().catch((error) => {
  console.error('[backfill-artist-search-fields] failed', error);
  process.exit(1);
});
