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
  readonly name: "studio" | "outdoor" | "sunset" | "night" | "indoor" | "neutral";
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
      specular: "5082ddb4c9823aa8fd5d7a4071aae53490dc27f50a6db58fc218bb535fc6128c",
      sh9: "92e70a87d78dd13c3c4cc650a3d9fffb3418e572f2b8a1b25b7fcb9f5f017f60"
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
      specular: "cc11e7135b72879ab5f1469a9b9e17d9dc7c08352f94602939101c5c212b9edc",
      sh9: "5290f84b2737f64fb2916731460b94ed7c8d691b57d087616deb8f7ecf401252"
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
      specular: "6867ee06f4ab2c25462e6529a6f6ae885e721df7bfeeae2ab0cd4762dd37aed4",
      sh9: "ffac6765180a490e920df1f51cb5b87aee8461a2dde75ffc2b95aec9ee0cb505"
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
      specular: "01e7b0c9593db261196d2d74df1d5b0247bbbc4a5ffb869fd016e2d833612967",
      sh9: "8ef9560f155db7e30661ae9cb15a31e6b89d6beb14f17ee16a721e1eba9bbdd1"
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
      specular: "a862e519defc6dcd93d66ebd98fc0fba4c67cffa7e9181e9e4c1f2dd88187ca3",
      sh9: "7d4625b73b8c04a00c52c5379c3b9bb9944b026a938eb0ba3e029947aff8914f"
    },
    tags: ["neutral", "stand-in"]
  },
  {
    name: "neutral",
    specularUrl: "/aura-environments/neutral.specular.ktx2",
    sh9Url: "/aura-environments/neutral.sh9.f32",
    manifestUrl: "/aura-environments/neutral.manifest.json",
    license: "CC0",
    sourceFile: "RoomEnvironmentScene.ts (r185 neutral room port — the C-09 runtime floor, T0-25)",
    sha256: {
      specular: "a862e519defc6dcd93d66ebd98fc0fba4c67cffa7e9181e9e4c1f2dd88187ca3",
      sh9: "7d4625b73b8c04a00c52c5379c3b9bb9944b026a938eb0ba3e029947aff8914f"
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
