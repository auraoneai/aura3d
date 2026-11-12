/**
 * Duneglide on Aura3D: the rendered world for one chapter, built on the public engine surface.
 *
 * Lit PBR terrain, road and canal banks with CC0 texture sets, instanced trees, rocks, houses, lamps and aqueduct
 * piers, a rigged hero on a board, additive signal rings, a flowing canal, the ported sky dome, a cascaded sun,
 * hemisphere fill, fog and a light grade/bloom. Sky colours follow the original's per-chapter rule; the layout of
 * chapter 0 follows the original's measured object positions (see terrain.ts).
 */
import {
  camera, createAnimationController, effects, environments, geometry, instances, lights, material, model, prefabs, primitives, scene,
  type AuraApp, type AuraMaterialSpec, type AuraVec3
} from "@aura3d/engine";
import { assets } from "./assets";
import { CHAPTERS } from "./chapters-data";
import { INKED_CHASE, ORIGINAL_CHASE, chaseEyeBlocked, clearChaseEye, createChaseClearance, sceneryColumns, wantedChaseEye } from "./camera";
import { gateOpen, objectiveOf, type Sim } from "./sim";
import {
  DUNE_SAND_FRAGMENT, DUNE_SAND_VERTEX, RING_FRAGMENT, RING_VERTEX, SKY_FRAGMENT, SKY_INK_FRAGMENT, SKY_VERTEX,
  STRATA_CLIFF_FRAGMENT, STRATA_CLIFF_VERTEX, WATER_FRAGMENT, WATER_VERTEX
} from "./shaders";
import {
  DUNE_SAND_FRAGMENT_WGSL, DUNE_SAND_VERTEX_WGSL, RING_FRAGMENT_WGSL, RING_VERTEX_WGSL, SKY_FRAGMENT_WGSL,
  SKY_INK_FRAGMENT_WGSL, SKY_VERTEX_WGSL, STRATA_CLIFF_FRAGMENT_WGSL, STRATA_CLIFF_VERTEX_WGSL, WATER_FRAGMENT_WGSL, WATER_VERTEX_WGSL
} from "./shaders-wgsl";
import { createSiltFx, type SiltFx } from "./fx";
import { createImpactRig } from "../../apps/showcase-port-shared/feel";
import { createFlipbookAtlas } from "../../apps/showcase-port-shared/vfx-pack";
import { waterGraphMaterial } from "./water-graph";
import { portableWaterMaterial } from "./portable-water";
import { readPortableFlag } from "../shared/portable-flag";
import { createLightning } from "./storm";
import { dressingFor } from "./dressing";
import { DECAL_OPACITY, decalMesh, decalPlan } from "./decals";
import { SILT_PALETTE, chapterHdri, chapterLook, keyDirection, linearOf, type SiltLookMode } from "./art/look";
import {
  DESERT_INST_MAT,
  billowingRoutePennantSpec,
  canyonYardangRockSpec,
  collaredBronzeMastSpec,
  createBazaarStall,
  createBoardSailNode,
  createBoardTrimNode,
  createCanyonResonanceGate,
  createCourierMaterialOverrides,
  createDesertViaduct,
  createFlutedObeliskPillar,
  createGatehouseNeri,
  createSandSkiffNode,
  createSignalRelayTower,
  createStratifiedMesaSpire,
  createTowRelicNodes,
  createWindBannerMast,
  desertLanternPostSpec,
  desertScreeBoulderSpec,
  desertTamariskCanopySpec,
  desertTamariskTrunkSpec,
  duneAdobeDetailsSpec,
  duneAdobeWallsSpec,
  flutedColumnDrumSpec,
  flutedStonePierSpec,
  halfBuriedRuinArchSpec,
  resonatorDishCapSpec,
  ringGateSpec,
  unnamed,
  windCarvedMonolithSpec
} from "./art/proceduralModels";
import { buildArchitecture, farDuneRings, farDunes, orchardTerrainColors, terrainColors, type ColoredMesh } from "./architecture";
import { createTerrain, usesOriginalTerrain, type Column, type MeshData, type Placement, type Terrain } from "./terrain";
import { labCameraOptions, readLabFlags } from "../shared/lab-flags";
import { guardPose, limitLookLag, type GuardPose } from "../shared/camera-guard";

type Scene = ReturnType<typeof scene>;
export type Rgb = readonly [number, number, number];
export type CustomSpec = Parameters<typeof material.custom>[0];

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** 0xRRGGBB (sRGB) to a linear RGB triple. */
export const hexLinear = (hex: number): Rgb => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
export const cssHex = (hex: number): string => `#${(hex & 0xffffff).toString(16).padStart(6, "0")}`;
const mixHex = (a: number, b: number, t: number): number => {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The original picks the sky colours per chapter, falling back to the palette (`D` in the bundle). */
export function skyColors(chapter: number): { top: Rgb; bottom: Rgb; night: number } {
  const ch = CHAPTERS[chapter]!;
  // chapter 0 is a dusk plaza in the original's frames: measured sky colours (top, horizon) instead of the palette's day blues
  if (chapter === 0) return { top: hexLinear(0xa9b8c2), bottom: hexLinear(0xe8c9ae), night: 0 };
  const top = chapter === 6 ? 10205909 : chapter === 1 ? 9549517 : ch.palette.sky!;
  const bottom = chapter === 6 ? 15846320 : chapter === 1 ? 14792340 : ch.palette.fog!;
  return { top: hexLinear(top), bottom: hexLinear(bottom), night: ch.night ? 1 : 0 };
}

export const skySpec = (chapter: number, look: SiltLookMode = "original"): CustomSpec => {
  if (look === "inked") return inkSkySpec(chapter);
  const c = skyColors(chapter);
  return {
    glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
    wgsl: { vertex: SKY_VERTEX_WGSL, fragment: SKY_FRAGMENT_WGSL },
    uniforms: {
      skyTop: { type: "color3", value: [...c.top] },
      skyBottom: { type: "color3", value: [...c.bottom] },
      skyNight: { type: "f32", value: c.night }
    },
    side: "back",
    depthWrite: false
  };
};

/** GU47 DG-S1: the inked poster dome for a chapter, from the look table (sun or moon on the DG-L1 key vector). */
export const inkSkySpec = (chapter: number): CustomSpec => {
  const look = chapterLook(chapter);
  return {
    glsl: { vertex: SKY_VERTEX, fragment: SKY_INK_FRAGMENT },
    wgsl: { vertex: SKY_VERTEX_WGSL, fragment: SKY_INK_FRAGMENT_WGSL },
    uniforms: {
      skyTop: { type: "color3", value: linearOf(look.sky.top) },
      skyBottom: { type: "color3", value: linearOf(look.sky.horizon) },
      sunDir: { type: "vec3", value: keyDirection(look) },
      sunColor: { type: "color3", value: linearOf(look.key.color) },
      sunSize: { type: "f32", value: look.sky.discSize },
      skyGlow: { type: "f32", value: look.sky.glow },
      skyCirrus: { type: "f32", value: look.sky.cirrus },
      skyDust: { type: "f32", value: look.sky.dust },
      skyStorm: { type: "f32", value: look.sky.storm },
      skyStars: { type: "f32", value: look.sky.stars },
      skyFlash: { type: "f32", value: 0 }
    },
    side: "back",
    depthWrite: false
  };
};

export const waterSpec = (chapter: number, look: SiltLookMode = "original"): CustomSpec => {
  const p = CHAPTERS[chapter]!.palette;
  const original = usesOriginalTerrain(chapter);
  const row = chapterLook(chapter);
  const inked = look === "inked";
  return {
    glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
    wgsl: { vertex: WATER_VERTEX_WGSL, fragment: WATER_FRAGMENT_WGSL },
    uniforms: {
      waterColor: { type: "color3", value: [...hexLinear(p.water!)] },
      siltTime: { type: "f32", value: 0 },
      canalShift: { type: "f32", value: original ? 0 : 62 },
      canalHalf: { type: "f32", value: original ? 25 : 16 },
      fogColor: { type: "color3", value: inked ? linearOf(row.fog.color) : [...hexLinear(chapter === 0 ? 0xdcc5b1 : p.fog!)] },
      fogFar: { type: "f32", value: 1400 },
      inkLook: { type: "f32", value: inked ? 1 : 0 },
      sunDir: { type: "vec3", value: keyDirection(row) },
      sunColor: { type: "color3", value: linearOf(row.key.color) },
      inkSky: { type: "color3", value: linearOf(row.sky.horizon) },
      inkSkyTop: { type: "color3", value: linearOf(row.sky.top) }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
};

/** The values both water programs share, so the portable graph and the GLSL baseline read the same chapter data. */
export const waterParams = (chapter: number, look: SiltLookMode = "original") => {
  const p = CHAPTERS[chapter]!.palette;
  const original = usesOriginalTerrain(chapter);
  const row = chapterLook(chapter);
  const inked = look === "inked";
  return {
    waterColor: hexLinear(p.water!),
    canalShift: original ? 0 : 62,
    canalHalf: original ? 25 : 16,
    fogColor: (inked ? linearOf(row.fog.color) : hexLinear(chapter === 0 ? 0xdcc5b1 : p.fog!)) as Rgb,
    fogFar: 1400,
    inked,
    sunDir: keyDirection(row) as Rgb,
    sunColor: linearOf(row.key.color) as Rgb,
    inkSky: linearOf(row.sky.horizon) as Rgb,
    inkSkyTop: linearOf(row.sky.top) as Rgb
  };
};

/** The canal material: the portable shader graph by default, the GLSL baseline on request or if the graph does not build. */
export const waterMaterial = (chapter: number, look: SiltLookMode, mode: "graph" | "glsl" = "graph"): AuraMaterialSpec => {
  if (mode === "graph") {
    try { return waterGraphMaterial(waterParams(chapter, look)); }
    catch (error) { console.warn("[silt] water graph unavailable, using the GLSL water", error); }
  }
  return material.custom(waterSpec(chapter, look));
};

export const ringSpec = (active: boolean, color: Rgb = [1, 0.82, 0.42]): CustomSpec => ({
  glsl: { vertex: RING_VERTEX, fragment: RING_FRAGMENT },
  wgsl: { vertex: RING_VERTEX_WGSL, fragment: RING_FRAGMENT_WGSL },
  uniforms: {
    ringColor: { type: "color3", value: [...color] },
    ringActive: { type: "f32", value: active ? 1 : 0 },
    siltTime: { type: "f32", value: 0 }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

/** Paired GLSL 300 es + WGSL wind-rippled desert sand + mineral mica-glint shader (`veil = true` over terrain, `false` on banks). */
export const duneSandSpec = (chapter: number, veil = true): CustomSpec => {
  const row = chapterLook(chapter);
  const original = usesOriginalTerrain(chapter);
  const crest = row.night ? linearOf("#9b91b8") : linearOf("#f5cfa0");
  const slope = row.night ? linearOf("#665d86") : linearOf("#df9e62");
  const shadow = row.night ? linearOf("#242148") : linearOf("#75432d");
  return {
    glsl: { vertex: DUNE_SAND_VERTEX, fragment: DUNE_SAND_FRAGMENT },
    wgsl: { vertex: DUNE_SAND_VERTEX_WGSL, fragment: DUNE_SAND_FRAGMENT_WGSL },
    uniforms: {
      sandCrest: { type: "color3", value: crest },
      sandSlope: { type: "color3", value: slope },
      sandShadow: { type: "color3", value: shadow },
      sunDir: { type: "vec3", value: keyDirection(row) },
      sunColor: { type: "color3", value: linearOf(row.key.color) },
      fogColor: { type: "color3", value: linearOf(row.fog.color) },
      fogFar: { type: "f32", value: 1400 },
      canalShift: { type: "f32", value: original ? 0 : 62 },
      canalHalf: { type: "f32", value: original ? 25 : 16 },
      siltTime: { type: "f32", value: 0 },
      duneVeil: { type: "f32", value: veil ? 1 : 0 }
    },
    ...(veil ? { transparent: true, depthWrite: false } : {})
  };
};

/** Paired GLSL 300 es + WGSL sedimentary sandstone cliff strata shader (`cliffs` in inked look). */
export const strataCliffSpec = (chapter: number): CustomSpec => {
  const row = chapterLook(chapter);
  return {
    glsl: { vertex: STRATA_CLIFF_VERTEX, fragment: STRATA_CLIFF_FRAGMENT },
    wgsl: { vertex: STRATA_CLIFF_VERTEX_WGSL, fragment: STRATA_CLIFF_FRAGMENT_WGSL },
    uniforms: {
      sunDir: { type: "vec3", value: keyDirection(row) },
      sunColor: { type: "color3", value: linearOf(row.key.color) },
      skyAmbient: { type: "color3", value: linearOf(row.sky.horizon) },
      sandCap: { type: "color3", value: row.night ? linearOf("#6d6488") : linearOf("#e4b379") },
      fogColor: { type: "color3", value: linearOf(row.fog.color) },
      fogFar: { type: "f32", value: 1400 }
    }
  };
};

/** Extra dual-backend surface programs authored for WP-29 Duneglide. */
export const surfaceProgramSpecs = (chapter = 0): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "dune-sand", spec: duneSandSpec(chapter, true) },
  { name: "dune-bank", spec: duneSandSpec(chapter, false) },
  { name: "strata-cliff", spec: strataCliffSpec(chapter) }
];

/** One of each distinct program the scene uses, so a unit test can compile exactly what the app draws. */
export const allProgramSpecs = (chapter = 0): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "sky", spec: skySpec(chapter) },
  { name: "sky-ink", spec: skySpec(chapter, "inked") },
  { name: "water", spec: waterSpec(chapter) },
  { name: "water-ink", spec: waterSpec(chapter, "inked") },
  { name: "ring", spec: ringSpec(true) }
];

export const MAX_RINGS = 8;

export interface WorldStats { readonly walls: number; readonly trees: number; readonly rocks: number; readonly houses: number; readonly lamps: number; readonly stone: number; readonly brass: number; readonly terrainTriangles: number }

export interface WorldRuntime {
  /** `cut` snaps the camera to the chase pose instead of easing (QA stepping, restarts and teleports). */
  update(sim: Sim, dt: number, time: number, aspect: number, cut?: boolean): void;
  /** The last chase eye handed to the camera, and whether it is inside scenery or under the terrain (null before the first update). */
  readonly cameraEye: () => { readonly eye: readonly [number, number, number]; readonly blocked: boolean } | null;
  /** play a one-shot rider clip (ring pickup, objective complete) and return to the cruise loop */
  celebrate(): void;
  /** a short, capped camera shake for a collision (`strength` 0..1); a no-op with reduced motion */
  shake(strength: number): void;
  readonly nodeCount: number;
  readonly riderAnimation: () => { bound: boolean; clip: string | null; error?: string };
  /** GU47 QA: runtime VFX stats (null under `?look=original`) and the C2 camera feel. */
  readonly fxStats: () => ReturnType<SiltFx["stats"]> | null;
  readonly cameraFeel: () => { readonly fovKick: number; readonly rollDeg: number };
  /** GU47 DG-S5 QA: the storm flash level now and strikes so far (null outside the inked storm chapter). */
  readonly lightning: () => { readonly flash: number; readonly strikes: number } | null;
  /** DG-P4: main.ts marks the intro rail (and any later sequence) so DOF runs only there. */
  setSequence(on: boolean): void;
  /** DG-P4 QA: the two toggled post effects as last set. */
  readonly sequencePost: () => { readonly depthOfField: boolean; readonly motionBlur: boolean };
}

/** DG-C2 constants: boost FOV kick (deg), roll as a fraction of the board bank, roll cap (deg). */
export const BOOST_FOV_KICK = 8;
export const ROLL_OF_BANK = 0.4;
export const MAX_ROLL_DEG = 6;
/** DG-C2 ring-pass punch: a short extra FOV kick (deg) for this many seconds after a ring is passed. */
export const RING_PUNCH = { deg: 3, seconds: 0.35 } as const;
/** DG-C2: the FOV kick the camera eases toward (boost plus the ring-pass punch); 0 on reduced motion. */
export function fovKickTarget(boosting: boolean, punchLeft: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return (boosting ? BOOST_FOV_KICK : 0) + (punchLeft > 0 ? RING_PUNCH.deg : 0);
}
/** Camera roll in radians for a board bank (radians): 0.4x, capped at 6 deg. */
export function cameraRoll(bank: number): number {
  const cap = (MAX_ROLL_DEG * Math.PI) / 180;
  return Math.max(-cap, Math.min(cap, bank * ROLL_OF_BANK));
}
const fx0 = (yaw: number): number => -Math.sin(yaw);
const fz0 = (yaw: number): number => -Math.cos(yaw);
/** World up rotated by `roll` around the horizontal forward axis (fx, 0, fz). */
export function rolledUp(fx: number, fz: number, roll: number): [number, number, number] {
  // right = forward x up = (-fz, 0, fx); up' = up cos + right sin
  const c = Math.cos(roll), s = Math.sin(roll);
  return [-fz * s, c, fx * s];
}
/** The canal centre line from the shaders' ROAD (x = 82 + sin(z * 0.006) * 8, shifted 62 m west outside chapters 0 and 6). */
export function overCanal(chapter: number, x: number, z: number): boolean {
  const original = usesOriginalTerrain(chapter);
  const centre = 82 + Math.sin(z * 0.006) * 8 - (original ? 0 : 62);
  return Math.abs(x - centre) < (original ? 25 : 16);
}

export interface BindOptions {
  readonly animate?: boolean;
  readonly clearCamera?: boolean;
  /** `prefers-reduced-motion`: no boost FOV kick, no thruster flicker, no impact shake; lightning capped at 0.3 */
  readonly reducedMotion?: boolean;
  /** DG-S5: called at each lightning onset with the thunder delay (s) and strength (0..1), for the audio */
  readonly onThunder?: (delaySeconds: number, strength: number) => void;
}

export interface World {
  readonly scene: Scene;
  readonly stats: WorldStats;
  readonly terrain: Terrain;
  bind(app: AuraApp, options?: BindOptions): WorldRuntime;
}

export interface BuildOptions {
  /** Sun shadow map size. main.ts passes 2048 on coarse-pointer (phone and tablet) screens and 4096 elsewhere. */
  readonly shadowMapSize?: 512 | 1024 | 2048 | 4096;
  /** GU47: `"inked"` (default) is the WP-34 poster look from art/look.ts; `"original"` (`?look=original`) is today's look. */
  readonly look?: SiltLookMode;
  /** PRD §6.4 Low tier (coarse pointers): PCF instead of PCSS, no god rays, no lens flare. */
  readonly low?: boolean;
  /** PRD §6.3: halves the storm rain volume. */
  readonly reducedMotion?: boolean;
  /** 5.0.3 A4: `"graph"` (default) draws the canal with the portable shader graph, `"glsl"` (`?water=glsl`) with the hand-written GLSL baseline. */
  readonly water?: "graph" | "glsl";
  /** Real-GPU browser sessions enable PCSS soft sun shadows on low-sun chapters (`main.ts`); omitted in headless unit tests. */
  readonly pcss?: boolean;
}

/** DG-AN2: instance wind for the flora (desert breeze from the west; reduced motion keeps 30%, PRD §6.3). */
export function treeWind(reducedMotion: boolean) {
  const k = reducedMotion ? 0.3 : 1;
  return { directionDeg: 270, strength: 0.6 * k, gustStrength: 0.4 * k, gustScale: 50, turbulence: 0.25 * k, assetHeight: 1.684 };
}

/** DG-L6: the flare source sits this far out along the key vector from the rider. */
export const FLARE_DISTANCE = 1800;
/** DG-L6: a warm poster flare in the key's colour (no jade: the signal accent stays the rings', board's and HUD's). */
export function lensFlareElements(keyColor: string) {
  return [
    { size: 320, distance: 0, color: keyColor },
    { size: 46, distance: 0.55, color: SILT_PALETTE.bone },
    { size: 84, distance: 0.8, color: SILT_PALETTE.sandstone },
    { size: 38, distance: 1, color: SILT_PALETTE.terracotta }
  ];
}

/** DG-M4: brushed bronze for the masts in the inked look; instance tints add verdigris. */
export const MAST_BRONZE = { color: "#a07a48", roughness: 0.55, metallic: 0.8 } as const;
const MAST_TINTS = ["#ffffff", "#d8e6dc", "#b4cec0", "#9cbfb0"] as const;
/** Seeded per-mast verdigris tint (multiplies the bronze): clean to heavy patina, never saturated. */
export function mastTint(index: number): string {
  const h = Math.abs(Math.sin(index * 12.9898 + 4.1) * 43758.5453) % 1;
  return MAST_TINTS[Math.floor(h * MAST_TINTS.length)]!;
}

/** DG-S5: wet paving in the storm chapter (inked look). */
export const WET_ROAD = { color: "#8d8a84", roughness: 0.42, envMapIntensity: 1 } as const;

/** DG-S5: the key light's intensity rises by this fraction at full lightning flash. */
export const LIGHTNING_KEY_BOOST = 1.5;

/** DG-S4 shaft march fraction (E-C clamps it to 0.05..1). */
export const GOD_RAY_DENSITY = 0.6;

/** Amber practical colour for the night chapters' ring route (DG-L4). */
export const PRACTICAL_COLOR = "#ffb35a";

/** Where the night practicals go: every other ring of the chapter's first objectives, 6 m above it, at most `count`. */
export function practicalPositions(chapter: number, count: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const objective of CHAPTERS[chapter]!.objectives) {
    for (let i = 0; i < objective.points.length && out.length < count; i += 2) {
      const p = objective.points[i]!;
      out.push([p.x, p.y + 6, p.z]);
    }
    if (out.length >= count) break;
  }
  return out;
}

/**
 * GU47 phase 4: the inked key's shadow. QA only, `?siltshadow=<mapSize>,<cascades>,<maxDistance>` overrides it so one
 * remote probe can compare shadow setups (software WebGL2); without the param the defaults below apply.
 */
function keyShadow(options: BuildOptions): { mapSize: 512 | 1024 | 2048 | 4096; cascades: 1 | 2 | 3 | 4; maxDistance: number; bias: number } {
  const base = { mapSize: options.shadowMapSize ?? 4096, cascades: (options.low ? 1 : 3) as 1 | 2 | 3 | 4, maxDistance: 360, bias: -0.0004 };
  const raw = typeof location !== "undefined" ? new URLSearchParams(location.search).get("siltshadow") : null;
  if (!raw) return base;
  const [size, cascades, distance] = raw.split(",").map(Number);
  return {
    mapSize: ([512, 1024, 2048, 4096] as const).find((v) => v === size) ?? base.mapSize,
    cascades: cascades && cascades >= 1 && cascades <= 4 ? (Math.trunc(cascades) as 1 | 2 | 3 | 4) : base.cascades,
    maxDistance: distance && distance > 10 ? distance : base.maxDistance,
    bias: base.bias
  };
}

/**
 * GU47 inked rig (DG-L1, L2, L3, L4, L5, S3, P2, P3): one shadowed key on the table's elevation and azimuth, an
 * unshadowed jade-white rim opposite it, IBL from the chapter HDRI (neutral 0.35 at night), no hemisphere (the art
 * direction's fill is the environment), night practicals, height fog, bloom on HDR emissives only, grade, vignette 0.22
 * and paper grain 0.03. Draw delta: 0 (lights and post are not draws); the night practicals add none.
 */
function addInkedRig(builder: Scene, chapter: number, options: BuildOptions): void {
  const look = chapterLook(chapter);
  const dir = keyDirection(look);
  const hdri = chapterHdri(look);
  builder.add(hdri
    ? environments.hdri({ name: `silt ibl ${look.hdri}`, texture: hdri as unknown as Parameters<typeof environments.hdri>[0]["texture"], intensity: look.environmentIntensity, rotation: (look.environmentRotationDeg * Math.PI) / 180, background: false })
    : environments.neutral({ intensity: look.environmentIntensity }));
  const pcss = look.pcss && !options.low && (PCSS_OPT_IN || options.pcss === true);
  builder.add(lights.directional({
    name: "silt key",
    position: [dir[0] * 240, dir[1] * 240, dir[2] * 240],
    target: [0, 0, 0],
    intensity: look.key.intensity,
    color: look.key.color,
    shadow: { ...keyShadow(options), ...(pcss ? { filter: "pcss" as const, lightSize: PCSS_LIGHT_SIZE } : {}) }
  }).runtime({ id: "silt-key" }));
  // DG-L3: the rim sits opposite the key (mirrored azimuth, 25 deg up), never shadowed, always below the key
  builder.add(lights.directional({
    name: "silt rim",
    position: [-dir[0] * 240, 100, -dir[2] * 240],
    target: [0, 0, 0],
    intensity: Math.min(look.rim.intensity, look.key.intensity * 0.6),
    color: look.rim.color
  }));
  for (const [i, position] of practicalPositions(chapter, look.practicals).entries()) {
    builder.add(lights.point({ name: `silt practical ${i}`, position, color: PRACTICAL_COLOR, intensity: 2.4, distance: 70 }));
  }
  builder.add(effects.fog({
    mode: "height", color: look.fog.color, density: look.fog.density, heightFalloff: look.fog.heightFalloff,
    heightReference: look.fog.heightReference, maxOpacity: look.fog.maxOpacity
  } as unknown as Parameters<typeof effects.fog>[0]));
  // DG-S4: god rays from the low sun (ch0) and moon shafts through the roots (ch2) via volumetricFog, plus S4 shafts on dusk/dawn (ch3/ch6)
  if (look.godRays && !options.low) {
    builder.add(effects.volumetricFog({ name: "silt god rays", color: look.key.color, density: look.fog.density, intensity: look.night ? 0.35 : 0.5, godRayDensity: GOD_RAY_DENSITY }));
  } else if (!options.low && (chapter === 3 || chapter === 6)) {
    builder.add(effects.godRays({ name: "silt dusk shafts", intensity: 0.36, decay: 0.94, samples: 48, color: look.key.color, source: { direction: [-dir[0], -dir[1], -dir[2]] } }));
  }
  // DG-L5 + WP-29 grounding: contact shadows, multi-bounce SSAO and screen-space reflections (canal banks & wet storm paving)
  if (!options.low) {
    builder.add(effects.contactShadows({ intensity: 0.9, length: 0.45 }));
    builder.add(effects.ambientOcclusion({ intensity: 0.38, radius: 0.82, falloff: 1.5, multiBounce: true }));
    builder.add(effects.screenSpaceReflections({ intensity: look.rain ? 0.46 : 0.26, maxDistance: 24, roughness: 0.18, thickness: 0.25 }));
  }
  builder.add(effects.bloom({ intensity: look.bloom.intensity, threshold: look.bloom.threshold, knee: 0.42, scatter: 0.44, clampLuminance: 8 }));
  // exposure + AgX cinema-warm LUT live on the output (main.ts); the grade keeps exposure 1 so the two never stack
  builder.add(effects.colorGrade({ contrast: look.grade.contrast, saturation: look.grade.saturation, exposure: 1, temperature: look.grade.temperature }));
  // DG-S5: rain only in the storm chapter, an explicit volume count (Low and reduced motion halve it); lightning (storm.ts)
  // and the wet road are in buildWorld and bind
  if (look.rain) {
    const count = Math.round(500 * (options.low ? 0.5 : 1) * (options.reducedMotion ? 0.5 : 1));
    builder.add({ ...effects.rain({ intensity: 0.6, color: "#b9c3d0" }).toJSON(), name: "silt storm rain", particleCount: count } as unknown as Parameters<Scene["add"]>[0]);
  }
  builder.add(effects.vignette({ intensity: 0.22 }));
  if (!options.low) builder.add(effects.filmGrain({ intensity: 0.03 }));
  // DG-P4: DOF for the intro rail and motion blur for boost, both High-only and both start off; bind toggles them with
  // `app.post.setEffectEnabled` (no rebuild). Reduced motion never turns motion blur on (PRD §6.3).
  if (!options.low) {
    builder.add(effects.depthOfField({ name: "silt sequence dof", focusDistance: SEQUENCE_DOF.focusDistance, fStop: SEQUENCE_DOF.fStop, maxBlur: SEQUENCE_DOF.maxBlur }));
    if (!options.reducedMotion) builder.add(effects.motionBlur({ name: "silt boost blur", intensity: BOOST_BLUR }));
  }
}

/** DG-P4: the sequence DOF focuses on the rider at the rail's distance; boost motion blur strength (PRD 0.35). */
export const SEQUENCE_DOF = { focusDistance: 22, fStop: 2.8, maxBlur: 3 } as const;
export const BOOST_BLUR = 0.35;
/** DG-P4: which of the two toggled post effects should be on now. */
export function sequencePost(state: { readonly boosting: boolean; readonly sequence: boolean; readonly reducedMotion: boolean }): { readonly depthOfField: boolean; readonly motionBlur: boolean } {
  return { depthOfField: state.sequence, motionBlur: state.boosting && !state.sequence && !state.reducedMotion };
}

const FAR = [0, -400, 0] as const;
/** Impact shake: at most 0.35 m of eye offset, fading out over 0.25 s. */
const SHAKE_SECONDS = 0.25;
const SHAKE_METRES = 0.35;
/** QA only (`?nobeacon=1`): hides the active-ring beacon so a spec can difference two frames and measure its contrast. */
/** QA: `?watert=N` pins the canal's flow clock so the graph and GLSL water can be compared pixel for pixel. */
const WATER_PIN: number | undefined = (() => {
  const v = typeof location !== "undefined" ? new URLSearchParams(location.search).get("watert") : null;
  return v !== null && Number.isFinite(Number(v)) ? Number(v) : undefined;
})();
const NO_BEACON = typeof location !== "undefined" && new URLSearchParams(location.search).has("nobeacon");
/** hoverboard.glb is 1.9 m long (x axis) and 0.37 m thick, origin at its centre; the rider's feet stand on its deck top */
const BOARD_SCALE = 1.15;
const BOARD_DROP = 1.25;
const DECK_TOP = 0.18 * BOARD_SCALE;
const BOARD_YAW = Math.PI / 2;
const RIDER_HEIGHT = 2.1;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);
const dynamicFrom = (m: MeshData | ColoredMesh) => geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices), ...("colors" in m ? { colors: f32(m.colors) } : {}) });

type QuatObj = { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
const quatAxis = (ax: number, ay: number, az: number, rad: number): QuatObj => {
  const half = rad * 0.5;
  const s = Math.sin(half);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) };
};
const quatMul = (a: QuatObj, b: QuatObj): QuatObj => {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  const len = Math.hypot(x, y, z, w) || 1;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
};
/** Exact bind-pose quaternions from courier.glb so overlay surf/carve deltas work even before clip evaluation. */
const COURIER_BIND_ROT: Readonly<Record<string, QuatObj>> = {
  Spine: { x: -0.170828, y: -0.013334, z: -0.008401, w: 0.985175 },
  Spine01: { x: 0, y: 0, z: 0, w: 1 },
  Head: { x: 0.170797, y: 0.040323, z: 0.028442, w: 0.98407 },
  LeftLeg: { x: -0.020993, y: -0.04157, z: 0.045201, w: 0.997892 },
  RightLeg: { x: -0.017162, y: 0.042045, z: -0.046242, w: 0.997897 },
  LeftArm: { x: -0.407038, y: 0.494043, z: -0.463452, w: 0.612743 },
  RightArm: { x: -0.382519, y: -0.491115, z: 0.495587, w: 0.605705 }
};

const DESERT_FLORA_TINTS = ["#dfd09c", "#ccb87e", "#e6d8aa", "#bfa872"] as const;
const ORCHARD_FLORA_TINTS = ["#dce2a6", "#cbd694", "#e6e8b8", "#c2cf8a"] as const;
function floraTint(index: number, orchard: boolean): string {
  const palette = orchard ? ORCHARD_FLORA_TINTS : DESERT_FLORA_TINTS;
  const h = Math.abs(Math.sin(index * 19.173 + 2.7) * 43758.5453) % 1;
  return palette[Math.floor(h * palette.length)]!;
}

/**
 * Lighting rig per chapter, from the measured chapter-0 rig (warm key 2.2, sky/ground hemisphere 1.05, exp2 fog) and the palette.
 * The day hemisphere was 1.45 while the engine dropped hemisphere lights next to an environment node (LIGHT-05), so that
 * number never reached a pixel. Since the hemisphere adds to `environments.neutral` it uses the original 1.05.
 */
export function rigOf(chapter: number) {
  const ch = CHAPTERS[chapter]!;
  const p = ch.palette;
  const night = chapter === 0 ? false : !!ch.night;
  return {
    night,
    sun: cssHex(night ? mixHex(p.sun!, 0x6f8fd0, 0.55) : p.sun!),
    sunIntensity: night ? 0.7 : 2.2,
    hemiSky: cssHex(night ? mixHex(p.sky!, 0x1a2a55, 0.5) : chapter === 0 ? 0x73b4c4 : p.sky!),
    hemiGround: cssHex(night ? 0x0b1220 : chapter === 0 ? 0x324a57 : mixHex(p.ground!, 0x1c2630, 0.6)),
    hemiIntensity: night ? 0.85 : 1.05,
    fog: chapter === 0 ? "#dcc5b1" : cssHex(p.fog!),
    fogDensity: night ? 0.0014 : 0.0009,
    background: chapter === 0 ? "#e3c5ab" : cssHex(p.fog!)
  };
}

const placements = (list: readonly Placement[], offset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) =>
  list.map((p) => ({
    position: [p.x - offset.x * p.scale, p.y + offset.y * p.scale, p.z - offset.z * p.scale] as [number, number, number],
    rotation: [0, p.yaw, 0] as [number, number, number],
    scale: p.scale
  }));

const columnTransforms = (list: readonly Column[]) =>
  list.map((c) => ({
    position: [c.x, (c.bottom + c.top) / 2, c.z] as [number, number, number],
    scale: [c.r * 2, c.top - c.bottom, c.r * 2] as [number, number, number]
  }));

/** Gate colours for timed objectives: the cyan beacon while the gate is open, this warm red one while it is shut. */
export const GATE_SHUT = { rimColor: "#ff6a3d", haloColor: "#ffb08a", bodyColor: "#1a0603" } as const;
/** GU47: the open beacon in the inked look, the one jade signal accent. */
export const SIGNAL_JADE = { rimColor: SILT_PALETTE.jade, haloColor: SILT_PALETTE.jadeWhite, bodyColor: "#06231b" } as const;
const PCSS_OPT_IN = typeof location !== "undefined" && new URLSearchParams(location.search).get("siltpcss") === "1";
/** GU47 phase 4: PCSS light size (metres) for the low-sun chapters' long shadows (DG-L5). */
export const PCSS_LIGHT_SIZE = 0.6;
/** GU47 phase 4: the rider's ground shadow shape (metres; opacity of the flat ink shape). */
export const RIDER_BLOB = { width: 1.5, length: 2.3, opacity: 0.55, maxSlide: 0.6 } as const;
/**
 * GU47 phase 4 (inked look): the beacon drawn at the objective's real 24 m capture radius (48 m across instead of 66 m),
 * its column at 45% width, and the waiting stone rings scaled by the same 48/66. Presentation only: the sim's radius
 * and every collider are unchanged. `?look=original` keeps 66 m.
 */
export const INKED_BEACON = { diameter: 48, beamWidth: 0.45, waitingRingScale: 38 * (48 / 66) } as const;
/** Parked instances of the waiting-ring pool (one instanced node instead of eight model nodes). */
const PARKED = { position: [...FAR] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 0.001 };

export function buildWorld(chapter: number, buildOptions: BuildOptions = {}): World {
  const ch = CHAPTERS[chapter]!;
  const rig = rigOf(chapter);
  const terrain = createTerrain(chapter);
  const props = terrain.props();
  const palette = ch.palette;

  const grassTint = cssHex(mixHex(0xffffff, palette.ground!, rig.night ? 0.9 : 0.8));
  const stoneTint = cssHex(mixHex(0xffffff, palette.stone!, 0.45));
  const pbr = (spec: AuraMaterialSpec): AuraMaterialSpec => material.pbr({ metallic: 0, envMapIntensity: 0.6, ...spec });

  const terrainMesh = terrain.terrainMesh();
  const inked = buildOptions.look !== "original";
  const look = chapterLook(chapter);
  const wet = inked && look.rain;
  const builder: Scene = scene()
    .background(inked ? look.sky.horizon : rig.background)
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, 14, 60], target: [0, 8, 0], fov: 62, near: 0.3, far: 2700 }));
  if (inked) {
    // GU47 phase 4: the 4.3.0 cascade fit for the inked look. The default 4.2.0 fit widens every cascade to the bounds of
    // every caster, and here that is the 4200 m sky dome and the course-long terrain and wall meshes: the remote probe
    // (p4-r1 g24-p, software WebGL2) logged a ~8400 m light ortho on all three cascades (2 m texels), so no cast shadow
    // ever showed. The 4.3.0 fit sizes each cascade to its frustum slice (the first spans 14 m). Same switch as
    // ninja-runner-port; `?shadowfit=legacy` restores the 4.2.0 fit, `?look=original` never sets it.
    (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";
    addInkedRig(builder, chapter, buildOptions);
  }
  else {
    builder
      .add(environments.neutral({ intensity: rig.night ? 0.4 : 0.95 }))
      .add(lights.hemisphere({ skyColor: rig.hemiSky, groundColor: rig.hemiGround, intensity: rig.hemiIntensity }))
      .add(lights.directional({
        position: [-100, 153, -80],
        target: [0, 0, 0],
        intensity: rig.sunIntensity,
        color: rig.sun,
        shadow: { mapSize: buildOptions.shadowMapSize ?? 4096, cascades: 3, maxDistance: 360, bias: -0.0004 }
      }))
      .add(effects.fog({ density: rig.fogDensity, color: rig.fog }))
      // threshold at HDR white (1.0) so only the emissive beacons, thrusters and lamps bloom; `radius` is a deprecated post field
      // night 0.6 (was 0.7): the renderer flags bloom intensity above 0.62 as a noise risk
      .add(effects.bloom({ intensity: rig.night ? 0.6 : 0.38, threshold: 1 }))
      .add(effects.colorGrade({ contrast: 1.06, saturation: 1.08, exposure: rig.night ? 1.05 : 1 }));
  }

  // DG-L6: a low-sun lens flare in ch0 and ch6 (inked, not on Low), kept on the key vector 1800 m out from the rider in
  // bind; frustum occlusion (the engine has no depth readback for flares). Reduced flash halves it. +4 sprite draws.
  const flare = inked && look.lensFlare && !buildOptions.low;
  if (flare) builder.add(lights.lensFlare({ name: "silt flare", position: [...FAR], elements: lensFlareElements(look.key.color), intensity: buildOptions.reducedMotion ? 0.3 : 0.6, runtime: { id: "silt-flare" } }));
  builder.add(primitives.sphere({ name: "sky", position: [0, 0, 0], size: 4200, ...(inked ? { castShadow: false, receiveShadow: false } : {}), material: material.custom(skySpec(chapter, inked ? "inked" : "original")) }).runtime({ id: "sky" }));

  const orchard = inked && look.ground === "orchard";
  builder.add(geometry.custom(dynamicFrom({ ...terrainMesh, colors: orchard ? orchardTerrainColors(terrainMesh.positions) : terrainColors(terrainMesh.positions, inked) }), {
    name: "terrain",
    receiveShadow: true,
    material: orchard
      ? pbr({ color: "#e4ead2", texture: assets.grassColor, normal: assets.grassNormal, roughnessMap: assets.grassRough, normalScale: 0.9, roughness: 0.92 })
      : inked
      ? pbr({ color: look.night ? "#b7a48a" : "#f0dcc0", texture: assets.groundColor, normal: assets.groundNormal, roughnessMap: assets.groundRough, normalScale: 0.6, roughness: 1 })
      : pbr({ color: grassTint, texture: assets.grassColor, normal: assets.grassNormal, roughnessMap: assets.grassRough, normalScale: 0.9, roughness: 1 })
  }).runtime({ id: "terrain" }));
  // WP-29 paired GLSL+WGSL wind-rippled desert sand + sparkling mineral mica-glint veil over open dunes (feathered clear of road/plaza/canal)
  const duneVeilOn = inked && !orchard && !buildOptions.low;
  if (duneVeilOn) {
    const lifted = terrainMesh.positions.map((v, idx) => (idx % 3 === 1 ? v + 0.045 : v));
    builder.add(geometry.custom(dynamicFrom({ ...terrainMesh, positions: lifted }), {
      name: "dune-mica-veil",
      castShadow: false,
      receiveShadow: false,
      material: material.custom(duneSandSpec(chapter, true))
    }).runtime({ id: "dune-mica-veil" }));
  }
  const plaza = terrain.plazaMesh();
  if (plaza.indices.length) {
    builder.add(geometry.custom(dynamicFrom(plaza), {
      name: "plaza",
      receiveShadow: true,
      material: wet
        ? pbr({ color: WET_ROAD.color, texture: assets.pavingColor, normal: assets.pavingNormal, roughnessMap: assets.pavingRough, roughness: WET_ROAD.roughness, envMapIntensity: WET_ROAD.envMapIntensity })
        : pbr({ color: "#e9d2a8", texture: assets.pavingColor, normal: assets.pavingNormal, roughnessMap: assets.pavingRough, roughness: 1 })
    }).runtime({ id: "plaza" }));
  }
  builder.add(geometry.custom(dynamicFrom(terrain.roadMesh()), {
    name: "road",
    receiveShadow: true,
    // DG-S5: the storm chapter's road is wet in the inked look (darker, glossier paving)
    material: wet
      ? pbr({ color: WET_ROAD.color, texture: assets.pavingColor, normal: assets.pavingNormal, roughnessMap: assets.pavingRough, roughness: WET_ROAD.roughness, envMapIntensity: WET_ROAD.envMapIntensity })
      : pbr({ color: usesOriginalTerrain(chapter) ? "#d8c08e" : stoneTint, texture: assets.pavingColor, normal: assets.pavingNormal, roughnessMap: assets.pavingRough, roughness: 1 })
  }).runtime({ id: "road" }));
  const bank = terrain.bankMesh();
  const duneBankOn = bank.indices.length > 0 && inked && !orchard;
  if (bank.indices.length) {
    builder.add(geometry.custom(dynamicFrom(bank), {
      name: "bank",
      receiveShadow: true,
      material: duneBankOn
        ? material.custom(duneSandSpec(chapter, false))
        : pbr({ color: "#d9c8aa", texture: assets.groundColor, normal: assets.groundNormal, roughnessMap: assets.groundRough, roughness: 1 })
    }).runtime({ id: "bank" }));
  }
  // A4 pilot (?portable=1, default off): a transparent graph material with the node-default castShadow casts a real opaque shadow,
  // which relights the whole inked scene; the portable water therefore does not cast. Default stays the 5.0.3 water material.
  builder.add(geometry.custom(dynamicFrom(terrain.waterMesh()), { name: "canal", ...(readPortableFlag() ? { castShadow: false } : {}), material: readPortableFlag() ? portableWaterMaterial(waterSpec(chapter, inked ? "inked" : "original")) : waterMaterial(chapter, inked ? "inked" : "original", buildOptions.water) }).runtime({ id: "canal" }));
  const deck = terrain.deckMesh();
  if (deck.indices.length) {
    builder.add(geometry.custom(dynamicFrom(deck), {
      name: "cistern-deck",
      receiveShadow: true,
      material: pbr({ color: "#efe2c8", texture: assets.bricksColor, normal: assets.bricksNormal, roughnessMap: assets.bricksRough, roughness: 1 })
    }).runtime({ id: "cistern-deck" }));
  }
  const arch = buildArchitecture(props.walls, { inked });
  const white = "#ffffff";
  const archMeshes: readonly { name: string; mesh: ColoredMesh; spec: AuraMaterialSpec; cast: boolean }[] = [
    { name: "cliffs", mesh: arch.cliff, cast: true, spec: inked ? material.custom(strataCliffSpec(chapter)) : pbr({ color: white, texture: assets.rockColor, normal: assets.rockNormal, roughnessMap: assets.rockRough, roughness: 1 }) },
    { name: "limestone", mesh: arch.stone, cast: true, spec: pbr({ color: white, texture: assets.bricksColor, normal: assets.bricksNormal, roughnessMap: assets.bricksRough, roughness: 1, normalScale: 0.8 }) },
    ...arch.plaster.map((mesh, i) => ({
      name: `plaster-${i}`, mesh, cast: true,
      // ambientCG PaintedPlaster017 (CC0) under the per-hue tint: trowel marks and worn paint instead of flat slabs
      spec: pbr({ color: cssHex(((Math.round(Math.min(1, arch.plasterHues[i]![0] ** (1 / 2.2)) * 255) << 16) | (Math.round(Math.min(1, arch.plasterHues[i]![1] ** (1 / 2.2)) * 255) << 8) | Math.round(Math.min(1, arch.plasterHues[i]![2] ** (1 / 2.2)) * 255))), texture: assets.plasterColor, normal: assets.plasterNormal, roughnessMap: assets.plasterRough, normalScale: 0.8, roughness: 1 })
    })),
    { name: "roof-tiles", mesh: arch.roofs, cast: true, spec: pbr({ color: white, texture: assets.bricksColor, normal: assets.bricksNormal, roughnessMap: assets.bricksRough, roughness: 0.85 }) },
    { name: "window-dark", mesh: arch.dark, cast: false, spec: pbr({ color: "#1a1612", roughness: 0.6 }) }
  ];
  for (const g of archMeshes) {
    if (!g.mesh.indices.length) continue;
    builder.add(geometry.custom(dynamicFrom(g.mesh), { name: g.name, castShadow: g.cast, receiveShadow: true, material: g.spec }).runtime({ id: g.name }));
  }
  // distant dunes and mesas: the horizon silhouette (outside the +-640 m play corridor, inside the far plane)
  {
    const mid = -terrain.length / 2;
    const haze = inked ? linearOf(look.ridge ?? look.fog.color) : hexLinear(chapter === 0 ? 0xdcc5b1 : palette.fog!);
    // DG-S2 (part): the inked look stacks three rings tinted toward the fog (one merged draw); mesa and arch silhouettes are WP-36
    builder.add(geometry.custom(dynamicFrom(inked ? farDuneRings(0, mid, haze) : farDunes(0, mid, 1500, 2150, haze)), {
      name: "far-dunes", castShadow: false, receiveShadow: false,
      material: pbr({ color: white, roughness: 1, envMapIntensity: 0.3 })
    }).runtime({ id: "far-dunes" }));
  }

  // GU47 DG-W1 + WP-28 (inked look): seeded fluted column drums and half-buried voussoir ruin arches off the ring route (+2 draws)
  if (inked) {
    const dressing = dressingFor(chapter, terrain, props.walls);
    const drums = dressing.filter((d) => d.kind === "drum"), ruins = dressing.filter((d) => d.kind === "ruin");
    if (drums.length) {
      builder.add(instances.custom(flutedColumnDrumSpec(), {
        name: "dressing-drums",
        castShadow: true,
        receiveShadow: true,
        material: DESERT_INST_MAT.sandstone,
        transforms: drums.map((d) => ({
          position: [d.x, d.y + 0.35 * d.scale, d.z] as [number, number, number],
          rotation: [0, d.yaw, 0] as [number, number, number],
          scale: [d.scale, d.scale * 0.45, d.scale] as [number, number, number]
        }))
      }));
    }
    if (ruins.length) {
      builder.add(instances.custom(halfBuriedRuinArchSpec(), {
        name: "dressing-ruins",
        castShadow: false,
        receiveShadow: true,
        material: DESERT_INST_MAT.ruinWeathered,
        transforms: ruins.map((d) => ({
          position: [d.x, d.y + 0.3 * d.scale, d.z] as [number, number, number],
          rotation: [0, d.yaw, 0] as [number, number, number],
          scale: [d.scale, d.scale * 0.7, d.scale] as [number, number, number]
        }))
      }));
    }
  }
  // GU47 DG-W2 (inked look, not Low): sand drifts, aqueduct water stains and lamp soot, merged into one soft-edged
  // transparent mesh (+1 draw) instead of one root-decal draw each; <= 24 decals, inside the engine's 32-decal budget
  if (inked && !buildOptions.low) {
    const plan = decalPlan(chapter, terrain, props.walls, props.lamps, { wet });
    if (plan.length) {
      builder.add(geometry.custom(dynamicFrom(decalMesh(plan, terrain, wet ? WET_ROAD.color : "#e9d2a8")), {
        name: "silt-decals", castShadow: false, receiveShadow: true,
        material: pbr({ color: white, roughness: 1, opacity: DECAL_OPACITY, envMapIntensity: 0.4 })
      }).runtime({ id: "silt-decals" }));
    }
  }
  // GU47 DG-AN2 + WP-28 procedural wind-sheared desert tamarisk canopies & gnarled trunks
  if (props.trees.length) {
    const treeTransforms = placements(props.trees);
    builder.add(instances.custom(desertTamariskCanopySpec(), {
      name: "trees",
      transforms: treeTransforms,
      castShadow: true,
      receiveShadow: true,
      material: DESERT_INST_MAT.tamariskFoliage,
      ...(inked ? { colors: props.trees.map((_, i) => floraTint(i, orchard)), wind: treeWind(!!buildOptions.reducedMotion) } : {})
    }));
    builder.add(instances.custom(desertTamariskTrunkSpec(), {
      name: "trees-trunks",
      transforms: treeTransforms,
      castShadow: true,
      receiveShadow: true,
      material: DESERT_INST_MAT.tamariskTrunk
    }));
  }
  // WP-28 stratified canyon yardang outcrops & wind-abraded desert scree boulders
  if (props.rocks.length) {
    builder.add(instances.custom(canyonYardangRockSpec(), {
      name: "rocks",
      castShadow: false,
      receiveShadow: true,
      material: DESERT_INST_MAT.yardangRock,
      transforms: [...props.rocks].sort((a, b) => b.scale - a.scale).slice(0, 48).map((p) => {
        const s = (p.scale * 1.15) / 1.9;
        return { position: [p.x, p.y + 0.38 * s, p.z] as [number, number, number], rotation: [0, p.yaw, 0] as [number, number, number], scale: [s, s * 0.8, s] as [number, number, number] };
      })
    }));
  }
  if (props.rocks.length > 48) {
    const rest = [...props.rocks].sort((a, b) => b.scale - a.scale).slice(48);
    builder.add(instances.custom(desertScreeBoulderSpec(), {
      name: "rocks-small",
      castShadow: false,
      receiveShadow: true,
      material: unnamed(pbr({ color: "#c9b399", texture: assets.rockColor, normal: assets.rockNormal, roughnessMap: assets.rockRough, roughness: 1, clearcoat: 0, sheen: 0 })),
      transforms: rest.map((p) => ({
        position: [p.x, p.y + 0.28 * p.scale, p.z] as [number, number, number],
        rotation: [0, p.yaw, 0] as [number, number, number],
        scale: [p.scale, p.scale * 0.62, p.scale * 0.85] as [number, number, number]
      }))
    }));
  }
  // WP-28 procedural sun-baked desert adobe dwellings + cedar roof vigas & terracotta awnings (exact collider box)
  if (props.houses.length) {
    const houseTransforms = placements(props.houses, { x: 0, y: 0, z: -0.064 });
    builder.add(instances.custom(duneAdobeWallsSpec(), {
      name: "houses",
      transforms: houseTransforms,
      castShadow: true,
      receiveShadow: true,
      material: DESERT_INST_MAT.adobePlaster
    }));
    builder.add(instances.custom(duneAdobeDetailsSpec(), {
      name: "houses-details",
      transforms: houseTransforms,
      castShadow: false,
      receiveShadow: true,
      material: DESERT_INST_MAT.adobeTimberTerracotta
    }));
  }
  // WP-28 gooseneck bronze desert route lantern standards (exact 1.9 m height centered on [-0.95, +0.95])
  if (props.lamps.length) {
    builder.add(instances.custom(desertLanternPostSpec(), {
      name: "lamps",
      transforms: props.lamps.map((p) => {
        const s = Math.max(2.2, p.scale);
        return { position: [p.x, p.y + 0.95 * s, p.z] as [number, number, number], rotation: [0, p.yaw, 0] as [number, number, number], scale: s };
      }),
      castShadow: false,
      material: DESERT_INST_MAT.lanternBronze
    }));
  }
  if (props.stone.length) {
    builder.add(instances.custom(flutedStonePierSpec(), {
      name: "piers",
      transforms: columnTransforms(props.stone),
      castShadow: true,
      receiveShadow: true,
      material: unnamed(pbr({ color: "#f0e3c9", texture: assets.bricksColor, normal: assets.bricksNormal, roughnessMap: assets.bricksRough, roughness: 1, clearcoat: 0, sheen: 0, texTransforms: { baseColor: { scale: [3, 12] }, normal: { scale: [3, 12] }, metallicRoughness: { scale: [3, 12] } } }))
    }));
  }
  if (props.brass.length) {
    builder.add(instances.custom(collaredBronzeMastSpec(), {
      name: "masts",
      transforms: columnTransforms(props.brass),
      castShadow: true,
      // GU47 DG-M4 + WP-28 (inked): collared bronze relay masts with seeded verdigris patina
      ...(inked ? { colors: props.brass.map((_, i) => mastTint(i)) } : {}),
      material: inked
        ? unnamed(material.metal({ color: MAST_BRONZE.color, roughness: MAST_BRONZE.roughness, metalness: MAST_BRONZE.metallic, clearcoat: 0, sheen: 0, envMapIntensity: 1.15 }))
        : unnamed(material.metal({ color: "#b99455", roughness: 0.38, metalness: 0.85, clearcoat: 0, sheen: 0, envMapIntensity: 1.1 }))
    }));
  }
  // WP-28 wind-carved signal monoliths + lathed resonator caps + emissive signal-jade glyphs + billowing route pennants
  if (inked) {
    const monolithBodies: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
    const monolithCaps: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
    const monolithGlyphs: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
    const monolithSails: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
    const insideWall = (x: number, z: number): boolean =>
      props.walls.some((w) => Math.abs(x - w.x) < w.halfX + 4 && Math.abs(z - w.z) < w.halfZ + 4);
    let idx = 0;
    for (const objective of ch.objectives) {
      for (let i = 0; i < objective.points.length && monolithBodies.length < 32; i += 2) {
        const pt = objective.points[i]!;
        const next = objective.points[Math.min(objective.points.length - 1, i + 1)]!;
        const dx = next.x - pt.x, dz = next.z - pt.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        const yaw = Math.atan2(dx, dz);
        for (const side of [-1, 1] as const) {
          const mx = pt.x + nx * side * 38;
          const mz = pt.z + nz * side * 38;
          if (overCanal(chapter, mx, mz) || insideWall(mx, mz)) continue;
          const gy = terrain.heightAt(mx, mz);
          const h = 11.5 + (idx % 3) * 2.2;
          monolithBodies.push({ position: [mx, gy + h * 0.48, mz], rotation: [side * 0.04, yaw, 0], scale: [1.55, h, 1.15] });
          monolithCaps.push({ position: [mx, gy + h - 0.15, mz], rotation: [side * 0.04, yaw, 0], scale: [1.88, 0.72, 1.42] });
          monolithGlyphs.push({ position: [mx - nx * side * 0.62, gy + h * 0.56, mz - nz * side * 0.62], rotation: [side * 0.04, yaw, 0], scale: [0.16, h * 0.58, 0.22] });
          monolithSails.push({ position: [mx - nx * side * 1.45, gy + h * 0.72, mz - nz * side * 1.45], rotation: [0, yaw, 0], scale: [1.9, 3.4, 0.24] });
          idx++;
        }
      }
    }
    if (monolithBodies.length) {
      builder.add(instances.custom(windCarvedMonolithSpec(), { name: "signal-monoliths", castShadow: true, receiveShadow: true, transforms: monolithBodies, material: DESERT_INST_MAT.monolithObsidian }));
      builder.add(instances.custom(resonatorDishCapSpec(), { name: "signal-caps", castShadow: false, receiveShadow: true, transforms: monolithCaps, material: DESERT_INST_MAT.monolithBrassCap }));
      builder.add(instances.box({ name: "signal-glyphs", size: [1, 1, 1], castShadow: false, transforms: monolithGlyphs, material: DESERT_INST_MAT.monolithJadeGlyph }));
      builder.add(instances.custom(billowingRoutePennantSpec(), { name: "route-sails", castShadow: false, receiveShadow: true, transforms: monolithSails, wind: treeWind(!!buildOptions.reducedMotion), material: DESERT_INST_MAT.routePennantCloth }));
    }
  }

  // Waiting rings are sculpted sandstone-and-brass ring gates, drawn as one instanced pool of MAX_RINGS.
  builder.add(instances.custom(ringGateSpec(), { name: "rings", transforms: Array.from({ length: MAX_RINGS }, () => PARKED), castShadow: false, material: DESERT_INST_MAT.ringSandstoneBrass }).runtime({ id: "rings" }));
  // Active-ring beacon: the library objective marker (dark-teal ring body, cyan rim, expanding halo, light column), sized to the 66 m rings.
  // GU47 DG-M4/H1: the inked look reserves jade for the signal (no #19e6ff cyan); `?look=original` keeps the library colours
  // GU47 phase 4 (inked): the marker matches the 24 m capture radius (48 m, not the original 66 m)
  const beaconDiameter = inked ? INKED_BEACON.diameter : 66;
  builder.addMany(prefabs.objectiveMarker({ id: "beacon", diameter: beaconDiameter, hiddenPosition: [...FAR], ...(inked ? SIGNAL_JADE : {}) }));
  // The same marker in red, shown instead while a timed gate is shut.
  builder.addMany(prefabs.objectiveMarker({ id: "gate", diameter: beaconDiameter, hiddenPosition: [...FAR], ...GATE_SHUT }));
  // Sculpted ancient brass-and-ceramic resonance vessel towed behind the sand-skiff (parked until the rider latches on).
  for (const towNode of createTowRelicNodes([...FAR])) builder.add(towNode);

  for (const side of ["l", "r"]) {
    // GU47 DG-A3 (part): the inked look swaps the two cyan thruster spheres for flat jade strips under the deck (same 2 draws)
    builder.add((inked
      ? primitives.box({ name: `thruster-${side}`, position: [0, 4, 0], size: [0.12, 0.05, 1.5], material: material.emissive({ color: SILT_PALETTE.jade, emissiveIntensity: 2.5, practical: true }) })
      : primitives.sphere({ name: `thruster-${side}`, position: [0, 4, 0], size: [0.34, 1.1, 0.34], material: material.emissive({ color: "#38d6ff", emissiveIntensity: 3 }) })
    ).runtime({ id: `thruster-${side}` }));
  }
  if (inked) {
    builder.add(createBoardTrimNode());
    builder.add(createBoardSailNode());
  }
  const flipbooksOn = inked && !buildOptions.low;
  if (flipbooksOn) {
    const dustAtlas = createFlipbookAtlas("dust", [238, 188, 118]);
    const rippleAtlas = createFlipbookAtlas("ripple", [92, 232, 188]);
    builder.add(effects.flipbook({
      name: "wake-plume",
      position: [...FAR],
      sprite: "smoke-a",
      spriteColumns: dustAtlas.columns,
      spriteRows: dustAtlas.rows,
      frameRate: 26,
      size: 2.4,
      blend: "alpha",
      intensity: 0.88,
      color: look.wake.color
    }).runtime({ id: "wake-plume" }));
    builder.add(primitives.plane({
      name: "wake-plume-sheet",
      size: [2.2, 2.2],
      position: [...FAR],
      castShadow: false,
      receiveShadow: false,
      material: pbr({
        color: look.wake.color,
        texture: dustAtlas.texture,
        roughness: 0.94,
        opacity: 0.68,
        doubleSided: true,
        texTransforms: { baseColor: { scale: [1 / dustAtlas.columns, 1 / dustAtlas.rows] } }
      })
    }).runtime({ id: "wake-plume-sheet" }));
    builder.add(primitives.plane({
      name: "signal-ripple",
      size: [9.5, 9.5],
      position: [...FAR],
      castShadow: false,
      receiveShadow: false,
      material: pbr({
        color: SILT_PALETTE.jadeWhite,
        emissive: SILT_PALETTE.jade,
        emissiveIntensity: 1.55,
        practical: true,
        texture: rippleAtlas.texture,
        roughness: 0.45,
        opacity: 0.82,
        doubleSided: true,
        texTransforms: { baseColor: { scale: [1 / rippleAtlas.columns, 1 / rippleAtlas.rows], offset: [0.375, 0.25] } }
      })
    }).runtime({ id: "signal-ripple" }));
  }
  builder.add(createSandSkiffNode({ inked, scale: BOARD_SCALE }));
  builder.add(model(assets.courier, {
    name: "rider",
    position: [0, 4, 0],
    targetHeight: RIDER_HEIGHT,
    castShadow: true,
    ...(inked ? { materialOverrides: createCourierMaterialOverrides(inked) } : {})
  }).runtime({ id: "rider" }));
  // GU47 phase 4 (inked, not on Low): an indigo-umber shadow shape on the ground under the board, so the rider reads as
  // grounded at every altitude (rubric shadows; the poster's flat shadow shapes). +1 draw; bind moves it each frame.
  const blob = inked && !buildOptions.low;
  if (blob) builder.add(primitives.cylinder({ name: "rider-blob", position: [...FAR], size: [1, 1, 1], material: pbr({ color: look.night ? "#0b0d24" : "#2a1a10", roughness: 1, opacity: RIDER_BLOB.opacity }) }).runtime({ id: "rider-blob" }));

  const groundAt = (x: number, z: number): number => Math.max(0, terrain.heightAt(x, z));
  if (usesOriginalTerrain(chapter) && chapter === 0) {
    builder.add(createGatehouseNeri("gatehouse-neri", [-34, groundAt(-34, -262), -262], 0.35));
    builder.add(createDesertViaduct("aqueduct-east", [150, groundAt(150, -520), -520], Math.PI / 2));
    builder.add(createDesertViaduct("aqueduct-west", [-170, groundAt(-170, -720), -720], Math.PI / 2));
    builder.add(createCanyonResonanceGate("canyon-gate", [0, groundAt(0, -1295), -1295], 0));
    for (const [i, [x, z, yaw]] of ([[85, -12, 0.4], [172, -42, -0.5]] as const).entries()) {
      builder.add(createBazaarStall(`stall-${i}`, [x, groundAt(x, z), z], yaw));
    }
    for (const [i, [x, z, yaw]] of ([[196, -108, -0.65], [-120, -640, 0.5], [135, -870, -0.8]] as const).entries()) {
      builder.add(createSignalRelayTower(`watchtower-${i}`, [x, groundAt(x, z), z], yaw, inked));
    }
    let banners = 0;
    for (const objective of ch.objectives) {
      objective.points.forEach((pt, i) => {
        if (i % 2 !== 0 || banners >= 8) return;
        const side = banners % 2 === 0 ? 1 : -1;
        const x = pt.x + side * 42, z = pt.z;
        builder.add(createWindBannerMast(`banner-${banners}`, [x, groundAt(x, z), z], side * 0.6, banners));
        banners += 1;
      });
    }
    for (const [i, [x, z, s]] of ([[-85, -930, 24], [92, -980, 28], [-110, -1060, 26], [105, -1120, 22], [-78, -1180, 30], [88, -1230, 25]] as const).entries()) {
      builder.add(createFlutedObeliskPillar(`pillar-${i}`, [x, groundAt(x, z), z], i * 1.7, s));
    }
    for (const [i, [x, z, s, yaw]] of ([[235, -185, 22, 0.4], [-225, -430, 26, -0.5], [228, -790, 24, 1.1], [-210, -1160, 28, -1.2]] as const).entries()) {
      builder.add(createStratifiedMesaSpire(`mesa-spire-${i}`, [x, groundAt(x, z), z], yaw, s, inked ? look.night : rig.night));
    }
  } else {
    const midZ = -terrain.length * 0.44;
    builder.add(createStratifiedMesaSpire("mesa-spire-east", [360, groundAt(360, midZ), midZ], 0.55, 26, inked ? look.night : rig.night));
    builder.add(createStratifiedMesaSpire("mesa-spire-west", [-360, groundAt(-360, midZ - 180), midZ - 180], -0.7, 28, inked ? look.night : rig.night));
  }

  const stats: WorldStats = {
    walls: props.walls.length, trees: props.trees.length, rocks: props.rocks.length, houses: props.houses.length, lamps: props.lamps.length,
    stone: props.stone.length, brass: props.brass.length, terrainTriangles: (terrainMesh.indices.length + plaza.indices.length) / 3
  };

  return {
    scene: builder,
    stats,
    terrain,
    bind(app: AuraApp, options: BindOptions = {}): WorldRuntime {
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, h = app.nodes.require(id));
        return h;
      };
      const cameraController = app.camera;
      if (!cameraController) throw new Error("silt-and-signal-port: the app exposes no camera controller");

      let animation: { bound: boolean; clip: string | null; error?: string } = { bound: false, clip: null };
      let controller: ReturnType<typeof createAnimationController> | undefined;
      try {
        if (options.animate === false) throw new Error("animation disabled (norig=1)");
        controller = createAnimationController({ id: "rider-animation", clipRegistry: assets.courier, requiredClips: ["idle", "walk"], suppressRootMotion: true });
        controller.bindRuntimeNode(node("rider"), { id: "rider-binding", defaultClipId: "idle" });
        animation = { bound: true, clip: "idle" };
      } catch (error) {
        animation = { bound: false, clip: null, error: String((error as Error)?.message ?? error) };
        controller = undefined;
      }
      let oneShot = 0;
      const playClip = (clip: string): void => {
        if (!controller || animation.clip === clip) return;
        try { controller.crossFade(clip, 0.14); animation = { ...animation, clip }; } catch { /* clip missing: stay on the current one */ }
      };

      let lookX = 0, lookY = 0, lookZ = 0, init = false;
      const clearance = createChaseClearance();
      const scenery = sceneryColumns(props);
      let lastEye: { eye: readonly [number, number, number]; blocked: boolean } | null = null;
      /** Last pose that passed `guardPose`: a bad frame during a hard turn repeats it instead of showing the clear colour. */
      let lastGoodPose: GuardPose | null = null;
      let lastPoint = -1, lastObjective = -1;
      let ringsKey = "";
      let shakeLeft = 0, shakeStrength = 0;
      let towX: number = FAR[0], towY: number = FAR[1], towZ: number = FAR[2], towing = false;
      // GU47 inked look: runtime VFX (wake, ribbons, signal, impact, motes) and the C2 camera feel (eased FOV kick, roll)
      const siltFx: SiltFx | undefined = inked
        ? createSiltFx(app.effects, { chapter, reducedMotion: options.reducedMotion, low: buildOptions.low, trailNodes: ["thruster-l", "thruster-r"], motesNode: "rider" })
        : undefined;
      let fovKick = 0, roll = 0, punchLeft = 0;
      const impactRig = createImpactRig({ reducedMotion: options.reducedMotion });
      let wasBoosting = false;
      let rippleLeft = 0;
      let rippleAt: AuraVec3 = [...FAR];
      const keyDir = keyDirection(look);
      // DG-P4: both toggled effects start off (inked High only; the nodes are absent on Low and in the original look)
      const toggles = inked && !buildOptions.low;
      let sequence = false;
      let postShown = { depthOfField: false, motionBlur: false };
      const applyPost = (next: { depthOfField: boolean; motionBlur: boolean }, force = false): void => {
        if (!toggles) return;
        if (force || next.depthOfField !== postShown.depthOfField) app.post?.setEffectEnabled?.("depthOfField", next.depthOfField);
        if (!buildOptions.reducedMotion && (force || next.motionBlur !== postShown.motionBlur)) app.post?.setEffectEnabled?.("motionBlur", next.motionBlur);
        postShown = next;
      };
      applyPost(postShown, true);
      // DG-S5: lightning in the storm chapter (render time, never sim time), the sky deck and the key flash together
      const lightning = inked && look.rain ? createLightning({ reducedFlash: options.reducedMotion }) : undefined;
      let flashShown = 0, strikes = 0;
      let lastRider: AuraVec3 = [0, 0, 0];
      return {
        celebrate() { oneShot = 0.9; playClip("walk"); },
        shake(strength) {
          siltFx?.impact(lastRider, strength);
          impactRig.trigger({ freezeSeconds: 0.04 * strength, trauma: Math.min(1, 0.3 + strength * 0.7), fovKickDeg: -2.2 * strength });
          if (options.reducedMotion) return;
          shakeStrength = Math.min(1, Math.max(shakeStrength * (shakeLeft > 0 ? 1 : 0), strength));
          shakeLeft = SHAKE_SECONDS;
        },
        update(sim, dt, time, aspect, cut = false) {
          const { state, flight } = sim;
          if (cut) impactRig.reset();
          if (flight.boosting && !wasBoosting && inked && !cut) {
            impactRig.trigger({ freezeSeconds: 0, trauma: 0.18, fovKickDeg: 2.8 });
          }
          wasBoosting = flight.boosting;
          const feelStep = impactRig.step(dt);
          const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
          const pitch = Math.max(-0.35, Math.min(0.35, -flight.vertical * 0.012));
          const rider = node("rider"), board = node("board");
          board.setPosition(state.x, state.y - BOARD_DROP, state.z);
          board.setRotation(pitch, state.yaw + BOARD_YAW, flight.bank);
          rider.setPosition(state.x, state.y - BOARD_DROP + DECK_TOP, state.z);
          rider.setRotation(pitch, state.yaw + Math.PI + (inked ? 0.34 : 0), flight.bank);
          const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
          if (inked) {
            const trim = node("board-trim");
            trim.setPosition(state.x, state.y - BOARD_DROP + DECK_TOP * 0.52, state.z);
            trim.setRotation(pitch, state.yaw, flight.bank);
            const flutter = options.reducedMotion ? 0 : Math.sin(time * 10.5) * (0.04 + Math.min(0.08, Math.abs(flight.speed) * 0.0012));
            const sail = node("board-sail");
            sail.setPosition(state.x - fx * 0.82 - 0.14 * cy, state.y - BOARD_DROP + DECK_TOP + 1.18, state.z - fz * 0.82 + 0.14 * sy);
            sail.setRotation(pitch - 0.22 - Math.min(0.28, Math.abs(flight.speed) * 0.004) + flutter, state.yaw + flight.bank * 0.2, flight.bank * 1.15 + flutter * 0.8);
          }
          for (const [side, ox] of [["l", -0.62], ["r", 0.62]] as const) {
            const t = node(`thruster-${side}`);
            if (inked) {
              // jade strips: flush under the deck, aligned with the board, stretching a little with speed
              t.setPosition(state.x + ox * 0.55 * cy, state.y - BOARD_DROP - 0.24, state.z - ox * 0.55 * sy);
              t.setRotation(pitch, state.yaw, flight.bank);
              t.setScale([1, 1, 1 + Math.min(0.5, Math.abs(flight.speed) * 0.008)]);
              continue;
            }
            t.setPosition(state.x + ox * cy + 0.2 * sy, state.y - BOARD_DROP - 0.85, state.z - ox * sy + 0.2 * cy);
            t.setScale([1, 0.8 + (options.reducedMotion ? 0 : 0.25 * Math.sin(time * 24 + ox * 5)) + Math.min(0.8, Math.abs(flight.speed) * 0.012), 1]);
          }
          node("sky").setPosition(state.x, state.y, state.z);
          if (flare) node("silt-flare").setPosition(state.x + keyDir[0] * FLARE_DISTANCE, state.y + keyDir[1] * FLARE_DISTANCE, state.z + keyDir[2] * FLARE_DISTANCE);
          node("canal").setUniform?.("siltTime", WATER_PIN ?? time);
          if (duneVeilOn) node("dune-mica-veil").setUniform?.("siltTime", time);
          if (duneBankOn) node("bank").setUniform?.("siltTime", time);
          if (lightning) {
            const { flash, began } = lightning.step(time);
            for (const strike of began) { strikes++; options.onThunder?.(strike.thunderDelay, strike.peak); }
            if (flash !== flashShown) {
              flashShown = flash;
              node("sky").setUniform?.("skyFlash", flash);
              node("silt-key").setLight?.({ intensity: look.key.intensity * (1 + LIGHTNING_KEY_BOOST * flash) });
            }
          }

          const floorUnder = Math.max(sim.world.floor(state.x, state.z, state.y), overCanal(chapter, state.x, state.z) ? 0 : -Infinity);
          const boardAlt = Math.max(0, state.y - BOARD_DROP - floorUnder);
          const isOverCanal = overCanal(chapter, state.x, state.z);
          if (blob) {
            // under the board, slid a little along the key's shadow direction (capped), smaller as the board climbs
            const slide = Math.min(RIDER_BLOB.maxSlide, boardAlt / Math.max(0.2, Math.tan(Math.asin(Math.min(0.99, keyDir[1])))));
            const h = Math.hypot(keyDir[0], keyDir[2]) || 1;
            const shrink = 1 - Math.min(0.55, boardAlt / 18);
            const b = node("rider-blob");
            b.setPosition(state.x - (keyDir[0] / h) * slide, floorUnder + 0.09, state.z - (keyDir[2] / h) * slide);
            b.setRotation(0, state.yaw, 0);
            b.setScale([RIDER_BLOB.width * shrink, 0.02, RIDER_BLOB.length * shrink]);
          }
          lastRider = [state.x, state.y, state.z];
          applyPost(sequencePost({ boosting: flight.boosting, sequence, reducedMotion: !!options.reducedMotion }));
          if (siltFx) {
            siltFx.update({ position: [state.x, state.y - BOARD_DROP, state.z], forward: [fx0(state.yaw), fz0(state.yaw)], speed: flight.speed, altitude: boardAlt, overCanal: isOverCanal }, dt);
          }
          if (flipbooksOn) {
            const plume = node("wake-plume");
            const plumeSheet = node("wake-plume-sheet");
            const speedFrac = Math.max(0, Math.min(1, (Math.abs(flight.speed) - 18) / 42));
            const altFrac = boardAlt < 9 ? 1 - boardAlt / 9 : 0;
            const wakeK = isOverCanal ? 0 : speedFrac * altFrac;
            if (wakeK > 0.06) {
              plume.setPosition(state.x - fx * 2.1, floorUnder + 0.85, state.z - fz * 2.1);
              plume.setScale(0.75 + wakeK * 1.15);
              plumeSheet.setPosition(state.x - fx * 2.6, floorUnder + 0.65, state.z - fz * 2.6);
              plumeSheet.setRotation(0, state.yaw, 0);
              plumeSheet.setScale(0.8 + wakeK * 1.1);
            } else {
              plume.setPosition(...FAR);
              plumeSheet.setPosition(...FAR);
            }
          }
          if (state.point !== lastPoint || state.objective !== lastObjective) {
            if (siltFx && lastPoint >= 0 && state.objective === lastObjective && state.point > lastPoint) {
              const passed = objectiveOf(state).points[lastPoint];
              if (passed) {
                siltFx.ringPassed([passed.x, passed.y, passed.z]);
                rippleAt = [passed.x, passed.y, passed.z];
                rippleLeft = 0.55;
              }
              punchLeft = RING_PUNCH.seconds;
              if (!cut) impactRig.trigger({ freezeSeconds: 0.02, trauma: 0.2, fovKickDeg: 2.6 });
            }
            if (lastPoint >= 0 && (state.point > lastPoint || state.objective !== lastObjective)) { oneShot = 0.9; playClip("walk"); }
            lastPoint = state.point; lastObjective = state.objective;
          }
          if (flipbooksOn) {
            const rip = node("signal-ripple");
            if (rippleLeft > 0) {
              rippleLeft = Math.max(0, rippleLeft - dt);
              const expand = 0.85 + (1 - rippleLeft / 0.55) * 0.95;
              rip.setPosition(rippleAt[0], rippleAt[1], rippleAt[2]);
              rip.setRotation(0, state.yaw, 0);
              rip.setScale(expand);
            } else {
              rip.setPosition(...FAR);
            }
          }
          if (oneShot > 0) oneShot -= dt;
          else if (sim.state.hold > 0) playClip("walk");
          else playClip("idle");
          controller?.update(dt);
          // WP-29 athletic hoverboard carve stance: knees bent into dune landings, torso banking & forward boost tuck, head sighting down-course
          if (inked && options.animate !== false) {
            const base = rider.animationPose?.();
            const crouch = 0.24 + (flight.boosting ? 0.16 : 0) + Math.max(0, Math.min(0.18, -flight.vertical * 0.015));
            const leanFwd = 0.14 + (flight.boosting ? 0.2 : 0) + Math.min(0.1, Math.abs(flight.speed) * 0.0018);
            const carve = Math.max(-0.32, Math.min(0.32, flight.bank * 0.55));
            const rotOf = (boneName: string): QuatObj => base?.bones?.[boneName]?.rotation ?? COURIER_BIND_ROT[boneName] ?? { x: 0, y: 0, z: 0, w: 1 };
            const withRot = (boneName: string, delta: QuatObj) => ({
              ...(base?.bones?.[boneName] ?? {}),
              rotation: quatMul(rotOf(boneName), delta)
            });
            rider.setAnimationPose?.({
              ...(base ?? {}),
              mode: "overlay",
              bones: {
                ...(base?.bones ?? {}),
                Spine: withRot("Spine", quatMul(quatAxis(1, 0, 0, leanFwd * 0.65), quatAxis(0, 0, 1, carve * 0.5))),
                Spine01: withRot("Spine01", quatMul(quatAxis(1, 0, 0, leanFwd * 0.45), quatAxis(0, 1, 0, -0.18))),
                Head: withRot("Head", quatMul(quatAxis(0, 1, 0, -0.32 - carve * 0.25), quatAxis(1, 0, 0, -leanFwd * 0.4))),
                LeftLeg: withRot("LeftLeg", quatAxis(1, 0, 0, crouch)),
                RightLeg: withRot("RightLeg", quatAxis(1, 0, 0, crouch * 0.92)),
                LeftArm: withRot("LeftArm", quatAxis(0, 0, 1, 0.18 - carve * 0.35)),
                RightArm: withRot("RightArm", quatAxis(0, 0, 1, -0.18 - carve * 0.35))
              }
            });
          }

          const o = objectiveOf(state);
          const active = o.points[state.point];
          const target = !active || state.scene || state.completed || NO_BEACON ? null : [active.x, active.y, active.z] as [number, number, number];
          // timed gates: the cyan beacon while open, the red one while shut
          const shut = target !== null && o.kind === "timed" && !gateOpen(sim.time, o);
          const open = prefabs.objectiveMarkerPoses(shut ? null : target, time, { diameter: beaconDiameter, hiddenPosition: [...FAR] });
          const closed = prefabs.objectiveMarkerPoses(shut ? target : null, time, { diameter: beaconDiameter, hiddenPosition: [...FAR] });
          for (const part of ["ring", "rim", "halo", "beam"] as const) {
            for (const [id, poses] of [["beacon", open], ["gate", closed]] as const) {
              const h = node(`${id}-${part}`);
              const pose = poses[part]!;
              // GU47 phase 4 (inked): no heavy dark ring body (the thin jade rim and halo mark the gate) and a slimmer
              // signal column, so neither fills or splits the chase frame (rubric composition)
              if (inked && part === "ring") { h.setPosition(...FAR); continue; }
              h.setPosition(...pose.position);
              h.setScale(inked && part === "beam" ? [pose.scale[0] * INKED_BEACON.beamWidth, pose.scale[1], pose.scale[2] * INKED_BEACON.beamWidth] : [...pose.scale]);
            }
          }
          // waiting rings: rewrite the instanced pool only when the set of waiting rings changes
          const waiting = state.scene || state.completed ? [] : o.points.slice(state.point + 1, MAX_RINGS);
          const key = `${state.chapter}:${state.objective}:${state.point}:${waiting.length}`;
          if (key !== ringsKey) {
            ringsKey = key;
            node("rings").setInstances(Array.from({ length: MAX_RINGS }, (_, i) => {
              const p = waiting[i];
              return p ? { position: [p.x, p.y, p.z] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: inked ? INKED_BEACON.waitingRingScale : 38 } : PARKED;
            }));
          }
          // tow: the shell trails 9 m behind the board while towing
          if (state.towing) {
            const bx = state.x - fx * 9, bz = state.z - fz * 9, by = Math.max(state.y - 3.2, sim.world.floor(bx, bz, state.y) + 1);
            if (!towing || cut) { towX = bx; towY = by; towZ = bz; }
            const kt = 1 - Math.exp(-dt * 6);
            towX += (bx - towX) * kt; towY += (by - towY) * kt; towZ += (bz - towZ) * kt;
            node("tow-shell").setPosition(towX, towY, towZ);
            node("tow-glow").setPosition(towX, towY + 0.95, towZ);
          } else if (towing) {
            node("tow-shell").setPosition(...FAR);
            node("tow-glow").setPosition(...FAR);
          }
          towing = state.towing;
          const framing = inked ? INKED_CHASE : ORIGINAL_CHASE;
          const tx = state.x + fx * framing.lookAhead - fz * framing.side, ty = state.y + framing.lookLift, tz = state.z + fz * framing.lookAhead + fx * framing.side;
          if (!init || cut) { lookX = tx; lookY = ty; lookZ = tz; init = true; clearance.reset(); }
          const k = 1 - Math.exp(-dt * 5);
          lookX += (tx - lookX) * k; lookY += (ty - lookY) * k; lookZ += (tz - lookZ) * k;
          // A hard turn swings the wanted target around the rider faster than the 5/s smoothing follows; bound the lag (and recover from a non-finite state)
          [lookX, lookY, lookZ] = limitLookLag([lookX, lookY, lookZ], [tx, ty, tz], framing.lookAhead * 0.75);
          let kick = flight.boosting && !options.reducedMotion ? 6 : 0;
          let up: [number, number, number] = [0, 1, 0];
          if (inked) {
            // DG-C2: boost FOV kick +8 deg eased at no more than 2 deg per frame; roll 0.4x the board bank, max 6 deg;
            // both 0 on reduced motion (PRD §6.3)
            // DG-C2: the ring-pass punch adds RING_PUNCH.deg for 0.35 s through the same 2 deg/frame ease
            const want = fovKickTarget(flight.boosting, punchLeft, !!options.reducedMotion);
            punchLeft = Math.max(0, punchLeft - dt);
            fovKick += Math.max(-2, Math.min(2, (want - fovKick) * Math.min(1, dt * 6)));
            if (cut) fovKick = want;
            kick = fovKick;
            const wantRoll = options.reducedMotion ? 0 : cameraRoll(flight.bank);
            roll += (wantRoll - roll) * Math.min(1, dt * 8);
            if (cut) roll = wantRoll;
            up = rolledUp(fx0(state.yaw), fz0(state.yaw), roll + feelStep.shakeRoll);
            kick = fovKick + feelStep.fovDeltaDeg;
          }
          const eye = options.clearCamera === false ? wantedChaseEye(sim, framing) : clearChaseEye(sim, clearance, dt, scenery, framing);
          lastEye = { eye, blocked: chaseEyeBlocked(sim.world, scenery)(eye[0], eye[1], eye[2]) };
          let shown: [number, number, number] = [
            eye[0] + feelStep.shakeOffset[0],
            eye[1] + feelStep.shakeOffset[1],
            eye[2] + feelStep.shakeOffset[2]
          ];
          if (shakeLeft > 0) {
            shakeLeft = Math.max(0, shakeLeft - dt);
            const a = SHAKE_METRES * shakeStrength * (shakeLeft / SHAKE_SECONDS);
            shown = [shown[0] + a * Math.sin(time * 61), shown[1] + a * Math.sin(time * 47 + 1.3), shown[2] + a * Math.sin(time * 53 + 2.1)];
          }
          const baseFov = aspect < 0.85 ? 78 : 62;
          const safe = guardPose({ position: shown, target: [lookX, lookY, lookZ], up, fov: baseFov + kick }, lastGoodPose, { position: [sim.state.x, sim.state.y + 5, sim.state.z + 13], target: [sim.state.x, sim.state.y + 1.5, sim.state.z], up: [0, 1, 0], fov: baseFov });
          lastGoodPose = safe;
          if (safe.target[0] !== lookX || safe.target[1] !== lookY || safe.target[2] !== lookZ) { lookX = safe.target[0]; lookY = safe.target[1]; lookZ = safe.target[2]; }
          cameraController.setPose({ position: [...safe.position], target: [...safe.target], up: [...safe.up], fov: safe.fov }, { cut });
        },
        get nodeCount() { return handles.size; },
        fxStats: () => siltFx?.stats() ?? null,
        cameraFeel: () => ({ fovKick, rollDeg: (roll * 180) / Math.PI }),
        lightning: () => (lightning ? { flash: flashShown, strikes } : null),
        setSequence(on) { sequence = on; },
        sequencePost: () => postShown,
        cameraEye: () => lastEye,
        riderAnimation: () => animation
      };
    }
  };
}
