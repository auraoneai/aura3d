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
  type AuraCustomPostPass,
  type AuraMaterialSpec,
  type AuraModelMaterialOverride,
  type AuraTransformSpec,
  type AuraVfxBuiltinSequence,
  type scene
} from "@aura3d/engine";
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
  sky: "pbl-sky",
  ambient: "pbl-ambient",
  vignette: "pbl-vignette",
  dof: "pbl-miniature-dof",
  shafts: "pbl-sun-shafts",
  lensFlare: "pbl-sun-flare",
  aurora: "pbl-aurora",
  heatShimmer: "pbl-heat-shimmer",
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

const felt = (color: string): AuraMaterialSpec => material.felt({ color, sheenColor: color });
const clay = (color: string): AuraMaterialSpec => material.matteClay({ color });

/**
 * Interim hand-made surfaces per platform kind (PBL-M1): felt tops on clay bodies,
 * clearcoat toadstool-red caps on darker mushroom stems (#b8a58a), brushed metal, gold.
 * The platform tile kit (PBL-A1, WP-36) replaces these slabs on the same colliders.
 */
export const SURFACES: Readonly<Record<PlatformKind, SurfacePair>> = {
  grass: { body: clay("#6b4c35"), top: felt(PIP_PALETTE.moss) },
  earth: { body: clay("#5c3f28"), top: felt("#7d6243") },
  mushroom: { body: clay("#b8a58a"), top: material.lacquer({ color: PIP_PALETTE.toadstool, roughness: 0.32 }) },
  leaf: { body: felt("#2f6333"), top: felt("#4f8e45") },
  dock: { body: clay("#6b4c35"), top: clay("#9e7344") },
  wood: { body: clay("#6b4c35"), top: clay("#ad814c") },
  rope: { body: felt("#7d6140"), top: felt("#c49d62") },
  cloud: { body: felt("#b6aec0"), top: felt("#d6cab2") },
  sky: { body: felt("#7f8fb0"), top: felt("#a9b9d6") },
  stone: { body: clay("#4a4541"), top: clay("#736a61") },
  ember: { body: clay("#3f271d"), top: clay("#8a4a2c") },
  metal: { body: material.brushedMetal({ color: "#5a5e6a" }), top: material.brushedMetal({ color: "#868c9c" }) },
  marble: { body: clay("#a89d8e"), top: material.ceramic({ color: "#cfc4b0", roughness: 0.4 }) },
  gold: { body: material.metal({ color: "#7c5f26", roughness: 0.42 }), top: material.metal({ color: "#c9a24a", roughness: 0.3 }) },
  crystal: { body: material.clearcoat({ color: "#4f3f85", roughness: 0.25 }), top: material.clearcoat({ color: "#8a7ad0", roughness: 0.18 }) },
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

/** Lava look constants (PBL-M2): crust basalt, crack orange, HDR crack peak. */
export const LAVA_LOOK = { crust: [0.16, 0.08, 0.06], glow: [1, 0.42, 0.12], glowIntensity: 3.2, crustScale: 0.9, flowSpeed: 0.12 } as const;

export function lavaMaterial(motion = 1): AuraMaterialSpec {
  return {
    ...material.custom({
      glsl: { vertex: LAVA_VERTEX_GLSL, fragment: LAVA_FRAGMENT_GLSL },
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
 * The closed diorama: a felt-topped clay plinth under the whole course with a darker
 * skirt, plus seeded felt mounds along both flanks. The base only receives shadows
 * (4 draws, under the PRD's +6).
 */
export function dioramaBase(spec: WorldSpec, look: WorldLook, depth: number): DioramaBase {
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
  return {
    top,
    nodes: [
      primitives.roundedBox({ name: dioramaName.baseFelt, size: [w, 0.6, d], position: [cx, top - 0.3, cz], params: { radius: 0.25 }, material: felt(look.base.felt), castShadow: false, receiveShadow: true }),
      primitives.box({ name: dioramaName.baseClay, size: [w + 0.5, plinth, d + 0.5], position: [cx, top - 0.6 - plinth / 2, cz], material: clay(look.base.clay), castShadow: false, receiveShadow: false }),
      primitives.box({ name: dioramaName.baseSkirt, size: [w + 0.9, 0.5, d + 0.9], position: [cx, top - 0.6 - plinth - 0.25, cz], material: clay(look.base.skirt), castShadow: false, receiveShadow: false }),
      instances.sphere({ name: dioramaName.baseMounds, transforms: mounds, material: felt(look.base.mound), castShadow: false, receiveShadow: true })
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
 * f/2, 50 mm, maxBlur 4. The runtime follows Pip with `app.post.setEffect("depthOfField",
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
    uniforms: { u_pixels: look.heatShimmer.pixels, u_band: look.heatShimmer.band, u_speed: look.heatShimmer.speed }
  });
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
        kind === "clover" ? { position: [x, y + 0.03 * s, z], rotation: [0, yaw, 0], scale: [0.09 * s, 0.05 * s, 0.09 * s] }
        : kind === "grass" ? { position: [x, y + 0.09 * s, z], rotation: [0, yaw, (rand() - 0.5) * 0.4], scale: [0.025 * s, 0.18 * s, 0.025 * s] }
        : kind === "fern" ? { position: [x, y + 0.07 * s, z], rotation: [(rand() - 0.5) * 0.6, yaw, 0], scale: [0.05 * s, 0.14 * s, 0.05 * s] }
        : kind === "pebble" ? { position: [x, y + 0.02 * s, z], rotation: [0, yaw, 0], scale: [0.07 * s, 0.035 * s, 0.05 * s] }
        : { position: [x, y + 0.006, z], rotation: [0, yaw, 0], scale: [0.09 * s, 0.008, 0.05 * s] };
      buckets[kind].push(t);
    }
  }
  return [
    { name: dioramaName.flora("clover"), primitive: "sphere", transforms: buckets.clover, material: felt(colors.clover), wind: false },
    { name: dioramaName.flora("grass"), primitive: "cone", transforms: buckets.grass, material: felt(colors.grass), wind: true },
    { name: dioramaName.flora("fern"), primitive: "cone", transforms: buckets.fern, material: felt(colors.fern), wind: true },
    { name: dioramaName.flora("pebble"), primitive: "sphere", transforms: buckets.pebble, material: clay(colors.pebble), wind: false },
    { name: dioramaName.flora("leaf"), primitive: "box", transforms: buckets.leaf, material: felt(colors.leaf), wind: false }
  ];
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
