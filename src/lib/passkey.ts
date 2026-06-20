const CRED_ID_KEY    = 'garage_passkey_id';
const CRED_EMAIL_KEY = 'garage_passkey_email';

export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'credentials' in navigator &&
    typeof PublicKeyCredential !== 'undefined'
  );
}

export function hasPasskey(): boolean {
  return !!localStorage.getItem(CRED_ID_KEY);
}

export function getPasskeyEmail(): string {
  return localStorage.getItem(CRED_EMAIL_KEY) ?? '';
}

export function clearPasskey(): void {
  localStorage.removeItem(CRED_ID_KEY);
  localStorage.removeItem(CRED_EMAIL_KEY);
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function base64urlToUint8Array(b64url: string): Uint8Array {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function registerPasskey(email: string): Promise<boolean> {
  if (!isPasskeySupported()) return false;
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'GarageOS', id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(email),
          name: email,
          displayName: 'GarageOS',
        },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return false;
    localStorage.setItem(CRED_ID_KEY, credential.id);
    localStorage.setItem(CRED_EMAIL_KEY, email);
    return true;
  } catch (err) {
    console.error('[Passkey] register:', err);
    return false;
  }
}

export async function authenticateWithPasskey(): Promise<boolean> {
  if (!isPasskeySupported()) return false;
  const credId = localStorage.getItem(CRED_ID_KEY);
  if (!credId) return false;
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ id: base64urlToUint8Array(credId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    return !!assertion;
  } catch (err) {
    console.error('[Passkey] authenticate:', err);
    return false;
  }
}
