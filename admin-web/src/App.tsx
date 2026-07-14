import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { logoutAdmin, subscribeAuth } from './auth';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import PendingApplications from './pages/PendingApplications';
import VerificationDetail from './pages/VerificationDetail';
import ExistingArtistAccess from './pages/ExistingArtistAccess';
import EarlyAccessLeads from './pages/EarlyAccessLeads';

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

  if (loading) {
    return (
      <div className="center-wrap">
        <div className="hint">Checking session...</div>
      </div>
    );
  }

  if (!signedIn) {
    return <AdminLogin onSuccess={() => {}} />;
  }

  if (!isAdmin) {
    return (
      <div className="center-wrap">
        <div className="panel">
          <h1>TATZO Admin</h1>
          <p>This account is signed in but does not have admin claim.</p>
          <div className="hint">Set custom claim <strong>admin=true</strong>, then sign in again.</div>
          <button onClick={() => void logoutAdmin()}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>TATZO Admin Portal</h1>
        <button onClick={() => void logoutAdmin()}>Sign out</button>
      </header>

      <nav className="admin-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-chip ${isActive ? 'nav-chip-active' : ''}`}>
          Dashboard
        </NavLink>
        <NavLink to="/verifications" className={({ isActive }) => `nav-chip ${isActive ? 'nav-chip-active' : ''}`}>
          Verification Queue
        </NavLink>
        <NavLink to="/artist-access" className={({ isActive }) => `nav-chip ${isActive ? 'nav-chip-active' : ''}`}>
          Existing Artist Access
        </NavLink>
        <NavLink to="/early-access-leads" className={({ isActive }) => `nav-chip ${isActive ? 'nav-chip-active' : ''}`}>
          Early Access Leads
        </NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/verifications" element={<PendingApplications />} />
        <Route path="/verifications/:uid" element={<VerificationDetail />} />
        <Route path="/artist-access" element={<ExistingArtistAccess />} />
        <Route path="/early-access-leads" element={<EarlyAccessLeads />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
