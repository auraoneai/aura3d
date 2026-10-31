/**
 * Silt & Signal on Aura3D: the rendered world for one chapter, built on the public engine surface.
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
import { chaseEyeBlocked, clearChaseEye, createChaseClearance, sceneryColumns, wantedChaseEye } from "./camera";
import { gateOpen, objectiveOf, type Sim } from "./sim";
import { RING_FRAGMENT, RING_VERTEX, SKY_FRAGMENT, SKY_INK_FRAGMENT, SKY_VERTEX, WATER_FRAGMENT, WATER_VERTEX } from "./shaders";
import { createSiltFx, type SiltFx } from "./fx";
import { createLightning } from "./storm";
import { dressingFor } from "./dressing";
import { DECAL_OPACITY, decalMesh, decalPlan } from "./decals";
import { SILT_PALETTE, chapterHdri, chapterLook, keyDirection, linearOf, type SiltLookMode } from "./art/look";
import { buildArchitecture, farDuneRings, farDunes, orchardTerrainColors, terrainColors, type ColoredMesh } from "./architecture";
import { createTerrain, usesOriginalTerrain, type Column, type MeshData, type Placement, type Terrain } from "./terrain";

type Scene = ReturnType<typeof scene>;
export type Rgb = readonly [number, number, number];
export type CustomSpec = Parameters<typeof material.custom>[0];

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** 0xRRGGBB (sRGB) to a linear triple, the working space three.js uses for `Color(hex)`. */
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
      inkSky: { type: "color3", value: linearOf(row.sky.horizon) }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
};

export const ringSpec = (active: boolean, color: Rgb = [1, 0.82, 0.42]): CustomSpec => ({
  glsl: { vertex: RING_VERTEX, fragment: RING_FRAGMENT },
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
  const pcss = look.pcss && !options.low;
  builder.add(lights.directional({
    name: "silt key",
    position: [dir[0] * 240, dir[1] * 240, dir[2] * 240],
    target: [0, 0, 0],
    intensity: look.key.intensity,
    color: look.key.color,
    shadow: { mapSize: options.shadowMapSize ?? 4096, cascades: options.low ? 1 : 3, maxDistance: 360, bias: -0.0004, ...(pcss ? { filter: "pcss" as const, lightSize: 2.5 } : {}) }
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
  // DG-S4: god rays from the low sun (ch0) and moon shafts through the roots (ch2) only, never on Low. With
  // A3D_QR_VFX_FOG on, forward fog stays the height fog above; this node only feeds the S4 shaft pass, which marches
  // toward the strongest directional (the key). The engine also drops S4 below Medium. +0 draws, one post stage.
  if (look.godRays && !options.low) {
    builder.add(effects.volumetricFog({ name: "silt god rays", color: look.key.color, density: look.fog.density, intensity: look.night ? 0.35 : 0.5, godRayDensity: GOD_RAY_DENSITY }));
  }
  // DG-L5: screen-space contact shadows under the board, rider and props in every inked chapter (not on Low)
  if (!options.low) builder.add(effects.contactShadows({ intensity: 0.7, length: 0.3 }));
  builder.add(effects.bloom({ intensity: look.bloom.intensity, threshold: look.bloom.threshold }));
  // exposure lives on the output (ACES, main.ts); the grade keeps 1 so the two never stack
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
const NO_BEACON = typeof location !== "undefined" && new URLSearchParams(location.search).has("nobeacon");
/** hoverboard.glb is 1.9 m long (x axis) and 0.37 m thick, origin at its centre; the rider's feet stand on its deck top */
const BOARD_SCALE = 1.15;
const BOARD_DROP = 1.25;
const DECK_TOP = 0.18 * BOARD_SCALE;
const BOARD_YAW = Math.PI / 2;
const RIDER_HEIGHT = 2.1;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);
const dynamicFrom = (m: MeshData | ColoredMesh) => geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices), ...("colors" in m ? { colors: f32(m.colors) } : {}) });

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
    .camera(camera.perspective({ position: [0, 14, 60], target: [0, 8, 0], fov: 62, near: 0.3, far: 2700 }));
  if (inked) addInkedRig(builder, chapter, buildOptions);
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
  builder.add(primitives.sphere({ name: "sky", position: [0, 0, 0], size: 4200, material: material.custom(skySpec(chapter, inked ? "inked" : "original")) }).runtime({ id: "sky" }));

  const orchard = inked && look.ground === "orchard";
  builder.add(geometry.custom(dynamicFrom({ ...terrainMesh, colors: orchard ? orchardTerrainColors(terrainMesh.positions) : terrainColors(terrainMesh.positions, inked) }), {
    name: "terrain",
    receiveShadow: true,
    // GU47 DG-M1 (interim): the inked look trades the grass set for the gravel-sand ground set under warm sand vertex
    // colours; the WP-36 rippled sand, scrub and sandstone sets replace it (asset need in the lane report)
    // phase 3: the storm chapter's orchard keeps the grass set under rain-green and gold vertex colours (storm light)
    material: orchard
      ? pbr({ color: "#e4ead2", texture: assets.grassColor, normal: assets.grassNormal, roughnessMap: assets.grassRough, normalScale: 0.9, roughness: 0.92 })
      : inked
      ? pbr({ color: look.night ? "#b7a48a" : "#f0dcc0", texture: assets.groundColor, normal: assets.groundNormal, roughnessMap: assets.groundRough, normalScale: 0.6, roughness: 1 })
      : pbr({ color: grassTint, texture: assets.grassColor, normal: assets.grassNormal, roughnessMap: assets.grassRough, normalScale: 0.9, roughness: 1 })
  }).runtime({ id: "terrain" }));
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
  if (bank.indices.length) {
    builder.add(geometry.custom(dynamicFrom(bank), {
      name: "bank",
      receiveShadow: true,
      material: pbr({ color: "#d9c8aa", texture: assets.groundColor, normal: assets.groundNormal, roughnessMap: assets.groundRough, roughness: 1 })
    }).runtime({ id: "bank" }));
  }
  builder.add(geometry.custom(dynamicFrom(terrain.waterMesh()), { name: "canal", material: material.custom(waterSpec(chapter, inked ? "inked" : "original")) }).runtime({ id: "canal" }));
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
    { name: "cliffs", mesh: arch.cliff, cast: true, spec: pbr({ color: white, texture: assets.rockColor, normal: assets.rockNormal, roughnessMap: assets.rockRough, roughness: 1 }) },
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

  // GU47 DG-W1 (inked look): seeded column drums and broken ruins off the ring route, two instanced nodes (+2 draws)
  if (inked) {
    const dressing = dressingFor(chapter, terrain, props.walls);
    const drums = dressing.filter((d) => d.kind === "drum"), ruins = dressing.filter((d) => d.kind === "ruin");
    // pillar.glb is 1.9 m tall with its origin at the centre: squat drums, sunk a little
    if (drums.length) builder.add(instances.model(assets.pillar, { name: "dressing-drums", castShadow: true, receiveShadow: true, transforms: drums.map((d) => ({ position: [d.x, d.y + 0.35 * d.scale, d.z] as [number, number, number], rotation: [0, d.yaw, 0] as [number, number, number], scale: [d.scale, d.scale * 0.45, d.scale] as [number, number, number] })) }));
    if (ruins.length) builder.add(instances.model(assets.canyonrocks, { name: "dressing-ruins", castShadow: false, receiveShadow: true, transforms: ruins.map((d) => ({ position: [d.x, d.y + 0.3 * d.scale, d.z] as [number, number, number], rotation: [0, d.yaw, 0] as [number, number, number], scale: [d.scale, d.scale * 0.7, d.scale] as [number, number, number] })) }));
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
  // GU47 DG-AN2 (part): E-G instance wind on today's trees in the inked look (reduced motion keeps 30% sway); the WP-36
  // palms and tamarisk take the same option when admitted. Same draw, wind variant of its program.
  if (props.trees.length) builder.add(instances.model(assets.tree, { name: "trees", transforms: placements(props.trees), castShadow: true, receiveShadow: true, ...(inked ? { wind: treeWind(!!buildOptions.reducedMotion) } : {}) }));
  // boulders: Meshy canyon-rock cluster (1.9 m wide, origin at its centre), sunk slightly so it sits on the ground
  if (props.rocks.length) {
    builder.add(instances.model(assets.canyonrocks, {
      name: "rocks",
      castShadow: false,
      receiveShadow: true,
      transforms: [...props.rocks].sort((a, b) => b.scale - a.scale).slice(0, 48).map((p) => {
        const s = (p.scale * 1.15) / 1.9;
        return { position: [p.x, p.y + 0.38 * s, p.z] as [number, number, number], rotation: [0, p.yaw, 0] as [number, number, number], scale: [s, s * 0.8, s] as [number, number, number] };
      })
    }));
  }
  if (props.rocks.length > 48) {
    const rest = [...props.rocks].sort((a, b) => b.scale - a.scale).slice(48);
    builder.add(instances.polyhedron({
      name: "rocks-small",
      size: [1, 1, 1],
      castShadow: false,
      receiveShadow: true,
      material: pbr({ color: "#b3aea6", texture: assets.rockColor, normal: assets.rockNormal, roughnessMap: assets.rockRough, roughness: 1 }),
      transforms: rest.map((p) => ({
        position: [p.x, p.y + 0.28 * p.scale, p.z] as [number, number, number],
        rotation: [0, p.yaw, 0] as [number, number, number],
        scale: [p.scale, p.scale * 0.62, p.scale * 0.85] as [number, number, number]
      }))
    }));
  }
  if (props.houses.length) builder.add(instances.model(assets.house, { name: "houses", transforms: placements(props.houses, { x: 0, y: 0, z: -0.064 }), castShadow: true, receiveShadow: true }));
  // lamp.glb keeps its source offset: centre (2.038, 0, 7), height -0.3..0.3
  if (props.lamps.length) {
    builder.add(instances.model(assets.lantern, {
      name: "lamps",
      // every lamp the sim collides with is drawn (one instanced node)
      transforms: props.lamps.map((p) => {
        const s = Math.max(2.2, p.scale);
        return { position: [p.x, p.y + 0.95 * s, p.z] as [number, number, number], rotation: [0, p.yaw, 0] as [number, number, number], scale: s };
      }),
      castShadow: false
    }));
  }
  if (props.stone.length) {
    builder.add(instances.cylinder({
      name: "piers",
      size: [1, 1, 1],
      transforms: columnTransforms(props.stone),
      castShadow: true,
      receiveShadow: true,
      material: pbr({ color: "#f0e3c9", texture: assets.bricksColor, normal: assets.bricksNormal, roughnessMap: assets.bricksRough, roughness: 1, texTransforms: { baseColor: { scale: [3, 12] }, normal: { scale: [3, 12] }, metallicRoughness: { scale: [3, 12] } } })
    }));
  }
  if (props.brass.length) {
    builder.add(instances.cylinder({
      name: "masts",
      size: [1, 1, 1],
      transforms: columnTransforms(props.brass),
      castShadow: true,
      // GU47 DG-M4 (inked): brushed bronze, every mast with its own seeded verdigris tint (low-saturation grey-green, so
      // jade stays the signal's alone); same 1 draw. `?look=original` keeps the polished brass.
      ...(inked ? { colors: props.brass.map((_, i) => mastTint(i)) } : {}),
      material: inked
        ? pbr({ color: MAST_BRONZE.color, roughness: MAST_BRONZE.roughness, metallic: MAST_BRONZE.metallic, envMapIntensity: 0.9 })
        : pbr({ color: "#b99455", roughness: 0.38, metallic: 0.85, envMapIntensity: 1.1 })
    }));
  }

  // Waiting rings are Meshy stone rings with ember runes (lit PBR, no blending), drawn as one instanced pool of MAX_RINGS; the
  // active ring is the bright emissive beacon below.
  builder.add(instances.model(assets.ringclean, { name: "rings", transforms: Array.from({ length: MAX_RINGS }, () => PARKED), castShadow: false }).runtime({ id: "rings" }));
  // Active-ring beacon: the library objective marker (dark-teal ring body, cyan rim, expanding halo, light column), sized to the 66 m rings.
  // GU47 DG-M4/H1: the inked look reserves jade for the signal (no #19e6ff cyan); `?look=original` keeps the library colours
  builder.addMany(prefabs.objectiveMarker({ id: "beacon", diameter: 66, hiddenPosition: [...FAR], ...(inked ? SIGNAL_JADE : {}) }));
  // The same marker in red, shown instead while a timed gate is shut.
  builder.addMany(prefabs.objectiveMarker({ id: "gate", diameter: 66, hiddenPosition: [...FAR], ...GATE_SHUT }));
  // The shell a tow objective drags behind the board (parked until the rider latches on).
  builder.add(primitives.sphere({ name: "tow-shell", position: [...FAR], size: [3.2, 1.9, 3.2], castShadow: true, material: pbr({ color: "#e6d3ad", roughness: 0.55 }) }).runtime({ id: "tow-shell" }));
  builder.add(primitives.sphere({ name: "tow-glow", position: [...FAR], size: [1.1, 0.5, 1.1], material: material.emissive({ color: "#ffd38a", emissiveIntensity: 2.2 }) }).runtime({ id: "tow-glow" }));

  for (const side of ["l", "r"]) {
    // GU47 DG-A3 (part): the inked look swaps the two cyan thruster spheres for flat jade strips under the deck (same 2 draws)
    builder.add((inked
      ? primitives.box({ name: `thruster-${side}`, position: [0, 4, 0], size: [0.12, 0.05, 1.5], material: material.emissive({ color: SILT_PALETTE.jade, emissiveIntensity: 2.4 }) })
      : primitives.sphere({ name: `thruster-${side}`, position: [0, 4, 0], size: [0.34, 1.1, 0.34], material: material.emissive({ color: "#38d6ff", emissiveIntensity: 3 }) })
    ).runtime({ id: `thruster-${side}` }));
  }
  builder.add(model(assets.hoverboard, { name: "board", position: [0, 4, 0], scale: BOARD_SCALE, castShadow: true }).runtime({ id: "board" }));
  builder.add(model(assets.courier, { name: "rider", position: [0, 4, 0], targetHeight: RIDER_HEIGHT, castShadow: true }).runtime({ id: "rider" }));

  if (usesOriginalTerrain(chapter) && chapter === 0) {
    const ground = (x: number, z: number): number => Math.max(0, terrain.heightAt(x, z));
    const landmark = (asset: Parameters<typeof model>[0], name: string, x: number, z: number, scale: number, yaw: number, lift: number): void => {
      builder.add(model(asset, { name, position: [x, ground(x, z) + lift * scale, z], rotation: [0, yaw, 0], scale, castShadow: false, receiveShadow: true }));
    };
    landmark(assets.gatehouse, "gatehouse-neri", -34, -262, 15, 0.35, 0.7);
    landmark(assets.aqueduct, "aqueduct-east", 150, -520, 34, Math.PI / 2, 0.62);
    landmark(assets.aqueduct, "aqueduct-west", -170, -720, 34, Math.PI / 2, 0.62);
    landmark(assets.ringgate, "canyon-gate", 0, -1295, 30, 0, 0.62);
    for (const [i, [x, z, yaw]] of ([[85, -12, 0.4], [172, -42, -0.5]] as const).entries()) {
      builder.add(model(assets.stall, { name: `stall-${i}`, position: [x, ground(x, z) + 0.72 * 5, z], rotation: [0, yaw, 0], scale: 5, castShadow: false, receiveShadow: true }));
    }
    for (const [i, [x, z, yaw]] of ([[-120, -640, 0.5], [135, -870, -0.8]] as const).entries()) {
      builder.add(model(assets.watchtower, { name: `watchtower-${i}`, position: [x, ground(x, z) + 0.95 * 15, z], rotation: [0, yaw, 0], scale: 15, castShadow: false, receiveShadow: true }));
    }
    let banners = 0;
    for (const objective of ch.objectives) {
      objective.points.forEach((pt, i) => {
        if (i % 2 !== 0 || banners >= 8) return;
        const side = banners % 2 === 0 ? 1 : -1;
        const x = pt.x + side * 42, z = pt.z;
        builder.add(model(assets.banner, { name: `banner-${banners}`, position: [x, ground(x, z) + 0.95 * 11, z], rotation: [0, side * 0.6, 0], scale: 11, castShadow: false }));
        banners += 1;
      });
    }
    for (const [i, [x, z, s]] of ([[-85, -930, 24], [92, -980, 28], [-110, -1060, 26], [105, -1120, 22], [-78, -1180, 30], [88, -1230, 25]] as const).entries()) {
      builder.add(model(assets.pillar, { name: `pillar-${i}`, position: [x, ground(x, z) + 0.9 * s, z], rotation: [0, i * 1.7, 0], scale: s, castShadow: false, receiveShadow: true }));
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
      let lastPoint = -1, lastObjective = -1;
      let ringsKey = "";
      let shakeLeft = 0, shakeStrength = 0;
      let towX: number = FAR[0], towY: number = FAR[1], towZ: number = FAR[2], towing = false;
      // GU47 inked look: runtime VFX (wake, ribbons, signal, impact, motes) and the C2 camera feel (eased FOV kick, roll)
      const siltFx: SiltFx | undefined = inked
        ? createSiltFx(app.effects, { chapter, reducedMotion: options.reducedMotion, low: buildOptions.low, trailNodes: ["thruster-l", "thruster-r"], motesNode: "rider" })
        : undefined;
      let fovKick = 0, roll = 0, punchLeft = 0;
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
          if (options.reducedMotion) return;
          shakeStrength = Math.min(1, Math.max(shakeStrength * (shakeLeft > 0 ? 1 : 0), strength));
          shakeLeft = SHAKE_SECONDS;
        },
        update(sim, dt, time, aspect, cut = false) {
          const { state, flight } = sim;
          const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
          const pitch = Math.max(-0.35, Math.min(0.35, -flight.vertical * 0.012));
          const rider = node("rider"), board = node("board");
          board.setPosition(state.x, state.y - BOARD_DROP, state.z);
          board.setRotation(pitch, state.yaw + BOARD_YAW, flight.bank);
          rider.setPosition(state.x, state.y - BOARD_DROP + DECK_TOP, state.z);
          rider.setRotation(pitch, state.yaw + Math.PI, flight.bank);
          const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
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
          node("canal").setUniform?.("siltTime", time);
          if (lightning) {
            const { flash, began } = lightning.step(time);
            for (const strike of began) { strikes++; options.onThunder?.(strike.thunderDelay, strike.peak); }
            if (flash !== flashShown) {
              flashShown = flash;
              node("sky").setUniform?.("skyFlash", flash);
              node("silt-key").setLight?.({ intensity: look.key.intensity * (1 + LIGHTNING_KEY_BOOST * flash) });
            }
          }

          lastRider = [state.x, state.y, state.z];
          applyPost(sequencePost({ boosting: flight.boosting, sequence, reducedMotion: !!options.reducedMotion }));
          if (siltFx) {
            const ground = Math.max(sim.world.floor(state.x, state.z, state.y), overCanal(chapter, state.x, state.z) ? 0 : -Infinity);
            siltFx.update({ position: [state.x, state.y - BOARD_DROP, state.z], forward: [fx0(state.yaw), fz0(state.yaw)], speed: flight.speed, altitude: state.y - BOARD_DROP - ground, overCanal: overCanal(chapter, state.x, state.z) }, dt);
          }
          if (state.point !== lastPoint || state.objective !== lastObjective) {
            if (siltFx && lastPoint >= 0 && state.objective === lastObjective && state.point > lastPoint) {
              const passed = objectiveOf(state).points[lastPoint];
              if (passed) siltFx.ringPassed([passed.x, passed.y, passed.z]);
              punchLeft = RING_PUNCH.seconds;
            }
            if (lastPoint >= 0 && (state.point > lastPoint || state.objective !== lastObjective)) { oneShot = 0.9; playClip("walk"); }
            lastPoint = state.point; lastObjective = state.objective;
          }
          if (oneShot > 0) oneShot -= dt;
          else if (sim.state.hold > 0) playClip("walk");
          else playClip("idle");
          controller?.update(dt);

          const o = objectiveOf(state);
          const active = o.points[state.point];
          const target = !active || state.scene || state.completed || NO_BEACON ? null : [active.x, active.y, active.z] as [number, number, number];
          // timed gates: the cyan beacon while open, the red one while shut
          const shut = target !== null && o.kind === "timed" && !gateOpen(sim.time, o);
          const open = prefabs.objectiveMarkerPoses(shut ? null : target, time, { diameter: 66, hiddenPosition: [...FAR] });
          const closed = prefabs.objectiveMarkerPoses(shut ? target : null, time, { diameter: 66, hiddenPosition: [...FAR] });
          for (const part of ["ring", "rim", "halo", "beam"] as const) {
            for (const [id, poses] of [["beacon", open], ["gate", closed]] as const) {
              const h = node(`${id}-${part}`);
              h.setPosition(...poses[part]!.position);
              h.setScale([...poses[part]!.scale]);
            }
          }
          // waiting rings: rewrite the instanced pool only when the set of waiting rings changes
          const waiting = state.scene || state.completed ? [] : o.points.slice(state.point + 1, MAX_RINGS);
          const key = `${state.chapter}:${state.objective}:${state.point}:${waiting.length}`;
          if (key !== ringsKey) {
            ringsKey = key;
            node("rings").setInstances(Array.from({ length: MAX_RINGS }, (_, i) => {
              const p = waiting[i];
              return p ? { position: [p.x, p.y, p.z] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 38 } : PARKED;
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
          const tx = state.x + fx * 14, ty = state.y + 1.2, tz = state.z + fz * 14;
          if (!init || cut) { lookX = tx; lookY = ty; lookZ = tz; init = true; clearance.reset(); }
          const k = 1 - Math.exp(-dt * 5);
          lookX += (tx - lookX) * k; lookY += (ty - lookY) * k; lookZ += (tz - lookZ) * k;
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
            up = rolledUp(fx0(state.yaw), fz0(state.yaw), roll);
          }
          const eye = options.clearCamera === false ? wantedChaseEye(sim) : clearChaseEye(sim, clearance, dt, scenery);
          lastEye = { eye, blocked: chaseEyeBlocked(sim.world, scenery)(eye[0], eye[1], eye[2]) };
          let shown: [number, number, number] = [eye[0], eye[1], eye[2]];
          if (shakeLeft > 0) {
            shakeLeft = Math.max(0, shakeLeft - dt);
            const a = SHAKE_METRES * shakeStrength * (shakeLeft / SHAKE_SECONDS);
            shown = [eye[0] + a * Math.sin(time * 61), eye[1] + a * Math.sin(time * 47 + 1.3), eye[2] + a * Math.sin(time * 53 + 2.1)];
          }
          cameraController.setPose({ position: shown, target: [lookX, lookY, lookZ], up, fov: (aspect < 0.85 ? 78 : 62) + kick }, { cut });
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
