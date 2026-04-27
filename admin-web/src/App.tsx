import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { logoutAdmin, subscribeAuth } from './auth';
import AdminLogin from './pages/AdminLogin';
import PendingApplications from './pages/PendingApplications';
import VerificationDetail from './pages/VerificationDetail';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuth((user, admin) => {
      setSignedIn(Boolean(user));
      setIsAdmin(admin);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return <div className="center-wrap"><div className="hint">Checking session...</div></div>;

  if (!signedIn || !isAdmin) {
    return <AdminLogin onSuccess={() => {}} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>TATZO Admin Portal</h1>
        <button onClick={() => void logoutAdmin()}>Sign out</button>
      </header>
      <Routes>
        <Route path="/" element={<PendingApplications />} />
        <Route path="/app/:uid" element={<VerificationDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
