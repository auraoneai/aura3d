import {
  createEnvironmentCapabilityReport,
  type EnvironmentCapabilityId,
  type EnvironmentPreset as EnvironmentPlatformPreset,
  type EnvironmentPresetBackground,
  type EnvironmentPresetGround,
  type EnvironmentPresetLighting,
  type EnvironmentPresetOptions,
  type EnvironmentPresetType
} from "./EnvironmentPlatform";

export type NamedEnvironmentPresetId =
  | "studio"
  | "outdoor"
  | "city"
  | "warehouse"
  | "deep-space"
  | "ocean"
  | "clean-void";

export interface NamedEnvironmentPresetDescriptor {
  readonly id: NamedEnvironmentPresetId;
  readonly type: EnvironmentPresetType;
  readonly lighting: EnvironmentPresetLighting;
  readonly background: EnvironmentPresetBackground;
  readonly ground: EnvironmentPresetGround;
  readonly defaultFog: boolean;
}

export interface EnvironmentPresetReport {
  readonly id: NamedEnvironmentPresetId | "custom";
  readonly type: EnvironmentPresetType;
  readonly lighting: EnvironmentPresetLighting;
  readonly background: EnvironmentPresetBackground;
  readonly ground: EnvironmentPresetGround;
  readonly renderItemCount: number;
  readonly systemCount: number;
  readonly capabilityIds: readonly EnvironmentCapabilityId[];
  readonly unsupportedRequests: readonly string[];
  readonly visibleBackgroundSeparatedFromLighting: boolean;
  readonly hasFogProfile: boolean;
  readonly productionReady: boolean;
  readonly claimBoundary: string;
}

const NAMED_ENVIRONMENT_PRESETS: Readonly<Record<NamedEnvironmentPresetId, NamedEnvironmentPresetDescriptor>> = {
  studio: {
    id: "studio",
    type: "studio",
    lighting: "softbox",
    background: "procedural",
    ground: "shadow-catcher",
    defaultFog: false
  },
  outdoor: {
    id: "outdoor",
    type: "outdoor",
    lighting: "overcast",
    background: "sky",
    ground: "terrain",
    defaultFog: true
  },
  city: {
    id: "city",
    type: "city",
    lighting: "neon",
    background: "procedural",
    ground: "grid",
    defaultFog: true
  },
  warehouse: {
    id: "warehouse",
    type: "warehouse",
    lighting: "warehouse",
    background: "procedural",
    ground: "shadow-catcher",
    defaultFog: true
  },
  "deep-space": {
    id: "deep-space",
    type: "space",
    lighting: "space",
    background: "procedural",
    ground: "none",
    defaultFog: false
  },
  ocean: {
    id: "ocean",
    type: "ocean",
    lighting: "sunset",
    background: "sky",
    ground: "terrain",
    defaultFog: true
  },
  "clean-void": {
    id: "clean-void",
    type: "clean-void",
    lighting: "softbox",
    background: "procedural",
    ground: "grid",
    defaultFog: false
  }
};

export function listNamedEnvironmentPresets(): readonly NamedEnvironmentPresetDescriptor[] {
  return Object.values(NAMED_ENVIRONMENT_PRESETS);
}

/**
 * @deprecated removed-world-planner (PRD-10): the named-preset factory let a
 * preset claim environment capabilities the runtime never wired. Kept as a
 * throwing stub for one minor version; author environments through
 * `createEnvironmentPreset` with explicit capability disclosure, or the
 * PRD-10 world environment path behind `A3D_QR_WORLD`.
 */
export function createNamedEnvironmentPreset(
  id: NamedEnvironmentPresetId,
  overrides: Omit<EnvironmentPresetOptions, "type" | "lighting" | "background" | "ground" | "fog"> & {
    readonly type?: EnvironmentPresetType;
    readonly lighting?: EnvironmentPresetLighting;
    readonly background?: EnvironmentPresetBackground;
    readonly ground?: EnvironmentPresetGround;
    readonly fog?: EnvironmentPresetOptions["fog"];
  } = {}
): EnvironmentPlatformPreset {
  void id;
  void overrides;
  throw new Error(
    "removed-world-planner: createNamedEnvironmentPreset was removed by PRD-10 — named presets claimed environment capabilities the runtime never wired. Use createEnvironmentPreset with explicit options instead."
  );
}

export function createEnvironmentPresetReport(
  preset: EnvironmentPlatformPreset,
  id: NamedEnvironmentPresetId | "custom" = "custom"
): EnvironmentPresetReport {
  const capabilityReport = createEnvironmentCapabilityReport();
  const productionReady = preset.capabilityIds.every((capabilityId) => capabilityReport.productionReady.includes(capabilityId));
  return {
    id,
    type: preset.type,
    lighting: preset.lightingPreset,
    background: preset.background,
    ground: preset.ground,
    renderItemCount: preset.items.length,
    systemCount: preset.systems.length,
    capabilityIds: preset.capabilityIds,
    unsupportedRequests: preset.unsupportedRequests,
    visibleBackgroundSeparatedFromLighting: preset.background !== "none" && preset.lighting.intensity >= 0,
    hasFogProfile: preset.fog !== undefined,
    productionReady,
    claimBoundary: productionReady
      ? "Environment preset only reports production-ready when every consumed environment capability is implemented."
      : "Reusable environment preset helper; route acceptance still requires browser screenshot/report evidence, and unsupported requests must remain disclosed."
  };
}
