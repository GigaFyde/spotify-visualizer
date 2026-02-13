let closeTimer = 0;

export function showToast(title: string, subtitle: string): void {
  const textEl = document.getElementById('text');
  const text2El = document.getElementById('text2');
  const toastEl = document.getElementById('toast');
  if (!textEl || !text2El || !toastEl) return;

  textEl.innerText = title;
  text2El.innerText = subtitle;
  toastEl.className = 'toast visible';

  clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    toastEl.className = 'toast';
  }, 5000);
}
