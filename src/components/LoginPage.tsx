import { useState } from 'react';
import { auth, ASSETS } from '../lib/supabase';
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
      <div className="bg">
        <img
          src={ASSETS.wallpaper}
          alt=""
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = '/mac_wallpaper.png'; }
          }}
        />
      </div>
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src={ASSETS.logo}
            alt="GarageOS"
            style={{ height: 80, width: 'auto', objectFit: 'contain', marginBottom: 18, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.22))' }}
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = '/icon_image.jpg'; }
            }}
          />
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
