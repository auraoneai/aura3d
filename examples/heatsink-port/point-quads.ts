/**
 * The exhaust and spore sprites as quads, for a requested WebGPU backend (`?backend=webgpu|auto`).
 *
 * The default WebGL2 path draws them as `gl_PointSize` points (POINTS_VERTEX / POINTS_FRAGMENT, unchanged). WebGPU has
 * no point size, and the engine has no point-quad program for a custom point material, so when a lab backend is
 * requested the port draws each point as a screen-aligned quad of `size` pixels instead: four corners sharing the point's
 * position, `uv` as the corner, and the same radial falloff the point sprite evaluates from `gl_PointCoord`. The GLSL
 * half draws the same quads if the request falls back to WebGL2.
 */

const QUAD_VERTEX = /* glsl */ `
attribute float size;
attribute float fade;
attribute vec3 tint;
out float vFade;
out vec3 vTint;
out vec2 vCorner;
void main() {
  vFade = fade;
  vTint = tint;
  vCorner = uv * 2.0 - 1.0;
  vec4 clip = modelViewProjectionMatrix * vec4(position, 1.0);
  clip.xy += vCorner * size / max(u_resolution, vec2(1.0)) * clip.w;
  gl_Position = clip;
}`;

const QUAD_FRAGMENT = /* glsl */ `
in float vFade;
in vec3 vTint;
in vec2 vCorner;
out vec4 outColor;
void main() {
  float a = (1.0 - smoothstep(0.0, 1.0, length(vCorner))) * vFade;
  outColor = vec4(vTint * a, a);
}`;

/** Inputs at the geometry's WebGPU locations: uv 2, then fade 3, size 5, tint 6 (custom pool, name order). */
const QUAD_VERTEX_WGSL = /* wgsl */ `/* @aura3d-bindings */
override a3dZeroToOneProjection: bool = false;
fn a3dRasterPosition(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}
struct QuadVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) fade: f32,
  @location(1) tint: vec3<f32>,
  @location(2) corner: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) fade: f32, @location(5) size: f32, @location(6) tint: vec3<f32>) -> QuadVarying {
  var out: QuadVarying;
  out.fade = fade;
  out.tint = tint;
  out.corner = a_uv * 2.0 - vec2<f32>(1.0);
  var clip = aura.u_modelViewProjection * vec4<f32>(a_position, 1.0);
  clip = vec4<f32>(clip.xy + out.corner * size / max(aura.u_resolution, vec2<f32>(1.0)) * clip.w, clip.z, clip.w);
  out.position = a3dRasterPosition(clip);
  return out;
}`;

const QUAD_FRAGMENT_WGSL = /* wgsl */ `/* @aura3d-bindings */
@fragment fn fs_main(@location(0) vFade: f32, @location(1) vTint: vec3<f32>, @location(2) vCorner: vec2<f32>) -> @location(0) vec4<f32> {
  let a = (1.0 - smoothstep(0.0, 1.0, length(vCorner))) * vFade;
  return vec4<f32>(vTint * a, a);
}`;

export const POINT_QUAD_SHADERS = {
  glsl: { vertex: QUAD_VERTEX, fragment: QUAD_FRAGMENT },
  wgsl: { vertex: QUAD_VERTEX_WGSL, fragment: QUAD_FRAGMENT_WGSL }
} as const;

const CORNER_UV = [0, 0, 1, 0, 1, 1, 0, 1] as const;

/** Quad geometry arrays for `n` points: zero positions, corner uvs, two triangles per point. */
export function pointQuadArrays(n: number): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
  const uvs = new Float32Array(n * 8);
  const indices = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    uvs.set(CORNER_UV, i * 8);
    const v = i * 4;
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
  }
  return { positions: new Float32Array(n * 12), uvs, indices };
}

/** Repeats each `itemSize` item of `src` four times into `out` (one copy per quad corner); returns `out`. */
export function expandToCorners(src: ArrayLike<number>, itemSize: number, out: Float32Array): Float32Array {
  const items = Math.min(Math.floor(src.length / itemSize), Math.floor(out.length / (itemSize * 4)));
  let o = 0;
  for (let i = 0; i < items; i++) {
    const base = i * itemSize;
    for (let c = 0; c < 4; c++) for (let k = 0; k < itemSize; k++) out[o++] = src[base + k]!;
  }
  return out;
}

type AttributeUpdate = { array: Float32Array; offset: number };
interface UpdatableNode { updateAttribute?: (name: string, update: AttributeUpdate) => void }

/** Wraps a points node handle so whole-array point updates land on the quad corners (offset 0 only, as the port writes). */
export function quadUpdater<T extends UpdatableNode>(handle: T, itemSizes: Readonly<Record<string, number>>): UpdatableNode {
  const scratch = new Map<string, Float32Array>();
  return {
    updateAttribute(name, update) {
      const itemSize = itemSizes[name] ?? 1;
      let out = scratch.get(name);
      if (!out || out.length !== update.array.length * 4) scratch.set(name, out = new Float32Array(update.array.length * 4));
      handle.updateAttribute?.(name, { array: expandToCorners(update.array, itemSize, out), offset: update.offset * 4 });
    }
  };
}
