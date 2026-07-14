import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';

export const MAX_REPORT_REASON_LENGTH = 300;

export const reportPost = async (params: { postId: string; postOwnerUid?: string; reason: string }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to report a post.');

  const postId = String(params.postId ?? '').trim();
  const reason = String(params.reason ?? '').trim();
  if (!postId) throw new Error('Post not found.');
  if (!reason) throw new Error('Please enter a reason for the report.');
  if (reason.length > MAX_REPORT_REASON_LENGTH) {
    throw new Error(`Report reason must be ${MAX_REPORT_REASON_LENGTH} characters or less.`);
  }

  const reportId = `${postId}_${user.uid}`;
  await setDoc(
    doc(db, 'postReports', reportId),
    {
      id: reportId,
      postId,
      postOwnerUid: String(params.postOwnerUid ?? '').trim() || null,
      reportedByUid: user.uid,
      reportedByEmail: user.email ?? null,
      reason,
      status: 'open',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { reportId };
};
