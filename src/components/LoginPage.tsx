import { useState } from 'react';
import { auth } from '../lib/supabase';
import Spinner from './ui/Spinner';

interface LoginPageProps {
  onLogin: (token: string, email: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email.trim() || !password.trim()) { setError('Bitte alle Felder ausfüllen.'); return; }
    setLoading(true); setError('');
    try {
      const res = await auth.signIn(email.trim().toLowerCase(), password);
      if (res.error || !res.access_token) {
        setError(res.error?.message || 'E-Mail oder Passwort falsch.');
        setLoading(false); return;
      }
      localStorage.setItem('garage_token', res.access_token);
      localStorage.setItem('garage_email', email.trim().toLowerCase());
      onLogin(res.access_token, email.trim().toLowerCase());
    } catch {
      setError('Verbindungsfehler');
    }
    setLoading(false);
  }

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleLogin(); };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 16,
            background: 'linear-gradient(145deg,#0A84FF,#0071E3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18, boxShadow: '0 8px 24px rgba(0,113,227,0.35)',
          }}>
            <svg width={36} height={36} viewBox="0 0 40 40" fill="none">
              <path d="M24 10a9 9 0 01-12.7 12.7L5 29a3.5 3.5 0 005 5l6.3-6.3A9 9 0 0129 15l-5 5 3 3 5-5z" fill="white"/>
            </svg>
          </div>
          <h1 className="sf-title1" style={{ marginBottom: 5 }}>GarageOS</h1>
          <p className="sf-callout" style={{ color: 'var(--label2)' }}>Werkstatt Management</p>
        </div>

        {error && (
          <div className="alert-banner alert-danger" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span className="sf-subhead">{error}</span>
          </div>
        )}

        <div className="form-section" style={{ marginBottom: 16 }}>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail" className="text-field" onKeyDown={onKey}
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort" className="text-field text-field-last" onKeyDown={onKey}
          />
        </div>

        <button onClick={handleLogin} disabled={loading} className="btn-system">
          {loading ? <Spinner size={20} color="rgba(255,255,255,0.7)" /> : 'Anmelden'}
        </button>
      </div>
    </div>
  );
}
