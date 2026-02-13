import { initWebGL } from './renderer/context.js';
import { compileShaderProgram } from './renderer/shader-manager.js';
import { createFramebuffer } from './renderer/framebuffers.js';
import { createNoiseTexture } from './renderer/noise-texture.js';
import { createMeshBuffers, createPostBuffers, initPostBuffers, updateMeshBuffers } from './renderer/mesh.js';
import type { VectorData } from './renderer/mesh.js';
import { render } from './renderer/scene.js';
import { geometryVert, geometryFrag, postVert, postFrag, postLowFrag } from './shaders/index.js';
import { createStateMachine } from './state/state-machine.js';
import { createAppState } from './state/app-state.js';
import { createWSClient } from './ws-client.js';
import { createAdaptiveQuality } from './quality/adaptive.js';
import { PRESETS } from './quality/presets.js';
import { mvMatrix, pMatrix, eyeVector } from './utils/math.js';
import { animConfig, setAnimationPreset } from './config/animation.js';

declare const cast: any;

/** Detect cast device type from screen dimensions */
function detectCastDevice(): 'nest-hub-2' | 'nest-hub-1' | 'tv' | 'unknown' {
  const w = screen.width || window.innerWidth;
  const h = screen.height || window.innerHeight;
  console.log(`[cast-receiver] Screen: ${w}x${h}`);

  // Nest Hub 2: 1024x600
  if (w === 1024 && h === 600) return 'nest-hub-2';
  // Nest Hub 1st gen: 1024x600 (same res, but less GPU - treat same)
  // Chromecast on TV: typically 1920x1080 or 1280x720
  if (w >= 1280) return 'tv';
  return 'unknown';
}

function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const device = detectCastDevice();
  console.log(`[cast-receiver] Detected device: ${device}`);

  // Device-specific tuning
  if (device === 'nest-hub-2') {
    // Small display, weak GPU - optimize for smooth performance
    setAnimationPreset('clean');
    // Reduce camera movement further for small screen viewing distance
    animConfig.cameraMovement = 0.2;
    animConfig.fovBreathing = 0.15;
    animConfig.cameraRoll = 0.05;
    // Keep some beat reactivity for life
    animConfig.beatReactivity = 0.4;
    // Disable heavy post-fx
    animConfig.vhsEffect = 0;
    animConfig.scanlines = 0;
    animConfig.chromaticAberration = 0;
    animConfig.vignette = 0.2;
  } else {
    // TV or unknown - use subtle preset (good for viewing distance)
    setAnimationPreset('subtle');
  }

  // Init WebGL - Nest Hub gets higher downsample from the start
  const initialDownsample = device === 'nest-hub-2' ? 2 : 1;
  const glCtx = initWebGL(canvas, initialDownsample);
  const { gl } = glCtx;

  // Compile shaders
  const geometryShader = compileShaderProgram(gl, geometryVert, geometryFrag,
    ['aVertexPosition', 'aVertexColor', 'aVertexData1', 'aVertexData2'],
    ['uPMatrix', 'uMVMatrix', 'uPMatrix2', 'uMVMatrix2', 'eyeVector', 'time', 'progress', 'wobble1', 'wobble2', 'uWriteDepth']
  );

  // Nest Hub skips full post shader entirely to save GPU
  const useFullPost = device !== 'nest-hub-2';

  let postShader = useFullPost
    ? compileShaderProgram(gl, postVert, postFrag,
        ['aVertexPosition', 'aVertexTexture'],
        ['tColor', 'tDepth', 'tNoise', 'time', 'fBeat1', 'fBeat2', 'fBeat3'])
    : compileShaderProgram(gl, postVert, postLowFrag,
        ['aVertexPosition', 'aVertexTexture'],
        ['tColor', 'tDepth', 'tNoise', 'time', 'fBeat1', 'fBeat2', 'fBeat3']);

  const postLowShader = useFullPost
    ? compileShaderProgram(gl, postVert, postLowFrag,
        ['aVertexPosition', 'aVertexTexture'],
        ['tColor', 'tDepth', 'tNoise', 'time', 'fBeat1', 'fBeat2', 'fBeat3'])
    : postShader;
  const postFullShader = useFullPost ? postShader : postLowShader;

  // Create GPU resources - Nest Hub uses smaller framebuffers
  const rttSize = device === 'nest-hub-2' ? 256 : 1024;
  let colorFb = createFramebuffer(gl, rttSize, rttSize);
  let depthFb = createFramebuffer(gl, rttSize, rttSize);
  const noiseTex = createNoiseTexture(gl);
  const meshBuffers = createMeshBuffers(gl);
  const postBuffers = createPostBuffers(gl);
  initPostBuffers(gl, postBuffers);

  // State - Nest Hub starts and stays at potato, TV starts at potato and scales up
  const appState = createAppState();
  const stateMachine = createStateMachine();
  const adaptiveQuality = createAdaptiveQuality('potato');
  let pendingVectorData: VectorData | null = null;

  // Nest Hub: lock to potato, disable adaptive scaling
  if (device === 'nest-hub-2') {
    adaptiveQuality.forcePreset('potato');
  }

  // WebSocket - same origin as receiver
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${location.host}/ws`;
  createWSClient(wsUrl, {
    onConnect() {
      appState.connected = true;
      console.log('[cast-receiver] WS connected');
    },
    onDisconnect() {
      appState.connected = false;
      console.log('[cast-receiver] WS disconnected');
    },
    onTrackUpdate(track) {
      appState.track = track;
      appState.durationMs = track.durationMs;
    },
    onTriangles(data) {
      if (stateMachine.state === 'blank' || stateMachine.state === 'fadein') {
        updateMeshBuffers(gl, meshBuffers, data);
        if (stateMachine.state === 'blank') {
          stateMachine.state = 'fadein';
          stateMachine.stateStart = appState.globalTime;
        }
      } else {
        pendingVectorData = data;
      }
      if (appState.track) {
        appState.visibleAlbumUri = appState.track.albumUri;
      }
    },
    onBeat(beat1, beat2, beat4) {
      if (beat1 > 0) { appState.beatValue = 1.0; appState.beatDelta += 1.0; }
      if (beat2 > 0) appState.beatValue2 = 1.0;
      if (beat4 > 0) appState.beatValue4 = 1.0;
    },
    onPlaybackState(positionMs, durationMs, isPlaying) {
      appState.positionMs = positionMs;
      appState.durationMs = durationMs;
      appState.isPlaying = isPlaying;
    },
  });

  // Start CAF receiver context
  const castContext = cast.framework.CastReceiverContext.getInstance();
  castContext.start();
  console.log('[cast-receiver] CAF receiver started');

  // Render loop
  function tick() {
    requestAnimationFrame(tick);

    const now = performance.now();
    if (appState.firstTime === 0) appState.firstTime = now;
    const dt = appState.lastFrameTime > 0 ? now - appState.lastFrameTime : 16;
    appState.lastFrameTime = now;
    appState.globalTime = now - appState.firstTime;

    if (appState.isPlaying) {
      appState.positionMs += dt;
    }

    const albumUri = appState.track?.albumUri ?? '';
    const smResult = stateMachine.update(appState.globalTime, albumUri, appState.visibleAlbumUri);

    if (stateMachine.state === 'blank' && pendingVectorData) {
      updateMeshBuffers(gl, meshBuffers, pendingVectorData);
      pendingVectorData = null;
      appState.visibleAlbumUri = albumUri;
      stateMachine.state = 'fadein';
      stateMachine.stateStart = appState.globalTime;
    }

    render(glCtx, geometryShader, postShader, meshBuffers, postBuffers, colorFb, depthFb, noiseTex, {
      globalTime: appState.globalTime,
      progress: smResult.progress,
      beatValue: appState.beatValue,
      beatValue2: appState.beatValue2,
      beatValue4: appState.beatValue4,
      beatDelta: appState.beatDelta,
      mvMatrix,
      pMatrix,
      eyeVector,
    });

    appState.beatValue = Math.max(0, appState.beatValue - 0.015);
    appState.beatValue2 = Math.max(0, appState.beatValue2 - 0.015);
    appState.beatValue4 = Math.max(0, appState.beatValue4 - 0.015);

    // Adaptive quality
    const newPreset = adaptiveQuality.update(dt);
    if (newPreset) {
      const preset = PRESETS[newPreset];
      glCtx.setDownsample(preset.canvasDownsample);
      postShader = preset.useFullPost ? postFullShader : postLowShader;
      if (colorFb.width !== preset.rttResolution) {
        colorFb = createFramebuffer(gl, preset.rttResolution, preset.rttResolution);
        depthFb = createFramebuffer(gl, preset.rttResolution, preset.rttResolution);
      }
      console.log('[cast-receiver] Quality:', preset.name);
    }
  }

  tick();
}

main();
