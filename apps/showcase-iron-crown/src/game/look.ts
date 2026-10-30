/**
 * IRON CROWN look table (GU47 WP-15 "The Royal Forge", PRD §3.2 item 2): one row per venue.
 *
 * Identity: a theatrical tournament fighter in black iron, molten gold and ember crimson, one accent per venue. Each row
 * owns its HDRI, time of day, key, fill, fog, post preset, grade, bloom and signature parameters, so no two stages share
 * a look (today three of them shared autumn_field at sun 48/35 and all six shared one post and light rig).
 *
 * Lighting contract (art direction `lighting`): one shadowed key per stage, fill from the environment only (no ambient
 * light, no fill light), at most four unshadowed practicals.
 * - Crown Arena: the key is one hard overhead follow-spot (PCSS) that tracks the pair; the look's sun is dropped.
 * - Outdoor venues: the look's sun is the key at its own elevation (Colosseum 72, Airstrip 10, Monastery 18, Dock 8 deg).
 * - Neo-Tokyo: a shadowed sodium flood key, magenta/cyan rect panels, fill through the env intensity only (IC47-L2).
 * - Every stage: two back rims behind the fighters in each fighter's own emissive colour (IC47-L1), and no look rim
 *   (the pink `arena-fight` rim is removed with `rim: false`).
 *
 * Pure data plus pure node builders: tests read the table without an app.
 */
import {
  lights,
  looks,
  type AuraColor,
  type AuraHdriId,
  type AuraLocalShadowOptions,
  type AuraLookId,
  type AuraLookOverrides,
  type AuraPostPresetId,
  type AuraSceneNode,
  type AuraVec3
} from "@aura3d/engine";
import type { StageId } from "./stages";

/** Core palette (PRD §6.1 G05): black iron, molten gold, ember crimson. */
export const BLACK_IRON = "#0e0b0d";
export const MOLTEN_GOLD = "#d9a441";
export const EMBER_CRIMSON = "#9e1b22";
export const CORE_PALETTE = [BLACK_IRON, MOLTEN_GOLD, EMBER_CRIMSON] as const;

/** Letterbox bar height (fraction of the viewport, each bar) for the intro, K.O. and win cinematics (signature). */
export const LETTERBOX_BAR = 0.11;

export interface SunKey {
  readonly kind: "sun";
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly color: AuraColor;
  readonly intensity: number;
  readonly filter: "pcf" | "pcss";
}

/** The Crown's key: one spot from the rig above the ring, aimed at the pair's midpoint every frame. */
export interface FollowSpotKey {
  readonly kind: "follow-spot";
  readonly height: number;
  /** Metres toward the camera from the fight plane (the rig hangs slightly in front of the pair). */
  readonly forward: number;
  readonly color: AuraColor;
  readonly intensity: number;
  readonly angle: number;
  readonly penumbra: number;
  readonly distance: number;
  readonly decay: number;
  readonly shadow: AuraLocalShadowOptions;
}

export interface BackRim {
  readonly intensity: number;
  readonly height: number;
  /** Metres behind the fight plane. */
  readonly behind: number;
  readonly angle: number;
  readonly penumbra: number;
  readonly distance: number;
}

export interface RectPanel {
  readonly name: string;
  readonly color: AuraColor;
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly width: number;
  readonly height: number;
  readonly intensity: number;
}

/** A visible light shaft (light cone through smoke or dust). */
export interface LightShaft {
  readonly name: string;
  readonly position: AuraVec3;
  readonly direction: AuraVec3;
  readonly color: AuraColor;
  readonly intensity: number;
  readonly length: number;
  readonly coneAngle: number;
}

/** Hero floor finish (IC47-M1): the deck's base, plank, inlay and reflection parameters. */
export interface FloorFinish {
  readonly name: string;
  readonly base: AuraColor;
  readonly plank: AuraColor;
  readonly roughness: number;
  readonly metallic: number;
  readonly clearcoat: number;
  readonly inlay: AuraColor;
  readonly inlayGlow: number;
  /** Screen-space reflections at High and above (the mirror floor). */
  readonly mirror: boolean;
}

export interface StageLookRow {
  readonly stage: StageId;
  readonly timeOfDay: string;
  /** Look preset; its declared post preset must equal `post` (tests/unit/iron-crown/look.test.ts). */
  readonly look: AuraLookId;
  readonly post: AuraPostPresetId;
  readonly hdri: AuraHdriId;
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  /** "look": the HDRI is the visible sky; a colour: an enclosed venue (the HDRI lights, it is not drawn). */
  readonly background: "look" | AuraColor;
  /** The venue's one accent. */
  readonly accent: AuraColor;
  readonly key: SunKey | FollowSpotKey;
  readonly backRim: BackRim;
  readonly panels: readonly RectPanel[];
  readonly fog: { readonly color: AuraColor; readonly near: number; readonly far: number };
  readonly fogDensityScale: number;
  readonly exposureEv: number;
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly knee: number; readonly scatter: number };
  readonly vignette: number;
  /** Film grain intensity, 0 = none (grain is the Crown's alone). */
  readonly grain: number;
  readonly weather?: { readonly type: "rain" | "snow"; readonly streakLimit: number };
  readonly shafts: readonly LightShaft[];
  readonly floor: FloorFinish;
}

const RIM: BackRim = { intensity: 16, height: 3.3, behind: 2.6, angle: 0.42, penumbra: 0.65, distance: 9 };

export const STAGE_LOOKS: Readonly<Record<StageId, StageLookRow>> = {
  "crown-arena": {
    stage: "crown-arena",
    timeOfDay: "forge-smoke night (enclosed)",
    look: "arena-fight",
    post: "arena-fight",
    hdri: "warm_bar",
    environmentIntensity: 0.25,
    environmentRotationDeg: 0,
    background: BLACK_IRON,
    accent: "#ff4d1f",
    key: {
      kind: "follow-spot",
      height: 7.4,
      forward: 0.6,
      color: "#ffe2b8",
      intensity: 44,
      angle: 0.37,
      penumbra: 0.32,
      distance: 16,
      decay: 1.3,
      shadow: { filter: "pcss", mapSize: 2048, lightSize: 0.32, softness: 0.55, bias: -0.0004, normalBias: 0.02 }
    },
    backRim: { ...RIM, intensity: 18 },
    panels: [],
    fog: { color: "#140b0c", near: 7, far: 36 },
    fogDensityScale: 1,
    exposureEv: 0,
    grade: { contrast: 1.22, saturation: 1.08, temperature: 0.12, tint: 0.02 },
    bloom: { intensity: 0.42, threshold: 1.1, knee: 0.5, scatter: 0.7 },
    vignette: 0.34,
    grain: 0.06,
    shafts: [
      { name: "crown follow-spot shaft", position: [0, 7.3, 0.6], direction: [0, -1, -0.08], color: "#ffd9a0", intensity: 0.34, length: 7.6, coneAngle: 0.36 },
      { name: "crown forge smoke shaft left", position: [-5.6, 6.2, -6.2], direction: [0.52, -0.62, 0.58], color: "#ff7a3a", intensity: 0.16, length: 8.5, coneAngle: 0.22 },
      { name: "crown forge smoke shaft right", position: [5.6, 6.2, -6.2], direction: [-0.52, -0.62, 0.58], color: "#ff7a3a", intensity: 0.16, length: 8.5, coneAngle: 0.22 }
    ],
    floor: { name: "obsidian with gold inlay", base: "#0b0809", plank: "#151012", roughness: 0.16, metallic: 0.3, clearcoat: 0.65, inlay: MOLTEN_GOLD, inlayGlow: 0.32, mirror: true }
  },
  "neo-tokyo-rooftop": {
    stage: "neo-tokyo-rooftop",
    timeOfDay: "midnight rain",
    look: "night-city",
    post: "neon-night",
    hdri: "rooftop_night",
    environmentIntensity: 0.72,
    environmentRotationDeg: 140,
    background: "look",
    accent: "#ff3fa4",
    key: { kind: "sun", elevationDeg: 52, azimuthDeg: 300, color: "#ffad5c", intensity: 2.6, filter: "pcf" },
    backRim: RIM,
    panels: [
      { name: "neo-tokyo magenta panel", color: "#ff3fa4", position: [-4.7, 2.6, -1.9], target: [-1.2, 1.1, 0], width: 1.1, height: 2.6, intensity: 7 },
      { name: "neo-tokyo cyan panel", color: "#3fe0ff", position: [4.7, 2.4, -1.9], target: [1.2, 1.1, 0], width: 1.1, height: 2.4, intensity: 6 }
    ],
    fog: { color: "#0b1020", near: 10, far: 64 },
    fogDensityScale: 1,
    exposureEv: 0.35,
    grade: { contrast: 1.12, saturation: 1.15, temperature: -0.12, tint: 0.06 },
    bloom: { intensity: 0.55, threshold: 0.95, knee: 0.55, scatter: 0.72 },
    vignette: 0.22,
    grain: 0,
    weather: { type: "rain", streakLimit: 90 },
    shafts: [
      { name: "neo-tokyo sodium flood shaft", position: [-5.2, 6.4, -3.4], direction: [0.55, -0.7, 0.45], color: "#ffad5c", intensity: 0.14, length: 9, coneAngle: 0.26 }
    ],
    floor: { name: "wet concrete", base: "#0d1016", plank: "#141822", roughness: 0.14, metallic: 0.08, clearcoat: 0.8, inlay: "#ff3fa4", inlayGlow: 0.28, mirror: true }
  },
  "bangkok-dock": {
    stage: "bangkok-dock",
    timeOfDay: "dusk over water",
    look: "golden-hour",
    post: "cinematic-film",
    hdri: "venice_sunset",
    environmentIntensity: 1,
    environmentRotationDeg: 205,
    background: "look",
    accent: "#36c9a4",
    key: { kind: "sun", elevationDeg: 8, azimuthDeg: 235, color: "#ff9a52", intensity: 3, filter: "pcf" },
    backRim: { ...RIM, intensity: 12 },
    panels: [],
    fog: { color: "#c47a4e", near: 18, far: 120 },
    fogDensityScale: 1,
    exposureEv: 0.05,
    grade: { contrast: 1.1, saturation: 1.12, temperature: 0.3, tint: -0.02 },
    bloom: { intensity: 0.38, threshold: 1.2, knee: 0.5, scatter: 0.68 },
    vignette: 0.2,
    grain: 0,
    shafts: [],
    floor: { name: "oiled teak deck", base: "#2a1a10", plank: "#3a2416", roughness: 0.38, metallic: 0.04, clearcoat: 0.35, inlay: "#36c9a4", inlayGlow: 0.22, mirror: false }
  },
  "colosseum-ruins": {
    stage: "colosseum-ruins",
    timeOfDay: "harsh-noon dust",
    look: "outdoor-day",
    post: "daylight-outdoor",
    // GU47(E-A): the WP names outdoor-midday-2k; the catalogue ships the 1k copy (2k handoff in the lane report).
    hdri: "outdoor-midday",
    environmentIntensity: 1,
    environmentRotationDeg: 60,
    background: "look",
    accent: "#e3b04b",
    key: { kind: "sun", elevationDeg: 72, azimuthDeg: 25, color: "#fff4dc", intensity: 4.2, filter: "pcf" },
    backRim: { ...RIM, intensity: 9 },
    panels: [],
    fog: { color: "#c9a46a", near: 8, far: 70 },
    fogDensityScale: 1,
    exposureEv: 0,
    grade: { contrast: 1.18, saturation: 0.92, temperature: 0.18, tint: 0 },
    bloom: { intensity: 0.2, threshold: 1.4, knee: 0.45, scatter: 0.6 },
    vignette: 0.16,
    grain: 0,
    shafts: [],
    floor: { name: "packed sand with grit", base: "#a88a5e", plank: "#9a7c52", roughness: 0.9, metallic: 0, clearcoat: 0, inlay: "#e3b04b", inlayGlow: 0.12, mirror: false }
  },
  "desert-airbase": {
    stage: "desert-airbase",
    timeOfDay: "sunset heat haze",
    look: "golden-hour",
    post: "cinematic-film",
    hdri: "industrial_sunset_puresky",
    environmentIntensity: 1,
    environmentRotationDeg: 285,
    background: "look",
    accent: "#3f8cff",
    key: { kind: "sun", elevationDeg: 10, azimuthDeg: 255, color: "#ff8a4a", intensity: 3.2, filter: "pcf" },
    backRim: { ...RIM, intensity: 12 },
    panels: [],
    fog: { color: "#b8724a", near: 15, far: 110 },
    fogDensityScale: 1,
    exposureEv: 0,
    grade: { contrast: 1.14, saturation: 1.06, temperature: 0.24, tint: 0 },
    bloom: { intensity: 0.34, threshold: 1.25, knee: 0.5, scatter: 0.66 },
    vignette: 0.2,
    grain: 0,
    shafts: [],
    floor: { name: "sun-baked tarmac", base: "#3a332c", plank: "#463d33", roughness: 0.78, metallic: 0.02, clearcoat: 0, inlay: "#ffd23f", inlayGlow: 0.14, mirror: false }
  },
  "himalayan-monastery": {
    stage: "himalayan-monastery",
    timeOfDay: "cold dawn snow",
    look: "alpine-snow",
    post: "daylight-outdoor",
    hdri: "spruit_sunrise",
    environmentIntensity: 1,
    environmentRotationDeg: 110,
    background: "look",
    accent: "#8fe3ff",
    key: { kind: "sun", elevationDeg: 18, azimuthDeg: 110, color: "#ffd2a6", intensity: 3, filter: "pcf" },
    backRim: { ...RIM, intensity: 10 },
    panels: [],
    fog: { color: "#b9c8d8", near: 14, far: 90 },
    fogDensityScale: 1,
    exposureEv: 0,
    grade: { contrast: 1.04, saturation: 0.9, temperature: -0.22, tint: 0 },
    bloom: { intensity: 0.26, threshold: 1.3, knee: 0.45, scatter: 0.62 },
    vignette: 0.18,
    grain: 0,
    weather: { type: "snow", streakLimit: 70 },
    shafts: [],
    floor: { name: "frosted slate", base: "#5d6873", plank: "#6c7884", roughness: 0.62, metallic: 0.04, clearcoat: 0.25, inlay: "#8fe3ff", inlayGlow: 0.16, mirror: false }
  }
};

/** Stage order of the venue select (index.html `#ic-venues`, boot stage last). */
export const STAGE_ORDER: readonly StageId[] = [
  "neo-tokyo-rooftop",
  "bangkok-dock",
  "colosseum-ruins",
  "desert-airbase",
  "himalayan-monastery",
  "crown-arena"
];

export function stageLook(id: StageId): StageLookRow {
  return STAGE_LOOKS[id];
}

/** The look override for a row (E-A keys): own HDRI, sun, key, no rim, fog, grade and bloom. */
export function stageLookOverrides(row: StageLookRow): AuraLookOverrides {
  const key = row.key;
  return {
    accent: row.accent,
    exposureEv: row.exposureEv,
    fogDensityScale: row.fogDensityScale,
    hdri: row.hdri,
    environmentIntensity: row.environmentIntensity,
    environmentRotationDeg: row.environmentRotationDeg,
    background: row.background,
    ...(key.kind === "sun"
      ? {
          sun: { elevationDeg: key.elevationDeg, azimuthDeg: key.azimuthDeg },
          key: { color: key.color, intensity: key.intensity, shadow: { filter: key.filter, mapSize: 2048 } }
        }
      : {}),
    rim: false,
    fog: row.fog,
    grade: row.grade,
    post: { bloom: row.bloom }
  };
}

/**
 * The look group for a row. On a follow-spot stage the look's sun is dropped: the follow-spot is the one shadowed key
 * and the warm_bar HDRI is the fill (a colour background keeps it undrawn).
 */
export function stageLookNode(row: StageLookRow): AuraSceneNode {
  const group = looks.preset(row.look, stageLookOverrides(row)).toJSON();
  if (row.key.kind === "sun") return group;
  return { ...group, children: group.children.filter((child) => !(child.kind === "light" && child.name === "look key light")) };
}

/** Runtime ids of the presentation lights main.ts moves every frame (E-B `setLight`). */
export const FOLLOW_SPOT_ID = "ic-follow-spot";
export const RIM_IDS = { p1: "ic-rim-p1", p2: "ic-rim-p2" } as const;

export interface SpotPose {
  readonly position: AuraVec3;
  readonly target: AuraVec3;
}

/** Follow-spot pose for the pair's midpoint (x only; the fight plane is z = 0). */
export function followSpotPose(key: FollowSpotKey, midX: number): SpotPose {
  return { position: [midX * 0.85, key.height, key.forward], target: [midX, 0.85, 0] };
}

/** Back-rim pose for one fighter: above and behind, aimed at the shoulders so the rim lands on the silhouette edge. */
export function backRimPose(rim: BackRim, fighterX: number, fighterY = 0): SpotPose {
  return { position: [fighterX, rim.height + fighterY, -rim.behind], target: [fighterX, 1.25 + fighterY, 0.15] };
}

/** Unit direction from a pose (the `setLight` patch takes a direction). */
export function poseDirection(pose: SpotPose): AuraVec3 {
  const d: [number, number, number] = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / len, d[1] / len, d[2] / len];
}

/**
 * The stage's own lights (beyond the look's sun): the follow-spot key on the Crown, two back rims in the fighters'
 * emissive colours and the rect panels. Each light carries a runtime id so main.ts can patch it (E-B `setLight`).
 */
export function stageLightNodes(
  row: StageLookRow,
  rimColors: { readonly p1: AuraColor; readonly p2: AuraColor },
  starts: { readonly p1: number; readonly p2: number }
): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const key = row.key;
  if (key.kind === "follow-spot") {
    const pose = followSpotPose(key, (starts.p1 + starts.p2) / 2);
    nodes.push(
      lights
        .spot({
          name: "crown follow-spot",
          position: pose.position,
          target: pose.target,
          angle: key.angle,
          penumbra: key.penumbra,
          distance: key.distance,
          decay: key.decay,
          intensity: key.intensity,
          color: key.color,
          shadow: key.shadow
        })
        .runtime({ id: FOLLOW_SPOT_ID })
        .toJSON()
    );
  }
  for (const side of ["p1", "p2"] as const) {
    const pose = backRimPose(row.backRim, starts[side]);
    nodes.push(
      lights
        .spot({
          name: `fighter back rim ${side}`,
          position: pose.position,
          target: pose.target,
          angle: row.backRim.angle,
          penumbra: row.backRim.penumbra,
          distance: row.backRim.distance,
          decay: 1.3,
          intensity: row.backRim.intensity,
          color: rimColors[side]
        })
        .runtime({ id: RIM_IDS[side] })
        .toJSON()
    );
  }
  for (const panel of row.panels) {
    nodes.push(
      lights
        .rect({ name: panel.name, position: panel.position, target: panel.target, width: panel.width, height: panel.height, intensity: panel.intensity, color: panel.color })
        .toJSON()
    );
  }
  return nodes;
}

/** PRD §6.3: precipitation streaks halve on reduced motion (IC47-E2). */
export function streakLimitFor(row: StageLookRow, reducedMotion: boolean): number {
  const limit = row.weather?.streakLimit ?? 0;
  return reducedMotion ? Math.floor(limit / 2) : limit;
}
