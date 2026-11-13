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
  bevelBoxMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  sculptHumanoidLimbMesh,
  sculptStreamlinedHullMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
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
export function rawToCustomGeometry(mesh: RawMesh & { readonly colors?: Float32Array | readonly number[] }): AuraCustomGeometrySpec {
  const positions = mesh.positions instanceof Float32Array ? mesh.positions : Float32Array.from(mesh.positions);
  const normals = mesh.normals instanceof Float32Array ? mesh.normals : Float32Array.from(mesh.normals);
  const uvs = mesh.uvs instanceof Float32Array ? mesh.uvs : Float32Array.from(mesh.uvs);
  const vCount = Math.floor(positions.length / 3);
  const indices =
    mesh.indices instanceof Uint16Array || mesh.indices instanceof Uint32Array
      ? mesh.indices
      : vCount > 65535
        ? Uint32Array.from(mesh.indices)
        : Uint16Array.from(mesh.indices);
  const colors =
    mesh.colors === undefined
      ? undefined
      : mesh.colors instanceof Float32Array
        ? mesh.colors
        : Float32Array.from(mesh.colors);
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
): RawMesh & { readonly colors: Float32Array } {
  const vCount = Math.floor(mesh.positions.length / 3);
  const colors = new Float32Array(vCount * 4);
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
  anisotropicBrass: unnamed(material.brushedMetal({ color: "#ca9850", roughness: 0.24, metalness: 0.92, anisotropy: 0.88, anisotropyRotation: 0.35, envMapIntensity: 1.35 })),
  verdigrisBronze: unnamed(material.studioMetal({ color: "#788d7c", roughness: 0.4, metalness: 0.84, envMapIntensity: 1.15 })),
  darkRelayIron: unnamed(material.brushedMetal({ color: "#2d2621", roughness: 0.34, metalness: 0.88, anisotropy: 0.8, envMapIntensity: 1.15 })),
  skiffSandstoneHull: unnamed(material.pbr({ color: "#d8a874", roughness: 0.56, metalness: 0.14 })),
  skiffLacquer: unnamed(material.lacquer({ color: "#b24c32", roughness: 0.38, clearcoat: 0.34, clearcoatRoughness: 0.28 })),
  skiffFootpad: unnamed(material.pbr({ color: "#2b231e", roughness: 0.58, metalness: 0.12 })),
  carvedCedarWood: unnamed(material.pbr({ color: "#6e482d", roughness: 0.78, metalness: 0.02 })),
  sheenTerracottaBanner: unnamed(material.fabric({ color: SILT_PALETTE.terracotta, roughness: 0.84, sheen: 0.76, sheenColor: "#ffdcbe", sheenRoughness: 0.54, doubleSided: true })),
  sheenBonePennant: unnamed(material.fabric({ color: SILT_PALETTE.bone, roughness: 0.82, sheen: 0.68, sheenColor: "#fff2dd", sheenRoughness: 0.58, doubleSided: true })),
  sheenIndigoCloth: unnamed(material.fabric({ color: "#363e68", roughness: 0.85, sheen: 0.72, sheenColor: "#a4b3e6", sheenRoughness: 0.56, doubleSided: true })),
  leatherSaddle: unnamed(material.pbr({ color: "#5e3822", roughness: 0.62, metalness: 0.04 })),
  leatherDark: unnamed(material.pbr({ color: "#2d1d15", roughness: 0.68, metalness: 0.06 })),
  bootRubber: unnamed(material.pbr({ color: "#1d1917", roughness: 0.84, metalness: 0.04 })),
  linenGaiter: unnamed(material.fabric({ color: "#dfd0b4", roughness: 0.88, sheen: 0.54, sheenColor: "#fff4df", sheenRoughness: 0.62 })),
  nomadTrouser: unnamed(material.fabric({ color: "#433a4e", roughness: 0.86, sheen: 0.48, sheenColor: "#9aa0c4", sheenRoughness: 0.64 })),
  goggleLens: unnamed(material.lacquer({ color: "#1d6b66", roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.75 })),
  beaconSolarGlass: unnamed(material.physical({ color: "#9ee8ff", roughness: 0.05, opacity: 0.46, clearcoat: 1, ior: 1.52 })),
  signalCoreJade: unnamed(material.emissive({ color: SILT_PALETTE.jade, emissiveIntensity: 2.35, practical: true })),
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
      roughness: 0.78,
      sheen: 0.62,
      sheenColor: "#ffe1bd",
      sheenRoughness: 0.58,
      rim: { color: "#ffe0ba", power: 2.6, intensity: 0.66 }
    }
  ];
}

/** Merges multiple vertex-colored `RawMesh` parts into a single `AuraCustomGeometrySpec`. */
function mergeColoredSpec(
  parts: readonly (RawMesh & { readonly colors?: Float32Array | readonly number[] })[]
): AuraCustomGeometrySpec {
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

/* ------------------------------------------------------------------ 1. Hero Desert Sand-Skiff & Glider Gear */

function skiffHullSection(x: number, halfZ: number, yKeel: number, yDeck: number, chineDrop = 0.036): V3[] {
  return [
    [x, yKeel, 0],
    [x, yKeel + 0.026, halfZ * 0.58],
    [x, (yKeel + yDeck) * 0.52 - chineDrop, halfZ],
    [x, yDeck - 0.014, halfZ * 0.9],
    [x, yDeck, halfZ * 0.42],
    [x, yDeck + 0.014, 0],
    [x, yDeck, -halfZ * 0.42],
    [x, yDeck - 0.014, -halfZ * 0.9],
    [x, (yKeel + yDeck) * 0.52 - chineDrop, -halfZ],
    [x, yKeel + 0.026, -halfZ * 0.58]
  ];
}

function airfoilSection(x: number, zMid: number, halfW: number, yMid: number, halfH: number, dihedral = 0): V3[] {
  return [
    [x, yMid - halfH * 0.72 - dihedral, zMid - halfW],
    [x, yMid - halfH, zMid],
    [x, yMid - halfH * 0.72 + dihedral, zMid + halfW],
    [x, yMid + halfH * 0.65 + dihedral, zMid + halfW * 0.88],
    [x, yMid + halfH, zMid],
    [x, yMid + halfH * 0.65 - dihedral, zMid - halfW * 0.88]
  ];
}

/**
 * Multi-material sleek desert silt-skiff (`id: "board"`).
 * Oriented along `+X` forward (`[-1.02, +1.18]`), cockpit footpad & footpegs at `y = +0.192` so `BOARD_YAW` and
 * `DECK_TOP` align cleanly with the signal-courier's boots and yoke-gripping hands.
 */
let cachedSkiffSlots: readonly MultiMatSlot[] | null = null;

export function createSandSkiffNode(options: { readonly inked: boolean; readonly scale: number }) {
  const materials: readonly AuraMaterialSpec[] = [
    DESERT_MAT.skiffSandstoneHull, // 0: warm sandstone-alloy main streamlined fuselage & outrigger upper skins
    DESERT_MAT.skiffLacquer,       // 1: terracotta chine fairings & bow accent cowl
    DESERT_MAT.darkRelayIron,      // 2: dark relay-iron instrument binnacle, cockpit frame & footpeg brackets
    DESERT_MAT.skiffFootpad,       // 3: grooved non-slip deck pad, footpeg treads & leather yoke grips
    DESERT_MAT.anisotropicBrass,   // 4: brushed brass cutwater, yoke column, cowl bezels & thruster bells
    DESERT_MAT.carvedCedarWood,    // 5: carved cedar outrigger abrasion skids
    DESERT_MAT.turquoiseGlaze,     // 6: glazed turquoise ceramic repulsor housings & harmonic collars
    options.inked ? DESERT_MAT.signalCoreJade : DESERT_MAT.signalCoreAmber // 7: glowing repulsor rings, thrusters & dial
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
  const slots: MultiMatSlot[] = [];

  // 0 & 1: Sleek lofted desert hover-skiff fuselage with beveled chines & low-profile split speeder bow (+X)
  const hullSections: V3[][] = [
    skiffHullSection(-0.98, 0.28, -0.075, 0.155, 0.016),
    skiffHullSection(-0.64, 0.36, -0.135, 0.178, 0.026),
    skiffHullSection(-0.18, 0.35, -0.148, 0.184, 0.03),
    skiffHullSection(0.28, 0.31, -0.132, 0.186, 0.026),
    skiffHullSection(0.68, 0.22, -0.088, 0.194, 0.018),
    skiffHullSection(0.98, 0.115, -0.032, 0.172, 0.008),
    skiffHullSection(1.16, 0.038, 0.028, 0.132, 0)
  ];
  slots.push({ mesh: subdivideSmoothMesh(loftSectionsMesh(hullSections, true, true), 1, 0.5), materialIndex: 0 });

  const keelCore = transformMesh(
    sculptStreamlinedHullMesh(2.06, 0.64, 0.28, {
      noseSharpness: 1.72,
      tailTaper: 0.46,
      deckCrown: 0.024,
      keelRocker: 0.11,
      chineSharpness: 0.56,
      lengthSteps: 14,
      ringPoints: 14
    }),
    { pos: [0.06, -0.015, 0], rot: [0, Math.PI / 2, 0] }
  );
  slots.push({ mesh: keelCore, materialIndex: 1 });

  // Terracotta side chine strakes along port & starboard flanks
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: tubeSweepMesh(
        [
          [-0.88, 0.06, side * 0.26, 0.024],
          [-0.36, 0.05, side * 0.35, 0.03],
          [0.24, 0.06, side * 0.31, 0.028],
          [0.76, 0.08, side * 0.2, 0.022],
          [1.1, 0.09, side * 0.06, 0.012]
        ],
        8
      ),
      materialIndex: 1
    });
  }

  // 3 & 2: Recessed non-slip cockpit deck + heavy cast footpegs aligned with courier's planted boots (y = 0.192)
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.96, 0.026, 0.44, 0.01), { pos: [-0.08, 0.179, 0] }),
    materialIndex: 3
  });
  for (const [fx, fz, side] of [[-0.052, -0.183, -1], [-0.017, 0.183, 1]] as const) {
    // Outrigger footpeg bracket arm (dark iron) + non-slip tread plate (top exactly at y = 0.192) + heel guard
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 0.028, 0.135, 0.008), { pos: [fx, 0.164, fz] }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.22, 0.016, 0.118, 0.006), { pos: [fx, 0.184, fz] }),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.026, 0.048, 0.118, 0.006), { pos: [fx - 0.105, 0.205, fz] }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.18, 0.022, 0.018, 0.005), { pos: [fx, 0.198, fz + side * 0.062] }),
      materialIndex: 2
    });
  }

  // 2, 4, 6, 7: Forward brass & dark-steel aerodynamic instrument cowl + curved control yoke with grips
  const cowlSections: V3[][] = [
    ovalRing(0.26, 0.22, 0, 0.06, 0.18, 10),
    ovalRing(0.38, 0.36, 0, 0.11, 0.195, 10),
    ovalRing(0.52, 0.46, 0, 0.13, 0.155, 10),
    ovalRing(0.68, 0.34, 0, 0.11, 0.095, 10),
    ovalRing(0.82, 0.21, 0, 0.06, 0.045, 10)
  ];
  slots.push({
    mesh: subdivideSmoothMesh(loftSectionsMesh(cowlSections, true, true), 1, 0.46),
    materialIndex: 2
  });
  // Brushed-brass cowl wind-lip & instrument binnacle bezel + glowing jade/amber telemetry dial facing the rider (-X)
  slots.push({
    mesh: tubeSweepMesh(
      [
        [0.3, 0.33, -0.185, 0.016],
        [0.44, 0.48, -0.13, 0.018],
        [0.52, 0.53, 0, 0.02],
        [0.44, 0.48, 0.13, 0.018],
        [0.3, 0.33, 0.185, 0.016]
      ],
      8
    ),
    materialIndex: 4
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, -0.02], [0.072, -0.02], [0.078, 0.016], [0.058, 0.024]], 14), {
      pos: [0.33, 0.41, 0],
      rot: [0, 0, Math.PI / 2 - 0.38]
    }),
    materialIndex: 4
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, 0.022], [0.054, 0.022], [0.05, 0.012]], 14), {
      pos: [0.325, 0.412, 0],
      rot: [0, 0, Math.PI / 2 - 0.38]
    }),
    materialIndex: 7
  });

  // Swept steering stem & twin-horn control yoke reaching courier hands at (bx = 0.296, by = 0.975, bz = +-0.196)
  slots.push({
    mesh: tubeSweepMesh(
      [
        [0.42, 0.34, 0, 0.028],
        [0.39, 0.58, 0, 0.024],
        [0.35, 0.8, 0, 0.021],
        [0.325, 0.945, 0, 0.022]
      ],
      8
    ),
    materialIndex: 2
  });
  // Central brass yoke clamp + turquoise harmonic damper cap
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.065, 0.052, 0.11, 0.012), { pos: [0.325, 0.95, 0] }),
    materialIndex: 4
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, 0.028], [0.032, 0.02], [0.036, 0]], 12), { pos: [0.325, 0.976, 0] }),
    materialIndex: 6
  });
  for (const side of [-1, 1] as const) {
    // Swept brass handlebar horn out to grip position
    slots.push({
      mesh: tubeSweepMesh(
        [
          [0.325, 0.95, side * 0.045, 0.017],
          [0.318, 0.968, side * 0.125, 0.016],
          [0.296, 0.975, side * 0.196, 0.015],
          [0.278, 0.972, side * 0.252, 0.013]
        ],
        8
      ),
      materialIndex: 4
    });
    // Textured leather/rubber yoke grip sleeve centered at (0.296, 0.975, side * 0.196)
    slots.push({
      mesh: tubeSweepMesh(
        [
          [0.308, 0.972, side * 0.152, 0.022],
          [0.296, 0.975, side * 0.196, 0.023],
          [0.282, 0.973, side * 0.242, 0.021]
        ],
        8
      ),
      materialIndex: 3
    });
    // Forward brass hand-guard bow
    slots.push({
      mesh: tubeSweepMesh(
        [
          [0.318, 0.968, side * 0.135, 0.008],
          [0.352, 0.975, side * 0.205, 0.008],
          [0.278, 0.972, side * 0.255, 0.008]
        ],
        6
      ),
      materialIndex: 4
    });
  }

  // Brushed-brass keel cutwater vane & nose splitter
  slots.push({
    mesh: tubeSweepMesh(
      [
        [-0.92, -0.09, 0, 0.024],
        [-0.24, -0.155, 0, 0.03],
        [0.48, -0.125, 0, 0.028],
        [0.98, -0.02, 0, 0.022],
        [1.18, 0.085, 0, 0.014]
      ],
      8
    ),
    materialIndex: 4
  });

  // Port & starboard beveled outrigger airfoils + glowing turquoise repulsor rings + twin stern thrusters
  for (const side of [-1, 1] as const) {
    // Aerofoil outrigger cross-pylons
    for (const sx of [-0.44, 0.18] as const) {
      slots.push({
        mesh: tubeSweepMesh(
          [
            [sx, 0.055, side * 0.28, 0.024],
            [sx - 0.03, 0.015, side * 0.4, 0.021],
            [sx - 0.05, -0.015, side * 0.5, 0.018]
          ],
          7
        ),
        materialIndex: 2
      });
    }

    // Beveled outrigger airfoil pod (slot 0) + cedar leading-edge sand skid (slot 5)
    const zPod = side * 0.53;
    slots.push({
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            airfoilSection(-0.78, zPod, 0.042, -0.005, 0.022, side * 0.008),
            airfoilSection(-0.42, zPod, 0.098, -0.018, 0.036, side * 0.014),
            airfoilSection(0.12, zPod, 0.095, -0.016, 0.035, side * 0.014),
            airfoilSection(0.52, zPod, 0.036, 0.012, 0.02, side * 0.006)
          ],
          true,
          true
        ),
        1,
        0.42
      ),
      materialIndex: 0
    });
    slots.push({
      mesh: tubeSweepMesh(
        [
          [-0.72, -0.038, zPod + side * 0.05, 0.014],
          [-0.18, -0.048, zPod + side * 0.072, 0.016],
          [0.44, -0.01, zPod + side * 0.042, 0.012]
        ],
        6
      ),
      materialIndex: 5
    });

    // Glowing turquoise repulsor ring embedded in each outrigger airfoil (visible top & bottom!)
    const repRing = latheMesh(
      [
        [0.052, -0.036],
        [0.092, -0.034],
        [0.098, 0],
        [0.092, 0.034],
        [0.052, 0.036]
      ],
      14
    );
    slots.push({
      mesh: transformMesh(repRing, { pos: [-0.14, -0.016, zPod] }),
      materialIndex: 6
    });
    const repGlow = latheMesh(
      [
        [0, -0.038],
        [0.058, -0.038],
        [0.058, 0.038],
        [0, 0.038]
      ],
      12
    );
    slots.push({
      mesh: transformMesh(repGlow, { pos: [-0.14, -0.016, zPod] }),
      materialIndex: 7
    });

    // Twin lathed brass & iron repulsor-thruster nacelles at stern (-X)
    const bell = latheMesh(
      [
        [0.108, -0.2],
        [0.142, -0.1],
        [0.132, 0.04],
        [0.104, 0.17],
        [0.054, 0.25],
        [0, 0.27]
      ],
      14
    );
    slots.push({
      mesh: transformMesh(bell, { pos: [-0.82, 0.025, side * 0.29], rot: [0, 0, -Math.PI / 2] }),
      materialIndex: 4
    });
    const collar = latheMesh(
      [
        [0.136, -0.048],
        [0.154, 0],
        [0.136, 0.048]
      ],
      14
    );
    slots.push({
      mesh: transformMesh(collar, { pos: [-0.77, 0.025, side * 0.29], rot: [0, 0, -Math.PI / 2] }),
      materialIndex: 6
    });
    const core = latheMesh(
      [
        [0, -0.185],
        [0.094, -0.185],
        [0.082, -0.14]
      ],
      12
    );
    slots.push({
      mesh: transformMesh(core, { pos: [-0.82, 0.025, side * 0.29], rot: [0, 0, -Math.PI / 2] }),
      materialIndex: 7
    });

    // Canted brass stabilizer ruddervator fins at stern
    const finSec = (y: number, x0: number, x1: number, halfT: number, zOff: number): V3[] => [
      [x0, y, zOff],
      [(x0 + x1) * 0.5, y, zOff + halfT],
      [x1, y, zOff],
      [(x0 + x1) * 0.5, y, zOff - halfT]
    ];
    slots.push({
      mesh: loftSectionsMesh(
        [
          finSec(0.12, -0.9, -0.56, 0.015, side * 0.31),
          finSec(0.24, -1.0, -0.72, 0.01, side * 0.42),
          finSec(0.32, -1.06, -0.84, 0.004, side * 0.49)
        ],
        true,
        true
      ),
      materialIndex: 4
    });
  }

  cachedSkiffSlots = slots;
  return assembleMultiMaterialNode("board", slots, materials, {
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
  const spine = tubeSweepMesh(
    [
      [0, 0.02, 1.02, 0.02],
      [0, 0.045, 0.42, 0.026],
      [0, 0.05, -0.32, 0.024],
      [0, 0.08, -0.88, 0.018],
      [0, 0.04, -1.16, 0.01]
    ],
    8
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
    DESERT_MAT.sheenBonePennant
  ];
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: tubeSweepMesh(
      [
        [0, -0.18, -0.06, 0.018],
        [-0.02, 0.12, 0.08, 0.014],
        [-0.04, 0.42, 0.28, 0.01],
        [-0.05, 0.62, 0.46, 0.006]
      ],
      7
    ),
    materialIndex: 0
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0, 0.055], [0.024, 0.02], [0.016, -0.02], [0, -0.035]], 10), {
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
  slots.push({
    mesh: loftSectionsMesh(
      [
        sailSec(0.06, 0.08, 0.42, -0.03),
        sailSec(0.28, 0.16, 0.5, -0.06),
        sailSec(0.54, 0.24, 0.52, -0.05),
        sailSec(0.78, 0.32, 0.48, -0.02)
      ],
      true,
      false
    ),
    materialIndex: 2
  });
  slots.push({
    mesh: loftSectionsMesh(
      [
        sailSec(0.74, 0.33, 0.47, -0.02),
        sailSec(0.98, 0.35, 0.44, -0.05),
        sailSec(1.18, 0.37, 0.4, -0.01)
      ],
      true,
      false
    ),
    materialIndex: 3
  });
  return assembleMultiMaterialNode("board-sail", slots, materials, {
    id: "board-sail",
    position: [0, 4, 0],
    castShadow: false,
    receiveShadow: true
  });
}

function ovalRing(cx: number, y: number, cz: number, rx: number, rz: number, pts = 10): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz]);
  }
  return ring;
}

function pleatedRing(
  cx: number,
  y: number,
  cz: number,
  rx: number,
  rz: number,
  folds = 6,
  foldAmp = 0.014,
  aftSweep = 0,
  pts = 16
): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const pleat = 1 + Math.sin(a * folds + 0.6) * foldAmp;
    const zBack = Math.sin(a) > 0 ? Math.sin(a) * aftSweep : 0;
    ring.push([cx + Math.cos(a) * rx * pleat, y, cz + Math.sin(a) * rz * pleat + zBack]);
  }
  return ring;
}

function scarfRibbonSection(z: number, yMid: number, halfW: number, camberX: number, thick = 0.014, archY = 0): V3[] {
  return [
    [camberX - halfW, yMid - archY, z],
    [camberX, yMid + thick + archY * 0.5, z],
    [camberX + halfW, yMid - archY, z],
    [camberX, yMid - thick + archY * 0.5, z]
  ];
}

/**
 * Multi-material articulated Procedural Desert Signal-Courier Rig (`id: "rider"`).
 *
 * Forward-piloting desert rider astride the hover-skiff (`-Z` forward, `+X` starboard/right, `+Y` deck normal up,
 * `y = 0` flush on the skiff footpegs, gloved hands gripping the control yoke at `[+-0.225, 0.90, -0.34]`).
 * Features knee-high desert gaiter boots, sculpted pleated riding trousers, wind-swept desert poncho/cloak with
 * layered cowl collar & fluttering trailing hem, wrapped desert nomad hood + brass/teal-lens dust goggles, leather
 * messenger satchel, and compact backpack radio transceiver with whip antenna.
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
    DESERT_MAT.sheenTerracottaBanner, // 0: wind-swept desert poncho / cloak / scarf cloth
    DESERT_MAT.sheenBonePennant,      // 1: woven bone-linen poncho trim, inner tunic & hood brow-wrap
    DESERT_MAT.sheenIndigoCloth,      // 2: indigo layered cowl collar, face-wrap & hood peak
    DESERT_MAT.nomadTrouser,          // 3: sculpted pleated desert riding trousers
    DESERT_MAT.linenGaiter,           // 4: knee-high wrapped desert gaiters & forearm bracers
    DESERT_MAT.leatherSaddle,         // 5: oiled leather boots, messenger satchel & belt
    DESERT_MAT.leatherDark,           // 6: leather gloves, knee guards, gaiter straps & radio pack trim
    DESERT_MAT.bootRubber,            // 7: lugged non-slip boot soles
    DESERT_MAT.anisotropicBrass,      // 8: brass buckles, goggle barrels, radio bezel & whip antenna
    DESERT_MAT.turquoiseGlaze,        // 9: glazed turquoise ceramic radio tuning dials & canteen
    DESERT_MAT.goggleLens,            // 10: reflective deep-teal dust-goggle lenses
    options.inked ? DESERT_MAT.signalCoreJade : DESERT_MAT.signalCoreAmber, // 11: glowing radio transceiver indicator
    DESERT_MAT.darkRelayIron          // 12: dark-iron backpack radio transceiver chassis
  ];

  // 1. Knee-high desert gaiter boots planted solidly on port & starboard footpegs (y = 0)
  const stanceSlots: MultiMatSlot[] = [];
  const addGaiterBoot = (bx: number, bz: number, yaw: number, kneeX: number, kneeY: number, kneeZ: number) => {
    // Lugged rubber sole + distinct heel block flush on y = 0
    stanceSlots.push({
      mesh: transformMesh(bevelBoxMesh(0.108, 0.03, 0.265, 0.009), { pos: [bx, 0.015, bz - 0.012], rot: [0, yaw, 0] }),
      materialIndex: 7
    });
    // Sculpted oiled-leather toe box, vamp & heel counter
    const vamp = subdivideSmoothMesh(
      loftSectionsMesh(
        [
          ovalRing(0, 0.026, -0.012, 0.054, 0.126, 12),
          ovalRing(0, 0.072, 0.004, 0.05, 0.108, 12),
          ovalRing(0, 0.145, 0.028, 0.048, 0.058, 12)
        ],
        true,
        true
      ),
      1,
      0.42
    );
    stanceSlots.push({ mesh: transformMesh(vamp, { pos: [bx, 0, bz], rot: [0, yaw, 0] }), materialIndex: 5 });
    // Brass instep & ankle buckle straps
    stanceSlots.push({
      mesh: transformMesh(bevelBoxMesh(0.106, 0.022, 0.108, 0.006), {
        pos: [bx, 0.108, bz + Math.cos(yaw) * 0.024],
        rot: [0, yaw, 0]
      }),
      materialIndex: 8
    });
    // Sculpted knee-high wrapped desert gaiter rising from ankle cuff to athletic bent knee
    const ankleX = bx - Math.sin(yaw) * 0.024;
    const ankleZ = bz + Math.cos(yaw) * 0.024;
    const midX = (ankleX + kneeX) * 0.5;
    const midY = (0.13 + kneeY) * 0.5;
    const midZ = (ankleZ + kneeZ) * 0.5 - 0.014;
    stanceSlots.push({
      mesh: sculptHumanoidLimbMesh(
        [
          [ankleX, 0.12, ankleZ, 0.049],
          [midX, midY, midZ, 0.061],
          [kneeX, kneeY + 0.01, kneeZ, 0.058]
        ],
        12,
        0.18
      ),
      materialIndex: 4
    });
    // Three cross-wrapped dark-leather gaiter straps + brass top buckle
    for (const t of [0.26, 0.54, 0.82] as const) {
      const gx = ankleX + (kneeX - ankleX) * t;
      const gy = 0.125 + (kneeY - 0.125) * t;
      const gz = ankleZ + (kneeZ - ankleZ) * t - 0.008;
      stanceSlots.push({
        mesh: transformMesh(latheMesh([[0.055, -0.011], [0.063, 0], [0.055, 0.011]], 12), {
          pos: [gx, gy, gz],
          rot: [0.18, 0, 0]
        }),
        materialIndex: 6
      });
    }
  };
  addGaiterBoot(-0.21, 0.06, 0.12, -0.2, 0.44, -0.06);
  addGaiterBoot(0.21, 0.02, -0.12, 0.2, 0.45, -0.09);

  const stanceNode = assembleMultiMaterialNode("rider-stance", stanceSlots, materials, {
    castShadow: true,
    receiveShadow: true
  });

  // 2. Sculpted pleated nomad riding trousers, molded knee guards & utility belt (`id: "rider-pelvis"`, pivot [0, 0.74, 0.04])
  const pelvisSlots: MultiMatSlot[] = [];
  // Left & right sculpted riding thighs bridging cleanly from knees to hips
  pelvisSlots.push({
    mesh: sculptHumanoidLimbMesh(
      [
        [-0.2, -0.3, -0.1, 0.058],
        [-0.158, -0.155, -0.062, 0.08],
        [-0.1, -0.005, -0.018, 0.088]
      ],
      12,
      0.2
    ),
    materialIndex: 3
  });
  pelvisSlots.push({
    mesh: sculptHumanoidLimbMesh(
      [
        [0.2, -0.29, -0.13, 0.058],
        [0.158, -0.15, -0.08, 0.08],
        [0.1, -0.005, -0.024, 0.088]
      ],
      12,
      0.2
    ),
    materialIndex: 3
  });
  // Molded dark-leather knee guards with brass rivets
  for (const [kx, ky, kz, kyaw] of [[-0.2, -0.295, -0.118, 0.1], [0.2, -0.285, -0.148, -0.1]] as const) {
    pelvisSlots.push({
      mesh: transformMesh(bevelBoxMesh(0.104, 0.108, 0.078, 0.028), { pos: [kx, ky, kz], rot: [0.24, kyaw, 0] }),
      materialIndex: 6
    });
  }
  // Sculpted pleated hip wrap + terracotta waist sash + saddle-leather belt, buckle, pouch & turquoise canteen
  pelvisSlots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          pleatedRing(0, -0.085, -0.01, 0.162, 0.122, 6, 0.04, 0.01, 14),
          pleatedRing(0, 0.01, -0.005, 0.154, 0.116, 6, 0.03, 0.005, 14),
          ovalRing(0, 0.088, 0, 0.138, 0.104, 14)
        ],
        true,
        true
      ),
      1,
      0.48
    ),
    materialIndex: 3
  });
  pelvisSlots.push({
    mesh: transformMesh(latheMesh([[0.142, 0.018], [0.154, 0.05], [0.144, 0.082]], 16), { scale: [1.06, 1, 0.8] }),
    materialIndex: 0
  });
  pelvisSlots.push({
    mesh: transformMesh(latheMesh([[0.148, 0.042], [0.158, 0.066], [0.148, 0.09]], 16), { scale: [1.07, 1, 0.81] }),
    materialIndex: 5
  });
  pelvisSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.068, 0.05, 0.03, 0.008), { pos: [0, 0.066, -0.126] }),
    materialIndex: 8
  });
  pelvisSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.078, 0.112, 0.095, 0.016), { pos: [-0.165, 0.025, 0.015], rot: [0.05, 0.12, 0.1] }),
    materialIndex: 5
  });
  pelvisSlots.push({
    mesh: transformMesh(latheMesh([[0, -0.062], [0.05, -0.042], [0.056, 0.02], [0.024, 0.058], [0, 0.074]], 12), {
      pos: [-0.138, 0.018, 0.098],
      rot: [0.16, -0.35, 0.16]
    }),
    materialIndex: 9
  });

  // 3. Sculpted wind-swept desert poncho/cloak, layered collar, messenger satchel & backpack radio (`id: "rider-torso"`)
  const torsoSlots: MultiMatSlot[] = [];
  // Tapered athletic bone-linen & indigo rider under-tunic (waist -> ribcage -> broad shoulders)
  torsoSlots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          pleatedRing(0, -0.09, 0.012, 0.158, 0.118, 6, 0.035, 0.02, 14),
          ovalRing(0, 0.03, 0, 0.136, 0.102, 14),
          ovalRing(0, 0.18, -0.006, 0.158, 0.114, 14),
          ovalRing(0, 0.33, -0.01, 0.182, 0.118, 14),
          ovalRing(0, 0.4, -0.012, 0.132, 0.094, 14)
        ],
        true,
        true
      ),
      1,
      0.5
    ),
    materialIndex: 1
  });

  // Sculpted pleated desert poncho / nomad cloak draped organically across chest, shoulders & upper back
  torsoSlots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          pleatedRing(0, 0.05, 0.028, 0.218, 0.146, 7, 0.065, 0.055, 18),
          pleatedRing(0, 0.18, 0.014, 0.228, 0.142, 7, 0.052, 0.038, 18),
          pleatedRing(0, 0.31, -0.004, 0.214, 0.132, 6, 0.035, 0.018, 18),
          ovalRing(0, 0.385, -0.012, 0.148, 0.106, 18)
        ],
        true,
        true
      ),
      1,
      0.52
    ),
    materialIndex: 0
  });
  // Woven bone-linen border trim band along the poncho's lower scalloped edge
  torsoSlots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          pleatedRing(0, 0.022, 0.034, 0.226, 0.152, 7, 0.07, 0.065, 18),
          pleatedRing(0, 0.062, 0.026, 0.221, 0.148, 7, 0.065, 0.052, 18)
        ],
        true,
        false
      ),
      1,
      0.48
    ),
    materialIndex: 1
  });

  // Layered high desert cowl collar (indigo outer mantle collar + terracotta inner neck wrap)
  torsoSlots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          pleatedRing(0, 0.315, -0.006, 0.176, 0.128, 5, 0.04, 0.02, 16),
          pleatedRing(0, 0.382, -0.008, 0.146, 0.118, 5, 0.035, 0.016, 16),
          ovalRing(0, 0.428, -0.006, 0.122, 0.106, 16)
        ],
        true,
        false
      ),
      1,
      0.5
    ),
    materialIndex: 2
  });

  // Cross-body saddle-leather messenger satchel strap + brass D-rings + flap-top courier satchel at right hip
  const strapPts: V4[] = [
    [-0.148, 0.385, -0.035, 0.02],
    [-0.035, 0.24, -0.128, 0.02],
    [0.095, 0.09, -0.118, 0.02],
    [0.182, -0.015, 0.015, 0.02],
    [0.115, 0.11, 0.132, 0.02],
    [-0.03, 0.265, 0.136, 0.02],
    [-0.148, 0.385, 0.035, 0.02]
  ];
  torsoSlots.push({ mesh: tubeSweepMesh(strapPts, 7, false), materialIndex: 5 });
  torsoSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.096, 0.175, 0.2, 0.024), { pos: [0.185, -0.035, 0.035], rot: [0.06, 0.14, -0.14] }),
    materialIndex: 5
  });
  torsoSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.104, 0.082, 0.206, 0.02), { pos: [0.19, 0.015, 0.035], rot: [0.06, 0.14, -0.14] }),
    materialIndex: 6
  });
  torsoSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.108, 0.03, 0.048, 0.006), { pos: [0.196, -0.015, 0.035], rot: [0.06, 0.14, -0.14] }),
    materialIndex: 8
  });

  // Compact Backpack Radio Transceiver with turquoise tuning dials, glowing signal eye & flexible brass whip antenna
  const packPos: V3 = [0, 0.215, 0.152];
  const packRot: V3 = [0.14, 0, 0];
  // Main dark-iron chamfered radio chassis + leather mounting harness
  torsoSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.205, 0.245, 0.102, 0.022), { pos: packPos, rot: packRot }),
    materialIndex: 12
  });
  torsoSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.214, 0.042, 0.108, 0.01), {
      pos: [packPos[0], packPos[1] - 0.072, packPos[2] - 0.008],
      rot: packRot
    }),
    materialIndex: 6
  });
  // Brushed-brass protective instrument bezel + top grab-rail
  torsoSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.178, 0.145, 0.024, 0.008), {
      pos: [packPos[0], packPos[1] + 0.025, packPos[2] + 0.048],
      rot: packRot
    }),
    materialIndex: 8
  });
  torsoSlots.push({
    mesh: transformMesh(
      tubeSweepMesh(
        [
          [-0.068, 0.12, 0, 0.008],
          [-0.058, 0.158, 0, 0.008],
          [0.058, 0.158, 0, 0.008],
          [0.068, 0.12, 0, 0.008]
        ],
        6
      ),
      { pos: packPos, rot: packRot }
    ),
    materialIndex: 8
  });
  // Side brass battery cell cylinder
  torsoSlots.push({
    mesh: transformMesh(latheMesh([[0, -0.095], [0.032, -0.09], [0.034, 0.085], [0, 0.095]], 10), {
      pos: [packPos[0] - 0.118, packPos[1] - 0.01, packPos[2] + 0.005],
      rot: packRot
    }),
    materialIndex: 8
  });
  // Twin lathed turquoise ceramic tuning dials + glowing jade/amber signal indicator on rear faceplate
  for (const dx of [-0.048, 0.048] as const) {
    torsoSlots.push({
      mesh: transformMesh(latheMesh([[0, 0.02], [0.026, 0.02], [0.028, 0]], 12), {
        pos: [packPos[0] + dx, packPos[1] + 0.042, packPos[2] + 0.056],
        rot: [Math.PI / 2 + packRot[0], 0, 0]
      }),
      materialIndex: 9
    });
  }
  torsoSlots.push({
    mesh: transformMesh(latheMesh([[0, 0.018], [0.022, 0.018], [0.024, 0]], 12), {
      pos: [packPos[0], packPos[1] - 0.01, packPos[2] + 0.058],
      rot: [Math.PI / 2 + packRot[0], 0, 0]
    }),
    materialIndex: 11
  });
  // Turquoise antenna isolator coil + tall curved tapered brass whip antenna
  torsoSlots.push({
    mesh: transformMesh(latheMesh([[0.012, 0], [0.022, 0.022], [0.014, 0.048]], 10), {
      pos: [packPos[0] + 0.072, packPos[1] + 0.122, packPos[2] + 0.012],
      rot: packRot
    }),
    materialIndex: 9
  });
  torsoSlots.push({
    mesh: tubeSweepMesh(
      [
        [0.072, 0.355, 0.168, 0.008],
        [0.078, 0.51, 0.21, 0.0055],
        [0.086, 0.665, 0.268, 0.0035],
        [0.092, 0.79, 0.335, 0.002]
      ],
      6
    ),
    materialIndex: 8
  });

  // 4. Wrapped desert nomad hood + brass/teal-lens dust goggles (`id: "rider-head"`, pivot [0, 0.395, -0.02])
  const headSlots: MultiMatSlot[] = [];
  // Indigo desert face-wrap mask & neck gaiter (-Z forward gaze)
  headSlots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          ovalRing(0, -0.02, 0.006, 0.068, 0.072, 12),
          ovalRing(0, 0.055, -0.004, 0.084, 0.094, 12),
          ovalRing(0, 0.135, -0.008, 0.092, 0.104, 12),
          ovalRing(0, 0.195, 0.004, 0.076, 0.086, 12)
        ],
        true,
        true
      ),
      1,
      0.48
    ),
    materialIndex: 2
  });
  // Wrapped bone-linen inner nomad head-cloth & sun-visor brow fold
  headSlots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          ovalRing(0, 0.075, 0.008, 0.098, 0.108, 14),
          pleatedRing(0, 0.15, -0.006, 0.114, 0.126, 5, 0.025, 0.01, 14),
          pleatedRing(0, 0.215, 0.012, 0.108, 0.124, 5, 0.025, 0.018, 14),
          ovalRing(0, 0.258, 0.036, 0.068, 0.084, 14)
        ],
        true,
        true
      ),
      1,
      0.52
    ),
    materialIndex: 1
  });
  // Sculpted wind-swept terracotta outer nomad hood with peaked brow & draped back-fold
  headSlots.push({
    mesh: subdivideSmoothMesh(
      loftSectionsMesh(
        [
          pleatedRing(0, 0.035, 0.028, 0.124, 0.122, 6, 0.045, 0.038, 16),
          pleatedRing(0, 0.135, 0.018, 0.126, 0.138, 6, 0.038, 0.028, 16),
          pleatedRing(0, 0.225, 0.026, 0.118, 0.144, 5, 0.032, 0.042, 16),
          ovalRing(0, 0.278, 0.068, 0.064, 0.092, 16),
          ovalRing(0, 0.258, 0.135, 0.026, 0.038, 16)
        ],
        true,
        true
      ),
      1,
      0.54
    ),
    materialIndex: 0
  });
  // Leather goggle head-strap wrapping around the hood
  headSlots.push({
    mesh: transformMesh(latheMesh([[0.118, 0.13], [0.124, 0.146], [0.118, 0.162]], 16), {
      pos: [0, 0, 0.012],
      scale: [1.02, 1, 1.12]
    }),
    materialIndex: 6
  });
  // Prominent anisotropic-brass twin ocular dust goggles + reflective deep-teal lenses (angled slightly wrap-around)
  for (const side of [-1, 1] as const) {
    const gx = side * 0.052;
    headSlots.push({
      mesh: transformMesh(
        latheMesh([[0.03, -0.022], [0.043, -0.016], [0.045, 0.016], [0.036, 0.024]], 14),
        { pos: [gx, 0.146, -0.104], rot: [-Math.PI / 2, side * 0.22, 0] }
      ),
      materialIndex: 8
    });
    headSlots.push({
      mesh: transformMesh(
        latheMesh([[0, 0.021], [0.034, 0.019], [0.037, 0.01]], 14),
        { pos: [gx, 0.146, -0.108], rot: [-Math.PI / 2, side * 0.22, 0] }
      ),
      materialIndex: 10
    });
  }
  headSlots.push({
    mesh: transformMesh(bevelBoxMesh(0.034, 0.015, 0.022, 0.005), { pos: [0, 0.15, -0.116] }),
    materialIndex: 8
  });

  // 5A & 5B. Articulated arms & leather-gloved hands gripping the skiff control yoke at [+-0.225, 0.90, -0.34]
  const buildPilotArmSlots = (side: -1 | 1): MultiMatSlot[] => [
    // Draped poncho shoulder sleeve cuff
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            ovalRing(0, 0.02, 0, 0.072, 0.074, 10),
            ovalRing(side * 0.032, -0.065, -0.05, 0.078, 0.078, 10),
            ovalRing(side * 0.052, -0.135, -0.11, 0.068, 0.068, 10)
          ],
          true,
          false
        ),
        1,
        0.45
      ),
      materialIndex: 0
    },
    // Sculpted upper arm down to athletic bent elbow
    {
      mesh: sculptHumanoidLimbMesh(
        [
          [0, 0, 0, 0.056],
          [side * 0.035, -0.095, -0.08, 0.05],
          [side * 0.062, -0.185, -0.16, 0.044]
        ],
        12,
        0.16
      ),
      materialIndex: 2
    },
    // Wrapped linen forearm bracer reaching forward to wrist
    {
      mesh: sculptHumanoidLimbMesh(
        [
          [side * 0.06, -0.182, -0.155, 0.044],
          [side * 0.052, -0.215, -0.245, 0.04],
          [side * 0.042, -0.236, -0.318, 0.034]
        ],
        12,
        0.14
      ),
      materialIndex: 4
    },
    // Brushed-brass wrist gauntlet ring
    {
      mesh: transformMesh(bevelBoxMesh(0.068, 0.052, 0.068, 0.012), {
        pos: [side * 0.044, -0.232, -0.305],
        rot: [0.22, -side * 0.1, 0]
      }),
      materialIndex: 8
    },
    // Sculpted dark-leather gloved hand + curled finger grip wrapped directly around the yoke handle [side * 0.04, -0.24, -0.35]
    {
      mesh: transformMesh(bevelBoxMesh(0.082, 0.048, 0.088, 0.016), {
        pos: [side * 0.04, -0.238, -0.346],
        rot: [0.16, -side * 0.08, side * 0.08]
      }),
      materialIndex: 6
    },
    {
      mesh: transformMesh(
        tubeSweepMesh(
          [
            [side * 0.008, -0.242, -0.335, 0.014],
            [side * 0.025, -0.258, -0.358, 0.015],
            [side * 0.065, -0.254, -0.362, 0.014]
          ],
          6
        ),
        {}
      ),
      materialIndex: 6
    }
  ];
  const leadArmSlots = buildPilotArmSlots(-1);
  const trailArmSlots = buildPilotArmSlots(1);

  // 6. Billowing trailing poncho back-hem + flowing desert scarf (`id: "rider-scarf"` + `id: "rider-scarf-tip"`)
  const scarfBaseSlots: MultiMatSlot[] = [
    // Fluttering pleated trailing poncho cape hem streaming aft (+Z) below the backpack radio
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            scarfRibbonSection(0.02, -0.22, 0.195, 0, 0.016, 0.028),
            scarfRibbonSection(0.18, -0.29, 0.235, 0.012, 0.014, 0.036),
            scarfRibbonSection(0.36, -0.35, 0.255, -0.01, 0.012, 0.042)
          ],
          true,
          true
        ),
        1,
        0.52
      ),
      materialIndex: 0
    },
    // Woven bone-linen trailing hem trim
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            scarfRibbonSection(0.33, -0.34, 0.252, -0.008, 0.013, 0.04),
            scarfRibbonSection(0.43, -0.375, 0.262, 0.008, 0.01, 0.044)
          ],
          true,
          true
        ),
        1,
        0.52
      ),
      materialIndex: 1
    },
    // Flowing upper desert cowl scarf streamer
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            scarfRibbonSection(0, 0.02, 0.086, 0, 0.016),
            scarfRibbonSection(0.18, 0.005, 0.102, 0.022, 0.015),
            scarfRibbonSection(0.36, -0.012, 0.108, -0.016, 0.013),
            scarfRibbonSection(0.54, -0.028, 0.094, 0.014, 0.011)
          ],
          true,
          true
        ),
        1,
        0.56
      ),
      materialIndex: 0
    }
  ];
  const scarfTipSlots: MultiMatSlot[] = [
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            scarfRibbonSection(0, 0, 0.092, 0.012, 0.011),
            scarfRibbonSection(0.24, -0.014, 0.082, -0.022, 0.009),
            scarfRibbonSection(0.48, -0.026, 0.056, 0.016, 0.008)
          ],
          true,
          true
        ),
        1,
        0.56
      ),
      materialIndex: 0
    },
    {
      mesh: subdivideSmoothMesh(
        loftSectionsMesh(
          [
            scarfRibbonSection(0.44, -0.024, 0.058, 0.012, 0.008),
            scarfRibbonSection(0.7, -0.036, 0.022, -0.012, 0.005)
          ],
          true,
          true
        ),
        1,
        0.56
      ),
      materialIndex: 1
    }
  ];

  const scarfTipNode = assembleMultiMaterialNode("rider-scarf-tip", scarfTipSlots, materials, {
    id: "rider-scarf-tip",
    position: [0, -0.028, 0.5],
    castShadow: false,
    receiveShadow: true
  });
  const scarfNode = group(
    "rider-scarf",
    [
      assembleMultiMaterialNode("rider-scarf-mesh", scarfBaseSlots, materials, {
        castShadow: false,
        receiveShadow: true
      }),
      scarfTipNode
    ],
    { position: [0, 0.36, 0.095], rotation: [0.08, 0, 0] }
  ).runtime({ id: "rider-scarf" });

  const headNode = assembleMultiMaterialNode("rider-head", headSlots, materials, {
    id: "rider-head",
    position: [0, 0.395, -0.02],
    castShadow: false,
    receiveShadow: true
  });
  const leadArmNode = assembleMultiMaterialNode("rider-arm-lead", leadArmSlots, materials, {
    id: "rider-arm-lead",
    position: [-0.185, 0.34, -0.02],
    castShadow: false,
    receiveShadow: true
  });
  const trailArmNode = assembleMultiMaterialNode("rider-arm-trail", trailArmSlots, materials, {
    id: "rider-arm-trail",
    position: [0.185, 0.34, -0.02],
    castShadow: false,
    receiveShadow: true
  });
  const torsoMeshNode = assembleMultiMaterialNode("rider-torso-mesh", torsoSlots, materials, {
    castShadow: true,
    receiveShadow: true
  });
  const torsoNode = group(
    "rider-torso",
    [torsoMeshNode, headNode, leadArmNode, trailArmNode, scarfNode],
    { position: [0, 0.06, -0.01] }
  ).runtime({ id: "rider-torso" });

  const pelvisMeshNode = assembleMultiMaterialNode("rider-pelvis-mesh", pelvisSlots, materials, {
    castShadow: true,
    receiveShadow: true
  });
  const pelvisNode = group(
    "rider-pelvis",
    [pelvisMeshNode, torsoNode],
    { position: [0, 0.74, 0.04] }
  ).runtime({ id: "rider-pelvis" });

  return group("rider", [stanceNode, pelvisNode], { position: [0, 4, 0] }).runtime({ id: "rider" });
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
  const parts: (RawMesh & { readonly colors: Float32Array })[] = [
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
  const parts: (RawMesh & { readonly colors: Float32Array })[] = [];
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
  const parts: (RawMesh & { readonly colors: Float32Array })[] = [
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
  const parts: (RawMesh & { readonly colors: Float32Array })[] = [
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
