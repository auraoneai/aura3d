/**
 * PRD-10 T2.1 — terrain height grid (R32F upload) + the CPU twin of the
 * `a3dTerrainHeightBilinear` GLSL in `shaders/terrainCdlod.ts`.
 *
 * The CPU twin is bit-compatible with the shader (§8.1): same `(size-1)` uv
 * mapping, same clamped-texel fetch at the border. `AuraTerrainHandle.heightAt`
 * is implemented on top of it so shader and CPU agree within 1e-4 m.
 *
 * `terrainGpuHeightReadback` is a TEST-ONLY path (§15.2 `terrain-gpu-cpu`):
 * it draws one fragment per sample point into an R32F target, never runs in
 * the frame loop.
 */

export interface TerrainHeightGrid {
  readonly columns: number;
  readonly rows: number;
  /** Row-major `z * columns + x`, normalized 0..1 unless caller pre-scales. */
  readonly heights: Float32Array;
}

export interface TerrainHeightTexture {
  readonly texture: WebGLTexture;
  readonly columns: number;
  readonly rows: number;
  dispose(): void;
}

/**
 * CPU twin of `a3dTerrainHeightBilinear` (§8.1). `uv` is terrain-normalized;
 * border texels clamp exactly like the shader's `clamp(i, 0, size-1)`.
 */
export function terrainHeightBilinear(
  grid: TerrainHeightGrid,
  uv: readonly [number, number],
  heightScale = 1
): number {
  const { columns, rows, heights } = grid;
  const px = uv[0] * (columns - 1);
  const py = uv[1] * (rows - 1);
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const hiX = columns - 1;
  const hiY = rows - 1;
  const clamp = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);
  const i00 = clamp(iy, hiY) * columns + clamp(ix, hiX);
  const i10 = clamp(iy, hiY) * columns + clamp(ix + 1, hiX);
  const i01 = clamp(iy + 1, hiY) * columns + clamp(ix, hiX);
  const i11 = clamp(iy + 1, hiY) * columns + clamp(ix + 1, hiX);
  const h00 = heights[i00]!;
  const h10 = heights[i10]!;
  const h01 = heights[i01]!;
  const h11 = heights[i11]!;
  return ((h00 + (h10 - h00) * fx) * (1 - fy) + (h01 + (h11 - h01) * fx) * fy) * heightScale;
}

/**
 * CPU twin of the §8.1 fragment macro normal:
 * `n = normalize(vec3(hL - hR, 2*texel, hD - hU))`, `texel` = world metres per
 * texel. Returns world-space up vector.
 */
export function terrainMacroNormal(
  grid: TerrainHeightGrid,
  uv: readonly [number, number],
  texelWorld: number,
  heightScale = 1
): readonly [number, number, number] {
  const { columns, rows } = grid;
  const du = 1 / Math.max(1, columns - 1);
  const dv = 1 / Math.max(1, rows - 1);
  const hL = terrainHeightBilinear(grid, [uv[0] - du, uv[1]], 1);
  const hR = terrainHeightBilinear(grid, [uv[0] + du, uv[1]], 1);
  const hD = terrainHeightBilinear(grid, [uv[0], uv[1] - dv], 1);
  const hU = terrainHeightBilinear(grid, [uv[0], uv[1] + dv], 1);
  const nx = (hL - hR) * heightScale;
  const ny = 2 * texelWorld;
  const nz = (hD - hU) * heightScale;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** Upload the grid as R32F (texelFetch only — no float filtering required, §8.1). */
export function createTerrainHeightTexture(gl: WebGL2RenderingContext, grid: TerrainHeightGrid): TerrainHeightTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("prd10: failed to create terrain height texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, grid.columns, grid.rows, 0, gl.RED, gl.FLOAT, grid.heights as Float32Array<ArrayBuffer>);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return {
    texture,
    columns: grid.columns,
    rows: grid.rows,
    dispose() {
      gl.deleteTexture(texture);
    }
  };
}

/**
 * TEST-ONLY GPU readback (§15.2): renders `uvs.length` pixels (N×1 framebuffer)
 * running the same clamped bilinear as `a3dTerrainHeightBilinear` and reads the
 * R32F target back. Never call this from a frame path.
 */
export function terrainGpuHeightReadback(
  gl: WebGL2RenderingContext,
  grid: TerrainHeightGrid,
  uvs: readonly (readonly [number, number])[],
  heightScale = 1
): Float32Array {
  const heightTex = createTerrainHeightTexture(gl, grid);
  const vsSrc = `#version 300 es
    void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }`;
  const fsSrc = `#version 300 es
    precision highp float;
    uniform highp sampler2D u_height;
    uniform vec2 u_heightTexSize;
    uniform float u_heightScale;
    uniform vec2 u_uvs[${Math.max(1, Math.min(uvs.length, 1024))}];
    uniform int u_index;
    out float o_height;
    void main() {
      vec2 uv = u_uvs[u_index];
      vec2 p = uv * (u_heightTexSize - 1.0);
      ivec2 i = ivec2(floor(p));
      ivec2 hi = ivec2(u_heightTexSize) - ivec2(1);
      vec2 f = fract(p);
      float h00 = texelFetch(u_height, clamp(i,               ivec2(0), hi), 0).r;
      float h10 = texelFetch(u_height, clamp(i + ivec2(1, 0), ivec2(0), hi), 0).r;
      float h01 = texelFetch(u_height, clamp(i + ivec2(0, 1), ivec2(0), hi), 0).r;
      float h11 = texelFetch(u_height, clamp(i + ivec2(1, 1), ivec2(0), hi), 0).r;
      o_height = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) * u_heightScale;
    }`;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`prd10 readback shader: ${log}`);
    }
    return sh;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`prd10 readback link: ${gl.getProgramInfoLog(program)}`);
  }
  gl.useProgram(program);
  const emptyVao = gl.createVertexArray()!;
  gl.bindVertexArray(emptyVao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, heightTex.texture);
  gl.uniform1i(gl.getUniformLocation(program, "u_height"), 0);
  gl.uniform2f(gl.getUniformLocation(program, "u_heightTexSize"), grid.columns, grid.rows);
  gl.uniform1f(gl.getUniformLocation(program, "u_heightScale"), heightScale);
  const uvsLoc = gl.getUniformLocation(program, "u_uvs");
  const indexLoc = gl.getUniformLocation(program, "u_index");
  const fboTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, null);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("prd10 readback: R32F framebuffer incomplete (extension WEBGL_color_buffer_float missing)");
  }
  gl.viewport(0, 0, 1, 1);
  const batch = 1024;
  const out = new Float32Array(uvs.length);
  const px = new Float32Array(4);
  for (let base = 0; base < uvs.length; base += batch) {
    const n = Math.min(batch, uvs.length - base);
    const flat = new Float32Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      flat[i * 2] = uvs[base + i]![0];
      flat[i * 2 + 1] = uvs[base + i]![1];
    }
    gl.uniform2fv(uvsLoc, flat);
    for (let i = 0; i < n; i += 1) {
      gl.uniform1i(indexLoc, i);
      gl.drawArrays(gl.POINTS, 0, 1);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
      out[base + i] = px[0]!;
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(fboTex);
  gl.deleteVertexArray(emptyVao);
  gl.deleteProgram(program);
  heightTex.dispose();
  return out;
}
