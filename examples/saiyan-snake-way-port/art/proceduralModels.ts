/**
 * WP-21 — Serpentine Sky Run Multi-Material Procedural 3D Art Kit.
 *
 * Replaces all 11 static Meshy clay props and sky landmarks with sculpted multi-material
 * geometry built exclusively from `apps/showcase-port-shared/proceduralKernel.ts` and
 * `@aura3d/engine` physical surface presets (with a paired WGSL twin for `material.strata`).
 * Zero `three` imports; rigged runner skeletons remain untouched.
 */
import {
  type AuraCustomGeometrySpec,
  type AuraCustomMaterialSpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode,
  geometry,
  group,
  material
} from "@aura3d/engine";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }>;
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  coniferBoughTierMesh,
  deformMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptHumanoidLimbMesh,
  sculptStylizedHeadMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import { WGSL_CLIP, WGSL_ENVIRONMENT_FOG, WGSL_NOISE, wgslStage } from "../../shared/wgsl-twins";
import { WGSL_A3D_LIGHTS, WGSL_A3D_SCENE, WGSL_A3D_SHADOW } from "../../shared/wgsl-author-lights";

/** Strips preset `.name` so `scene.toJSON()` never emits duplicate `"name"` fields across nodes. */
export const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

/* ------------------------------------------------------------------ WGSL twin for non-instanced strata */

const STRATA_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct StrataVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vNormal: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> StrataVarying {
  var out: StrataVarying;
  let world = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.vWorld = world.xyz;
  out.vNormal = a3dMat3Mul(aura.u_modelMatrix, a_normal);
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

const srgbHexToLinear = (hex: string): V3 => {
  const v = parseInt(hex.slice(1), 16);
  const dec = (k: number): number => {
    const c = ((v >> k) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [dec(16), dec(8), dec(0)];
};

/** `material.strata(...)` paired with its WebGPU WGSL twin for floating celestial crag cliffs. */
export function strataSkyCragMaterial(warmCrimson = false): AuraMaterialSpec {
  const colors = warmCrimson
    ? (["#7c3938", "#9e5246", "#582c3a", "#b46d56", "#432234"] as const)
    : (["#475b5a", "#66827c", "#3a4556", "#839e92", "#2f3947"] as const);
  const base = unnamed(material.strata({
    bands: 12,
    colors,
    heightRange: [-60, 110],
    noise: 0.4,
    noiseScale: 10,
    seam: 0.34,
    variation: 0.18,
    slope: { angle: 42, blend: 14, flatColor: warmCrimson ? "#9e8562" : "#6b9c7e" },
    roughness: 0.86
  }));
  if (base.kind !== "custom" || !base.custom) return base;
  const custom: AuraCustomMaterialSpec = {
    ...base.custom,
    castShadow: false,
    wgsl: { vertex: STRATA_VERTEX_WGSL, fragment: strataFragmentWgsl(colors.map(srgbHexToLinear)) }
  };
  return { ...base, custom };
}

/* ------------------------------------------------------------------ Multi-lobe physical material library */

export const MAT_CELADON_JADE = unnamed(material.ceramic({ color: "#7fe0c4", roughness: 0.18, clearcoat: 0.86, clearcoatRoughness: 0.08 }));
export const MAT_EMERALD_SCALE = unnamed(material.ceramic({ color: "#2d8f78", roughness: 0.24, clearcoat: 0.72, clearcoatRoughness: 0.12 }));
export const MAT_PEARL_IVORY = unnamed(material.ceramic({ color: "#f6efe0", roughness: 0.2, clearcoat: 0.65, clearcoatRoughness: 0.1 }));
export const MAT_VERMILION_LACQUER = unnamed(material.lacquer({ color: "#d93829", roughness: 0.14, clearcoat: 0.94, clearcoatRoughness: 0.06 }));
export const MAT_EBONY_LACQUER = unnamed(material.lacquer({ color: "#191720", roughness: 0.22, clearcoat: 0.84, clearcoatRoughness: 0.1 }));
export const MAT_INDIGO_LACQUER = unnamed(material.lacquer({ color: "#231c4c", roughness: 0.2, clearcoat: 0.88, clearcoatRoughness: 0.08 }));
export const MAT_CRIMSON_ARMOR = unnamed(material.clearcoatPaint({ color: "#b83b32", roughness: 0.26, clearcoat: 0.85, clearcoatRoughness: 0.1 }));
export const MAT_ONI_SKIN = unnamed(material.pbr({ color: "#9c3e35", roughness: 0.62, metalness: 0.04 }));
export const MAT_IMPERIAL_GOLD = unnamed(material.studioMetal({ color: "#f2be49", roughness: 0.2, metalness: 0.94 }));
export const MAT_BURNISHED_BRONZE = unnamed(material.studioMetal({ color: "#9c703c", roughness: 0.34, metalness: 0.88 }));
export const MAT_FORGED_IRON = unnamed(material.brushedMetal({ color: "#4b5260", roughness: 0.34, metalness: 0.92, anisotropy: 0.72 }));
export const MAT_PRAYER_SILK = unnamed(material.fabric({ color: "#ff7a6b", roughness: 0.84, sheen: 0.82, sheenColor: "#ffd8c4", sheenRoughness: 0.42 }));
export const MAT_INDIGO_SILK = unnamed(material.fabric({ color: "#38306e", roughness: 0.84, sheen: 0.78, sheenColor: "#8b82d6", sheenRoughness: 0.44 }));
export const MAT_TIGER_PELT = unnamed(material.fabric({ color: "#e39c2b", roughness: 0.84, sheen: 0.72, sheenColor: "#ffe09c", sheenRoughness: 0.46 }));
export const MAT_TEMPLE_GRANITE = unnamed(material.pbr({ color: "#8c868e", roughness: 0.84, metalness: 0.04 }));
export const MAT_DARK_SLATE = unnamed(material.pbr({ color: "#3d3c4c", roughness: 0.78, metalness: 0.08 }));
export const MAT_CEDAR_WOOD = unnamed(material.pbr({ color: "#6e462c", roughness: 0.74, metalness: 0.03 }));
export const MAT_CLOUD_FOLIAGE = unnamed(material.pbr({ color: "#389668", roughness: 0.66, metalness: 0.02 }));
export const MAT_GOLDEN_CANOPY = unnamed(material.pbr({ color: "#eba83c", roughness: 0.6, metalness: 0.04 }));
export const MAT_BLOSSOM_CANOPY = unnamed(material.pbr({ color: "#f694b2", roughness: 0.6, metalness: 0.02 }));
export const MAT_CUMULUS_TUFT = unnamed(material.pbr({ color: "#fff1df", roughness: 0.9, metalness: 0.0, emissive: "#ffd5a6", emissiveIntensity: 0.08 }));
export const MAT_SANCTUARY_TURF = unnamed(material.pbr({ color: "#58b86c", roughness: 0.82, metalness: 0.02 }));
export const MAT_ROAST_GLAZE = unnamed(material.clearcoatPaint({ color: "#c96d28", roughness: 0.24, clearcoat: 0.8, clearcoatRoughness: 0.12 }));

/** Translucent physical crystal / shoji pane (safe WebGPU path: opacity 0.50, clearcoat 1, ior 1.55, castShadow false). */
export const MAT_SPIRIT_GLASS = unnamed(material.physical({ color: "#ffe9a8", roughness: 0.05, opacity: 0.5, clearcoat: 1, ior: 1.55 }));
export const MAT_JADE_CRYSTAL = unnamed(material.physical({ color: "#98f5dc", roughness: 0.06, opacity: 0.5, clearcoat: 1, ior: 1.55 }));

/** Practical emissive accents (`practical: true` whenever `emissiveIntensity > 0.1`). */
export const MAT_AMBER_FLAME = unnamed(material.emissive({ color: "#ffe6a3", emissive: "#ffb84d", emissiveIntensity: 2.2, practical: true }));
export const MAT_CHOCHIN_PAPER = unnamed(material.emissive({ color: "#fff3d6", emissive: "#ff9d3b", emissiveIntensity: 2.1, practical: true }));
export const MAT_DRAGON_EYE = unnamed(material.emissive({ color: "#fff2b8", emissive: "#ff9d2e", emissiveIntensity: 2.6, practical: true }));
export const MAT_JADE_WARD_GLOW = unnamed(material.emissive({ color: "#d8fff0", emissive: "#64ebb9", emissiveIntensity: 1.9, practical: true }));
export const MAT_SPECTRAL_FLAME = unnamed(material.emissive({ color: "#dcfff6", emissive: "#4ce6c0", emissiveIntensity: 2.35, practical: true }));

/** Batched instanced materials (`clearcoat: 0, sheen: 0` per >16 instance batch rule for 60 FPS mobile GPU budget). */
export const MAT_INSTANCED_DORSAL_SPINE = unnamed(material.metal({ color: "#eab64d", roughness: 0.28, metalness: 0.88, clearcoat: 0, sheen: 0 }));
export const MAT_INSTANCED_TORII_VERMILION = unnamed(material.pbr({ color: "#d93829", roughness: 0.2, metalness: 0.05 }));
export const MAT_INSTANCED_TORII_EBONY = unnamed(material.pbr({ color: "#191720", roughness: 0.32, metalness: 0.12 }));

/* ------------------------------------------------------------------ Smooth-normal & architectural helpers */

/** Welds coincident vertices by spatial hash to produce continuous smooth vertex normals on organic surfaces. */
export function smoothWeldedNormals(mesh: RawMesh, quant = 2000): RawMesh {
  const count = mesh.positions.length / 3;
  const buckets = new Map<string, [number, number, number]>();
  const keys = new Array<string>(count);
  const acc = new Float64Array(count * 3);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t]!, i1 = mesh.indices[t + 1]!, i2 = mesh.indices[t + 2]!;
    const ax = mesh.positions[i0 * 3]!, ay = mesh.positions[i0 * 3 + 1]!, az = mesh.positions[i0 * 3 + 2]!;
    const bx = mesh.positions[i1 * 3]!, by = mesh.positions[i1 * 3 + 1]!, bz = mesh.positions[i1 * 3 + 2]!;
    const cx = mesh.positions[i2 * 3]!, cy = mesh.positions[i2 * 3 + 1]!, cz = mesh.positions[i2 * 3 + 2]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const vi of [i0, i1, i2]) {
      acc[vi * 3]! += nx;
      acc[vi * 3 + 1]! += ny;
      acc[vi * 3 + 2]! += nz;
    }
  }
  for (let i = 0; i < count; i += 1) {
    const k = `${Math.round(mesh.positions[i * 3]! * quant)}_${Math.round(mesh.positions[i * 3 + 1]! * quant)}_${Math.round(mesh.positions[i * 3 + 2]! * quant)}`;
    keys[i] = k;
    const sum = buckets.get(k);
    if (sum) {
      sum[0] += acc[i * 3]!;
      sum[1] += acc[i * 3 + 1]!;
      sum[2] += acc[i * 3 + 2]!;
    } else {
      buckets.set(k, [acc[i * 3]!, acc[i * 3 + 1]!, acc[i * 3 + 2]!]);
    }
  }
  const normals = new Array<number>(mesh.positions.length);
  for (let i = 0; i < count; i += 1) {
    const s = buckets.get(keys[i]!)!;
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    normals[i * 3] = s[0] / len;
    normals[i * 3 + 1] = s[1] / len;
    normals[i * 3 + 2] = s[2] / len;
  }
  return {
    positions: [...mesh.positions],
    normals,
    uvs: [...mesh.uvs],
    indices: [...mesh.indices],
    ...(mesh.colors ? { colors: [...mesh.colors] } : {})
  };
}

function extrudeStarPolygonMesh(points: number, rOuter: number, rInner: number, depth: number, bevel = 0.02): RawMesh {
  const poly: V2[] = [];
  const total = Math.max(3, points) * 2;
  for (let i = 0; i < total; i += 1) {
    const a = (i / total) * Math.PI * 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    poly.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return extrudePolygonMesh(poly, depth, bevel, true);
}

function mergeRawList(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of parts) {
    const vOff = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
  }
  return { positions, normals, uvs, indices };
}

/** Upturned East Asian curved pagoda / kasagi roof tier (`loftSectionsMesh`) with flared corner eaves. */
function upturnedPagodaRoofMesh(halfW: number, halfD: number, height: number, flare = 0.28): RawMesh {
  const mkRing = (sx: number, sz: number, y: number, tipLift: number): V3[] => [
    [-sx, y + tipLift, -sz], [0, y, -sz * 0.92], [sx, y + tipLift, -sz], [sx * 0.94, y, 0],
    [sx, y + tipLift, sz], [0, y, sz * 0.92], [-sx, y + tipLift, sz], [-sx * 0.94, y, 0]
  ];
  return loftSectionsMesh([
    mkRing(halfW * (1 + flare), halfD * (1 + flare), 0, height * 0.34),
    mkRing(halfW * 0.78, halfD * 0.78, height * 0.42, height * 0.08),
    mkRing(halfW * 0.42, halfD * 0.42, height * 0.82, 0),
    mkRing(halfW * 0.14, halfD * 0.16, height, 0)
  ], true, false);
}

/** Curved Japanese Myōjin torii `kasagi` / `shimagi` lintel (`extrudePolygonMesh`) with upturned `sori` wingtips. */
function curvedKasagiBeamMesh(
  halfSpan: number,
  wingLift: number,
  thickness: number,
  depth: number,
  endCant = 0.42,
  bevel = 0.045
): RawMesh {
  const steps = 12;
  const poly: V2[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = -1 + (2 * i) / steps;
    const sori = wingLift * Math.pow(Math.abs(t), 2.25);
    poly.push([t * halfSpan, sori]);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const t = -1 + (2 * i) / steps;
    const sori = wingLift * Math.pow(Math.abs(t), 2.25) * 1.18;
    poly.push([t * (halfSpan + endCant), thickness + sori]);
  }
  return extrudePolygonMesh(poly, depth, bevel, false);
}

/** Pleated ovoid Japanese `chochin` hanging paper lantern (`latheMesh` with warm bamboo-rib silhouette). */
function pleatedChochinMesh(radius: number, halfH: number, ribs = 7): RawMesh {
  const steps = 18;
  const profile: V2[] = [[0, -halfH]];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const y = -halfH + u * halfH * 2;
    const arch = Math.sin(u * Math.PI);
    const pleat = 1 + 0.045 * Math.sin(u * Math.PI * ribs * 2);
    profile.push([Math.max(0.04 * radius, radius * Math.pow(arch, 0.72) * pleat), y]);
  }
  profile.push([0, halfH]);
  return smoothWeldedNormals(latheMesh(profile, 16));
}

/** Smooth multi-lobe cumulus cloud cluster (`smoothWeldedNormals` over organic overlapping puffs). */
function smoothCumulusTuftMesh(radiusX: number, height: number, radiusZ: number, seed = 7): RawMesh {
  const lobes: readonly [number, number, number, number, number][] = [
    [0, height * 0.28, 0, 0.58, 0.72], [-0.46, height * 0.05, 0.18, 0.46, 0.62],
    [0.48, height * 0.08, -0.14, 0.48, 0.64], [-0.22, height * 0.12, -0.38, 0.42, 0.58],
    [0.24, height * 0.14, 0.38, 0.44, 0.6], [0, -height * 0.12, 0, 0.64, 0.46]
  ];
  const parts = lobes.map(([ox, oy, oz, rScale, yScale], idx) =>
    transformMesh(smoothWeldedNormals(icosphereFacetMesh(1, 2, 0.08, seed + idx * 13)), {
      pos: [ox * radiusX, oy, oz * radiusZ],
      scale: [radiusX * rScale, height * yScale, radiusZ * rScale]
    })
  );
  return smoothWeldedNormals(mergeRawList(parts), 500);
}

/** Curved swept dorsal dragon-spine fin (`y = 0..height`, sweeping back toward `+Z` or `-Z`). */
function curvedDragonFinMesh(width: number, height: number, length: number, sweepBack = 1): RawMesh {
  const ring = (hw: number, y: number, z0: number, z1: number): V3[] => [
    [0, y, z0], [hw, y, (z0 + z1) * 0.42], [0, y, z1], [-hw, y, (z0 + z1) * 0.42]
  ];
  return smoothWeldedNormals(loftSectionsMesh([
    ring(width * 0.55, 0, -length * 0.48, length * 0.48),
    ring(width * 0.42, height * 0.38, -length * 0.34 + sweepBack * length * 0.14, length * 0.44 + sweepBack * length * 0.16),
    ring(width * 0.22, height * 0.76, -length * 0.1 + sweepBack * length * 0.34, length * 0.3 + sweepBack * length * 0.38),
    ring(width * 0.04, height, sweepBack * length * 0.52, length * 0.12 + sweepBack * length * 0.56)
  ], true, false));
}

/* ------------------------------------------------------------------ 1. Colossal Celestial Serpent Head */

function dragonRing(cx: number, cy: number, cz: number, rx: number, ry: number, keel = 0.18): V3[] {
  const segs = 14;
  const pts: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const crown = sa > 0 ? 1 + keel * Math.pow(sa, 3) : 1 - 0.12 * Math.pow(-sa, 2);
    pts.push([cx + ca * rx * (1 + 0.08 * sa), cy + sa * ry * crown, cz]);
  }
  return pts;
}

/** Sculpted overlapping teardrop dragon-scale armor plate (`subdivideSmoothMesh`). */
function dragonScalePlateMesh(width: number, length: number, thickness: number): RawMesh {
  const poly: V2[] = [
    [0, length * 0.56],
    [width * 0.44, length * 0.24],
    [width * 0.5, -length * 0.16],
    [width * 0.28, -length * 0.48],
    [-width * 0.28, -length * 0.48],
    [-width * 0.5, -length * 0.16],
    [-width * 0.44, length * 0.24]
  ];
  return subdivideSmoothMesh(extrudePolygonMesh(poly, thickness, thickness * 0.34, true), 1, 0.5);
}

/**
 * Colossal 130 m carved jade-and-gold eastern dragon head (`serpent-head`) rising from the cloud sea:
 * `subdivideSmoothMesh` S-curved neck, overlapping chevron dragon scales, sculpted brow ridges & flared nostrils,
 * multi-branched imperial stag horns, flowing snout & chin whiskers (`tubeSweepMesh`), ivory fangs, blazing amber eyes,
 * and levitating spirit pearl.
 */
export function buildColossalSerpentHeadNode(id = "serpent-head", name = "serpent-head"): AuraNodeBuilder<AuraGroupNode> {
  const mats: AuraMaterialSpec[] = [
    MAT_EMERALD_SCALE, MAT_CELADON_JADE, MAT_PEARL_IVORY,
    MAT_IMPERIAL_GOLD, MAT_VERMILION_LACQUER, MAT_DRAGON_EYE, MAT_AMBER_FLAME
  ];
  const slots = memoizeGeometry("ssr-colossal-dragon-head-slots", (): MultiMatSlot[] => {
    const out: MultiMatSlot[] = [];

    // Sinuous S-curve neck rising from y = -32 to y = +58, smoothed via subdivideSmoothMesh
    const neckWaypoints: readonly [number, number, number, number, number][] = [
      [0, -32, -26, 15.5, 14.5], [0, -16, -21, 14.2, 13.4], [0, 0, -14, 12.8, 12.2],
      [0, 18, -7, 11.6, 11.2], [0, 35, -3, 10.8, 10.4], [0, 50, -6, 10.2, 9.8], [0, 58, 0, 11.4, 10.2]
    ];
    out.push({
      mesh: smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh(neckWaypoints.map(([x, y, z, rx, ry]) => dragonRing(x, y, z, rx, ry, 0.24)), true, false),
          1,
          0.52
        )
      ),
      materialIndex: 0
    });

    // Reusable sculpted dragon scale plate for chevron flank armor rows
    const flankScaleBase = dragonScalePlateMesh(5.4, 6.8, 1.35);

    // Pearl-jade ventral scutes, overlapping chevron flank dragon scales & dorsal golden spine fins along the neck
    for (let i = 0; i < neckWaypoints.length - 1; i += 1) {
      const [, y, z, rx, ry] = neckWaypoints[i]!;
      out.push({
        mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(rx * 1.18, 5.2, 3.4, 0.9), 1, 0.52), {
          pos: [0, y + 2, z + ry * 0.78], rot: [0.16, 0, 0]
        }),
        materialIndex: 1
      });
      out.push({
        mesh: transformMesh(curvedDragonFinMesh(2.8, 12.2 - i * 0.65, 8.0, -0.82), {
          pos: [0, y + 4, z - ry * 0.88], rot: [-0.32, 0, 0]
        }),
        materialIndex: 3
      });
      // Staggered overlapping emerald & celadon flank dragon scales on left and right neck sides
      for (const side of [-1, 1] as const) {
        for (let row = 0; row < 2; row += 1) {
          const yaw = side * (1.18 - row * 0.36);
          const sx = Math.sin(yaw) * (rx * 0.94);
          const sz = z + Math.cos(yaw) * (ry * 0.52) - row * 2.6;
          out.push({
            mesh: transformMesh(flankScaleBase, {
              pos: [sx, y + 1.5 + row * 4.2, sz],
              rot: [-0.22, yaw, side * -0.18],
              scale: 1 - i * 0.045
            }),
            materialIndex: (i + row) % 2 === 0 ? 1 : 0
          });
        }
      }
    }

    // Sculpted upper cranium, arched nasal bridge & flared eastern dragon snout (+Z forward)
    const snoutRings: V3[][] = [
      dragonRing(0, 61, -5, 12.8, 9.8, 0.26),
      dragonRing(0, 64.5, 8, 13.6, 9.1, 0.3),
      dragonRing(0, 63.2, 21, 10.6, 7.0, 0.22),
      dragonRing(0, 61.6, 34, 8.8, 5.6, 0.26),
      dragonRing(0, 63.0, 43.5, 9.6, 6.2, 0.34),
      dragonRing(0, 61.4, 48, 5.1, 3.4, 0.18)
    ];
    out.push({
      mesh: smoothWeldedNormals(subdivideSmoothMesh(loftSectionsMesh(snoutRings, true, false), 1, 0.52)),
      materialIndex: 1
    });

    // Dorsal golden nasal ridge crest along the snout bridge
    for (let k = 0; k < 4; k += 1) {
      out.push({
        mesh: transformMesh(curvedDragonFinMesh(1.35, 3.8 - k * 0.45, 4.4, -0.55), {
          pos: [0, 68.2 - k * 1.15, 8 + k * 8.6], rot: [0.08, 0, 0]
        }),
        materialIndex: 3
      });
    }

    // Hinged roaring lower jaw & curled vermilion dragon tongue beneath the levitating spirit pearl
    const jawRings: V3[][] = [
      dragonRing(0, 52, -1, 10.4, 5.8, 0.12),
      dragonRing(0, 49.4, 12, 9.4, 4.8, 0.1),
      dragonRing(0, 46.2, 26, 7.4, 3.8, 0.1),
      dragonRing(0, 44.8, 38, 5.6, 3.0, 0.14),
      dragonRing(0, 45.8, 43, 3.1, 2.0, 0.12)
    ];
    out.push({
      mesh: smoothWeldedNormals(subdivideSmoothMesh(loftSectionsMesh(jawRings, true, false), 1, 0.52)),
      materialIndex: 0
    });
    out.push({
      mesh: smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            dragonRing(0, 54.5, 6, 7.8, 2.4, 0.05),
            dragonRing(0, 51.4, 21, 6.1, 2.1, 0.06),
            dragonRing(0, 48.6, 33, 4.2, 1.5, 0.08),
            dragonRing(0, 49.8, 39, 2.2, 0.9, 0.12)
          ], true, false),
          1,
          0.54
        )
      ),
      materialIndex: 4
    });

    // Flared cheek frills, supraorbital brow ridges, nostril scrolls, blazing eyes, multi-tined stag horns, whiskers, mane & fangs
    const frillPoly: V2[] = [[0, -5.5], [9.5, -7.5], [16, -2.2], [13.5, 5.2], [17, 11.8], [7.5, 9.6], [0, 5.4]];
    const cheekScale = dragonScalePlateMesh(4.2, 5.0, 1.0);
    for (const side of [-1, 1] as const) {
      out.push({
        mesh: transformMesh(subdivideSmoothMesh(extrudePolygonMesh(frillPoly, 1.9, 0.38, true), 1, 0.45), {
          pos: [side * 10.6, 60, 4], rot: [0, side * -0.58, side * 0.14], scale: [side, 1, 1]
        }),
        materialIndex: 1
      });
      // Cheek jowl scales
      for (let c = 0; c < 3; c += 1) {
        out.push({
          mesh: transformMesh(cheekScale, {
            pos: [side * (11.6 - c * 1.1), 57.5 + c * 1.8, 8 + c * 5.8],
            rot: [0.1, side * 1.35, side * -0.2]
          }),
          materialIndex: c % 2 === 0 ? 0 : 1
        });
      }
      // Heavy sculpted supraorbital brow ridge & flared upturned snout nostril scroll
      const browPts = catmullRomSpline3([
        [side * 5.4, 68.2, 20.5], [side * 9.8, 68.8, 15.2], [side * 12.2, 66.8, 9.2], [side * 11.4, 64.2, 4.5]
      ], 5).map((p, k, a): V4 => [p[0], p[1], p[2], 1.75 * (1 - Math.abs(k / (a.length - 1) - 0.45) * 0.55)]);
      out.push({ mesh: smoothWeldedNormals(subdivideSmoothMesh(tubeSweepMesh(browPts, 10, true), 1, 0.48)), materialIndex: 3 });

      const nostrilPts = catmullRomSpline3([
        [side * 3.2, 63.8, 45.2], [side * 6.4, 65.8, 43.8], [side * 6.8, 63.2, 40.6]
      ], 4).map((p, k, a): V4 => [p[0], p[1], p[2], 1.35 * (1 - (k / a.length) * 0.45)]);
      out.push({ mesh: smoothWeldedNormals(subdivideSmoothMesh(tubeSweepMesh(nostrilPts, 10, true), 1, 0.5)), materialIndex: 1 });

      // Blazing amber dragon eye
      out.push({
        mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(2.7, 2, 0, 5)), {
          pos: [side * 9.5, 65.2, 14.8], scale: [0.86, 0.96, 1.38]
        }),
        materialIndex: 5
      });

      // Multi-branched imperial gold eastern dragon stag-antlers (main beam + brow tine + crown tine)
      const hornPts = catmullRomSpline3([
        [side * 6.8, 69, 6], [side * 11.8, 79.5, -4], [side * 16.2, 90, -15.5], [side * 13.2, 100, -27]
      ], 8).map((p, k, a): V4 => [p[0], p[1], p[2], 2.75 * (1 - (k / a.length) * 0.82)]);
      const tineA = catmullRomSpline3([
        [side * 10.6, 76.5, -1.5], [side * 16.8, 82.5, 4.5], [side * 20.4, 89.5, 2.0]
      ], 5).map((p, k, a): V4 => [p[0], p[1], p[2], 1.55 * (1 - (k / a.length) * 0.8)]);
      const tineB = catmullRomSpline3([
        [side * 14.8, 87.5, -12.5], [side * 19.6, 94.5, -10.5], [side * 21.8, 101.5, -14.5]
      ], 5).map((p, k, a): V4 => [p[0], p[1], p[2], 1.25 * (1 - (k / a.length) * 0.82)]);
      out.push({ mesh: smoothWeldedNormals(tubeSweepMesh(hornPts, 12, true)), materialIndex: 3 });
      out.push({ mesh: smoothWeldedNormals(tubeSweepMesh(tineA, 10, true)), materialIndex: 3 });
      out.push({ mesh: smoothWeldedNormals(tubeSweepMesh(tineB, 10, true)), materialIndex: 3 });

      // Swept celestial mane tendrils streaming behind the dragon cranium
      for (let m = 0; m < 2; m += 1) {
        const manePts = catmullRomSpline3([
          [side * (7.5 + m * 3.2), 65 - m * 4.5, -2],
          [side * (12.5 + m * 3.8), 67 - m * 3.5, -14],
          [side * (10.2 + m * 3.4), 63 - m * 4.0, -27]
        ], 6).map((p, k, a): V4 => [p[0], p[1], p[2], 1.65 * (1 - (k / a.length) * 0.84)]);
        out.push({ mesh: smoothWeldedNormals(tubeSweepMesh(manePts, 10, true)), materialIndex: m === 0 ? 1 : 3 });
      }

      // Long sinuous S-curve upper snout whisker + lower jaw chin beard whisker
      const whiskerPts = catmullRomSpline3([
        [side * 6.6, 61.8, 40], [side * 16.5, 60.2, 46], [side * 25.5, 53.5, 35], [side * 31, 46.5, 19], [side * 27.5, 41.5, 3]
      ], 8).map((p, k, a): V4 => [p[0], p[1], p[2], 1.05 * (1 - (k / a.length) * 0.84)]);
      const chinWhiskerPts = catmullRomSpline3([
        [side * 3.8, 44.8, 39], [side * 9.5, 40.5, 36], [side * 13.5, 35.5, 25], [side * 11.5, 31.5, 14]
      ], 6).map((p, k, a): V4 => [p[0], p[1], p[2], 0.78 * (1 - (k / a.length) * 0.84)]);
      out.push({ mesh: smoothWeldedNormals(tubeSweepMesh(whiskerPts, 10, true)), materialIndex: 3 });
      out.push({ mesh: smoothWeldedNormals(tubeSweepMesh(chinWhiskerPts, 8, true)), materialIndex: 3 });

      // Upper & lower curved pearl-ivory fangs + long front dragon canines
      for (let f = 0; f < 5; f += 1) {
        const zf = 16 + f * 6.2;
        const fangLen = f === 4 ? 6.8 : f === 3 ? 4.8 : 3.4;
        const fangMesh = smoothWeldedNormals(latheMesh([[0, 0], [1.02, 0.22], [0.76, fangLen * 0.55], [0.06, fangLen]], 12));
        out.push({ mesh: transformMesh(fangMesh, { pos: [side * (8.0 - f * 0.68), 58.4, zf], rot: [Math.PI + 0.08, 0, side * 0.1] }), materialIndex: 2 });
        if (f < 4) {
          out.push({ mesh: transformMesh(fangMesh, { pos: [side * (6.2 - f * 0.55), 48.0, zf - 1.2], rot: [-0.08, 0, -side * 0.08], scale: 0.84 }), materialIndex: 2 });
        }
      }
    }

    // Levitating spirit pearl core between jaws
    out.push({
      mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(3.6, 2, 0, 9)), { pos: [0, 53.8, 35.5] }),
      materialIndex: 6
    });
    return out;
  });

  const solidNode = assembleMultiMaterialNode(`${name}-body`, slots, mats, {
    castShadow: false, receiveShadow: false
  });
  const pearlShellSpec = memoizeGeometry("ssr-colossal-dragon-pearl-shell", () =>
    mergeRawMeshes([
      transformMesh(smoothWeldedNormals(icosphereFacetMesh(5.4, 2, 0, 12)), { pos: [0, 53.8, 35.5] })
    ])
  );
  const pearlShell = geometry.custom(pearlShellSpec, {
    name: `${name}-pearl-shell`, material: MAT_SPIRIT_GLASS, castShadow: false, receiveShadow: false
  });
  return group(name, [solidNode, pearlShell], { position: [0, -500, 0] }).runtime({ id });
}

/* ------------------------------------------------------------------ 2. Gatehouse, Coiled Tail & Dorsal Spines */

/** Colossal curved crimson palace gatehouse spanning the starting viaduct (`x = +-8.6 m`, clear sightline `y = 14.8 m`). */
export function buildSerpentGatehouseNode(id = "serpent-gatehouse", name = "serpent-gatehouse"): AuraNodeBuilder<AuraGroupNode> {
  const mats: AuraMaterialSpec[] = [
    MAT_TEMPLE_GRANITE, MAT_EBONY_LACQUER, MAT_VERMILION_LACQUER, MAT_INDIGO_LACQUER,
    MAT_IMPERIAL_GOLD, MAT_CELADON_JADE, MAT_PRAYER_SILK, MAT_CHOCHIN_PAPER
  ];
  const slots = memoizeGeometry("ssr-palace-gatehouse-slots", (): MultiMatSlot[] => {
    const out: MultiMatSlot[] = [];
    for (const side of [-1, 1] as const) {
      const px = side * 8.6;
      // Stepped carved granite pedestal + black nemaki lacquer column shoe + gold collar + tall crimson hashira column
      out.push({ mesh: transformMesh(bevelBoxMesh(3.6, 0.65, 4.0, 0.14), { pos: [px, 0.32, 0] }), materialIndex: 0 });
      out.push({ mesh: transformMesh(bevelBoxMesh(3.1, 0.95, 3.4, 0.14), { pos: [px, 1.05, 0] }), materialIndex: 0 });
      out.push({ mesh: transformMesh(latheMesh([[0, 0], [1.16, 0], [1.08, 1.72], [0.98, 1.9], [0, 1.9]], 18), { pos: [px, 1.45, 0] }), materialIndex: 1 });
      out.push({ mesh: transformMesh(latheMesh([[0, 0], [1.06, 0], [1.06, 0.24], [0, 0.24]], 18), { pos: [px, 3.28, 0] }), materialIndex: 4 });
      out.push({ mesh: transformMesh(latheMesh([[0, 0], [0.96, 0], [0.82, 12.6], [1.02, 13.3], [0, 13.3]], 18), { pos: [px, 3.4, 0] }), materialIndex: 2 });

      // Outer crimson palace wing column + carved balustrade rail connecting main & wing pedestals
      out.push({ mesh: transformMesh(bevelBoxMesh(2.6, 1.35, 3.0, 0.14), { pos: [side * 11.8, 0.68, 0] }), materialIndex: 0 });
      out.push({ mesh: transformMesh(latheMesh([[0, 0], [0.76, 0], [0.7, 1.35], [0, 1.35]], 14), { pos: [side * 11.8, 1.28, 0] }), materialIndex: 1 });
      out.push({ mesh: transformMesh(latheMesh([[0, 0], [0.64, 0], [0.56, 11.8], [0.68, 12.2], [0, 12.2]], 14), { pos: [side * 11.8, 2.55, 0] }), materialIndex: 2 });
      out.push({ mesh: transformMesh(bevelBoxMesh(3.2, 0.22, 0.26, 0.04), { pos: [side * 10.2, 2.25, 1.05] }), materialIndex: 2 });
      out.push({ mesh: transformMesh(bevelBoxMesh(3.2, 0.22, 0.26, 0.04), { pos: [side * 10.2, 2.25, -1.05] }), materialIndex: 2 });
      out.push({ mesh: transformMesh(bevelBoxMesh(3.1, 0.56, 0.12, 0.03), { pos: [side * 10.2, 1.78, 1.05] }), materialIndex: 4 });
      out.push({ mesh: transformMesh(bevelBoxMesh(3.1, 0.56, 0.12, 0.03), { pos: [side * 10.2, 1.78, -1.05] }), materialIndex: 4 });

      // Coiled celadon-jade guardian dragon spiraling up each main crimson column + sculpted dragon head crest
      const coilPts: V4[] = [];
      for (let k = 0; k <= 26; k += 1) {
        const t = k / 26, ang = t * Math.PI * 5.2 * side;
        coilPts.push([px + Math.cos(ang) * 1.2, 3.5 + t * 11.0, Math.sin(ang) * 1.2, 0.44 * (1 - t * 0.32)]);
      }
      out.push({ mesh: smoothWeldedNormals(subdivideSmoothMesh(tubeSweepMesh(coilPts, 10, true), 1, 0.48)), materialIndex: 5 });
      out.push({
        mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.92, 0.78, 1.42, 0.24), 1, 0.52), {
          pos: [px - side * 0.45, 14.55, 1.28], rot: [0.18, -side * 0.32, 0]
        }),
        materialIndex: 5
      });
      out.push({
        mesh: transformMesh(curvedDragonFinMesh(0.24, 1.05, 0.85, -0.7), {
          pos: [px - side * 0.45, 15.05, 1.05], rot: [-0.25, -side * 0.32, 0]
        }),
        materialIndex: 4
      });

      // Flanking silk prayer banner + glowing pleated chochin lanterns on column & lower flared roof eave
      out.push({ mesh: transformMesh(bevelBoxMesh(1.12, 4.6, 0.09, 0.03), { pos: [side * 10.2, 9.0, 0.38] }), materialIndex: 6 });
      out.push({ mesh: transformMesh(bevelBoxMesh(1.24, 0.2, 0.16, 0.03), { pos: [side * 10.2, 11.35, 0.38] }), materialIndex: 4 });
      out.push({ mesh: transformMesh(pleatedChochinMesh(0.7, 0.98), { pos: [side * 10.2, 12.75, 1.15] }), materialIndex: 7 });
      out.push({ mesh: transformMesh(latheMesh([[0, 0], [0.48, 0], [0.48, 0.18], [0, 0.18]], 14), { pos: [side * 10.2, 13.68, 1.15] }), materialIndex: 1 });
      out.push({ mesh: transformMesh(latheMesh([[0, 0], [0.46, 0], [0.46, 0.18], [0, 0.18]], 14), { pos: [side * 10.2, 11.72, 1.15] }), materialIndex: 1 });
      // Corner eave chochin lanterns suspended under the flared crimson lower palace roof tips
      for (const zs of [-1, 1] as const) {
        out.push({ mesh: transformMesh(pleatedChochinMesh(0.48, 0.68), { pos: [side * 16.2, 17.65, zs * 4.1] }), materialIndex: 7 });
      }
    }

    // Elevated nuki tie-beam, masonry arch, stepped crimson-and-gold dougong bracket clusters & 2-tier curved crimson palace roofs (all >= 14.8 m!)
    for (const s of archwayVoussoirSlots({ radius: 7.2, thickness: 0.95, depth: 1.65, voussoirs: 11, stoneMatA: 0, stoneMatB: 1, keystoneMat: 4 })) {
      out.push({ mesh: transformMesh(s.mesh, { pos: [0, 14.8, 0], scale: [1.14, 0.38, 1] }), materialIndex: s.materialIndex });
    }
    out.push({ mesh: transformMesh(bevelBoxMesh(26.8, 0.76, 1.45, 0.1), { pos: [0, 15.12, 0] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(bevelBoxMesh(27.6, 0.36, 1.62, 0.06), { pos: [0, 15.62, 0] }), materialIndex: 4 });

    // Stepped crimson-and-gold tokigumi (dougong) palace bracket sets supporting the lower curved roof
    for (const bx of [-11.8, -8.6, -4.4, 0, 4.4, 8.6, 11.8] as const) {
      out.push({ mesh: transformMesh(bevelBoxMesh(1.18, 0.44, 1.95, 0.06), { pos: [bx, 16.02, 0] }), materialIndex: 2 });
      out.push({ mesh: transformMesh(bevelBoxMesh(1.62, 0.42, 2.45, 0.06), { pos: [bx, 16.44, 0] }), materialIndex: 4 });
    }
    out.push({ mesh: transformMesh(curvedKasagiBeamMesh(14.6, 1.25, 0.76, 2.15, 0.62, 0.06), { pos: [0, 16.7, 0] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(curvedKasagiBeamMesh(15.1, 1.38, 0.38, 2.35, 0.72, 0.05), { pos: [0, 17.42, 0] }), materialIndex: 4 });

    // Lower Tier: Swept Crimson-and-Indigo Palace Roof with flared corner eaves & gold ridge crest
    out.push({ mesh: transformMesh(upturnedPagodaRoofMesh(14.2, 3.85, 2.95, 0.3), { pos: [0, 18.0, 0] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(upturnedPagodaRoofMesh(13.5, 3.55, 2.65, 0.28), { pos: [0, 18.32, 0] }), materialIndex: 3 });

    // Upper Palace Pavilion Story: Crimson lacquered hall, glowing shoji windows, golden imperial tablet & upper dougong brackets
    out.push({ mesh: transformMesh(bevelBoxMesh(12.2, 2.55, 3.35, 0.14), { pos: [0, 21.35, 0] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(bevelBoxMesh(12.8, 0.32, 3.85, 0.06), { pos: [0, 20.15, 0] }), materialIndex: 4 });
    for (const wx of [-3.9, 3.9] as const) {
      out.push({ mesh: transformMesh(bevelBoxMesh(2.05, 1.35, 3.52, 0.05), { pos: [wx, 21.38, 0] }), materialIndex: 7 });
      out.push({ mesh: transformMesh(bevelBoxMesh(2.25, 1.55, 3.44, 0.05), { pos: [wx, 21.38, 0] }), materialIndex: 1 });
    }
    // Framed imperial plaque on front and back of the palace gatehouse
    for (const zs of [-1, 1] as const) {
      out.push({ mesh: transformMesh(bevelBoxMesh(3.8, 2.15, 0.28, 0.07), { pos: [0, 19.35, zs * 1.88] }), materialIndex: 1 });
      out.push({ mesh: transformMesh(bevelBoxMesh(3.3, 1.72, 0.34, 0.06), { pos: [0, 19.35, zs * 1.92] }), materialIndex: 4 });
    }
    for (const bx of [-4.8, -1.6, 1.6, 4.8] as const) {
      out.push({ mesh: transformMesh(bevelBoxMesh(0.96, 0.42, 3.85, 0.05), { pos: [bx, 22.72, 0] }), materialIndex: 4 });
    }

    // Upper Tier: Grand Curved Crimson Palace Roof + golden ridge beam + twin gilded shachihoko finials + central spire
    out.push({ mesh: transformMesh(upturnedPagodaRoofMesh(9.8, 3.5, 3.25, 0.34), { pos: [0, 22.85, 0] }), materialIndex: 2 });
    out.push({ mesh: transformMesh(curvedKasagiBeamMesh(5.6, 0.55, 0.42, 0.72, 0.35, 0.05), { pos: [0, 25.85, 0] }), materialIndex: 4 });
    for (const side of [-1, 1] as const) {
      out.push({
        mesh: transformMesh(curvedDragonFinMesh(0.78, 2.65, 2.05, side * 0.74), {
          pos: [side * 5.6, 26.05, 0], rot: [0, Math.PI * 0.5, 0]
        }),
        materialIndex: 4
      });
    }
    out.push({
      mesh: transformMesh(latheMesh([[0, 0], [0.52, 0], [0.32, 1.25], [0.54, 1.55], [0.1, 3.1], [0, 3.25]], 14), { pos: [0, 26.15, 0] }),
      materialIndex: 4
    });
    return out;
  });
  return assembleMultiMaterialNode(name, slots, mats, { id, position: [0, -500, 0], castShadow: false, receiveShadow: true });
}

function mountMemoPooledMultiMat(
  cacheKey: string,
  name: string,
  build: () => { readonly slots: readonly MultiMatSlot[]; readonly mats: readonly AuraMaterialSpec[] },
  opts: { readonly id: string; readonly castShadow: boolean; readonly receiveShadow: boolean }
): AuraNodeBuilder<AuraGroupNode> {
  const cached = memoizeGeometry(`ssr-pooled-mm-${cacheKey}`, () => {
    const { slots, mats } = build();
    return { spec: buildGroupedGeometrySpec(slots), mats };
  });
  return geometry
    .multiMaterial(cached.spec, cached.mats, {
      name,
      position: [0, -500, 0],
      castShadow: opts.castShadow,
      receiveShadow: opts.receiveShadow
    })
    .runtime({ id: opts.id });
}

/** Coiled jade-and-gold serpent tail monument (`serpent-tail-monument`) crowning the end of the viaduct. */
export function buildCoiledTailMonumentNode(id = "serpent-tail-monument", name = "serpent-tail-monument"): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("serpent-tail-monument", name, () => {
    const mats: AuraMaterialSpec[] = [MAT_TEMPLE_GRANITE, MAT_EMERALD_SCALE, MAT_CELADON_JADE, MAT_IMPERIAL_GOLD, MAT_AMBER_FLAME];
    const slots: MultiMatSlot[] = [
      { mesh: latheMesh([[0, 0], [6.4, 0], [5.8, 1.2], [4.6, 2.2], [4.9, 2.8], [0, 2.8]], 22), materialIndex: 0 }
    ];
    const tailPts: V4[] = [];
    for (let i = 0; i <= 36; i += 1) {
      const t = i / 36, ang = t * Math.PI * 5.5, rad = 4.2 * (1 - t * 0.84);
      tailPts.push([Math.cos(ang) * rad, 2.6 + t * 18.5, Math.sin(ang) * rad, 1.95 * (1 - t * 0.82)]);
    }
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(tailPts, 14, true)), materialIndex: 1 });
    for (let k = 0; k < 10; k += 1) {
      const t = k / 10, ang = t * Math.PI * 5.5, rad = 4.2 * (1 - t * 0.84);
      slots.push({
        mesh: transformMesh(curvedDragonFinMesh(0.45, 2.2 * (1 - t * 0.5), 1.6, -0.5), {
          pos: [Math.cos(ang) * (rad + 0.9), 3.2 + t * 17.5, Math.sin(ang) * (rad + 0.9)], rot: [0, -ang, 0]
        }),
        materialIndex: 3
      });
    }
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [1.6, 0.5], [1.1, 1.6], [0.2, 3.2], [0, 3.4]], 16), { pos: [0, 21.2, 0] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(1.35, 2, 0, 21)), { pos: [0, 25.4, 0] }), materialIndex: 4 });
    return { slots, mats };
  }, { id, castShadow: false, receiveShadow: false });
}

/** Smooth curved dorsal spine fin spec (`instances.custom` along both serpentine viaduct balustrades). */
export function dorsalSpineFinSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-dorsal-spine-fin", () => {
    const collar = bevelBoxMesh(0.68, 0.28, 1.65, 0.06);
    const fin = transformMesh(curvedDragonFinMesh(0.46, 1.72, 1.55, 0.82), { pos: [0, 0.18, 0] });
    return mergeRawMeshes([collar, fin]);
  });
}

/* ------------------------------------------------------------------ 3. Floating Sky Islands & Sanctuary Planetlet */

export type SkyIslandVariantKey = "island" | "spireA" | "spireB" | "spireC";

/**
 * Floating celestial shrine crag & cloud island (`island-0..5`), authored at exact `targetHeight` in metres
 * with stratified rock undercroft (`strataSkyCragMaterial`), smooth cumulus cloud wreath, vermilion shrine torii/pagodas,
 * and smooth `layeredCanopyMesh` bonsai & sakura trees (preserving upward-biased botanical normals without dark facets).
 */
export function buildSkyIslandVariantNode(
  variant: SkyIslandVariantKey,
  targetHeight: number,
  id: string,
  name = id,
  castShadow = false
): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat(`sky-island-${variant}-${targetHeight}`, name, () => {
    const s = targetHeight / (variant === "spireC" ? 22 : variant === "spireB" ? 15 : variant === "spireA" ? 14 : 15);
    const warmRock = variant === "spireB";
    const mats: AuraMaterialSpec[] = [
      strataSkyCragMaterial(warmRock), MAT_CUMULUS_TUFT, MAT_SANCTUARY_TURF, MAT_VERMILION_LACQUER,
      MAT_EBONY_LACQUER, MAT_IMPERIAL_GOLD, MAT_CEDAR_WOOD, MAT_CLOUD_FOLIAGE,
      MAT_GOLDEN_CANOPY, MAT_TEMPLE_GRANITE, MAT_CHOCHIN_PAPER, MAT_BLOSSOM_CANOPY
    ];
    const slots: MultiMatSlot[] = [];

    // Inverted stratified crag cone (-7.5*s .. 0.6*s) + turf crown + smooth cumulus cloud wreath
    slots.push({
      mesh: transformMesh(stratifiedCliffMesh({ radiusX: 6.4 * s, radiusZ: 6.0 * s, height: 8.2 * s, terraces: 5, seed: variant.charCodeAt(0) }), {
        pos: [0, 0.6 * s, 0], rot: [Math.PI, 0, 0]
      }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(latheMesh([[0, -0.3 * s], [6.1 * s, -0.2 * s], [6.4 * s, 0.35 * s], [5.4 * s, 0.75 * s], [0, 0.85 * s]], 18), { pos: [0, 0.2 * s, 0] }),
      materialIndex: 2
    });
    for (let c = 0; c < 4; c += 1) {
      const ang = (c / 4) * Math.PI * 2 + 0.4;
      slots.push({
        mesh: transformMesh(smoothCumulusTuftMesh(4.2 * s, 2.3 * s, 3.6 * s, 17 + c * 9), {
          pos: [Math.cos(ang) * 5.2 * s, -1.2 * s - (c % 2) * 0.9 * s, Math.sin(ang) * 5.2 * s], rot: [0, ang, 0]
        }),
        materialIndex: 1
      });
    }

    // Helper: miniature vermilion shrine torii gate on island terrace
    const pushIslandTorii = (ox: number, oy: number, oz: number, k: number, yaw = 0): void => {
      const rot: V3 = [0, yaw, 0];
      for (const side of [-1, 1] as const) {
        slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.22 * k, 0], [0.2 * k, 0.45 * k], [0, 0.45 * k]], 10), { pos: [ox + Math.cos(yaw) * side * 1.15 * k, oy, oz - Math.sin(yaw) * side * 1.15 * k] }), materialIndex: 4 });
        slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.17 * k, 0], [0.15 * k, 2.55 * k], [0, 2.55 * k]], 10), { pos: [ox + Math.cos(yaw) * side * 1.15 * k, oy + 0.4 * k, oz - Math.sin(yaw) * side * 1.15 * k] }), materialIndex: 3 });
      }
      slots.push({ mesh: transformMesh(bevelBoxMesh(2.9 * k, 0.18 * k, 0.22 * k, 0.03 * k), { pos: [ox, oy + 2.35 * k, oz], rot }), materialIndex: 4 });
      slots.push({ mesh: transformMesh(curvedKasagiBeamMesh(1.68 * k, 0.28 * k, 0.22 * k, 0.34 * k, 0.12 * k, 0.03 * k), { pos: [ox, oy + 2.78 * k, oz], rot }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(curvedKasagiBeamMesh(1.74 * k, 0.32 * k, 0.12 * k, 0.38 * k, 0.14 * k, 0.02 * k), { pos: [ox, oy + 2.98 * k, oz], rot }), materialIndex: 4 });
    };

    if (variant === "spireC") {
      // Tall 3-tier vermilion-and-ebony sky pagoda + flanking sakura & bonsai trees + approach torii
      slots.push({ mesh: transformMesh(bevelBoxMesh(5.6 * s, 1.1 * s, 5.6 * s, 0.12 * s), { pos: [0, 1.4 * s, 0] }), materialIndex: 9 });
      for (let tier = 0; tier < 3; tier += 1) {
        const w = (4.4 - tier * 0.85) * s;
        const y0 = (2.0 + tier * 3.8) * s;
        slots.push({ mesh: transformMesh(bevelBoxMesh(w, 2.5 * s, w, 0.1 * s), { pos: [0, y0 + 1.25 * s, 0] }), materialIndex: 3 });
        slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.52, 1.3 * s, w + 0.14 * s, 0.04 * s), { pos: [0, y0 + 1.25 * s, 0] }), materialIndex: 10 });
        slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(w * 0.82, w * 0.82, 1.85 * s, 0.3), { pos: [0, y0 + 2.4 * s, 0] }), materialIndex: 4 });
      }
      slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.42 * s, 0], [0.26 * s, 1.8 * s], [0.44 * s, 2.1 * s], [0.08 * s, 4.2 * s], [0, 4.4 * s]], 14), { pos: [0, 13.4 * s, 0] }), materialIndex: 5 });
      pushIslandTorii(0, 0.85 * s, 4.1 * s, 0.9 * s, 0);
      for (const side of [-1, 1] as const) {
        const trunk = catmullRomSpline3([[side * 3.9 * s, 0.8 * s, 1.8 * s], [side * 4.5 * s, 2.4 * s, 2.1 * s], [side * 4.1 * s, 3.8 * s, 1.6 * s]], 5)
          .map((p, k, a): V4 => [p[0], p[1], p[2], 0.36 * s * (1 - k / (a.length * 1.45))]);
        slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(trunk, 8, true)), materialIndex: 6 });
        slots.push({
          mesh: transformMesh(layeredCanopyMesh({ radius: 2.25 * s, height: 1.95 * s, puffs: 9, seed: 11 + side }), {
            pos: [side * 4.1 * s, 3.6 * s, 1.6 * s]
          }),
          materialIndex: side > 0 ? 11 : 7
        });
      }
    } else if (variant === "spireB") {
      // Twisted crimson crag + vermilion shrine torii + cedar arch bridge + sakura & emerald bonsai trees
      slots.push({
        mesh: stratifiedCliffMesh({ radiusX: 2.6 * s, radiusZ: 2.3 * s, height: 8.2 * s, terraces: 6, seed: 53 }),
        materialIndex: 0
      });
      slots.push({
        mesh: transformMesh(stratifiedCliffMesh({ radiusX: 1.7 * s, radiusZ: 1.6 * s, height: 5.4 * s, terraces: 4, seed: 71 }), { pos: [3.6 * s, 0.6 * s, 1.2 * s] }),
        materialIndex: 0
      });
      const bridgePts = catmullRomSpline3([[-0.6 * s, 4.2 * s, 0], [1.6 * s, 5.1 * s, 0.6 * s], [3.5 * s, 4.4 * s, 1.1 * s]], 6)
        .map((p): V4 => [p[0], p[1], p[2], 0.42 * s]);
      slots.push({ mesh: tubeSweepMesh(bridgePts, 8, true), materialIndex: 3 });
      for (const lx of [-1.8, 1.9, 3.6] as const) {
        slots.push({ mesh: transformMesh(pleatedChochinMesh(0.42 * s, 0.58 * s), { pos: [lx * s, 4.7 * s, 1.3 * s] }), materialIndex: 10 });
      }
      slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(1.9 * s, 1.9 * s, 1.5 * s, 0.28), { pos: [0, 8.4 * s, 0] }), materialIndex: 3 });
      pushIslandTorii(-3.2 * s, 0.85 * s, 1.6 * s, 0.85 * s, 0.35);
      const sakuraTrunk = catmullRomSpline3([[2.9 * s, 5.2 * s, 1.1 * s], [3.9 * s, 6.8 * s, 1.5 * s], [3.4 * s, 8.0 * s, 0.9 * s]], 5)
        .map((p, k, a): V4 => [p[0], p[1], p[2], 0.34 * s * (1 - k / (a.length * 1.5))]);
      slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(sakuraTrunk, 8, true)), materialIndex: 6 });
      slots.push({
        mesh: transformMesh(layeredCanopyMesh({ radius: 2.35 * s, height: 1.95 * s, puffs: 9, seed: 59 }), { pos: [3.4 * s, 7.8 * s, 0.9 * s] }),
        materialIndex: 11
      });
      slots.push({
        mesh: transformMesh(layeredCanopyMesh({ radius: 1.85 * s, height: 1.55 * s, puffs: 8, seed: 64 }), { pos: [-3.1 * s, 3.9 * s, -1.5 * s] }),
        materialIndex: 7
      });
    } else if (variant === "spireA") {
      // 4-tier imperial shrine pavilion flanked by sakura, golden & emerald layeredCanopyMesh bonsai trees
      for (let tier = 0; tier < 4; tier += 1) {
        const w = (3.6 - tier * 0.58) * s;
        const y0 = (1.0 + tier * 1.95) * s;
        slots.push({ mesh: transformMesh(bevelBoxMesh(w, 1.25 * s, w, 0.08 * s), { pos: [0, y0 + 0.62 * s, 0] }), materialIndex: 3 });
        slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(w * 0.78, w * 0.78, 1.05 * s, 0.26), { pos: [0, y0 + 1.2 * s, 0] }), materialIndex: 4 });
      }
      slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.28 * s, 0], [0.06 * s, 2.2 * s], [0, 2.3 * s]], 12), { pos: [0, 8.9 * s, 0] }), materialIndex: 5 });
      pushIslandTorii(0, 0.82 * s, 3.6 * s, 0.82 * s, 0);
      for (const side of [-1, 1] as const) {
        const trunk = catmullRomSpline3([[side * 3.4 * s, 0.8 * s, 1.4 * s], [side * 4.2 * s, 2.3 * s, 1.6 * s], [side * 3.8 * s, 3.6 * s, 1.2 * s]], 5)
          .map((p, k, a): V4 => [p[0], p[1], p[2], 0.36 * s * (1 - k / (a.length * 1.5))]);
        slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(trunk, 8, true)), materialIndex: 6 });
        slots.push({
          mesh: transformMesh(layeredCanopyMesh({ radius: 2.15 * s, height: 1.9 * s, puffs: 9, seed: 20 + side }), {
            pos: [side * 3.8 * s, 3.35 * s, 1.2 * s]
          }),
          materialIndex: side > 0 ? 11 : 8
        });
      }
      slots.push({
        mesh: transformMesh(coniferBoughTierMesh({ baseRadius: 1.5 * s, height: 3.6 * s, tiers: 5, seed: 33 }), { pos: [0, 0.9 * s, -3.5 * s] }),
        materialIndex: 7
      });
    } else {
      // Classic jade shrine island with vermilion torii, chochin lantern & twin bonsai + sakura layered canopies
      const trunkPts = catmullRomSpline3([[-0.8 * s, 0.8 * s, 0], [-2.2 * s, 2.8 * s, 0.5 * s], [-0.4 * s, 4.9 * s, -0.3 * s], [1.2 * s, 6.0 * s, 0.2 * s]], 6)
        .map((p, k, a): V4 => [p[0], p[1], p[2], 0.58 * s * (1 - (k / a.length) * 0.68)]);
      slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(trunkPts, 10, true)), materialIndex: 6 });
      slots.push({
        mesh: transformMesh(layeredCanopyMesh({ radius: 3.25 * s, height: 2.65 * s, puffs: 10, seed: 44 }), {
          pos: [0.9 * s, 5.6 * s, 0.2 * s]
        }),
        materialIndex: 7
      });
      slots.push({
        mesh: transformMesh(layeredCanopyMesh({ radius: 2.2 * s, height: 1.85 * s, puffs: 8, seed: 49 }), {
          pos: [-1.8 * s, 3.8 * s, 0.55 * s]
        }),
        materialIndex: 11
      });
      pushIslandTorii(2.6 * s, 0.85 * s, 1.9 * s, 0.92 * s, -0.4);
      slots.push({ mesh: transformMesh(pleatedChochinMesh(0.42 * s, 0.58 * s), { pos: [3.9 * s, 2.4 * s, 1.4 * s] }), materialIndex: 10 });
    }
    return { slots, mats };
  }, { id, castShadow, receiveShadow: !castShadow ? false : true });
}

/**
 * Distant floating sanctuary planetlet (`sanctuary-planetlet`) beyond the tail leap:
 * smooth spherical meadow world, curved-dome sanctuary cottage, smooth bonsai & sakura trees, and cumulus halo.
 */
export function buildSanctuaryPlanetletNode(id = "sanctuary-planetlet", name = "sanctuary-planetlet"): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("sanctuary-planetlet", name, () => {
    const mats: AuraMaterialSpec[] = [
      MAT_SANCTUARY_TURF, MAT_PEARL_IVORY, MAT_VERMILION_LACQUER, MAT_IMPERIAL_GOLD,
      MAT_CEDAR_WOOD, MAT_CLOUD_FOLIAGE, MAT_BLOSSOM_CANOPY, MAT_AMBER_FLAME, MAT_CUMULUS_TUFT, MAT_TEMPLE_GRANITE
    ];
    const R = 15.5;
    const slots: MultiMatSlot[] = [
      { mesh: smoothWeldedNormals(icosphereFacetMesh(R, 2, 0.015, 88), 500), materialIndex: 0 }
    ];
    // Equatorial cobbled path ribbon & stone stepping slabs
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(2.2, 0.35, 1.5, 0.08), {
          pos: [Math.sin(a) * (R * 0.42), Math.cos(0.42) * R, Math.cos(a) * (R * 0.42)], rot: [0, a, 0]
        }),
        materialIndex: 9
      });
    }
    // Curved-dome sanctuary cottage on the northern crown
    slots.push({
      mesh: transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [4.6, 0], [4.8, 1.8], [4.2, 3.8], [2.4, 5.2], [0, 5.6]], 20)), { pos: [-2.2, R - 0.6, -1.4] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(upturnedPagodaRoofMesh(5.4, 2.4, 1.4, 0.24), { pos: [-2.2, R + 2.2, 2.8] }),
      materialIndex: 2
    });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.45, 0], [0.12, 2.4], [0, 2.6]], 12), { pos: [-2.2, R + 5.0, -1.4] }), materialIndex: 3 });
    for (const wx of [-3.8, -0.6] as const) {
      slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.68, 1, 0, 5)), { pos: [wx, R + 1.5, 2.9] }), materialIndex: 7 });
    }
    // Gnarled sanctuary bonsai & sakura trees on the eastern crown (smooth botanical layeredCanopyMesh normals)
    const bonsaiTrunk = catmullRomSpline3([[3.8, R - 0.8, 0.6], [5.8, R + 2.8, 1.2], [4.4, R + 6.2, -0.4], [6.2, R + 8.4, 0.4]], 6)
      .map((p, k, a): V4 => [p[0], p[1], p[2], 0.95 * (1 - (k / a.length) * 0.65)]);
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(bonsaiTrunk, 10, true)), materialIndex: 4 });
    slots.push({
      mesh: transformMesh(layeredCanopyMesh({ radius: 4.5, height: 3.5, puffs: 10, seed: 61 }), { pos: [5.6, R + 7.8, 0.3] }),
      materialIndex: 5
    });
    slots.push({
      mesh: transformMesh(layeredCanopyMesh({ radius: 3.0, height: 2.3, puffs: 8, seed: 73 }), { pos: [3.2, R + 5.6, -1.1] }),
      materialIndex: 6
    });
    // Soft cumulus cloud collar beneath the southern hemisphere
    for (let c = 0; c < 5; c += 1) {
      const a = (c / 5) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(smoothCumulusTuftMesh(6.2, 3.0, 5.2, 90 + c * 7), {
          pos: [Math.cos(a) * 12.5, -R * 0.65, Math.sin(a) * 12.5], rot: [0, a, 0]
        }),
        materialIndex: 8
      });
    }
    return { slots, mats };
  }, { id, castShadow: false, receiveShadow: false });
}

/* ------------------------------------------------------------------ 4. Carved Stone & Lacquer Palace Lantern */

/** Carved 3.6 m tōrō stone & vermilion-lacquer roadside lantern (`lantern-0..9`) merged into a single multi-material node. */
export function buildPalaceLanternNode(id: string, name = id, castShadow = false): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("lantern", name, () => {
    const mats: AuraMaterialSpec[] = [MAT_TEMPLE_GRANITE, MAT_VERMILION_LACQUER, MAT_EBONY_LACQUER, MAT_IMPERIAL_GOLD, MAT_CHOCHIN_PAPER];
    const slots: MultiMatSlot[] = [
      { mesh: latheMesh([[0, 0], [0.68, 0], [0.62, 0.28], [0.44, 0.52], [0.52, 0.68], [0.3, 0.78], [0, 0.78]], 14), materialIndex: 0 },
      { mesh: transformMesh(latheMesh([[0, 0], [0.28, 0], [0.26, 0.28], [0, 0.28]], 12), { pos: [0, 0.76, 0] }), materialIndex: 2 },
      { mesh: transformMesh(latheMesh([[0, 0], [0.22, 0], [0.19, 0.96], [0.26, 1.08], [0, 1.08]], 12), { pos: [0, 1.0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(latheMesh([[0, 0], [0.54, 0.08], [0.6, 0.22], [0.46, 0.3], [0, 0.3]], 12), { pos: [0, 1.98, 0] }), materialIndex: 0 },
      { mesh: transformMesh(pleatedChochinMesh(0.32, 0.34), { pos: [0, 2.6, 0] }), materialIndex: 4 },
      { mesh: transformMesh(upturnedPagodaRoofMesh(0.76, 0.76, 0.48, 0.28), { pos: [0, 2.92, 0] }), materialIndex: 2 },
      { mesh: transformMesh(latheMesh([[0, 0], [0.16, 0.05], [0.1, 0.18], [0.02, 0.32], [0, 0.34]], 10), { pos: [0, 3.34, 0] }), materialIndex: 3 }
    ];
    for (let k = 0; k < 4; k += 1) {
      const a = (k / 4) * Math.PI * 2 + Math.PI * 0.25;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.08, 0.68, 0.08, 0.015), { pos: [Math.cos(a) * 0.38, 2.6, Math.sin(a) * 0.38] }),
        materialIndex: 3
      });
    }
    return { slots, mats };
  }, { id, castShadow, receiveShadow: castShadow });
}

/* ------------------------------------------------------------------ 5. Pooled Course Obstacles, Guardians & Feast */

export type PooledEntityModelType = "arch" | "barrier" | "oni" | "sweeper" | "feast";

/** Low slide-under / jump-over vermilion shrine rib-ward (`y = 1.62 m`) with zero overhead sightline obstruction. */
function buildSlideArchNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("arch", name, () => {
    const mats: AuraMaterialSpec[] = [
      MAT_EBONY_LACQUER, MAT_VERMILION_LACQUER, MAT_IMPERIAL_GOLD,
      MAT_FORGED_IRON, MAT_PRAYER_SILK, MAT_JADE_WARD_GLOW, MAT_CHOCHIN_PAPER
    ];
    const slots: MultiMatSlot[] = [];
    for (const side of [-1, 1] as const) {
      const px = side * 1.48;
      slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.36, 0], [0.32, 0.42], [0, 0.42]], 12), { pos: [px, 0, 0] }), materialIndex: 0 });
      slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.22, 0], [0.19, 1.58], [0.25, 1.72], [0, 1.74]], 12), { pos: [px, 0.4, 0] }), materialIndex: 1 });
      slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.27, 0], [0.12, 0.16], [0, 0.18]], 10), { pos: [px, 2.12, 0] }), materialIndex: 2 });
      slots.push({ mesh: transformMesh(pleatedChochinMesh(0.2, 0.28), { pos: [side * 1.82, 1.72, 0] }), materialIndex: 6 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(3.26, 0.24, 0.3, 0.045), { pos: [0, 1.64, 0] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(3.38, 0.1, 0.34, 0.025), { pos: [0, 1.8, 0] }), materialIndex: 0 });
    for (const sx of [-1.0, -0.5, 0.5, 1.0] as const) {
      slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.08, 0.2], [0, 0.22]], 8), { pos: [sx, 1.32, 0] }), materialIndex: 3 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.74, 0.36, 0.07, 0.02), { pos: [0, 1.4, 0] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.18, 1, 0, 3)), { pos: [0, 1.64, 0.18] }), materialIndex: 5 });
    return { slots, mats };
  }, { id, castShadow: false, receiveShadow: true });
}

function buildSpiritBarrierNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("barrier", name, () => {
    const mats: AuraMaterialSpec[] = [
      MAT_EBONY_LACQUER, MAT_VERMILION_LACQUER, MAT_BURNISHED_BRONZE,
      MAT_FORGED_IRON, MAT_IMPERIAL_GOLD, MAT_JADE_WARD_GLOW, MAT_PRAYER_SILK
    ];
    const slots: MultiMatSlot[] = [];
    for (const side of [-1, 1] as const) {
      const px = side * 1.16;
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.52, 0.42, 0.64, 0.06), { pos: [px, 0.21, 0] }), materialIndex: 0 });
      slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.2, 0], [0.17, 1.68], [0.24, 1.82], [0.08, 2.08], [0, 2.1]], 12), { pos: [px, 0.4, 0] }), materialIndex: 1 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.22, 0.62, 0.06, 0.02), { pos: [px * 1.12, 1.45, 0] }), materialIndex: 6 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.52, 0.22, 0.24, 0.04), { pos: [0, 0.88, 0] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.62, 0.26, 0.28, 0.05), { pos: [0, 1.88, 0] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.88, 0.56, 0.07, 0.02), { pos: [0, 1.38, 0] }), materialIndex: 5 });
    for (const sx of [-0.88, -0.44, 0, 0.44, 0.88] as const) {
      slots.push({
        mesh: transformMesh(extrudePolygonMesh([[-0.08, 0], [0.08, 0], [0.11, 0.26], [0, 0.56], [-0.11, 0.26]], 0.1, 0.02, true), { pos: [sx, 1.98, 0] }),
        materialIndex: sx === 0 ? 4 : 3
      });
    }
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.32, 0.06], [0.32, 0.14], [0, 0.2]], 12), { pos: [0, 1.38, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 4 });
    return { slots, mats };
  }, { id, castShadow: false, receiveShadow: true });
}

/** Applies cloth-fold / anatomical tonal gradient + 0.25 cavity ambient occlusion onto a sculpted `RawMesh`. */
function shadeSculptedMesh(
  mesh: RawMesh,
  aoStrength = 0.25,
  foldFreq = 6,
  foldAmp = 0.055
): RawMesh {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) {
    const y = mesh.positions[i]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(0.04, maxY - minY);
  const painted = paintMeshColors(
    mesh,
    ([x, y, z], [, ny]) => {
      const v = (y - minY) / spanY;
      const ang = Math.atan2(z, x);
      const fold = foldAmp * Math.cos(ang * foldFreq + y * 5.2);
      const topLift = 0.9 + 0.1 * v + 0.03 * Math.max(0, ny) + fold;
      const tone = Math.max(0.76, Math.min(1.04, topLift));
      return [tone, tone * 0.995, tone * 0.99, 1] as const;
    },
    false
  );
  return bakeMeshCavityAO(painted, aoStrength);
}

/** Crescent-ridged curved anime hair blade (`18` radial stations) tapering to a crisp sharp point (`tipScale = 0.012`). */
function sculptedHairBladeMesh(
  spinePoints: readonly V3[],
  baseRx: number,
  baseRz: number,
  ridgeAmp = 0.24,
  segsPerSpan = 5
): RawMesh {
  const spine = catmullRomSpline3(spinePoints, segsPerSpan, false);
  const ringPts = 18;
  const sections: V3[][] = spine.map((p, idx) => {
    const t = idx / Math.max(1, spine.length - 1);
    const prev = spine[Math.max(0, idx - 1)]!;
    const next = spine[Math.min(spine.length - 1, idx + 1)]!;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const tz = next[2] - prev[2];
    const tLen = Math.hypot(tx, ty, tz) || 1;
    const tang: V3 = [tx / tLen, ty / tLen, tz / tLen];
    const ref: V3 = Math.abs(tang[1]) > 0.92 ? [0, 0, 1] : [0, 1, 0];
    const sx0 = ref[1] * tang[2] - ref[2] * tang[1];
    const sy0 = ref[2] * tang[0] - ref[0] * tang[2];
    const sz0 = ref[0] * tang[1] - ref[1] * tang[0];
    const sLen = Math.hypot(sx0, sy0, sz0) || 1;
    const side: V3 = [sx0 / sLen, sy0 / sLen, sz0 / sLen];
    const binorm: V3 = [
      tang[1] * side[2] - tang[2] * side[1],
      tang[2] * side[0] - tang[0] * side[2],
      tang[0] * side[1] - tang[1] * side[0]
    ];
    const env = t < 0.14
      ? 0.58 + 0.42 * (t / 0.14)
      : Math.max(0.018, Math.pow(1 - (t - 0.14) / 0.86, 1.32));
    const rx = baseRx * env;
    const rz = baseRz * env;
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Crisp dorsal anime hair-lock keel + lateral edge blades (never a round sausage cylinder)
      const keel = 1 + ridgeAmp * Math.cos(a * 3) + 0.12 * Math.max(0, sa);
      const u = ca * rx * keel;
      const v = sa * rz * (sa < 0 ? 0.72 : 1.14);
      ring.push([
        p[0] + side[0] * u + binorm[0] * v,
        p[1] + side[1] * u + binorm[1] * v,
        p[2] + side[2] * u + binorm[2] * v
      ]);
    }
    return ring;
  });
  return smoothWeldedNormals(subdivideSmoothMesh(loftSectionsMesh(sections, true, false), 1, 0.36));
}

function buildOniGuardianNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("oni-v3", name, () => {
    const mats: AuraMaterialSpec[] = [
      MAT_ONI_SKIN, MAT_CRIMSON_ARMOR, MAT_INDIGO_SILK, MAT_FORGED_IRON,
      MAT_IMPERIAL_GOLD, MAT_PEARL_IVORY, MAT_DRAGON_EYE, MAT_DARK_SLATE,
      MAT_TIGER_PELT, MAT_EBONY_LACQUER
    ];
    const out: MultiMatSlot[] = [];
    const addSlot = (mesh: RawMesh, materialIndex: number, ao = 0.25, freq = 6): void => {
      out.push({ mesh: shadeSculptedMesh(mesh, ao, freq, ao > 0 ? 0.05 : 0), materialIndex });
    };

    // 1. Planted muscular Oni legs, taloned demon feet & spiked forged-iron ankle shackles
    for (const side of [-1, 1] as const) {
      const foot = transformMesh(
        smoothWeldedNormals(
          subdivideSmoothMesh(
            sculptAnatomicalLimbMesh(
              [
                { pos: [0, 0.09, -0.18], rx: 0.17, rz: 0.12 },
                { pos: [0, 0.1, 0.06], rx: 0.21, rz: 0.13 },
                { pos: [0, 0.07, 0.32], rx: 0.18, rz: 0.09 }
              ],
              { ringPoints: 18, capEnds: true }
            ),
            1,
            0.42
          )
        ),
        { pos: [side * 0.48, 0.04, 0.04], rot: [0, -side * 0.14, 0] }
      );
      addSlot(foot, 0, 0.25, 4);
      for (const tc of [-0.11, 0, 0.11] as const) {
        addSlot(
          transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.042, 0.03], [0.008, 0.17], [0, 0.18]], 12)), {
            pos: [side * 0.48 + tc, 0.06, 0.38], rot: [1.38, -side * 0.12, 0]
          }),
          5,
          0.18
        );
      }
      // Muscular calf & shin + spiked iron shackle ring
      const calf = smoothWeldedNormals(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [side * 0.48, 0.18, 0.02], rx: 0.15, rz: 0.15 },
              { pos: [side * 0.5, 0.54, -0.02], rx: 0.22, rz: 0.24, zOffset: -0.02 },
              { pos: [side * 0.47, 0.92, 0.03], rx: 0.19, rz: 0.2 }
            ],
            { ringPoints: 20, capEnds: true, muscleBiasZ: -0.025, peakT: 0.44 }
          ),
          1,
          0.42
        )
      );
      addSlot(calf, 0, 0.25, 5);
      addSlot(
        transformMesh(
          smoothWeldedNormals(latheMesh([[0, -0.055], [0.185, -0.05], [0.205, 0], [0.185, 0.05], [0, 0.055]], 18)),
          { pos: [side * 0.48, 0.28, 0.02] }
        ),
        3,
        0.25
      );
      // Baggy pleated indigo demon hakama thigh breeches
      const hakamaRing = (y: number, rx: number, rz: number): V3[] =>
        Array.from({ length: 20 }, (_, i) => {
          const a = (i / 20) * Math.PI * 2;
          const pleat = 1 + 0.075 * Math.cos(a * 8);
          return [side * 0.44 + Math.cos(a) * rx * pleat, y, Math.sin(a) * rz * pleat];
        });
      addSlot(
        smoothWeldedNormals(
          subdivideSmoothMesh(
            loftSectionsMesh([
              hakamaRing(0.84, 0.21, 0.21),
              hakamaRing(1.06, 0.31, 0.29),
              hakamaRing(1.32, 0.32, 0.3),
              hakamaRing(1.52, 0.25, 0.24)
            ], true, false),
            1,
            0.44
          )
        ),
        2,
        0.25,
        8
      );
    }

    // 2. Pleated Tiger-Stripe Demon Loincloth, Ebony Stripes & Twisted Shimenawa Rope Belt
    const kiltRing = (y: number, rx: number, rz: number): V3[] =>
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2;
        const pleat = 1 + 0.065 * Math.cos(a * 9);
        return [Math.cos(a) * rx * pleat, y, Math.sin(a) * rz * pleat];
      });
    addSlot(
      smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            kiltRing(1.02, 0.72, 0.52),
            kiltRing(1.28, 0.68, 0.49),
            kiltRing(1.56, 0.62, 0.44)
          ], true, false),
          1,
          0.46
        )
      ),
      8,
      0.25,
      9
    );
    // Inlaid ebony tiger-pelt chevrons across the front & rear apron
    for (const [tx, ty, tz, rotZ] of [
      [-0.26, 1.32, 0.48, 0.28],
      [0.24, 1.24, 0.49, -0.32],
      [-0.18, 1.12, 0.51, 0.22],
      [0.28, 1.4, 0.46, -0.24],
      [0, 1.26, -0.49, 0.18]
    ] as const) {
      addSlot(
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.32, 0.065, 0.06, 0.02), 1, 0.48), {
          pos: [tx, ty, tz], rot: [0, 0, rotZ]
        }),
        9,
        0.22
      );
    }
    // Heavy twisted gold/ivory waist rope + front medallion clasp
    const ropePts: V4[] = Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      const twist = 0.025 * Math.sin(a * 8);
      return [Math.cos(a) * 0.64, 1.56 + twist, Math.sin(a) * 0.46, 0.095];
    });
    addSlot(smoothWeldedNormals(tubeSweepMesh(ropePts, 14, false)), 5, 0.25, 8);
    addSlot(
      transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.2, 0.04], [0.22, 0.1], [0, 0.14]], 18)), {
        pos: [0, 1.56, 0.48], rot: [Math.PI * 0.5, 0, 0]
      }),
      4,
      0.22
    );

    // 3. Sculpted Heroic Muscular Crimson Oni Torso (`22` radial stations) + Crossed Iron War Harness
    const oniTorsoRing = (y: number, rx: number, rz: number, pec = 0, zBias = 0): V3[] =>
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        // Sculpted pectoral cleft & dorsal lat sweep
        const chest = sa > 0.15 ? pec * Math.sin(Math.min(Math.PI, Math.abs(ca) * 2.4)) * sa : 0;
        const spineGroove = sa < -0.5 ? -0.03 * Math.exp(-((ca / 0.25) ** 2)) : 0;
        return [
          Math.sign(ca) * Math.pow(Math.abs(ca), 0.9) * rx,
          y,
          sa * rz + chest + spineGroove + zBias
        ];
      });
    addSlot(
      smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            oniTorsoRing(1.5, 0.54, 0.38, 0.02, 0),
            oniTorsoRing(1.76, 0.62, 0.44, 0.04, 0.02),
            oniTorsoRing(2.08, 0.84, 0.56, 0.09, 0.05),
            oniTorsoRing(2.38, 0.88, 0.54, 0.07, 0.03),
            oniTorsoRing(2.58, 0.62, 0.42, 0.02, 0.01),
            oniTorsoRing(2.68, 0.3, 0.28, 0, 0)
          ], true, false),
          1,
          0.46
        )
      ),
      0,
      0.25,
      4
    );
    // Crossed forged-iron war harness + central horned gold boss on chest
    for (const sx of [-1, 1] as const) {
      const strap = catmullRomSpline3(
        [
          [sx * 0.58, 2.52, 0.18],
          [0, 2.06, 0.59],
          [-sx * 0.52, 1.62, 0.38],
          [-sx * 0.48, 1.62, -0.38],
          [0, 2.1, -0.52],
          [sx * 0.58, 2.52, -0.16]
        ],
        4,
        true
      ).map((p): V4 => [p[0], p[1], p[2], 0.048]);
      addSlot(smoothWeldedNormals(tubeSweepMesh(strap, 10, false)), 7, 0.25);
    }
    addSlot(
      transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.17, 0.04], [0.19, 0.09], [0.06, 0.15], [0, 0.16]], 18)), {
        pos: [0, 2.08, 0.56], rot: [Math.PI * 0.5, 0, 0]
      }),
      4,
      0.22
    );

    // 4. Layered Spiked Crimson-Lacquer Sode Pauldrons & Anatomical Muscular Arms
    for (const side of [-1, 1] as const) {
      for (const [tier, dy, sc] of [[0, 0, 1], [1, -0.18, 0.88]] as const) {
        addSlot(
          transformMesh(upturnedPagodaRoofMesh(0.5 * sc, 0.46 * sc, 0.32 * sc, 0.28), {
            pos: [side * (0.94 + tier * 0.05), 2.38 + dy, 0.02],
            rot: [0.08, 0, -side * (0.42 + tier * 0.1)]
          }),
          1,
          0.25
        );
      }
      addSlot(
        transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.085, 0.03], [0.015, 0.26], [0, 0.28]], 12)), {
          pos: [side * 1.02, 2.56, 0.02], rot: [0, 0, -side * 0.46]
        }),
        4,
        0.2
      );
      // Anatomical deltoid/bicep/forearm + iron bracer + clenched demon fist
      const wristPos: V3 = side < 0 ? [-0.66, 1.56, 0.68] : [0.58, 1.98, 0.56];
      const elbowPos: V3 = side < 0 ? [-1.04, 1.9, 0.3] : [1.02, 2.02, 0.24];
      const arm = smoothWeldedNormals(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [side * 0.84, 2.34, 0.02], rx: 0.23, rz: 0.22 },
              { pos: elbowPos, rx: 0.21, rz: 0.22, zOffset: 0.02 },
              { pos: wristPos, rx: 0.16, rz: 0.16 }
            ],
            { ringPoints: 20, capEnds: true, muscleBiasZ: 0.03, peakT: 0.36 }
          ),
          1,
          0.42
        )
      );
      addSlot(arm, 0, 0.25, 5);
      addSlot(
        transformMesh(
          smoothWeldedNormals(latheMesh([[0, -0.11], [0.175, -0.1], [0.195, 0], [0.175, 0.1], [0, 0.11]], 18)),
          { pos: [(elbowPos[0] + wristPos[0]) * 0.5, (elbowPos[1] + wristPos[1]) * 0.5, (elbowPos[2] + wristPos[2]) * 0.5], rot: [0.52, 0, -side * 0.38] }
        ),
        3,
        0.25
      );
      addSlot(
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.28, 0.26, 0.3, 0.08), 1, 0.5), {
          pos: wristPos, rot: [0.3, 0, -side * 0.25]
        }),
        0,
        0.25
      );
    }

    // 5. Fierce Sculpted Oni Head (`sculptStylizedHeadMesh`), Glowing Eyes, Tusks, Curved Ivory Horns & Wild Spiky Mane
    const oniHead = transformMesh(
      sculptStylizedHeadMesh(0.45, {
        jawTaper: 0.12,
        cheekFullness: 0.16,
        noseBridge: 0.24,
        browRidge: 0.22,
        subdivisions: 2,
        seed: 31
      }),
      { pos: [0, 2.88, 0.08], scale: [1.06, 1.04, 1.02] }
    );
    addSlot(oniHead, 0, 0.25, 4);
    // Snarling lower jaw ridge & heavy scowling V-brow
    addSlot(
      transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.46, 0.18, 0.34, 0.06), 1, 0.5), {
        pos: [0, 2.62, 0.28], rot: [0.16, 0, 0]
      }),
      0,
      0.25
    );
    addSlot(
      transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.58, 0.11, 0.22, 0.04), 1, 0.48), {
        pos: [0, 3.03, 0.42], rot: [0.18, 0, 0]
      }),
      0,
      0.25
    );
    addSlot(
      transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.38, 0.09, 0.12, 0.03), 1, 0.45), {
        pos: [0, 2.68, 0.45]
      }),
      9,
      0.15
    );
    for (const side of [-1, 1] as const) {
      // Pointed demon ears
      addSlot(
        transformMesh(
          sculptedHairBladeMesh([[0, 0, 0], [side * 0.16, 0.08, -0.04], [side * 0.32, 0.19, -0.1]], 0.09, 0.055, 0.18, 4),
          { pos: [side * 0.42, 2.88, 0.04] }
        ),
        0,
        0.25
      );
      // Dark eye socket + blazing golden demon eye
      addSlot(
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.17, 0.1, 0.08, 0.025), 1, 0.48), {
          pos: [side * 0.18, 2.94, 0.46], rot: [0, side * 0.18, -side * 0.24]
        }),
        9,
        0.15
      );
      out.push({
        mesh: transformMesh(smoothWeldedNormals(subdivideSmoothMesh(icosphereFacetMesh(0.068, 1, 0, 5), 1, 0.5)), {
          pos: [side * 0.18, 2.94, 0.49], scale: [1.22, 0.78, 0.72]
        }),
        materialIndex: 6
      });
      // Curved lower ivory tusk + upper fang
      const tusk = catmullRomSpline3(
        [
          [side * 0.16, 2.65, 0.44],
          [side * 0.22, 2.76, 0.56],
          [side * 0.19, 2.92, 0.53]
        ],
        5
      ).map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.008, 0.058 * (1 - (k / (a.length - 1)) * 0.88))]);
      addSlot(smoothWeldedNormals(tubeSweepMesh(tusk, 14, false)), 5, 0.2);
      addSlot(
        transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.036, 0.02], [0.006, 0.14], [0, 0.15]], 12)), {
          pos: [side * 0.09, 2.73, 0.48], rot: [Math.PI, 0, 0]
        }),
        5,
        0.18
      );
      // Sweeping ringed pearl-ivory Oni horns + imperial gold base collars
      addSlot(
        transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.14, 0.02], [0.15, 0.09], [0, 0.11]], 16)), {
          pos: [side * 0.22, 3.16, 0.18], rot: [-0.25, 0, -side * 0.42]
        }),
        4,
        0.22
      );
      const hornPts = catmullRomSpline3(
        [
          [side * 0.22, 3.18, 0.18],
          [side * 0.44, 3.44, 0.24],
          [side * 0.48, 3.68, 0.12],
          [side * 0.34, 3.86, 0.24]
        ],
        6
      ).map((p, k, a): V4 => {
        const t = k / Math.max(1, a.length - 1);
        const rib = 1 + 0.07 * Math.sin(t * Math.PI * 10);
        return [p[0], p[1], p[2], Math.max(0.012, 0.125 * Math.pow(1 - t, 0.82) * rib)];
      });
      addSlot(smoothWeldedNormals(tubeSweepMesh(hornPts, 18, false)), 5, 0.24);
    }
    // Wild flame-like shock of 9 spiky pearl-ivory Oni mane locks framing the skull & upper back
    for (const [mx, my, mz, dx, dy, dz] of [
      [0, 3.24, -0.08, 0, 0.56, -0.44],
      [-0.22, 3.18, -0.1, -0.34, 0.48, -0.46],
      [0.22, 3.18, -0.1, 0.34, 0.48, -0.46],
      [-0.38, 3.02, -0.06, -0.56, 0.28, -0.42],
      [0.38, 3.02, -0.06, 0.56, 0.28, -0.42],
      [-0.32, 2.78, -0.18, -0.48, -0.12, -0.56],
      [0.32, 2.78, -0.18, 0.48, -0.12, -0.56],
      [-0.14, 2.72, -0.22, -0.18, -0.26, -0.62],
      [0.14, 2.72, -0.22, 0.18, -0.26, -0.62]
    ] as const) {
      addSlot(
        sculptedHairBladeMesh(
          [
            [mx, my, mz],
            [mx + dx * 0.48, my + dy * 0.55, mz + dz * 0.48],
            [mx + dx, my + dy, mz + dz]
          ],
          0.14,
          0.095,
          0.26,
          4
        ),
        5,
        0.25
      );
    }

    // 6. Massive Octagonal Forged-Iron Kanabō War Club Studded with 18 Metallic Spikes
    const clubRot: V3 = [0.16, 0.08, -1.08];
    const clubOrigin: V3 = [-0.74, 1.46, 0.68];
    const kanaboParts: RawMesh[] = [
      latheMesh(
        [
          [0, 0],
          [0.095, 0],
          [0.075, 0.08],
          [0.075, 0.72],
          [0.165, 0.96],
          [0.235, 1.98],
          [0.21, 2.34],
          [0.08, 2.46],
          [0, 2.48]
        ],
        8,
        true
      )
    ];
    const studMesh = latheMesh([[0, 0], [0.048, 0.015], [0.012, 0.13], [0, 0.14]], 8, true);
    for (let row = 0; row < 3; row += 1) {
      const y = 1.16 + row * 0.48;
      const r = 0.185 + row * 0.022;
      for (let s = 0; s < 6; s += 1) {
        const a = (s / 6) * Math.PI * 2 + row * 0.52;
        kanaboParts.push(
          transformMesh(studMesh, {
            pos: [Math.sin(a) * r, y, Math.cos(a) * r],
            rot: [Math.PI * 0.5, a, 0]
          })
        );
      }
    }
    addSlot(transformMesh(mergeRawList(kanaboParts), { pos: clubOrigin, rot: clubRot }), 3, 0.25);
    const goldBands = mergeRawList([
      latheMesh([[0, -0.04], [0.115, -0.03], [0.125, 0.03], [0, 0.05]], 14),
      transformMesh(latheMesh([[0, 0], [0.185, 0.02], [0.19, 0.1], [0, 0.12]], 14), { pos: [0, 0.88, 0] }),
      transformMesh(latheMesh([[0, 0], [0.255, 0.02], [0.255, 0.11], [0, 0.13]], 14), { pos: [0, 2.26, 0] })
    ]);
    addSlot(transformMesh(goldBands, { pos: clubOrigin, rot: clubRot }), 4, 0.22);

    return { slots: out, mats };
  }, { id, castShadow: false, receiveShadow: true });
}

function buildSweeperCartNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("sweeper-v3", name, () => {
    const mats: AuraMaterialSpec[] = [
      MAT_DARK_SLATE, MAT_BURNISHED_BRONZE, MAT_FORGED_IRON, MAT_VERMILION_LACQUER,
      MAT_IMPERIAL_GOLD, MAT_AMBER_FLAME, MAT_INDIGO_SILK, MAT_EBONY_LACQUER,
      MAT_PEARL_IVORY, MAT_SPECTRAL_FLAME, MAT_CHOCHIN_PAPER
    ];
    const slots: MultiMatSlot[] = [];
    const addSlot = (mesh: RawMesh, materialIndex: number, ao = 0.25, freq = 6): void => {
      slots.push({ mesh: shadeSculptedMesh(mesh, ao, freq, ao > 0 ? 0.05 : 0), materialIndex });
    };

    // 1. Twin Spoked Bronze-and-Iron Chariot Wheels + Winged Axle Hubs
    for (const side of [-1, 1] as const) {
      for (const w of wheelAssemblySlots({ radius: 0.6, width: 0.24, spokeCount: 8, tireMat: 0, rimMat: 1, rotorMat: 2 })) {
        addSlot(transformMesh(w.mesh, { pos: [side * 1.06, 0.6, -0.05] }), w.materialIndex, 0.24);
      }
      addSlot(
        transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.14, 0.02], [0.09, 0.18], [0.02, 0.28], [0, 0.3]], 16)), {
          pos: [side * 1.18, 0.6, -0.05], rot: [0, 0, -side * Math.PI * 0.5]
        }),
        4,
        0.22
      );
    }

    // 2. Swept Vermilion & Ebony Lacquer Shrine Chariot Hull (`20` stations) + Front Curved Soul-Reaper Scythes
    const hullRing = (y: number, hx: number, hz: number, prowLift: number): V3[] =>
      Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.78) * hx;
        const sz = Math.sign(sa) * Math.pow(Math.abs(sa), 0.8) * hz;
        const lift = sa > 0 ? prowLift * Math.pow(sa, 2) : prowLift * 0.45 * Math.pow(-sa, 2);
        return [sx, y + lift, sz];
      });
    addSlot(
      smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            hullRing(0.46, 0.76, 0.94, 0.04),
            hullRing(0.64, 0.94, 1.12, 0.1),
            hullRing(0.94, 1.02, 1.24, 0.18),
            hullRing(1.08, 0.96, 1.18, 0.22)
          ], true, false),
          1,
          0.44
        )
      ),
      3,
      0.25
    );
    addSlot(
      transformMesh(subdivideSmoothMesh(bevelBoxMesh(1.98, 0.14, 2.34, 0.04), 1, 0.48), { pos: [0, 1.04, 0] }),
      7,
      0.25
    );
    // Front iron reaper crossbar + 3 wicked crescent soul-reaper scythe blades sweeping the road (+Z)
    addSlot(transformMesh(bevelBoxMesh(1.88, 0.14, 0.16, 0.03), { pos: [0, 0.46, 1.22] }), 2, 0.25);
    const scythePoly: V2[] = [
      [-0.08, 0],
      [0.12, -0.04],
      [0.38, 0.12],
      [0.54, 0.42],
      [0.42, 0.46],
      [0.2, 0.24],
      [-0.04, 0.14]
    ];
    for (const sx of [-0.68, 0, 0.68] as const) {
      addSlot(
        transformMesh(subdivideSmoothMesh(extrudePolygonMesh(scythePoly, 0.09, 0.02, false), 1, 0.4), {
          pos: [sx, 0.36, 1.22], rot: [Math.PI * 0.5, 0, Math.PI * 0.5]
        }),
        2,
        0.24
      );
      addSlot(
        transformMesh(extrudeStarPolygonMesh(6, 0.34, 0.16, 0.09, 0.02), {
          pos: [sx, 0.46, 1.26], rot: [0, Math.PI * 0.5, 0]
        }),
        4,
        0.22
      );
    }

    // 3. Glowing Spectral Soul-Cage Lantern Core & Upturned Shrine Hearse Canopy
    slots.push({
      mesh: transformMesh(
        smoothWeldedNormals(latheMesh([[0, -0.38], [0.34, -0.26], [0.46, 0.02], [0.32, 0.3], [0.08, 0.48], [0, 0.54]], 20)),
        { pos: [0, 1.48, -0.22] }
      ),
      materialIndex: 9
    });
    for (let r = 0; r < 6; r += 1) {
      const a = (r / 6) * Math.PI * 2;
      const rib = catmullRomSpline3(
        [
          [Math.cos(a) * 0.46, 1.06, -0.22 + Math.sin(a) * 0.46],
          [Math.cos(a) * 0.54, 1.5, -0.22 + Math.sin(a) * 0.54],
          [Math.cos(a) * 0.36, 1.96, -0.22 + Math.sin(a) * 0.36]
        ],
        4
      ).map((p): V4 => [p[0], p[1], p[2], 0.028]);
      addSlot(smoothWeldedNormals(tubeSweepMesh(rib, 8, false)), 2, 0.25);
    }
    for (const [px, pz] of [[-0.78, -0.86], [0.78, -0.86], [-0.78, 0.38], [0.78, 0.38]] as const) {
      addSlot(
        transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.1, 0], [0.085, 1.15], [0.11, 1.25], [0, 1.26]], 14)), {
          pos: [px, 1.06, pz]
        }),
        7,
        0.25
      );
    }
    addSlot(transformMesh(upturnedPagodaRoofMesh(1.12, 0.92, 0.52, 0.32), { pos: [0, 2.26, -0.24] }), 7, 0.25);
    addSlot(
      transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.16, 0.04], [0.09, 0.2], [0.02, 0.38], [0, 0.4]], 16)), {
        pos: [0, 2.74, -0.24]
      }),
      4,
      0.22
    );
    for (const side of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(pleatedChochinMesh(0.18, 0.25, 6), { pos: [side * 1.16, 2.02, 0.42] }),
        materialIndex: 10
      });
    }

    // 4. Sculpted Cowled Lantern-Wraith Charioteer at the Prow (`+Z`) + Hooked Spirit-Lantern Staff
    const wraithRobeRing = (y: number, rx: number, rz: number, zOff: number): V3[] =>
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2;
        const fold = 1 + 0.085 * Math.cos(a * 7 + y * 3.5);
        return [Math.cos(a) * rx * fold, y, zOff + Math.sin(a) * rz * fold];
      });
    addSlot(
      smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            wraithRobeRing(1.06, 0.46, 0.42, 0.42),
            wraithRobeRing(1.42, 0.38, 0.34, 0.45),
            wraithRobeRing(1.82, 0.44, 0.36, 0.48),
            wraithRobeRing(2.08, 0.26, 0.24, 0.48)
          ], true, false),
          1,
          0.46
        )
      ),
      6,
      0.25,
      7
    );
    // Pointed spectral cowl hood + dark void face + blazing spectral wraith eyes
    const hoodSpine = catmullRomSpline3(
      [
        [0, 2.02, 0.48],
        [0, 2.28, 0.5],
        [0, 2.48, 0.34],
        [0, 2.56, 0.12]
      ],
      5
    );
    const hoodSections: V3[][] = hoodSpine.map((p, idx) => {
      const t = idx / Math.max(1, hoodSpine.length - 1);
      const env = Math.max(0.05, Math.sin(Math.min(1, t * 0.9 + 0.18) * Math.PI));
      return Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return [p[0] + Math.cos(a) * 0.26 * env, p[1] + Math.sin(a) * 0.08 * (1 - t), p[2] + Math.sin(a) * 0.27 * env];
      });
    });
    addSlot(smoothWeldedNormals(subdivideSmoothMesh(loftSectionsMesh(hoodSections, true, false), 1, 0.44)), 6, 0.25, 5);
    addSlot(
      transformMesh(smoothWeldedNormals(subdivideSmoothMesh(icosphereFacetMesh(0.17, 1, 0, 9), 1, 0.5)), {
        pos: [0, 2.22, 0.55], scale: [0.92, 1.08, 0.85]
      }),
      7,
      0.15
    );
    for (const side of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(smoothWeldedNormals(subdivideSmoothMesh(icosphereFacetMesh(0.042, 1, 0, 3), 1, 0.5)), {
          pos: [side * 0.068, 2.24, 0.69], scale: [1.3, 0.72, 0.65]
        }),
        materialIndex: 9
      });
      // Draped robe sleeves + skeletal ivory hands
      const armSpine = catmullRomSpline3(
        [
          [side * 0.36, 1.88, 0.48],
          [side * 0.44, 1.66, 0.68],
          [side * 0.28, 1.62, 0.88]
        ],
        4
      ).map((p, k, a): V4 => [p[0], p[1], p[2], 0.095 + 0.045 * (k / Math.max(1, a.length - 1))]);
      addSlot(smoothWeldedNormals(subdivideSmoothMesh(tubeSweepMesh(armSpine, 14, false), 1, 0.44)), 6, 0.25, 6);
      addSlot(
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.11, 0.09, 0.14, 0.03), 1, 0.5), {
          pos: [side * 0.26, 1.6, 0.92]
        }),
        8,
        0.22
      );
    }
    // Tall hooked forged-iron reaper staff + suspended blazing spirit lantern at the prow
    const staffPts = catmullRomSpline3(
      [
        [0.26, 0.95, 0.86],
        [0.26, 1.85, 0.92],
        [0.26, 2.58, 0.98],
        [0.26, 2.74, 1.18],
        [0.26, 2.54, 1.32]
      ],
      5
    ).map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.022, 0.045 * (1 - (k / a.length) * 0.35))]);
    addSlot(smoothWeldedNormals(tubeSweepMesh(staffPts, 12, false)), 2, 0.24);
    slots.push({
      mesh: transformMesh(pleatedChochinMesh(0.22, 0.3, 7), { pos: [0.26, 2.2, 1.32] }),
      materialIndex: 5
    });

    return { slots, mats };
  }, { id, castShadow: false, receiveShadow: true });
}

function buildVitalityFeastNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("feast", name, () => {
    const mats: AuraMaterialSpec[] = [
      MAT_VERMILION_LACQUER, MAT_IMPERIAL_GOLD, MAT_PEARL_IVORY,
      MAT_ROAST_GLAZE, MAT_CELADON_JADE, MAT_AMBER_FLAME
    ];
    const slots: MultiMatSlot[] = [
      { mesh: transformMesh(bevelBoxMesh(1.92, 0.18, 1.38, 0.05), { pos: [0, 0.62, 0] }), materialIndex: 0 },
      { mesh: transformMesh(bevelBoxMesh(2.02, 0.08, 1.48, 0.03), { pos: [0, 0.72, 0] }), materialIndex: 1 }
    ];
    for (const [lx, lz] of [[-0.82, -0.54], [0.82, -0.54], [-0.82, 0.54], [0.82, 0.54]] as const) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.56, 0.16, 0.04), { pos: [lx, 0.28, lz] }), materialIndex: 0 });
    }
    slots.push({ mesh: transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.26, 0], [0.46, 0.22], [0.48, 0.46], [0.42, 0.46], [0.22, 0.12], [0, 0.12]], 18)), { pos: [-0.42, 0.76, 0.08] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.39, 0], [0, 0.05]], 16), { pos: [-0.42, 1.14, 0.08] }), materialIndex: 5 });
    slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.32, 2, 0.04, 15)), { pos: [0.44, 0.96, -0.18], scale: [1.25, 0.72, 0.92] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.2, 0], [0.28, 0.18], [0.2, 0.36], [0.08, 0.44], [0, 0.46]], 16)), { pos: [0.48, 0.76, 0.36] }), materialIndex: 4 });
    for (const [bx, bz] of [[-0.1, -0.34], [0.14, -0.4], [0.02, -0.18]] as const) {
      slots.push({ mesh: transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.15, 0], [0.17, 0.1], [0.06, 0.2], [0, 0.22]], 14)), { pos: [bx, 0.78, bz] }), materialIndex: 2 });
    }
    slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.16, 1, 0, 4)), { pos: [0, 1.56, 0] }), materialIndex: 5 });
    return { slots, mats };
  }, { id, castShadow: false, receiveShadow: true });
}

export function buildEntityModelNode(type: PooledEntityModelType, id: string, name = id): AuraNodeBuilder<AuraGroupNode> {
  switch (type) {
    case "arch": return buildSlideArchNode(id, name);
    case "barrier": return buildSpiritBarrierNode(id, name);
    case "oni": return buildOniGuardianNode(id, name);
    case "sweeper": return buildSweeperCartNode(id, name);
    case "feast": return buildVitalityFeastNode(id, name);
  }
}

/* ------------------------------------------------------------------ 6. Smooth Sculpted Instanced Specs */

export function orbSculptedSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-orb-sculpted", () => {
    const core = smoothWeldedNormals(icosphereFacetMesh(0.52, 2, 0, 1));
    const ringPts: V4[] = Array.from({ length: 17 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return [Math.cos(a) * 0.72, Math.sin(a) * 0.22, Math.sin(a) * 0.72, 0.055];
    });
    return mergeRawMeshes([core, smoothWeldedNormals(tubeSweepMesh(ringPts, 8, false))]);
  });
}

export function soulCoreSculptedSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-soul-core-sculpted-v3", () => {
    const profile: V2[] = [
      [0, -0.74],
      [0.48, -0.54],
      [0.74, -0.12],
      [0.66, 0.32],
      [0.36, 0.68],
      [0.12, 0.9],
      [0, 1.02]
    ];
    const core = smoothWeldedNormals(latheMesh(profile, 22));
    const wisps: RawMesh[] = [core];
    for (const side of [-1, 1] as const) {
      const tongue = catmullRomSpline3(
        [
          [side * 0.42, -0.22, 0],
          [side * 0.64, 0.18, 0.12],
          [side * 0.34, 0.68, 0.22]
        ],
        4
      ).map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.02, 0.19 * (1 - (k / (a.length - 1)) * 0.88))]);
      wisps.push(smoothWeldedNormals(tubeSweepMesh(tongue, 12, false)));
    }
    return mergeRawMeshes(wisps);
  });
}

export function soulTailSculptedSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-soul-tail-sculpted-v3", () => {
    const main = catmullRomSpline3(
      [[0, -0.86, 0], [0.14, -0.24, 0.08], [-0.12, 0.34, -0.06], [0, 0.88, 0]],
      6
    ).map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.02, 0.52 * (1 - (k / (a.length - 1)) * 0.88))]);
    const braid = catmullRomSpline3(
      [[0, -0.68, 0.05], [-0.22, -0.08, -0.1], [0.16, 0.48, 0.08], [0, 0.92, 0]],
      5
    ).map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.015, 0.24 * (1 - (k / (a.length - 1)) * 0.9))]);
    return mergeRawMeshes([
      smoothWeldedNormals(tubeSweepMesh(main, 16, false)),
      smoothWeldedNormals(tubeSweepMesh(braid, 12, false))
    ]);
  });
}

export function powerCrystalSculptedSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-power-crystal-sculpted", () => {
    const crystal = latheMesh([[0, -0.96], [0.58, -0.18], [0.68, 0], [0.58, 0.18], [0, 0.96]], 8, true);
    const collar = transformMesh(extrudeStarPolygonMesh(6, 0.82, 0.48, 0.14, 0.03), { rot: [Math.PI * 0.5, 0, 0] });
    return mergeRawMeshes([crystal, collar]);
  });
}

export function powerHaloSculptedSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-power-halo-sculpted", () => {
    const ring = (tilt: number): RawMesh => {
      const pts: V4[] = Array.from({ length: 19 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return [Math.cos(a) * 1.65, Math.sin(a) * Math.sin(tilt) * 1.65, Math.sin(a) * Math.cos(tilt) * 1.65, 0.075];
      });
      return smoothWeldedNormals(tubeSweepMesh(pts, 8, false));
    };
    return mergeRawMeshes([ring(0.52), ring(-0.52)]);
  });
}

export function hangingVergeLanternSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-hanging-verge-lantern", () => mergeRawMeshes([pleatedChochinMesh(0.34, 0.44, 6)]));
}

export function cumulusBillowSculptedSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-cumulus-billow-sculpted", () => mergeRawMeshes([smoothCumulusTuftMesh(0.95, 0.88, 0.95, 101)]));
}

/**
 * Batched GPU-instanced Vermilion-Red (`#d93829`) Japanese Myōjin Torii Gate frame (`halfSpan = 7.4 m`):
 * cylindrical `hashira` pillars outside the road, `nuki` crossbeam & curved upturned `shimagi`/`kasagi` lintel
 * elevated high at `y = 13.55..15.7 m` so zero crossbars ever obstruct the forward track sightline.
 */
export function toriiVermilionGateSpec(halfSpan = 7.4): AuraCustomGeometrySpec {
  return memoizeGeometry(`ssr-torii-vermilion-${halfSpan}`, () => {
    const parts: RawMesh[] = [];
    const column = latheMesh([[0, 0], [0.46, 0], [0.43, 0.4], [0.38, 13.1], [0.44, 13.5], [0, 13.5]], 16);
    for (const side of [-1, 1] as const) {
      parts.push(transformMesh(column, { pos: [side * halfSpan, 1.45, 0] }));
      // Outer eave bracket arm holding the flanking chochin paper lantern
      parts.push(transformMesh(bevelBoxMesh(1.45, 0.2, 0.22, 0.03), { pos: [side * (halfSpan + 0.72), 12.82, 0] }));
    }
    // Elevated nuki tie-beam (y = 13.55 m) + gakuzuka center strut + curved Myōjin shimagi vermilion lintel (y = 14.82..15.7 m)
    parts.push(transformMesh(bevelBoxMesh(halfSpan * 2 + 3.4, 0.44, 0.48, 0.06), { pos: [0, 13.55, 0] }));
    parts.push(transformMesh(bevelBoxMesh(0.56, 1.35, 0.36, 0.05), { pos: [0, 14.22, 0] }));
    parts.push(transformMesh(curvedKasagiBeamMesh(halfSpan + 2.6, 0.88, 0.46, 0.86, 0.38, 0.05), { pos: [0, 14.8, 0] }));
    return mergeRawMeshes(parts);
  });
}

/**
 * Batched GPU-instanced Ebony (`#191720`) Japanese Torii trim:
 * `nemaki` column base shoes (`y = 0..1.52 m`), `nuki` `kusabi` wedges, central tablet frame,
 * curved black `kasagi` top cap roof (`y = 15.24..16.25 m`), and `chochin` lantern rims.
 */
export function toriiEbonyTrimSpec(halfSpan = 7.4): AuraCustomGeometrySpec {
  return memoizeGeometry(`ssr-torii-ebony-${halfSpan}`, () => {
    const parts: RawMesh[] = [];
    const nemaki = latheMesh([[0, 0], [0.68, 0], [0.64, 0.34], [0.54, 0.42], [0.52, 1.48], [0.46, 1.54], [0, 1.54]], 16);
    const rimCap = latheMesh([[0, 0], [0.32, 0], [0.32, 0.12], [0, 0.12]], 12);
    for (const side of [-1, 1] as const) {
      parts.push(transformMesh(nemaki, { pos: [side * halfSpan, 0, 0] }));
      parts.push(transformMesh(bevelBoxMesh(1.06, 0.62, 0.62, 0.05), { pos: [side * halfSpan, 13.55, 0] }));
      // Top & bottom black lacquer rims + suspension cord for each outer chochin lantern
      const lx = side * (halfSpan + 1.35);
      parts.push(transformMesh(bevelBoxMesh(0.06, 0.32, 0.06, 0.01), { pos: [lx, 12.66, 0] }));
      parts.push(transformMesh(rimCap, { pos: [lx, 12.48, 0] }));
      parts.push(transformMesh(rimCap, { pos: [lx, 11.16, 0] }));
    }
    parts.push(transformMesh(bevelBoxMesh(0.96, 1.18, 0.44, 0.05), { pos: [0, 14.24, 0] }));
    parts.push(transformMesh(curvedKasagiBeamMesh(halfSpan + 2.85, 0.96, 0.28, 1.02, 0.46, 0.04), { pos: [0, 15.24, 0] }));
    return mergeRawMeshes(parts);
  });
}

/** Batched GPU-instanced warm glowing pleated Japanese `chochin` hanging paper lanterns flanking each torii gate (`+-8.75 m`). */
export function toriiChochinLanternSpec(halfSpan = 7.4): AuraCustomGeometrySpec {
  return memoizeGeometry(`ssr-torii-chochin-${halfSpan}`, () => {
    const lantern = pleatedChochinMesh(0.48, 0.66, 7);
    return mergeRawMeshes([
      transformMesh(lantern, { pos: [-(halfSpan + 1.35), 11.88, 0] }),
      transformMesh(lantern, { pos: [halfSpan + 1.35, 11.88, 0] })
    ]);
  });
}

function pleatedGiRing(y: number, rx: number, rz: number, pleats = 8, amp = 0.04, zBias = 0, segs = 22): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const fold = 1 + amp * Math.cos(a * pleats) + amp * 0.32 * Math.sin(a * (pleats * 2));
    pts.push([Math.cos(a) * rx * fold, y, Math.sin(a) * rz * fold + zBias]);
  }
  return pts;
}

/** Longitudinal cross-section ring of an arched martial-arts boot at foot coordinate `z` (+z heel, -z toe). */
function bootLastSlice(z: number, halfW: number, yBot: number, yTop: number, soleArch = 0): V3[] {
  const segs = 18;
  const yMid = yBot + (yTop - yBot) * 0.36;
  const ring: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const w = sa >= 0 ? halfW * (0.94 - 0.1 * sa) : halfW * (0.96 + 0.04 * Math.abs(sa));
    const y = sa >= 0
      ? yMid + sa * (yTop - yMid)
      : yMid + sa * (yMid - yBot) + soleArch * (1 - ca * ca) * Math.abs(sa);
    ring.push([ca * w, y, z]);
  }
  return ring;
}

/**
 * Bakes `paintMeshColors` cloth-fold / anatomical tonal gradients + `bakeMeshCavityAO(..., 0.25)`
 * onto a hero part `RawMesh` AND encodes `(bakedToneLuma, additiveAccent)` into `uvs` so
 * `SOLID_FRAGMENT` / `SOLID_FRAGMENT_WGSL` render full 0.25 cavity AO and multi-tone eye detail.
 */
function finalizeHeroPartSpec(parts: readonly RawMesh[], foldFreq = 7, foldAmp = 0.06, aoStrength = 0.25): AuraCustomGeometrySpec {
  const combined = mergeRawList(parts);
  const shaded = shadeSculptedMesh(combined, aoStrength, foldFreq, foldAmp);
  const vCount = Math.floor(shaded.positions.length / 3);
  const uvs = new Array<number>(vCount * 2);
  for (let i = 0; i < vCount; i += 1) {
    const c4 = i * 4;
    const r = shaded.colors?.[c4] ?? 1;
    const g = shaded.colors?.[c4 + 1] ?? 1;
    const b = shaded.colors?.[c4 + 2] ?? 1;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    uvs[i * 2] = luma;
    uvs[i * 2 + 1] = 0;
  }
  return mergeRawMeshes([{ ...shaded, uvs }]);
}

function tagEyeToneMesh(mesh: RawMesh, baseMult: number, addWhite: number, rgb: V3): RawMesh {
  const painted = paintMeshColors(mesh, [rgb[0], rgb[1], rgb[2], 1], false);
  const vCount = Math.floor(painted.positions.length / 3);
  const uvs = new Array<number>(vCount * 2);
  for (let i = 0; i < vCount; i += 1) {
    uvs[i * 2] = baseMult;
    uvs[i * 2 + 1] = addWhite;
  }
  return { ...painted, uvs };
}

/**
 * Sculpted heroic-scale (~1.95 m) martial-arts sky-runner body part geometry (`HERO_PARTS`),
 * featuring high-density (`18–24` radial stations + `subdivideSmoothMesh`) V-tapered matte pleated
 * `gi` tunic with seamless kimono shoulder yokes & `collar`, contoured knotted `belt` & `beltTrim`,
 * pleated baggy trousers, spiral-wrapped `shin` bindings, sleek arched kung-fu `boot` + `bootTrim`
 * stripes, `sculptAnatomicalLimbMesh` muscular arms with `cuff` & `wrist` wraps, `sculptStylizedHeadMesh`
 * anime face + 4-tone `eyes` with dual catchlights, 100%-coverage multi-tier `hairCap` + crescent-ridged
 * anime hair locks, and a knotted `headband` streaming two S-curved silk ribbons (`ribbonL`, `ribbonR`).
 */
export function skyRunnerPartSculptedSpec(id: string): AuraCustomGeometrySpec {
  return memoizeGeometry(`ssr-sky-runner-part-v3-${id}`, (): AuraCustomGeometrySpec => {
    if (id === "torso") {
      // Broad heroic V-tapered martial-arts gi tunic with flared kimono shoulder yokes overlapping `cuffL/R`
      const bodice = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            pleatedGiRing(-0.4, 0.19, 0.136, 9, 0.055, 0.008, 22),
            pleatedGiRing(-0.32, 0.21, 0.152, 9, 0.06, 0.006, 22),
            pleatedGiRing(-0.25, 0.176, 0.128, 9, 0.038, 0, 22),
            pleatedGiRing(-0.08, 0.214, 0.154, 7, 0.042, -0.006, 22),
            pleatedGiRing(0.11, 0.278, 0.184, 7, 0.034, -0.01, 22),
            pleatedGiRing(0.2, 0.286, 0.172, 7, 0.026, -0.004, 22),
            pleatedGiRing(0.268, 0.132, 0.108, 6, 0.016, 0, 22)
          ], true, false),
          1,
          0.46
        )
      );
      const parts: RawMesh[] = [bodice];
      // Seamless kimono shoulder yoke caps bridging across `x = +-0.255` so `cuffL/R` never float
      for (const sx of [-1, 1] as const) {
        const yoke = smoothWeldedNormals(
          subdivideSmoothMesh(
            loftSectionsMesh([
              pleatedGiRing(-0.045, 0.098, 0.108, 6, 0.03, 0, 18),
              pleatedGiRing(0.015, 0.108, 0.114, 6, 0.025, 0, 18),
              pleatedGiRing(0.065, 0.082, 0.092, 6, 0.018, 0, 18)
            ], true, false),
            1,
            0.44
          )
        );
        parts.push(transformMesh(yoke, { pos: [sx * 0.218, 0.182, 0], rot: [0, 0, -sx * 0.42] }));
      }
      // Crisp crossover martial-arts V-lapels on `-Z` chest + structured back collar ridge
      parts.push(
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.074, 0.36, 0.052, 0.02), 1, 0.46), {
          pos: [-0.062, 0.072, -0.162], rot: [0.06, 0.15, -0.26]
        }),
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.074, 0.36, 0.052, 0.02), 1, 0.46), {
          pos: [0.062, 0.072, -0.162], rot: [0.06, -0.15, 0.26]
        }),
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.21, 0.082, 0.058, 0.022), 1, 0.48), {
          pos: [0, 0.242, 0.112], rot: [-0.18, 0, 0]
        })
      );
      return finalizeHeroPartSpec(parts, 8, 0.065, 0.25);
    }
    if (id === "collar") {
      // Crisp warm-ivory inner martial-arts undershirt V-neck & nape collar trim (`20` radial stations)
      const neckRing = transformMesh(
        smoothWeldedNormals(
          subdivideSmoothMesh(
            latheMesh([[0, -0.028], [0.102, -0.022], [0.114, 0.018], [0.094, 0.048], [0, 0.05]], 20),
            1,
            0.46
          )
        ),
        { pos: [0, 0.25, 0.004], scale: [1.04, 1, 0.94] }
      );
      const innerVL = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.05, 0.24, 0.038, 0.015), 1, 0.48), {
        pos: [-0.042, 0.132, -0.154], rot: [0.08, 0.1, -0.24]
      });
      const innerVR = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.05, 0.24, 0.038, 0.015), 1, 0.48), {
        pos: [0.042, 0.132, -0.154], rot: [0.08, -0.1, 0.24]
      });
      return finalizeHeroPartSpec([neckRing, innerVL, innerVR], 6, 0.04, 0.25);
    }
    if (id === "pelvis") {
      // Closed, matte woven pleated martial-arts hip & bloused trouser seat (`22` stations)
      const seat = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            pleatedGiRing(-0.16, 0.092, 0.078, 8, 0.03, 0.006, 22),
            pleatedGiRing(-0.09, 0.194, 0.146, 9, 0.052, 0.012, 22),
            pleatedGiRing(0.0, 0.212, 0.156, 9, 0.056, 0.01, 22),
            pleatedGiRing(0.092, 0.194, 0.142, 9, 0.038, 0.004, 22),
            pleatedGiRing(0.168, 0.162, 0.12, 8, 0.024, 0, 22)
          ], true, false),
          1,
          0.48
        )
      );
      return finalizeHeroPartSpec([seat], 9, 0.065, 0.25);
    }
    if (id === "belt") {
      // Double-wrapped pleated martial-arts obi waist sash (`22` stations) + sculpted knot & flowing front/rear sash tails
      const obi = smoothWeldedNormals(
        subdivideSmoothMesh(
          latheMesh([[0, -0.058], [0.212, -0.052], [0.23, -0.016], [0.22, 0.012], [0.23, 0.04], [0.208, 0.056], [0, 0.058]], 22),
          1,
          0.46
        )
      );
      const knot = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.106, 0.094, 0.078, 0.028), 1, 0.5), {
        pos: [0, -0.004, -0.172]
      });
      const makeSashTail = (pts: readonly V3[]): RawMesh => {
        const sp = catmullRomSpline3(pts, 5);
        const rings: V3[][] = sp.map((p, k) => {
          const t = k / Math.max(1, sp.length - 1);
          const hw = 0.036 * (1 - t * 0.25);
          const ht = 0.012 * (1 - t * 0.35);
          return Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return [p[0] + Math.cos(a) * hw, p[1] + Math.sin(a) * ht * 0.5, p[2] + Math.sin(a) * ht];
          });
        });
        return smoothWeldedNormals(subdivideSmoothMesh(loftSectionsMesh(rings, true, false), 1, 0.4));
      };
      const backFold = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.145, 0.088, 0.054, 0.02), 1, 0.5), {
        pos: [0, 0.002, 0.164]
      });
      return finalizeHeroPartSpec(
        [
          transformMesh(obi, { scale: [0.97, 1, 0.73] }),
          knot,
          backFold,
          makeSashTail([[-0.024, -0.015, -0.176], [-0.074, -0.12, -0.184], [-0.105, -0.25, -0.162]]),
          makeSashTail([[0.024, -0.015, -0.176], [0.07, -0.11, -0.18], [0.096, -0.225, -0.156]]),
          makeSashTail([[-0.028, -0.01, 0.168], [-0.068, -0.11, 0.195], [-0.094, -0.22, 0.235]])
        ],
        7,
        0.055,
        0.25
      );
    }
    if (id === "beltTrim") {
      // Engraved imperial gold obi clasp & rear waist buckle
      const frontClasp = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.062, 0.068, 0.046, 0.016), 1, 0.48), {
        pos: [0, -0.004, -0.19]
      });
      const backClasp = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.084, 0.056, 0.038, 0.014), 1, 0.48), {
        pos: [0, 0.002, 0.178]
      });
      return finalizeHeroPartSpec([frontClasp, backClasp], 4, 0.03, 0.25);
    }
    if (id === "neck") {
      // Sculpted sternocleidomastoid athletic neck (`18` radial stations)
      const neck = smoothWeldedNormals(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [0, -0.068, 0.006], rx: 0.068, rz: 0.068 },
              { pos: [0, 0, 0], rx: 0.061, rz: 0.062 },
              { pos: [0, 0.068, -0.004], rx: 0.058, rz: 0.059 }
            ],
            { ringPoints: 18, capEnds: true }
          ),
          1,
          0.42
        )
      );
      return finalizeHeroPartSpec([neck], 4, 0.025, 0.25);
    }
    if (id === "head") {
      // Sculpted anime martial-artist head (`sculptStylizedHeadMesh`, rotated `ry: Math.PI` so face points `-Z`)
      // Kept compact on the upper/rear cranium (`rx ~ 0.160, rz ~ 0.162, maxY ~ 0.172`) so `hairCap` covers 100% of it!
      const skull = transformMesh(
        sculptStylizedHeadMesh(0.16, {
          jawTaper: 0.28,
          cheekFullness: 0.09,
          noseBridge: 0.2,
          browRidge: 0.11,
          subdivisions: 2,
          seed: 17
        }),
        { rot: [0, Math.PI, 0], scale: [0.98, 1.0, 0.98] }
      );
      const earL = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.036, 0.082, 0.054, 0.016), 1, 0.5), {
        pos: [-0.158, 0.002, 0.006], rot: [0, -0.18, -0.08]
      });
      const earR = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.036, 0.082, 0.054, 0.016), 1, 0.5), {
        pos: [0.158, 0.002, 0.006], rot: [0, 0.18, 0.08]
      });
      return finalizeHeroPartSpec([skull, earL, earR], 3, 0.02, 0.25);
    }
    if (id === "eyes") {
      // Full 4-tone anime martial-artist eyes on the `-Z` face: sclera, iris, pupil, arched brows & dual catchlights
      const eyeParts: RawMesh[] = [];
      for (const sx of [-1, 1] as const) {
        const ex = sx * 0.058;
        const rotY = sx * 0.18;
        // Warm ivory sclera almond
        eyeParts.push(
          tagEyeToneMesh(
            transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.052, 0.034, 0.018, 0.007), 1, 0.48), {
              pos: [ex, 0.016, -0.162], rot: [0, rotY, -sx * 0.06]
            }),
            1.0,
            0.88,
            [0.97, 0.96, 0.95]
          )
        );
        // Deep indigo-obsidian iris & pupil disc
        eyeParts.push(
          tagEyeToneMesh(
            transformMesh(smoothWeldedNormals(subdivideSmoothMesh(icosphereFacetMesh(0.016, 1, 0, 3), 1, 0.5)), {
              pos: [sx * 0.055, 0.015, -0.17], scale: [0.95, 1.12, 0.45]
            }),
            0.9,
            0.0,
            [0.12, 0.14, 0.22]
          )
        );
        // Primary upper-outer & secondary lower-inner anime catchlights
        eyeParts.push(
          tagEyeToneMesh(
            transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.0055, 1, 0, 2)), {
              pos: [ex + sx * 0.006, 0.023, -0.176], scale: [1, 1, 0.5]
            }),
            1.0,
            1.35,
            [1, 1, 1]
          ),
          tagEyeToneMesh(
            transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.0032, 1, 0, 2)), {
              pos: [ex - sx * 0.005, 0.009, -0.175], scale: [1, 1, 0.5]
            }),
            1.0,
            1.15,
            [1, 1, 1]
          )
        );
        // Upper lash crease + sharp determined martial-artist brow
        eyeParts.push(
          tagEyeToneMesh(
            transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.058, 0.009, 0.02, 0.003), 1, 0.45), {
              pos: [ex, 0.033, -0.166], rot: [0, rotY, -sx * 0.12]
            }),
            0.78,
            0.0,
            [0.08, 0.07, 0.12]
          ),
          tagEyeToneMesh(
            transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.068, 0.015, 0.022, 0.005), 1, 0.46), {
              pos: [sx * 0.06, 0.052, -0.168], rot: [0, rotY, -sx * 0.25]
            }),
            0.82,
            0.0,
            [0.09, 0.08, 0.14]
          )
        );
      }
      return mergeRawMeshes(eyeParts);
    }
    if (id === "headband") {
      // Snug 22-station cloth headband wrapping around the fuller hairCap + sculpted rear knot at `z = +0.21`
      const bandRing = (yOff: number, rScale: number): V3[] => {
        const pts: V3[] = [];
        const segs = 22;
        for (let i = 0; i < segs; i += 1) {
          const a = (i / segs) * Math.PI * 2;
          const sa = Math.sin(a);
          const x = Math.cos(a) * 0.204 * rScale;
          const z = (sa >= 0 ? sa * 0.216 : sa * 0.184) * rScale + 0.008;
          const tiltY = 0.056 + yOff - 0.015 * sa;
          pts.push([x, tiltY, z]);
        }
        return pts;
      };
      const band = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            bandRing(-0.024, 0.985),
            bandRing(0, 1.02),
            bandRing(0.024, 0.98)
          ], true, false),
          1,
          0.42
        )
      );
      const knotCore = transformMesh(
        smoothWeldedNormals(subdivideSmoothMesh(icosphereFacetMesh(0.04, 1, 0.02, 7), 1, 0.5)),
        { pos: [0, 0.042, 0.214], scale: [1.2, 0.98, 0.94] }
      );
      const loopL = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.046, 0.034, 0.032, 0.012), 1, 0.5), {
        pos: [-0.034, 0.046, 0.212], rot: [0, -0.28, 0.26]
      });
      const loopR = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.046, 0.034, 0.032, 0.012), 1, 0.5), {
        pos: [0.034, 0.046, 0.212], rot: [0, 0.28, -0.26]
      });
      return finalizeHeroPartSpec([band, knotCore, loopL, loopR], 6, 0.05, 0.25);
    }
    if (id === "ribbonL" || id === "ribbonR") {
      // Continuous, smooth, 18-station S-curved pleated silk ribbon originating directly inside the headband knot ([0, 0, 0])
      const sx = id === "ribbonR" ? 1 : -1;
      const len = id === "ribbonR" ? 0.7 : 0.8;
      const spine = catmullRomSpline3(
        [
          [0, 0, 0],
          [sx * 0.036, -0.024, len * 0.22],
          [sx * 0.078, 0.024, len * 0.48],
          [sx * 0.042, -0.048, len * 0.75],
          [sx * 0.094, -0.018, len]
        ],
        5
      );
      const sections: V3[][] = spine.map((p, idx) => {
        const t = idx / Math.max(1, spine.length - 1);
        const hw = Math.max(0.004, 0.032 * Math.sin(Math.min(1, t * 1.08) * Math.PI * 0.86) + 0.01 * (1 - t));
        const ht = Math.max(0.0024, 0.007 * (1 - t * 0.65));
        const bank = sx * 0.3 * Math.sin(t * Math.PI * 1.45);
        const cb = Math.cos(bank), sb = Math.sin(bank);
        const camber = 0.005 * Math.sin(t * Math.PI * 2);
        const ring: V3[] = [];
        const segs = 18;
        for (let i = 0; i < segs; i += 1) {
          const a = (i / segs) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          const u = ca * hw;
          const v = sa * ht + camber * (1 - ca * ca);
          ring.push([p[0] + u * cb - v * sb, p[1] + u * sb + v * cb, p[2]]);
        }
        return ring;
      });
      return finalizeHeroPartSpec([smoothWeldedNormals(loftSectionsMesh(sections, true, false), 1000)], 5, 0.045, 0.25);
    }
    if (id === "hairCap") {
      // Full, lush, 22-station anime hair crown & occiput shell (`+3.5 cm` outside `head` on top, sides & `+Z` rear!)
      // Zero bald skin patches can EVER poke through from any chase, side, or overhead camera angle.
      const capRing = (yBase: number, rx: number, rzBack: number, rzFront: number, backDrop: number, frontLift: number): V3[] => {
        const segs = 22;
        const pts: V3[] = [];
        for (let i = 0; i < segs; i += 1) {
          const a = (i / segs) * Math.PI * 2;
          const ca = Math.cos(a);
          const sa = Math.sin(a); // sa > 0 is +Z (back of head), sa < 0 is -Z (face)
          const ridge = 1 + 0.038 * Math.cos(a * 9);
          const rz = sa >= 0 ? rzBack : rzFront;
          const yOff = sa >= 0 ? -backDrop * Math.pow(sa, 0.85) : frontLift * Math.pow(-sa, 1.25);
          pts.push([
            ca * rx * ridge,
            yBase + yOff,
            sa * rz * ridge + 0.014
          ]);
        }
        return pts;
      };
      const cap = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            capRing(-0.035, 0.194, 0.214, 0.152, 0.115, 0.115),
            capRing(0.025, 0.214, 0.228, 0.178, 0.082, 0.058),
            capRing(0.092, 0.218, 0.232, 0.188, 0.044, 0.018),
            capRing(0.158, 0.186, 0.198, 0.164, 0.018, 0.004),
            capRing(0.212, 0.122, 0.132, 0.112, 0.006, 0),
            capRing(0.242, 0.036, 0.038, 0.034, 0, 0)
          ], true, false),
          1,
          0.44
        )
      );
      const parts: RawMesh[] = [cap];

      // Sculpted forehead & temple anime bangs framing the `-Z` face without blocking the eyes
      for (const pts of [
        [[-0.088, 0.11, -0.152], [-0.105, 0.055, -0.186], [-0.112, -0.012, -0.192]],
        [[-0.022, 0.118, -0.162], [-0.014, 0.068, -0.194], [-0.004, 0.018, -0.198]],
        [[0.056, 0.114, -0.158], [0.072, 0.062, -0.19], [0.082, 0.004, -0.194]],
        [[-0.164, 0.065, -0.058], [-0.184, -0.008, -0.082], [-0.178, -0.088, -0.092]],
        [[0.164, 0.065, -0.058], [0.184, -0.008, -0.082], [0.178, -0.088, -0.092]]
      ] as const) {
        parts.push(sculptedHairBladeMesh(pts, 0.048, 0.032, 0.24, 4));
      }

      // Multi-tiered crown, occiput & nape crescent-ridged hair locks covering 100% of the rear (`+Z`) skull
      for (const [pts, rx, rz] of [
        // Upper crown sweep locks
        [[[0, 0.165, 0.04], [0.01, 0.255, 0.14], [0.018, 0.325, 0.26]], 0.082, 0.058],
        [[[-0.082, 0.155, 0.05], [-0.148, 0.235, 0.155], [-0.21, 0.295, 0.275]], 0.078, 0.055],
        [[[0.082, 0.155, 0.05], [0.148, 0.235, 0.155], [0.21, 0.295, 0.275]], 0.078, 0.055],
        // Mid-occiput rear shield locks above the headband
        [[[-0.055, 0.105, 0.155], [-0.095, 0.145, 0.265], [-0.135, 0.175, 0.375]], 0.076, 0.052],
        [[[0.055, 0.105, 0.155], [0.095, 0.145, 0.265], [0.135, 0.175, 0.375]], 0.076, 0.052],
        [[[0, 0.118, 0.165], [0, 0.162, 0.285], [0, 0.195, 0.4]], 0.08, 0.054],
        // Lateral flared ear-to-crown anime locks
        [[[-0.168, 0.075, 0.03], [-0.265, 0.115, 0.105], [-0.355, 0.155, 0.195]], 0.072, 0.05],
        [[[0.168, 0.075, 0.03], [0.265, 0.115, 0.105], [0.355, 0.155, 0.195]], 0.072, 0.05],
        // Lower nape fan locks below the knotted headband (+Z)
        [[[-0.125, -0.045, 0.158], [-0.185, -0.105, 0.235], [-0.235, -0.155, 0.315]], 0.062, 0.044],
        [[[-0.065, -0.065, 0.178], [-0.095, -0.135, 0.258], [-0.122, -0.195, 0.335]], 0.064, 0.045],
        [[[0, -0.072, 0.186], [0, -0.145, 0.268], [0, -0.205, 0.348]], 0.066, 0.046],
        [[[0.065, -0.065, 0.178], [0.095, -0.135, 0.258], [0.122, -0.195, 0.335]], 0.064, 0.045],
        [[[0.125, -0.045, 0.158], [0.185, -0.105, 0.235], [0.235, -0.155, 0.315]], 0.062, 0.044]
      ] as const) {
        parts.push(sculptedHairBladeMesh(pts, rx, rz, 0.26, 4));
      }
      return finalizeHeroPartSpec(parts, 9, 0.06, 0.25);
    }
    if (id.startsWith("spike")) {
      // Dynamic articulated crescent-ridged anime hair lock (`18` radial stations + secondary barb strand)
      const idx = Number(id.replace("spike", "")) || 0;
      const flair = 0.96 + (idx % 3) * 0.09;
      const curveSign = idx % 2 === 0 ? 1 : -1;
      const mainBlade = sculptedHairBladeMesh(
        [
          [0, -0.165, -0.01],
          [curveSign * 0.015, -0.03, 0.02],
          [curveSign * 0.034, 0.1 * flair, 0.064],
          [curveSign * 0.056, 0.235 * flair, 0.128]
        ],
        0.092,
        0.068,
        0.26,
        5
      );
      const secondaryBarb = sculptedHairBladeMesh(
        [
          [curveSign * 0.016, -0.085, 0.012],
          [curveSign * 0.064, 0.022, 0.044],
          [curveSign * 0.108, 0.132, 0.092]
        ],
        0.052,
        0.038,
        0.24,
        4
      );
      return finalizeHeroPartSpec([mainBlade, secondaryBarb], 6, 0.055, 0.25);
    }
    if (id.startsWith("thigh")) {
      // Deep-pleated matte woven baggy martial-arts gi trousers (`22` stations) tapering cleanly into the knee wrap
      const sx = id.endsWith("R") ? 1 : -1;
      const trouser = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            pleatedGiRing(-0.224, 0.08, 0.08, 8, 0.032, 0, 22),
            pleatedGiRing(-0.15, 0.136, 0.132, 9, 0.068, 0.008, 22),
            pleatedGiRing(-0.025, 0.144, 0.138, 9, 0.064, sx * 0.005, 22),
            pleatedGiRing(0.105, 0.128, 0.122, 8, 0.048, 0, 22),
            pleatedGiRing(0.218, 0.106, 0.102, 7, 0.028, 0, 22)
          ], true, false),
          1,
          0.44
        )
      );
      return finalizeHeroPartSpec([trouser], 9, 0.072, 0.25);
    }
    if (id.startsWith("shin")) {
      // Anatomical calf (`sculptAnatomicalLimbMesh`, `20` stations) + crisscrossed `kyahan` cloth leg wraps
      const sx = id.endsWith("R") ? 1 : -1;
      const calfCore = smoothWeldedNormals(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [0, 0.208, 0], rx: 0.078, rz: 0.078 },
              { pos: [sx * 0.005, 0.075, 0.012], rx: 0.084, rz: 0.088 },
              { pos: [0, -0.058, 0.004], rx: 0.068, rz: 0.07 },
              { pos: [0, -0.208, 0], rx: 0.054, rz: 0.056 }
            ],
            { ringPoints: 20, capEnds: true, muscleBiasZ: 0.01, peakT: 0.36 }
          ),
          1,
          0.42
        )
      );
      const parts: RawMesh[] = [calfCore];
      for (const [wy, wr, tiltSign] of [
        [0.12, 0.086, 1],
        [0.04, 0.082, -1],
        [-0.04, 0.073, 1],
        [-0.12, 0.064, -1],
        [-0.175, 0.059, 1]
      ] as const) {
        parts.push(
          transformMesh(
            smoothWeldedNormals(latheMesh([[0, -0.018], [wr, -0.015], [wr + 0.006, 0], [wr, 0.015], [0, 0.018]], 20)),
            { pos: [0, wy, 0.004], rot: [0.09 * tiltSign, 0, sx * 0.11 * tiltSign] }
          )
        );
      }
      return finalizeHeroPartSpec(parts, 8, 0.05, 0.25);
    }
    if (id.startsWith("bootTrim")) {
      // Striped kung-fu boot welt, central vamp stripe, crossed ankle bindings & heel stripe
      const weltPts = catmullRomSpline3(
        [
          [0, -0.054, 0.106],
          [0.046, -0.056, 0.066],
          [0.041, -0.044, -0.005],
          [0.054, -0.056, -0.094],
          [0.035, -0.05, -0.166],
          [0, -0.044, -0.186],
          [-0.035, -0.05, -0.166],
          [-0.054, -0.056, -0.094],
          [-0.041, -0.044, -0.005],
          [-0.046, -0.056, 0.066]
        ],
        4,
        true
      ).map((p): V4 => [p[0], p[1], p[2], 0.0085]);
      const centerStripe = catmullRomSpline3(
        [[0, -0.042, -0.186], [0, 0.008, -0.12], [0, 0.046, -0.015], [0, 0.068, 0.02]],
        4
      ).map((p): V4 => [p[0], p[1], p[2], 0.0085]);
      const strapInstep = catmullRomSpline3(
        [
          [-0.05, -0.046, -0.045],
          [-0.045, 0.018, -0.02],
          [0, 0.044, 0.002],
          [0.045, 0.018, -0.02],
          [0.05, -0.046, -0.045]
        ],
        4
      ).map((p): V4 => [p[0], p[1], p[2], 0.008]);
      const ankleBand = transformMesh(
        smoothWeldedNormals(latheMesh([[0, -0.012], [0.063, -0.01], [0.067, 0], [0.063, 0.01], [0, 0.012]], 18)),
        { pos: [0, 0.068, 0.052], rot: [0.08, 0, 0] }
      );
      const heelStripe = catmullRomSpline3(
        [[0, -0.05, 0.105], [0, 0.015, 0.107], [0, 0.082, 0.097]],
        4
      ).map((p): V4 => [p[0], p[1], p[2], 0.0085]);
      return finalizeHeroPartSpec(
        [
          smoothWeldedNormals(tubeSweepMesh(weltPts, 8, false)),
          smoothWeldedNormals(tubeSweepMesh(centerStripe, 8, false)),
          smoothWeldedNormals(tubeSweepMesh(strapInstep, 8, false)),
          ankleBand,
          smoothWeldedNormals(tubeSweepMesh(heelStripe, 8, false))
        ],
        5,
        0.035,
        0.25
      );
    }
    if (id.startsWith("boot")) {
      // Sculpted kung-fu boot (`18` stations) keeping `maxX - minX < 0.16` and `0.25 < maxZ - minZ < 0.35`
      const shoeBody = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            bootLastSlice(0.11, 0.024, -0.048, 0.022, 0),
            bootLastSlice(0.082, 0.047, -0.064, 0.046, 0.002),
            bootLastSlice(0.035, 0.044, -0.06, 0.052, 0.008),
            bootLastSlice(-0.01, 0.04, -0.048, 0.044, 0.014),
            bootLastSlice(-0.065, 0.052, -0.064, 0.03, 0.004),
            bootLastSlice(-0.125, 0.054, -0.063, 0.015, 0.002),
            bootLastSlice(-0.168, 0.037, -0.052, 0.002, 0),
            bootLastSlice(-0.188, 0.016, -0.038, -0.01, 0)
          ], true, false),
          1,
          0.46
        )
      );
      const ankleShaft = transformMesh(
        smoothWeldedNormals(
          subdivideSmoothMesh(
            latheMesh([[0, -0.035], [0.056, -0.03], [0.061, 0.015], [0.065, 0.05], [0, 0.052]], 18),
            1,
            0.46
          )
        ),
        { pos: [0, 0.046, 0.052], rot: [0.08, 0, 0] }
      );
      return finalizeHeroPartSpec([shoeBody, ankleShaft], 6, 0.045, 0.25);
    }
    if (id.startsWith("cuff")) {
      // Seamless domed & flared martial-arts gi shoulder sleeve overlapping torso shoulder yoke & upper deltoid
      const sx = id.endsWith("R") ? 1 : -1;
      const sleeve = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            pleatedGiRing(-0.072, 0.112, 0.106, 8, 0.052, 0, 20),
            pleatedGiRing(-0.025, 0.108, 0.102, 8, 0.042, 0, 20),
            pleatedGiRing(0.028, 0.098, 0.096, 7, 0.028, 0, 20),
            pleatedGiRing(0.066, 0.072, 0.074, 6, 0.016, 0, 20),
            pleatedGiRing(0.084, 0.026, 0.028, 6, 0.006, 0, 20)
          ], true, false),
          1,
          0.44
        )
      );
      return finalizeHeroPartSpec([transformMesh(sleeve, { rot: [0, 0, -sx * 0.08] })], 8, 0.06, 0.25);
    }
    if (id.startsWith("upper")) {
      // Sculpted muscular deltoid, bicep peak & tricep sweep (`sculptAnatomicalLimbMesh`, `20` stations)
      const sx = id.endsWith("R") ? 1 : -1;
      const arm = smoothWeldedNormals(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [0, 0.158, 0], rx: 0.082, rz: 0.082 },
              { pos: [sx * 0.008, 0.062, -0.006], rx: 0.084, rz: 0.088 },
              { pos: [sx * 0.005, -0.048, -0.008], rx: 0.074, rz: 0.078 },
              { pos: [0, -0.156, 0], rx: 0.059, rz: 0.061 }
            ],
            { ringPoints: 20, capEnds: true, muscleBiasZ: -0.012, peakT: 0.42 }
          ),
          1,
          0.42
        )
      );
      return finalizeHeroPartSpec([arm], 4, 0.03, 0.25);
    }
    if (id.startsWith("fore")) {
      // Sculpted brachioradialis & extensor forearm muscle taper (`sculptAnatomicalLimbMesh`, `20` stations)
      const sx = id.endsWith("R") ? 1 : -1;
      const fore = smoothWeldedNormals(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(
            [
              { pos: [0, 0.152, 0], rx: 0.061, rz: 0.063 },
              { pos: [sx * 0.006, 0.068, -0.006], rx: 0.071, rz: 0.073 },
              { pos: [0, -0.042, 0], rx: 0.056, rz: 0.058 },
              { pos: [0, -0.152, 0], rx: 0.047, rz: 0.049 }
            ],
            { ringPoints: 20, capEnds: true, muscleBiasZ: -0.008, peakT: 0.34 }
          ),
          1,
          0.42
        )
      );
      return finalizeHeroPartSpec([fore], 4, 0.03, 0.25);
    }
    if (id.startsWith("wrist")) {
      // Multi-wrapped ribbed martial-arts cloth wristband bracer (`20` stations)
      const band = smoothWeldedNormals(
        subdivideSmoothMesh(
          latheMesh([
            [0, -0.054],
            [0.055, -0.048],
            [0.061, -0.026],
            [0.057, -0.006],
            [0.062, 0.014],
            [0.058, 0.032],
            [0.061, 0.048],
            [0, 0.054]
          ], 20),
          1,
          0.44
        )
      );
      return finalizeHeroPartSpec([band], 7, 0.05, 0.25);
    }
    // Clenched martial-arts fist (`handL`, `handR`) with 4 curled finger rolls, knuckle ridge & tucked thumb
    const sx = id.endsWith("R") ? 1 : -1;
    const palm = subdivideSmoothMesh(bevelBoxMesh(0.092, 0.084, 0.094, 0.03), 1, 0.5);
    const handParts: RawMesh[] = [palm];
    for (let f = 0; f < 4; f += 1) {
      const fx = (f - 1.5) * 0.021;
      handParts.push(
        transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.022, 0.042, 0.046, 0.009), 1, 0.48), {
          pos: [fx, -0.026, -0.032], rot: [0.22, 0, 0]
        })
      );
    }
    handParts.push(
      transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.036, 0.058, 0.048, 0.016), 1, 0.5), {
        pos: [-sx * 0.044, 0.006, -0.028], rot: [0.28, 0, sx * 0.36]
      })
    );
    return finalizeHeroPartSpec(handParts, 4, 0.03, 0.25);
  });
}
