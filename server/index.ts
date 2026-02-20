import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { generateCodeVerifier, generateLoginUrl, exchangeCode } from './spotify/auth.js';
import { sendCommand } from './spotify/api.js';
import { packVectorData } from './ws/protocol.js';
import { createTriangleCache } from './cache/triangle-cache.js';
import { SessionManager } from './session/session-manager.js';
import type { UserSession } from './session/user-session.js';
import type { ClientMessage } from './ws/protocol.js';

interface WsData {
  sessionId: string;
}

const COOKIE_NAME = 'spotify_session';

const app = new Hono();
const cache = createTriangleCache();
const sessionManager = new SessionManager(cache);

// Restore sessions from disk
sessionManager.restoreFromDisk();

// Start polling for all restored sessions that have valid tokens
for (const id of (await import('./session/storage.js')).listSessions()) {
  const session = sessionManager.get(id);
  if (session && session.tokens.accessToken && session.tokens.refreshToken) {
    session.startPolling();
  }
}

// Periodic cleanup of very old sessions (every 24h)
setInterval(() => sessionManager.cleanup(), 24 * 60 * 60 * 1000);

/** Helper to extract session from cookie */
function getSession(c: any): UserSession | null {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (!sessionId) return null;
  return sessionManager.get(sessionId) ?? null;
}

/** Set session cookie */
function setSessionCookie(c: any, sessionId: string): void {
  setCookie(c, COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 90 * 24 * 60 * 60, // 90 days
  });
}

// Auth routes
app.get('/auth/login', async (c) => {
  // Create a new session
  const { sessionId, session } = sessionManager.create();
  const codeVerifier = generateCodeVerifier();
  session.setCodeVerifier(codeVerifier);

  // Store where to redirect after auth completes
  const redirect = c.req.query('redirect');
  if (redirect && redirect.startsWith('/')) {
    session.setRedirectUrl(redirect);
  }

  setSessionCookie(c, sessionId);

  const url = await generateLoginUrl(codeVerifier);
  return c.redirect(url);
});

app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('Missing code', 400);

  const session = getSession(c);
  if (!session) return c.text('No session', 400);

  const codeVerifier = session.getCodeVerifier();
  if (!codeVerifier) return c.text('Missing code verifier', 400);

  const tokens = await exchangeCode(code, codeVerifier);
  session.tokens.accessToken = tokens.accessToken;
  session.tokens.refreshToken = tokens.refreshToken;
  session.tokens.expiresAt = tokens.expiresAt;
  session.tokens.createdAt = Date.now();
  await session.saveTokens();

  session.startPolling();
  return c.redirect(session.getRedirectUrl());
});

app.get('/auth/status', (c) => {
  const session = getSession(c);
  const authenticated = !!(session && session.tokens.accessToken && session.tokens.refreshToken);
  return c.json({ authenticated });
});

app.post('/auth/logout', (c) => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (sessionId) {
    sessionManager.delete(sessionId);
    deleteCookie(c, COOKIE_NAME, { path: '/' });
  }
  return c.json({ ok: true });
});

// API proxy for commands
app.post('/api/command', async (c) => {
  const session = getSession(c);
  if (!session || !session.tokens.accessToken) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const body = await c.req.json<ClientMessage>();
  if (body.type !== 'command') return c.json({ error: 'Invalid message type' }, 400);

  try {
    const token = session.tokens.accessToken;
    const sid = session.sessionId;
    switch (body.action) {
      case 'play':
        await sendCommand(token, 'play', 'PUT', undefined, sid);
        break;
      case 'pause':
        await sendCommand(token, 'pause', 'PUT', undefined, sid);
        break;
      case 'next':
        await sendCommand(token, 'next', 'POST', undefined, sid);
        break;
      case 'previous':
        await sendCommand(token, 'previous', 'POST', undefined, sid);
        break;
      case 'seek':
        if (body.seekMs != null) {
          await sendCommand(token, 'seek', 'PUT', `position_ms=${Math.round(body.seekMs)}`, sid);
        }
        break;
    }
    session.pollNow();
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Cast token — single-use, time-limited token for cast receiver WS auth
app.post('/api/cast-token', (c) => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (!sessionId) return c.json({ error: 'Not authenticated' }, 401);

  const token = sessionManager.createCastToken(sessionId);
  if (!token) return c.json({ error: 'Invalid session' }, 401);

  return c.json({ castToken: token });
});

// Serve static files in production — no-cache on HTML, immutable on hashed assets
app.use('/*', async (c, next) => {
  await next();
  const path = c.req.path;
  if (path.endsWith('.html') || path === '/') {
    c.header('Cache-Control', 'no-cache');
  } else if (path.includes('/assets/')) {
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  }
});
app.use('/*', serveStatic({ root: './dist/client' }));

/** Extract session from request — tries cast_token (single-use), then cookie */
function getSessionFromRequest(req: Request): UserSession | null {
  const url = new URL(req.url);

  // Cast receiver: redeem a single-use cast token (non-spoofable)
  const castToken = url.searchParams.get('cast_token');
  if (castToken) {
    return sessionManager.redeemCastToken(castToken);
  }

  // Browser clients: extract from cookie header
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  return sessionManager.get(match[1]) ?? null;
}

// Bun.serve with WebSocket
const server = Bun.serve<WsData>({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const session = getSessionFromRequest(req);
      if (!session) {
        return new Response('No valid session', { status: 401 });
      }
      if (server.upgrade(req, { data: { sessionId: session.sessionId } })) return;
      return new Response('WebSocket upgrade failed', { status: 500 });
    }
    return app.fetch(req, { ip: server.requestIP(req) });
  },
  websocket: {
    open(ws) {
      const session = sessionManager.get(ws.data.sessionId);
      if (!session) {
        ws.close(1008, 'Invalid session');
        return;
      }

      session.addConnection(ws);

      // Send current state to new client
      if (session.currentTrack) {
        ws.send(JSON.stringify({
          type: 'track_update',
          ...session.currentTrack,
        }));
      }
      if (session.currentVectorData) {
        ws.send(packVectorData(session.currentVectorData));
      }
      ws.send(JSON.stringify({ type: 'playback_state', ...session.currentPlaybackState }));
    },

    message(ws, message) {
      const session = sessionManager.get(ws.data.sessionId);
      if (!session) return;

      try {
        const msg = JSON.parse(String(message)) as ClientMessage;
        if (msg.type === 'command') {
          const token = session.tokens.accessToken;
          if (!token) return;

          const sid = ws.data.sessionId;
          switch (msg.action) {
            case 'play':
              sendCommand(token, 'play', 'PUT', undefined, sid);
              break;
            case 'pause':
              sendCommand(token, 'pause', 'PUT', undefined, sid);
              break;
            case 'next':
              sendCommand(token, 'next', 'POST', undefined, sid);
              break;
            case 'previous':
              sendCommand(token, 'previous', 'POST', undefined, sid);
              break;
            case 'seek':
              if (msg.seekMs != null) {
                sendCommand(token, 'seek', 'PUT', `position_ms=${Math.round(msg.seekMs)}`, sid);
              }
              break;
          }
          session.pollNow();
        }
      } catch {
        // Ignore malformed messages
      }
    },

    close(ws) {
      const session = sessionManager.get(ws.data.sessionId);
      session?.removeConnection(ws);
    },
  },
});

console.log(`Server running on http://localhost:${server.port}`);
console.log(`Open http://localhost:${server.port}/auth/login to authenticate with Spotify`);
