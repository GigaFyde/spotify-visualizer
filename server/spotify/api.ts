const BASE_URL = 'https://api.spotify.com/v1';

async function spotifyFetch(token: string, url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options?.headers },
  });
}

export async function getCurrentlyPlaying(token: string) {
  const res = await spotifyFetch(token, `${BASE_URL}/me/player/currently-playing`);
  if (res.status === 204 || res.status === 202) return null;
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

export async function getMe(token: string) {
  const res = await spotifyFetch(token, `${BASE_URL}/me`);
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

export async function sendCommand(token: string, command: string, method: string, querystring?: string) {
  const qs = querystring ? `?${querystring}` : '';
  const res = await spotifyFetch(token, `${BASE_URL}/me/player/${command}${qs}`, { method });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Spotify command ${command} failed: ${res.status} ${text}`);
  }
}

export async function sendPlayCommand(token: string, payload: any) {
  const res = await spotifyFetch(token, `${BASE_URL}/me/player/play`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Spotify play command failed: ${res.status} ${text}`);
  }
}
