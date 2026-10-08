/**
 * Lane prd06 scenes `prd06-perf-tier-{low,medium,high,ultra}` (PRD-06 §13,
 * S12): the stated per-tier load on a ground plane under one directional
 * shadow light and no post — the scene the GPU skin+morph+shadow delta and
 * the CPU-anim tier budget are measured on (5 alternating on/off runs × 300
 * frames, 95% bootstrap CI upper bound, per §13).
 *
 * The load column is actor count with live looping animation; hero actors
 * additionally carry foot IK + the rig's toe spring chain (the §13 notes
 * columns' springs/IK scope, to the extent this rig supports them).
 *
 * Honest deltas from the §13 load column (recorded in `perfTier.approximations`
 * on every spec so the evidence file can restate them):
 *  - every actor is the admitted lane hero `auraClashPlayerRig` (65 joints,
 *    ~15k tris, no morph targets): NPCs are heavier than the ≤ 40-joint/≤ 8k-tri
 *    NPC column, so a passing budget is conservative on actor CPU; the
 *    morph-active caps (8/16/32/64) are not exercised here — morph load is
 *    covered by `prd06-morph-face`;
 *  - High/Ultra heroes are 65 joints vs the ≤ 200-joint column — under-loaded
 *    on joints, matched on actor count;
 *  - spring chains ride the rig's only leaf chains (foot→ball→toe-leaf,
 *    left+right) — 2 chains per hero where the table allows 4 on High.
 */
import type { SceneSpec, ModelObjectSpec, ModelSpringChainSpec } from "../../shared/types";
import { RESOLUTION } from "../../shared/types";

export type PerfTierName = "low" | "medium" | "high" | "ultra";

interface PerfTierLoad {
  readonly heroes: number;
  readonly npcs: number;
  /** §13 budget columns (ms per frame) + memory cap. */
  readonly cpuAnimMs: number;
  readonly gpuSkinMorphShadowMs: number;
  readonly memoryMB: number;
  /** §13 notes column, restated for the capture report. */
  readonly notes: readonly string[];
  /** Springs wired on each hero (see approximations for the count cap). */
  readonly springChainsPerHero: number;
  readonly springSubstepHz: number;
}

const PERF_TIER_LOADS: Record<PerfTierName, PerfTierLoad> = {
  low: {
    heroes: 1, npcs: 4,
    cpuAnimMs: 1.0, gpuSkinMorphShadowMs: 1.0, memoryMB: 12,
    notes: [
      "morph active ≤ 8, normals off for NPC morphs; skinned shadow casters: hero only",
      "springs 30 Hz, 1 chain; IK: hero feet only"
    ],
    springChainsPerHero: 1, springSubstepHz: 30
  },
  medium: {
    heroes: 1, npcs: 8,
    cpuAnimMs: 1.5, gpuSkinMorphShadowMs: 1.8, memoryMB: 32,
    notes: [
      "morph ≤ 16; all characters cast; foot IK on 4 nearest",
      "spring rate/chains unspecified in §13 for medium — carries the low tier's 30 Hz × 1 chain per hero"
    ],
    springChainsPerHero: 1, springSubstepHz: 30
  },
  high: {
    heroes: 2, npcs: 16,
    cpuAnimMs: 2.5, gpuSkinMorphShadowMs: 3.0, memoryMB: 64,
    notes: [
      "morph ≤ 32 (ARKit 52 face → 32 active); look-at on all",
      "springs 60 Hz, 4 chains/hero — this rig has only 2 leaf chains, so 2 are wired (see approximations)"
    ],
    springChainsPerHero: 2, springSubstepHz: 60
  },
  ultra: {
    heroes: 2, npcs: 32,
    cpuAnimMs: 4.0, gpuSkinMorphShadowMs: 5.0, memoryMB: 128,
    notes: [
      "morph ≤ 64; velocity for all skinned",
      "spring rate/chains unspecified in §13 for ultra — carries the high tier's 60 Hz × 2 chains per hero"
    ],
    springChainsPerHero: 2, springSubstepHz: 60
  }
};

/** UE-style leg chains on the lane hero (same as `prd06-character-hero`). */
const LEGS = [
  { side: "left" as const, hip: "thigh_l", knee: "calf_l", ankle: "foot_l", ankleHeight: 0.09 },
  { side: "right" as const, hip: "thigh_r", knee: "calf_r", ankle: "foot_r", ankleHeight: 0.09 }
];

/** Toe-lag spring chains — the rig's only leaf chains (character-hero §7.1). */
const SPRING_CHAINS: readonly ModelSpringChainSpec[] = [
  { bones: ["foot_l", "ball_l", "ball_leaf_l"], stiffness: 60, damping: 10, relativeDamping: 12, gravityScale: 0.15, substepHz: 60 },
  { bones: ["foot_r", "ball_r", "ball_leaf_r"], stiffness: 60, damping: 10, relativeDamping: 12, gravityScale: 0.15, substepHz: 60 }
];

const APPROXIMATIONS = [
  "every actor is auraClashPlayerRig (65 joints, ~15k tris, no morph targets) — NPCs are heavier than the §13 ≤ 40-joint/≤ 8k-tri column, so a pass is conservative on actor CPU",
  "the rig ships no morph targets — the morph-active cap is unexercised here; morph load is covered by prd06-morph-face",
  "high/ultra heroes run 65 joints vs the ≤ 200-joint column — under-loaded on joints, matched on actor count",
  "springs ride the rig's two leaf toe chains (foot→ball→toe-leaf); the §13 high-tier allowance of 4 chains/hero cannot be met by this rig"
] as const;

function heroObject(tier: PerfTierName, index: number, position: readonly [number, number, number], chainsPerHero: number, springHz: number): ModelObjectSpec {
  const runtimeId = `prd06-perf-tier-${tier}-hero-${index}`;
  const springChains = SPRING_CHAINS.slice(0, chainsPerHero).map((chain) => ({ ...chain, substepHz: springHz }));
  return {
    kind: "model",
    name: `hero ${index}`,
    asset: "auraClashPlayerRig",
    position,
    castShadow: true,
    receiveShadow: true,
    animation: {
      clip: "Sprint_Loop",
      time: 0,
      loop: true,
      runtimeId,
      footIk: { legs: LEGS, pelvis: "pelvis", runtimeId },
      springChains
    }
  };
}

function npcObject(index: number, position: readonly [number, number, number]): ModelObjectSpec {
  return {
    kind: "model",
    name: `npc ${index}`,
    asset: "auraClashPlayerRig",
    position,
    castShadow: true,
    receiveShadow: true,
    animation: { clip: "Walk_Loop", time: (index % 6) * 0.31, loop: true }
  };
}

function perfTierSpec(tier: PerfTierName, index: number): PerfTierSpec {
  const load = PERF_TIER_LOADS[tier];
  const objects: (ModelObjectSpec | SceneSpec["objects"][number])[] = [
    {
      kind: "primitive",
      name: "ground",
      shape: "plane",
      size: [48, 1, 32],
      position: [0, 0, -6],
      material: { color: "#5b6068", roughness: 0.92, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    }
  ];
  for (let i = 0; i < load.heroes; i += 1) {
    objects.push(heroObject(tier, i, [(i - (load.heroes - 1) / 2) * 2.0, 0, 0], load.springChainsPerHero, load.springSubstepHz));
  }
  // NPCs in 8-wide rows behind the heroes.
  for (let i = 0; i < load.npcs; i += 1) {
    const row = Math.floor(i / 8);
    const col = i % 8;
    objects.push(npcObject(i, [(col - 3.5) * 1.5 + (row % 2) * 0.75, 0, -2.4 - row * 1.6]));
  }
  const span = Math.max(load.heroes, 8) * 1.6;
  return {
    id: `prd06-perf-tier-${tier}`,
    index,
    title: `Perf tier ${tier} — §13 stated load`,
    purpose:
      `${load.heroes} hero(es) + ${load.npcs} NPCs skinned+animating on a ground ` +
      `plane under one directional shadow, no post — the §13 tier budget scene ` +
      `(CPU anim ≤ ${load.cpuAnimMs} ms, GPU skin+morph+shadow ≤ ${load.gpuSkinMorphShadowMs} ms)`,
    resolution: RESOLUTION,
    camera: {
      position: [0, 2.6 + load.npcs * 0.14, 6 + span * 0.55],
      target: [0, 1.0, -3],
      fov: 46, near: 0.05, far: 120
    },
    background: { kind: "color", color: "#1c1f25" },
    toneMapping: "aces-filmic",
    exposure: 1,
    lights: [
      { kind: "directional", name: "sun", color: "#fff1dc", intensity: 2.6, position: [4, 7, 3], target: [0, 0.8, -3], castShadow: true }
    ],
    objects,
    shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 14, bias: -0.0005, normalBias: 0.02 },
    terrain: { kind: "flat" },
    time: 1.5,
    settleFrames: 30,
    owner: "prd06",
    admittedAsReference: false,
    qrFlags: ["animation"],
    masks: ["silhouette-edge"],
    primaryRegion: "frame",
    perfTier: {
      tier,
      heroes: load.heroes,
      npcs: load.npcs,
      budgets: {
        cpuAnimMs: load.cpuAnimMs,
        gpuSkinMorphShadowMs: load.gpuSkinMorphShadowMs,
        memoryMB: load.memoryMB,
        bundleDeltaKb: 8
      },
      featureNotes: load.notes,
      approximations: APPROXIMATIONS,
      springChainsPerHero: load.springChainsPerHero,
      springSubstepHz: load.springSubstepHz,
      heroClip: "Sprint_Loop",
      npcClip: "Walk_Loop"
    }
  };
}

export interface PerfTierSpec extends SceneSpec {
  readonly owner: "prd06";
  readonly admittedAsReference: false;
  readonly perfTier: {
    readonly tier: PerfTierName;
    readonly heroes: number;
    readonly npcs: number;
    readonly budgets: {
      readonly cpuAnimMs: number;
      readonly gpuSkinMorphShadowMs: number;
      readonly memoryMB: number;
      /** §13 net bundle gate (gz) shared by every tier. */
      readonly bundleDeltaKb: number;
    };
    readonly featureNotes: readonly string[];
    readonly approximations: readonly string[];
    readonly springChainsPerHero: number;
    readonly springSubstepHz: number;
    readonly heroClip: string;
    readonly npcClip: string;
  };
}

export const prd06PerfTierLow: PerfTierSpec = perfTierSpec("low", 111);
export const prd06PerfTierMedium: PerfTierSpec = perfTierSpec("medium", 112);
export const prd06PerfTierHigh: PerfTierSpec = perfTierSpec("high", 113);
export const prd06PerfTierUltra: PerfTierSpec = perfTierSpec("ultra", 114);
