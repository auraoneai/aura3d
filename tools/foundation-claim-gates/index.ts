import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseReport, listFiles, writeJson } from "../foundation-reporting/index.js";

export interface FoundationClaimOccurrence {
  readonly path: string;
  readonly line: number;
  readonly claim: string;
  readonly text: string;
  readonly scoped: boolean;
}

export interface FoundationClaimGateReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly commit: string;
  readonly runId: string;
  readonly command: string;
  readonly sourceFileHashes: readonly { readonly path: string; readonly sha256: string }[];
  readonly blockedClaims: readonly string[];
  readonly screenshotPaths: readonly string[];
  readonly violations: readonly string[];
  readonly scannedFiles: readonly string[];
  readonly scopedOccurrences: readonly FoundationClaimOccurrence[];
  readonly blockedOccurrences: readonly FoundationClaimOccurrence[];
}

const reportPath = "tests/reports/foundation-claim-gates.json";

const claimPatterns = [
  { claim: "broad better-than-Three.js language", pattern: /\b(?:better\s+than|exceeds?|surpass(?:es)?|superior\s+to)\s+three\.?js\b/i },
  { claim: "Unity/Unreal replacement language", pattern: /\b(?:unity\s*\/\s*unreal\s+replacement|unity\s+replacement|unreal\s+replacement|unity\s+for\s+the\s+web|unreal\s+for\s+the\s+web|unity\s*\/\s*unreal\s+for\s+the\s+web)\b/i },
  { claim: "production-ready language", pattern: /\bproduction[-\s]+ready\b/i },
  { claim: "PBR parity language", pattern: /\b(?:production\s+pbr|pbr\s+parity|production[-\s]+grade\s+pbr)\b/i },
  { claim: "full WebGPU language", pattern: /\bfull\s+webgpu\b|\bcomplete\s+webgpu\b/i },
  { claim: "complete glTF support language", pattern: /\bcomplete\s+gltf\s+support\b|\bfull\s+gltf\s+support\b/i },
  { claim: "production texture-compression language", pattern: /\b(?:production|complete|full|broad)\s+(?:texture[-\s]+compression|compressed[-\s]+texture|ktx2\/basis)\b/i },
  { claim: "real editor language before editor workflow passes", pattern: /\b(?:full|production|unity-like|unreal-like)\s+editor\b/i },
] as const;

const scopedPattern = /\b(no|not|never|without|unsupported|blocked|disallowed|must not|do not|not yet|cannot|can't|does not|future|before|until|unless|lacks?|remain|limited|unclaimed|bounded|claim reset|claim|language|target|workflow|equivalent|absence|tried|failure|still disallowed|not true|stronger|outside this comparison scope|exclusions?)\b/i;

export function validateFoundationClaimGates(root = process.cwd()): FoundationClaimGateReport {
  const scannedFiles = listFiles(root, [
    "README.md",
    "package.json",
    "docs/project",
    "docs/project/known-limits.md",
    "docs/project/claim-guidelines.md",
    "docs/comparisons",
    "docs/benchmarks",
    "docs/examples",
    "packages",
  ], [".md", ".ts", "package.json"]);
  const scopedOccurrences: FoundationClaimOccurrence[] = [];
  const blockedOccurrences: FoundationClaimOccurrence[] = [];

  for (const path of scannedFiles) {
    if (path.startsWith("docs/project/product-studio-")) continue;
    const text = readFileSync(`${root}/${path}`, "utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      for (const candidate of claimPatterns) {
        if (!candidate.pattern.test(line)) continue;
        const context = lines.slice(Math.max(0, index - 12), Math.min(lines.length, index + 3)).join(" ");
        const occurrence = {
          path,
          line: index + 1,
          claim: candidate.claim,
          text: line.trim(),
          scoped: scopedPattern.test(context) || path.includes("claim-guidelines.md") || path.includes("known-limits.md"),
        };
        if (occurrence.scoped) {
          scopedOccurrences.push(occurrence);
        } else {
          blockedOccurrences.push(occurrence);
        }
      }
    }
  }

  const violations = blockedOccurrences.map((occurrence) =>
    `${occurrence.path}:${occurrence.line} contains unscoped disallowed foundation claim language: ${occurrence.claim}`,
  );
  const base = baseReport(root, {
    ok: violations.length === 0,
    command: "pnpm verify:foundation-code",
    runIdPrefix: "foundation-claim-gates",
    sourceFiles: scannedFiles,
    violations,
  });
  return {
    ...base,
    scannedFiles,
    scopedOccurrences,
    blockedOccurrences,
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = validateFoundationClaimGates();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    scannedFiles: report.scannedFiles.length,
    scopedOccurrences: report.scopedOccurrences.length,
    blockedOccurrences: report.blockedOccurrences.length,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
