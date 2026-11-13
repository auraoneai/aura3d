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
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  sculptHumanoidLimbMesh,
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
export const MAT_PRAYER_SILK = unnamed(material.fabric({ color: "#ff7a6b", roughness: 0.76, sheen: 0.82, sheenColor: "#ffd8c4", sheenRoughness: 0.36 }));
export const MAT_INDIGO_SILK = unnamed(material.fabric({ color: "#38306e", roughness: 0.78, sheen: 0.75, sheenColor: "#8b82d6", sheenRoughness: 0.4 }));
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
  return { positions: [...mesh.positions], normals, uvs: [...mesh.uvs], indices: [...mesh.indices] };
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

function buildOniGuardianNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("oni", name, () => {
    const mats: AuraMaterialSpec[] = [
      MAT_ONI_SKIN, MAT_CRIMSON_ARMOR, MAT_INDIGO_SILK, MAT_FORGED_IRON,
      MAT_IMPERIAL_GOLD, MAT_PEARL_IVORY, MAT_DRAGON_EYE, MAT_DARK_SLATE
    ];
    const out: MultiMatSlot[] = [];
    for (const side of [-1, 1] as const) {
      out.push({ mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.38, 0.24, 0.58, 0.06), 1, 0.45), { pos: [side * 0.44, 0.12, 0.06] }), materialIndex: 7 });
      out.push({
        mesh: sculptHumanoidLimbMesh([
          [side * 0.44, 0.22, 0.02, 0.2],
          [side * 0.45, 0.65, 0.04, 0.24],
          [side * 0.42, 1.12, 0, 0.22]
        ], 12, 0.16),
        materialIndex: 3
      });
    }
    out.push({
      mesh: subdivideSmoothMesh(
        loftSectionsMesh([
          dragonRing(0, 0.92, 0, 0.78, 0.54, 0.06),
          dragonRing(0, 1.28, 0, 0.68, 0.48, 0.05),
          dragonRing(0, 1.56, 0, 0.62, 0.44, 0.05)
        ], true, false),
        1,
        0.5
      ),
      materialIndex: 2
    });
    out.push({ mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(1.32, 0.24, 0.94, 0.06), 1, 0.48), { pos: [0, 1.52, 0] }), materialIndex: 4 });
    out.push({
      mesh: smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            dragonRing(0, 1.56, 0, 0.6, 0.42, 0.08),
            dragonRing(0, 2.05, 0.04, 0.86, 0.56, 0.12),
            dragonRing(0, 2.48, 0, 0.74, 0.48, 0.1),
            dragonRing(0, 2.62, 0, 0.36, 0.32, 0.06)
          ], true, false),
          1,
          0.52
        )
      ),
      materialIndex: 1
    });
    for (const side of [-1, 1] as const) {
      out.push({ mesh: transformMesh(upturnedPagodaRoofMesh(0.48, 0.44, 0.36, 0.24), { pos: [side * 0.92, 2.28, 0], rot: [0, 0, -side * 0.35] }), materialIndex: 1 });
      out.push({
        mesh: sculptHumanoidLimbMesh([
          [side * 0.88, 2.26, 0, 0.22],
          [side * 0.98, 1.84, 0.26, 0.21],
          [side * 0.68, 1.64, 0.62, 0.18]
        ], 12, 0.2),
        materialIndex: 0
      });
      out.push({ mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.28, 0.36, 0.34, 0.06), 1, 0.48), { pos: [side * 0.76, 1.7, 0.48], rot: [0.5, 0, 0] }), materialIndex: 3 });
    }
    out.push({
      mesh: transformMesh(smoothWeldedNormals(subdivideSmoothMesh(icosphereFacetMesh(0.46, 1, 0.05, 19), 1, 0.52)), {
        pos: [0, 2.88, 0.06], scale: [1.02, 1.08, 0.98]
      }),
      materialIndex: 0
    });
    for (const side of [-1, 1] as const) {
      const horn = catmullRomSpline3([[side * 0.24, 3.12, 0.1], [side * 0.46, 3.32, 0.16], [side * 0.34, 3.48, 0.04]], 5)
        .map((p, k, a): V4 => [p[0], p[1], p[2], 0.125 * (1 - k / (a.length * 1.15))]);
      out.push({ mesh: smoothWeldedNormals(tubeSweepMesh(horn, 8, true)), materialIndex: 4 });
      out.push({ mesh: transformMesh(latheMesh([[0, 0], [0.06, 0.04], [0.01, 0.24]], 8), { pos: [side * 0.2, 2.72, 0.44], rot: [0.35, 0, -side * 0.15] }), materialIndex: 5 });
      out.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.08, 1, 0, 2)), { pos: [side * 0.18, 2.94, 0.46] }), materialIndex: 6 });
    }
    const clubProfile: V2[] = [[0, 0], [0.08, 0], [0.08, 0.7], [0.16, 0.95], [0.22, 1.95], [0.16, 2.25], [0, 2.3]];
    out.push({ mesh: transformMesh(latheMesh(clubProfile, 12), { pos: [-0.72, 1.42, 0.66], rot: [0.18, 0, -1.12] }), materialIndex: 3 });
    out.push({ mesh: transformMesh(latheMesh([[0, 0], [0.25, 0.08], [0.25, 0.18], [0, 0.24]], 10), { pos: [0.68, 2.1, 0.46], rot: [0.18, 0, -1.12] }), materialIndex: 4 });
    return { slots: out, mats };
  }, { id, castShadow: false, receiveShadow: true });
}

function buildSweeperCartNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  return mountMemoPooledMultiMat("sweeper", name, () => {
    const mats: AuraMaterialSpec[] = [
      MAT_DARK_SLATE, MAT_BURNISHED_BRONZE, MAT_FORGED_IRON, MAT_VERMILION_LACQUER,
      MAT_IMPERIAL_GOLD, MAT_AMBER_FLAME
    ];
    const slots: MultiMatSlot[] = [];
    for (const side of [-1, 1] as const) {
      for (const w of wheelAssemblySlots({ radius: 0.56, width: 0.24, spokeCount: 6, tireMat: 0, rimMat: 1, rotorMat: 2 })) {
        slots.push({ mesh: transformMesh(w.mesh, { pos: [side * 1.02, 0.56, 0] }), materialIndex: w.materialIndex });
      }
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.86, 0.54, 2.05, 0.08), { pos: [0, 0.76, 0] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(1.12, 1.18, 0.42, 0.22), { pos: [0, 1.02, -0.1] }), materialIndex: 3 });
    for (const sx of [-0.65, 0, 0.65] as const) {
      slots.push({
        mesh: transformMesh(extrudeStarPolygonMesh(6, 0.48, 0.22, 0.12, 0.02), { pos: [sx, 0.54, 1.15], rot: [0, Math.PI * 0.5, 0] }),
        materialIndex: 2
      });
    }
    for (const side of [-1, 1] as const) {
      slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 1.35, 0.16, 0.03), { pos: [side * 0.78, 1.66, -0.15] }), materialIndex: 1 });
    }
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.82, 0.16, 0.2, 0.03), { pos: [0, 2.34, -0.15] }), materialIndex: 4 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.08, 0.58, 0.08, 0.02), { pos: [0, 1.98, -0.15], rot: [0, 0, 0.22] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(extrudeStarPolygonMesh(8, 0.4, 0.24, 0.34, 0.04), { pos: [0.16, 1.62, -0.15] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.24, 1, 0, 8)), { pos: [0, 1.38, 1.02] }), materialIndex: 5 });
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
  return memoizeGeometry("ssr-soul-core-sculpted", () => {
    const profile: V2[] = [[0, -0.72], [0.52, -0.52], [0.76, -0.08], [0.64, 0.38], [0.28, 0.74], [0, 0.92]];
    return mergeRawMeshes([smoothWeldedNormals(latheMesh(profile, 18))]);
  });
}

export function soulTailSculptedSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("ssr-soul-tail-sculpted", () => {
    const pts = catmullRomSpline3([[0, -0.85, 0], [0.12, -0.2, 0.08], [-0.1, 0.35, -0.05], [0, 0.85, 0]], 5)
      .map((p, k, a): V4 => [p[0], p[1], p[2], 0.52 * (1 - (k / a.length) * 0.86)]);
    return mergeRawMeshes([smoothWeldedNormals(tubeSweepMesh(pts, 10, true))]);
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

function pleatedGiRing(y: number, rx: number, rz: number, pleats = 8, amp = 0.04, zBias = 0): V3[] {
  const segs = 16;
  const pts: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const fold = 1 + amp * Math.cos(a * pleats);
    pts.push([Math.cos(a) * rx * fold, y, Math.sin(a) * rz * fold + zBias]);
  }
  return pts;
}

/** Longitudinal cross-section ring of an arched martial-arts boot at foot coordinate `z` (+z heel, -z toe). */
function bootLastSlice(z: number, halfW: number, yBot: number, yTop: number, soleArch = 0): V3[] {
  const segs = 14;
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
 * Sculpted heroic-scale (~1.95 m) martial-arts sky-runner body part geometry (`HERO_PARTS`),
 * featuring V-tapered pleated `gi` tunic & ivory `collar`, contoured knotted `belt` & `beltTrim`,
 * rounded organic hip & baggy trousers, spiral-wrapped `shin` bindings, sleek arched martial-arts
 * `boot` + golden `bootTrim` welt/straps, anatomical limbs with `cuff` & `wrist` wraps, expressive
 * `head`/`eyes`, nape-wrapping `hairCap` + swept curved anime hair locks, and a knotted `headband`
 * streaming two continuous S-curved silk ribbons (`ribbonL`, `ribbonR`).
 */
export function skyRunnerPartSculptedSpec(id: string): AuraCustomGeometrySpec {
  return memoizeGeometry(`ssr-sky-runner-part-v2-${id}`, (): AuraCustomGeometrySpec => {
    if (id === "torso") {
      // Athletic V-tapered martial-arts gi tunic bodice + soft flared lower gi skirt hem below the obi
      const bodice = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            pleatedGiRing(-0.4, 0.185, 0.132, 8, 0.048, 0.008),
            pleatedGiRing(-0.33, 0.205, 0.148, 8, 0.052, 0.006),
            pleatedGiRing(-0.26, 0.172, 0.126, 8, 0.032),
            pleatedGiRing(-0.08, 0.206, 0.148, 6, 0.038, -0.004),
            pleatedGiRing(0.12, 0.252, 0.174, 6, 0.028, -0.008),
            pleatedGiRing(0.22, 0.224, 0.152, 6, 0.02),
            pleatedGiRing(0.275, 0.102, 0.092, 6, 0.012)
          ], true, false),
          1,
          0.52
        )
      );
      const lapelL = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.065, 0.34, 0.048, 0.018), 1, 0.48), {
        pos: [-0.058, 0.07, -0.156], rot: [0.06, 0.14, -0.26]
      });
      const lapelR = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.065, 0.34, 0.048, 0.018), 1, 0.48), {
        pos: [0.058, 0.07, -0.156], rot: [0.06, -0.14, 0.26]
      });
      const backCollar = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.19, 0.075, 0.055, 0.02), 1, 0.5), {
        pos: [0, 0.238, 0.106], rot: [-0.18, 0, 0]
      });
      return mergeRawMeshes([bodice, lapelL, lapelR, backCollar]);
    }
    if (id === "collar") {
      // Crisp warm-ivory inner martial-arts undershirt V-neck & nape collar trim
      const neckRing = transformMesh(
        smoothWeldedNormals(
          subdivideSmoothMesh(
            latheMesh([[0, -0.025], [0.095, -0.02], [0.106, 0.018], [0.088, 0.046], [0, 0.048]], 14),
            1,
            0.5
          )
        ),
        { pos: [0, 0.248, 0.005], scale: [1.02, 1, 0.92] }
      );
      const innerVL = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.046, 0.22, 0.036, 0.014), 1, 0.5), {
        pos: [-0.038, 0.135, -0.148], rot: [0.08, 0.1, -0.24]
      });
      const innerVR = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.046, 0.22, 0.036, 0.014), 1, 0.5), {
        pos: [0.038, 0.135, -0.148], rot: [0.08, -0.1, 0.24]
      });
      return mergeRawMeshes([neckRing, innerVL, innerVR]);
    }
    if (id === "pelvis") {
      // Closed, smooth, organic rounded martial-arts hip & bloused trouser seat (zero flat boxy bottom cap)
      const seat = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            pleatedGiRing(-0.155, 0.085, 0.072, 6, 0.02, 0.006),
            pleatedGiRing(-0.09, 0.186, 0.14, 8, 0.038, 0.012),
            pleatedGiRing(0.0, 0.204, 0.15, 8, 0.042, 0.01),
            pleatedGiRing(0.09, 0.188, 0.136, 8, 0.028, 0.004),
            pleatedGiRing(0.165, 0.156, 0.116, 8, 0.018)
          ], true, false),
          1,
          0.54
        )
      );
      return mergeRawMeshes([seat]);
    }
    if (id === "belt") {
      // Contoured elliptical double-wrapped martial-arts obi waist sash + front knot & draped sash ends
      const obi = smoothWeldedNormals(
        subdivideSmoothMesh(
          latheMesh([[0, -0.054], [0.205, -0.05], [0.222, -0.014], [0.214, 0.012], [0.222, 0.038], [0.202, 0.054], [0, 0.056]], 16),
          1,
          0.5
        )
      );
      const knot = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.098, 0.088, 0.072, 0.026), 1, 0.52), {
        pos: [0, -0.005, -0.165]
      });
      const tailL = catmullRomSpline3([[-0.022, -0.015, -0.17], [-0.068, -0.11, -0.175], [-0.092, -0.22, -0.155]], 4)
        .map((p, k, a): V4 => [p[0], p[1], p[2], 0.028 * (1 - (k / a.length) * 0.42)]);
      const tailR = catmullRomSpline3([[0.022, -0.015, -0.17], [0.064, -0.1, -0.172], [0.082, -0.195, -0.15]], 4)
        .map((p, k, a): V4 => [p[0], p[1], p[2], 0.027 * (1 - (k / a.length) * 0.42)]);
      const backFold = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.13, 0.082, 0.048, 0.018), 1, 0.52), {
        pos: [0, 0, 0.158]
      });
      return mergeRawMeshes([
        transformMesh(obi, { scale: [0.96, 1, 0.72] }),
        knot,
        backFold,
        smoothWeldedNormals(tubeSweepMesh(tailL, 8, false)),
        smoothWeldedNormals(tubeSweepMesh(tailR, 8, false))
      ]);
    }
    if (id === "beltTrim") {
      // Burnished gold obi clasp & rear waist ornament
      const frontClasp = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.056, 0.064, 0.044, 0.016), 1, 0.5), {
        pos: [0, -0.004, -0.184]
      });
      const backClasp = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.078, 0.052, 0.036, 0.014), 1, 0.5), {
        pos: [0, 0.002, 0.172]
      });
      return mergeRawMeshes([frontClasp, backClasp]);
    }
    if (id === "neck") {
      return mergeRawMeshes([
        sculptHumanoidLimbMesh([
          [0, -0.065, 0.006, 0.066],
          [0, 0, 0, 0.061],
          [0, 0.065, -0.004, 0.058]
        ], 12, 0.1)
      ]);
    }
    if (id === "head") {
      // Anatomical anime martial-artist head (`subdivideSmoothMesh`) with tapered jawline, nose bridge, brow & ears
      const skull = smoothWeldedNormals(
        subdivideSmoothMesh(
          latheMesh(
            [
              [0, -0.185],
              [0.095, -0.162],
              [0.162, -0.068],
              [0.186, 0.03],
              [0.178, 0.125],
              [0.116, 0.18],
              [0, 0.194]
            ],
            16
          ),
          1,
          0.52
        )
      );
      const chin = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.095, 0.075, 0.095, 0.032), 1, 0.54), {
        pos: [0, -0.135, -0.095], rot: [0.22, 0, 0]
      });
      const brow = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.205, 0.042, 0.065, 0.018), 1, 0.52), {
        pos: [0, 0.044, -0.156]
      });
      const nose = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.042, 0.074, 0.058, 0.018), 1, 0.52), {
        pos: [0, -0.01, -0.176], rot: [-0.18, 0, 0]
      });
      const earL = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.038, 0.084, 0.056, 0.018), 1, 0.52), { pos: [-0.174, 0.005, 0.01] });
      const earR = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.038, 0.084, 0.056, 0.018), 1, 0.52), { pos: [0.174, 0.005, 0.01] });
      return mergeRawMeshes([transformMesh(skull, { scale: [0.94, 1, 0.98] }), chin, brow, nose, earL, earR]);
    }
    if (id === "eyes") {
      // Expressive anime martial-artist eyes & angled determined brows on the -Z face
      const parts: RawMesh[] = [];
      for (const sx of [-1, 1] as const) {
        parts.push(
          transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.048, 0.028, 0.022, 0.008), 1, 0.48), {
            pos: [sx * 0.064, 0.018, -0.172], rot: [0, sx * 0.18, -sx * 0.08]
          })
        );
        parts.push(
          transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.064, 0.016, 0.024, 0.006), 1, 0.46), {
            pos: [sx * 0.066, 0.05, -0.174], rot: [0, sx * 0.18, -sx * 0.24]
          })
        );
      }
      return mergeRawMeshes(parts);
    }
    if (id === "headband") {
      // Snug forehead-to-occiput cloth headband + sculpted tied knot on the back of the head (+Z)
      const bandRing = (yOff: number, rScale: number): V3[] => {
        const pts: V3[] = [];
        for (let i = 0; i < 18; i += 1) {
          const a = (i / 18) * Math.PI * 2;
          const x = Math.cos(a) * 0.184 * rScale;
          const z = Math.sin(a) * 0.194 * rScale;
          const tiltY = 0.056 + yOff - 0.016 * Math.sin(a);
          pts.push([x, tiltY, z]);
        }
        return pts;
      };
      const band = smoothWeldedNormals(
        loftSectionsMesh([
          bandRing(-0.022, 0.985),
          bandRing(0, 1.015),
          bandRing(0.022, 0.98)
        ], true, false)
      );
      const knotCore = transformMesh(
        smoothWeldedNormals(subdivideSmoothMesh(icosphereFacetMesh(0.036, 1, 0.02, 7), 1, 0.52)),
        { pos: [0, 0.042, 0.196], scale: [1.18, 0.96, 0.92] }
      );
      const loopL = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.042, 0.032, 0.03, 0.012), 1, 0.52), {
        pos: [-0.03, 0.046, 0.194], rot: [0, -0.28, 0.26]
      });
      const loopR = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.042, 0.032, 0.03, 0.012), 1, 0.52), {
        pos: [0.03, 0.046, 0.194], rot: [0, 0.28, -0.26]
      });
      return mergeRawMeshes([band, knotCore, loopL, loopR]);
    }
    if (id === "ribbonL" || id === "ribbonR") {
      // Continuous, smooth, S-curved tapering cloth ribbon originating directly inside the headband knot ([0, 0, 0])
      const sx = id === "ribbonR" ? 1 : -1;
      const len = id === "ribbonR" ? 0.68 : 0.78;
      const spine = catmullRomSpline3(
        [
          [0, 0, 0],
          [sx * 0.034, -0.024, len * 0.22],
          [sx * 0.074, 0.022, len * 0.48],
          [sx * 0.04, -0.046, len * 0.75],
          [sx * 0.09, -0.018, len]
        ],
        4
      );
      const sections: V3[][] = spine.map((p, idx) => {
        const t = idx / Math.max(1, spine.length - 1);
        const hw = Math.max(0.0035, 0.028 * Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.88) + 0.009 * (1 - t));
        const ht = Math.max(0.0022, 0.0065 * (1 - t * 0.65));
        const bank = sx * 0.28 * Math.sin(t * Math.PI * 1.45);
        const cb = Math.cos(bank), sb = Math.sin(bank);
        const camber = 0.0045 * Math.sin(t * Math.PI * 2);
        const ring: V3[] = [];
        const segs = 10;
        for (let i = 0; i < segs; i += 1) {
          const a = (i / segs) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          const u = ca * hw;
          const v = sa * ht + camber * (1 - ca * ca);
          ring.push([p[0] + u * cb - v * sb, p[1] + u * sb + v * cb, p[2]]);
        }
        return ring;
      });
      return mergeRawMeshes([smoothWeldedNormals(loftSectionsMesh(sections, true, false), 1000)]);
    }
    if (id === "hairCap") {
      // Occiput-to-brow sculpted hair cap covering the full back of the skull/nape (+Z) while leaving the -Z face open
      const capRing = (yBase: number, rx: number, rz: number, backDrop: number): V3[] => {
        const pts: V3[] = [];
        for (let i = 0; i < 16; i += 1) {
          const a = (i / 16) * Math.PI * 2;
          const fold = 1 + 0.03 * Math.cos(a * 7);
          pts.push([
            Math.cos(a) * rx * fold,
            yBase - backDrop * Math.sin(a),
            Math.sin(a) * rz * fold + 0.008
          ]);
        }
        return pts;
      };
      const cap = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            capRing(-0.032, 0.168, 0.178, 0.105),
            capRing(0.026, 0.186, 0.195, 0.078),
            capRing(0.095, 0.188, 0.196, 0.042),
            capRing(0.155, 0.146, 0.154, 0.018),
            capRing(0.198, 0.045, 0.048, 0)
          ], true, false),
          1,
          0.52
        )
      );
      const parts: RawMesh[] = [cap];
      // Forehead & temple anime bangs (-Z)
      for (const [bx, by, bz, yaw, pitch] of [
        [-0.082, 0.082, -0.165, 0.26, -0.46],
        [-0.015, 0.088, -0.176, 0.04, -0.52],
        [0.058, 0.084, -0.17, -0.2, -0.48],
        [-0.158, 0.035, -0.075, 0.65, -0.28],
        [0.158, 0.035, -0.075, -0.65, -0.28]
      ] as const) {
        const bangPts = catmullRomSpline3([[0, 0.04, 0], [0, -0.035, -0.018], [0.008, -0.115, -0.035]], 4)
          .map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.006, 0.042 * (1 - (k / (a.length - 1)) * 0.88))]);
        parts.push(
          transformMesh(smoothWeldedNormals(subdivideSmoothMesh(tubeSweepMesh(bangPts, 8, false), 1, 0.46)), {
            pos: [bx, by, bz], rot: [pitch, yaw, 0]
          })
        );
      }
      // Layered swept nape hair locks (+Z) fanning out below the knotted headband so the back of the head is never bare
      for (const [nx, ny, nz, yaw, pitch] of [
        [-0.105, -0.055, 0.155, -0.42, 0.62],
        [-0.052, -0.072, 0.168, -0.18, 0.56],
        [0, -0.078, 0.172, 0, 0.52],
        [0.052, -0.072, 0.168, 0.18, 0.56],
        [0.105, -0.055, 0.155, 0.42, 0.62]
      ] as const) {
        const napePts = catmullRomSpline3([[0, 0.045, 0], [0, -0.045, 0.028], [0, -0.135, 0.072]], 4)
          .map((p, k, a): V4 => [p[0], p[1], p[2], Math.max(0.006, 0.048 * (1 - (k / (a.length - 1)) * 0.88))]);
        parts.push(
          transformMesh(smoothWeldedNormals(subdivideSmoothMesh(tubeSweepMesh(napePts, 8, false), 1, 0.46)), {
            pos: [nx, ny, nz], rot: [pitch, yaw, 0]
          })
        );
      }
      return mergeRawMeshes(parts);
    }
    if (id.startsWith("spike")) {
      // Curved, cambered, multi-layered anime hair lock (`loftSectionsMesh` along `catmullRomSpline3` — zero raw cones)
      const idx = Number(id.replace("spike", "")) || 0;
      const flair = 0.94 + (idx % 3) * 0.09;
      const curveSign = idx % 2 === 0 ? 1 : -1;
      const spine = catmullRomSpline3(
        [
          [0, -0.145, 0],
          [curveSign * 0.012, -0.03, 0.018],
          [curveSign * 0.026, 0.085 * flair, 0.052],
          [curveSign * 0.042, 0.2 * flair, 0.105]
        ],
        4
      );
      const lockSections: V3[][] = spine.map((p, k) => {
        const t = k / Math.max(1, spine.length - 1);
        const taper = Math.max(0.05, 1 - Math.pow(t, 1.35) * 0.94);
        const rx = 0.078 * taper;
        const rz = 0.058 * taper;
        const ring: V3[] = [];
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2;
          const ridge = 1 + 0.18 * Math.cos(a * 3);
          ring.push([p[0] + Math.cos(a) * rx * ridge, p[1], p[2] + Math.sin(a) * rz * ridge]);
        }
        return ring;
      });
      const barbPts = catmullRomSpline3(
        [
          [curveSign * 0.014, -0.075, 0.01],
          [curveSign * 0.052, 0.015, 0.036],
          [curveSign * 0.086, 0.105, 0.074]
        ],
        4
      ).map((p, k, a): V4 => {
        const t = k / Math.max(1, a.length - 1);
        return [p[0], p[1], p[2], Math.max(0.005, 0.044 * (1 - t * t * 0.92))];
      });
      return mergeRawMeshes([
        smoothWeldedNormals(subdivideSmoothMesh(loftSectionsMesh(lockSections, true, false), 1, 0.46)),
        smoothWeldedNormals(subdivideSmoothMesh(tubeSweepMesh(barbPts, 8, false), 1, 0.46))
      ]);
    }
    if (id.startsWith("thigh")) {
      // Baggy bloused martial-arts gi trousers with soft cloth pleats gathering into the knee cuff
      const sx = id.endsWith("R") ? 1 : -1;
      const trouser = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            pleatedGiRing(-0.22, 0.082, 0.082, 7, 0.025),
            pleatedGiRing(-0.14, 0.128, 0.124, 7, 0.052, 0.006),
            pleatedGiRing(-0.02, 0.132, 0.126, 7, 0.048, sx * 0.004),
            pleatedGiRing(0.11, 0.118, 0.114, 7, 0.036),
            pleatedGiRing(0.215, 0.098, 0.096, 6, 0.02)
          ], true, false),
          1,
          0.48
        )
      );
      return mergeRawMeshes([trouser]);
    }
    if (id.startsWith("shin")) {
      // Crisscross cloth-wrapped martial-arts calf bindings (`kyahan`) tapering cleanly to the ankle
      const sx = id.endsWith("R") ? 1 : -1;
      const calfCore = sculptHumanoidLimbMesh([
        [0, 0.205, 0, 0.078],
        [sx * 0.005, 0.075, 0.01, 0.086],
        [0, -0.055, 0.004, 0.068],
        [0, -0.205, 0, 0.055]
      ], 12, 0.15);
      const parts: RawMesh[] = [calfCore];
      for (const [wy, wr, tiltSign] of [
        [0.11, 0.084, 1],
        [0.02, 0.079, -1],
        [-0.07, 0.069, 1],
        [-0.15, 0.061, -1]
      ] as const) {
        parts.push(
          transformMesh(
            smoothWeldedNormals(latheMesh([[0, -0.018], [wr, -0.015], [wr + 0.005, 0], [wr, 0.015], [0, 0.018]], 12)),
            { pos: [0, wy, 0.003], rot: [0.08 * tiltSign, 0, sx * 0.1 * tiltSign] }
          )
        );
      }
      return mergeRawMeshes(parts);
    }
    if (id.startsWith("bootTrim")) {
      // Golden martial-arts boot welt, arched sole contour, crossed ankle straps & vertical heel trim stripe
      const weltPts = catmullRomSpline3(
        [
          [0, -0.054, 0.108],
          [0.048, -0.056, 0.068],
          [0.042, -0.044, -0.005],
          [0.056, -0.056, -0.095],
          [0.036, -0.05, -0.168],
          [0, -0.044, -0.188],
          [-0.036, -0.05, -0.168],
          [-0.056, -0.056, -0.095],
          [-0.042, -0.044, -0.005],
          [-0.048, -0.056, 0.068]
        ],
        3,
        true
      ).map((p): V4 => [p[0], p[1], p[2], 0.0085]);
      const strapInstep = catmullRomSpline3(
        [
          [-0.052, -0.046, -0.045],
          [-0.046, 0.018, -0.02],
          [0, 0.042, 0.002],
          [0.046, 0.018, -0.02],
          [0.052, -0.046, -0.045]
        ],
        4
      ).map((p): V4 => [p[0], p[1], p[2], 0.008]);
      const ankleBand = transformMesh(
        smoothWeldedNormals(latheMesh([[0, -0.012], [0.064, -0.01], [0.068, 0], [0.064, 0.01], [0, 0.012]], 14)),
        { pos: [0, 0.068, 0.052], rot: [0.08, 0, 0] }
      );
      const heelStripe = catmullRomSpline3(
        [[0, -0.05, 0.106], [0, 0.015, 0.108], [0, 0.082, 0.098]],
        4
      ).map((p): V4 => [p[0], p[1], p[2], 0.009]);
      return mergeRawMeshes([
        smoothWeldedNormals(tubeSweepMesh(weltPts, 6, false)),
        smoothWeldedNormals(tubeSweepMesh(strapInstep, 6, false)),
        ankleBand,
        smoothWeldedNormals(tubeSweepMesh(heelStripe, 6, false))
      ]);
    }
    if (id.startsWith("boot")) {
      // Organic sculpted martial-arts boot lofted along an hourglass arched shoe last with rounded toe box & ankle cuff
      const shoeBody = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            bootLastSlice(0.11, 0.024, -0.048, 0.022, 0),
            bootLastSlice(0.082, 0.047, -0.064, 0.046, 0.002),
            bootLastSlice(0.035, 0.044, -0.06, 0.052, 0.008),
            bootLastSlice(-0.01, 0.04, -0.048, 0.042, 0.014),
            bootLastSlice(-0.065, 0.053, -0.064, 0.028, 0.004),
            bootLastSlice(-0.125, 0.055, -0.063, 0.014, 0.002),
            bootLastSlice(-0.168, 0.038, -0.052, 0.0, 0),
            bootLastSlice(-0.188, 0.016, -0.04, -0.012, 0)
          ], true, false),
          1,
          0.5
        )
      );
      const ankleShaft = transformMesh(
        smoothWeldedNormals(
          subdivideSmoothMesh(
            latheMesh([[0, -0.035], [0.056, -0.03], [0.061, 0.015], [0.065, 0.048], [0, 0.05]], 14),
            1,
            0.48
          )
        ),
        { pos: [0, 0.045, 0.052], rot: [0.08, 0, 0] }
      );
      return mergeRawMeshes([shoeBody, ankleShaft]);
    }
    if (id.startsWith("cuff")) {
      // Tailored martial-arts gi shoulder sleeve cuff draped over the upper deltoid
      const sleeve = smoothWeldedNormals(
        subdivideSmoothMesh(
          loftSectionsMesh([
            pleatedGiRing(-0.048, 0.094, 0.09, 6, 0.045),
            pleatedGiRing(0.0, 0.098, 0.094, 6, 0.035),
            pleatedGiRing(0.052, 0.084, 0.082, 6, 0.02)
          ], true, false),
          1,
          0.5
        )
      );
      return mergeRawMeshes([sleeve]);
    }
    if (id.startsWith("upper")) {
      // Anatomical deltoid, bicep & tricep upper arm (`sculptHumanoidLimbMesh`)
      const sx = id.endsWith("R") ? 1 : -1;
      const arm = smoothWeldedNormals(
        subdivideSmoothMesh(
          sculptHumanoidLimbMesh([
            [0, 0.155, 0, 0.078],
            [sx * 0.008, 0.055, -0.008, 0.082],
            [sx * 0.004, -0.055, -0.006, 0.073],
            [0, -0.155, 0, 0.058]
          ], 12, 0.2),
          1,
          0.44
        )
      );
      return mergeRawMeshes([arm]);
    }
    if (id.startsWith("fore")) {
      // Sculpted forearm muscle taper from elbow brachioradialis down to wrist
      const sx = id.endsWith("R") ? 1 : -1;
      const fore = smoothWeldedNormals(
        subdivideSmoothMesh(
          sculptHumanoidLimbMesh([
            [0, 0.15, 0, 0.06],
            [sx * 0.006, 0.065, -0.006, 0.068],
            [0, -0.045, 0, 0.055],
            [0, -0.15, 0, 0.046]
          ], 12, 0.16),
          1,
          0.44
        )
      );
      return mergeRawMeshes([fore]);
    }
    if (id.startsWith("wrist")) {
      // Contrasting wrapped martial-arts cloth wristband bracer
      const band = smoothWeldedNormals(
        subdivideSmoothMesh(
          latheMesh([
            [0, -0.05],
            [0.054, -0.046],
            [0.059, -0.018],
            [0.056, 0],
            [0.061, 0.02],
            [0.058, 0.046],
            [0, 0.05]
          ], 14),
          1,
          0.48
        )
      );
      return mergeRawMeshes([band]);
    }
    // Clenched martial-arts fist (`handL`, `handR`) with sculpted finger-knuckle ridge & tucked thumb
    const sx = id.endsWith("R") ? 1 : -1;
    const fist = subdivideSmoothMesh(bevelBoxMesh(0.094, 0.09, 0.1, 0.032), 1, 0.52);
    const knuckles = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.088, 0.036, 0.045, 0.014), 1, 0.5), {
      pos: [0, -0.022, -0.034]
    });
    const thumb = transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.038, 0.058, 0.048, 0.016), 1, 0.52), {
      pos: [-sx * 0.044, 0.008, -0.026], rot: [0.25, 0, sx * 0.35]
    });
    return mergeRawMeshes([fist, knuckles, thumb]);
  });
}
