import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import {
  approveDealerVerification,
  approveVerification,
  getAdminDashboardMetrics,
  getDealerVerificationWithUser,
  getVerificationWithUser,
  listPendingDealerVerifications,
  listPendingVerifications,
  listFinalPaymentBookings,
  listRecentArtistTransactions,
  listRecentPostReports,
  listRecentVerifications,
  rejectDealerVerification,
  rejectVerification,
  updateArtistTransactionPayout,
  updateFinalPaymentBookingAdmin,
} from '../services';
import type { AdminDashboardMetrics, ArtistTransactionDoc, DealerVerificationDoc, FinalPaymentBookingDoc, PostReportDoc, VerificationDoc } from '../types';

type VerificationRow = VerificationDoc & { id: string };
type DealerVerificationRow = DealerVerificationDoc & { id: string };
type ArtistTransactionRow = ArtistTransactionDoc & { id: string };
type FinalPaymentBookingRow = FinalPaymentBookingDoc & { id: string };
type PostReportRow = PostReportDoc & { id: string };

const toReadableDate = (value: unknown) => {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as any).toDate === 'function') {
    try {
      return (value as any).toDate().toLocaleString();
    } catch {
      return '-';
    }
  }
  return '-';
};

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [pendingRows, setPendingRows] = useState<VerificationRow[]>([]);
  const [pendingDealerRows, setPendingDealerRows] = useState<DealerVerificationRow[]>([]);
  const [recentRows, setRecentRows] = useState<VerificationRow[]>([]);
  const [transactionRows, setTransactionRows] = useState<ArtistTransactionRow[]>([]);
  const [finalPaymentRows, setFinalPaymentRows] = useState<FinalPaymentBookingRow[]>([]);
  const [reportRows, setReportRows] = useState<PostReportRow[]>([]);
  const [queryText, setQueryText] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'artist' | 'dealer'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionUid, setActionUid] = useState('');
  const [error, setError] = useState('');

  const loadAll = async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const [nextMetrics, pending, pendingDealers, recent, finalPayments, transactions, reports] = await Promise.all([
        getAdminDashboardMetrics(),
        listPendingVerifications(),
        listPendingDealerVerifications(),
        listRecentVerifications(10),
        listFinalPaymentBookings(30),
        listRecentArtistTransactions(20),
        listRecentPostReports(30),
      ]);
      setMetrics(nextMetrics);
      setPendingRows(pending);
      setPendingDealerRows(pendingDealers);
      setRecentRows(recent);
      setFinalPaymentRows(finalPayments);
      setTransactionRows(transactions);
      setReportRows(reports);
    } catch (e: any) {
      const message = e?.message ?? 'Failed to load dashboard metrics.';
      const hasPermissionIssue =
        String(e?.code ?? '').includes('permission-denied') ||
        message.toLowerCase().includes('missing or insufficient permissions');

      if (hasPermissionIssue) {
        setError('Firestore permission denied. Verify admin claim, sign out/sign in again, and deploy latest firestore.rules.');
      } else {
        setError(message);
      }
    } finally {
      if (initial) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAll(true);
  }, []);

  const refreshSessionAndReload = async () => {
    if (!auth.currentUser) return;
    setRefreshing(true);
    setError('');
    try {
      await auth.currentUser.getIdToken(true);
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Token refresh failed. Sign out and sign in again.');
      setRefreshing(false);
    }
  };

  const onApprove = async (uid: string) => {
    if (!uid) return;
    setActionUid(uid);
    setError('');
    try {
      const data = await getVerificationWithUser(uid);
      if (!data.verification) throw new Error('Verification document missing.');
      const adminUid = auth.currentUser?.uid ?? 'admin';
      await approveVerification({
        uid,
        requestedRole: data.verification.requestedRole,
        adminUid,
        user: data.user,
        verification: data.verification,
      });
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Approve failed.');
    } finally {
      setActionUid('');
    }
  };

  const onReject = async (uid: string, requestedRole: 'artist' | 'dealer') => {
    if (!uid) return;
    const reason = window.prompt('Enter reject reason');
    if (!reason || !reason.trim()) return;

    setActionUid(uid);
    setError('');
    try {
      const adminUid = auth.currentUser?.uid ?? 'admin';
      await rejectVerification({ uid, requestedRole, adminUid, reason: reason.trim() });
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Reject failed.');
    } finally {
      setActionUid('');
    }
  };

  const onApproveDealer = async (uid: string) => {
    if (!uid) return;
    setActionUid(uid);
    setError('');
    try {
      const data = await getDealerVerificationWithUser(uid);
      if (!data.dealerVerification) throw new Error('Dealer request not found.');
      const adminUid = auth.currentUser?.uid ?? 'admin';
      await approveDealerVerification({
        uid,
        adminUid,
        user: data.user,
        dealerVerification: data.dealerVerification,
      });
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Dealer approve failed.');
    } finally {
      setActionUid('');
    }
  };

  const onRejectDealer = async (uid: string) => {
    if (!uid) return;
    const reason = window.prompt('Enter dealer reject reason');
    if (!reason || !reason.trim()) return;

    setActionUid(uid);
    setError('');
    try {
      const adminUid = auth.currentUser?.uid ?? 'admin';
      await rejectDealerVerification({ uid, adminUid, reason: reason.trim() });
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Dealer reject failed.');
    } finally {
      setActionUid('');
    }
  };

  const onUpdatePayout = async (id: string, payoutStatus: NonNullable<ArtistTransactionDoc['payoutStatus']>) => {
    if (!id) return;
    const notes = window.prompt('Internal payout note', '') ?? '';
    setActionUid(id);
    setError('');
    try {
      await updateArtistTransactionPayout(id, payoutStatus, notes);
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Payout update failed.');
    } finally {
      setActionUid('');
    }
  };

  const onUpdateFinalPayment = async (id: string, action: 'completed' | 'disputed') => {
    if (!id) return;
    const note = window.prompt('Internal final payment note', action === 'disputed' ? 'Admin marked final payment disputed.' : 'Admin marked final payment completed.') ?? '';
    setActionUid(id);
    setError('');
    try {
      await updateFinalPaymentBookingAdmin(id, action, note);
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Final payment update failed.');
    } finally {
      setActionUid('');
    }
  };

  const filteredPending = useMemo(() => {
    const query = queryText.trim().toLowerCase();
    return pendingRows.filter((row) => {
      const roleMatches = roleFilter === 'all' || row.requestedRole === roleFilter;
      if (!roleMatches) return false;
      if (!query) return true;

      const haystack = [row.shopName, row.businessEmail, row.uid, row.locationArea, row.locationCity, row.requestedRole]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [pendingRows, queryText, roleFilter]);

  const filteredDealers = useMemo(() => {
    const query = queryText.trim().toLowerCase();
    return pendingDealerRows.filter((row) => {
      if (!query) return true;
      const haystack = [row.shopName, row.businessEmail, row.uid, row.locationArea, row.locationCity]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [pendingDealerRows, queryText]);

  const roleBars = useMemo(() => {
    const total = metrics?.totalUsers ?? 0;
    const artists = metrics?.totalArtists ?? 0;
    const dealers = metrics?.totalDealers ?? 0;
    const users = Math.max(total - artists - dealers, 0);
    const safe = total || 1;

    return [
      { label: 'Users', value: users, pct: Math.round((users / safe) * 100) },
      { label: 'Artists', value: artists, pct: Math.round((artists / safe) * 100) },
      { label: 'Dealers', value: dealers, pct: Math.round((dealers / safe) * 100) },
    ];
  }, [metrics]);

  const bookingBars = useMemo(() => {
    const total = metrics?.totalBookings ?? 0;
    const safe = total || 1;
    return [
      { label: 'Pending Payment', value: metrics?.bookingsPendingPayment ?? 0, pct: Math.round(((metrics?.bookingsPendingPayment ?? 0) / safe) * 100) },
      { label: 'Pending Artist Approval', value: metrics?.bookingsPendingArtistApproval ?? 0, pct: Math.round(((metrics?.bookingsPendingArtistApproval ?? 0) / safe) * 100) },
      { label: 'Confirmed', value: metrics?.bookingsConfirmed ?? 0, pct: Math.round(((metrics?.bookingsConfirmed ?? 0) / safe) * 100) },
      { label: 'Completed', value: metrics?.bookingsCompleted ?? 0, pct: Math.round(((metrics?.bookingsCompleted ?? 0) / safe) * 100) },
      { label: 'Cancelled', value: metrics?.bookingsCancelled ?? 0, pct: Math.round(((metrics?.bookingsCancelled ?? 0) / safe) * 100) },
    ];
  }, [metrics]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-head">
        <div>
          <h2>Control Tower</h2>
          <p className="muted">Monitor users, artist approvals, dealer onboarding, and booking pipeline in one view.</p>
        </div>
        <div className="toolbar-actions">
          <button onClick={() => void loadAll(false)} disabled={loading || refreshing}>
            Refresh
          </button>
          <button onClick={refreshSessionAndReload} disabled={loading || refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Token'}
          </button>
          <Link to="/verifications" className="link-btn">
            Full Queue
          </Link>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div className="hint">Loading dashboard...</div> : null}

      {!loading && metrics ? (
        <>
          <div className="ops-grid">
            <div className="ops-card urgent">
              <span>Needs action</span>
              <strong>{metrics.pendingVerifications + metrics.pendingDealerVerifications}</strong>
              <p>Artist/dealer applications waiting for review.</p>
            </div>
            <div className="ops-card">
              <span>Payment watch</span>
              <strong>{finalPaymentRows.length}</strong>
              <p>Final payment records to monitor or resolve.</p>
            </div>
            <div className="ops-card">
              <span>User safety</span>
              <strong>{reportRows.filter((row) => row.status === 'open').length}</strong>
              <p>Open user reports from Socio Feed.</p>
            </div>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card"><span>Total Users</span><strong>{metrics.totalUsers}</strong></div>
            <div className="kpi-card"><span>Artists</span><strong>{metrics.totalArtists}</strong></div>
            <div className="kpi-card"><span>Dealers</span><strong>{metrics.totalDealers}</strong></div>
            <div className="kpi-card"><span>Pending Artist Verifications</span><strong>{metrics.pendingVerifications}</strong></div>
            <div className="kpi-card"><span>Pending Dealer Requests</span><strong>{metrics.pendingDealerVerifications}</strong></div>
            <div className="kpi-card"><span>Total Posts</span><strong>{metrics.totalPosts}</strong></div>
            <div className="kpi-card"><span>Total Bookings</span><strong>{metrics.totalBookings}</strong></div>
          </div>

          <div className="viz-grid">
            <div className="viz-card">
              <h3>Role Distribution</h3>
              {roleBars.map((row) => (
                <div key={row.label} className="bar-row">
                  <div className="bar-label">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <div className="bar-track"><div className="bar-fill purple" style={{ width: `${row.pct}%` }} /></div>
                </div>
              ))}
            </div>

            <div className="viz-card">
              <h3>Booking Pipeline</h3>
              {bookingBars.map((row) => (
                <div key={row.label} className="bar-row">
                  <div className="bar-label">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <div className="bar-track"><div className="bar-fill cyan" style={{ width: `${row.pct}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="queue-card">
            <div className="queue-head">
              <div>
                <span className="eyebrow">Action queue</span>
                <h3>Artist applications</h3>
                <p className="muted small">Review only the essentials: studio, ID, location and certificate.</p>
              </div>
              <div className="filter-row">
                <input
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Search by studio, email, uid, city..."
                />
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | 'artist' | 'dealer')}>
                  <option value="all">All Roles</option>
                  <option value="artist">Artist</option>
                  <option value="dealer">Dealer</option>
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Studio</th>
                    <th>Role</th>
                    <th>Location</th>
                    <th>Business Email</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map((row) => (
                    <tr key={row.id}>
                      <td>{row.shopName ?? '-'}</td>
                      <td>{row.requestedRole}</td>
                      <td>{[row.locationArea, row.locationCity].filter(Boolean).join(', ') || '-'}</td>
                      <td>{row.businessEmail ?? '-'}</td>
                      <td>{toReadableDate(row.submittedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <Link to={`/verifications/${row.uid}`} className="link-btn compact">Review</Link>
                          <button disabled={actionUid === row.uid} onClick={() => void onApprove(row.uid)}>
                            {actionUid === row.uid ? '...' : 'Approve'}
                          </button>
                          <button
                            disabled={actionUid === row.uid}
                            onClick={() => void onReject(row.uid, row.requestedRole)}
                            className="danger-btn"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredPending.length === 0 ? <div className="hint">No pending artist/dealer role verifications.</div> : null}
          </div>

          <div className="queue-card">
            <span className="eyebrow">Secondary queue</span>
            <h3>Dealer requests</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Studio</th>
                    <th>Location</th>
                    <th>Business Email</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDealers.map((row) => (
                    <tr key={row.id}>
                      <td>{row.shopName ?? '-'}</td>
                      <td>{[row.locationArea, row.locationCity].filter(Boolean).join(', ') || '-'}</td>
                      <td>{row.businessEmail ?? '-'}</td>
                      <td>{toReadableDate(row.updatedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button disabled={actionUid === row.uid} onClick={() => void onApproveDealer(row.uid)}>
                            {actionUid === row.uid ? '...' : 'Approve'}
                          </button>
                          <button disabled={actionUid === row.uid} onClick={() => void onRejectDealer(row.uid)} className="danger-btn">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredDealers.length === 0 ? <div className="hint">No pending dealer requests.</div> : null}
          </div>

          <div className="queue-card">
            <span className="eyebrow">Money monitor</span>
            <h3>Final payments</h3>
            <p className="muted small">Tracks direct artist payments: pending, user marked paid, disputed, and completed.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Artist</th>
                    <th>User</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Proof / Note</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {finalPaymentRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.artistName ?? row.artistUid ?? '-'}</td>
                      <td>{row.userName ?? row.userEmail ?? row.userUid ?? '-'}</td>
                      <td>Rs. {row.finalStudioAmount ?? '-'}</td>
                      <td>{String(row.artistPaymentMethod ?? '-').replace(/_/g, ' ')}</td>
                      <td><span className={`status-pill status-${row.finalPaymentStatus ?? row.status ?? 'pending'}`}>{String(row.finalPaymentStatus ?? row.status ?? 'pending').replace(/_/g, ' ').toUpperCase()}</span></td>
                      <td>
                        {row.paymentProofUrl ? <a href={row.paymentProofUrl} target="_blank" rel="noreferrer">View proof</a> : <span className="muted small">No proof</span>}
                        {row.finalPaymentDisputeNote ? <div className="muted small">{row.finalPaymentDisputeNote}</div> : null}
                      </td>
                      <td>{toReadableDate(row.updatedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button disabled={actionUid === row.id} onClick={() => void onUpdateFinalPayment(row.id, 'completed')}>Complete</button>
                          <button disabled={actionUid === row.id} onClick={() => void onUpdateFinalPayment(row.id, 'disputed')} className="danger-btn">Dispute</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {finalPaymentRows.length === 0 ? <div className="hint">No final payment tracking records yet.</div> : null}
          </div>

          <div className="queue-card">
            <span className="eyebrow">Payout tracking</span>
            <h3>Artist transactions</h3>
            <p className="muted small">Completed booking fee records and manual payout status. No automatic payout is triggered here.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Artist</th>
                    <th>User</th>
                    <th>Fee</th>
                    <th>Final</th>
                    <th>Quote</th>
                    <th>Payout</th>
                    <th>Proof</th>
                    <th>Method</th>
                    <th>Completed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.bookingId}</td>
                      <td>{row.artistUid}</td>
                      <td>{row.userUid}</td>
                      <td>Rs. {row.bookingConfirmationFee ?? '-'}</td>
                      <td>Rs. {row.finalStudioAmount ?? row.finalPaymentAmount ?? '-'}</td>
                      <td>{row.quotedRange ?? '-'}</td>
                      <td><span className={`status-pill status-${row.payoutStatus ?? 'pending'}`}>{String(row.payoutStatus ?? 'pending').toUpperCase()}</span><div className="muted small">{row.finalPaymentId ?? ''}</div></td>
                      <td>{row.paymentProofUrl ? <a href={row.paymentProofUrl} target="_blank" rel="noreferrer">Proof</a> : '-'}</td>
                      <td>{row.payoutMethod ?? '-'}</td>
                      <td>{toReadableDate(row.completedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button disabled={actionUid === row.id} onClick={() => void onUpdatePayout(row.id, 'processing')}>Processing</button>
                          <button disabled={actionUid === row.id} onClick={() => void onUpdatePayout(row.id, 'paid')}>Paid</button>
                          <button disabled={actionUid === row.id} onClick={() => void onUpdatePayout(row.id, 'failed')} className="danger-btn">Failed</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactionRows.length === 0 ? <div className="hint">No completed artist transactions yet.</div> : null}
          </div>

          <div className="queue-card">
            <span className="eyebrow">Trust and safety</span>
            <h3>User post reports</h3>
            <p className="muted small">Reports submitted from Socio Feed. Deterministic report IDs prevent duplicate spam.</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Post Owner</th>
                    <th>Reported By</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.postId}</td>
                      <td>{row.postOwnerUid ?? '-'}</td>
                      <td>{row.reportedByEmail ?? row.reportedByUid}</td>
                      <td>{row.reason}</td>
                      <td><span className={`status-pill status-${row.status ?? 'open'}`}>{String(row.status ?? 'open').toUpperCase()}</span></td>
                      <td>{toReadableDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reportRows.length === 0 ? <div className="hint">No user post reports yet.</div> : null}
          </div>

          <div className="queue-card">
            <h3>Recent Verification Activity</h3>
            <div className="activity-list">
              {recentRows.map((row) => (
                <div key={`${row.id}_${row.status}`} className="activity-item">
                  <div>
                    <strong>{row.shopName ?? row.uid}</strong>
                    <div className="muted small">{row.uid}</div>
                  </div>
                  <div className={`status-pill status-${row.status}`}>{String(row.status ?? '').toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
