/**
 * Shows a login overlay when Spotify auth is missing or invalid.
 * Checks /auth/status on load; can also be triggered via show().
 */
export function createLoginPrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'login-overlay';
  overlay.innerHTML = `
    <div class="login-card">
      <h1>Spotify Visualizer</h1>
      <p>Connect your Spotify account to get started.</p>
      <a href="/auth/login" class="login-btn">Log in with Spotify</a>
    </div>
  `;
  document.body.appendChild(overlay);

  let visible = false;

  function show() {
    if (visible) return;
    visible = true;
    overlay.classList.add('visible');
  }

  function hide() {
    if (!visible) return;
    visible = false;
    overlay.classList.remove('visible');
  }

  // Check auth on load
  async function check() {
    try {
      const res = await fetch('/auth/status');
      const data = await res.json();
      if (!data.authenticated) show();
      else hide();
    } catch {
      // Network error — don't block the UI
    }
  }

  check();

  return { show, hide, check };
}
