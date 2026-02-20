import { SpotifyClient } from './spotify-client.js';

const BASE_URL = 'https://api.spotify.com/v1';

export const spotifyClient = new SpotifyClient();

export async function getCurrentlyPlaying(token: string, sessionId?: string) {
  const res = await spotifyClient.request(
    token,
    `${BASE_URL}/me/player/currently-playing`,
    undefined,
    'normal',
    sessionId,
  );
  if (res.status === 204 || res.status === 202) return null;
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

export async function getMe(token: string, sessionId?: string) {
  const res = await spotifyClient.request(
    token,
    `${BASE_URL}/me`,
    undefined,
    'high',
    sessionId,
  );
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

export async function sendCommand(
  token: string,
  command: string,
  method: string,
  querystring?: string,
  sessionId?: string,
) {
  const qs = querystring ? `?${querystring}` : '';
  const res = await spotifyClient.request(
    token,
    `${BASE_URL}/me/player/${command}${qs}`,
    { method },
    'high',
    sessionId,
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Spotify command ${command} failed: ${res.status} ${text}`);
  }
}

export async function sendPlayCommand(token: string, payload: any, sessionId?: string) {
  const res = await spotifyClient.request(
    token,
    `${BASE_URL}/me/player/play`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'high',
    sessionId,
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Spotify play command failed: ${res.status} ${text}`);
  }
}
