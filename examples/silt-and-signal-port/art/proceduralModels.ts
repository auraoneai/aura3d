/**
 * WP-28 — Duneglide (`silt-and-signal-port`) Multi-Material Procedural 3D Art Kit.
 *
 * Journey / Sable-inspired sun-bleached desert ruins, sandstone viaducts, fluted obelisks,
 * ancient brass-and-ceramic signal relay towers, tattered sheen-fabric wind-banner masts,
 * stratified red-rock mesas & yardang spires, and the courier's sculpted desert sand-skiff.
 *
 * Built exclusively from `apps/showcase-port-shared/proceduralKernel.ts` and `@aura3d/engine`
 * physical surface presets (with paired WebGPU WGSL twins on custom strata shaders).
 */
import {
  geometry,
  group,
  material,
  type AuraCustomGeometrySpec,
  type AuraCustomMaterialSpec,
  type AuraMaterialSpec,
  type AuraModelMaterialOverride
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptHumanoidLimbMesh,
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  sminPoly,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import {
  WGSL_CLIP,
  WGSL_ENVIRONMENT_FOG,
  WGSL_NOISE,
  wgslStage
} from "../../shared/wgsl-twins";
import { WGSL_A3D_LIGHTS, WGSL_A3D_SCENE, WGSL_A3D_SHADOW } from "../../shared/wgsl-author-lights";
import { SILT_PALETTE } from "./look";

/** Strips preset `.name` so `scene.toJSON()` never emits duplicate material name collisions. */
export const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

/** Converts a `RawMesh` into an `AuraCustomGeometrySpec` ready for `geometry.custom` or `instances.custom`. */
export function rawToCustomGeometry(mesh: RawMesh): AuraCustomGeometrySpec {
  const positions = Float32Array.from(mesh.positions);
  const normals = Float32Array.from(mesh.normals);
  const uvs = Float32Array.from(mesh.uvs);
  const vCount = Math.floor(positions.length / 3);
  const indices = vCount > 65535 ? Uint32Array.from(mesh.indices) : Uint16Array.from(mesh.indices);
  const colors = mesh.colors === undefined ? undefined : Float32Array.from(mesh.colors);
  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    ...(colors ? { colors } : {})
  });
}

/** Paints uniform or height-graded vertex colors onto a `RawMesh`. */
function colorizeMesh(
  mesh: RawMesh,
  fn: (x: number, y: number, z: number, idx: number) => V4
): RawMesh {
  const vCount = Math.floor(mesh.positions.length / 3);
  const colors = new Array<number>(vCount * 4);
  for (let i = 0; i < vCount; i++) {
    const c = fn(mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!, i);
    colors[i * 4] = c[0];
    colors[i * 4 + 1] = c[1];
    colors[i * 4 + 2] = c[2];
    colors[i * 4 + 3] = c[3];
  }
  return { ...mesh, colors };
}

/* ------------------------------------------------------------------ WGSL Twin for Stratified Red-Rock Mesas */

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

/** `material.strata(...)` paired with its WebGPU WGSL twin for stratified red-rock mesas & yardang spires. */
export function strataMesaMaterial(night = false): AuraMaterialSpec {
  const colors = night
    ? (["#4b4059", "#69566f", "#383149", "#7f697c", "#54465f"] as const)
    : (["#cb5938", "#e69a5e", "#9e3f28", "#f2c688", "#b94c31"] as const);
  const base = unnamed(material.strata({
    bands: 16,
    colors,
    heightRange: [-12, 78],
    noise: 0.44,
    noiseScale: 16,
    seam: 0.34,
    variation: 0.18,
    slope: { angle: 42, blend: 14, flatColor: night ? "#6f6689" : "#f0c88c" },
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

/* ------------------------------------------------------------------ Multi-Material Surface Library */

export const DESERT_MAT = {
  sandstoneWarm: unnamed(material.matteClay({ color: "#dfc094", roughness: 0.87 })),
  sandstoneBleached: unnamed(material.matteClay({ color: "#eee1c7", roughness: 0.83 })),
  sandstoneDeep: unnamed(material.matteClay({ color: "#a47856", roughness: 0.91 })),
  terracottaGlaze: unnamed(material.ceramic({ color: "#c96848", roughness: 0.3, clearcoat: 0.58, clearcoatRoughness: 0.18 })),
  turquoiseGlaze: unnamed(material.ceramic({ color: "#389684", roughness: 0.24, clearcoat: 0.72, clearcoatRoughness: 0.14 })),
  anisotropicBrass: unnamed(material.brushedMetal({ color: "#d29f54", roughness: 0.24, metalness: 0.92, anisotropy: 0.88, anisotropyRotation: 0.35, envMapIntensity: 1.4 })),
  goldEmbroideryTrim: unnamed(material.brushedMetal({ color: "#e4b45c", roughness: 0.24, metalness: 0.88, anisotropy: 0.84, anisotropyRotation: 0.42, envMapIntensity: 1.42, doubleSided: true })),
  verdigrisBronze: unnamed(material.studioMetal({ color: "#788d7c", roughness: 0.4, metalness: 0.84, envMapIntensity: 1.15 })),
  darkRelayIron: unnamed(material.brushedMetal({ color: "#2d2621", roughness: 0.34, metalness: 0.88, anisotropy: 0.8, envMapIntensity: 1.15 })),
  carvedBoneSkiff: unnamed(material.pbr({ color: "#f1e4c9", roughness: 0.46, metalness: 0.06, clearcoat: 0.18, clearcoatRoughness: 0.36 })),
  skiffSandstoneHull: unnamed(material.pbr({ color: "#d8a874", roughness: 0.56, metalness: 0.14 })),
  skiffLacquer: unnamed(material.lacquer({ color: "#b24c32", roughness: 0.38, clearcoat: 0.34, clearcoatRoughness: 0.28 })),
  skiffFootpad: unnamed(material.pbr({ color: "#2b231e", roughness: 0.62, metalness: 0.08 })),
  carvedCedarWood: unnamed(material.pbr({ color: "#6e482d", roughness: 0.78, metalness: 0.02 })),
  sheenTerracottaBanner: unnamed(material.fabric({ color: SILT_PALETTE.terracotta, roughness: 0.84, clearcoat: 0, sheen: 0.78, sheenColor: "#ffdcbe", sheenRoughness: 0.54, envMapIntensity: 0.08, doubleSided: true })),
  sheenOchreTunic: unnamed(material.fabric({ color: "#d89a50", roughness: 0.84, clearcoat: 0, sheen: 0.74, sheenColor: "#ffebc8", sheenRoughness: 0.56, envMapIntensity: 0.08, doubleSided: true })),
  sheenBonePennant: unnamed(material.fabric({ color: SILT_PALETTE.bone, roughness: 0.84, clearcoat: 0, sheen: 0.7, sheenColor: "#fff2dd", sheenRoughness: 0.56, envMapIntensity: 0.08, doubleSided: true })),
  sheenIndigoCloth: unnamed(material.fabric({ color: "#36406e", roughness: 0.84, clearcoat: 0, sheen: 0.76, sheenColor: "#a6b7eb", sheenRoughness: 0.54, envMapIntensity: 0.08, doubleSided: true })),
  riderTerracottaCloak: unnamed(material.fabric({ color: SILT_PALETTE.terracotta, roughness: 0.66, clearcoat: 0, sheen: 0.76, sheenColor: "#ffdcbe", sheenRoughness: 0.58, envMapIntensity: 0.08, doubleSided: true })),
  riderOchreTunic: unnamed(material.fabric({ color: "#d89a50", roughness: 0.65, clearcoat: 0, sheen: 0.7, sheenColor: "#ffebc8", sheenRoughness: 0.58, envMapIntensity: 0.08, doubleSided: true })),
  riderBoneCloth: unnamed(material.fabric({ color: SILT_PALETTE.bone, roughness: 0.65, clearcoat: 0, sheen: 0.68, sheenColor: "#fff2dd", sheenRoughness: 0.6, envMapIntensity: 0.08, doubleSided: true })),
  riderIndigoCloth: unnamed(material.fabric({ color: "#36406e", roughness: 0.66, clearcoat: 0, sheen: 0.72, sheenColor: "#a6b7eb", sheenRoughness: 0.58, envMapIntensity: 0.08, doubleSided: true })),
  leatherSaddle: unnamed(material.pbr({ color: "#633b24", roughness: 0.62, metalness: 0.04, clearcoat: 0, envMapIntensity: 0.08 })),
  leatherDark: unnamed(material.pbr({ color: "#2e1e16", roughness: 0.62, metalness: 0.04, clearcoat: 0, envMapIntensity: 0.08 })),
  bootRubber: unnamed(material.pbr({ color: "#1d1917", roughness: 0.72, metalness: 0.02, clearcoat: 0, envMapIntensity: 0.06 })),
  linenGaiter: unnamed(material.fabric({ color: "#e1d1b4", roughness: 0.68, clearcoat: 0, sheen: 0.58, sheenColor: "#fff4df", sheenRoughness: 0.62, envMapIntensity: 0.08, doubleSided: true })),
  nomadTrouser: unnamed(material.fabric({ color: "#3f3854", roughness: 0.68, clearcoat: 0, sheen: 0.54, sheenColor: "#9aa2cc", sheenRoughness: 0.64, envMapIntensity: 0.08, doubleSided: true })),
  nomadSunSkin: unnamed(material.matteClay({ color: "#b67954", roughness: 0.64, envMapIntensity: 0.07 })),
  goggleLens: unnamed(material.lacquer({ color: "#db8d2c", roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.85 })),
  beaconSolarGlass: unnamed(material.physical({ color: "#9ee8ff", roughness: 0.05, opacity: 0.46, clearcoat: 1, ior: 1.52 })),
  signalCoreJade: unnamed(material.emissive({ color: SILT_PALETTE.jade, emissiveIntensity: 2.35, practical: true })),
  signalCoreAzure: unnamed(material.emissive({ color: "#289ef2", emissiveIntensity: 2.35, practical: true })),
  signalCoreAmber: unnamed(material.emissive({ color: "#ffb85c", emissiveIntensity: 2.15, practical: true }))
} as const;

/** Instanced-safe (`>16` batch invariant: strictly `material.pbr` or `material.metal` with `clearcoat: 0, sheen: 0`). */
export const DESERT_INST_MAT = {
  sandstone: unnamed(material.pbr({ color: "#e8cea4", roughness: 0.85, metalness: 0.02, clearcoat: 0, sheen: 0 })),
  ruinWeathered: unnamed(material.pbr({ color: "#dab88c", roughness: 0.89, metalness: 0.02, clearcoat: 0, sheen: 0 })),
  yardangRock: unnamed(material.pbr({ color: "#de956a", roughness: 0.88, metalness: 0.02, clearcoat: 0, sheen: 0 })),
  redRockMesa: unnamed(material.pbr({ color: "#d9754c", roughness: 0.86, metalness: 0.02, clearcoat: 0, sheen: 0 })),
  tamariskFoliage: unnamed(material.pbr({ color: "#38a68c", roughness: 0.76, metalness: 0.02, clearcoat: 0, sheen: 0 })),
  scrubFoliage: unnamed(material.pbr({ color: "#2f9c84", roughness: 0.78, metalness: 0.02, clearcoat: 0, sheen: 0 })),
  tamariskTrunk: unnamed(material.pbr({ color: "#684830", roughness: 0.88, metalness: 0.02, clearcoat: 0, sheen: 0 })),
  adobePlaster: unnamed(material.pbr({ color: "#ecd3ab", roughness: 0.87, metalness: 0.01, clearcoat: 0, sheen: 0 })),
  adobeTimberTerracotta: unnamed(material.pbr({ color: "#c2613e", roughness: 0.78, metalness: 0.03, clearcoat: 0, sheen: 0 })),
  lanternBronze: unnamed(material.metal({ color: "#b8894a", roughness: 0.34, metalness: 0.86, clearcoat: 0, sheen: 0, envMapIntensity: 1.2 })),
  monolithObsidian: unnamed(material.metal({ color: "#2d2621", roughness: 0.32, metalness: 0.86, clearcoat: 0, sheen: 0, envMapIntensity: 1.2 })),
  monolithBrassCap: unnamed(material.metal({ color: "#c59450", roughness: 0.26, metalness: 0.9, clearcoat: 0, sheen: 0, envMapIntensity: 1.35 })),
  solarPanelArray: unnamed(material.metal({ color: "#24486b", roughness: 0.22, metalness: 0.74, clearcoat: 0, sheen: 0, envMapIntensity: 1.35 })),
  relayDishBrass: unnamed(material.metal({ color: "#d4a256", roughness: 0.25, metalness: 0.88, clearcoat: 0, sheen: 0, envMapIntensity: 1.35 })),
  monolithJadeGlyph: unnamed(material.pbr({ color: SILT_PALETTE.jadeWhite, emissive: SILT_PALETTE.jade, emissiveIntensity: 2.3, practical: true, roughness: 0.3, metalness: 0, clearcoat: 0, sheen: 0 })),
  routePennantCloth: unnamed(material.pbr({ color: SILT_PALETTE.terracotta, roughness: 0.86, metalness: 0, clearcoat: 0, sheen: 0, doubleSided: true })),
  ringSandstoneBrass: unnamed(material.pbr({ color: "#e4c596", roughness: 0.68, metalness: 0.24, clearcoat: 0, sheen: 0 }))
} as const;

/** Desert cloak/scarf sheen + sun-rim overrides for the rigged `courier.glb` (`skins=1`), preserving authored maps. */
export function createCourierMaterialOverrides(inked: boolean): readonly AuraModelMaterialOverride[] {
  if (!inked) return [];
  return [
    {
      roughness: 0.66,
      clearcoat: 0,
      envMapIntensity: 0.08,
      sheen: 0.62,
      sheenColor: "#ffe1bd",
      sheenRoughness: 0.58,
      rim: { color: "#ffe0ba", power: 2.6, intensity: 0.66 }
    }
  ];
}

/** Merges multiple vertex-colored `RawMesh` parts into a single `AuraCustomGeometrySpec`. */
function mergeColoredSpec(parts: readonly RawMesh[]): AuraCustomGeometrySpec {
  let totalV = 0;
  let totalI = 0;
  let hasColors = false;
  for (const p of parts) {
    totalV += Math.floor(p.positions.length / 3);
    totalI += p.indices.length;
    if (p.colors) hasColors = true;
  }
  const positions = new Float32Array(totalV * 3);
  const normals = new Float32Array(totalV * 3);
  const uvs = new Float32Array(totalV * 2);
  const colors = hasColors ? new Float32Array(totalV * 4) : undefined;
  const indices = totalV > 65535 ? new Uint32Array(totalI) : new Uint16Array(totalI);
  let vOff = 0;
  let iOff = 0;
  for (const p of parts) {
    const vc = Math.floor(p.positions.length / 3);
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    if (colors) {
      if (p.colors) {
        colors.set(p.colors, vOff * 4);
      } else {
        for (let k = 0; k < vc; k++) {
          colors[(vOff + k) * 4] = 1;
          colors[(vOff + k) * 4 + 1] = 1;
          colors[(vOff + k) * 4 + 2] = 1;
          colors[(vOff + k) * 4 + 3] = 1;
        }
      }
    }
    for (let k = 0; k < p.indices.length; k++) {
      indices[iOff + k] = p.indices[k]! + vOff;
    }
    vOff += vc;
    iOff += p.indices.length;
  }
  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    ...(colors ? { colors } : {})
  });
}

/* ------------------------------------------------------------------ 1. Hero Desert Sand-Skiff & Sculpted Wind-Rider */

export const SURFER_PELVIS_REST: V3 = [0.01, 0.64, -0.02];

/**
 * Applies a rich linear-space painterly sun-bleach / midtone / desert-dust or cool-fold vertex-color gradient
 * followed by `bakeMeshCavityAO(mesh, aoStrength)` (`0.24` default) so organic cloth, leather, bone, and brass
 * read with sculpted crevices while keeping distinct multi-material PBR finishes (`coalesceColors: false`).
 */
function finishHeroMesh(
  src: RawMesh,
  topTint: V4,
  midTint: V4,
  bottomTint: V4,
  aoStrength = 0.24
): RawMesh {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < src.positions.length; i += 3) {
    const y = src.positions[i]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(0.025, maxY - minY);
  const mixC = (a: V4, b: V4, t: number): V4 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    1
  ];
  const graded = paintMeshColors(
    src,
    ([, py], [, ny]) => {
      const h = Math.max(0, Math.min(1, (py - minY) / spanY));
      const base = h < 0.5 ? mixC(bottomTint, midTint, h * 2) : mixC(midTint, topTint, (h - 0.5) * 2);
      const sunKiss = 0.94 + Math.max(0, ny) * 0.1;
      return [base[0] * sunKiss, base[1] * sunKiss, base[2] * sunKiss, 1];
    },
    false
  );
  return bakeMeshCavityAO(graded, aoStrength);
}

const HERO_TINT = {
  clothSun: [1.14, 1.08, 0.99, 1] as V4,
  clothMid: [1.0, 0.97, 0.98, 1] as V4,
  clothDustHem: [0.86, 0.77, 0.69, 1] as V4,
  indigoSun: [1.15, 1.11, 1.05, 1] as V4,
  indigoMid: [0.98, 0.97, 1.03, 1] as V4,
  indigoDeep: [0.76, 0.75, 0.88, 1] as V4,
  leatherSun: [1.12, 1.04, 0.95, 1] as V4,
  leatherMid: [0.98, 0.94, 0.9, 1] as V4,
  leatherSand: [1.05, 0.93, 0.76, 1] as V4,
  boneSun: [1.08, 1.06, 1.01, 1] as V4,
  boneMid: [0.99, 0.96, 0.92, 1] as V4,
  boneOchre: [0.88, 0.8, 0.68, 1] as V4,
  brassHighlight: [1.12, 1.08, 0.98, 1] as V4,
  brassMid: [1.0, 0.97, 0.92, 1] as V4,
  brassPatina: [0.84, 0.79, 0.72, 1] as V4
} as const;

function finishHeroSlots(slots: readonly MultiMatSlot[], tintByMat: (matIdx: number) => readonly [V4, V4, V4, number?]): MultiMatSlot[] {
  return slots.map((s) => {
    const [topT, midT, botT, ao] = tintByMat(s.materialIndex);
    return {
      materialIndex: s.materialIndex,
      mesh: finishHeroMesh(s.mesh, topT, midT, botT, ao ?? 0.24)
    };
  });
}

/** Smooth 20-point streamlined desert wind-glider cross-section with crisp chines & recessed deck crown. */
function skiffHullSection(x: number, halfZ: number, yKeel: number, yDeck: number, chineDrop = 0.032, pts = 20): V3[] {
  const ring: V3[] = [];
  const midY = (yKeel + yDeck) * 0.54 - chineDrop;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const z = sa * halfZ * (ca > 0 ? 0.96 : 1.0);
    let y: number;
    if (ca >= 0) {
      // Sculpted upper deck with subtle central spine crown and raised gunwale lip
      const edgeLip = Math.pow(Math.abs(sa), 2.4) * 0.012;
      y = midY + (yDeck - midY) * Math.pow(ca, 0.62) + edgeLip;
    } else {
      // V-rocker venturi hull belly
      y = midY - (midY - yKeel) * Math.pow(-ca, 0.78);
    }
    ring.push([x, y, z]);
  }
  return ring;
}

/** Smooth 16-point cambered crescent outrigger wing section. */
function airfoilSection(x: number, zMid: number, halfW: number, yMid: number, halfH: number, dihedral = 0, pts = 16): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const spanT = sa;
    const camber = (1 - spanT * spanT) * halfH * 0.28;
    const thick = (ca >= 0 ? Math.pow(ca, 0.75) : -0.72 * Math.pow(-ca, 0.85)) * halfH;
    ring.push([x, yMid + thick + camber + spanT * dihedral, zMid + spanT * halfW]);
  }
  return ring;
}

/**
 * Sculpted anatomical limb segment oriented along any 3D bone vector `p0 -> p1` (`sculptAnatomicalLimbMesh`
 * with 18 radial stations + Loop smooth subdivision so angled/outstretched limbs keep true muscle volume).
 */
function sculptDirectedLimb(
  p0: V3,
  p1: V3,
  r0: readonly [number, number],
  rMid: readonly [number, number],
  r1: readonly [number, number],
  muscleBiasZ = 0.008,
  peakT = 0.4
): RawMesh {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const dz = p1[2] - p0[2];
  const len = Math.max(0.04, Math.hypot(dx, dy, dz));
  const local = taubinSmoothMesh(
    subdivideSmoothMesh(
      sculptAnatomicalLimbMesh(
        [
          { pos: [0, 0, 0], rx: r0[0], rz: r0[1] },
          { pos: [0, len * 0.25, 0], rx: rMid[0] * 1.02, rz: rMid[1] * 1.03 },
          { pos: [0, len * 0.5, 0], rx: rMid[0] * 1.05, rz: rMid[1] * 1.06 },
          { pos: [0, len * 0.76, 0], rx: rMid[0] * 0.94, rz: rMid[1] * 0.95 },
          { pos: [0, len, 0], rx: r1[0], rz: r1[1] }
        ],
        { ringPoints: 20, capEnds: true, muscleBiasZ, peakT }
      ),
      1,
      0.44
    ),
    4
  );
  // Rotate +Y onto (dx, dy, dz) via Rz(rz) * Rx(rx): Rx(rx)*[0,L,0] = [0, L*cos(rx), L*sin(rx)], then Rz(rz) -> [-L*cos(rx)*sin(rz), L*cos(rx)*cos(rz), L*sin(rx)]
  const sinRx = Math.max(-1, Math.min(1, dz / len));
  const rx = Math.asin(sinRx);
  const rz = Math.atan2(-dx, dy);
  return transformMesh(local, { pos: p0, rot: [rx, 0, rz] });
}

/**
 * Multi-material sleek carved bone-and-brass desert wind-glider hover-skiff (`id: "board"`).
 * Oriented along `+X` forward (`[-1.12, +1.34]`), ribbed surf deck pads at `y = +0.192` aligned with the
 * wind-surfer's angled front-left & rear-right crouched surf stance (`BOARD_YAW = Math.PI / 2`, `BOARD_SCALE = 1.15`).
 */
let cachedSkiffSlots: readonly MultiMatSlot[] | null = null;

export function createSandSkiffNode(options: { readonly inked: boolean; readonly scale: number }) {
  const materials: readonly AuraMaterialSpec[] = [
    DESERT_MAT.skiffSandstoneHull, // 0: warm sandstone-alloy streamlined glider body & outrigger upper skins
    DESERT_MAT.skiffLacquer,       // 1: terracotta lacquer chine fairings & harmonic trim shrouds
    DESERT_MAT.darkRelayIron,      // 2: dark relay-iron venturi frame, outrigger spars & rudder hinges
    DESERT_MAT.skiffFootpad,       // 3: ribbed non-slip leather deck pad & angled surf foot-pads
    DESERT_MAT.anisotropicBrass,   // 4: gleaming brass cutwater, gunwale rails, astrolabe rings & rudder vanes
    DESERT_MAT.carvedCedarWood,    // 5: carved cedar abrasion skids
    DESERT_MAT.turquoiseGlaze,     // 6: glazed turquoise ceramic harmonic core & repulsor collars
    options.inked ? DESERT_MAT.signalCoreJade : DESERT_MAT.signalCoreAzure, // 7: glowing jade/azure primary signal core
    DESERT_MAT.signalCoreAmber,    // 8: warm glowing amber inner harmonic core & stern thruster embers
    DESERT_MAT.carvedBoneSkiff     // 9: carved sun-bleached leviathan-bone bow tusks, deck ribs & crescent wing spars
  ];
  if (cachedSkiffSlots) {
    return assembleMultiMaterialNode("board", cachedSkiffSlots, materials, {
      id: "board",
      position: [0, 4, 0],
      scale: options.scale,
      castShadow: true,
      receiveShadow: true,
      coalesceColors: false
    });
  }
  const rawSlots: MultiMatSlot[] = [];

  // 0 & 1: High-resolution 24-point lofted + Loop-subdivided + Taubin-faired streamlined wind-glider hull (+X forward)
  const hullSections: V3[][] = [
    skiffHullSection(-1.06, 0.23, -0.055, 0.162, 0.014, 24),
    skiffHullSection(-0.74, 0.35, -0.125, 0.182, 0.024, 24),
    skiffHullSection(-0.32, 0.38, -0.146, 0.186, 0.028, 24),
    skiffHullSection(0.14, 0.36, -0.138, 0.186, 0.026, 24),
    skiffHullSection(0.58, 0.27, -0.098, 0.192, 0.02, 24),
    skiffHullSection(0.96, 0.145, -0.042, 0.182, 0.01, 24),
    skiffHullSection(1.24, 0.042, 0.026, 0.148, 0.002, 24)
  ];
  rawSlots.push({
    mesh: taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(hullSections, true, false), 2, 0.52), 4),
    materialIndex: 0
  });

  // Analytic SDF nose cowling fairing (`analyticNormals: true` preserved — zero post-pass!)
  const prowCowling = sculptOrganicSdfMesh({
    boundsMin: [0.46, 0.06, -0.24],
    boundsMax: [1.18, 0.22, 0.24],
    resolution: [26, 22, 24],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const cowl = sdfTaperedCapsule([x, y, z], [0.56, 0.148, 0], [1.08, 0.142, 0], 0.156, 0.052);
      const ridge = sdfEllipsoid([x, y, z], [0.76, 0.172, 0], [0.24, 0.032, 0.096]);
      return sminPoly(cowl, ridge, 0.024);
    }
  });
  rawSlots.push({ mesh: prowCowling, materialIndex: 0 });

  const keelCore = taubinSmoothMesh(
    subdivideSmoothMesh(
      transformMesh(
        sculptStreamlinedHullMesh(2.18, 0.66, 0.27, {
          noseSharpness: 1.76,
          tailTaper: 0.48,
          canopyBulge: 0.04,
          undersideFlat: 0.28,
          stations: 24,
          ringPoints: 24
        }),
        { pos: [0.08, -0.018, 0], rot: [0, Math.PI / 2, 0] }
      ),
      1,
      0.46
    ),
    4
  );
  rawSlots.push({ mesh: keelCore, materialIndex: 1 });

  // 9 & 4: Carved sun-bleached bone twin split-prow tusks (+X) & 5 curved bone cockpit ribs + gleaming brass gunwale rails
  for (const side of [-1, 1] as const) {
    // Carved bone bow tusk sweeping forward into a graceful Desert Leviathan horn prow
    rawSlots.push({
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          tubeSweepMesh(
            [
              [0.36, 0.176, side * 0.285, 0.032],
              [0.72, 0.192, side * 0.205, 0.03],
              [1.04, 0.196, side * 0.102, 0.025],
              [1.3, 0.178, side * 0.026, 0.015]
            ],
            14
          ),
          1,
          0.44
        ),
        3
      ),
      materialIndex: 9
    });
    // Terracotta lacquer lower chine strakes
    rawSlots.push({
      mesh: tubeSweepMesh(
        [
          [-0.96, 0.065, side * 0.24, 0.024],
          [-0.38, 0.052, side * 0.37, 0.03],
          [0.24, 0.06, side * 0.34, 0.028],
          [0.82, 0.085, side * 0.2, 0.022],
          [1.18, 0.11, side * 0.06, 0.012]
        ],
        12
      ),
      materialIndex: 1
    });
    // Gleaming anisotropic-brass swept gunwale rail
    rawSlots.push({
      mesh: tubeSweepMesh(
        [
          [-0.98, 0.168, side * 0.21, 0.013],
          [-0.44, 0.188, side * 0.335, 0.015],
          [0.18, 0.19, side * 0.315, 0.015],
          [0.72, 0.196, side * 0.185, 0.013],
          [1.16, 0.176, side * 0.055, 0.01]
        ],
        12
      ),
      materialIndex: 4
    });
  }
  // 5 Transverse carved-bone deck ribs framing the recessed surfer deck
  for (const rx of [-0.52, -0.26, 0.0, 0.26, 0.5] as const) {
    const hw = rx < 0 ? 0.31 : 0.29 - rx * 0.12;
    rawSlots.push({
      mesh: tubeSweepMesh(
        [
          [rx, 0.168, -hw, 0.014],
          [rx, 0.182, -hw * 0.5, 0.015],
          [rx, 0.184, 0, 0.015],
          [rx, 0.182, hw * 0.5, 0.015],
          [rx, 0.168, hw, 0.014]
        ],
        10
      ),
      materialIndex: 9
    });
  }

  // Gleaming brass ventral keel cutwater blade & forward nose finial
  rawSlots.push({
    mesh: tubeSweepMesh(
      [
        [-1.0, -0.075, 0, 0.022],
        [-0.28, -0.158, 0, 0.03],
        [0.48, -0.128, 0, 0.028],
        [1.04, -0.018, 0, 0.022],
        [1.34, 0.145, 0, 0.013]
      ],
      12
    ),
    materialIndex: 4
  });

  // 3 & 4: Ribbed dark-leather surf deck pad + angled front-left & rear-right surf foot-pads (top flush at y = 0.192)
  rawSlots.push({
    mesh: subdivideSmoothMesh(transformMesh(bevelBoxMesh(0.92, 0.022, 0.42, 0.009), { pos: [0.02, 0.179, 0] }), 1, 0.35),
    materialIndex: 3
  });
  for (let r = -3; r <= 3; r++) {
    rawSlots.push({
      mesh: transformMesh(bevelBoxMesh(0.018, 0.008, 0.36, 0.003), { pos: [0.02 + r * 0.115, 0.189, 0] }),
      materialIndex: 2
    });
  }
  // Angled surf foot-pads & low-profile brass heel/arch cups matching rider lead [-0.105, 0, -0.27] & rear [0.125, 0, 0.23]
  for (const [fx, fz, fyaw] of [[0.235, -0.091, 0.42], [-0.2, 0.109, -0.78]] as const) {
    rawSlots.push({
      mesh: subdivideSmoothMesh(
        transformMesh(bevelBoxMesh(0.245, 0.016, 0.126, 0.006), { pos: [fx, 0.184, fz], rot: [0, fyaw, 0] }),
        1,
        0.35
      ),
      materialIndex: 3
    });
    rawSlots.push({
      mesh: transformMesh(
        tubeSweepMesh(
          [
            [-0.08, 0.012, -0.062, 0.008],
            [-0.115, 0.022, 0, 0.009],
            [-0.08, 0.012, 0.062, 0.008]
          ],
          10
        ),
        { pos: [fx, 0.19, fz], rot: [0, fyaw, 0] }
      ),
      materialIndex: 4
    });
  }

  // 6, 7, 8, 4: Glowing fore & aft harmonic signal cores (jade/azure outer ring + warm amber inner resonator + brass astrolabe bezel)
  for (const [cx, cy, rScale, tiltZ] of [[0.68, 0.194, 1.0, -0.08], [-0.62, 0.184, 0.88, 0.12]] as const) {
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0.068 * rScale, -0.018], [0.118 * rScale, -0.014], [0.124 * rScale, 0.014], [0.088 * rScale, 0.026]], 20),
        { pos: [cx, cy, 0], rot: [0, 0, tiltZ] }
      ),
      materialIndex: 4
    });
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0.044 * rScale, -0.01], [0.088 * rScale, -0.008], [0.084 * rScale, 0.02], [0.046 * rScale, 0.022]], 20),
        { pos: [cx, cy + 0.004, 0], rot: [0, 0, tiltZ] }
      ),
      materialIndex: 6
    });
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0.028 * rScale, 0.004], [0.068 * rScale, 0.016], [0.056 * rScale, 0.028], [0.026 * rScale, 0.024]], 20),
        { pos: [cx, cy + 0.006, 0], rot: [0, 0, tiltZ] }
      ),
      materialIndex: 7
    });
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0, 0.032], [0.028 * rScale, 0.026], [0.024 * rScale, 0.012], [0, 0.01]], 18),
        { pos: [cx, cy + 0.008, 0], rot: [0, 0, tiltZ] }
      ),
      materialIndex: 8
    });
  }

  // Twin curved crescent outrigger fins + carved bone leading spars + glowing repulsors + articulated stern rudder vanes
  for (const side of [-1, 1] as const) {
    // Swept arched outrigger cross-spars (dark iron + brass collar)
    for (const [sx, sweep] of [[-0.42, -0.08], [0.24, -0.06]] as const) {
      rawSlots.push({
        mesh: tubeSweepMesh(
          [
            [sx, 0.095, side * 0.28, 0.022],
            [sx + sweep * 0.5, 0.055, side * 0.43, 0.019],
            [sx + sweep, 0.008, side * 0.56, 0.016]
          ],
          12
        ),
        materialIndex: 2
      });
    }

    // Curved crescent outrigger wing fin (smooth subdivided + Taubin-faired 20-pt airfoil sweeping outward & aft into upturned winglet)
    const zBase = side * 0.57;
    rawSlots.push({
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              airfoilSection(0.62, zBase - side * 0.08, 0.028, 0.032, 0.016, side * 0.006, 20),
              airfoilSection(0.26, zBase, 0.088, 0.002, 0.032, side * 0.014, 20),
              airfoilSection(-0.22, zBase + side * 0.035, 0.096, -0.006, 0.034, side * 0.018, 20),
              airfoilSection(-0.66, zBase + side * 0.065, 0.068, 0.026, 0.024, side * 0.028, 20),
              airfoilSection(-0.94, zBase + side * 0.11, 0.024, 0.115, 0.014, side * 0.038, 20)
            ],
            true,
            false
          ),
          2,
          0.48
        ),
        4
      ),
      materialIndex: 0
    });
    // Carved-bone crescent outrigger leading-edge spar + cedar ventral sand-skid
    rawSlots.push({
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          tubeSweepMesh(
            [
              [0.64, 0.036, zBase - side * 0.08, 0.014],
              [0.2, 0.01, zBase + side * 0.078, 0.018],
              [-0.32, 0.004, zBase + side * 0.115, 0.017],
              [-0.92, 0.118, zBase + side * 0.125, 0.01]
            ],
            12
          ),
          1,
          0.42
        ),
        3
      ),
      materialIndex: 9
    });
    rawSlots.push({
      mesh: tubeSweepMesh(
        [
          [-0.62, -0.028, zBase + side * 0.04, 0.013],
          [-0.12, -0.038, zBase + side * 0.03, 0.015],
          [0.36, -0.012, zBase - side * 0.01, 0.012]
        ],
        10
      ),
      materialIndex: 5
    });

    // Embedded turquoise & glowing jade/azure repulsor ring in each crescent outrigger
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0.048, -0.032], [0.088, -0.03], [0.094, 0], [0.088, 0.03], [0.048, 0.032]], 18),
        { pos: [-0.08, -0.004, zBase + side * 0.02] }
      ),
      materialIndex: 6
    });
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0, -0.034], [0.052, -0.034], [0.052, 0.034], [0, 0.034]], 16),
        { pos: [-0.08, -0.004, zBase + side * 0.02] }
      ),
      materialIndex: 7
    });

    // Twin lathed brass & turquoise stern thruster bells (-X) with dual jade/amber exhaust cores
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0.098, -0.19], [0.132, -0.09], [0.124, 0.04], [0.096, 0.16], [0.048, 0.24], [0, 0.26]], 18),
        { pos: [-0.86, 0.032, side * 0.27], rot: [0, 0, -Math.PI / 2] }
      ),
      materialIndex: 4
    });
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0.128, -0.044], [0.146, 0], [0.128, 0.044]], 18),
        { pos: [-0.81, 0.032, side * 0.27], rot: [0, 0, -Math.PI / 2] }
      ),
      materialIndex: 6
    });
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0, -0.175], [0.086, -0.175], [0.074, -0.13]], 16),
        { pos: [-0.86, 0.032, side * 0.27], rot: [0, 0, -Math.PI / 2] }
      ),
      materialIndex: 7
    });
    rawSlots.push({
      mesh: transformMesh(
        latheMesh([[0, -0.19], [0.044, -0.188], [0.034, -0.155]], 14),
        { pos: [-0.86, 0.032, side * 0.27], rot: [0, 0, -Math.PI / 2] }
      ),
      materialIndex: 8
    });

    // Articulated canted V-tail stern rudder vanes (hinge post + brass leading vane + carved bone rudder blade)
    rawSlots.push({
      mesh: tubeSweepMesh(
        [
          [-0.84, 0.11, side * 0.27, 0.016],
          [-0.96, 0.24, side * 0.36, 0.013],
          [-1.08, 0.36, side * 0.44, 0.009]
        ],
        10
      ),
      materialIndex: 2
    });
    const rudderSec = (y: number, xLead: number, xTrail: number, halfT: number, zOff: number): V3[] => {
      const pts: V3[] = [];
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const u = 0.5 + 0.5 * Math.cos(a);
        const x = xTrail + (xLead - xTrail) * u;
        const z = zOff + Math.sin(a) * halfT * (0.35 + 0.65 * Math.sin(u * Math.PI));
        pts.push([x, y, z]);
      }
      return pts;
    };
    rawSlots.push({
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            rudderSec(0.12, -0.68, -0.98, 0.018, side * 0.28),
            rudderSec(0.25, -0.8, -1.1, 0.014, side * 0.38),
            rudderSec(0.37, -0.94, -1.18, 0.008, side * 0.46)
          ],
          true,
          false
        ),
        1,
        0.44
      ),
      materialIndex: 4
    });
    rawSlots.push({
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            rudderSec(0.13, -0.92, -1.08, 0.012, side * 0.285),
            rudderSec(0.25, -1.02, -1.19, 0.01, side * 0.385),
            rudderSec(0.36, -1.1, -1.25, 0.006, side * 0.462)
          ],
          true,
          false
        ),
        1,
        0.44
      ),
      materialIndex: 9
    });
  }

  cachedSkiffSlots = finishHeroSlots(rawSlots, (m) => {
    if (m === 7 || m === 8) return [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], 0.06];
    if (m === 4) return [HERO_TINT.brassHighlight, HERO_TINT.brassMid, HERO_TINT.brassPatina, 0.22];
    if (m === 9) return [HERO_TINT.boneSun, HERO_TINT.boneMid, HERO_TINT.boneOchre, 0.24];
    if (m === 3) return [HERO_TINT.leatherSun, HERO_TINT.leatherMid, HERO_TINT.leatherSand, 0.24];
    return [HERO_TINT.clothSun, HERO_TINT.clothMid, HERO_TINT.clothDustHem, 0.24];
  });

  return assembleMultiMaterialNode("board", cachedSkiffSlots, materials, {
    id: "board",
    position: [0, 4, 0],
    scale: options.scale,
    castShadow: true,
    receiveShadow: true,
    coalesceColors: false
  });
}

/** Sculpted anisotropic-brass dorsal spine strake (`id: "board-trim"`, aligned with `state.yaw`, `-Z` forward). */
export function createBoardTrimNode() {
  const spine = finishHeroMesh(
    tubeSweepMesh(
      [
        [0, 0.02, 1.06, 0.018],
        [0, 0.044, 0.42, 0.024],
        [0, 0.048, -0.34, 0.022],
        [0, 0.076, -0.92, 0.017],
        [0, 0.036, -1.24, 0.009]
      ],
      12
    ),
    HERO_TINT.brassHighlight,
    HERO_TINT.brassMid,
    HERO_TINT.brassPatina,
    0.22
  );
  return geometry
    .custom(rawToCustomGeometry(spine), {
      name: "board-trim",
      position: [0, 4, 0],
      castShadow: false,
      receiveShadow: false,
      material: DESERT_MAT.anisotropicBrass
    })
    .runtime({ id: "board-trim" });
}

/** Aft-raked stern route-pennant & brass whip-spar (`id: "board-sail"`, mounted astern clear of the courier silhouette). */
export function createBoardSailNode() {
  const materials: readonly AuraMaterialSpec[] = [
    DESERT_MAT.carvedCedarWood,
    DESERT_MAT.anisotropicBrass,
    DESERT_MAT.sheenTerracottaBanner,
    DESERT_MAT.sheenBonePennant,
    DESERT_MAT.goldEmbroideryTrim
  ];
  const rawSlots: MultiMatSlot[] = [];
  rawSlots.push({
    mesh: tubeSweepMesh(
      [
        [0, -0.18, -0.06, 0.018],
        [-0.02, 0.12, 0.08, 0.014],
        [-0.04, 0.42, 0.28, 0.01],
        [-0.05, 0.62, 0.46, 0.006]
      ],
      10
    ),
    materialIndex: 0
  });
  rawSlots.push({
    mesh: transformMesh(latheMesh([[0, 0.055], [0.024, 0.02], [0.016, -0.02], [0, -0.035]], 14), {
      pos: [-0.05, 0.63, 0.47]
    }),
    materialIndex: 1
  });
  const sailSec = (z: number, y0: number, y1: number, camber: number): V3[] => [
    [-0.008, y0, z],
    [camber, (y0 + y1) * 0.5, z],
    [0.008, y1, z],
    [camber + 0.012, (y0 + y1) * 0.5, z]
  ];
  rawSlots.push({
    mesh: taubinSmoothMesh(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            sailSec(0.06, 0.08, 0.42, -0.03),
            sailSec(0.28, 0.16, 0.5, -0.06),
            sailSec(0.54, 0.24, 0.52, -0.05),
            sailSec(0.78, 0.32, 0.48, -0.02)
          ],
          true,
          false
        ),
        1,
        0.48
      ),
      3
    ),
    materialIndex: 2
  });
  rawSlots.push({
    mesh: taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0, 0.39, 0.72],
        mid: [-0.035, 0.39, 0.98],
        tip: [0.015, 0.38, 1.24],
        width: 0.072,
        thickness: 0.014,
        segments: 10,
        radialSegments: 8
      }),
      3
    ),
    materialIndex: 3
  });
  rawSlots.push({
    mesh: tubeSweepMesh(
      [
        [-0.01, 0.42, 0.06, 0.006],
        [-0.045, 0.51, 0.42, 0.005],
        [-0.02, 0.47, 0.78, 0.004]
      ],
      8
    ),
    materialIndex: 4
  });
  const slots = finishHeroSlots(rawSlots, () => [HERO_TINT.clothSun, HERO_TINT.clothMid, HERO_TINT.clothDustHem, 0.24]);
  return assembleMultiMaterialNode("board-sail", slots, materials, {
    id: "board-sail",
    position: [0, 4, 0],
    castShadow: false,
    receiveShadow: true,
    coalesceColors: false
  });
}

function scarfRibbonSection(z: number, yMid: number, halfW: number, camberX: number, thick = 0.013, archY = 0, pts = 16): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const u = Math.cos(a);
    const v = Math.sin(a);
    const wave = Math.sin(u * Math.PI) * archY * 0.65;
    ring.push([
      camberX + u * halfW,
      yMid + v * thick * (1 - 0.55 * u * u) - u * u * archY + wave,
      z
    ]);
  }
  return ring;
}

/**
 * Journey / Sable-inspired Sculpted Desert Signal Courier Wind-Rider (`id: "rider"`).
 *
 * Planted in an athletic crouched angled surf stance (`y = 0` flush on the skiff's ribbed surf pads, `-Z` forward):
 * - Lead (port) boot planted forward-left `[-0.105, 0, -0.27]` (`yaw +0.42`), lead knee driven forward-left `[-0.175, 0.37, -0.34]`.
 * - Rear (starboard) boot braced athwartships back-right `[+0.125, 0, +0.23]` (`yaw -0.78`), rear drop-knee crouched `[+0.165, 0.33, +0.06]`.
 * - Smoothly faired `sculptAnatomicalLimbMesh` + `taubinSmoothMesh` legs & arms, `sculptStylizedHeadMesh` nomad face framed by an
 *   organically draped `sculptDrapedGarmentMesh` desert cowl & brass-rimmed amber sand-goggles, wind-pleated desert poncho/mantle,
 *   rounded SDF leather courier satchel, faired signal transceiver backpack, and `sculptCurvedHairLockMesh` trailing scarf streamers.
 */
const surferRigCache = new Map<boolean, ReturnType<typeof buildDesertSurferRigNode>>();

export function createDesertSurferRigNode(options: { readonly inked: boolean }) {
  let cached = surferRigCache.get(options.inked);
  if (!cached) {
    cached = buildDesertSurferRigNode(options);
    surferRigCache.set(options.inked, cached);
  }
  return cached;
}

function buildDesertSurferRigNode(options: { readonly inked: boolean }) {
  const materials: readonly AuraMaterialSpec[] = [
    DESERT_MAT.riderTerracottaCloak,  // 0: matte-soft sun-bleached terracotta poncho/mantle, outer cowl, sash & wind-scarf
    DESERT_MAT.riderBoneCloth,        // 1: matte-soft woven bone-linen inner hood fold, scarf secondary ribbon & mantle lining
    DESERT_MAT.riderIndigoCloth,      // 2: matte-soft deep indigo desert nomad tunic, litham face-wrap & split skirt
    DESERT_MAT.riderOchreTunic,       // 3: matte-soft desert ochre/saffron layered riding poncho lining & hip pleats
    DESERT_MAT.linenGaiter,           // 4: spiral wrapped desert linen shin-bindings & forearm bracers
    DESERT_MAT.leatherSaddle,         // 5: oiled desert saddle-leather contoured nomad boots, utility belt & satchel
    DESERT_MAT.leatherDark,           // 6: dark oiled leather knee-cops, boot cross-straps, gloves & goggle strap
    DESERT_MAT.bootRubber,            // 7: lugged desert boot soles
    DESERT_MAT.anisotropicBrass,      // 8: gleaming brass aviator goggle rims, buckles, gauntlets & harmonic pack bezel
    DESERT_MAT.turquoiseGlaze,        // 9: glazed turquoise ceramic canteen & harmonic tuner dials
    DESERT_MAT.goggleLens,            // 10: gleaming clearcoated amber-gold aviator sand-goggle lenses
    options.inked ? DESERT_MAT.signalCoreJade : DESERT_MAT.signalCoreAmber, // 11: glowing dorsal harmonic indicator
    DESERT_MAT.darkRelayIron,         // 12: dark relay-iron compact dorsal transceiver frame
    DESERT_MAT.goldEmbroideryTrim,    // 13: crisp woven gold/brass embroidery trim on mantle, hood, sash & scarf hems
    DESERT_MAT.nomadSunSkin,          // 14: warm sunlit nomad brow/bridge sculpted with `sculptStylizedHeadMesh`
    DESERT_MAT.nomadTrouser           // 15: deep plum-indigo crouched surf riding breeches
  ];

  const tintForRiderMat = (m: number): readonly [V4, V4, V4, number?] => {
    if (m === 11) return [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], 0.05];
    if (m === 8 || m === 13) return [HERO_TINT.brassHighlight, HERO_TINT.brassMid, HERO_TINT.brassPatina, 0.22];
    if (m === 2 || m === 15) return [HERO_TINT.indigoSun, HERO_TINT.indigoMid, HERO_TINT.indigoDeep, 0.24];
    if (m === 5 || m === 6 || m === 7) return [HERO_TINT.leatherSun, HERO_TINT.leatherMid, HERO_TINT.leatherSand, 0.24];
    if (m === 1 || m === 4) return [HERO_TINT.boneSun, HERO_TINT.boneMid, HERO_TINT.boneOchre, 0.24];
    return [HERO_TINT.clothSun, HERO_TINT.clothMid, HERO_TINT.clothDustHem, 0.24];
  };

  // Sculpted organic SDF nomad boot template (`analyticNormals: true` preserved — zero post-pass!)
  const bootShellMesh = sculptOrganicSdfMesh({
    boundsMin: [-0.075, 0.008, -0.175],
    boundsMax: [0.075, 0.168, 0.125],
    resolution: [24, 26, 28],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const heel = sdfEllipsoid([x, y, z], [0, 0.054, 0.036], [0.048, 0.046, 0.068]);
      const vamp = sdfTaperedCapsule([x, y, z], [0, 0.05, 0.03], [0, 0.036, -0.105], 0.048, 0.038);
      const scrollToe = sdfEllipsoid([x, y, z], [0, 0.048, -0.136], [0.032, 0.024, 0.034]);
      const ankleCuff = sdfTaperedCapsule([x, y, z], [0, 0.062, 0.022], [0, 0.148, 0.026], 0.047, 0.051);
      return sminPoly(sminPoly(sminPoly(heel, vamp, 0.024), scrollToe, 0.02), ankleCuff, 0.022);
    }
  });

  // 1. Dynamic Angled Surf Boots & Wrapped Shins (`rider-stance`, flush at y = 0 on skiff deck)
  const stanceRaw: MultiMatSlot[] = [];
  const addSurfBootAndShin = (
    footX: number,
    footZ: number,
    footYaw: number,
    kneeX: number,
    kneeY: number,
    kneeZ: number,
    calfBiasZ: number
  ) => {
    // Sculpted lugged sole + heel block planted flush on y = 0
    stanceRaw.push({
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.106, 0.026, 0.274, 0.009), { pos: [footX, 0.013, footZ - 0.012], rot: [0, footYaw, 0] }),
          1,
          0.35
        ),
        2
      ),
      materialIndex: 7
    });
    // Organic SDF + Taubin-faired oiled-leather desert nomad boot
    stanceRaw.push({
      mesh: transformMesh(bootShellMesh, { pos: [footX, 0, footZ], rot: [0, footYaw, 0] }),
      materialIndex: 5
    });
    // Folded desert boot gaiter cuff (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
    const bootGaiter = taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: 0.102, rx: 0.055, rz: 0.062, z: 0.02, folds: 6, foldAmp: 0.006, superellipseN: 2.1 },
          { y: 0.138, rx: 0.058, rz: 0.065, z: 0.024, folds: 6, foldAmp: 0.008, superellipseN: 2.1 },
          { y: 0.172, rx: 0.053, rz: 0.058, z: 0.026, folds: 5, foldAmp: 0.005, superellipseN: 2.15 }
        ],
        { ringPoints: 26, capEnds: true, smoothPasses: 4 }
      ),
      3
    );
    stanceRaw.push({
      mesh: transformMesh(bootGaiter, { pos: [footX, 0, footZ], rot: [0, footYaw, 0] }),
      materialIndex: 6
    });
    stanceRaw.push({
      mesh: taubinSmoothMesh(
        transformMesh(bevelBoxMesh(0.108, 0.02, 0.092, 0.007), {
          pos: [footX, 0.092, footZ + Math.cos(footYaw) * 0.008],
          rot: [0.16, footYaw, 0]
        }),
        2
      ),
      materialIndex: 8
    });

    // Angled anatomical shin & gastrocnemius calf (`sculptAnatomicalLimbMesh` + Loop + Taubin smoothing)
    const ankleX = footX + Math.sin(footYaw) * 0.02;
    const ankleZ = footZ + Math.cos(footYaw) * 0.022;
    const shinStations = [
      { pos: [ankleX, 0.118, ankleZ] as V3, rx: 0.046, rz: 0.05 },
      {
        pos: [ankleX + (kneeX - ankleX) * 0.34, 0.118 + (kneeY - 0.118) * 0.34, ankleZ + (kneeZ - ankleZ) * 0.34] as V3,
        rx: 0.056,
        rz: 0.062
      },
      {
        pos: [ankleX + (kneeX - ankleX) * 0.68, 0.118 + (kneeY - 0.118) * 0.68, ankleZ + (kneeZ - ankleZ) * 0.68] as V3,
        rx: 0.062,
        rz: 0.067
      },
      { pos: [kneeX, kneeY + 0.012, kneeZ] as V3, rx: 0.056, rz: 0.058 }
    ];
    stanceRaw.push({
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          sculptAnatomicalLimbMesh(shinStations, { ringPoints: 22, capEnds: true, muscleBiasZ: calfBiasZ, peakT: 0.56 }),
          1,
          0.44
        ),
        4
      ),
      materialIndex: 4
    });

    // Helical spiral linen & dark-leather desert shin-wraps + top brass shin buckle
    const wrapPts: V4[] = [];
    const turns = 3.2;
    const steps = 26;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ang = t * Math.PI * 2 * turns + footYaw;
      const cx = ankleX + (kneeX - ankleX) * (0.12 + 0.76 * t);
      const cy = 0.13 + (kneeY - 0.13) * (0.12 + 0.76 * t);
      const cz = ankleZ + (kneeZ - ankleZ) * (0.12 + 0.76 * t);
      const rad = 0.053 + Math.sin(t * Math.PI) * 0.01;
      wrapPts.push([cx + Math.cos(ang) * rad, cy, cz + Math.sin(ang) * rad, 0.0095]);
    }
    stanceRaw.push({ mesh: taubinSmoothMesh(tubeSweepMesh(wrapPts, 8, false), 2), materialIndex: 6 });
    stanceRaw.push({
      mesh: transformMesh(bevelBoxMesh(0.032, 0.028, 0.022, 0.005), {
        pos: [kneeX + (footX < 0 ? -0.048 : 0.048), kneeY - 0.04, kneeZ - 0.02],
        rot: [0, footYaw, 0]
      }),
      materialIndex: 8
    });
  };

  // Lead (left) boot forward-left, knee bent forward-left; Rear (right) boot braced back-right, drop-knee crouched!
  const leadKneeWorld: V3 = [-0.175, 0.37, -0.34];
  const rearKneeWorld: V3 = [0.165, 0.33, 0.06];
  addSurfBootAndShin(-0.105, -0.27, 0.42, leadKneeWorld[0], leadKneeWorld[1], leadKneeWorld[2], 0.012);
  addSurfBootAndShin(0.125, 0.23, -0.78, rearKneeWorld[0], rearKneeWorld[1], rearKneeWorld[2], 0.014);

  const stanceNode = assembleMultiMaterialNode("rider-stance", finishHeroSlots(stanceRaw, tintForRiderMat), materials, {
    castShadow: true,
    receiveShadow: true,
    coalesceColors: false
  });

  // 2. Crouched Angled Surf Thighs, Draped Split Riding Tunic Skirt & Pleated Sash (`id: "rider-pelvis"`, rest = SURFER_PELVIS_REST)
  const pelvisRaw: MultiMatSlot[] = [];
  const [px0, py0, pz0] = SURFER_PELVIS_REST;
  const surfYaw = 0.48; // ~27.5 deg angled board-riding hip alignment
  const leadKneeLocal: V3 = [leadKneeWorld[0] - px0, leadKneeWorld[1] - py0, leadKneeWorld[2] - pz0];
  const rearKneeLocal: V3 = [rearKneeWorld[0] - px0, rearKneeWorld[1] - py0, rearKneeWorld[2] - pz0];
  const leadHipLocal: V3 = [-0.078, -0.005, -0.068];
  const rearHipLocal: V3 = [0.082, -0.005, 0.068];

  // Angled anatomical quadriceps/thighs (`sculptDirectedLimb` -> `sculptAnatomicalLimbMesh` + Loop + Taubin smoothing)
  pelvisRaw.push({
    mesh: sculptDirectedLimb(leadKneeLocal, leadHipLocal, [0.058, 0.06], [0.085, 0.091], [0.094, 0.098], -0.012, 0.48),
    materialIndex: 15
  });
  pelvisRaw.push({
    mesh: sculptDirectedLimb(rearKneeLocal, rearHipLocal, [0.058, 0.06], [0.087, 0.093], [0.095, 0.099], -0.012, 0.46),
    materialIndex: 15
  });

  // Sculpted dark-leather articulated knee-cops & brass rivets on both crouched knees
  for (const [kl, kyaw, kPitch] of [
    [leadKneeLocal, 0.36, 0.42],
    [rearKneeLocal, -0.48, 0.52]
  ] as const) {
    pelvisRaw.push({
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          transformMesh(bevelBoxMesh(0.112, 0.116, 0.084, 0.032), {
            pos: [kl[0] * 1.02, kl[1] + 0.012, kl[2] - 0.026],
            rot: [kPitch, kyaw, 0]
          }),
          1,
          0.44
        ),
        3
      ),
      materialIndex: 6
    });
    pelvisRaw.push({
      mesh: transformMesh(latheMesh([[0, 0.012], [0.018, 0.008], [0.02, 0]], 12), {
        pos: [kl[0] * 1.04, kl[1] + 0.018, kl[2] - 0.066],
        rot: [-Math.PI / 2 + kPitch, kyaw, 0]
      }),
      materialIndex: 8
    });
  }

  // Wind-pleated indigo split nomad riding tunic skirt (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`, capped so steep banks never flash hollow)
  const indigoSkirt = taubinSmoothMesh(
    subdivideSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.185, rx: 0.236, rz: 0.222, z: 0.048, folds: 9, foldAmp: 0.024, superellipseN: 2.15 },
          { y: -0.115, rx: 0.208, rz: 0.19, z: 0.03, folds: 9, foldAmp: 0.02, superellipseN: 2.18 },
          { y: -0.04, rx: 0.18, rz: 0.156, z: 0.014, folds: 8, foldAmp: 0.014, superellipseN: 2.2 },
          { y: 0.035, rx: 0.158, rz: 0.13, z: 0.004, folds: 7, foldAmp: 0.009, superellipseN: 2.25 },
          { y: 0.086, rx: 0.144, rz: 0.116, z: 0, folds: 6, foldAmp: 0.005, superellipseN: 2.25 }
        ],
        { ringPoints: 30, capEnds: true, smoothPasses: 4 }
      ),
      1,
      0.46
    ),
    4
  );
  pelvisRaw.push({ mesh: transformMesh(indigoSkirt, { rot: [0, surfYaw * 0.72, 0] }), materialIndex: 2 });

  // Gold/brass embroidered lower tunic skirt border band
  const goldHemBand = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.204, rx: 0.246, rz: 0.232, z: 0.056, folds: 9, foldAmp: 0.025, superellipseN: 2.15 },
        { y: -0.176, rx: 0.235, rz: 0.22, z: 0.046, folds: 9, foldAmp: 0.023, superellipseN: 2.15 }
      ],
      { ringPoints: 30, capEnds: false, smoothPasses: 4 }
    ),
    3
  );
  pelvisRaw.push({ mesh: transformMesh(goldHemBand, { rot: [0, surfYaw * 0.72, 0] }), materialIndex: 13 });

  // Ochre draped upper hip over-wrap (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
  const ochreHipWrap = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.105, rx: 0.212, rz: 0.182, x: 0.01, z: 0.026, folds: 8, foldAmp: 0.02, superellipseN: 2.15 },
        { y: -0.028, rx: 0.182, rz: 0.15, x: 0.006, z: 0.012, folds: 8, foldAmp: 0.015, superellipseN: 2.2 },
        { y: 0.068, rx: 0.15, rz: 0.122, z: 0, folds: 6, foldAmp: 0.008, superellipseN: 2.25 }
      ],
      { ringPoints: 28, capEnds: true, smoothPasses: 4 }
    ),
    3
  );
  pelvisRaw.push({ mesh: transformMesh(ochreHipWrap, { rot: [0, surfYaw * 0.65, -0.05] }), materialIndex: 3 });

  // Richly pleated terracotta nomad waist-sash (`sculptDrapedGarmentMesh`) + `sculptCurvedHairLockMesh` trailing knotted sash streamers
  const waistSash = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: 0.012, rx: 0.168, rz: 0.136, z: 0.006, folds: 10, foldAmp: 0.012, superellipseN: 2.2 },
        { y: 0.054, rx: 0.174, rz: 0.142, z: 0.004, folds: 10, foldAmp: 0.014, superellipseN: 2.2 },
        { y: 0.094, rx: 0.158, rz: 0.128, z: 0, folds: 9, foldAmp: 0.009, superellipseN: 2.2 }
      ],
      { ringPoints: 28, capEnds: true, smoothPasses: 4 }
    ),
    3
  );
  pelvisRaw.push({ mesh: transformMesh(waistSash, { rot: [0, surfYaw * 0.55, 0] }), materialIndex: 0 });

  // Flowing knotted sash streamers cascading down the trailing starboard hip (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
  pelvisRaw.push({
    mesh: taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0.148, 0.055, 0.058],
        mid: [0.205, -0.085, 0.145],
        tip: [0.238, -0.265, 0.258],
        width: 0.072,
        thickness: 0.022,
        segments: 12,
        radialSegments: 10
      }),
      3
    ),
    materialIndex: 0
  });
  pelvisRaw.push({
    mesh: taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0.136, 0.042, 0.075],
        mid: [0.178, -0.095, 0.175],
        tip: [0.195, -0.245, 0.285],
        width: 0.052,
        thickness: 0.016,
        segments: 10,
        radialSegments: 8
      }),
      3
    ),
    materialIndex: 13
  });

  // Oiled saddle-leather utility belt + engraved brass buckle + glazed turquoise gourd canteen
  pelvisRaw.push({
    mesh: transformMesh(latheMesh([[0.154, 0.044], [0.164, 0.064], [0.154, 0.084]], 22), {
      rot: [0, surfYaw * 0.5, 0],
      scale: [1.06, 1, 0.84]
    }),
    materialIndex: 5
  });
  pelvisRaw.push({
    mesh: transformMesh(bevelBoxMesh(0.068, 0.048, 0.028, 0.008), {
      pos: [-0.042, 0.064, -0.128],
      rot: [0, surfYaw * 0.5, 0]
    }),
    materialIndex: 8
  });
  pelvisRaw.push({
    mesh: taubinSmoothMesh(
      subdivideSmoothMesh(
        transformMesh(latheMesh([[0, -0.066], [0.052, -0.044], [0.058, 0.018], [0.026, 0.058], [0, 0.076]], 18), {
          pos: [-0.148, 0.012, 0.096],
          rot: [0.22, -0.38, 0.18]
        }),
        1,
        0.44
      ),
      3
    ),
    materialIndex: 9
  });

  // 3. Wind-Pleated Desert Nomad Poncho/Mantle, Layered Tunic, SDF Leather Satchel & Signal Transceiver Pack (`id: "rider-torso"`)
  const torsoRaw: MultiMatSlot[] = [];
  const torsoTwist = 0.2;
  // Athletic V-taper sun-bleached ochre desert under-tunic (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
  const underTunic = taubinSmoothMesh(
    subdivideSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.068, rx: 0.158, rz: 0.122, z: 0.01, folds: 7, foldAmp: 0.012, superellipseN: 2.2 },
          { y: 0.048, rx: 0.144, rz: 0.108, z: 0, folds: 6, foldAmp: 0.008, superellipseN: 2.25 },
          { y: 0.188, rx: 0.168, rz: 0.122, z: -0.006, folds: 7, foldAmp: 0.009, superellipseN: 2.2 },
          { y: 0.318, rx: 0.192, rz: 0.128, z: -0.01, folds: 6, foldAmp: 0.007, superellipseN: 2.18 },
          { y: 0.392, rx: 0.132, rz: 0.096, z: -0.012, folds: 5, foldAmp: 0.004, superellipseN: 2.25 }
        ],
        { ringPoints: 28, capEnds: true, smoothPasses: 4 }
      ),
      1,
      0.46
    ),
    4
  );
  torsoRaw.push({ mesh: transformMesh(underTunic, { rot: [0, torsoTwist * 0.55, 0] }), materialIndex: 3 });

  // Flowing wind-pleated Journey/Sable desert poncho & shoulder mantle (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`, capped)
  const desertPoncho = taubinSmoothMesh(
    subdivideSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: 0.015, rx: 0.258, rz: 0.182, x: 0.022, z: 0.046, folds: 10, foldAmp: 0.026, superellipseN: 2.1 },
          { y: 0.115, rx: 0.254, rz: 0.172, x: 0.016, z: 0.032, folds: 10, foldAmp: 0.022, superellipseN: 2.12 },
          { y: 0.222, rx: 0.242, rz: 0.156, x: 0.01, z: 0.014, folds: 9, foldAmp: 0.017, superellipseN: 2.15 },
          { y: 0.322, rx: 0.218, rz: 0.14, x: 0.004, z: -0.004, folds: 8, foldAmp: 0.012, superellipseN: 2.18 },
          { y: 0.384, rx: 0.148, rz: 0.11, z: -0.01, folds: 6, foldAmp: 0.006, superellipseN: 2.22 }
        ],
        { ringPoints: 32, capEnds: true, smoothPasses: 4 }
      ),
      1,
      0.48
    ),
    4
  );
  torsoRaw.push({ mesh: transformMesh(desertPoncho, { rot: [0.04, 0.1, -0.06] }), materialIndex: 0 });

  // Crisp woven gold/brass embroidery trim + bone-linen piping along the poncho's wind-pleated hem
  const ponchoGoldHem = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.014, rx: 0.266, rz: 0.19, x: 0.024, z: 0.054, folds: 10, foldAmp: 0.028, superellipseN: 2.1 },
        { y: 0.022, rx: 0.259, rz: 0.183, x: 0.022, z: 0.045, folds: 10, foldAmp: 0.026, superellipseN: 2.1 }
      ],
      { ringPoints: 32, capEnds: false, smoothPasses: 4 }
    ),
    3
  );
  torsoRaw.push({ mesh: transformMesh(ponchoGoldHem, { rot: [0.04, 0.1, -0.06] }), materialIndex: 13 });

  const ponchoBoneLining = taubinSmoothMesh(
    sculptDrapedGarmentMesh(
      [
        { y: -0.024, rx: 0.262, rz: 0.186, x: 0.024, z: 0.056, folds: 10, foldAmp: 0.025, superellipseN: 2.1 },
        { y: 0.012, rx: 0.254, rz: 0.178, x: 0.021, z: 0.044, folds: 10, foldAmp: 0.022, superellipseN: 2.1 }
      ],
      { ringPoints: 30, capEnds: false, smoothPasses: 4 }
    ),
    3
  );
  torsoRaw.push({ mesh: transformMesh(ponchoBoneLining, { rot: [0.04, 0.1, -0.06] }), materialIndex: 1 });

  // Sculpted high indigo nomad wind-cowl collar (`sculptDrapedGarmentMesh`) + brass cloak clasp brooch on lead shoulder
  torsoRaw.push({
    mesh: taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: 0.308, rx: 0.182, rz: 0.138, z: -0.004, folds: 7, foldAmp: 0.015, superellipseN: 2.15 },
          { y: 0.376, rx: 0.152, rz: 0.126, z: -0.006, folds: 7, foldAmp: 0.012, superellipseN: 2.18 },
          { y: 0.428, rx: 0.124, rz: 0.112, z: -0.004, folds: 6, foldAmp: 0.008, superellipseN: 2.2 }
        ],
        { ringPoints: 28, capEnds: true, smoothPasses: 4 }
      ),
      4
    ),
    materialIndex: 2
  });
  torsoRaw.push({
    mesh: transformMesh(latheMesh([[0, 0.018], [0.032, 0.014], [0.036, 0], [0.028, -0.01]], 18), {
      pos: [-0.118, 0.325, -0.108],
      rot: [-1.18, 0.32, 0.22]
    }),
    materialIndex: 8
  });

  // Cross-body oiled-leather courier bandolier + organic SDF rounded leather satchel (`sculptOrganicSdfMesh`)
  torsoRaw.push({
    mesh: taubinSmoothMesh(
      tubeSweepMesh(
        [
          [-0.146, 0.382, -0.034, 0.018],
          [-0.032, 0.235, -0.128, 0.018],
          [0.098, 0.082, -0.118, 0.018],
          [0.188, -0.02, 0.022, 0.018],
          [0.118, 0.115, 0.138, 0.018],
          [-0.028, 0.27, 0.142, 0.018],
          [-0.146, 0.382, 0.034, 0.018]
        ],
        10,
        false
      ),
      2
    ),
    materialIndex: 5
  });
  const sdfSatchel = sculptOrganicSdfMesh({
    boundsMin: [-0.075, -0.11, -0.12],
    boundsMax: [0.075, 0.11, 0.12],
    resolution: [24, 26, 26],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const pouch = sdfEllipsoid([x, y, z], [0, -0.008, 0], [0.052, 0.084, 0.098]);
      const flap = sdfEllipsoid([x, y, z], [0.012, 0.036, 0], [0.054, 0.056, 0.096]);
      return sminPoly(pouch, flap, 0.018);
    }
  });
  torsoRaw.push({
    mesh: transformMesh(sdfSatchel, { pos: [0.194, -0.032, 0.042], rot: [0.08, 0.22, -0.14] }),
    materialIndex: 5
  });
  torsoRaw.push({
    mesh: transformMesh(bevelBoxMesh(0.102, 0.028, 0.046, 0.006), { pos: [0.204, -0.012, 0.042], rot: [0.08, 0.22, -0.14] }),
    materialIndex: 8
  });

  // Smoothly faired dorsal signal transceiver backpack (`sculptOrganicSdfMesh`, `analyticNormals: true` preserved)
  const packPos: V3 = [0.01, 0.228, 0.154];
  const packRot: V3 = [0.16, 0.06, 0];
  const transceiverHousing = sculptOrganicSdfMesh({
    boundsMin: [-0.11, -0.13, -0.065],
    boundsMax: [0.11, 0.13, 0.065],
    resolution: [24, 26, 24],
    taubinIterations: 7,
    projectToIso: 0.94,
    evaluate: (x, y, z) => {
      const core = sdfEllipsoid([x, y, z], [0, 0, 0], [0.088, 0.108, 0.046]);
      const podL = sdfTaperedCapsule([x, y, z], [-0.068, -0.068, -0.006], [-0.068, 0.072, -0.006], 0.032, 0.028);
      const podR = sdfTaperedCapsule([x, y, z], [0.068, -0.068, -0.006], [0.068, 0.072, -0.006], 0.032, 0.028);
      return sminPoly(sminPoly(core, podL, 0.02), podR, 0.02);
    }
  });
  torsoRaw.push({
    mesh: transformMesh(transceiverHousing, { pos: packPos, rot: packRot }),
    materialIndex: 12
  });
  torsoRaw.push({
    mesh: transformMesh(
      latheMesh([[0.036, -0.014], [0.068, -0.01], [0.072, 0.016], [0.048, 0.024]], 18),
      { pos: [packPos[0], packPos[1] + 0.012, packPos[2] + 0.044], rot: [Math.PI / 2 + packRot[0], 0, 0] }
    ),
    materialIndex: 8
  });
  torsoRaw.push({
    mesh: transformMesh(
      latheMesh([[0, 0.022], [0.036, 0.018], [0.04, 0]], 16),
      { pos: [packPos[0], packPos[1] + 0.012, packPos[2] + 0.048], rot: [Math.PI / 2 + packRot[0], 0, 0] }
    ),
    materialIndex: 11
  });
  torsoRaw.push({
    mesh: tubeSweepMesh(
      [
        [0.068, 0.335, 0.166, 0.007],
        [0.08, 0.49, 0.22, 0.005],
        [0.092, 0.64, 0.29, 0.0032],
        [0.1, 0.76, 0.37, 0.0018]
      ],
      8
    ),
    materialIndex: 8
  });

  // 4. Sculpted Peaked Desert Cowl, Stylized Head (`sculptStylizedHeadMesh`), Nomad Litham & Brass-Rimmed Amber Goggles (`id: "rider-head"`)
  const headRaw: MultiMatSlot[] = [];
  // Stylized anatomical head (`+Z` native rotated `Math.PI` to face `-Z` forward!)
  headRaw.push({
    mesh: taubinSmoothMesh(
      transformMesh(
        sculptStylizedHeadMesh(0.096, {
          jawTaper: 0.26,
          cheekFullness: 0.15,
          noseBridge: 0.2,
          browRidge: 0.14,
          subdivisions: 2,
          seed: 19
        }),
        { pos: [0, 0.128, -0.008], rot: [0, Math.PI, 0] }
      ),
      2
    ),
    materialIndex: 14
  });
  // Wrapped indigo Tuareg-style nomad litham face-veil & throat wrap (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
  headRaw.push({
    mesh: taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.026, rx: 0.076, rz: 0.08, z: 0.008, folds: 6, foldAmp: 0.008, superellipseN: 2.15 },
          { y: 0.042, rx: 0.092, rz: 0.102, z: 0, folds: 7, foldAmp: 0.011, superellipseN: 2.15 },
          { y: 0.108, rx: 0.098, rz: 0.108, z: -0.012, folds: 6, foldAmp: 0.009, superellipseN: 2.18 },
          { y: 0.134, rx: 0.088, rz: 0.098, z: 0.004, folds: 5, foldAmp: 0.005, superellipseN: 2.2 }
        ],
        { ringPoints: 28, capEnds: true, smoothPasses: 4 }
      ),
      3
    ),
    materialIndex: 2
  });
  // Woven bone-linen inner desert brow-cloth framing the eyes & goggles (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
  headRaw.push({
    mesh: taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: 0.088, rx: 0.106, rz: 0.116, z: 0.012, folds: 6, foldAmp: 0.009, superellipseN: 2.15 },
          { y: 0.158, rx: 0.118, rz: 0.132, z: -0.008, folds: 6, foldAmp: 0.01, superellipseN: 2.15 },
          { y: 0.222, rx: 0.11, rz: 0.13, z: 0.016, folds: 6, foldAmp: 0.009, superellipseN: 2.18 },
          { y: 0.264, rx: 0.064, rz: 0.084, z: 0.046, folds: 5, foldAmp: 0.005, superellipseN: 2.2 }
        ],
        { ringPoints: 28, capEnds: true, smoothPasses: 4 }
      ),
      3
    ),
    materialIndex: 1
  });
  // Deeply cowled peaked sun-bleached terracotta desert hood (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
  headRaw.push({
    mesh: taubinSmoothMesh(
      subdivideSmoothMesh(
        sculptDrapedGarmentMesh(
          [
            { y: 0.024, rx: 0.134, rz: 0.136, z: 0.032, folds: 8, foldAmp: 0.018, superellipseN: 2.12 },
            { y: 0.128, rx: 0.138, rz: 0.148, z: 0.022, folds: 7, foldAmp: 0.015, superellipseN: 2.14 },
            { y: 0.224, rx: 0.124, rz: 0.156, z: 0.032, folds: 6, foldAmp: 0.013, superellipseN: 2.16 },
            { y: 0.284, rx: 0.068, rz: 0.102, z: 0.082, folds: 5, foldAmp: 0.008, superellipseN: 2.2 },
            { y: 0.258, rx: 0.024, rz: 0.038, z: 0.172, folds: 4, foldAmp: 0.004, superellipseN: 2.2 }
          ],
          { ringPoints: 30, capEnds: true, smoothPasses: 4 }
        ),
        1,
        0.48
      ),
      4
    ),
    materialIndex: 0
  });
  // Crisp gold/brass embroidery hood cowl trim arch + wind-swept hood streamers (`sculptCurvedHairLockMesh`)
  headRaw.push({
    mesh: taubinSmoothMesh(
      tubeSweepMesh(
        [
          [-0.112, 0.088, -0.048, 0.0065],
          [-0.102, 0.168, -0.088, 0.007],
          [0, 0.216, -0.112, 0.0075],
          [0.102, 0.168, -0.088, 0.007],
          [0.112, 0.088, -0.048, 0.0065]
        ],
        10
      ),
      2
    ),
    materialIndex: 13
  });
  headRaw.push({
    mesh: taubinSmoothMesh(
      sculptCurvedHairLockMesh({
        root: [0, 0.254, 0.155],
        mid: [0.016, 0.218, 0.365],
        tip: [-0.01, 0.162, 0.595],
        width: 0.056,
        thickness: 0.016,
        segments: 12,
        radialSegments: 8
      }),
      3
    ),
    materialIndex: 1
  });
  // Oiled dark-leather goggle strap + gleaming brass-rimmed aviator sand goggles with convex amber-gold lenses
  headRaw.push({
    mesh: transformMesh(latheMesh([[0.122, 0.132], [0.128, 0.146], [0.122, 0.16]], 20), {
      pos: [0, 0, 0.014],
      scale: [1.02, 1, 1.14]
    }),
    materialIndex: 6
  });
  for (const side of [-1, 1] as const) {
    const gx = side * 0.048;
    // Sculpted leather side sand-shield cup
    headRaw.push({
      mesh: transformMesh(
        latheMesh([[0.032, -0.026], [0.044, -0.012], [0.042, 0.008]], 18),
        { pos: [gx, 0.146, -0.098], rot: [-Math.PI / 2, side * 0.22, 0] }
      ),
      materialIndex: 6
    });
    // Gleaming brushed-brass aviator ocular bezel
    headRaw.push({
      mesh: transformMesh(
        latheMesh([[0.032, -0.014], [0.045, -0.008], [0.046, 0.016], [0.037, 0.024]], 20),
        { pos: [gx, 0.146, -0.104], rot: [-Math.PI / 2, side * 0.22, 0] }
      ),
      materialIndex: 8
    });
    // Convex clearcoated amber-gold aviator sand lens
    headRaw.push({
      mesh: transformMesh(
        latheMesh([[0, 0.023], [0.024, 0.021], [0.036, 0.014], [0.038, 0.006]], 20),
        { pos: [gx, 0.146, -0.108], rot: [-Math.PI / 2, side * 0.22, 0] }
      ),
      materialIndex: 10
    });
  }
  // Brass aviator nose-bridge & brow bar
  headRaw.push({
    mesh: tubeSweepMesh(
      [
        [-0.024, 0.154, -0.115, 0.006],
        [0, 0.16, -0.12, 0.0065],
        [0.024, 0.154, -0.115, 0.006]
      ],
      8
    ),
    materialIndex: 8
  });

  // 5A & 5B. Dynamic Asymmetric Wind-Surfer Balance Arms (`rider-arm-lead` & `rider-arm-trail` at symmetric pivots [+-0.19, 0.33, -0.02])
  const buildSurferArmSlots = (side: -1 | 1): MultiMatSlot[] => {
    const isLead = side < 0;
    const elbow: V3 = isLead ? [-0.088, -0.105, -0.155] : [0.118, -0.102, 0.095];
    const wrist: V3 = isLead ? [-0.048, -0.142, -0.325] : [0.225, -0.138, 0.238];
    const handDirZ = isLead ? -1 : 0.72;
    const handDirX = isLead ? 0.18 : 0.68;
    const handYaw = Math.atan2(-handDirX, -handDirZ);
    const sleeveCuff = taubinSmoothMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.145, rx: 0.084, rz: 0.084, folds: 7, foldAmp: 0.012, superellipseN: 2.15 },
          { y: -0.065, rx: 0.088, rz: 0.086, folds: 7, foldAmp: 0.01, superellipseN: 2.18 },
          { y: 0.024, rx: 0.072, rz: 0.074, folds: 5, foldAmp: 0.005, superellipseN: 2.2 }
        ],
        { ringPoints: 26, capEnds: true, smoothPasses: 4 }
      ),
      3
    );
    const eLen = Math.max(0.05, Math.hypot(elbow[0], elbow[1], elbow[2]));
    const cuffRx = Math.asin(Math.max(-1, Math.min(1, -elbow[2] / eLen)));
    const cuffRz = Math.atan2(elbow[0], -elbow[1]);
    const handPalm = sculptOrganicSdfMesh({
      boundsMin: [-0.055, -0.036, -0.068],
      boundsMax: [0.055, 0.036, 0.068],
      resolution: [22, 22, 24],
      taubinIterations: 7,
      projectToIso: 0.94,
      evaluate: (x, y, z) => {
        const palm = sdfEllipsoid([x, y, z], [0, 0, 0.008], [0.036, 0.02, 0.042]);
        const fingers = sdfEllipsoid([x, y, z], [0, -0.004, -0.034], [0.032, 0.015, 0.028]);
        return sminPoly(palm, fingers, 0.014);
      }
    });
    const armSlots: MultiMatSlot[] = [
      // Draped nomad poncho shoulder sleeve cuff (`sculptDrapedGarmentMesh` + `taubinSmoothMesh`)
      {
        mesh: transformMesh(sleeveCuff, { rot: [cuffRx, 0, cuffRz] }),
        materialIndex: isLead ? 2 : 0
      },
      // Anatomical upper arm (deltoid -> bicep -> elbow)
      {
        mesh: sculptDirectedLimb([0, 0, 0], elbow, [0.056, 0.058], [0.053, 0.056], [0.044, 0.046], 0.008, 0.42),
        materialIndex: 2
      },
      // Anatomical wrapped linen forearm bracer (elbow -> wrist)
      {
        mesh: sculptDirectedLimb(elbow, wrist, [0.045, 0.047], [0.042, 0.044], [0.033, 0.035], 0.006, 0.36),
        materialIndex: 4
      },
      // Gleaming brushed-brass wrist gauntlet cuff
      {
        mesh: taubinSmoothMesh(
          subdivideSmoothMesh(
            transformMesh(bevelBoxMesh(0.068, 0.052, 0.076, 0.014), {
              pos: [
                elbow[0] + (wrist[0] - elbow[0]) * 0.84,
                elbow[1] + (wrist[1] - elbow[1]) * 0.84,
                elbow[2] + (wrist[2] - elbow[2]) * 0.84
              ],
              rot: [0.12, handYaw, side * 0.14]
            }),
            1,
            0.4
          ),
          2
        ),
        materialIndex: 8
      },
      // Organic SDF dark-leather wind-surfer gloved hand + sculpted thumb (`sculptCurvedHairLockMesh`)
      {
        mesh: transformMesh(handPalm, {
          pos: [wrist[0] + handDirX * 0.04, wrist[1] - 0.004, wrist[2] + handDirZ * 0.04],
          rot: [0.1, handYaw, side * 0.18]
        }),
        materialIndex: 6
      },
      {
        mesh: taubinSmoothMesh(
          sculptCurvedHairLockMesh({
            root: [wrist[0] + handDirX * 0.018 - side * 0.024, wrist[1] - 0.006, wrist[2] + handDirZ * 0.018],
            mid: [wrist[0] + handDirX * 0.042 - side * 0.035, wrist[1] - 0.014, wrist[2] + handDirZ * 0.038],
            tip: [wrist[0] + handDirX * 0.064 - side * 0.04, wrist[1] - 0.022, wrist[2] + handDirZ * 0.058],
            width: 0.024,
            thickness: 0.018,
            segments: 8,
            radialSegments: 8
          }),
          2
        ),
        materialIndex: 6
      }
    ];
    return finishHeroSlots(armSlots, tintForRiderMat);
  };
  const leadArmSlots = buildSurferArmSlots(-1);
  const trailArmSlots = buildSurferArmSlots(1);

  // 6. Billowing Wind-Pleated Mantle Back-Drape & Multi-Streamer Scarf (`id: "rider-scarf"` + `id: "rider-scarf-tip"`)
  const scarfBaseRaw: MultiMatSlot[] = [
    // Billowing Journey-inspired pleated desert poncho back-panel streaming aft (+Z), Taubin-faired
    {
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              scarfRibbonSection(0.02, -0.18, 0.21, 0.01, 0.016, 0.028, 24),
              scarfRibbonSection(0.22, -0.255, 0.252, 0.024, 0.014, 0.038, 24),
              scarfRibbonSection(0.45, -0.328, 0.282, -0.014, 0.012, 0.048, 24)
            ],
            true,
            false
          ),
          2,
          0.52
        ),
        4
      ),
      materialIndex: 0
    },
    // Crisp gold/brass embroidered border hem along the trailing wind-cloak
    {
      mesh: taubinSmoothMesh(
        subdivideSmoothMesh(
          loftSectionsMesh(
            [
              scarfRibbonSection(0.42, -0.318, 0.278, -0.01, 0.012, 0.046, 24),
              scarfRibbonSection(0.52, -0.356, 0.288, 0.012, 0.009, 0.05, 24)
            ],
            true,
            false
          ),
          1,
          0.5
        ),
        3
      ),
      materialIndex: 13
    },
    // Primary terracotta upper wind-scarf ribbon (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
    {
      mesh: taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [-0.01, 0.028, 0.0],
          mid: [0.028, 0.008, 0.3],
          tip: [0.014, -0.024, 0.59],
          width: 0.195,
          thickness: 0.026,
          segments: 16,
          radialSegments: 12
        }),
        4
      ),
      materialIndex: 0
    },
    // Secondary woven bone-linen asymmetric wind-scarf streamer (`sculptCurvedHairLockMesh` + `taubinSmoothMesh`)
    {
      mesh: taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [-0.068, -0.016, 0.02],
          mid: [-0.098, -0.044, 0.26],
          tip: [-0.072, -0.074, 0.52],
          width: 0.125,
          thickness: 0.02,
          segments: 14,
          radialSegments: 12
        }),
        4
      ),
      materialIndex: 1
    }
  ];
  const scarfTipRaw: MultiMatSlot[] = [
    {
      mesh: taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [0.014, 0.0, 0.0],
          mid: [-0.026, -0.018, 0.3],
          tip: [0.018, -0.036, 0.62],
          width: 0.175,
          thickness: 0.02,
          segments: 16,
          radialSegments: 12
        }),
        4
      ),
      materialIndex: 0
    },
    // Gold-embroidered swallowtail scarf tip streamer (`sculptCurvedHairLockMesh` extending to z = 0.88 -> maxWorldZ > 1.45)
    {
      mesh: taubinSmoothMesh(
        sculptCurvedHairLockMesh({
          root: [0.016, -0.032, 0.54],
          mid: [-0.012, -0.042, 0.72],
          tip: [-0.018, -0.052, 0.88],
          width: 0.098,
          thickness: 0.014,
          segments: 12,
          radialSegments: 10
        }),
        3
      ),
      materialIndex: 13
    }
  ];

  const scarfTipNode = assembleMultiMaterialNode(
    "rider-scarf-tip",
    finishHeroSlots(scarfTipRaw, tintForRiderMat),
    materials,
    {
      id: "rider-scarf-tip",
      position: [0, -0.024, 0.54],
      castShadow: false,
      receiveShadow: true,
      coalesceColors: false
    }
  );
  const scarfNode = group(
    "rider-scarf",
    [
      assembleMultiMaterialNode("rider-scarf-mesh", finishHeroSlots(scarfBaseRaw, tintForRiderMat), materials, {
        castShadow: false,
        receiveShadow: true,
        coalesceColors: false
      }),
      scarfTipNode
    ],
    { position: [0, 0.35, 0.098], rotation: [0.08, 0, 0], rotationOrder: "ZYX" }
  ).runtime({ id: "rider-scarf" });

  const headNode = assembleMultiMaterialNode("rider-head", finishHeroSlots(headRaw, tintForRiderMat), materials, {
    id: "rider-head",
    position: [0, 0.382, -0.02],
    castShadow: false,
    receiveShadow: true,
    coalesceColors: false
  });
  const leadArmNode = assembleMultiMaterialNode("rider-arm-lead", leadArmSlots, materials, {
    id: "rider-arm-lead",
    position: [-0.19, 0.33, -0.02],
    castShadow: false,
    receiveShadow: true,
    coalesceColors: false
  });
  const trailArmNode = assembleMultiMaterialNode("rider-arm-trail", trailArmSlots, materials, {
    id: "rider-arm-trail",
    position: [0.19, 0.33, -0.02],
    castShadow: false,
    receiveShadow: true,
    coalesceColors: false
  });
  const torsoMeshNode = assembleMultiMaterialNode("rider-torso-mesh", finishHeroSlots(torsoRaw, tintForRiderMat), materials, {
    castShadow: true,
    receiveShadow: true,
    coalesceColors: false
  });
  const torsoNode = group(
    "rider-torso",
    [torsoMeshNode, headNode, leadArmNode, trailArmNode, scarfNode],
    { position: [0, 0.055, -0.01], rotationOrder: "ZYX" }
  ).runtime({ id: "rider-torso" });

  const pelvisMeshNode = assembleMultiMaterialNode("rider-pelvis-mesh", finishHeroSlots(pelvisRaw, tintForRiderMat), materials, {
    castShadow: true,
    receiveShadow: true,
    coalesceColors: false
  });
  const pelvisNode = group(
    "rider-pelvis",
    [pelvisMeshNode, torsoNode],
    { position: [...SURFER_PELVIS_REST], rotationOrder: "ZYX" }
  ).runtime({ id: "rider-pelvis" });

  return group("rider", [stanceNode, pelvisNode], { position: [0, 4, 0], rotationOrder: "ZYX" }).runtime({ id: "rider" });
}

/** Sculpted ancient brass-and-ceramic tow signal pod (`id: "tow-shell"` + `id: "tow-glow"`). */
export function createTowRelicNodes(farPos: V3) {
  const shellMats: readonly AuraMaterialSpec[] = [
    DESERT_MAT.sandstoneBleached,
    DESERT_MAT.anisotropicBrass,
    DESERT_MAT.turquoiseGlaze
  ];
  const shellSlots: MultiMatSlot[] = [
    {
      mesh: latheMesh(
        [
          [0, -0.95],
          [0.72, -0.78],
          [1.48, -0.22],
          [1.56, 0.16],
          [1.12, 0.64],
          [0.54, 0.88],
          [0, 0.96]
        ],
        18
      ),
      materialIndex: 0
    },
    {
      mesh: latheMesh(
        [
          [1.5, -0.1],
          [1.64, 0.04],
          [1.5, 0.18]
        ],
        18
      ),
      materialIndex: 1
    },
    {
      mesh: latheMesh(
        [
          [0.52, 0.78],
          [0.68, 0.9],
          [0.36, 1.04],
          [0, 1.08]
        ],
        14
      ),
      materialIndex: 2
    }
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const rib = tubeSweepMesh(
      [
        [Math.cos(a) * 0.55, -0.82, Math.sin(a) * 0.55, 0.07],
        [Math.cos(a) * 1.58, 0.02, Math.sin(a) * 1.58, 0.08],
        [Math.cos(a) * 0.52, 0.86, Math.sin(a) * 0.52, 0.065]
      ],
      6
    );
    shellSlots.push({ mesh: rib, materialIndex: 1 });
  }
  const shell = assembleMultiMaterialNode("tow-shell", shellSlots, shellMats, {
    id: "tow-shell",
    position: farPos,
    castShadow: false,
    receiveShadow: true
  });
  const glow = geometry
    .custom(rawToCustomGeometry(icosphereFacetMesh(0.62, 1, 0.04, 19)), {
      name: "tow-glow",
      position: farPos,
      castShadow: false,
      receiveShadow: false,
      material: DESERT_MAT.signalCoreAmber
    })
    .runtime({ id: "tow-glow" });
  return [shell, glow] as const;
}

/* ------------------------------------------------------------------ 2. Cached Instanced Prop & Ruin Specs */

function flutedRing(y: number, radius: number, flutes: number, fluteDepth = 0.08): V3[] {
  const pts = flutes * 2;
  const ring: V3[] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = radius * (i % 2 === 0 ? 1 : 1 - fluteDepth);
    ring.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return ring;
}

let _ringGateSpec: AuraCustomGeometrySpec | null = null;
/** Sculpted sandstone-and-brass ring gate (`outerR ~ 0.95` in XY, matching `ringclean.glb` bounds). */
export function ringGateSpec(): AuraCustomGeometrySpec {
  if (_ringGateSpec) return _ringGateSpec;
  const segs = 28;
  const spine: V4[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    spine.push([Math.cos(a) * 0.855, Math.sin(a) * 0.855, 0, 0.095]);
  }
  const parts: RawMesh[] = [
    colorizeMesh(tubeSweepMesh(spine, 8, true), (_x, y) => {
      const sun = 0.88 + 0.12 * Math.max(0, y);
      return [0.94 * sun, 0.83 * sun, 0.66 * sun, 1];
    })
  ];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const clasp = transformMesh(bevelBoxMesh(0.16, 0.24, 0.26, 0.03), {
      pos: [Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0],
      rot: [0, 0, a]
    });
    parts.push(colorizeMesh(clasp, () => (k % 2 === 0 ? [0.84, 0.63, 0.34, 1] : [0.42, 0.72, 0.62, 1])));
  }
  _ringGateSpec = mergeColoredSpec(parts);
  return _ringGateSpec;
}

let _flutedDrumSpec: AuraCustomGeometrySpec | null = null;
/** Fluted weathered sandstone column drum (`height = 1.9 m` centered at origin, replacing `pillar.glb` in `dressing-drums`). */
export function flutedColumnDrumSpec(): AuraCustomGeometrySpec {
  if (_flutedDrumSpec) return _flutedDrumSpec;
  const basePlinth = latheMesh(
    [
      [0, -0.95],
      [0.58, -0.95],
      [0.6, -0.82],
      [0.52, -0.72]
    ],
    16,
    true
  );
  const shaft = loftSectionsMesh(
    [
      flutedRing(-0.74, 0.5, 12, 0.09),
      flutedRing(-0.1, 0.48, 12, 0.09),
      flutedRing(0.58, 0.46, 12, 0.09),
      flutedRing(0.88, 0.49, 12, 0.05),
      flutedRing(0.95, 0.42, 12, 0.03)
    ],
    true,
    true
  );
  _flutedDrumSpec = mergeColoredSpec([
    colorizeMesh(basePlinth, () => [0.76, 0.6, 0.42, 1]),
    colorizeMesh(shaft, (_x, y) => {
      const t = (y + 0.95) / 1.9;
      return [0.82 + 0.16 * t, 0.68 + 0.18 * t, 0.48 + 0.2 * t, 1];
    })
  ]);
  return _flutedDrumSpec;
}

let _ruinArchSpec: AuraCustomGeometrySpec | null = null;
/** Half-buried sandstone voussoir ruin arch (`width ~ 1.9 m`, replacing `canyonrocks` in `dressing-ruins`). */
export function halfBuriedRuinArchSpec(): AuraCustomGeometrySpec {
  if (_ruinArchSpec) return _ruinArchSpec;
  const archSlots = archwayVoussoirSlots({
    radius: 0.42,
    thickness: 0.24,
    depth: 0.38,
    voussoirs: 7,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 2
  });
  const parts: RawMesh[] = [];
  for (const s of archSlots) {
    const lifted = transformMesh(s.mesh, { pos: [0, 0.08, 0], rot: [0.05, 0, -0.06] });
    const shade: V4 =
      s.materialIndex === 2 ? [0.96, 0.84, 0.64, 1] : s.materialIndex === 0 ? [0.9, 0.74, 0.54, 1] : [0.82, 0.65, 0.47, 1];
    parts.push(colorizeMesh(lifted, () => shade));
  }
  for (const side of [-1, 1] as const) {
    const pier = transformMesh(bevelBoxMesh(0.28, 0.86, 0.42, 0.035), {
      pos: [side * 0.54, -0.32, 0],
      rot: [0, 0, -0.06]
    });
    parts.push(colorizeMesh(pier, (_x, y) => (y < -0.45 ? [0.76, 0.58, 0.39, 1] : [0.88, 0.73, 0.54, 1])));
  }
  _ruinArchSpec = mergeColoredSpec(parts);
  return _ruinArchSpec;
}

let _tamariskCanopySpec: AuraCustomGeometrySpec | null = null;
let _tamariskTrunkSpec: AuraCustomGeometrySpec | null = null;
let _scrubBushSpec: AuraCustomGeometrySpec | null = null;
/** Wind-sheared turquoise oasis tamarisk foliage crown (`y in [0.62, 1.684]`, matching `treeWind.assetHeight`). */
export function desertTamariskCanopySpec(): AuraCustomGeometrySpec {
  if (_tamariskCanopySpec) return _tamariskCanopySpec;
  const mainCrown = transformMesh(layeredCanopyMesh({ radius: 0.45, height: 0.84, puffs: 9, seed: 23 }), {
    pos: [0.03, 0.84, 0],
    scale: [1.08, 0.92, 1.0]
  });
  const sideCrown = transformMesh(layeredCanopyMesh({ radius: 0.32, height: 0.56, puffs: 7, seed: 41 }), {
    pos: [-0.18, 0.67, 0.08],
    scale: [1.1, 0.86, 1.02]
  });
  const crestCrown = transformMesh(layeredCanopyMesh({ radius: 0.26, height: 0.44, puffs: 5, seed: 59 }), {
    pos: [0.15, 1.18, -0.05],
    scale: [1.04, 0.84, 0.98]
  });
  _tamariskCanopySpec = mergeColoredSpec([
    colorizeMesh(mainCrown, (_x, y) => {
      const k = 0.82 + 0.24 * Math.max(0, Math.min(1, (y - 0.8) / 0.85));
      return [k * 0.9, k * 1.04, k * 0.98, 1];
    }),
    colorizeMesh(sideCrown, () => [0.78, 0.96, 0.92, 1]),
    colorizeMesh(crestCrown, () => [0.94, 1.08, 1.02, 1])
  ]);
  return _tamariskCanopySpec;
}

/** Smooth multi-lobed turquoise oasis / desert scrub bush (`layeredCanopyMesh` + gnarled root stems, merged for instancing). */
export function desertScrubBushSpec(): AuraCustomGeometrySpec {
  if (_scrubBushSpec) return _scrubBushSpec;
  const centerMound = transformMesh(layeredCanopyMesh({ radius: 0.52, height: 0.62, puffs: 8, seed: 71 }), {
    pos: [0, 0.16, 0],
    scale: [1.14, 0.78, 1.08]
  });
  const flankMound = transformMesh(layeredCanopyMesh({ radius: 0.36, height: 0.46, puffs: 6, seed: 89 }), {
    pos: [0.28, 0.12, 0.14],
    scale: [1.08, 0.74, 1.02]
  });
  const stem = tubeSweepMesh([[0, -0.08, 0, 0.08], [0.04, 0.2, 0.02, 0.045]], 6);
  _scrubBushSpec = mergeColoredSpec([
    colorizeMesh(stem, () => [0.48, 0.36, 0.25, 1]),
    colorizeMesh(centerMound, (_x, y) => {
      const k = 0.8 + 0.26 * Math.max(0, Math.min(1, y / 0.68));
      return [k * 0.88, k * 1.05, k * 0.98, 1];
    }),
    colorizeMesh(flankMound, () => [0.84, 1.02, 0.96, 1])
  ]);
  return _scrubBushSpec;
}

/** Gnarled multi-forked desert tamarisk trunk (`y in [0, 1.05]`). */
export function desertTamariskTrunkSpec(): AuraCustomGeometrySpec {
  if (_tamariskTrunkSpec) return _tamariskTrunkSpec;
  const main = tubeSweepMesh(
    [
      [0, 0, 0, 0.11],
      [-0.02, 0.32, 0.01, 0.078],
      [0.03, 0.68, -0.01, 0.056],
      [0.06, 1.04, 0, 0.03]
    ],
    7
  );
  const bough = tubeSweepMesh(
    [
      [0, 0.42, 0, 0.052],
      [-0.12, 0.64, 0.05, 0.038],
      [-0.22, 0.82, 0.08, 0.022]
    ],
    6
  );
  _tamariskTrunkSpec = mergeRawMeshes([main, bough]);
  return _tamariskTrunkSpec;
}

let _yardangRockSpec: AuraCustomGeometrySpec | null = null;
let _screeBoulderSpec: AuraCustomGeometrySpec | null = null;
/** Stratified canyon yardang outcrop (`width ~ 1.9 m`, replacing `canyonrocks.glb` in `rocks`). */
export function canyonYardangRockSpec(): AuraCustomGeometrySpec {
  if (_yardangRockSpec) return _yardangRockSpec;
  const main = transformMesh(stratifiedCliffMesh({ radiusX: 0.92, radiusZ: 0.76, height: 1.56, terraces: 5, seed: 17 }), {
    pos: [0, -0.68, 0]
  });
  const shoulder = transformMesh(stratifiedCliffMesh({ radiusX: 0.52, radiusZ: 0.48, height: 1.04, terraces: 4, seed: 53 }), {
    pos: [0.46, -0.68, 0.22],
    rot: [0, 0.6, -0.08]
  });
  const strataColor = (_x: number, y: number, z: number): V4 => {
    const band = Math.sin((y + 0.7) * 7.5 + z * 1.4);
    if (band > 0.35) return [0.95, 0.8, 0.62, 1];
    if (band < -0.3) return [0.72, 0.46, 0.36, 1];
    return [0.86, 0.64, 0.48, 1];
  };
  _yardangRockSpec = mergeColoredSpec([colorizeMesh(main, strataColor), colorizeMesh(shoulder, strataColor)]);
  return _yardangRockSpec;
}

/** Faceted desert scree boulder (`rocks-small`). */
export function desertScreeBoulderSpec(): AuraCustomGeometrySpec {
  if (_screeBoulderSpec) return _screeBoulderSpec;
  const rock = icosphereFacetMesh(0.56, 1, 0.2, 37);
  _screeBoulderSpec = rawToCustomGeometry(
    colorizeMesh(rock, (_x, y) => (y > 0.08 ? [0.92, 0.78, 0.6, 1] : [0.74, 0.56, 0.43, 1]))
  );
  return _screeBoulderSpec;
}

let _adobeWallsSpec: AuraCustomGeometrySpec | null = null;
let _adobeDetailsSpec: AuraCustomGeometrySpec | null = null;
/** Sun-baked desert adobe dwelling (`1.64 x 0.88 x 0.96` exact collider footprint `houses`). */
export function duneAdobeWallsSpec(): AuraCustomGeometrySpec {
  if (_adobeWallsSpec) return _adobeWallsSpec;
  const wallSec = (y: number, hx: number, hz: number): V3[] => [
    [-hx, y, -hz],
    [hx, y, -hz],
    [hx, y, hz],
    [-hx, y, hz]
  ];
  const body = loftSectionsMesh(
    [wallSec(0, 0.81, 0.47), wallSec(0.56, 0.78, 0.45), wallSec(0.76, 0.76, 0.44), wallSec(0.81, 0.79, 0.46)],
    true,
    true
  );
  const windCatcher = transformMesh(bevelBoxMesh(0.42, 0.22, 0.36, 0.02), { pos: [-0.34, 0.77, -0.08] });
  _adobeWallsSpec = mergeColoredSpec([
    colorizeMesh(body, (_x, y) => (y < 0.18 ? [0.82, 0.66, 0.46, 1] : [0.97, 0.9, 0.78, 1])),
    colorizeMesh(windCatcher, () => [0.95, 0.86, 0.72, 1])
  ]);
  return _adobeWallsSpec;
}

/** Terracotta threshold awning, recessed doorway & projecting cedar roof vigas (`houses-details`). */
export function duneAdobeDetailsSpec(): AuraCustomGeometrySpec {
  if (_adobeDetailsSpec) return _adobeDetailsSpec;
  const parts: RawMesh[] = [
    colorizeMesh(transformMesh(bevelBoxMesh(0.52, 0.06, 0.24, 0.015), { pos: [0.12, 0.54, 0.49], rot: [0.24, 0, 0] }), () => [0.84, 0.42, 0.29, 1]),
    colorizeMesh(transformMesh(bevelBoxMesh(0.26, 0.46, 0.04, 0.01), { pos: [0.12, 0.23, 0.455] }), () => [0.22, 0.16, 0.14, 1])
  ];
  for (let i = -2; i <= 2; i++) {
    const viga = transformMesh(bevelBoxMesh(0.055, 0.055, 1.02, 0.01), { pos: [i * 0.29, 0.69, 0] });
    parts.push(colorizeMesh(viga, () => [0.46, 0.3, 0.19, 1]));
  }
  _adobeDetailsSpec = mergeColoredSpec(parts);
  return _adobeDetailsSpec;
}

let _lanternPostSpec: AuraCustomGeometrySpec | null = null;
/** Gooseneck bronze desert lantern post (`height = 1.9 m` centered on `[-0.95, +0.95]`, replacing `lantern.glb`). */
export function desertLanternPostSpec(): AuraCustomGeometrySpec {
  if (_lanternPostSpec) return _lanternPostSpec;
  const plinth = latheMesh([[0, -0.95], [0.22, -0.95], [0.2, -0.78], [0.11, -0.68]], 10, true);
  const mast = tubeSweepMesh(
    [
      [0, -0.7, 0, 0.055],
      [0, 0.15, 0, 0.042],
      [0.04, 0.68, 0, 0.034],
      [0.2, 0.88, 0, 0.028],
      [0.34, 0.78, 0, 0.022]
    ],
    7
  );
  const lantern = transformMesh(
    latheMesh([[0, -0.22], [0.11, -0.14], [0.14, 0.02], [0.09, 0.14], [0, 0.2]], 10, true),
    { pos: [0.34, 0.58, 0] }
  );
  _lanternPostSpec = mergeColoredSpec([
    colorizeMesh(plinth, () => [0.76, 0.64, 0.48, 1]),
    colorizeMesh(mast, () => [0.84, 0.66, 0.38, 1]),
    colorizeMesh(lantern, (_x, y) => (Math.abs(y - 0.58) < 0.09 ? [1.35, 0.98, 0.54, 1] : [0.82, 0.62, 0.34, 1]))
  ]);
  return _lanternPostSpec;
}

let _pierSpec: AuraCustomGeometrySpec | null = null;
let _mastSpec: AuraCustomGeometrySpec | null = null;
let _monolithBodySpec: AuraCustomGeometrySpec | null = null;
let _monolithCapSpec: AuraCustomGeometrySpec | null = null;
let _routePennantSpec: AuraCustomGeometrySpec | null = null;

export function flutedStonePierSpec(): AuraCustomGeometrySpec {
  if (_pierSpec) return _pierSpec;
  _pierSpec = rawToCustomGeometry(
    loftSectionsMesh([flutedRing(-0.5, 0.52, 12, 0.07), flutedRing(0, 0.48, 12, 0.07), flutedRing(0.5, 0.51, 12, 0.05)], true, true)
  );
  return _pierSpec;
}

export function collaredBronzeMastSpec(): AuraCustomGeometrySpec {
  if (_mastSpec) return _mastSpec;
  _mastSpec = rawToCustomGeometry(
    latheMesh([[0, -0.5], [0.52, -0.5], [0.46, -0.36], [0.44, 0.12], [0.54, 0.18], [0.42, 0.24], [0.38, 0.48], [0, 0.5]], 14)
  );
  return _mastSpec;
}

export function windCarvedMonolithSpec(): AuraCustomGeometrySpec {
  if (_monolithBodySpec) return _monolithBodySpec;
  const sec = (y: number, wx: number, wz: number, twist: number, undercut = 0): V3[] => {
    const c = Math.cos(twist), s = Math.sin(twist);
    const pts: readonly V2[] = [
      [-wx * (1 - undercut), -wz * 0.62],
      [0, -wz * 1.06],
      [wx * (1 - undercut), -wz * 0.62],
      [wx * 0.88, wz * 0.58],
      [0, wz * 1.04],
      [-wx * 0.88, wz * 0.58]
    ];
    return pts.map(([x, z]) => [x * c - z * s, y, x * s + z * c]);
  };
  const sculpted = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        sec(-0.5, 0.56, 0.56, 0, 0),
        sec(-0.24, 0.43, 0.45, 0.04, 0.14),
        sec(0.06, 0.48, 0.49, 0.09, 0.04),
        sec(0.32, 0.36, 0.38, 0.15, 0.08),
        sec(0.47, 0.25, 0.27, 0.18, 0),
        sec(0.5, 0.16, 0.18, 0.2, 0)
      ],
      true,
      true
    ),
    1,
    0.46
  );
  _monolithBodySpec = rawToCustomGeometry(sculpted);
  return _monolithBodySpec;
}

export function resonatorDishCapSpec(): AuraCustomGeometrySpec {
  if (_monolithCapSpec) return _monolithCapSpec;
  _monolithCapSpec = rawToCustomGeometry(
    latheMesh([[0, -0.5], [0.24, -0.45], [0.5, 0.12], [0.44, 0.32], [0.16, 0.08], [0.06, 0.5], [0, 0.5]], 16)
  );
  return _monolithCapSpec;
}

let _batchedMesaSpireSpec: AuraCustomGeometrySpec | null = null;
let _batchedPylonBodySpec: AuraCustomGeometrySpec | null = null;
let _batchedRelayDishSpec: AuraCustomGeometrySpec | null = null;
let _batchedSolarArraySpec: AuraCustomGeometrySpec | null = null;

export function billowingRoutePennantSpec(): AuraCustomGeometrySpec {
  if (_routePennantSpec) return _routePennantSpec;
  const wave = (x: number, h: number, zOff: number): V3[] => [
    [x, -h, zOff - 0.35],
    [x, 0, zOff + 0.45],
    [x, h, zOff - 0.25],
    [x, 0, zOff + 0.55]
  ];
  _routePennantSpec = rawToCustomGeometry(
    loftSectionsMesh([wave(-0.5, 0.5, 0), wave(-0.1, 0.44, 0.22), wave(0.28, 0.3, -0.18), wave(0.5, 0.12, 0.15)], true, false)
  );
  return _routePennantSpec;
}

/** Unit-scale stratified red-rock sandstone mesa + yardang spire merged with height-banded vertex strata for `instances.custom`. */
export function batchedMesaSpireSpec(): AuraCustomGeometrySpec {
  if (_batchedMesaSpireSpec) return _batchedMesaSpireSpec;
  const mesa = transformMesh(stratifiedCliffMesh({ radiusX: 1.45, radiusZ: 1.15, height: 1.38, terraces: 6, seed: 31 }), {
    pos: [0, -0.14, 0]
  });
  const spire = transformMesh(stratifiedCliffMesh({ radiusX: 0.54, radiusZ: 0.45, height: 2.08, terraces: 7, seed: 67 }), {
    pos: [0.54, -0.14, -0.24],
    rot: [0.04, 0.5, -0.05]
  });
  const strataTone = (_x: number, y: number, z: number): V4 => {
    const band = Math.sin((y + 0.2) * 11.5 + z * 1.3);
    if (y > 1.55) return [1.08, 0.92, 0.7, 1];
    if (band > 0.35) return [1.06, 0.78, 0.54, 1];
    if (band < -0.32) return [0.76, 0.38, 0.28, 1];
    return [0.95, 0.56, 0.39, 1];
  };
  _batchedMesaSpireSpec = mergeColoredSpec([colorizeMesh(mesa, strataTone), colorizeMesh(spire, strataTone)]);
  return _batchedMesaSpireSpec;
}

/** Unit-scale fluted sandstone & iron lattice signal pylon (`y in [0, 1]`) for instanced batching. */
export function batchedSignalPylonBodySpec(): AuraCustomGeometrySpec {
  if (_batchedPylonBodySpec) return _batchedPylonBodySpec;
  const plinth = transformMesh(stratifiedCliffMesh({ radiusX: 0.22, radiusZ: 0.2, height: 0.22, terraces: 3, seed: 43 }), {
    pos: [0, -0.04, 0]
  });
  const column = loftSectionsMesh(
    [
      flutedRing(0.12, 0.13, 10, 0.08),
      flutedRing(0.48, 0.1, 10, 0.08),
      flutedRing(0.66, 0.085, 10, 0.06)
    ],
    true,
    true
  );
  const truss = transformMesh(latticeTrussMesh({ span: [0.13, 0.34, 0.13], bays: 4, chordRadius: 0.011, braceRadius: 0.006 }), {
    pos: [0, 0.82, 0]
  });
  _batchedPylonBodySpec = mergeColoredSpec([
    colorizeMesh(plinth, () => [0.82, 0.52, 0.37, 1]),
    colorizeMesh(column, (_x, y) => [0.92 + y * 0.08, 0.8 + y * 0.08, 0.62 + y * 0.08, 1]),
    colorizeMesh(truss, () => [0.34, 0.3, 0.28, 1])
  ]);
  return _batchedPylonBodySpec;
}

/** Parabolic relay dish + feed horn merged into one instanced mesh (`batched-relay-dishes`). */
export function batchedSignalRelayDishSpec(): AuraCustomGeometrySpec {
  if (_batchedRelayDishSpec) return _batchedRelayDishSpec;
  const dish = transformMesh(
    latheMesh([[0, 0], [0.22, 0.06], [0.58, 0.28], [0.76, 0.52], [0.7, 0.56], [0.16, 0.12]], 16),
    { rot: [Math.PI * 0.44, 0, 0] }
  );
  const feedArm = tubeSweepMesh([[0, 0, 0.06, 0.035], [0, 0.08, 0.68, 0.025]], 6);
  const horn = transformMesh(icosphereFacetMesh(0.11, 1, 0.02, 17), { pos: [0, 0.08, 0.7] });
  _batchedRelayDishSpec = mergeColoredSpec([
    colorizeMesh(dish, () => [1.0, 0.9, 0.72, 1]),
    colorizeMesh(feedArm, () => [0.72, 0.58, 0.38, 1]),
    colorizeMesh(horn, () => [0.52, 0.95, 0.84, 1])
  ]);
  return _batchedRelayDishSpec;
}

/** Twin sun-tracking photovoltaic solar panel wings merged into one instanced mesh (`batched-solar-arrays`). */
export function batchedSolarArraySpec(): AuraCustomGeometrySpec {
  if (_batchedSolarArraySpec) return _batchedSolarArraySpec;
  const parts: RawMesh[] = [
    colorizeMesh(bevelBoxMesh(2.4, 0.07, 0.09, 0.015), () => [0.85, 0.68, 0.42, 1])
  ];
  for (const side of [-1, 1] as const) {
    const panel = transformMesh(bevelBoxMesh(0.96, 0.045, 0.62, 0.012), {
      pos: [side * 0.68, 0.04, 0],
      rot: [0.46, 0, 0]
    });
    parts.push(
      colorizeMesh(panel, (x, _y, z) => {
        const grid = Math.abs(Math.sin(x * 14)) < 0.08 || Math.abs(Math.sin(z * 14)) < 0.08;
        return grid ? [1.25, 1.08, 0.78, 1] : [0.78, 0.96, 1.15, 1];
      })
    );
  }
  _batchedSolarArraySpec = mergeColoredSpec(parts);
  return _batchedSolarArraySpec;
}

/* ------------------------------------------------------------------ 3. Monumental Multi-Material Landmarks */

const LANDMARK_MATS: readonly AuraMaterialSpec[] = [
  DESERT_MAT.sandstoneWarm,        // 0
  DESERT_MAT.sandstoneBleached,    // 1
  DESERT_MAT.sandstoneDeep,        // 2
  DESERT_MAT.anisotropicBrass,     // 3
  DESERT_MAT.darkRelayIron,        // 4
  DESERT_MAT.turquoiseGlaze,       // 5
  DESERT_MAT.terracottaGlaze,      // 6
  DESERT_MAT.carvedCedarWood,      // 7
  DESERT_MAT.sheenTerracottaBanner,// 8
  DESERT_MAT.sheenBonePennant,     // 9
  DESERT_MAT.sheenIndigoCloth,     // 10
  DESERT_MAT.beaconSolarGlass,     // 11
  DESERT_MAT.signalCoreJade,       // 12
  DESERT_MAT.signalCoreAmber       // 13
];

function taperedPierMesh(wBot: number, dBot: number, wTop: number, dTop: number, y0: number, y1: number): RawMesh {
  const rect = (w: number, d: number, y: number): V3[] => [
    [-w * 0.5, y, -d * 0.5],
    [w * 0.5, y, -d * 0.5],
    [w * 0.5, y, d * 0.5],
    [-w * 0.5, y, d * 0.5]
  ];
  return loftSectionsMesh([rect(wBot, dBot, y0), rect((wBot + wTop) * 0.5, (dBot + dTop) * 0.5, (y0 + y1) * 0.5), rect(wTop, dTop, y1)], true, true);
}

/** Monumental two-tier sandstone viaduct (`aqueduct-east` / `aqueduct-west`, `64 m` span). */
export function createDesertViaduct(name: string, position: V3, yaw: number) {
  const slots: MultiMatSlot[] = [];
  // 4 lower battered sandstone piers + 3 lower voussoir arches
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 18.4;
    slots.push({ mesh: transformMesh(taperedPierMesh(5.2, 8.2, 4.1, 7.2, -4, 13.4), { pos: [x, 0, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(5.6, 0.9, 8.2, 0.14), { pos: [x, 13.6, 0] }), materialIndex: 1 });
  }
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 18.4;
    for (const s of archwayVoussoirSlots({ radius: 6.9, thickness: 2.1, depth: 7.1, voussoirs: 11, stoneMatA: 0, stoneMatB: 1, keystoneMat: 3 })) {
      slots.push({ mesh: transformMesh(s.mesh, { pos: [x, 13.2, 0] }), materialIndex: s.materialIndex });
    }
  }
  // Mid spandrel deck + upper 6-arch colonnade + turquoise ceramic water channel
  slots.push({ mesh: transformMesh(bevelBoxMesh(62, 1.4, 7.8, 0.18), { pos: [0, 21.8, 0] }), materialIndex: 1 });
  for (let i = 0; i <= 6; i++) {
    const x = (i - 3) * 9.2;
    slots.push({ mesh: transformMesh(taperedPierMesh(2.1, 6.2, 1.8, 5.8, 22.3, 26.2), { pos: [x, 0, 0] }), materialIndex: 0 });
  }
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 9.2;
    for (const s of archwayVoussoirSlots({ radius: 3.55, thickness: 1.05, depth: 5.8, voussoirs: 7, stoneMatA: 1, stoneMatB: 0, keystoneMat: 3 })) {
      slots.push({ mesh: transformMesh(s.mesh, { pos: [x, 25.8, 0] }), materialIndex: s.materialIndex });
    }
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(63, 1.3, 6.8, 0.16), { pos: [0, 30.8, 0] }), materialIndex: 1 });
  slots.push({ mesh: transformMesh(bevelBoxMesh(62.4, 0.55, 3.6, 0.06), { pos: [0, 31.35, 0] }), materialIndex: 5 });
  for (const sx of [-18.4, 18.4] as const) {
    slots.push({
      mesh: tubeSweepMesh([[sx, 30.6, 3.8, 0.24], [sx, 22.2, 4.1, 0.24], [sx, 8.5, 4.3, 0.28]], 8),
      materialIndex: 3
    });
  }
  return assembleMultiMaterialNode(name, slots, LANDMARK_MATS, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesceColors: false });
}

/** Sandstone pylon gatehouse with brass beacon dome, solar glass lens & hanging desert banners (`gatehouse-neri`). */
export function createGatehouseNeri(name: string, position: V3, yaw: number) {
  const slots: MultiMatSlot[] = [];
  for (const side of [-1, 1] as const) {
    slots.push({ mesh: transformMesh(taperedPierMesh(7.6, 9.6, 5.8, 7.8, -2.4, 18.5), { pos: [side * 9.2, 0, 0] }), materialIndex: 0 });
    slots.push({ mesh: transformMesh(bevelBoxMesh(6.6, 1.2, 8.6, 0.16), { pos: [side * 9.2, 19, 0] }), materialIndex: 1 });
    // Hanging terracotta & indigo banners on pylon front
    const banner = loftSectionsMesh(
      [
        [[side * 9.2 - 1.1, 15.8, 4.35], [side * 9.2 + 1.1, 15.8, 4.35], [side * 9.2 + 1.1, 15.8, 4.42], [side * 9.2 - 1.1, 15.8, 4.42]],
        [[side * 9.2 - 1.0, 10.6, 4.58], [side * 9.2 + 1.0, 10.6, 4.58], [side * 9.2 + 1.0, 10.6, 4.65], [side * 9.2 - 1.0, 10.6, 4.65]],
        [[side * 9.2 - 0.55, 6.2, 4.42], [side * 9.2 + 0.55, 6.2, 4.42], [side * 9.2 + 0.55, 6.2, 4.49], [side * 9.2 - 0.55, 6.2, 4.49]]
      ],
      true,
      false
    );
    slots.push({ mesh: banner, materialIndex: side < 0 ? 8 : 10 });
  }
  for (const s of archwayVoussoirSlots({ radius: 5.6, thickness: 1.9, depth: 8.2, voussoirs: 11, stoneMatA: 0, stoneMatB: 1, keystoneMat: 3 })) {
    slots.push({ mesh: transformMesh(s.mesh, { pos: [0, 10.5, 0] }), materialIndex: s.materialIndex });
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(14.2, 2.1, 8.4, 0.18), { pos: [0, 18.8, 0] }), materialIndex: 1 });
  // Crown relay cupola + physical solar glass + jade beacon heart
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [3.2, 4.4, 3.2], bays: 2, chordRadius: 0.14, braceRadius: 0.08 }), { pos: [0, 22.0, 0] }),
    materialIndex: 3
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, -1.3], [1.28, -0.5], [1.34, 0.3], [0.78, 1.05], [0, 1.35]], 16), { pos: [0, 22.1, 0] }),
    materialIndex: 11
  });
  slots.push({ mesh: transformMesh(icosphereFacetMesh(0.68, 1, 0.04, 7), { pos: [0, 22.1, 0] }), materialIndex: 12 });
  return assembleMultiMaterialNode(name, slots, LANDMARK_MATS, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesceColors: false });
}

/** Monumental brass-and-sandstone canyon resonance portal (`canyon-gate`). */
export function createCanyonResonanceGate(name: string, position: V3, yaw: number) {
  const slots: MultiMatSlot[] = [];
  for (const side of [-1, 1] as const) {
    const obelisk = loftSectionsMesh(
      [flutedRing(-3.5, 5.4, 12, 0.08), flutedRing(14, 4.3, 12, 0.08), flutedRing(32, 3.1, 12, 0.07), flutedRing(38.5, 0.3, 12, 0.02)],
      true,
      true
    );
    slots.push({ mesh: transformMesh(obelisk, { pos: [side * 21.5, 0, 0] }), materialIndex: 0 });
    const dish = latheMesh([[0, 0], [0.9, 0.25], [2.4, 1.15], [3.1, 2.1], [2.9, 2.25], [0.7, 0.5]], 18);
    slots.push({ mesh: transformMesh(dish, { pos: [side * 21.5, 25, 3.4], rot: [Math.PI * 0.48, 0, 0] }), materialIndex: 5 });
    slots.push({ mesh: transformMesh(icosphereFacetMesh(0.75, 1, 0.03, 11), { pos: [side * 21.5, 25, 5.1] }), materialIndex: 13 });
  }
  for (const s of archwayVoussoirSlots({ radius: 17.5, thickness: 3.4, depth: 7.6, voussoirs: 15, stoneMatA: 1, stoneMatB: 0, keystoneMat: 3 })) {
    slots.push({ mesh: transformMesh(s.mesh, { pos: [0, 15.5, 0] }), materialIndex: s.materialIndex });
  }
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [34, 2.8, 3.2], bays: 8, chordRadius: 0.18, braceRadius: 0.1 }), { pos: [0, 37.8, 0] }),
    materialIndex: 4
  });
  slots.push({ mesh: transformMesh(latheMesh([[0, -2.2], [2.1, -0.8], [2.2, 0.8], [0, 2.2]], 18), { pos: [0, 38.2, 0] }), materialIndex: 11 });
  slots.push({ mesh: transformMesh(icosphereFacetMesh(1.15, 1, 0.04, 13), { pos: [0, 38.2, 0] }), materialIndex: 12 });
  return assembleMultiMaterialNode(name, slots, LANDMARK_MATS, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesceColors: false });
}

/** Ancient brass-and-ceramic desert signal relay watchtower with solar array wings & parabolic relay dishes (`watchtower-0`). */
export function createSignalRelayTower(name: string, position: V3, yaw: number, inked = true) {
  const slots: MultiMatSlot[] = [];
  const octRing = (y: number, r: number): V3[] =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [Math.cos(a) * r, y, Math.sin(a) * r] as V3;
    });
  slots.push({
    mesh: subdivideSmoothMesh(loftSectionsMesh([octRing(-2.5, 5.4), octRing(2.5, 4.6), octRing(7.5, 3.9), octRing(11.6, 3.35)], true, true), 1, 0.36),
    materialIndex: 0
  });
  slots.push({ mesh: transformMesh(bevelBoxMesh(7.6, 0.9, 7.6, 0.16), { pos: [0, 11.9, 0] }), materialIndex: 1 });
  // Brass harmonic collar rings around the upper lattice spire
  for (const ry of [14.2, 18.8, 23.2] as const) {
    slots.push({
      mesh: transformMesh(latheMesh([[2.15, -0.18], [2.36, 0], [2.15, 0.18]], 16), { pos: [0, ry, 0] }),
      materialIndex: 3
    });
  }
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [3.6, 13.6, 3.6], bays: 5, chordRadius: 0.16, braceRadius: 0.09 }), { pos: [0, 19.0, 0] }),
    materialIndex: 4
  });
  // Sun-tracking photovoltaic solar panel wings flanking the relay mast
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(4.4, 0.16, 2.4, 0.04), { pos: [side * 4.2, 14.8, 0], rot: [0.46, 0, side * -0.08] }),
      materialIndex: 11
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(4.6, 0.12, 0.22, 0.03), { pos: [side * 4.2, 14.7, 0] }),
      materialIndex: 3
    });
  }
  for (const [dy, ry, dishMat] of [[16.8, 0, 3], [20.6, 2.1, 5], [23.4, -2.1, 3]] as const) {
    const dish = latheMesh([[0, 0], [0.65, 0.2], [1.85, 0.95], [2.35, 1.65], [2.18, 1.78], [0.45, 0.35]], 16);
    slots.push({
      mesh: transformMesh(dish, { pos: [Math.sin(ry) * 2.1, dy, Math.cos(ry) * 2.1], rot: [Math.PI * 0.46, ry, 0] }),
      materialIndex: dishMat
    });
  }
  slots.push({
    mesh: transformMesh(latheMesh([[0, -1.5], [1.35, -0.5], [1.35, 0.5], [0, 1.5]], 16), { pos: [0, 27.1, 0] }),
    materialIndex: 11
  });
  slots.push({
    mesh: transformMesh(icosphereFacetMesh(0.76, 1, 0.04, 29), { pos: [0, 27.1, 0] }),
    materialIndex: inked ? 12 : 13
  });
  return assembleMultiMaterialNode(name, slots, LANDMARK_MATS, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesceColors: false });
}

/** Sculpted expedition desert buggy / sand-crawler with lugged tires, roll-cage, roof solar array & parabolic relay dish. */
export function createDesertBuggyCrawlerNode(name: string, position: V3, yaw: number, inked = true) {
  const slots: MultiMatSlot[] = [];
  const hullSec = (z: number, w: number, yBot: number, yTop: number): V3[] => [
    [-w * 0.84, yBot, z],
    [w * 0.84, yBot, z],
    [w, (yBot + yTop) * 0.52, z],
    [w * 0.78, yTop, z],
    [-w * 0.78, yTop, z],
    [-w, (yBot + yTop) * 0.52, z]
  ];
  // Terracotta-and-sandstone armored dune chassis + expedition roll-cage
  slots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          hullSec(-2.85, 1.05, 0.72, 1.48),
          hullSec(-1.35, 1.38, 0.62, 1.66),
          hullSec(0.95, 1.34, 0.62, 1.62),
          hullSec(2.45, 0.96, 0.74, 1.32),
          hullSec(2.95, 0.58, 0.88, 1.18)
        ],
        true,
        true
      ),
      1,
      0.42
    ),
    materialIndex: 6
  });
  slots.push({
    mesh: transformMesh(latticeTrussMesh({ span: [2.15, 1.15, 2.75], bays: 3, chordRadius: 0.075, braceRadius: 0.042 }), {
      pos: [-0.15, 2.18, -0.15]
    }),
    materialIndex: 4
  });
  // Four wide lugged desert tires + anisotropic brass hubs & suspension wishbones
  for (const sx of [-1.62, 1.62] as const) {
    for (const sz of [-1.78, 1.72] as const) {
      const tire = latheMesh(
        [
          [0, -0.34],
          [0.72, -0.34],
          [0.82, -0.22],
          [0.84, 0],
          [0.82, 0.22],
          [0.72, 0.34],
          [0, 0.34]
        ],
        16
      );
      slots.push({
        mesh: transformMesh(tire, { pos: [sx, 0.84, sz], rot: [0, 0, Math.PI / 2] }),
        materialIndex: 4
      });
      const hub = latheMesh([[0, -0.37], [0.42, -0.37], [0.36, 0.37], [0, 0.37]], 12);
      slots.push({
        mesh: transformMesh(hub, { pos: [sx, 0.84, sz], rot: [0, 0, Math.PI / 2] }),
        materialIndex: 3
      });
      slots.push({
        mesh: tubeSweepMesh([[sx * 0.55, 0.96, sz, 0.07], [sx * 0.95, 0.84, sz, 0.06]], 6),
        materialIndex: 3
      });
    }
  }
  // Roof sun-tracking solar array + rear parabolic relay dish & beacon core
  slots.push({
    mesh: transformMesh(bevelBoxMesh(2.25, 0.09, 1.65, 0.03), { pos: [-0.15, 2.84, 0.15], rot: [0.22, 0, 0] }),
    materialIndex: 11
  });
  const dish = latheMesh([[0, 0], [0.35, 0.1], [0.95, 0.48], [1.22, 0.85], [1.14, 0.92], [0.24, 0.18]], 16);
  slots.push({
    mesh: transformMesh(dish, { pos: [0, 3.35, -1.45], rot: [Math.PI * 0.38, 0.35, 0] }),
    materialIndex: 5
  });
  slots.push({
    mesh: transformMesh(icosphereFacetMesh(0.22, 1, 0.02, 23), { pos: [0.24, 3.62, -0.82] }),
    materialIndex: inked ? 12 : 13
  });
  return assembleMultiMaterialNode(name, slots, LANDMARK_MATS, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesceColors: false });
}

/** Awning-draped desert courier bazaar stall with glazed ceramic amphorae (`stall-0..1`). */
export function createBazaarStall(name: string, position: V3, yaw: number) {
  const slots: MultiMatSlot[] = [];
  slots.push({ mesh: transformMesh(bevelBoxMesh(6.2, 1.35, 1.8, 0.1), { pos: [0, 0.5, 1.3] }), materialIndex: 0 });
  for (const sx of [-3.1, 3.1] as const) {
    for (const sz of [-2.1, 2.1] as const) {
      slots.push({
        mesh: tubeSweepMesh([[sx, -0.6, sz, 0.14], [sx, 4.2 + (sz < 0 ? 0.55 : 0), sz, 0.11]], 7),
        materialIndex: 7
      });
    }
  }
  const awningSec = (x: number, sag: number): V3[] => [
    [x, 4.85 - sag, -2.45],
    [x, 4.55 - sag * 1.3, 0],
    [x, 4.18 - sag, 2.55],
    [x, 3.82 - sag, 2.75],
    [x, 4.26 - sag, 2.48],
    [x, 4.63 - sag * 1.3, 0],
    [x, 4.93 - sag, -2.45]
  ];
  slots.push({
    mesh: loftSectionsMesh([awningSec(-3.45, 0), awningSec(-1.15, 0.24), awningSec(1.15, 0.24), awningSec(3.45, 0)], true, false),
    materialIndex: 8
  });
  for (const [ax, az, matIdx] of [[-1.8, 1.3, 6], [-0.4, 1.25, 5], [1.4, 1.35, 6]] as const) {
    const jar = latheMesh([[0, 0], [0.32, 0.05], [0.48, 0.48], [0.36, 0.92], [0.18, 1.16], [0.24, 1.28]], 14);
    slots.push({ mesh: transformMesh(jar, { pos: [ax, 1.18, az] }), materialIndex: matIdx });
  }
  return assembleMultiMaterialNode(name, slots, LANDMARK_MATS, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesceColors: false });
}

/** Tattered sheen-fabric desert wind-banner mast (`banner-0..7`). */
export function createWindBannerMast(name: string, position: V3, yaw: number, index: number) {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(taperedPierMesh(2.2, 2.2, 1.4, 1.4, -1.2, 1.5), { pos: [0, 0, 0] }), materialIndex: 0 },
    { mesh: tubeSweepMesh([[0, 1.3, 0, 0.22], [0, 11.5, 0, 0.16], [0.18, 19.6, 0, 0.09]], 8), materialIndex: 3 },
    { mesh: tubeSweepMesh([[-0.3, 18.2, 0, 0.09], [3.6, 17.6, 0, 0.06]], 7), materialIndex: 7 },
    { mesh: transformMesh(latheMesh([[0, 0], [0.36, 0.35], [0.16, 0.85], [0, 1.15]], 12), { pos: [0.18, 19.6, 0] }), materialIndex: 3 }
  ];
  const clothMat = index % 3 === 0 ? 8 : index % 3 === 1 ? 9 : 10;
  const pennantSec = (y: number, x0: number, x1: number, zWave: number): V3[] => [
    [x0, y, zWave],
    [(x0 + x1) * 0.5, y, zWave + 0.32],
    [x1, y, zWave - 0.12],
    [(x0 + x1) * 0.5, y, zWave + 0.38]
  ];
  slots.push({
    mesh: loftSectionsMesh(
      [
        pennantSec(17.9, 0.25, 3.35, 0),
        pennantSec(13.2, 0.35, 3.1, 0.55),
        pennantSec(8.4, 0.55, 2.45, -0.38),
        pennantSec(4.2, 0.85, 1.45, 0.42)
      ],
      true,
      false
    ),
    materialIndex: clothMat
  });
  return assembleMultiMaterialNode(name, slots, LANDMARK_MATS, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesceColors: false });
}

/** Fluted wind-carved sandstone obelisk on a red-rock boulder plinth (`pillar-0..5`). */
export function createFlutedObeliskPillar(name: string, position: V3, yaw: number, height: number) {
  const h = Math.max(18, height);
  const slots: MultiMatSlot[] = [
    {
      mesh: transformMesh(stratifiedCliffMesh({ radiusX: 4.8, radiusZ: 4.4, height: 5.4, terraces: 4, seed: Math.round(h * 7) }), { pos: [0, -2.2, 0] }),
      materialIndex: 2
    },
    {
      mesh: loftSectionsMesh(
        [
          flutedRing(2.4, 2.55, 12, 0.09),
          flutedRing(h * 0.48, 2.05, 12, 0.09),
          flutedRing(h * 0.88, 1.48, 12, 0.08),
          flutedRing(h, 0.12, 12, 0.02)
        ],
        true,
        true
      ),
      materialIndex: 1
    },
    { mesh: transformMesh(latheMesh([[0, h + 1.9], [1.58, h * 0.88], [1.48, h * 0.86]], 12, true), { pos: [0, 0, 0] }), materialIndex: 3 },
    { mesh: transformMesh(latheMesh([[1.76, h * 0.72], [1.86, h * 0.74], [1.76, h * 0.76]], 12), { pos: [0, 0, 0] }), materialIndex: 12 }
  ];
  return assembleMultiMaterialNode(name, slots, LANDMARK_MATS, { position, rotation: [0, yaw, 0], castShadow: false, receiveShadow: true, coalesceColors: false });
}

/** Monumental stratified red-rock mesa & wind-carved yardang spire (`material.strata` + WebGPU WGSL twin). */
export function createStratifiedMesaSpire(name: string, position: V3, yaw: number, scale: number, night = false) {
  const spec = memoizeGeometry(`silt:mesa-spire:${scale.toFixed(2)}:${yaw.toFixed(2)}`, () => {
    const mesa = transformMesh(
      stratifiedCliffMesh({ radiusX: 1.45 * scale, radiusZ: 1.15 * scale, height: 1.35 * scale, terraces: 6, seed: Math.round(scale * 13 + yaw * 10) }),
      { pos: [0, -3.5, 0] }
    );
    const spire = transformMesh(
      stratifiedCliffMesh({ radiusX: 0.52 * scale, radiusZ: 0.44 * scale, height: 2.05 * scale, terraces: 7, seed: Math.round(scale * 29 + 7) }),
      { pos: [0.55 * scale, -3.5, -0.25 * scale], rot: [0.04, 0.5, -0.05] }
    );
    return mergeRawMeshes([mesa, spire]);
  });
  return geometry.custom(spec, {
    name,
    position,
    rotation: [0, yaw, 0],
    castShadow: false,
    receiveShadow: true,
    material: strataMesaMaterial(night)
  });
}
