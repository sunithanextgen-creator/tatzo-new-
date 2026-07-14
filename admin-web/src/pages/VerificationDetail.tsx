import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { auth } from '../firebase';
import {
  approveVerification,
  getCertificateUrls,
  getVerificationWithUser,
  requestMoreVerificationSamples,
  rejectVerification,
  rollbackToPending,
  updateArtistPayoutSetupStatus,
} from '../services';
import type { RequestedRole, UserDoc, VerificationDoc } from '../types';

export default function VerificationDetail() {
  const { uid = '' } = useParams();
  const navigate = useNavigate();

  const [verification, setVerification] = useState<VerificationDoc | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [certUrls, setCertUrls] = useState<Array<{ path: string; url: string }>>([]);
  const [rejectReason, setRejectReason] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const role = useMemo(() => (verification?.requestedRole ?? 'artist') as RequestedRole, [verification]);
  const isPending = verification?.status === 'pending' || verification?.status === 'pending_verification';
  const isImageCert = (url: string) => /\.(png|jpe?g|webp)(\?|#|$)/i.test(url);
  const certLabel = (value: string, index: number) => {
    const safe = value.split(/[\\/]/).pop()?.split('?')[0] || `Certificate ${index + 1}`;
    if (safe.startsWith('http')) return `Certificate ${index + 1}`;
    return safe.length > 42 ? `${safe.slice(0, 18)}...${safe.slice(-14)}` : safe;
  };

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    setError('');

    try {
      const data = await getVerificationWithUser(uid);
      setVerification(data.verification);
      setUserDoc(data.user);

      const directCertificates = data.verification?.certificates ?? [];
      const directUrls = directCertificates
        .map((cert) => ({ path: cert.fileName || cert.downloadUrl, url: cert.downloadUrl }))
        .filter((cert) => cert.url);
      const downloadUrls = (data.verification?.certDownloadUrls ?? [])
        .map((url) => ({ path: url, url }))
        .filter((cert) => cert.url);
      const paths = data.verification?.certStoragePaths ?? data.verification?.legacyCertStoragePaths ?? [];
      if (directUrls.length || downloadUrls.length) {
        setCertUrls([...directUrls, ...downloadUrls]);
      } else if (paths.length) {
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
      navigate('/verifications');
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
      navigate('/verifications');
    } catch (e: any) {
      setError(e?.message ?? 'Reject failed.');
    } finally {
      setBusy(false);
    }
  };

  const onNeedsMoreSamples = async () => {
    if (!uid) return;
    const adminUid = auth.currentUser?.uid ?? 'admin';
    setBusy(true);
    setError('');
    try {
      await requestMoreVerificationSamples({
        uid,
        requestedRole: role,
        adminUid,
        feedback: feedbackMessage,
      });
      navigate('/verifications');
    } catch (e: any) {
      setError(e?.message ?? 'Needs more samples update failed.');
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

  const onPayoutSetup = async (status: NonNullable<UserDoc['payoutSetupStatus']>) => {
    if (!uid) return;
    setBusy(true);
    setError('');
    try {
      await updateArtistPayoutSetupStatus(uid, status);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Payout setup update failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <h2>Verification Detail</h2>
        <Link to="/verifications" className="link-btn">
          Back
        </Link>
      </div>

      {loading ? <div className="hint">Loading...</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {verification ? (
        <div className="panel detail review-detail">
          <div className="review-hero">
            <div>
              <span className="eyebrow">Role review</span>
              <h2>{verification.shopName ?? 'Artist application'}</h2>
              <p className="muted">{verification.businessEmail ?? 'No business email'} · {[verification.locationArea, verification.locationCity].filter(Boolean).join(', ') || 'Location not provided'}</p>
            </div>
            <span className={`status-pill status-${verification.status}`}>{String(verification.status).toUpperCase()}</span>
          </div>

          <div className="detail-grid">
            <div className="kv"><span>UID</span><strong>{uid}</strong></div>
            <div className="kv"><span>Requested Role</span><strong>{verification.requestedRole}</strong></div>
            <div className="kv"><span>Aadhar/PAN</span><strong>{verification.idProof ?? '-'}</strong></div>
            <div className="kv"><span>Portfolio</span><strong>{verification.portfolioLink ?? '-'}</strong></div>
            <div className="kv"><span>Portfolio Images</span><strong>{verification.portfolioImageCount ?? 0}</strong></div>
            <div className="kv"><span>Portfolio Reels</span><strong>{verification.portfolioReelCount ?? 0}</strong></div>
            <div className="kv"><span>Referral Code</span><strong>{verification.referralCode || '-'}</strong></div>
            <div className="kv"><span>Admin Feedback</span><strong>{verification.adminFeedback || '-'}</strong></div>
            <div className="kv"><span>Razorpay Account</span><strong>{userDoc?.razorpayAccountId ?? '-'}</strong></div>
            <div className="kv"><span>Razorpay Contact</span><strong>{userDoc?.razorpayContactId ?? '-'}</strong></div>
            <div className="kv"><span>Payout Setup</span><strong>{userDoc?.payoutSetupStatus ?? 'unconfigured'}</strong></div>
          </div>
          <div className="actions">
            <button disabled={busy || !userDoc?.razorpayAccountId} onClick={() => void onPayoutSetup('ready')}>Mark Payout Ready</button>
            <button disabled={busy || !userDoc?.razorpayAccountId} onClick={() => void onPayoutSetup('pending')}>Mark Pending</button>
            <button disabled={busy || !userDoc?.razorpayAccountId} onClick={() => void onPayoutSetup('rejected')} className="danger-btn">Reject Payout Setup</button>
          </div>

          <div className="cert-wrap">
            <h3>Verification Portfolio</h3>
            {verification.portfolioImages?.length ? (
              <div className="cert-grid">
                {verification.portfolioImages.map((item, index) => (
                  <div key={item.storagePath || item.downloadUrl} className="cert-card">
                    <img src={item.downloadUrl} loading="lazy" alt={`Portfolio tattoo ${index + 1}`} />
                    <a className="link-btn compact" href={item.downloadUrl} target="_blank" rel="noreferrer">Open image</a>
                  </div>
                ))}
              </div>
            ) : <div className="hint">No verification portfolio images attached.</div>}
            {verification.portfolioVideos?.length ? (
              <div className="cert-grid">
                {verification.portfolioVideos.map((item, index) => (
                  <div key={item.storagePath || item.downloadUrl} className="cert-card">
                    <video src={item.downloadUrl} controls preload="metadata" aria-label={`Portfolio video ${index + 1}`} />
                    <a className="link-btn compact" href={item.downloadUrl} target="_blank" rel="noreferrer">Open video</a>
                  </div>
                ))}
              </div>
            ) : <div className="hint">No verification portfolio video attached.</div>}
          </div>

          <div className="cert-wrap">
            <h3>Certificates</h3>
            {certUrls.length ? (
              <div className="cert-grid">
                {certUrls.map((c, index) => (
                  <div key={`${c.path}_${index}`} className="cert-card">
                    {isImageCert(c.url) ? <img src={c.url} alt={`Certificate ${index + 1}`} /> : <div className="cert-file">PDF</div>}
                    <div>
                      <strong>{certLabel(c.path, index)}</strong>
                      <p className="muted small">Certificate file is available for admin review.</p>
                    </div>
                    <a className="link-btn compact" href={c.url} target="_blank" rel="noreferrer">Open certificate</a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="hint">No certificate files attached.</div>
            )}
          </div>

          <label>Reject reason</label>
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />

          <label>Needs more samples feedback</label>
          <textarea
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            rows={4}
            placeholder="Example: Upload clearer healed tattoo photos, add one reel, and update Instagram link."
          />

          <div className="actions">
            <button disabled={busy || !isPending} onClick={onApprove}>Approve</button>
            <button disabled={busy || !rejectReason.trim() || !isPending} onClick={onReject}>Reject</button>
            <button disabled={busy || !feedbackMessage.trim() || !isPending} onClick={onNeedsMoreSamples}>Needs More Samples</button>
            <button disabled={busy || isPending} onClick={onRollback}>Move to Pending</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


