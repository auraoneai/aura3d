import { readdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { addAsset, inspectAsset } from "../index.js";
import { DEFAULT_AURA_ASSET_OUTPUT_DIR, DEFAULT_AURA_ASSET_PUBLIC_PATH } from "../asset-constants.js";
import type { AssetCliResult, AuraAssetQuality, AuraCliAssetRole } from "../asset-core-types.js";
import { readAssetManifest } from "../asset-manifest.js";
import { inspectGlbGeometry } from "../asset-screening-effects.js";
import { createMeshyAdmissionReport, inferMeshyAssetProfile, inspectMeshyTextureDimensions, type MeshyAdmissionReport, type MeshyAssetProfile } from "./admission.js";
import { readMeshyMetadata, validateMeshyEvidenceJson } from "./metadata.js";
import { createMeshyProvenance } from "./provenance.js";
import { retainMeshyThumbnail } from "./thumbnail.js";
import { resolveConfinedPath, selectMeshyGlb } from "./validation.js";

export interface ImportMeshyOptions {
  readonly projectDir?: string;
  readonly input: string;
  readonly name: string;
  readonly file?: string;
  readonly thumbnail?: string;
  readonly allowedRoot?: string;
  readonly rightsEvidence: string;
  readonly quality?: AuraAssetQuality;
  readonly role?: AuraCliAssetRole;
  readonly profile?: MeshyAssetProfile;
}
export interface ImportMeshyResult extends AssetCliResult {
  readonly typedKey: string;
  readonly sourceFile: string;
  readonly metadataFile: string;
  readonly rightsEvidence: string;
  readonly thumbnailEvidence?: string;
  readonly admission: MeshyAdmissionReport;
  readonly nextCommands: readonly string[];
}

const METADATA_NAMES = new Set(["meta.json", "metadata.json", "task.json"]);

export function importMeshyAsset(options: ImportMeshyOptions): ImportMeshyResult {
  const projectDir = realpathSync(resolve(options.projectDir ?? process.cwd()));
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(options.name)) throw new Error("Meshy asset name must be a safe TypeScript key: " + options.name);
  if (options.quality === "release") throw new Error("Meshy imports cannot certify release quality. Import as candidate, then complete route evidence and independent human review.");
  const allowedRoot = resolve(projectDir, options.allowedRoot ?? "artifacts/meshy");
  const input = resolveConfinedPath(allowedRoot, isAbsolute(options.input) ? options.input : resolve(projectDir, options.input), "input");
  const sourceFile = selectMeshyGlb(input, options.file);
  const metadataFiles = readdirSync(input, { withFileTypes: true }).filter((entry) => entry.isFile() && METADATA_NAMES.has(entry.name.toLowerCase()));
  if (metadataFiles.length === 0) throw new Error("Meshy output is missing metadata (expected meta.json, metadata.json, or task.json).");
  if (metadataFiles.length > 1) throw new Error("Meshy output contains multiple metadata files; retain exactly one canonical metadata file.");
  const metadataFile = resolveConfinedPath(input, metadataFiles[0]!.name, "metadata");
  const rightsCandidate = isAbsolute(options.rightsEvidence) ? options.rightsEvidence : resolve(projectDir, options.rightsEvidence);
  const rightsEvidence = resolveConfinedPath(allowedRoot, rightsCandidate, "rights evidence");
  const rights = validateMeshyEvidenceJson(rightsEvidence);
  const metadata = readMeshyMetadata(metadataFile);
  const generation = createMeshyProvenance(projectDir, metadataFile, rightsEvidence, metadata);
  const inspection = inspectAsset({ projectDir, file: relative(projectDir, sourceFile), animation: true, humanoid: true, skeleton: true, morphs: true });
  const geometry = inspectGlbGeometry(sourceFile);
  const manifest = readAssetManifest(projectDir);
  const thumbnail = retainMeshyThumbnail({
    projectDir,
    inputDir: input,
    requested: options.thumbnail,
    assetName: options.name,
    outputDir: manifest.outputDir ?? DEFAULT_AURA_ASSET_OUTPUT_DIR,
    publicPath: manifest.assetBasePath ?? DEFAULT_AURA_ASSET_PUBLIC_PATH
  });
  const profile = options.profile ?? inferMeshyAssetProfile(options.role);
  const admission = createMeshyAdmissionReport({
    profile,
    inspection,
    geometry,
    textureDimensions: inspectMeshyTextureDimensions(sourceFile),
    hasThumbnailEvidence: Boolean(thumbnail)
  });
  const provenanceEvidence = [generation.rightsEvidence, generation.localMetadata, ...(thumbnail ? [thumbnail.outputPath] : [])];
  const result = addAsset({
    projectDir,
    file: relative(projectDir, sourceFile),
    name: options.name,
    type: "model",
    quality: options.quality ?? "candidate",
    role: options.role ?? roleForProfile(profile),
    sourceFamily: "meshy",
    ...(rights.licenseName ? { license: rights.licenseName, licenseName: rights.licenseName } : {}),
    ...(rights.licenseUrl ? { licenseUrl: rights.licenseUrl } : {}),
    ...(rights.licenseRaw ? { licenseRaw: rights.licenseRaw } : {}),
    provenanceEvidence,
    retrievedAt: metadata.finishedAt ?? metadata.createdAt,
    generation,
    ...(thumbnail ? { renderedProbe: thumbnail.renderedProbe } : {})
  });
  const nextCommands = [
    "npx @aura3d/cli assets validate --asset " + options.name + " --require-license",
    "npx @aura3d/cli assets validate --asset " + options.name + " --release --require-license"
  ];
  const admissionMessages = [
    "Meshy " + profile + " admission: " + (admission.routeReady ? "checks complete" : admission.blockers.length > 0 ? "candidate blockers found" : "candidate evidence remains unproven") + ".",
    ...admission.blockers.map((message) => "Admission blocker: " + message),
    ...admission.unproven.map((message) => "Admission unproven: " + message),
    ...admission.nextActions.map((message) => "Admission next: " + message)
  ];
  return {
    ...result,
    typedKey: "assets." + options.name,
    sourceFile: normalized(relative(projectDir, sourceFile)),
    metadataFile: generation.localMetadata,
    rightsEvidence: generation.rightsEvidence,
    ...(thumbnail ? { thumbnailEvidence: thumbnail.outputPath } : {}),
    admission,
    nextCommands,
    messages: [...result.messages, "Typed key: assets." + options.name, ...admissionMessages, ...nextCommands.map((command) => "Next: " + command)]
  };
}

function roleForProfile(profile: MeshyAssetProfile): AuraCliAssetRole {
  if (profile === "humanoid") return "character";
  if (profile === "vehicle") return "vehicle";
  if (profile === "environment") return "environment";
  return "prop";
}
function normalized(path: string): string { return path.replaceAll("\\", "/"); }
