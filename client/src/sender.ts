declare const cast: any;
declare const chrome: any;

const APP_ID = 'XXXXXXXX'; // Replace with registered Cast App ID

function initCast() {
  const statusEl = document.getElementById('status')!;

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
          statusEl.textContent = 'Connected to Cast device';
          statusEl.className = 'connected';
          break;
        case cast.framework.SessionState.SESSION_ENDED:
          statusEl.textContent = 'Not connected';
          statusEl.className = '';
          break;
      }
    }
  );
}

// Cast SDK calls __onGCastApiAvailable when ready
(window as any)['__onGCastApiAvailable'] = (isAvailable: boolean) => {
  if (isAvailable) {
    initCast();
  }
};
