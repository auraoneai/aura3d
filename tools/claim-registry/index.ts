import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export type ClaimViolationKind = "blocked-claim" | "missing-evidence" | "stale-evidence";

export interface ClaimRegistryEntry {
  readonly claim: string;
  readonly gate: string;
  readonly evidenceRequired: string;
  readonly evidencePaths: readonly string[];
}

export interface ClaimViolation {
  readonly kind: ClaimViolationKind;
  readonly path: string;
  readonly line?: number;
  readonly claim: string;
  readonly message: string;
}

export interface ClaimOccurrence {
  readonly path: string;
  readonly line?: number;
  readonly claim: string;
  readonly scoped: boolean;
}

export interface ClaimRegistryReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly registryPath: string;
  readonly scannedFiles: readonly string[];
  readonly allowedClaims: readonly ClaimRegistryEntry[];
  readonly blockedClaims: readonly ClaimRegistryEntry[];
  readonly allowedOccurrences: readonly ClaimOccurrence[];
  readonly violations: readonly ClaimViolation[];
}

export interface ClaimRegistryOptions {
  readonly registryPath?: string;
  readonly reportPath?: string;
  readonly releaseRunId?: string;
  readonly startedAt?: Date;
}

const defaultRegistryPath = "docs/project/product-studio-claim-registry.md";
const defaultReportPath = "tests/reports/claim-registry.json";
const canonicalPathFallbacks: Record<string, readonly string[]> = {
  "docs/project/product-studio-claim-registry.md": ["docs/product-studio/claim-registry.md"],
  "docs/project/known-limits.md": ["docs/known-limits.md"]
};
const strongerClaimPatterns = [
  { claim: "Aura3D is better than Three.js.", pattern: /\bbetter\s+than\s+three\.?js\b/i },
  { claim: "Aura3D is Unity/Unreal for the web.", pattern: /\b(?:unity\s*\/\s*unreal|unreal\s*\/\s*unity|unity\b.*\bunreal|unreal\b.*\bunity)\b/i },
  { claim: "Aura3D is production-ready.", pattern: /\bproduction[-\s]+ready\b/i },
  { claim: "Aura3D has production PBR parity.", pattern: /\bproduction\s+pbr\s+parity\b|\bpbr\s+parity\b/i },
  { claim: "Aura3D has full WebGPU support.", pattern: /\bfull\s+webgpu\s+support\b/i }
] as const;

export function validateClaimRegistry(root = process.cwd(), options: ClaimRegistryOptions = {}): ClaimRegistryReport {
  const registryPath = normalizePath(options.registryPath ?? defaultRegistryPath);
  const registry = parseClaimRegistry(readText(root, registryPath), registryPath);
  const scannedFiles = listPublicClaimFiles(root);
  const releaseRunId = options.releaseRunId ?? process.env.A3D_RELEASE_RUN_ID ?? "standalone-claim-registry-run";
  const startedAt = options.startedAt ?? (process.env.A3D_RELEASE_STARTED_AT ? new Date(process.env.A3D_RELEASE_STARTED_AT) : undefined);
  const allowedOccurrences: ClaimOccurrence[] = [];
  const violations: ClaimViolation[] = [];

  for (const path of scannedFiles) {
    const text = readText(root, path);
    if (path.endsWith("package.json")) {
      scanPackageClaims(path, text, violations, allowedOccurrences);
    } else {
      scanMarkdownClaims(path, text, violations, allowedOccurrences);
    }
  }

  for (const entry of registry.allowedClaims) {
    for (const evidencePath of entry.evidencePaths) {
      const absoluteEvidencePath = join(root, evidencePath);
      if (!existsSync(absoluteEvidencePath)) {
        violations.push({
          kind: "missing-evidence",
          path: registryPath,
          claim: entry.claim,
          message: `Allowed claim evidence is missing: ${evidencePath}`
        });
        continue;
      }
      if (evidencePath.endsWith(".json")) {
        const stale = inspectJsonEvidenceFreshness(root, evidencePath, releaseRunId, startedAt);
        if (stale) {
          violations.push({
            kind: "stale-evidence",
            path: evidencePath,
            claim: entry.claim,
            message: stale
          });
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    releaseRunId,
    registryPath,
    scannedFiles,
    allowedClaims: registry.allowedClaims,
    blockedClaims: registry.blockedClaims,
    allowedOccurrences,
    violations
  };
}

export function writeClaimRegistryReport(root = process.cwd(), report: ClaimRegistryReport, reportPath = defaultReportPath): void {
  const path = join(root, reportPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

function parseClaimRegistry(text: string, path: string): { allowedClaims: ClaimRegistryEntry[]; blockedClaims: ClaimRegistryEntry[] } {
  const lines = text.split(/\r?\n/);
  return {
    allowedClaims: parseTableAfterHeading(lines, "## Allowed Today", path).map((row) => ({
      claim: row[0] ?? "",
      gate: row[1] ?? "",
      evidenceRequired: row[2] ?? "",
      evidencePaths: extractEvidencePaths(row[2] ?? "")
    })),
    blockedClaims: parseTableAfterHeading(lines, "## Blocked Until Gates Pass", path).map((row) => ({
      claim: row[0] ?? "",
      gate: row[1] ?? "",
      evidenceRequired: row[2] ?? "",
      evidencePaths: extractEvidencePaths(row[2] ?? "")
    }))
  };
}

function parseTableAfterHeading(lines: readonly string[], heading: string, path: string): string[][] {
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex < 0) {
    throw new Error(`Claim registry ${path} is missing heading: ${heading}`);
  }
  const rows: string[][] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line) continue;
    if (line.startsWith("## ")) break;
    if (!line.startsWith("|") || /^\|\s*-+/.test(line)) continue;
    const cells = line.slice(1, -1).split("|").map((cell) => cell.trim().replace(/`/g, ""));
    if (cells[0] === "Claim") continue;
    if (cells[0]) rows.push(cells);
  }
  return rows;
}

function scanMarkdownClaims(
  path: string,
  text: string,
  violations: ClaimViolation[],
  allowedOccurrences: ClaimOccurrence[]
): void {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    scanClaimText(path, index + 1, line, violations, allowedOccurrences);
  }
}

function scanPackageClaims(
  path: string,
  text: string,
  violations: ClaimViolation[],
  allowedOccurrences: ClaimOccurrence[]
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const record = parsed as Record<string, unknown>;
  const claimText = [record.name, record.description, record.keywords].flat().filter((value): value is string => typeof value === "string").join(" ");
  scanClaimText(path, undefined, claimText, violations, allowedOccurrences);
}

function scanClaimText(
  path: string,
  line: number | undefined,
  text: string,
  violations: ClaimViolation[],
  allowedOccurrences: ClaimOccurrence[]
): void {
  for (const candidate of strongerClaimPatterns) {
    if (!candidate.pattern.test(text)) continue;
    const scoped = isScopedOrNegated(text);
    if (scoped) {
      allowedOccurrences.push({ path, ...(line ? { line } : {}), claim: candidate.claim, scoped: true });
      continue;
    }
    violations.push({
      kind: "blocked-claim",
      path,
      ...(line ? { line } : {}),
      claim: candidate.claim,
      message: "Public claim language is stronger than the current registered gate evidence."
    });
  }
}

function listPublicClaimFiles(root: string): readonly string[] {
  const files = walk(root).map((path) => canonicalizePublicClaimPath(normalizePath(relative(root, path))));
  return files.filter((path) => {
    if (path === "package.json" || path === "README.md" || path === "CHANGELOG.md" || /^RELEASE[^/]*\.md$/i.test(path)) return true;
    if (/^packages\/[^/]+\/package\.json$/.test(path)) return true;
    if (/^examples\/[^/]+\/README\.md$/.test(path)) return true;
    return /^docs\/(?:api|tutorials|examples|benchmarks)\//.test(path) || path === "docs/project/known-limits.md";
  }).sort((left, right) => left.localeCompare(right));
}

function walk(root: string): readonly string[] {
  const output: string[] = [];
  function visit(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if ([".git", "node_modules", "dist", "test-results"].includes(entry.name)) continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        visit(child);
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name === "package.json")) {
        output.push(child);
      }
    }
  }
  visit(root);
  return output;
}

function inspectJsonEvidenceFreshness(root: string, evidencePath: string, releaseRunId: string, startedAt?: Date): string | null {
  const path = join(root, evidencePath);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  if (typeof record.releaseRunId === "string" && record.releaseRunId !== releaseRunId && releaseRunId !== "standalone-claim-registry-run") {
    return `Evidence releaseRunId ${record.releaseRunId} does not match current releaseRunId ${releaseRunId}.`;
  }
  if (startedAt && typeof record.generatedAt === "string" && Date.parse(record.generatedAt) < startedAt.getTime() - 1000) {
    return "Evidence was generated before the current release run started.";
  }
  if (startedAt && typeof record.generatedAt !== "string" && statSync(path).mtimeMs < startedAt.getTime() - 1000) {
    return "Evidence file was modified before the current release run started and has no generatedAt timestamp.";
  }
  return null;
}

function extractEvidencePaths(text: string): readonly string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(/\b(?:docs|examples|tests|packages|tools)\/[A-Za-z0-9._/-]+/g)) {
    paths.add(match[0]!);
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function isScopedOrNegated(text: string): boolean {
  return /\b(no|not|never|without|unsupported|blocked|disallowed|must not|not yet|cannot|can't|does not|do not)\b/i.test(text);
}

function readText(root: string, path: string): string {
  return readFileSync(join(root, resolveReadablePath(root, path)), "utf8");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function canonicalizePublicClaimPath(path: string): string {
  if (path === "docs/known-limits.md") return "docs/project/known-limits.md";
  if (path === "docs/product-studio/claim-registry.md") return "docs/project/product-studio-claim-registry.md";
  return path;
}

function resolveReadablePath(root: string, path: string): string {
  const normalized = normalizePath(path);
  if (existsSync(join(root, normalized))) return normalized;
  for (const fallback of canonicalPathFallbacks[normalized] ?? []) {
    if (existsSync(join(root, fallback))) return fallback;
  }
  return normalized;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = validateClaimRegistry();
  writeClaimRegistryReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    scannedFiles: report.scannedFiles.length,
    allowedClaims: report.allowedClaims.length,
    blockedClaims: report.blockedClaims.length,
    violations: report.violations.length
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
