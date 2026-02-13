export function initControls(
  sendCommand: (cmd: { type: 'command'; action: string; seekMs?: number }) => void,
  getState: () => { isPlaying: boolean; durationMs: number }
): void {
  window.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft') {
      sendCommand({ type: 'command', action: 'previous' });
    } else if (event.key === 'ArrowRight') {
      sendCommand({ type: 'command', action: 'next' });
    } else if (event.key === ' ') {
      event.preventDefault();
      const { isPlaying } = getState();
      sendCommand({ type: 'command', action: isPlaying ? 'pause' : 'play' });
    }
  });

  const trackpos = document.getElementById('trackposition');
  if (trackpos) {
    trackpos.addEventListener('mousedown', (event) => {
      const { durationMs } = getState();
      const time = (event as MouseEvent).offsetX * durationMs / document.body.offsetWidth;
      sendCommand({ type: 'command', action: 'seek', seekMs: Math.round(time) });
    });
  }
}
