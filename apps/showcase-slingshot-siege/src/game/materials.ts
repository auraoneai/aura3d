/**
 * Slingshot Siege — destructible material table.
 *
 * Every fortress block resolves through this table: distinct mass, the impulse
 * magnitude that cracks a piece (`breakImpulse`), authored-joint strength,
 * contact response and the debris/score profile each material produces.
 *
 * - wood  : light, splinters into long chips, lowest break threshold of the
 *           structural set — the Driftwood Cove signature.
 * - stone : heavy, high threshold, crumbles into small cubes — Quarry Rise.
 * - glass : fragile, very low threshold, shatters into thin shards —
 *           Greenhouse Perch.
 * - ice   : moon-tier exotic; slides and shatters like glass but heavier.
 * - obsidian: moon-tier exotic; nearly immovable, only heavy ammo cracks it.
 */
export type SiegeMaterialId = "wood" | "stone" | "glass" | "ice" | "obsidian";

export interface SiegeMaterial {
  readonly id: SiegeMaterialId;
  readonly label: string;
  /** Body + edge colours for the cartoon block material. */
  readonly color: string;
  readonly edgeColor: string;
  /** Debris chip colour (splinters / crumble / shards). */
  readonly debrisColor: string;
  /** Dust-puff tint on break. */
  readonly puffColor: string;
  /** kg. Drives both stack stability and damage transfer. */
  readonly mass: number;
  /** Impact impulse (N·s) above which the piece shatters. */
  readonly breakImpulse: number;
  /** Impulse above which an authored joint between pieces snaps. */
  readonly jointStrength: number;
  readonly friction: number;
  readonly restitution: number;
  /** Points a broken piece contributes. */
  readonly scoreValue: number;
  /** Debris chip shape + count when this material breaks. */
  readonly debris: { readonly kind: "splinter" | "crumble" | "shard"; readonly count: number };
  /** Material opacity for glass-family pieces. */
  readonly opacity?: number;
}

export const MATERIALS: Readonly<Record<SiegeMaterialId, SiegeMaterial>> = {
  wood: {
    id: "wood",
    label: "Driftwood",
    color: "#c98a4b",
    edgeColor: "#a06a34",
    debrisColor: "#b5773f",
    puffColor: "#d9b380",
    mass: 1.0,
    breakImpulse: 10,
    jointStrength: 7,
    friction: 0.72,
    restitution: 0.14,
    scoreValue: 40,
    debris: { kind: "splinter", count: 4 }
  },
  stone: {
    id: "stone",
    label: "Quarry Stone",
    color: "#8f9bb0",
    edgeColor: "#6c7890",
    debrisColor: "#7d8aa0",
    puffColor: "#aab4c4",
    mass: 3.1,
    breakImpulse: 26,
    jointStrength: 15,
    friction: 0.92,
    restitution: 0.05,
    scoreValue: 90,
    debris: { kind: "crumble", count: 5 }
  },
  glass: {
    id: "glass",
    label: "Greenhouse Glass",
    color: "#9fe0f2",
    edgeColor: "#65b8d4",
    debrisColor: "#bff0fc",
    puffColor: "#d8f6ff",
    mass: 0.5,
    breakImpulse: 4.5,
    jointStrength: 2.5,
    friction: 0.32,
    restitution: 0.32,
    scoreValue: 60,
    opacity: 0.82,
    debris: { kind: "shard", count: 6 }
  },
  ice: {
    id: "ice",
    label: "Moon Ice",
    color: "#bfe8ff",
    edgeColor: "#83bfe8",
    debrisColor: "#d8f1ff",
    puffColor: "#eaf8ff",
    mass: 0.9,
    breakImpulse: 7,
    jointStrength: 4,
    friction: 0.18,
    restitution: 0.4,
    scoreValue: 80,
    opacity: 0.9,
    debris: { kind: "shard", count: 5 }
  },
  obsidian: {
    id: "obsidian",
    label: "Roost Obsidian",
    color: "#4a4460",
    edgeColor: "#322d46",
    debrisColor: "#5a5470",
    puffColor: "#7a74a0",
    mass: 4.6,
    breakImpulse: 34,
    jointStrength: 20,
    friction: 0.85,
    restitution: 0.08,
    scoreValue: 140,
    debris: { kind: "crumble", count: 5 }
  }
};

/** Chapter key → the block materials that dominate its fortresses. */
export const CHAPTER_MATERIAL_MIX: Readonly<Record<number, readonly SiegeMaterialId[]>> = {
  0: ["wood"],
  1: ["stone", "wood"],
  2: ["glass", "wood"],
  3: ["wood", "stone", "glass"],
  4: ["stone", "wood", "glass"],
  5: ["ice", "obsidian", "glass"]
};
