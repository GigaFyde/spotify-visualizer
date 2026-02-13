export interface GLContext {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  viewportWidth: number;
  viewportHeight: number;
  setDownsample(factor: number): void;
}

export function initWebGL(canvas: HTMLCanvasElement, downsample = 2): GLContext {
  const gl = canvas.getContext('webgl', { alpha: true });
  if (!gl) throw new Error('WebGL not supported');

  const ctx: GLContext = {
    gl, canvas,
    viewportWidth: 0, viewportHeight: 0,
    setDownsample(factor: number) { downsample = factor; fit(); }
  };

  function fit() {
    const w = document.body.offsetWidth;
    const h = document.body.offsetHeight;
    canvas.width = Math.floor(w / downsample);
    canvas.height = Math.floor(h / downsample);
    ctx.viewportWidth = canvas.width;
    ctx.viewportHeight = canvas.height;
  }

  window.addEventListener('resize', fit);
  fit();
  return ctx;
}
