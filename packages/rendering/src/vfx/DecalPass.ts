// PRD-07 P6-T1 — §6.9 decal draw pass. Runs in the `after-opaque` phase
// (before transparents): one indexed draw per atlas page × blend group from
// DecalBatch.buildAll. Lit per §8.8; blend is `alpha` for marks and
// `multiply` for grime — under the C-04 stub multiply is emulated as
// alpha-over with black at 1 − luminance and reported once per page key as
// VFX_BLEND_FALLBACK.

import type { NativeShaderStages, PortableShaderBinding, RenderBuffer, RenderDevice, RenderShaderProgram, UniformValue } from "../RenderDevice";
import type { FrameContributorContext } from "../contracts/frameGraph";
import { TextureBinding } from "../TextureBinding";
import { VertexFormat } from "../VertexFormat";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "../webgpu/ProjectionClip";
import { DECAL_VERTEX_FLOATS, type DecalBatch, type DecalGeometry } from "./DecalBatch";
import { DECAL_SHADER_MARKER, decalFragmentSource, decalProgramKey, decalVertexSource, type DecalProgramDefines } from "./shaders/decal.glsl";
import type { Texture } from "../Texture";

export const DECAL_VERTEX_FORMAT = new VertexFormat(
  [
    { semantic: "position", components: 3, offset: 0, shaderName: "a_position" },
    { semantic: "normal", components: 3, offset: 12, shaderName: "a_normal" },
    { semantic: "uv", components: 2, offset: 24, shaderName: "a_uv" },
    { semantic: "color", components: 4, offset: 32, shaderName: "a_color" },
    // `uv1` = extra per-vertex channel; bound to a_fade by name (angleStart, angleEnd, nearFade, farFade).
    { semantic: "uv1", components: 4, offset: 48, shaderName: "a_fade" }
  ],
  DECAL_VERTEX_FLOATS * 4
);

/** One punctual light for the decal BRDF (three.js MeshStandardMaterial parity). */
export interface DecalLight {
  readonly kind: "directional" | "point";
  /** directional: unit vector TOWARD the light; point: world position. */
  readonly vector: readonly [number, number, number];
  /** colour × intensity (linear). */
  readonly radiance: readonly [number, number, number];
  /** point range cutoff (0 = none). */
  readonly range?: number;
}

/** Per-frame scene lighting the decals shade with — the same lights as the surface below. */
export interface DecalLighting {
  readonly lights: readonly DecalLight[];
  /** Ambient colour × intensity; the shader applies BRDF_Lambert (1/π). */
  readonly ambient: readonly [number, number, number];
}

// 5, not 4: the WebGL2 binder uploads any 16-float array as a mat4
// (uniformMatrix4fv), so a vec4[4] array raised GL_INVALID_OPERATION (0x502).
export const DECAL_MAX_LIGHTS = 5;

/** Pack ≤4 lights into the u_lightVector / u_lightRadiance arrays. */
export function packDecalLighting(lighting: DecalLighting): { vector: Float32Array; radiance: Float32Array; count: number } {
  const vector = new Float32Array(DECAL_MAX_LIGHTS * 4);
  const radiance = new Float32Array(DECAL_MAX_LIGHTS * 4);
  const count = Math.min(DECAL_MAX_LIGHTS, lighting.lights.length);
  for (let i = 0; i < count; i++) {
    const light = lighting.lights[i]!;
    vector.set([light.vector[0], light.vector[1], light.vector[2], light.kind === "point" ? 1 : 0], i * 4);
    radiance.set([light.radiance[0], light.radiance[1], light.radiance[2], light.range ?? 0], i * 4);
  }
  return { vector, radiance, count };
}

/** Fallback when no scene lighting is published: one soft key + dim ambient. */
const DEFAULT_DECAL_LIGHTING: DecalLighting = {
  lights: [{ kind: "directional", vector: [0.5, 0.8, 0.3], radiance: [1, 1, 1] }],
  ambient: [0.3, 0.3, 0.33]
};

/** Optional texture lookup for page keys — the engine resolves URLs/pages. */
export type DecalTextureResolver = (pageKey: string) => Texture | null;

export interface DecalPassOptions {
  readonly resolveTexture?: DecalTextureResolver;
  /** Sun light for the §8.8 lobe — defaults are sane for tests. */
  readonly sunDirection?: readonly [number, number, number];
  readonly sunColor?: readonly [number, number, number];
  readonly roughness?: number;
  /** Scene lights for the decal BRDF; null/absent → DEFAULT_DECAL_LIGHTING. */
  readonly lighting?: (ctx: FrameContributorContext) => DecalLighting | null;
  readonly fog?: boolean;
  /** §8.4 packed uniforms when `fog` is set (from the prd07.fog blackboard). */
  readonly fogUniforms?: (ctx: FrameContributorContext) => Map<string, UniformValue> | null;
  /** Reported once per page key when multiply emulates alpha-over. */
  readonly onNote?: (code: string, message: string) => void;
}

interface DecalBufferSlot {
  vertexBuffer: RenderBuffer | null;
  indexBuffer: RenderBuffer | null;
  vertexCapacity: number;
  indexCapacity: number;
}

const DECAL_BASE_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_viewProjection", kind: "mat4" },
  { name: "u_cameraPosition", kind: "vec3" },
  { name: "u_sunDirection", kind: "vec3" },
  { name: "u_sunColor", kind: "vec3" },
  { name: "u_roughness", kind: "float" },
  { name: "u_lightVector", kind: "vec4", arrayLength: DECAL_MAX_LIGHTS },
  { name: "u_lightRadiance", kind: "vec4", arrayLength: DECAL_MAX_LIGHTS },
  { name: "u_lightCount", kind: "float" },
  { name: "u_ambientIrradiance", kind: "vec3" }
];

const DECAL_FOG_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_fogA", kind: "vec4" },
  { name: "u_fogB", kind: "vec4" },
  { name: "u_fogColor", kind: "vec3" },
  { name: "u_fogAbsorption", kind: "vec3" },
  { name: "u_fogMode", kind: "float" },
  { name: "u_fogNear", kind: "float" },
  { name: "u_fogFar", kind: "float" },
  { name: "u_fogVolumes", kind: "vec4", arrayLength: 16 }
];

function decalPortableBindings(defines: DecalProgramDefines): readonly PortableShaderBinding[] {
  const bindings: PortableShaderBinding[] = [...DECAL_BASE_PORTABLE_BINDINGS];
  if (defines.fog) bindings.push(...DECAL_FOG_PORTABLE_BINDINGS);
  if (defines.albedoTexture) bindings.push({ name: "u_albedo", kind: "texture2d" });
  if (defines.normalTexture) bindings.push({ name: "u_normalMap", kind: "texture2d" });
  return bindings;
}

const DECAL_FOG_WGSL = /* wgsl */ `
fn a3dDecalHeightFogTau(c: vec3<f32>, v: vec3<f32>, d: f32) -> f32 {
  let dd = max(d - aura.u_fogB.x, 0.0);
  var tau = aura.u_fogA.x * dd;
  let k = aura.u_fogA.z * v.y * dd;
  let line = select((1.0 - exp(-k)) / k, 1.0, abs(k) < 1e-4);
  tau += aura.u_fogA.y * exp(-aura.u_fogA.z * (c.y - aura.u_fogA.w)) * dd * line;
  return tau;
}
fn a3dDecalFogVolumesTau(c: vec3<f32>, v: vec3<f32>, d: f32) -> f32 {
  var tau = 0.0;
  for (var i = 0u; i < 8u; i += 1u) {
    let a = aura.u_fogVolumes[i * 2u];
    let b = aura.u_fogVolumes[i * 2u + 1u];
    if (b.w <= 0.0) { continue; }
    var t0 = 0.0;
    var t1 = d;
    var hit = true;
    for (var axis = 0u; axis < 3u; axis += 1u) {
      let o = c[axis] - a[axis];
      let dv = v[axis];
      let halfExtent = b[axis];
      if (abs(dv) < 1e-9) {
        if (abs(o) > halfExtent) { hit = false; }
      } else {
        let ta = (-halfExtent - o) / dv;
        let tb = (halfExtent - o) / dv;
        t0 = max(t0, min(ta, tb));
        t1 = min(t1, max(ta, tb));
      }
    }
    if (a.w > 0.5) {
      let extent = max(b.xyz, vec3<f32>(1e-9));
      let os = (c - a.xyz) / extent;
      let vs = v / extent;
      let qa = dot(vs, vs);
      let qb = dot(os, vs);
      let qc = dot(os, os) - 1.0;
      let qd = qb * qb - qa * qc;
      if (qa < 1e-12 || qd < 0.0 || !hit) {
        hit = false;
      } else {
        let qr = sqrt(qd);
        t0 = max((-qb - qr) / qa, 0.0);
        t1 = min((-qb + qr) / qa, d);
      }
    } else {
      t0 = max(t0, 0.0);
      t1 = min(t1, d);
    }
    if (hit && t1 > t0) { tau += (t1 - t0) * b.w; }
  }
  return tau;
}
fn a3dDecalApplyFog(color: vec3<f32>, worldPos: vec3<f32>) -> vec3<f32> {
  let mode = aura.u_fogMode;
  if (mode == 0.0) { return color; }
  let r = worldPos - aura.u_cameraPosition;
  let d = length(r);
  let v = r / max(d, 1e-5);
  if (mode == 5.0) {
    let tr = exp(-aura.u_fogAbsorption * d);
    return color * tr + aura.u_fogColor * (vec3<f32>(1.0) - tr);
  }
  if (mode == 6.0) {
    var factor = 0.0;
    if (aura.u_fogA.w < 1.5) {
      factor = (d - aura.u_fogB.x) / max(aura.u_fogB.y - aura.u_fogB.x, 0.000001);
    } else if (aura.u_fogA.w < 2.5) {
      factor = 1.0 - exp(-max(aura.u_fogA.x, 0.0) * d);
    } else {
      let s = max(aura.u_fogA.x, 0.0) * d;
      factor = 1.0 - exp(-(s * s));
    }
    if (aura.u_fogA.y > 0.0) {
      factor *= exp(-max(0.0, worldPos.y - aura.u_fogA.z) * aura.u_fogA.y);
    }
    let amt = clamp(factor, 0.0, 1.0) * clamp(aura.u_fogB.z, 0.0, 1.0);
    return mix(color, aura.u_fogColor, amt);
  }
  var tau = 0.0;
  if (mode == 1.0) { tau = a3dDecalHeightFogTau(aura.u_cameraPosition, v, d); }
  else if (mode == 2.0) { tau = aura.u_fogA.x * d; }
  else if (mode == 3.0) { let s = aura.u_fogA.x * d; tau = s * s; }
  tau += a3dDecalFogVolumesTau(aura.u_cameraPosition, v, d);
  var amount = 1.0 - exp(-tau);
  if (mode == 4.0) {
    amount = clamp((d - aura.u_fogNear) / max(aura.u_fogFar - aura.u_fogNear, 1e-5), 0.0, 1.0);
  }
  amount = min(amount, aura.u_fogB.y);
  var inscatter = aura.u_fogColor;
  if (aura.u_fogB.z != 0.0) {
    let g = aura.u_fogB.w;
    let mu = clamp(dot(v, aura.u_sunDirection), -1.0, 1.0);
    let g2 = g * g;
    let phase = (1.0 - g2) / (12.5663706 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
    inscatter += aura.u_sunColor * phase * aura.u_fogB.z;
  }
  return mix(color, inscatter, amount);
}`;

function decalWgsl(defines: DecalProgramDefines): NativeShaderStages {
  const varyings = /* wgsl */ `
struct DecalVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) color: vec4<f32>,
  @location(4) fade: vec4<f32>,
};`;
  const vertex = /* wgsl */ `
// ${DECAL_SHADER_MARKER} vertex
/* @aura3d-bindings */
${ZERO_TO_ONE_PROJECTION_WGSL}
${varyings}
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>,
  @location(4) a_color: vec4<f32>,
  @location(7) a_fade: vec4<f32>
) -> DecalVarying {
  var out: DecalVarying;
  out.world = a_position;
  out.normal = a_normal;
  out.uv = a_uv;
  out.color = a_color;
  out.fade = a_fade;
  let clip = aura.u_viewProjection * vec4<f32>(a_position, 1.0);
  out.position = vec4<f32>(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);
  return out;
}`;
  const fragment = /* wgsl */ `
// ${DECAL_SHADER_MARKER} fragment
/* @aura3d-bindings */
${varyings}
${defines.fog ? DECAL_FOG_WGSL : ""}
fn a3dDecalD(nDotH: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let dn = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return 0.31830989 * a2 / max(dn * dn, 1e-6);
}
fn a3dDecalV(nDotL: f32, nDotV: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let gv = nDotL * sqrt(a2 + (1.0 - a2) * nDotV * nDotV);
  let gl = nDotV * sqrt(a2 + (1.0 - a2) * nDotL * nDotL);
  return 0.5 / max(gv + gl, 1e-6);
}
fn a3dDecalDirect(albedo: vec3<f32>, N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, radiance: vec3<f32>, alpha: f32) -> vec3<f32> {
  let nDotL = clamp(dot(N, L), 0.0, 1.0);
  if (nDotL <= 0.0) { return vec3<f32>(0.0); }
  let H = normalize(L + V);
  let nDotH = clamp(dot(N, H), 0.0, 1.0);
  let nDotV = clamp(dot(N, V), 1e-3, 1.0);
  let vDotH = clamp(dot(V, H), 0.0, 1.0);
  let f = 0.04 + 0.96 * pow(1.0 - vDotH, 5.0);
  let spec = f * a3dDecalV(nDotL, nDotV, alpha) * a3dDecalD(nDotH, alpha);
  return radiance * nDotL * (albedo * 0.31830989 + vec3<f32>(spec));
}
@fragment fn fs_main(v: DecalVarying) -> @location(0) vec4<f32> {
  let albedo = ${defines.albedoTexture ? "textureSample(u_albedoTexture, u_albedoSampler, v.uv)" : "vec4<f32>(1.0)"} * v.color;
  var V = aura.u_cameraPosition - v.world;
  let dist = length(V);
  V /= max(dist, 1e-4);
  var N = normalize(v.normal);
  ${defines.normalTexture ? `
  {
    let t = normalize(dpdx(v.world));
    let b = normalize(dpdy(v.world));
    let nTex = textureSample(u_normalMapTexture, u_normalMapSampler, v.uv).xyz * 2.0 - vec3<f32>(1.0);
    N = normalize(mat3x3<f32>(t, b, N) * nTex);
  }` : ""}
  let facing = abs(dot(N, V));
  let cosStart = cos(radians(v.fade.x));
  let cosEnd = cos(radians(v.fade.y));
  let angleFade = select(1.0, smoothstep(cosEnd, cosStart, facing), v.fade.y > v.fade.x);
  let distFade = 1.0 - smoothstep(v.fade.z, v.fade.w, dist);
  if (dot(N, V) < 0.0) { N = -N; }
  let alphaR = max(aura.u_roughness * aura.u_roughness, 0.0025);
  var lit = albedo.rgb * 0.31830989 * aura.u_ambientIrradiance;
  for (var i = 0u; i < 5u; i += 1u) {
    if (f32(i) >= aura.u_lightCount) { break; }
    let lv = aura.u_lightVector[i];
    let lr = aura.u_lightRadiance[i];
    var L = lv.xyz;
    var radiance = lr.rgb;
    if (lv.w > 0.5) {
      let toLight = lv.xyz - v.world;
      let d = max(length(toLight), 1e-4);
      L = toLight / d;
      var att = 1.0 / max(d * d, 0.01);
      if (lr.w > 0.0) {
        let x = clamp(1.0 - pow(d / lr.w, 4.0), 0.0, 1.0);
        att *= x * x;
      }
      radiance *= att;
    }
    lit += a3dDecalDirect(albedo.rgb, N, V, normalize(L), radiance, alphaR);
  }
  ${defines.fog ? "lit = a3dDecalApplyFog(lit, v.world);" : ""}
  let alpha = albedo.a * angleFade * distFade;
  ${defines.multiply
    ? `let lum = dot(lit, vec3<f32>(0.2126, 0.7152, 0.0722));
  return vec4<f32>(lit * lum, alpha);`
    : "return vec4<f32>(lit, alpha);"}
}`;
  return { vertex, fragment };
}

export class DecalPass {
  private readonly programs = new Map<string, RenderShaderProgram>();
  private readonly bufferSlots: DecalBufferSlot[] = [];
  private readonly retiredBuffers: RenderBuffer[] = [];
  private slotCursor = 0;
  private lastFrameIndex: number | undefined = undefined;
  private lastCameraRef: object | null = null;
  private readonly blendFallbackNoted = new Set<string>();

  constructor(
    private readonly device: RenderDevice,
    private readonly options: DecalPassOptions = {}
  ) {}

  private beginBatch(ctx: FrameContributorContext): void {
    const cameraRef = (ctx.camera as unknown as object | null | undefined) ?? null;
    const isNewFrame = ctx.frameIndex !== undefined
      ? ctx.frameIndex !== this.lastFrameIndex
      : cameraRef === this.lastCameraRef;
    if (isNewFrame) {
      this.slotCursor = 0;
      while (this.retiredBuffers.length > 0) {
        this.retiredBuffers.pop()?.dispose();
      }
    }
    this.lastFrameIndex = ctx.frameIndex;
    this.lastCameraRef = cameraRef;
  }

  /** Draws every populated (page, blend) group — one draw each. Returns draw count for tests/diagnostics. */
  draw(batch: DecalBatch, ctx: FrameContributorContext, now: number): number {
    this.beginBatch(ctx);
    const geometries = batch.buildAll(now);
    for (const geometry of geometries) {
      const slotIndex = this.slotCursor++;
      this.drawGeometry(geometry, ctx, slotIndex);
    }
    return geometries.length;
  }

  private drawGeometry(geometry: DecalGeometry, ctx: FrameContributorContext, slotIndex: number): void {
    const vb = this.ensureSlotBuffer(slotIndex, "vertex", geometry.vertices.byteLength, "vb");
    this.device.updateBuffer(vb, 0, geometry.vertices);
    const ib = this.ensureSlotBuffer(slotIndex, "index", geometry.indices.byteLength, "ib");
    this.device.updateBuffer(ib, 0, geometry.indices);

    const texture = this.options.resolveTexture?.(geometry.pageKey) ?? null;
    const defines: DecalProgramDefines = {
      albedoTexture: texture !== null,
      normalTexture: false,
      multiply: geometry.blend === "multiply",
      fog: this.options.fog === true
    };
    if (defines.multiply && !this.blendFallbackNoted.has(geometry.pageKey)) {
      this.blendFallbackNoted.add(geometry.pageKey);
      this.options.onNote?.(
        "VFX_BLEND_FALLBACK",
        `prd07.decals: multiply blend emulated as alpha-over (black at 1−luminance) for page "${geometry.pageKey}" under the C-04 stub`
      );
    }
    const sceneLighting = this.options.lighting?.(ctx) ?? DEFAULT_DECAL_LIGHTING;
    const lighting = packDecalLighting(sceneLighting);
    const ambient = sceneLighting.ambient;
    const uniforms = new Map<string, UniformValue>([
      ["u_viewProjection", ctx.camera?.viewProjectionMatrix ?? IDENTITY_MAT4],
      // Fog-chunk inscatter inputs (the decal BRDF reads u_light* below).
      ["u_sunDirection", [...(this.options.sunDirection ?? [0.5, 0.8, 0.3])]],
      ["u_sunColor", [...(this.options.sunColor ?? [1, 1, 1])]],
      ["u_roughness", this.options.roughness ?? 0.5],
      ["u_lightVector", lighting.vector],
      ["u_lightRadiance", lighting.radiance],
      ["u_lightCount", lighting.count],
      ["u_ambientIrradiance", [ambient[0], ambient[1], ambient[2]]],
      ["u_cameraPosition", [...(ctx.camera?.position ?? [0, 0, 0])]]
    ]);
    if (texture) uniforms.set("u_albedo", new TextureBinding({ name: "u_albedo", texture }));
    if (defines.fog) {
      const extra = this.options.fogUniforms?.(ctx);
      if (extra) for (const [k, v] of extra) uniforms.set(k, v);
    }
    this.device.draw({
      label: `prd07.decals.${geometry.pageKey}.${geometry.blend}`,
      topology: "triangles",
      vertexBuffer: vb,
      vertexFormat: DECAL_VERTEX_FORMAT,
      vertexCount: geometry.vertexCount,
      indexBuffer: ib,
      indexType: "uint32",
      indexCount: geometry.indices.length,
      shader: this.program(defines),
      uniforms,
      renderState: {
        depthTest: true,
        depthWrite: false,
        cullMode: "none",
        blend: true,
        blendMode: "alpha",
        depthCompare: "less-equal",
        ...(geometry.polygonOffset ? { polygonOffset: geometry.polygonOffset } : {})
      }
    });
  }

  private ensureSlotBuffer(slotIndex: number, usage: "vertex" | "index", bytes: number, which: "vb" | "ib"): RenderBuffer {
    while (this.bufferSlots.length <= slotIndex) {
      this.bufferSlots.push({ vertexBuffer: null, indexBuffer: null, vertexCapacity: 0, indexCapacity: 0 });
    }
    const slot = this.bufferSlots[slotIndex]!;
    const capacity = which === "vb" ? slot.vertexCapacity : slot.indexCapacity;
    const existing = which === "vb" ? slot.vertexBuffer : slot.indexBuffer;
    if (existing && capacity >= bytes) return existing;
    const next = Math.max(bytes, capacity * 2 || 0, 4096);
    if (existing) this.retiredBuffers.push(existing);
    const buffer = this.device.createBuffer(usage, next);
    if (which === "vb") {
      slot.vertexBuffer = buffer;
      slot.vertexCapacity = next;
    } else {
      slot.indexBuffer = buffer;
      slot.indexCapacity = next;
    }
    return buffer;
  }

  private program(defines: DecalProgramDefines): RenderShaderProgram {
    const key = decalProgramKey(defines);
    let shader = this.programs.get(key);
    if (!shader) {
      shader = this.device.createShaderProgram({
        label: key,
        vertex: decalVertexSource(),
        fragment: decalFragmentSource(defines),
        marker: DECAL_SHADER_MARKER,
        ...(this.device.kind === "webgpu"
          ? { webgpu: decalWgsl(defines), portableBindings: decalPortableBindings(defines) }
          : {})
      });
      this.programs.set(key, shader);
    }
    return shader;
  }

  dispose(): void {
    for (const slot of this.bufferSlots) {
      slot.vertexBuffer?.dispose();
      slot.indexBuffer?.dispose();
    }
    this.bufferSlots.length = 0;
    while (this.retiredBuffers.length > 0) {
      this.retiredBuffers.pop()?.dispose();
    }
    this.programs.clear();
  }
}

const IDENTITY_MAT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
