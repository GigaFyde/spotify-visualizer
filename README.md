# Spotify Visualizer

A re-imagined version of [possan's WebGL Now Playing Screen](https://github.com/possan/webgl-spotify-connect-now-playing-screen-example) — the original rendered Spotify album art as triangulated WebGL meshes using an external polyserver. This version rebuilds the entire stack from scratch with a modern architecture: server-side triangulation, real-time beat detection, WebSocket streaming, adaptive quality, and Google Cast support.

## What's Different

- **Self-contained** — no external polyserver dependency. Album art is fetched, edge-detected, and Delaunay-triangulated on the server using Sharp and Delaunator.
- **Bun + Hono server** — handles Spotify PKCE auth, API polling, triangulation, beat simulation, and WebSocket broadcasting.
- **Vite-built client** — thin WebGL1 renderer with typed shader programs and post-processing (VHS, scanlines, chromatic aberration, vignette).
- **Adaptive quality** — automatically scales render resolution, framebuffer size, and post-processing based on frame rate.
- **Animation presets** — frozen, clean, subtle, default, expressive, wild — configurable via settings panel or console (`window.viz`).
- **Google Cast** — cast receiver with device detection (optimized settings for Nest Hub 2's 1024x600 display and limited GPU).
- **Settings panel** — in-browser UI (press `S`) for tweaking animation, quality, and post-FX parameters in real time.

## Getting Started

```bash
# Install dependencies
bun install

# Start dev server (Vite HMR + Bun server)
bun run dev

# Or build and run production
bun run build
bun run start
```

Open `http://127.0.0.1:3000` — you'll be redirected to Spotify login on first visit. Requires a [Spotify Developer App](https://developer.spotify.com/dashboard) with `http://127.0.0.1:3000/auth/callback` as a redirect URI.

## Controls

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| Left/Right | Previous/Next track |
| S | Toggle settings panel |
| Click progress bar | Seek |

## Architecture

```
server/
  index.ts            Hono server, WebSocket, static files
  spotify/            PKCE auth, API polling
  triangulation/      Image loading, edge detection, Delaunay
  audio/              Beat simulation from Spotify audio features
  ws/                 WebSocket protocol and broadcasting

client/
  src/main.ts         Main visualizer entry
  src/cast-receiver.ts  Google Cast receiver (device-optimized)
  src/renderer/       WebGL context, shaders, mesh, framebuffers
  src/quality/        Adaptive quality scaling and presets
  src/config/         Animation presets and runtime config
  src/ui/             Settings panel, toast, progress bar, controls
  src/shaders/        GLSL vertex/fragment shaders
  src/state/          App state and fade state machine
```

## Credits

Original concept and WebGL renderer by [possan](https://github.com/possan).
