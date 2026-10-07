/**
 * PRD-10 T2.5 — GPU auto-splat bake. A fullscreen pass per 4-layer group writes
 * RGBA8 splat weights from the rule set; the fragment shader mirrors
 * `evalSplatRules` (agent-api/world/terrain.ts) 1:1 — same `rangeWeight`
 * smooth01 edges, same value-noise gate — so baked maps agree with the CPU
 * weights within ±1/255 (§15.2 `terrain-splat-bake`).
 *
 * Noise gates replicate the CPU `hash2` via uint32 arithmetic (mod-2^32
 * multiply == JS `Math.imul`/`(x*C)|0`); the only divergence is fp32 rounding
 * of `float(h)/4294967295`, which can flip a threshold boundary pixel — inside
 * the ±1/255 tolerance budget.
 *
 * The bake runs through `RenderDevice` primitives (createRenderTarget + draw),
 * so the same code path serves WebGL2 (Path S) and WebGPU (Path G).
 */
import type { RenderDevice, RenderTarget, ShaderSources, UniformValue } from "../../RenderDevice.js";
import { VertexBuffer } from "../../VertexBuffer.js";
import { VertexFormat } from "../../VertexFormat.js";
import { TextureBinding } from "../../TextureBinding.js";
import { Sampler } from "../../Sampler.js";
import type { Texture } from "../../Texture.js";
import { a3dTerrainHeightBilinearGlsl } from "./shaders/terrainCdlod.js";

/** One encoded splat rule — the uniform flat view of `AuraSplatRule`. */
export interface SplatBakeRule {
  /** Target layer channel (index into the terrain's layer list). */
  readonly layer: number;
  readonly weight: number;
  /** `[lo, hi]` degrees; `undefined` = unconstrained. */
  readonly slopeDeg?: readonly [number, number];
  /** `[lo, hi]` normalized height; `undefined` = unconstrained. */
  readonly height?: readonly [number, number];
  readonly falloff?: number;
  readonly noise?: { readonly scale: number; readonly threshold: number; readonly seed?: number };
}

export interface SplatBakeSpec {
  /** Height texture (R32F or RGBA32F-packed; `.r` holds normalized height). */
  readonly heightTexture: Texture;
  readonly heightTexSize: readonly [number, number];
  /** World metres per height texel (matches `terrainMacroNormal`'s texel arg). */
  readonly texelWorld: number;
  readonly heightScale: number;
  /** Splat map resolution (square). */
  readonly resolution: number;
  readonly layerCount: number;
  readonly rules: readonly SplatBakeRule[];
}

export interface SplatBakeResult {
  /** Layers 0–3 splat weights (RGBA8). */
  readonly splat0: Texture;
  /** Layers 4–7, present only when `layerCount > 4`. */
  readonly splat1: Texture | null;
  /** Keeps the bake render targets alive; call when the maps are replaced. */
  readonly dispose: () => void;
}

const MAX_RULES = 8;

const BAKE_VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Fragment mirrors `evalSplatRules` + `rangeWeight` + `smooth01` +
 * `hash2`/`valueNoise` from agent-api/world/terrain.ts exactly. Keep the two in
 * lockstep — the ±1/255 agreement test reads baked texels against the CPU
 * weights.
 */
const BAKE_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 o_weights;
uniform int u_layerOffset;          // 0 for splat0, 4 for splat1
uniform int u_layerCount;
uniform int u_ruleCount;
uniform int u_ruleLayer[${MAX_RULES}];
uniform float u_ruleWeight[${MAX_RULES}];
uniform vec4 u_ruleSlope[${MAX_RULES}];  // lo, hi, falloff, has
uniform vec4 u_ruleHeight[${MAX_RULES}]; // lo, hi, falloff, has
uniform vec4 u_ruleNoise[${MAX_RULES}];  // scale, threshold, seed, has
uniform float u_texelWorld;

${a3dTerrainHeightBilinearGlsl}

float a3dBakeSmooth01(float t) {
  float x = clamp(t, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}
// CPU rangeWeight(): hard outside bounds, smooth01 edges of (hi-lo)*falloff.
float a3dBakeRangeWeight(float value, vec4 range) {
  if (range.w < 0.5) return 1.0;
  float lo = range.x;
  float hi = range.y;
  if (value < lo || value > hi) return 0.0;
  float edge = max(1e-6, (hi - lo) * range.z);
  return min(a3dBakeSmooth01((value - lo) / edge), a3dBakeSmooth01((hi - value) / edge));
}
// CPU hash2() — uint32 ops match (x*C)|0 / Math.imul bitwise.
uint a3dBakeHash2(int ix, int iz, int seed) {
  uint h = uint(ix) * 374761393u + uint(iz) * 668265263u + uint(seed) * 2641260675u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return h;
}
float a3dBakeNoise(float x, float z, int seed) {
  int ix = int(floor(x));
  int iz = int(floor(z));
  float fx = x - float(ix);
  float fz = z - float(iz);
  float sx = fx * fx * (3.0 - 2.0 * fx);
  float sz = fz * fz * (3.0 - 2.0 * fz);
  float a = float(a3dBakeHash2(ix, iz, seed)) / 4294967295.0;
  float b = float(a3dBakeHash2(ix + 1, iz, seed)) / 4294967295.0;
  float c = float(a3dBakeHash2(ix, iz + 1, seed)) / 4294967295.0;
  float d = float(a3dBakeHash2(ix + 1, iz + 1, seed)) / 4294967295.0;
  return a + (b - a) * sx + (c + (d - c) * sx - a - (b - a) * sx) * sz;
}
void main() {
  float du = 1.0 / max(u_heightTexSize.x - 1.0, 1.0);
  float dv = 1.0 / max(u_heightTexSize.y - 1.0, 1.0);
  float h = a3dTerrainHeightBilinear(v_uv);
  float hL = a3dTerrainHeightBilinear(v_uv - vec2(du, 0.0));
  float hR = a3dTerrainHeightBilinear(v_uv + vec2(du, 0.0));
  float hD = a3dTerrainHeightBilinear(v_uv - vec2(0.0, dv));
  float hU = a3dTerrainHeightBilinear(v_uv + vec2(0.0, dv));
  vec3 n = normalize(vec3(hL - hR, 2.0 * u_texelWorld, hD - hU));
  float slopeDeg = degrees(acos(clamp(n.y, -1.0, 1.0)));
  float hNorm = h / max(u_heightScale, 1e-6);

  float w[8];
  for (int i = 0; i < 8; i++) w[i] = 0.0;
  for (int r = 0; r < ${MAX_RULES}; r++) {
    if (r >= u_ruleCount) break;
    float rw = u_ruleWeight[r]
      * a3dBakeRangeWeight(slopeDeg, u_ruleSlope[r])
      * a3dBakeRangeWeight(hNorm, u_ruleHeight[r]);
    if (u_ruleNoise[r].w > 0.5) {
      float nn = a3dBakeNoise(v_uv.x * u_ruleNoise[r].x, v_uv.y * u_ruleNoise[r].x, int(u_ruleNoise[r].z));
      rw *= nn >= u_ruleNoise[r].y ? 1.0 : 0.0;
    }
    w[u_ruleLayer[r]] += rw;
  }
  float total = 0.0;
  for (int i = 0; i < 8; i++) total += w[i];
  w[0] += max(0.0, 1.0 - total);                 // remainder -> layer 0
  float sum = 0.0;
  for (int i = 0; i < 8; i++) sum += w[i];
  vec4 outW = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    int layer = u_layerOffset + i;
    outW[i] = layer < u_layerCount ? w[layer] / max(sum, 1e-6) : 0.0;
  }
  o_weights = outW;
}
`;

const BAKE_WGSL = /* wgsl */ `
// SplatBake WGSL twin — Path G runs this when WebGPU is the backend. Same
// rule evaluation as the GLSL body (see BAKE_FRAG comments).
struct BakeUniforms {
  layerOffset : i32, layerCount : i32, ruleCount : i32, texelWorld : f32,
  heightTexSize : vec2f, heightScale : f32, pad : f32,
  ruleLayer : array<i32, ${MAX_RULES}>,
  ruleWeight : array<f32, ${MAX_RULES}>,
  ruleSlope : array<vec4f, ${MAX_RULES}>,
  ruleHeight : array<vec4f, ${MAX_RULES}>,
  ruleNoise : array<vec4f, ${MAX_RULES}>,
};
@group(0) @binding(0) var<uniform> u : BakeUniforms;
@group(0) @binding(1) var u_height : texture_2d<f32>;

fn bakeHeightBilinear(uv : vec2f) -> f32 {
  let p = uv * (u.heightTexSize - vec2f(1.0));
  let i = vec2i(floor(p));
  let hi = vec2i(u.heightTexSize) - vec2i(1);
  let f = fract(p);
  let h00 = textureLoad(u_height, clamp(i, vec2i(0), hi), 0).r;
  let h10 = textureLoad(u_height, clamp(i + vec2i(1, 0), vec2i(0), hi), 0).r;
  let h01 = textureLoad(u_height, clamp(i + vec2i(0, 1), vec2i(0), hi), 0).r;
  let h11 = textureLoad(u_height, clamp(i + vec2i(1, 1), vec2i(0), hi), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y) * u.heightScale;
}
fn bakeSmooth01(t : f32) -> f32 { let x = clamp(t, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
fn bakeRangeWeight(v : f32, r : vec4f) -> f32 {
  if (r.w < 0.5) { return 1.0; }
  if (v < r.x || v > r.y) { return 0.0; }
  let edge = max(1e-6, (r.y - r.x) * r.z);
  return min(bakeSmooth01((v - r.x) / edge), bakeSmooth01((r.y - v) / edge));
}
fn bakeHash2(ix : i32, iz : i32, seed : i32) -> u32 {
  var h = u32(ix) * 374761393u + u32(iz) * 668265263u + u32(seed) * 2641260675u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return h;
}
fn bakeNoise(x : f32, z : f32, seed : i32) -> f32 {
  let ix = i32(floor(x)); let iz = i32(floor(z));
  let fx = x - f32(ix); let fz = z - f32(iz);
  let sx = fx * fx * (3.0 - 2.0 * fx); let sz = fz * fz * (3.0 - 2.0 * fz);
  let a = f32(bakeHash2(ix, iz, seed)) / 4294967295.0;
  let b = f32(bakeHash2(ix + 1, iz, seed)) / 4294967295.0;
  let c = f32(bakeHash2(ix, iz + 1, seed)) / 4294967295.0;
  let d = f32(bakeHash2(ix + 1, iz + 1, seed)) / 4294967295.0;
  return a + (b - a) * sx + (c + (d - c) * sx - a - (b - a) * sx) * sz;
}
fn bakeSlopeDeg(uv : vec2f) -> vec2f {
  let du = 1.0 / max(u.heightTexSize.x - 1.0, 1.0);
  let dv = 1.0 / max(u.heightTexSize.y - 1.0, 1.0);
  let hL = bakeHeightBilinear(uv - vec2f(du, 0.0));
  let hR = bakeHeightBilinear(uv + vec2f(du, 0.0));
  let hD = bakeHeightBilinear(uv - vec2f(0.0, dv));
  let hU = bakeHeightBilinear(uv + vec2f(0.0, dv));
  let n = normalize(vec3f(hL - hR, 2.0 * u.texelWorld, hD - hU));
  return vec2f(degrees(acos(clamp(n.y, -1.0, 1.0))), bakeHeightBilinear(uv) / max(u.heightScale, 1e-6));
}

struct VsOut { @builtin(position) pos : vec4f, @location(0) uv : vec2f };
@vertex fn vsMain(@location(0) aPos : vec2f) -> VsOut {
  var o : VsOut;
  o.pos = vec4f(aPos, 0.0, 1.0);
  o.uv = aPos * 0.5 + vec2f(0.5);
  return o;
}
fn bakeWeights(uv : vec2f) -> vec4f {
  let sh = bakeSlopeDeg(uv);
  var w : array<f32, 8>;
  for (var i = 0; i < 8; i++) { w[i] = 0.0; }
  for (var r = 0; r < ${MAX_RULES}; r++) {
    if (r >= u.ruleCount) { break; }
    var rw = u.ruleWeight[r] * bakeRangeWeight(sh.x, u.ruleSlope[r]) * bakeRangeWeight(sh.y, u.ruleHeight[r]);
    if (u.ruleNoise[r].w > 0.5) {
      let nn = bakeNoise(uv.x * u.ruleNoise[r].x, uv.y * u.ruleNoise[r].x, i32(u.ruleNoise[r].z));
      rw = rw * select(0.0, 1.0, nn >= u.ruleNoise[r].y);
    }
    w[u.ruleLayer[r]] = w[u.ruleLayer[r]] + rw;
  }
  var total = 0.0;
  for (var i = 0; i < 8; i++) { total += w[i]; }
  w[0] = w[0] + max(0.0, 1.0 - total);
  var sum = 0.0;
  for (var i = 0; i < 8; i++) { sum += w[i]; }
  var outW = vec4f(0.0);
  for (var i = 0; i < 4; i++) {
    let layer = u.layerOffset + i;
    outW[i] = select(0.0, w[layer] / max(sum, 1e-6), layer < u.layerCount);
  }
  return outW;
}
@fragment fn fsMain(@location(0) uv : vec2f) -> @location(0) vec4f {
  return bakeWeights(uv);
}
`;

/** Fullscreen-triangle sources for the splat bake (GLSL Path S / WGSL Path G). */
export function splatBakeShaderSources(): ShaderSources {
  return {
    label: "prd10-terrain-splat-bake",
    marker: "prd10-terrain-splat-bake",
    vertex: BAKE_VERT,
    fragment: BAKE_FRAG,
    webgpu: { vertex: BAKE_WGSL, fragment: BAKE_WGSL }
  };
}

/** Pack JS rules into the uniform flat layout the bake program reads. */
export function encodeSplatBakeRules(rules: readonly SplatBakeRule[]): {
  readonly ruleCount: number;
  readonly ruleLayer: Int32Array;
  readonly ruleWeight: Float32Array;
  readonly ruleSlope: Float32Array;
  readonly ruleHeight: Float32Array;
  readonly ruleNoise: Float32Array;
  readonly dropped: number;
} {
  const capped = rules.slice(0, MAX_RULES);
  const ruleLayer = new Int32Array(MAX_RULES);
  const ruleWeight = new Float32Array(MAX_RULES);
  const ruleSlope = new Float32Array(MAX_RULES * 4);
  const ruleHeight = new Float32Array(MAX_RULES * 4);
  const ruleNoise = new Float32Array(MAX_RULES * 4);
  capped.forEach((rule, r) => {
    const falloff = rule.falloff ?? 0.1;
    ruleLayer[r] = rule.layer;
    ruleWeight[r] = rule.weight;
    ruleSlope.set([rule.slopeDeg?.[0] ?? 0, rule.slopeDeg?.[1] ?? 0, falloff, rule.slopeDeg ? 1 : 0], r * 4);
    ruleHeight.set([rule.height?.[0] ?? 0, rule.height?.[1] ?? 0, falloff, rule.height ? 1 : 0], r * 4);
    ruleNoise.set(
      [rule.noise?.scale ?? 0, rule.noise?.threshold ?? 0, rule.noise?.seed ?? 0, rule.noise ? 1 : 0],
      r * 4
    );
  });
  return { ruleCount: capped.length, ruleLayer, ruleWeight, ruleSlope, ruleHeight, ruleNoise, dropped: Math.max(0, rules.length - MAX_RULES) };
}

const BAKE_FORMAT = new VertexFormat([{ semantic: "position", components: 2, offset: 0, shaderName: "a_pos" }]);
const BAKE_SAMPLER = new Sampler({ minFilter: "nearest", magFilter: "nearest" });

/**
 * Bake the splat weights into RGBA8 render-target textures on `device`.
 * One fullscreen draw per 4-layer group; returns the target textures (caller
 * binds them into the terrain program and keeps/disposes via `dispose`).
 */
export function bakeTerrainSplat(device: RenderDevice, spec: SplatBakeSpec): SplatBakeResult {
  const res = Math.max(1, spec.resolution | 0);
  const groupCount = spec.layerCount > 4 ? 2 : 1;
  const program = device.createShaderProgram(splatBakeShaderSources());
  const tri = new VertexBuffer(BAKE_FORMAT, 3);
  tri.setAttribute(0, "position", [-1, -1]);
  tri.setAttribute(1, "position", [3, -1]);
  tri.setAttribute(2, "position", [-1, 3]);
  const vb = device.createBuffer("vertex", tri.byteLength, new Uint8Array(tri.data));
  const rules = encodeSplatBakeRules(spec.rules);
  const heightBinding = new TextureBinding({ name: "u_height", texture: spec.heightTexture, sampler: BAKE_SAMPLER });

  const targets: RenderTarget[] = [];
  const textures: Texture[] = [];
  for (let group = 0; group < groupCount; group += 1) {
    const rt = device.createRenderTarget({ width: res, height: res, label: `prd10-splat-${group}`, format: "rgba8", depth: false });
    device.setRenderTarget(rt);
    device.draw({
      label: `prd10-splat-bake-${group}`,
      topology: "triangles",
      vertexBuffer: vb,
      vertexFormat: BAKE_FORMAT,
      vertexCount: 3,
      shader: program,
      uniforms: new Map<string, UniformValue>([
        ["u_height", heightBinding],
        ["u_heightTexSize", spec.heightTexSize as unknown as number[]],
        ["u_heightScale", spec.heightScale],
        ["u_texelWorld", spec.texelWorld],
        ["u_layerOffset", group * 4],
        ["u_layerCount", spec.layerCount],
        ["u_ruleCount", rules.ruleCount],
        ["u_ruleLayer", rules.ruleLayer],
        ["u_ruleWeight", rules.ruleWeight],
        ["u_ruleSlope", rules.ruleSlope],
        ["u_ruleHeight", rules.ruleHeight],
        ["u_ruleNoise", rules.ruleNoise]
      ])
    });
    device.setRenderTarget(null);
    targets.push(rt);
    textures.push(rt.colorTexture);
  }
  return {
    splat0: textures[0]!,
    splat1: textures[1] ?? null,
    dispose() {
      for (const rt of targets) rt.dispose();
      vb.dispose();
      program.dispose();
    }
  };
}
