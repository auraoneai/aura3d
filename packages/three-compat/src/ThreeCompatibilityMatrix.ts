import type { ThreeApiCategory, ThreeApiInventory, ThreeApiInventoryEntry } from "./ThreeApiInventory";

export type ThreeCompatibilityStatus = "supported" | "partial" | "planned" | "blocked" | "out-of-scope";

export interface ThreeCompatibilityEntry extends ThreeApiInventoryEntry {
  readonly status: ThreeCompatibilityStatus;
  readonly a3dEquivalent: string;
  readonly notes: string;
}

export interface ThreeCompatibilityThreshold {
  readonly category: ThreeApiCategory | "overall";
  readonly minimumSupportedOrPartialPercent: number;
}

export interface ThreeCompatibilityMatrix {
  readonly schema: "a3d-three-compat-threejs-compatibility-matrix";
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

export const THREE_COMPAT_COMPATIBILITY_THRESHOLDS: readonly ThreeCompatibilityThreshold[] = [
  { category: "overall", minimumSupportedOrPartialPercent: 60 },
  ...coreTargetCategories.map((category) => ({ category, minimumSupportedOrPartialPercent: 80 })),
  ...secondaryTargetCategories.map((category) => ({ category, minimumSupportedOrPartialPercent: 60 }))
] as const;

export function buildInitialCompatibilityMatrix(inventory: ThreeApiInventory): ThreeCompatibilityMatrix {
  const entries = inventory.entries.map((entry) => ({ ...entry, ...initialCompatibilityFor(entry) }));
  return {
    schema: "a3d-three-compat-threejs-compatibility-matrix",
    threeVersion: inventory.threeVersion,
    totalEntries: entries.length,
    entries,
    thresholds: THREE_COMPAT_COMPATIBILITY_THRESHOLDS,
    coverage: coverageFor(entries)
  };
}

export function supportedOrPartial(status: ThreeCompatibilityStatus): boolean {
  return status === "supported" || status === "partial";
}

function initialCompatibilityFor(entry: ThreeApiInventoryEntry): Pick<ThreeCompatibilityEntry, "status" | "a3dEquivalent" | "notes"> {
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
      a3dEquivalent: `@aura3d/three-compat:${entry.name}`,
      notes: "ThreeCompat target entry. Partial until direct API tests and browser migrated examples prove behavior."
    };
  }
  if (entry.category === "renderers" || entry.category === "webxr") {
    return {
      status: "blocked",
      a3dEquivalent: "none",
      notes: "Renderer/WebXR parity is blocked until explicit ThreeCompat implementation and external evidence exist."
    };
  }
  return {
    status: "planned",
    a3dEquivalent: `@aura3d/three-compat:${entry.name}`,
    notes: "Tracked for ThreeCompat migration and parity work."
  };
}

function coverageFor(entries: readonly ThreeCompatibilityEntry[]): ThreeCompatibilityMatrix["coverage"] {
  return THREE_COMPAT_COMPATIBILITY_THRESHOLDS.map((threshold) => {
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
