import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { auth } from '../firebase';
import {
  approveVerification,
  getCertificateUrls,
  getVerificationWithUser,
  rejectVerification,
  rollbackToPending,
} from '../services';
import type { RequestedRole, UserDoc, VerificationDoc } from '../types';

export default function VerificationDetail() {
  const { uid = '' } = useParams();
  const navigate = useNavigate();

  const [verification, setVerification] = useState<VerificationDoc | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [certUrls, setCertUrls] = useState<Array<{ path: string; url: string }>>([]);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const role = useMemo(() => (verification?.requestedRole ?? 'artist') as RequestedRole, [verification]);

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    setError('');

    try {
      const data = await getVerificationWithUser(uid);
      setVerification(data.verification);
      setUserDoc(data.user);

      const paths = data.verification?.certStoragePaths ?? [];
      if (paths.length) {
        const urls = await getCertificateUrls(paths);
        setCertUrls(urls);
      } else {
        setCertUrls([]);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load verification detail.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [uid]);

  const onApprove = async () => {
    if (!verification || !uid) return;
    const adminUid = auth.currentUser?.uid ?? 'admin';
    setBusy(true);
    setError('');
    try {
      await approveVerification({
        uid,
        requestedRole: role,
        adminUid,
        user: userDoc,
        verification,
      });
      navigate('/');
    } catch (e: any) {
      setError(e?.message ?? 'Approve failed.');
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!uid) return;
    const adminUid = auth.currentUser?.uid ?? 'admin';
    setBusy(true);
    setError('');
    try {
      await rejectVerification({
        uid,
        requestedRole: role,
        adminUid,
        reason: rejectReason,
      });
      navigate('/');
    } catch (e: any) {
      setError(e?.message ?? 'Reject failed.');
    } finally {
      setBusy(false);
    }
  };

  const onRollback = async () => {
    if (!uid) return;
    const adminUid = auth.currentUser?.uid ?? 'admin';
    setBusy(true);
    setError('');
    try {
      await rollbackToPending(uid, adminUid);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Rollback failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <h2>Verification Detail</h2>
        <Link to="/" className="link-btn">
          Back
        </Link>
      </div>

      {loading ? <div className="hint">Loading...</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {verification ? (
        <div className="panel detail">
          <div className="kv"><span>UID</span><strong>{uid}</strong></div>
          <div className="kv"><span>Requested Role</span><strong>{verification.requestedRole}</strong></div>
          <div className="kv"><span>Status</span><strong>{verification.status}</strong></div>
          <div className="kv"><span>Shop</span><strong>{verification.shopName ?? '-'}</strong></div>
          <div className="kv"><span>Business Email</span><strong>{verification.businessEmail ?? '-'}</strong></div>
          <div className="kv"><span>Aadhar/PAN</span><strong>{verification.idProof ?? '-'}</strong></div>
          <div className="kv"><span>Portfolio</span><strong>{verification.portfolioLink ?? '-'}</strong></div>
          <div className="kv"><span>Location</span><strong>{verification.locationArea ?? ''} {verification.locationCity ?? ''}</strong></div>

          <div className="cert-wrap">
            <h3>Certificates</h3>
            {certUrls.length ? (
              certUrls.map((c) => (
                <a key={c.path} className="cert-link" href={c.url} target="_blank" rel="noreferrer">
                  {c.path}
                </a>
              ))
            ) : (
              <div className="hint">No certificate files attached.</div>
            )}
          </div>

          <label>Reject reason</label>
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />

          <div className="actions">
            <button disabled={busy || verification.status !== 'pending'} onClick={onApprove}>Approve</button>
            <button disabled={busy || !rejectReason.trim() || verification.status !== 'pending'} onClick={onReject}>Reject</button>
            <button disabled={busy || verification.status === 'pending'} onClick={onRollback}>Move to Pending</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
