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
  type AuraGroupNode,
  type AuraMaterialSpec,
  type AuraPrimitiveNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
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

/* ------------------------------------------------------------------ 1. Hero Ghibli Coastal Electric Streetcar */

function coachCrossRing(z: number, halfW: number, yBot: number, yWaist: number, cornerR: number): V3[] {
  const w0 = halfW - cornerR;
  const wTop = halfW * 0.985;
  const wMid = halfW * 1.03;
  return [
    [-w0, yBot, z],
    [w0, yBot, z],
    [halfW, yBot + 0.14, z],
    [wMid, (yBot + yWaist) * 0.52, z],
    [wTop, yWaist, z],
    [-wTop, yWaist, z],
    [-wMid, (yBot + yWaist) * 0.52, z],
    [-halfW, yBot + 0.14, z]
  ];
}

function camberedRoofRing(z: number, halfW: number, yEave: number, crown: number): V3[] {
  return [
    [-halfW, yEave - 0.06, z],
    [halfW, yEave - 0.06, z],
    [halfW * 0.96, yEave + 0.03, z],
    [halfW * 0.56, yEave + crown * 0.74, z],
    [0, yEave + crown, z],
    [-halfW * 0.56, yEave + crown * 0.74, z],
    [-halfW * 0.96, yEave + 0.03, z]
  ];
}

let cachedStreetcarSlots: readonly MultiMatSlot[] | null = null;

function streetcarSlots(): readonly MultiMatSlot[] {
  if (cachedStreetcarSlots) return cachedStreetcarSlots;
  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };

  // Slot 0: Vermilion-cherry lacquer lower coach with curved bow/stern dash aprons & tumblehome
  const zStations: readonly [number, number][] = [
    [-4.9, 0.92], [-4.72, 1.24], [-4.4, 1.44], [-3.4, 1.48], [0, 1.49],
    [3.4, 1.48], [4.4, 1.44], [4.72, 1.24], [4.9, 0.92]
  ];
  push(0, loftSectionsMesh(zStations.map(([z, hw]) => coachCrossRing(z, hw, 0.76, 1.92, 0.14)), true, false));
  for (const sgn of [-1, 1] as const) {
    push(0, transformMesh(bevelBoxMesh(1.9, 0.24, 0.14, 0.03), { pos: [0, 0.68, sgn * 4.86] }));
  }

  // Slot 1: Cream lacquer upper saloon pillars, arched window headers, cab aprons & clerestory monitor walls
  for (const sgn of [-1, 1] as const) {
    const cabSections = [
      coachCrossRing(sgn * 4.28, 1.44, 1.9, 3.38, 0.12),
      coachCrossRing(sgn * 4.64, 1.28, 1.9, 3.36, 0.12),
      coachCrossRing(sgn * 4.82, 0.96, 1.92, 3.32, 0.1)
    ];
    push(1, loftSectionsMesh(sgn > 0 ? cabSections : [...cabSections].reverse(), true, false));
  }
  const pillarZ = [-3.95, -2.62, -1.3, 0, 1.3, 2.62, 3.95];
  for (const side of [-1, 1] as const) {
    for (const pz of pillarZ) {
      push(1, transformMesh(bevelBoxMesh(0.11, 1.48, 0.2, 0.025), { pos: [side * 1.43, 2.65, pz] }));
    }
    push(1, transformMesh(bevelBoxMesh(0.12, 0.22, 8.2, 0.025), { pos: [side * 1.43, 3.3, 0] }));
    for (let b = 0; b < pillarZ.length - 1; b += 1) {
      const midZ = (pillarZ[b]! + pillarZ[b + 1]!) * 0.5;
      for (const s of archwayVoussoirSlots({ radius: 0.48, thickness: 0.12, depth: 0.1, voussoirs: 5, stoneMatA: 1, stoneMatB: 1, keystoneMat: 6 })) {
        push(s.materialIndex, transformMesh(s.mesh, { pos: [side * 1.43, 2.84, midZ], rot: [0, Math.PI * 0.5, 0] }));
      }
    }
  }
  push(1, loftSectionsMesh([
    coachCrossRing(-3.82, 0.78, 3.64, 4.06, 0.08),
    coachCrossRing(-3.45, 0.98, 3.64, 4.08, 0.08),
    coachCrossRing(3.45, 0.98, 3.64, 4.08, 0.08),
    coachCrossRing(3.82, 0.78, 3.64, 4.06, 0.08)
  ], true, false));

  // Slot 2: Harbor-teal waist beltline molding & destination headboard frames
  const beltPts: V4[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const sx = Math.cos(a), sz = Math.sin(a);
    const rx = 1.5 * Math.sign(sx) * Math.pow(Math.abs(sx), 0.55);
    const rz = 4.92 * Math.sign(sz) * Math.pow(Math.abs(sz), 0.72);
    beltPts.push([rx, 1.92, rz, 0.045]);
  }
  push(2, tubeSweepMesh(beltPts, 8, false));
  for (const sgn of [-1, 1] as const) {
    push(2, transformMesh(bevelBoxMesh(1.48, 0.3, 0.14, 0.025), { pos: [0, 3.52, sgn * 4.72] }));
  }

  // Slot 3: Teak & mahogany cambered clerestory roof, rooftop duckboards, slatted floor & passenger benches
  push(3, loftSectionsMesh([
    camberedRoofRing(-4.95, 1.05, 3.36, 0.24),
    camberedRoofRing(-4.35, 1.54, 3.38, 0.3),
    camberedRoofRing(0, 1.56, 3.38, 0.32),
    camberedRoofRing(4.35, 1.54, 3.38, 0.3),
    camberedRoofRing(4.95, 1.05, 3.36, 0.24)
  ], true, false));
  push(3, loftSectionsMesh([
    camberedRoofRing(-3.92, 0.84, 4.05, 0.16),
    camberedRoofRing(-3.4, 1.06, 4.06, 0.2),
    camberedRoofRing(3.4, 1.06, 4.06, 0.2),
    camberedRoofRing(3.92, 0.84, 4.05, 0.16)
  ], true, false));
  for (const x of [-0.3, 0, 0.3]) {
    push(3, transformMesh(bevelBoxMesh(0.14, 0.04, 6.4, 0.01), { pos: [x, 4.27, 0] }));
  }
  push(3, transformMesh(bevelBoxMesh(2.74, 0.08, 8.8, 0.02), { pos: [0, STREETCAR_FLOOR_Y, 0] }));
  for (const side of [-1, 1] as const) {
    push(3, transformMesh(bevelBoxMesh(0.64, 0.1, 7.5, 0.02), { pos: [side * 1.02, 1.3, 0] }));
    push(3, transformMesh(bevelBoxMesh(0.09, 0.52, 7.5, 0.02), { pos: [side * 1.31, 1.6, 0] }));
    for (const legZ of [-3.4, -1.7, 0, 1.7, 3.4]) {
      push(3, transformMesh(bevelBoxMesh(0.5, 0.44, 0.08, 0.015), { pos: [side * 1.02, 1.04, legZ] }));
    }
  }

  // Slot 4 & 5: Cast-iron bogie trucks, slatted cowcatchers, diamond pantograph & flanged steel wheels
  const wheelProfile: V2[] = [
    [0, -0.09], [0.44, -0.09], [0.44, -0.055], [0.39, -0.04],
    [0.38, 0.08], [0.31, 0.085], [0.28, 0.045], [0.13, 0.05], [0.13, 0.1], [0, 0.1]
  ];
  for (const bogieZ of [-3.1, 3.1]) {
    for (const side of [-1, 1] as const) {
      push(4, transformMesh(bevelBoxMesh(0.12, 0.24, 1.75, 0.025), { pos: [side * 0.9, 0.44, bogieZ] }));
      push(4, transformMesh(latheMesh([[0, 0], [0.11, 0], [0.12, 0.22], [0, 0.22]], 10), { pos: [side * 0.9, 0.54, bogieZ] }));
    }
    push(4, transformMesh(bevelBoxMesh(1.88, 0.18, 0.34, 0.025), { pos: [0, 0.52, bogieZ] }));
    for (const dz of [-0.54, 0.54]) {
      const az = bogieZ + dz;
      push(4, transformMesh(tubeSweepMesh([[-0.84, 0.39, az, 0.065], [0.84, 0.39, az, 0.065]], 8), {}));
      for (const side of [-1, 1] as const) {
        push(5, transformMesh(latheMesh(wheelProfile, 22), {
          pos: [side * 0.72, 0.39, az],
          rot: [0, 0, side < 0 ? -Math.PI * 0.5 : Math.PI * 0.5]
        }));
        for (const ws of wheelAssemblySlots({ radius: 0.34, width: 0.12, spokeCount: 6, tireMat: 4, rimMat: 5 })) {
          push(ws.materialIndex, transformMesh(ws.mesh, { pos: [side * 0.72, 0.39, az] }));
        }
      }
    }
  }
  // Cowcatcher pilots
  for (const sgn of [-1, 1] as const) {
    push(4, transformMesh(tubeSweepMesh([[-1.08, 0.26, sgn * 4.92, 0.035], [0, 0.22, sgn * 5.14, 0.04], [1.08, 0.26, sgn * 4.92, 0.035]], 6), {}));
    for (let k = -4; k <= 4; k += 1) {
      const x = k * 0.24;
      const zOut = sgn * (5.12 - Math.abs(k) * 0.045);
      push(4, tubeSweepMesh([[x * 0.92, 0.64, sgn * 4.82, 0.022], [x, 0.25, zOut, 0.022]], 5));
    }
  }
  // Rooftop diamond pantograph + porcelain insulators (Slot 11)
  const panZ = -1.15;
  for (const [ix, iz] of [[-0.42, panZ - 0.32], [0.42, panZ - 0.32], [-0.42, panZ + 0.32], [0.42, panZ + 0.32]] as const) {
    push(11, transformMesh(latheMesh([[0, 0], [0.065, 0], [0.05, 0.06], [0.07, 0.1], [0.04, 0.16], [0, 0.17]], 10), { pos: [ix, 4.26, iz] }));
  }
  push(4, transformMesh(bevelBoxMesh(0.96, 0.05, 0.74, 0.012), { pos: [0, 4.43, panZ] }));
  for (const sx of [-0.36, 0.36]) {
    push(4, tubeSweepMesh([[sx, 4.45, panZ, 0.022], [sx * 0.95, 4.6, panZ - 0.52, 0.02], [sx * 0.88, 4.74, panZ, 0.018]], 6));
    push(4, tubeSweepMesh([[sx, 4.45, panZ, 0.022], [sx * 0.95, 4.6, panZ + 0.52, 0.02], [sx * 0.88, 4.74, panZ, 0.018]], 6));
  }
  push(6, tubeSweepMesh([[-0.88, 4.7, panZ, 0.02], [-0.66, 4.76, panZ, 0.026], [0.66, 4.76, panZ, 0.026], [0.88, 4.7, panZ, 0.02]], 7));

  // Slot 6 & 7: Polished brass grab-rails, cyclops headlamp bezel, roof bell, bumpers & rubber buffers
  for (const side of [-1, 1] as const) {
    for (const doorZ of [-4.18, 4.18]) {
      push(6, tubeSweepMesh([
        [side * 1.47, 1.05, doorZ, 0.024],
        [side * 1.54, 1.62, doorZ + Math.sign(doorZ) * 0.05, 0.024],
        [side * 1.48, 2.38, doorZ, 0.024]
      ], 7));
    }
    push(6, tubeSweepMesh([[side * 1.51, 1.58, -4.2, 0.022], [side * 1.51, 1.58, 4.2, 0.022]], 6));
  }
  // Spun-brass cyclops headlamp housing & rear marker bezels
  push(6, transformMesh(latheMesh([[0, -0.14], [0.25, -0.14], [0.27, 0.04], [0.29, 0.12], [0.22, 0.14], [0.21, 0.04]], 18), {
    pos: [0, 1.4, 4.9], rot: [Math.PI * 0.5, 0, 0]
  }));
  for (const x of [-0.86, 0.86]) {
    push(6, transformMesh(latheMesh([[0, -0.06], [0.14, -0.06], [0.16, 0.06], [0.11, 0.07]], 14), {
      pos: [x, 1.36, -4.88], rot: [-Math.PI * 0.5, 0, 0]
    }));
  }
  // Spun-brass rooftop signal bell
  push(6, transformMesh(latheMesh([[0.16, 0], [0.13, 0.05], [0.11, 0.15], [0.06, 0.21], [0, 0.23]], 14), { pos: [0, 4.28, 3.42] }));
  // Brass bumpers & black rubber coupler pads
  for (const sgn of [-1, 1] as const) {
    push(6, tubeSweepMesh([[-1.18, 0.75, sgn * 4.86, 0.075], [0, 0.75, sgn * 5.03, 0.085], [1.18, 0.75, sgn * 4.86, 0.075]], 8));
    push(7, transformMesh(latheMesh([[0, 0], [0.15, 0], [0.17, 0.12], [0.12, 0.16], [0, 0.16]], 12), {
      pos: [0, 0.72, sgn * 5.04], rot: [sgn > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0, 0]
    }));
  }

  // Slot 8: StudioGlass bay windscreens, arched side passenger panes & clerestory transoms
  const sideWinPoly: V2[] = [[-0.5, -0.48], [0.5, -0.48], [0.5, 0.34], [0.34, 0.52], [0, 0.58], [-0.34, 0.52], [-0.5, 0.34]];
  for (const side of [-1, 1] as const) {
    for (let b = 0; b < pillarZ.length - 1; b += 1) {
      const midZ = (pillarZ[b]! + pillarZ[b + 1]!) * 0.5;
      push(8, transformMesh(extrudePolygonMesh(sideWinPoly, 0.03, 0.005), { pos: [side * 1.42, 2.52, midZ], rot: [0, Math.PI * 0.5, 0] }));
    }
    push(8, transformMesh(bevelBoxMesh(0.03, 0.26, 6.8, 0.005), { pos: [side * 0.96, 3.86, 0] }));
  }
  for (const sgn of [-1, 1] as const) {
    push(8, transformMesh(bevelBoxMesh(1.66, 0.92, 0.035, 0.008), { pos: [0, 2.66, sgn * 4.78] }));
  }

  // Slot 9 & 10: Practical warm 2700K interior ceiling globes, rollsigns, headlamp optic & ruby taillamps
  for (const lz of [-2.7, 0, 2.7]) {
    push(9, transformMesh(latheMesh([[0, 0], [0.16, 0.04], [0.2, 0.14], [0.12, 0.24], [0, 0.26]], 12), { pos: [0, 3.68, lz] }));
  }
  push(9, transformMesh(bevelBoxMesh(1.12, 0.22, 7.1, 0.02), { pos: [0, 3.44, 0] }));
  for (const sgn of [-1, 1] as const) {
    push(9, transformMesh(bevelBoxMesh(1.26, 0.18, 0.04, 0.008), { pos: [0, 3.52, sgn * 4.79] }));
  }
  push(9, transformMesh(latheMesh([[0, 0], [0.2, 0.02], [0.18, 0.07], [0, 0.09]], 16), { pos: [0, 1.4, 4.94], rot: [Math.PI * 0.5, 0, 0] }));
  for (const x of [-0.86, 0.86]) {
    push(10, transformMesh(latheMesh([[0, 0], [0.1, 0.02], [0.09, 0.05], [0, 0.06]], 12), { pos: [x, 1.36, -4.92], rot: [-Math.PI * 0.5, 0, 0] }));
  }

  cachedStreetcarSlots = slots;
  return slots;
}

export function buildStreetcarBodyNode(name: string, bulbIntensity: number, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  const glowGain = Math.max(0.45, bulbIntensity * 1.15);
  const materials: AuraMaterialSpec[] = [
    unnamed(material.lacquer({ color: "#9e2f22", roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.45 })),
    unnamed(material.lacquer({ color: "#efe3c8", roughness: 0.25, clearcoat: 0.88, clearcoatRoughness: 0.05, envMapIntensity: 1.3 })),
    unnamed(material.lacquer({ color: "#24586c", roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.05 })),
    unnamed(material.pbr({ color: "#72492d", roughness: 0.68, clearcoat: 0 })),
    unnamed(material.studioMetal({ color: "#2a303a", roughness: 0.36, metallic: 0.88 })),
    unnamed(material.studioMetal({ color: "#d4dce4", roughness: 0.18, metallic: 0.96 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.2, metallic: 0.94, envMapIntensity: 1.6 })),
    unnamed(material.blackRubber({ color: "#1f2226", roughness: 0.84 })),
    unnamed(material.physical({ color: "#d6eef8", roughness: 0.04, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, envMapIntensity: 1.6 })),
    unnamed(material.emissive({ color: "#ffe3b3", emissive: "#ffbe68", emissiveIntensity: glowGain, practical: true })),
    unnamed(material.emissive({ color: "#ff5644", emissive: "#ff3b28", emissiveIntensity: Math.max(0.75, bulbIntensity * 0.9), practical: true })),
    unnamed(material.ceramic({ color: "#f2ede2", roughness: 0.22 }))
  ];
  return assembleMultiMaterialNode(name, streetcarSlots(), materials, {
    id: name,
    castShadow,
    receiveShadow: true
  });
}

/** Sculpted curved trim meshes for `TRAM_FX_IDS` (`tramCoachTrim` in `world.ts`). */
export function buildTramCoachTrimRawParts(): {
  readonly lacquer: RawMesh;
  readonly brass: RawMesh;
  readonly glow: RawMesh;
  readonly glass: RawMesh;
} {
  const lacquerParts: RawMesh[] = [];
  const brassParts: RawMesh[] = [];
  const glowParts: RawMesh[] = [];
  const glassParts: RawMesh[] = [];
  for (const sgn of [-1, 1] as const) {
    lacquerParts.push(tubeSweepMesh([[sgn * 1.49, 1.04, -4.4, 0.04], [sgn * 1.5, 1.04, 0, 0.045], [sgn * 1.49, 1.04, 4.4, 0.04]], 6));
    brassParts.push(tubeSweepMesh([[sgn * 1.52, 1.56, -4.45, 0.028], [sgn * 1.53, 1.56, 0, 0.03], [sgn * 1.52, 1.56, 4.45, 0.028]], 6));
    for (let r = -4; r <= 4; r += 1) {
      brassParts.push(transformMesh(latheMesh([[0, 0], [0.025, 0.01], [0.018, 0.03], [0, 0.035]], 8), {
        pos: [sgn * 1.53, 1.56, r * 1.05], rot: [0, 0, -sgn * Math.PI * 0.5]
      }));
    }
    glassParts.push(transformMesh(bevelBoxMesh(0.025, 0.3, 7.2, 0.004), { pos: [sgn * 1.46, 3.3, 0] }));
  }
  for (const z of [4.9, -4.9]) {
    brassParts.push(tubeSweepMesh([[-1.22, 0.74, z * 0.98, 0.06], [0, 0.74, z, 0.07], [1.22, 0.74, z * 0.98, 0.06]], 7));
    glowParts.push(transformMesh(bevelBoxMesh(1.12, 0.12, 0.06, 0.01), { pos: [0, 3.52, z * 0.97] }));
  }
  glowParts.push(transformMesh(bevelBoxMesh(1.04, 0.1, 6.8, 0.015), { pos: [0, 3.38, 0] }));
  const join = (list: readonly RawMesh[]): RawMesh => {
    const spec = mergeRawMeshes(list);
    return {
      positions: Array.from(spec.positions as Float32Array),
      normals: Array.from((spec.normals ?? new Float32Array(spec.positions.length)) as Float32Array),
      uvs: Array.from((spec.uvs ?? new Float32Array((spec.positions.length / 3) * 2)) as Float32Array),
      indices: Array.from(spec.indices as Uint16Array | Uint32Array)
    };
  };
  return {
    lacquer: join(lacquerParts),
    brass: join(brassParts),
    glow: join(glowParts),
    glass: join(glassParts)
  };
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
    receiveShadow: boolean
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
      readonly meshes: RawMesh[];
    }
  >();
  return {
    addSlot(mat, rawMeshes, transform, castShadow, receiveShadow) {
      const key = `${JSON.stringify(mat)}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: mat, castShadow, receiveShadow, meshes: [] };
        buckets.set(key, bucket);
      }
      for (const m of rawMeshes) {
        bucket.meshes.push(transformMesh(m, transform));
      }
    },
    buildNodes(prefix = "town-static") {
      const out: AuraNodeBuilder<AuraPrimitiveNode>[] = [];
      let idx = 0;
      for (const bucket of buckets.values()) {
        if (bucket.meshes.length === 0) continue;
        out.push(
          geometry.custom(mergeRawMeshes(bucket.meshes), {
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
        options.receiveShadow
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

function buildPassengerSpec(kind: RiderKind): CompactSlotSpecs {
  const hit = passengerSpecCache.get(kind);
  if (hit) return hit;

  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };

  const torsoLean = kind === "rushed" ? 0.14 : kind === "sleeper" ? 0.1 : -0.03;
  const headNod = kind === "sleeper" ? 0.34 : kind === "rushed" ? 0.08 : -0.04;

  // Slot 0: Fabric coat torso & flared seated skirt (resting on bench at y = -0.72 relative to 2.04 hip pivot)
  const coatProfile: V2[] = [
    [0, -0.72], [0.27, -0.72], [0.29, -0.56], [0.25, -0.34],
    [0.23, -0.1], [0.24, 0.08], [0.16, 0.19], [0, 0.2]
  ];
  push(0, transformMesh(latheMesh(coatProfile, 16), { pos: [0, 0, -0.02], rot: [torsoLean, 0, 0], scale: [1.08, 1, 0.88] }));

  // Slot 1: Scarf / collar trim (fabric accent)
  push(1, transformMesh(latheMesh([[0.13, 0.14], [0.19, 0.16], [0.2, 0.23], [0.14, 0.26], [0, 0.26]], 14), {
    pos: [0, 0, torsoLean * 0.12], rot: [torsoLean, 0, 0]
  }));

  // Slot 2: Trousers & bent seated legs reaching streetcar floor (y = -1.22 -> world tram y = 0.82)
  for (const side of [-1, 1] as const) {
    const sx = side * 0.115;
    push(2, tubeSweepMesh([
      [sx, -0.64, 0.02, 0.082],
      [sx, -0.66, 0.28, 0.076],
      [sx, -0.94, 0.33, 0.068],
      [sx, -1.16, 0.35, 0.06]
    ], 8));
    // Slot 5: Rubber-soled leather boots
    push(5, transformMesh(bevelBoxMesh(0.11, 0.09, 0.2, 0.025), { pos: [sx, -1.2, 0.4] }));
  }

  // Slot 3: Sculpted head & hands (warm skin) + Slot 2 hair cap
  const headZ = Math.sin(torsoLean) * 0.22 + (kind === "sleeper" ? 0.06 : 0);
  const headY = 0.36 - (kind === "sleeper" ? 0.03 : 0);
  push(3, transformMesh(latheMesh([
    [0, -0.13], [0.09, -0.11], [0.135, -0.03], [0.14, 0.06], [0.11, 0.13], [0, 0.15]
  ], 16), { pos: [0, headY, headZ], rot: [headNod, 0, 0] }));
  push(2, transformMesh(latheMesh([
    [0.125, -0.02], [0.148, 0.05], [0.132, 0.13], [0, 0.16]
  ], 14), { pos: [0, headY + 0.01, headZ - 0.015], rot: [headNod - 0.08, 0, 0] }));

  // Archetype arms, hats, and signature props
  if (kind === "easy") {
    for (const side of [-1, 1] as const) {
      push(0, tubeSweepMesh([
        [side * 0.23, 0.08, 0, 0.062],
        [side * 0.26, -0.18, 0.1, 0.056],
        [side * 0.15, -0.38, 0.24, 0.05]
      ], 7));
      push(3, transformMesh(icosphereFacetMesh(0.048, 1), { pos: [side * 0.13, -0.4, 0.26] }));
    }
    // Cross-body saddle-leather satchel (Slot 4) + brass buckle (Slot 6)
    push(4, tubeSweepMesh([[-0.18, 0.18, 0.02, 0.022], [0.06, -0.08, 0.22, 0.022], [0.25, -0.42, 0.16, 0.022]], 6));
    push(4, transformMesh(bevelBoxMesh(0.12, 0.24, 0.28, 0.028), { pos: [0.27, -0.46, 0.14], rot: [0.08, 0.15, -0.12] }));
    push(6, transformMesh(bevelBoxMesh(0.03, 0.05, 0.06, 0.008), { pos: [0.33, -0.44, 0.14] }));
  } else if (kind === "sightseer") {
    // Wide-brimmed woven straw sunhat (Slot 4 straw, Slot 1 coral ribbon)
    push(4, transformMesh(latheMesh([
      [0.34, 0.02], [0.26, 0.05], [0.155, 0.07], [0.145, 0.18], [0.09, 0.21], [0, 0.215]
    ], 18), { pos: [0, headY + 0.05, headZ - 0.01], rot: [-0.14, 0, 0] }));
    push(1, transformMesh(latheMesh([[0.152, 0.065], [0.16, 0.105], [0.15, 0.11]], 16), {
      pos: [0, headY + 0.05, headZ - 0.01], rot: [-0.14, 0, 0]
    }));
    // Arms holding twin-lens vintage camera at chest (Slot 7 enamel body, Slot 6 brass barrel, Slot 8 glass lens)
    for (const side of [-1, 1] as const) {
      push(0, tubeSweepMesh([
        [side * 0.23, 0.08, 0, 0.06],
        [side * 0.24, -0.12, 0.18, 0.054],
        [side * 0.11, -0.06, 0.28, 0.048]
      ], 7));
      push(3, transformMesh(icosphereFacetMesh(0.045, 1), { pos: [side * 0.09, -0.06, 0.3] }));
    }
    push(4, tubeSweepMesh([[-0.11, 0.16, 0.06, 0.014], [-0.08, -0.05, 0.28, 0.014], [0.08, -0.05, 0.28, 0.014], [0.11, 0.16, 0.06, 0.014]], 5));
    push(7, transformMesh(bevelBoxMesh(0.17, 0.13, 0.1, 0.018), { pos: [0, -0.06, 0.31] }));
    push(6, transformMesh(latheMesh([[0, 0], [0.048, 0], [0.052, 0.06], [0.044, 0.07]], 14), {
      pos: [0, -0.06, 0.36], rot: [Math.PI * 0.5, 0, 0]
    }));
    push(8, transformMesh(latheMesh([[0, 0], [0.038, 0.01], [0, 0.02]], 12), {
      pos: [0, -0.06, 0.42], rot: [Math.PI * 0.5, 0, 0]
    }));
  } else if (kind === "rushed") {
    // Forward-leaning sprinter gripping structured espresso briefcase with brass clasps across knees
    for (const side of [-1, 1] as const) {
      push(0, tubeSweepMesh([
        [side * 0.24, 0.08, 0.03, 0.06],
        [side * 0.22, -0.2, 0.2, 0.054],
        [side * 0.12, -0.44, 0.3, 0.048]
      ], 7));
      push(3, transformMesh(icosphereFacetMesh(0.046, 1), { pos: [side * 0.1, -0.46, 0.32] }));
    }
    push(6, transformMesh(latheMesh([[0.052, -0.015], [0.056, 0.015]], 10), { pos: [-0.12, -0.42, 0.3], rot: [0.9, 0, 0] }));
    push(4, transformMesh(bevelBoxMesh(0.36, 0.25, 0.1, 0.02), { pos: [0, -0.5, 0.36], rot: [-0.18, 0, 0] }));
    push(4, tubeSweepMesh([[-0.07, -0.37, 0.34, 0.016], [0, -0.33, 0.34, 0.018], [0.07, -0.37, 0.34, 0.016]], 6));
    for (const bx of [-0.11, 0.11]) {
      push(6, transformMesh(bevelBoxMesh(0.035, 0.045, 0.11, 0.006), { pos: [bx, -0.42, 0.36], rot: [-0.18, 0, 0] }));
    }
  } else {
    // Sleeper: folded arms tucked warmly + wool peaked railway cap with curved visor
    push(0, tubeSweepMesh([
      [-0.23, 0.06, 0.02, 0.062], [-0.18, -0.22, 0.2, 0.058],
      [0.14, -0.24, 0.22, 0.056], [0.23, 0.06, 0.02, 0.062]
    ], 7));
    push(1, transformMesh(latheMesh([
      [0.135, 0.04], [0.165, 0.09], [0.15, 0.17], [0.05, 0.2], [0, 0.205]
    ], 16), { pos: [0, headY + 0.02, headZ + 0.01], rot: [headNod + 0.06, 0, 0] }));
    const visorPoly: V2[] = [[-0.12, 0], [0.12, 0], [0.09, 0.11], [0, 0.13], [-0.09, 0.11]];
    push(5, transformMesh(extrudePolygonMesh(visorPoly, 0.02, 0.004), {
      pos: [0, headY + 0.07, headZ + 0.12], rot: [Math.PI * 0.5 + headNod + 0.15, 0, 0]
    }));
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
    unnamed(material.fabric({ color: pal.coat, roughness: 0.84, sheen: 0.72, sheenColor: pal.sheen, sheenRoughness: 0.45 })),
    unnamed(material.fabric({ color: pal.scarf, roughness: 0.88, sheen: 0.6, sheenColor: "#ffffff" })),
    unnamed(material.pbr({ color: "#323846", roughness: 0.82, clearcoat: 0 })),
    unnamed(material.pbr({ color: "#efc6a0", roughness: 0.62, clearcoat: 0 })),
    unnamed(material.pbr({ color: pal.prop, roughness: 0.66, clearcoat: 0 })),
    unnamed(material.blackRubber({ color: "#23252b", roughness: 0.86 })),
    unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.22, metallic: 0.92 })),
    unnamed(material.lacquer({ color: "#1c2026", roughness: 0.24, clearcoat: 0.88, clearcoatRoughness: 0.06 })),
    unnamed(material.physical({ color: "#bfe6f8", roughness: 0.04, opacity: 0.45, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, envMapIntensity: 1.5 }))
  ];
  return mountCompactMultiMaterial(name, buildPassengerSpec(kind), materials, {
    castShadow,
    receiveShadow: false
  });
}

const folkSpecCache = new Map<number, CompactSlotSpecs>();

function buildStandingFolkSpec(variant: number): CompactSlotSpecs {
  const v = ((variant % 4) + 4) % 4;
  const hit = folkSpecCache.get(v);
  if (hit) return hit;

  const slots: MultiMatSlot[] = [];
  const push = (materialIndex: number, mesh: RawMesh): void => { slots.push({ materialIndex, mesh }); };

  // Grounded boots at y = 0, legs 0..0.72, tailored coat 0.56..1.34, head 1.48, hat/prop
  for (const side of [-1, 1] as const) {
    const sx = side * 0.1;
    push(4, transformMesh(bevelBoxMesh(0.11, 0.09, 0.21, 0.025), { pos: [sx, 0.045, 0.03] }));
    push(2, tubeSweepMesh([[sx, 0.08, 0, 0.062], [sx, 0.42, 0.01, 0.07], [sx, 0.68, 0, 0.078]], 8));
  }
  push(0, latheMesh([
    [0, 0.56], [0.27, 0.56], [0.25, 0.82], [0.21, 1.08], [0.23, 1.25], [0.14, 1.35], [0, 1.36]
  ], 16));
  push(1, latheMesh([[0.12, 1.31], [0.18, 1.34], [0.18, 1.4], [0.12, 1.42]], 14));
  for (const side of [-1, 1] as const) {
    push(0, tubeSweepMesh([
      [side * 0.22, 1.25, 0, 0.056],
      [side * 0.25, 0.98, 0.05, 0.05],
      [side * 0.2, 0.76, 0.1, 0.045]
    ], 7));
  }
  push(3, transformMesh(latheMesh([
    [0, 1.38], [0.09, 1.4], [0.13, 1.48], [0.13, 1.56], [0.09, 1.63], [0, 1.65]
  ], 14), {}));
  if (v % 2 === 0) {
    push(1, transformMesh(latheMesh([[0.27, 1.56], [0.14, 1.59], [0.13, 1.69], [0, 1.71]], 16), {}));
    push(5, transformMesh(bevelBoxMesh(0.14, 0.22, 0.26, 0.025), { pos: [0.25, 0.66, 0.08] }));
  } else {
    push(2, transformMesh(latheMesh([[0.13, 1.55], [0.15, 1.62], [0.08, 1.67], [0, 1.68]], 14), {}));
    push(5, tubeSweepMesh([[-0.22, 0.76, 0.1, 0.02], [-0.24, 0.04, 0.14, 0.012]], 6));
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
    unnamed(material.fabric({ color: coat, roughness: 0.85, sheen: 0.68, sheenColor: "#fff2dc" })),
    unnamed(material.fabric({ color: "#f1e4cb", roughness: 0.86, sheen: 0.55, sheenColor: "#ffffff" })),
    unnamed(material.pbr({ color: "#2f3542", roughness: 0.84, clearcoat: 0 })),
    unnamed(material.pbr({ color: "#efc6a0", roughness: 0.62, clearcoat: 0 })),
    unnamed(material.blackRubber({ color: "#22252b", roughness: 0.86 })),
    unnamed(material.pbr({ color: "#805130", roughness: 0.7, clearcoat: 0 }))
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

/** Single-draw instanced silhouette (`clearcoat: 0`) for distant plaza townsfolk (> 50 instances). */
export function buildPlazaFolkBodySpec(): AuraCustomGeometrySpec {
  if (cachedPlazaFolkSpec) return cachedPlazaFolkSpec;
  cachedPlazaFolkSpec = mergeRawMeshes([
    latheMesh([
      [0, -0.75], [0.16, -0.75], [0.19, -0.35], [0.31, -0.3],
      [0.26, 0.25], [0.29, 0.52], [0.16, 0.68], [0, 0.7]
    ], 12)
  ]);
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
  const raw = layeredCanopyMesh({ radius: 2.75, height: 4.5, puffs: 9, seed: 43 });
  cachedCanopySpec = mergeRawMeshes([transformMesh(raw, { pos: [0, -2.15, 0] })]);
  return cachedCanopySpec;
}

export function buildCoastalPineSpec(): AuraCustomGeometrySpec {
  if (cachedPineSpec) return cachedPineSpec;
  const raw = coniferBoughTierMesh({ baseRadius: 2.05, height: 6.7, tiers: 5, seed: 61 });
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
  const raw = layeredCanopyMesh({ radius: 1.25, height: 1.75, puffs: 6, seed: 97 });
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
