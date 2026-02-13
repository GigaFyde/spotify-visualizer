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
import { showToast } from './ui/toast.js';
import { updateProgressBar } from './ui/progress-bar.js';
import { initControls } from './ui/controls.js';
import { createSettingsPanel } from './ui/settings-panel.js';
import { mvMatrix, pMatrix, eyeVector } from './utils/math.js';
import { animConfig, setAnimationPreset, ANIMATION_PRESETS } from './config/animation.js';

// Expose config on window for runtime tweaking via console
declare global { interface Window { viz: any; } }

function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const statusEl = document.getElementById('status');

  // Init WebGL
  const glCtx = initWebGL(canvas, 1);
  const { gl } = glCtx;

  // Compile shaders
  const geometryShader = compileShaderProgram(gl, geometryVert, geometryFrag,
    ['aVertexPosition', 'aVertexColor', 'aVertexData1', 'aVertexData2'],
    ['uPMatrix', 'uMVMatrix', 'uPMatrix2', 'uMVMatrix2', 'eyeVector', 'time', 'progress', 'wobble1', 'wobble2', 'uWriteDepth']
  );

  // Start with full post shader - may switch to low later based on quality
  let postShader = compileShaderProgram(gl, postVert, postFrag,
    ['aVertexPosition', 'aVertexTexture'],
    ['tColor', 'tDepth', 'tNoise', 'time', 'fBeat1', 'fBeat2', 'fBeat3']
  );

  const postLowShader = compileShaderProgram(gl, postVert, postLowFrag,
    ['aVertexPosition', 'aVertexTexture'],
    ['tColor', 'tDepth', 'tNoise', 'time', 'fBeat1', 'fBeat2', 'fBeat3']
  );
  const postFullShader = postShader;

  // Create GPU resources
  let colorFb = createFramebuffer(gl, 1024, 1024);
  let depthFb = createFramebuffer(gl, 1024, 1024);
  const noiseTex = createNoiseTexture(gl);
  const meshBuffers = createMeshBuffers(gl);
  const postBuffers = createPostBuffers(gl);
  initPostBuffers(gl, postBuffers);

  // State
  const appState = createAppState();
  const stateMachine = createStateMachine();
  const adaptiveQuality = createAdaptiveQuality('high');
  let pendingVectorData: VectorData | null = null;

  // WebSocket
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${location.host}/ws`;
  const wsClient = createWSClient(wsUrl, {
    onConnect() {
      appState.connected = true;
      if (statusEl) statusEl.textContent = 'Connected';
    },
    onDisconnect() {
      appState.connected = false;
      if (statusEl) statusEl.textContent = 'Disconnected';
    },
    onTrackUpdate(track) {
      appState.track = track;
      appState.durationMs = track.durationMs;
      showToast(track.name, track.artist + ' - ' + track.album);
    },
    onTriangles(data) {
      // If we're in blank state, apply immediately and start fadein
      if (stateMachine.state === 'blank' || stateMachine.state === 'fadein') {
        updateMeshBuffers(gl, meshBuffers, data);
        if (stateMachine.state === 'blank') {
          stateMachine.state = 'fadein';
          stateMachine.stateStart = appState.globalTime;
        }
      } else {
        // Queue for when we return to blank
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

  // Controls
  initControls(
    (cmd) => wsClient.send(cmd),
    () => ({ isPlaying: appState.isPlaying, durationMs: appState.durationMs })
  );

  // Settings panel
  const settingsPanel = createSettingsPanel(adaptiveQuality, (presetName) => {
    const preset = PRESETS[presetName];
    if (!preset) return;
    glCtx.setDownsample(preset.canvasDownsample);
    postShader = preset.useFullPost ? postFullShader : postLowShader;
    if (colorFb.width !== preset.rttResolution) {
      colorFb = createFramebuffer(gl, preset.rttResolution, preset.rttResolution);
      depthFb = createFramebuffer(gl, preset.rttResolution, preset.rttResolution);
    }
    console.log('Quality:', preset.name);
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 's' || e.key === 'S') settingsPanel.toggle();
  });

  // Expose runtime API on window for console tweaking
  window.viz = {
    config: animConfig,
    presets: ANIMATION_PRESETS,
    setPreset: setAnimationPreset,
    quality: adaptiveQuality,
    settings: settingsPanel,
  };

  // Render loop
  function tick() {
    requestAnimationFrame(tick);

    const now = performance.now();
    if (appState.firstTime === 0) appState.firstTime = now;
    const dt = appState.lastFrameTime > 0 ? now - appState.lastFrameTime : 16;
    appState.lastFrameTime = now;
    appState.globalTime = now - appState.firstTime;

    // Interpolate track position
    if (appState.isPlaying) {
      appState.positionMs += dt;
    }

    // Update state machine
    const albumUri = appState.track?.albumUri ?? '';
    const smResult = stateMachine.update(appState.globalTime, albumUri, appState.visibleAlbumUri);

    // Handle blank state - apply pending vectors
    if (stateMachine.state === 'blank' && pendingVectorData) {
      updateMeshBuffers(gl, meshBuffers, pendingVectorData);
      pendingVectorData = null;
      appState.visibleAlbumUri = albumUri;
      stateMachine.state = 'fadein';
      stateMachine.stateStart = appState.globalTime;
    }

    // Render
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

    // Beat decay (matching original: 0.015 per frame)
    appState.beatValue = Math.max(0, appState.beatValue - 0.015);
    appState.beatValue2 = Math.max(0, appState.beatValue2 - 0.015);
    appState.beatValue4 = Math.max(0, appState.beatValue4 - 0.015);

    // UI updates
    updateProgressBar(appState.positionMs, appState.durationMs);

    // Adaptive quality
    const newPreset = adaptiveQuality.update(dt);
    if (newPreset) {
      const preset = PRESETS[newPreset];
      glCtx.setDownsample(preset.canvasDownsample);
      postShader = preset.useFullPost ? postFullShader : postLowShader;
      // Recreate framebuffers if resolution changed
      if (colorFb.width !== preset.rttResolution) {
        colorFb = createFramebuffer(gl, preset.rttResolution, preset.rttResolution);
        depthFb = createFramebuffer(gl, preset.rttResolution, preset.rttResolution);
      }
      console.log('Quality:', preset.name);
      settingsPanel.syncQuality();
    }
  }

  tick();
}

main();
