import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { addAsset, inspectAsset } from "../index.js";
import { DEFAULT_AURA_ASSET_OUTPUT_DIR, DEFAULT_AURA_ASSET_PUBLIC_PATH } from "../asset-constants.js";
import type { AssetCliResult, AuraAssetQuality, AuraCliAssetEntry, AuraCliAssetRole } from "../asset-core-types.js";
import { readAssetManifest, writeAssetManifest, writeTypedAssets } from "../asset-manifest.js";
import { inspectGlbGeometry } from "../asset-screening-effects.js";
import { createMeshyAdmissionReport, inferMeshyAssetProfile, inspectMeshyTextureDimensions, type MeshyAdmissionReport, type MeshyAssetProfile } from "./admission.js";
import { retainMeshyEvidence } from "./evidence.js";
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
  /** §6.5 release path: candidate entry id whose --from-generated derived bytes are being imported. */
  readonly sourceEntry?: string;
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

export interface MeshyReleaseContext {
  /** The source candidate entry this release import republishes (derived output). */
  readonly entry: AuraCliAssetEntry;
}

/**
 * §6.5 release promotion: Meshy imports reach `release` only through bytes
 * that ARE a `derived` record produced by `assets optimize --from-generated`
 * on an existing candidate entry, whose release admission already passed
 * G1–G11 on those same bytes. `--source-entry <id>` identifies the candidate;
 * every missing link is listed so the caller sees exactly which gates or
 * records are absent.
 */
function meshyReleaseBlockers(projectDir: string, options: ImportMeshyOptions, manifest: ReturnType<typeof readAssetManifest>, sourceFile: string): { readonly blockers: readonly string[]; readonly source?: AuraCliAssetEntry } {
  const blockers: string[] = [];
  if (!options.sourceEntry) {
    blockers.push("--source-entry <id> — the candidate entry whose --from-generated derived output is being imported");
    return { blockers };
  }
  const source = manifest.assets.find((a) => a.id === options.sourceEntry);
  if (!source) {
    blockers.push(`source entry "${options.sourceEntry}" is not in aura.assets.json`);
    return { blockers };
  }
  const derived = source.derived;
  if (!derived) {
    blockers.push(`entry "${source.id}" has no derived record — run \`assets optimize ${source.id} --from-generated\` first`);
    return { blockers, source };
  }
  const stepNames = new Set(derived.steps.map((s) => s.step));
  const missingSteps = ["sliver-check", "remesh", "bake"].filter((s) => !stepNames.has(s));
  if (missingSteps.length > 0) {
    blockers.push(`derived.steps on "${source.id}" lack ${missingSteps.join(", ")} — not a \`--from-generated\` optimize run (§6.5)`);
  }
  const importedHash = `sha256:${createHash("sha256").update(readFileSync(sourceFile)).digest("hex")}`;
  if (derived.hash !== importedHash) {
    blockers.push(`imported bytes do not match derived output of "${source.id}" (${derived.hash.slice(0, 16)}… vs ${importedHash.slice(0, 16)}…) — import the file optimize wrote`);
  }
  const admission = source.admission;
  const gateFailures = (admission?.checks ?? []).filter((c) => c.verdict === "fail");
  if (admission?.status !== "admitted" || admission.quality !== "release" || gateFailures.length > 0) {
    const which = gateFailures.map((c) => c.gate).join(", ") || "release admission missing";
    blockers.push(`release admission on "${source.id}" — missing/failed gates: ${which} (run \`assets admit ${source.id} --quality release\`)`);
  }
  return { blockers, source };
}

export function importMeshyAsset(options: ImportMeshyOptions): ImportMeshyResult {
  const projectDir = realpathSync(resolve(options.projectDir ?? process.cwd()));
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(options.name)) throw new Error("Meshy asset name must be a safe TypeScript key: " + options.name);
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
  const retainedEvidence = retainMeshyEvidence({ projectDir, assetName: options.name, metadata, rights });
  const generation = createMeshyProvenance(projectDir, resolve(projectDir, retainedEvidence.metadataPath), resolve(projectDir, retainedEvidence.rightsPath), metadata);
  const inspection = inspectAsset({ projectDir, file: relative(projectDir, sourceFile), animation: true, humanoid: true, skeleton: true, morphs: true });
  const geometry = inspectGlbGeometry(sourceFile);
  const manifest = readAssetManifest(projectDir);
  let releaseContext: MeshyReleaseContext | undefined;
  if (options.quality === "release") {
    const { blockers, source } = meshyReleaseBlockers(projectDir, options, manifest, sourceFile);
    if (blockers.length > 0 || !source) {
      throw new Error(
        "Meshy release import refused (§6.5): release requires a `derived` record from `assets optimize --from-generated` " +
        "and a passing G1–G11 admission on the same bytes. Missing:\n  - " + blockers.join("\n  - "),
      );
    }
    releaseContext = { entry: source };
  }
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
    // release entries land as release only after the §6.5 chain verified.
    quality: options.quality === "release" ? "release" : (options.quality ?? "candidate"),
    role: options.role ?? releaseContext?.entry.role ?? roleForProfile(profile),
    sourceFamily: "meshy",
    ...(rights.licenseName ? { license: rights.licenseName, licenseName: rights.licenseName } : {}),
    ...(rights.licenseUrl ? { licenseUrl: rights.licenseUrl } : {}),
    ...(rights.licenseRaw ? { licenseRaw: rights.licenseRaw } : {}),
    provenanceEvidence,
    replaceProvenanceEvidence: true,
    retrievedAt: metadata.finishedAt ?? metadata.createdAt,
    generation,
    ...(thumbnail ? { renderedProbe: thumbnail.renderedProbe } : {})
  });

  // §6.5: carry the source entry's verified records onto the release entry —
  // the imported bytes ARE the derived output (hash-verified above), so
  // derived/admission/lookDev/artDirection transfer; aliasOf marks the
  // byte-identity for the dedup ledger.
  if (releaseContext) {
    const src = releaseContext.entry;
    const fresh = readAssetManifest(projectDir);
    const target = fresh.assets.find((a) => a.id === options.name);
    if (target) {
      const patched = {
        ...target,
        derived: src.derived,
        admission: src.admission,
        lookDev: src.lookDev,
        ...(src.artDirection ? { artDirection: src.artDirection } : {}),
        aliasOf: src.id,
      };
      writeAssetManifest(projectDir, {
        ...fresh,
        assets: fresh.assets.map((a) => (a.id === options.name ? patched : a)),
      });
      writeTypedAssets(projectDir, fresh);
    }
  }
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
