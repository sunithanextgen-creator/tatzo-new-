import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPendingVerifications } from '../services';
import type { VerificationDoc } from '../types';

type Row = VerificationDoc & { id: string };

export default function PendingApplications() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPendingVerifications();
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load pending applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page">
      <div className="toolbar">
        <h2>Pending Verifications</h2>
        <button onClick={load}>Refresh</button>
      </div>
      {loading ? <div className="hint">Loading...</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="list">
        {items.map((item) => (
          <Link key={item.id} to={`/app/${item.uid}`} className="list-card">
            <div>
              <strong>{item.shopName ?? 'Unnamed Studio'}</strong>
              <div className="muted">{item.uid}</div>
            </div>
            <div className="tag">{item.requestedRole?.toUpperCase() ?? 'N/A'}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
