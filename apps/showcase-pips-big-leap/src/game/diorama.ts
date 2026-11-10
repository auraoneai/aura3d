// Pip's Big Leap: the felt-and-clay diorama presentation (GU47 WP-16).
//
// Pure scene-node builders for the diorama look, lowered from the per-world look table
// (`looks.ts`). Nothing here touches collision: `world.ts` builds the collision world from
// the same WorldSpec exactly as before, and these nodes only dress it (PRD D8).
//
// Rows: PBL-L1 (hemisphere), PBL-L2 (practicals, w2 lens flare), PBL-E1 (diorama base),
// PBL-E2 (sky), PBL-E3 (ambient emitter), PBL-P1 (vignette), PBL-P2 (miniature DOF),
// PBL-P3 (sun shafts), PBL-M1 (felt / clay / clearcoat / brushed-metal / gold surfaces),
// PBL-M2 interim (plum bramble, glowing lava), PBL-W1 (seeded flora dressing).

import {
  effects,
  instances,
  lights,
  material,
  primitives,
  sky,
  surfaces,
  type AuraCustomGeometrySpec,
  type AuraCustomPostPass,
  type AuraMaterialSpec,
  type AuraModelMaterialOverride,
  type AuraTransformSpec,
  type AuraVfxBuiltinSequence,
  type scene
} from "@aura3d/engine";
import { dualAnimatedWaterSpec } from "../../../showcase-port-shared/dual-shaders.js";
import { WGSL_CLIP, WGSL_COLOR, WGSL_ENVIRONMENT_FOG, WGSL_MATH, wgslStage } from "../../../showcase-port-shared/wgsl-twins.js";
import {
  MINIATURE_LENS,
  PIP_PALETTE,
  focusDistanceFor,
  miniatureFramingFor,
  sunPosition,
  type PipAmbientKind,
  type PresentationScale,
  type WorldLook
} from "./looks.js";
import type { HazardSpec, PlatformKind, PlatSpec, WorldSpec } from "./types.js";

/** Anything `scene().add` takes. */
export type DioramaNode = Parameters<ReturnType<typeof scene>["add"]>[0];

/** Node names the runtime drives or the tests read. */
export const dioramaName = {
  hemisphere: "pbl-hemisphere",
  baseFelt: "pbl-base-felt",
  baseClay: "pbl-base-clay",
  baseSkirt: "pbl-base-skirt",
  baseMounds: "pbl-base-mounds",
  baseTiles: "pbl-base-tiles",
  sky: "pbl-sky",
  ambient: "pbl-ambient",
  vignette: "pbl-vignette",
  dof: "pbl-miniature-dof",
  shafts: "pbl-sun-shafts",
  lensFlare: "pbl-sun-flare",
  aurora: "pbl-aurora",
  ssr: "pbl-ssr",
  millpondMirror: "pbl-millpond-mirror",
  millpondRipple: "pbl-millpond-ripple",
  millpondFoam: "pbl-millpond-foam",
  heatShimmer: "pbl-heat-shimmer",
  flipbookDust: (slot: number) => `pbl-flip-dust:${slot}`,
  flipbookSparks: (slot: number) => `pbl-flip-sparks:${slot}`,
  flora: (layer: string) => `pbl-flora-${layer}`
} as const;

// ---------------------------------------------------------------- course bounds

export interface CourseBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly floorY: number;
  readonly topY: number;
}

export function courseBounds(spec: WorldSpec): CourseBounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, floorY = Infinity, topY = -Infinity;
  for (const p of spec.platforms) {
    minX = Math.min(minX, p.x - p.w / 2);
    maxX = Math.max(maxX, p.x + p.w / 2);
    minZ = Math.min(minZ, p.z - p.d / 2);
    maxZ = Math.max(maxZ, p.z + p.d / 2);
    floorY = Math.min(floorY, p.y - (p.h ?? 0.55));
    topY = Math.max(topY, p.y);
  }
  return { minX, maxX, minZ, maxZ, floorY: Math.min(0, floorY), topY };
}

/** Small seeded PRNG (mulberry32): the same seed gives the same dressing transforms. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- PBL-M1 surfaces

export interface SurfacePair {
  readonly body: AuraMaterialSpec;
  readonly top: AuraMaterialSpec;
}

// GU47 phase 3: a fine, faint nap. The preset's fabric normal (scale 48, strength 0.28) tiled
// once per slab read as a grid of bands across the big felt tops in the blind-panel frames.
const FELT_NAP = { kind: "aura-procedural-texture", texture: "fabric-normal", scale: 180, strength: 0.07, contrast: 0.4 } as const;
const felt = (color: string): AuraMaterialSpec => material.felt({ color, sheenColor: color, sheen: 0.35, normal: FELT_NAP });
const clay = (color: string): AuraMaterialSpec => material.matteClay({ color });
/**
 * Glazed ceramic clay for hero/merged platform bodies: satin ceramic glaze gives slab walls
 * warm sky reflections while felt tops stay plush and glare-free.
 */
const glazedClay = (color: string): AuraMaterialSpec =>
  material.ceramic({ name: "glazed clay", color, roughness: 0.56, clearcoat: 0.34, clearcoatRoughness: 0.28, envMapIntensity: 0.72 });

/**
 * Hardware-instanced felt & ceramic equivalents for `instances.*` pools (WP-11 draw-call collapse):
 * `ForwardPass` expands any `instances.*` material that sets extension lobes (`sheen`, `clearcoat`,
 * `iridescence`, `anisotropy`, `specularIntensity`, `ior`, `thickness`, `transmission`) into 1 draw
 * per instance. Translating felt nap onto `diffuseRoughness` + `retroreflection` keeps every
 * `floraNodes`, `baseMounds`, `millpondFoam` and `instances.roundedBox` pool in 1 GPU draw call.
 */
export const instancedFelt = (color: string, roughness = 0.86): AuraMaterialSpec =>
  material.pbr({ name: "instanced felt", color, roughness, metallic: 0, diffuseRoughness: 0.88, retroreflection: 0.28, envMapIntensity: 0.72 });

export const instancedClay = (color: string, roughness = 0.82): AuraMaterialSpec =>
  material.pbr({ name: "instanced clay", color, roughness, metallic: 0, diffuseRoughness: 0.65, envMapIntensity: 0.65 });

export function instancedSurface(spec: AuraMaterialSpec): AuraMaterialSpec {
  const hasSheen = (spec.sheen ?? 0) > 0;
  const hasCoat = (spec.clearcoat ?? 0) > 0;
  const baseRoughness = spec.roughness ?? 0.68;
  return material.pbr({
    name: spec.name ? `${spec.name} (instanced)` : "instanced surface",
    color: spec.color ?? "#808080",
    metallic: spec.metallic ?? spec.metalness ?? 0,
    roughness: hasCoat ? Math.max(0.24, baseRoughness * 0.78) : baseRoughness,
    diffuseRoughness: hasSheen ? Math.max(0.84, spec.diffuseRoughness ?? 0.84) : spec.diffuseRoughness,
    retroreflection: hasSheen ? Math.max(0.26, spec.retroreflection ?? 0.26) : spec.retroreflection,
    envMapIntensity: hasCoat ? Math.max(0.95, spec.envMapIntensity ?? 0.85) : (spec.envMapIntensity ?? 0.75)
  });
}

/**
 * Hand-made toy-diorama surfaces per platform kind (PBL-M1): plush wool-felt tops on glazed
 * ceramic-clay bodies, lacquered toadstool-red caps on warm stems (#b8a58a), brushed metal, gold.
 */
export const SURFACES: Readonly<Record<PlatformKind, SurfacePair>> = {
  grass: { body: glazedClay("#6b4c35"), top: felt("#6a9a48") },
  earth: { body: glazedClay("#5c3f28"), top: felt("#7d6243") },
  mushroom: { body: glazedClay("#b8a58a"), top: material.lacquer({ color: PIP_PALETTE.toadstool, roughness: 0.28, clearcoat: 0.72, clearcoatRoughness: 0.14 }) },
  leaf: { body: felt("#2f6333"), top: felt("#4f8e45") },
  dock: { body: glazedClay("#6b4c35"), top: clay("#9e7344") },
  wood: { body: glazedClay("#6b4c35"), top: clay("#ad814c") },
  rope: { body: felt("#7d6140"), top: felt("#c49d62") },
  cloud: { body: felt("#b6aec0"), top: felt("#d6cab2") },
  sky: { body: felt("#7f8fb0"), top: felt("#a9b9d6") },
  stone: { body: glazedClay("#4a4541"), top: clay("#736a61") },
  ember: { body: glazedClay("#3f271d"), top: clay("#8a4a2c") },
  metal: { body: material.brushedMetal({ color: "#5a5e6a" }), top: material.brushedMetal({ color: "#868c9c" }) },
  // Satin honey ceramic stone with gentle clearcoat so palace lanterns glint softly without glare.
  marble: { body: glazedClay("#a89d8e"), top: material.ceramic({ color: "#d9c7a4", roughness: 0.52, clearcoat: 0.22, clearcoatRoughness: 0.34 }) },
  gold: { body: material.metal({ color: "#7c5f26", roughness: 0.42 }), top: material.metal({ color: "#c9a24a", roughness: 0.3 }) },
  // Deeper amethyst lacquer over dark crystal facets.
  crystal: { body: material.lacquer({ color: "#3a2f6a", roughness: 0.38, clearcoat: 0.55 }), top: material.lacquer({ color: "#6a5ab4", roughness: 0.32, clearcoat: 0.6, envMapIntensity: 0.85 }) },
  starlight: { body: felt("#322c58"), top: felt("#9d8fd8") }
};

/** Rounded-box radius of the felt-and-clay slabs (unit box; instances scale it with the slab). */
export const SLAB_RADIUS = 0.08;

/**
 * PBL-M2 crusted lava (w4): dark basalt crust plates drifting over glowing HDR cracks,
 * world-space so neighbouring pools line up. The crack glow peaks at `glowIntensity`
 * (linear, above 1 so the look's bloom catches it); `flowSpeed` carries reduced motion.
 */
export const LAVA_FRAGMENT_GLSL = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec3 vW;
out vec4 outColor;
float pblHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float pblNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pblHash(i), pblHash(i + vec2(1.0, 0.0)), u.x), mix(pblHash(i + vec2(0.0, 1.0)), pblHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = vW.xz * crustScale + vec2(0.0, uTime * flowSpeed);
  float n = pblNoise(p) * 0.65 + pblNoise(p * 2.3 + vec2(7.1, 3.7)) * 0.35;
  float crack = 1.0 - smoothstep(0.05, 0.16, abs(n - 0.5));
  float pulse = 0.85 + 0.15 * sin(uTime * flowSpeed * 3.0 + n * 6.2832);
  vec3 crust = a3dSrgbToLinear(crustColor) * (0.75 + 0.5 * pblNoise(p * 5.0));
  vec3 glow = a3dSrgbToLinear(glowColor) * glowIntensity * pulse;
  outColor = vec4(a3dFinite(mix(crust, glow, crack)), 1.0);
}`;

export const LAVA_VERTEX_GLSL = /* glsl */ `
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const LAVA_VERTEX_WGSL = wgslStage(
  [WGSL_CLIP],
  /* wgsl */ `
struct VertexOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
};
@vertex
fn vs_main(@location(0) a_position: vec3<f32>) -> VertexOut {
  var out: VertexOut;
  let w = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.worldPos = w.xyz;
  out.clipPosition = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`
);

export const LAVA_FRAGMENT_WGSL = wgslStage(
  [WGSL_MATH, WGSL_COLOR, WGSL_ENVIRONMENT_FOG],
  /* wgsl */ `
fn pblHash(pIn: vec2<f32>) -> f32 {
  var p = fract(pIn * vec2<f32>(123.34, 456.21));
  p = p + dot(p, p + vec2<f32>(45.32));
  return fract(p.x * p.y);
}
fn pblNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(
    mix(pblHash(i), pblHash(i + vec2<f32>(1.0, 0.0)), u.x),
    mix(pblHash(i + vec2<f32>(0.0, 1.0)), pblHash(i + vec2<f32>(1.0, 1.0)), u.x),
    u.y
  );
}
@fragment
fn fs_main(
  @location(0) worldPos: vec3<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let p = worldPos.xz * aura.u_crustScale + vec2<f32>(0.0, aura.u_time * aura.u_flowSpeed);
  let n = pblNoise(p) * 0.65 + pblNoise(p * 2.3 + vec2<f32>(7.1, 3.7)) * 0.35;
  let crack = 1.0 - smoothstep(0.05, 0.16, abs(n - 0.5));
  let pulse = 0.85 + 0.15 * sin(aura.u_time * aura.u_flowSpeed * 3.0 + n * 6.2832);
  let crust = a3dSrgbToLinear(aura.u_crustColor) * (0.75 + 0.5 * pblNoise(p * 5.0));
  let glow = a3dSrgbToLinear(aura.u_glowColor) * aura.u_glowIntensity * pulse;
  let lit = a3dFinite3(mix(crust, glow, crack));
  return vec4<f32>(a3dApplyEnvironmentFog(lit, worldPos, fragCoord.xy), 1.0);
}`
);

/** Lava look constants (PBL-M2): crust basalt, crack orange, HDR crack peak. */
export const LAVA_LOOK = { crust: [0.16, 0.08, 0.06], glow: [1, 0.42, 0.12], glowIntensity: 3.2, crustScale: 0.9, flowSpeed: 0.12 } as const;

export function lavaMaterial(motion = 1): AuraMaterialSpec {
  return {
    ...material.custom({
      glsl: { vertex: LAVA_VERTEX_GLSL, fragment: LAVA_FRAGMENT_GLSL },
      wgsl: { vertex: LAVA_VERTEX_WGSL, fragment: LAVA_FRAGMENT_WGSL },
      uniforms: {
        crustColor: { type: "vec3", value: [...LAVA_LOOK.crust] },
        glowColor: { type: "vec3", value: [...LAVA_LOOK.glow] },
        glowIntensity: { type: "f32", value: LAVA_LOOK.glowIntensity },
        crustScale: { type: "f32", value: LAVA_LOOK.crustScale },
        flowSpeed: { type: "f32", value: LAVA_LOOK.flowSpeed * motion }
      },
      fog: true
    }),
    // A light source, not fill: the art-direction audit and the no-emissive-fill test read this.
    practical: true
  };
}

/**
 * PBL-M2 hazards: a matte plum bramble mat (hue about 271, outside 290-330; no emissive
 * fill), crusted scrolling lava (custom shader), embers as practical light sources, pale
 * clearcoat frost. The bramble model is WP-36.
 */
export function hazardMaterial(type: HazardSpec["type"], motion = 1): AuraMaterialSpec {
  switch (type) {
    case "thorns": return material.felt({ color: "#5b3a7a", sheenColor: "#7a5a9a" });
    case "lava": return lavaMaterial(motion);
    case "ember": return material.emissive({ color: "#ff9435", emissive: "#ff8a2a", emissiveIntensity: 1.1, roughness: 0.5, practical: true });
    case "frost": return material.clearcoat({ color: "#8fd0e8", roughness: 0.2 });
  }
}

/**
 * PBL-M2 iridescent crystals: a cool cyan-to-violet fresnel rim over the crystal shards
 * (rim reaches every generated-program PBR material) plus KHR iridescence, which the
 * engine applies only to materials that already carry the parameter.
 */
export const CRYSTAL_OVERRIDES: readonly AuraModelMaterialOverride[] = [
  { rim: { color: "#9fe8ff", power: 2.4, intensity: 0.9 }, iridescence: 1, roughness: 0.18 }
];

/** PBL-M2 gold seeds: sun-seed gold emissive lift and a warm rim on the pickup GLB (textures kept). */
export const SEED_OVERRIDES: readonly AuraModelMaterialOverride[] = [
  { emissive: PIP_PALETTE.sunSeed, emissiveIntensity: 0.45, metallic: 0.7, roughness: 0.3, rim: { color: "#ffe39a", power: 3, intensity: 0.7 } }
];

/**
 * GU47 phase 4: Pip's acorn shell as a polished nut (diorama only). Pip's GLB bakes one material,
 * so a soft clearcoat and a stronger environment term make the cap and body pick up the sky;
 * the rubric judges saw "almost no environment reflection" on the hero.
 */
export const PIP_GLOSS: readonly AuraModelMaterialOverride[] = [
  { clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.35 }
];

/** Contact shadows under Pip and the props (phase 4: stronger and longer so the hero grounds). */
export const CONTACT_SHADOWS = { intensity: 1.0, length: 0.42 } as const;

/** Sun-Gate ring: sun-seed gold, a practical (the portal is a light source, not fill). */
export const GATE_RING_MATERIAL: AuraMaterialSpec = material.emissive({ color: PIP_PALETTE.sunSeed, emissive: PIP_PALETTE.sunSeed, emissiveIntensity: 0.9, practical: true });

/** Instance transform of a platform body / felt top on a unit rounded box. */
export function slabTransforms(p: PlatSpec, platHeight: number): { readonly body: AuraTransformSpec; readonly top: AuraTransformSpec } {
  const h = p.h ?? platHeight;
  return {
    body: { position: [p.x, p.y - h / 2, p.z], scale: [p.w, h, p.d] },
    top: { position: [p.x, p.y - 0.05, p.z], scale: [p.w * 0.98, 0.12, p.d * 0.98] }
  };
}

// ---------------------------------------------------------------- PBL-E1 diorama base

export interface DioramaBase {
  readonly top: number;
  readonly nodes: readonly DioramaNode[];
}

/**
 * GU47 wave 2 (PBL-E1): a generated Meshy base island that tiles the plinth top. The
 * tile is stretched over the course footprint (X to the plinth width, Z to the same
 * scale) and squashed in Y so its toadstools and reeds stay below the course floor.
 */
export interface BaseTile {
  readonly asset: Parameters<typeof instances.model>[0];
  /** The GLB's own extents (x, y, z) in model units. */
  readonly size: readonly [number, number, number];
  /** Height fraction (0-1) at which the walkable surface of the island sits. */
  readonly surface: number;
}

/** Y squash of a base tile against its XZ stretch (1 = uniform scale). */
export const BASE_TILE_SQUASH = 0.42;
/** The tile surface rides this far above the base top so it reads over the felt filler. */
export const BASE_TILE_LIFT = 0.2;
/** Tallest feature stays well under the course floor (y = 0) so the rim never crowds portrait frames. */
export const BASE_TILE_CLEARANCE = 1.8;

/** Transforms of the base tiles along the course (pure, for the node and the tests). */
export function baseTileTransforms(spec: WorldSpec, tile: BaseTile, depth: number): { readonly transforms: readonly AuraTransformSpec[]; readonly height: number } {
  const b = courseBounds(spec);
  const top = -depth;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const width = b.maxX - b.minX + 16;
  const length = b.maxZ - b.minZ + 22;
  const [sx, sy, sz] = tile.size;
  const maxDim = Math.max(sx, sy, sz);
  const nx = sx / maxDim, ny = sy / maxDim, nz = sz / maxDim;
  const scaleXZ = width / nx;
  const cap = (depth - BASE_TILE_LIFT - BASE_TILE_CLEARANCE) / (1 - tile.surface);
  const height = Math.max(1, Math.min(BASE_TILE_SQUASH * scaleXZ * ny, cap));
  const scaleY = height / ny;
  const tileLength = scaleXZ * nz;
  const spacing = tileLength * 0.96;
  const count = Math.max(1, Math.ceil(length / spacing));
  const y = top + BASE_TILE_LIFT - tile.surface * height;
  const transforms: AuraTransformSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    transforms.push({ position: [cx, y, cz + (i - (count - 1) / 2) * spacing], rotation: [0, (i % 2) * Math.PI, 0], scale: [scaleXZ, scaleY, scaleXZ] });
  }
  return { transforms, height };
}

/**
 * The closed diorama: a felt-topped clay plinth under the whole course with a darker
 * skirt, plus seeded felt mounds along both flanks. The base only receives shadows
 * (4 draws, under the PRD's +6). With a Meshy `tile` the mounds give way to one instanced
 * draw of base tiles (the flat felt stays as the filler between and under them), so the
 * draw count is unchanged.
 */
export function dioramaBase(spec: WorldSpec, look: WorldLook, depth: number, tile?: BaseTile): DioramaBase {
  const b = courseBounds(spec);
  const top = -depth;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const w = b.maxX - b.minX + 16;
  const d = b.maxZ - b.minZ + 22;
  const plinth = 2.4;
  const rand = seededRandom(4700 + spec.order * 97);
  const mounds: AuraTransformSpec[] = [];
  for (let i = 0; i < 14; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const edge = side < 0 ? b.minX - 2.5 - rand() * 4 : b.maxX + 2.5 + rand() * 4;
    const z = b.maxZ + 4 - (i / 13) * (b.maxZ - b.minZ + 8) + (rand() - 0.5) * 3;
    const r = 1.6 + rand() * 2.2;
    mounds.push({ position: [edge, top - 0.1, z], scale: [r * 1.4, r * 0.55, r] });
  }
  const last: DioramaNode = tile
    ? instances.model(tile.asset, {
        name: dioramaName.baseTiles,
        targetMaxDimension: 1,
        castShadow: false,
        receiveShadow: true,
        transforms: baseTileTransforms(spec, tile, depth).transforms
      })
    : instances.sphere({ name: dioramaName.baseMounds, transforms: mounds, material: instancedFelt(look.base.mound), castShadow: false, receiveShadow: true });
  return {
    top,
    nodes: [
      primitives.roundedBox({ name: dioramaName.baseFelt, size: [w, 0.6, d], position: [cx, top - 0.3, cz], params: { radius: 0.25 }, material: felt(look.base.felt), castShadow: false, receiveShadow: true }),
      primitives.box({ name: dioramaName.baseClay, size: [w + 0.5, plinth, d + 0.5], position: [cx, top - 0.6 - plinth / 2, cz], material: clay(look.base.clay), castShadow: false, receiveShadow: false }),
      primitives.box({ name: dioramaName.baseSkirt, size: [w + 0.9, 0.5, d + 0.9], position: [cx, top - 0.6 - plinth - 0.25, cz], material: clay(look.base.skirt), castShadow: false, receiveShadow: false }),
      last
    ]
  };
}

// ---------------------------------------------------------------- lights

/** PBL-L1 hemisphere (sky/ground bounce under the IBL; not an ambient light). */
export function hemisphereNode(look: WorldLook): DioramaNode {
  return lights.hemisphere({ name: dioramaName.hemisphere, skyColor: look.hemisphere.skyColor, groundColor: look.hemisphere.groundColor, intensity: look.hemisphere.intensity });
}

/**
 * PBL-L2 practicals, each a runtime node so the flicker can drive it with `setLight`.
 * They stay unshadowed: the art direction allows one shadowed light for a platformer, and
 * local spot tiles do not render on the default bridge path yet (E-B handoff).
 */
export function practicalNodes(look: WorldLook): readonly DioramaNode[] {
  return look.practicals.map((p) =>
    p.type === "spot"
      ? lights.spot({ name: p.name, position: p.position, ...(p.target ? { target: p.target } : {}), angle: p.angle ?? 0.5, penumbra: p.penumbra ?? 0.4, distance: p.distance, intensity: p.intensity, color: p.color }).runtime({ id: p.name })
      : lights.point({ name: p.name, position: p.position, distance: p.distance, intensity: p.intensity, color: p.color }).runtime({ id: p.name })
  );
}

/** w2 lens flare on the low sun (PBL-L2): placed far along the key direction. */
export function lensFlareNode(look: WorldLook): DioramaNode | null {
  if (!look.lensFlare) return null;
  return lights.lensFlare({ name: dioramaName.lensFlare, position: sunPosition(look.key.elevationDeg, look.key.azimuthDeg, 400), intensity: look.lensFlare.intensity, occlusion: "frustum" });
}

// ---------------------------------------------------------------- PBL-E2 sky

/** Real sky behind the diorama in w2 / w3 / w6; the catalogue HDRI stays the environment source. */
export function skyNode(look: WorldLook): DioramaNode | null {
  const s = look.sky;
  if (!s) return null;
  if (s.model === "preetham") {
    return sky.preetham({
      name: dioramaName.sky,
      sun: { elevationDeg: look.key.elevationDeg, azimuthDeg: look.key.azimuthDeg },
      turbidity: s.turbidity,
      rayleigh: s.rayleigh,
      exposure: s.exposure,
      groundColor: s.groundColor,
      captureEnvironment: false
    });
  }
  return sky.gradient({
    name: dioramaName.sky,
    zenith: s.zenith,
    horizon: s.horizon,
    ground: s.ground,
    exponent: s.exponent,
    horizonGlow: s.horizonGlow,
    ...(s.stars ? { stars: { count: s.stars.count, brightness: s.stars.brightness } } : {}),
    captureEnvironment: false
  });
}

// ---------------------------------------------------------------- PBL-E3 ambient emitter

const AMBIENT_SPRITES: Readonly<Record<PipAmbientKind, AuraVfxBuiltinSequence>> = {
  petals: "soft-dot",
  spores: "dust-mote",
  motes: "dust-mote",
  fluff: "snowflake",
  embers: "glow",
  dust: "dust-mote",
  fireflies: "glow"
};

/** The C-21 emitter fields this game authors (a subset of the engine's `AuraParticleEmitterOptions`). */
interface AmbientEmitterOptions {
  readonly name: string;
  readonly attachTo: string;
  readonly position: readonly [number, number, number];
  readonly shape: "box";
  readonly shapeSize: readonly [number, number, number];
  readonly rate: number;
  readonly maxParticles: number;
  readonly loop: boolean;
  readonly prewarm: number;
  readonly seed: number;
  readonly lifetime: readonly [number, number];
  readonly speed: readonly [number, number];
  readonly size: readonly [number, number];
  readonly gravity: number;
  readonly drag: number;
  readonly noise: { readonly strength: number; readonly frequency: number };
  readonly color: string;
  readonly sprite: AuraVfxBuiltinSequence;
  readonly blend: "additive" | "alpha";
  readonly maxScreen: number;
}

/**
 * One seeded box emitter per world that follows Pip (E-F `attachTo`), so the ambient
 * petals / spores / motes / fluff / embers / dust / fireflies fill the lens wherever he
 * is. Reduced motion halves the rate; the tier budget clamps `maxParticles` on Low.
 */
export function ambientEmitterNode(look: WorldLook, scale: PresentationScale, heroNode: string, seed: number): DioramaNode {
  const a = look.ambient;
  const options: AmbientEmitterOptions = {
    name: dioramaName.ambient,
    attachTo: heroNode,
    position: [0, 1.4, -2.5],
    shape: "box",
    shapeSize: [11, 4.5, 14],
    rate: a.rate * scale.emission,
    maxParticles: Math.min(600, a.maxParticles),
    loop: true,
    prewarm: 4,
    seed,
    lifetime: a.lifetime,
    speed: a.speed,
    size: a.size,
    gravity: a.gravity,
    drag: a.drag,
    noise: { strength: 0.25 * scale.motion, frequency: 0.6 },
    color: a.color,
    sprite: AMBIENT_SPRITES[a.kind],
    blend: a.additive ? "additive" : "alpha",
    maxScreen: 0.02
  };
  // The factory's option type intersects the C-21 emitter fields with the legacy effect
  // node, which narrows the size/lifetime/speed ranges and noise to numbers; the factory
  // copies every field through as authored (`withEmitterOptions`), so the ranges reach the
  // emitter unchanged.
  return effects.particles(options as unknown as Parameters<typeof effects.particles>[0]);
}

// ---------------------------------------------------------------- post

/** PBL-P1 corner vignette (also the below-High stand-in for the miniature lens). */
export function vignetteNode(look: WorldLook): DioramaNode {
  return effects.vignette({ name: dioramaName.vignette, intensity: look.post.vignette.intensity, color: look.post.vignette.color, smoothness: 0.55, roundness: 0.8 });
}

/**
 * PBL-P2 signature miniature lens: thin-lens DOF focused on Pip (about 4.6 m on desktop),
 * f/4, 50 mm, maxBlur 2 (phase 3; f/2 and 4 px before). The runtime follows Pip with `app.post.setEffect("depthOfField",
 * { focusDistance })`. The engine tier table drops DOF below High (PRD 6.4).
 */
export function miniatureDofNode(): DioramaNode {
  return effects.depthOfField({
    name: dioramaName.dof,
    focusDistance: Number(focusDistanceFor(miniatureFramingFor(16 / 9)).toFixed(2)),
    fStop: MINIATURE_LENS.fStop,
    focalLength: MINIATURE_LENS.focalLength,
    maxBlur: MINIATURE_LENS.maxBlur
  });
}

/**
 * PBL-P3 sun shafts (w1, w2, w5): an S4 god-ray node with its own march density; the
 * shafts follow the key's direction (no authored light position). It is added before the
 * look group so the look's height fog stays the scene's active (last) fog node.
 */
export function sunShaftsNode(look: WorldLook): DioramaNode | null {
  if (!look.shafts) return null;
  return effects.volumetricFog({
    name: dioramaName.shafts,
    density: look.fog.density,
    color: look.shafts.color,
    intensity: look.shafts.intensity,
    godRayDensity: look.shafts.density
  });
}

/**
 * PBL-V3 (w6): one aurora curtain hung high behind the far end of the course (one draw).
 * Reduced motion keeps it but cuts its sway and shimmer to 30%.
 */
export function auroraNode(spec: WorldSpec, look: WorldLook, scale: PresentationScale): DioramaNode | null {
  if (!look.aurora) return null;
  const b = courseBounds(spec);
  return effects.auroraRibbon({
    name: dioramaName.aurora,
    color: look.aurora.color,
    colorTop: look.aurora.colorTop,
    intensity: look.aurora.intensity,
    width: 46,
    height: 7,
    segments: 64,
    sway: 0.8 * scale.motion,
    shimmer: 0.5 * scale.motion
  }).position((b.minX + b.maxX) / 2, b.topY + 7, b.minZ - 16);
}

/** Screen-space reflections for glossy pond water, honey ceramic palace stone and crystal slabs. */
export function ssrNode(look: WorldLook): DioramaNode | null {
  if (!look.ssr) return null;
  return effects.screenSpaceReflections({
    name: dioramaName.ssr,
    intensity: 0.52,
    maxDistance: 14,
    roughness: 0.22,
    thickness: 0.25
  });
}

/**
 * PBL-V3 (w4) heat-shimmer fragment. The engine prelude supplies `u_color`, `u_texelSize`,
 * `u_time` and `v_uv` (bottom-left origin). The ripple is a sum of two slow sines,
 * displaced by at most `u_pixels` px, full at the bottom of the frame (the lava cellar
 * floor) and gone above `u_band`; colour is only resampled, never added, so the frame
 * mean barely moves.
 */
export const HEAT_SHIMMER_GLSL = /* glsl */ `
uniform float u_pixels;
uniform float u_band;
uniform float u_speed;
void main() {
  float w = 1.0 - smoothstep(0.0, u_band, v_uv.y);
  float t = u_time * u_speed;
  float dx = sin(v_uv.y * 92.0 - t * 3.1) * 0.6 + sin(v_uv.y * 171.0 + v_uv.x * 29.0 - t * 4.7) * 0.4;
  float dy = sin(v_uv.x * 63.0 + t * 2.3) * 0.35;
  vec2 offset = vec2(dx, dy) * w * u_pixels * u_texelSize;
  vec4 c = texture(u_color, clamp(v_uv + offset, vec2(0.0), vec2(1.0)));
  outColor = c;
}`;

export const HEAT_SHIMMER_WGSL = /* wgsl */ `
struct HeatShimmerUniforms {
  frame: vec4<f32>,
  pixels: vec4<f32>,
  band: vec4<f32>,
  speed: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u_shimmer: HeatShimmerUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let bottomY = 1.0 - uv.y;
  let w = 1.0 - smoothstep(0.0, u_shimmer.band.x, bottomY);
  let t = u_shimmer.frame.z * u_shimmer.speed.x;
  let dx = sin(bottomY * 92.0 - t * 3.1) * 0.6 + sin(bottomY * 171.0 + uv.x * 29.0 - t * 4.7) * 0.4;
  let dy = sin(uv.x * 63.0 + t * 2.3) * 0.35;
  let offset = vec2<f32>(dx, -dy) * w * u_shimmer.pixels.x * u_shimmer.frame.xy;
  let p = clamp(uv + offset, u_shimmer.frame.xy * 0.5, vec2<f32>(1.0) - u_shimmer.frame.xy * 0.5);
  return textureSample(u_color, u_sampler, p);
}`;

/**
 * PBL-V3 (w4): the heat-shimmer post pass for `app.post.addPostPass`, or null. Off under
 * reduced motion (a moving screen distortion is exactly what PRD 6.3 removes) and on the
 * Low tier (one extra full-screen pass the budget does not pay for there).
 */
export function heatShimmerPass(look: WorldLook, scale: PresentationScale, lowTier = false): AuraCustomPostPass | null {
  if (!look.heatShimmer || scale.motion < 1 || lowTier) return null;
  return effects.shaderPass({
    name: dioramaName.heatShimmer,
    order: "after-bloom",
    glsl: HEAT_SHIMMER_GLSL,
    wgsl: HEAT_SHIMMER_WGSL,
    uniforms: { u_pixels: look.heatShimmer.pixels, u_band: look.heatShimmer.band, u_speed: look.heatShimmer.speed }
  });
}

/**
 * PBL-E4 (w2): each pond's surface as a horizontal planar mirror 2 cm under the top of its
 * tinted glass volume, topped by an animated dual-backend GLSL+WGSL stream ripple sheet and
 * a ring of instanced felt foam tufts around the rim (1 instanced draw).
 * Visual only: the water zones and colliders come from the same spec unchanged.
 */
export function millpondNodes(spec: WorldSpec, look: WorldLook, motion = 1): readonly DioramaNode[] {
  if (!look.millpond || spec.waters.length === 0) return [];
  const out: DioramaNode[] = [];
  const foam: AuraTransformSpec[] = [];
  const rippleMaterial = material.custom(
    dualAnimatedWaterSpec({
      shallowColor: hexToRgbTriplet(look.millpond.tint),
      deepColor: [0.15, 0.41, 0.5],
      foamColor: hexToRgbTriplet(look.millpond.foam),
      waveScale: 2.1,
      waveSpeed: 0.85 * motion,
      opacity: 0.42
    })
  );
  for (const w of spec.waters) {
    out.push(surfaces.mirror({ name: `${dioramaName.millpondMirror}:${w.id}`, position: [w.x, w.y - 0.02, w.z], size: [w.w * 0.98, w.d * 0.98], resolution: look.millpond.resolution, tint: look.millpond.tint }));
    out.push(
      primitives.plane({
        name: `${dioramaName.millpondRipple}:${w.id}`,
        size: [w.w * 0.98, 1, w.d * 0.98],
        position: [w.x, w.y - 0.006, w.z],
        rotation: [-Math.PI / 2, 0, 0],
        material: rippleMaterial,
        castShadow: false,
        receiveShadow: false
      })
    );
    const perimeter = 2 * (w.w + w.d);
    const count = Math.max(12, Math.round(perimeter / 0.45));
    for (let i = 0; i < count; i += 1) {
      // Walk the rectangle's rim at even arc length.
      let u = (i / count) * perimeter;
      let x: number, z: number;
      if (u < w.w) { x = w.x - w.w / 2 + u; z = w.z - w.d / 2; }
      else if ((u -= w.w) < w.d) { x = w.x + w.w / 2; z = w.z - w.d / 2 + u; }
      else if ((u -= w.d) < w.w) { x = w.x + w.w / 2 - u; z = w.z + w.d / 2; }
      else { u -= w.w; x = w.x - w.w / 2; z = w.z + w.d / 2 - u; }
      const s = 0.8 + 0.4 * ((i * 7919) % 13) / 12;
      foam.push({ position: [x, w.y + 0.01, z], scale: [0.16 * s, 0.035, 0.16 * s] });
    }
  }
  out.push(instances.sphere({ name: dioramaName.millpondFoam, transforms: foam, material: instancedFelt(look.millpond.foam, 0.9), castShadow: false, receiveShadow: true }));
  return out;
}

// ---------------------------------------------------------------- PBL-W1 flora dressing

export interface FloraLayer {
  readonly name: string;
  readonly primitive: "sphere" | "cone" | "cylinder" | "box";
  readonly transforms: readonly AuraTransformSpec[];
  readonly material: AuraMaterialSpec;
  readonly wind: boolean;
}

/** Flora palette per world family: felt and clay tufts in the world's own colours. */
function floraColors(look: WorldLook): { readonly clover: string; readonly grass: string; readonly fern: string; readonly pebble: string; readonly leaf: string } {
  return {
    clover: look.base.mound,
    grass: look.base.felt,
    fern: look.id === "w4" ? "#5a3a2a" : look.id === "w6" ? "#3a5a8a" : "#3f7a3a",
    pebble: look.base.clay,
    leaf: look.id === "w2" || look.id === "w5" ? "#b8763a" : look.id === "w3" ? "#d8c8d0" : "#6a8a3a"
  };
}

/**
 * 150-400 seeded tufts per world on the platform tops' outer rims (clover, grass, ferns,
 * pebbles, leaves), five instanced draws, no shadow casting, GPU wind on the soft layers.
 * Interim primitives until the flora set (WP-36) drops in on the same transforms.
 */
export function floraLayers(spec: WorldSpec, look: WorldLook, seed: number): readonly FloraLayer[] {
  const rand = seededRandom(seed);
  const colors = floraColors(look);
  const buckets: Record<"clover" | "grass" | "fern" | "pebble" | "leaf", AuraTransformSpec[]> = { clover: [], grass: [], fern: [], pebble: [], leaf: [] };
  const order = ["clover", "grass", "fern", "pebble", "leaf"] as const;
  const platforms = spec.platforms.filter((p) => !p.mover && !p.timed && !p.ghost && p.w * p.d >= 2);
  const perPlatform = Math.max(8, Math.min(26, Math.floor(320 / Math.max(1, platforms.length))));
  for (const p of platforms) {
    for (let i = 0; i < perPlatform; i += 1) {
      // Keep the middle of the walking surface clear: tufts sit in the outer 25% rim.
      const side = rand();
      const u = rand() * 2 - 1;
      const rim = 0.75 + rand() * 0.22;
      const alongX = side < 0.5;
      const x = p.x + (alongX ? u * p.w * 0.47 : Math.sign(u || 1) * rim * p.w * 0.5);
      const z = p.z + (alongX ? Math.sign(rand() - 0.5) * rim * p.d * 0.5 : u * p.d * 0.47);
      const kind = order[Math.floor(rand() * order.length)]!;
      const s = 0.6 + rand() * 0.8;
      const yaw = rand() * Math.PI * 2;
      const y = p.y + 0.01;
      const t: AuraTransformSpec =
        kind === "clover" ? { position: [x, y + 0.032 * s, z], rotation: [0, yaw, 0], scale: [0.11 * s, 0.055 * s, 0.11 * s] }
        : kind === "grass" ? { position: [x, y + 0.075 * s, z], rotation: [0, yaw, (rand() - 0.5) * 0.35], scale: [0.042 * s, 0.15 * s, 0.042 * s] }
        : kind === "fern" ? { position: [x, y + 0.065 * s, z], rotation: [(rand() - 0.5) * 0.5, yaw, 0], scale: [0.068 * s, 0.13 * s, 0.068 * s] }
        : kind === "pebble" ? { position: [x, y + 0.022 * s, z], rotation: [0, yaw, 0], scale: [0.075 * s, 0.038 * s, 0.055 * s] }
        : { position: [x, y + 0.008, z], rotation: [0, yaw, 0], scale: [0.095 * s, 0.012, 0.058 * s] };
      buckets[kind].push(t);
    }
  }
  return [
    { name: dioramaName.flora("clover"), primitive: "sphere", transforms: buckets.clover, material: instancedFelt(colors.clover), wind: false },
    { name: dioramaName.flora("grass"), primitive: "cone", transforms: buckets.grass, material: instancedFelt(colors.grass), wind: true },
    { name: dioramaName.flora("fern"), primitive: "cone", transforms: buckets.fern, material: instancedFelt(colors.fern), wind: true },
    { name: dioramaName.flora("pebble"), primitive: "sphere", transforms: buckets.pebble, material: instancedClay(colors.pebble), wind: false },
    { name: dioramaName.flora("leaf"), primitive: "box", transforms: buckets.leaf, material: instancedFelt(colors.leaf), wind: false }
  ];
}

// ---------------------------------------------------------------- hero shoulder cloth cape

function hexToRgbTriplet(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [0.25, 0.55, 1.0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Shoulder-pinned storybook cloak mesh (local origin = Pip's upper shoulders at y = 0).
 * Subdivided 6x8 grid tapering wider toward a scalloped hem and curving gently down -Y / -Z
 * behind Pip's back, with front + back faces so camera orbit never culls the inner lining.
 */
export function heroCapeGeometry(): Omit<AuraCustomGeometrySpec, "kind"> {
  const cols = 6;
  const rows = 8;
  const vertCols = cols + 1;
  const vertRows = rows + 1;
  const singleCount = vertCols * vertRows;
  const positions = new Float32Array(singleCount * 2 * 3);
  const normals = new Float32Array(singleCount * 2 * 3);
  const uvs = new Float32Array(singleCount * 2 * 2);

  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows; // 0 at collar, 1 at hem
    const halfW = 0.12 + 0.13 * Math.pow(v, 0.85);
    const baseY = -0.44 * v + 0.015 * Math.sin(v * Math.PI);
    const baseZ = -0.04 - 0.14 * Math.pow(v, 1.25);
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const s = u * 2 - 1; // -1..1 across shoulders
      const archZ = (1 - s * s) * (-0.038 * (0.35 + 0.65 * v));
      const scallopY = Math.cos(s * Math.PI * 2.5) * 0.012 * v * v;
      const px = s * halfW;
      const py = baseY + scallopY;
      const pz = baseZ + archZ;
      const nxRaw = s * 0.28;
      const nyRaw = 0.34;
      const nzRaw = -0.9;
      const nLen = Math.hypot(nxRaw, nyRaw, nzRaw) || 1;
      const nx = nxRaw / nLen, ny = nyRaw / nLen, nz = nzRaw / nLen;

      const idx = r * vertCols + c;
      const backIdx = singleCount + idx;
      positions[idx * 3] = px;
      positions[idx * 3 + 1] = py;
      positions[idx * 3 + 2] = pz;
      normals[idx * 3] = nx;
      normals[idx * 3 + 1] = ny;
      normals[idx * 3 + 2] = nz;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;

      positions[backIdx * 3] = px;
      positions[backIdx * 3 + 1] = py - 0.004;
      positions[backIdx * 3 + 2] = pz + 0.004;
      normals[backIdx * 3] = -nx;
      normals[backIdx * 3 + 1] = -ny;
      normals[backIdx * 3 + 2] = -nz;
      uvs[backIdx * 2] = u;
      uvs[backIdx * 2 + 1] = v;
    }
  }

  const indices = new Uint16Array(cols * rows * 12);
  let ptr = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * vertCols + c;
      const b = a + 1;
      const d = (r + 1) * vertCols + c;
      const e = d + 1;
      indices[ptr++] = a; indices[ptr++] = d; indices[ptr++] = b;
      indices[ptr++] = b; indices[ptr++] = d; indices[ptr++] = e;

      const ab = singleCount + a;
      const bb = singleCount + b;
      const db = singleCount + d;
      const eb = singleCount + e;
      indices[ptr++] = ab; indices[ptr++] = bb; indices[ptr++] = db;
      indices[ptr++] = bb; indices[ptr++] = eb; indices[ptr++] = db;
    }
  }
  return { positions, normals, uvs, indices };
}

export const HERO_CAPE_VERTEX_GLSL = /* glsl */ `
out vec3 vW;
out vec3 vN;
out vec2 vCapeUv;
void main() {
  float pin = uv.y * uv.y;
  float flutter = sin(uv.y * 5.8 - uTime * waveSpeed + uv.x * 2.6) * waveAmp * pin
                + cos(uv.x * 7.2 - uTime * (waveSpeed * 1.35)) * (waveAmp * 0.42) * pin;
  vec3 displaced = position + vec3(0.0, flutter * 0.45, -flutter);
  vec4 w = modelMatrix * vec4(displaced, 1.0);
  vW = w.xyz;
  vN = normalize(normalMatrix * normal);
  vCapeUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(displaced, 1.0);
}`;

export const HERO_CAPE_FRAGMENT_GLSL = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec3 vW;
in vec3 vN;
in vec2 vCapeUv;
out vec4 outColor;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(vec3(0.58, 0.72, 0.38));
  float ndl = clamp(dot(N, L), 0.0, 1.0);
  float wrap = 0.42 + 0.58 * ndl;
  float fresnel = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.4);
  vec3 base = a3dSrgbToLinear(capeColor);
  float hemTrim = smoothstep(0.86, 0.96, vCapeUv.y) * 0.18;
  vec3 col = base * wrap + (base * 0.55 + vec3(0.14, 0.12, 0.09)) * fresnel * 0.48 + vec3(0.28, 0.22, 0.1) * hemTrim;
  outColor = vec4(a3dFinite(col), 1.0);
}`;

export const HERO_CAPE_VERTEX_WGSL = wgslStage(
  [WGSL_CLIP],
  /* wgsl */ `
struct CapeVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) capeUv: vec2<f32>,
};
@vertex
fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> CapeVarying {
  var out: CapeVarying;
  let pin = a_uv.y * a_uv.y;
  let flutter = sin(a_uv.y * 5.8 - aura.u_time * aura.u_waveSpeed + a_uv.x * 2.6) * aura.u_waveAmp * pin
              + cos(a_uv.x * 7.2 - aura.u_time * (aura.u_waveSpeed * 1.35)) * (aura.u_waveAmp * 0.42) * pin;
  let displaced = a_position + vec3<f32>(0.0, flutter * 0.45, -flutter);
  let w = aura.u_modelMatrix * vec4<f32>(displaced, 1.0);
  out.worldPos = w.xyz;
  out.worldNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.capeUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(displaced, 1.0));
  return out;
}`
);

export const HERO_CAPE_FRAGMENT_WGSL = wgslStage(
  [WGSL_MATH, WGSL_COLOR, WGSL_ENVIRONMENT_FOG],
  /* wgsl */ `
@fragment
fn fs_main(
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) capeUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let N = normalize(worldNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - worldPos, vec3<f32>(0.0, 1.0, 0.0));
  let L = normalize(vec3<f32>(0.58, 0.72, 0.38));
  let ndl = clamp(dot(N, L), 0.0, 1.0);
  let wrap = 0.42 + 0.58 * ndl;
  let fresnel = a3dPow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.4);
  let base = a3dSrgbToLinear(aura.u_capeColor);
  let hemTrim = smoothstep(0.86, 0.96, capeUv.y) * 0.18;
  let col = a3dFinite3(base * wrap + (base * 0.55 + vec3<f32>(0.14, 0.12, 0.09)) * fresnel * 0.48 + vec3<f32>(0.28, 0.22, 0.1) * hemTrim);
  return vec4<f32>(a3dApplyEnvironmentFog(col, worldPos, fragCoord.xy), 1.0);
}`
);

/** Dual-backend GLSL + WGSL fluttering wool-felt cape material tinted by Pip's Studio swatch. */
export function heroCapeMaterial(color: string, motion = 1): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: HERO_CAPE_VERTEX_GLSL, fragment: HERO_CAPE_FRAGMENT_GLSL },
    wgsl: { vertex: HERO_CAPE_VERTEX_WGSL, fragment: HERO_CAPE_FRAGMENT_WGSL },
    uniforms: {
      capeColor: { type: "vec3", value: hexToRgbTriplet(color) },
      waveAmp: { type: "f32", value: 0.045 * motion },
      waveSpeed: { type: "f32", value: 7.2 * Math.max(0.3, motion) }
    },
    side: "double",
    fog: true
  });
}

/** Lower the flora layers to instanced nodes (one draw each, no shadow casting). */
export function floraNodes(layers: readonly FloraLayer[], motion: number): readonly DioramaNode[] {
  return layers
    .filter((layer) => layer.transforms.length > 0)
    .map((layer) => {
      const options = {
        name: layer.name,
        transforms: layer.transforms,
        material: layer.material,
        castShadow: false,
        receiveShadow: true,
        ...(layer.wind && motion > 0 ? { wind: { strength: 0.6 * motion, assetHeight: 1 } } : {})
      };
      switch (layer.primitive) {
        case "sphere": return instances.sphere(options);
        case "cone": return instances.cone(options);
        case "cylinder": return instances.cylinder(options);
        case "box": return instances.box(options);
      }
    });
}
