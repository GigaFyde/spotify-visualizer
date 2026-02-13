export function updateProgressBar(positionMs: number, durationMs: number): void {
  const fill = document.getElementById('trackpositionfill');
  if (!fill) return;
  let w = (positionMs * 100) / durationMs;
  w = Math.max(Math.min(100, w), 0);
  fill.style.width = w + '%';
}
