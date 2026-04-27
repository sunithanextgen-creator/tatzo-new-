import { FormEvent, useState } from 'react';
import { loginAdmin } from '../auth';

type Props = {
  onSuccess: () => void;
};

export default function AdminLogin({ onSuccess }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await loginAdmin(email, password);
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-wrap">
      <form className="panel" onSubmit={submit}>
        <h1>TATZO Admin</h1>
        <p>Verification review portal</p>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        {error ? <div className="error">{error}</div> : null}
        <button disabled={busy} type="submit">
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
