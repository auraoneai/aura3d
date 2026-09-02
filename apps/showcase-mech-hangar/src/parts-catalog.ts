/**
 * Mech Hangar parts catalog — the typed, provenance-tracked part matrix.
 *
 * Every option here comes from the authored MH-2M family curation gate
 * (scripts/curate-parts.mjs), which resolves typed CLI assets with license and
 * provenance recorded before a route can mount them.
 * The stat table below is the authored "part -> stats" mapping required by the PRD:
 * chassis drives armor, legs drive speed, arms drive guard strength, and weapons
 * drive power/special cost. Stats are per-option (slot, letter) so a part always
 * moves the bars in a fixed, testable way.
 */
import type { AuraAssetRef } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { CURATED_PART_RECORDS } from "./parts-generated";

export type MechSlot = "chassis" | "arms" | "legs" | "weapon";

export const MECH_SLOTS: readonly MechSlot[] = ["chassis", "arms", "legs", "weapon"];

export interface PartProvenance {
  readonly title: string;
  readonly source: string;
  readonly author: string;
  readonly attribution: string;
  readonly license: string;
}

export interface PartStats {
  readonly armor: number;
  readonly speed: number;
  readonly guard: number;
  readonly power: number;
  readonly specialCost: number;
}

export interface PartDef {
  /** Typed asset key in the generated root asset map (assets.<key>). */
  readonly assetKey: string;
  readonly slot: MechSlot;
  readonly letter: string;
  readonly displayName: string;
  /** characterAssembly role used in the plan. */
  readonly assemblyRole: "base-body" | "accessory" | "shoes" | "weapon";
  /** characterAssembly socket this part attaches to. */
  readonly socket: "root" | "chest" | "hips" | "right-hand";
  readonly provenance: PartProvenance;
  readonly stats: PartStats;
  readonly bounds: readonly [number, number, number];
  /** Exact authored local extrema retained by the curation pass for socket fitting. */
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
}

/**
 * Authored stat table (PRD section 5). Letters map to curation options A-D.
 * Chassis: heavy hulls trade speed for armor. Legs: fast actuators are fragile.
 * Arms: bigger manipulators guard better. Weapons: harder hitters cost more power
 * per special. These deltas are what make builds play differently.
 */
const VARIANT_STATS: Record<MechSlot, Record<string, PartStats>> = {
  chassis: {
    A: { armor: 4, speed: 2, guard: 0, power: 0, specialCost: 0 },
    B: { armor: 6, speed: 1, guard: 0, power: 0, specialCost: 0 },
    C: { armor: 5, speed: 2, guard: 0, power: 0, specialCost: 0 },
    D: { armor: 3, speed: 3, guard: 0, power: 0, specialCost: 0 }
  },
  arms: {
    A: { armor: 0, speed: 0, guard: 3, power: 0, specialCost: 0 },
    B: { armor: 0, speed: 0, guard: 5, power: 0, specialCost: 0 },
    C: { armor: 0, speed: 0, guard: 6, power: 0, specialCost: 0 },
    D: { armor: 0, speed: 0, guard: 2, power: 1, specialCost: 0 }
  },
  legs: {
    A: { armor: 1, speed: 4, guard: 0, power: 0, specialCost: 0 },
    B: { armor: 2, speed: 2, guard: 0, power: 0, specialCost: 0 },
    C: { armor: 2, speed: 3, guard: 0, power: 0, specialCost: 0 },
    D: { armor: 0, speed: 6, guard: 0, power: 0, specialCost: 0 }
  },
  weapon: {
    A: { armor: 0, speed: 0, guard: 0, power: 3, specialCost: 1 },
    B: { armor: 0, speed: 0, guard: 0, power: 5, specialCost: 3 },
    C: { armor: 0, speed: 0, guard: 0, power: 6, specialCost: 4 },
    D: { armor: 0, speed: 0, guard: 0, power: 2, specialCost: 1 }
  }
};

function toPartDef(record: (typeof CURATED_PART_RECORDS)[number]): PartDef | undefined {
  if (record.status !== "accepted") return undefined;
  const slot = record.slot;
  const letter = record.letter ?? "A";
  const stats = VARIANT_STATS[slot]?.[letter];
  if (!stats) return undefined;
  const bounds = record.bounds && record.bounds.length === 3 ? record.bounds : [1, 1, 1];
  const boundsMin = record.boundsMin && record.boundsMin.length === 3 ? record.boundsMin : [-0.5, -0.5, -0.5];
  const boundsMax = record.boundsMax && record.boundsMax.length === 3 ? record.boundsMax : [0.5, 0.5, 0.5];
  return {
    assetKey: record.name,
    slot,
    letter,
    displayName: record.displayName ?? record.name,
    assemblyRole: (record.assemblyRole as PartDef["assemblyRole"]) ?? (slot === "chassis" ? "base-body" : slot === "arms" ? "accessory" : slot === "legs" ? "shoes" : "weapon"),
    socket: (record.socket as PartDef["socket"]) ?? "root",
    provenance: {
      title: record.title ?? record.displayName ?? record.name,
      source: record.source ?? "unknown",
      author: record.author ?? "unknown",
      attribution: record.attribution ?? record.author ?? "unknown",
      license: record.license ?? "unverified"
    },
    stats,
    bounds: [bounds[0] ?? 1, bounds[1] ?? 1, bounds[2] ?? 1],
    boundsMin: [boundsMin[0] ?? -0.5, boundsMin[1] ?? -0.5, boundsMin[2] ?? -0.5],
    boundsMax: [boundsMax[0] ?? 0.5, boundsMax[1] ?? 0.5, boundsMax[2] ?? 0.5]
  };
}

const catalogDefs = CURATED_PART_RECORDS
  .map((record) => ({ record, def: toPartDef(record) }))
  .filter((entry): entry is { record: typeof CURATED_PART_RECORDS[number]; def: PartDef } => Boolean(entry.def));

/** Options per slot in stable curation order (A-D). */
export const PART_OPTIONS: Readonly<Record<MechSlot, readonly PartDef[]>> = {
  chassis: catalogDefs.filter((entry) => entry.def.slot === "chassis").map((entry) => entry.def),
  arms: catalogDefs.filter((entry) => entry.def.slot === "arms").map((entry) => entry.def),
  legs: catalogDefs.filter((entry) => entry.def.slot === "legs").map((entry) => entry.def),
  weapon: catalogDefs.filter((entry) => entry.def.slot === "weapon").map((entry) => entry.def)
};

/** True when curation delivered the full 4x4 matrix. The route refuses to mount otherwise. */
export const catalogReady = MECH_SLOTS.every((slot) => PART_OPTIONS[slot].length === 4);

/**
 * Explicit typed references are the compile-time half of the curation gate.
 * The generated records select among this closed family; they can never turn an
 * arbitrary string into a model reference or silently bypass type generation.
 */
const PART_ASSET_REFS: Readonly<Record<string, AuraAssetRef<"model">>> = {
  mechChassisA: assets.mechChassisA,
  mechChassisB: assets.mechChassisB,
  mechChassisC: assets.mechChassisC,
  mechChassisD: assets.mechChassisD,
  mechArmsA: assets.mechArmsA,
  mechArmsB: assets.mechArmsB,
  mechArmsC: assets.mechArmsC,
  mechArmsD: assets.mechArmsD,
  mechLegsA: assets.mechLegsA,
  mechLegsB: assets.mechLegsB,
  mechLegsC: assets.mechLegsC,
  mechLegsD: assets.mechLegsD,
  mechWeaponA: assets.mechWeaponA,
  mechWeaponB: assets.mechWeaponB,
  mechWeaponC: assets.mechWeaponC,
  mechWeaponD: assets.mechWeaponD
};

/**
 * Resolve the typed model ref for a part.
 *
 * The generated root asset map only knows keys that exist in aura.assets.json. If
 * curation is incomplete (or a slot fails), lookups fall back to undefined and
 * the route shows a pending state instead of inventing an id or URL.
 */
export function resolvePartAsset(assetKey: string): AuraAssetRef<"model"> | undefined {
  return PART_ASSET_REFS[assetKey];
}

export interface BuildSelection {
  readonly chassis: number;
  readonly arms: number;
  readonly legs: number;
  readonly weapon: number;
}

export const DEFAULT_BUILD: BuildSelection = { chassis: 0, arms: 0, legs: 0, weapon: 0 };

export function selectedParts(selection: BuildSelection): readonly PartDef[] {
  return [
    PART_OPTIONS.chassis[selection.chassis] ?? PART_OPTIONS.chassis[0]!,
    PART_OPTIONS.arms[selection.arms] ?? PART_OPTIONS.arms[0]!,
    PART_OPTIONS.legs[selection.legs] ?? PART_OPTIONS.legs[0]!,
    PART_OPTIONS.weapon[selection.weapon] ?? PART_OPTIONS.weapon[0]!
  ];
}

export function cycleIndex(length: number, index: number, delta: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length + (delta % length)) % length;
}
