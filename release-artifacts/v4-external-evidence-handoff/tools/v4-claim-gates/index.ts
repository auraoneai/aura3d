import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseReport, blockedV4Claims, listFiles, writeJson } from "../v4-reporting/index.js";

export interface V4ClaimOccurrence {
  readonly path: string;
  readonly line: number;
  readonly claim: string;
  readonly text: string;
  readonly scoped: boolean;
}

const reportPath = "tests/reports/v4-claim-gates.json";

const claimPatterns = [
  { claim: "broad better-than-Three.js language", pattern: /\b(?:better\s+than|exceeds?|surpass(?:es)?|superior\s+to)\s+three\.?js\b/i },
  { claim: "broad better-than-Babylon.js language", pattern: /\b(?:better\s+than|exceeds?|surpass(?:es)?|superior\s+to)\s+babylon(?:\.js)?\b/i },
  { claim: "Unity/Unreal replacement language", pattern: /\b(?:unity\s*\/\s*unreal\s+replacement|unity\s+replacement|unreal\s+replacement|unity\s+for\s+the\s+web|unreal\s+for\s+the\s+web|unity\s*\/\s*unreal\s+for\s+the\s+web)\b/i },
  { claim: "production-ready language", pattern: /\bproduction[-\s]+ready\b/i },
  { claim: "complete PBR parity language", pattern: /\b(?:complete|full|production[-\s]+grade|production)\s+pbr\b|\bpbr\s+parity\b/i },
] as const;

const scopedPattern = /\b(no|not|never|without|unsupported|blocked|disallowed|must not|do not|not yet|cannot|can't|does not|future|before|until|unless|lacks?|remain|limited|unclaimed|bounded|claim|language|target|workflow|equivalent|absence|failure|still disallowed|not true|outside|exclusions?|allowed claim|required|gate)\b/i;

export function validateV4ClaimGates(root = process.cwd()) {
  const scannedFiles = listFiles(root, [
    "README.md",
    "package.json",
    "docs/v4",
    "docs/project/known-limits.md",
    "docs/project/claim-guidelines.md",
    "docs/comparisons",
    "docs/benchmarks",
    "docs/examples",
    "examples",
    "packages",
    "tools/v4-claim-gates",
    "tools/v4-current-capability",
    "tools/v4-benchmarks",
  ], [".md", ".ts", "package.json"]);
  const scopedOccurrences: V4ClaimOccurrence[] = [];
  const blockedOccurrences: V4ClaimOccurrence[] = [];

  for (const path of scannedFiles) {
    if (path.startsWith("docs/v2/") || path.startsWith("docs/v3/")) continue;
    const text = readFileSync(`${root}/${path}`, "utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      for (const candidate of claimPatterns) {
        if (!candidate.pattern.test(line)) continue;
        const context = lines.slice(Math.max(0, index - 12), Math.min(lines.length, index + 4)).join(" ");
        const occurrence = {
          path,
          line: index + 1,
          claim: candidate.claim,
          text: line.trim(),
          scoped: scopedPattern.test(context) || path.includes("claim-guidelines.md") || path.includes("known-limits.md"),
        };
        if (occurrence.scoped) scopedOccurrences.push(occurrence);
        else blockedOccurrences.push(occurrence);
      }
    }
  }

  const violations = blockedOccurrences.map((occurrence) =>
    `${occurrence.path}:${occurrence.line} contains unscoped disallowed v4 claim language: ${occurrence.claim}`,
  );
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:v4-code",
      runIdPrefix: "v4-claim-gates",
      sourceFiles: scannedFiles,
      blockedClaims: blockedV4Claims,
      violations,
    }),
    scannedFiles,
    scopedOccurrences,
    blockedOccurrences,
  };
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = validateV4ClaimGates();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    scannedFiles: report.scannedFiles.length,
    scopedOccurrences: report.scopedOccurrences.length,
    blockedOccurrences: report.blockedOccurrences.length,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
