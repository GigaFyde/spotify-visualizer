import type { ShaderProgram } from './shader-manager.js';
import type { PostBuffers } from './mesh.js';

export function drawPostPass(
  gl: WebGLRenderingContext,
  shader: ShaderProgram,
  buffers: PostBuffers,
  colorTex: WebGLTexture,
  depthTex: WebGLTexture,
  noiseTex: WebGLTexture
): void {
  if (buffers.numItems <= 0) return;

  gl.enableVertexAttribArray(shader.attribs['aVertexPosition']);
  gl.enableVertexAttribArray(shader.attribs['aVertexTexture']);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.vertexAttribPointer(shader.attribs['aVertexPosition'], 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texture);
  gl.vertexAttribPointer(shader.attribs['aVertexTexture'], 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, colorTex);
  gl.uniform1i(shader.uniforms['tColor'], 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  gl.uniform1i(shader.uniforms['tDepth'], 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, noiseTex);
  gl.uniform1i(shader.uniforms['tNoise'], 2);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
  gl.drawElements(gl.TRIANGLES, buffers.numItems, gl.UNSIGNED_SHORT, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.disableVertexAttribArray(shader.attribs['aVertexTexture']);
  gl.disableVertexAttribArray(shader.attribs['aVertexPosition']);
}
