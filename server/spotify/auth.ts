const SPOTIFY_CLIENT_ID = Bun.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_REDIRECT_URI = Bun.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/auth/callback';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';

if (!SPOTIFY_CLIENT_ID) {
  console.error('SPOTIFY_CLIENT_ID environment variable is required');
}

let codeVerifier = '';
let accessToken = '';
let refreshToken = '';
let expiresAt = 0;

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function getLoginUrl(): Promise<string> {
  codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64urlencode(hashed);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID!,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function handleCallback(code: string): Promise<void> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID!,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  expiresAt = Date.now() + data.expires_in * 1000;
}

async function refreshAccessToken(): Promise<void> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID!,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  if (data.refresh_token) {
    refreshToken = data.refresh_token;
  }
  expiresAt = Date.now() + data.expires_in * 1000;
}

export async function getAccessToken(): Promise<string | null> {
  if (!accessToken) return null;

  // Refresh if within 60 seconds of expiry
  if (Date.now() > expiresAt - 60000) {
    await refreshAccessToken();
  }

  return accessToken;
}

export function isAuthenticated(): boolean {
  return accessToken !== '' && refreshToken !== '';
}
