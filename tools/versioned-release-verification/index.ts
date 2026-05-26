import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface ReleaseArtifactManifest {
  readonly version?: string;
  readonly artifacts?: readonly ReleaseArtifactEntry[];
}

interface ReleaseArtifactEntry {
  readonly type?: "registry" | "tarball" | "git-tag" | "provenance" | "docs-site";
  readonly name?: string;
  readonly version?: string;
  readonly pathOrUrl?: string;
  readonly sha256?: string;
  readonly createdAt?: string;
}

interface VersionedReleaseReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly command: string;
  readonly packageVersion: string | null;
  readonly packagePrivate: boolean | null;
  readonly manifestPath: string;
  readonly artifactCount: number;
  readonly artifacts: readonly ReleaseArtifactEntry[];
  readonly violations: readonly string[];
}

const defaultManifestPath = "docs/project/release-artifacts.json";
const reportPath = "tests/reports/versioned-release.json";
const manifestPathFallbacks: Record<string, readonly string[]> = {
  "docs/project/release-artifacts.json": ["docs/release-artifacts.json"]
};

export function validateVersionedRelease(root = process.cwd(), manifestPath = defaultManifestPath): VersionedReleaseReport {
  const packageInfo = readPackageInfo(root);
  const resolvedManifestPath = resolveManifestPath(root, manifestPath);
  const manifest = readManifest(join(root, resolvedManifestPath));
  const artifacts = manifest?.artifacts ?? [];
  const packageVersion = packageInfo.version;
  const packagePrivate = packageInfo.private;
  const versionReady = packageVersion !== null && packageVersion !== "0.0.0-rebuild";
  const manifestVersionMatches = manifest?.version === packageVersion;
  const artifactVersionsMatch = artifacts.every((artifact) => artifact.version === packageVersion);
  const artifactsConcrete = artifacts.every((artifact) =>
    artifact.type &&
    artifact.name &&
    artifact.version &&
    artifact.pathOrUrl &&
    artifact.createdAt &&
    (artifact.type !== "tarball" || artifact.sha256)
  );
  const artifactFileViolations = artifacts.flatMap((artifact) => validateArtifactFile(root, artifact));
  const violations = [
    ...(versionReady ? [] : [`Package version is ${packageVersion ?? "unreadable"}; expected a deliberate non-0.0.0-rebuild version.`]),
    ...(packagePrivate === false ? [] : ["Root package is private or unreadable; versioned package release evidence requires private=false."]),
    ...(manifest ? [] : [`Missing release artifact manifest: ${manifestPath}`]),
    ...(manifestVersionMatches ? [] : [`Release artifact manifest version ${manifest?.version ?? "missing"} does not match package version ${packageVersion ?? "missing"}.`]),
    ...(artifacts.length > 0 ? [] : ["No release artifacts are recorded."]),
    ...(artifactVersionsMatch ? [] : ["At least one release artifact version does not match package.json."]),
    ...(artifactsConcrete ? [] : ["At least one release artifact is missing type, name, version, pathOrUrl, createdAt, or tarball sha256."]),
    ...artifactFileViolations
  ];
  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-versioned-release-run",
    command: "pnpm verify:versioned-release",
    packageVersion,
    packagePrivate,
    manifestPath,
    artifactCount: artifacts.length,
    artifacts,
    violations
  };
}

function resolveManifestPath(root: string, manifestPath: string): string {
  if (existsSync(join(root, manifestPath))) return manifestPath;
  for (const fallback of manifestPathFallbacks[manifestPath] ?? []) {
    if (existsSync(join(root, fallback))) return fallback;
  }
  return manifestPath;
}

function readPackageInfo(root: string): { readonly version: string | null; readonly private: boolean | null } {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    return {
      version: typeof parsed.version === "string" ? parsed.version : null,
      private: typeof parsed.private === "boolean" ? parsed.private : null
    };
  } catch {
    return { version: null, private: null };
  }
}

function readManifest(path: string): ReleaseArtifactManifest | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(parsed)) return null;
  return {
    version: typeof parsed.version === "string" ? parsed.version : undefined,
    artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts.filter(isRecord).map((artifact) => ({
      type: isArtifactType(artifact.type) ? artifact.type : undefined,
      name: typeof artifact.name === "string" ? artifact.name : undefined,
      version: typeof artifact.version === "string" ? artifact.version : undefined,
      pathOrUrl: typeof artifact.pathOrUrl === "string" ? artifact.pathOrUrl : undefined,
      sha256: typeof artifact.sha256 === "string" ? artifact.sha256 : undefined,
      createdAt: typeof artifact.createdAt === "string" ? artifact.createdAt : undefined
    })) : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArtifactType(value: unknown): value is NonNullable<ReleaseArtifactEntry["type"]> {
  return value === "registry" || value === "tarball" || value === "git-tag" || value === "provenance" || value === "docs-site";
}

function validateArtifactFile(root: string, artifact: ReleaseArtifactEntry): readonly string[] {
  if (artifact.type !== "tarball" || !artifact.pathOrUrl) return [];
  if (/^https?:\/\//i.test(artifact.pathOrUrl)) return [];
  const path = join(root, artifact.pathOrUrl);
  if (!existsSync(path)) return [`Tarball artifact is missing: ${artifact.pathOrUrl}.`];
  if (!artifact.sha256) return [`Tarball artifact ${artifact.pathOrUrl} is missing sha256.`];
  const actualSha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  return actualSha256 === artifact.sha256
    ? []
    : [`Tarball artifact ${artifact.pathOrUrl} sha256 ${actualSha256} does not match manifest ${artifact.sha256}.`];
}

function writeReport(root: string, report: VersionedReleaseReport): void {
  const outputPath = join(root, reportPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = validateVersionedRelease();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    packageVersion: report.packageVersion,
    packagePrivate: report.packagePrivate,
    artifactCount: report.artifactCount,
    violations: report.violations
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
