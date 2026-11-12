/**
 * Procedural multi-material 3D vehicle & architectural sculpting library for Apex Overdrive (`apps/showcase-roadster-rush`).
 *
 * Replaces all 31 static Meshy clay GLB mounts and raw primitive "Lego" stacks with curved surface-of-revolution,
 * multi-station lofted fuselage, swept tubular, extruded polygon, open 4-chord lattice truss, forged 5-spoke wheel,
 * and stratified coastal mountain meshes built purely from `showcase-port-shared/proceduralKernel` + `@aura3d/engine`.
 *
 * Coordinate & collider contract (`src/native/constants.ts`):
 * - Forward travel direction is `-Z`, right is `+X`, up is `+Y`, and wheels/skids rest on `minY = 0`.
 * - Hero supercar matches `PLAYER_BOX = { w: 1.9, h: 1.15, l: 4.3 }`.
 * - Traffic & skycar hulls match exact `VEHICLE_SPECS` & `SKY_SPEC` `[w, h, l]` bounds (`widthScale = 1`, `TRAFFIC_YAW = 0`).
 * - Carrier heavy transporter (`[2.5, 3.6, 16.0]`) integrates a `5.0 m x 3.6 m` jumpable twin-track deck ramp rising from
 *   `y = 0` at rear `z = +8.0` to `y = 3.6` at `z = +3.0`, matching `surfaceHeight()` in `src/native/traffic.ts`.
 * - 60+ FPS Instancing Rule: every `instances.custom` pool with `> 20` instances uses `material.pbr` or `material.metal`
 *   with `clearcoat: 0` (no `sheen`, `iridescence`, or `transmission`) so `@aura3d/engine` compiles single-draw hardware
 *   `InstancedPBRMaterial`. Multi-lobe `material.carPaint` and `material.studioGlass` are reserved for the hero supercar
 *   and `<= 19`-instance near-LOD vehicle pools.
 */

import {
  geometry,
  material,
  type AuraCustomGeometrySpec,
  type AuraGroupNode,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode
} from "@aura3d/engine";

import {
  assembleMultiMaterialNode,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  computePositionsBounds,
  extrudePolygonMesh,
  fbm3,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
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
} from "../../../showcase-port-shared/proceduralKernel";

import type { PowerupKind, VehicleType } from "../native/constants";
import { APEX_PALETTE } from "./look";
import {
  WGSL_CLIP,
  WGSL_COLOR,
  WGSL_ENVIRONMENT_FOG,
  WGSL_MATH,
  WGSL_NOISE,
  WGSL_SCENE,
  wgslStage
} from "./wgsl";

// ---------------------------------------------------------------------------
// Vertex-Color & Indexed Custom Geometry Builders
// ---------------------------------------------------------------------------

/** Stamps a uniform linear/sRGB vertex tint `[r, g, b, 1]` onto a `RawMesh` for single-draw multi-tone LODs. */
function tintRawMesh(mesh: RawMesh, r: number, g: number, b: number): RawMesh {
  const vCount = mesh.positions.length / 3;
  const colors = new Float32Array(vCount * 4);
  for (let i = 0; i < vCount; i += 1) {
    const o = i * 4;
    colors[o] = r;
    colors[o + 1] = g;
    colors[o + 2] = b;
    colors[o + 3] = 1;
  }
  return { ...mesh, colors };
}

/** Merges `RawMesh` parts while preserving per-vertex RGBA `colors` when any constituent carries vertex colors. */
function mergeColoredMeshesToSpec(parts: readonly RawMesh[]): AuraCustomGeometrySpec {
  const hasColors = parts.some((p) => p.colors !== undefined);
  if (!hasColors) return mergeRawMeshes(parts);

  let totalVerts = 0;
  let totalIdx = 0;
  for (const p of parts) {
    totalVerts += p.positions.length / 3;
    totalIdx += p.indices.length;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 4);
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const p of parts) {
    const vc = p.positions.length / 3;
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    if (p.colors && p.colors.length === vc * 4) {
      colors.set(p.colors, vOff * 4);
    } else {
      for (let i = 0; i < vc; i += 1) {
        const co = (vOff + i) * 4;
        colors[co] = 1;
        colors[co + 1] = 1;
        colors[co + 2] = 1;
        colors[co + 3] = 1;
      }
    }
    for (let k = 0; k < p.indices.length; k += 1) {
      indices[iOff + k] = p.indices[k]! + vOff;
    }
    vOff += vc;
    iOff += p.indices.length;
  }

  return geometry.define({
    positions,
    normals,
    uvs,
    colors,
    indices,
    bounds: computePositionsBounds(positions)
  });
}

/** Normalizes any `RawMesh` into a unit `[-0.5..+0.5]^3` cube so pre-scaled `InstancePool` transforms fit exact bounds. */
function normalizeMeshToUnitCube(mesh: RawMesh): RawMesh {
  const pos = mesh.positions;
  if (pos.length < 3) return mesh;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const sx = Math.max(1e-5, maxX - minX);
  const sy = Math.max(1e-5, maxY - minY);
  const sz = Math.max(1e-5, maxZ - minZ);
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  return transformMesh(
    transformMesh(mesh, { pos: [-cx, -cy, -cz] }),
    { scale: [1 / sx, 1 / sy, 1 / sz] }
  );
}

/**
 * Generates a 20-point smoothly arched automotive cross-section ring at station `z` for smooth-shaded
 * `loftSectionsMesh(..., true, false)` bodywork and glass canopies.
 * Ordered counter-clockwise in XY: bottom-center -> lower-right rocker -> curved door flank -> right beltline ->
 * arched tumblehome -> crowned roof -> symmetric left profile.
 */
function carSectionRing(
  z: number,
  halfW: number,
  yBot: number,
  yBelt: number,
  yTop: number,
  tumblehome = 0.82,
  bellyCrown = 0.02
): V3[] {
  const wSill = halfW * 0.94;
  const wBelt = halfW;
  const wRoof = halfW * tumblehome;
  const wCrown = halfW * Math.max(0.28, tumblehome * 0.56);
  const hLow = Math.max(0.004, yBelt - yBot);
  const hUp = Math.max(0.004, yTop - yBelt);
  const wFlank = wSill + (wBelt - wSill) * 0.76;
  const wUpperBelt = wBelt + (wRoof - wBelt) * 0.26;
  const wTumbleMid = wBelt + (wRoof - wBelt) * 0.66;
  return [
    [0, yBot - bellyCrown, z],
    [wSill * 0.46, yBot - bellyCrown * 0.32, z],
    [wSill * 0.86, yBot + hLow * 0.08, z],
    [wSill * 0.98, yBot + hLow * 0.36, z],
    [wFlank, yBot + hLow * 0.72, z],
    [wBelt, yBelt, z],
    [wUpperBelt, yBelt + hUp * 0.3, z],
    [wTumbleMid, yBelt + hUp * 0.62, z],
    [wRoof, yBelt + hUp * 0.86, z],
    [wCrown * 0.84, yTop - hUp * 0.035, z],
    [0, yTop, z],
    [-wCrown * 0.84, yTop - hUp * 0.035, z],
    [-wRoof, yBelt + hUp * 0.86, z],
    [-wTumbleMid, yBelt + hUp * 0.62, z],
    [-wUpperBelt, yBelt + hUp * 0.3, z],
    [-wBelt, yBelt, z],
    [-wFlank, yBot + hLow * 0.72, z],
    [-wSill * 0.98, yBot + hLow * 0.36, z],
    [-wSill * 0.86, yBot + hLow * 0.08, z],
    [-wSill * 0.46, yBot - bellyCrown * 0.32, z]
  ];
}

// ---------------------------------------------------------------------------
// Multi-Lobe Physical Material Library & Paired WebGPU Strata Shader
// ---------------------------------------------------------------------------

/** Per-class automotive body colors (blue-hour sunset palette, zero magenta). */
const TRAFFIC_HULL_COLORS: Readonly<Record<VehicleType, { readonly base: string; readonly flake: string; readonly metalness: number; readonly roughness: number }>> = {
  sedan: { base: "#38588f", flake: "#78a4e8", metalness: 0.62, roughness: 0.22 },
  hatch: { base: "#e45c2b", flake: "#ff9e5e", metalness: 0.56, roughness: 0.24 },
  suv: { base: "#2f5249", flake: "#6ca696", metalness: 0.58, roughness: 0.25 },
  taxi: { base: "#f2b01e", flake: "#ffe07d", metalness: 0.44, roughness: 0.24 },
  van: { base: "#cfd8e3", flake: "#f1f5f9", metalness: 0.48, roughness: 0.28 },
  pickup: { base: "#9c3626", flake: "#e06d53", metalness: 0.58, roughness: 0.25 },
  boxtruck: { base: "#dce4ee", flake: "#f8fafc", metalness: 0.36, roughness: 0.34 },
  bus: { base: "#25639b", flake: "#6fb3f0", metalness: 0.52, roughness: 0.26 },
  carrier: { base: "#f07428", flake: "#ffb36b", metalness: 0.54, roughness: 0.28 }
};

export const APEX_PROCEDURAL_MATERIALS = {
  heroCobaltPaint: () =>
    material.carPaint({
      color: APEX_PALETTE.cobalt,
      flakeColor: "#5daeff",
      metalness: 0.64,
      roughness: 0.19,
      clearcoat: 1,
      clearcoatRoughness: 0.045
    }),
  heroTangerinePaint: () =>
    material.carPaint({
      color: APEX_PALETTE.tangerine,
      flakeColor: "#ffd08a",
      metalness: 0.55,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.06
    }),
  heroCarbonWeave: () =>
    material.pbr({
      color: "#1b1e26",
      metalness: 0.38,
      roughness: 0.36,
      clearcoat: 0.35,
      clearcoatRoughness: 0.18
    }),
  heroCanopyGlass: () =>
    material.studioGlass({
      color: "#0b1628",
      opacity: 0.76,
      roughness: 0.04,
      ior: 1.52
    }),
  forgedAlloyMetal: () =>
    material.studioMetal({
      color: "#d4dde8",
      metalness: 0.92,
      roughness: 0.18
    }),
  brushedTitanium: () =>
    material.brushedMetal({
      color: "#8a96a8",
      metalness: 0.88,
      roughness: 0.28
    }),
  tireRubber: () =>
    material.blackRubber({
      color: "#15171c",
      roughness: 0.88
    }),
  trafficNearBodyPaint: (vType: VehicleType): AuraMaterialSpec => {
    const p = TRAFFIC_HULL_COLORS[vType];
    return material.carPaint({
      color: p.base,
      flakeColor: p.flake,
      metalness: p.metalness,
      roughness: p.roughness,
      clearcoat: 0.92,
      clearcoatRoughness: 0.07
    });
  },
  trafficNearGlass: () =>
    material.studioGlass({
      color: "#0f1c30",
      opacity: 0.82,
      roughness: 0.06,
      ior: 1.5
    }),
  trafficNearWheelTrim: () =>
    material.pbr({
      color: "#ffffff",
      metalness: 0.52,
      roughness: 0.54,
      clearcoat: 0
    }),
  /** Hardware-instanced (`> 20` slots) far-LOD vehicle material: `clearcoat: 0` + vertex colors. */
  trafficFarHardwarePbr: () =>
    material.pbr({
      color: "#ffffff",
      metalness: 0.48,
      roughness: 0.36,
      clearcoat: 0
    }),
  /** Hardware-instanced (`26 > 20` slots) skycar interceptor material: `material.metal` with `clearcoat: 0`. */
  skycarNearHardwareMetal: () =>
    material.metal({
      color: "#ffffff",
      metalness: 0.84,
      roughness: 0.24,
      clearcoat: 0
    }),
  skycarFarHardwarePbr: () =>
    material.pbr({
      color: "#ffffff",
      metalness: 0.72,
      roughness: 0.32,
      clearcoat: 0
    }),
  gantryTrussSteel: () =>
    material.studioMetal({
      color: "#6d7d92",
      metalness: 0.84,
      roughness: 0.32
    }),
  gantrySignBoard: () =>
    material.pbr({
      color: "#182854",
      metalness: 0.24,
      roughness: 0.44,
      clearcoat: 0.25,
      clearcoatRoughness: 0.22
    }),
  gantryLuminaireTrim: () =>
    material.emissive({
      color: "#ffe9cf",
      emissive: "#ffb46b",
      emissiveIntensity: 0.55,
      practical: true
    }),
  /** Hardware-instanced (`22 > 20` slots) fluted Y-pier concrete: `clearcoat: 0`. */
  pylonColumnConcrete: () =>
    material.pbr({
      color: APEX_PALETTE.charcoal,
      roughness: 0.8,
      metalness: 0.06,
      clearcoat: 0
    }),
  pylonCapConcrete: () =>
    material.pbr({
      color: "#2c2f38",
      roughness: 0.76,
      metalness: 0.08,
      clearcoat: 0
    }),
  /** Hardware-instanced (`22 > 20` slots) galvanized light standard: `clearcoat: 0`. */
  lightPoleSteel: () =>
    material.pbr({
      color: "#526075",
      metalness: 0.74,
      roughness: 0.32,
      clearcoat: 0
    }),
  lightLampEmitter: () =>
    material.emissive({
      color: "#ffd28a",
      emissive: "#ffae52",
      emissiveIntensity: 1.65,
      practical: true
    }),
  beaconAeroRing: () =>
    material.emissive({
      color: APEX_PALETTE.sodium,
      emissive: APEX_PALETTE.sodium,
      emissiveIntensity: 1.4,
      practical: true
    }),
  spanViaductGirder: () =>
    material.brushedMetal({
      color: "#323642",
      metalness: 0.42,
      roughness: 0.62
    }),
  billboardSpaceFrame: () =>
    material.studioMetal({
      color: "#434956",
      metalness: 0.76,
      roughness: 0.38
    }),
  /** Hardware-instanced (`172 > 20` slots) energy bolt crystal: `clearcoat: 0` + `practical: true`. */
  boltCrystalHardwarePbr: () =>
    material.pbr({
      color: "#ffd447",
      metalness: 0.82,
      roughness: 0.18,
      clearcoat: 0,
      emissive: "#ffae00",
      emissiveIntensity: 1.35,
      practical: true
    }),
  powerupEmblemMaterial: (color: string): AuraMaterialSpec =>
    material.pbr({
      color: "#ffffff",
      metalness: 0.72,
      roughness: 0.16,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      emissive: color,
      emissiveIntensity: 1.45,
      practical: true
    }),
  heroTailLightbarMaterial: (hot: boolean): AuraMaterialSpec =>
    material.emissive({
      color: "#ff1830",
      emissive: hot ? "#ff384c" : "#ff1830",
      emissiveIntensity: hot ? 2.8 : 1.85,
      practical: true
    }),
  heroHeadlightBladeMaterial: () =>
    material.emissive({
      color: "#eef8ff",
      emissive: "#bae6fd",
      emissiveIntensity: 1.6,
      practical: true
    })
} as const;

const BAY_STRATA_PALETTE_SRGB: readonly string[] = [
  "#141928",
  "#1d2438",
  "#27314a",
  "#323b56",
  "#1f273b"
];

const BAY_STRATA_WGSL_VERTEX = wgslStage([WGSL_CLIP], /* wgsl */ `
struct StrataVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(8) a_instanceMatrix0: vec4<f32>,
  @location(9) a_instanceMatrix1: vec4<f32>,
  @location(10) a_instanceMatrix2: vec4<f32>,
  @location(11) a_instanceMatrix3: vec4<f32>
) -> StrataVarying {
  var out: StrataVarying;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let world = aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0);
  out.worldPos = world.xyz;
  out.worldNormal = normalize(a3dMat3Mul(aura.u_modelMatrix, a3dMat3Mul(instanceMatrix, a_normal)));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`);

const BAY_STRATA_WGSL_FRAGMENT = wgslStage(
  [WGSL_MATH, WGSL_NOISE, WGSL_COLOR, WGSL_SCENE, WGSL_ENVIRONMENT_FOG],
  /* wgsl */ `
fn strataPalette(idx: i32) -> vec3<f32> {
  if (idx == 0) { return a3dSrgbToLinear(vec3<f32>(0.078, 0.098, 0.157)); }
  if (idx == 1) { return a3dSrgbToLinear(vec3<f32>(0.114, 0.141, 0.220)); }
  if (idx == 2) { return a3dSrgbToLinear(vec3<f32>(0.153, 0.192, 0.290)); }
  if (idx == 3) { return a3dSrgbToLinear(vec3<f32>(0.196, 0.231, 0.337)); }
  return a3dSrgbToLinear(vec3<f32>(0.122, 0.153, 0.231));
}
@fragment fn fs_main(
  @builtin(position) fragCoord: vec4<f32>,
  @builtin(front_facing) frontFacing: bool,
  @location(0) vVisWorld: vec3<f32>,
  @location(1) vVisNormal: vec3<f32>
) -> @location(0) vec4<f32> {
  let nSign = select(-1.0, 1.0, frontFacing);
  let N = a3dSafeNormalize3(vVisNormal * nSign, vec3<f32>(0.0, 1.0, 0.0));
  let scale = max(aura.u_strataNoiseScale, 0.01);
  let q = vec2<f32>(vVisWorld.x + vVisWorld.z * 0.73, vVisWorld.y * 0.5) / scale + aura.u_strataSeed.xy;
  let warp = (a3dFbm2(q, 4) - 0.5) * 2.0;
  let grain = a3dFbm2(vec2<f32>(vVisWorld.x - vVisWorld.z * 0.41, vVisWorld.y * 3.0) / (scale * 0.18) + aura.u_strataSeed.yz, 3) - 0.5;
  let span = max(aura.u_strataRange.y - aura.u_strataRange.x, 0.001);
  let f = (vVisWorld.y - aura.u_strataRange.x) / span * aura.u_strataBands + warp * aura.u_strataNoise * 0.9;
  let layer = floor(f);
  let within = f - layer;
  let idx = i32(a3dModF(layer, 5.0));
  var albedo = strataPalette(idx);
  let jitter = a3dHash21(vec2<f32>(layer * 7.13, aura.u_strataSeed.x * 3.0)) - 0.5;
  albedo = albedo * (1.0 + jitter * 2.0 * aura.u_strataVariation);
  let seamMask = smoothstep(0.0, 0.07, within) * (1.0 - smoothstep(0.93, 1.0, within));
  albedo = albedo * mix(1.0, 0.55 + 0.45 * seamMask, aura.u_strataSeam);
  albedo = albedo * (1.0 + grain * aura.u_strataNoise * 0.8);
  let slopeDeg = degrees(acos(clamp(N.y, -1.0, 1.0)));
  let flatMix = 1.0 - smoothstep(aura.u_strataSlope.x - aura.u_strataSlope.y * 0.5, aura.u_strataSlope.x + aura.u_strataSlope.y * 0.5, slopeDeg);
  let flatAlbedo = aura.u_strataFlatColor * (1.0 + grain * aura.u_strataNoise * 0.9);
  albedo = max(mix(albedo, flatAlbedo, flatMix), vec3<f32>(0.0));
  let sunDir = a3dSafeNormalize3(aura.u_a3dSunDirection, vec3<f32>(0.08, 0.12, -0.99));
  let ndl = max(dot(N, sunDir), 0.0);
  let lit = albedo * (a3dHemiLight(N) * 0.95 + a3dSunRadiance() * ndl * (1.0 - aura.u_strataRoughness * 0.35));
  let fogged = a3dApplyEnvironmentFog(lit, vVisWorld, fragCoord.xy);
  return vec4<f32>(a3dFinite3(fogged), 1.0);
}`
);

/**
 * Builds the `coastal-bay-ridge` sedimentary mountain material via `material.strata(...)`, augmented with an instanced
 * WebGPU WGSL twin so `webgpuCustomShaderGap` stays `undefined` under `renderer: { backend: "auto" }`.
 */
export function buildBayRidgeStrataMaterial(): AuraMaterialSpec {
  const base = material.strata({
    bands: 14,
    colors: BAY_STRATA_PALETTE_SRGB,
    heightRange: [-32, 130],
    noise: 0.42,
    noiseScale: 22,
    seam: 0.3,
    variation: 0.22,
    slope: { angle: 34, blend: 14, flatColor: "#161c2d" },
    roughness: 0.92,
    seed: 19
  });
  if (base.kind !== "custom") return base;
  return {
    kind: "custom",
    custom: {
      ...base.custom,
      castShadow: false,
      wgsl: {
        vertex: BAY_STRATA_WGSL_VERTEX,
        fragment: BAY_STRATA_WGSL_FRAGMENT
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 1. Hero Wedge Supercar (`PLAYER_BOX = { w: 1.9, h: 1.15, l: 4.3 }`, front `-Z`, `minY = 0`)
// ---------------------------------------------------------------------------

/**
 * Multi-material hero hypercar (`player-roadster-car`) grounded at `minY = 0` facing `-Z`:
 * - Material 0: Dual-lobe `material.carPaint` cobalt sculpted wedge fuselage + flared fenders + active rear wing
 * - Material 1: `material.carPaint` tangerine aero intake pinstripe & dorsal fin accent
 * - Material 2: Carbon-weave lower aero undertray, side skirts, NACA ducts & 5-strake rear Venturi diffuser
 * - Material 3: `material.blackRubber` performance tires (4x `wheelAssemblySlots`, resting on `y = 0`)
 * - Material 4: `material.studioMetal` forged 5-spoke concave rims & twin cold-gas thruster bells
 * - Material 5: `material.brushedMetal` cross-drilled brake rotors, calipers & rear engine louvers
 */
export function buildHeroSupercarNode(): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  const MAT_COBALT = 0;
  const MAT_TANGERINE = 1;
  const MAT_CARBON = 2;
  const MAT_TIRE = 3;
  const MAT_ALLOY = 4;
  const MAT_TITANIUM = 5;

  // Multi-station smooth-shaded mid-engine wedge fuselage (`z` from `-2.14` nose to `+2.12` tail)
  const hullSections: V3[][] = [
    carSectionRing(-2.14, 0.56, 0.16, 0.28, 0.34, 0.76, 0.01),
    carSectionRing(-2.03, 0.72, 0.15, 0.35, 0.43, 0.77, 0.013),
    carSectionRing(-1.86, 0.85, 0.14, 0.43, 0.53, 0.78, 0.015),
    carSectionRing(-1.62, 0.92, 0.14, 0.52, 0.62, 0.77, 0.018),
    carSectionRing(-1.34, 0.94, 0.14, 0.58, 0.69, 0.76, 0.02),
    carSectionRing(-1.02, 0.925, 0.135, 0.61, 0.74, 0.74, 0.02),
    carSectionRing(-0.64, 0.9, 0.13, 0.62, 0.77, 0.71, 0.02),
    carSectionRing(-0.18, 0.865, 0.13, 0.61, 0.78, 0.7, 0.02),
    carSectionRing(0.24, 0.89, 0.135, 0.635, 0.8, 0.72, 0.02),
    carSectionRing(0.66, 0.925, 0.14, 0.67, 0.825, 0.75, 0.02),
    carSectionRing(1.06, 0.95, 0.15, 0.705, 0.855, 0.77, 0.02),
    carSectionRing(1.42, 0.945, 0.165, 0.73, 0.86, 0.79, 0.019),
    carSectionRing(1.74, 0.915, 0.2, 0.74, 0.85, 0.81, 0.016),
    carSectionRing(1.96, 0.87, 0.245, 0.725, 0.82, 0.84, 0.013),
    carSectionRing(2.12, 0.82, 0.28, 0.7, 0.78, 0.86, 0.01)
  ];
  slots.push({ mesh: loftSectionsMesh(hullSections, true, false), materialIndex: MAT_COBALT });

  // Smoothly crowned front & rear sculpted fender arches (left & right)
  const fenderRing = (side: -1 | 1, z: number, xIn: number, xOut: number, yLow: number, yMid: number, yTop: number): V3[] => {
    const pts: V3[] = [
      [side * xIn, yLow, z],
      [side * (xIn + (xOut - xIn) * 0.62), yLow + (yMid - yLow) * 0.22, z],
      [side * xOut, yMid, z],
      [side * (xOut * 0.99), yMid + (yTop - yMid) * 0.58, z],
      [side * (xIn + (xOut - xIn) * 0.68), yTop, z],
      [side * xIn, yTop + 0.025, z]
    ];
    return side > 0 ? pts : [...pts].reverse();
  };
  for (const side of [-1, 1] as const) {
    const frontArch: V3[][] = [
      fenderRing(side, -1.68, 0.73, 0.93, 0.22, 0.35, 0.54),
      fenderRing(side, -1.5, 0.75, 0.955, 0.3, 0.46, 0.63),
      fenderRing(side, -1.3, 0.76, 0.96, 0.38, 0.54, 0.68),
      fenderRing(side, -1.1, 0.75, 0.95, 0.29, 0.45, 0.63),
      fenderRing(side, -0.92, 0.73, 0.93, 0.2, 0.36, 0.57)
    ];
    const rearArch: V3[][] = [
      fenderRing(side, 0.86, 0.74, 0.94, 0.22, 0.4, 0.67),
      fenderRing(side, 1.06, 0.755, 0.955, 0.33, 0.52, 0.74),
      fenderRing(side, 1.28, 0.76, 0.96, 0.42, 0.6, 0.79),
      fenderRing(side, 1.5, 0.75, 0.95, 0.35, 0.54, 0.76),
      fenderRing(side, 1.7, 0.73, 0.93, 0.28, 0.46, 0.71)
    ];
    slots.push({ mesh: loftSectionsMesh(frontArch, true, false), materialIndex: MAT_COBALT });
    slots.push({ mesh: loftSectionsMesh(rearArch, true, false), materialIndex: MAT_COBALT });

    // Side NACA aero intake scoop + tangerine leading-edge trim
    const scoopPoly: V2[] = [
      [0, -0.14],
      [0.11, -0.11],
      [0.12, 0.14],
      [0, 0.17]
    ];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(scoopPoly, 0.82, 0.018), {
        pos: [side * 0.83, 0.46, 0.35],
        rot: [0, side < 0 ? Math.PI : 0, 0]
      }),
      materialIndex: MAT_CARBON
    });
    const intakeTrimCurve: V4[] = [
      [side * 0.89, 0.31, -0.08, 0.018],
      [side * 0.93, 0.46, -0.04, 0.02],
      [side * 0.89, 0.62, 0.04, 0.018]
    ];
    slots.push({ mesh: tubeSweepMesh(intakeTrimCurve, 8, true), materialIndex: MAT_TANGERINE });

    // Carbon side-skirt ground-effect blade
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.12, 0.045, 1.68, 0.012), {
        pos: [side * 0.91, 0.13, 0.02]
      }),
      materialIndex: MAT_CARBON
    });
  }

  // Active swept rear GT aerofoil wing + swan-neck pylons + endplates
  const wingFoil = (x: number, yBase: number, zLead: number): V3[] => [
    [x, yBase, zLead],
    [x, yBase + 0.032, zLead + 0.05],
    [x, yBase + 0.036, zLead + 0.15],
    [x, yBase + 0.028, zLead + 0.29],
    [x, yBase + 0.004, zLead + 0.27],
    [x, yBase - 0.004, zLead + 0.11]
  ];
  const wingSections: V3[][] = [
    wingFoil(-0.86, 0.93, 1.78),
    wingFoil(-0.46, 0.952, 1.815),
    wingFoil(0, 0.96, 1.83),
    wingFoil(0.46, 0.952, 1.815),
    wingFoil(0.86, 0.93, 1.78)
  ];
  slots.push({ mesh: loftSectionsMesh(wingSections, true, false), materialIndex: MAT_COBALT });
  for (const side of [-1, 1] as const) {
    const pylonPoly: V2[] = [
      [-0.14, 0],
      [0.12, 0],
      [0.06, 0.2],
      [-0.08, 0.2]
    ];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(pylonPoly, 0.035, 0.008), {
        pos: [side * 0.42, 0.78, 1.94],
        rot: [0, Math.PI * 0.5, 0]
      }),
      materialIndex: MAT_CARBON
    });
    const endplatePoly: V2[] = [
      [-0.18, -0.06],
      [0.16, -0.04],
      [0.18, 0.06],
      [-0.14, 0.05]
    ];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(endplatePoly, 0.024, 0.006), {
        pos: [side * 0.87, 0.94, 1.94],
        rot: [0, Math.PI * 0.5, 0]
      }),
      materialIndex: MAT_TANGERINE
    });
  }

  // Dorsal LMP shark-fin spine + rear louvered engine deck slats
  const dorsalPoly: V2[] = [
    [-0.45, 0],
    [0.48, 0],
    [0.32, 0.14],
    [-0.18, 0.18]
  ];
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(dorsalPoly, 0.026, 0.006), {
      pos: [0, 0.81, 1.26],
      rot: [0, Math.PI * 0.5, 0]
    }),
    materialIndex: MAT_TANGERINE
  });
  for (let i = 0; i < 4; i += 1) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.72 - i * 0.06, 0.022, 0.09, 0.006), {
        pos: [0, 0.83 - i * 0.014, 0.86 + i * 0.2],
        rot: [0.18, 0, 0]
      }),
      materialIndex: MAT_TITANIUM
    });
  }

  // Rear Venturi diffuser housing + 5 vertical aero strakes
  slots.push({
    mesh: transformMesh(bevelBoxMesh(1.56, 0.18, 0.44, 0.025), {
      pos: [0, 0.22, 1.94],
      rot: [-0.16, 0, 0]
    }),
    materialIndex: MAT_CARBON
  });
  for (let sIdx = -2; sIdx <= 2; sIdx += 1) {
    const strakePoly: V2[] = [
      [-0.22, -0.09],
      [0.2, -0.06],
      [0.22, 0.08],
      [-0.18, 0.08]
    ];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(strakePoly, 0.024, 0.005), {
        pos: [sIdx * 0.31, 0.2, 1.98],
        rot: [0, Math.PI * 0.5, 0]
      }),
      materialIndex: MAT_CARBON
    });
  }

  // Twin lathe-turned titanium cold-gas thruster bells aligned with `rearPlumeL/R` (`x = +-0.42, y = 0.46`)
  const nozzleProfile: V2[] = [
    [0.05, -0.14],
    [0.11, -0.14],
    [0.125, -0.02],
    [0.155, 0.12],
    [0.135, 0.14],
    [0.085, 0.02],
    [0.05, 0.02]
  ];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(latheMesh(nozzleProfile, 18), {
        pos: [side * 0.42, 0.46, 2.08],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: MAT_ALLOY
    });
  }

  // 4 forged 5-spoke wheels (`wheelAssemblySlots`) resting cleanly on `minY = 0`
  const wheelPlacements: readonly { readonly pos: V3; readonly r: number; readonly w: number; readonly flip: boolean }[] = [
    { pos: [-0.82, 0.34, -1.3], r: 0.34, w: 0.25, flip: true },
    { pos: [0.82, 0.34, -1.3], r: 0.34, w: 0.25, flip: false },
    { pos: [-0.83, 0.36, 1.28], r: 0.36, w: 0.29, flip: true },
    { pos: [0.83, 0.36, 1.28], r: 0.36, w: 0.29, flip: false }
  ];
  for (const wp of wheelPlacements) {
    const wSlots = wheelAssemblySlots({
      radius: wp.r,
      width: wp.w,
      spokeCount: 5,
      tireMat: MAT_TIRE,
      rimMat: MAT_ALLOY,
      rotorMat: MAT_TITANIUM
    });
    for (const ws of wSlots) {
      slots.push({
        mesh: transformMesh(ws.mesh, {
          pos: wp.pos,
          rot: [0, wp.flip ? Math.PI : 0, 0]
        }),
        materialIndex: ws.materialIndex
      });
    }
  }

  return assembleMultiMaterialNode(
    "player-roadster-car",
    slots,
    [
      APEX_PROCEDURAL_MATERIALS.heroCobaltPaint(),
      APEX_PROCEDURAL_MATERIALS.heroTangerinePaint(),
      APEX_PROCEDURAL_MATERIALS.heroCarbonWeave(),
      APEX_PROCEDURAL_MATERIALS.tireRubber(),
      APEX_PROCEDURAL_MATERIALS.forgedAlloyMetal(),
      APEX_PROCEDURAL_MATERIALS.brushedTitanium()
    ],
    {
      id: "player-roadster-car",
      tags: ["primarySubject", "primaryVehicle", "player"],
      position: [0, 0, 0],
      castShadow: true,
      receiveShadow: true
    }
  );
}

/**
 * Sculpted teardrop fighter-canopy greenhouse (`player-canopy-visor`), authored relative to its runtime anchor
 * `[0, 0.96, -0.08]` so `syncRoadsterWorld` carries it with zero offset drift (`maxY = 1.15` world).
 */
export function buildHeroCanopyVisorNode(): AuraNodeBuilder<AuraPrimitiveNode> {
  const canopySections: V3[][] = [
    carSectionRing(-0.98, 0.42, -0.22, -0.17, -0.13, 0.84, 0),
    carSectionRing(-0.82, 0.52, -0.21, -0.12, -0.03, 0.81, 0),
    carSectionRing(-0.62, 0.58, -0.2, -0.06, 0.08, 0.78, 0),
    carSectionRing(-0.38, 0.605, -0.195, -0.035, 0.15, 0.75, 0),
    carSectionRing(-0.14, 0.61, -0.19, -0.02, 0.18, 0.73, 0),
    carSectionRing(0.12, 0.585, -0.185, -0.025, 0.17, 0.72, 0),
    carSectionRing(0.36, 0.54, -0.18, -0.04, 0.14, 0.72, 0),
    carSectionRing(0.58, 0.47, -0.17, -0.058, 0.09, 0.74, 0),
    carSectionRing(0.74, 0.4, -0.16, -0.072, 0.045, 0.76, 0),
    carSectionRing(0.86, 0.33, -0.15, -0.085, 0.01, 0.78, 0)
  ];
  const spec = mergeRawMeshes([loftSectionsMesh(canopySections, true, false)]);
  return geometry
    .custom(spec, {
      name: "player-canopy-visor",
      material: APEX_PROCEDURAL_MATERIALS.heroCanopyGlass(),
      position: [0, 0.96, -0.08],
      castShadow: false,
      receiveShadow: false
    })
    .runtime({ id: "player-canopy-visor" });
}

/**
 * Sculpted swept-V front aero splitter + twin dive-plane canards (`player-aero-splitter`),
 * authored relative to `[0, 0.22, -2.06]`.
 */
export function buildHeroAeroSplitterNode(): AuraNodeBuilder<AuraPrimitiveNode> {
  const bladePoly: V2[] = [
    [-0.92, -0.08],
    [-0.52, -0.18],
    [0, -0.22],
    [0.52, -0.18],
    [0.92, -0.08],
    [0.88, 0.12],
    [-0.88, 0.12]
  ];
  const blade = transformMesh(extrudePolygonMesh(bladePoly, 0.036, 0.008), {
    rot: [Math.PI * 0.5, 0, 0],
    pos: [0, -0.03, 0.04]
  });
  const parts: RawMesh[] = [blade];
  for (const side of [-1, 1] as const) {
    const canardPoly: V2[] = [
      [-0.14, -0.03],
      [0.14, -0.01],
      [0.12, 0.07],
      [-0.08, 0.05]
    ];
    parts.push(
      transformMesh(extrudePolygonMesh(canardPoly, 0.022, 0.005), {
        pos: [side * 0.89, 0.06, 0.06],
        rot: [0.22, Math.PI * 0.5, side * -0.28]
      })
    );
  }
  return geometry
    .custom(mergeRawMeshes(parts), {
      name: "player-aero-splitter",
      material: APEX_PROCEDURAL_MATERIALS.brushedTitanium(),
      position: [0, 0.22, -2.06],
      castShadow: false,
      receiveShadow: true
    })
    .runtime({ id: "player-aero-splitter" });
}

/**
 * Sculpted curved full-width wraparound crimson LED taillight blade (`player-lightbar`),
 * authored relative to `[0, 0.72, 2.12]` and dynamically driven by brake/boost state.
 */
export function buildHeroTaillightBarNode(): AuraNodeBuilder<AuraPrimitiveNode> {
  const curve: V4[] = [
    [-0.84, -0.02, -0.09, 0.024],
    [-0.56, 0.012, -0.02, 0.028],
    [0, 0.018, 0.015, 0.026],
    [0.56, 0.012, -0.02, 0.028],
    [0.84, -0.02, -0.09, 0.024]
  ];
  const lowerFin = transformMesh(bevelBoxMesh(1.42, 0.02, 0.045, 0.006), { pos: [0, -0.035, -0.01] });
  const spec = mergeRawMeshes([tubeSweepMesh(curve, 10, true), lowerFin]);
  return geometry
    .custom(spec, {
      name: "player-lightbar",
      material: APEX_PROCEDURAL_MATERIALS.heroTailLightbarMaterial(false),
      position: [0, 0.72, 2.12],
      castShadow: false,
      receiveShadow: false
    })
    .runtime({ id: "player-lightbar" });
}

/**
 * Sculpted angular twin-chevron boomerang LED DRL headlamp (`player-headlight-l` / `player-headlight-r`),
 * authored relative to `[+-0.74, 0.56, -2.08]`.
 */
export function buildHeroHeadlightNode(side: "l" | "r"): AuraNodeBuilder<AuraPrimitiveNode> {
  const s = side === "l" ? -1 : 1;
  const upperBlade: V4[] = [
    [-s * 0.14, -0.015, -0.05, 0.018],
    [s * 0.02, 0.01, -0.02, 0.022],
    [s * 0.15, 0.045, 0.09, 0.016]
  ];
  const lowerTick: V4[] = [
    [-s * 0.08, -0.042, -0.03, 0.014],
    [s * 0.09, -0.022, 0.05, 0.014]
  ];
  const id = `player-headlight-${side}`;
  return geometry
    .custom(mergeRawMeshes([tubeSweepMesh(upperBlade, 8, true), tubeSweepMesh(lowerTick, 8, true)]), {
      name: id,
      material: APEX_PROCEDURAL_MATERIALS.heroHeadlightBladeMaterial(),
      position: [s * 0.74, 0.56, -2.08],
      castShadow: false,
      receiveShadow: false
    })
    .runtime({ id });
}

// ---------------------------------------------------------------------------
// 2. Ten Traffic & Skycar Classes (`VEHICLE_SPECS` + `SKY_SPEC`, front `-Z`, `minY = 0`)
// ---------------------------------------------------------------------------

export interface TrafficClassGeometryBundle {
  /** Near-LOD painted bodywork geometry (`NEAR_CAPACITY[vType] <= 19`, `material.carPaint`). */
  readonly nearBody: AuraCustomGeometrySpec;
  /** Near-LOD smoked cabin greenhouse geometry (`NEAR_CAPACITY[vType] <= 19`, `material.studioGlass`). */
  readonly nearGlass: AuraCustomGeometrySpec;
  /** Near-LOD vertex-colored rubber tires + forged alloy 5-spoke rims + dark trim (`NEAR_CAPACITY[vType] <= 19`). */
  readonly nearTrim: AuraCustomGeometrySpec;
  /** Far-LOD single-draw vertex-colored silhouette (`POOL_CAPACITY[vType]`, `material.pbr` with `clearcoat: 0`). */
  readonly farLod: AuraCustomGeometrySpec;
}

/** Builds chase-camera (`+Z` rear face) taillights, turn lenses, trunk garnish, license plate, diffuser & twin exhausts. */
function buildRearChaseAutoDetailParts(opts: {
  readonly halfW: number;
  readonly lampY: number;
  readonly lampH?: number;
  readonly bumperY: number;
  readonly rearZ: number;
  readonly fullWidthBar?: boolean;
  readonly dualExhaust?: boolean;
  readonly silverSkid?: boolean;
}): { readonly near: RawMesh[]; readonly far: RawMesh[] } {
  const {
    halfW,
    lampY,
    lampH = 0.115,
    bumperY,
    rearZ,
    fullWidthBar = true,
    dualExhaust = true,
    silverSkid = false
  } = opts;
  const near: RawMesh[] = [];
  const far: RawMesh[] = [];

  // Dark smoked taillight bezel + full-width trunk garnish strip
  const garnish = tintRawMesh(
    transformMesh(bevelBoxMesh(halfW * 1.68, lampH * 0.72, 0.036, 0.009), {
      pos: [0, lampY, rearZ - 0.008]
    }),
    0.1,
    0.12,
    0.16
  );
  near.push(garnish);
  far.push(garnish);

  if (fullWidthBar) {
    const centerBar = tintRawMesh(
      transformMesh(bevelBoxMesh(halfW * 1.56, lampH * 0.34, 0.038, 0.006), {
        pos: [0, lampY + lampH * 0.12, rearZ + 0.004]
      }),
      0.95,
      0.09,
      0.14
    );
    near.push(centerBar);
    far.push(centerBar);
  }

  // Left & right crimson LED brake/taillight clusters + outer amber turn-signal jewels
  const lampW = halfW * 0.44;
  for (const side of [-1, 1] as const) {
    const crimsonCluster = tintRawMesh(
      transformMesh(bevelBoxMesh(lampW, lampH, 0.046, 0.012), {
        pos: [side * (halfW * 0.63), lampY, rearZ + 0.002]
      }),
      0.97,
      0.09,
      0.14
    );
    const amberTurn = tintRawMesh(
      transformMesh(bevelBoxMesh(lampW * 0.34, lampH * 0.48, 0.048, 0.008), {
        pos: [side * (halfW * 0.77), lampY - lampH * 0.2, rearZ + 0.005]
      }),
      0.99,
      0.58,
      0.1
    );
    near.push(crimsonCluster, amberTurn);
    far.push(crimsonCluster);
  }

  // Recessed dark license-plate alcove + crisp reflective white-blue plate
  const plateFrame = tintRawMesh(
    transformMesh(bevelBoxMesh(0.46, 0.16, 0.032, 0.008), {
      pos: [0, (lampY + bumperY) * 0.5, rearZ - 0.004]
    }),
    0.09,
    0.11,
    0.14
  );
  const plate = tintRawMesh(
    transformMesh(bevelBoxMesh(0.38, 0.115, 0.036, 0.005), {
      pos: [0, (lampY + bumperY) * 0.5, rearZ + 0.003]
    }),
    0.86,
    0.9,
    0.96
  );
  near.push(plateFrame, plate);

  // Sculpted lower rear diffuser valance / off-road skid insert
  const diffuser = tintRawMesh(
    transformMesh(bevelBoxMesh(halfW * 1.54, 0.15, 0.075, 0.018), {
      pos: [0, bumperY - 0.03, rearZ - 0.015]
    }),
    silverSkid ? 0.68 : 0.08,
    silverSkid ? 0.73 : 0.09,
    silverSkid ? 0.8 : 0.12
  );
  near.push(diffuser);
  far.push(diffuser);

  if (dualExhaust) {
    const tipProf: V2[] = [
      [0.032, -0.045],
      [0.052, -0.045],
      [0.056, 0.045],
      [0.036, 0.045]
    ];
    const baseTip = transformMesh(latheMesh(tipProf, 12), { rot: [Math.PI * 0.5, 0, 0] });
    for (const side of [-1, 1] as const) {
      near.push(
        tintRawMesh(
          transformMesh(baseTip, { pos: [side * (halfW * 0.56), bumperY - 0.04, rearZ + 0.006] }),
          0.84,
          0.88,
          0.94
        )
      );
    }
  }

  return { near, far };
}

/** Builds vertex-tinted 5-spoke wheels + bumper/grille trim for an instanced near-traffic class (`minY = 0`). */
function buildVehicleWheelAndTrimParts(
  wheelRadius: number,
  wheelWidth: number,
  trackHalfX: number,
  axleZs: readonly number[],
  bumperHalfW: number,
  frontZ: number,
  rearZ: number
): RawMesh[] {
  const parts: RawMesh[] = [];
  for (const wz of axleZs) {
    for (const side of [-1, 1] as const) {
      const slots = wheelAssemblySlots({
        radius: wheelRadius,
        width: wheelWidth,
        spokeCount: 5,
        tireMat: 0,
        rimMat: 1
      });
      for (const s of slots) {
        const placed = transformMesh(s.mesh, {
          pos: [side * trackHalfX, wheelRadius, wz],
          rot: [0, side < 0 ? Math.PI : 0, 0]
        });
        // Tire rubber dark charcoal (0.09, 0.1, 0.12), forged alloy rim bright silver (0.82, 0.86, 0.92)
        parts.push(s.materialIndex === 0 ? tintRawMesh(placed, 0.09, 0.1, 0.12) : tintRawMesh(placed, 0.82, 0.86, 0.92));
      }
    }
  }
  // Front intake grille & rear lower bumper beam
  parts.push(
    tintRawMesh(
      transformMesh(bevelBoxMesh(bumperHalfW * 1.62, 0.18, 0.09, 0.02), {
        pos: [0, wheelRadius * 0.85, frontZ + 0.04]
      }),
      0.11,
      0.13,
      0.16
    )
  );
  parts.push(
    tintRawMesh(
      transformMesh(bevelBoxMesh(bumperHalfW * 1.72, 0.16, 0.1, 0.02), {
        pos: [0, wheelRadius * 0.78, rearZ - 0.04]
      }),
      0.11,
      0.13,
      0.16
    )
  );
  return parts;
}

/** Builds simplified low-segment wheels for `.far` LOD silhouettes (`minY = 0`). */
function buildFarWheelCylinders(
  wheelRadius: number,
  wheelWidth: number,
  trackHalfX: number,
  axleZs: readonly number[]
): RawMesh[] {
  const prof: V2[] = [
    [0, -wheelWidth * 0.5],
    [wheelRadius, -wheelWidth * 0.5],
    [wheelRadius, wheelWidth * 0.5],
    [0, wheelWidth * 0.5]
  ];
  const baseWheel = transformMesh(latheMesh(prof, 10), { rot: [0, 0, -Math.PI * 0.5] });
  const parts: RawMesh[] = [];
  for (const wz of axleZs) {
    for (const side of [-1, 1] as const) {
      parts.push(
        tintRawMesh(transformMesh(baseWheel, { pos: [side * trackHalfX, wheelRadius, wz] }), 0.1, 0.11, 0.13)
      );
    }
  }
  return parts;
}

function parseHexRgb01(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Builds exact-collider sculpted near (body + glass + wheel/trim) and far LOD geometry specs for each of the
 * 9 ground traffic classes (`VEHICLE_SPECS`, front `-Z`, `minY = 0`):
 * - `sedan` `[1.9, 1.45, 4.6]`
 * - `hatch` `[1.8, 1.5, 4.0]`
 * - `suv` `[2.0, 1.85, 4.8]`
 * - `taxi` `[1.9, 1.5, 4.6]`
 * - `van` `[2.0, 2.3, 5.2]`
 * - `pickup` `[2.0, 1.9, 5.4]`
 * - `boxtruck` `[2.4, 3.4, 8.0]`
 * - `bus` `[2.5, 3.2, 12.0]`
 * - `carrier` `[2.5, 3.6, 16.0]` (with `5.0 m x 3.6 m` jumpable twin-track deck ramp)
 */
export function buildTrafficClassGeometries(vType: VehicleType): TrafficClassGeometryBundle {
  const [cr, cg, cb] = parseHexRgb01(TRAFFIC_HULL_COLORS[vType].base);
  const bodyParts: RawMesh[] = [];
  const glassParts: RawMesh[] = [];
  let trimParts: RawMesh[] = [];
  const farParts: RawMesh[] = [];

  switch (vType) {
    case "sedan": {
      // [1.9, 1.45, 4.6] — sleek smooth-shaded 3-box executive fastback sedan
      const hw = 0.95;
      bodyParts.push(
        loftSectionsMesh(
          [
            carSectionRing(-2.3, 0.72, 0.2, 0.56, 0.68, 0.86),
            carSectionRing(-1.92, 0.88, 0.19, 0.68, 0.8, 0.87),
            carSectionRing(-1.48, hw, 0.18, 0.78, 0.89, 0.88),
            carSectionRing(-0.92, hw, 0.18, 0.86, 0.95, 0.86),
            carSectionRing(-0.42, hw, 0.18, 0.89, 1.38, 0.77),
            carSectionRing(0.18, hw, 0.18, 0.91, 1.45, 0.76),
            carSectionRing(0.78, hw * 0.985, 0.18, 0.92, 1.4, 0.76),
            carSectionRing(1.28, hw * 0.97, 0.19, 0.94, 1.18, 0.81),
            carSectionRing(1.68, hw * 0.955, 0.2, 0.94, 1.05, 0.85),
            carSectionRing(2.08, 0.88, 0.22, 0.91, 1.01, 0.87),
            carSectionRing(2.3, 0.82, 0.24, 0.88, 0.98, 0.88)
          ],
          true,
          false
        )
      );
      const cabinGlass = loftSectionsMesh(
        [
          carSectionRing(-0.96, 0.81, 0.88, 0.93, 0.97, 0.86, 0),
          carSectionRing(-0.46, 0.83, 0.9, 1.18, 1.4, 0.78, 0),
          carSectionRing(0.22, 0.83, 0.91, 1.2, 1.43, 0.77, 0),
          carSectionRing(0.82, 0.81, 0.92, 1.18, 1.39, 0.78, 0),
          carSectionRing(1.56, 0.75, 0.95, 1.02, 1.08, 0.84, 0)
        ],
        true,
        false
      );
      // Proud sloped rear backlight window on C-pillar slope so chase camera sees crisp dark rear glass
      const rearBacklight = transformMesh(bevelBoxMesh(1.28, 0.045, 0.76, 0.012), {
        pos: [0, 1.23, 1.24],
        rot: [-0.44, 0, 0]
      });
      glassParts.push(cabinGlass, rearBacklight);

      const rearDetail = buildRearChaseAutoDetailParts({
        halfW: hw * 0.88,
        lampY: 0.8,
        bumperY: 0.3,
        rearZ: 2.295,
        fullWidthBar: true,
        dualExhaust: true
      });
      const trunkLip = tintRawMesh(
        transformMesh(bevelBoxMesh(1.44, 0.042, 0.1, 0.01), { pos: [0, 1.0, 2.24] }),
        0.11,
        0.13,
        0.17
      );
      trimParts = [
        ...buildVehicleWheelAndTrimParts(0.34, 0.23, 0.83, [-1.42, 1.38], hw, -2.3, 2.3),
        trunkLip,
        ...rearDetail.near
      ];
      farParts.push(
        tintRawMesh(bodyParts[0]!, cr, cg, cb),
        tintRawMesh(cabinGlass, 0.08, 0.13, 0.22),
        tintRawMesh(rearBacklight, 0.07, 0.11, 0.2),
        trunkLip,
        ...rearDetail.far,
        ...buildFarWheelCylinders(0.34, 0.23, 0.83, [-1.42, 1.38])
      );
      break;
    }

    case "hatch": {
      // [1.8, 1.5, 4.0] — smooth-shaded compact hot-hatchback with rear roof spoiler & liftgate window
      const hw = 0.9;
      bodyParts.push(
        loftSectionsMesh(
          [
            carSectionRing(-2.0, 0.68, 0.19, 0.56, 0.68, 0.86),
            carSectionRing(-1.62, 0.84, 0.185, 0.69, 0.81, 0.86),
            carSectionRing(-1.22, hw, 0.18, 0.79, 0.91, 0.86),
            carSectionRing(-0.62, hw, 0.18, 0.88, 1.45, 0.78),
            carSectionRing(0.45, hw, 0.18, 0.92, 1.5, 0.78),
            carSectionRing(1.38, hw * 0.97, 0.195, 0.95, 1.47, 0.8),
            carSectionRing(1.76, hw * 0.93, 0.215, 0.93, 1.28, 0.83),
            carSectionRing(2.0, 0.82, 0.24, 0.88, 1.04, 0.86)
          ],
          true,
          false
        ),
        transformMesh(bevelBoxMesh(1.32, 0.055, 0.26, 0.015), { pos: [0, 1.47, 1.72], rot: [0.12, 0, 0] })
      );
      const cabinGlass = loftSectionsMesh(
        [
          carSectionRing(-0.98, 0.77, 0.86, 0.92, 0.96, 0.86, 0),
          carSectionRing(-0.45, 0.8, 0.89, 1.18, 1.43, 0.8, 0),
          carSectionRing(1.28, 0.78, 0.92, 1.18, 1.44, 0.8, 0),
          carSectionRing(1.78, 0.73, 0.94, 1.06, 1.24, 0.83, 0)
        ],
        true,
        false
      );
      const rearHatchWindow = transformMesh(bevelBoxMesh(1.26, 0.38, 0.045, 0.012), {
        pos: [0, 1.21, 1.88],
        rot: [0.46, 0, 0]
      });
      glassParts.push(cabinGlass, rearHatchWindow);

      const rearDetail = buildRearChaseAutoDetailParts({
        halfW: hw * 0.88,
        lampY: 0.88,
        lampH: 0.13,
        bumperY: 0.29,
        rearZ: 1.995,
        fullWidthBar: true,
        dualExhaust: true
      });
      const highBrakeStrip = tintRawMesh(
        transformMesh(bevelBoxMesh(0.76, 0.032, 0.04, 0.006), { pos: [0, 1.44, 1.84] }),
        0.97,
        0.1,
        0.14
      );
      trimParts = [
        ...buildVehicleWheelAndTrimParts(0.33, 0.22, 0.79, [-1.26, 1.24], hw, -2.0, 2.0),
        highBrakeStrip,
        ...rearDetail.near
      ];
      farParts.push(
        tintRawMesh(bodyParts[0]!, cr, cg, cb),
        tintRawMesh(cabinGlass, 0.08, 0.13, 0.22),
        tintRawMesh(rearHatchWindow, 0.07, 0.11, 0.2),
        highBrakeStrip,
        ...rearDetail.far,
        ...buildFarWheelCylinders(0.33, 0.22, 0.79, [-1.26, 1.24])
      );
      break;
    }

    case "suv": {
      // [2.0, 1.85, 4.8] — smooth-shaded crossover SUV with roof rails, tailgate window & silver skid-plate
      const hw = 1.0;
      bodyParts.push(
        loftSectionsMesh(
          [
            carSectionRing(-2.4, 0.84, 0.28, 0.84, 1.02, 0.88),
            carSectionRing(-1.96, 0.95, 0.27, 0.95, 1.09, 0.88),
            carSectionRing(-1.48, hw, 0.26, 1.03, 1.15, 0.88),
            carSectionRing(-0.78, hw, 0.26, 1.1, 1.79, 0.82),
            carSectionRing(0.65, hw, 0.26, 1.12, 1.84, 0.82),
            carSectionRing(1.82, hw * 0.975, 0.275, 1.14, 1.8, 0.84),
            carSectionRing(2.18, hw * 0.94, 0.295, 1.11, 1.58, 0.86),
            carSectionRing(2.4, 0.88, 0.32, 1.06, 1.28, 0.88)
          ],
          true,
          false
        )
      );
      const cabinGlass = loftSectionsMesh(
        [
          carSectionRing(-1.12, 0.87, 1.08, 1.14, 1.18, 0.86, 0),
          carSectionRing(-0.55, 0.9, 1.1, 1.46, 1.77, 0.84, 0),
          carSectionRing(1.68, 0.88, 1.12, 1.46, 1.76, 0.84, 0),
          carSectionRing(2.18, 0.82, 1.12, 1.3, 1.52, 0.86, 0)
        ],
        true,
        false
      );
      const rearTailgateGlass = transformMesh(bevelBoxMesh(1.48, 0.44, 0.048, 0.014), {
        pos: [0, 1.48, 2.27],
        rot: [0.38, 0, 0]
      });
      glassParts.push(cabinGlass, rearTailgateGlass);

      const rearDetail = buildRearChaseAutoDetailParts({
        halfW: hw * 0.9,
        lampY: 1.06,
        lampH: 0.145,
        bumperY: 0.36,
        rearZ: 2.395,
        fullWidthBar: true,
        dualExhaust: true,
        silverSkid: true
      });
      trimParts = [
        ...buildVehicleWheelAndTrimParts(0.41, 0.26, 0.88, [-1.52, 1.48], hw, -2.4, 2.4),
        ...rearDetail.near
      ];
      for (const side of [-1, 1] as const) {
        const rail: V4[] = [
          [side * 0.66, 1.81, -0.52, 0.022],
          [side * 0.66, 1.85, 0.55, 0.024],
          [side * 0.66, 1.81, 1.72, 0.022]
        ];
        trimParts.push(tintRawMesh(tubeSweepMesh(rail, 6, true), 0.75, 0.8, 0.86));
      }
      farParts.push(
        tintRawMesh(bodyParts[0]!, cr, cg, cb),
        tintRawMesh(cabinGlass, 0.08, 0.13, 0.22),
        tintRawMesh(rearTailgateGlass, 0.07, 0.11, 0.2),
        ...rearDetail.far,
        ...buildFarWheelCylinders(0.41, 0.26, 0.88, [-1.52, 1.48])
      );
      break;
    }

    case "taxi": {
      // [1.9, 1.5, 4.6] — smooth-shaded urban cab with aerodynamic roof beacon, rear window & taillights
      const hw = 0.95;
      bodyParts.push(
        loftSectionsMesh(
          [
            carSectionRing(-2.3, 0.74, 0.2, 0.58, 0.7, 0.86),
            carSectionRing(-1.92, 0.89, 0.19, 0.7, 0.82, 0.87),
            carSectionRing(-1.46, hw, 0.18, 0.79, 0.91, 0.88),
            carSectionRing(-0.84, hw, 0.18, 0.88, 0.96, 0.86),
            carSectionRing(-0.34, hw, 0.18, 0.9, 1.4, 0.78),
            carSectionRing(0.32, hw, 0.18, 0.91, 1.42, 0.78),
            carSectionRing(0.88, hw * 0.985, 0.18, 0.92, 1.39, 0.78),
            carSectionRing(1.36, hw * 0.965, 0.19, 0.94, 1.17, 0.82),
            carSectionRing(1.74, hw * 0.95, 0.2, 0.94, 1.05, 0.85),
            carSectionRing(2.3, 0.82, 0.24, 0.88, 0.98, 0.88)
          ],
          true,
          false
        )
      );
      const cabinGlass = loftSectionsMesh(
        [
          carSectionRing(-0.94, 0.81, 0.88, 0.94, 0.98, 0.86, 0),
          carSectionRing(-0.32, 0.84, 0.9, 1.18, 1.39, 0.8, 0),
          carSectionRing(0.84, 0.82, 0.91, 1.16, 1.37, 0.8, 0),
          carSectionRing(1.58, 0.75, 0.95, 1.02, 1.07, 0.84, 0)
        ],
        true,
        false
      );
      const rearBacklight = transformMesh(bevelBoxMesh(1.28, 0.045, 0.74, 0.012), {
        pos: [0, 1.22, 1.28],
        rot: [-0.43, 0, 0]
      });
      glassParts.push(cabinGlass, rearBacklight);

      const rearDetail = buildRearChaseAutoDetailParts({
        halfW: hw * 0.88,
        lampY: 0.8,
        bumperY: 0.3,
        rearZ: 2.295,
        fullWidthBar: false,
        dualExhaust: true
      });
      const signPoly: V2[] = [
        [-0.34, -0.14],
        [0.34, -0.14],
        [0.26, 0.14],
        [-0.26, 0.14]
      ];
      const roofSign = transformMesh(extrudePolygonMesh(signPoly, 0.09, 0.018), {
        pos: [0, 1.41, -0.05],
        rot: [Math.PI * 0.5, 0, 0]
      });
      trimParts = [
        ...buildVehicleWheelAndTrimParts(0.34, 0.23, 0.83, [-1.42, 1.38], hw, -2.3, 2.3),
        tintRawMesh(roofSign, 1.0, 0.86, 0.32),
        ...rearDetail.near
      ];
      farParts.push(
        tintRawMesh(bodyParts[0]!, cr, cg, cb),
        tintRawMesh(roofSign, 1.0, 0.86, 0.32),
        tintRawMesh(cabinGlass, 0.08, 0.13, 0.22),
        tintRawMesh(rearBacklight, 0.07, 0.11, 0.2),
        ...rearDetail.far,
        ...buildFarWheelCylinders(0.34, 0.23, 0.83, [-1.42, 1.38])
      );
      break;
    }

    case "van": {
      // [2.0, 2.3, 5.2] — smooth-shaded commercial sprinter van with twin rear barn-door windows & D-pillar tail stacks
      const hw = 1.0;
      bodyParts.push(
        loftSectionsMesh(
          [
            carSectionRing(-2.6, 0.86, 0.24, 0.82, 0.98, 0.9),
            carSectionRing(-2.05, hw, 0.22, 1.08, 1.28, 0.9),
            carSectionRing(-1.32, hw, 0.22, 1.26, 2.24, 0.9),
            carSectionRing(0.8, hw, 0.22, 1.28, 2.3, 0.92),
            carSectionRing(2.35, hw * 0.98, 0.24, 1.28, 2.28, 0.92),
            carSectionRing(2.6, 0.94, 0.28, 1.24, 2.18, 0.92)
          ],
          true,
          false
        )
      );
      const frontCabinGlass = loftSectionsMesh(
        [
          carSectionRing(-2.02, 0.88, 1.12, 1.22, 1.28, 0.9, 0),
          carSectionRing(-1.38, 0.91, 1.18, 1.72, 2.1, 0.9, 0),
          carSectionRing(-0.45, 0.91, 1.22, 1.74, 2.08, 0.9, 0),
          carSectionRing(-0.25, 0.86, 1.24, 1.5, 1.8, 0.9, 0)
        ],
        true,
        false
      );
      const barnWindowL = transformMesh(bevelBoxMesh(0.66, 0.56, 0.042, 0.012), { pos: [-0.42, 1.66, 2.585] });
      const barnWindowR = transformMesh(bevelBoxMesh(0.66, 0.56, 0.042, 0.012), { pos: [0.42, 1.66, 2.585] });
      glassParts.push(frontCabinGlass, barnWindowL, barnWindowR);

      const centerSeam = tintRawMesh(
        transformMesh(bevelBoxMesh(0.042, 1.82, 0.036, 0.006), { pos: [0, 1.24, 2.592] }),
        0.1,
        0.12,
        0.16
      );
      const highBrake = tintRawMesh(
        transformMesh(bevelBoxMesh(0.54, 0.045, 0.038, 0.008), { pos: [0, 2.14, 2.575] }),
        0.97,
        0.1,
        0.14
      );
      const stepBumper = tintRawMesh(
        transformMesh(bevelBoxMesh(1.84, 0.18, 0.11, 0.022), { pos: [0, 0.31, 2.585] }),
        0.09,
        0.11,
        0.14
      );
      const vanPlate = tintRawMesh(
        transformMesh(bevelBoxMesh(0.38, 0.12, 0.034, 0.006), { pos: [-0.38, 0.94, 2.598] }),
        0.86,
        0.9,
        0.96
      );
      const vanPillars: RawMesh[] = [centerSeam, highBrake, stepBumper, vanPlate];
      const vanFarRear: RawMesh[] = [centerSeam, highBrake, stepBumper];
      for (const side of [-1, 1] as const) {
        const tailStack = tintRawMesh(
          transformMesh(bevelBoxMesh(0.13, 0.56, 0.046, 0.012), { pos: [side * 0.87, 1.04, 2.59] }),
          0.96,
          0.09,
          0.14
        );
        const turnLens = tintRawMesh(
          transformMesh(bevelBoxMesh(0.11, 0.14, 0.048, 0.008), { pos: [side * 0.87, 0.88, 2.594] }),
          0.99,
          0.58,
          0.1
        );
        const hingeLow = tintRawMesh(
          transformMesh(bevelBoxMesh(0.08, 0.09, 0.045, 0.008), { pos: [side * 0.89, 0.72, 2.594] }),
          0.16,
          0.19,
          0.24
        );
        const hingeHigh = tintRawMesh(
          transformMesh(bevelBoxMesh(0.08, 0.09, 0.045, 0.008), { pos: [side * 0.89, 1.78, 2.594] }),
          0.16,
          0.19,
          0.24
        );
        vanPillars.push(tailStack, turnLens, hingeLow, hingeHigh);
        vanFarRear.push(tailStack);
      }

      trimParts = [
        ...buildVehicleWheelAndTrimParts(0.38, 0.25, 0.88, [-1.68, 1.65], hw, -2.6, 2.6),
        ...vanPillars
      ];
      farParts.push(
        tintRawMesh(bodyParts[0]!, cr, cg, cb),
        tintRawMesh(frontCabinGlass, 0.08, 0.13, 0.22),
        tintRawMesh(barnWindowL, 0.07, 0.11, 0.2),
        tintRawMesh(barnWindowR, 0.07, 0.11, 0.2),
        ...vanFarRear,
        ...buildFarWheelCylinders(0.38, 0.25, 0.88, [-1.68, 1.65])
      );
      break;
    }

    case "pickup": {
      // [2.0, 1.9, 5.4] — smooth-shaded crew-cab pickup truck with rear cab glass, stamped tailgate & vertical lamps
      const hw = 1.0;
      const cab = loftSectionsMesh(
        [
          carSectionRing(-2.7, 0.86, 0.28, 0.88, 1.02, 0.9),
          carSectionRing(-2.22, 0.96, 0.27, 0.99, 1.11, 0.9),
          carSectionRing(-1.78, hw, 0.26, 1.08, 1.18, 0.9),
          carSectionRing(-1.12, hw, 0.26, 1.14, 1.88, 0.84),
          carSectionRing(0.32, hw, 0.26, 1.14, 1.9, 0.84),
          carSectionRing(0.46, hw * 0.98, 0.26, 1.14, 1.86, 0.86)
        ],
        true,
        false
      );
      const bedFloor = transformMesh(bevelBoxMesh(1.88, 0.38, 2.22, 0.03), { pos: [0, 0.46, 1.58] });
      const bedLeft = transformMesh(bevelBoxMesh(0.16, 0.56, 2.22, 0.025), { pos: [-0.91, 0.88, 1.58] });
      const bedRight = transformMesh(bevelBoxMesh(0.16, 0.56, 2.22, 0.025), { pos: [0.91, 0.88, 1.58] });
      const tailgate = transformMesh(bevelBoxMesh(1.88, 0.56, 0.14, 0.025), { pos: [0, 0.88, 2.63] });
      bodyParts.push(cab, bedFloor, bedLeft, bedRight, tailgate);

      const cabGlass = loftSectionsMesh(
        [
          carSectionRing(-1.55, 0.88, 1.12, 1.18, 1.22, 0.88, 0),
          carSectionRing(-0.98, 0.91, 1.14, 1.52, 1.82, 0.85, 0),
          carSectionRing(0.28, 0.9, 1.14, 1.52, 1.82, 0.85, 0),
          carSectionRing(0.42, 0.86, 1.14, 1.48, 1.76, 0.86, 0)
        ],
        true,
        false
      );
      const rearCabWindow = transformMesh(bevelBoxMesh(1.5, 0.46, 0.04, 0.01), { pos: [0, 1.52, 0.468] });
      glassParts.push(cabGlass, rearCabWindow);

      const rollBar: V4[] = [
        [-0.78, 1.14, 0.62, 0.04],
        [-0.74, 1.84, 0.56, 0.04],
        [0.74, 1.84, 0.56, 0.04],
        [0.78, 1.14, 0.62, 0.04]
      ];
      const tailgateApplique = tintRawMesh(
        transformMesh(bevelBoxMesh(1.58, 0.22, 0.036, 0.01), { pos: [0, 0.9, 2.702] }),
        0.11,
        0.13,
        0.17
      );
      const tailgateLatch = tintRawMesh(
        transformMesh(bevelBoxMesh(0.28, 0.06, 0.04, 0.008), { pos: [0, 1.07, 2.704] }),
        0.09,
        0.11,
        0.14
      );
      const chromeStepBumper = tintRawMesh(
        transformMesh(bevelBoxMesh(1.88, 0.19, 0.12, 0.024), { pos: [0, 0.36, 2.68] }),
        0.78,
        0.83,
        0.9
      );
      const stepPad = tintRawMesh(
        transformMesh(bevelBoxMesh(0.62, 0.14, 0.13, 0.016), { pos: [0, 0.35, 2.688] }),
        0.09,
        0.11,
        0.14
      );
      const pickupPlate = tintRawMesh(
        transformMesh(bevelBoxMesh(0.36, 0.11, 0.03, 0.005), { pos: [0, 0.35, 2.708] }),
        0.86,
        0.9,
        0.96
      );
      const pickupRearParts: RawMesh[] = [tailgateApplique, tailgateLatch, chromeStepBumper, stepPad, pickupPlate];
      const pickupFarRear: RawMesh[] = [tailgateApplique, chromeStepBumper];
      for (const side of [-1, 1] as const) {
        const tailLamp = tintRawMesh(
          transformMesh(bevelBoxMesh(0.14, 0.44, 0.046, 0.012), { pos: [side * 0.88, 0.89, 2.702] }),
          0.96,
          0.09,
          0.14
        );
        const reverseJewel = tintRawMesh(
          transformMesh(bevelBoxMesh(0.11, 0.11, 0.048, 0.008), { pos: [side * 0.88, 0.82, 2.706] }),
          0.92,
          0.95,
          1.0
        );
        pickupRearParts.push(tailLamp, reverseJewel);
        pickupFarRear.push(tailLamp);
      }

      trimParts = [
        ...buildVehicleWheelAndTrimParts(0.42, 0.27, 0.88, [-1.72, 1.66], hw, -2.7, 2.7),
        tintRawMesh(tubeSweepMesh(rollBar, 8, true), 0.18, 0.2, 0.24),
        ...pickupRearParts
      ];
      farParts.push(
        tintRawMesh(cab, cr, cg, cb),
        tintRawMesh(bedFloor, cr * 0.85, cg * 0.85, cb * 0.85),
        tintRawMesh(bedLeft, cr, cg, cb),
        tintRawMesh(bedRight, cr, cg, cb),
        tintRawMesh(tailgate, cr, cg, cb),
        tintRawMesh(cabGlass, 0.08, 0.13, 0.22),
        tintRawMesh(rearCabWindow, 0.07, 0.11, 0.2),
        ...pickupFarRear,
        ...buildFarWheelCylinders(0.42, 0.27, 0.88, [-1.72, 1.66])
      );
      break;
    }

    case "boxtruck": {
      // [2.4, 3.4, 8.0] — cab-over freight truck + articulated 10-slat rear roll-up shutter door + DOT lights + ICC guard
      const cab = loftSectionsMesh(
        [
          carSectionRing(-4.0, 1.06, 0.34, 1.28, 1.52, 0.92),
          carSectionRing(-3.72, 1.14, 0.32, 1.45, 2.52, 0.92),
          carSectionRing(-2.35, 1.14, 0.32, 1.48, 2.62, 0.94),
          carSectionRing(-2.18, 1.1, 0.32, 1.48, 3.32, 0.96)
        ],
        true,
        false
      );
      const cargoBox = transformMesh(bevelBoxMesh(2.38, 2.68, 5.98, 0.06), { pos: [0, 2.06, 0.97] });
      const chassisRails = transformMesh(bevelBoxMesh(1.42, 0.28, 7.2, 0.03), { pos: [0, 0.56, -0.1] });
      bodyParts.push(cab, cargoBox);
      glassParts.push(
        loftSectionsMesh(
          [
            carSectionRing(-3.96, 1.0, 1.48, 1.6, 1.66, 0.92, 0),
            carSectionRing(-3.66, 1.05, 1.5, 2.05, 2.42, 0.92, 0),
            carSectionRing(-2.55, 1.05, 1.52, 2.06, 2.42, 0.92, 0),
            carSectionRing(-2.42, 0.98, 1.54, 1.9, 2.2, 0.92, 0)
          ],
          true,
          false
        )
      );

      // Rear cargo portal surround, recessed shutter channel, 10 articulated horizontal slats, latch hardware,
      // 5 upper DOT clearance lamps, lower brake/turn boxes, rubber dock bumpers & steel ICC underride guard
      const portalNear: RawMesh[] = [];
      const portalFar: RawMesh[] = [];
      const headerBeam = tintRawMesh(
        transformMesh(bevelBoxMesh(2.36, 0.16, 0.075, 0.015), { pos: [0, 3.31, 3.98] }),
        0.18,
        0.21,
        0.26
      );
      const thresholdSill = tintRawMesh(
        transformMesh(bevelBoxMesh(2.36, 0.15, 0.085, 0.015), { pos: [0, 0.78, 3.985] }),
        0.18,
        0.21,
        0.26
      );
      const shutterRecess = tintRawMesh(
        transformMesh(bevelBoxMesh(2.08, 2.42, 0.036, 0.008), { pos: [0, 2.04, 3.972] }),
        0.13,
        0.16,
        0.21
      );
      portalNear.push(headerBeam, thresholdSill, shutterRecess);
      portalFar.push(headerBeam, thresholdSill, shutterRecess);

      for (const side of [-1, 1] as const) {
        const cornerPost = tintRawMesh(
          transformMesh(bevelBoxMesh(0.15, 2.66, 0.075, 0.015), { pos: [side * 1.11, 2.05, 3.98] }),
          0.18,
          0.21,
          0.26
        );
        const dockBumper = tintRawMesh(
          transformMesh(bevelBoxMesh(0.24, 0.24, 0.095, 0.02), { pos: [side * 1.02, 0.67, 3.995] }),
          0.07,
          0.08,
          0.1
        );
        const tailLampBox = tintRawMesh(
          transformMesh(bevelBoxMesh(0.38, 0.15, 0.06, 0.012), { pos: [side * 0.66, 0.63, 3.985] }),
          0.96,
          0.09,
          0.14
        );
        const turnBox = tintRawMesh(
          transformMesh(bevelBoxMesh(0.14, 0.13, 0.064, 0.01), { pos: [side * 0.82, 0.63, 3.988] }),
          0.99,
          0.58,
          0.1
        );
        const iccDrop = tintRawMesh(
          transformMesh(bevelBoxMesh(0.1, 0.34, 0.08, 0.012), { pos: [side * 0.68, 0.56, 3.95] }),
          0.15,
          0.18,
          0.22
        );
        // Side logistics stiffener rub-rails along cargo box flanks
        const flankRail = tintRawMesh(
          transformMesh(bevelBoxMesh(0.032, 0.12, 5.72, 0.008), { pos: [side * 1.195, 1.38, 0.96] }),
          0.66,
          0.71,
          0.78
        );
        portalNear.push(cornerPost, dockBumper, tailLampBox, turnBox, iccDrop, flankRail);
        portalFar.push(cornerPost, tailLampBox);
      }

      // 10 horizontal roll-up cargo shutter slats with subtle alternating silver-grey anodized relief
      for (let s = 0; s < 10; s += 1) {
        const sy = 0.94 + s * 0.242;
        const shade = s % 2 === 0 ? 0.75 : 0.68;
        const slat = tintRawMesh(
          transformMesh(bevelBoxMesh(2.01, 0.195, 0.032, 0.008), { pos: [0, sy, 3.994] }),
          shade * 0.95,
          shade * 0.99,
          Math.min(1, shade * 1.06)
        );
        portalNear.push(slat);
        if (s % 2 === 0) {
          const farSlat = tintRawMesh(
            transformMesh(bevelBoxMesh(2.01, 0.32, 0.032, 0.008), { pos: [0, sy + 0.11, 3.994] }),
            0.72,
            0.76,
            0.82
          );
          portalFar.push(farSlat);
        }
      }

      // Cam-lock security bar, pull handle, DOT conspicuity tape & 5 upper red DOT clearance markers
      const lockBar = tintRawMesh(
        transformMesh(bevelBoxMesh(0.048, 1.56, 0.034, 0.006), { pos: [0.28, 1.66, 4.012] }),
        0.12,
        0.14,
        0.18
      );
      const latchPlate = tintRawMesh(
        transformMesh(bevelBoxMesh(0.56, 0.09, 0.038, 0.008), { pos: [0.06, 1.16, 4.014] }),
        0.12,
        0.14,
        0.18
      );
      const iccBar = tintRawMesh(
        transformMesh(bevelBoxMesh(2.14, 0.13, 0.09, 0.018), { pos: [0, 0.4, 3.965] }),
        0.16,
        0.19,
        0.24
      );
      const truckPlate = tintRawMesh(
        transformMesh(bevelBoxMesh(0.38, 0.12, 0.032, 0.005), { pos: [-0.24, 0.63, 3.995] }),
        0.86,
        0.9,
        0.96
      );
      portalNear.push(lockBar, latchPlate, iccBar, truckPlate);
      portalFar.push(lockBar, iccBar);

      for (const mx of [-1.02, -0.26, 0, 0.26, 1.02]) {
        const dotMarker = tintRawMesh(
          transformMesh(bevelBoxMesh(0.095, 0.048, 0.032, 0.006), { pos: [mx, 3.31, 4.012] }),
          0.97,
          0.1,
          0.14
        );
        portalNear.push(dotMarker);
      }
      // Red/white DOT conspicuity reflector segments along rear sill
      for (let rIdx = -3; rIdx <= 3; rIdx += 1) {
        const isRed = Math.abs(rIdx) % 2 === 1;
        portalNear.push(
          tintRawMesh(
            transformMesh(bevelBoxMesh(0.24, 0.045, 0.024, 0.004), { pos: [rIdx * 0.27, 0.78, 4.018] }),
            isRed ? 0.94 : 0.92,
            isRed ? 0.12 : 0.94,
            isRed ? 0.15 : 0.98
          )
        );
      }

      trimParts = [
        tintRawMesh(chassisRails, 0.14, 0.16, 0.2),
        ...buildVehicleWheelAndTrimParts(0.48, 0.3, 1.04, [-2.95, 1.85, 2.95], 1.16, -4.0, 4.0),
        ...portalNear
      ];
      farParts.push(
        tintRawMesh(cab, cr, cg, cb),
        tintRawMesh(cargoBox, cr * 0.96, cg * 0.96, cb * 0.96),
        tintRawMesh(glassParts[0]!, 0.08, 0.13, 0.22),
        ...portalFar,
        ...buildFarWheelCylinders(0.48, 0.3, 1.04, [-2.95, 2.4])
      );
      break;
    }

    case "bus": {
      // [2.5, 3.2, 12.0] — smooth-shaded express coach with panoramic glass, rear upper window & engine louvers
      const hw = 1.24;
      const coachHull = loftSectionsMesh(
        [
          carSectionRing(-6.0, 1.08, 0.32, 1.24, 1.65, 0.92),
          carSectionRing(-5.45, hw, 0.3, 1.42, 3.06, 0.94),
          carSectionRing(-2.5, hw, 0.3, 1.44, 3.16, 0.95),
          carSectionRing(2.8, hw, 0.3, 1.44, 3.16, 0.95),
          carSectionRing(5.65, hw * 0.98, 0.32, 1.46, 3.08, 0.94),
          carSectionRing(6.0, 1.14, 0.36, 1.48, 2.92, 0.94)
        ],
        true,
        false
      );
      const hvacPod = transformMesh(bevelBoxMesh(1.54, 0.18, 3.6, 0.05), { pos: [0, 3.14, -0.4] });
      bodyParts.push(coachHull, hvacPod);

      const panoramicBand = loftSectionsMesh(
        [
          carSectionRing(-5.94, 1.06, 1.4, 1.6, 1.72, 0.94, 0),
          carSectionRing(-5.35, 1.19, 1.44, 2.24, 2.86, 0.95, 0),
          carSectionRing(5.25, 1.19, 1.46, 2.24, 2.84, 0.95, 0),
          carSectionRing(5.72, 1.11, 1.5, 2.1, 2.68, 0.94, 0)
        ],
        true,
        false
      );
      const rearCoachWindow = transformMesh(bevelBoxMesh(1.94, 0.72, 0.045, 0.014), { pos: [0, 2.34, 5.982] });
      glassParts.push(panoramicBand, rearCoachWindow);

      const busRearNear: RawMesh[] = [];
      const busRearFar: RawMesh[] = [];
      const engineFrame = tintRawMesh(
        transformMesh(bevelBoxMesh(1.74, 0.92, 0.036, 0.01), { pos: [0, 1.24, 5.988] }),
        0.12,
        0.14,
        0.18
      );
      busRearNear.push(engineFrame);
      busRearFar.push(engineFrame);
      for (let lIdx = 0; lIdx < 6; lIdx += 1) {
        busRearNear.push(
          tintRawMesh(
            transformMesh(bevelBoxMesh(1.58, 0.065, 0.044, 0.006), { pos: [0, 0.88 + lIdx * 0.14, 5.998] }),
            0.08,
            0.09,
            0.12
          )
        );
      }
      for (const side of [-1, 1] as const) {
        const tailColumn = tintRawMesh(
          transformMesh(bevelBoxMesh(0.18, 0.78, 0.048, 0.012), { pos: [side * 1.01, 1.22, 5.992] }),
          0.96,
          0.09,
          0.14
        );
        const turnSegment = tintRawMesh(
          transformMesh(bevelBoxMesh(0.16, 0.18, 0.052, 0.008), { pos: [side * 1.01, 1.42, 5.996] }),
          0.99,
          0.58,
          0.1
        );
        const topMarker = tintRawMesh(
          transformMesh(bevelBoxMesh(0.14, 0.055, 0.036, 0.006), { pos: [side * 0.86, 2.82, 5.98] }),
          0.97,
          0.1,
          0.14
        );
        busRearNear.push(tailColumn, turnSegment, topMarker);
        busRearFar.push(tailColumn);
      }
      const busPlate = tintRawMesh(
        transformMesh(bevelBoxMesh(0.4, 0.12, 0.034, 0.005), { pos: [0, 0.62, 5.996] }),
        0.86,
        0.9,
        0.96
      );
      busRearNear.push(busPlate);

      trimParts = [
        ...buildVehicleWheelAndTrimParts(0.5, 0.31, 1.08, [-3.85, 2.55, 3.95], hw, -6.0, 6.0),
        ...busRearNear
      ];
      farParts.push(
        tintRawMesh(coachHull, cr, cg, cb),
        tintRawMesh(hvacPod, 0.78, 0.82, 0.88),
        tintRawMesh(panoramicBand, 0.07, 0.12, 0.2),
        tintRawMesh(rearCoachWindow, 0.07, 0.11, 0.2),
        ...busRearFar,
        ...buildFarWheelCylinders(0.5, 0.31, 1.08, [-3.85, 3.25])
      );
      break;
    }

    case "carrier": {
      // [2.5, 3.6, 16.0] — twin-deck car-transporter tractor-trailer with integrated `5.0 m x 3.6 m` jumpable twin-track ramp
      const tractorCab = loftSectionsMesh(
        [
          carSectionRing(-8.0, 1.12, 0.36, 1.42, 1.76, 0.92),
          carSectionRing(-7.55, 1.22, 0.34, 1.58, 3.28, 0.94),
          carSectionRing(-5.65, 1.22, 0.34, 1.6, 3.56, 0.95),
          carSectionRing(-5.25, 1.18, 0.34, 1.6, 3.6, 0.96)
        ],
        true,
        false
      );
      // Lower trailer spine + twin upper deck tracks (`z = -5.2..+3.0`, top surface at `y = 3.6`)
      const lowerDeck = transformMesh(bevelBoxMesh(2.36, 0.34, 12.6, 0.04), { pos: [0, 0.72, 1.1] });
      const upperDeckLeft = transformMesh(bevelBoxMesh(0.84, 0.18, 8.2, 0.03), { pos: [-0.74, 3.51, -1.1] });
      const upperDeckRight = transformMesh(bevelBoxMesh(0.84, 0.18, 8.2, 0.03), { pos: [0.74, 3.51, -1.1] });
      const upperCrosstie = transformMesh(bevelBoxMesh(2.42, 0.14, 1.2, 0.03), { pos: [0, 3.48, 2.45] });

      // Integrated `5.0 m x 3.6 m` twin-track ramp (`z` from `+8.0` at `y = 0.08` up to `+3.0` at `y = 3.6`)
      const rampPitch = Math.atan2(3.52, 5.0);
      const rampHyp = Math.hypot(5.0, 3.52);
      const rampTrackL = transformMesh(bevelBoxMesh(0.84, 0.16, rampHyp, 0.025), {
        pos: [-0.74, 1.84, 5.5],
        rot: [rampPitch, 0, 0]
      });
      const rampTrackR = transformMesh(bevelBoxMesh(0.84, 0.16, rampHyp, 0.025), {
        pos: [0.74, 1.84, 5.5],
        rot: [rampPitch, 0, 0]
      });
      // Open diagonal side-truss stanchions supporting the upper deck
      const sideTrussL = transformMesh(
        latticeTrussMesh({ span: [0.16, 2.55, 7.8], bays: 5, chordRadius: 0.045, braceRadius: 0.03 }),
        { pos: [-1.14, 2.16, -0.9] }
      );
      const sideTrussR = transformMesh(
        latticeTrussMesh({ span: [0.16, 2.55, 7.8], bays: 5, chordRadius: 0.045, braceRadius: 0.03 }),
        { pos: [1.14, 2.16, -0.9] }
      );

      bodyParts.push(tractorCab, lowerDeck, upperDeckLeft, upperDeckRight, upperCrosstie, rampTrackL, rampTrackR);
      const tractorGlass = loftSectionsMesh(
        [
          carSectionRing(-7.92, 1.08, 1.56, 1.72, 1.82, 0.94, 0),
          carSectionRing(-7.45, 1.15, 1.6, 2.42, 3.08, 0.94, 0),
          carSectionRing(-5.85, 1.15, 1.62, 2.42, 3.08, 0.94, 0),
          carSectionRing(-5.6, 1.08, 1.64, 2.2, 2.8, 0.94, 0)
        ],
        true,
        false
      );
      const cabSleeperWindow = transformMesh(bevelBoxMesh(1.56, 0.5, 0.04, 0.01), { pos: [0, 2.54, -5.24] });
      glassParts.push(tractorGlass, cabSleeperWindow);

      const carrierRearTrim: RawMesh[] = [];
      const carrierRearFar: RawMesh[] = [];
      // Anti-slip dark traction cleats along the twin ramp tracks + rear entry beacon pods
      for (let cIdx = 0; cIdx < 7; cIdx += 1) {
        const frac = (cIdx + 0.5) / 7;
        const cz = 3.25 + frac * 4.45;
        const cy = 3.6 - (cz - 3.0) * (3.52 / 5.0) + 0.085;
        for (const side of [-1, 1] as const) {
          carrierRearTrim.push(
            tintRawMesh(
              transformMesh(bevelBoxMesh(0.76, 0.032, 0.11, 0.006), {
                pos: [side * 0.74, cy, cz],
                rot: [rampPitch, 0, 0]
              }),
              0.12,
              0.14,
              0.18
            )
          );
        }
      }
      const upperDeckTailBar = tintRawMesh(
        transformMesh(bevelBoxMesh(2.26, 0.09, 0.05, 0.01), { pos: [0, 3.48, 3.05] }),
        0.96,
        0.1,
        0.14
      );
      carrierRearTrim.push(upperDeckTailBar);
      carrierRearFar.push(upperDeckTailBar);
      for (const side of [-1, 1] as const) {
        const entryPod = tintRawMesh(
          transformMesh(bevelBoxMesh(0.22, 0.24, 0.08, 0.014), { pos: [side * 1.12, 0.44, 7.82] }),
          0.97,
          0.1,
          0.14
        );
        const amberBeacon = tintRawMesh(
          transformMesh(bevelBoxMesh(0.18, 0.1, 0.085, 0.01), { pos: [side * 1.12, 0.62, 7.82] }),
          0.99,
          0.6,
          0.1
        );
        carrierRearTrim.push(entryPod, amberBeacon);
        carrierRearFar.push(entryPod);
      }

      trimParts = [
        tintRawMesh(sideTrussL, 0.74, 0.79, 0.86),
        tintRawMesh(sideTrussR, 0.74, 0.79, 0.86),
        ...buildVehicleWheelAndTrimParts(0.5, 0.31, 1.08, [-6.65, -3.95, 2.15, 3.55], 1.2, -8.0, 8.0),
        ...carrierRearTrim
      ];
      farParts.push(
        tintRawMesh(tractorCab, cr, cg, cb),
        tintRawMesh(lowerDeck, 0.22, 0.25, 0.3),
        tintRawMesh(upperDeckLeft, cr, cg, cb),
        tintRawMesh(upperDeckRight, cr, cg, cb),
        tintRawMesh(rampTrackL, cr, cg, cb),
        tintRawMesh(rampTrackR, cr, cg, cb),
        tintRawMesh(tractorGlass, 0.08, 0.13, 0.22),
        ...carrierRearFar,
        ...buildFarWheelCylinders(0.5, 0.31, 1.08, [-6.65, -3.95, 2.85])
      );
      break;
    }
  }

  return {
    nearBody: mergeRawMeshes(bodyParts),
    nearGlass: mergeRawMeshes(glassParts),
    nearTrim: mergeColoredMeshesToSpec(trimParts),
    farLod: mergeColoredMeshesToSpec(farParts)
  };
}

/**
 * Sky-lane rival aero-interceptor (`SKY_SPEC = { w: 2.0, h: 1.15, l: 4.3 }`, front `-Z`, `minY = 0`).
 * Since `POOL_CAPACITY.skyCar = 26 > 20`, uses vertex-tinted multi-tone surfaces paired with single-draw hardware
 * `material.metal(..., { clearcoat: 0 })` (near) and `material.pbr(..., { clearcoat: 0 })` (far).
 */
export function buildSkycarGeometries(): {
  readonly nearSpec: AuraCustomGeometrySpec;
  readonly farSpec: AuraCustomGeometrySpec;
} {
  // Smooth-shaded stealth gunmetal hover-fuselage (`y` in `[0.12, 1.08]`, `z` in `[-2.15, +2.15]`)
  const fuselage = loftSectionsMesh(
    [
      carSectionRing(-2.15, 0.34, 0.32, 0.44, 0.5, 0.72, 0.02),
      carSectionRing(-1.78, 0.54, 0.26, 0.48, 0.6, 0.73, 0.025),
      carSectionRing(-1.32, 0.69, 0.22, 0.53, 0.7, 0.74, 0.03),
      carSectionRing(-0.45, 0.76, 0.18, 0.58, 0.86, 0.72, 0.03),
      carSectionRing(0.42, 0.78, 0.18, 0.61, 0.88, 0.73, 0.03),
      carSectionRing(1.18, 0.75, 0.2, 0.62, 0.86, 0.75, 0.025),
      carSectionRing(1.78, 0.68, 0.24, 0.6, 0.8, 0.78, 0.02),
      carSectionRing(2.15, 0.52, 0.3, 0.56, 0.7, 0.82, 0.01)
    ],
    true,
    false
  );
  const canopy = loftSectionsMesh(
    [
      carSectionRing(-1.12, 0.42, 0.62, 0.68, 0.72, 0.76, 0),
      carSectionRing(-0.68, 0.49, 0.64, 0.8, 0.94, 0.75, 0),
      carSectionRing(-0.22, 0.53, 0.66, 0.88, 1.06, 0.74, 0),
      carSectionRing(0.45, 0.5, 0.67, 0.87, 1.04, 0.74, 0),
      carSectionRing(0.92, 0.43, 0.68, 0.81, 0.92, 0.76, 0),
      carSectionRing(1.28, 0.34, 0.68, 0.74, 0.78, 0.78, 0)
    ],
    true,
    false
  );
  const rearLightStrip = tintRawMesh(
    transformMesh(bevelBoxMesh(0.84, 0.055, 0.04, 0.008), { pos: [0, 0.64, 2.12] }),
    0.98,
    0.14,
    0.2
  );

  const nearParts: RawMesh[] = [
    tintRawMesh(fuselage, 0.19, 0.22, 0.29),
    tintRawMesh(canopy, 0.06, 0.1, 0.18),
    rearLightStrip
  ];
  const farParts: RawMesh[] = [
    tintRawMesh(fuselage, 0.19, 0.22, 0.29),
    tintRawMesh(canopy, 0.06, 0.1, 0.18),
    rearLightStrip
  ];

  // Swept delta winglets (`x` out to `+-1.0`, matching `w = 2.0`), twin shrouded lift fans & canted rival-red V-tailfins
  const ductProfile: V2[] = [
    [0.2, -0.09],
    [0.31, -0.09],
    [0.33, 0.09],
    [0.2, 0.09]
  ];
  for (const side of [-1, 1] as const) {
    const wingPoly: V2[] = [
      [0, -0.78],
      [side * 0.42, 0.18],
      [side * 0.42, 0.72],
      [0, 0.94]
    ];
    const wing = transformMesh(extrudePolygonMesh(wingPoly, 0.055, 0.012), {
      rot: [Math.PI * 0.5, 0, 0],
      pos: [side * 0.58, 0.46, 0.35]
    });
    nearParts.push(tintRawMesh(wing, 0.23, 0.27, 0.35));
    farParts.push(tintRawMesh(wing, 0.23, 0.27, 0.35));

    // Shrouded VTOL ducted fan pods (`minY` landing skids at `y = 0`, outer shroud aligned to `x = +-1.0`)
    const duct = transformMesh(latheMesh(ductProfile, 14), {
      pos: [side * 0.66, 0.38, -0.75]
    });
    const skid = transformMesh(bevelBoxMesh(0.08, 0.12, 1.65, 0.02), {
      pos: [side * 0.58, 0.06, 0.1]
    });
    nearParts.push(tintRawMesh(duct, 0.68, 0.74, 0.82), tintRawMesh(skid, 0.12, 0.14, 0.18));

    // Rival-red canted vertical tailfin (`maxY = 1.15`)
    const finPoly: V2[] = [
      [-0.36, 0],
      [0.34, 0],
      [0.42, 0.42],
      [0.06, 0.42]
    ];
    const tailfin = transformMesh(extrudePolygonMesh(finPoly, 0.036, 0.008), {
      pos: [side * 0.54, 0.72, 1.62],
      rot: [0, Math.PI * 0.5, side * -0.24]
    });
    nearParts.push(tintRawMesh(tailfin, 0.96, 0.18, 0.24));
    farParts.push(tintRawMesh(tailfin, 0.96, 0.18, 0.24));
  }

  // Rear vectoring jet exhaust bell
  const jetBellProfile: V2[] = [
    [0.12, -0.14],
    [0.24, -0.14],
    [0.28, 0.14],
    [0.16, 0.14]
  ];
  nearParts.push(
    tintRawMesh(
      transformMesh(latheMesh(jetBellProfile, 16), {
        pos: [0, 0.45, 2.01],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      0.78,
      0.82,
      0.88
    )
  );

  return {
    nearSpec: mergeColoredMeshesToSpec(nearParts),
    farSpec: mergeColoredMeshesToSpec(farParts)
  };
}

// ---------------------------------------------------------------------------
// 3. Carrier Launch Ramp Kit, Skyway Architecture, Pickups & Coastal Bay Ridge
// ---------------------------------------------------------------------------

/** Sculpted twin-track ribbed launch deck for `carrier-ramps` (`[2.38, 0.16, 6.6]`). */
export function buildCarrierRampDeckSpec(): AuraCustomGeometrySpec {
  const leftTrack = transformMesh(bevelBoxMesh(0.86, 0.15, 6.56, 0.025), { pos: [-0.72, 0, 0] });
  const rightTrack = transformMesh(bevelBoxMesh(0.86, 0.15, 6.56, 0.025), { pos: [0.72, 0, 0] });
  const centerBridge = bevelBoxMesh(0.62, 0.09, 6.4, 0.02);
  const parts: RawMesh[] = [leftTrack, rightTrack, centerBridge];
  for (let i = -4; i <= 4; i += 1) {
    parts.push(transformMesh(bevelBoxMesh(2.3, 0.035, 0.14, 0.008), { pos: [0, 0.075, i * 0.68] }));
  }
  return mergeRawMeshes(parts);
}

/** Sculpted tubular safety rail with vertical stanchions for `carrier-ramp-rails` (`[0.14, 0.28, 6.6]`). */
export function buildCarrierRampRailSpec(): AuraCustomGeometrySpec {
  const topTube = tubeSweepMesh(
    [
      [0, 0.11, -3.26, 0.042],
      [0, 0.13, 0, 0.046],
      [0, 0.11, 3.26, 0.042]
    ],
    8,
    true
  );
  const baseCurb = transformMesh(bevelBoxMesh(0.13, 0.08, 6.56, 0.018), { pos: [0, -0.09, 0] });
  const parts: RawMesh[] = [topTube, baseCurb];
  for (let i = -3; i <= 3; i += 1) {
    parts.push(transformMesh(bevelBoxMesh(0.06, 0.2, 0.09, 0.01), { pos: [0, 0.01, i * 0.96] }));
  }
  return mergeRawMeshes(parts);
}

/** Extruded directional forward-pointing `-Z` chevron arrow for `carrier-ramp-chevrons` (`[1.85, 0.04, 0.26]`). */
export function buildCarrierRampChevronSpec(): AuraCustomGeometrySpec {
  const chevPoly: V2[] = [
    [-0.9, 0.12],
    [0, -0.13],
    [0.9, 0.12],
    [0.68, 0.12],
    [0, -0.04],
    [-0.68, 0.12]
  ];
  return mergeRawMeshes([
    transformMesh(extrudePolygonMesh(chevPoly, 0.04, 0.008), { rot: [Math.PI * 0.5, 0, 0] })
  ]);
}

/**
 * Unit-cube-normalized (`[-0.5..+0.5]^3`) open 4-chord X-braced `latticeTrussMesh` for `gantry-steel`,
 * scaled per-part by `gantryBoxes()` so collidable `SIGN_BAND` clearances stay exact.
 */
export function buildGantrySteelTrussSpec(): AuraCustomGeometrySpec {
  const truss = latticeTrussMesh({
    span: [8.0, 1.0, 1.0],
    bays: 8,
    chordRadius: 0.085,
    braceRadius: 0.052
  });
  return mergeRawMeshes([normalizeMeshToUnitCube(truss)]);
}

/** Unit-cube-normalized (`[-0.5..+0.5]^3`) bevelled highway sign panel with perimeter frame for `gantry-boards`. */
export function buildGantrySignBoardSpec(): AuraCustomGeometrySpec {
  const panel = bevelBoxMesh(0.96, 0.94, 0.42, 0.03);
  const topFrame = transformMesh(bevelBoxMesh(1.0, 0.08, 0.96, 0.015), { pos: [0, 0.46, 0] });
  const botFrame = transformMesh(bevelBoxMesh(1.0, 0.08, 0.96, 0.015), { pos: [0, -0.46, 0] });
  const leftFrame = transformMesh(bevelBoxMesh(0.05, 1.0, 0.96, 0.012), { pos: [-0.475, 0, 0] });
  const rightFrame = transformMesh(bevelBoxMesh(0.05, 1.0, 0.96, 0.012), { pos: [0.475, 0, 0] });
  return mergeRawMeshes([normalizeMeshToUnitCube(mergeRawMeshesToRawLocal([panel, topFrame, botFrame, leftFrame, rightFrame]))]);
}

/** Unit-cube-normalized (`[-0.5..+0.5]^3`) hooded LED clearance luminaire bar for `gantry-trims`. */
export function buildGantryLuminaireTrimSpec(): AuraCustomGeometrySpec {
  const bar = tubeSweepMesh(
    [
      [-0.49, 0, 0, 0.34],
      [0, 0.04, 0, 0.38],
      [0.49, 0, 0, 0.34]
    ],
    8,
    true
  );
  return mergeRawMeshes([normalizeMeshToUnitCube(bar)]);
}

function mergeRawMeshesToRawLocal(meshes: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of meshes) {
    const vOff = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
  }
  return { positions, normals, uvs, indices };
}

/**
 * Tapered fluted architectural Y-pier column (`deck-pylon-columns`), matching `PYLON_KIT.column.size`
 * (`[2.2, 26.2, 3.0]`, centered at `[0, 0, 0]`).
 */
export function buildDeckPylonColumnSpec(size: readonly [number, number, number]): AuraCustomGeometrySpec {
  const [sx, sy, sz] = size;
  const hy = sy * 0.5;
  const ringAt = (y: number, wx: number, wz: number): V3[] => {
    const pts: V3[] = [];
    const segs = 12;
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const flute = 1 - 0.08 * Math.cos(a * 4);
      pts.push([Math.cos(a) * wx * 0.5 * flute, y, Math.sin(a) * wz * 0.5 * flute]);
    }
    return pts;
  };
  const shaft = loftSectionsMesh(
    [
      ringAt(-hy, sx * 1.18, sz * 1.16),
      ringAt(-hy * 0.45, sx * 0.94, sz * 0.94),
      ringAt(hy * 0.35, sx * 0.82, sz * 0.84),
      ringAt(hy * 0.78, sx * 0.98, sz * 0.96),
      ringAt(hy, sx * 1.28, sz * 1.08)
    ],
    true,
    false
  );
  // Flared Y-capital twin diagonal struts at top of shaft
  const leftBranch = tubeSweepMesh(
    [
      [0, hy * 0.48, 0, sx * 0.28],
      [-sx * 0.48, hy * 0.98, 0, sx * 0.24]
    ],
    8,
    true
  );
  const rightBranch = tubeSweepMesh(
    [
      [0, hy * 0.48, 0, sx * 0.28],
      [sx * 0.48, hy * 0.98, 0, sx * 0.24]
    ],
    8,
    true
  );
  return mergeRawMeshes([shaft, leftBranch, rightBranch]);
}

/**
 * Haunched hammerhead prestressed box-girder cap beam (`deck-pylon-caps`), matching `PYLON_KIT.cap.size`
 * (`[23.2, 1.8, 3.8]`, centered at `[0, 0, 0]`).
 */
export function buildDeckPylonCapSpec(size: readonly [number, number, number]): AuraCustomGeometrySpec {
  const [sx, sy, sz] = size;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const capSection = (x: number, bottomY: number, halfZ: number): V3[] => [
    [x, bottomY, -halfZ * 0.76],
    [x, bottomY, halfZ * 0.76],
    [x, hy, halfZ],
    [x, hy, -halfZ]
  ];
  const beam = loftSectionsMesh(
    [
      capSection(-hx, hy * 0.18, hz * 0.82),
      capSection(-hx * 0.72, -hy, hz),
      capSection(0, -hy * 0.82, hz),
      capSection(hx * 0.72, -hy, hz),
      capSection(hx, hy * 0.18, hz * 0.82)
    ],
    true,
    true
  );
  return mergeRawMeshes([beam]);
}

/** Tapered octagonal galvanized highway standard (`light-poles`, height `7.6 m`). */
export function buildLightPoleSpec(): AuraCustomGeometrySpec {
  const prof: V2[] = [
    [0.24, -3.8],
    [0.22, -3.35],
    [0.13, -3.2],
    [0.095, 0.4],
    [0.068, 3.8],
    [0, 3.8]
  ];
  return mergeRawMeshes([latheMesh(prof, 8)]);
}

/** Curved davit cantilever luminaire arm (`light-arms`, span `1.8 m` along X). */
export function buildLightArmSpec(): AuraCustomGeometrySpec {
  const armCurve: V4[] = [
    [-0.9, -0.1, 0, 0.055],
    [-0.25, 0.06, 0, 0.048],
    [0.45, 0.08, 0, 0.042],
    [0.9, 0.02, 0, 0.036]
  ];
  const gusset = tubeSweepMesh(
    [
      [-0.86, -0.22, 0, 0.032],
      [-0.2, 0.04, 0, 0.028]
    ],
    6,
    true
  );
  return mergeRawMeshes([tubeSweepMesh(armCurve, 8, true), gusset]);
}

/** Cobra-head hooded roadway LED luminaire optical emitter (`light-lamps`, `[0.42, 0.18, 0.54]`). */
export function buildLightLampSpec(): AuraCustomGeometrySpec {
  const lampPoly: V2[] = [
    [-0.21, -0.26],
    [0.21, -0.22],
    [0.16, 0.26],
    [-0.16, 0.26]
  ];
  return mergeRawMeshes([
    transformMesh(extrudePolygonMesh(lampPoly, 0.14, 0.028), { rot: [Math.PI * 0.5, 0, 0] })
  ]);
}

/** Segmented hexagonal aero sky-gate ring (`beacon-rings`, matching `RING_SIZE = [1.8, 1.8, 0.1]`). */
export function buildBeaconRingSpec(size: readonly [number, number, number]): AuraCustomGeometrySpec {
  const r = size[0] * 0.5;
  const tubeR = Math.max(0.055, size[2] * 0.65);
  const segs = 16;
  const ringPts: V4[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    ringPts.push([Math.cos(a) * r, Math.sin(a) * r, 0, tubeR * (i % 4 === 0 ? 1.32 : 0.92)]);
  }
  return mergeRawMeshes([tubeSweepMesh(ringPts, 8, false)]);
}

/** Truss-braced overhead viaduct box-girder deck (`interchange-span-decks`, matching `SPAN_DECK_SIZE`). */
export function buildSpanDeckSpec(size: readonly [number, number, number]): AuraCustomGeometrySpec {
  const [sx, sy, sz] = size;
  const topSlab = transformMesh(bevelBoxMesh(sx, sy * 0.42, sz, 0.12), { pos: [0, sy * 0.29, 0] });
  const underTruss = transformMesh(
    latticeTrussMesh({
      span: [sx * 0.94, sy * 0.62, sz * 0.76],
      bays: 12,
      chordRadius: 0.22,
      braceRadius: 0.14
    }),
    { pos: [0, -sy * 0.18, 0] }
  );
  return mergeRawMeshes([topSlab, underTruss]);
}

/** Tapered twin-shaft viaduct pier (`interchange-span-piers`, matching `SPAN_PIER_SIZE`). */
export function buildSpanPierSpec(size: readonly [number, number, number]): AuraCustomGeometrySpec {
  return buildDeckPylonColumnSpec(size);
}

/** Space-frame trussed highway billboard structure (`billboard-frames`, matching `BILLBOARD_FRAME_SIZE`). */
export function buildBillboardFrameSpec(size: readonly [number, number, number]): AuraCustomGeometrySpec {
  const [sx, sy, sz] = size;
  const truss = latticeTrussMesh({
    span: [sx, sy, sz],
    bays: 6,
    chordRadius: 0.14,
    braceRadius: 0.09
  });
  const borderTop = transformMesh(bevelBoxMesh(sx, 0.26, sz * 1.05, 0.04), { pos: [0, sy * 0.48, 0] });
  const borderBot = transformMesh(bevelBoxMesh(sx, 0.26, sz * 1.05, 0.04), { pos: [0, -sy * 0.48, 0] });
  return mergeRawMeshes([truss, borderTop, borderBot]);
}

/** Sculpted faceted double-pyramid lightning crystal with collar ring for `pickup-bolts` (`172` slots). */
export function buildBoltCrystalSpec(): AuraCustomGeometrySpec {
  const crystalProfile: V2[] = [
    [0, -0.34],
    [0.19, -0.08],
    [0.24, 0],
    [0.19, 0.08],
    [0, 0.34]
  ];
  const core = toFlatShaded(latheMesh(crystalProfile, 6));
  const orbitPts: V4[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    orbitPts.push([Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0, 0.032]);
  }
  const ring = transformMesh(tubeSweepMesh(orbitPts, 6, false), { rot: [0.52, 0, 0] });
  return mergeRawMeshes([core, ring]);
}

/**
 * Distinct sculpted multi-tone powerup emblems (`pickup-${kind}` for `air`, `rocket`, `shield`, `magnet`, `multiplier`),
 * combining bright alloy frames (`[0.88, 0.92, 0.98]`) and saturated energy cores via vertex colors.
 */
export function buildPowerupEmblemSpec(kind: PowerupKind): AuraCustomGeometrySpec {
  switch (kind) {
    case "air": {
      // Twin pressurized cryo-air cylinders + manifold bridge
      const tankProf: V2[] = [
        [0, -0.44],
        [0.16, -0.38],
        [0.18, -0.26],
        [0.18, 0.26],
        [0.14, 0.38],
        [0.06, 0.46],
        [0, 0.46]
      ];
      const tankL = tintRawMesh(transformMesh(latheMesh(tankProf, 14), { pos: [-0.19, 0, 0] }), 0.3, 0.94, 1.0);
      const tankR = tintRawMesh(transformMesh(latheMesh(tankProf, 14), { pos: [0.19, 0, 0] }), 0.3, 0.94, 1.0);
      const collar = tintRawMesh(bevelBoxMesh(0.58, 0.14, 0.22, 0.03), 0.86, 0.9, 0.96);
      return mergeColoredMeshesToSpec([tankL, tankR, collar]);
    }
    case "rocket": {
      // Finned supersonic booster warhead + bell nozzle
      const bodyProf: V2[] = [
        [0.18, -0.52],
        [0.12, -0.38],
        [0.2, -0.24],
        [0.21, 0.16],
        [0.13, 0.4],
        [0, 0.56]
      ];
      const fuselage = tintRawMesh(latheMesh(bodyProf, 16), 1.0, 0.44, 0.2);
      const finPoly: V2[] = [
        [0, -0.24],
        [0.24, -0.34],
        [0.22, -0.14],
        [0, 0.06]
      ];
      const baseFin = extrudePolygonMesh(finPoly, 0.035, 0.008);
      const fins: RawMesh[] = [];
      for (let i = 0; i < 4; i += 1) {
        fins.push(
          tintRawMesh(
            transformMesh(baseFin, { rot: [0, (i * Math.PI) / 2, 0], pos: [0, -0.18, 0] }),
            0.88,
            0.91,
            0.96
          )
        );
      }
      return mergeColoredMeshesToSpec([fuselage, ...fins]);
    }
    case "shield": {
      // Faceted icosahedral projector core inside orthogonal gyroscopic halo rings
      const core = tintRawMesh(icosphereFacetMesh(0.32, 1, 0.04, 7), 0.24, 0.78, 1.0);
      const ringPts: V4[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        ringPts.push([Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0, 0.038]);
      }
      const baseRing = tubeSweepMesh(ringPts, 7, false);
      const ringA = tintRawMesh(transformMesh(baseRing, { rot: [0.45, 0, 0] }), 0.88, 0.93, 1.0);
      const ringB = tintRawMesh(transformMesh(baseRing, { rot: [0, 0.65, Math.PI * 0.5] }), 0.45, 0.88, 1.0);
      return mergeColoredMeshesToSpec([core, ringA, ringB]);
    }
    case "magnet": {
      // Classic sculpted horseshoe U-arch flux magnet with crimson/silver pole tips
      const archPts: V4[] = [];
      const steps = 12;
      archPts.push([-0.34, -0.4, 0, 0.1]);
      archPts.push([-0.34, -0.05, 0, 0.1]);
      for (let i = 0; i <= steps; i += 1) {
        const a = Math.PI - (i / steps) * Math.PI;
        archPts.push([Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0, 0.1]);
      }
      archPts.push([0.34, -0.05, 0, 0.1]);
      archPts.push([0.34, -0.4, 0, 0.1]);
      const arch = tintRawMesh(tubeSweepMesh(archPts, 10, true), 0.96, 0.24, 0.26);
      const capL = tintRawMesh(transformMesh(bevelBoxMesh(0.23, 0.18, 0.23, 0.025), { pos: [-0.34, -0.38, 0] }), 0.88, 0.92, 0.98);
      const capR = tintRawMesh(transformMesh(bevelBoxMesh(0.23, 0.18, 0.23, 0.025), { pos: [0.34, -0.38, 0] }), 0.88, 0.92, 0.98);
      return mergeColoredMeshesToSpec([arch, capL, capR]);
    }
    case "multiplier": {
      // Sculpted 6-point star crest medallion inside a bevelled golden halo
      const starPoly: V2[] = [];
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const r = i % 2 === 0 ? 0.44 : 0.21;
        starPoly.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      const star = tintRawMesh(extrudePolygonMesh(starPoly, 0.16, 0.03), 1.0, 0.78, 0.2);
      const rimPts: V4[] = [];
      for (let i = 0; i <= 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        rimPts.push([Math.cos(a) * 0.49, Math.sin(a) * 0.49, 0, 0.034]);
      }
      const halo = tintRawMesh(tubeSweepMesh(rimPts, 7, false), 0.96, 0.92, 0.76);
      return mergeColoredMeshesToSpec([star, halo]);
    }
  }
}

/**
 * Unit-cube-normalized (`[-0.5..+0.5]^3`) terraced sedimentary coastal ridge (`coastal-bay-ridge`),
 * sculpted with `stratifiedCliffMesh` + `fbm3` crags and paired with `buildBayRidgeStrataMaterial()`.
 */
export function buildBayRidgeMountainSpec(): AuraCustomGeometrySpec {
  const mainMassif = stratifiedCliffMesh({
    radiusX: 1.0,
    radiusZ: 0.72,
    height: 1.0,
    terraces: 6,
    seed: 29
  });
  const shoulderSpur = transformMesh(
    stratifiedCliffMesh({
      radiusX: 0.62,
      radiusZ: 0.54,
      height: 0.72,
      terraces: 5,
      seed: 53
    }),
    { pos: [0.48, 0, 0.16], rot: [0, 0.65, 0] }
  );
  const westSpur = transformMesh(
    stratifiedCliffMesh({
      radiusX: 0.56,
      radiusZ: 0.48,
      height: 0.64,
      terraces: 4,
      seed: 81
    }),
    { pos: [-0.46, 0, -0.14], rot: [0, -0.5, 0] }
  );
  const merged = mergeRawMeshesToRawLocal([mainMassif, shoulderSpur, westSpur]);
  // Displace ridge crest subtly with deterministic `fbm3` + `hash01` so no flat plateau reads as a box
  const pos = merged.positions.slice();
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
    const ridgeFactor = Math.max(0, y);
    const crag = (fbm3(x * 2.1 + 4.3, y * 1.7, z * 2.1 - 3.1, 41) - 0.5) * 0.22 * ridgeFactor;
    const spire = (hash01(Math.round(x * 12) + 17, Math.round(z * 12) + 31, 9) - 0.5) * 0.05 * ridgeFactor;
    pos[i + 1] = y + crag + spire;
  }
  const sculpted = toFlatShaded({ ...merged, positions: pos });
  return mergeRawMeshes([normalizeMeshToUnitCube(sculpted)]);
}
