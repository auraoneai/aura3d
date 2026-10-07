/**
 * Lane prd06 scene `prd06-character-hero` (PRD-06 T4.4): the §17.2 hero bar
 * scene — the admitted lane hero (`auraClashPlayerRig`, 65 joints / 12
 * clips / no morph targets) on a receive-shadow ground under C-10 lighting
 * with a scripted follow camera (C-22 `camera.follow`), driven through the
 * §17.2 8 s sequence (idle → walk → run → stop → jump → land → idle) by a
 * scripted controller + the T4.2 `characterAnimation` binding.
 *
 * Per-PRD wiring: foot IK on the UE-style leg chains against flat analytic
 * ground, distributed look-at (spine_03/neck_01/Head) at a scripted moving
 * target, one spring chain (`foot_l → ball_l → ball_leaf_l` — the toe leaf
 * lags the planted foot; the rig ships no accessory bones so toe lag is the
 * measurable settle signal), and no morph visemes (the rig has no morph
 * targets — §6.9 applies them only when the hero has them).
 *
 * `admittedAsReference: false` — acceptance is the §17.2 automated gate set
 * computed from engine socket()/animationState() samples, not image parity.
 */
import type { SceneSpec } from "../../shared/types";
import { RESOLUTION } from "../../shared/types";
import type { CharacterHeroClipMap } from "../../aura3d/scenes/prd06/characterHero";
import { characterHeroClips } from "../../aura3d/scenes/prd06/characterHero";

/** Scripted §17.2 sequence phase. `speed` is the controller's target m/s. */
export interface CharacterHeroPhase {
  readonly name: "idle" | "walk" | "run" | "stop" | "air" | "land";
  readonly from: number;
  readonly to: number;
  readonly speed: number;
}

export const CHARACTER_HERO_DURATION = 8;

/** §17.2 walk → run → stop → jump → land → idle, scripted over 8 s. */
export const CHARACTER_HERO_SEQUENCE: readonly CharacterHeroPhase[] = [
  { name: "idle", from: 0.0, to: 1.2, speed: 0 },
  { name: "walk", from: 1.2, to: 3.2, speed: 1.6 },
  { name: "run",  from: 3.2, to: 5.0, speed: 4.4 },
  { name: "stop", from: 5.0, to: 5.9, speed: 0 },
  { name: "air",  from: 5.9, to: 6.6, speed: 0 },
  { name: "land", from: 6.6, to: 8.0, speed: 0 }
] as const;

export function characterHeroPhaseAt(t: number): CharacterHeroPhase {
  return CHARACTER_HERO_SEQUENCE.find((phase) => t >= phase.from && t < phase.to) ?? CHARACTER_HERO_SEQUENCE[CHARACTER_HERO_SEQUENCE.length - 1]!;
}

const LEG = {
  left: { side: "left", hip: "thigh_l", knee: "calf_l", ankle: "foot_l", ankleHeight: 0.09 },
  right: { side: "right", hip: "thigh_r", knee: "calf_r", ankle: "foot_r", ankleHeight: 0.09 }
} as const;

export interface CharacterHeroSpec extends SceneSpec {
  readonly owner: "prd06";
  /** Never a reference baseline — acceptance is the §17.2 metric gates (T4.4). */
  readonly admittedAsReference: false;
  readonly characterHero: {
    /** Model object name and the runtime-node id the binding + probes use. */
    readonly modelName: string;
    readonly runtimeId: string;
    /** §6.9 action → embedded clip names on the lane hero (T4.3 map). */
    readonly clipMap: CharacterHeroClipMap;
    readonly sequence: readonly CharacterHeroPhase[];
    readonly walkSpeed: number;
    readonly runSpeed: number;
    /** Foot-IK legs (UE bone names) + pelvis; flat ground height 0. */
    readonly footIk: {
      readonly legs: readonly (typeof LEG)[keyof typeof LEG][];
      readonly pelvis: string;
    };
    /** Distributed look-at chain + scripted target node name. */
    readonly lookAt: {
      readonly bones: readonly { readonly bone: string; readonly weight: number }[];
      readonly targetNodeName: string;
      readonly yawLimitDeg: number;
      readonly pitchLimitDeg: number;
      readonly halfLife: number;
    };
    /** T4.1 spring chain — foot→ball→toe-leaf (toe lag is the settle signal). */
    readonly springChain: {
      readonly bones: readonly string[];
      readonly stiffness: number;
      readonly damping: number;
      readonly relativeDamping: number;
      readonly gravityScale: number;
      readonly substepHz: number;
    };
    /** Scripted follow camera: trailing offset + smooth-follow lag. */
    readonly followCamera: {
      readonly distance: number;
      readonly height: number;
      readonly leadSeconds: number;
    };
    /** Hero forward speed per sequence phase (drives kinematic XZ motion). */
    readonly travelAxis: readonly [number, number];
    /** Hero start position (walk/run advance along travelAxis). */
    readonly startPosition: readonly [number, number, number];
  };
}

export const prd06CharacterHero: CharacterHeroSpec = {
  id: "prd06-character-hero",
  index: 110,
  title: "Character hero — §17.2 scripted sequence",
  purpose:
    "Lane hero running the 8 s §17.2 sequence through characterAnimation: " +
    "blend-tree locomotion, airborne states, foot IK, look-at, one spring " +
    "chain, follow camera; measured by socket()/animationState() samples",
  resolution: RESOLUTION,
  camera: { position: [2.6, 1.7, 3.2], target: [0, 1.0, 0], fov: 42, near: 0.05, far: 60 },
  background: { kind: "color", color: "#1d2026" },
  environment: { hdri: "studioSmall08", intensity: 0.65, rotation: 0 },
  toneMapping: "aces-filmic",
  exposure: 1,
  lights: [
    { kind: "directional", name: "sun", color: "#fff1dc", intensity: 2.8, position: [3.5, 6, 2.5], target: [0, 0.5, 0], castShadow: true },
    { kind: "directional", name: "fill", color: "#b8c8e0", intensity: 0.5, position: [-4, 3, -2], target: [0, 0.8, 0], castShadow: false }
  ],
  objects: [
    {
      kind: "primitive",
      name: "ground",
      shape: "box",
      size: [16, 0.05, 10],
      position: [0, -0.025, 0],
      material: { color: "#596069", roughness: 0.92, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "primitive",
      name: "hero look target",
      shape: "sphere",
      size: [0.12, 0.12, 0.12],
      position: [1.2, 1.5, 1.4],
      material: { color: "#ffb454", roughness: 0.4, metalness: 0, emissive: "#ff8c28", emissiveIntensity: 2.2 },
      castShadow: false,
      receiveShadow: false
    },
    {
      kind: "model",
      name: "hero",
      asset: "auraClashPlayerRig",
      position: [0, 0, 0],
      rotation: [0, Math.PI / 2, 0],
      castShadow: true,
      receiveShadow: true
    }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 6, bias: -0.0005, normalBias: 0.02 },
  time: 0,
  settleFrames: 0,
  owner: "prd06",
  qrFlags: ["animation"],
  admittedAsReference: false,
  characterHero: {
    modelName: "hero",
    runtimeId: "prd06-character-hero-hero",
    clipMap: characterHeroClips,
    sequence: CHARACTER_HERO_SEQUENCE,
    walkSpeed: 1.6,
    runSpeed: 4.4,
    footIk: {
      legs: [LEG.left, LEG.right],
      pelvis: "pelvis"
    },
    lookAt: {
      bones: [
        { bone: "spine_03", weight: 0.2 },
        { bone: "neck_01", weight: 0.3 },
        { bone: "Head", weight: 0.5 }
      ],
      targetNodeName: "hero look target",
      yawLimitDeg: 75,
      // Jump_Loop pitches the head ~50° down at entry — a 45° cone leaves a
      // permanent ~5° clamp deficit against a level target and fails §17.2.
      pitchLimitDeg: 60,
      // ≤5° residual against the ~55°/s scripted sweep at sub-60fps samples.
      halfLife: 0.02
    },
    springChain: {
      // foot_l anchors; ball_l aims at the simulated ball_leaf_l particle.
      // (A 2-bone chain would write nothing — bones[1..n-2] needs ≥3.)
      bones: ["foot_l", "ball_l", "ball_leaf_l"],
      stiffness: 60,
      damping: 10,
      relativeDamping: 12,
      gravityScale: 0.15,
      substepHz: 60
    },
    followCamera: { distance: 3.4, height: 1.6, leadSeconds: 0.25 },
    travelAxis: [1, 0],
    startPosition: [-1.5, 0, 0]
  },
  masks: ["silhouette-edge"],
  primaryRegion: "silhouette-edge"
};
