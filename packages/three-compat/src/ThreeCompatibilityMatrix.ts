import type { ThreeApiCategory, ThreeApiInventory, ThreeApiInventoryEntry } from "./ThreeApiInventory";

export type ThreeCompatibilityStatus = "supported" | "partial" | "planned" | "blocked" | "out-of-scope";

export interface ThreeCompatibilityEntry extends ThreeApiInventoryEntry {
  readonly status: ThreeCompatibilityStatus;
  readonly g3dEquivalent: string;
  readonly notes: string;
}

export interface ThreeCompatibilityThreshold {
  readonly category: ThreeApiCategory | "overall";
  readonly minimumSupportedOrPartialPercent: number;
}

export interface ThreeCompatibilityMatrix {
  readonly schema: "g3d-three-compat-threejs-compatibility-matrix/v1";
  readonly threeVersion: string;
  readonly totalEntries: number;
  readonly entries: readonly ThreeCompatibilityEntry[];
  readonly thresholds: readonly ThreeCompatibilityThreshold[];
  readonly coverage: readonly {
    readonly category: ThreeApiCategory | "overall";
    readonly total: number;
    readonly supportedOrPartial: number;
    readonly percent: number;
    readonly threshold: number;
    readonly meetsThreshold: boolean;
  }[];
}

const coreTargetCategories: readonly ThreeApiCategory[] = ["core", "math", "cameras", "lights", "materials", "geometries", "textures"];
const secondaryTargetCategories: readonly ThreeApiCategory[] = ["controls", "loaders", "postprocessing", "animation", "helpers"];

export const V5_COMPATIBILITY_THRESHOLDS: readonly ThreeCompatibilityThreshold[] = [
  { category: "overall", minimumSupportedOrPartialPercent: 60 },
  ...coreTargetCategories.map((category) => ({ category, minimumSupportedOrPartialPercent: 80 })),
  ...secondaryTargetCategories.map((category) => ({ category, minimumSupportedOrPartialPercent: 60 }))
] as const;

export function buildInitialCompatibilityMatrix(inventory: ThreeApiInventory): ThreeCompatibilityMatrix {
  const entries = inventory.entries.map((entry) => ({ ...entry, ...initialCompatibilityFor(entry) }));
  return {
    schema: "g3d-three-compat-threejs-compatibility-matrix/v1",
    threeVersion: inventory.threeVersion,
    totalEntries: entries.length,
    entries,
    thresholds: V5_COMPATIBILITY_THRESHOLDS,
    coverage: coverageFor(entries)
  };
}

export function supportedOrPartial(status: ThreeCompatibilityStatus): boolean {
  return status === "supported" || status === "partial";
}

function initialCompatibilityFor(entry: ThreeApiInventoryEntry): Pick<ThreeCompatibilityEntry, "status" | "g3dEquivalent" | "notes"> {
  if (
    entry.category === "core" ||
    entry.category === "math" ||
    entry.category === "cameras" ||
    entry.category === "lights" ||
    entry.category === "materials" ||
    entry.category === "geometries" ||
    entry.category === "textures" ||
    entry.category === "controls" ||
    entry.category === "loaders" ||
    entry.category === "postprocessing" ||
    entry.category === "animation" ||
    entry.category === "helpers"
  ) {
    return {
      status: "partial",
      g3dEquivalent: `@galileo3d/engine/three-compat:${entry.name}`,
      notes: "V5 target entry. Partial until direct API tests and browser migrated examples prove behavior."
    };
  }
  if (entry.category === "renderers" || entry.category === "webxr") {
    return {
      status: "blocked",
      g3dEquivalent: "none",
      notes: "Renderer/WebXR parity is blocked until explicit V5 implementation and external evidence exist."
    };
  }
  return {
    status: "planned",
    g3dEquivalent: `@galileo3d/engine/three-compat:${entry.name}`,
    notes: "Tracked for V5 migration and parity work."
  };
}

function coverageFor(entries: readonly ThreeCompatibilityEntry[]): ThreeCompatibilityMatrix["coverage"] {
  return V5_COMPATIBILITY_THRESHOLDS.map((threshold) => {
    const scoped = threshold.category === "overall" ? entries : entries.filter((entry) => entry.category === threshold.category);
    const supportedOrPartialCount = scoped.filter((entry) => supportedOrPartial(entry.status)).length;
    const percent = scoped.length === 0 ? 0 : Math.round((supportedOrPartialCount / scoped.length) * 1000) / 10;
    return {
      category: threshold.category,
      total: scoped.length,
      supportedOrPartial: supportedOrPartialCount,
      percent,
      threshold: threshold.minimumSupportedOrPartialPercent,
      meetsThreshold: percent >= threshold.minimumSupportedOrPartialPercent
    };
  });
}
