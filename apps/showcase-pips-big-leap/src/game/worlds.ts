// Pip's Big Leap — world course specs.
//
// Every course runs from spawn toward -Z (the shoulder camera sits behind Pip
// at +Z when yaw = 0). Platform `y` is the TOP surface; rises ≤ ~1.1 m are a
// full jump, ≤ ~0.5 m a half jump, gaps ≤ ~2.4 m a running jump (double-jump
// worlds push to ~4 m). Six sun-seeds per world; three sit on optional
// challenge lines per the PRD.

import type { WorldSpec } from "./types";

// Time-trial medals come from medals.ts (expert run + 20% = gold, 1.5x and 2x
// gold for silver and bronze); tests/unit/pips-big-leap/medals.test.ts keeps
// these literals equal to the derivation.
const medals = (gold: number, silver: number, bronze: number) => ({ gold, silver, bronze }) as const;

export const WORLDS: readonly WorldSpec[] = [
  // ---------------------------------------------------------------- ACADEMY
  {
    id: "academy",
    order: 0,
    title: "Jump Academy",
    shortName: "Academy",
    subtitle: "Headmaster Sprig's obstacle gauntlet — every move Pip knows.",
    look: "outdoor-day",
    lookOverrides: { fogDensityScale: 0 },
    background: "#2a5c8a",
    spawn: [0, 0.6, 0.8],
    spawnYaw: Math.PI,
    lowerBound: -6,
    gateSeeds: 4,
    seedGoal: 6,
    medals: medals(19, 29, 38),
    moveSpeed: 5.2,
    ambientFx: "petals",
    unlockHint: "Jump Academy — clear the gauntlet to open the practice gate.",
    platforms: [
      { id: "start", x: 0, y: 0.6, z: 0, w: 8, d: 8, kind: "earth" },
      { id: "hop-1", x: 0, y: 0.6, z: -6.0, w: 3.0, d: 2.8, kind: "grass" },
      { id: "hop-2", x: 1.2, y: 0.95, z: -9.8, w: 2.8, d: 2.6, kind: "grass" },
      { id: "hop-3", x: -1.0, y: 1.35, z: -13.6, w: 2.8, d: 2.6, kind: "grass" },
      { id: "dive-pad", x: 0, y: 1.35, z: -18.0, w: 3.2, d: 2.8, kind: "earth" },
      { id: "gap-landing", x: 0, y: 1.0, z: -24.5, w: 4.4, d: 3, kind: "grass" },
      { id: "mover-lane", x: 0, y: 1.0, z: -30.5, w: 2.4, d: 2.4, kind: "wood",
        mover: { axis: "x", amplitude: 3.2, period: 3.4 } },
      { id: "timed-1", x: -2.4, y: 1.3, z: -36, w: 2.2, d: 2.2, kind: "stone",
        timed: { period: 2.8, onFrac: 0.62 } },
      { id: "timed-2", x: 2.4, y: 1.3, z: -39.5, w: 2.2, d: 2.2, kind: "stone",
        timed: { period: 2.8, onFrac: 0.62, phase: 1.4 } },
      { id: "spring-lane", x: 0, y: 1.3, z: -44, w: 4, d: 4, kind: "earth" },
      { id: "high-ledge", x: 0, y: 4.6, z: -47.5, w: 3.4, d: 3, kind: "grass" },
      { id: "glide-run", x: 0, y: 4.2, z: -53, w: 2.2, d: 2.2, kind: "leaf" },
      { id: "glide-end", x: 0, y: 2.4, z: -60, w: 5, d: 5, kind: "earth" },
      { id: "gate-approach", x: 0, y: 2.4, z: -66, w: 6, d: 5, kind: "grass" }
    ],
    hazards: [
      { id: "thorns-a", x: -2.0, y: 0.85, z: -8.4, w: 1.4, d: 1.2, type: "thorns" },
      { id: "thorns-b", x: 0.6, y: 1.24, z: -21.4, w: 3.4, d: 1.6, type: "thorns", respawn: true }
    ],
    springs: [{ id: "spring-academy", x: 0, y: 1.3, z: -44, power: 15.6 }],
    waters: [],
    seeds: [
      { id: "ac-seed-1", x: 1.2, y: 1.6, z: -9.8 },
      { id: "ac-seed-2", x: -1.0, y: 2.0, z: -13.6 },
      { id: "ac-seed-3", x: 0, y: 1.7, z: -30.5 },
      { id: "ac-seed-4", x: -2.4, y: 1.95, z: -36 },
      { id: "ac-seed-5", x: 0, y: 5.3, z: -47.5 },
      { id: "ac-seed-6", x: 0, y: 4.9, z: -53 }
    ],
    acorns: [
      { id: "ac-coin-1", x: 0, y: 1.25, z: -6.0 },
      { id: "ac-coin-2", x: 0, y: 1.95, z: -18.0 },
      { id: "ac-coin-3", x: 0, y: 1.55, z: -24.5 },
      { id: "ac-coin-4", x: 2.4, y: 1.95, z: -39.5 },
      { id: "ac-coin-5", x: 0, y: 3.2, z: -51 },
      { id: "ac-coin-6", x: 0, y: 3.0, z: -57 }
    ],
    hearts: [{ id: "ac-heart", x: 0, y: 2.1, z: -44 }],
    checkpoints: [
      { id: "ac-cp-1", x: 0, y: 1.0, z: -24.5 },
      { id: "ac-cp-2", x: 0, y: 1.3, z: -44 },
      { id: "ac-cp-3", x: 0, y: 2.4, z: -60 }
    ],
    gate: { id: "ac-gate", x: 0, y: 2.4, z: -66 },
    decor: [
      { id: "ac-tree-1", kind: "tree", x: -3.2, y: 0.6, z: -1.5, s: 1.25 },
      { id: "ac-tree-2", kind: "conifer", x: 3.2, y: 0.6, z: -1.2, s: 1.15 },
      { id: "ac-flower-1", kind: "flower", x: 2.2, y: 0.6, z: -2, s: 0.9 },
      { id: "ac-rock-1", kind: "rock", x: -2.6, y: 0.6, z: -3, s: 0.95 },
      { id: "ac-hawk-1", kind: "hawk", x: -2.2, y: 2.6, z: -8.0, s: 1.1, yaw: 0.35 },
      { id: "ac-banner", kind: "banner", x: 0, y: 3.4, z: -66.8, s: 1.4 }
    ],
    backdrops: [{ asset: "verdant", x: -14, y: -1.5, z: -34, scale: 10, yaw: 0.5 }],
    npcs: [{ id: "ac-npc", x: 1.45, y: 0.6, z: -0.4, who: "helper", clip: "idle" }]
  },

  // ------------------------------------------------- W1 WHISPERING FOREST
  {
    id: "w1",
    order: 1,
    title: "Whispering Forest",
    shortName: "Forest",
    subtitle: "Mushroom caps and mossy ledges where the first seeds fell.",
    look: "outdoor-day",
    lookOverrides: { fogDensityScale: 0 },
    background: "#1e4d78",
    spawn: [0, 0.62, 0.8],
    spawnYaw: Math.PI,
    lowerBound: -7,
    gateSeeds: 4,
    seedGoal: 6,
    medals: medals(21, 32, 42),
    moveSpeed: 5.3,
    ambientFx: "spores",
    platforms: [
      { id: "start", x: 0, y: 0.62, z: 0, w: 9, d: 8, kind: "grass" },
      { id: "log-1", x: 0, y: 0.68, z: -5.8, w: 3.6, d: 2.8, kind: "earth" },
      { id: "cap-1", x: 0.6, y: 0.98, z: -9.6, w: 3.2, d: 2.8, kind: "mushroom" },
      { id: "cap-2", x: -0.8, y: 1.32, z: -13.4, w: 3.0, d: 2.8, kind: "mushroom" },
      { id: "cap-3", x: 0.8, y: 1.65, z: -17.2, w: 3.0, d: 2.8, kind: "mushroom" },
      { id: "fork-main", x: 0, y: 1.85, z: -22, w: 5.0, d: 3.6, kind: "earth" },
      { id: "fork-left", x: -4.6, y: 2.15, z: -25.5, w: 2.6, d: 2.6, kind: "leaf" },
      { id: "fork-left-2", x: -7.4, y: 2.5, z: -29.5, w: 2.4, d: 2.4, kind: "leaf" },
      { id: "mid-vale", x: 0, y: 1.55, z: -29, w: 5, d: 4, kind: "grass" },
      { id: "mover-fern", x: 2.8, y: 1.55, z: -35, w: 2.5, d: 2.5, kind: "leaf",
        mover: { axis: "z", amplitude: 2.8, period: 4.2 } },
      { id: "stump", x: -0.6, y: 1.9, z: -41, w: 3, d: 3, kind: "earth" },
      { id: "cap-high", x: -3.8, y: 2.6, z: -44.6, w: 2.3, d: 2.3, kind: "mushroom" },
      { id: "spring-grove", x: 0.5, y: 1.9, z: -47.5, w: 4, d: 3.6, kind: "grass" },
      { id: "canopy-1", x: 0.5, y: 5.2, z: -50.5, w: 2.6, d: 2.6, kind: "leaf" },
      { id: "canopy-2", x: 0.2, y: 4.6, z: -56, w: 2.4, d: 2.4, kind: "leaf" },
      { id: "canopy-3", x: -0.4, y: 3.6, z: -61.5, w: 2.6, d: 2.6, kind: "leaf" },
      { id: "gate-approach", x: 0, y: 2.6, z: -67.5, w: 7, d: 6, kind: "grass" }
    ],
    hazards: [
      { id: "thorns-1", x: -2.4, y: 0.86, z: -8.2, w: 1.4, d: 1.2, type: "thorns" },
      { id: "thorns-2", x: 0, y: 1.8, z: -25.9, w: 3.2, d: 1.6, type: "thorns" },
      { id: "bog", x: 0, y: 1.79, z: -33.8, w: 5.5, d: 2.2, type: "thorns", respawn: true }
    ],
    springs: [{ id: "spring-w1", x: 0.5, y: 1.9, z: -47.5, power: 15.6 }],
    waters: [],
    seeds: [
      { id: "w1-seed-1", x: 0.6, y: 1.65, z: -9.6 },
      { id: "w1-seed-2", x: -0.8, y: 2.0, z: -13.4 },
      { id: "w1-seed-3", x: -7.4, y: 3.2, z: -29.5 },
      { id: "w1-seed-4", x: 2.8, y: 2.25, z: -35 },
      { id: "w1-seed-5", x: -3.8, y: 3.3, z: -44.6 },
      { id: "w1-seed-6", x: 0.5, y: 5.9, z: -50.5 }
    ],
    acorns: [
      { id: "w1-coin-1", x: 0, y: 1.22, z: -2.4 },
      { id: "w1-coin-2", x: 0, y: 1.32, z: -5.8 },
      { id: "w1-coin-3", x: 0.8, y: 2.3, z: -17.2 },
      { id: "w1-coin-4", x: 0, y: 2.5, z: -22 },
      { id: "w1-coin-5", x: -4.6, y: 2.85, z: -25.5 },
      { id: "w1-coin-6", x: 0, y: 2.15, z: -29 },
      { id: "w1-coin-7", x: -0.6, y: 2.5, z: -41 },
      { id: "w1-coin-8", x: 0.5, y: 2.55, z: -47.5 }
    ],
    hearts: [{ id: "w1-heart", x: -0.6, y: 2.6, z: -41 }],
    checkpoints: [
      { id: "w1-cp-1", x: 0, y: 1.85, z: -22 },
      { id: "w1-cp-2", x: 0.5, y: 1.9, z: -47.5 },
      { id: "w1-cp-3", x: 0, y: 2.6, z: -67.5 }
    ],
    gate: { id: "w1-gate", x: 0, y: 2.6, z: -68.5 },
    decor: [
      { id: "w1-t1", kind: "tree", x: -3.5, y: 0.62, z: -1.2, s: 1.35 },
      { id: "w1-t2", kind: "conifer", x: 3.5, y: 0.62, z: -1.4, s: 1.25 },
      { id: "w1-t3", kind: "conifer", x: -3.8, y: 0.62, z: -6.8, s: 1.3 },
      { id: "w1-t4", kind: "tree", x: 3.9, y: 0.62, z: -8.2, s: 1.35 },
      { id: "w1-t5", kind: "tree", x: -4.8, y: 0.8, z: -15.5, s: 1.45 },
      { id: "w1-t6", kind: "conifer", x: 4.8, y: 0.9, z: -19.5, s: 1.4 },
      { id: "w1-t7", kind: "tree", x: 5.8, y: 0.4, z: -32, s: 1.3 },
      { id: "w1-start-flag", kind: "banner", x: -2.2, y: 0.62, z: -2.8, s: 0.95 },
      { id: "w1-vista-arch", kind: "arch", x: 0, y: 1.85, z: -23.2, s: 1.15 },
      { id: "w1-hawk-1", kind: "hawk", x: -2.1, y: 2.55, z: -7.4, s: 1.15, yaw: 0.45 },
      { id: "w1-hawk-2", kind: "hawk", x: 2.4, y: 3.1, z: -14.8, s: 1.1, yaw: -0.45 },
      { id: "w1-m1", kind: "mushroom", x: -2.5, y: 0.62, z: -3.4, s: 0.95 },
      { id: "w1-m2", kind: "mushroom", x: 2.8, y: 1.55, z: -28, s: 0.7 },
      { id: "w1-m3", kind: "mushroom", x: -3.2, y: 1.9, z: -46.5, s: 1.1 },
      { id: "w1-f1", kind: "flower", x: 1.9, y: 0.62, z: -2.6, s: 0.95 },
      { id: "w1-f2", kind: "flower", x: -1.4, y: 1.55, z: -30, s: 0.8 },
      { id: "w1-r1", kind: "rock", x: 2.8, y: 0.62, z: -3.2, s: 1.0 },
      { id: "w1-banner", kind: "banner", x: 0, y: 3.6, z: -68.6, s: 1.5 }
    ],
    backdrops: [{ asset: "verdant", x: -14, y: -1.2, z: -28, scale: 11, yaw: 0.55 }],
    npcs: [{ id: "w1-npc", x: 1.45, y: 0.62, z: -0.4, who: "sidekick", clip: "idle" }]
  },

  // --------------------------------------------------- W2 SUNMILL WHARF
  {
    id: "w2",
    order: 2,
    title: "Sunmill Wharf",
    shortName: "Wharf",
    subtitle: "Docks, rope walks and windmill blades over the millpond.",
    look: "golden-hour",
    lookOverrides: { fogDensityScale: 0 },
    background: "#2a5c8a",
    spawn: [0, 0.68, 0.8],
    spawnYaw: Math.PI,
    lowerBound: -5.5,
    gateSeeds: 4,
    seedGoal: 6,
    medals: medals(24, 36, 48),
    moveSpeed: 5.4,
    ambientFx: "dust",
    doubleJumpGrant: true,
    unlockHint: "Double-jump unlocked — press SPACE again in mid-air!",
    platforms: [
      { id: "start", x: 0, y: 0.68, z: 0, w: 9, d: 8, kind: "dock" },
      { id: "dock-1", x: 0.8, y: 0.68, z: -6.6, w: 3.2, d: 2.6, kind: "wood" },
      { id: "post-1", x: -1.6, y: 1.05, z: -10.4, w: 2.2, d: 2.2, kind: "wood" },
      { id: "post-2", x: 1.4, y: 1.45, z: -14, w: 2.2, d: 2.2, kind: "wood" },
      { id: "wharf-1", x: 0, y: 1.45, z: -19, w: 5.4, d: 3.6, kind: "dock" },
      { id: "blade-lane", x: -3.2, y: 1.85, z: -25, w: 2.4, d: 2.4, kind: "rope",
        mover: { axis: "y", amplitude: 1.5, period: 3.6 } },
      { id: "blade-high", x: -5.4, y: 3.4, z: -29.5, w: 2.4, d: 2.4, kind: "wood" },
      { id: "pond-edge", x: 0.4, y: 1.55, z: -30.5, w: 5, d: 4, kind: "dock" },
      { id: "raft-1", x: -1.8, y: 1.05, z: -36.5, w: 2.4, d: 2.4, kind: "rope",
        mover: { axis: "x", amplitude: 2.6, period: 4.4 } },
      { id: "raft-2", x: 2.2, y: 1.05, z: -40.5, w: 2.4, d: 2.4, kind: "rope",
        mover: { axis: "x", amplitude: 2.6, period: 4.4, phase: 2.2 } },
      { id: "silo", x: 0, y: 1.9, z: -46, w: 4.4, d: 3.6, kind: "wood" },
      { id: "mill-top", x: -3.6, y: 3.4, z: -50, w: 2.6, d: 2.6, kind: "wood" },
      { id: "far-dock", x: 0, y: 2.2, z: -55.5, w: 4.6, d: 3.6, kind: "dock" },
      { id: "long-hop", x: 0, y: 2.2, z: -61.5, w: 2.6, d: 2.6, kind: "wood" },
      { id: "gate-approach", x: 0, y: 2.5, z: -67.5, w: 7, d: 6, kind: "dock" }
    ],
    hazards: [
      { id: "millpond-1", x: 0.4, y: 1.79, z: -34.5, w: 5, d: 2.4, type: "frost", respawn: true },
      { id: "splinters", x: 0, y: 1.69, z: -21.6, w: 3.4, d: 1.6, type: "thorns" }
    ],
    springs: [{ id: "spring-w2", x: 0, y: 1.9, z: -46, power: 11.2 }],
    waters: [
      { id: "pond", x: 0.4, y: 1.42, z: -30.5, w: 6.4, d: 5, depth: 1.8 }
    ],
    seeds: [
      { id: "w2-seed-1", x: -1.6, y: 1.75, z: -10.4 },
      { id: "w2-seed-2", x: 0, y: 2.15, z: -19 },
      { id: "w2-seed-3", x: -5.4, y: 4.1, z: -29.5 },
      { id: "w2-seed-4", x: 0.4, y: 1.7, z: -30.5 },
      { id: "w2-seed-5", x: -3.6, y: 4.1, z: -50 },
      { id: "w2-seed-6", x: 0, y: 2.9, z: -61.5 }
    ],
    acorns: [
      { id: "w2-coin-1", x: 0.8, y: 1.35, z: -6.6 },
      { id: "w2-coin-2", x: 1.4, y: 2.1, z: -14 },
      { id: "w2-coin-3", x: -3.2, y: 2.9, z: -25 },
      { id: "w2-coin-4", x: -1.8, y: 1.75, z: -36.5 },
      { id: "w2-coin-5", x: 2.2, y: 1.75, z: -40.5 },
      { id: "w2-coin-6", x: 0, y: 2.55, z: -46 },
      { id: "w2-coin-7", x: 0, y: 2.85, z: -55.5 },
      { id: "w2-coin-8", x: 0, y: 3.1, z: -64 }
    ],
    hearts: [{ id: "w2-heart", x: 0, y: 2.55, z: -46 }],
    checkpoints: [
      { id: "w2-cp-1", x: 0, y: 1.45, z: -19 },
      { id: "w2-cp-2", x: 0, y: 1.9, z: -46 },
      { id: "w2-cp-3", x: 0, y: 2.5, z: -67.5 }
    ],
    gate: { id: "w2-gate", x: 0, y: 2.5, z: -68.5 },
    decor: [
      { id: "w2-mill-1", kind: "windmill", x: -6.5, y: 0.4, z: -28, s: 1.6 },
      { id: "w2-mill-2", kind: "windmill", x: 7, y: 0.4, z: -48, s: 1.3 },
      { id: "w2-sail", kind: "sail", x: 3.4, y: 1.45, z: -19.8, s: 1 },
      { id: "w2-crate-1", kind: "crate", x: 2.6, y: 0.68, z: -1, s: 0.9 },
      { id: "w2-crate-2", kind: "crate", x: -2.4, y: 1.45, z: -18, s: 0.8 },
      { id: "w2-barrel-1", kind: "barrel", x: 2.9, y: 0.68, z: -4, s: 0.85 },
      { id: "w2-barrel-2", kind: "barrel", x: -1.6, y: 2.2, z: -55, s: 0.8 },
      { id: "w2-lantern", kind: "lantern", x: 0, y: 3.6, z: -68.4, s: 1.4 },
      { id: "w2-banner", kind: "banner", x: 0, y: 3.5, z: -68.6, s: 1.4 }
    ],
    backdrops: [{ asset: "cartoon", x: 14, y: -2.4, z: -40, scale: 12, yaw: -0.7 }],
    npcs: [{ id: "w2-npc", x: 1.8, y: 0.68, z: -0.6, who: "helper", clip: "idle" }]
  },

  // ------------------------------------------------- W3 CLOUDSPAN WHARF
  {
    id: "w3",
    order: 3,
    title: "Cloudspan Wharf",
    shortName: "Clouds",
    subtitle: "Sky-docks strung between cumulus spires and fan towers.",
    look: "alpine-snow",
    lookOverrides: { fogDensityScale: 0 },
    background: "#2a5c8a",
    spawn: [0, 0.7, 0.8],
    spawnYaw: Math.PI,
    lowerBound: -8,
    gateSeeds: 4,
    seedGoal: 6,
    medals: medals(23, 35, 46),
    moveSpeed: 5.4,
    airControl: 0.8,
    ambientFx: "petals",
    platforms: [
      { id: "start", x: 0, y: 0.7, z: 0, w: 8.6, d: 8, kind: "sky" },
      { id: "puff-1", x: -1, y: 0.95, z: -6.6, w: 2.6, d: 2.6, kind: "cloud" },
      { id: "puff-2", x: 1.6, y: 1.3, z: -10.6, w: 2.4, d: 2.4, kind: "cloud" },
      { id: "puff-3", x: -1.4, y: 1.7, z: -14.4, w: 2.4, d: 2.4, kind: "cloud" },
      { id: "deck-1", x: 0, y: 1.7, z: -19.5, w: 5.2, d: 3.6, kind: "sky" },
      { id: "fan-lift", x: 0, y: 1.7, z: -25.5, w: 2.6, d: 2.6, kind: "cloud",
        mover: { axis: "y", amplitude: 1.9, period: 3.8 } },
      { id: "spire-1", x: -4, y: 3.6, z: -29, w: 2.5, d: 2.5, kind: "cloud" },
      { id: "deck-2", x: 0.6, y: 2.2, z: -33.5, w: 5, d: 3.6, kind: "sky" },
      { id: "drift-1", x: -2.6, y: 2.2, z: -39.5, w: 2.4, d: 2.4, kind: "cloud",
        mover: { axis: "x", amplitude: 3, period: 4 } },
      { id: "drift-2", x: 2.8, y: 2.55, z: -43.5, w: 2.4, d: 2.4, kind: "cloud",
        timed: { period: 3.2, onFrac: 0.6 } },
      { id: "tower-base", x: 0, y: 2.55, z: -49, w: 4.6, d: 3.6, kind: "sky" },
      { id: "tower-mid", x: 3.2, y: 3.9, z: -52.5, w: 2.4, d: 2.4, kind: "cloud" },
      { id: "tower-top", x: 0, y: 5.3, z: -56, w: 2.6, d: 2.6, kind: "cloud" },
      { id: "glide-1", x: -0.8, y: 4.5, z: -62, w: 2.4, d: 2.4, kind: "cloud" },
      { id: "glide-2", x: 0.6, y: 3.4, z: -67.5, w: 2.6, d: 2.6, kind: "cloud" },
      { id: "gate-approach", x: 0, y: 2.6, z: -73.5, w: 7, d: 6, kind: "sky" }
    ],
    hazards: [
      { id: "storm-1", x: 0.6, y: 2.44, z: -37, w: 4.4, d: 1.8, type: "frost", respawn: true },
      { id: "hail", x: 0, y: 1.94, z: -22.4, w: 3, d: 1.4, type: "frost" }
    ],
    springs: [{ id: "spring-w3", x: 0, y: 2.55, z: -49, power: 11.6 }],
    waters: [],
    seeds: [
      { id: "w3-seed-1", x: 1.6, y: 2.0, z: -10.6 },
      { id: "w3-seed-2", x: -1.4, y: 2.4, z: -14.4 },
      { id: "w3-seed-3", x: -4, y: 4.3, z: -29 },
      { id: "w3-seed-4", x: -2.6, y: 2.9, z: -39.5 },
      { id: "w3-seed-5", x: 3.2, y: 4.6, z: -52.5 },
      { id: "w3-seed-6", x: -0.8, y: 5.1, z: -62 }
    ],
    acorns: [
      { id: "w3-coin-1", x: -1, y: 1.6, z: -6.6 },
      { id: "w3-coin-2", x: 0, y: 2.35, z: -19.5 },
      { id: "w3-coin-3", x: 0, y: 3.9, z: -25.5 },
      { id: "w3-coin-4", x: 0.6, y: 2.85, z: -33.5 },
      { id: "w3-coin-5", x: 2.8, y: 3.2, z: -43.5 },
      { id: "w3-coin-6", x: 0, y: 6.0, z: -56 },
      { id: "w3-coin-7", x: 0.6, y: 4.0, z: -67.5 },
      { id: "w3-coin-8", x: 0, y: 3.2, z: -70.5 }
    ],
    hearts: [{ id: "w3-heart", x: 0.6, y: 2.9, z: -33.5 }],
    checkpoints: [
      { id: "w3-cp-1", x: 0, y: 1.7, z: -19.5 },
      { id: "w3-cp-2", x: 0, y: 2.55, z: -49 },
      { id: "w3-cp-3", x: 0, y: 2.6, z: -73.5 }
    ],
    gate: { id: "w3-gate", x: 0, y: 2.6, z: -74.5 },
    decor: [
      { id: "w3-cloud-1", kind: "cloud", x: -6, y: 0.2, z: -12, s: 1.8 },
      { id: "w3-cloud-2", kind: "cloud", x: 6, y: 0.6, z: -26, s: 1.5 },
      { id: "w3-cloud-3", kind: "cloud", x: -7, y: 1.2, z: -44, s: 2 },
      { id: "w3-cloud-4", kind: "cloud", x: 6.5, y: 0.8, z: -60, s: 1.6 },
      { id: "w3-fan-1", kind: "fan", x: 3, y: 1.7, z: -20.5, s: 1.2 },
      { id: "w3-fan-2", kind: "fan", x: -2.8, y: 2.55, z: -48, s: 1.1 },
      { id: "w3-sail", kind: "sail", x: -2.6, y: 1.7, z: -19, s: 0.9 },
      { id: "w3-lantern", kind: "lantern", x: 0, y: 3.6, z: -74.4, s: 1.4 },
      { id: "w3-banner", kind: "banner", x: 0, y: 3.6, z: -74.6, s: 1.5 }
    ],
    backdrops: [{ asset: "sidescroll", x: 18, y: -3, z: -42, scale: 14, yaw: -0.5 }],
    npcs: [{ id: "w3-npc", x: 1.45, y: 0.7, z: -0.4, who: "sidekick", clip: "idle" }]
  },

  // ----------------------------------------------------- W4 EMBER CELLAR
  {
    id: "w4",
    order: 4,
    title: "Ember Cellar",
    shortName: "Ember",
    subtitle: "Basalt vaults over a lava lake — geyser lifts and ember drifts.",
    look: "interior-industrial",
    lookOverrides: { fogDensityScale: 0 },
    background: "#2a1512",
    spawn: [0, 0.7, 0.8],
    spawnYaw: Math.PI,
    lowerBound: -4.5,
    gateSeeds: 4,
    seedGoal: 6,
    medals: medals(23, 35, 46),
    moveSpeed: 5.4,
    ambientFx: "embers",
    swimPocket: true,
    platforms: [
      { id: "start", x: 0, y: 0.7, z: 0, w: 8.6, d: 8, kind: "stone" },
      { id: "basalt-1", x: 1, y: 0.95, z: -6.6, w: 2.8, d: 2.6, kind: "stone" },
      { id: "basalt-2", x: -1.6, y: 1.3, z: -10.6, w: 2.4, d: 2.4, kind: "stone" },
      { id: "ember-hop", x: 1.6, y: 1.6, z: -14.4, w: 2.4, d: 2.4, kind: "ember" },
      { id: "vault-1", x: 0, y: 1.6, z: -19.5, w: 5.4, d: 3.8, kind: "stone" },
      { id: "geyser-1", x: 0, y: 1.6, z: -25.5, w: 2.6, d: 2.6, kind: "metal",
        mover: { axis: "y", amplitude: 2.1, period: 3.4 } },
      { id: "lava-shore", x: -0.6, y: 2.0, z: -31, w: 5.4, d: 4, kind: "stone" },
      { id: "swim-in", x: -2.4, y: 1.55, z: -37, w: 2.4, d: 2.4, kind: "stone" },
      { id: "swim-out", x: 2.4, y: 1.55, z: -43, w: 2.4, d: 2.4, kind: "stone" },
      { id: "chain-1", x: -0.4, y: 2.0, z: -48.5, w: 4.8, d: 3.6, kind: "stone" },
      { id: "vent-1", x: -3.4, y: 2.4, z: -52, w: 2.3, d: 2.3, kind: "metal",
        timed: { period: 3.0, onFrac: 0.58, phase: 0.9 } },
      { id: "vent-2", x: 0.4, y: 2.75, z: -55.5, w: 2.3, d: 2.3, kind: "metal",
        timed: { period: 3.0, onFrac: 0.58, phase: 2.1 } },
      { id: "kiln-top", x: 0, y: 3.1, z: -60.5, w: 4.6, d: 3.6, kind: "ember" },
      { id: "drop-1", x: 0, y: 2.9, z: -66, w: 2.6, d: 2.6, kind: "stone" },
      { id: "gate-approach", x: 0, y: 2.6, z: -72, w: 7, d: 6, kind: "stone" }
    ],
    hazards: [
      { id: "lava-1", x: 0, y: 1.2, z: -28.5, w: 9, d: 3.4, type: "lava", respawn: true },
      { id: "lava-2", x: 0, y: 1.05, z: -40, w: 7, d: 4.6, type: "lava", respawn: true },
      { id: "ember-1", x: 0, y: 1.84, z: -22.4, w: 3.2, d: 1.4, type: "ember" },
      { id: "ember-2", x: -0.4, y: 2.24, z: -50.6, w: 3.2, d: 1.4, type: "ember" }
    ],
    springs: [{ id: "spring-w4", x: -0.4, y: 2.0, z: -48.5, power: 11.4 }],
    waters: [
      { id: "cool-pool", x: 0, y: 1.45, z: -40, w: 6.4, d: 4.6, depth: 2 }
    ],
    seeds: [
      { id: "w4-seed-1", x: -1.6, y: 2.0, z: -10.6 },
      { id: "w4-seed-2", x: 0, y: 2.3, z: -19.5 },
      { id: "w4-seed-3", x: 0, y: 3.9, z: -25.5 },
      { id: "w4-seed-4", x: 0, y: 1.7, z: -40 },
      { id: "w4-seed-5", x: -3.4, y: 3.1, z: -52 },
      { id: "w4-seed-6", x: 0, y: 3.8, z: -60.5 }
    ],
    acorns: [
      { id: "w4-coin-1", x: 1, y: 1.6, z: -6.6 },
      { id: "w4-coin-2", x: 1.6, y: 2.25, z: -14.4 },
      { id: "w4-coin-3", x: -0.6, y: 2.7, z: -31 },
      { id: "w4-coin-4", x: -2.4, y: 2.2, z: -37 },
      { id: "w4-coin-5", x: 2.4, y: 2.2, z: -43 },
      { id: "w4-coin-6", x: -0.4, y: 2.7, z: -48.5 },
      { id: "w4-coin-7", x: 0.4, y: 3.45, z: -55.5 },
      { id: "w4-coin-8", x: 0, y: 3.55, z: -66 }
    ],
    hearts: [{ id: "w4-heart", x: -0.6, y: 2.7, z: -31 }],
    checkpoints: [
      { id: "w4-cp-1", x: 0, y: 1.6, z: -19.5 },
      { id: "w4-cp-2", x: -0.4, y: 2.0, z: -48.5 },
      { id: "w4-cp-3", x: 0, y: 2.6, z: -72 }
    ],
    gate: { id: "w4-gate", x: 0, y: 2.6, z: -73 },
    decor: [
      { id: "w4-pillar-1", kind: "pillar", x: -3.6, y: 0.7, z: -1, s: 1.4 },
      { id: "w4-pillar-2", kind: "pillar", x: 3.6, y: 0.7, z: -1, s: 1.4 },
      { id: "w4-pillar-3", kind: "pillar", x: -4.4, y: 1.6, z: -19.5, s: 1.2 },
      { id: "w4-pillar-4", kind: "pillar", x: 4.4, y: 1.6, z: -19.5, s: 1.2 },
      { id: "w4-arch", kind: "arch", x: 0, y: 1.6, z: -21.8, s: 1.5 },
      { id: "w4-vent-1", kind: "vent", x: -3, y: 0.7, z: -8, s: 1 },
      { id: "w4-vent-2", kind: "vent", x: 3.2, y: 2.0, z: -32.5, s: 0.9 },
      { id: "w4-lantern-1", kind: "lantern", x: -2.4, y: 3.4, z: -19.5, s: 1.1 },
      { id: "w4-lantern-2", kind: "lantern", x: 0, y: 3.8, z: -72.6, s: 1.4 },
      { id: "w4-banner", kind: "banner", x: 0, y: 3.7, z: -73.2, s: 1.5 }
    ],
    backdrops: [{ asset: "palace", x: -16, y: -2.5, z: -40, scale: 12, yaw: 0.7 }],
    npcs: [{ id: "w4-npc", x: 1.45, y: 0.7, z: -0.4, who: "helper", clip: "idle" }]
  },

  // ---------------------------------------------------- W5 HOLLOW PALACE
  {
    id: "w5",
    order: 5,
    title: "Hollow Palace",
    shortName: "Palace",
    subtitle: "A crown-high climb to Brambleback's throne — and the gate beyond.",
    look: "interior-warm",
    lookOverrides: { fogDensityScale: 0 },
    background: "#241a2e",
    spawn: [0, 0.7, 0.8],
    spawnYaw: Math.PI,
    lowerBound: -6,
    gateSeeds: 4,
    seedGoal: 6,
    medals: medals(40, 60, 80),
    moveSpeed: 5.5,
    ambientFx: "dust",
    boss: true,
    unlockHint: "Brambleback stirs — stomp him three times when he tires to unlatch the Sun-Gate.",
    platforms: [
      { id: "start", x: 0, y: 0.7, z: 0, w: 8.6, d: 8, kind: "marble" },
      { id: "stair-1", x: -0.8, y: 1.0, z: -6.4, w: 3, d: 2.6, kind: "marble" },
      { id: "stair-2", x: 1.4, y: 1.4, z: -10.2, w: 2.5, d: 2.5, kind: "marble" },
      { id: "stair-3", x: -1.4, y: 1.85, z: -14, w: 2.5, d: 2.5, kind: "marble" },
      { id: "landing-1", x: 0, y: 1.85, z: -19, w: 5.4, d: 3.8, kind: "marble" },
      { id: "lift-1", x: 0, y: 1.85, z: -25, w: 2.6, d: 2.6, kind: "gold",
        mover: { axis: "y", amplitude: 2, period: 4 } },
      { id: "balcony-1", x: -3.6, y: 3.9, z: -28.5, w: 2.6, d: 2.6, kind: "marble" },
      { id: "balcony-2", x: 0.4, y: 2.4, z: -32.5, w: 5, d: 3.6, kind: "marble" },
      { id: "turn-1", x: -2.6, y: 2.4, z: -38.5, w: 2.4, d: 2.4, kind: "gold",
        mover: { axis: "x", amplitude: 3, period: 4.6 } },
      { id: "turn-2", x: 3, y: 2.75, z: -42.5, w: 2.4, d: 2.4, kind: "gold",
        timed: { period: 3.4, onFrac: 0.62, phase: 1 } },
      { id: "gallery", x: 0, y: 2.75, z: -48, w: 4.8, d: 3.6, kind: "marble" },
      { id: "spire-1", x: -3, y: 4.1, z: -51.5, w: 2.4, d: 2.4, kind: "marble" },
      { id: "spire-2", x: 0.4, y: 4.9, z: -55, w: 2.4, d: 2.4, kind: "marble" },
      { id: "throne-step", x: 0, y: 3.1, z: -60.5, w: 5, d: 3.8, kind: "gold" },
      { id: "arena", x: 0, y: 2.6, z: -69, w: 12, d: 10, kind: "marble" },
      { id: "gate-approach", x: 0, y: 2.6, z: -79.5, w: 7, d: 5, kind: "gold" }
    ],
    hazards: [
      { id: "thorn-1", x: 0, y: 2.09, z: -22.4, w: 3.4, d: 1.6, type: "thorns" },
      { id: "thorn-2", x: 0.4, y: 2.64, z: -35.4, w: 3.4, d: 1.6, type: "thorns" },
      { id: "moat", x: 0, y: 2.84, z: -51.6, w: 5.4, d: 2, type: "frost", respawn: true }
    ],
    springs: [{ id: "spring-w5", x: 0, y: 2.75, z: -48, power: 11.8 }],
    waters: [],
    seeds: [
      { id: "w5-seed-1", x: 1.4, y: 2.1, z: -10.2 },
      { id: "w5-seed-2", x: -1.4, y: 2.55, z: -14 },
      { id: "w5-seed-3", x: -3.6, y: 4.6, z: -28.5 },
      { id: "w5-seed-4", x: -2.6, y: 3.1, z: -38.5 },
      { id: "w5-seed-5", x: -3, y: 4.8, z: -51.5 },
      { id: "w5-seed-6", x: 0.4, y: 5.6, z: -55 }
    ],
    acorns: [
      { id: "w5-coin-1", x: -0.8, y: 1.7, z: -6.4 },
      { id: "w5-coin-2", x: 0, y: 2.5, z: -19 },
      { id: "w5-coin-3", x: 0, y: 3.6, z: -25 },
      { id: "w5-coin-4", x: 0.4, y: 3.05, z: -32.5 },
      { id: "w5-coin-5", x: 3, y: 3.45, z: -42.5 },
      { id: "w5-coin-6", x: 0, y: 3.4, z: -48 },
      { id: "w5-coin-7", x: 0, y: 3.8, z: -60.5 },
      { id: "w5-coin-8", x: 0, y: 3.4, z: -73 }
    ],
    hearts: [{ id: "w5-heart", x: 0.4, y: 3.05, z: -32.5 }],
    checkpoints: [
      { id: "w5-cp-1", x: 0, y: 1.85, z: -19 },
      { id: "w5-cp-2", x: 0, y: 2.75, z: -48 },
      { id: "w5-cp-3", x: 0, y: 3.1, z: -60.5 }
    ],
    gate: { id: "w5-gate", x: 0, y: 2.6, z: -80.5 },
    decor: [
      { id: "w5-pillar-1", kind: "pillar", x: -3.4, y: 0.7, z: -1, s: 1.6 },
      { id: "w5-pillar-2", kind: "pillar", x: 3.4, y: 0.7, z: -1, s: 1.6 },
      { id: "w5-pillar-3", kind: "pillar", x: -4.6, y: 1.85, z: -19, s: 1.4 },
      { id: "w5-pillar-4", kind: "pillar", x: 4.6, y: 1.85, z: -19, s: 1.4 },
      { id: "w5-pillar-5", kind: "pillar", x: -5.4, y: 2.6, z: -69, s: 1.6 },
      { id: "w5-pillar-6", kind: "pillar", x: 5.4, y: 2.6, z: -69, s: 1.6 },
      { id: "w5-arch-1", kind: "arch", x: 0, y: 1.85, z: -21, s: 1.6 },
      { id: "w5-arch-2", kind: "arch", x: 0, y: 2.6, z: -75.4, s: 1.8 },
      { id: "w5-banner-1", kind: "banner", x: -2.2, y: 3.6, z: -19, s: 1.2 },
      { id: "w5-banner-2", kind: "banner", x: 2.2, y: 3.6, z: -19, s: 1.2 },
      { id: "w5-lantern-1", kind: "lantern", x: -2.6, y: 3.4, z: -48, s: 1.1 },
      { id: "w5-lantern-2", kind: "lantern", x: 2.6, y: 3.4, z: -48, s: 1.1 }
    ],
    backdrops: [{ asset: "palace", x: 16, y: -2.6, z: -44, scale: 14, yaw: -0.6 }],
    npcs: []
  },

  // -------------------------------------------------- W6 STARFALL GARDEN
  {
    id: "w6",
    order: 6,
    title: "Starfall Garden",
    shortName: "Starfall",
    subtitle: "Low-gravity crystal meadows where the last seeds drift down.",
    look: "polar-night",
    lookOverrides: { fogDensityScale: 0 },
    background: "#141b3a",
    spawn: [0, 0.7, 0.8],
    spawnYaw: Math.PI,
    lowerBound: -9,
    gateSeeds: 4,
    seedGoal: 6,
    medals: medals(26, 39, 52),
    gravityScale: 0.55,
    moveSpeed: 4.9,
    airControl: 0.78,
    ambientFx: "stars",
    unlockHint: "Starfall gravity is gentle — float farther, land softer.",
    platforms: [
      { id: "start", x: 0, y: 0.7, z: 0, w: 9, d: 8, kind: "crystal" },
      { id: "shard-1", x: -1.2, y: 1.1, z: -7, w: 2.6, d: 2.6, kind: "crystal" },
      { id: "shard-2", x: 1.8, y: 1.6, z: -11.4, w: 2.4, d: 2.4, kind: "starlight" },
      { id: "shard-3", x: -1.6, y: 2.15, z: -15.6, w: 2.4, d: 2.4, kind: "crystal" },
      { id: "meadow-1", x: 0, y: 2.15, z: -21, w: 5.4, d: 3.8, kind: "crystal" },
      { id: "comet-1", x: -3.4, y: 2.6, z: -27, w: 2.4, d: 2.4, kind: "starlight",
        mover: { axis: "x", amplitude: 3.4, period: 4.4 } },
      { id: "drift-1", x: 0.8, y: 3.2, z: -31.5, w: 2.4, d: 2.4, kind: "starlight" },
      { id: "drift-2", x: -1.8, y: 3.9, z: -36, w: 2.4, d: 2.4, kind: "crystal" },
      { id: "meadow-2", x: 0.6, y: 3.2, z: -41.5, w: 5, d: 3.6, kind: "crystal" },
      { id: "comet-2", x: -2.6, y: 3.4, z: -47.5, w: 2.4, d: 2.4, kind: "starlight",
        timed: { period: 3.6, onFrac: 0.6, phase: 0.6 } },
      { id: "comet-3", x: 3, y: 3.8, z: -51.5, w: 2.4, d: 2.4, kind: "starlight",
        timed: { period: 3.6, onFrac: 0.6, phase: 2.4 } },
      { id: "spire-mid", x: 0, y: 4.2, z: -57, w: 4.6, d: 3.6, kind: "crystal" },
      { id: "spire-high", x: -3, y: 6.2, z: -60.5, w: 2.5, d: 2.5, kind: "starlight" },
      { id: "fall-1", x: 0.4, y: 4.9, z: -65, w: 2.5, d: 2.5, kind: "crystal" },
      { id: "fall-2", x: -0.6, y: 3.6, z: -70.5, w: 2.6, d: 2.6, kind: "crystal" },
      { id: "gate-approach", x: 0, y: 2.8, z: -76.5, w: 7, d: 6, kind: "crystal" }
    ],
    hazards: [
      { id: "void-1", x: 0, y: 2.39, z: -24.4, w: 3.4, d: 1.6, type: "frost" },
      { id: "void-2", x: 0.6, y: 3.44, z: -44.6, w: 3.4, d: 1.6, type: "frost", respawn: true }
    ],
    springs: [{ id: "spring-w6", x: 0, y: 4.2, z: -57, power: 10.8 }],
    waters: [],
    seeds: [
      { id: "w6-seed-1", x: 1.8, y: 2.3, z: -11.4 },
      { id: "w6-seed-2", x: -1.6, y: 2.85, z: -15.6 },
      { id: "w6-seed-3", x: -3.4, y: 3.3, z: -27 },
      { id: "w6-seed-4", x: -1.8, y: 4.6, z: -36 },
      { id: "w6-seed-5", x: 3, y: 4.5, z: -51.5 },
      { id: "w6-seed-6", x: -3, y: 6.9, z: -60.5 }
    ],
    acorns: [
      { id: "w6-coin-1", x: -1.2, y: 1.8, z: -7 },
      { id: "w6-coin-2", x: 0, y: 2.85, z: -21 },
      { id: "w6-coin-3", x: 0.8, y: 3.9, z: -31.5 },
      { id: "w6-coin-4", x: 0.6, y: 3.9, z: -41.5 },
      { id: "w6-coin-5", x: -2.6, y: 4.1, z: -47.5 },
      { id: "w6-coin-6", x: 0, y: 4.9, z: -57 },
      { id: "w6-coin-7", x: 0.4, y: 5.6, z: -65 },
      { id: "w6-coin-8", x: 0, y: 3.4, z: -73.5 }
    ],
    hearts: [{ id: "w6-heart", x: 0.6, y: 3.9, z: -41.5 }],
    checkpoints: [
      { id: "w6-cp-1", x: 0, y: 2.15, z: -21 },
      { id: "w6-cp-2", x: 0, y: 4.2, z: -57 },
      { id: "w6-cp-3", x: 0, y: 2.8, z: -76.5 }
    ],
    gate: { id: "w6-gate", x: 0, y: 2.8, z: -77.5 },
    decor: [
      { id: "w6-crystal-1", kind: "crystal", x: -3.4, y: 0.7, z: 0.5, s: 1.4 },
      { id: "w6-crystal-2", kind: "crystal", x: 3.6, y: 0.7, z: -1, s: 1.1 },
      { id: "w6-crystal-3", kind: "crystal", x: -4.6, y: 2.15, z: -21, s: 1.2 },
      { id: "w6-crystal-4", kind: "crystal", x: 4.6, y: 3.2, z: -42, s: 1.3 },
      { id: "w6-star-1", kind: "star", x: 2.4, y: 3.4, z: -21, s: 0.9 },
      { id: "w6-star-2", kind: "star", x: -2.4, y: 4.4, z: -41.5, s: 0.8 },
      { id: "w6-star-3", kind: "star", x: 2.2, y: 5.4, z: -57, s: 1 },
      { id: "w6-rock", kind: "rock", x: -2.8, y: 0.7, z: -3.5, s: 0.9 },
      { id: "w6-lantern", kind: "lantern", x: 0, y: 3.8, z: -77.4, s: 1.4 },
      { id: "w6-banner", kind: "banner", x: 0, y: 3.9, z: -77.6, s: 1.5 }
    ],
    backdrops: [{ asset: "basicpack", x: 18, y: -2.4, z: -44, scale: 13, yaw: -0.5 }],
    npcs: [{ id: "w6-npc", x: 1.8, y: 0.7, z: -0.6, who: "sidekick", clip: "idle" }]
  }
];

export const WORLD_BY_ID = new Map(WORLDS.map((world) => [world.id, world] as const));

export function worldSpec(id: string): WorldSpec {
  const spec = WORLD_BY_ID.get(id as WorldSpec["id"]);
  if (!spec) throw new Error(`Unknown Pip's Big Leap world "${id}".`);
  return spec;
}
