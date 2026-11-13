/**
 * Duneglide on Aura3D: the rendered world for one chapter, built on the public engine surface.
 *
 * Lit PBR terrain, road and canal banks with CC0 texture sets, instanced trees, rocks, houses, lamps and aqueduct
 * piers, a rigged hero on a board, additive signal rings, a flowing canal, the ported sky dome, a cascaded sun,
 * hemisphere fill, fog and a light grade/bloom. Sky colours follow the original's per-chapter rule; the layout of
 * chapter 0 follows the original's measured object positions (see terrain.ts).
 */
import {
  camera, effects, environments, geometry, instances, lights, material, prefabs, primitives, scene,
  type AuraApp, type AuraMaterialSpec, type AuraVec3
} from "@aura3d/engine";
import { assets } from "./assets";
import { CHAPTERS } from "./chapters-data";
import { INKED_CHASE, ORIGINAL_CHASE, chaseEyeBlocked, chaseTargetForEye, clearChaseEye, createChaseClearance, sceneryColumns, wantedChaseEye } from "./camera";
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
  SURFER_PELVIS_REST,
  batchedMesaSpireSpec,
  batchedSignalPylonBodySpec,
  batchedSignalRelayDishSpec,
  batchedSolarArraySpec,
  billowingRoutePennantSpec,
  canyonYardangRockSpec,
  collaredBronzeMastSpec,
  createBazaarStall,
  createBoardSailNode,
  createBoardTrimNode,
  createCanyonResonanceGate,
  createDesertBuggyCrawlerNode,
  createDesertSurferRigNode,
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
  desertScrubBushSpec,
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
import { buildArchitecture, farDuneRings, farDunes, orchardTerrainColors, plazaColors, terrainColors, type ColoredMesh } from "./architecture";
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
      fogFar: { type: "f32", value: 1560 },
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
    fogFar: 1560,
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
      fogFar: { type: "f32", value: 1560 },
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
      fogFar: { type: "f32", value: 1560 }
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
  /** Latest guarded chase camera pose (position, target, up, fov) for seamless intro-rail blending & early skip. */
  readonly chasePose?: () => { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly up: readonly [number, number, number]; readonly fov: number } | null;
  /** Precomputed scenery columns for intro-rail clearance checks. */
  readonly sceneryColumns?: () => readonly Column[];
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
  /** Clears transient wake bursts and trails on restart so zero particle handles accumulate across resets. */
  resetFx?(): void;
}

/** DG-C2 constants: boost FOV kick (deg), roll as a fraction of the board bank, gentle roll cap (deg, <= 0.08 rad). */
export const BOOST_FOV_KICK = 8;
export const ROLL_OF_BANK = 0.12;
export const MAX_ROLL_DEG = 4.4;
/** DG-C2 ring-pass punch: a short extra FOV kick (deg) for this many seconds after a ring is passed. */
export const RING_PUNCH = { deg: 3, seconds: 0.35 } as const;
/** DG-C2: the FOV kick the camera eases toward (boost plus the ring-pass punch); 0 on reduced motion. */
export function fovKickTarget(boosting: boolean, punchLeft: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return (boosting ? BOOST_FOV_KICK : 0) + (punchLeft > 0 ? RING_PUNCH.deg : 0);
}
/** Camera roll in radians for a board bank (radians): 0.12x, gently capped at 4.4 deg (~0.0768 rad <= 0.08 rad). */
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
    mode: "linear", near: look.fog.near, far: look.fog.far, color: look.fog.color, maxOpacity: look.fog.maxOpacity
  } as unknown as Parameters<typeof effects.fog>[0]));
  // DG-S4: subtle shafts in ch0/ch2 only, capped low so gameplay dunes never wash out in white haze
  if (look.godRays && !options.low) {
    builder.add(effects.volumetricFog({ name: "silt god rays", color: look.key.color, density: look.fog.density, intensity: look.night ? 0.1 : 0.12, godRayDensity: GOD_RAY_DENSITY }));
  }
  // DG-L5 + WP-29 grounding: contact shadows; optional heavy G-buffer SSAO / SSR only when explicitly requested
  if (!options.low) {
    builder.add(effects.contactShadows({ intensity: 0.9, length: 0.45 }));
    const rawSearch = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
    if (rawSearch?.get("ssao") === "1") {
      builder.add(effects.ambientOcclusion({ intensity: 0.38, radius: 0.82, falloff: 1.5, multiBounce: true }));
    }
    if (rawSearch?.get("ssr") === "1") {
      builder.add(effects.screenSpaceReflections({ intensity: look.rain ? 0.46 : 0.26, maxDistance: 24, roughness: 0.18, thickness: 0.25 }));
    }
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
  // DG-P4: boost motion blur only (High tier, never on reduced motion); no DoF blur so distant dunes and rings stay crisp.
  if (!options.low && !options.reducedMotion) {
    builder.add(effects.motionBlur({ name: "silt boost blur", intensity: BOOST_BLUR }));
  }
}

/** DG-P4: legacy SEQUENCE_DOF constant retained for exports; DoF stays off so gameplay horizons remain crisp. */
export const SEQUENCE_DOF = { focusDistance: 22, fStop: 2.8, maxBlur: 3 } as const;
export const BOOST_BLUR = 0.35;
/** DG-P4: which of the toggled post effects should be on now (DoF permanently disabled for crisp horizon clarity). */
export function sequencePost(state: { readonly boosting: boolean; readonly sequence: boolean; readonly reducedMotion: boolean }): { readonly depthOfField: boolean; readonly motionBlur: boolean } {
  return { depthOfField: false, motionBlur: state.boosting && !state.sequence && !state.reducedMotion };
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
/** Sand skiff deck non-slip footpad sits at y = 0.192 in unscaled skiff space; surfer boots stand flush at y = 0 on it. */
const BOARD_SCALE = 1.15;
const BOARD_DROP = 1.25;
const DECK_TOP = 0.192 * BOARD_SCALE;
const BOARD_YAW = Math.PI / 2;
const SURF_STANCE_YAW = 0;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);
const dynamicFrom = (m: MeshData | ColoredMesh) => geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices), ...("colors" in m ? { colors: f32(m.colors) } : {}) });

type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
const mat3RotX = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const mat3RotY = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const mat3RotZ = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const mat3Mul = (a: Mat3, b: Mat3): Mat3 => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
];
const mat3TransformVec = (m: Mat3, v: readonly [number, number, number]): [number, number, number] => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
];
/** Exact `"ZYX"` Euler angles matching Aura3D `setRotation(rx, ry, rz)` (`R = Rz(rz) * Ry(ry) * Rx(rx)`), stateless per frame. */
const mat3ToEulerZYX = (m: Mat3): [number, number, number] => {
  const m31 = Math.max(-1, Math.min(1, m[6]));
  const y = Math.asin(-m31);
  if (Math.abs(m31) < 0.9999999) {
    return [Math.atan2(m[7], m[8]), y, Math.atan2(m[3], m[0])];
  }
  return [Math.atan2(-m[5], m[4]), y, 0];
};

const DESERT_FLORA_TINTS = ["#54ccb0", "#3eb398", "#6ed8be", "#47bfa3"] as const;
const ORCHARD_FLORA_TINTS = ["#7ed494", "#66c484", "#8fde9e", "#54b878"] as const;
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
    fog: chapter === 0 ? "#eec680" : cssHex(p.fog!),
    fogDensity: night ? 0.00055 : 0.00028,
    background: chapter === 0 ? "#f2ce8c" : cssHex(p.fog!)
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
export const INKED_BEACON = { diameter: 48, beamWidth: 0.06, waitingRingScale: 38 * (48 / 66) } as const;
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
      .add(effects.fog({ mode: "linear", near: 280, far: 1560, maxOpacity: 0.3, color: rig.fog } as unknown as Parameters<typeof effects.fog>[0]))
      // threshold at HDR white (1.0) so only the emissive beacons, thrusters and lamps bloom; `radius` is a deprecated post field
      // night 0.6 (was 0.7): the renderer flags bloom intensity above 0.62 as a noise risk
      .add(effects.bloom({ intensity: rig.night ? 0.6 : 0.38, threshold: 1 }))
      .add(effects.colorGrade({ contrast: 1.06, saturation: 1.08, exposure: rig.night ? 1.05 : 1 }));
  }

  builder.add(primitives.sphere({ name: "sky", position: [0, 0, 0], size: 4200, ...(inked ? { castShadow: false, receiveShadow: false } : {}), material: material.custom(skySpec(chapter, inked ? "inked" : "original")) }).runtime({ id: "sky" }));

  const orchard = inked && look.ground === "orchard";
  builder.add(geometry.custom(dynamicFrom({ ...terrainMesh, colors: orchard ? orchardTerrainColors(terrainMesh.positions) : terrainColors(terrainMesh.positions, inked) }), {
    name: "terrain",
    castShadow: !buildOptions.low && !usesOriginalTerrain(chapter),
    receiveShadow: true,
    material: orchard
      ? pbr({ color: "#e4ead2", texture: assets.grassColor, normal: assets.grassNormal, roughnessMap: assets.grassRough, normalScale: 0.9, roughness: 0.92 })
      : inked
      ? pbr({ color: look.night ? "#b7a48a" : "#f0dcc0", texture: assets.groundColor, normal: assets.groundNormal, roughnessMap: assets.groundRough, normalScale: 0.6, roughness: 1 })
      : pbr({ color: grassTint, texture: assets.grassColor, normal: assets.grassNormal, roughnessMap: assets.grassRough, normalScale: 0.9, roughness: 1 })
  }).runtime({ id: "terrain" }));
  // WP-29 paired GLSL+WGSL wind-rippled desert sand + sparkling mineral mica-glint veil over open dunes (opt-in via ?veil=1 to avoid full-valley transparent overdraw)
  const duneVeilOn = inked && !orchard && !buildOptions.low && typeof location !== "undefined" && new URLSearchParams(location.search).get("veil") === "1";
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
    builder.add(geometry.custom(dynamicFrom({ ...plaza, colors: plazaColors(plaza.positions, inked) }), {
      name: "plaza",
      castShadow: false,
      receiveShadow: true,
      material: wet
        ? pbr({ color: WET_ROAD.color, texture: assets.pavingColor, normal: assets.pavingNormal, roughnessMap: assets.pavingRough, roughness: WET_ROAD.roughness, envMapIntensity: WET_ROAD.envMapIntensity })
        : pbr({ color: "#e9d2a8", texture: assets.pavingColor, normal: assets.pavingNormal, roughnessMap: assets.pavingRough, roughness: 1 })
    }).runtime({ id: "plaza" }));
  }
  builder.add(geometry.custom(dynamicFrom(terrain.roadMesh()), {
    name: "road",
    castShadow: false,
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
      castShadow: false,
      receiveShadow: true,
      material: duneBankOn
        ? material.custom(duneSandSpec(chapter, false))
        : pbr({ color: "#d9c8aa", texture: assets.groundColor, normal: assets.groundNormal, roughnessMap: assets.groundRough, roughness: 1 })
    }).runtime({ id: "bank" }));
  }
  // A4 pilot (?portable=1, default off): canal water never casts an opaque shadow.
  builder.add(geometry.custom(dynamicFrom(terrain.waterMesh()), { name: "canal", castShadow: false, material: readPortableFlag() ? portableWaterMaterial(waterSpec(chapter, inked ? "inked" : "original")) : waterMaterial(chapter, inked ? "inked" : "original", buildOptions.water) }).runtime({ id: "canal" }));
  const deck = terrain.deckMesh();
  if (deck.indices.length) {
    builder.add(geometry.custom(dynamicFrom(deck), {
      name: "cistern-deck",
      castShadow: false,
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
        castShadow: false,
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
      castShadow: false,
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
      ? primitives.box({ name: `thruster-${side}`, position: [0, 4, 0], size: [0.12, 0.05, 1.5], castShadow: false, receiveShadow: false, material: material.emissive({ color: SILT_PALETTE.jade, emissiveIntensity: 2.5, practical: true }) })
      : primitives.sphere({ name: `thruster-${side}`, position: [0, 4, 0], size: [0.34, 1.1, 0.34], castShadow: false, receiveShadow: false, material: material.emissive({ color: "#38d6ff", emissiveIntensity: 3 }) })
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
      size: 1.55,
      blend: "alpha",
      intensity: 0.54,
      color: look.wake.color
    }).runtime({ id: "wake-plume" }));
    builder.add(primitives.plane({
      name: "wake-plume-sheet",
      size: [1.65, 1.65],
      position: [...FAR],
      castShadow: false,
      receiveShadow: false,
      material: pbr({
        color: look.wake.color,
        texture: dustAtlas.texture,
        roughness: 0.94,
        opacity: 0.36,
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
  builder.add(createDesertSurferRigNode({ inked }));
  // GU47 phase 4 (inked, not on Low): an indigo-umber shadow shape on the ground under the board, so the rider reads as
  // grounded at every altitude (rubric shadows; the poster's flat shadow shapes). +1 draw; bind moves it each frame.
  const blob = inked && !buildOptions.low;
  if (blob) builder.add(primitives.cylinder({ name: "rider-blob", position: [...FAR], size: [1, 1, 1], castShadow: false, receiveShadow: false, material: pbr({ color: look.night ? "#0b0d24" : "#2a1a10", roughness: 1, opacity: RIDER_BLOB.opacity }) }).runtime({ id: "rider-blob" }));

  const groundAt = (x: number, z: number): number => Math.max(0, terrain.heightAt(x, z));
  const isNightChapter = inked ? look.night : rig.night;
  const mesaBatchTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const pylonBodyTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const pylonDishTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const pylonSolarTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const pushBatchedPylon = (x: number, z: number, height: number, yaw: number) => {
    const gy = groundAt(x, z);
    pylonBodyTransforms.push({ position: [x, gy, z], rotation: [0, yaw, 0], scale: [height * 0.42, height, height * 0.42] });
    pylonDishTransforms.push({ position: [x, gy + height * 0.86, z], rotation: [0, yaw, 0], scale: [2.35, 2.35, 2.35] });
    pylonSolarTransforms.push({ position: [x, gy + height * 0.68, z], rotation: [0, yaw, 0], scale: [2.2, 2.2, 2.2] });
  };

  if (usesOriginalTerrain(chapter) && chapter === 0) {
    builder.add(createGatehouseNeri("gatehouse-neri", [-34, groundAt(-34, -262), -262], 0.35));
    builder.add(createDesertViaduct("aqueduct-east", [150, groundAt(150, -520), -520], Math.PI / 2));
    builder.add(createDesertViaduct("aqueduct-west", [-170, groundAt(-170, -720), -720], Math.PI / 2));
    builder.add(createCanyonResonanceGate("canyon-gate", [0, groundAt(0, -1295), -1295], 0));
    builder.add(createBazaarStall("stall-0", [85, groundAt(85, -12), -12], 0.4));
    builder.add(createDesertBuggyCrawlerNode("desert-crawler-0", [112, groundAt(112, -26), -26], -0.52, inked));
    builder.add(createSignalRelayTower("watchtower-0", [196, groundAt(196, -108), -108], -0.65, inked));
    let banners = 0;
    for (const objective of ch.objectives) {
      objective.points.forEach((pt, i) => {
        if (i % 2 !== 0 || banners >= 4) return;
        const side = banners % 2 === 0 ? 1 : -1;
        const x = pt.x + side * 42, z = pt.z;
        builder.add(createWindBannerMast(`banner-${banners}`, [x, groundAt(x, z), z], side * 0.6, banners));
        banners += 1;
      });
    }
    builder.add(createFlutedObeliskPillar("pillar-0", [-85, groundAt(-85, -930), -930], 0, 24));
    for (const [i, [x, z, s]] of ([[92, -980, 28], [-110, -1060, 26], [105, -1120, 22], [-78, -1180, 30], [88, -1230, 25], [-120, -640, 27], [135, -870, 29]] as const).entries()) {
      pushBatchedPylon(x, z, s, (i + 1) * 1.45);
    }
    builder.add(createStratifiedMesaSpire("mesa-spire-0", [235, groundAt(235, -185), -185], 0.4, 22, isNightChapter));
    for (const [x, z, s, yaw] of [
      [-225, -430, 26, -0.5],
      [228, -790, 24, 1.1],
      [-210, -1160, 28, -1.2],
      [285, -510, 30, 0.85],
      [-295, -860, 32, -0.95],
      [270, -1190, 29, 1.45],
      [-260, 145, 28, -0.4],
      [315, 165, 30, 0.7],
      [-335, -35, 32, -0.85],
      [365, -45, 29, 1.05],
      [-285, 360, 34, -1.1],
      [310, 390, 31, 0.9],
      [-195, 540, 33, -0.6],
      [245, 560, 30, 1.25]
    ] as const) {
      mesaBatchTransforms.push({ position: [x, Math.max(0, terrain.surfaceHeightAt(x, z)) - 3.0, z], rotation: [0, yaw, 0], scale: [s, s, s] });
    }
  } else {
    const midZ = -terrain.length * 0.44;
    builder.add(createDesertBuggyCrawlerNode("desert-crawler-0", [132, groundAt(132, -68), -68], -0.45, inked));
    for (const [x, z, s, yaw] of [
      [360, midZ, 26, 0.55],
      [-360, midZ - 180, 28, -0.7],
      [335, midZ + 260, 24, 1.15],
      [-340, midZ - 420, 30, -1.25],
      [350, 180, 27, 0.6],
      [-350, 165, 29, -0.8],
      [295, 440, 31, 1.1],
      [-310, 460, 30, -1.0]
    ] as const) {
      mesaBatchTransforms.push({ position: [x, Math.max(0, terrain.surfaceHeightAt(x, z)) - 3.0, z], rotation: [0, yaw, 0], scale: [s, s, s] });
    }
    for (let k = 0; k < 6; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const pz = -160 - k * Math.max(140, Math.floor(terrain.length / 8));
      const px = 82 + side * 66;
      pushBatchedPylon(px, pz, 22 + (k % 3) * 3, side * 0.65 + k * 0.4);
    }
  }

  if (mesaBatchTransforms.length) {
    builder.add(instances.custom(batchedMesaSpireSpec(), {
      name: "batched-mesa-spires",
      castShadow: false,
      receiveShadow: true,
      material: isNightChapter
        ? unnamed(material.pbr({ color: "#5e506b", roughness: 0.88, metalness: 0.02, clearcoat: 0, sheen: 0 }))
        : DESERT_INST_MAT.redRockMesa,
      transforms: mesaBatchTransforms
    }));
  }
  if (pylonBodyTransforms.length) {
    builder.add(instances.custom(batchedSignalPylonBodySpec(), {
      name: "batched-signal-pylons",
      castShadow: false,
      receiveShadow: true,
      material: DESERT_INST_MAT.sandstone,
      transforms: pylonBodyTransforms
    }));
    builder.add(instances.custom(batchedSignalRelayDishSpec(), {
      name: "batched-relay-dishes",
      castShadow: false,
      receiveShadow: true,
      material: DESERT_INST_MAT.relayDishBrass,
      transforms: pylonDishTransforms
    }));
    builder.add(instances.custom(batchedSolarArraySpec(), {
      name: "batched-solar-arrays",
      castShadow: false,
      receiveShadow: true,
      material: DESERT_INST_MAT.solarPanelArray,
      transforms: pylonSolarTransforms
    }));
  }

  // Batched turquoise oasis & canal-bank scrub bushes (`layeredCanopyMesh` + `instances.custom`, 1 draw call)
  {
    const scrubTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
    const scrubColors: string[] = [];
    const canalShift = usesOriginalTerrain(chapter) ? 0 : 62;
    const bankOffset = usesOriginalTerrain(chapter) ? 28.5 : 19.5;
    for (let i = 0; i < 44; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const sz = -45 - i * Math.max(24, Math.floor((terrain.length - 120) / 46));
      const canalCenter = 82 + Math.sin(sz * 0.006) * 8 - canalShift;
      const jitter = ((Math.sin(i * 17.31 + 1.9) * 43758.5453) % 1 + 1) % 1;
      const sx = canalCenter + side * (bankOffset + 2.4 + jitter * 8.5);
      if (props.walls.some((w) => Math.abs(sx - w.x) < w.halfX + 3.5 && Math.abs(sz - w.z) < w.halfZ + 3.5)) continue;
      const sy = terrain.heightAt(sx, sz);
      if (sy < -0.4) continue;
      const s = 1.45 + jitter * 1.15;
      scrubTransforms.push({
        position: [sx, sy + 0.05, sz],
        rotation: [0, jitter * Math.PI * 2, 0],
        scale: [s, s * (0.82 + jitter * 0.24), s]
      });
      scrubColors.push(floraTint(i + 7, orchard));
    }
    if (scrubTransforms.length) {
      builder.add(instances.custom(desertScrubBushSpec(), {
        name: "batched-scrub-bushes",
        castShadow: false,
        receiveShadow: true,
        material: DESERT_INST_MAT.scrubFoliage,
        transforms: scrubTransforms,
        ...(inked ? { colors: scrubColors, wind: treeWind(!!buildOptions.reducedMotion) } : {})
      }));
    }
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
      let surferParts: {
        pelvis: ReturnType<AuraApp["nodes"]["require"]>;
        torso: ReturnType<AuraApp["nodes"]["require"]>;
        head: ReturnType<AuraApp["nodes"]["require"]>;
        armLead: ReturnType<AuraApp["nodes"]["require"]>;
        armTrail: ReturnType<AuraApp["nodes"]["require"]>;
        scarf: ReturnType<AuraApp["nodes"]["require"]>;
        scarfTip: ReturnType<AuraApp["nodes"]["require"]>;
      } | undefined;
      try {
        if (options.animate === false) throw new Error("animation disabled (norig=1)");
        node("rider");
        surferParts = {
          pelvis: node("rider-pelvis"),
          torso: node("rider-torso"),
          head: node("rider-head"),
          armLead: node("rider-arm-lead"),
          armTrail: node("rider-arm-trail"),
          scarf: node("rider-scarf"),
          scarfTip: node("rider-scarf-tip")
        };
        animation = { bound: true, clip: "idle" };
      } catch (error) {
        animation = { bound: false, clip: null, error: String((error as Error)?.message ?? error) };
        surferParts = undefined;
      }
      let oneShot = 0;
      const playClip = (clip: string): void => {
        if (!surferParts || animation.clip === clip) return;
        animation = { bound: true, clip };
      };

      let lookX = 0, lookY = 0, lookZ = 0, init = false;
      const clearance = createChaseClearance();
      const scenery = sceneryColumns(props);
      let cachedBlockedWorld: Sim["world"] | null = null;
      let cachedBlockedFn: ((x: number, y: number, z: number) => boolean) | null = null;
      const getBlockedFn = (w: Sim["world"]) => {
        if (cachedBlockedWorld !== w || !cachedBlockedFn) {
          cachedBlockedWorld = w;
          cachedBlockedFn = chaseEyeBlocked(w, scenery);
        }
        return cachedBlockedFn;
      };
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
      // DG-P4: boost motion blur starts off (inked High only; DoF is absent so distant horizon dunes stay crisp)
      const toggles = inked && !buildOptions.low;
      let sequence = false;
      let postShown = { depthOfField: false, motionBlur: false };
      const applyPost = (next: { depthOfField: boolean; motionBlur: boolean }, force = false): void => {
        if (!toggles) return;
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
          const speed01 = Math.max(0, Math.min(1, Math.abs(flight.speed) / 62));
          const hoverMotion = options.reducedMotion ? 0 : 1 - 0.35 * speed01;
          const hoverBobY = (Math.sin(time * 2.9) * 0.042 + Math.sin(time * 5.1 + 0.8) * 0.014) * hoverMotion;
          const hoverMicroRoll = Math.sin(time * 2.1 + 0.4) * 0.016 * hoverMotion;
          const visualBank = Math.max(-0.78, Math.min(0.78, flight.bank * 1.12 + hoverMicroRoll));
          const pitch = Math.max(-0.32, Math.min(0.32, flight.vertical * 0.012));
          const skiffMat = mat3Mul(mat3RotY(state.yaw), mat3Mul(mat3RotX(pitch), mat3RotZ(-visualBank)));
          const skiffEuler = mat3ToEulerZYX(skiffMat);
          const boardEuler = mat3ToEulerZYX(mat3Mul(skiffMat, mat3RotY(BOARD_YAW)));
          const deckOffset = mat3TransformVec(skiffMat, [0, DECK_TOP, 0]);
          const boardY = state.y - BOARD_DROP + hoverBobY;
          const rider = node("rider"), board = node("board");
          board.setPosition(state.x, boardY, state.z);
          board.setRotation(boardEuler[0], boardEuler[1], boardEuler[2]);
          rider.setPosition(state.x + deckOffset[0], boardY + deckOffset[1], state.z + deckOffset[2]);
          rider.setRotation(skiffEuler[0], skiffEuler[1], skiffEuler[2]);
          const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
          if (inked) {
            const trimOffset = mat3TransformVec(skiffMat, [0, DECK_TOP * 0.52, 0]);
            const trim = node("board-trim");
            trim.setPosition(state.x + trimOffset[0], boardY + trimOffset[1], state.z + trimOffset[2]);
            trim.setRotation(skiffEuler[0], skiffEuler[1], skiffEuler[2]);
            const flutter = options.reducedMotion ? 0 : Math.sin(time * 10.5) * (0.04 + Math.min(0.08, Math.abs(flight.speed) * 0.0012));
            const sailOffset = mat3TransformVec(skiffMat, [-0.28, DECK_TOP + 0.16, 0.92]);
            const sailEuler = mat3ToEulerZYX(
              mat3Mul(
                skiffMat,
                mat3Mul(
                  mat3RotY(flight.bank * 0.14 + flutter * 0.6),
                  mat3Mul(mat3RotX(-0.12 - Math.min(0.22, Math.abs(flight.speed) * 0.0035) + flutter * 0.5), mat3RotZ(-flight.bank * 0.12 + flutter * 0.7))
                )
              )
            );
            const sail = node("board-sail");
            sail.setPosition(state.x + sailOffset[0], boardY + sailOffset[1], state.z + sailOffset[2]);
            sail.setRotation(sailEuler[0], sailEuler[1], sailEuler[2]);
          }
          for (const [side, ox] of [["l", -0.62], ["r", 0.62]] as const) {
            const t = node(`thruster-${side}`);
            if (inked) {
              // jade strips: flush under the deck, aligned with the board, stretching a little with speed
              const thrOff = mat3TransformVec(skiffMat, [ox * 0.55, -0.24, 0]);
              t.setPosition(state.x + thrOff[0], boardY + thrOff[1], state.z + thrOff[2]);
              t.setRotation(skiffEuler[0], skiffEuler[1], skiffEuler[2]);
              t.setScale([1, 1, 1 + Math.min(0.5, Math.abs(flight.speed) * 0.008)]);
              continue;
            }
            t.setPosition(state.x + ox * cy + 0.2 * sy, boardY - 0.85, state.z - ox * sy + 0.2 * cy);
            t.setScale([1, 0.8 + (options.reducedMotion ? 0 : 0.25 * Math.sin(time * 24 + ox * 5)) + Math.min(0.8, Math.abs(flight.speed) * 0.012), 1]);
          }
          node("sky").setPosition(state.x, state.y, state.z);
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
            const altFrac = boardAlt < 8 ? 1 - boardAlt / 8 : 0;
            const wakeK = isOverCanal ? 0 : speedFrac * altFrac;
            const px = state.x - fx * 2.1, py = floorUnder + 0.42, pz = state.z - fz * 2.1;
            const refEye = lastEye?.eye;
            const nearCamera = refEye ? Math.hypot(px - refEye[0], py - refEye[1], pz - refEye[2]) < 5.4 : false;
            if (wakeK > 0.08 && !nearCamera) {
              plume.setPosition(px, py, pz);
              plume.setScale(0.48 + wakeK * 0.62);
              plumeSheet.setPosition(state.x - fx * 2.5, floorUnder + 0.32, state.z - fz * 2.5);
              plumeSheet.setRotation(0, state.yaw, 0);
              plumeSheet.setScale(0.52 + wakeK * 0.6);
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
          if (oneShot > 0) oneShot = Math.max(0, oneShot - dt);
          else if (sim.state.hold > 0 || Math.abs(flight.speed) > 6) playClip("walk");
          else playClip("idle");
          // Stateless per-frame procedural desert wind-surfer articulation (`"ZYX"` Euler computed fresh from sim state & time)
          if (surferParts && options.animate !== false) {
            const motion = options.reducedMotion ? 0.35 : 1;
            const air01 = Math.max(0, Math.min(1, (boardAlt - 1.2) / 9));
            const landingCompress = Math.max(0, Math.min(1, -flight.vertical * 0.04));
            const crouch = (flight.boosting ? 0.38 : 0.08) + landingCompress * 0.32 + speed01 * 0.1;
            const leanFwd = 0.08 + (flight.boosting ? 0.16 : 0) + speed01 * 0.1 - pitch * 0.2;
            const carve = Math.max(-0.65, Math.min(0.65, flight.bank));
            const celebrate = oneShot > 0 ? Math.sin((oneShot / 0.9) * Math.PI) * motion : 0;
            const breathe = Math.sin(time * 2.6) * 0.02 * motion;
            const armBalanceWave = Math.sin(time * (3.1 + speed01 * 2.6)) * (0.028 + speed01 * 0.032) * motion;

            const pelvisRx = -leanFwd * 0.09;
            const pelvisRy = -carve * 0.1;
            const pelvisRz = -carve * 0.06;
            surferParts.pelvis.setPosition(
              SURFER_PELVIS_REST[0] + carve * 0.024,
              SURFER_PELVIS_REST[1] - crouch * 0.042,
              SURFER_PELVIS_REST[2] - leanFwd * 0.016
            );
            const pelvisEuler = mat3ToEulerZYX(mat3Mul(mat3RotZ(pelvisRz), mat3Mul(mat3RotX(pelvisRx), mat3RotY(pelvisRy))));
            surferParts.pelvis.setRotation(pelvisEuler[0], pelvisEuler[1], pelvisEuler[2]);

            const torsoRx = -leanFwd * 0.18 + breathe;
            const torsoRy = SURF_STANCE_YAW - carve * 0.14 + celebrate * 0.1;
            const torsoRz = -carve * 0.1;
            const torsoEuler = mat3ToEulerZYX(mat3Mul(mat3RotZ(torsoRz), mat3Mul(mat3RotX(torsoRx), mat3RotY(torsoRy))));
            surferParts.torso.setRotation(torsoEuler[0], torsoEuler[1], torsoEuler[2]);

            const headEuler = mat3ToEulerZYX(
              mat3Mul(
                mat3RotY(-SURF_STANCE_YAW - carve * 0.32),
                mat3Mul(mat3RotX(-(pelvisRx + torsoRx) * 0.78 + air01 * 0.05 - breathe * 0.4), mat3RotZ(carve * 0.1))
              )
            );
            surferParts.head.setRotation(headEuler[0], headEuler[1], headEuler[2]);

            // Expressive wind-surfer balance arms: open slightly in air and counter-sweep into dune carves
            const leadArmEuler = mat3ToEulerZYX(
              mat3Mul(
                mat3RotZ(-0.04 - air01 * 0.12 + carve * 0.14 - celebrate * 0.18),
                mat3RotX(-leanFwd * 0.24 + carve * 0.08 + armBalanceWave)
              )
            );
            surferParts.armLead.setRotation(leadArmEuler[0], leadArmEuler[1], leadArmEuler[2]);

            const trailArmEuler = mat3ToEulerZYX(
              mat3Mul(
                mat3RotZ(0.05 + air01 * 0.16 + carve * 0.16 + celebrate * 0.22),
                mat3RotX(leanFwd * 0.14 - carve * 0.1 - armBalanceWave * 0.9)
              )
            );
            surferParts.armTrail.setRotation(trailArmEuler[0], trailArmEuler[1], trailArmEuler[2]);

            const scarfWave1 = Math.sin(time * (6.4 + speed01 * 7.2)) * (0.07 + speed01 * 0.13) * motion;
            const scarfWave2 = Math.sin(time * (8.2 + speed01 * 8.8) - 1.15) * (0.11 + speed01 * 0.18) * motion;
            const scarfFlutter = Math.cos(time * (5.3 + speed01 * 5.8) + 0.6) * (0.05 + speed01 * 0.09) * motion;
            const scarfEuler = mat3ToEulerZYX(
              mat3Mul(
                mat3RotY(-SURF_STANCE_YAW + scarfWave1 - carve * 0.26),
                mat3Mul(mat3RotX(0.08 + speed01 * 0.26 + leanFwd * 0.16 + scarfFlutter * 0.5), mat3RotZ(scarfFlutter))
              )
            );
            surferParts.scarf.setRotation(scarfEuler[0], scarfEuler[1], scarfEuler[2]);
            const scarfTipEuler = mat3ToEulerZYX(mat3Mul(mat3RotY(scarfWave2), mat3RotX(0.05 + scarfFlutter * 0.85)));
            surferParts.scarfTip.setRotation(scarfTipEuler[0], scarfTipEuler[1], scarfTipEuler[2]);
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
          if (!init || cut) clearance.reset();
          const eye = options.clearCamera === false ? wantedChaseEye(sim, framing) : clearChaseEye(sim, clearance, dt, scenery, framing);
          const [tx, ty, tz] = chaseTargetForEye(sim, eye, framing);
          if (!init || cut) { lookX = tx; lookY = ty; lookZ = tz; init = true; }
          const k = 1 - Math.exp(-dt * (inked ? 16 : 5));
          lookX += (tx - lookX) * k; lookY += (ty - lookY) * k; lookZ += (tz - lookZ) * k;
          // Bound lateral/vertical look lag during sharp turns so the courier & hover-skiff never slide off the viewport edge
          [lookX, lookY, lookZ] = limitLookLag([lookX, lookY, lookZ], [tx, ty, tz], inked ? 1.6 : framing.lookAhead * 0.75);
          let kick = flight.boosting && !options.reducedMotion ? 6 : 0;
          let up: [number, number, number] = [0, 1, 0];
          if (inked) {
            // DG-C2: boost FOV kick +8 deg eased at no more than 2 deg per frame; gentle roll <= 4.4 deg (~0.0768 rad <= 0.08 rad);
            // both 0 on reduced motion (PRD §6.3)
            const want = fovKickTarget(flight.boosting, punchLeft, !!options.reducedMotion);
            punchLeft = Math.max(0, punchLeft - dt);
            fovKick += Math.max(-2, Math.min(2, (want - fovKick) * Math.min(1, dt * 6)));
            if (cut) fovKick = want;
            kick = fovKick;
            const wantRoll = options.reducedMotion ? 0 : cameraRoll(flight.bank);
            roll += (wantRoll - roll) * Math.min(1, dt * 8);
            if (cut) roll = wantRoll;
            const totalRoll = Math.max(-0.08, Math.min(0.08, roll + feelStep.shakeRoll));
            const vdx = lookX - eye[0], vdz = lookZ - eye[2];
            const vdLen = Math.hypot(vdx, vdz);
            const rfx = vdLen > 1e-3 ? vdx / vdLen : fx0(state.yaw);
            const rfz = vdLen > 1e-3 ? vdz / vdLen : fz0(state.yaw);
            up = rolledUp(rfx, rfz, totalRoll);
            kick = fovKick + feelStep.fovDeltaDeg;
          }
          lastEye = { eye, blocked: getBlockedFn(sim.world)(eye[0], eye[1], eye[2]) };
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
        chasePose: () => (lastGoodPose ? { position: [...lastGoodPose.position], target: [...lastGoodPose.target], up: [...lastGoodPose.up], fov: lastGoodPose.fov } : null),
        sceneryColumns: () => scenery,
        riderAnimation: () => animation,
        resetFx() {
          siltFx?.reset();
          rippleLeft = 0;
          punchLeft = 0;
          shakeLeft = 0;
          impactRig.reset();
        }
      };
    }
  };
}
