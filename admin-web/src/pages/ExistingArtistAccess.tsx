import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { grantLegacyArtistAccess, searchExistingArtists } from '../services';
import type { ArtistAccessCandidate } from '../types';

export default function ExistingArtistAccess() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ArtistAccessCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUid, setActionUid] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const results = await searchExistingArtists(search);
        if (active) setRows(results);
      } catch (nextError: any) {
        if (active) setError(nextError?.message ?? 'Could not search artist accounts.');
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  const grantAccess = async (artist: ArtistAccessCandidate) => {
    const label = artist.artistName || artist.displayName || artist.email || artist.uid;
    if (!window.confirm(`Grant artist access to ${label}? This enables posting, discovery, and booking.`)) return;
    const adminUid = auth.currentUser?.uid;
    if (!adminUid) {
      setError('Admin session is missing. Sign in again.');
      return;
    }
    setActionUid(artist.uid);
    setError('');
    setMessage('');
    try {
      await grantLegacyArtistAccess({ uid: artist.uid, adminUid });
      setMessage(`${label} now has approved artist access.`);
      setRows((current) => current.map((item) => item.uid === artist.uid ? {
        ...item,
        role: 'artist',
        verificationStatus: 'approved',
        postingEnabled: true,
        artistVisible: true,
        bookingVisible: true,
      } : item));
    } catch (nextError: any) {
      setError(nextError?.message ?? 'Could not grant artist access.');
    } finally {
      setActionUid('');
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h2>Existing Artist Access</h2>
          <p className="muted">Manually approve selected legacy artists. No bulk auto-approval.</p>
        </div>
      </div>

      <div className="search-wrap">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search UID, email, artist name, or studio name"
          aria-label="Search existing artists"
        />
      </div>

      {loading ? <div className="hint">Searching...</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="success">{message}</div> : null}
      {!loading && !error && rows.length === 0 ? <div className="hint">No matching artist accounts found.</div> : null}

      <div className="list">
        {rows.map((artist) => {
          const approved = artist.verificationStatus === 'approved' && artist.postingEnabled === true;
          return (
            <div key={artist.uid} className="list-card legacy-access-row">
              <div className="list-main">
                <strong>{artist.artistName || artist.displayName || 'Unnamed Artist'}</strong>
                <div className="muted">{artist.studioName || 'Studio not set'} · {artist.email || 'No email'}</div>
                <div className="muted small">UID: {artist.uid}</div>
              </div>
              <div className="list-side">
                <span className={`status-pill status-${artist.verificationStatus || 'unsubmitted'}`}>
                  {artist.verificationStatus || 'unsubmitted'}
                </span>
                <button disabled={approved || actionUid === artist.uid} onClick={() => void grantAccess(artist)}>
                  {actionUid === artist.uid ? 'Granting...' : approved ? 'Access Granted' : 'Grant Access'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
