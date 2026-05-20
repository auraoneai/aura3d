import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface DocContradictionViolation {
  readonly file: string;
  readonly line: number;
  readonly kind: "go-with-incomplete-language" | "stale-trace-total" | "status-disagreement";
  readonly text: string;
  readonly reason: string;
}

export interface DocContradictionReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly checkedFiles: readonly string[];
  readonly violations: readonly DocContradictionViolation[];
}

const defaultFiles = [
  "docs/project/completion-audit.md",
  "docs/project/implementation-plan.md",
  "docs/project/requirements-trace.md",
  "docs/project/verification-evidence.md",
  "docs/project/rebuild-progress.md",
  "docs/project/v2-decision-gates.md"
] as const;

const statusAgreementFiles = [
  "docs/project/completion-audit.md",
  "docs/project/implementation-plan.md",
  "docs/project/v2-decision-gates.md"
] as const;

const goClaimPatterns = [
  /^\s*GO\.\s*$/i,
  /\bfinal status is GO\b/i,
  /^\s*(?:[-*]\s*)?(?:current status|final status|status|gate result|release status)\s*:\s*(?:\*\*)?GO(?:\*\*)?\.?\s*$/i,
  /\|\s*(?:current status|final status|status|gate result|release status)\s*\|\s*(?:\*\*)?GO(?:\*\*)?\s*\|/i
] as const;

const incompletePatterns = [
  /\bNO-GO\b/i,
  /\bremains incomplete\b/i,
  /\bnot completion\b/i,
  /\bnot complete\b/i,
  /\bnot prove\b/i,
  /\bdoes not prove\b/i,
  /\bstill required\b/i,
  /\bstill lacks\b/i,
  /\bstale incomplete\b/i
] as const;

const staleTraceTotalPatterns = [
  /\b1,627\b/,
  /\b1627\b/,
  /1,627\s+of\s+1,627/i,
  /1627\s+of\s+1627/i
] as const;

function hasGoClaim(text: string): boolean {
  return text.split(/\r?\n/).some((line) => goClaimPatterns.some((pattern) => pattern.test(line)));
}

export function scanDocContradictions(
  root = process.cwd(),
  files: readonly string[] = defaultFiles,
  releaseRunId = process.env.G3D_RELEASE_RUN_ID ?? "standalone-doc-contradiction-scan-run"
): DocContradictionReport {
  const checkedFiles = files.filter((file) => existsSync(join(root, file)));
  const violations: DocContradictionViolation[] = [];

  for (const file of checkedFiles) {
    const text = readFileSync(join(root, file), "utf8");
    const lines = text.split(/\r?\n/);
    const goClaim = hasGoClaim(text);

    if (goClaim) {
      lines.forEach((line, index) => {
        if (!incompletePatterns.some((pattern) => pattern.test(line))) return;
        violations.push({
          file,
          line: index + 1,
          kind: "go-with-incomplete-language",
          text: line.trim(),
          reason: "Document contains an affirmative GO status and required-feature incomplete/NO-GO language."
        });
      });
    }

    lines.forEach((line, index) => {
      if (!staleTraceTotalPatterns.some((pattern) => pattern.test(line))) return;
      violations.push({
        file,
        line: index + 1,
        kind: "stale-trace-total",
        text: line.trim(),
        reason: "Document contains stale 1,627 trace totals instead of the current trace-report total."
      });
    });
  }

  const statusPolarities = statusAgreementFiles
    .filter((file) => checkedFiles.includes(file))
    .map((file) => ({ file, ...detectStatusPolarity(readFileSync(join(root, file), "utf8")) }));
  const concretePolarities = statusPolarities.filter((entry) => entry.polarity !== "unknown");
  const hasPositive = concretePolarities.some((entry) => entry.polarity === "positive");
  const hasNegative = concretePolarities.some((entry) => entry.polarity === "negative");
  if (hasPositive && hasNegative) {
    for (const entry of concretePolarities) {
      violations.push({
        file: entry.file,
        line: entry.line,
        kind: "status-disagreement",
        text: entry.text,
        reason: "Completion audit, final implementation plan, and v2 decision gates disagree on GO/NO-GO status."
      });
    }
  }

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    releaseRunId,
    checkedFiles,
    violations
  };
}

function detectStatusPolarity(text: string): { polarity: "positive" | "negative" | "unknown"; line: number; text: string } {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/\bNO-GO\b|\bnot met\b|\bnot complete\b|\bnot production-ready\b/i.test(line)) {
      return { polarity: "negative", line: index + 1, text: line.trim() };
    }
    if (goClaimPatterns.some((pattern) => pattern.test(line))) {
      return { polarity: "positive", line: index + 1, text: line.trim() };
    }
  }
  return { polarity: "unknown", line: 1, text: "" };
}

export function writeDocContradictionReport(root: string, report: DocContradictionReport): void {
  const path = join(root, "tests", "reports", "doc-contradictions.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = scanDocContradictions();
  writeDocContradictionReport(process.cwd(), report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
