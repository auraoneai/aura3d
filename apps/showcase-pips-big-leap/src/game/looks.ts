// Pip's Big Leap: per-world look table (GU47 WP-16 "felt-and-clay woodland diorama").
//
// One row per world. Each world is a closed miniature diorama with its own hour, seen
// through a macro lens with Pip acorn-sized: never an open sky or a wide vista. A row
// carries everything the presentation needs: the PBL-L1 rig (catalogue HDRI, one PCSS key,
// cool rim, hemisphere, background), the PBL-E1 diorama base and height fog, the PBL-E2
// sky, the PBL-E3 ambient emitter, the PBL-P1 post preset and grade, the PBL-L2
// practicals and the PBL-P3 sun shafts. `diorama.ts` lowers it; gameplay data stays in
// `worlds.ts` and nothing here feeds the simulation (PRD D8).
//
// The numbers are first-pass values; phase 2 tunes them into the WP-16 luma bands from
// remote steady-state captures (software WebGL2).

import type { AuraHdriId, AuraHeightFogSpec, AuraLookId, AuraLookOverrides, AuraPostPresetId } from "@aura3d/engine";
import type { Framing } from "./framing";
import type { WorldId, WorldSpec } from "./types";

/** `?look=original` restores the pre-GU47 presentation (PRD section 8, reversibility). */
export type PipLookMode = "diorama" | "original";

export type PipAmbientKind = "petals" | "spores" | "motes" | "fluff" | "embers" | "dust" | "fireflies";

export type Vec3 = readonly [number, number, number];

export interface PipPractical {
  /** Scene node name and runtime id (the flicker drives it through `handle.setLight`). */
  readonly name: string;
  readonly type: "point" | "spot";
  readonly position: Vec3;
  readonly target?: Vec3;
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
  readonly angle?: number;
  readonly penumbra?: number;
  /** 0 = steady; otherwise the flicker depth (fraction of intensity), driven with `setLight`. */
  readonly flicker: number;
}

export type PipSkySpec =
  | { readonly model: "preetham"; readonly turbidity: number; readonly rayleigh: number; readonly exposure: number; readonly groundColor: string }
  | { readonly model: "gradient"; readonly zenith: string; readonly horizon: string; readonly ground: string; readonly exponent: number; readonly horizonGlow: number; readonly stars?: { readonly count: number; readonly brightness: number } };

export interface WorldLook {
  readonly id: WorldId;
  /** The world's hour, written into the identity sheet. */
  readonly hour: string;
  /** The engine look the overrides retune (it keeps the AO, bloom and grade children). */
  readonly baseLook: AuraLookId;
  readonly hdri: { readonly id: AuraHdriId; readonly intensity: number; readonly rotationDeg: number };
  /** One shadowed key per world (PCSS, 3 cascades at High; the tier table degrades it). */
  readonly key: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number; readonly lightSize: number; readonly softness: number };
  /** Cool rim, an unshadowed directional opposite the key (E-A rim override). */
  readonly rim: { readonly azimuthDeg: number; readonly color: string; readonly intensity: number };
  readonly hemisphere: { readonly skyColor: string; readonly groundColor: string; readonly intensity: number };
  /** The diorama backdrop colour (7 distinct values). */
  readonly background: string;
  readonly exposureEv: number;
  /** Height fog pooled in the diorama base (PBL-E1); the reference height is the base top. */
  readonly fog: { readonly color: string; readonly density: number; readonly heightDensity: number; readonly heightFalloff: number; readonly maxOpacity: number };
  /** Diorama base (PBL-E1): felt top, clay plinth, darker skirt, felt mounds. */
  readonly base: { readonly felt: string; readonly clay: string; readonly skirt: string; readonly mound: string };
  /** Real sky (PBL-E2); the catalogue HDRI stays the environment source. */
  readonly sky?: PipSkySpec;
  readonly post: {
    readonly preset: AuraPostPresetId;
    readonly contrast: number;
    readonly saturation: number;
    readonly temperature: number;
    readonly tint: number;
    readonly vignette: { readonly intensity: number; readonly color: string };
  };
  readonly ambient: {
    readonly kind: PipAmbientKind;
    readonly color: string;
    readonly maxParticles: number;
    readonly rate: number;
    readonly size: readonly [number, number];
    readonly lifetime: readonly [number, number];
    readonly speed: readonly [number, number];
    readonly gravity: number;
    readonly drag: number;
    readonly additive: boolean;
  };
  readonly practicals: readonly PipPractical[];
  /** w2: a lens flare on the low sun (PBL-L2). */
  readonly lensFlare?: { readonly intensity: number };
  /**
   * PBL-P3 sun shafts: S4 god rays with their own march density (E-C `godRayDensity`). No world
   * sets it since GU47 phase 2: on software WebGL2 the stage drew no visible shafts and only
   * added extinction (w1/w2 frames 2-3x darker than the backdrop colour), so it is off.
   */
  readonly shafts?: { readonly density: number; readonly intensity: number; readonly color: string };
  /** PBL-V3 (w6): an aurora curtain hung behind the far end of the night garden. */
  readonly aurora?: { readonly color: string; readonly colorTop: string; readonly intensity: number };
  /**
   * PBL-V3 (w4): heat shimmer over the lava cellar, a screen-space ripple of at most
   * `pixels` px that is strongest at the bottom of the frame and gone above `band`.
   */
  readonly heatShimmer?: { readonly pixels: number; readonly band: number; readonly speed: number };
  /** PBL-E4 (w2): the millpond as a horizontal mirror under its tinted glass, with a felt foam ring. */
  readonly millpond?: { readonly tint: string; readonly foam: string; readonly resolution: number };
  /** Land-dust felt colour for the VFX pack (PBL-V1). */
  readonly dust: string;
}

/** Identity palette (PRD WP-16). Sun-seed gold is reserved for pickups and the Sun-Gate. */
export const PIP_PALETTE = {
  moss: "#4f7a3a",
  toadstool: "#c8432f",
  birch: "#efe3c8",
  sunSeed: "#ffc23d"
} as const;

/** Depth of field shared by every world (PBL-P2): the signature shallow-focus miniature lens. */
export const MINIATURE_LENS = { fStop: 2.0, focalLength: 50, maxBlur: 4 } as const;

/** Pip's body centre above his feet, for the focus distance (Pip is 1.25 m tall in world units). */
export const PIP_FOCUS_LIFT = 0.6;

/** PBL-C2 miniature framing: the lens sits 1.7 m above Pip's feet (2.25 m in the original look). */
export const MINIATURE_LIFT = 1.7;
export const ORIGINAL_LIFT = 2.25;

export interface MiniatureFraming extends Framing {
  readonly lift: number;
}

const MINIATURE_DESKTOP = { fov: 46, boom: 4.5 } as const;
const MINIATURE_PORTRAIT = { fov: 68, boom: 5.6 } as const;
const PORTRAIT_ASPECT = 0.46;

/**
 * PBL-C2: desktop fov 46 (Pip 18-25% of the frame height), portrait keeps fov 68 so a
 * 390x844 phone still sees at least 34 deg horizontally; the boom is today's.
 */
export function miniatureFramingFor(aspect: number): MiniatureFraming {
  if (!(aspect > 0) || aspect >= 1) return { ...MINIATURE_DESKTOP, lift: MINIATURE_LIFT };
  const k = Math.min(1, (1 - aspect) / (1 - PORTRAIT_ASPECT));
  return {
    fov: MINIATURE_DESKTOP.fov + (MINIATURE_PORTRAIT.fov - MINIATURE_DESKTOP.fov) * k,
    boom: MINIATURE_DESKTOP.boom + (MINIATURE_PORTRAIT.boom - MINIATURE_DESKTOP.boom) * k,
    lift: MINIATURE_LIFT
  };
}

/**
 * Lens-to-Pip distance for a framing: the boom behind him and the camera lift above his
 * feet. With the miniature framing this is about 4.6 m on desktop and 5.7 m in a 390x844
 * portrait, the PRD numbers.
 */
export function focusDistanceFor(framing: Framing & { readonly lift?: number }, clearance = 1): number {
  const lift = framing.lift ?? ORIGINAL_LIFT;
  return Math.hypot(framing.boom * clearance, lift - PIP_FOCUS_LIFT);
}

/**
 * PBL-E1: the diorama base top sits 3-6 m below the course floor, and at least 1.5 m above
 * the world's fall line so a fall reads as dropping into the fogged base (read-only use of
 * `lowerBound`; the fall line itself is unchanged).
 */
export function baseDepthFor(spec: Pick<WorldSpec, "lowerBound">): number {
  return Math.min(6, Math.max(3, -spec.lowerBound - 1.5));
}

const opposite = (az: number): number => (az + 180) % 360;

export const WORLD_LOOKS: Readonly<Record<WorldId, WorldLook>> = {
  academy: {
    id: "academy",
    hour: "garden mid-morning",
    baseLook: "outdoor-day",
    hdri: { id: "spruit_sunrise", intensity: 0.85, rotationDeg: 120 },
    key: { elevationDeg: 42, azimuthDeg: 120, color: "#fff0d4", intensity: 2.5, lightSize: 0.9, softness: 0.55 },
    rim: { azimuthDeg: opposite(120), color: "#b8d2ff", intensity: 0.55 },
    hemisphere: { skyColor: "#cfe0c4", groundColor: "#4a5a2e", intensity: 0.22 },
    background: "#8fa673",
    exposureEv: 1.8,
    fog: { color: "#a7b98c", density: 0.004, heightDensity: 0.09, heightFalloff: 0.42, maxOpacity: 0.78 },
    base: { felt: "#5b7f3f", clay: "#7a5a3e", skirt: "#3e2c1e", mound: "#4f7a3a" },
    post: { preset: "daylight-outdoor", contrast: 1.04, saturation: 1.04, temperature: 0.06, tint: 0, vignette: { intensity: 0.16, color: "#1c140b" } },
    ambient: { kind: "petals", color: "#f4d4d8", maxParticles: 260, rate: 34, size: [0.035, 0.07], lifetime: [6, 9], speed: [0.1, 0.32], gravity: -0.05, drag: 0.4, additive: false },
    practicals: [],
    dust: "#c9b48a"
  },
  w1: {
    id: "w1",
    hour: "canopy dawn shafts",
    baseLook: "outdoor-day",
    hdri: { id: "spruit_sunrise", intensity: 0.7, rotationDeg: 80 },
    key: { elevationDeg: 18, azimuthDeg: 80, color: "#ffd9a8", intensity: 2.3, lightSize: 0.7, softness: 0.5 },
    rim: { azimuthDeg: opposite(80), color: "#9fc2ff", intensity: 0.5 },
    hemisphere: { skyColor: "#a9c7a0", groundColor: "#2f3f1e", intensity: 0.2 },
    background: "#5a7a5c",
    exposureEv: 1.8,
    fog: { color: "#6f8a6c", density: 0.006, heightDensity: 0.12, heightFalloff: 0.38, maxOpacity: 0.82 },
    base: { felt: "#3f6a31", clay: "#5c4129", skirt: "#2a1d12", mound: "#4f7a3a" },
    post: { preset: "daylight-outdoor", contrast: 1.04, saturation: 1.02, temperature: 0.12, tint: 0.02, vignette: { intensity: 0.18, color: "#120d07" } },
    ambient: { kind: "spores", color: "#e6eeb0", maxParticles: 320, rate: 40, size: [0.025, 0.05], lifetime: [7, 10], speed: [0.06, 0.2], gravity: 0.02, drag: 0.5, additive: true },
    practicals: [],
    dust: "#a08a62"
  },
  w2: {
    id: "w2",
    hour: "millpond golden hour",
    baseLook: "golden-hour",
    hdri: { id: "belfast_sunset_puresky", intensity: 0.8, rotationDeg: 250 },
    key: { elevationDeg: 10, azimuthDeg: 250, color: "#ffb36b", intensity: 2.4, lightSize: 0.8, softness: 0.5 },
    rim: { azimuthDeg: opposite(250), color: "#a8c4ff", intensity: 0.5 },
    hemisphere: { skyColor: "#f0c49a", groundColor: "#4a3420", intensity: 0.2 },
    background: "#b9784a",
    exposureEv: 1.5,
    fog: { color: "#c8946a", density: 0.005, heightDensity: 0.1, heightFalloff: 0.4, maxOpacity: 0.8 },
    base: { felt: "#6b7d3c", clay: "#8a5c38", skirt: "#3a2616", mound: "#5d7a38" },
    sky: { model: "preetham", turbidity: 6, rayleigh: 1.6, exposure: 0.45, groundColor: "#5a3e26" },
    post: { preset: "daylight-outdoor", contrast: 1.04, saturation: 1.06, temperature: 0.22, tint: 0.01, vignette: { intensity: 0.18, color: "#1e1208" } },
    ambient: { kind: "motes", color: "#f6cf8e", maxParticles: 280, rate: 34, size: [0.02, 0.045], lifetime: [6, 9], speed: [0.05, 0.18], gravity: 0.01, drag: 0.5, additive: true },
    practicals: [],
    lensFlare: { intensity: 0.55 },
    millpond: { tint: "#b8d8c8", foam: "#f2ead8", resolution: 256 },
    dust: "#b99a6a"
  },
  w3: {
    id: "w3",
    hour: "dandelion-fluff dawn",
    baseLook: "alpine-snow",
    hdri: { id: "spruit_sunrise", intensity: 0.95, rotationDeg: 150 },
    key: { elevationDeg: 24, azimuthDeg: 150, color: "#ffe2c8", intensity: 2.8, lightSize: 0.6, softness: 0.4 },
    rim: { azimuthDeg: opposite(150), color: "#c6b8ff", intensity: 0.6 },
    hemisphere: { skyColor: "#f2d6e2", groundColor: "#6a5a72", intensity: 0.24 },
    background: "#d4b6c6",
    exposureEv: 1.4,
    fog: { color: "#e2c6cf", density: 0.004, heightDensity: 0.08, heightFalloff: 0.36, maxOpacity: 0.75 },
    base: { felt: "#9a8a9a", clay: "#7a6476", skirt: "#3a2c3c", mound: "#b8a6b0" },
    sky: { model: "gradient", zenith: "#a99ad6", horizon: "#f6c8b0", ground: "#6a5470", exponent: 0.8, horizonGlow: 0.35 },
    post: { preset: "daylight-outdoor", contrast: 1.06, saturation: 0.98, temperature: 0.08, tint: 0.04, vignette: { intensity: 0.14, color: "#2a1c24" } },
    ambient: { kind: "fluff", color: "#fff4e4", maxParticles: 300, rate: 32, size: [0.04, 0.085], lifetime: [7, 10], speed: [0.12, 0.34], gravity: 0.03, drag: 0.45, additive: false },
    practicals: [],
    dust: "#e6d6c0"
  },
  w4: {
    id: "w4",
    hour: "lava-lit basalt cellar",
    baseLook: "interior-industrial",
    hdri: { id: "hangar_interior", intensity: 0.6, rotationDeg: 30 },
    key: { elevationDeg: 55, azimuthDeg: 20, color: "#ffb48a", intensity: 1.1, lightSize: 1.2, softness: 0.7 },
    rim: { azimuthDeg: 200, color: "#7d8fd8", intensity: 0.3 },
    hemisphere: { skyColor: "#3a2a2a", groundColor: "#ff6a2a", intensity: 0.5 },
    background: "#3a1c12",
    exposureEv: 1.4,
    fog: { color: "#3a1a10", density: 0.008, heightDensity: 0.14, heightFalloff: 0.32, maxOpacity: 0.6 },
    base: { felt: "#2a1f1c", clay: "#3a2a24", skirt: "#120a08", mound: "#4a2a1e" },
    post: { preset: "arena-fight", contrast: 1.06, saturation: 1.08, temperature: 0.18, tint: -0.02, vignette: { intensity: 0.26, color: "#0a0503" } },
    ambient: { kind: "embers", color: "#ff8a3d", maxParticles: 300, rate: 44, size: [0.02, 0.045], lifetime: [2.5, 4.5], speed: [0.3, 0.8], gravity: 0.35, drag: 0.3, additive: true },
    practicals: [
      { name: "pbl-lava-glow-a", type: "point", position: [-3.2, 1.9, -28.5], color: "#ff6a2a", intensity: 14, distance: 7, flicker: 0.25 },
      { name: "pbl-lava-glow-b", type: "point", position: [3.2, 1.9, -28.5], color: "#ff7a32", intensity: 14, distance: 7, flicker: 0.25 },
      { name: "pbl-lava-glow-c", type: "point", position: [-2.6, 1.7, -40], color: "#ff5a22", intensity: 12, distance: 7, flicker: 0.3 },
      { name: "pbl-lava-glow-d", type: "point", position: [2.6, 1.7, -40], color: "#ff8a3a", intensity: 12, distance: 7, flicker: 0.3 }
    ],
    heatShimmer: { pixels: 1.6, band: 0.55, speed: 1 },
    dust: "#5a4038"
  },
  w5: {
    id: "w5",
    hour: "amber hollow-tree palace",
    baseLook: "interior-warm",
    hdri: { id: "warm_bar", intensity: 0.85, rotationDeg: 200 },
    key: { elevationDeg: 50, azimuthDeg: 25, color: "#ffd2a0", intensity: 0.9, lightSize: 1.0, softness: 0.65 },
    rim: { azimuthDeg: 205, color: "#8fa8e8", intensity: 0.35 },
    hemisphere: { skyColor: "#6a4a2a", groundColor: "#2a1a0e", intensity: 0.4 },
    background: "#5a3a1c",
    exposureEv: 1.3,
    fog: { color: "#4a2e16", density: 0.007, heightDensity: 0.12, heightFalloff: 0.34, maxOpacity: 0.65 },
    base: { felt: "#4a3218", clay: "#5a3a1e", skirt: "#1e1208", mound: "#6a4a24" },
    post: { preset: "cinematic-film", contrast: 1.04, saturation: 1.04, temperature: 0.2, tint: 0.02, vignette: { intensity: 0.22, color: "#0e0804" } },
    ambient: { kind: "dust", color: "#ecc68a", maxParticles: 240, rate: 28, size: [0.015, 0.035], lifetime: [7, 10], speed: [0.04, 0.14], gravity: 0.005, drag: 0.6, additive: true },
    practicals: [
      { name: "pbl-lantern-left", type: "point", position: [-2.6, 4.2, -48], color: "#ffb45a", intensity: 10, distance: 8, flicker: 0.08 },
      { name: "pbl-lantern-right", type: "point", position: [2.6, 4.2, -48], color: "#ffb45a", intensity: 10, distance: 8, flicker: 0.08 },
      { name: "pbl-throne-spot", type: "spot", position: [0, 10.5, -64], target: [0, 2.6, -69], color: "#ffd49a", intensity: 60, distance: 16, angle: 0.5, penumbra: 0.45, flicker: 0 }
    ],
    dust: "#8a6a44"
  },
  w6: {
    id: "w6",
    hour: "firefly night garden",
    baseLook: "polar-night",
    hdri: { id: "rooftop_night", intensity: 0.55, rotationDeg: 300 },
    key: { elevationDeg: 30, azimuthDeg: 300, color: "#b8ccff", intensity: 1.3, lightSize: 0.8, softness: 0.6 },
    rim: { azimuthDeg: opposite(300), color: "#7fe8d8", intensity: 0.35 },
    hemisphere: { skyColor: "#2a3a6a", groundColor: "#141a2a", intensity: 0.35 },
    background: "#0b1230",
    exposureEv: 1.2,
    fog: { color: "#18224a", density: 0.006, heightDensity: 0.12, heightFalloff: 0.3, maxOpacity: 0.82 },
    base: { felt: "#1e2a4a", clay: "#2a2a4a", skirt: "#0a0c1a", mound: "#24365a" },
    sky: { model: "gradient", zenith: "#060a1e", horizon: "#1c2a5a", ground: "#0a0c1a", exponent: 1.2, horizonGlow: 0.2, stars: { count: 900, brightness: 1.2 } },
    post: { preset: "space", contrast: 1.04, saturation: 1.02, temperature: -0.12, tint: 0.02, vignette: { intensity: 0.22, color: "#03040a" } },
    ambient: { kind: "fireflies", color: "#d8ff7a", maxParticles: 160, rate: 18, size: [0.03, 0.06], lifetime: [4, 7], speed: [0.08, 0.26], gravity: 0, drag: 0.35, additive: true },
    practicals: [
      { name: "pbl-crystal-glow-a", type: "point", position: [-3.4, 2.0, 0.5], color: "#6fe8ff", intensity: 14, distance: 7, flicker: 0.12 },
      { name: "pbl-crystal-glow-b", type: "point", position: [-4.6, 3.3, -21], color: "#7af0ff", intensity: 14, distance: 7, flicker: 0.12 },
      { name: "pbl-crystal-glow-c", type: "point", position: [4.6, 4.4, -42], color: "#5fd8ff", intensity: 14, distance: 7, flicker: 0.12 }
    ],
    aurora: { color: "#5fe8c0", colorTop: "#7a6ad8", intensity: 0.55 },
    dust: "#5a6a9a"
  }
};

export const WORLD_IDS: readonly WorldId[] = ["academy", "w1", "w2", "w3", "w4", "w5", "w6"];

export function worldLook(id: WorldId): WorldLook {
  return WORLD_LOOKS[id];
}

/** PBL-E1 height fog for a world: pooled in the diorama base, thinning above the course. */
export function heightFogFor(look: WorldLook, baseTop: number): AuraHeightFogSpec {
  return {
    mode: "height",
    color: look.fog.color,
    density: look.fog.density,
    heightDensity: look.fog.heightDensity,
    heightFalloff: look.fog.heightFalloff,
    heightReference: baseTop,
    maxOpacity: look.fog.maxOpacity
  };
}

/**
 * PBL-L1/E1/P1 as E-A look overrides: the world's catalogue HDRI (IBL only; the colour
 * background keeps it out of the backdrop), the PCSS 3-cascade key at the world's sun
 * angles, the cool rim, the base height fog, the per-world grade and the post preset.
 */
export function lookOverridesFor(look: WorldLook, baseTop: number): AuraLookOverrides {
  return {
    sun: { elevationDeg: look.key.elevationDeg, azimuthDeg: look.key.azimuthDeg },
    exposureEv: look.exposureEv,
    background: look.background,
    hdri: look.hdri.id,
    environmentIntensity: look.hdri.intensity,
    environmentRotationDeg: look.hdri.rotationDeg,
    key: {
      color: look.key.color,
      intensity: look.key.intensity,
      shadow: { filter: "pcss", cascades: 3, lightSize: look.key.lightSize, softness: look.key.softness, mapSize: 2048 }
    },
    rim: { color: look.rim.color, intensity: look.rim.intensity, azimuthDeg: look.rim.azimuthDeg },
    fog: { color: look.fog.color, height: heightFogFor(look, baseTop) },
    grade: { contrast: look.post.contrast, saturation: look.post.saturation, temperature: look.post.temperature, tint: look.post.tint },
    post: look.post.preset
  };
}

/**
 * GU47 blind-panel fix pass (2026-10-31): the 4.6.2 look is the default again. Three blind
 * judges rated the diorama worse than 4.6.2 in academy, w1, w2, w3 and w5 (better only in w4
 * and w6), and the look is chosen once for the whole game, so `?look=diorama` opts in and
 * anything else (including `?look=original`) is today's presentation.
 */
export const DEFAULT_LOOK_MODE: PipLookMode = "original";

export function lookModeFromSearch(search: string): PipLookMode {
  const value = new URLSearchParams(search).get("look");
  if (value === "diorama") return "diorama";
  if (value === "original") return "original";
  return DEFAULT_LOOK_MODE;
}

/** `?world=<id>` boots straight into a world (capture convenience; the atlas cards stay the E-I path). */
export function worldFromSearch(search: string): WorldId | null {
  const value = new URLSearchParams(search).get("world");
  return value !== null && (WORLD_IDS as readonly string[]).includes(value) ? (value as WorldId) : null;
}

/** Directional key position from sun angles (distance 24, Y up, azimuth clockwise from +Z), as the look presets use. */
export function sunPosition(elevationDeg: number, azimuthDeg: number, distance = 24): Vec3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [
    Number((distance * Math.cos(el) * Math.sin(az)).toFixed(3)),
    Number((distance * Math.sin(el)).toFixed(3)),
    Number((distance * Math.cos(el) * Math.cos(az)).toFixed(3))
  ];
}

/**
 * PRD 6.3/6.4 presentation scales: reduced motion halves particle emission and caps
 * secondary motion at 30%; Low tier keeps the palette, sky, fog and vignette and drops
 * the expensive post (the engine tier table drops DOF and god rays below High).
 */
export interface PresentationScale {
  readonly emission: number;
  readonly motion: number;
  readonly flicker: boolean;
  readonly cameraSequences: boolean;
}

export function presentationScale(reducedMotion: boolean): PresentationScale {
  return reducedMotion
    ? { emission: 0.5, motion: 0.3, flicker: false, cameraSequences: false }
    : { emission: 1, motion: 1, flicker: true, cameraSequences: true };
}
