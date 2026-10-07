/**
 * Lane prd07 scene specs (PRD-07 P1-T15). Scene ids are `prd07-<slug>`; every
 * spec keeps the SceneSpec contract fields so shared capture machinery treats
 * them like the 18 base scenes, plus lane object kinds the base
 * `ObjectSpec` union does not cover (`flipbook`, `emitterSet`).
 */
import type { ObjectSpec, ParticleObjectSpec, SceneSpec, Vec3 } from "../../shared/types";

/** Flipbook sprite sheet object: one animated sprite (fireball/smoke S2). */
export interface FlipbookObjectSpec {
  readonly kind: "flipbook";
  readonly name: string;
  readonly position: Vec3;
  /** Sprite world size (both axes). */
  readonly size: number;
  readonly atlas: { readonly columns: number; readonly rows: number; readonly frameRate: number; readonly seed: number };
  readonly color?: string;
  readonly blending?: "alpha" | "additive";
  /** Seconds offset into the sheet before frame 0 (staggers multi-sprite scenes). */
  readonly startAt?: number;
}

/** Named emitter inside an `emitterSet` (S12 stress: mixed blend, many emitters). */
export interface EmitterMemberSpec {
  readonly name: string;
  readonly seed: number;
  readonly count: number;
  readonly center: Vec3;
  readonly radius: number;
  readonly height: number;
  readonly color: string;
  readonly size: number;
  readonly blending: "additive" | "alpha";
  /** Particles per second; defaults to count/2.5 (steady-state at capture). */
  readonly rate?: number;
}

/** A set of independent particle emitters sharing one scene object. */
export interface EmitterSetSpec {
  readonly kind: "emitterSet";
  readonly name: string;
  readonly emitters: readonly EmitterMemberSpec[];
}

/**
 * S3 contact sheet: `kinds` × `ages` cells per `panels` backdrop. The Aura
 * adapter spawns `app.effects.burst` staged so cell (kind, age, panel) shows
 * exactly `age` seconds of life at the capture time.
 */
export interface BurstSheetSpec {
  readonly kind: "burstSheet";
  readonly name: string;
  readonly kinds: readonly string[];
  /** Burst ages shown left-to-right, seconds before capture. */
  readonly ages: readonly number[];
  /** Backdrop panel world centres (x = cols, y = rows origin at centre). */
  readonly panels: readonly Vec3[];
  /** Column spacing within a panel and row spacing, world units. */
  readonly spacing: readonly [number, number];
  /** Per-burst spawn options. */
  readonly burstCount?: number;
  readonly seed?: number;
}

/** S11 trail: a static point ring the ribbon pass draws (dash ribbons, contrails). */
export interface TrailObjectSpec {
  readonly kind: "trail";
  readonly name: string;
  readonly path: readonly Vec3[];
  readonly color: string;
  readonly width?: number;
  readonly maxPoints?: number;
  readonly orientation?: "camera" | "surface";
}

/** S11 additive beam (light-beam node: from→to, tapered alpha). */
export interface BeamObjectSpec {
  readonly kind: "beam";
  readonly name: string;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly color: string;
  readonly widthWorld?: number;
  readonly intensity?: number;
}

/** S11 light cone: open additive cone, apex `position`, axis `direction`. */
export interface LightConeObjectSpec {
  readonly kind: "lightCone";
  readonly name: string;
  readonly position: Vec3;
  readonly direction: Vec3;
  readonly length?: number;
  readonly coneAngle?: number;
  readonly softness?: number;
  readonly color: string;
  readonly intensity?: number;
}

/** S11 aurora curtain: additive ribbon, fold + shimmer in fragment. */
export interface AuroraObjectSpec {
  readonly kind: "auroraRibbon";
  readonly name: string;
  readonly position: Vec3;
  readonly width?: number;
  readonly height?: number;
  readonly segments?: number;
  readonly sway?: number;
  readonly shimmer?: number;
  readonly color: string;
  readonly colorTop?: string;
  readonly intensity?: number;
}

/** §6.2.11 instanced debris field (meshParticles node). */
export interface MeshParticlesObjectSpec {
  readonly kind: "meshParticles";
  readonly name: string;
  readonly position: Vec3;
  readonly count?: number;
  readonly color: string;
  readonly seed?: number;
}

/**
 * §8.2/§8.6 precipitation volume (S8 rain / S9 snow): Aura lowers the
 * `effects.rain`/`effects.snow` node to the camera-following procedural
 * volume + splash emitter (flag-on); three gets instanced streaks / Points.
 */
export interface WeatherObjectSpec {
  readonly kind: "weather";
  readonly name: string;
  readonly weather: "rain" | "snow";
  readonly intensity: number;
  readonly seed?: number;
  readonly wind?: readonly [number, number, number];
}

/**
 * §6.9 decal object (P6-T7). The Aura adapter authors a `decals.project`
 * quad (which stamps the `prd07.legacyDecal` carve tag — flag-on the
 * primitive hides and the merged DecalBatch draws it); the three adapter
 * projects r185 DecalGeometry onto the primitive named by `target`.
 * `runtime: true` spawns through `app.effects.decal` instead of a scene
 * node (the runtime-instance decal path).
 */
export interface DecalObjectSpec {
  readonly kind: "decal";
  readonly name: string;
  readonly target: string;
  readonly position: Vec3;
  readonly normal?: Vec3;
  readonly size: readonly [number, number];
  readonly color: string;
  readonly opacity?: number;
  /** Yaw in degrees around the surface normal. */
  readonly rotationDeg?: number;
  readonly runtime?: boolean;
}

export type Prd07ObjectSpec =
  | ObjectSpec
  | FlipbookObjectSpec
  | EmitterSetSpec
  | BurstSheetSpec
  | TrailObjectSpec
  | BeamObjectSpec
  | LightConeObjectSpec
  | AuroraObjectSpec
  | MeshParticlesObjectSpec
  | WeatherObjectSpec
  | DecalObjectSpec;

/** S13/S14 — `sky.dayNight` parameters both adapters honour (hour 0..24). */
export interface DayNightSpec {
  readonly hour: number;
  readonly seed?: number;
  readonly starLimit?: number;
  readonly cloudLimit?: number;
}

/** S14/P4 — scene fog; three gets the closest FogExp2 approximation (partial for non-exp2 modes), Aura gets `effects.fog`/`app.atmosphere.setFog`. */
export interface FogSpec {
  readonly mode: "exp2" | "height" | "exp" | "linear" | "absorption";
  readonly color: string;
  readonly density: number;
  readonly heightDensity?: number;
  readonly heightFalloff?: number;
  readonly heightReference?: number;
  readonly start?: number;
  readonly maxOpacity?: number;
  readonly absorption?: readonly [number, number, number];
  readonly near?: number;
  readonly far?: number;
  readonly transitionSeconds?: number;
}

/** P4-T8 — a second fog spec applied via `app.atmosphere.setFog` partway through the capture clock (transitionSeconds on the target). */
export interface FogTransitionSpec {
  readonly from: FogSpec;
  readonly to: FogSpec;
  /** Seconds into `spec.time` when the `to` spec is set. */
  readonly atSeconds: number;
}

export interface Prd07SceneSpec extends Omit<SceneSpec, "objects"> {
  readonly objects: readonly Prd07ObjectSpec[];
  /** C-30: scene judged absolutely, never used for a parity claim (no three adapter). */
  readonly admittedAsReference?: boolean;
  /** P3-T7 — day-night sky (Aura `sky.dayNight`; three `Sky.js` at the same sun). */
  readonly dayNight?: DayNightSpec;
  /** P3-T7 — direct preetham spec (Aura `sky.preetham`; three `Sky.js`). */
  readonly skyPreetham?: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly turbidity?: number };
  /** P3-T7/P4 — scene fog (Aura adapter: `effects.fog` node → §6.6 live state, flag-gated). */
  readonly fog?: FogSpec;
  /** P4-T8 — staged `app.atmosphere.setFog` transition (Aura-only; no three equivalent). */
  readonly fogTransition?: FogTransitionSpec;
  /** P4-T8 — local fog volumes (`effects.fogVolume`, Aura-only). */
  readonly fogVolumes?: readonly { readonly position: readonly number[]; readonly size: readonly number[]; readonly density?: number; readonly shape?: "box" | "ellipsoid" }[];
  /** P5-T8 — §6.7 volumetric fog spec (Aura `effects.volumetricFog`; three gets the FogExp2 + cone approximation). */
  readonly volumetric?: { readonly density: number; readonly color?: string; readonly anisotropy?: number; readonly intensity?: number };
  /** P5-T8 — soft-particle depth fade (Aura shader path; three uses its nearest sprite depth approximation). */
  readonly softParticles?: boolean;
}

const RES = { width: 1280, height: 720, devicePixelRatio: 1 } as const;

function base(id: string, index: number, title: string, purpose: string) {
  return {
    id,
    index,
    title,
    purpose,
    resolution: RES,
    toneMapping: "aces-filmic" as const,
    exposure: 1,
    time: 1.25,
    settleFrames: 4,
    owner: "prd07" as const,
    referenceProfile: "contract" as const,
    qrFlags: ["vfx"] as const
  };
}

/**
 * S1 — replica of base scene 14-particles (`shared/scenes.ts:280-288`): same
 * camera, dark background, 2,000 additive sprites, seed 1414. The difference
 * vs the base entry is that the lane adapter honours `seed`, `size` and
 * `blending` → `blend` on the Aura side (base adapter records them missing
 * until R-12-1).
 */
export const particlesFountain: Prd07SceneSpec = {
  ...base("prd07-particles-fountain", 701, "Particles fountain (lane replica)", "2,000 additive sprites, seed 1414 — options honoured"),
  primaryCriterion: "particles",
  primaryRegion: "frame",
  camera: { position: [0, 1.4, 4.6], target: [0, 1.1, 0], fov: 45, near: 0.05, far: 50 },
  background: { kind: "color", color: "#05060a" },
  lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.05 }],
  objects: [
    {
      kind: "primitive",
      name: "ground plane",
      shape: "plane",
      size: [8, 1, 8],
      position: [0, 0, 0],
      material: { color: "#15171c", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "particles",
      name: "fountain particles",
      count: 2000,
      seed: 1414,
      center: [0, 0, 0],
      radius: 1.2,
      height: 2.4,
      color: "#ff9a3c",
      size: 0.06,
      blending: "additive"
    } satisfies ParticleObjectSpec
  ]
};

/**
 * S2 — fireball + smoke flipbook on a ground plane, 8-frame strip. The atlas
 * is deterministic and seeded so both adapters reproduce the same sheet.
 */
export const flipbook: Prd07SceneSpec = {
  ...base("prd07-flipbook", 702, "Flipbook explosion", "Fireball + smoke 8-frame flipbook on a ground plane"),
  primaryCriterion: "vfx",
  primaryRegion: "frame",
  camera: { position: [0, 1.6, 5], target: [0, 1, 0], fov: 45, near: 0.05, far: 50 },
  background: { kind: "color", color: "#0a0a10" },
  lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.2 }],
  objects: [
    {
      kind: "primitive",
      name: "ground plane",
      shape: "plane",
      size: [8, 1, 8],
      position: [0, 0, 0],
      material: { color: "#101418", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "flipbook",
      name: "fireball flipbook",
      position: [-0.7, 1.0, 0],
      size: 1.6,
      atlas: { columns: 4, rows: 2, frameRate: 16, seed: 9021 },
      blending: "additive"
    },
    {
      kind: "flipbook",
      name: "smoke flipbook",
      position: [1.0, 1.2, -0.5],
      size: 1.9,
      atlas: { columns: 4, rows: 2, frameRate: 10, seed: 4407 },
      color: "#aab4c0",
      blending: "alpha",
      startAt: 0.25
    }
  ]
};

/**
 * S12 — C-27 High cap: 50,000 live particles across emitters at the per-emitter
 * CPU cap (4,096 each), mixed additive/alpha blend. Deterministic per emitter.
 */
const stressEmitters: EmitterMemberSpec[] = (() => {
  const list: EmitterMemberSpec[] = [];
  const capPerEmitter = 4096;
  const total = 50_000;
  const additiveShare = 0.4;
  let assigned = 0;
  let i = 0;
  while (assigned < total) {
    const additive = i < Math.ceil((total / capPerEmitter) * additiveShare);
    const count = Math.min(capPerEmitter, total - assigned);
    const angle = (i / 13) * Math.PI * 2;
    const ring = 1.6 + (i % 3) * 1.1;
    list.push({
      name: `${additive ? "glow" : "smoke"} emitter ${i}`,
      seed: 7000 + i * 97,
      count,
      center: [Math.cos(angle) * ring, 0, Math.sin(angle) * ring],
      radius: 0.9,
      height: 2.2,
      color: additive ? "#ff9a3c" : "#8a94a8",
      size: additive ? 0.05 : 0.09,
      blending: additive ? "additive" : "alpha"
    });
    assigned += count;
    i += 1;
  }
  return list;
})();

export const particlesStress: Prd07SceneSpec = {
  ...base("prd07-particles-stress", 703, "Particles stress (C-27 cap)", "50,000 particles across emitters at the High cap, mixed blend"),
  primaryCriterion: "particles",
  primaryRegion: "frame",
  strip: { frames: 4, intervalMs: 250, orbitDegrees: 15 },
  camera: { position: [0, 3.2, 9], target: [0, 1.2, 0], fov: 45, near: 0.05, far: 60 },
  background: { kind: "color", color: "#06070c" },
  lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.05 }],
  objects: [
    {
      kind: "primitive",
      name: "ground plane",
      shape: "plane",
      size: [24, 1, 24],
      position: [0, 0, 0],
      material: { color: "#0d1016", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    { kind: "emitterSet", name: "stress emitters", emitters: stressEmitters }
  ]
};

/**
 * S3 — §6.4 impact-library contact sheet (Aura only): all 14 AuraVfxKind
 * bursts as rows × 4 age columns (0.03/0.08/0.2/0.5 s) on dark and light
 * panels. `spec.time` = last age + settle so every cell is mid-life.
 */
const IMPACT_KINDS = [
  "spark", "dust", "debris", "ring", "streak", "pickup", "splash", "bubble",
  "explosion-small", "muzzle", "impact-flash", "super-flash", "impact-decal", "aura-burst"
] as const;
const IMPACT_AGES = [0.03, 0.08, 0.2, 0.5] as const;

export const impactLibrary: Prd07SceneSpec = {
  ...base("prd07-impact-library", 704, "Impact library contact sheet", "S3 — 14 kinds × 4 ages on dark and light backdrops"),
  primaryCriterion: "vfx",
  primaryRegion: "frame",
  admittedAsReference: false,
  time: 0.55,
  camera: { position: [0, 0.2, 17], target: [0, 0.2, 0], fov: 45, near: 0.05, far: 60 },
  background: { kind: "color", color: "#101014" },
  lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.06 }],
  objects: [
    {
      kind: "primitive",
      name: "dark backdrop",
      shape: "box",
      size: [8.8, 13.4, 0.2],
      position: [-4.4, 0.2, -1.2],
      material: { color: "#0d0d12", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "primitive",
      name: "light backdrop",
      shape: "box",
      size: [8.8, 13.4, 0.2],
      position: [4.4, 0.2, -1.2],
      material: { color: "#e6e6ee", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "burstSheet",
      name: "impact sheet",
      kinds: IMPACT_KINDS,
      ages: IMPACT_AGES,
      panels: [[-4.4, 0.2, -0.6], [4.4, 0.2, -0.6]],
      spacing: [2.0, 0.92],
      burstCount: 18,
      seed: 7701
    }
  ]
};

/**
 * S11 — trails and beams sampler (Aura only): dash ribbon + twin contrails
 * (trail nodes with static rings), one additive beam, one downlight cone,
 * one aurora curtain behind.
 */
export const trailsBeams: Prd07SceneSpec = {
  ...base("prd07-trails-beams", 705, "Trails and beams", "S11 — dash ribbon, contrails, beam, light cone, aurora ribbon"),
  primaryCriterion: "vfx",
  primaryRegion: "frame",
  admittedAsReference: false,
  camera: { position: [0, 2.4, 11], target: [0, 2.4, -1], fov: 50, near: 0.05, far: 80 },
  background: { kind: "color", color: "#07080f" },
  lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.08 }],
  objects: [
    {
      kind: "primitive",
      name: "ground plane",
      shape: "plane",
      size: [30, 1, 30],
      position: [0, 0, -2],
      material: { color: "#0c0f14", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "auroraRibbon",
      name: "aurora curtain",
      position: [0, 3.4, -9],
      width: 18,
      height: 4.5,
      segments: 96,
      sway: 0.8,
      shimmer: 0.7,
      color: "#46e8a4",
      colorTop: "#5a4fd8",
      intensity: 1.2
    },
    {
      kind: "trail",
      name: "dash ribbon",
      path: [
        [-5.4, 1.0, -1.0], [-4.4, 1.5, -1.2], [-3.6, 1.1, -1.5], [-2.7, 1.8, -1.8],
        [-2.1, 1.4, -2.2], [-1.2, 2.0, -2.5]
      ],
      color: "#62f6c8",
      width: 0.28,
      maxPoints: 64
    },
    {
      kind: "trail",
      name: "contrail left",
      path: [[1.2, 4.6, -3.5], [2.0, 4.7, -3.6], [2.9, 4.85, -3.7], [3.9, 5.05, -3.8], [5.0, 5.3, -3.9]],
      color: "#e8f2ff",
      width: 0.22,
      maxPoints: 64
    },
    {
      kind: "trail",
      name: "contrail right",
      path: [[1.2, 4.4, -3.4], [2.0, 4.5, -3.45], [2.9, 4.65, -3.5], [3.9, 4.85, -3.55], [5.0, 5.1, -3.6]],
      color: "#dcebfa",
      width: 0.22,
      maxPoints: 64
    },
    {
      kind: "beam",
      name: "slash beam",
      from: [-5.2, 2.6, -2.5],
      to: [-1.6, 4.2, -4.0],
      color: "#9fd8ff",
      widthWorld: 0.22,
      intensity: 1.4
    },
    {
      kind: "lightCone",
      name: "downlight cone",
      position: [3.4, 4.6, -2.0],
      direction: [0, -1, 0.12],
      length: 4.4,
      coneAngle: 0.32,
      softness: 0.55,
      color: "#ffe9b0",
      intensity: 1.1
    },
    {
      kind: "meshParticles",
      name: "debris field",
      position: [3.6, 1.1, -2.0],
      count: 40,
      color: "#b0a89a",
      seed: 8812
    }
  ]
};

/**
 * S13 — `sky.dayNight` at dusk (hour 19): sun low, stars emerging, moon up,
 * noise clouds over a dark ridge line. three adapter: `Sky.js` at the same
 * sun position; background is the sky itself so `background` is informational.
 */
export const skyTimeOfDay: Prd07SceneSpec = {
  ...base("prd07-sky-timeofday", 706, "Sky time of day", "dusk dayNight sky — sun/moon/stars/clouds at hour 19"),
  qrFlags: ["vfx", "vfx.sky"] as const,
  primaryCriterion: "atmosphere",
  primaryRegion: "frame",
  time: 0.2,
  camera: { position: [0, 1.8, 9], target: [0, 4.5, -8], fov: 55, near: 0.05, far: 200 },
  background: { kind: "color", color: "#1a1d2e" },
  lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.15 }],
  dayNight: { hour: 19, seed: 7 },
  objects: [
    {
      kind: "primitive",
      name: "ridge",
      shape: "box",
      size: [40, 2.5, 3],
      position: [0, 0.9, -18],
      material: { color: "#10131f", roughness: 1, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "primitive",
      name: "field",
      shape: "plane",
      size: [40, 1, 30],
      position: [0, 0, -6],
      material: { color: "#1c2418", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    }
  ]
};

/**
 * S14 — noon preetham sky over terrain with exp2 fog tuned so both adapters
 * lose the far ridge equally at 50 m (PRD §8.4 fog hook is P4; the Aura
 * adapter records the capability until then).
 */
export const outdoorSky: Prd07SceneSpec = {
  ...base("prd07-outdoor-sky", 707, "Outdoor sky + fog", "noon preetham sky, exp2 fog equal at 50 m"),
  qrFlags: ["vfx", "vfx.sky"] as const,
  primaryCriterion: "atmosphere",
  primaryRegion: "frame",
  time: 0.2,
  camera: { position: [0, 2.2, 14], target: [0, 4.0, -20], fov: 55, near: 0.05, far: 300 },
  background: { kind: "color", color: "#89b6d8" },
  lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.2 }],
  skyPreetham: { elevationDeg: 62, azimuthDeg: 195, turbidity: 5 },
  fog: { mode: "exp2", color: "#a8c2d8", density: 0.012 },
  objects: [
    {
      kind: "primitive",
      name: "ground",
      shape: "plane",
      size: [80, 1, 80],
      position: [0, 0, -10],
      material: { color: "#4a5a38", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "mid ridge",
      shape: "box",
      size: [60, 4, 4],
      position: [0, 1.5, -45],
      material: { color: "#3d4a52", roughness: 1, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "primitive",
      name: "far ridge",
      shape: "box",
      size: [80, 6, 4],
      position: [0, 2.5, -95],
      material: { color: "#4a5a68", roughness: 1, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    }
  ]
};

/**
 * S15 — height fog: C-21 default (σd 0.004, σh 0.008, b 0.2) over receding
 * ridges — fog thickens toward the ground plane, sky cleared above. The three
 * adapter approximates with FogExp2 at the eye-level equivalent density.
 */
export const fogHeight: Prd07SceneSpec = {
  ...base("prd07-fog-height", 708, "Height fog", "C-21 default height fog over receding ridges"),
  qrFlags: ["vfx", "vfx.sky", "vfx.fog"] as const,
  primaryCriterion: "atmosphere",
  primaryRegion: "frame",
  time: 0.2,
  camera: { position: [0, 1.6, 10], target: [0, 2.5, -20], fov: 55, near: 0.05, far: 300 },
  background: { kind: "color", color: "#a9bccf" },
  lights: [
    { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.35 },
    { kind: "directional", name: "sun", color: "#fff2e0", intensity: 0.9, position: [30, 40, 20], target: [0, 0, -30], castShadow: true }
  ],
  skyPreetham: { elevationDeg: 55, azimuthDeg: 210, turbidity: 4 },
  fog: { mode: "height", color: "#a9bccf", density: 0.004, heightDensity: 0.008, heightFalloff: 0.2, start: 2 },
  objects: [
    {
      kind: "primitive",
      name: "ground",
      shape: "plane",
      size: [120, 1, 120],
      position: [0, 0, -30],
      material: { color: "#4a5a38", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "near ridge",
      shape: "box",
      size: [60, 5, 5],
      position: [0, 2, -35],
      material: { color: "#43515c", roughness: 1, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "primitive",
      name: "far ridge",
      shape: "box",
      size: [80, 8, 5],
      position: [0, 3.5, -80],
      material: { color: "#4a5a68", roughness: 1, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    }
  ]
};

/**
 * S16 — fog transition: `app.atmosphere.setFog(from)` then `setFog(to,
 * {transitionSeconds: 1})` mid-clock — captured at the midpoint so the frame
 * blends the two densities/colours. Aura-only (C-30).
 */
export const fogTransition: Prd07SceneSpec = {
  ...base("prd07-fog-transition", 709, "Fog transition", "setFog transitionSeconds midpoint capture"),
  qrFlags: ["vfx", "vfx.fog"] as const,
  primaryCriterion: "atmosphere",
  primaryRegion: "frame",
  time: 0.9, // atSeconds (0.4) + half the 1 s transition → midpoint capture
  admittedAsReference: false,
  camera: { position: [0, 2.0, 12], target: [0, 2.0, -15], fov: 55, near: 0.05, far: 200 },
  background: { kind: "color", color: "#a9bccf" },
  lights: [{ kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.35 }],
  fogTransition: {
    from: { mode: "exp", color: "#a9bccf", density: 0.008 },
    to: { mode: "exp", color: "#c97b3a", density: 0.03, transitionSeconds: 1 },
    atSeconds: 0.4
  },
  objects: [
    {
      kind: "primitive",
      name: "ground",
      shape: "plane",
      size: [80, 1, 80],
      position: [0, 0, -20],
      material: { color: "#4a5a38", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "markers",
      shape: "box",
      size: [50, 6, 4],
      position: [0, 2.5, -55],
      material: { color: "#5a4a3a", roughness: 1, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    }
  ]
};

/**
 * S17 — underwater absorption: per-channel σ = (0.42, 0.11, 0.07) extinguishes
 * red in ~10 m; objects sink into the blue-green water colour. Aura-only —
 * three has no per-channel absorption fog (C-30).
 */
export const underwater: Prd07SceneSpec = {
  ...base("prd07-underwater", 710, "Underwater absorption fog", "σ=(0.42,0.11,0.07) absorption — red dies by 10 m"),
  qrFlags: ["vfx", "vfx.fog"] as const,
  primaryCriterion: "atmosphere",
  primaryRegion: "frame",
  time: 0.2,
  admittedAsReference: false,
  camera: { position: [0, 1.6, 8], target: [0, 1.2, -12], fov: 55, near: 0.05, far: 120 },
  background: { kind: "color", color: "#0a2438" },
  lights: [{ kind: "ambient", name: "ambient", color: "#7fb3d5", intensity: 0.5 }],
  fog: { mode: "absorption", color: "#0a2438", density: 0, absorption: [0.42, 0.11, 0.07] },
  objects: [
    {
      kind: "primitive",
      name: "seabed",
      shape: "plane",
      size: [60, 1, 60],
      position: [0, -0.2, -25],
      material: { color: "#c2b49a", roughness: 1, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "primitive",
      name: "red buoy",
      shape: "sphere",
      size: [2, 2, 2],
      position: [-3, 1.2, -14],
      material: { color: "#c23b2a", roughness: 0.6, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "primitive",
      name: "far buoy",
      shape: "sphere",
      size: [2, 2, 2],
      position: [3, 1.2, -28],
      material: { color: "#c23b2a", roughness: 0.6, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    }
  ]
};

/**
 * S8 — prd07-rain-night (§17.1): street block, rain intensity 0.7, splashes
 * on y = 0, 8-frame strip. Aura lowers `effects.rain` to the §8.2 volume +
 * splash emitter (WeatherVolume); three r185 uses instanced streaks.
 */
export const rainNight: Prd07SceneSpec = {
  ...base("prd07-rain-night", 711, "Rain at night", "S8 — street block rain intensity 0.7, splashes on y=0"),
  qrFlags: ["vfx"] as const,
  primaryCriterion: "particles",
  primaryRegion: "frame",
  strip: { frames: 8, intervalMs: 125, orbitDegrees: 0 },
  camera: { position: [0, 2.4, 12], target: [0, 1.6, -6], fov: 50, near: 0.05, far: 120 },
  background: { kind: "color", color: "#070a12" },
  lights: [
    { kind: "ambient", name: "ambient", color: "#3a4560", intensity: 0.18 },
    { kind: "point", name: "streetlight", color: "#ffd9a0", intensity: 1.2, position: [2.5, 4.5, -3], range: 18 }
  ],
  objects: [
    {
      kind: "primitive",
      name: "street",
      shape: "plane",
      size: [30, 1, 40],
      position: [0, 0, -8],
      material: { color: "#141821", roughness: 0.55, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "block left",
      shape: "box",
      size: [4, 9, 10],
      position: [-6, 4.5, -10],
      material: { color: "#1d2330", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "primitive",
      name: "block right",
      shape: "box",
      size: [4, 12, 10],
      position: [6, 6, -14],
      material: { color: "#222a38", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    { kind: "weather", name: "night rain", weather: "rain", intensity: 0.7, seed: 4451, wind: [0.6, 0, -0.15] }
  ]
};

/**
 * S9 — prd07-snow: open snow field, sway + fall, depth-varied flake sizes.
 * three r185 uses Points + a snowflake map.
 */
export const snowScene: Prd07SceneSpec = {
  ...base("prd07-snow", 712, "Snow field", "S9 — open field snowfall, 8-frame strip"),
  qrFlags: ["vfx"] as const,
  primaryCriterion: "particles",
  primaryRegion: "frame",
  strip: { frames: 8, intervalMs: 125, orbitDegrees: 0 },
  camera: { position: [0, 1.8, 9], target: [0, 1.2, -4], fov: 50, near: 0.05, far: 80 },
  background: { kind: "color", color: "#aebfcf" },
  lights: [
    { kind: "ambient", name: "ambient", color: "#dfe9f5", intensity: 0.55 },
    { kind: "directional", name: "winter sun", color: "#fff4e0", intensity: 0.7, position: [20, 30, 10], target: [0, 0, -10], castShadow: true }
  ],
  objects: [
    {
      kind: "primitive",
      name: "snow field",
      shape: "plane",
      size: [60, 1, 60],
      position: [0, -0.05, -10],
      material: { color: "#e8eef6", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "distant tree",
      shape: "box",
      size: [1.5, 6, 1.5],
      position: [-8, 3, -18],
      material: { color: "#4a4438", roughness: 1, metalness: 0 },
      castShadow: false,
      receiveShadow: false
    },
    { kind: "weather", name: "snowfall", weather: "snow", intensity: 0.65, seed: 8203 }
  ]
};

/**
 * I4 — prd07-volumetric-shafts: hangar with window gaps; sun shafts through
 * the openings (§6.7 froxel pass on High/Ultra; analytic fog otherwise).
 * three approximation: FogExp2 + additive cone meshes.
 */
export const volumetricShafts: Prd07SceneSpec = {
  ...base("prd07-volumetric-shafts", 713, "Volumetric light shafts", "I4 — hangar window shafts, froxel grid on High/Ultra"),
  qrFlags: ["vfx", "vfx.fog", "vfx.volumetric"] as const,
  primaryCriterion: "atmosphere",
  primaryRegion: "frame",
  camera: { position: [0, 1.6, 10], target: [0, 3.2, -10], fov: 55, near: 0.05, far: 100 },
  background: { kind: "color", color: "#0a0c10" },
  lights: [
    { kind: "ambient", name: "ambient", color: "#223044", intensity: 0.12 },
    { kind: "directional", name: "sun through windows", color: "#ffe9c4", intensity: 1.4, position: [30, 26, -20], target: [0, 0, -8], castShadow: true }
  ],
  volumetric: { density: 0.012, color: "#cfd8e6", anisotropy: 0.62, intensity: 0.8 },
  fogVolumes: [{ position: [0, 4, -8], size: [30, 10, 24], density: 0.02, shape: "box" }],
  objects: [
    {
      kind: "primitive",
      name: "hangar floor",
      shape: "plane",
      size: [40, 1, 40],
      position: [0, 0, -8],
      material: { color: "#20242c", roughness: 0.85, metalness: 0.05 },
      castShadow: false,
      receiveShadow: true
    },
    // Wall segments with window gaps between them.
    { kind: "primitive", name: "wall a", shape: "box", size: [2.6, 9, 1], position: [-4.4, 4.5, -12], material: { color: "#2a3038", roughness: 0.9, metalness: 0 }, castShadow: true, receiveShadow: false },
    { kind: "primitive", name: "wall b", shape: "box", size: [2.6, 9, 1], position: [-1.0, 4.5, -12], material: { color: "#2a3038", roughness: 0.9, metalness: 0 }, castShadow: true, receiveShadow: false },
    { kind: "primitive", name: "wall c", shape: "box", size: [2.6, 9, 1], position: [2.4, 4.5, -12], material: { color: "#2a3038", roughness: 0.9, metalness: 0 }, castShadow: true, receiveShadow: false },
    { kind: "primitive", name: "roof", shape: "box", size: [12, 0.4, 14], position: [-0.4, 9.2, -10], material: { color: "#1c2129", roughness: 0.95, metalness: 0 }, castShadow: true, receiveShadow: false },
    { kind: "lightCone", name: "shaft", position: [-1.7, 8.5, -11.4], direction: [-0.5, -1, 0.25], length: 10, coneAngle: 0.35, color: "#ffe9c4", intensity: 0.7 }
  ]
};

/**
 * I4 — prd07-lit-smoke: smoke column lit by two local lights — darker in
 * shadow, rim-lit at the edges. three: Points + point lights.
 */
export const litSmoke: Prd07SceneSpec = {
  ...base("prd07-lit-smoke", 714, "Lit smoke column", "I4 — smoke lit by local lights; darker in shadow, rim-lit"),
  qrFlags: ["vfx", "vfx.volumetric"] as const,
  primaryCriterion: "atmosphere",
  primaryRegion: "frame",
  camera: { position: [0, 2.0, 8], target: [0, 2.2, 0], fov: 50, near: 0.05, far: 60 },
  background: { kind: "color", color: "#06080c" },
  lights: [
    { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.04 },
    { kind: "point", name: "warm key", color: "#ffb267", intensity: 1.6, position: [2.2, 3.4, 1.5], range: 14 },
    { kind: "point", name: "cool rim", color: "#7fb0ff", intensity: 1.1, position: [-2.6, 2.8, -1.5], range: 14 }
  ],
  volumetric: { density: 0.008, color: "#3a4250", anisotropy: 0.5, intensity: 0.5 },
  objects: [
    {
      kind: "primitive",
      name: "ground",
      shape: "plane",
      size: [24, 1, 24],
      position: [0, 0, 0],
      material: { color: "#14161c", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "emitterSet",
      name: "smoke column",
      emitters: [
        { name: "smoke", seed: 6613, count: 900, center: [0, 0.2, 0], radius: 0.5, height: 4.5, color: "#566072", size: 0.35, blending: "alpha", rate: 360 }
      ]
    }
  ]
};

/**
 * I2 — prd07-soft-particles (promotion row): smoke column crossing the
 * ground plane and a box — soft depth fade on vs the hard intersection.
 * Flag-off and C-01-stub runs emit SOFT_DEPTH_PENDING once.
 */
export const softParticles: Prd07SceneSpec = {
  ...base("prd07-soft-particles", 715, "Soft particles through geometry", "I2 — smoke through ground + box; soft fade vs hard cut"),
  qrFlags: ["vfx"] as const,
  primaryCriterion: "vfx",
  primaryRegion: "frame",
  softParticles: true,
  camera: { position: [0, 1.5, 6.5], target: [0, 0.8, 0], fov: 50, near: 0.05, far: 40 },
  background: { kind: "color", color: "#0b0d12" },
  lights: [
    { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.12 },
    { kind: "directional", name: "key", color: "#fff0d8", intensity: 0.8, position: [10, 12, 8], target: [0, 0, 0], castShadow: true }
  ],
  objects: [
    {
      kind: "primitive",
      name: "ground",
      shape: "plane",
      size: [16, 1, 16],
      position: [0, 0, 0],
      material: { color: "#252a33", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "crossing box",
      shape: "box",
      size: [2.4, 0.5, 2.4],
      position: [0.4, 0.9, -0.5],
      material: { color: "#37404e", roughness: 0.8, metalness: 0 },
      castShadow: true,
      receiveShadow: true
    },
    {
      kind: "emitterSet",
      name: "soft smoke",
      emitters: [
        { name: "through ground", seed: 9107, count: 500, center: [-1, -0.6, 0.3], radius: 0.7, height: 3.2, color: "#8894a8", size: 0.3, blending: "alpha", rate: 200 },
        { name: "through box", seed: 9209, count: 500, center: [0.4, 0.1, -0.5], radius: 0.5, height: 2.4, color: "#8894a8", size: 0.28, blending: "alpha", rate: 200 }
      ]
    }
  ]
};

/**
 * I2 — prd07-water-interleave (promotion row): a transparent water sheet
 * between two emitter columns — particles must sort behind and in front of
 * it correctly with the forward transparent queue.
 */
export const waterInterleave: Prd07SceneSpec = {
  ...base("prd07-water-interleave", 716, "Particle/water interleave", "I2 — emitters in front of and behind a transparent water sheet"),
  qrFlags: ["vfx"] as const,
  primaryCriterion: "vfx",
  primaryRegion: "frame",
  camera: { position: [0, 1.6, 7.5], target: [0, 1.0, -1], fov: 50, near: 0.05, far: 40 },
  background: { kind: "color", color: "#08131c" },
  lights: [{ kind: "ambient", name: "ambient", color: "#9fc6e0", intensity: 0.25 }],
  objects: [
    {
      kind: "primitive",
      name: "backdrop",
      shape: "plane",
      size: [16, 1, 16],
      position: [0, -0.4, 0],
      material: { color: "#16212e", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "water sheet",
      shape: "plane",
      size: [10, 5, 0.02],
      position: [0, 1.4, -1],
      rotation: [-0.35, 0, 0],
      material: { color: "#2b6a8f", roughness: 0.15, metalness: 0, opacity: 0.45 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "emitterSet",
      name: "interleave emitters",
      emitters: [
        { name: "in front", seed: 3311, count: 400, center: [0, 0.6, 1.4], radius: 0.8, height: 1.8, color: "#ffce7a", size: 0.12, blending: "alpha", rate: 160 },
        { name: "behind", seed: 3317, count: 400, center: [0, 0.6, -3.0], radius: 0.8, height: 1.8, color: "#7ac9ff", size: 0.12, blending: "alpha", rate: 160 },
        { name: "above water", seed: 3323, count: 300, center: [0, 2.8, -1], radius: 0.6, height: 1.2, color: "#c9ecff", size: 0.1, blending: "additive", rate: 120 }
      ]
    }
  ]
};

/**
 * D1 — prd07-decals (P6-T7): §6.9 merged decal pass — scorch, tyre-track
 * and puddle decals on the asphalt floor, a crack decal on the wall, one
 * runtime decal spawned through `app.effects.decal`, and a surface-oriented
 * trail riding the same pass under A3D_QR_VFX_DECALS (P6-T3). All five
 * decals share no texture → one flat page → one draw call under the flag.
 * Three side: r185 DecalGeometry projected onto the host primitives.
 */
export const decalsScene: Prd07SceneSpec = {
  ...base("prd07-decals", 717, "Merged decals + surface trail", "§6.9 — five decals in one merged draw; surface trail via decal pass"),
  qrFlags: ["vfx", "vfx.decals"] as const,
  primaryCriterion: "vfx",
  primaryRegion: "frame",
  camera: { position: [0, 3.2, 7.2], target: [0, 0.4, -0.6], fov: 50, near: 0.05, far: 60 },
  background: { kind: "color", color: "#0b0d11" },
  lights: [
    { kind: "ambient", name: "ambient", color: "#ffffff", intensity: 0.2 },
    { kind: "directional", name: "key", color: "#ffe9c8", intensity: 1.0, position: [8, 10, 6], target: [0, 0, 0], castShadow: true }
  ],
  objects: [
    {
      kind: "primitive",
      name: "asphalt floor",
      shape: "plane",
      size: [18, 1, 18],
      position: [0, 0, 0],
      material: { color: "#23262c", roughness: 0.95, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "back wall",
      shape: "box",
      size: [18, 4, 0.4],
      position: [0, 2, -4.6],
      material: { color: "#2c3038", roughness: 0.85, metalness: 0 },
      castShadow: true,
      receiveShadow: true
    },
    {
      kind: "decal",
      name: "scorch mark",
      target: "asphalt floor",
      position: [-1.6, 0.012, 0.5],
      normal: [0, 1, 0],
      size: [1.8, 1.8],
      color: "#0a0a0c",
      opacity: 0.92
    },
    {
      kind: "decal",
      name: "tyre track",
      target: "asphalt floor",
      position: [1.2, 0.012, 1.2],
      normal: [0, 1, 0],
      size: [0.55, 3.2],
      color: "#14161a",
      opacity: 0.8,
      rotationDeg: 14
    },
    {
      kind: "decal",
      name: "puddle",
      target: "asphalt floor",
      position: [2.4, 0.012, -0.8],
      normal: [0, 1, 0],
      size: [1.4, 1.0],
      color: "#3a4c60",
      opacity: 0.7
    },
    {
      kind: "decal",
      name: "wall crack",
      target: "back wall",
      position: [-2.4, 1.6, -4.39],
      normal: [0, 0, 1],
      size: [1.6, 2.2],
      color: "#101216",
      opacity: 0.9
    },
    {
      kind: "decal",
      name: "impact splash",
      target: "asphalt floor",
      position: [0.4, 0.014, 2.2],
      normal: [0, 1, 0],
      size: [0.9, 0.9],
      color: "#c33b22",
      opacity: 0.85,
      runtime: true
    },
    {
      kind: "trail",
      name: "skid trail",
      path: [[-3, 0.02, 3.4], [-1.4, 0.02, 2.2], [0.2, 0.02, 1.4], [1.8, 0.02, 0.9], [3.2, 0.02, 0.7]],
      color: "#2a2e36",
      width: 0.34,
      orientation: "surface"
    }
  ]
};

export const prd07Specs = {
  "prd07-particles-fountain": particlesFountain,
  "prd07-flipbook": flipbook,
  "prd07-particles-stress": particlesStress,
  "prd07-impact-library": impactLibrary,
  "prd07-trails-beams": trailsBeams,
  "prd07-sky-timeofday": skyTimeOfDay,
  "prd07-outdoor-sky": outdoorSky,
  "prd07-fog-height": fogHeight,
  "prd07-fog-transition": fogTransition,
  "prd07-underwater": underwater,
  "prd07-rain-night": rainNight,
  "prd07-snow": snowScene,
  "prd07-volumetric-shafts": volumetricShafts,
  "prd07-lit-smoke": litSmoke,
  "prd07-soft-particles": softParticles,
  "prd07-water-interleave": waterInterleave,
  "prd07-decals": decalsScene
} as const;

export type Prd07SceneId = keyof typeof prd07Specs;

export function getPrd07SceneSpec(id: string): Prd07SceneSpec {
  const spec = (prd07Specs as Record<string, Prd07SceneSpec>)[id];
  if (!spec) throw new Error(`Unknown prd07 scene "${id}". Known: ${Object.keys(prd07Specs).join(", ")}`);
  return spec;
}
