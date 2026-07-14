import { useEffect, useMemo, useState } from 'react';
import { listEarlyAccessLeads, updateEarlyAccessLeadStatus } from '../services';
import type { EarlyAccessLeadDoc } from '../types';

type LeadRow = EarlyAccessLeadDoc & { id: string };

const readableDate = (value: unknown) => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') {
    return (value as any).toDate().toLocaleString();
  }
  return '-';
};

const whatsappLink = (phone: string, role: 'user' | 'artist', platform: string) => {
  const number = phone.replace(/\D/g, '');
  const message = role === 'artist'
    ? 'Hi! Your Tatzo Chennai Early Access artist application is received. We will share your Android onboarding access and verification steps shortly.'
    : platform === 'ios'
      ? 'Hi! You are on the Tatzo iPhone Early Access waitlist. We will send your TestFlight link as soon as Apple approves the build.'
      : 'Hi! You are selected for Tatzo Android Early Access. We will send your Google Play testing link shortly.';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};

export default function EarlyAccessLeads() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'all' | 'user' | 'artist'>('all');
  const [platform, setPlatform] = useState<'all' | 'android' | 'ios'>('all');
  const [status, setStatus] = useState<'all' | NonNullable<EarlyAccessLeadDoc['status']>>('all');
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listEarlyAccessLeads());
    } catch (cause: any) {
      setError(cause?.message ?? 'Could not load early-access leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (role !== 'all' && row.role !== role) return false;
      if (platform !== 'all' && row.platform !== platform) return false;
      if (status !== 'all' && (row.status ?? 'waiting') !== status) return false;
      if (!needle) return true;
      return [row.name, row.email, row.phone, row.city, row.instagram, row.interests]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [platform, role, rows, search, status]);

  const counts = useMemo(() => ({
    total: rows.length,
    artists: rows.filter((row) => row.role === 'artist').length,
    users: rows.filter((row) => row.role === 'user').length,
    android: rows.filter((row) => row.platform === 'android').length,
    ios: rows.filter((row) => row.platform === 'ios').length,
  }), [rows]);

  const changeStatus = async (row: LeadRow, nextStatus: NonNullable<EarlyAccessLeadDoc['status']>) => {
    setBusyId(row.id);
    setError('');
    try {
      await updateEarlyAccessLeadStatus(row.id, nextStatus);
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: nextStatus } : item));
    } catch (cause: any) {
      setError(cause?.message ?? 'Could not update lead status.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <main className="dashboard-page">
      <div className="dashboard-head">
        <div><span className="eyebrow">July 12 launch</span><h2>Early Access Leads</h2><p className="muted">Contact Android testers, iPhone waitlist users and Chennai artists from one place.</p></div>
        <button onClick={() => void load()} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      <div className="kpi-grid">
        <div className="kpi-card"><span>Total Leads</span><strong>{counts.total}</strong></div>
        <div className="kpi-card"><span>Artists</span><strong>{counts.artists}</strong></div>
        <div className="kpi-card"><span>Users</span><strong>{counts.users}</strong></div>
        <div className="kpi-card"><span>Android</span><strong>{counts.android}</strong></div>
        <div className="kpi-card"><span>iPhone</span><strong>{counts.ios}</strong></div>
      </div>

      <section className="queue-card">
        <div className="filter-row">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email, city..." />
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="all">All roles</option><option value="artist">Artists</option><option value="user">Users</option></select>
          <select value={platform} onChange={(event) => setPlatform(event.target.value as typeof platform)}><option value="all">All platforms</option><option value="android">Android</option><option value="ios">iPhone</option></select>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All status</option><option value="waiting">Waiting</option><option value="contacted">Contacted</option><option value="invited">Invited</option><option value="onboarded">Onboarded</option><option value="not_interested">Not interested</option></select>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name / Sample</th><th>Role</th><th>Platform</th><th>Contact</th><th>City / Instagram</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td><div className="lead-identity">{row.portfolioImage?.downloadUrl ? <img className="lead-thumb" src={row.portfolioImage.downloadUrl} alt="Tattoo sample" loading="lazy" /> : null}<div><strong>{row.name}</strong><div className="muted small">{row.role === 'artist' ? 'Tattoo sample' : row.interests || '-'}</div></div></div></td>
                  <td>{row.role}</td><td>{row.platform || 'unknown'}</td>
                  <td>{row.phone || row.email || '-'}</td>
                  <td>{[row.city, row.instagram ? `@${row.instagram}` : ''].filter(Boolean).join(' · ') || '-'}</td>
                  <td>{row.status ?? 'waiting'}</td><td>{readableDate(row.createdAt)}</td>
                  <td><div className="table-actions">
                    {row.phone ? <a className="link-btn compact" href={whatsappLink(row.phone, row.role, row.platform ?? 'unknown')} target="_blank" rel="noreferrer">WhatsApp</a> : null}
                    {row.email ? <a className="link-btn compact" href={`mailto:${row.email}?subject=Tatzo Early Access`}>Email</a> : null}
                    <select disabled={busyId === row.id} value={row.status ?? 'waiting'} onChange={(event) => void changeStatus(row, event.target.value as NonNullable<EarlyAccessLeadDoc['status']>)}><option value="waiting">Waiting</option><option value="contacted">Contacted</option><option value="invited">Invited</option><option value="onboarded">Onboarded</option><option value="not_interested">Not interested</option></select>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? <div className="hint">No matching early-access leads yet.</div> : null}
      </section>
    </main>
  );
}
