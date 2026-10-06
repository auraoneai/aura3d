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

export type Prd07ObjectSpec = ObjectSpec | FlipbookObjectSpec | EmitterSetSpec;

export interface Prd07SceneSpec extends Omit<SceneSpec, "objects"> {
  readonly objects: readonly Prd07ObjectSpec[];
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

export const prd07Specs = {
  "prd07-particles-fountain": particlesFountain,
  "prd07-flipbook": flipbook,
  "prd07-particles-stress": particlesStress
} as const;

export type Prd07SceneId = keyof typeof prd07Specs;

export function getPrd07SceneSpec(id: string): Prd07SceneSpec {
  const spec = (prd07Specs as Record<string, Prd07SceneSpec>)[id];
  if (!spec) throw new Error(`Unknown prd07 scene "${id}". Known: ${Object.keys(prd07Specs).join(", ")}`);
  return spec;
}
