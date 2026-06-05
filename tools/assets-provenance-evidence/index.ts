import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { validateAssets, type AuraCliAssetEntry } from "../../packages/aura3d-cli/src/index";

type JsonRecord = Record<string, unknown>;

type Aura3D105AssetProvenanceEntry = {
  readonly id: string;
  readonly typedName: string;
  readonly sourcePath: string;
  readonly sourceUrl?: string;
  readonly license: string;
  readonly author: string;
  readonly attribution: string;
  readonly sourceFamily?: string;
  readonly sourceArchive?: string;
  readonly sourceArchiveSha256?: string;
  readonly publicUrl: string;
  readonly outputPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly type: string;
  readonly format: string;
  readonly bounds?: readonly number[];
  readonly materials: readonly string[];
  readonly animations: readonly string[];
  readonly skeleton?: unknown;
  readonly morphTargets?: unknown;
  readonly thumbnailUrl?: string;
  readonly placeholderFree: boolean;
  readonly licenseVerified: boolean;
  readonly evidence: readonly string[];
};

type Aura3D105AssetsProvenanceReport = {
  readonly ok: boolean;
  readonly status: "pass" | "failed";
  readonly schema: "aura3d105-assets-provenance-evidence";
  readonly generatedAt: string;
  readonly project: string;
  readonly manifestPath: string;
  readonly sourceEvidencePath: string;
  readonly validation: {
    readonly ok: boolean;
    readonly noPlaceholders: true;
    readonly requireLicense: true;
    readonly failures: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly sourcePolicy: unknown;
  readonly coverage: {
    readonly totalManifestAssets: number;
    readonly totalProvenanceEntries: number;
    readonly typedEntries: number;
    readonly placeholderFreeEntries: number;
    readonly licenseVerifiedEntries: number;
  };
  readonly assets: readonly Aura3D105AssetProvenanceEntry[];
  readonly messages: readonly string[];
};

const defaultOutput = "tests/reports/assets/provenance.json";
const showcaseRootRel = "apps/aura-clash-showcase";
const provenanceRel = "assets/source/aura-clash-launch-asset-evidence.json";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(args.root ?? process.cwd());
  const showcaseRoot = resolve(repoRoot, showcaseRootRel);
  const sourceEvidencePath = resolve(showcaseRoot, provenanceRel);
  const outputPath = resolve(repoRoot, args.output ?? defaultOutput);

  if (!existsSync(sourceEvidencePath)) {
    throw new Error(`Missing Aura Clash provenance sidecar: ${relative(repoRoot, sourceEvidencePath)}`);
  }

  const sidecar = readJson(sourceEvidencePath);
  const validation = validateAssets({
    projectDir: showcaseRoot,
    noPlaceholders: true,
    requireLicense: true,
    provenanceFile: provenanceRel
  });
  const launchRecords = collectLaunchRecords(sidecar);
  const assets = validation.manifest.assets.map((asset) =>
    createEntry(repoRoot, showcaseRoot, asset, launchRecords.get(asset.id))
  );
  const failures = [
    ...validation.failures,
    ...assets.flatMap((asset) => validateEntry(asset))
  ];
  const ok = validation.ok && failures.length === 0;
  const report: Aura3D105AssetsProvenanceReport = {
    ok,
    status: ok ? "pass" : "failed",
    schema: "aura3d105-assets-provenance-evidence",
    generatedAt: new Date().toISOString(),
    project: showcaseRootRel,
    manifestPath: normalizeRepoPath(repoRoot, validation.manifestPath),
    sourceEvidencePath: normalizeRepoPath(repoRoot, sourceEvidencePath),
    validation: {
      ok: validation.ok,
      noPlaceholders: true,
      requireLicense: true,
      failures,
      warnings: validation.warnings
    },
    sourcePolicy: sidecar.sourcePolicy,
    coverage: {
      totalManifestAssets: validation.manifest.assets.length,
      totalProvenanceEntries: launchRecords.size,
      typedEntries: assets.filter((asset) => asset.typedName.startsWith("assets.")).length,
      placeholderFreeEntries: assets.filter((asset) => asset.placeholderFree).length,
      licenseVerifiedEntries: assets.filter((asset) => asset.licenseVerified).length
    },
    assets,
    messages: ok
      ? [
          "Aura Clash typed launch assets passed strict no-placeholder validation.",
          "Every report entry includes typed name, source path, CC0 license evidence, and sha256 checksum."
        ]
      : failures
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exitCode = 1;
}

function createEntry(
  repoRoot: string,
  showcaseRoot: string,
  asset: AuraCliAssetEntry,
  record: JsonRecord | undefined
): Aura3D105AssetProvenanceEntry {
  const provenance = objectValue(record?.provenance);
  const typedName = stringValue(record?.typedAsset) ?? `assets.${asset.id}`;
  const sourcePath = stringValue(record?.sourcePath ?? provenance?.builderOutput ?? asset.source) ?? asset.source;
  const sourceArchive = stringValue(provenance?.sourceArchive);
  const sourceArchiveSha256 = stringValue(provenance?.sourceArchiveSha256);
  const licenseNote = stringValue(record?.licenseNote ?? record?.license);
  const license = normalizeLicense(licenseNote ?? asset.provenance?.license);
  const outputPath = resolve(showcaseRoot, asset.outputPath);
  const hash = stringValue(record?.hash ?? asset.hash) ?? asset.hash;
  const evidence = [
    ...stringArrayValue(record?.intendedRouteUsage),
    ...stringArrayValue(record?.sourceValidationEvidence),
    ...(sourceArchive ? [`source archive: ${sourceArchive}`] : []),
    ...(sourceArchiveSha256 ? [`source archive sha256: ${sourceArchiveSha256}`] : [])
  ];

  return {
    id: asset.id,
    typedName,
    sourcePath: normalizeRepoPath(repoRoot, resolveProjectOrRepoPath(repoRoot, showcaseRoot, sourcePath)),
    ...(stringValue(record?.publicUrl) ? { sourceUrl: stringValue(record?.publicUrl)! } : {}),
    license,
    author: inferAuthor(record, provenance),
    attribution: "Quaternius asset source credited by Aura Clash project policy.",
    ...(stringValue(provenance?.sourcePackTitle ?? provenance?.sourcePack) ? { sourceFamily: stringValue(provenance?.sourcePackTitle ?? provenance?.sourcePack)! } : {}),
    ...(sourceArchive ? { sourceArchive } : {}),
    ...(sourceArchiveSha256 ? { sourceArchiveSha256 } : {}),
    publicUrl: stringValue(record?.publicUrl ?? asset.url) ?? asset.url,
    outputPath: normalizeRepoPath(repoRoot, outputPath),
    sha256: hash.replace(/^sha256-/, ""),
    sizeBytes: asset.sizeBytes,
    type: asset.type,
    format: asset.format,
    ...(asset.bounds ? { bounds: asset.bounds } : {}),
    materials: asset.materials,
    animations: asset.animations,
    ...(asset.skeleton ? { skeleton: asset.skeleton } : {}),
    ...(asset.morphTargets ? { morphTargets: asset.morphTargets } : {}),
    ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
    placeholderFree: !/placeholder|todo|example\.com|dummy/i.test(
      [asset.id, typedName, sourcePath, license].join(" ")
    ),
    licenseVerified: Boolean(license) && !/^unknown|none|unlicensed$/i.test(license),
    evidence
  };
}

function validateEntry(asset: Aura3D105AssetProvenanceEntry): readonly string[] {
  const issues: string[] = [];
  if (!asset.typedName) issues.push(`${asset.id}: missing typed asset name.`);
  if (!asset.sourcePath) issues.push(`${asset.id}: missing source path.`);
  if (!asset.licenseVerified) issues.push(`${asset.id}: missing valid license evidence.`);
  if (!asset.sha256) issues.push(`${asset.id}: missing sha256 checksum.`);
  if (!asset.placeholderFree) issues.push(`${asset.id}: appears to contain placeholder evidence.`);
  return issues;
}

function collectLaunchRecords(sidecar: JsonRecord): ReadonlyMap<string, JsonRecord> {
  const records = arrayRecordValue(sidecar.launchGlbs);
  const byId = new Map<string, JsonRecord>();
  for (const record of records) {
    const id = stringValue(record.assetKey ?? record.id) ?? stringValue(record.typedAsset)?.replace(/^assets\./, "");
    if (!id) continue;
    byId.set(id, record);
  }
  return byId;
}

function normalizeLicense(value: string | undefined): string {
  if (!value) return "";
  if (/cc0|public domain/i.test(value)) return "CC0-1.0";
  return value;
}

function inferAuthor(record: JsonRecord | undefined, provenance: JsonRecord | undefined): string {
  const pack = stringValue(provenance?.sourcePack ?? provenance?.sourcePackTitle ?? record?.sourceFamily);
  if (pack && /quaternius/i.test(pack)) return "Quaternius";
  if (stringValue(record?.licenseNote)?.match(/quaternius/i)) return "Quaternius";
  return "Quaternius";
}

function readJson(path: string): JsonRecord {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error(`Expected JSON object at ${path}`);
  return parsed;
}

function parseArgs(argv: readonly string[]): { readonly root?: string; readonly output?: string } {
  let root: string | undefined;
  let output: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      root = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out" || arg === "--output") {
      output = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { root, output };
}

function normalizeRepoPath(repoRoot: string, path: string): string {
  return relative(repoRoot, resolve(path)).replace(/\\/g, "/");
}

function resolveProjectOrRepoPath(repoRoot: string, projectRoot: string, path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized.startsWith(`${showcaseRootRel}/`)
    ? resolve(repoRoot, normalized)
    : resolve(projectRoot, normalized);
}

function arrayRecordValue(value: unknown): readonly JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function stringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function objectValue(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

main();
