import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createThreeCompatEnvironmentDiagnostics, type ThreeCompatHDRIEnvironmentPreset } from "./HDRIEnvironment";
import { createThreeCompatEnvironmentProbePreviews } from "./EnvironmentPreview";

export interface ThreeCompatEnvironmentManifest {
  readonly schema: "a3d-three-compat-environment-library";
  readonly requirements: {
    readonly minimumPresets: number;
    readonly minimumRealHdriSources: number;
    readonly requiredProbeTypes: readonly string[];
    readonly everyFlagshipRequiresNamedEnvironment: boolean;
  };
  readonly claimBoundary: string;
  readonly flagshipBindings: Readonly<Record<string, string>>;
  readonly presets: readonly ThreeCompatHDRIEnvironmentPreset[];
}

export interface ThreeCompatEnvironmentLibrarySummary {
  readonly presetCount: number;
  readonly realHdriCount: number;
  readonly checkedRealHdriCount: number;
  readonly proceduralCount: number;
  readonly classes: readonly string[];
  readonly probeTypes: readonly string[];
  readonly flagshipBindingCount: number;
  readonly unresolvedFlagshipBindings: readonly string[];
  readonly diagnosticsWarningCount: number;
  readonly totalEstimatedMemoryBytes: number;
}

export function loadThreeCompatEnvironmentManifest(path = "fixtures/three-compat/environments/manifest.json"): ThreeCompatEnvironmentManifest {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as ThreeCompatEnvironmentManifest;
}

export function listThreeCompatEnvironmentPresets(manifest = loadThreeCompatEnvironmentManifest()): readonly ThreeCompatHDRIEnvironmentPreset[] {
  return manifest.presets;
}

export function findThreeCompatEnvironmentPreset(id: string, manifest = loadThreeCompatEnvironmentManifest()): ThreeCompatHDRIEnvironmentPreset | undefined {
  return manifest.presets.find((preset) => preset.id === id);
}

export function summarizeThreeCompatEnvironmentLibrary(manifest = loadThreeCompatEnvironmentManifest()): ThreeCompatEnvironmentLibrarySummary {
  const ids = new Set(manifest.presets.map((preset) => preset.id));
  const diagnostics = manifest.presets.map(createThreeCompatEnvironmentDiagnostics);
  const checkedRealHdriCount = diagnostics.filter((diagnostic) => diagnostic.kind === "real-hdri" && diagnostic.warnings.length === 0).length;
  const probeTypes = [...new Set(manifest.presets.flatMap((preset) => preset.probes))].sort();
  return {
    presetCount: manifest.presets.length,
    realHdriCount: manifest.presets.filter((preset) => preset.kind === "real-hdri").length,
    checkedRealHdriCount,
    proceduralCount: manifest.presets.filter((preset) => preset.kind === "procedural-hdr").length,
    classes: [...new Set(manifest.presets.map((preset) => preset.class))].sort(),
    probeTypes,
    flagshipBindingCount: Object.keys(manifest.flagshipBindings).length,
    unresolvedFlagshipBindings: Object.entries(manifest.flagshipBindings).filter(([, environmentId]) => !ids.has(environmentId)).map(([flagship]) => flagship),
    diagnosticsWarningCount: diagnostics.reduce((count, diagnostic) => count + diagnostic.warnings.length, 0),
    totalEstimatedMemoryBytes: diagnostics.reduce((total, diagnostic) => total + diagnostic.memoryBytes, 0)
  };
}

export function createThreeCompatEnvironmentGalleryModel(manifest = loadThreeCompatEnvironmentManifest()) {
  return manifest.presets.map((preset) => ({
    preset,
    diagnostics: createThreeCompatEnvironmentDiagnostics(preset),
    probes: createThreeCompatEnvironmentProbePreviews(preset)
  }));
}
