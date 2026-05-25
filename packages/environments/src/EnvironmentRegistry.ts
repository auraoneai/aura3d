import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createV5EnvironmentDiagnostics, type V5HDRIEnvironmentPreset } from "./HDRIEnvironment";
import { createV5EnvironmentProbePreviews } from "./EnvironmentPreview";

export interface V5EnvironmentManifest {
  readonly schema: "g3d-three-compat-environment-library/v1";
  readonly requirements: {
    readonly minimumPresets: number;
    readonly minimumRealHdriSources: number;
    readonly requiredProbeTypes: readonly string[];
    readonly everyFlagshipRequiresNamedEnvironment: boolean;
  };
  readonly claimBoundary: string;
  readonly flagshipBindings: Readonly<Record<string, string>>;
  readonly presets: readonly V5HDRIEnvironmentPreset[];
}

export interface V5EnvironmentLibrarySummary {
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

export function loadV5EnvironmentManifest(path = "fixtures/three-compat/environments/manifest.json"): V5EnvironmentManifest {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as V5EnvironmentManifest;
}

export function listV5EnvironmentPresets(manifest = loadV5EnvironmentManifest()): readonly V5HDRIEnvironmentPreset[] {
  return manifest.presets;
}

export function findV5EnvironmentPreset(id: string, manifest = loadV5EnvironmentManifest()): V5HDRIEnvironmentPreset | undefined {
  return manifest.presets.find((preset) => preset.id === id);
}

export function summarizeV5EnvironmentLibrary(manifest = loadV5EnvironmentManifest()): V5EnvironmentLibrarySummary {
  const ids = new Set(manifest.presets.map((preset) => preset.id));
  const diagnostics = manifest.presets.map(createV5EnvironmentDiagnostics);
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

export function createV5EnvironmentGalleryModel(manifest = loadV5EnvironmentManifest()) {
  return manifest.presets.map((preset) => ({
    preset,
    diagnostics: createV5EnvironmentDiagnostics(preset),
    probes: createV5EnvironmentProbePreviews(preset)
  }));
}
