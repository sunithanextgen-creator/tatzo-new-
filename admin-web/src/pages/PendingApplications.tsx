import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import {
  listVerificationPage,
  type VerificationPageCursor,
  type VerificationQueueStatus,
} from '../services';
import type { VerificationDoc } from '../types';

type Row = VerificationDoc & { id: string };

const FILTERS: Array<{ value: VerificationQueueStatus; label: string }> = [
  { value: 'pending_verification', label: 'Pending' },
  { value: 'needs_more_samples', label: 'Needs More Samples' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved', label: 'Approved' },
];

export default function PendingApplications() {
  const [items, setItems] = useState<Row[]>([]);
  const [queryText, setQueryText] = useState('');
  const [statusFilter, setStatusFilter] = useState<VerificationQueueStatus>('pending_verification');
  const [pageCursors, setPageCursors] = useState<Array<VerificationPageCursor | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<VerificationPageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void listVerificationPage({ status: statusFilter, cursor: pageCursors[pageIndex] })
      .then((page) => {
        if (!active) return;
        setItems(page.rows);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((nextError: any) => {
        if (!active) return;
        const message = nextError?.message ?? 'Could not load verification applications.';
        const permissionIssue = String(nextError?.code ?? '').includes('permission-denied') || message.toLowerCase().includes('permission');
        setError(permissionIssue
          ? 'Firestore permission denied. Verify admin claim and deploy the latest rules.'
          : message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pageCursors, pageIndex, reloadKey, statusFilter]);

  const filteredItems = useMemo(() => {
    const search = queryText.trim().toLowerCase();
    if (!search) return items;
    return items.filter((item) => [
      item.uid,
      (item as any).artistName,
      item.shopName,
      item.businessEmail,
      item.locationCity,
      item.locationArea,
    ].filter(Boolean).join(' ').toLowerCase().includes(search));
  }, [items, queryText]);

  const changeStatus = (status: VerificationQueueStatus) => {
    setStatusFilter(status);
    setPageCursors([null]);
    setPageIndex(0);
    setQueryText('');
  };

  const goNext = () => {
    if (!hasMore || !nextCursor) return;
    setPageCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((current) => current + 1);
  };

  const refreshTokenAndReload = async () => {
    if (!auth.currentUser) return;
    setBusy(true);
    setError('');
    try {
      await auth.currentUser.getIdToken(true);
      setReloadKey((current) => current + 1);
    } catch (nextError: any) {
      setError(nextError?.message ?? 'Token refresh failed. Sign out and sign in again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h2>Verification Queue</h2>
          <p className="muted">25 applications per page. Media loads only inside verification detail.</p>
        </div>
        <div className="toolbar-actions">
          <button onClick={() => setReloadKey((current) => current + 1)} disabled={loading || busy}>Refresh</button>
          <button onClick={() => void refreshTokenAndReload()} disabled={loading || busy}>
            {busy ? 'Refreshing...' : 'Refresh Token'}
          </button>
        </div>
      </div>

      <div className="segmented verification-filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            className={statusFilter === filter.value ? 'seg-btn seg-btn-active' : 'seg-btn'}
            onClick={() => changeStatus(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="search-wrap">
        <input
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          placeholder="Filter this page by artist, studio, email, UID, or location"
          aria-label="Filter verification applications"
        />
      </div>

      {loading ? <div className="hint">Loading...</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {!loading && !error && filteredItems.length === 0 ? <div className="hint">No applications found for this status.</div> : null}

      <div className="list">
        {filteredItems.map((item) => (
          <Link key={item.id} to={`/verifications/${item.uid}`} className="list-card">
            <div className="list-main">
              <strong>{(item as any).artistName || item.shopName || 'Unnamed Artist'}</strong>
              <div className="muted">{item.shopName || 'Studio not set'} · {item.businessEmail || 'No email'}</div>
              <div className="muted small">{item.uid} · {[item.locationArea, item.locationCity].filter(Boolean).join(', ') || 'No location'}</div>
            </div>
            <div className="list-side">
              <span className={`status-pill status-${item.status}`}>{String(item.status).replace(/_/g, ' ')}</span>
              <span className="muted small">{item.requestedRole?.toUpperCase() || 'ARTIST'}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="pagination-actions">
        <button disabled={loading || pageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))}>Previous</button>
        <span className="muted">Page {pageIndex + 1}</span>
        <button disabled={loading || !hasMore} onClick={goNext}>Next</button>
      </div>
    </div>
  );
}
