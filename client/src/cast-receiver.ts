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
import { setAnimationPreset, animConfig } from './config/animation.js';

declare const cast: any;

const NAMESPACE = 'urn:x-cast:com.gigafyde.viz';

/** Detect cast device type from screen + viewport dimensions */
function detectCastDevice(): 'nest-hub-2' | 'nest-hub-1' | 'tv' | 'unknown' {
  const sw = screen.width || window.innerWidth;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isFuchsia = navigator.userAgent.includes('Fuchsia');

  // Nest Hub 2: screen 1280x720 but viewport 1024x600, runs Fuchsia
  if ((vw === 1024 && vh === 600) || isFuchsia) return 'nest-hub-2';
  // TV / Shield / Chromecast — anything not a smart display
  if (sw >= 960) return 'tv';
  return 'unknown';
}

function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const displayImg = document.getElementById('display-img') as HTMLImageElement;
  const displayCanvas = document.getElementById('display-canvas') as HTMLCanvasElement;
  const overlay = document.getElementById('overlay');
  const loaderStatus = document.getElementById('loader-status');

  function setStatus(text: string, isError = false) {
    if (loaderStatus) {
      loaderStatus.textContent = text;
      loaderStatus.classList.toggle('error', isError);
    }
  }

  function hideOverlay() {
    overlay?.classList.add('hidden');
  }

  const device = detectCastDevice();

  // Device-specific tuning
  if (device === 'nest-hub-2') {
    setAnimationPreset('clean');
    animConfig.cameraMovement = 0.2;
    animConfig.fovBreathing = 0.15;
    animConfig.cameraRoll = 0.05;
    animConfig.beatReactivity = 0.4;
    animConfig.vhsEffect = 0;
    animConfig.scanlines = 0;
    animConfig.chromaticAberration = 0;
    animConfig.vignette = 0.2;
  } else {
    setAnimationPreset('subtle');
  }

  // TV devices: Android TV cast browser compositor can't display <canvas> at all
  // Workaround: render WebGL to hidden canvas, blit each frame to <img> via toDataURL
  // Blit modes: 'off' (direct canvas), 'img_jpeg', '2d_canvas'
  let blitMode: 'off' | 'img_jpeg' | '2d_canvas' = (device === 'tv' || device === 'unknown') ? 'img_jpeg' : 'off';
  let blitCtx: CanvasRenderingContext2D | null = null;

  function setBlitMode(mode: typeof blitMode) {
    blitMode = mode;
    displayImg.style.display = 'none';
    displayCanvas.style.display = 'none';
    blitCtx = null;

    if (mode === 'off') {
      canvas.style.position = '';
      canvas.style.opacity = '';
      canvas.style.pointerEvents = '';
      canvas.style.zIndex = '';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    } else {
      canvas.style.position = 'fixed';
      canvas.style.opacity = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '-1';
      canvas.style.width = '1px';
      canvas.style.height = '1px';

      if (mode === '2d_canvas') {
        displayCanvas.width = window.innerWidth;
        displayCanvas.height = window.innerHeight;
        blitCtx = displayCanvas.getContext('2d');
        displayCanvas.style.display = 'block';
      } else {
        displayImg.style.display = 'block';
      }
    }
  }

  setBlitMode(blitMode);

  // Init WebGL
  const initialDownsample = device === 'nest-hub-2' ? 2 : 1;
  const useDPR = device !== 'nest-hub-2';
  const glCtx = initWebGL(canvas, initialDownsample, useDPR, {
    alpha: false,
    preserveDrawingBuffer: blitMode !== 'off',
  });
  const { gl } = glCtx;

  // Compile shaders
  let geometryShader: ReturnType<typeof compileShaderProgram>;
  let postLowShader: ReturnType<typeof compileShaderProgram>;
  let postFullShader: ReturnType<typeof compileShaderProgram>;
  let postShader: ReturnType<typeof compileShaderProgram>;
  const useFullPost = device !== 'nest-hub-2';

  try {
    geometryShader = compileShaderProgram(gl, geometryVert, geometryFrag,
      ['aVertexPosition', 'aVertexColor', 'aVertexData1', 'aVertexData2'],
      ['uPMatrix', 'uMVMatrix', 'uPMatrix2', 'uMVMatrix2', 'eyeVector', 'time', 'progress', 'wobble1', 'wobble2', 'uWriteDepth']
    );
  } catch { /* shader compile failure handled by null check in render loop */ }

  try {
    postShader = useFullPost
      ? compileShaderProgram(gl, postVert, postFrag,
          ['aVertexPosition', 'aVertexTexture'],
          ['tColor', 'tDepth', 'tNoise', 'time', 'fBeat1', 'fBeat2', 'fBeat3'])
      : compileShaderProgram(gl, postVert, postLowFrag,
          ['aVertexPosition', 'aVertexTexture'],
          ['tColor', 'tDepth', 'tNoise', 'time', 'fBeat1', 'fBeat2', 'fBeat3']);
  } catch { /* handled by null check */ }

  try {
    postLowShader = useFullPost
      ? compileShaderProgram(gl, postVert, postLowFrag,
          ['aVertexPosition', 'aVertexTexture'],
          ['tColor', 'tDepth', 'tNoise', 'time', 'fBeat1', 'fBeat2', 'fBeat3'])
      : postShader!;
    postFullShader = useFullPost ? postShader! : postLowShader;
  } catch { /* handled by null check */ }

  // Create GPU resources
  const rttSize = device === 'nest-hub-2' ? 256 : 1024;
  let colorFb = createFramebuffer(gl, rttSize, rttSize);
  let depthFb = createFramebuffer(gl, rttSize, rttSize);
  const noiseTex = createNoiseTexture(gl);
  const meshBuffers = createMeshBuffers(gl);
  const postBuffers = createPostBuffers(gl);
  initPostBuffers(gl, postBuffers);

  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

  // State
  const appState = createAppState();
  const stateMachine = createStateMachine();
  const adaptiveQuality = createAdaptiveQuality('potato');
  let pendingVectorData: VectorData | null = null;

  if (device === 'nest-hub-2') {
    adaptiveQuality.forcePreset('potato');
  } else {
    applyQualityPreset('potato');
  }

  function applyQualityPreset(name: string) {
    const applied = adaptiveQuality.forcePreset(name);
    const preset = PRESETS[applied];
    glCtx.setDownsample(preset.canvasDownsample);
    postShader = preset.useFullPost ? postFullShader : postLowShader;
    if (colorFb.width !== preset.rttResolution) {
      colorFb = createFramebuffer(gl, preset.rttResolution, preset.rttResolution);
      depthFb = createFramebuffer(gl, preset.rttResolution, preset.rttResolution);
    }
  }

  // Deferred WS connection — waits for cast token from sender
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let wsClient: ReturnType<typeof createWSClient> | null = null;
  let castSenderId: string | null = null;

  function requestNewToken() {
    if (castSenderId) {
      const castContext = cast.framework.CastReceiverContext.getInstance();
      castContext.sendCustomMessage(NAMESPACE, castSenderId, { type: 'reconnect' });
    }
  }

  function connectWS(castToken: string) {
    if (wsClient) {
      wsClient.close();
      wsClient = null;
    }

    setStatus('Connecting...');
    const wsUrl = `${wsProto}//${location.host}/ws?cast_token=${encodeURIComponent(castToken)}`;

    wsClient = createWSClient(wsUrl, {
      onConnect() {
        appState.connected = true;
        setStatus('Connected');
        hideOverlay();
      },
      onDisconnect() {
        appState.connected = false;
        setStatus('Disconnected — requesting new token...', true);
        wsClient?.close();
        wsClient = null;
        requestNewToken();
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
      onAuthRequired() {
        setStatus('Session expired — re-cast from sender', true);
      },
    });
  }

  // CAF receiver context + custom message listener
  const castContext = cast.framework.CastReceiverContext.getInstance();

  castContext.addCustomMessageListener(NAMESPACE, (event: any) => {
    const msg = event.data;

    if (msg.type === 'init' && msg.castToken) {
      castSenderId = event.senderId || null;
      connectWS(msg.castToken);
    }

    if (msg.type === 'settings') {
      if (msg.animationPreset) {
        setAnimationPreset(msg.animationPreset);
      }
      if (msg.qualityPreset) {
        applyQualityPreset(msg.qualityPreset);
      }
      if (msg.blitMode) {
        setBlitMode(msg.blitMode);
      }
    }
  });

  castContext.start();

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

    if (!gl.isContextLost() && geometryShader! && postShader!) {
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
    }

    // Blit WebGL canvas to visible element for TV devices
    if (blitMode === 'img_jpeg') {
      displayImg.src = canvas.toDataURL('image/jpeg', 0.85);
    } else if (blitMode === '2d_canvas' && blitCtx) {
      blitCtx.drawImage(canvas, 0, 0, displayCanvas.width, displayCanvas.height);
    }

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
    }
  }

  tick();
}

main();
