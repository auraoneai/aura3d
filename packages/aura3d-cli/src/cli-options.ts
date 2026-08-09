import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readRenderedProbeMetadata,
  type AuraAssetQuality,
  type AuraCliAssetRole,
  type AuraCliOrientationInspection,
  type AuraCliRenderedProbe,
} from "./index.js";
import type {
  CliAssetSearchProfile,
  CliResolveConstraints,
} from "./pull-bridge.js";

export function createCliOptionReaders(args: readonly string[]) {
  function readOption(name: string): string | undefined {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  }

  function readOptionalOption(name: string): string | undefined {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const value = args[index + 1];
    return value && !value.startsWith("--") ? value : undefined;
  }

  function hasFlag(name: string): boolean {
    return args.includes(name);
  }

  function readInspectFile(): string | undefined {
    return args.slice(2).find((value) => !value.startsWith("--"));
  }

  function readEvidenceOutput(): string | undefined {
    if (hasFlag("--output")) {
      const output = readOption("--output");
      if (!output || output.startsWith("--")) throw new Error("Expected --output <path>.");
      return output;
    }
    if (hasFlag("--evidence")) {
      const evidence = readOption("--evidence");
      if (!evidence || evidence.startsWith("--")) throw new Error("Expected --evidence <path>.");
      return evidence;
    }
    return undefined;
  }

  function readAssetValidationOptions(): { readonly episode?: boolean; readonly noPlaceholders?: boolean; readonly requireLicense?: boolean; readonly provenanceFile?: string; readonly assetIds?: readonly string[]; readonly source?: boolean | string; readonly release?: boolean } {
    const options: { episode?: boolean; noPlaceholders?: boolean; requireLicense?: boolean; provenanceFile?: string; assetIds?: readonly string[]; source?: boolean | string; release?: boolean } = {};
    if (hasFlag("--episode")) options.episode = true;
    if (hasFlag("--no-placeholders")) options.noPlaceholders = true;
    if (hasFlag("--require-license")) options.requireLicense = true;
    if (hasFlag("--release")) options.release = true;
    if (hasFlag("--source")) options.source = readOptionalOption("--source") ?? true;
    const assetIds = readRepeatedOptions("--asset").flatMap((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean));
    if (hasFlag("--no-assets") && assetIds.length > 0) throw new Error("Use either --asset <id> or --no-assets, not both.");
    if (hasFlag("--no-assets")) options.assetIds = [];
    else if (assetIds.length > 0) options.assetIds = assetIds;
    if (hasFlag("--provenance")) {
      const provenanceFile = readOption("--provenance");
      if (!provenanceFile || provenanceFile.startsWith("--")) throw new Error("Expected --provenance <path>.");
      options.provenanceFile = provenanceFile;
    }
    return options;
  }

  function readRepeatedOptions(name: string): readonly string[] {
    const values: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] !== name) continue;
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Expected ${name} <value>.`);
      values.push(value);
    }
    return values;
  }

  function readProvenanceEvidence(): readonly string[] | undefined {
    const evidence = readRepeatedOptions("--provenance-evidence").map((entry) => entry.trim()).filter(Boolean);
    return evidence.length > 0 ? evidence : undefined;
  }

  function readParts(name: string): readonly { readonly slot: string; readonly asset: string }[] {
    const parts: { slot: string; asset: string }[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] !== name) continue;
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Expected ${name} slot=asset`);
      const [slot, asset] = value.split("=");
      if (!slot || !asset) throw new Error(`Expected ${name} slot=asset, got "${value}"`);
      parts.push({ slot, asset });
    }
    return parts;
  }

  function readAssetType(): "model" | "texture" | "environment" | "audio" | "navigation" | undefined {
    const value = readOption("--type");
    if (!value) return undefined;
    if (value === "model" || value === "texture" || value === "environment" || value === "audio" || value === "navigation") return value;
    throw new Error(`Unsupported --type value "${value}". Use model, texture, environment, audio, or navigation.`);
  }

  function readAssetQuality(): AuraAssetQuality | undefined {
    const value = readOption("--quality");
    if (!value) return undefined;
    if (value === "ungraded" || value === "blocked" || value === "prototype" || value === "candidate" || value === "release") return value;
    throw new Error(`Unsupported --quality value "${value}". Use ungraded, blocked, prototype, candidate, or release.`);
  }

  function readAssetRole(): AuraCliAssetRole | undefined {
    const value = readOption("--role");
    if (!value) return undefined;
    if (
      value === "character" ||
      value === "vehicle" ||
      value === "world" ||
      value === "environment" ||
      value === "track" ||
      value === "product" ||
      value === "weapon" ||
      value === "prop" ||
      value === "set-dressing" ||
      value === "debug" ||
      value === "abstract" ||
      value === "unknown"
    ) return value;
    throw new Error(`Unsupported --role value "${value}". Use character, vehicle, world, environment, track, product, weapon, prop, set-dressing, debug, abstract, or unknown.`);
  }

  function readOrientation(): AuraCliOrientationInspection | undefined {
    const file = readOption("--orientation-json");
    if (!file) return undefined;
    if (file.startsWith("--")) throw new Error("Expected --orientation-json <metadata.json>.");
    const parsed: unknown = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"));
    const root = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
    const candidate = root && "orientation" in root ? root.orientation : parsed;
    const orientation = typeof candidate === "object" && candidate !== null ? candidate as Partial<AuraCliOrientationInspection> : undefined;
    if (!orientation || orientation.source !== "manifest-override" || !Array.isArray(orientation.messages)) {
      throw new Error("--orientation-json must contain a manifest-override orientation with messages.");
    }
    return orientation as AuraCliOrientationInspection;
  }

  function readRenderedProbe(): AuraCliRenderedProbe | undefined {
    const metadataFile = readOption("--rendered-probe-json");
    const url = readOption("--rendered-probe");
    if (metadataFile && url) throw new Error("Use either --rendered-probe-json or --rendered-probe, not both.");
    if (metadataFile) {
      if (metadataFile.startsWith("--")) throw new Error("Expected --rendered-probe-json <metadata.json>.");
      return readRenderedProbeMetadata({ file: metadataFile });
    }
    if (!url) return undefined;
    if (url.startsWith("--")) throw new Error("Expected --rendered-probe <url-or-public-path>.");
    return {
      url,
      kind: "browser-screenshot",
      checkedAt: new Date().toISOString(),
    };
  }

  function readResolveConstraints(): CliResolveConstraints {
    const constraints: { license?: readonly ("CC0" | "CC-BY")[]; maxTriangles?: number; animated?: boolean } = {};
    const license = readOption("--license");
    if (license) {
      const normalized = license.toLowerCase();
      if (normalized === "cc0") constraints.license = ["CC0"];
      else if (normalized === "cc-by" || normalized === "ccby") constraints.license = ["CC-BY"];
      else throw new Error(`Unsupported --license value "${license}". Use cc0 or cc-by.`);
    }
    const maxTris = readOption("--max-tris");
    if (maxTris) {
      const parsed = Number.parseInt(maxTris, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--max-tris must be a positive integer (got "${maxTris}").`);
      constraints.maxTriangles = parsed;
    }
    if (hasFlag("--animated")) constraints.animated = true;
    const profile = readCliAssetProfile();
    return profile === "general" ? constraints : { ...constraints, profile };
  }

  function readCliAssetProfile(): CliAssetSearchProfile {
    const value = readOption("--profile");
    if (!value) return "general";
    if (isSupportedAssetProfile(value)) return value;
    throw new Error(`Unsupported --profile value "${value}". Use ${profileUsage()}.`);
  }

  return {
    hasFlag,
    readAssetQuality,
    readAssetRole,
    readAssetType,
    readAssetValidationOptions,
    readCliAssetProfile,
    readEvidenceOutput,
    readInspectFile,
    readOption,
    readOrientation,
    readParts,
    readProvenanceEvidence,
    readRenderedProbe,
    readResolveConstraints,
  };
}

function isSupportedAssetProfile(value: string): value is Exclude<CliAssetSearchProfile, "general"> {
  return (
    value === "fighting-character" ||
    value === "animation-character" ||
    value === "animation-prop" ||
    value === "animation-set" ||
    value === "animation-environment"
  );
}

export function profileUsage(): string {
  return "fighting-character|animation-character|animation-prop|animation-set|animation-environment";
}

export function printSearchReport(report: { readonly query: string; readonly profile: CliAssetSearchProfile; readonly candidates: readonly { readonly id: string; readonly source: string; readonly title: string; readonly license: string; readonly autoPullable: boolean; readonly sourcePage?: string; readonly profile?: { readonly suitable: boolean; readonly rejectionReasons: readonly string[]; readonly warnings: readonly string[] } }[]; readonly rejectedCandidates?: readonly { readonly id: string; readonly source: string; readonly title: string; readonly license: string; readonly autoPullable: boolean; readonly sourcePage?: string; readonly profile?: { readonly suitable: boolean; readonly rejectionReasons: readonly string[]; readonly warnings: readonly string[] } }[]; readonly deepLinks: readonly { readonly id: string; readonly title: string; readonly sourcePage?: string }[]; readonly warnings: readonly string[]; readonly messages: readonly string[] }): void {
  for (const message of report.messages) console.log(message);
  for (const candidate of report.candidates) {
    const profileTag = candidate.profile
      ? candidate.profile.suitable
        ? ", profile-ready"
        : ", profile-rejected"
      : "";
    const tag = candidate.autoPullable ? `auto-pullable${profileTag}` : `manual license check required${profileTag}`;
    console.log(`  [${candidate.source}] ${candidate.id}  "${candidate.title}"  ${candidate.license}  (${tag})`);
    if (candidate.profile && !candidate.profile.suitable) {
      for (const reason of candidate.profile.rejectionReasons) console.log(`    rejects: ${reason}`);
    }
  }
  if (report.rejectedCandidates && report.rejectedCandidates.length > 0) {
    console.log("Rejected by profile:");
    for (const candidate of report.rejectedCandidates) {
      console.log(`  [${candidate.source}] ${candidate.id}  "${candidate.title}"  ${candidate.license}`);
      for (const reason of candidate.profile?.rejectionReasons ?? []) console.log(`    rejects: ${reason}`);
    }
  }
  if (report.deepLinks.length > 0) {
    console.log("Marketplace deep-links (manual download, license check required):");
    for (const link of report.deepLinks) {
      console.log(`  ${link.id}  "${link.title}"  ${link.sourcePage ?? ""}`.trimEnd());
    }
  }
  for (const warning of report.warnings) console.error(`warning: ${warning}`);
}
