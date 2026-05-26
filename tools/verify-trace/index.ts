import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const allowedStatuses = [
  "Not started",
  "Partially implemented",
  "Implemented but unverified",
  "Implemented and verified",
  "Blocked"
] as const;

export type Status = (typeof allowedStatuses)[number];

export interface TraceRow {
  readonly id: string;
  readonly sourceDocument: string;
  readonly sourceSection: string;
  readonly requirement: string;
  readonly owner?: string;
  readonly implementationFiles?: readonly string[];
  readonly testFiles?: readonly string[];
  readonly status: string;
  readonly evidence: string;
  readonly remainingWork?: string;
}

export interface TraceReport {
  readonly generatedAt?: string;
  readonly docs?: readonly string[];
  readonly totalRequirements: number;
  readonly complete: boolean;
  readonly statusCounts: Record<string, number>;
  readonly rows: readonly TraceRow[];
}

export interface TraceRowSummary {
  readonly id: string;
  readonly status: string;
  readonly owner: string;
  readonly prefix: string;
  readonly sourceDocument: string;
  readonly sourceSection: string;
  readonly remainingWork: string;
}

export interface TraceBucketSummary {
  readonly total: number;
  readonly statusCounts: Record<string, number>;
  readonly sampleRows: readonly TraceRowSummary[];
}

export interface TraceAnalysis {
  readonly totalRequirements: number;
  readonly complete: boolean;
  readonly statusCounts: Record<string, number>;
  readonly incompleteRows: readonly TraceRowSummary[];
  readonly missingEvidenceRows: readonly TraceRowSummary[];
  readonly weakEvidenceRows: readonly TraceRowSummary[];
  readonly invalidStatusRows: readonly TraceRowSummary[];
  readonly incompleteByOwner: Record<string, TraceBucketSummary>;
  readonly incompleteByPrefix: Record<string, TraceBucketSummary>;
}

export interface VerifiedTraceReport extends TraceReport {
  readonly verifiedAt: string;
  readonly complete: boolean;
  readonly totalRequirements: number;
  readonly statusCounts: Record<string, number>;
  readonly incomplete: {
    readonly total: number;
    readonly byOwner: Record<string, TraceBucketSummary>;
    readonly byPrefix: Record<string, TraceBucketSummary>;
    readonly sampleRows: readonly TraceRowSummary[];
  };
  readonly implementedRowsMissingEvidence: {
    readonly total: number;
    readonly rows: readonly TraceRowSummary[];
  };
  readonly invalidStatuses: {
    readonly total: number;
    readonly allowed: readonly Status[];
    readonly rows: readonly TraceRowSummary[];
  };
  readonly weakEvidence: {
    readonly total: number;
    readonly rows: readonly TraceRowSummary[];
  };
}

const root = process.cwd();
const reportPath = join(root, "tests", "reports", "final-requirements-trace.json");
const evidencePath = join(root, "docs", "project", "verification-evidence.md");
const completeStatus = "Implemented and verified";
const sampleLimit = 25;
const generatedAuditArtifactPattern = /^docs\/project\/(?:completion-audit|implementation-plan|requirements-trace|verification-evidence)\.md$|^tests\/reports\/final-(?:requirements-trace|release-verification)\.json$/;

function emptyStatusCounts(): Record<string, number> {
  return Object.fromEntries(allowedStatuses.map((status) => [status, 0]));
}

function isAllowedStatus(status: string): status is Status {
  return (allowedStatuses as readonly string[]).includes(status);
}

function prefixFor(id: string): string {
  const [prefix] = id.split("-");
  return prefix && prefix.length > 0 ? prefix : "UNKNOWN";
}

function summarizeRow(row: TraceRow): TraceRowSummary {
  return {
    id: row.id,
    status: row.status,
    owner: row.owner?.trim() || "Unassigned",
    prefix: prefixFor(row.id),
    sourceDocument: row.sourceDocument,
    sourceSection: row.sourceSection,
    remainingWork: row.remainingWork?.trim() || ""
  };
}

function hasConcreteSourceEvidence(row: TraceRow): boolean {
  return (row.implementationFiles ?? []).some((file) => /^(packages|examples|tools)\/.+\.(?:ts|tsx|js|mjs|cjs|glsl|wgsl|html|css)$/.test(file));
}

function hasConcreteTestEvidence(row: TraceRow): boolean {
  return (row.testFiles ?? []).some((file) => /^tests\/(?:unit|integration|browser|visual|performance|assets)\/.+/.test(file));
}

function hasOnlyGeneratedAuditEvidence(row: TraceRow): boolean {
  const files = [...(row.implementationFiles ?? []), ...(row.testFiles ?? [])];
  return files.length > 0 && files.every((file) => generatedAuditArtifactPattern.test(file));
}

function hasWeakEvidence(row: TraceRow): boolean {
  if (row.status !== completeStatus) return false;
  const evidence = row.evidence.toLowerCase();
  const citesGeneratedAuditOnly = hasOnlyGeneratedAuditEvidence(row) || /generated audit artifact|final release report passed|requirements trace report passed/.test(evidence);
  const citesRebuildProgressPass = /docs\/implementation-plan\.md\s+passed|implementation-plan\.md\s+passed/.test(evidence);
  return (citesGeneratedAuditOnly || citesRebuildProgressPass) && (!hasConcreteSourceEvidence(row) || !hasConcreteTestEvidence(row));
}

function addToBucket(buckets: Record<string, TraceBucketSummary>, key: string, row: TraceRowSummary): void {
  const current = buckets[key] ?? { total: 0, statusCounts: emptyStatusCounts(), sampleRows: [] };
  const statusCounts = { ...current.statusCounts, [row.status]: (current.statusCounts[row.status] ?? 0) + 1 };
  const sampleRows = current.sampleRows.length >= sampleLimit ? current.sampleRows : [...current.sampleRows, row];
  buckets[key] = {
    total: current.total + 1,
    statusCounts,
    sampleRows
  };
}

function sortBuckets(buckets: Record<string, TraceBucketSummary>): Record<string, TraceBucketSummary> {
  return Object.fromEntries(
    Object.entries(buckets).sort(([leftKey, left], [rightKey, right]) => right.total - left.total || leftKey.localeCompare(rightKey))
  );
}

export function analyzeTraceReport(report: TraceReport): TraceAnalysis {
  const statusCounts = emptyStatusCounts();
  const incompleteRows: TraceRowSummary[] = [];
  const missingEvidenceRows: TraceRowSummary[] = [];
  const weakEvidenceRows: TraceRowSummary[] = [];
  const invalidStatusRows: TraceRowSummary[] = [];
  const incompleteByOwner: Record<string, TraceBucketSummary> = {};
  const incompleteByPrefix: Record<string, TraceBucketSummary> = {};

  for (const row of report.rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    const summary = summarizeRow(row);

    if (!isAllowedStatus(row.status)) {
      invalidStatusRows.push(summary);
    }

    if (row.status !== completeStatus) {
      incompleteRows.push(summary);
      addToBucket(incompleteByOwner, summary.owner, summary);
      addToBucket(incompleteByPrefix, summary.prefix, summary);
    } else if (row.evidence.trim() === "") {
      missingEvidenceRows.push(summary);
    }

    if (hasWeakEvidence(row)) {
      weakEvidenceRows.push(summary);
    }
  }

  return {
    totalRequirements: report.rows.length,
    complete:
      report.rows.length > 0 &&
      incompleteRows.length === 0 &&
      missingEvidenceRows.length === 0 &&
      weakEvidenceRows.length === 0 &&
      invalidStatusRows.length === 0,
    statusCounts,
    incompleteRows,
    missingEvidenceRows,
    weakEvidenceRows,
    invalidStatusRows,
    incompleteByOwner: sortBuckets(incompleteByOwner),
    incompleteByPrefix: sortBuckets(incompleteByPrefix)
  };
}

export function withTraceAnalysis(report: TraceReport, analysis = analyzeTraceReport(report)): VerifiedTraceReport {
  return {
    ...report,
    verifiedAt: new Date().toISOString(),
    totalRequirements: analysis.totalRequirements,
    statusCounts: analysis.statusCounts,
    complete: analysis.complete,
    incomplete: {
      total: analysis.incompleteRows.length,
      byOwner: analysis.incompleteByOwner,
      byPrefix: analysis.incompleteByPrefix,
      sampleRows: analysis.incompleteRows.slice(0, 200)
    },
    implementedRowsMissingEvidence: {
      total: analysis.missingEvidenceRows.length,
      rows: analysis.missingEvidenceRows.slice(0, 200)
    },
    invalidStatuses: {
      total: analysis.invalidStatusRows.length,
      allowed: allowedStatuses,
      rows: analysis.invalidStatusRows.slice(0, 200)
    },
    weakEvidence: {
      total: analysis.weakEvidenceRows.length,
      rows: analysis.weakEvidenceRows.slice(0, 200)
    }
  };
}

function bucketMarkdown(buckets: Record<string, TraceBucketSummary>): string {
  const rows = Object.entries(buckets).map(([name, bucket]) => {
    return `- ${name}: ${bucket.total} incomplete (${allowedStatuses
      .map((status) => `${status}: ${bucket.statusCounts[status] ?? 0}`)
      .join(", ")})`;
  });
  return rows.slice(0, 50).join("\n") || "- None";
}

export function verificationEvidenceMarkdown(report: VerifiedTraceReport): string {
  return `# Aura3D Verification Evidence

## Requirements Trace Gate
- Total requirements: ${report.totalRequirements}
- Implemented and verified: ${report.statusCounts["Implemented and verified"] ?? 0}
- Implemented but unverified: ${report.statusCounts["Implemented but unverified"] ?? 0}
- Partially implemented: ${report.statusCounts["Partially implemented"] ?? 0}
- Not started: ${report.statusCounts["Not started"] ?? 0}
- Blocked: ${report.statusCounts.Blocked ?? 0}
- Invalid statuses: ${report.invalidStatuses.total}
- Weak evidence rows: ${report.weakEvidence.total}
- Complete: ${report.complete ? "yes" : "no"}

## Gate Result
${report.complete ? "PASS" : "FAIL"}

## Incomplete Rows By Owner
${bucketMarkdown(report.incomplete.byOwner)}

## Incomplete Rows By Prefix
${bucketMarkdown(report.incomplete.byPrefix)}

## Incomplete Row Samples
${report.incomplete.sampleRows
  .slice(0, 200)
  .map((row) => `- ${row.id}: ${row.status} - ${row.owner} - ${row.sourceDocument} / ${row.sourceSection}`)
  .join("\n") || "- None"}

## Implemented Rows Missing Evidence
${report.implementedRowsMissingEvidence.rows
  .map((row) => `- ${row.id}: ${row.owner} - ${row.sourceDocument} / ${row.sourceSection}`)
  .join("\n") || "- None"}

## Invalid Status Rows
${report.invalidStatuses.rows
  .map((row) => `- ${row.id}: ${row.status} - ${row.owner} - ${row.sourceDocument} / ${row.sourceSection}`)
  .join("\n") || "- None"}

## Weak Evidence Rows
${report.weakEvidence.rows
  .map((row) => `- ${row.id}: ${row.status} - ${row.owner} - ${row.sourceDocument} / ${row.sourceSection}`)
  .join("\n") || "- None"}
`;
}

export function verifyTrace(rootDir = root): VerifiedTraceReport {
  const traceReportPath = join(rootDir, "tests", "reports", "final-requirements-trace.json");
  const traceEvidencePath = join(rootDir, "docs", "project", "verification-evidence.md");

  if (!existsSync(traceReportPath)) {
    throw new Error(`Missing trace report: ${traceReportPath}`);
  }

  const rawReport = JSON.parse(readFileSync(traceReportPath, "utf8")) as TraceReport;
  const verifiedReport = withTraceAnalysis(rawReport);
  mkdirSync(dirname(traceReportPath), { recursive: true });
  mkdirSync(dirname(traceEvidencePath), { recursive: true });
  writeFileSync(traceReportPath, `${JSON.stringify(verifiedReport, null, 2)}\n`);
  writeFileSync(traceEvidencePath, verificationEvidenceMarkdown(verifiedReport));
  return verifiedReport;
}

function rootFromArgs(argv: readonly string[]): string {
  const rootIndex = argv.indexOf("--root");
  return rootIndex === -1 ? root : (argv[rootIndex + 1] ?? root);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const verifiedReport = verifyTrace(rootFromArgs(process.argv.slice(2)));
    if (!verifiedReport.complete) {
      console.error(
        `Requirements trace is incomplete: ${verifiedReport.incomplete.total} incomplete rows, ` +
          `${verifiedReport.implementedRowsMissingEvidence.total} implemented rows missing evidence, ` +
          `${verifiedReport.weakEvidence.total} weak evidence rows, ` +
          `${verifiedReport.invalidStatuses.total} invalid status rows.`
      );
      process.exitCode = 1;
    } else {
      console.log("Requirements trace is complete.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
