import type { ShaderProgram } from './shader-manager.js';
import type { MeshBuffers } from './mesh.js';
import { mat4, vec3 } from 'gl-matrix';

export function drawGeometryPass(
  gl: WebGLRenderingContext,
  shader: ShaderProgram,
  buffers: MeshBuffers,
  mvMatrix: mat4,
  pMatrix: mat4,
  eyeVector: vec3
): void {
  gl.enable(gl.DEPTH_TEST);

  // Set matrix uniforms
  gl.uniformMatrix4fv(shader.uniforms['uPMatrix'], false, pMatrix);
  gl.uniformMatrix4fv(shader.uniforms['uMVMatrix'], false, mvMatrix);
  gl.uniformMatrix4fv(shader.uniforms['uPMatrix2'], false, pMatrix);
  gl.uniformMatrix4fv(shader.uniforms['uMVMatrix2'], false, mvMatrix);
  gl.uniform3f(shader.uniforms['eyeVector']!, eyeVector[0], eyeVector[1], eyeVector[2]);

  if (buffers.numItems > 0) {
    gl.enableVertexAttribArray(shader.attribs['aVertexPosition']);
    gl.enableVertexAttribArray(shader.attribs['aVertexColor']);
    gl.enableVertexAttribArray(shader.attribs['aVertexData1']);
    gl.enableVertexAttribArray(shader.attribs['aVertexData2']);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(shader.attribs['aVertexPosition'], 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
    gl.vertexAttribPointer(shader.attribs['aVertexColor'], 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.data1);
    gl.vertexAttribPointer(shader.attribs['aVertexData1'], 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.data2);
    gl.vertexAttribPointer(shader.attribs['aVertexData2'], 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
    gl.drawElements(gl.TRIANGLES, buffers.numItems, gl.UNSIGNED_SHORT, 0);

    gl.disableVertexAttribArray(shader.attribs['aVertexData2']);
    gl.disableVertexAttribArray(shader.attribs['aVertexData1']);
    gl.disableVertexAttribArray(shader.attribs['aVertexColor']);
    gl.disableVertexAttribArray(shader.attribs['aVertexPosition']);
  }
}
