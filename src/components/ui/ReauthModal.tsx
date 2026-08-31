import { useState } from 'react';
import { auth } from '../../lib/supabase';

interface ReauthModalProps {
  email: string | null;
  onResolved: (token: string) => void;
}

export default function ReauthModal({ email, onResolved }: ReauthModalProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit() {
    if (!password.trim()) { setError('Bitte Passwort eingeben.'); return; }
    setLoading(true); setError('');
    try {
      const res = await auth.signIn((email || '').toLowerCase(), password);
      if (res.error || !res.access_token) {
        setError(res.error?.message || 'Passwort falsch.');
        setLoading(false);
        return;
      }
      localStorage.setItem('garage_token', res.access_token);
      if (res.refresh_token) localStorage.setItem('garage_refresh', res.refresh_token);
      onResolved(res.access_token);
    } catch {
      setError('Verbindungsfehler');
      setLoading(false);
    }
  }

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      background: 'rgba(0,0,0,0.35)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 360,
        borderRadius: 20,
        padding: '28px 24px',
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 8px 32px 0 rgba(0,0,0,0.25)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h2 className="sf-title3" style={{ marginBottom: 6 }}>Sitzung abgelaufen</h2>
          <p className="sf-subhead" style={{ color: 'var(--label2)' }}>
            Bitte Passwort erneut eingeben, um weiterzuarbeiten. Deine Eingaben bleiben erhalten.
          </p>
        </div>

        {error && (
          <div className="alert-banner alert-danger" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span className="sf-subhead">{error}</span>
          </div>
        )}

        <div className="form-section" style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={email ?? ''}
            disabled
            className="text-field"
            style={{ opacity: 0.6 }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
            className="text-field text-field-last"
            onKeyDown={onKey}
            autoFocus
          />
        </div>

        <button onClick={handleSubmit} disabled={loading} className="btn-system">
          {loading ? '…' : 'Weiter'}
        </button>
      </div>
    </div>
  );
}
