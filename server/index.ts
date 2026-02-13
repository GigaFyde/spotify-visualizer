import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { getLoginUrl, handleCallback, isAuthenticated } from './spotify/auth.js';
import { sendCommand } from './spotify/api.js';
import { createPoller } from './spotify/poller.js';
import { vectorize } from './triangulation/vectorizer.js';
import { createBroadcaster } from './ws/broadcaster.js';
import { createTriangleCache } from './cache/triangle-cache.js';
import { createBeatDetector } from './audio/beat-detector.js';
import type { ClientMessage, VectorData } from './ws/protocol.js';
import { packVectorData } from './ws/protocol.js';

const app = new Hono();
const broadcaster = createBroadcaster();
const cache = createTriangleCache();
const beatDetector = createBeatDetector();

let currentVectorData: VectorData | null = null;
let currentTrack: {
  name: string;
  artist: string;
  album: string;
  albumUri: string;
  albumImageUrl: string;
  durationMs: number;
} | null = null;
let currentPlaybackState = { positionMs: 0, durationMs: 0, isPlaying: false };

// Auth routes
app.get('/auth/login', async (c) => {
  const url = await getLoginUrl();
  return c.redirect(url);
});

app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('Missing code', 400);
  await handleCallback(code);
  // Start polling after successful auth
  poller.start();
  return c.redirect('/');
});

app.get('/auth/status', (c) => {
  return c.json({ authenticated: isAuthenticated() });
});

// API proxy for commands
app.post('/api/command', async (c) => {
  const body = await c.req.json<ClientMessage>();
  if (body.type !== 'command') return c.json({ error: 'Invalid message type' }, 400);

  try {
    switch (body.action) {
      case 'play':
        await sendCommand('play', 'PUT');
        break;
      case 'pause':
        await sendCommand('pause', 'PUT');
        break;
      case 'next':
        await sendCommand('next', 'POST');
        break;
      case 'previous':
        await sendCommand('previous', 'POST');
        break;
      case 'seek':
        if (body.seekMs != null) {
          await sendCommand('seek', 'PUT', `position_ms=${Math.round(body.seekMs)}`);
        }
        break;
    }
    poller.pollNow();
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Serve static files in production
app.use('/*', serveStatic({ root: './dist/client' }));

// Poller setup
const poller = createPoller({
  onTrackChange: async (track) => {
    currentTrack = {
      name: track.name,
      artist: track.artist,
      album: track.album,
      albumUri: track.albumUri,
      albumImageUrl: track.albumImageUrl,
      durationMs: 0,
    };

    broadcaster.broadcast({
      type: 'track_update',
      name: track.name,
      artist: track.artist,
      album: track.album,
      albumUri: track.albumUri,
      albumImageUrl: track.albumImageUrl,
      durationMs: currentPlaybackState.durationMs,
    });

    // Check cache first
    if (cache.has(track.albumUri)) {
      currentVectorData = cache.get(track.albumUri)!;
    } else {
      try {
        currentVectorData = await vectorize(track.albumImageUrl);
        cache.set(track.albumUri, currentVectorData);
      } catch (e) {
        console.error('Vectorization failed:', e);
      }
    }

    if (currentVectorData) {
      broadcaster.broadcastBinary(packVectorData(currentVectorData));
    }

    beatDetector.reset();
  },

  onPlaybackState: (positionMs, durationMs, isPlaying) => {
    currentPlaybackState = { positionMs, durationMs, isPlaying };
    if (currentTrack) {
      currentTrack.durationMs = durationMs;
    }

    broadcaster.broadcast({ type: 'playback_state', positionMs, durationMs, isPlaying });

    const beat = beatDetector.update(positionMs, isPlaying);
    if (beat) {
      broadcaster.broadcast({ type: 'beat', ...beat });
    }
  },
});

// Bun.serve with WebSocket
const server = Bun.serve({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (server.upgrade(req)) return;
      return new Response('WebSocket upgrade failed', { status: 500 });
    }
    return app.fetch(req, { ip: server.requestIP(req) });
  },
  websocket: {
    open(ws) {
      broadcaster.addClient(ws);
      // Send current state to new client
      if (currentTrack) {
        ws.send(JSON.stringify({
          type: 'track_update',
          ...currentTrack,
        }));
      }
      if (currentVectorData) {
        ws.send(packVectorData(currentVectorData));
      }
      ws.send(JSON.stringify({ type: 'playback_state', ...currentPlaybackState }));
    },
    message(_ws, message) {
      try {
        const msg = JSON.parse(String(message)) as ClientMessage;
        if (msg.type === 'command') {
          switch (msg.action) {
            case 'play':
              sendCommand('play', 'PUT');
              break;
            case 'pause':
              sendCommand('pause', 'PUT');
              break;
            case 'next':
              sendCommand('next', 'POST');
              break;
            case 'previous':
              sendCommand('previous', 'POST');
              break;
            case 'seek':
              if (msg.seekMs != null) {
                sendCommand('seek', 'PUT', `position_ms=${Math.round(msg.seekMs)}`);
              }
              break;
          }
          poller.pollNow();
        }
      } catch {
        // Ignore malformed messages
      }
    },
    close(ws) {
      broadcaster.removeClient(ws);
    },
  },
});

// Start polling if authenticated
if (isAuthenticated()) {
  poller.start();
}

console.log(`Server running on http://localhost:${server.port}`);
console.log(`Open http://localhost:${server.port}/auth/login to authenticate with Spotify`);
