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

export type Prd07ObjectSpec =
  | ObjectSpec
  | FlipbookObjectSpec
  | EmitterSetSpec
  | BurstSheetSpec
  | TrailObjectSpec
  | BeamObjectSpec
  | LightConeObjectSpec
  | AuroraObjectSpec
  | MeshParticlesObjectSpec;

export interface Prd07SceneSpec extends Omit<SceneSpec, "objects"> {
  readonly objects: readonly Prd07ObjectSpec[];
  /** C-30: scene judged absolutely, never used for a parity claim (no three adapter). */
  readonly admittedAsReference?: boolean;
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

export const prd07Specs = {
  "prd07-particles-fountain": particlesFountain,
  "prd07-flipbook": flipbook,
  "prd07-particles-stress": particlesStress,
  "prd07-impact-library": impactLibrary,
  "prd07-trails-beams": trailsBeams
} as const;

export type Prd07SceneId = keyof typeof prd07Specs;

export function getPrd07SceneSpec(id: string): Prd07SceneSpec {
  const spec = (prd07Specs as Record<string, Prd07SceneSpec>)[id];
  if (!spec) throw new Error(`Unknown prd07 scene "${id}". Known: ${Object.keys(prd07Specs).join(", ")}`);
  return spec;
}
