let el: HTMLDivElement | null = null;
let countdownTimer = 0;

function getOrCreate(): HTMLDivElement {
  if (el) return el;

  el = document.createElement('div');
  el.className = 'api-health';
  el.innerHTML = '<span class="api-health-dot"></span><span class="api-health-text"></span>';

  const status = document.getElementById('status');
  if (status?.parentNode) {
    status.parentNode.insertBefore(el, status);
  } else {
    document.body.appendChild(el);
  }
  return el;
}

function update(status: string, retryAfter?: number): void {
  const container = getOrCreate();
  const text = container.querySelector('.api-health-text') as HTMLSpanElement;

  clearInterval(countdownTimer);

  if (status === 'ok') {
    container.className = 'api-health';
    return;
  }

  if (status === 'degraded') {
    container.className = 'api-health visible degraded';
    text.textContent = 'Slowing down\u2026';
    return;
  }

  if (status === 'limited') {
    container.className = 'api-health visible limited';
    if (retryAfter && retryAfter > 0) {
      let remaining = Math.ceil(retryAfter);
      text.textContent = `Rate limited \u2014 retrying in ${remaining}s`;
      countdownTimer = window.setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          text.textContent = 'Rate limited \u2014 retrying\u2026';
        } else {
          text.textContent = `Rate limited \u2014 retrying in ${remaining}s`;
        }
      }, 1000);
    } else {
      text.textContent = 'Rate limited \u2014 retrying\u2026';
    }
  }
}

export function initApiHealth(): (status: string, retryAfter?: number) => void {
  return update;
}
