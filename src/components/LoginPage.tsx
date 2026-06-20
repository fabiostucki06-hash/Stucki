import { useState } from 'react';
import { auth, ASSETS } from '../lib/supabase';
import {
  isPasskeySupported,
  hasPasskey,
  getPasskeyEmail,
  clearPasskey,
  registerPasskey,
  authenticateWithPasskey,
} from '../lib/passkey';
import Spinner from './ui/Spinner';

interface LoginPageProps {
  onLogin: (token: string, email: string) => void;
}

type View = 'login' | 'faceid-setup';

const EyeIcon = ({ open }: { open: boolean }) => open ? (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const FaceIDIcon = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
    <path d="M16 4H8a4 4 0 00-4 4v8"/>
    <path d="M40 4h8a4 4 0 014 4v8"/>
    <path d="M4 40v8a4 4 0 004 4h8"/>
    <path d="M52 40v8a4 4 0 01-4 4h-8"/>
    <line x1="20" y1="22" x2="20" y2="29"/>
    <line x1="36" y1="22" x2="36" y2="29"/>
    <path d="M28 24v7l-2 2" strokeWidth={2}/>
    <path d="M19 37c2 4 16 4 18 0"/>
  </svg>
);

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [faceLoading,  setFaceLoading]  = useState(false);
  const [error,        setError]        = useState('');
  const [view,         setView]         = useState<View>('login');
  const [pendingToken, setPendingToken] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const passkeyAvailable = isPasskeySupported();
  const passkeyStored    = hasPasskey();

  async function handleLogin() {
    if (!email.trim() || !password.trim()) { setError('Bitte alle Felder ausfüllen.'); return; }
    setLoading(true); setError('');
    try {
      const res = await auth.signIn(email.trim().toLowerCase(), password);
      if (res.error || !res.access_token) {
        setError(res.error?.message || 'E-Mail oder Passwort falsch.');
        setLoading(false); return;
      }
      const tok = res.access_token as string;
      const em  = email.trim().toLowerCase();
      localStorage.setItem('garage_token',   tok);
      localStorage.setItem('garage_email',   em);
      if (res.refresh_token) localStorage.setItem('garage_refresh', res.refresh_token as string);

      if (passkeyAvailable && !passkeyStored) {
        setPendingToken(tok); setPendingEmail(em);
        setView('faceid-setup');
      } else {
        onLogin(tok, em);
      }
    } catch {
      setError('Verbindungsfehler');
    }
    setLoading(false);
  }

  async function handleFaceIDLogin() {
    setFaceLoading(true); setError('');
    const ok = await authenticateWithPasskey();
    if (!ok) {
      setError('Face ID nicht erkannt. Bitte mit Passwort anmelden.');
      setFaceLoading(false); return;
    }

    const refresh  = localStorage.getItem('garage_refresh');
    const savedEm  = getPasskeyEmail() || localStorage.getItem('garage_email') || '';

    if (refresh) {
      try {
        const res = await auth.refresh(refresh);
        if (res.access_token) {
          const tok = res.access_token as string;
          localStorage.setItem('garage_token',   tok);
          if (res.refresh_token) localStorage.setItem('garage_refresh', res.refresh_token as string);
          onLogin(tok, savedEm);
          return;
        }
      } catch { /* fall through */ }
    }

    const storedTok = localStorage.getItem('garage_token');
    if (storedTok) {
      try {
        const user = await auth.getUser(storedTok);
        if (!user.error && user.email) { onLogin(storedTok, savedEm); return; }
      } catch { /* fall through */ }
    }

    setError('Sitzung abgelaufen. Bitte mit Passwort anmelden.');
    clearPasskey();
    setFaceLoading(false);
  }

  async function handleSetupFaceID() {
    setLoading(true);
    const ok = await registerPasskey(pendingEmail);
    setLoading(false);
    if (!ok) setError('Face ID konnte nicht eingerichtet werden.');
    onLogin(pendingToken, pendingEmail);
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

        {/* ── Face ID setup view ── */}
        {view === 'faceid-setup' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, color: 'var(--blue)' }}>
              <FaceIDIcon size={64} />
            </div>
            <h2 className="sf-title3" style={{ marginBottom: 8 }}>Face ID einrichten</h2>
            <p className="sf-subhead" style={{ color: 'var(--label2)', marginBottom: 28, lineHeight: 1.5 }}>
              Beim nächsten Mal schnell und sicher mit Face ID oder Touch ID anmelden.
            </p>
            <button onClick={handleSetupFaceID} disabled={loading} className="btn-system" style={{ marginBottom: 12 }}>
              {loading ? <Spinner size={20} color="rgba(255,255,255,0.7)" /> : 'Jetzt einrichten'}
            </button>
            <button
              onClick={() => onLogin(pendingToken, pendingEmail)}
              className="btn-system btn-secondary"
              style={{ fontSize: 15 }}
            >
              Überspringen
            </button>
          </div>
        )}

        {/* ── Standard login view ── */}
        {view === 'login' && (
          <>
            <div className="form-section" style={{ marginBottom: 16 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-Mail"
                className="text-field"
                onKeyDown={onKey}
              />
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Passwort"
                  className="text-field text-field-last"
                  style={{ paddingRight: 50 }}
                  onKeyDown={onKey}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--label3)', padding: 4, display: 'flex', alignItems: 'center',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--blue)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--label3)')}
                  aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>

            <button onClick={handleLogin} disabled={loading} className="btn-system" style={{ marginBottom: passkeyStored ? 12 : 0 }}>
              {loading ? <Spinner size={20} color="rgba(255,255,255,0.7)" /> : 'Anmelden'}
            </button>

            {passkeyStored && (
              <button
                onClick={handleFaceIDLogin}
                disabled={faceLoading}
                className="btn-system btn-secondary"
                style={{ gap: 10 }}
              >
                {faceLoading
                  ? <Spinner size={18} />
                  : <><FaceIDIcon size={22} /><span>Mit Face ID anmelden</span></>
                }
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
