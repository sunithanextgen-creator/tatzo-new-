const fs = require('fs');
const assert = require('assert');

const firestore = fs.readFileSync('firestore.rules', 'utf8');
const storage = fs.readFileSync('storage.rules', 'utf8');

const firestoreContracts = [
  "after == 'pending_verification'",
  "before in ['unsubmitted', 'rejected', 'needs_more_samples']",
  "request.resource.data.status == 'pending_verification'",
  "ownerVerificationReviewFieldsSafe()",
  "ownerCannotChangeAdminArtistAccess()",
  "ownerArtistAccessFieldsUnchanged()",
  "allow create: if isAdmin() || (",
];

const storageContracts = [
  'match /verifications/{uid}/portfolio-images/{fileName}',
  'match /verifications/{uid}/portfolio-videos/{fileName}',
  'match /posts/{uid}/images/{fileName}',
  'match /posts/{uid}/videos/{fileName}',
  'return isAdmin() || (isOwner(uid) && isApprovedArtist(uid));',
  'match /verification/{uid}/portfolioImages/{fileName}',
  'allow create, update, delete: if false;',
];

firestoreContracts.forEach((contract) => assert.ok(firestore.includes(contract), `Missing Firestore contract: ${contract}`));
storageContracts.forEach((contract) => assert.ok(storage.includes(contract), `Missing Storage contract: ${contract}`));
assert.ok(!firestore.includes("request.resource.data.status == 'pending'\n        && request.resource.data.get('certificateReviewStatus'"), 'Legacy pending submission write is still allowed.');

console.log(`Security rule contracts passed: firestore=${firestoreContracts.length}, storage=${storageContracts.length}`);
