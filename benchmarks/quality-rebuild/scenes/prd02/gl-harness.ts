/**
 * Shared raw-WebGL2 helpers for the prd02 harness pages (pmrem.html, sh9.html).
 * Full-screen-triangle programs rendered into an RGBA32F target and read back
 * as Float32 — the same pattern as chunks-main.ts (02-S14), factored so the
 * S7 / T1936 pages do not each re-implement it.
 */

export const QUAD_VS = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

export interface LinkedProgram {
  readonly program: WebGLProgram | null;
  readonly ok: boolean;
  readonly log: string;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): { shader: WebGLShader; ok: boolean; log: string } {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return { shader, ok: gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true, log: gl.getShaderInfoLog(shader) ?? "" };
}

/** Compile + link a full-screen fragment program (attribute 0 = a_position). */
export function linkQuadProgram(gl: WebGL2RenderingContext, fragmentSource: string): LinkedProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, QUAD_VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs.ok || !fs.ok) return { program: null, ok: false, log: `${vs.log}${fs.log}` };
  const program = gl.createProgram()!;
  gl.attachShader(program, vs.shader);
  gl.attachShader(program, fs.shader);
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  const ok = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  return { program: ok ? program : null, ok, log: ok ? "" : gl.getProgramInfoLog(program) ?? "" };
}

export function requireFloatTargets(gl: WebGL2RenderingContext): void {
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("EXT_color_buffer_float unavailable (needed for the RGBA32F readback)");
  }
}

/**
 * Draw `program` into a width×height RGBA32F target and read it back.
 * `setup` binds uniforms/textures after useProgram. Row 0 of the result is
 * gl_FragCoord.y = 0.5 (GL bottom row).
 */
export function renderFloat(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  width: number,
  height: number,
  setup: (program: WebGLProgram) => void
): Float32Array {
  const target = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("RGBA32F target incomplete");
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  setup(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const out = new Float32Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, out);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(target);
  gl.deleteBuffer(buffer);
  return out;
}

export interface CubeLevels {
  /** levels[m][face] = Uint16 half-float RGBA texels, face order px,nx,py,ny,pz,nz. */
  readonly levels: readonly (readonly Uint16Array[])[];
  readonly faceSize: number;
}

/**
 * Upload a half-float RGBA cube exactly as the device does (row 0 first, no
 * flip, GL face order) with every mip level, sampled linear-mipmap-linear.
 */
export function uploadHalfCube(gl: WebGL2RenderingContext, cube: CubeLevels): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage2D(gl.TEXTURE_CUBE_MAP, cube.levels.length, gl.RGBA16F, cube.faceSize, cube.faceSize);
  cube.levels.forEach((faces, level) => {
    const size = Math.max(1, cube.faceSize >> level);
    faces.forEach((data, face) => {
      if (data.length !== size * size * 4) throw new Error(`cube level ${level} face ${face}: ${data.length} != ${size}²·4`);
      gl.texSubImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, level, 0, 0, size, size, gl.RGBA, gl.HALF_FLOAT, data);
    });
  });
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAX_LEVEL, cube.levels.length - 1);
  return texture;
}

/** Rec. 709 linear luma. */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** IEEE-754 binary16 decode. */
export function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mantissa = h & 0x03ff;
  if (exp === 0) return sign * mantissa * 2 ** -24;
  if (exp === 0x1f) return mantissa !== 0 ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * (1 + mantissa / 1024) * 2 ** (exp - 15);
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
