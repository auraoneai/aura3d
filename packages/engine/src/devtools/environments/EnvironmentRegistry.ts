import { createHash } from "node:crypto";
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

// ── PRD-02 day-0 baked preset registry ────────────────────────────────────
// Entries describe the prebaked probe assets in `public/aura-environments/`
// produced by `aura3d environments bake` (C-39). `stand-in` presets ship at
// day-0 quality and are swapped for the C-17 2k library entries by a hash
// change when Q-05-1 lands.

export interface AuraEnvironmentPresetEntry {
  readonly name: "studio" | "outdoor" | "sunset" | "night" | "indoor";
  /** URL the runtime fetches (served from `public/`). */
  readonly specularUrl: string;
  readonly sh9Url: string;
  readonly manifestUrl: string;
  readonly license: "CC0";
  /** Human-readable provenance: which source produced the bake. */
  readonly sourceFile: string;
  readonly sha256: { readonly specular: string; readonly sh9: string };
  readonly tags: readonly string[];
}

export const AURA_ENVIRONMENT_PRESETS: readonly AuraEnvironmentPresetEntry[] = [
  {
    name: "studio",
    specularUrl: "/aura-environments/studio.specular.ktx2",
    sh9Url: "/aura-environments/studio.sh9.f32",
    manifestUrl: "/aura-environments/studio.manifest.json",
    license: "CC0",
    sourceFile: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    sha256: {
      specular: "4f9c4f2b064ce3041f77f157cf5b803bb1f28d817c70a7c084c7c5854eb66994",
      sh9: "bb143f21c720aa2cf1a80a63ed7f5db810613c1b7544a59c9ff6536c6747facd"
    },
    tags: ["stand-in"]
  },
  {
    name: "outdoor",
    specularUrl: "/aura-environments/outdoor.specular.ktx2",
    sh9Url: "/aura-environments/outdoor.sh9.f32",
    manifestUrl: "/aura-environments/outdoor.manifest.json",
    license: "CC0",
    sourceFile: "fixtures/environment-corpus/hdri/autumn_field_puresky_1k.hdr",
    sha256: {
      specular: "8104b92e544efda1af3cca6e734e33a3fde9b2077261a4fefbfb9e0c873ac287",
      sh9: "393eb19ca13b083d011983e162847938e941f37e5985eb04493217ae15188ef3"
    },
    tags: ["stand-in"]
  },
  {
    name: "sunset",
    specularUrl: "/aura-environments/sunset.specular.ktx2",
    sh9Url: "/aura-environments/sunset.sh9.f32",
    manifestUrl: "/aura-environments/sunset.manifest.json",
    license: "CC0",
    sourceFile: "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr",
    sha256: {
      specular: "e38bb254e2f0d45f8f455d21c8c9fefb3b655725c4642ace8c953864ecfa00fd",
      sh9: "94551a4af6e2a5a890d1272eb9504121f6e72d3354f42a142351c436628dfaf0"
    },
    tags: ["stand-in"]
  },
  {
    name: "night",
    specularUrl: "/aura-environments/night.specular.ktx2",
    sh9Url: "/aura-environments/night.sh9.f32",
    manifestUrl: "/aura-environments/night.manifest.json",
    license: "CC0",
    sourceFile: "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr (intensity 0.05, yaw 140°)",
    sha256: {
      specular: "4d1d924caf54e891905a9fcb6ef0cc4343bc859489885cb61d1827c6fd57c111",
      sh9: "1337cfa7fbbab83e270442ae1044583629e163fc5c48d1ed6c8d6b3a0cf40210"
    },
    tags: ["stand-in"]
  },
  {
    name: "indoor",
    specularUrl: "/aura-environments/indoor.specular.ktx2",
    sh9Url: "/aura-environments/indoor.sh9.f32",
    manifestUrl: "/aura-environments/indoor.manifest.json",
    license: "CC0",
    sourceFile: "RoomEnvironmentScene.ts (r185 neutral room port)",
    sha256: {
      specular: "40b9eb910ccd2e5e3713abb28f0abaf9e99868148467ff3fccd70e6b3fdc78ac",
      sh9: "545a1d00bf23ee1520a2366e7b64f47768b610418a8283ecdb254e4f12e5665b"
    },
    tags: ["neutral", "stand-in"]
  }
];

export interface AuraEnvironmentRegistryIssue {
  readonly preset: string;
  readonly reason:
    | "missing-license"
    | "sha256-mismatch"
    | "file-missing"
    | "manifest-sha256-mismatch";
  readonly detail?: string;
}

/**
 * Validate the baked preset files on disk: every entry carries a license and
 * a SHA-256 that matches both the file bytes and the manifest's recorded hash.
 */
export function validateAuraEnvironmentPresets(
  dir = "public/aura-environments",
  presets: readonly AuraEnvironmentPresetEntry[] = AURA_ENVIRONMENT_PRESETS,
  io: { readFile(path: string): Uint8Array } = { readFile: (p) => readFileSync(resolve(p)) }
): readonly AuraEnvironmentRegistryIssue[] {
  const issues: AuraEnvironmentRegistryIssue[] = [];
  for (const preset of presets) {
    if (preset.license !== "CC0") {
      issues.push({ preset: preset.name, reason: "missing-license" });
    }
    const specPath = resolve(dir, `${preset.name}.specular.ktx2`);
    const manPath = resolve(dir, `${preset.name}.manifest.json`);
    let fileSha = "";
    try {
      fileSha = createHash("sha256").update(io.readFile(specPath)).digest("hex");
    } catch {
      issues.push({ preset: preset.name, reason: "file-missing", detail: specPath });
      continue;
    }
    if (fileSha !== preset.sha256.specular) {
      issues.push({ preset: preset.name, reason: "sha256-mismatch", detail: `${fileSha} != ${preset.sha256.specular}` });
    }
    try {
      const manifest = JSON.parse(new TextDecoder().decode(io.readFile(manPath))) as { sha256?: { specular?: string } };
      if (manifest.sha256?.specular && manifest.sha256.specular !== fileSha) {
        issues.push({ preset: preset.name, reason: "manifest-sha256-mismatch", detail: manifest.sha256.specular });
      }
    } catch {
      issues.push({ preset: preset.name, reason: "file-missing", detail: manPath });
    }
  }
  return issues;
}
