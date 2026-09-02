import { readdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { addAsset } from "../index.js";
import type { AssetCliResult, AuraAssetQuality, AuraCliAssetRole } from "../asset-core-types.js";
import { readMeshyMetadata, validateMeshyEvidenceJson } from "./metadata.js";
import { createMeshyProvenance } from "./provenance.js";
import { resolveConfinedPath, selectMeshyGlb } from "./validation.js";

export interface ImportMeshyOptions {
  readonly projectDir?: string;
  readonly input: string;
  readonly name: string;
  readonly file?: string;
  readonly allowedRoot?: string;
  readonly rightsEvidence: string;
  readonly quality?: AuraAssetQuality;
  readonly role?: AuraCliAssetRole;
}
export interface ImportMeshyResult extends AssetCliResult {
  readonly typedKey: string;
  readonly sourceFile: string;
  readonly metadataFile: string;
  readonly rightsEvidence: string;
  readonly nextCommands: readonly string[];
}

const METADATA_NAMES = new Set(["meta.json", "metadata.json", "task.json"]);

export function importMeshyAsset(options: ImportMeshyOptions): ImportMeshyResult {
  const projectDir = realpathSync(resolve(options.projectDir ?? process.cwd()));
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(options.name)) {
    throw new Error(`Meshy asset name must be a safe TypeScript key: ${options.name}`);
  }
  const allowedRoot = resolve(projectDir, options.allowedRoot ?? "artifacts/meshy");
  const input = resolveConfinedPath(allowedRoot, isAbsolute(options.input) ? options.input : resolve(projectDir, options.input), "input");
  const sourceFile = selectMeshyGlb(input, options.file);
  const metadataFiles = readdirSync(input, { withFileTypes: true }).filter((entry) => entry.isFile() && METADATA_NAMES.has(entry.name.toLowerCase()));
  if (metadataFiles.length === 0) throw new Error("Meshy output is missing metadata (expected meta.json, metadata.json, or task.json).");
  if (metadataFiles.length > 1) throw new Error("Meshy output contains multiple metadata files; retain exactly one canonical metadata file.");
  const metadataFile = resolveConfinedPath(input, metadataFiles[0]!.name, "metadata");
  const rightsCandidate = isAbsolute(options.rightsEvidence) ? options.rightsEvidence : resolve(projectDir, options.rightsEvidence);
  const rightsEvidence = resolveConfinedPath(allowedRoot, rightsCandidate, "rights evidence");
  validateMeshyEvidenceJson(rightsEvidence);
  const metadata = readMeshyMetadata(metadataFile);
  const generation = createMeshyProvenance(projectDir, metadataFile, rightsEvidence, metadata);
  const result = addAsset({
    projectDir,
    file: relative(projectDir, sourceFile),
    name: options.name,
    type: "model",
    quality: options.quality ?? "candidate",
    role: options.role ?? "unknown",
    sourceFamily: "meshy",
    provenanceEvidence: [generation.rightsEvidence, generation.localMetadata],
    retrievedAt: metadata.finishedAt ?? metadata.createdAt,
    generation
  });
  const nextCommands = [
    `npx @aura3d/cli assets validate --asset ${options.name} --require-license`,
    `npx @aura3d/cli assets validate --asset ${options.name} --release --require-license`
  ];
  return {
    ...result,
    typedKey: `assets.${options.name}`,
    sourceFile: normalized(relative(projectDir, sourceFile)),
    metadataFile: generation.localMetadata,
    rightsEvidence: generation.rightsEvidence,
    nextCommands,
    messages: [...result.messages, `Typed key: assets.${options.name}`, ...nextCommands.map((command) => `Next: ${command}`)]
  };
}
function normalized(path: string): string { return path.replaceAll("\\", "/"); }
