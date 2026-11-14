/**
 * WP-25 — Lamplight Line Multi-Material Procedural 3D Art Kit.
 *
 * Replaces all 14 static Meshy clay GLBs with sculpted multi-material geometry built
 * exclusively from `apps/showcase-port-shared/proceduralKernel.ts` and `@aura3d/engine`
 * 5.5.1 surface presets (with paired WGSL twins for `material.strata` and `material.lightBeam`).
 * Zero `three` imports.
 */
import {
  type AuraNodeBuilder,
  geometry,
  group,
  instances,
  material,
  primitives,
  type AuraCustomGeometrySpec,
  type AuraCustomMaterialSpec,
  type AuraMaterialSpec,
  type AuraPrimitiveNode,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }>;
import {
  archwayVoussoirSlots,
  articulatedFolkSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptHumanoidLimbMesh,
  sculptOrganicSdfMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  sminPoly,
  subdivideSmoothMesh,
  stratifiedCliffMesh,
  taubinSmoothMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import {
  WGSL_CLIP,
  WGSL_ENVIRONMENT_FOG,
  WGSL_INSTANCE_INPUTS,
  WGSL_MATH,
  WGSL_NOISE,
  wgslStage
} from "../../shared/wgsl-twins";
import { WGSL_A3D_LIGHTS, WGSL_A3D_SCENE, WGSL_A3D_SHADOW } from "../../shared/wgsl-author-lights";

export type RiderKind = "easy" | "sightseer" | "rushed" | "sleeper";

/** Standing floor height in streetcar-local space (matches `riderMotion.ts` seated posture). */
export const STREETCAR_FLOOR_Y = 0.8;

/** Strips preset `.name` so `scene.toJSON()` never emits duplicate `"name"` fields across nodes. */
export const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

/* ------------------------------------------------------------------ WGSL twins for strata & lightBeam */

const LIGHT_BEAM_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct BeamVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vNormal: vec3<f32>,
  @location(2) vBeamT: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> BeamVarying {
  var out: BeamVarying;
  let world = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.vWorld = world.xyz;
  out.vNormal = a3dMat3Mul(aura.u_modelMatrix, a_normal);
  out.vBeamT = clamp((0.5 * aura.u_beamLength - a_position.y) / max(aura.u_beamLength, 0.001), 0.0, 1.0);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`);

const LIGHT_BEAM_FRAGMENT_WGSL = wgslStage([WGSL_MATH, WGSL_NOISE], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vBeamT: f32) -> @location(0) vec4<f32> {
  let N = a3dSafeNormalize3(vNormal, vec3<f32>(0.0, 1.0, 0.0));
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 0.0, 1.0));
  let facing = clamp(abs(dot(N, V)), 0.0, 1.0);
  let edge = a3dPow(facing, aura.u_beamShape.y);
  let axial = a3dPow(1.0 - vBeamT, aura.u_beamShape.x) * smoothstep(0.0, 0.05, vBeamT);
  let q = vWorld / max(aura.u_beamNoise.y, 0.01) - vec3<f32>(0.0, aura.u_time * aura.u_beamNoise.z, 0.0);
  let dust = a3dFbm2(q.xz + vec2<f32>(q.y * 0.61), 3);
  let density = 1.0 + (dust - 0.5) * 2.0 * aura.u_beamNoise.x;
  let a = clamp(edge * axial * density * aura.u_beamIntensity * 0.8, 0.0, 1.0);
  return vec4<f32>(aura.u_beamColor * a, a);
}`);

const STRATA_INSTANCED_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct StrataVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vNormal: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, ${WGSL_INSTANCE_INPUTS}) -> StrataVarying {
  var out: StrataVarying;
  let inst = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let world = aura.u_modelMatrix * inst * vec4<f32>(a_position, 1.0);
  out.vWorld = world.xyz;
  out.vNormal = a3dMat3Mul(aura.u_modelMatrix, a3dMat3Mul(inst, a_normal));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`);

const STRATA_ENV_WGSL = /* wgsl */ `
fn strataHash11(x: f32) -> f32 {
  let p = fract(x * 0.1031);
  let q = p * (p + 33.33);
  return fract(q * (q + q));
}
fn strataEnvDiffuse(N: vec3<f32>) -> vec3<f32> {
  let hemiMean = 0.5 * (aura.u_a3dHemiSky + aura.u_a3dHemiGround);
  let ambient = max(aura.u_a3dEnvAmbient - hemiMean, vec3<f32>(0.0)) + a3dHemiLight(N);
  return ambient * 0.31830989;
}`;

function strataFragmentWgsl(paletteRgb: readonly V3[]): string {
  const n = paletteRgb.length;
  const branches = paletteRgb
    .slice(0, -1)
    .map((c, idx) => `  if (idx == ${idx}) { return vec3<f32>(${c[0].toFixed(5)}, ${c[1].toFixed(5)}, ${c[2].toFixed(5)}); }`)
    .join("\n");
  const last = paletteRgb[n - 1]!;
  return wgslStage([WGSL_A3D_SCENE, WGSL_A3D_SHADOW, WGSL_A3D_LIGHTS, WGSL_NOISE, WGSL_ENVIRONMENT_FOG, STRATA_ENV_WGSL], /* wgsl */ `
fn strataPalette(idx: i32) -> vec3<f32> {
${branches}
  return vec3<f32>(${last[0].toFixed(5)}, ${last[1].toFixed(5)}, ${last[2].toFixed(5)});
}
@fragment fn fs_main(@builtin(front_facing) frontFacing: bool, @builtin(position) fragCoord: vec4<f32>, @location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  var N = vNormal / max(length(vNormal), 1e-4);
  if (!frontFacing) { N = -N; }
  let V = (aura.u_cameraPosition - vWorld) / max(length(aura.u_cameraPosition - vWorld), 1e-4);
  let scale = max(aura.u_strataNoiseScale, 0.01);
  let q = vec3<f32>(vWorld.x, vWorld.y * 0.5, vWorld.z) / scale + aura.u_strataSeed;
  let warp = (a3dFbm2(q.xz + vec2<f32>(q.y * 0.73), 4) - 0.5) * 2.0;
  let grain = a3dFbm2(vec2<f32>(vWorld.x + vWorld.z * 0.4, vWorld.y * 3.0) / (scale * 0.18) + aura.u_strataSeed.xz, 3) - 0.5;
  let span = max(aura.u_strataRange.y - aura.u_strataRange.x, 0.001);
  let f = (vWorld.y - aura.u_strataRange.x) / span * aura.u_strataBands + warp * aura.u_strataNoise * 0.9;
  let layer = floor(f);
  let within = f - layer;
  let m = ((i32(layer) % ${n}) + ${n}) % ${n};
  var albedo = strataPalette(m);
  let jitter = strataHash11(layer * 7.13 + aura.u_strataSeed.x * 3.0) - 0.5;
  albedo = albedo * (1.0 + jitter * 2.0 * aura.u_strataVariation);
  let seamMask = smoothstep(0.0, 0.07, within) * (1.0 - smoothstep(0.93, 1.0, within));
  albedo = albedo * mix(1.0, 0.55 + 0.45 * seamMask, aura.u_strataSeam);
  albedo = albedo * (1.0 + grain * aura.u_strataNoise * 0.8);
  let slopeDeg = acos(clamp(N.y, -1.0, 1.0)) * 57.2957795;
  let flatMix = 1.0 - smoothstep(aura.u_strataSlope.x - aura.u_strataSlope.y * 0.5, aura.u_strataSlope.x + aura.u_strataSlope.y * 0.5, slopeDeg);
  let flatAlbedo = aura.u_strataFlatColor * (1.0 + grain * aura.u_strataNoise * 0.9);
  albedo = max(mix(albedo, flatAlbedo, flatMix), vec3<f32>(0.0));
  let lit = a3dDirect(N, V, albedo, aura.u_strataRoughness, vWorld) + albedo * strataEnvDiffuse(N);
  return vec4<f32>(a3dApplyEnvironmentFog(lit, vWorld, fragCoord.xy), 1.0);
}`);
}

/** `material.lightBeam(...)` paired with its WebGPU WGSL twin so `webgpuCustomShaderGap` stays `undefined`. */
export function lightBeamWithWgsl(options: Parameters<typeof material.lightBeam>[0]): AuraMaterialSpec {
  const base = unnamed(material.lightBeam(options));
  if (base.kind !== "custom" || !base.custom) return base;
  const custom: AuraCustomMaterialSpec = {
    ...base.custom,
    wgsl: { vertex: LIGHT_BEAM_VERTEX_WGSL, fragment: LIGHT_BEAM_FRAGMENT_WGSL }
  };
  return { ...base, custom };
}

/** Upgrades a node returned by `effects.volumetricBeam(...)` so its `lightBeam` material carries a WGSL twin. */
export function upgradeVolumetricBeamWgsl<T extends { toJSON(): unknown }>(node: T): T {
  const json = node.toJSON() as { material?: AuraMaterialSpec };
  if (json.material?.kind !== "custom" || !json.material.custom) return node;
  const Ctor = node.constructor as new (spec: unknown) => T;
  return new Ctor({
    ...json,
    material: {
      ...unnamed(json.material),
      custom: {
        ...json.material.custom,
        wgsl: { vertex: LIGHT_BEAM_VERTEX_WGSL, fragment: LIGHT_BEAM_FRAGMENT_WGSL }
      }
    }
  });
}

const srgbHexToLinear = (hex: string): V3 => {
  const v = parseInt(hex.slice(1), 16);
  const dec = (k: number): number => {
    const c = ((v >> k) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [dec(16), dec(8), dec(0)];
};

/** `material.strata(...)` paired with an instanced WebGPU WGSL twin for the basalt sky-island undercroft. */
export function strataUndercroftMaterial(): AuraMaterialSpec {
  const colors = ["#57525f", "#766d74", "#45424e", "#8d817f", "#3a3843"] as const;
  const base = unnamed(material.strata({
    bands: 14,
    colors,
    heightRange: [-195, 45],
    noise: 0.42,
    noiseScale: 14,
    seam: 0.34,
    variation: 0.2,
    slope: { angle: 44, blend: 14, flatColor: "#9a8b78" },
    roughness: 0.88
  }));
  if (base.kind !== "custom" || !base.custom) return base;
  const custom: AuraCustomMaterialSpec = {
    ...base.custom,
    castShadow: false,
    wgsl: { vertex: STRATA_INSTANCED_VERTEX_WGSL, fragment: strataFragmentWgsl(colors.map(srgbHexToLinear)) }
  };
  return { ...base, custom };
}

/* ------------------------------------------------------------------ 1. Classic European / Edwardian Interurban Tramcar */

/**
 * Smooth 16-point symmetric Edwardian tumblehome cross-section: curved lower rocker skirt sweeping outward
 * into a gentle coach belly swell before curving subtly inward (`tumblehome`) toward the waist belt rail.
 */
function edwardianTumblehomeRing(z: number, halfW: number, yBot: number, yTop: number, belly = 0.042): V3[] {
  const h = yTop - yBot;
  const profile: readonly [number, number][] = [
    [0.86, 0.0],
    [0.95, 0.08],
    [1.0 + belly / Math.max(0.4, halfW), 0.28],
    [1.0 + (belly * 0.88) / Math.max(0.4, halfW), 0.52],
    [1.0 + (belly * 0.42) / Math.max(0.4, halfW), 0.78],
    [0.992, 0.94],
    [0.978, 1.0]
  ];
  // Catmull-Rom densify (3 samples per span) so the belly swell reads as one continuous curve instead of 7 flat side bands.
  const dense: [number, number][] = [];
  for (let i = 0; i < profile.length - 1; i += 1) {
    const p0 = profile[Math.max(0, i - 1)]!, p1 = profile[i]!, p2 = profile[i + 1]!, p3 = profile[Math.min(profile.length - 1, i + 2)]!;
    for (let k = 0; k < 3; k += 1) {
      const t = k / 3, t2 = t * t, t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(profile[profile.length - 1]!);
  const ring: V3[] = [[-halfW * 0.55, yBot, z], [halfW * 0.55, yBot, z]];
  for (const [wf, yf] of dense) {
    ring.push([halfW * wf, yBot + h * yf, z]);
  }
  for (let i = dense.length - 1; i >= 0; i -= 1) {
    const [wf, yf] = dense[i]!;
    ring.push([-halfW * wf, yBot + h * yf, z]);
  }
  return ring;
}

function camberedRoofRing(z: number, halfW: number, yEave: number, crown: number): V3[] {
  return [
    [-halfW, yEave - 0.045, z],
    [halfW, yEave - 0.045, z],
    [halfW * 0.985, yEave + 0.025, z],
    [halfW * 0.88, yEave + crown * 0.36, z],
    [halfW * 0.68, yEave + crown * 0.68, z],
    [halfW * 0.38, yEave + crown * 0.91, z],
    [0, yEave + crown, z],
    [-halfW * 0.38, yEave + crown * 0.91, z],
    [-halfW * 0.68, yEave + crown * 0.68, z],
    [-halfW * 0.88, yEave + crown * 0.36, z],
    [-halfW * 0.985, yEave + 0.025, z]
  ];
}

let cachedStreetcarSlots: readonly MultiMatSlot[] | null = null;
let cachedStreetcarCompactSpecs: CompactSlotSpecs | null = null;
let cachedTramCoachTrimParts: {
  readonly lacquer: RawMesh;
  readonly brass: RawMesh;
  readonly glow: RawMesh;
  readonly glass: RawMesh;
} | null = null;

function streetcarSlots(): readonly MultiMatSlot[] {
  if (cachedStreetcarSlots) return cachedStreetcarSlots;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };
  const boxPart = (wx: number, wy: number, wz: number, pos: V3, rot?: V3): RawMesh => {
    const hx = wx * 0.5, hy = wy * 0.5, hz = wz * 0.5;
    const ring = (y: number): V3[] => [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]];
    return transformMesh(toFlatShaded(loftSectionsMesh([ring(-hy), ring(hy)], true, true)), rot ? { pos, rot } : { pos });
  };
  const smoothHullStations = (maxZ: number, fullW: number, endW: number): [number, number][] => {
    // Dense stations clustered toward the rounded cab ends (sin-eased), so the plan-view end bowl is G1-smooth with no vertical crease bands.
    const out: [number, number][] = [];
    const endCurves: number[] = [-1];
    const END_SAMPLES = 12;
    for (let k = 1; k <= END_SAMPLES; k += 1) endCurves.push(-1 + 0.36 * (1 - Math.cos((k / END_SAMPLES) * Math.PI * 0.5)));
    for (const u of [-0.45, -0.2, 0, 0.2, 0.45]) endCurves.push(u);
    for (let k = END_SAMPLES; k >= 1; k -= 1) endCurves.push(1 - 0.36 * (1 - Math.cos((k / END_SAMPLES) * Math.PI * 0.5)));
    endCurves.push(1);
    endCurves.sort((a, b) => a - b);
    for (const u of endCurves) {
      const z = u * maxZ;
      const au = Math.abs(u);
      let hw = fullW;
      if (au > 0.64) {
        const t = (au - 0.64) / 0.36;
        const curve = Math.sqrt(Math.max(0.06, 1 - t * t * 0.86));
        hw = endW + (fullW - endW) * curve;
      } else {
        // Smooth (zero-slope at 0.64) mid-car swell replaces the old linear ramp kink.
        const m = au / 0.64;
        hw = fullW + 0.012 * (0.5 + 0.5 * Math.cos(m * Math.PI));
      }
      out.push([z, hw]);
    }
    return out;
  };

  // Slot 4: Full-length cast-iron chassis underframe solebars, truss rods & underfloor air reservoirs
  push(4, boxPart(2.66, 0.16, 9.68, [0, 0.74, 0]));
  push(4, boxPart(1.18, 0.24, 1.52, [0, 0.62, 0]));
  for (const side of [-1, 1] as const) {
    push(4, transformMesh(latheMesh([[0, -0.58], [0.16, -0.54], [0.17, 0.54], [0, 0.58]], 12), {
      pos: [side * 0.72, 0.62, side * 0.85],
      rot: [Math.PI * 0.5, 0, 0]
    }));
    push(4, tubeSweepMesh([
      [side * 1.24, 0.72, -2.45, 0.018],
      [side * 1.24, 0.52, -0.95, 0.018],
      [side * 1.24, 0.52, 0.95, 0.018],
      [side * 1.24, 0.72, 2.45, 0.018]
    ], 5));
  }

  // Slot 0: Smooth-shaded curved tumblehome crimson/burgundy lacquered lower coach body (`#b8292f`, `flatShaded = false`)
  const waistStations = smoothHullStations(5.02, 1.44, 0.62);
  push(0, loftSectionsMesh(
    waistStations.map(([z, hw]) => edwardianTumblehomeRing(z, hw, 0.8, 1.84, 0.048)),
    true,
    false
  ));
  for (const sgn of [-1, 1] as const) {
    push(0, transformMesh(bevelBoxMesh(1.78, 0.2, 0.16, 0.03), { pos: [0, 0.74, sgn * 4.94] }));
  }

  // Slot 1: Heritage cream (`#f5ebd6`) waist-band (`y = 1.84..2.04`) & continuous rounded Edwardian letterboard (`y = 3.08..3.42`)
  const creamWaistStations = smoothHullStations(5.03, 1.448, 0.63);
  push(1, loftSectionsMesh(
    creamWaistStations.map(([z, hw]) => edwardianTumblehomeRing(z, hw, 1.835, 2.045, 0.016)),
    true,
    false
  ));
  const letterboardStations = smoothHullStations(4.97, 1.425, 0.61);
  push(1, loftSectionsMesh(
    letterboardStations.map(([z, hw]) => edwardianTumblehomeRing(z, hw, 3.08, 3.42, 0.014)),
    true,
    false
  ));

  // Side cream structural piers + mahogany inner casings separating the 5 enclosed saloon window bays (`z = -3.10..+3.10`)
  const saloonPierZ = [-3.1, -1.86, -0.62, 0.62, 1.86, 3.1];
  for (const side of [-1, 1] as const) {
    for (const pz of saloonPierZ) {
      push(1, transformMesh(bevelBoxMesh(0.11, 1.1, 0.21, 0.022), { pos: [side * 1.42, 2.56, pz] }));
      push(3, boxPart(0.08, 1.08, 0.24, [side * 1.375, 2.56, pz]));
    }
    for (const cabCornerZ of [-4.08, 4.08]) {
      push(1, transformMesh(bevelBoxMesh(0.13, 1.1, 0.26, 0.026), { pos: [side * 1.39, 2.56, cabCornerZ] }));
      push(3, boxPart(0.09, 1.08, 0.28, [side * 1.34, 2.56, cabCornerZ]));
    }
  }

  // Enclosed recessed bi-fold vestibule doors at `z = ±3.59` with mahogany sash leaves, crimson lower panels, glazed upper lights & brass grab rails
  for (const side of [-1, 1] as const) {
    for (const doorZ of [-3.59, 3.59]) {
      push(1, transformMesh(bevelBoxMesh(0.12, 0.14, 0.88, 0.018), { pos: [side * 1.405, 3.04, doorZ] }));
      for (const leafOff of [-0.19, 0.19]) {
        const lz = doorZ + leafOff;
        push(3, transformMesh(bevelBoxMesh(0.06, 2.14, 0.36, 0.012), { pos: [side * 1.365, 1.93, lz] }));
        push(0, transformMesh(bevelBoxMesh(0.066, 0.86, 0.28, 0.01), { pos: [side * 1.372, 1.35, lz] }));
        push(8, boxPart(0.036, 0.86, 0.25, [side * 1.375, 2.48, lz]));
        push(6, boxPart(0.072, 0.032, 0.28, [side * 1.38, 2.02, lz]));
      }
      push(4, boxPart(0.24, 0.05, 0.84, [side * 1.42, 0.64, doorZ]));
      push(4, boxPart(0.26, 0.05, 0.84, [side * 1.48, 0.44, doorZ]));
      push(4, boxPart(0.05, 0.42, 0.86, [side * 1.31, 0.62, doorZ]));
      for (const gz of [doorZ - 0.44, doorZ + 0.44]) {
        push(6, tubeSweepMesh([
          [side * 1.45, 0.86, gz, 0.022],
          [side * 1.51, 1.48, gz, 0.022],
          [side * 1.51, 2.28, gz, 0.022],
          [side * 1.44, 2.54, gz, 0.022]
        ], 6));
      }
    }
  }

  // Enclosed Rounded 3-Window Edwardian Motorman Cab Ends (`sgn = +1` front, `-1` rear)
  for (const sgn of [-1, 1] as const) {
    push(3, boxPart(2.44, 0.96, 0.1, [0, 1.52, sgn * 4.18]));
    for (const bx of [-0.88, 0, 0.88]) {
      push(3, boxPart(0.14, 1.22, 0.1, [bx, 2.58, sgn * 4.18]));
    }
    push(3, boxPart(2.14, 0.14, 0.44, [0, 1.98, sgn * 4.58]));
    push(6, transformMesh(latheMesh([[0, 0], [0.11, 0], [0.1, 0.68], [0.14, 0.72], [0, 0.74]], 10), {
      pos: [-0.32 * sgn, 1.98, sgn * 4.58]
    }));

    push(8, boxPart(0.98, 1.02, 0.036, [0, 2.56, sgn * 4.92]));
    push(3, boxPart(1.04, 0.06, 0.065, [0, 3.05, sgn * 4.91]));
    push(3, boxPart(1.02, 0.045, 0.06, [0, 2.84, sgn * 4.915]));
    push(6, boxPart(1.06, 0.042, 0.058, [0, 3.07, sgn * 4.93]));
    push(6, boxPart(1.06, 0.045, 0.06, [0, 2.04, sgn * 4.94]));

    for (const side of [-1, 1] as const) {
      push(1, transformMesh(bevelBoxMesh(0.1, 1.08, 0.12, 0.02), { pos: [side * 0.53, 2.56, sgn * 4.89] }));
      push(3, boxPart(0.075, 1.06, 0.09, [side * 0.52, 2.56, sgn * 4.87]));
      push(6, boxPart(0.044, 1.06, 0.06, [side * 0.525, 2.56, sgn * 4.94]));
      push(1, transformMesh(bevelBoxMesh(0.115, 1.08, 0.15, 0.022), {
        pos: [side * 1.18, 2.56, sgn * 4.52],
        rot: [0, side * sgn * 0.48, 0]
      }));
      const paneYaw = side * sgn * 0.48;
      push(8, boxPart(0.72, 1.02, 0.036, [side * 0.87, 2.56, sgn * 4.73], [0, paneYaw, 0]));
      push(3, boxPart(0.74, 0.045, 0.058, [side * 0.87, 2.84, sgn * 4.725], [0, paneYaw, 0]));
      push(6, boxPart(0.74, 0.042, 0.055, [side * 0.87, 3.06, sgn * 4.74], [0, paneYaw, 0]));
      push(6, boxPart(0.74, 0.045, 0.058, [side * 0.87, 2.04, sgn * 4.75], [0, paneYaw, 0]));
      const qYaw = side * sgn * 0.22;
      push(8, boxPart(0.036, 1.02, 0.48, [side * 1.3, 2.56, sgn * 4.31], [0, -qYaw, 0]));
      push(3, boxPart(0.058, 0.045, 0.48, [side * 1.29, 2.84, sgn * 4.31], [0, -qYaw, 0]));
    }

    if (sgn > 0) {
      push(6, transformMesh(latheMesh([[0, 0], [0.032, 0], [0.026, 0.04], [0, 0.045]], 8), {
        pos: [-0.18, 3.04, 4.95],
        rot: [Math.PI * 0.5, 0, 0]
      }));
      push(4, tubeSweepMesh([[-0.18, 3.03, 4.96, 0.01], [0.06, 2.58, 4.965, 0.009]], 5));
      push(7, boxPart(0.018, 0.54, 0.018, [0.05, 2.58, 4.97], [0, 0, -0.22]));
    }

    push(4, transformMesh(bevelBoxMesh(1.74, 0.36, 0.26, 0.032), { pos: [0, 3.55, sgn * 4.76] }));
    push(6, transformMesh(bevelBoxMesh(1.66, 0.3, 0.06, 0.016), { pos: [0, 3.55, sgn * 4.87] }));
    push(9, boxPart(1.52, 0.22, 0.03, [0, 3.55, sgn * 4.895]));
    push(4, boxPart(0.022, 0.2, 0.018, [-0.26 * sgn, 3.55, sgn * 4.912]));
    for (const [bx, bw, bh, by] of [
      [-0.56, 0.024, 0.11, 3.55],
      [-0.52, 0.08, 0.024, 3.505],
      [-0.43, 0.024, 0.11, 3.55],
      [-0.39, 0.08, 0.024, 3.505],
      [0.08, 0.52, 0.038, 3.575],
      [0.24, 0.76, 0.026, 3.515]
    ] as const) {
      push(4, boxPart(bw, bh, 0.016, [bx * sgn, by, sgn * 4.912]));
    }
  }

  // Slot 2 & 6: Fine Spun-Brass Pinstripe Belt Moldings (`y = 0.96`, `y = 1.83`, `y = 2.045`) & Harbor-Teal Eave Frieze (`y = 3.40`)
  const beltLoop = (y: number, radius: number, rxScale: number, rzScale: number): RawMesh => {
    const pts: V4[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const sx = Math.cos(a), sz = Math.sin(a);
      const rx = rxScale * Math.sign(sx) * Math.pow(Math.abs(sx), 0.48);
      const rz = rzScale * Math.sign(sz) * Math.pow(Math.abs(sz), 0.7);
      pts.push([rx, y, rz, radius]);
    }
    return tubeSweepMesh(pts, 6, false);
  };
  push(6, beltLoop(2.045, 0.028, 1.465, 5.04));
  push(6, beltLoop(1.832, 0.02, 1.472, 5.035));
  push(6, beltLoop(0.96, 0.018, 1.455, 5.0));
  push(2, beltLoop(3.4, 0.03, 1.44, 4.975));

  // Slot 8, 3 & 6: Five Enclosed Glazed Saloon Windows per side (`z = -2.48, -1.24, 0, 1.24, 2.48`)
  for (const side of [-1, 1] as const) {
    push(6, boxPart(0.075, 0.04, 6.38, [side * 1.44, 2.045, 0]));
    for (let b = 0; b < saloonPierZ.length - 1; b += 1) {
      const midZ = (saloonPierZ[b]! + saloonPierZ[b + 1]!) * 0.5;
      push(8, boxPart(0.034, 1.04, 1.08, [side * 1.4, 2.56, midZ]));
      push(3, boxPart(0.062, 0.048, 1.06, [side * 1.39, 2.84, midZ]));
      push(3, boxPart(0.062, 0.048, 1.06, [side * 1.39, 2.06, midZ]));
      push(3, boxPart(0.065, 1.04, 0.055, [side * 1.388, 2.56, midZ - 0.505]));
      push(3, boxPart(0.065, 1.04, 0.055, [side * 1.388, 2.56, midZ + 0.505]));
      push(3, tubeSweepMesh([
        [side * 1.395, 2.86, midZ - 0.49, 0.028],
        [side * 1.398, 3.03, midZ - 0.24, 0.026],
        [side * 1.4, 3.065, midZ, 0.026],
        [side * 1.398, 3.03, midZ + 0.24, 0.026],
        [side * 1.395, 2.86, midZ + 0.49, 0.028]
      ], 5));
      push(6, boxPart(0.048, 0.22, 0.026, [side * 1.415, 2.95, midZ]));
      push(6, tubeSweepMesh([
        [side * 1.36, 2.24, midZ - 0.5, 0.012],
        [side * 1.36, 2.24, midZ + 0.5, 0.012]
      ], 5));
    }
  }

  // Slot 3, 4 & 6: Warm Mahogany Saloon Floor, Slatted Edwardian Benches, Brass Stanchions & Ceiling Hand-Rail Straps
  push(4, boxPart(2.64, 0.065, 8.2, [0, 3.36, 0]));
  push(3, boxPart(2.72, 0.08, 8.6, [0, STREETCAR_FLOOR_Y, 0]));
  for (const side of [-1, 1] as const) {
    push(3, transformMesh(bevelBoxMesh(0.62, 0.11, 6.24, 0.022), { pos: [side * 1.0, 1.3, 0] }));
    push(3, transformMesh(bevelBoxMesh(0.09, 0.56, 6.24, 0.02), { pos: [side * 1.28, 1.62, 0] }));
    for (const legZ of [-2.8, -1.4, 0, 1.4, 2.8]) {
      push(4, boxPart(0.48, 0.44, 0.065, [side * 1.0, 1.04, legZ]));
    }
    push(6, tubeSweepMesh([[side * 0.56, 3.18, -3.0, 0.016], [side * 0.56, 3.18, 3.0, 0.016]], 5));
  }

  // Slot 12, 1, 8, 3, 4 & 11: Smooth Cambered Canvas-Grey Roof (`#48505a`), Raised Clerestory Monitor & Articulated Diamond Pantograph
  const roofStations = smoothHullStations(5.01, 1.485, 0.66);
  push(12, loftSectionsMesh(
    roofStations.map(([z, hw]) => camberedRoofRing(z, hw, 3.42, 0.18 + (hw / 1.485) * 0.16)),
    true,
    false
  ));
  const monitorStations: readonly [number, number][] = [
    [-3.72, 0.68], [-3.42, 0.9], [-3.05, 0.95], [0, 0.96], [3.05, 0.95], [3.42, 0.9], [3.72, 0.68]
  ];
  push(1, loftSectionsMesh(
    monitorStations.map(([z, hw]) => edwardianTumblehomeRing(z, hw, 3.68, 4.09, 0.01)),
    true,
    false
  ));
  for (const side of [-1, 1] as const) {
    push(8, boxPart(0.032, 0.23, 6.12, [side * 0.95, 3.9, 0]));
    push(3, boxPart(0.055, 0.045, 6.18, [side * 0.955, 4.03, 0]));
    push(3, boxPart(0.055, 0.045, 6.18, [side * 0.955, 3.77, 0]));
    for (let v = -3; v <= 3; v += 1) {
      push(6, boxPart(0.05, 0.25, 0.042, [side * 0.96, 3.9, v * 0.98]));
    }
  }
  push(12, loftSectionsMesh(
    monitorStations.map(([z, hw]) => camberedRoofRing(z * 1.02, hw + 0.06, 4.08, 0.17)),
    true,
    false
  ));
  for (const x of [-0.32, 0, 0.32]) {
    push(3, boxPart(0.13, 0.035, 6.2, [x, 4.28, 0]));
  }
  for (const gx of [-0.46, 0.46]) {
    push(4, boxPart(0.36, 0.18, 1.28, [gx, 4.36, 1.62]));
    for (let fin = -2; fin <= 2; fin += 1) {
      push(5, boxPart(0.38, 0.2, 0.03, [gx, 4.37, 1.62 + fin * 0.26]));
    }
  }

  // Crisp Articulated Diamond Pantograph Overhead Collector (`panZ = -1.25`, reaching `y = 6.68` onto `y = 6.70` catenary wire)
  const panZ = -1.25;
  for (const [ix, iz] of [[-0.44, panZ - 0.36], [0.44, panZ - 0.36], [-0.44, panZ + 0.36], [0.44, panZ + 0.36]] as const) {
    push(11, transformMesh(latheMesh([[0, 0], [0.068, 0], [0.052, 0.06], [0.072, 0.11], [0.045, 0.17], [0, 0.18]], 10), { pos: [ix, 4.26, iz] }));
  }
  push(4, transformMesh(bevelBoxMesh(1.04, 0.055, 0.86, 0.012), { pos: [0, 4.44, panZ] }));
  for (const sx of [-0.24, 0.24]) {
    push(6, transformMesh(latheMesh([[0, -0.28], [0.045, -0.28], [0.045, 0.28], [0, 0.28]], 10), {
      pos: [sx, 4.5, panZ],
      rot: [Math.PI * 0.5, 0, 0]
    }));
  }
  for (const sx of [-0.38, 0.38]) {
    for (const dirZ of [-1, 1] as const) {
      const elbowX = sx * 0.96, elbowY = 5.56, elbowZ = panZ + dirZ * 0.88;
      const apexX = sx * 0.86, apexY = 6.62, apexZ = panZ + dirZ * 0.08;
      push(4, tubeSweepMesh([[sx, 4.48, panZ + dirZ * 0.16, 0.024], [elbowX, elbowY, elbowZ, 0.022]], 6));
      push(4, tubeSweepMesh([[elbowX, elbowY, elbowZ, 0.02], [apexX, apexY, apexZ, 0.018]], 6));
    }
  }
  for (const dirZ of [-1, 1] as const) {
    const elbowZ = panZ + dirZ * 0.88;
    push(4, tubeSweepMesh([[-0.36, 5.56, elbowZ, 0.018], [0.36, 5.56, elbowZ, 0.018]], 6));
    push(4, tubeSweepMesh([[-0.38, 4.48, panZ + dirZ * 0.16, 0.013], [0.36, 5.56, elbowZ, 0.013]], 5));
  }
  for (const panOff of [-0.1, 0.1]) {
    push(6, tubeSweepMesh([
      [-0.96, 6.58, panZ + panOff, 0.016],
      [-0.7, 6.68, panZ + panOff, 0.024],
      [0.7, 6.68, panZ + panOff, 0.024],
      [0.96, 6.58, panZ + panOff, 0.016]
    ], 7));
  }

  // Slot 4, 5 & 6: Dark Cast-Iron Twin 4-Wheel Equalizer Bogie Trucks, Leaf/Coil Springs & Flanged Steel Wheels (`minY <= 0.08`)
  const wheelY = 0.43;
  const wheelWebProfile: V2[] = [
    [0, -0.075], [0.115, -0.075], [0.125, -0.045], [0.295, -0.038], [0.318, -0.055],
    [0.318, 0.055], [0.295, 0.038], [0.125, 0.045], [0.115, 0.082], [0, 0.082]
  ];
  const wheelTireFlangeProfile: V2[] = [
    [0.312, -0.072], [0.395, -0.072], [0.395, -0.048], [0.36, -0.036],
    [0.36, 0.062], [0.312, 0.062], [0.312, -0.072]
  ];
  for (const bogieZ of [-3.15, 3.15]) {
    push(4, boxPart(1.94, 0.22, 0.44, [0, 0.58, bogieZ]));
    for (const side of [-1, 1] as const) {
      push(4, transformMesh(bevelBoxMesh(0.115, 0.21, 2.02, 0.018), { pos: [side * 0.89, 0.5, bogieZ] }));
      push(4, tubeSweepMesh([
        [side * 0.89, 0.36, bogieZ - 0.78, 0.036],
        [side * 0.89, 0.29, bogieZ, 0.04],
        [side * 0.89, 0.36, bogieZ + 0.78, 0.036]
      ], 6));
      push(4, tubeSweepMesh([
        [side * 0.91, 0.44, bogieZ - 0.34, 0.026],
        [side * 0.91, 0.39, bogieZ, 0.036],
        [side * 0.91, 0.44, bogieZ + 0.34, 0.026]
      ], 6));
      for (const spOff of [-0.21, 0.21]) {
        push(4, transformMesh(latheMesh([
          [0, 0], [0.095, 0], [0.108, 0.05], [0.086, 0.11], [0.108, 0.17], [0, 0.22]
        ], 10), { pos: [side * 0.89, 0.44, bogieZ + spOff] }));
      }
    }
    for (const dz of [-0.62, 0.62]) {
      const az = bogieZ + dz;
      push(4, tubeSweepMesh([[-0.92, wheelY, az, 0.062], [0.92, wheelY, az, 0.062]], 7));
      for (const side of [-1, 1] as const) {
        push(4, transformMesh(bevelBoxMesh(0.15, 0.26, 0.26, 0.018), { pos: [side * 0.9, wheelY + 0.02, az] }));
        push(6, transformMesh(bevelBoxMesh(0.042, 0.15, 0.16, 0.01), { pos: [side * 0.975, wheelY, az] }));
        const shoeZ = az + (dz > 0 ? 0.38 : -0.38);
        push(4, boxPart(0.11, 0.24, 0.07, [side * 0.72, wheelY + 0.02, shoeZ], [dz > 0 ? 0.18 : -0.18, 0, 0]));
        const wheelRot: V3 = [0, 0, side < 0 ? -Math.PI * 0.5 : Math.PI * 0.5];
        push(4, transformMesh(latheMesh(wheelWebProfile, 28), { pos: [side * 0.72, wheelY, az], rot: wheelRot }));
        push(5, transformMesh(latheMesh(wheelTireFlangeProfile, 28), { pos: [side * 0.72, wheelY, az], rot: wheelRot }));
      }
    }
  }

  // Dark cast-iron couplers (`z = ±5.24`) + front wrought-iron slatted V-prow cowcatcher fender (`+Z`)
  for (const sgn of [-1, 1] as const) {
    push(4, boxPart(0.22, 0.16, 0.34, [0, 0.64, sgn * 5.08]));
    push(4, boxPart(0.3, 0.22, 0.22, [0, 0.64, sgn * 5.24]));
    if (sgn > 0) {
      push(4, tubeSweepMesh([[-1.16, 0.19, 4.86, 0.036], [-0.58, 0.17, 5.1, 0.038], [0, 0.15, 5.28, 0.04], [0.58, 0.17, 5.1, 0.038], [1.16, 0.19, 4.86, 0.036]], 6));
      push(4, tubeSweepMesh([[-1.08, 0.58, 4.84, 0.028], [0, 0.56, 5.1, 0.032], [1.08, 0.58, 4.84, 0.028]], 6));
      for (let k = -3; k <= 3; k += 1) {
        const x = k * 0.32;
        const zBot = 5.26 - Math.abs(k) * 0.11;
        const zTop = 5.08 - Math.abs(k) * 0.065;
        push(4, tubeSweepMesh([[x * 0.94, 0.57, zTop, 0.02], [x, 0.17, zBot, 0.02]], 5));
      }
    }
  }

  // Slot 6, 7, 9 & 10: Prominent Spun-Brass Central Headlamp (+Z), Rear Brass-Rimmed Herald Drum (-Z) & Twin Marker/Ruby Tail Lamps
  for (const sgn of [-1, 1] as const) {
    if (sgn > 0) {
      push(4, tubeSweepMesh([[0, 1.16, 4.96, 0.03], [0, 1.28, 5.04, 0.028], [0, 1.42, 5.0, 0.03]], 6));
      push(6, transformMesh(latheMesh([[0, -0.16], [0.25, -0.15], [0.28, 0.04], [0.3, 0.13], [0.22, 0.15], [0.21, 0.04]], 20), {
        pos: [0, 1.42, 5.03],
        rot: [Math.PI * 0.5, 0, 0]
      }));
      push(9, transformMesh(latheMesh([[0, 0], [0.2, 0.02], [0.18, 0.075], [0, 0.095]], 16), {
        pos: [0, 1.42, 5.075],
        rot: [Math.PI * 0.5, 0, 0]
      }));
    } else {
      push(6, transformMesh(latheMesh([[0, 0], [0.27, 0], [0.29, 0.045], [0.25, 0.06], [0, 0.06]], 20), {
        pos: [0, 1.42, -4.94],
        rot: [-Math.PI * 0.5, 0, 0]
      }));
      push(2, transformMesh(latheMesh([[0, 0], [0.22, 0.01], [0.21, 0.035], [0, 0.04]], 18), {
        pos: [0, 1.42, -4.975],
        rot: [-Math.PI * 0.5, 0, 0]
      }));
      push(6, boxPart(0.32, 0.045, 0.025, [0, 1.42, -5.015]));
      push(10, boxPart(0.28, 0.07, 0.035, [0, 3.18, -4.95]));
    }
    for (const x of [-0.88, 0.88]) {
      push(6, transformMesh(latheMesh([[0, -0.06], [0.13, -0.06], [0.15, 0.06], [0.1, 0.07]], 14), {
        pos: [x, 1.38, sgn * 4.9],
        rot: [sgn > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0, 0]
      }));
      push(sgn > 0 ? 9 : 10, transformMesh(latheMesh([[0, 0], [0.095, 0.02], [0.085, 0.05], [0, 0.06]], 12), {
        pos: [x, 1.38, sgn * 4.94],
        rot: [sgn > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0, 0]
      }));
    }
    push(6, tubeSweepMesh([[-1.2, 0.78, sgn * 4.88, 0.062], [0, 0.78, sgn * 5.08, 0.07], [1.2, 0.78, sgn * 4.88, 0.062]], 8));
    for (const bx of [-0.74, 0.74]) {
      push(7, transformMesh(latheMesh([[0, 0], [0.11, 0], [0.12, 0.09], [0.09, 0.12], [0, 0.12]], 10), {
        pos: [bx, 0.78, sgn * 5.0],
        rot: [sgn > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0, 0]
      }));
    }
  }
  push(6, transformMesh(latheMesh([[0.17, 0], [0.135, 0.05], [0.115, 0.16], [0.065, 0.22], [0, 0.24]], 14), { pos: [0, 4.28, 3.35] }));

  // Slot 9: Warm 2700K interior milk-glass saloon dome lamps & sill glow accents softly visible through translucent side windows
  for (const lz of [-2.48, 0, 2.48]) {
    push(9, transformMesh(latheMesh([[0, 0], [0.14, 0.04], [0.17, 0.12], [0.1, 0.2], [0, 0.22]], 12), { pos: [0, 3.68, lz] }));
  }
  for (const side of [-1, 1] as const) {
    push(9, transformMesh(bevelBoxMesh(0.04, 0.05, 5.8, 0.008), { pos: [side * 1.22, 1.9, 0] }));
    push(9, transformMesh(bevelBoxMesh(0.034, 0.07, 5.8, 0.008), { pos: [side * 0.84, 3.88, 0] }));
  }

  cachedStreetcarSlots = slots;
  return slots;
}

const STREETCAR_SHADOW_SLOTS = new Set<number>([0, 1, 4, 12]);

export function buildStreetcarBodyNode(name: string, bulbIntensity: number, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  const glowGain = Math.min(1.5, Math.max(0.5, bulbIntensity * 0.64));
  const materials: AuraMaterialSpec[] = [
    unnamed(material.carPaint({ color: "#b8292f", roughness: 0.22, clearcoat: 0.88, clearcoatRoughness: 0.07, envMapIntensity: 0.82 })),
    unnamed(material.lacquer({ color: "#f5ebd6", roughness: 0.28, clearcoat: 0.78, clearcoatRoughness: 0.08, envMapIntensity: 0.76 })),
    unnamed(material.lacquer({ color: "#24586c", roughness: 0.24, clearcoat: 0.82, clearcoatRoughness: 0.07, envMapIntensity: 0.8 })),
    unnamed(material.pbr({ color: "#684128", roughness: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.28 })),
    unnamed(material.studioMetal({ color: "#232932", roughness: 0.42, metallic: 0.86, envMapIntensity: 0.85 })),
    unnamed(material.studioMetal({ color: "#d8e2ec", roughness: 0.18, metallic: 0.95, envMapIntensity: 1.15 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.21, metallic: 0.93, envMapIntensity: 1.05 })),
    unnamed(material.blackRubber({ color: "#1d2025", roughness: 0.84 })),
    unnamed(material.physical({
      color: "#1c2d3e",
      roughness: 0.06,
      opacity: 0.54,
      clearcoat: 0.92,
      clearcoatRoughness: 0.05,
      ior: 1.5,
      envMapIntensity: 0.85
    })),
    unnamed(material.emissive({ color: "#ffe5b6", emissive: "#ffc26e", emissiveIntensity: glowGain, practical: true })),
    unnamed(material.emissive({ color: "#ff5644", emissive: "#ff3b28", emissiveIntensity: Math.max(0.8, bulbIntensity * 0.92), practical: true })),
    unnamed(material.ceramic({ color: "#f2ede2", roughness: 0.24 })),
    unnamed(material.pbr({ color: "#48505a", roughness: 0.64, metallic: 0.16, clearcoat: 0.14, clearcoatRoughness: 0.38 }))
  ];
  if (!cachedStreetcarCompactSpecs) {
    cachedStreetcarCompactSpecs = buildCompactSlotSpecs(streetcarSlots());
  }
  const children = cachedStreetcarCompactSpecs.map((slot) =>
    geometry.custom(slot.geometry, {
      name: `${name} material ${slot.materialIndex}`,
      material: materials[slot.materialIndex]!,
      castShadow: castShadow && STREETCAR_SHADOW_SLOTS.has(slot.materialIndex),
      receiveShadow: true
    })
  );
  return group(name, children).runtime({ id: name });
}

/** Sculpted curved trim meshes for `TRAM_FX_IDS` (`tramCoachTrim` in `world.ts`). */
export function buildTramCoachTrimRawParts(): {
  readonly lacquer: RawMesh;
  readonly brass: RawMesh;
  readonly glow: RawMesh;
  readonly glass: RawMesh;
} {
  if (cachedTramCoachTrimParts) return cachedTramCoachTrimParts;
  const lacquerParts: RawMesh[] = [];
  const brassParts: RawMesh[] = [];
  const glowParts: RawMesh[] = [];
  const glassParts: RawMesh[] = [];
  for (const sgn of [-1, 1] as const) {
    lacquerParts.push(tubeSweepMesh([[sgn * 1.46, 0.86, -4.1, 0.034], [sgn * 1.47, 0.86, 0, 0.038], [sgn * 1.46, 0.86, 4.1, 0.034]], 6));
    brassParts.push(tubeSweepMesh([[sgn * 1.47, 2.045, -4.15, 0.024], [sgn * 1.48, 2.045, 0, 0.026], [sgn * 1.47, 2.045, 4.15, 0.024]], 6));
    brassParts.push(tubeSweepMesh([[sgn * 1.475, 1.832, -4.12, 0.018], [sgn * 1.485, 1.832, 0, 0.02], [sgn * 1.475, 1.832, 4.12, 0.018]], 6));
    for (let r = -3; r <= 3; r += 1) {
      brassParts.push(transformMesh(latheMesh([[0, 0], [0.02, 0.01], [0.015, 0.026], [0, 0.03]], 8), {
        pos: [sgn * 1.485, 1.94, r * 1.02],
        rot: [0, 0, -sgn * Math.PI * 0.5]
      }));
    }
    glassParts.push(transformMesh(bevelBoxMesh(0.022, 0.21, 6.0, 0.004), { pos: [sgn * 0.96, 3.9, 0] }));
    glowParts.push(transformMesh(bevelBoxMesh(0.03, 0.055, 5.7, 0.008), { pos: [sgn * 0.84, 3.88, 0] }));
  }
  for (const z of [4.895, -4.895]) {
    brassParts.push(tubeSweepMesh([[-1.18, 0.78, z * 0.99, 0.055], [0, 0.78, z * 1.035, 0.065], [1.18, 0.78, z * 0.99, 0.055]], 7));
    glowParts.push(transformMesh(bevelBoxMesh(1.48, 0.2, 0.03, 0.006), { pos: [0, 3.55, z] }));
  }
  const join = (list: readonly RawMesh[]): RawMesh => {
    const spec = mergeRawMeshes(list);
    return {
      positions: Array.from(spec.positions as Float32Array),
      normals: Array.from((spec.normals ?? new Float32Array(spec.positions.length)) as Float32Array),
      uvs: Array.from((spec.uvs ?? new Float32Array((spec.positions.length / 3) * 2)) as Float32Array),
      indices: Array.from(spec.indices as Uint16Array | Uint32Array)
    };
  };
  cachedTramCoachTrimParts = {
    lacquer: join(lacquerParts),
    brass: join(brassParts),
    glow: join(glowParts),
    glass: join(glassParts)
  };
  return cachedTramCoachTrimParts;
}

/* ------------------------------------------------------------------ Per-slot compact multi-material helper */

type CompactSlotSpecs = readonly {
  readonly materialIndex: number;
  readonly rawMeshes: readonly RawMesh[];
  readonly geometry: AuraCustomGeometrySpec;
}[];

export interface StaticTownBatcher {
  addSlot(
    mat: AuraMaterialSpec,
    rawMeshes: readonly RawMesh[],
    transform: { readonly pos?: V3; readonly rot?: V3; readonly scale?: number | V3 },
    castShadow: boolean,
    receiveShadow: boolean,
    geomTag?: string
  ): void;
  buildNodes(prefix?: string): AuraNodeBuilder<AuraPrimitiveNode>[];
}

export function createStaticTownBatcher(): StaticTownBatcher {
  const buckets = new Map<
    string,
    {
      readonly material: AuraMaterialSpec;
      readonly castShadow: boolean;
      readonly receiveShadow: boolean;
      readonly entries: { readonly rawMeshes: readonly RawMesh[]; readonly transform: { readonly pos?: V3; readonly rot?: V3; readonly scale?: number | V3 } }[];
      readonly sigParts: string[];
    }
  >();
  return {
    addSlot(mat, rawMeshes, transform, castShadow, receiveShadow, geomTag = "") {
      const key = `${JSON.stringify(mat)}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: mat, castShadow, receiveShadow, entries: [], sigParts: [] };
        buckets.set(key, bucket);
      }
      bucket.entries.push({ rawMeshes, transform });
      const p = transform.pos;
      bucket.sigParts.push(
        `${geomTag}:${rawMeshes.length}:${rawMeshes[0]?.positions.length ?? 0}:${p ? `${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}` : "0"}`
      );
    },
    buildNodes(prefix = "town-static") {
      const out: AuraNodeBuilder<AuraPrimitiveNode>[] = [];
      let idx = 0;
      for (const bucket of buckets.values()) {
        if (bucket.entries.length === 0) continue;
        const cacheKey = `lt-town-batch:${bucket.sigParts.join(";")}`;
        const merged = memoizeGeometry(cacheKey, () => {
          const transformed: RawMesh[] = [];
          for (const entry of bucket.entries) {
            for (const m of entry.rawMeshes) {
              transformed.push(transformMesh(m, entry.transform));
            }
          }
          return mergeRawMeshes(transformed);
        });
        out.push(
          geometry.custom(merged, {
            name: `${prefix}-${idx++}`,
            material: bucket.material,
            castShadow: bucket.castShadow,
            receiveShadow: bucket.receiveShadow
          })
        );
      }
      return out;
    }
  };
}

/**
 * Compacts `MultiMatSlot[]` into one merged `AuraCustomGeometrySpec` per used `materialIndex`
 * so repeated scene props (48 passengers, 36 houses, 30 folk, 12 crates, 12 lamps, 6 clock towers)
 * carry 1x vertex buffers instead of duplicating all slots' vertices N times across children.
 */
function buildCompactSlotSpecs(slots: readonly MultiMatSlot[]): CompactSlotSpecs {
  const bySlot = new Map<number, RawMesh[]>();
  for (const s of slots) {
    let list = bySlot.get(s.materialIndex);
    if (!list) bySlot.set(s.materialIndex, (list = []));
    list.push(s.mesh);
  }
  return [...bySlot.entries()]
    .sort(([a], [b]) => a - b)
    .map(([materialIndex, meshes]) => ({
      materialIndex,
      rawMeshes: meshes,
      geometry: mergeRawMeshes(meshes)
    }));
}

function mountCompactMultiMaterial(
  name: string,
  slotSpecs: CompactSlotSpecs,
  materials: readonly AuraMaterialSpec[],
  options: {
    readonly position?: V3;
    readonly rotation?: V3;
    readonly scale?: number | V3;
    readonly castShadow: boolean;
    readonly receiveShadow: boolean;
    readonly batcher?: StaticTownBatcher;
  }
): AuraNodeBuilder<AuraGroupNode> {
  if (options.batcher) {
    for (const slot of slotSpecs) {
      options.batcher.addSlot(
        materials[slot.materialIndex]!,
        slot.rawMeshes,
        {
          ...(options.position ? { pos: options.position } : {}),
          ...(options.rotation ? { rot: options.rotation } : {}),
          ...(options.scale !== undefined ? { scale: options.scale } : {})
        },
        options.castShadow,
        options.receiveShadow,
        `${name}:${slot.materialIndex}`
      );
    }
    return group(name, [], {
      ...(options.position ? { position: options.position } : {}),
      ...(options.rotation ? { rotation: options.rotation } : {}),
      ...(options.scale !== undefined ? { scale: options.scale } : {})
    }).runtime({ id: name });
  }
  const children = slotSpecs.map((slot) =>
    geometry.custom(slot.geometry, {
      name: `${name} material ${slot.materialIndex}`,
      material: materials[slot.materialIndex]!,
      castShadow: options.castShadow,
      receiveShadow: options.receiveShadow
    })
  );
  return group(name, children, {
    ...(options.position ? { position: options.position } : {}),
    ...(options.rotation ? { rotation: options.rotation } : {}),
    ...(options.scale !== undefined ? { scale: options.scale } : {})
  }).runtime({ id: name });
}

/* ------------------------------------------------------------------ 2. Four Stylized Passenger Archetypes & Station Folk */

const passengerSpecCache = new Map<RiderKind, CompactSlotSpecs>();

/** Orient an organic `sculptAnatomicalLimbMesh` + `taubinSmoothMesh` segment cleanly between any two 3D joints `p0 -> p1`. */
function sculptDirectedFolkLimb(
  p0: V3,
  p1: V3,
  r0: number,
  rMid: number,
  r1: number,
  ringPoints = 14,
  muscleBiasZ = 0.008,
  smoothPasses = 3
): RawMesh {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const dz = p1[2] - p0[2];
  const len = Math.max(0.035, Math.hypot(dx, dy, dz));
  const local = taubinSmoothMesh(
    sculptAnatomicalLimbMesh(
      [
        { pos: [0, 0, 0], rx: r0, rz: r0 * 1.04 },
        { pos: [0, len * 0.34, 0], rx: rMid * 1.02, rz: rMid * 1.06 },
        { pos: [0, len * 0.7, 0], rx: rMid * 0.94, rz: rMid * 0.97 },
        { pos: [0, len, 0], rx: r1, rz: r1 * 1.03 }
      ],
      { ringPoints, capEnds: true, muscleBiasZ, peakT: 0.42 }
    ),
    smoothPasses
  );
  const sinRx = Math.max(-1, Math.min(1, dz / len));
  const rx = Math.asin(sinRx);
  const rz = Math.atan2(-dx, dy);
  return transformMesh(local, { pos: p0, rot: [rx, 0, rz] });
}

/** Snap the lowest vertex Y of a `RawMesh` to `targetMinY` so shoes/boots ground cleanly without floating or sinking. */
function snapMeshMinY(mesh: RawMesh, targetMinY: number): RawMesh {
  let minY = Number.POSITIVE_INFINITY;
  for (let i = 1; i < mesh.positions.length; i += 3) {
    if (mesh.positions[i]! < minY) minY = mesh.positions[i]!;
  }
  if (!Number.isFinite(minY) || Math.abs(minY - targetMinY) < 1e-6) return mesh;
  return transformMesh(mesh, { pos: [0, targetMinY - minY, 0] });
}

let cachedCommuterBootMesh: RawMesh | null = null;
function getCommuterBootMesh(): RawMesh {
  if (cachedCommuterBootMesh) return cachedCommuterBootMesh;
  cachedCommuterBootMesh = snapMeshMinY(
    sculptOrganicSdfMesh({
      boundsMin: [-0.072, -0.005, -0.095],
      boundsMax: [0.072, 0.145, 0.185],
      resolution: [22, 24, 26],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const heel = sdfEllipsoid([x, y, z], [0, 0.048, -0.025], [0.046, 0.044, 0.056]);
        const vamp = sdfTaperedCapsule([x, y, z], [0, 0.045, -0.015], [0, 0.032, 0.118], 0.046, 0.038);
        const ankle = sdfTaperedCapsule([x, y, z], [0, 0.058, -0.015], [0, 0.122, -0.012], 0.044, 0.046);
        return sminPoly(sminPoly(heel, vamp, 0.022), ankle, 0.02);
      }
    }),
    0
  );
  return cachedCommuterBootMesh;
}

let cachedCommuterHandMesh: RawMesh | null = null;
function getCommuterHandMesh(): RawMesh {
  if (cachedCommuterHandMesh) return cachedCommuterHandMesh;
  cachedCommuterHandMesh = sculptOrganicSdfMesh({
    boundsMin: [-0.052, -0.042, -0.055],
    boundsMax: [0.052, 0.042, 0.068],
    resolution: [22, 22, 24],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const palm = sdfEllipsoid([x, y, z], [0, 0, 0.004], [0.034, 0.022, 0.038]);
      const thumb = sdfEllipsoid([x, y, z], [0.024, -0.004, 0.018], [0.016, 0.014, 0.024]);
      return sminPoly(palm, thumb, 0.014);
    }
  });
  return cachedCommuterHandMesh;
}

let cachedCommuterSatchelMesh: RawMesh | null = null;
function getCommuterSatchelMesh(): RawMesh {
  if (cachedCommuterSatchelMesh) return cachedCommuterSatchelMesh;
  cachedCommuterSatchelMesh = sculptOrganicSdfMesh({
    boundsMin: [-0.08, -0.14, -0.16],
    boundsMax: [0.08, 0.14, 0.16],
    resolution: [22, 24, 26],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const body = sdfEllipsoid([x, y, z], [0, -0.01, 0], [0.058, 0.108, 0.132]);
      const flap = sdfEllipsoid([x, y, z], [0.012, 0.045, 0], [0.06, 0.072, 0.13]);
      return sminPoly(body, flap, 0.02);
    }
  });
  return cachedCommuterSatchelMesh;
}

function buildPassengerSpec(kind: RiderKind): CompactSlotSpecs {
  const hit = passengerSpecCache.get(kind);
  if (hit) return hit;

  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh, ao = 0.2): void => {
    slots.push({ materialIndex, mesh: ao > 0 ? bakeMeshCavityAO(mesh, ao) : mesh });
  };

  const torsoLean = kind === "rushed" ? 0.14 : kind === "sleeper" ? 0.1 : -0.03;
  const headNod = kind === "sleeper" ? 0.34 : kind === "rushed" ? 0.08 : -0.04;

  // Slot 0: Draped pleated Edwardian wool overcoat torso & flared seated skirt (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
  const drapedCoat = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.71, rx: 0.295, rz: 0.255, z: 0.048, folds: 9, foldAmp: 0.022, superellipseN: 2.15 },
        { y: -0.52, rx: 0.285, rz: 0.238, z: 0.032, folds: 9, foldAmp: 0.018, superellipseN: 2.18 },
        { y: -0.31, rx: 0.246, rz: 0.2, z: 0.012, folds: 8, foldAmp: 0.013, superellipseN: 2.2 },
        { y: -0.08, rx: 0.228, rz: 0.184, z: 0, folds: 7, foldAmp: 0.009, superellipseN: 2.22 },
        { y: 0.11, rx: 0.246, rz: 0.192, z: -0.004, folds: 7, foldAmp: 0.008, superellipseN: 2.18 },
        { y: 0.205, rx: 0.158, rz: 0.136, z: -0.006, folds: 5, foldAmp: 0.004, superellipseN: 2.25 }
      ],
      { ringPoints: 30, capEnds: true, smoothPasses: 4 }
    ),
    4
  );
  push(0, transformMesh(drapedCoat, { pos: [0, 0, -0.02], rot: [torsoLean, 0, 0] }), 0.22);

  // Curved notched wool coat lapels (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
  for (const side of [-1, 1] as const) {
    const lapel = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [side * 0.086, 0.175, 0.115],
        mid: [side * 0.072, 0.025, 0.176],
        tip: [side * 0.028, -0.145, 0.192],
        width: 0.068,
        thickness: 0.022,
        segments: 12,
        radialSegments: 10
      }),
      3
    );
    push(0, transformMesh(lapel, { pos: [0, 0, -0.02], rot: [torsoLean, 0, 0] }), 0.18);
  }

  // Slot 1: Draped knitted wool scarf collar (`sculptDrapedGarmentMesh`) + cascading front scarf tail (`sculptCurvedHairLockMesh`)
  const drapedScarf = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: 0.135, rx: 0.196, rz: 0.168, z: 0.012, folds: 7, foldAmp: 0.012, superellipseN: 2.15 },
        { y: 0.195, rx: 0.188, rz: 0.162, z: 0.008, folds: 7, foldAmp: 0.014, superellipseN: 2.15 },
        { y: 0.258, rx: 0.138, rz: 0.128, z: 0.002, folds: 6, foldAmp: 0.008, superellipseN: 2.2 }
      ],
      { ringPoints: 28, capEnds: true, smoothPasses: 4 }
    ),
    3
  );
  push(1, transformMesh(drapedScarf, { pos: [0, 0, torsoLean * 0.12], rot: [torsoLean, 0, 0] }), 0.2);

  const scarfTail = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [0.052, 0.155, 0.155],
      mid: [0.068, -0.005, 0.205],
      tip: [0.048, -0.185, 0.215],
      width: 0.074,
      thickness: 0.022,
      segments: 12,
      radialSegments: 10
    }),
    3
  );
  push(1, transformMesh(scarfTail, { pos: [0, 0, torsoLean * 0.12], rot: [torsoLean, 0, 0] }), 0.2);

  // Slot 2 & 5: Anatomical seated thighs & calves (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`) + SDF leather boots at `y = -1.22`
  const bootBase = getCommuterBootMesh();
  for (const side of [-1, 1] as const) {
    const sx = side * 0.115;
    push(2, sculptDirectedFolkLimb([sx, -0.63, 0.02], [sx, -0.66, 0.29], 0.088, 0.082, 0.07, 20, 0.01, 4), 0.2);
    push(2, sculptDirectedFolkLimb([sx, -0.66, 0.29], [sx, -1.14, 0.35], 0.072, 0.068, 0.054, 20, -0.01, 4), 0.2);
    const trouserCuff = taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -1.155, rx: 0.06, rz: 0.064, folds: 6, foldAmp: 0.006, superellipseN: 2.15 },
          { y: -1.095, rx: 0.062, rz: 0.066, folds: 6, foldAmp: 0.007, superellipseN: 2.15 }
        ],
        { ringPoints: 22, capEnds: true, smoothPasses: 3 }
      ),
      2
    );
    push(2, transformMesh(trouserCuff, { pos: [sx, 0, 0.35] }), 0.18);
    push(5, transformMesh(bootBase, { pos: [sx, -1.24, 0.355], scale: [1.08, 1.05, 1.08] }), 0.18);
  }

  // Slot 3 & 2: Stylized human head (`sculptStylizedHeadMesh`) + neck + ears + layered `sculptCurvedHairLockMesh` hair locks
  const headZ = Math.sin(torsoLean) * 0.22 + (kind === "sleeper" ? 0.06 : 0);
  const headY = 0.365 - (kind === "sleeper" ? 0.03 : 0);
  const seedMap: Record<RiderKind, number> = { easy: 11, sightseer: 23, rushed: 37, sleeper: 53 };
  push(3, sculptDirectedFolkLimb([0, 0.21, headZ * 0.55], [0, headY - 0.06, headZ], 0.064, 0.06, 0.058, 18, 0, 3), 0.18);
  const stylizedHead = taubinSmoothMesh(
    sculptStylizedHeadMesh(0.132, {
      jawTaper: kind === "sightseer" ? 0.3 : 0.24,
      cheekFullness: kind === "easy" ? 0.2 : 0.15,
      noseBridge: 0.2,
      browRidge: 0.12,
      subdivisions: 2,
      seed: seedMap[kind]
    }),
    2
  );
  push(3, transformMesh(stylizedHead, { pos: [0, headY, headZ], rot: [headNod, 0, 0] }), 0.18);

  // Layered hair crown & side locks (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
  const hairCrown = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.03, rx: 0.132, rz: 0.138, z: -0.022, folds: 8, foldAmp: 0.008, superellipseN: 2.05 },
        { y: 0.055, rx: 0.142, rz: 0.148, z: -0.012, folds: 8, foldAmp: 0.009, superellipseN: 2.05 },
        { y: 0.128, rx: 0.118, rz: 0.126, z: -0.006, folds: 7, foldAmp: 0.006, superellipseN: 2.05 },
        { y: 0.158, rx: 0.052, rz: 0.056, z: -0.004, folds: 5, foldAmp: 0.003, superellipseN: 2.05 }
      ],
      { ringPoints: 26, capEnds: true, smoothPasses: 4 }
    ),
    3
  );
  push(2, transformMesh(hairCrown, { pos: [0, headY, headZ], rot: [headNod - 0.05, 0, 0] }), 0.18);
  for (const side of [-1, 1] as const) {
    const sideLock = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [side * 0.095, 0.095, 0.035],
        mid: [side * 0.132, 0.02, 0.02],
        tip: [side * 0.115, -0.075, 0.015],
        width: 0.062,
        thickness: 0.026,
        segments: 10,
        radialSegments: 10
      }),
      3
    );
    push(2, transformMesh(sideLock, { pos: [0, headY, headZ], rot: [headNod, 0, 0] }), 0.18);
  }

  const addSeatedArm = (shoulder: V3, elbow: V3, wrist: V3) => {
    push(0, sculptDirectedFolkLimb(shoulder, elbow, 0.064, 0.058, 0.052, 18, 0.007, 4), 0.2);
    push(0, sculptDirectedFolkLimb(elbow, wrist, 0.053, 0.049, 0.042, 18, 0.005, 4), 0.2);
    const cuff = taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.035, rx: 0.048, rz: 0.05, folds: 6, foldAmp: 0.005, superellipseN: 2.15 },
          { y: 0.025, rx: 0.05, rz: 0.052, folds: 6, foldAmp: 0.006, superellipseN: 2.15 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      ),
      2
    );
    push(0, transformMesh(cuff, { pos: wrist, rot: [0.65, 0, 0] }), 0.18);
    push(
      3,
      transformMesh(getCommuterHandMesh(), {
        pos: [wrist[0] * 0.92, wrist[1] - 0.018, wrist[2] + 0.032],
        rot: [0.35, 0, 0]
      }),
      0.16
    );
  };

  // Archetype arms, headwear, and organic props
  if (kind === "easy") {
    const bowler = taubinSmoothMesh(
      subdivideSmoothMesh(
        latheMesh([[0, 0.02], [0.215, 0.02], [0.228, 0.046], [0.154, 0.052], [0.15, 0.142], [0.114, 0.198], [0, 0.214]], 22),
        1,
        0.52
      ),
      3
    );
    push(2, transformMesh(bowler, { pos: [0, headY + 0.055, headZ - 0.008], rot: [headNod - 0.06, 0, 0] }), 0.18);
    for (const side of [-1, 1] as const) {
      addSeatedArm([side * 0.23, 0.08, 0], [side * 0.255, -0.18, 0.11], [side * 0.145, -0.37, 0.24]);
    }
    push(4, taubinSmoothMesh(tubeSweepMesh([[-0.18, 0.18, 0.02, 0.02], [0.06, -0.08, 0.22, 0.02], [0.25, -0.42, 0.16, 0.02]], 10), 2), 0.16);
    push(4, transformMesh(getCommuterSatchelMesh(), { pos: [0.275, -0.46, 0.14], rot: [0.08, 0.15, -0.12] }), 0.2);
    push(6, transformMesh(bevelBoxMesh(0.03, 0.048, 0.058, 0.008), { pos: [0.335, -0.44, 0.14] }), 0);
  } else if (kind === "sightseer") {
    const sunhat = taubinSmoothMesh(
      subdivideSmoothMesh(
        latheMesh([[0, 0.02], [0.34, 0.02], [0.26, 0.052], [0.155, 0.072], [0.145, 0.182], [0.09, 0.212], [0, 0.218]], 24),
        1,
        0.52
      ),
      3
    );
    push(4, transformMesh(sunhat, { pos: [0, headY + 0.05, headZ - 0.01], rot: [-0.14, 0, 0] }), 0.18);
    push(1, transformMesh(latheMesh([[0.15, 0.065], [0.16, 0.088], [0.15, 0.11]], 22, true), {
      pos: [0, headY + 0.05, headZ - 0.01], rot: [-0.14, 0, 0]
    }), 0.15);
    const hatStreamer = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0.065, headY + 0.11, headZ - 0.14],
        mid: [0.11, headY + 0.02, headZ - 0.22],
        tip: [0.095, headY - 0.09, headZ - 0.26],
        width: 0.048,
        thickness: 0.012,
        segments: 10,
        radialSegments: 10
      }),
      3
    );
    push(1, hatStreamer, 0.15);
    for (const side of [-1, 1] as const) {
      addSeatedArm([side * 0.23, 0.08, 0], [side * 0.24, -0.12, 0.18], [side * 0.105, -0.06, 0.28]);
    }
    push(4, tubeSweepMesh([[-0.11, 0.16, 0.06, 0.014], [-0.08, -0.05, 0.28, 0.014], [0.08, -0.05, 0.28, 0.014], [0.11, 0.16, 0.06, 0.014]], 8), 0.12);
    push(7, taubinSmoothMesh(transformMesh(bevelBoxMesh(0.17, 0.13, 0.1, 0.02), { pos: [0, -0.06, 0.31] }), 2), 0.14);
    push(6, transformMesh(latheMesh([[0, 0], [0.048, 0], [0.052, 0.06], [0.044, 0.07], [0, 0.07]], 18), {
      pos: [0, -0.06, 0.36], rot: [Math.PI * 0.5, 0, 0]
    }), 0);
    push(8, transformMesh(latheMesh([[0, 0], [0.038, 0.01], [0, 0.02]], 16), {
      pos: [0, -0.06, 0.42], rot: [Math.PI * 0.5, 0, 0]
    }), 0);
  } else if (kind === "rushed") {
    const fedora = taubinSmoothMesh(
      subdivideSmoothMesh(
        latheMesh([[0, 0.016], [0.242, 0.016], [0.162, 0.046], [0.148, 0.152], [0.095, 0.192], [0, 0.188]], 22),
        1,
        0.52
      ),
      3
    );
    push(4, transformMesh(fedora, { pos: [0, headY + 0.055, headZ], rot: [headNod + 0.04, 0, 0] }), 0.18);
    for (const side of [-1, 1] as const) {
      addSeatedArm([side * 0.24, 0.08, 0.03], [side * 0.22, -0.2, 0.2], [side * 0.115, -0.43, 0.3]);
    }
    push(6, transformMesh(latheMesh([[0.046, -0.015], [0.056, -0.012], [0.056, 0.012], [0.046, 0.015]], 16, true), { pos: [-0.12, -0.41, 0.3], rot: [0.9, 0, 0] }), 0);
    push(4, taubinSmoothMesh(subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.36, 0.25, 0.105, 0.026), { pos: [0, -0.5, 0.36], rot: [-0.18, 0, 0] }), 1, 0.42), 3), 0.2);
    push(4, taubinSmoothMesh(tubeSweepMesh([[-0.07, -0.37, 0.34, 0.016], [0, -0.33, 0.34, 0.018], [0.07, -0.37, 0.34, 0.016]], 10), 2), 0.15);
    for (const bx of [-0.11, 0.11]) {
      push(6, transformMesh(bevelBoxMesh(0.035, 0.045, 0.11, 0.006), { pos: [bx, -0.42, 0.36], rot: [-0.18, 0, 0] }), 0);
    }
  } else {
    // Sleeper: organically folded arms (`sculptAnatomicalLimbMesh` + `taubinSmoothMesh`) + draped knit railway cap & curved visor
    push(0, sculptDirectedFolkLimb([-0.23, 0.06, 0.02], [-0.185, -0.21, 0.2], 0.064, 0.058, 0.052, 18, 0.007, 4), 0.2);
    push(0, sculptDirectedFolkLimb([0.23, 0.06, 0.02], [0.185, -0.21, 0.2], 0.064, 0.058, 0.052, 18, 0.007, 4), 0.2);
    push(0, sculptDirectedFolkLimb([-0.185, -0.21, 0.2], [0.12, -0.23, 0.23], 0.052, 0.05, 0.044, 18, 0.005, 4), 0.2);
    push(0, sculptDirectedFolkLimb([0.185, -0.21, 0.2], [-0.1, -0.24, 0.215], 0.052, 0.05, 0.044, 18, 0.005, 4), 0.2);
    const knitCap = taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: 0.035, rx: 0.145, rz: 0.152, folds: 9, foldAmp: 0.008, superellipseN: 2.1 },
          { y: 0.095, rx: 0.162, rz: 0.17, folds: 8, foldAmp: 0.01, superellipseN: 2.08 },
          { y: 0.168, rx: 0.132, rz: 0.142, z: -0.012, folds: 7, foldAmp: 0.008, superellipseN: 2.08 },
          { y: 0.205, rx: 0.048, rz: 0.052, z: -0.018, folds: 5, foldAmp: 0.004, superellipseN: 2.08 }
        ],
        { ringPoints: 28, capEnds: true, smoothPasses: 4 }
      ),
      3
    );
    push(1, transformMesh(knitCap, { pos: [0, headY + 0.02, headZ + 0.008], rot: [headNod + 0.06, 0, 0] }), 0.18);
    const visorBill = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0, headY + 0.075, headZ + 0.08],
        mid: [0, headY + 0.052, headZ + 0.155],
        tip: [0, headY + 0.025, headZ + 0.215],
        width: 0.22,
        thickness: 0.018,
        segments: 10,
        radialSegments: 10
      }),
      3
    );
    push(5, visorBill, 0.16);
  }

  const spec = buildCompactSlotSpecs(slots);
  passengerSpecCache.set(kind, spec);
  return spec;
}

const PASSENGER_PALETTES: Record<RiderKind, { readonly coat: string; readonly sheen: string; readonly scarf: string; readonly prop: string }> = {
  easy: { coat: "#e5ae3e", sheen: "#fff0c2", scarf: "#f4ead2", prop: "#704225" },
  sightseer: { coat: "#52b792", sheen: "#d5fae9", scarf: "#e46b4f", prop: "#dec387" },
  rushed: { coat: "#de542c", sheen: "#ffd2c2", scarf: "#f2e7d5", prop: "#4a2c1d" },
  sleeper: { coat: "#6b7de8", sheen: "#d6deff", scarf: "#434f9c", prop: "#38437a" }
};

export function buildPassengerNode(kind: RiderKind, name: string, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  const pal = PASSENGER_PALETTES[kind];
  const materials: AuraMaterialSpec[] = [
    unnamed(material.fabric({ color: pal.coat, roughness: 0.65, clearcoat: 0, sheen: 0.72, sheenColor: pal.sheen, sheenRoughness: 0.56, envMapIntensity: 0.08, doubleSided: true })),
    unnamed(material.fabric({ color: pal.scarf, roughness: 0.68, clearcoat: 0, sheen: 0.6, sheenColor: "#ffffff", sheenRoughness: 0.62, envMapIntensity: 0.08, doubleSided: true })),
    unnamed(material.pbr({ color: "#323846", roughness: 0.68, clearcoat: 0, envMapIntensity: 0.08 })),
    unnamed(material.pbr({ color: "#efc6a0", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.07 })),
    unnamed(material.pbr({ color: pal.prop, roughness: 0.64, clearcoat: 0, envMapIntensity: 0.09 })),
    unnamed(material.blackRubber({ color: "#23252b", roughness: 0.72, clearcoat: 0, envMapIntensity: 0.06 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.22, metallic: 0.92 })),
    unnamed(material.lacquer({ color: "#1c2026", roughness: 0.24, clearcoat: 0.88, clearcoatRoughness: 0.06 })),
    unnamed(material.physical({ color: "#bfe6f8", roughness: 0.04, opacity: 0.45, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, envMapIntensity: 1.5 }))
  ];
  return mountCompactMultiMaterial(name, buildPassengerSpec(kind), materials, {
    castShadow,
    receiveShadow: false
  });
}

let cachedMotormanConductorSpec: CompactSlotSpecs | null = null;

function buildMotormanConductorSpec(): CompactSlotSpecs {
  if (cachedMotormanConductorSpec) return cachedMotormanConductorSpec;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh, ao = 0.2): void => {
    slots.push({ materialIndex, mesh: ao > 0 ? bakeMeshCavityAO(mesh, ao) : mesh });
  };

  // Grounded SDF leather boots (`y = 0.00`) + anatomical wool trousers
  const bootMesh = getCommuterBootMesh();
  for (const side of [-1, 1] as const) {
    const fx = side * 0.105;
    const fz = side < 0 ? 0.02 : -0.015;
    push(4, transformMesh(bootMesh, { pos: [fx, 0, fz], rot: [0, side * 0.08, 0], scale: [1.02, 1.02, 1.04] }), 0.18);
    push(2, sculptDirectedFolkLimb([fx, 0.1, fz], [fx * 0.96, 0.52, fz * 0.5 + 0.012], 0.048, 0.06, 0.056, 20, -0.01, 4), 0.2);
    push(2, sculptDirectedFolkLimb([fx * 0.96, 0.52, fz * 0.5 + 0.012], [fx * 0.9, 0.92, 0], 0.058, 0.076, 0.082, 20, 0.008, 4), 0.2);
  }

  // Draped double-breasted Edwardian railway motorman navy wool greatcoat (`ringPoints: 32`, `smoothPasses: 4`)
  const greatcoat = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: 0.54, rx: 0.258, rz: 0.205, z: -0.014, folds: 9, foldAmp: 0.018, superellipseN: 2.15 },
        { y: 0.78, rx: 0.218, rz: 0.174, z: -0.006, folds: 8, foldAmp: 0.013, superellipseN: 2.18 },
        { y: 1.02, rx: 0.192, rz: 0.152, z: 0, folds: 7, foldAmp: 0.009, superellipseN: 2.22 },
        { y: 1.28, rx: 0.228, rz: 0.172, z: 0.006, folds: 7, foldAmp: 0.008, superellipseN: 2.18 },
        { y: 1.44, rx: 0.152, rz: 0.126, z: 0.004, folds: 6, foldAmp: 0.005, superellipseN: 2.22 }
      ],
      { ringPoints: 32, capEnds: true, smoothPasses: 4 }
    ),
    4
  );
  push(0, greatcoat, 0.22);

  // Curved notched wool lapels + double row of spun-brass railway coat buttons
  for (const side of [-1, 1] as const) {
    const lapel = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [side * 0.082, 1.42, 0.108],
        mid: [side * 0.068, 1.24, 0.165],
        tip: [side * 0.032, 1.04, 0.168],
        width: 0.068,
        thickness: 0.022,
        segments: 12,
        radialSegments: 10
      }),
      3
    );
    push(0, lapel, 0.18);
    for (const by of [0.98, 1.1, 1.22]) {
      push(5, transformMesh(latheMesh([[0, 0], [0.014, 0.004], [0, 0.01]], 12), {
        pos: [side * 0.056, by, 0.158],
        rot: [Math.PI * 0.5, 0, 0]
      }), 0);
    }
  }

  // Warm knitted crimson/cream railway scarf collar
  const scarf = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: 1.36, rx: 0.178, rz: 0.148, z: 0.01, folds: 7, foldAmp: 0.011, superellipseN: 2.15 },
        { y: 1.43, rx: 0.166, rz: 0.138, z: 0.008, folds: 7, foldAmp: 0.012, superellipseN: 2.15 },
        { y: 1.49, rx: 0.118, rz: 0.108, z: 0.004, folds: 6, foldAmp: 0.006, superellipseN: 2.2 }
      ],
      { ringPoints: 28, capEnds: true, smoothPasses: 4 }
    ),
    3
  );
  push(1, scarf, 0.2);

  // Poised motorman arms gripping the cab brass controller handle (left `-X`) & air-brake lever (right `+X`)
  const handMesh = getCommuterHandMesh();
  const armPose: readonly [V3, V3, V3, -1 | 1][] = [
    [[-0.21, 1.37, 0.01], [-0.26, 1.18, 0.12], [-0.22, 1.26, 0.24], -1],
    [[0.21, 1.37, 0.01], [0.24, 1.14, 0.1], [0.19, 1.12, 0.22], 1]
  ];
  for (const [sh, el, wr, side] of armPose) {
    push(0, sculptDirectedFolkLimb(sh, el, 0.06, 0.056, 0.05, 20, 0.007, 4), 0.2);
    push(0, sculptDirectedFolkLimb(el, wr, 0.051, 0.047, 0.041, 20, 0.005, 4), 0.2);
    const cuff = taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.028, rx: 0.048, rz: 0.05, folds: 6, foldAmp: 0.005, superellipseN: 2.15 },
          { y: 0.024, rx: 0.05, rz: 0.052, folds: 6, foldAmp: 0.006, superellipseN: 2.15 }
        ],
        { ringPoints: 20, capEnds: true, smoothPasses: 3 }
      ),
      2
    );
    push(5, transformMesh(cuff, { pos: wr, rot: [0.85, 0, 0], scale: [1.02, 0.35, 1.02] }), 0.14);
    push(4, transformMesh(handMesh, {
      pos: [wr[0], wr[1] - 0.01, wr[2] + 0.036],
      rot: [0.25, side * -0.14, 0],
      scale: [0.95, 0.95, 0.95]
    }), 0.16);
  }

  // Stylized head (`subdivisions: 2`) + neck + peaked Edwardian railway conductor cap with brass badge
  const headPos: V3 = [0, 1.635, 0.015];
  push(3, sculptDirectedFolkLimb([0, 1.44, 0.005], [0, 1.56, 0.012], 0.058, 0.054, 0.052, 18, 0, 3), 0.16);
  const conductorHead = taubinSmoothMesh(
    sculptStylizedHeadMesh(0.124, {
      jawTaper: 0.22,
      cheekFullness: 0.16,
      noseBridge: 0.21,
      browRidge: 0.14,
      subdivisions: 2,
      seed: 71
    }),
    2
  );
  push(3, transformMesh(conductorHead, { pos: headPos }), 0.18);

  const capCrown = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: 0.042, rx: 0.128, rz: 0.136, folds: 6, foldAmp: 0.004, superellipseN: 2.15 },
        { y: 0.088, rx: 0.134, rz: 0.144, z: 0.008, folds: 6, foldAmp: 0.005, superellipseN: 2.12 },
        { y: 0.142, rx: 0.158, rz: 0.172, z: 0.018, folds: 6, foldAmp: 0.006, superellipseN: 2.08 },
        { y: 0.168, rx: 0.056, rz: 0.062, z: 0.02, folds: 5, foldAmp: 0.003, superellipseN: 2.08 }
      ],
      { ringPoints: 28, capEnds: true, smoothPasses: 4 }
    ),
    3
  );
  push(0, transformMesh(capCrown, { pos: headPos, rot: [-0.06, 0, 0] }), 0.18);
  push(5, transformMesh(latheMesh([[0.129, 0.048], [0.136, 0.062], [0.129, 0.076]], 24, true), {
    pos: headPos,
    rot: [-0.06, 0, 0]
  }), 0);
  push(5, transformMesh(latheMesh([[0, 0], [0.024, 0.006], [0, 0.014]], 14), {
    pos: [0, headPos[1] + 0.095, headPos[2] + 0.145],
    rot: [Math.PI * 0.45, 0, 0]
  }), 0);
  const capVisor = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [0, headPos[1] + 0.064, headPos[2] + 0.088],
      mid: [0, headPos[1] + 0.044, headPos[2] + 0.158],
      tip: [0, headPos[1] + 0.022, headPos[2] + 0.212],
      width: 0.215,
      thickness: 0.016,
      segments: 10,
      radialSegments: 10
    }),
    3
  );
  push(4, capVisor, 0.16);

  cachedMotormanConductorSpec = buildCompactSlotSpecs(slots);
  return cachedMotormanConductorSpec;
}

/** Sculpted Edwardian Motorman / Conductor hero figure standing in the front streetcar cab (`+Z` forward). */
export function buildMotormanConductorNode(name: string, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  const materials: AuraMaterialSpec[] = [
    unnamed(material.fabric({ color: "#223148", roughness: 0.64, clearcoat: 0, sheen: 0.68, sheenColor: "#a8bde0", sheenRoughness: 0.58, envMapIntensity: 0.08, doubleSided: true })),
    unnamed(material.fabric({ color: "#c94d38", roughness: 0.66, clearcoat: 0, sheen: 0.62, sheenColor: "#ffd4c4", sheenRoughness: 0.6, envMapIntensity: 0.08, doubleSided: true })),
    unnamed(material.pbr({ color: "#1d2636", roughness: 0.68, clearcoat: 0, envMapIntensity: 0.08 })),
    unnamed(material.pbr({ color: "#efc6a0", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.07 })),
    unnamed(material.blackRubber({ color: "#22252b", roughness: 0.7, clearcoat: 0, envMapIntensity: 0.06 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.24, metallic: 0.92 }))
  ];
  return mountCompactMultiMaterial(name, buildMotormanConductorSpec(), materials, {
    castShadow,
    receiveShadow: false
  });
}

const folkSpecCache = new Map<number, CompactSlotSpecs>();

function buildStandingFolkSpec(variant: number): CompactSlotSpecs {
  const v = ((variant % 6) + 6) % 6;
  const hit = folkSpecCache.get(v);
  if (hit) return hit;

  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh, ao = 0.2): void => {
    slots.push({ materialIndex, mesh: ao > 0 ? bakeMeshCavityAO(mesh, ao) : mesh });
  };

  const wearsLongSkirt = v === 1 || v === 4;
  const carriesBag = v % 3 !== 2;
  const wearsHat = v % 3 !== 1;
  const hairHatMat = v % 2 === 0 ? 1 : 2;
  const stanceShift = (v % 2 === 0 ? 1 : -1) * 0.016;

  // 1. Grounded SDF leather shoes (`materialIndex: 4`, flush at `y = 0.00`) + anatomical calves & thighs (`materialIndex: 2`)
  const bootMesh = getCommuterBootMesh();
  for (const side of [-1, 1] as const) {
    const fx = side * 0.095 + stanceShift * 0.35;
    const fz = side < 0 ? 0.018 : -0.018;
    const footYaw = side * -0.08;
    push(4, transformMesh(bootMesh, { pos: [fx, 0, fz], rot: [0, footYaw, 0], scale: [0.96, 0.96, 0.98] }), 0.18);
    const knee: V3 = [side * 0.092 + stanceShift * 0.5, 0.47, fz * 0.6 + 0.01];
    const hip: V3 = [side * 0.088 + stanceShift, 0.88, 0];
    push(2, sculptDirectedFolkLimb([fx, 0.09, fz], knee, 0.044, 0.056, 0.052, 16, -0.01, 3), 0.18);
    if (!wearsLongSkirt) {
      push(2, sculptDirectedFolkLimb(knee, hip, 0.055, 0.072, 0.078, 16, 0.008, 3), 0.18);
    }
  }

  // 2. Draped pleated wool coat / flared mid-calf skirt (`materialIndex: 0`, `sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
  const coatStations = wearsLongSkirt
    ? [
        { y: 0.34, rx: 0.268, rz: 0.228, z: -0.018, folds: 9, foldAmp: 0.022, superellipseN: 2.1 },
        { y: 0.58, rx: 0.228, rz: 0.192, z: -0.01, folds: 9, foldAmp: 0.017, superellipseN: 2.15 },
        { y: 0.84, rx: 0.188, rz: 0.152, z: -0.004, folds: 8, foldAmp: 0.011, superellipseN: 2.2 },
        { y: 1.04, rx: 0.158, rz: 0.126, z: 0, folds: 6, foldAmp: 0.006, superellipseN: 2.22 },
        { y: 1.25, rx: 0.188, rz: 0.142, z: 0.004, folds: 7, foldAmp: 0.007, superellipseN: 2.18 },
        { y: 1.38, rx: 0.132, rz: 0.108, z: 0, folds: 5, foldAmp: 0.004, superellipseN: 2.22 }
      ]
    : [
        { y: 0.64, rx: 0.232, rz: 0.188, z: -0.012, folds: 8, foldAmp: 0.018, superellipseN: 2.15 },
        { y: 0.84, rx: 0.196, rz: 0.158, z: -0.006, folds: 8, foldAmp: 0.013, superellipseN: 2.18 },
        { y: 1.04, rx: 0.172, rz: 0.138, z: 0, folds: 7, foldAmp: 0.008, superellipseN: 2.2 },
        { y: 1.25, rx: 0.204, rz: 0.15, z: 0.004, folds: 7, foldAmp: 0.008, superellipseN: 2.18 },
        { y: 1.385, rx: 0.138, rz: 0.112, z: 0, folds: 5, foldAmp: 0.004, superellipseN: 2.22 }
      ];
  const coatBody = taubinSmoothMesh(
    sculptDrapedGarmentMesh(coatStations, { ringPoints: 28, capEnds: true, smoothPasses: 4 }),
    3
  );
  push(0, transformMesh(coatBody, { pos: [stanceShift * 0.5, 0, 0] }), 0.22);

  // Draped shoulder capelet / collar & knitted wool scarf (`materialIndex: 1`)
  const scarfCollar = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: 1.31, rx: 0.168, rz: 0.138, z: 0.008, folds: 7, foldAmp: 0.011, superellipseN: 2.15 },
        { y: 1.375, rx: 0.158, rz: 0.132, z: 0.006, folds: 7, foldAmp: 0.012, superellipseN: 2.15 },
        { y: 1.43, rx: 0.112, rz: 0.104, z: 0.002, folds: 6, foldAmp: 0.006, superellipseN: 2.2 }
      ],
      { ringPoints: 24, capEnds: true, smoothPasses: 4 }
    ),
    3
  );
  push(1, scarfCollar, 0.2);

  const scarfDrape = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [0.045, 1.35, 0.122],
      mid: [0.062, 1.19, 0.152],
      tip: [0.042, 1.03, 0.148],
      width: 0.064,
      thickness: 0.018,
      segments: 10,
      radialSegments: 8
    }),
    2
  );
  push(1, scarfDrape, 0.18);

  // 3. Natural asymmetrically posed anatomical arms, cuffed sleeves & organic hands (`materialIndex: 0, 3`)
  const handMesh = getCommuterHandMesh();
  for (const side of [-1, 1] as const) {
    const sh: V3 = [side * 0.192, 1.32, 0];
    const bentForward = (side > 0 && carriesBag) || (side < 0 && v % 2 === 1);
    const el: V3 = bentForward ? [side * 0.225, 1.08, 0.035] : [side * 0.218, 1.07, -0.015];
    const wr: V3 = bentForward ? [side * 0.165, 0.94, 0.135] : [side * 0.205, 0.85, 0.045];
    push(0, sculptDirectedFolkLimb(sh, el, 0.056, 0.052, 0.046, 16, 0.006, 3), 0.2);
    push(0, sculptDirectedFolkLimb(el, wr, 0.047, 0.044, 0.038, 16, 0.005, 3), 0.2);
    const sleeveCuff = taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.024, rx: 0.044, rz: 0.046, folds: 6, foldAmp: 0.004, superellipseN: 2.15 },
          { y: 0.022, rx: 0.046, rz: 0.048, folds: 6, foldAmp: 0.005, superellipseN: 2.15 }
        ],
        { ringPoints: 18, capEnds: true, smoothPasses: 3 }
      ),
      2
    );
    push(1, transformMesh(sleeveCuff, { pos: wr, rot: [bentForward ? 0.65 : 0.2, 0, 0] }), 0.16);
    push(
      3,
      transformMesh(handMesh, {
        pos: [wr[0] * 0.96, wr[1] - 0.028, wr[2] + (bentForward ? 0.024 : 0.01)],
        rot: [bentForward ? 0.45 : 1.15, 0, side * -0.15],
        scale: [0.85, 0.85, 0.85]
      }),
      0.16
    );
  }

  // 4. Stylized human head (`sculptStylizedHeadMesh`, `subdivisions: 2`) + neck + sculpted hair locks & soft hats
  push(3, sculptDirectedFolkLimb([0, 1.38, 0], [0, 1.49, 0.006], 0.052, 0.048, 0.046, 14, 0, 3), 0.16);
  const folkHead = taubinSmoothMesh(
    sculptStylizedHeadMesh(0.106, {
      jawTaper: wearsLongSkirt ? 0.3 : 0.23,
      cheekFullness: 0.16,
      noseBridge: 0.19,
      browRidge: 0.12,
      subdivisions: 2,
      seed: 19 + v * 17
    }),
    2
  );
  const headPos: V3 = [0, 1.565, 0.008];
  const headYaw = ((v % 3) - 1) * 0.12;
  push(3, transformMesh(folkHead, { pos: headPos, rot: [-0.03, headYaw, 0] }), 0.18);

  // Layered hair cap + side/back locks (`sculptCurvedHairLockMesh`)
  const folkHair = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.025, rx: 0.106, rz: 0.112, z: -0.018, folds: 7, foldAmp: 0.007, superellipseN: 2.05 },
        { y: 0.048, rx: 0.114, rz: 0.12, z: -0.01, folds: 7, foldAmp: 0.008, superellipseN: 2.05 },
        { y: 0.112, rx: 0.088, rz: 0.095, z: -0.006, folds: 6, foldAmp: 0.005, superellipseN: 2.05 }
      ],
      { ringPoints: 22, capEnds: true, smoothPasses: 3 }
    ),
    2
  );
  push(2, transformMesh(folkHair, { pos: headPos, rot: [-0.03, headYaw, 0] }), 0.18);

  for (const side of [-1, 1] as const) {
    const fringe = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [side * 0.072, 0.082, 0.036],
        mid: [side * 0.104, 0.015, 0.018],
        tip: [side * 0.092, -0.068, 0.006],
        width: 0.048,
        thickness: 0.022,
        segments: 9,
        radialSegments: 8
      }),
      2
    );
    push(2, transformMesh(fringe, { pos: headPos, rot: [-0.03, headYaw, 0] }), 0.18);
  }

  if (wearsHat) {
    // Soft wool beret / coastal brimmed hat (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
    const hatStations =
      v === 0 || v === 3
        ? [
            { y: 0.045, rx: 0.122, rz: 0.128, folds: 8, foldAmp: 0.006, superellipseN: 2.1 },
            { y: 0.092, rx: 0.148, rz: 0.152, x: 0.018, z: -0.01, folds: 7, foldAmp: 0.008, superellipseN: 2.08 },
            { y: 0.142, rx: 0.082, rz: 0.086, x: 0.022, z: -0.014, folds: 5, foldAmp: 0.004, superellipseN: 2.08 }
          ]
        : [
            { y: 0.036, rx: 0.195, rz: 0.2, folds: 8, foldAmp: 0.008, superellipseN: 2.05 },
            { y: 0.062, rx: 0.124, rz: 0.13, folds: 6, foldAmp: 0.005, superellipseN: 2.1 },
            { y: 0.138, rx: 0.112, rz: 0.118, folds: 6, foldAmp: 0.005, superellipseN: 2.1 },
            { y: 0.165, rx: 0.048, rz: 0.052, folds: 5, foldAmp: 0.003, superellipseN: 2.1 }
          ];
    const softHat = taubinSmoothMesh(
      sculptDrapedGarmentMesh(hatStations, { ringPoints: 24, capEnds: true, smoothPasses: 3 }),
      3
    );
    push(hairHatMat, transformMesh(softHat, { pos: headPos, rot: [-0.08, headYaw, v === 0 ? -0.1 : 0] }), 0.18);
  } else {
    // Braided chignon hair bun (`sculptCurvedHairLockMesh`)
    const chignon = taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [-0.035, 0.045, -0.098],
        mid: [0, 0.072, -0.136],
        tip: [0.038, 0.038, -0.102],
        width: 0.068,
        thickness: 0.046,
        segments: 10,
        radialSegments: 8
      }),
      2
    );
    push(2, transformMesh(chignon, { pos: headPos, rot: [-0.03, headYaw, 0] }), 0.18);
  }

  // 5. Rounded SDF commuter leather satchel + cross-body strap (`materialIndex: 5`)
  if (carriesBag) {
    push(5, taubinSmoothMesh(tubeSweepMesh([[-0.145, 1.35, 0.02, 0.016], [0.055, 1.07, 0.14, 0.016], [0.22, 0.8, 0.04, 0.016]], 9), 2), 0.15);
    push(5, transformMesh(getCommuterSatchelMesh(), { pos: [0.225, 0.76, 0.035], rot: [0.06, 0.12, -0.1], scale: [0.85, 0.85, 0.85] }), 0.2);
  }

  const spec = buildCompactSlotSpecs(slots);
  folkSpecCache.set(v, spec);
  return spec;
}

const FOLK_COATS = ["#c65b3e", "#3d7a8a", "#d9a243", "#5c6da3", "#4c8e74", "#a35b73"] as const;

export function buildStationFolkNode(
  variant: number,
  name: string,
  position: V3,
  yaw: number,
  scale: number,
  castShadow: boolean,
  batcher?: StaticTownBatcher
): AuraNodeBuilder<AuraGroupNode> {
  const coat = FOLK_COATS[((variant % FOLK_COATS.length) + FOLK_COATS.length) % FOLK_COATS.length]!;
  const materials: AuraMaterialSpec[] = [
    unnamed(material.fabric({ color: coat, roughness: 0.65, clearcoat: 0, sheen: 0.68, sheenColor: "#fff2dc", sheenRoughness: 0.58, envMapIntensity: 0.08, doubleSided: true })),
    unnamed(material.fabric({ color: "#f1e4cb", roughness: 0.68, clearcoat: 0, sheen: 0.55, sheenColor: "#ffffff", sheenRoughness: 0.62, envMapIntensity: 0.08, doubleSided: true })),
    unnamed(material.pbr({ color: "#2f3542", roughness: 0.68, clearcoat: 0, envMapIntensity: 0.08 })),
    unnamed(material.pbr({ color: "#efc6a0", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.07 })),
    unnamed(material.blackRubber({ color: "#22252b", roughness: 0.72, clearcoat: 0, envMapIntensity: 0.06 })),
    unnamed(material.pbr({ color: "#805130", roughness: 0.64, clearcoat: 0, envMapIntensity: 0.09 }))
  ];
  return mountCompactMultiMaterial(name, buildStandingFolkSpec(variant), materials, {
    position,
    rotation: [0, yaw, 0],
    scale,
    castShadow,
    receiveShadow: false,
    batcher
  });
}

let cachedPlazaFolkSpec: AuraCustomGeometrySpec | null = null;

/** Single-draw instanced silhouette (`clearcoat: 0`) for distant plaza townsfolk (> 50 instances, `y in [-0.75, +0.70]`). */
export function buildPlazaFolkBodySpec(): AuraCustomGeometrySpec {
  if (cachedPlazaFolkSpec) return cachedPlazaFolkSpec;
  const coat = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.32, rx: 0.24, rz: 0.195, folds: 8, foldAmp: 0.016, superellipseN: 2.15 },
        { y: -0.05, rx: 0.195, rz: 0.155, folds: 7, foldAmp: 0.011, superellipseN: 2.2 },
        { y: 0.22, rx: 0.215, rz: 0.165, folds: 6, foldAmp: 0.008, superellipseN: 2.18 },
        { y: 0.42, rx: 0.135, rz: 0.112, folds: 5, foldAmp: 0.004, superellipseN: 2.22 }
      ],
      { ringPoints: 14, capEnds: true, smoothPasses: 3 }
    ),
    3
  );
  const head = taubinSmoothMesh(
    transformMesh(sculptStylizedHeadMesh(0.115, { subdivisions: 0, seed: 7 }), { pos: [0, 0.565, 0.01] }),
    2
  );
  const beret = taubinSmoothMesh(
    sculptCurvedHairLockMesh({
      root: [-0.08, 0.64, -0.02],
      mid: [0.01, 0.695, 0.01],
      tip: [0.09, 0.635, -0.01],
      width: 0.18,
      thickness: 0.055,
      segments: 6,
      radialSegments: 6
    }),
    2
  );
  const legL = sculptDirectedFolkLimb([-0.085, -0.75, 0], [-0.085, -0.28, 0], 0.052, 0.062, 0.068, 10, -0.008, 2);
  const legR = sculptDirectedFolkLimb([0.085, -0.75, 0], [0.085, -0.28, 0], 0.052, 0.062, 0.068, 10, -0.008, 2);
  const armL = sculptDirectedFolkLimb([-0.2, 0.36, 0], [-0.21, -0.06, 0.04], 0.05, 0.046, 0.04, 10, 0.005, 2);
  const armR = sculptDirectedFolkLimb([0.2, 0.36, 0], [0.18, 0.02, 0.1], 0.05, 0.046, 0.04, 10, 0.005, 2);
  cachedPlazaFolkSpec = mergeRawMeshes([coat, head, beret, legL, legR, armL, armR]);
  return cachedPlazaFolkSpec;
}

/* ------------------------------------------------------------------ 3. Coastal Townhouses (Cream, Ochre & Harbor Blue) */

const houseSpecCache = new Map<number, CompactSlotSpecs>();

function buildCoastalHouseSpec(variant: number): CompactSlotSpecs {
  const v = ((variant % 3) + 3) % 3;
  const hit = houseSpecCache.get(v);
  if (hit) return hit;

  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };

  const w = v === 0 ? 8.6 : v === 1 ? 9.8 : 9.1;
  const d = v === 0 ? 7.6 : v === 1 ? 9.2 : 8.4;
  const wallH = v === 0 ? 8.8 : v === 1 ? 9.8 : 9.2;
  const roofRise = v === 0 ? 4.2 : v === 1 ? 4.8 : 4.5;
  const hw = w * 0.5, hd = d * 0.5;

  // Slot 1: Dressed stone ground plinth & alternating corner quoins
  push(1, transformMesh(bevelBoxMesh(w + 0.36, 0.85, d + 0.36, 0.06), { pos: [0, 0.425, 0] }));
  push(1, transformMesh(bevelBoxMesh(w + 0.24, 0.2, d + 0.24, 0.04), { pos: [0, 4.55, 0] }));
  const quoinRows = 5;
  for (let r = 0; r < quoinRows; r += 1) {
    const qy = 1.3 + r * ((wallH - 1.5) / quoinRows);
    const longX = r % 2 === 0;
    const qx = longX ? 0.66 : 0.42;
    const qz = longX ? 0.42 : 0.66;
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        push(1, transformMesh(bevelBoxMesh(qx, 1.05, qz, 0.03), {
          pos: [sx * (hw - qx * 0.42), qy, sz * (hd - qz * 0.42)]
        }));
      }
    }
  }

  // Slot 0: Stucco/clapboard main walls + gable triangles (extruded along X)
  const gablePoly: V2[] = [[-hd, 0], [hd, 0], [hd, wallH - 0.8], [0, wallH - 0.8 + roofRise], [-hd, wallH - 0.8]];
  push(0, transformMesh(extrudePolygonMesh(gablePoly, w, 0.05), { pos: [0, 0.8, 0], rot: [0, Math.PI * 0.5, 0] }));

  // Slot 2: Steep-pitched coastal tile/slate roof + twin track-facing gabled dormers + chimney
  const oh = 0.58;
  const roofPoly: V2[] = [
    [-hd - oh, -0.18], [-hd - oh + 0.28, -0.34], [0, roofRise - 0.24],
    [hd + oh - 0.28, -0.34], [hd + oh, -0.18], [0, roofRise + 0.18]
  ];
  push(2, transformMesh(extrudePolygonMesh(roofPoly, w + oh * 2, 0.04), { pos: [0, wallH, 0], rot: [0, Math.PI * 0.5, 0] }));
  for (const dx of [-w * 0.24, w * 0.24]) {
    push(0, transformMesh(bevelBoxMesh(1.55, 1.55, 1.8, 0.03), { pos: [dx, wallH + roofRise * 0.42, hd * 0.52] }));
    const dormRoof: V2[] = [[-0.95, 0], [0, 0.82], [0.95, 0], [0.8, -0.12], [0, 0.62], [-0.8, -0.12]];
    push(2, transformMesh(extrudePolygonMesh(dormRoof, 1.95, 0.025), { pos: [dx, wallH + roofRise * 0.42 + 0.72, hd * 0.54] }));
    push(5, transformMesh(bevelBoxMesh(0.84, 0.92, 0.06, 0.01), { pos: [dx, wallH + roofRise * 0.4, hd * 0.52 + 0.9] }));
  }
  push(1, transformMesh(bevelBoxMesh(0.95, 2.5, 0.95, 0.04), { pos: [w * 0.28, wallH + roofRise * 0.68, -hd * 0.24] }));
  for (const pz of [-0.2, 0.2]) {
    push(6, transformMesh(latheMesh([[0.16, 0], [0.14, 0.52], [0.19, 0.58], [0.12, 0.65]], 10), {
      pos: [w * 0.28 + pz, wallH + roofRise * 0.68 + 1.25, -hd * 0.24]
    }));
  }

  // Ground-floor arched stone portal (`archwayVoussoirSlots`) + oak door (Slot 4) on +Z facade
  const doorX = -w * 0.22;
  for (const s of archwayVoussoirSlots({ radius: 0.92, thickness: 0.28, depth: 0.28, voussoirs: 7, stoneMatA: 1, stoneMatB: 1, keystoneMat: 1 })) {
    push(s.materialIndex, transformMesh(s.mesh, { pos: [doorX, 2.25, hd + 0.06] }));
  }
  for (const sx of [-1, 1] as const) {
    push(1, transformMesh(bevelBoxMesh(0.28, 1.45, 0.28, 0.025), { pos: [doorX + sx * 1.06, 1.52, hd + 0.06] }));
  }
  push(4, transformMesh(bevelBoxMesh(1.78, 2.35, 0.12, 0.02), { pos: [doorX, 1.95, hd - 0.02] }));

  // Shuttered coastal windows (Slot 3 shutters, Slot 5 warm lit glass, Slot 1 sills) + wrought-iron Juliet balcony (Slot 7)
  const winCols = [-w * 0.26, 0, w * 0.26];
  for (const faceZ of [1, -1] as const) {
    const zFace = faceZ * hd;
    for (const wy of [2.55, 6.25]) {
      for (const wx of winCols) {
        if (faceZ > 0 && wy < 4 && Math.abs(wx - doorX) < 1.2) continue;
        push(5, transformMesh(bevelBoxMesh(1.06, 1.56, 0.08, 0.01), { pos: [wx, wy, zFace + faceZ * 0.02] }));
        push(1, transformMesh(bevelBoxMesh(1.36, 0.14, 0.26, 0.02), { pos: [wx, wy - 0.84, zFace + faceZ * 0.08] }));
        for (const sh of [-1, 1] as const) {
          push(3, transformMesh(bevelBoxMesh(0.42, 1.58, 0.07, 0.015), {
            pos: [wx + sh * 0.78, wy, zFace + faceZ * 0.06]
          }));
        }
      }
    }
  }
  // Juliet balcony railing on central upper +Z window
  push(1, transformMesh(bevelBoxMesh(2.2, 0.16, 0.68, 0.03), { pos: [0, 5.38, hd + 0.3] }));
  push(7, tubeSweepMesh([
    [-1.02, 5.46, hd + 0.04, 0.03], [-1.02, 6.24, hd + 0.58, 0.03],
    [1.02, 6.24, hd + 0.58, 0.03], [1.02, 5.46, hd + 0.04, 0.03]
  ], 6));
  for (let b = -3; b <= 3; b += 1) {
    push(7, tubeSweepMesh([[b * 0.28, 5.46, hd + 0.56, 0.02], [b * 0.28, 6.22, hd + 0.56, 0.02]], 5));
  }

  const spec = buildCompactSlotSpecs(slots);
  houseSpecCache.set(v, spec);
  return spec;
}

const HOUSE_PALETTES = [
  { wall: "#f6ecda", roof: "#b5523c", shutter: "#2b6b5d" },
  { wall: "#edd19a", roof: "#536278", shutter: "#8c3b2b" },
  { wall: "#c7dce8", roof: "#4a586d", shutter: "#efe4cc" }
] as const;

export function buildCoastalHouseNode(
  variant: number,
  name: string,
  position: V3,
  yaw: number,
  windowGlow: number,
  snowRoof: boolean,
  castShadow: boolean,
  batcher?: StaticTownBatcher
): AuraNodeBuilder<AuraGroupNode> {
  const pal = HOUSE_PALETTES[((variant % 3) + 3) % 3]!;
  const lit = windowGlow > 0.05;
  const materials: AuraMaterialSpec[] = [
    unnamed(material.pbr({ color: pal.wall, roughness: 0.85, clearcoat: 0 })),
    unnamed(material.pbr({ color: "#cfc3ad", roughness: 0.88, clearcoat: 0 })),
    unnamed(material.ceramic({ color: snowRoof ? "#eef1f4" : pal.roof, roughness: snowRoof ? 0.62 : 0.46 })),
    unnamed(material.lacquer({ color: pal.shutter, roughness: 0.34, clearcoat: 0.65, clearcoatRoughness: 0.12 })),
    unnamed(material.pbr({ color: "#5e3b25", roughness: 0.72, clearcoat: 0 })),
    lit
      ? unnamed(material.emissive({ color: "#ffe2a6", emissive: "#ffc972", emissiveIntensity: windowGlow, practical: true }))
      : unnamed(material.physical({ color: "#4c677a", roughness: 0.08, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.5, envMapIntensity: 1.45 })),
    unnamed(material.ceramic({ color: "#b85c42", roughness: 0.52 })),
    unnamed(material.studioMetal({ color: "#282e37", roughness: 0.38, metallic: 0.86 }))
  ];
  return mountCompactMultiMaterial(name, buildCoastalHouseSpec(variant), materials, {
    position,
    rotation: [0, yaw, 0],
    castShadow,
    receiveShadow: true,
    batcher
  });
}

/* ------------------------------------------------------------------ 4. Copper-Domed Station Clock Tower */

let cachedClockTowerSpec: CompactSlotSpecs | null = null;

function clockTowerSpec(): CompactSlotSpecs {
  if (cachedClockTowerSpec) return cachedClockTowerSpec;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };

  const sqRing = (half: number, y: number): V3[] => [[-half, y, -half], [half, y, -half], [half, y, half], [-half, y, half]];
  // Slot 0 & 1: Stepped stone plinth + tapered ashlar shaft + belfry cornice
  push(1, transformMesh(bevelBoxMesh(7.8, 1.4, 7.8, 0.08), { pos: [0, 0.7, 0] }));
  push(0, loftSectionsMesh([sqRing(3.45, 1.3), sqRing(3.25, 10.5), sqRing(3.05, 17.6)], true, true));
  push(1, transformMesh(bevelBoxMesh(6.7, 0.45, 6.7, 0.05), { pos: [0, 10.6, 0] }));
  push(1, transformMesh(bevelBoxMesh(6.5, 0.55, 6.5, 0.06), { pos: [0, 17.8, 0] }));
  push(1, transformMesh(bevelBoxMesh(6.6, 0.55, 6.6, 0.06), { pos: [0, 22.1, 0] }));

  // Corner pilasters up the clock stage (y = 17.8..22.1) + belfry stage (y = 22.1..25.0)
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      push(1, transformMesh(bevelBoxMesh(0.85, 4.3, 0.85, 0.04), { pos: [sx * 2.65, 19.95, sz * 2.65] }));
      push(1, transformMesh(bevelBoxMesh(0.72, 2.8, 0.72, 0.04), { pos: [sx * 2.35, 23.5, sz * 2.35] }));
    }
  }
  push(0, transformMesh(bevelBoxMesh(5.8, 4.1, 5.8, 0.04), { pos: [0, 19.95, 0] }));

  // Four belfry stone arches (`archwayVoussoirSlots`) + suspended bronze station bell (Slot 3)
  for (let f = 0; f < 4; f += 1) {
    const yaw = (f * Math.PI) * 0.5;
    const cx = Math.sin(yaw) * 2.32, cz = Math.cos(yaw) * 2.32;
    for (const s of archwayVoussoirSlots({ radius: 1.15, thickness: 0.34, depth: 0.48, voussoirs: 7, stoneMatA: 1, stoneMatB: 0, keystoneMat: 1 })) {
      push(s.materialIndex, transformMesh(s.mesh, { pos: [cx, 23.45, cz], rot: [0, yaw, 0] }));
    }
  }
  push(3, latheMesh([[0.78, 22.9], [0.62, 23.2], [0.5, 23.95], [0.24, 24.3], [0, 24.4]], 16));

  // Four recessed enamel clock dials (Slot 4) + brass bezels, 12 hour indices & sculpted brass hands (Slot 3)
  const handHour: V2[] = [[-0.09, -0.18], [0.09, -0.18], [0.06, 0.92], [0, 1.12], [-0.06, 0.92]];
  const handMin: V2[] = [[-0.065, -0.22], [0.065, -0.22], [0.045, 1.38], [0, 1.56], [-0.045, 1.38]];
  for (let f = 0; f < 4; f += 1) {
    const yaw = (f * Math.PI) * 0.5;
    const dist = 2.94;
    const px = Math.sin(yaw) * dist, pz = Math.cos(yaw) * dist;
    push(4, transformMesh(latheMesh([[0, 0], [1.72, 0], [1.72, 0.06]], 24), {
      pos: [px, 19.95, pz], rot: [Math.PI * 0.5, yaw, 0]
    }));
    push(3, transformMesh(latheMesh([[1.66, 0], [1.86, 0], [1.86, 0.14], [1.66, 0.14]], 24), {
      pos: [px, 19.95, pz], rot: [Math.PI * 0.5, yaw, 0]
    }));
    const outX = Math.sin(yaw), outZ = Math.cos(yaw);
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    for (let m = 0; m < 12; m += 1) {
      const a = (m / 12) * Math.PI * 2;
      const r = 1.42;
      const mx = px + outX * 0.09 + rightX * Math.sin(a) * r;
      const my = 19.95 + Math.cos(a) * r;
      const mz = pz + outZ * 0.09 + rightZ * Math.sin(a) * r;
      push(3, transformMesh(bevelBoxMesh(m % 3 === 0 ? 0.12 : 0.07, m % 3 === 0 ? 0.32 : 0.2, 0.06, 0.01), {
        pos: [mx, my, mz], rot: [0, yaw, -a]
      }));
    }
    push(3, transformMesh(extrudePolygonMesh(handHour, 0.06, 0.01), {
      pos: [px + outX * 0.12, 19.95, pz + outZ * 0.12], rot: [0, yaw, -2.15]
    }));
    push(3, transformMesh(extrudePolygonMesh(handMin, 0.05, 0.01), {
      pos: [px + outX * 0.16, 19.95, pz + outZ * 0.16], rot: [0, yaw, -0.35]
    }));
  }

  // Slot 2: Verdigris patinated copper ogee cupola dome + brass weathervane finial (Slot 3)
  push(2, latheMesh([
    [3.15, 24.9], [3.32, 25.1], [2.95, 25.8], [2.25, 26.8],
    [1.15, 27.6], [0.48, 28.1], [0.55, 28.35], [0.18, 28.7], [0, 28.85]
  ], 16));
  push(3, tubeSweepMesh([[0, 28.8, 0, 0.05], [0, 30.3, 0, 0.02]], 7));
  push(3, transformMesh(bevelBoxMesh(0.04, 0.22, 1.15, 0.01), { pos: [0, 29.85, 0.15] }));

  cachedClockTowerSpec = buildCompactSlotSpecs(slots);
  return cachedClockTowerSpec;
}

export function buildClockTowerNode(
  name: string,
  position: V3,
  yaw: number,
  dialGlow: number,
  snowCap: boolean,
  castShadow: boolean,
  batcher?: StaticTownBatcher
): AuraNodeBuilder<AuraGroupNode> {
  const materials: AuraMaterialSpec[] = [
    unnamed(material.pbr({ color: "#dfd3bc", roughness: 0.86, clearcoat: 0 })),
    unnamed(material.pbr({ color: "#bfb29a", roughness: 0.88, clearcoat: 0 })),
    unnamed(material.studioMetal({ color: snowCap ? "#dce5e8" : "#4b8c7d", roughness: snowCap ? 0.55 : 0.34, metallic: snowCap ? 0.25 : 0.78 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.2, metallic: 0.94 })),
    dialGlow > 0.08
      ? unnamed(material.emissive({ color: "#fff3d6", emissive: "#ffd58e", emissiveIntensity: dialGlow, practical: true }))
      : unnamed(material.ceramic({ color: "#fbf5e6", roughness: 0.28 }))
  ];
  return mountCompactMultiMaterial(name, clockTowerSpec(), materials, {
    position,
    rotation: [0, yaw, 0],
    castShadow,
    receiveShadow: true,
    batcher
  });
}

/* ------------------------------------------------------------------ 5. Striped Fresnel Coastal Lighthouse */

let cachedLighthouseSpec: AuraCustomGeometrySpec | null = null;

function lighthouseBodySpec(): AuraCustomGeometrySpec {
  if (cachedLighthouseSpec) return cachedLighthouseSpec;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };

  // Octagonal battered granite bastion (y = 0..4.2) + arched keeper portal
  const oct = (r: number, y: number): V3[] => Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    return [Math.cos(a) * r, y, Math.sin(a) * r] as V3;
  });
  push(0, loftSectionsMesh([oct(4.3, 0), oct(3.85, 3.9), oct(3.65, 4.25)], true, true));
  for (const s of archwayVoussoirSlots({ radius: 0.88, thickness: 0.26, depth: 0.4, voussoirs: 7, stoneMatA: 0, stoneMatB: 0, keystoneMat: 0 })) {
    push(0, transformMesh(s.mesh, { pos: [0, 1.85, 3.68] }));
  }

  // Alternating ivory (Slot 1) and crimson-vermilion (Slot 2) tapered lacquer masonry bands (y = 4.2..19.8)
  const bandCount = 5;
  for (let b = 0; b < bandCount; b += 1) {
    const t0 = b / bandCount, t1 = (b + 1) / bandCount;
    const y0 = 4.2 + t0 * 15.6, y1 = 4.2 + t1 * 15.6;
    const r0 = 3.25 * (1 - t0 * 0.34), r1 = 3.25 * (1 - t1 * 0.34);
    push(b % 2 === 0 ? 1 : 2, latheMesh([[r0, y0], [r0 * 1.005, y0 + 0.12], [r1 * 1.005, y1 - 0.12], [r1, y1]], 22));
  }

  // Corbelled stone watch gallery (y = 19.8..20.9) + wrought-iron handrail (Slot 3)
  push(0, latheMesh([[2.14, 19.75], [2.55, 20.15], [3.05, 20.55], [3.05, 20.95], [0, 20.95]], 22));
  const railRing: V4[] = Array.from({ length: 17 }, (_, k) => {
    const a = (k / 16) * Math.PI * 2;
    return [Math.cos(a) * 2.92, 21.85, Math.sin(a) * 2.92, 0.035];
  });
  push(3, tubeSweepMesh(railRing, 6));
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    const rx = Math.cos(a) * 2.92, rz = Math.sin(a) * 2.92;
    push(3, tubeSweepMesh([[rx, 20.92, rz, 0.03], [rx, 21.85, rz, 0.03]], 5));
  }

  // StudioGlass lantern room (Slot 5, y = 20.95..24.1) + helical astragals + Fresnel bullseye optic (Slot 6 & Slot 4 brass)
  push(5, latheMesh([[1.86, 20.95], [1.86, 24.05]], 20));
  for (let k = 0; k < 8; k += 1) {
    const a0 = (k / 8) * Math.PI * 2, a1 = a0 + 0.36;
    push(3, tubeSweepMesh([
      [Math.cos(a0) * 1.9, 20.95, Math.sin(a0) * 1.9, 0.03],
      [Math.cos(a1) * 1.9, 24.05, Math.sin(a1) * 1.9, 0.03]
    ], 5));
  }
  push(6, latheMesh([
    [0, 21.4], [0.95, 21.55], [1.18, 22.0], [1.05, 22.5], [1.22, 22.95], [0.92, 23.45], [0, 23.6]
  ], 18));
  push(4, latheMesh([[1.2, 21.95], [1.26, 22.05], [1.26, 22.95], [1.2, 23.05]], 18));

  // Patinated copper lantern dome, ventilator ball & lightning spire (Slot 7 & Slot 4)
  push(7, latheMesh([
    [2.12, 24.0], [1.95, 24.35], [1.35, 25.15], [0.45, 25.75], [0.36, 26.05], [0.12, 26.35], [0, 26.45]
  ], 20));
  push(4, tubeSweepMesh([[0, 26.4, 0, 0.04], [0, 27.6, 0, 0.015]], 6));

  cachedLighthouseSpec = buildGroupedGeometrySpec(slots);
  return cachedLighthouseSpec;
}

export function buildLighthouseNode(
  name: string,
  position: V3,
  yaw: number,
  beamIntensity: number,
  castShadow: boolean
): AuraNodeBuilder<AuraGroupNode> {
  const opticGlow = Math.max(0.65, beamIntensity * 3.4);
  const materials: AuraMaterialSpec[] = [
    unnamed(material.pbr({ color: "#9c958a", roughness: 0.9, clearcoat: 0 })),
    unnamed(material.lacquer({ color: "#f6efe2", roughness: 0.28, clearcoat: 0.82, clearcoatRoughness: 0.06 })),
    unnamed(material.lacquer({ color: "#b63226", roughness: 0.24, clearcoat: 0.9, clearcoatRoughness: 0.05 })),
    unnamed(material.studioMetal({ color: "#252b34", roughness: 0.38, metallic: 0.88 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.2, metallic: 0.94 })),
    unnamed(material.physical({ color: "#daf0fa", roughness: 0.03, opacity: 0.36, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, envMapIntensity: 1.65 })),
    unnamed(material.emissive({ color: "#fff0c4", emissive: "#ffd27d", emissiveIntensity: opticGlow, practical: true })),
    unnamed(material.studioMetal({ color: "#4b8c7d", roughness: 0.34, metallic: 0.78 }))
  ];
  const body = geometry.multiMaterial(lighthouseBodySpec(), materials, {
    name: `${name}-tower`,
    castShadow,
    receiveShadow: true
  });
  const beamLen = 26;
  const beamMat = lightBeamWithWgsl({
    color: "#ffe7ad",
    intensity: Math.max(0.08, beamIntensity),
    length: beamLen,
    falloff: 1.35,
    edgeSoftness: 1.5,
    noise: 0.28,
    noiseScale: 3.4,
    noiseSpeed: 0.22
  });
  const beamA = primitives.cone({
    name: `${name}-beam-a`,
    position: [0, 22.5, beamLen * 0.5],
    rotation: [-Math.PI * 0.5, 0, 0],
    params: { radius: 3.8, height: beamLen, radialSegments: 32, heightSegments: 8, openEnded: true },
    material: beamMat,
    castShadow: false,
    receiveShadow: false
  });
  const beamB = primitives.cone({
    name: `${name}-beam-b`,
    position: [0, 22.5, -beamLen * 0.5],
    rotation: [Math.PI * 0.5, 0, 0],
    params: { radius: 3.8, height: beamLen, radialSegments: 32, heightSegments: 8, openEnded: true },
    material: beamMat,
    castShadow: false,
    receiveShadow: false
  });
  return group(name, [body, beamA, beamB], { position, rotation: [0, yaw, 0] }).runtime({ id: name });
}

/* ------------------------------------------------------------------ 6. Banded Wooden Freight Crates & Luggage */

let cachedCratesSpec: CompactSlotSpecs | null = null;

function freightCratesSpec(): CompactSlotSpecs {
  if (cachedCratesSpec) return cachedCratesSpec;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };

  // Timber pallet skids + chamfered pine crates + diagonal bracing battens (Slot 0 & 1)
  for (const sx of [-0.52, 0, 0.52]) {
    push(1, transformMesh(bevelBoxMesh(0.14, 0.1, 1.48, 0.015), { pos: [sx, 0.05, 0] }));
  }
  push(0, transformMesh(bevelBoxMesh(1.38, 0.96, 1.18, 0.03), { pos: [-0.14, 0.58, -0.06] }));
  push(1, transformMesh(bevelBoxMesh(0.86, 0.68, 0.82, 0.025), { pos: [-0.2, 1.4, -0.08], rot: [0, 0.24, 0] }));
  for (const sz of [-1, 1] as const) {
    push(1, transformMesh(bevelBoxMesh(1.26, 0.09, 0.05, 0.01), {
      pos: [-0.14, 0.58, -0.06 + sz * 0.6], rot: [0, 0, 0.56 * sz]
    }));
  }
  // Forged iron corner strap bands (Slot 2)
  for (const cx of [-0.79, 0.51]) {
    for (const cz of [-0.62, 0.5]) {
      push(2, transformMesh(bevelBoxMesh(0.12, 0.98, 0.12, 0.012), { pos: [cx, 0.58, cz] }));
    }
  }
  // Domed leather steamer trunk (Slot 3 + Slot 4 brass clasps) + cinched canvas mailbag (Slot 5) + ceramic tag (Slot 6)
  push(3, transformMesh(bevelBoxMesh(0.84, 0.44, 0.54, 0.025), { pos: [0.64, 0.32, 0.28], rot: [0, -0.35, 0] }));
  const trunkLid: V3[][] = [-0.42, 0, 0.42].map((lx) => [
    [lx, 0.52, -0.27], [lx, 0.52, 0.27], [lx, 0.64, 0.22], [lx, 0.68, 0], [lx, 0.64, -0.22]
  ]);
  push(3, transformMesh(loftSectionsMesh(trunkLid, true, false), { pos: [0.64, 0, 0.28], rot: [0, -0.35, 0] }));
  for (const off of [-0.22, 0.22]) {
    push(4, transformMesh(bevelBoxMesh(0.06, 0.14, 0.58, 0.01), {
      pos: [0.64 + off * 0.9, 0.5, 0.28 + off * 0.32], rot: [0, -0.35, 0]
    }));
  }
  push(5, transformMesh(latheMesh([
    [0, 0], [0.26, 0.04], [0.3, 0.28], [0.24, 0.58], [0.09, 0.74], [0.15, 0.84], [0, 0.86]
  ], 14), { pos: [0.46, 0.1, -0.44], rot: [0.12, 0, -0.1] }));
  push(6, transformMesh(bevelBoxMesh(0.18, 0.12, 0.02, 0.004), { pos: [-0.14, 0.72, 0.55] }));

  cachedCratesSpec = buildCompactSlotSpecs(slots);
  return cachedCratesSpec;
}

export function buildFreightCratesNode(
  name: string,
  position: V3,
  yaw: number,
  castShadow: boolean,
  batcher?: StaticTownBatcher
): AuraNodeBuilder<AuraGroupNode> {
  const materials: AuraMaterialSpec[] = [
    unnamed(material.pbr({ color: "#b58450", roughness: 0.78, clearcoat: 0 })),
    unnamed(material.pbr({ color: "#805632", roughness: 0.82, clearcoat: 0 })),
    unnamed(material.studioMetal({ color: "#2d333d", roughness: 0.38, metallic: 0.88 })),
    unnamed(material.pbr({ color: "#5e3621", roughness: 0.64, clearcoat: 0 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.22, metallic: 0.94 })),
    unnamed(material.fabric({ color: "#d9ccb2", roughness: 0.9, sheen: 0.5, sheenColor: "#fff8ea" })),
    unnamed(material.ceramic({ color: "#f6efe0", roughness: 0.32 }))
  ];
  return mountCompactMultiMaterial(name, freightCratesSpec(), materials, {
    position,
    rotation: [0, yaw, 0],
    castShadow,
    receiveShadow: true,
    batcher
  });
}

/* ------------------------------------------------------------------ 7. Wrought-Iron Swan-Neck Platform Lamp Post */

let cachedSwanLampSpec: CompactSlotSpecs | null = null;

function swanNeckLampSpec(): CompactSlotSpecs {
  if (cachedSwanLampSpec) return cachedSwanLampSpec;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };

  // Slot 0: Fluted cast-iron pedestal & tapered standard (y = 0..3.35) + swan-neck crook & volute scroll brace
  push(0, latheMesh([
    [0.34, 0], [0.32, 0.18], [0.24, 0.32], [0.22, 0.88], [0.16, 1.02],
    [0.125, 2.2], [0.1, 3.25], [0.14, 3.34], [0, 3.36]
  ], 14));
  push(0, tubeSweepMesh([
    [0, 3.3, 0, 0.068], [0, 3.82, -0.04, 0.056], [0, 4.22, -0.24, 0.048],
    [0, 4.3, -0.54, 0.044], [0, 4.14, -0.78, 0.04], [0, 3.92, -0.84, 0.038]
  ], 8));
  push(0, tubeSweepMesh([
    [0, 2.78, -0.06, 0.028], [0, 3.16, -0.34, 0.026],
    [0, 3.58, -0.44, 0.024], [0, 3.96, -0.32, 0.024]
  ], 6));

  // Slot 1: Brass collar rings + copper pagoda lantern cap (Slot 2) + studioGlass cage (Slot 3) + sodium bulb (Slot 4)
  push(1, latheMesh([[0.15, 2.16], [0.165, 2.22], [0.15, 2.28]], 12));
  push(2, transformMesh(latheMesh([
    [0.34, 0], [0.22, 0.12], [0.09, 0.24], [0.04, 0.34], [0, 0.36]
  ], 6, true), { pos: [0, 3.78, -0.84] }));
  push(3, transformMesh(latheMesh([[0.16, 0], [0.27, 0.38], [0.25, 0.42]], 6, true), { pos: [0, 3.36, -0.84] }));
  push(0, transformMesh(latheMesh([[0, 0], [0.16, 0.02], [0.18, 0.08], [0, 0.09]], 6, true), { pos: [0, 3.3, -0.84] }));
  push(4, transformMesh(latheMesh([[0, 0], [0.11, 0.06], [0.12, 0.18], [0, 0.24]], 12), { pos: [0, 3.46, -0.84] }));

  cachedSwanLampSpec = buildCompactSlotSpecs(slots);
  return cachedSwanLampSpec;
}

export function buildSwanNeckLampNode(
  name: string,
  position: V3,
  yaw: number,
  bulbGlow: number,
  castShadow: boolean,
  batcher?: StaticTownBatcher
): AuraNodeBuilder<AuraGroupNode> {
  const materials: AuraMaterialSpec[] = [
    unnamed(material.studioMetal({ color: "#252b34", roughness: 0.38, metallic: 0.88 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.22, metallic: 0.94 })),
    unnamed(material.studioMetal({ color: "#4c8b7c", roughness: 0.34, metallic: 0.78 })),
    unnamed(material.physical({ color: "#ffefd2", roughness: 0.05, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, envMapIntensity: 1.55 })),
    unnamed(material.emissive({ color: "#ffe0a6", emissive: "#ffc470", emissiveIntensity: Math.max(0.35, bulbGlow), practical: true }))
  ];
  return mountCompactMultiMaterial(name, swanNeckLampSpec(), materials, {
    position,
    rotation: [0, yaw, 0],
    castShadow: false,
    receiveShadow: false,
    batcher
  });
}

/* ------------------------------------------------------------------ 8. Stratified Sky-Island Undercroft & Instanced Coastal Flora */

let cachedUndercroftSpec: AuraCustomGeometrySpec | null = null;
let cachedTrunkSpec: AuraCustomGeometrySpec | null = null;
let cachedCanopySpec: AuraCustomGeometrySpec | null = null;
let cachedPineSpec: AuraCustomGeometrySpec | null = null;
let cachedBoulderSpec: AuraCustomGeometrySpec | null = null;
let cachedBushSpec: AuraCustomGeometrySpec | null = null;
let cachedCloudPuffSpec: AuraCustomGeometrySpec | null = null;
let cachedLanternSpec: AuraCustomGeometrySpec | null = null;

/** Inverted `stratifiedCliffMesh` basalt crags + `material.strata` (paired WGSL twin) for `island-rocks`. */
export function buildIslandUndercroftNode(
  transforms: readonly AuraTransformSpec[],
  useStrata: boolean,
  receiveShadow: boolean
): AuraNodeBuilder<AuraPrimitiveNode> {
  if (!cachedUndercroftSpec) {
    const main = stratifiedCliffMesh({ radiusX: 68, radiusZ: 68, height: 108, terraces: 7, seed: 37 });
    const spireA = transformMesh(stratifiedCliffMesh({ radiusX: 24, radiusZ: 22, height: 64, terraces: 4, seed: 73 }), { pos: [26, 22, -18] });
    const spireB = transformMesh(stratifiedCliffMesh({ radiusX: 22, radiusZ: 25, height: 58, terraces: 4, seed: 109 }), { pos: [-24, 26, 22] });
    cachedUndercroftSpec = mergeRawMeshes([
      transformMesh(main, { pos: [0, -54, 0] }),
      transformMesh(spireA, { pos: [0, -54, 0] }),
      transformMesh(spireB, { pos: [0, -54, 0] })
    ]);
  }
  return instances.custom(cachedUndercroftSpec, {
    name: "island-rocks",
    transforms,
    material: useStrata
      ? strataUndercroftMaterial()
      : unnamed(material.pbr({ color: "#8c8380", roughness: 0.94, clearcoat: 0 })),
    castShadow: false,
    receiveShadow
  });
}

export function buildCoastalTreeTrunkSpec(): AuraCustomGeometrySpec {
  if (cachedTrunkSpec) return cachedTrunkSpec;
  cachedTrunkSpec = mergeRawMeshes([
    tubeSweepMesh([
      [0, -1.6, 0, 0.44], [0.06, -0.6, 0.04, 0.3], [-0.04, 0.5, -0.03, 0.24], [0.08, 1.6, 0.05, 0.18]
    ], 7, true),
    tubeSweepMesh([[-0.02, 0.55, 0, 0.15], [-0.58, 1.45, 0.24, 0.09]], 5, true),
    tubeSweepMesh([[0.04, 0.75, 0, 0.14], [0.54, 1.55, -0.22, 0.08]], 5, true)
  ]);
  return cachedTrunkSpec;
}

export function buildBroadleafCanopySpec(): AuraCustomGeometrySpec {
  if (cachedCanopySpec) return cachedCanopySpec;
  const raw = layeredCanopyMesh({ radius: 2.82, height: 4.6, puffs: 12, seed: 43 });
  cachedCanopySpec = mergeRawMeshes([transformMesh(raw, { pos: [0, -2.15, 0] })]);
  return cachedCanopySpec;
}

export function buildCoastalPineSpec(): AuraCustomGeometrySpec {
  if (cachedPineSpec) return cachedPineSpec;
  const raw = coniferBoughTierMesh({ baseRadius: 2.08, height: 6.75, tiers: 6, seed: 61 });
  cachedPineSpec = mergeRawMeshes([transformMesh(raw, { pos: [0, -3.2, 0] })]);
  return cachedPineSpec;
}

export function buildCoastalBoulderSpec(): AuraCustomGeometrySpec {
  if (cachedBoulderSpec) return cachedBoulderSpec;
  const raw = toFlatShaded(transformMesh(icosphereFacetMesh(1.45, 1, 0.22, 89), { scale: [1.14, 0.74, 0.98] }));
  cachedBoulderSpec = mergeRawMeshes([raw]);
  return cachedBoulderSpec;
}

export function buildCoastalBushSpec(): AuraCustomGeometrySpec {
  if (cachedBushSpec) return cachedBushSpec;
  const raw = layeredCanopyMesh({ radius: 1.28, height: 1.78, puffs: 9, seed: 97 });
  cachedBushSpec = mergeRawMeshes([transformMesh(raw, { pos: [0, -0.82, 0] })]);
  return cachedBushSpec;
}

export function buildCloudPuffSpec(): AuraCustomGeometrySpec {
  if (cachedCloudPuffSpec) return cachedCloudPuffSpec;
  cachedCloudPuffSpec = mergeRawMeshes([
    transformMesh(icosphereFacetMesh(1.05, 1, 0.08, 19), { scale: [1.15, 0.52, 1.05] }),
    transformMesh(icosphereFacetMesh(0.76, 1, 0.08, 31), { pos: [0.74, -0.06, 0.18], scale: [1.05, 0.48, 0.95] }),
    transformMesh(icosphereFacetMesh(0.72, 1, 0.08, 53), { pos: [-0.68, -0.08, -0.15], scale: [1.0, 0.46, 0.95] })
  ]);
  return cachedCloudPuffSpec;
}

export function buildSkyLanternSpec(): AuraCustomGeometrySpec {
  if (cachedLanternSpec) return cachedLanternSpec;
  cachedLanternSpec = mergeRawMeshes([
    latheMesh([
      [0.24, -0.58], [0.38, -0.34], [0.48, 0.12], [0.42, 0.46], [0.18, 0.6], [0, 0.62]
    ], 10, true)
  ]);
  return cachedLanternSpec;
}

/* ------------------------------------------------------------------ 9. Coastal Stone Keep & Watchtower Landmarks (Zero GLBs) */

const landmarkSpecCache = new Map<"keep" | "tower", CompactSlotSpecs>();

function coastalLandmarkSpec(variant: "keep" | "tower"): CompactSlotSpecs {
  const hit = landmarkSpecCache.get(variant);
  if (hit) return hit;

  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };
  const boxLoft = (wx: number, wy: number, wz: number, pos: V3, yaw = 0): RawMesh => {
    const hx = wx * 0.5, hy = wy * 0.5, hz = wz * 0.5;
    const ring = (y: number): V3[] => [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]];
    return transformMesh(toFlatShaded(loftSectionsMesh([ring(-hy), ring(hy)], true, true)), { pos, rot: [0, yaw, 0] });
  };

  if (variant === "keep") {
    // Stepped dressed-limestone plinth + cream-stucco battered keep bastion + crenellated parapet + terracotta hipped turret roof
    const sq = (half: number, y: number): V3[] => [[-half, y, -half], [half, y, -half], [half, y, half], [-half, y, half]];
    push(1, boxLoft(12.2, 2.2, 12.2, [0, 1.1, 0]));
    push(0, toFlatShaded(loftSectionsMesh([sq(5.4, 2.0), sq(4.95, 13.5), sq(4.65, 21.6)], true, true)));
    push(1, boxLoft(10.2, 0.65, 10.2, [0, 21.8, 0]));
    for (let f = 0; f < 4; f += 1) {
      const yaw = f * Math.PI * 0.5;
      const sx = Math.sin(yaw), sz = Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      for (const off of [-3.3, 0, 3.3]) {
        push(1, boxLoft(1.45, 1.15, 0.72, [sx * 4.65 + rx * off, 22.65, sz * 4.65 + rz * off], yaw));
      }
      for (const wy of [9.5, 16.5]) {
        push(3, boxLoft(1.15, 2.4, 0.18, [sx * 4.88, wy, sz * 4.88], yaw));
        push(1, boxLoft(1.55, 0.24, 0.42, [sx * 4.98, wy - 1.28, sz * 4.98], yaw));
      }
    }
    push(0, latheMesh([[3.1, 22.0], [2.95, 25.4], [0, 25.4]], 8, true));
    push(2, latheMesh([[3.55, 25.2], [1.65, 27.6], [0.24, 29.3], [0, 29.5]], 8, true));
    push(4, tubeSweepMesh([[0, 29.4, 0, 0.06], [0, 30.6, 0, 0.02]], 5));
  } else {
    // Tall cylindrical cream-stucco coastal watchtower (`height ~ 34 m`) with corbelled machicolations & conical terracotta roof
    push(1, latheMesh([[5.4, 0], [5.1, 2.4], [4.6, 2.8], [0, 2.8]], 12));
    push(0, latheMesh([[4.35, 2.6], [3.95, 14.0], [3.65, 24.8], [0, 24.8]], 12));
    push(1, latheMesh([[3.65, 13.8], [3.95, 14.1], [3.65, 14.4]], 12));
    push(1, latheMesh([[3.65, 24.6], [4.35, 25.4], [4.45, 26.5], [0, 26.5]], 12));
    for (let m = 0; m < 8; m += 1) {
      const a = (m / 8) * Math.PI * 2;
      push(1, boxLoft(1.2, 1.1, 0.65, [Math.sin(a) * 4.12, 27.0, Math.cos(a) * 4.12], a));
    }
    for (let w = 0; w < 4; w += 1) {
      const a = w * Math.PI * 0.5 + 0.35;
      for (const wy of [10.5, 19.2]) {
        const rr = wy < 15 ? 4.08 : 3.78;
        push(3, boxLoft(0.95, 2.2, 0.2, [Math.sin(a) * rr, wy, Math.cos(a) * rr], a));
      }
    }
    push(0, latheMesh([[2.85, 26.4], [2.75, 29.4], [0, 29.4]], 10));
    push(2, latheMesh([[3.45, 29.2], [1.75, 31.8], [0.22, 33.6], [0, 33.8]], 12));
    push(4, tubeSweepMesh([[0, 33.7, 0, 0.06], [0, 34.9, 0, 0.02]], 5));
  }

  const spec = buildCompactSlotSpecs(slots);
  landmarkSpecCache.set(variant, spec);
  return spec;
}

export function buildCoastalLandmarkNode(
  variant: "keep" | "tower",
  name: string,
  position: V3,
  yaw: number,
  windowGlow: number,
  snowCap: boolean,
  castShadow: boolean,
  batcher?: StaticTownBatcher
): AuraNodeBuilder<AuraGroupNode> {
  const lit = windowGlow > 0.05;
  const materials: AuraMaterialSpec[] = [
    unnamed(material.pbr({ color: "#ecdcc0", roughness: 0.86, clearcoat: 0 })),
    unnamed(material.pbr({ color: "#c8baa2", roughness: 0.88, clearcoat: 0 })),
    unnamed(material.ceramic({ color: snowCap ? "#eef1f4" : "#c4643f", roughness: snowCap ? 0.62 : 0.48 })),
    lit
      ? unnamed(material.emissive({ color: "#ffe2a6", emissive: "#ffc972", emissiveIntensity: windowGlow, practical: true }))
      : unnamed(material.physical({ color: "#3d5568", roughness: 0.08, opacity: 0.82, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.5, envMapIntensity: 1.4 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.22, metallic: 0.94 }))
  ];
  return mountCompactMultiMaterial(name, coastalLandmarkSpec(variant), materials, {
    position,
    rotation: [0, yaw, 0],
    castShadow,
    receiveShadow: true,
    batcher
  });
}
