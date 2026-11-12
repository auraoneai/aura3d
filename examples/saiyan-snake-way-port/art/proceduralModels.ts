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
  type AuraGroupNode,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  geometry,
  group,
  material
} from "@aura3d/engine";
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
  mergeRawMeshes,
  stratifiedCliffMesh,
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
export const MAT_VERMILION_LACQUER = unnamed(material.lacquer({ color: "#c9302c", roughness: 0.14, clearcoat: 0.94, clearcoatRoughness: 0.06 }));
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
export const MAT_CLOUD_FOLIAGE = unnamed(material.pbr({ color: "#3b8c66", roughness: 0.68, metalness: 0.02 }));
export const MAT_GOLDEN_CANOPY = unnamed(material.pbr({ color: "#e6a63e", roughness: 0.62, metalness: 0.04 }));
export const MAT_BLOSSOM_CANOPY = unnamed(material.pbr({ color: "#f28da8", roughness: 0.64, metalness: 0.02 }));
export const MAT_CUMULUS_TUFT = unnamed(material.pbr({ color: "#fff1df", roughness: 0.9, metalness: 0.0, emissive: "#ffd5a6", emissiveIntensity: 0.08 }));
export const MAT_SANCTUARY_TURF = unnamed(material.pbr({ color: "#58b86c", roughness: 0.82, metalness: 0.02 }));
export const MAT_ROAST_GLAZE = unnamed(material.clearcoatPaint({ color: "#c96d28", roughness: 0.24, clearcoat: 0.8, clearcoatRoughness: 0.12 }));

/** Translucent physical crystal / shoji pane (safe WebGPU path: opacity 0.50, clearcoat 1, ior 1.55, castShadow false). */
export const MAT_SPIRIT_GLASS = unnamed(material.physical({ color: "#ffe9a8", roughness: 0.05, opacity: 0.5, clearcoat: 1, ior: 1.55 }));
export const MAT_JADE_CRYSTAL = unnamed(material.physical({ color: "#98f5dc", roughness: 0.06, opacity: 0.5, clearcoat: 1, ior: 1.55 }));

/** Practical emissive accents (`practical: true` whenever `emissiveIntensity > 0.1`). */
export const MAT_AMBER_FLAME = unnamed(material.emissive({ color: "#ffe6a3", emissive: "#ffb84d", emissiveIntensity: 2.2, practical: true }));
export const MAT_DRAGON_EYE = unnamed(material.emissive({ color: "#fff2b8", emissive: "#ff9d2e", emissiveIntensity: 2.6, practical: true }));
export const MAT_JADE_WARD_GLOW = unnamed(material.emissive({ color: "#d8fff0", emissive: "#64ebb9", emissiveIntensity: 1.9, practical: true }));

/** Batched instanced dorsal spine fin material (`clearcoat: 0, sheen: 0` per >16 instance batch rule). */
export const MAT_INSTANCED_DORSAL_SPINE = unnamed(material.metal({ color: "#eab64d", roughness: 0.28, metalness: 0.88, clearcoat: 0, sheen: 0 }));

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

/**
 * Colossal 130 m carved jade-and-gold celestial dragon head (`serpent-head`) rising from the cloud sea:
 * smooth S-curved scaled neck, upper snout & hinged jaw (`loftSectionsMesh`), swept imperial antlers &
 * whiskers (`tubeSweepMesh`), ivory fangs, blazing amber eyes, and levitating spirit pearl.
 */
export function buildColossalSerpentHeadNode(id = "serpent-head", name = "serpent-head"): AuraNodeBuilder<AuraGroupNode> {
  const mats: AuraMaterialSpec[] = [
    MAT_EMERALD_SCALE, MAT_CELADON_JADE, MAT_PEARL_IVORY,
    MAT_IMPERIAL_GOLD, MAT_VERMILION_LACQUER, MAT_DRAGON_EYE, MAT_AMBER_FLAME
  ];
  const slots: MultiMatSlot[] = [];

  // Sinuous S-curve neck rising from y = -32 to y = +54
  const neckWaypoints: readonly [number, number, number, number, number][] = [
    [0, -32, -26, 15.5, 14.5], [0, -16, -21, 14.2, 13.4], [0, 0, -14, 12.8, 12.2],
    [0, 18, -7, 11.6, 11.2], [0, 35, -3, 10.8, 10.4], [0, 50, -6, 10.2, 9.8], [0, 58, 0, 11.4, 10.2]
  ];
  slots.push({
    mesh: smoothWeldedNormals(loftSectionsMesh(neckWaypoints.map(([x, y, z, rx, ry]) => dragonRing(x, y, z, rx, ry, 0.22)), true, false)),
    materialIndex: 0
  });

  // Pearl-jade belly plates & dorsal golden spine fins along the neck
  for (let i = 0; i < neckWaypoints.length - 1; i += 1) {
    const [, y, z, rx, ry] = neckWaypoints[i]!;
    slots.push({
      mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(1, 1, 0.04, 31 + i)), {
        pos: [0, y + 2, z + ry * 0.78], scale: [rx * 0.72, 4.8, 3.2]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(curvedDragonFinMesh(2.6, 11.5 - i * 0.6, 7.5, -0.8), {
        pos: [0, y + 4, z - ry * 0.88], rot: [-0.32, 0, 0]
      }),
      materialIndex: 3
    });
  }

  // Sculpted upper cranium, brow ridges & flared dragon snout (+Z forward)
  const snoutRings: V3[][] = [
    dragonRing(0, 61, -4, 12.5, 9.6, 0.25),
    dragonRing(0, 64, 8, 13.2, 8.8, 0.28),
    dragonRing(0, 63, 21, 10.4, 6.8, 0.2),
    dragonRing(0, 61.5, 34, 8.6, 5.4, 0.24),
    dragonRing(0, 62.5, 43, 9.2, 5.8, 0.3),
    dragonRing(0, 61.2, 47, 4.8, 3.2, 0.15)
  ];
  slots.push({ mesh: smoothWeldedNormals(loftSectionsMesh(snoutRings, true, false)), materialIndex: 1 });

  // Hinged lower jaw opening beneath the levitating spirit pearl
  const jawRings: V3[][] = [
    dragonRing(0, 52, -1, 10.2, 5.6, 0.1),
    dragonRing(0, 49.5, 12, 9.2, 4.6, 0.08),
    dragonRing(0, 46.5, 26, 7.2, 3.6, 0.08),
    dragonRing(0, 45.2, 38, 5.4, 2.8, 0.12),
    dragonRing(0, 46.0, 42, 2.8, 1.8, 0.1)
  ];
  slots.push({ mesh: smoothWeldedNormals(loftSectionsMesh(jawRings, true, false)), materialIndex: 0 });
  slots.push({
    mesh: smoothWeldedNormals(loftSectionsMesh([
      dragonRing(0, 54.5, 6, 7.8, 2.4, 0.05),
      dragonRing(0, 51.5, 22, 6.0, 2.0, 0.05),
      dragonRing(0, 48.5, 35, 3.8, 1.4, 0.05)
    ], true, false)),
    materialIndex: 4
  });

  // Flared jade cheek frills, blazing amber eyes, swept gold stag-horns, flowing whiskers & fangs
  const frillPoly: V2[] = [[0, -5], [9, -7], [15, -2], [13, 5], [16, 11], [7, 9], [0, 5]];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(frillPoly, 1.8, 0.35, true), {
        pos: [side * 10.5, 60, 4], rot: [0, side * -0.58, side * 0.14], scale: [side, 1, 1]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(2.6, 2, 0, 5)), {
        pos: [side * 9.4, 65.2, 14.5], scale: [0.85, 0.95, 1.35]
      }),
      materialIndex: 5
    });
    // Sweeping imperial gold stag-antler + secondary tine
    const hornPts = catmullRomSpline3([
      [side * 6.8, 69, 6], [side * 11.5, 79, -4], [side * 15.5, 89, -15], [side * 12.5, 98, -26]
    ], 8).map((p, k, a): V4 => [p[0], p[1], p[2], 2.6 * (1 - (k / a.length) * 0.82)]);
    const tinePts = catmullRomSpline3([
      [side * 11.2, 78, -3], [side * 17.5, 84, 3], [side * 20.5, 91, 0]
    ], 5).map((p, k, a): V4 => [p[0], p[1], p[2], 1.45 * (1 - (k / a.length) * 0.8)]);
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(hornPts, 12, true)), materialIndex: 3 });
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(tinePts, 10, true)), materialIndex: 3 });

    // Flowing S-curve celestial whiskers from snout bridge
    const whiskerPts = catmullRomSpline3([
      [side * 6.6, 61.5, 39], [side * 15, 59, 44], [side * 23, 52, 34], [side * 28, 46, 20], [side * 25, 42, 6]
    ], 7).map((p, k, a): V4 => [p[0], p[1], p[2], 0.95 * (1 - (k / a.length) * 0.82)]);
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(whiskerPts, 10, true)), materialIndex: 3 });

    // Upper & lower curved pearl-ivory fangs
    for (let f = 0; f < 4; f += 1) {
      const zf = 18 + f * 6.2;
      const fangLen = f === 3 ? 5.6 : 3.4;
      const fangMesh = smoothWeldedNormals(latheMesh([[0, 0], [0.95, 0.2], [0.72, fangLen * 0.55], [0.06, fangLen]], 12));
      slots.push({ mesh: transformMesh(fangMesh, { pos: [side * (7.8 - f * 0.65), 58.2, zf], rot: [Math.PI, 0, side * 0.1] }), materialIndex: 2 });
      slots.push({ mesh: transformMesh(fangMesh, { pos: [side * (6.2 - f * 0.55), 48.2, zf - 1.5], rot: [0, 0, -side * 0.08], scale: 0.82 }), materialIndex: 2 });
    }
  }

  // Levitating spirit pearl core between jaws + translucent jade/amber aura shell (castShadow: false)
  slots.push({
    mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(3.4, 2, 0, 9)), { pos: [0, 53.8, 35.5] }),
    materialIndex: 6
  });
  const solidNode = geometry.multiMaterial(buildGroupedGeometrySpec(slots), mats, {
    name: `${name}-body`, castShadow: false, receiveShadow: false
  });
  const pearlShellSpec = mergeRawMeshes([
    transformMesh(smoothWeldedNormals(icosphereFacetMesh(5.2, 2, 0, 12)), { pos: [0, 53.8, 35.5] })
  ]);
  const pearlShell = geometry.custom(pearlShellSpec, {
    name: `${name}-pearl-shell`, material: MAT_SPIRIT_GLASS, castShadow: false, receiveShadow: false
  });
  return group(name, [solidNode, pearlShell], { position: [0, -500, 0] }).runtime({ id });
}

/* ------------------------------------------------------------------ 2. Gatehouse, Coiled Tail & Dorsal Spines */

/** Colossal check-in serpent gatehouse spanning the starting viaduct (`x = +-6.8 m`, clear arch `y = 8.8 m`). */
export function buildSerpentGatehouseNode(id = "serpent-gatehouse", name = "serpent-gatehouse"): AuraNodeBuilder<AuraGroupNode> {
  const mats: AuraMaterialSpec[] = [
    MAT_TEMPLE_GRANITE, MAT_DARK_SLATE, MAT_VERMILION_LACQUER, MAT_INDIGO_LACQUER,
    MAT_IMPERIAL_GOLD, MAT_CELADON_JADE, MAT_PRAYER_SILK, MAT_AMBER_FLAME
  ];
  const slots: MultiMatSlot[] = [];
  for (const side of [-1, 1] as const) {
    const px = side * 6.8;
    slots.push({ mesh: transformMesh(bevelBoxMesh(3.2, 2.2, 3.6, 0.18), { pos: [px, 1.1, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [1.05, 0], [0.92, 0.8], [0.76, 11.2], [0.95, 11.8], [0, 11.8]], 18), { pos: [px, 2.1, 0] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.62, 0], [0.54, 8.6], [0, 8.6]], 14), { pos: [side * 10.2, 1.8, 0] }), materialIndex: 2 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(2.4, 1.6, 2.8, 0.14), { pos: [side * 10.2, 0.9, 0] }), materialIndex: 0 });
    // Coiled jade guardian serpent spiraling up each main column
    const coilPts: V4[] = [];
    for (let k = 0; k <= 24; k += 1) {
      const t = k / 24, ang = t * Math.PI * 5 * side;
      coilPts.push([px + Math.cos(ang) * 1.18, 2.6 + t * 9.8, Math.sin(ang) * 1.18, 0.42 * (1 - t * 0.35)]);
    }
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(coilPts, 10, true)), materialIndex: 5 });
    // Silk prayer banner + hanging lantern core
    slots.push({ mesh: transformMesh(bevelBoxMesh(1.1, 4.4, 0.08, 0.03), { pos: [side * 8.5, 7.2, 0.4] }), materialIndex: 6 });
    slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.48, 1, 0, 3)), { pos: [side * 8.5, 10.4, 1.2] }), materialIndex: 7 });
  }
  // Overhead masonry arch + tie beams + 2-tier upturned palace roofs + gilded ridge finials
  for (const s of archwayVoussoirSlots({ radius: 5.4, thickness: 1.05, depth: 1.8, voussoirs: 11, stoneMatA: 0, stoneMatB: 1, keystoneMat: 4 })) {
    slots.push({ mesh: transformMesh(s.mesh, { pos: [0, 8.9, 0], scale: [1.08, 0.52, 1] }), materialIndex: s.materialIndex });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(22.4, 0.75, 1.5, 0.1), { pos: [0, 10.8, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(17.2, 0.85, 1.7, 0.12), { pos: [0, 13.6, 0] }), materialIndex: 4 });
  slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(12.6, 3.8, 3.2, 0.26), { pos: [0, 14.0, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(11.6, 2.8, 3.4, 0.14), { pos: [0, 17.8, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(3.2, 2.1, 0.35, 0.08), { pos: [0, 15.2, 1.9] }), materialIndex: 4 });
  slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(8.8, 3.2, 3.4, 0.3), { pos: [0, 19.2, 0] }), materialIndex: 3 });
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: transformMesh(curvedDragonFinMesh(0.7, 2.4, 1.8, side * 0.7), { pos: [side * 6.8, 22.1, 0], rot: [0, Math.PI * 0.5, 0] }), materialIndex: 4 });
  }
  return assembleMultiMaterialNode(name, slots, mats, { id, position: [0, -500, 0], castShadow: false, receiveShadow: true });
}

/** Coiled jade-and-gold serpent tail monument (`serpent-tail-monument`) crowning the end of the viaduct. */
export function buildCoiledTailMonumentNode(id = "serpent-tail-monument", name = "serpent-tail-monument"): AuraNodeBuilder<AuraGroupNode> {
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
  return assembleMultiMaterialNode(name, slots, mats, { id, position: [0, -500, 0], castShadow: false, receiveShadow: false });
}

/** Smooth curved dorsal spine fin spec (`instances.custom` along both serpentine viaduct balustrades). */
export function dorsalSpineFinSpec(): AuraCustomGeometrySpec {
  const collar = bevelBoxMesh(0.68, 0.28, 1.65, 0.06);
  const fin = transformMesh(curvedDragonFinMesh(0.46, 1.72, 1.55, 0.82), { pos: [0, 0.18, 0] });
  return mergeRawMeshes([collar, fin]);
}

/* ------------------------------------------------------------------ 3. Floating Sky Islands & Sanctuary Planetlet */

export type SkyIslandVariantKey = "island" | "spireA" | "spireB" | "spireC";

/**
 * Floating celestial crag & cloud island (`island-0..5`), authored at exact `targetHeight` in metres
 * with stratified rock undercroft (`strataSkyCragMaterial`), smooth cumulus cloud wreath, and
 * variant-specific East Asian temple / pagoda / bonsai architecture.
 */
export function buildSkyIslandVariantNode(
  variant: SkyIslandVariantKey,
  targetHeight: number,
  id: string,
  name = id,
  castShadow = false
): AuraNodeBuilder<AuraGroupNode> {
  const s = targetHeight / (variant === "spireC" ? 22 : variant === "spireB" ? 15 : variant === "spireA" ? 14 : 15);
  const warmRock = variant === "spireB";
  const mats: AuraMaterialSpec[] = [
    strataSkyCragMaterial(warmRock), MAT_CUMULUS_TUFT, MAT_SANCTUARY_TURF, MAT_VERMILION_LACQUER,
    MAT_INDIGO_LACQUER, MAT_IMPERIAL_GOLD, MAT_CEDAR_WOOD, MAT_CLOUD_FOLIAGE,
    MAT_GOLDEN_CANOPY, MAT_TEMPLE_GRANITE, MAT_AMBER_FLAME
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

  if (variant === "spireC") {
    // Tall 3-tier vermilion-and-indigo sky pagoda (total height ~22 m)
    slots.push({ mesh: transformMesh(bevelBoxMesh(5.6 * s, 1.1 * s, 5.6 * s, 0.12 * s), { pos: [0, 1.4 * s, 0] }), materialIndex: 9 });
    for (let tier = 0; tier < 3; tier += 1) {
      const w = (4.4 - tier * 0.85) * s;
      const y0 = (2.0 + tier * 3.8) * s;
      slots.push({ mesh: transformMesh(bevelBoxMesh(w, 2.5 * s, w, 0.1 * s), { pos: [0, y0 + 1.25 * s, 0] }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(bevelBoxMesh(w * 0.52, 1.3 * s, w + 0.14 * s, 0.04 * s), { pos: [0, y0 + 1.25 * s, 0] }), materialIndex: 10 });
      slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(w * 0.82, w * 0.82, 1.85 * s, 0.3), { pos: [0, y0 + 2.4 * s, 0] }), materialIndex: 4 });
    }
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.42 * s, 0], [0.26 * s, 1.8 * s], [0.44 * s, 2.1 * s], [0.08 * s, 4.2 * s], [0, 4.4 * s]], 14), { pos: [0, 13.4 * s, 0] }), materialIndex: 5 });
  } else if (variant === "spireB") {
    // Twisted crimson rock spire + cedar arch bridge + hanging spirit lanterns
    slots.push({
      mesh: stratifiedCliffMesh({ radiusX: 2.8 * s, radiusZ: 2.5 * s, height: 8.4 * s, terraces: 6, seed: 53 }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(stratifiedCliffMesh({ radiusX: 1.7 * s, radiusZ: 1.6 * s, height: 5.4 * s, terraces: 4, seed: 71 }), { pos: [3.6 * s, 0.6 * s, 1.2 * s] }),
      materialIndex: 0
    });
    const bridgePts = catmullRomSpline3([[-0.6 * s, 4.2 * s, 0], [1.6 * s, 5.1 * s, 0.6 * s], [3.5 * s, 4.4 * s, 1.1 * s]], 6)
      .map((p): V4 => [p[0], p[1], p[2], 0.42 * s]);
    slots.push({ mesh: tubeSweepMesh(bridgePts, 8, true), materialIndex: 6 });
    for (const lx of [-1.8, 1.9, 3.6] as const) {
      slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.52 * s, 1, 0, 7)), { pos: [lx * s, 4.8 * s, 1.3 * s] }), materialIndex: 10 });
    }
    slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(1.9 * s, 1.9 * s, 1.5 * s, 0.28), { pos: [0, 8.6 * s, 0] }), materialIndex: 3 });
  } else if (variant === "spireA") {
    // 4-tier imperial pavilion flanked by golden canopy & emerald pine bough trees
    for (let tier = 0; tier < 4; tier += 1) {
      const w = (3.6 - tier * 0.58) * s;
      const y0 = (1.0 + tier * 1.95) * s;
      slots.push({ mesh: transformMesh(bevelBoxMesh(w, 1.25 * s, w, 0.08 * s), { pos: [0, y0 + 0.62 * s, 0] }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(w * 0.78, w * 0.78, 1.05 * s, 0.26), { pos: [0, y0 + 1.2 * s, 0] }), materialIndex: 4 });
    }
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.28 * s, 0], [0.06 * s, 2.2 * s], [0, 2.3 * s]], 12), { pos: [0, 8.9 * s, 0] }), materialIndex: 5 });
    for (const side of [-1, 1] as const) {
      const trunk = catmullRomSpline3([[side * 3.4 * s, 0.8 * s, 1.4 * s], [side * 4.1 * s, 2.2 * s, 1.6 * s], [side * 3.8 * s, 3.4 * s, 1.2 * s]], 5)
        .map((p, k, a): V4 => [p[0], p[1], p[2], 0.34 * s * (1 - k / (a.length * 1.5))]);
      slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(trunk, 8, true)), materialIndex: 6 });
      slots.push({
        mesh: transformMesh(smoothWeldedNormals(layeredCanopyMesh({ radius: 1.9 * s, height: 1.8 * s, puffs: 8, seed: 20 + side }), 400), {
          pos: [side * 3.8 * s, 3.1 * s, 1.2 * s]
        }),
        materialIndex: side > 0 ? 8 : 7
      });
    }
    slots.push({
      mesh: transformMesh(coniferBoughTierMesh({ baseRadius: 1.5 * s, height: 3.6 * s, tiers: 5, seed: 33 }), { pos: [0, 0.9 * s, -3.5 * s] }),
      materialIndex: 7
    });
  } else {
    // Classic jade sky-island with stone lantern & windswept cloud-pine bonsai
    const trunkPts = catmullRomSpline3([[-0.8 * s, 0.8 * s, 0], [-2.1 * s, 2.8 * s, 0.5 * s], [-0.4 * s, 4.8 * s, -0.3 * s], [1.2 * s, 5.8 * s, 0.2 * s]], 6)
      .map((p, k, a): V4 => [p[0], p[1], p[2], 0.58 * s * (1 - (k / a.length) * 0.68)]);
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(trunkPts, 10, true)), materialIndex: 6 });
    slots.push({
      mesh: transformMesh(smoothWeldedNormals(layeredCanopyMesh({ radius: 3.1 * s, height: 2.6 * s, puffs: 9, seed: 44 }), 400), {
        pos: [0.9 * s, 5.4 * s, 0.2 * s]
      }),
      materialIndex: 7
    });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.75 * s, 0], [0.42 * s, 1.8 * s], [0.8 * s, 2.1 * s], [0, 2.8 * s]], 12), { pos: [2.8 * s, 0.9 * s, 1.8 * s] }), materialIndex: 9 });
    slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.42 * s, 1, 0, 11)), { pos: [2.8 * s, 2.3 * s, 1.8 * s] }), materialIndex: 10 });
  }

  return assembleMultiMaterialNode(name, slots, mats, {
    id, position: [0, -500, 0], castShadow, receiveShadow: !castShadow ? false : true
  });
}

/**
 * Distant floating sanctuary planetlet (`sanctuary-planetlet`) beyond the tail leap:
 * smooth spherical meadow world, curved-dome sanctuary cottage, bonsai tree, and cumulus halo.
 */
export function buildSanctuaryPlanetletNode(id = "sanctuary-planetlet", name = "sanctuary-planetlet"): AuraNodeBuilder<AuraGroupNode> {
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
  // Gnarled sanctuary bonsai tree on the eastern crown
  const bonsaiTrunk = catmullRomSpline3([[3.8, R - 0.8, 0.6], [5.8, R + 2.8, 1.2], [4.4, R + 6.2, -0.4], [6.2, R + 8.4, 0.4]], 6)
    .map((p, k, a): V4 => [p[0], p[1], p[2], 0.95 * (1 - (k / a.length) * 0.65)]);
  slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(bonsaiTrunk, 10, true)), materialIndex: 4 });
  slots.push({
    mesh: transformMesh(smoothWeldedNormals(layeredCanopyMesh({ radius: 4.4, height: 3.4, puffs: 9, seed: 61 }), 400), { pos: [5.6, R + 7.8, 0.3] }),
    materialIndex: 5
  });
  slots.push({
    mesh: transformMesh(smoothWeldedNormals(layeredCanopyMesh({ radius: 2.8, height: 2.2, puffs: 7, seed: 73 }), 400), { pos: [3.2, R + 5.6, -1.1] }),
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
  return assembleMultiMaterialNode(name, slots, mats, { id, position: [0, -500, 0], castShadow: false, receiveShadow: false });
}

/* ------------------------------------------------------------------ 4. Carved Stone & Lacquer Palace Lantern */

/** Carved 3.6 m tōrō stone & vermilion-lacquer roadside lantern (`lantern-0..9`) with warm spirit flame & shoji glass. */
export function buildPalaceLanternNode(id: string, name = id, castShadow = false): AuraNodeBuilder<AuraGroupNode> {
  const mats: AuraMaterialSpec[] = [MAT_TEMPLE_GRANITE, MAT_VERMILION_LACQUER, MAT_INDIGO_LACQUER, MAT_IMPERIAL_GOLD, MAT_AMBER_FLAME];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh([[0, 0], [0.68, 0], [0.62, 0.28], [0.44, 0.52], [0.52, 0.68], [0.3, 0.78], [0, 0.78]], 16), materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.22, 0], [0.19, 1.15], [0.26, 1.28], [0, 1.28]], 14), { pos: [0, 0.76, 0] }), materialIndex: 1 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.54, 0.08], [0.6, 0.22], [0.46, 0.3], [0, 0.3]], 12), { pos: [0, 1.98, 0] }), materialIndex: 0 },
    { mesh: transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.18, 0.14], [0.22, 0.36], [0.05, 0.62], [0, 0.66]], 14)), { pos: [0, 2.3, 0] }), materialIndex: 4 },
    { mesh: transformMesh(upturnedPagodaRoofMesh(0.76, 0.76, 0.48, 0.28), { pos: [0, 2.92, 0] }), materialIndex: 2 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.16, 0.05], [0.1, 0.18], [0.02, 0.32], [0, 0.34]], 12), { pos: [0, 3.34, 0] }), materialIndex: 3 }
  ];
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + Math.PI * 0.25;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.08, 0.68, 0.08, 0.015), { pos: [Math.cos(a) * 0.38, 2.6, Math.sin(a) * 0.38] }),
      materialIndex: 3
    });
  }
  const solid = geometry.multiMaterial(buildGroupedGeometrySpec(slots), mats, {
    name: `${name}-frame`, castShadow, receiveShadow: true
  });
  const paneSpec = mergeRawMeshes([
    transformMesh(latheMesh([[0.32, 2.28], [0.34, 2.28], [0.34, 2.92], [0.32, 2.92]], 8, true), { pos: [0, 0, 0] })
  ]);
  const shoji = geometry.custom(paneSpec, {
    name: `${name}-shoji`, material: MAT_SPIRIT_GLASS, castShadow: false, receiveShadow: false
  });
  return group(name, [solid, shoji], { position: [0, -500, 0] }).runtime({ id });
}

/* ------------------------------------------------------------------ 5. Pooled Course Obstacles, Guardians & Feast */

export type PooledEntityModelType = "arch" | "barrier" | "oni" | "sweeper" | "feast";

function buildSlideArchNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats: AuraMaterialSpec[] = [
    MAT_TEMPLE_GRANITE, MAT_VERMILION_LACQUER, MAT_INDIGO_LACQUER, MAT_IMPERIAL_GOLD,
    MAT_FORGED_IRON, MAT_PRAYER_SILK, MAT_JADE_WARD_GLOW
  ];
  const slots: MultiMatSlot[] = [];
  for (const side of [-1, 1] as const) {
    const px = side * 1.48;
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.42, 0], [0.36, 0.38], [0.28, 0.48], [0, 0.48]], 14), { pos: [px, 0, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.22, 0], [0.19, 3.65], [0.24, 3.8], [0, 3.8]], 14), { pos: [px, 0.44, 0] }), materialIndex: 1 });
  }
  // Low slide-under ward beam at y = 1.68 m + spiked iron teeth + prayer silk & glowing jade seal
  slots.push({ mesh: transformMesh(bevelBoxMesh(3.25, 0.28, 0.34, 0.05), { pos: [0, 1.72, 0] }), materialIndex: 4 });
  for (const sx of [-1.0, -0.5, 0.5, 1.0] as const) {
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.09, 0.24], [0, 0.26]], 8), { pos: [sx, 1.34, 0] }), materialIndex: 3 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.76, 0.44, 0.08, 0.02), { pos: [0, 1.48, 0] }), materialIndex: 5 });
  slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.18, 1, 0, 3)), { pos: [0, 1.72, 0.2] }), materialIndex: 6 });
  // Upper tie-beam, calligraphy plaque & upturned kasagi roof (total height ~4.6 m)
  slots.push({ mesh: transformMesh(bevelBoxMesh(3.45, 0.26, 0.32, 0.04), { pos: [0, 3.32, 0] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.72, 0.68, 0.18, 0.04), { pos: [0, 3.68, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(2.25, 0.68, 0.68, 0.28), { pos: [0, 3.92, 0] }), materialIndex: 2 });
  return assembleMultiMaterialNode(name, slots, mats, { id, position: [0, -500, 0], castShadow: true, receiveShadow: true });
}

function buildSpiritBarrierNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats: AuraMaterialSpec[] = [
    MAT_TEMPLE_GRANITE, MAT_VERMILION_LACQUER, MAT_BURNISHED_BRONZE,
    MAT_FORGED_IRON, MAT_IMPERIAL_GOLD, MAT_JADE_WARD_GLOW, MAT_PRAYER_SILK
  ];
  const slots: MultiMatSlot[] = [];
  for (const side of [-1, 1] as const) {
    const px = side * 1.16;
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.56, 0.42, 0.68, 0.06), { pos: [px, 0.21, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.2, 0], [0.17, 1.68], [0.24, 1.82], [0.08, 2.08], [0, 2.1]], 14), { pos: [px, 0.4, 0] }), materialIndex: 1 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.22, 0.62, 0.06, 0.02), { pos: [px * 1.12, 1.45, 0] }), materialIndex: 6 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(2.52, 0.24, 0.26, 0.04), { pos: [0, 0.88, 0] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(2.62, 0.28, 0.3, 0.05), { pos: [0, 1.88, 0] }), materialIndex: 1 });
  for (const sx of [-0.88, -0.44, 0, 0.44, 0.88] as const) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh([[-0.08, 0], [0.08, 0], [0.11, 0.26], [0, 0.56], [-0.11, 0.26]], 0.1, 0.02, true), { pos: [sx, 1.98, 0] }),
      materialIndex: sx === 0 ? 4 : 3
    });
  }
  slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.34, 0.06], [0.34, 0.16], [0, 0.22]], 14), { pos: [0, 1.26, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 5 });
  const solid = geometry.multiMaterial(buildGroupedGeometrySpec(slots), mats, { name: `${name}-frame`, castShadow: true, receiveShadow: true });
  const wardPane = mergeRawMeshes([transformMesh(bevelBoxMesh(1.92, 0.72, 0.08, 0.02), { pos: [0, 1.38, 0] })]);
  const ward = geometry.custom(wardPane, {
    name: `${name}-ward`, material: MAT_JADE_CRYSTAL, castShadow: false, receiveShadow: false
  });
  return group(name, [solid, ward], { position: [0, -500, 0] }).runtime({ id });
}

function buildOniGuardianNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
  const mats: AuraMaterialSpec[] = [
    MAT_ONI_SKIN, MAT_CRIMSON_ARMOR, MAT_INDIGO_SILK, MAT_FORGED_IRON,
    MAT_IMPERIAL_GOLD, MAT_PEARL_IVORY, MAT_DRAGON_EYE, MAT_DARK_SLATE
  ];
  const slots: MultiMatSlot[] = [];
  // Stance legs, iron greaves & war hakama (y = 0..1.5 m)
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.38, 0.24, 0.58, 0.06), { pos: [side * 0.44, 0.12, 0.06] }), materialIndex: 7 });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.22, 0], [0.26, 0.55], [0.24, 0.95], [0, 0.95]], 12), { pos: [side * 0.44, 0.22, 0] }), materialIndex: 3 });
  }
  slots.push({
    mesh: loftSectionsMesh([
      dragonRing(0, 0.92, 0, 0.78, 0.54, 0.05),
      dragonRing(0, 1.28, 0, 0.68, 0.48, 0.05),
      dragonRing(0, 1.56, 0, 0.62, 0.44, 0.05)
    ], true, false),
    materialIndex: 2
  });
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.32, 0.24, 0.94, 0.05), { pos: [0, 1.52, 0] }), materialIndex: 4 });
  // Muscular armored torso, shoulder pauldrons & bracers (y = 1.55..2.58 m)
  slots.push({
    mesh: smoothWeldedNormals(loftSectionsMesh([
      dragonRing(0, 1.56, 0, 0.6, 0.42, 0.08),
      dragonRing(0, 2.05, 0.04, 0.86, 0.56, 0.12),
      dragonRing(0, 2.48, 0, 0.74, 0.48, 0.1),
      dragonRing(0, 2.62, 0, 0.36, 0.32, 0.06)
    ], true, false)),
    materialIndex: 1
  });
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: transformMesh(upturnedPagodaRoofMesh(0.46, 0.42, 0.34, 0.22), { pos: [side * 0.92, 2.28, 0], rot: [0, 0, -side * 0.35] }), materialIndex: 1 });
    const armPts = catmullRomSpline3([[side * 0.88, 2.26, 0], [side * 0.98, 1.82, 0.28], [side * 0.66, 1.64, 0.62]], 5)
      .map((p): V4 => [p[0], p[1], p[2], 0.21]);
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(armPts, 10, true)), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.28, 0.36, 0.34, 0.05), { pos: [side * 0.76, 1.7, 0.48], rot: [0.5, 0, 0] }), materialIndex: 3 });
  }
  // Fierce horned oni head, gold horns, ivory tusks & blazing eyes (y = 2.6..3.4 m)
  slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.46, 2, 0.05, 19)), { pos: [0, 2.88, 0.06], scale: [1.02, 1.08, 0.98] }), materialIndex: 0 });
  for (const side of [-1, 1] as const) {
    const horn = catmullRomSpline3([[side * 0.24, 3.12, 0.1], [side * 0.46, 3.32, 0.16], [side * 0.34, 3.46, 0.04]], 5)
      .map((p, k, a): V4 => [p[0], p[1], p[2], 0.12 * (1 - k / (a.length * 1.15))]);
    slots.push({ mesh: smoothWeldedNormals(tubeSweepMesh(horn, 8, true)), materialIndex: 4 });
    slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.06, 0.04], [0.01, 0.24]], 8), { pos: [side * 0.2, 2.72, 0.44], rot: [0.35, 0, -side * 0.15] }), materialIndex: 5 });
    slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.08, 1, 0, 2)), { pos: [side * 0.18, 2.94, 0.46] }), materialIndex: 6 });
  }
  // Studded forged-iron kanabo war club held diagonally across the front
  const clubProfile: V2[] = [[0, 0], [0.08, 0], [0.08, 0.7], [0.16, 0.95], [0.22, 1.95], [0.16, 2.25], [0, 2.3]];
  slots.push({ mesh: transformMesh(latheMesh(clubProfile, 12), { pos: [-0.72, 1.42, 0.66], rot: [0.18, 0, -1.12] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.25, 0.08], [0.25, 0.18], [0, 0.24]], 10), { pos: [0.68, 2.1, 0.46], rot: [0.18, 0, -1.12] }), materialIndex: 4 });
  return assembleMultiMaterialNode(name, slots, mats, { id, position: [0, -500, 0], castShadow: true, receiveShadow: true });
}

function buildSweeperCartNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
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
  // Front rotary bladed sweeper drum + overhead swinging spiked spirit-mace frame (height ~2.78 m)
  for (const sx of [-0.65, 0, 0.65] as const) {
    slots.push({
      mesh: transformMesh(extrudeStarPolygonMesh(6, 0.48, 0.22, 0.12, 0.02), { pos: [sx, 0.54, 1.15], rot: [0, Math.PI * 0.5, 0] }),
      materialIndex: 2
    });
  }
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: transformMesh(bevelBoxMesh(0.16, 1.65, 0.16, 0.03), { pos: [side * 0.78, 1.82, -0.15] }), materialIndex: 1 });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(1.82, 0.18, 0.22, 0.03), { pos: [0, 2.66, -0.15] }), materialIndex: 4 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.08, 0.72, 0.08, 0.02), { pos: [0, 2.24, -0.15], rot: [0, 0, 0.22] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(extrudeStarPolygonMesh(8, 0.42, 0.26, 0.36, 0.04), { pos: [0.16, 1.78, -0.15] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.24, 1, 0, 8)), { pos: [0, 1.38, 1.02] }), materialIndex: 5 });
  return assembleMultiMaterialNode(name, slots, mats, { id, position: [0, -500, 0], castShadow: true, receiveShadow: true });
}

function buildVitalityFeastNode(id: string, name: string): AuraNodeBuilder<AuraGroupNode> {
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
  // Porcelain ramen tureen + golden broth + roast platter + celadon teapot + steamed bao trio
  slots.push({ mesh: transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.26, 0], [0.46, 0.22], [0.48, 0.46], [0.42, 0.46], [0.22, 0.12], [0, 0.12]], 18)), { pos: [-0.42, 0.76, 0.08] }), materialIndex: 2 });
  slots.push({ mesh: transformMesh(latheMesh([[0, 0], [0.39, 0], [0, 0.05]], 16), { pos: [-0.42, 1.14, 0.08] }), materialIndex: 5 });
  slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.32, 2, 0.04, 15)), { pos: [0.44, 0.96, -0.18], scale: [1.25, 0.72, 0.92] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.2, 0], [0.28, 0.18], [0.2, 0.36], [0.08, 0.44], [0, 0.46]], 16)), { pos: [0.48, 0.76, 0.36] }), materialIndex: 4 });
  for (const [bx, bz] of [[-0.1, -0.34], [0.14, -0.4], [0.02, -0.18]] as const) {
    slots.push({ mesh: transformMesh(smoothWeldedNormals(latheMesh([[0, 0], [0.15, 0], [0.17, 0.1], [0.06, 0.2], [0, 0.22]], 14)), { pos: [bx, 0.78, bz] }), materialIndex: 2 });
  }
  slots.push({ mesh: transformMesh(smoothWeldedNormals(icosphereFacetMesh(0.16, 1, 0, 4)), { pos: [0, 1.56, 0] }), materialIndex: 5 });
  return assembleMultiMaterialNode(name, slots, mats, { id, position: [0, -500, 0], castShadow: true, receiveShadow: true });
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
  const core = smoothWeldedNormals(icosphereFacetMesh(0.52, 2, 0, 1));
  const ringPts: V4[] = Array.from({ length: 17 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [Math.cos(a) * 0.72, Math.sin(a) * 0.22, Math.sin(a) * 0.72, 0.055];
  });
  return mergeRawMeshes([core, smoothWeldedNormals(tubeSweepMesh(ringPts, 8, false))]);
}

export function soulCoreSculptedSpec(): AuraCustomGeometrySpec {
  const profile: V2[] = [[0, -0.72], [0.52, -0.52], [0.76, -0.08], [0.64, 0.38], [0.28, 0.74], [0, 0.92]];
  return mergeRawMeshes([smoothWeldedNormals(latheMesh(profile, 18))]);
}

export function soulTailSculptedSpec(): AuraCustomGeometrySpec {
  const pts = catmullRomSpline3([[0, -0.85, 0], [0.12, -0.2, 0.08], [-0.1, 0.35, -0.05], [0, 0.85, 0]], 5)
    .map((p, k, a): V4 => [p[0], p[1], p[2], 0.52 * (1 - (k / a.length) * 0.86)]);
  return mergeRawMeshes([smoothWeldedNormals(tubeSweepMesh(pts, 10, true))]);
}

export function powerCrystalSculptedSpec(): AuraCustomGeometrySpec {
  const crystal = latheMesh([[0, -0.96], [0.58, -0.18], [0.68, 0], [0.58, 0.18], [0, 0.96]], 8, true);
  const collar = transformMesh(extrudeStarPolygonMesh(6, 0.82, 0.48, 0.14, 0.03), { rot: [Math.PI * 0.5, 0, 0] });
  return mergeRawMeshes([crystal, collar]);
}

export function powerHaloSculptedSpec(): AuraCustomGeometrySpec {
  const ring = (tilt: number): RawMesh => {
    const pts: V4[] = Array.from({ length: 19 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2;
      return [Math.cos(a) * 1.65, Math.sin(a) * Math.sin(tilt) * 1.65, Math.sin(a) * Math.cos(tilt) * 1.65, 0.075];
    });
    return smoothWeldedNormals(tubeSweepMesh(pts, 8, false));
  };
  return mergeRawMeshes([ring(0.52), ring(-0.52)]);
}

export function hangingVergeLanternSpec(): AuraCustomGeometrySpec {
  const profile: V2[] = [[0, -0.38], [0.18, -0.36], [0.3, -0.18], [0.33, 0], [0.3, 0.18], [0.18, 0.36], [0, 0.38]];
  return mergeRawMeshes([smoothWeldedNormals(latheMesh(profile, 14))]);
}

export function cumulusBillowSculptedSpec(): AuraCustomGeometrySpec {
  return mergeRawMeshes([smoothCumulusTuftMesh(0.95, 0.88, 0.95, 101)]);
}
