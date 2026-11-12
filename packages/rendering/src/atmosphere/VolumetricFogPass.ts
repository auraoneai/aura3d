// PRD-07 P5-T6 — §6.7/§8.7 froxel volumetric fog pass. The volume lives in a
// 2D tiled rgba16f atlas (C-27 froxelGrid: High 160×90×64 in 8×8 tiles =
// 1280×720; Ultra 240×135×128 in 16×8 tiles = 3840×1080; reduced Ultra
// 240×135×96, reported VOLUMETRIC_GRID_REDUCED). WebGL2 has no compute, so:
//   inject   — one scissored fullscreen draw per slice → (L, σ) atlas
//   integrate— one whole-atlas draw; each fragment prefix-sums its slice
//   apply    — fullscreen premultiplied-alpha-over: (S, 1−T) ≡ color·T + S
// The pass only runs when `resolveSceneDepth(ctx).available`; without it the
// analytic fog path covers every tier (VOLUMETRIC_DEPTH_PENDING). Temporal
// reprojection (Ultra) waits on C-01 previousViewProjectionMatrix — null →
// VOLUMETRIC_TEMPORAL_PENDING and the injected atlas is used directly.

import { Geometry } from "../Geometry";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import type { NativeShaderStages, PortableShaderBinding, RenderDevice, RenderShaderProgram, RenderTarget, UniformValue } from "../RenderDevice";
import type { FrameContributorContext } from "../contracts/frameGraph";
import type { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { PRD07_DEPTH_SAMPLER } from "../vfx/depthSampler";
import { volumetricInjectFragmentSource, volumetricInjectVertexSource, PRD07_VOLUMETRIC_MARKER } from "./shaders/volumetric-inject.glsl";
import { volumetricIntegrateFragmentSource, volumetricIntegrateVertexSource } from "./shaders/volumetric-integrate.glsl";
import { volumetricApplyFragmentSource, volumetricApplyVertexSource } from "./shaders/volumetric-apply.glsl";
import { packFogVolumes, type Prd07FogVolume } from "./FogVolumes";
import type { PackedFogUniforms } from "./HeightFog";

export interface FroxelGridSpec {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly slices: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly near: number;
  readonly far: number;
  readonly temporal: boolean;
  /** Diagnostics note when the Ultra grid was reduced under the memory check. */
  readonly note: "VOLUMETRIC_GRID_REDUCED" | null;
}

const froxel = (tileWidth: number, tileHeight: number, slices: number, tilesX: number, far: number, temporal: boolean, note: FroxelGridSpec["note"] = null): FroxelGridSpec => ({
  tileWidth, tileHeight, slices, tilesX,
  tilesY: Math.ceil(slices / tilesX),
  atlasWidth: tileWidth * tilesX,
  atlasHeight: tileHeight * Math.ceil(slices / tilesX),
  near: 0.5, far, temporal, note
});

/**
 * C-27 tier mapping (frozen table): `"analytic"` → null (analytic fog only);
 * `"froxel-medium"` → 160×90×64, far 64; `"froxel-high"` → 240×135×128, far
 * 96, temporal. `memoryOk: false` drops Ultra to 240×135×96 + reports
 * VOLUMETRIC_GRID_REDUCED (R10).
 */
export function froxelGridFor(
  mode: "analytic" | "froxel-medium" | "froxel-high" | null,
  memoryOk = true
): FroxelGridSpec | null {
  switch (mode) {
    case "froxel-medium": return froxel(160, 90, 64, 8, 64, false);
    case "froxel-high":
      return memoryOk ? froxel(240, 135, 128, 16, 96, true) : froxel(240, 135, 96, 16, 96, true, "VOLUMETRIC_GRID_REDUCED");
    default: return null;
  }
}

export interface VolumetricFogPassInput {
  /** Packed §8.4 fog uniforms (fogA = σd,σh,b,h0 reused as volume density;
      fogB.w = anisotropy). Null → uniform σ + ambient only. */
  readonly fog: PackedFogUniforms | null;
  readonly fogColor: readonly [number, number, number];
  readonly volumes: readonly Prd07FogVolume[];
  readonly sunDirection: readonly [number, number, number];
  readonly sunColor: readonly [number, number, number];
  readonly ambientColor: readonly [number, number, number];
  readonly noiseScale?: number;
  readonly noiseSpeed?: number;
  readonly noiseStrength?: number;
  /** Scene depth texture for the apply pass. */
  readonly sceneDepth: Texture | null;
  readonly depthLinearize: readonly [number, number, number, number];
}

let tri: Geometry | null = null;
function fullscreenTriangle(): Geometry {
  if (tri) return tri;
  const v = new VertexBuffer(VertexFormat.P3, 3);
  v.setAttribute(0, "position", [-1, -1, 0]);
  v.setAttribute(1, "position", [3, -1, 0]);
  v.setAttribute(2, "position", [-1, 3, 0]);
  tri = new Geometry(v, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
  return tri;
}

const FULL_SCREEN = { depthTest: false, depthWrite: false, cullMode: "none" as const, blend: false, depthCompare: "always" as const };

const VOLUMETRIC_INJECT_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_tileSize", kind: "vec2" },
  { name: "u_projTan", kind: "vec2" },
  { name: "u_invView", kind: "mat4" },
  { name: "u_cameraPosition", kind: "vec3" },
  { name: "u_near", kind: "float" },
  { name: "u_far", kind: "float" },
  { name: "u_slice", kind: "float" },
  { name: "u_slices", kind: "float" },
  { name: "u_jitter", kind: "float" },
  { name: "u_fogDensity", kind: "vec4" },
  { name: "u_fogVolumes", kind: "vec4", arrayLength: 16 },
  { name: "u_noiseScale", kind: "float" },
  { name: "u_noiseSpeed", kind: "float" },
  { name: "u_noiseStrength", kind: "float" },
  { name: "u_time", kind: "float" },
  { name: "u_sunDirection", kind: "vec3" },
  { name: "u_sunColor", kind: "vec3" },
  { name: "u_anisotropy", kind: "float" },
  { name: "u_ambientColor", kind: "vec3" },
  { name: "u_localLights", kind: "vec4", arrayLength: 8 }
];

const VOLUMETRIC_INTEGRATE_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_atlasSize", kind: "vec2" },
  { name: "u_tileSize", kind: "vec2" },
  { name: "u_tilesX", kind: "float" },
  { name: "u_near", kind: "float" },
  { name: "u_far", kind: "float" },
  { name: "u_slices", kind: "float" },
  { name: "u_injectAtlas", kind: "texture2d" }
];

const VOLUMETRIC_APPLY_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_depthLinearize", kind: "vec4" },
  { name: "u_atlasSize", kind: "vec2" },
  { name: "u_tileSize", kind: "vec2" },
  { name: "u_tilesX", kind: "float" },
  { name: "u_near", kind: "float" },
  { name: "u_far", kind: "float" },
  { name: "u_slices", kind: "float" },
  { name: "u_integrateAtlas", kind: "texture2d" },
  { name: "u_sceneDepth", kind: "depth2d", required: true }
];

const VOLUMETRIC_INJECT_WGSL: NativeShaderStages = {
  vertex: /* wgsl */ `
// ${PRD07_VOLUMETRIC_MARKER} inject vertex
/* @aura3d-bindings */
struct VolumetricInjectVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_pos: vec3<f32>) -> VolumetricInjectVarying {
  var out: VolumetricInjectVarying;
  out.ndc = a_pos.xy;
  out.position = vec4<f32>(a_pos.xy, 0.0, 1.0);
  return out;
}`,
  fragment: /* wgsl */ `
// ${PRD07_VOLUMETRIC_MARKER} inject fragment
/* @aura3d-bindings */
struct VolumetricInjectVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};
fn a3dInjectHeightDensity(p: vec3<f32>) -> f32 {
  return aura.u_fogDensity.y * exp(-aura.u_fogDensity.z * (p.y - aura.u_fogDensity.w)) + aura.u_fogDensity.x;
}
fn a3dInjectVolumeDensity(p: vec3<f32>) -> f32 {
  var d = 0.0;
  for (var i = 0u; i < 8u; i += 1u) {
    let a = aura.u_fogVolumes[i * 2u];
    let b = aura.u_fogVolumes[i * 2u + 1u];
    if (b.w <= 0.0) { continue; }
    let q = (p - a.xyz) / max(b.xyz, vec3<f32>(1e-9));
    let metric = select(max(max(abs(q.x), abs(q.y)), abs(q.z)), dot(q, q), a.w > 0.5);
    let inside = 1.0 - smoothstep(0.85, 1.0, metric);
    d += inside * b.w;
  }
  return d;
}
fn a3dVolHash(xIn: u32) -> u32 {
  let x = xIn + 0x6d2b79f5u;
  var t = (x ^ (x >> 15u)) * (1u | x);
  t = (t + ((t ^ (t >> 7u)) * (61u | t))) ^ t;
  return t ^ (t >> 14u);
}
fn a3dVolRand01(h: u32) -> f32 { return f32(h) * (1.0 / 4294967296.0); }
fn a3dVolLattice(c: vec3<i32>) -> f32 {
  let key = bitcast<u32>((c.x * 3) ^ (c.y * 7) ^ (c.z * 13));
  return a3dVolRand01(a3dVolHash(key));
}
fn a3dVolNoise(p: vec3<f32>) -> f32 {
  let ip = vec3<i32>(floor(p));
  let fp = fract(p);
  let u = fp * fp * (vec3<f32>(3.0) - 2.0 * fp);
  let n000 = a3dVolLattice(ip);
  let n100 = a3dVolLattice(ip + vec3<i32>(1, 0, 0));
  let n010 = a3dVolLattice(ip + vec3<i32>(0, 1, 0));
  let n110 = a3dVolLattice(ip + vec3<i32>(1, 1, 0));
  let n001 = a3dVolLattice(ip + vec3<i32>(0, 0, 1));
  let n101 = a3dVolLattice(ip + vec3<i32>(1, 0, 1));
  let n011 = a3dVolLattice(ip + vec3<i32>(0, 1, 1));
  let n111 = a3dVolLattice(ip + vec3<i32>(1, 1, 1));
  let nx00 = mix(n000, n100, u.x);
  let nx10 = mix(n010, n110, u.x);
  let nx01 = mix(n001, n101, u.x);
  let nx11 = mix(n011, n111, u.x);
  return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z);
}
fn a3dHG(mu: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / (12.5663706 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}
@fragment fn fs_main(in: VolumetricInjectVarying) -> @location(0) vec4<f32> {
  let uv = fract(in.position.xy / aura.u_tileSize);
  let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let zk = aura.u_near * pow(aura.u_far / aura.u_near, (aura.u_slice + aura.u_jitter) / aura.u_slices);
  let viewDir = vec3<f32>(ndc * aura.u_projTan, -1.0);
  let p = aura.u_cameraPosition + (aura.u_invView * vec4<f32>(viewDir * zk, 0.0)).xyz;
  var sigma = a3dInjectHeightDensity(p) + a3dInjectVolumeDensity(p);
  sigma += (a3dVolNoise(p * aura.u_noiseScale + vec3<f32>(0.0, 0.0, -aura.u_time * aura.u_noiseSpeed)) * 2.0 - 1.0) * aura.u_noiseStrength;
  sigma = max(sigma, 0.0);
  let v = normalize(p - aura.u_cameraPosition);
  let mu = dot(v, aura.u_sunDirection);
  var L = aura.u_sunColor * a3dHG(mu, aura.u_anisotropy) + aura.u_ambientColor;
  for (var i = 0u; i < 4u; i += 1u) {
    let la = aura.u_localLights[i * 2u];
    let lb = aura.u_localLights[i * 2u + 1u];
    if (la.w <= 0.0) { continue; }
    let toLight = la.xyz - p;
    let d = max(length(toLight), 1e-4);
    L += lb.rgb * (la.w / (d * d)) * a3dHG(dot(v, toLight / d), aura.u_anisotropy);
  }
  return vec4<f32>(L * sigma, sigma);
}`
};

const VOLUMETRIC_INTEGRATE_WGSL: NativeShaderStages = {
  vertex: /* wgsl */ `
// ${PRD07_VOLUMETRIC_MARKER} integrate vertex
/* @aura3d-bindings */
@vertex fn vs_main(@location(0) a_pos: vec3<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(a_pos.xy, 0.0, 1.0);
}`,
  fragment: /* wgsl */ `
// ${PRD07_VOLUMETRIC_MARKER} integrate fragment
/* @aura3d-bindings */
fn a3dSliceZ(k: f32) -> f32 {
  return aura.u_near * pow(aura.u_far / aura.u_near, k / aura.u_slices);
}
@fragment fn fs_main(@builtin(position) fragPos: vec4<f32>) -> @location(0) vec4<f32> {
  let tileF = floor(fragPos.xy / aura.u_tileSize);
  let tilesX = max(i32(aura.u_tilesX), 1);
  let k = i32(tileF.y) * tilesX + i32(tileF.x);
  let uv = fract(fragPos.xy / aura.u_tileSize);
  var S = vec3<f32>(0.0);
  var T = 1.0;
  for (var j = 0; j <= k; j += 1) {
    let tile = vec2<f32>(f32(j % tilesX), f32(j / tilesX));
    let sampleUv = (tile * aura.u_tileSize + uv * aura.u_tileSize) / aura.u_atlasSize;
    let inj = textureSampleLevel(u_injectAtlasTexture, u_injectAtlasSampler, sampleUv, 0.0);
    let sigma = inj.a;
    let dz = a3dSliceZ(f32(j) + 1.0) - a3dSliceZ(f32(j));
    S += inj.rgb * ((1.0 - exp(-sigma * dz)) / max(sigma, 1e-5)) * T;
    T *= exp(-sigma * dz);
  }
  return vec4<f32>(S, T);
}`
};

const VOLUMETRIC_APPLY_WGSL: NativeShaderStages = {
  vertex: /* wgsl */ `
// ${PRD07_VOLUMETRIC_MARKER} apply vertex
/* @aura3d-bindings */
struct VolumetricApplyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_pos: vec3<f32>) -> VolumetricApplyVarying {
  var out: VolumetricApplyVarying;
  out.uv = a_pos.xy * 0.5 + vec2<f32>(0.5);
  out.position = vec4<f32>(a_pos.xy, 0.0, 1.0);
  return out;
}`,
  fragment: /* wgsl */ `
// ${PRD07_VOLUMETRIC_MARKER} apply fragment
/* @aura3d-bindings */
struct VolumetricApplyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
fn a3dSceneViewZ(depthIn: f32) -> f32 {
  let lin = aura.u_depthLinearize;
  let depth = select(depthIn, 1.0 - depthIn, lin.w > 0.5);
  if (lin.z > 0.5) { return mix(lin.x, lin.y, depth); }
  return lin.x * lin.y / max(lin.y - depth * (lin.y - lin.x), 1e-4);
}
fn a3dSampleSlice(k: i32, uv: vec2<f32>) -> vec4<f32> {
  let slices = i32(aura.u_slices);
  if (k < 0 || k >= slices) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
  let tilesX = max(i32(aura.u_tilesX), 1);
  let tile = vec2<f32>(f32(k % tilesX), f32(k / tilesX));
  let sampleUv = (tile * aura.u_tileSize + uv * aura.u_tileSize) / aura.u_atlasSize;
  return textureSampleLevel(u_integrateAtlasTexture, u_integrateAtlasSampler, sampleUv, 0.0);
}
@fragment fn fs_main(in: VolumetricApplyVarying) -> @location(0) vec4<f32> {
  let depthSize = vec2<i32>(textureDimensions(u_sceneDepthTexture));
  let texel = clamp(vec2<i32>(in.position.xy), vec2<i32>(0), depthSize - vec2<i32>(1));
  let depth = textureLoad(u_sceneDepthTexture, texel, 0);
  let viewZ = a3dSceneViewZ(depth);
  let fslice = clamp(log(max(viewZ, 1e-4) / aura.u_near) / log(aura.u_far / aura.u_near) * aura.u_slices - 0.5, 0.0, aura.u_slices - 1.0);
  let k0 = i32(floor(fslice));
  let k1 = min(k0 + 1, i32(aura.u_slices) - 1);
  let uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
  let s0 = a3dSampleSlice(k0, uv);
  let s1 = a3dSampleSlice(k1, uv);
  let s = mix(s0, s1, fslice - f32(k0));
  return vec4<f32>(s.rgb, 1.0 - s.a);
}`
};

export class VolumetricFogPass {
  private injectProgram: RenderShaderProgram | null = null;
  private integrateProgram: RenderShaderProgram | null = null;
  private applyProgram: RenderShaderProgram | null = null;
  private injectAtlas: RenderTarget | null = null;
  private integrateAtlas: RenderTarget | null = null;
  private temporalPrev: RenderTarget | null = null;

  constructor(private readonly device: RenderDevice, readonly grid: FroxelGridSpec) {}

  /** Readback handles for browser specs (froxel-transmittance.spec.ts). */
  get debugTargets(): { inject: RenderTarget | null; integrate: RenderTarget | null } {
    return { inject: this.injectAtlas, integrate: this.integrateAtlas };
  }

  private ensureTargets(): void {
    const desc = { width: this.grid.atlasWidth, height: this.grid.atlasHeight, format: "rgba16f" as const };
    this.injectAtlas ??= this.device.createRenderTarget({ ...desc, label: "prd07.froxel.inject" });
    this.integrateAtlas ??= this.device.createRenderTarget({ ...desc, label: "prd07.froxel.integrate" });
    if (this.grid.temporal) {
      this.temporalPrev ??= this.device.createRenderTarget({ ...desc, label: "prd07.froxel.temporal" });
    }
  }

  private program(kind: "inject" | "integrate" | "apply"): RenderShaderProgram {
    const cached = kind === "inject" ? this.injectProgram : kind === "integrate" ? this.integrateProgram : this.applyProgram;
    if (cached) return cached;
    const webgpuProps = this.device.kind === "webgpu"
      ? (kind === "inject"
          ? { webgpu: VOLUMETRIC_INJECT_WGSL, portableBindings: VOLUMETRIC_INJECT_PORTABLE_BINDINGS }
          : kind === "integrate"
            ? { webgpu: VOLUMETRIC_INTEGRATE_WGSL, portableBindings: VOLUMETRIC_INTEGRATE_PORTABLE_BINDINGS }
            : { webgpu: VOLUMETRIC_APPLY_WGSL, portableBindings: VOLUMETRIC_APPLY_PORTABLE_BINDINGS })
      : {};
    const program = this.device.createShaderProgram({
      label: `prd07.volumetric.${kind}`,
      vertex: kind === "inject" ? volumetricInjectVertexSource()
        : kind === "integrate" ? volumetricIntegrateVertexSource()
        : volumetricApplyVertexSource(),
      fragment: kind === "inject" ? volumetricInjectFragmentSource()
        : kind === "integrate" ? volumetricIntegrateFragmentSource()
        : volumetricApplyFragmentSource(),
      marker: PRD07_VOLUMETRIC_MARKER,
      ...webgpuProps
    });
    if (kind === "inject") this.injectProgram = program;
    else if (kind === "integrate") this.integrateProgram = program;
    else this.applyProgram = program;
    return program;
  }

  /** Per-frame froxel update: inject → integrate. Returns the apply draw. */
  update(input: VolumetricFogPassInput, ctx: FrameContributorContext): { readonly apply: (target: RenderTarget | null) => void; readonly notes: readonly string[] } {
    // T0-34: remember the caller's bound target — this pass must leave it
    // bound on exit, never null (canvas), or later draws hit the framebuffer
    // and OutputPass overwrites them.
    const callerRt = this.device.getRenderTarget?.() ?? null;
    this.ensureTargets();
    const notes: string[] = [];
    if (this.grid.note) notes.push(this.grid.note);
    const camera = ctx.camera;
    const invView = camera ? invertRigid(camera.viewMatrix) : IDENTITY_MAT4;
    // tan(half-fov) from the renderer's view-projection (rows 0/1 of its 3×3
    // are P[0]·R and P[5]·R with R orthonormal). FrameCamera.projectionMatrix
    // is identity whenever the renderer resolved a non-Camera CameraLike,
    // which reconstructed every froxel along a 90° frustum.
    const vp = camera?.viewProjectionMatrix;
    const rowLen = (r: number): number => (vp ? Math.hypot(vp[r] ?? 0, vp[r + 4] ?? 0, vp[r + 8] ?? 0) : 0);
    const tanY = camera ? 1 / Math.max(rowLen(1) || (camera.projectionMatrix[5] ?? 1), 1e-6) : 1;
    const tanX = camera ? 1 / Math.max(rowLen(0) || (camera.projectionMatrix[0] ?? 1), 1e-6) : 1;
    const packed = input.fog;
    const noiseScale = input.noiseScale ?? 0;
    const noiseSpeed = input.noiseSpeed ?? 0;
    const noiseStrength = input.noiseStrength ?? 0;
    // §8.7 Ultra jitter: (frameIndex mod 8 + 0.5)/8 of a slice.
    const jitter = this.grid.temporal ? ((ctx.frameIndex % 8) + 0.5) / 8 : 0;
    if (this.grid.temporal && camera?.previousViewProjectionMatrix == null) {
      notes.push("VOLUMETRIC_TEMPORAL_PENDING");
    }
    const geometry = fullscreenTriangle();
    const vertexBuffer = geometry.vertexBuffer.upload(this.device);

    // 1) inject — one scissored draw per slice into its tile. Temporal grids
    // amortize the inject over 8 frames (a slice budget, not a full pass per
    // frame): slices rotate through the grid so per-frame cost stays bounded
    // while the temporal accumulation hides the staggered update.
    const volumes = packFogVolumes(input.volumes);
    const inject = this.program("inject");
    const sliceBudget = this.grid.temporal ? Math.ceil(this.grid.slices / 8) : this.grid.slices;
    const sliceBase = this.grid.temporal ? ((ctx.frameIndex % 8) * sliceBudget) % this.grid.slices : 0;
    for (let i = 0; i < sliceBudget; i += 1) {
      const slice = (sliceBase + i) % this.grid.slices;
      const tx = slice % this.grid.tilesX;
      const ty = Math.floor(slice / this.grid.tilesX);
      const u = new Map<string, UniformValue>();
      u.set("u_tileSize", [this.grid.tileWidth, this.grid.tileHeight]);
      u.set("u_projTan", [tanX, tanY]);
      u.set("u_invView", invView);
      u.set("u_cameraPosition", [...(camera?.position ?? [0, 0, 0])]);
      u.set("u_near", this.grid.near);
      u.set("u_far", this.grid.far);
      u.set("u_slice", slice);
      u.set("u_slices", this.grid.slices);
      u.set("u_jitter", jitter);
      u.set("u_fogDensity", packed ? packed.fogA : [0, 0, 0, 0]);
      u.set("u_fogVolumes", volumes);
      u.set("u_noiseScale", noiseScale);
      u.set("u_noiseSpeed", noiseSpeed);
      u.set("u_noiseStrength", noiseStrength);
      u.set("u_time", ctx.timeSeconds);
      u.set("u_sunDirection", [...input.sunDirection]);
      u.set("u_sunColor", [...input.sunColor]);
      u.set("u_anisotropy", packed ? packed.fogB[3] : 0.6);
      u.set("u_ambientColor", [...input.ambientColor]);
      u.set("u_localLights", new Float32Array(32));
      this.device.setRenderTarget(this.injectAtlas);
      this.device.draw({
        label: `prd07.volumetric.inject.${slice}`,
        topology: "triangles",
        vertexBuffer,
        vertexFormat: geometry.vertexBuffer.format,
        vertexCount: 3,
        shader: inject,
        uniforms: u,
        renderState: {
          ...FULL_SCREEN,
          scissor: { x: tx * this.grid.tileWidth, y: ty * this.grid.tileHeight, width: this.grid.tileWidth, height: this.grid.tileHeight }
        }
      });
    }

    // 2) integrate — one whole-atlas draw, per-fragment prefix sum.
    const integrate = this.program("integrate");
    const iu = new Map<string, UniformValue>();
    iu.set("u_injectAtlas", new TextureBinding({ name: "u_injectAtlas", texture: this.injectAtlas!.colorTexture }));
    iu.set("u_atlasSize", [this.grid.atlasWidth, this.grid.atlasHeight]);
    iu.set("u_tileSize", [this.grid.tileWidth, this.grid.tileHeight]);
    iu.set("u_tilesX", this.grid.tilesX);
    iu.set("u_near", this.grid.near);
    iu.set("u_far", this.grid.far);
    iu.set("u_slices", this.grid.slices);
    this.device.setRenderTarget(this.integrateAtlas);
    this.device.draw({
      label: "prd07.volumetric.integrate",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: 3,
      shader: integrate,
      uniforms: iu,
      renderState: FULL_SCREEN
    });
    this.device.setRenderTarget(callerRt);

    // 3) apply draw closure (premultiplied-over into the caller's target).
    const integrateAtlas = this.integrateAtlas!;
    const sceneDepth = input.sceneDepth;
    const depthLinearize = input.depthLinearize;
    const apply = (target: RenderTarget | null): void => {
      const au = new Map<string, UniformValue>();
      au.set("u_integrateAtlas", new TextureBinding({ name: "u_integrateAtlas", texture: integrateAtlas.colorTexture }));
      au.set("u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: sceneDepth, sampler: PRD07_DEPTH_SAMPLER, required: true }));
      au.set("u_depthLinearize", [...depthLinearize]);
      au.set("u_atlasSize", [this.grid.atlasWidth, this.grid.atlasHeight]);
      au.set("u_tileSize", [this.grid.tileWidth, this.grid.tileHeight]);
      au.set("u_tilesX", this.grid.tilesX);
      au.set("u_near", this.grid.near);
      au.set("u_far", this.grid.far);
      au.set("u_slices", this.grid.slices);
      const prev = this.device.getRenderTarget?.() ?? null;
      this.device.setRenderTarget(target);
      this.device.draw({
        label: "prd07.volumetric.apply",
        topology: "triangles",
        vertexBuffer,
        vertexFormat: geometry.vertexBuffer.format,
        vertexCount: 3,
        shader: this.program("apply"),
        uniforms: au,
        renderState: { ...FULL_SCREEN, blendMode: "premultiplied", blend: true }
      });
      this.device.setRenderTarget(prev);
    };
    return { apply, notes };
  }

  dispose(): void {
    for (const t of [this.injectAtlas, this.integrateAtlas, this.temporalPrev]) t?.dispose();
    this.injectAtlas = null;
    this.integrateAtlas = null;
    this.temporalPrev = null;
  }
}

const IDENTITY_MAT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Invert a rigid-body (rotation+translation) view matrix column-major. */
export function invertRigid(m: Float32Array): Float32Array {
  // Rigid inverse: Rᵀ + -Rᵀt (column-major mat4).
  const r00 = m[0]!, r10 = m[1]!, r20 = m[2]!;
  const r01 = m[4]!, r11 = m[5]!, r21 = m[6]!;
  const r02 = m[8]!, r12 = m[9]!, r22 = m[10]!;
  const tx = m[12]!, ty = m[13]!, tz = m[14]!;
  const out = new Float32Array(16);
  out[0] = r00; out[4] = r10; out[8] = r20;
  out[1] = r01; out[5] = r11; out[9] = r21;
  out[2] = r02; out[6] = r12; out[10] = r22;
  out[12] = -(r00 * tx + r10 * ty + r20 * tz); // -Rᵀt component 0 (R column 0 · t)
  out[13] = -(r01 * tx + r11 * ty + r21 * tz);
  out[14] = -(r02 * tx + r12 * ty + r22 * tz);
  out[15] = 1;
  return out;
}
