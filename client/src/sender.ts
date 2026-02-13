declare const cast: any;
declare const chrome: any;

const APP_ID = '29CFD408';
const NAMESPACE = 'urn:x-cast:com.gigafyde.viz';

const ANIMATION_PRESETS = ['frozen', 'clean', 'subtle', 'default', 'expressive', 'wild'];
const QUALITY_PRESETS = ['potato', 'low', 'medium', 'high', 'ultra', 'extreme'];
const BLIT_MODES = [
  { id: 'img_jpeg', label: 'JPEG' },
  { id: '2d_canvas', label: '2D Canvas' },
  { id: 'off', label: 'Direct' },
];

let castSession: any = null;
let activeAnimPreset = 'subtle';
let activeQualityPreset = 'potato';
let activeBlitMode = 'img_jpeg';

function sendCastMessage(msg: object) {
  if (!castSession) return;
  castSession.sendMessage(NAMESPACE, msg);
}

async function onCastSessionStarted() {
  const statusEl = document.getElementById('status')!;
  try {
    statusEl.textContent = 'Sending token to receiver...';
    const res = await fetch('/api/cast-token', { method: 'POST' });
    if (!res.ok) {
      statusEl.textContent = `Auth error (${res.status}) — try logging in again`;
      statusEl.className = '';
      console.error('[sender] cast-token failed:', res.status);
      return;
    }
    const { castToken } = await res.json();
    sendCastMessage({ type: 'init', castToken });
    statusEl.textContent = 'Connected to Cast device';
    statusEl.className = 'connected';
    console.log('[sender] Sent cast token to receiver');
  } catch (e) {
    statusEl.textContent = `Failed to connect: ${e}`;
    statusEl.className = '';
    console.error('[sender] Failed to get cast token:', e);
  }
}

function initCast() {
  const statusEl = document.getElementById('status')!;
  const settingsEl = document.getElementById('settings')!;

  cast.framework.CastContext.getInstance().setOptions({
    receiverApplicationId: APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });

  const castContext = cast.framework.CastContext.getInstance();

  castContext.addEventListener(
    cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
    (event: any) => {
      switch (event.sessionState) {
        case cast.framework.SessionState.SESSION_STARTED:
        case cast.framework.SessionState.SESSION_RESUMED:
          castSession = castContext.getCurrentSession();
          statusEl.textContent = 'Connected to Cast device';
          statusEl.className = 'connected';
          settingsEl.classList.add('visible');
          // Listen for messages from receiver (e.g. reconnect requests)
          castSession.addMessageListener(NAMESPACE, (_ns: string, msgStr: string) => {
            try {
              const msg = typeof msgStr === 'string' ? JSON.parse(msgStr) : msgStr;
              if (msg.type === 'reconnect') {
                console.log('[sender] Receiver requested reconnect — sending new token');
                onCastSessionStarted();
              }
            } catch { /* ignore */ }
          });
          onCastSessionStarted();
          break;
        case cast.framework.SessionState.SESSION_ENDED:
          castSession = null;
          statusEl.textContent = 'Not connected';
          statusEl.className = '';
          settingsEl.classList.remove('visible');
          break;
      }
    }
  );
}

function initSettingsUI() {
  const animRow = document.getElementById('anim-presets')!;
  const qualRow = document.getElementById('quality-presets')!;

  for (const name of ANIMATION_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = name;
    if (name === activeAnimPreset) btn.classList.add('active');
    btn.addEventListener('click', () => {
      activeAnimPreset = name;
      sendCastMessage({ type: 'settings', animationPreset: name });
      // Update button highlights
      animRow.querySelectorAll('.preset-btn').forEach((b) =>
        b.classList.toggle('active', b.textContent === name)
      );
    });
    animRow.appendChild(btn);
  }

  for (const name of QUALITY_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = name;
    if (name === activeQualityPreset) btn.classList.add('active');
    btn.addEventListener('click', () => {
      activeQualityPreset = name;
      sendCastMessage({ type: 'settings', qualityPreset: name });
      qualRow.querySelectorAll('.preset-btn').forEach((b) =>
        b.classList.toggle('active', b.textContent === name)
      );
    });
    qualRow.appendChild(btn);
  }

  // Blit mode buttons
  const blitRow = document.getElementById('blit-presets')!;
  for (const mode of BLIT_MODES) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = mode.label;
    if (mode.id === activeBlitMode) btn.classList.add('active');
    btn.addEventListener('click', () => {
      activeBlitMode = mode.id;
      sendCastMessage({ type: 'settings', blitMode: mode.id });
      blitRow.querySelectorAll('.preset-btn').forEach((b) =>
        b.classList.toggle('active', b.textContent === mode.label)
      );
    });
    blitRow.appendChild(btn);
  }

}

async function checkAuth() {
  const castArea = document.getElementById('cast-area')!;
  const loginArea = document.getElementById('login-area')!;

  try {
    const res = await fetch('/auth/status');
    const { authenticated } = await res.json();
    if (authenticated) {
      castArea.classList.add('visible');
      return;
    }
  } catch { /* fall through to login */ }

  loginArea.classList.add('visible');
}

// Cast SDK calls __onGCastApiAvailable when ready
(window as any)['__onGCastApiAvailable'] = (isAvailable: boolean) => {
  if (isAvailable) {
    initCast();
    initSettingsUI();
  } else {
    // Cast not available — show fallback hint
    const noCast = document.getElementById('no-cast');
    const castHint = document.getElementById('cast-hint');
    if (noCast) noCast.style.display = '';
    if (castHint) castHint.style.display = 'none';
  }
};

// If Cast SDK never loads (not Chrome), show fallback after timeout
setTimeout(() => {
  const noCast = document.getElementById('no-cast');
  if (noCast && noCast.style.display === 'none') {
    // __onGCastApiAvailable hasn't fired yet
    noCast.style.display = '';
    const castHint = document.getElementById('cast-hint');
    if (castHint) castHint.style.display = 'none';
  }
}, 5000);

checkAuth();
