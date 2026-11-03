/**
 * 02-S12 — box-projected reflection probes (PRD-02 §6.6), lane-02 pieces:
 *
 *  - `a3d_prd02_probe_box` chunk: parallax-corrected (box-projected) lookup
 *    direction against a probe's influence box, plus the ≤ 2-probe blend with
 *    the global environment weight. The CPU twin `boxProjectDirection`
 *    mirrors the GLSL exactly (unit-tested; the browser spec compares pixels).
 *  - `prd02ProbeBindings(assignment)`: per-item uniforms for the chunk from a
 *    `ReflectionProbeSystem.assign` result (the `prd02.probeSelection` map).
 *  - `prd02CaptureDirtyProbes(...)`: the pre-frame capture driver. Captures
 *    can't run inside the frame graph (a nested Renderer.render would clear the
 *    graph and nest beginFrame), so the frame host calls this BEFORE
 *    `Renderer.render` with a face-render callback.
 *
 * Flag: A3D_QR_LIGHTING (+ sub-flag A3D_QR_LIGHTING_PROBES).
 */
import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { ShaderChunk } from "../contracts/program";
import type { ProbeAssignment, ReflectionFaceRenderer } from "./ReflectionProbeSystem";
import type { IrradianceVolume } from "./IrradianceVolume";
import type { RenderItem } from "../contracts/renderItem";
import type { TextureBinding } from "../TextureBinding";

/** Per-item feature signal and metadata seam shared with lean forward code. */
export const PRD02_LOCAL_PROBE_FEATURE = "prd02.localProbe";
export const PRD02_ITEM_PROBE_BINDINGS = Symbol.for("@aura3d/rendering/prd02-item-probe-bindings");
export const PRD02_IRRADIANCE_VOLUME_FEATURE = "prd02.irradianceVolume";
export const PRD02_ITEM_IRRADIANCE_BINDINGS = Symbol.for("@aura3d/rendering/prd02-item-irradiance-bindings");

export interface Prd02ItemProbeBindings {
  readonly device: RenderDevice;
  readonly owner: object;
  readonly assignment: ProbeAssignment;
  readonly uniforms: Readonly<Record<string, TextureBinding | Float32Array>>;
  readonly originalEnvironmentCube?: TextureBinding;
  readonly originalEnvironmentCubeMip?: number;
}

/** Read the collect-phase selection, optionally checking its device/app scope. */
export function prd02ItemProbeBindings(item: RenderItem, device?: RenderDevice, owner?: object): Prd02ItemProbeBindings | null {
  const data = (item as RenderItem & { readonly [PRD02_ITEM_PROBE_BINDINGS]?: Prd02ItemProbeBindings })[PRD02_ITEM_PROBE_BINDINGS];
  return data && (!device || data.device === device) && (!owner || data.owner === owner) ? data : null;
}

/** Completed per-item volume selection; the capture system owns its textures. */
export interface Prd02ItemIrradianceBindings {
  readonly device: RenderDevice;
  readonly owner: object;
  readonly volume: IrradianceVolume;
  readonly uniforms: Readonly<Record<string, TextureBinding | Float32Array>>;
}

/** Read the collect-phase volume selection, optionally checking its device/app scope. */
export function prd02ItemIrradianceBindings(item: RenderItem, device?: RenderDevice, owner?: object): Prd02ItemIrradianceBindings | null {
  const data = (item as RenderItem & { readonly [PRD02_ITEM_IRRADIANCE_BINDINGS]?: Prd02ItemIrradianceBindings })[PRD02_ITEM_IRRADIANCE_BINDINGS];
  return data && (!device || data.device === device) && (!owner || data.owner === owner)
    && data.volume.textures.every((texture) => !texture.disposed) ? data : null;
}

export const PROBE_BOX_CHUNK = "a3d_prd02_probe_box";

export const PROBE_BOX_CHUNK_GLSL = /* glsl */ `
// Probe A / B (u_prd02ProbeWeights.xy) and the global env weight (.z).
uniform samplerCube u_prd02ProbeCubeA;
uniform samplerCube u_prd02ProbeCubeB;
uniform vec4 u_prd02ProbeCenterA;   // xyz center, w = 1 when bound
uniform vec4 u_prd02ProbeHalfA;     // xyz box half-extents
uniform vec4 u_prd02ProbeCenterB;
uniform vec4 u_prd02ProbeHalfB;
// w = 1 when the distinct capture origin was supplied; older binders can
// leave it zero and retain the former center-as-origin behavior.
uniform vec4 u_prd02ProbeOriginA;
uniform vec4 u_prd02ProbeOriginB;
uniform vec4 u_prd02ProbeWeights;   // x: A, y: B, z: global, w: probe mip count

// Parallax correction: intersect the ray (worldPos, R) with the probe box and
// return the direction from the probe center to the hit point.
vec3 a3d_boxProjectDirectionFromOrigin(vec3 worldPos, vec3 R, vec3 center, vec3 halfExtents, vec3 origin) {
  vec3 boxMin = center - halfExtents;
  vec3 boxMax = center + halfExtents;
  vec3 invR = 1.0 / max(abs(R), vec3(1e-6)) * sign(R + vec3(1e-12));
  vec3 tMax = (boxMax - worldPos) * invR;
  vec3 tMin = (boxMin - worldPos) * invR;
  vec3 tFar = max(tMax, tMin);
  float t = min(min(tFar.x, tFar.y), tFar.z);
  vec3 hit = worldPos + R * max(t, 0.0);
  return hit - origin;
}

vec3 a3d_boxProjectDirection(vec3 worldPos, vec3 R, vec3 center, vec3 halfExtents) {
  return a3d_boxProjectDirectionFromOrigin(worldPos, R, center, halfExtents, center);
}

// Blended probe specular radiance; the caller adds global * envRadiance.
vec3 a3d_probeSpecular(vec3 worldPos, vec3 R, float roughness) {
  float lod = roughness * max(u_prd02ProbeWeights.w - 1.0, 0.0);
  vec3 sum = vec3(0.0);
  if (u_prd02ProbeWeights.x > 0.0) {
    vec3 origin = u_prd02ProbeOriginA.w > 0.5 ? u_prd02ProbeOriginA.xyz : u_prd02ProbeCenterA.xyz;
    vec3 d = u_prd02ProbeCenterA.w > 0.5 ? a3d_boxProjectDirectionFromOrigin(worldPos, R, u_prd02ProbeCenterA.xyz, u_prd02ProbeHalfA.xyz, origin) : R;
    sum += u_prd02ProbeWeights.x * textureLod(u_prd02ProbeCubeA, d, lod).rgb;
  }
  if (u_prd02ProbeWeights.y > 0.0) {
    vec3 origin = u_prd02ProbeOriginB.w > 0.5 ? u_prd02ProbeOriginB.xyz : u_prd02ProbeCenterB.xyz;
    vec3 d = u_prd02ProbeCenterB.w > 0.5 ? a3d_boxProjectDirectionFromOrigin(worldPos, R, u_prd02ProbeCenterB.xyz, u_prd02ProbeHalfB.xyz, origin) : R;
    sum += u_prd02ProbeWeights.y * textureLod(u_prd02ProbeCubeB, d, lod).rgb;
  }
  return sum;
}

float a3d_probeGlobalWeight() { return u_prd02ProbeWeights.z; }
`;

export const PROBE_BOX_SHADER_CHUNK: ShaderChunk = {
  name: PROBE_BOX_CHUNK,
  owner: "prd02",
  stage: "fragment",
  glsl: PROBE_BOX_CHUNK_GLSL
};

type Vec3 = readonly [number, number, number];

/** CPU twin of `a3d_boxProjectDirection` (same math, same epsilons). */
export function boxProjectDirection(worldPos: Vec3, R: Vec3, center: Vec3, halfExtents: Vec3, origin: Vec3 = center): [number, number, number] {
  const tFar: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const r = R[i]!;
    const inv = (1 / Math.max(Math.abs(r), 1e-6)) * Math.sign(r + 1e-12);
    const tMax = (center[i]! + halfExtents[i]! - worldPos[i]!) * inv;
    const tMin = (center[i]! - halfExtents[i]! - worldPos[i]!) * inv;
    tFar.push(Math.max(tMax, tMin));
  }
  const t = Math.max(Math.min(tFar[0]!, tFar[1]!, tFar[2]!), 0);
  return [
    worldPos[0] + R[0] * t - origin[0],
    worldPos[1] + R[1] * t - origin[1],
    worldPos[2] + R[2] * t - origin[2]
  ];
}

export type ProbeUniformValue = Float32Array | number | { readonly texture: unknown } | null;

/**
 * Per-item chunk uniforms from a `ReflectionProbeSystem.assign` result. Cube
 * values are the probes' `specularCube` textures (bound by the consumer as
 * samplers); unbound slots get weight 0 and center.w = 0.
 */
export function prd02ProbeBindings(assignment: ProbeAssignment): Record<string, ProbeUniformValue> {
  const slot = (selection: ProbeAssignment["a"]) => {
    const box = selection?.spec.box;
    const center = box ? box.min.map((v, axis) => (v + box.max[axis]) / 2) : selection?.spec.position;
    const half = box ? box.min.map((v, axis) => (box.max[axis] - v) / 2) : selection?.spec.boxHalfExtents;
    return {
      cube: selection ? selection.probe.specularCube : null,
      center: new Float32Array(center ? [...center, selection?.spec.infinite ? 0 : 1] : [0, 0, 0, 0]),
      origin: new Float32Array(selection ? [...selection.spec.position, 1] : [0, 0, 0, 0]),
      half: new Float32Array(half ? [...half, 0] : [0, 0, 0, 0]),
      weight: selection ? selection.weight * (selection.spec.intensity ?? 1) : 0,
      mips: selection ? selection.probe.mipCount : 1
    };
  };
  const a = slot(assignment.a);
  const b = slot(assignment.b);
  return {
    u_prd02ProbeCubeA: a.cube ? { texture: a.cube } : null,
    u_prd02ProbeCubeB: b.cube ? { texture: b.cube } : null,
    u_prd02ProbeCenterA: a.center,
    u_prd02ProbeOriginA: a.origin,
    u_prd02ProbeHalfA: a.half,
    u_prd02ProbeCenterB: b.center,
    u_prd02ProbeOriginB: b.origin,
    u_prd02ProbeHalfB: b.half,
    u_prd02ProbeWeights: new Float32Array([a.weight, b.weight, assignment.globalWeight, Math.max(a.mips, b.mips)])
  };
}

/**
 * Face renderer the frame host provides (lane 01 Renderer probe-capture entry
 * point): render the scene for cube `face` with `viewProjection` into
 * `target` (an off-viewport-size rgba16f target). Must run outside
 * `Renderer.render`.
 */
export type Prd02ProbeFaceRenderer = ReflectionFaceRenderer;

/** Minimal surface of the probe system the driver needs. */
export interface Prd02ProbeCaptureSystem {
  update(): readonly string[];
}

/**
 * Pre-frame capture driver: advances dirty probe captures (whole cube for
 * once/on-demand, one face for every-n-frames) using `renderFace`, BEFORE the
 * frame's `Renderer.render`. Returns the probes that changed.
 */
export function prd02CaptureDirtyProbes(system: Prd02ProbeCaptureSystem): readonly string[] {
  return system.update();
}

export type { RenderDevice, RenderTarget };
