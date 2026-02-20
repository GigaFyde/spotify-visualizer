# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **Spotify API Rate Limiting & Resilience** — eliminates 429 errors under multi-session load
  - Token bucket rate limiter (`server/spotify/rate-limiter.ts`) — 10 tokens, 8/s refill, 1-token reserve for user commands
  - Priority request queue (`server/spotify/priority-queue.ts`) — critical (token refresh) bypasses queue, high (commands) at front, normal (polling) at back
  - Circuit breaker (`server/spotify/circuit-breaker.ts`) — opens after 3 consecutive 429s, exponential cooldown 10s→60s, half-open probe recovery
  - `SpotifyClient` singleton (`server/spotify/spotify-client.ts`) — all Spotify API calls route through centralized rate limiting with exponential backoff (base 1s, 2×, max 30s, ±25% jitter), `Retry-After` header parsing, and per-session request budgets (15 polls/min, 30 commands/min)
  - Adaptive polling intervals in `server/spotify/poller.ts` — playing=4s, paused=10s, after 429=4→8→16→30s backoff, recovery ramp after 3 consecutive successes
  - `api_health` WebSocket message (`server/ws/protocol.ts`) — broadcasts `ok`/`degraded`/`limited` status to all clients on state change
  - Frontend rate limit indicator (`client/src/ui/api-health.ts`) — hidden when healthy, yellow dot "Slowing down…" when degraded, red dot with countdown when rate limited
  - Admin diagnostics endpoint `GET /api/admin/rate-limit-stats` — exposes token bucket state, circuit breaker state, and per-session budget usage
  - Graceful shutdown handler (SIGTERM/SIGINT) — cleans up rate limiter timers and pending queue entries

### Changed

- `server/spotify/api.ts` — all API functions now route through `SpotifyClient` singleton with appropriate priority (`normal` for polling, `high` for user commands)
- `server/spotify/poller.ts` — fixed 4s interval replaced with adaptive scheduling
- `server/session/session-manager.ts` — added `broadcastAll()` for health message fan-out, `pollingCount` getter, and `removeSession()` call on session delete
- `server/index.ts` — sessionId wired through all command handlers for per-session budget tracking
