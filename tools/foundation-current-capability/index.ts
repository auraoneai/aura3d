import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseReport, listFiles, readJson, writeJson } from "../foundation-reporting/index.js";

export interface FoundationGateStatus {
  readonly gate: string;
  readonly passed: boolean;
  readonly blockers: readonly string[];
}

export interface FoundationCurrentCapabilityReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly commit: string;
  readonly runId: string;
  readonly command: string;
  readonly sourceFileHashes: readonly { readonly path: string; readonly sha256: string }[];
  readonly blockedClaims: readonly string[];
  readonly screenshotPaths: readonly string[];
  readonly violations: readonly string[];
  readonly uncheckedTaskCount: number;
  readonly checkedTaskCount: number;
  readonly taskAssignmentReport: string | null;
  readonly gates: readonly FoundationGateStatus[];
}

const reportPath = "tests/reports/foundation-current-capability.json";

function hasSupportedNicheAdvantage(report: unknown): boolean {
  if (!report || typeof report !== "object") return false;
  const maybeReport = report as { readonly definedNicheAdvantage?: unknown; readonly supportedNicheClaims?: unknown };
  if (Boolean(maybeReport.definedNicheAdvantage)) return true;
  return Array.isArray(maybeReport.supportedNicheClaims) && maybeReport.supportedNicheClaims.length > 0;
}

export function createFoundationCurrentCapabilityReport(root = process.cwd()): FoundationCurrentCapabilityReport {
  const retainedDocs = new Set([
    "docs/project/current-state.md",
    "docs/project/implementation-plan.md",
    "docs/project/verification-evidence.md",
    "docs/project/compatibility.md",
    "docs/project/known-limits.md",
    "docs/project/claim-guidelines.md"
  ]);
  const docs = listFiles(root, ["docs/project"], [".md"]).filter((path) => retainedDocs.has(path));
  const docsText = docs.map((path) => readFileSync(`${root}/${path}`, "utf8")).join("\n");
  const uncheckedTaskCount = (docsText.match(/^- \[ \]/gm) ?? []).length;
  const checkedTaskCount = (docsText.match(/^- \[x\]/gim) ?? []).length;
  const taskAssignmentReport = existsSync(`${root}/tests/reports/foundation-task-assignments.json`)
    ? "tests/reports/foundation-task-assignments.json"
    : null;
  const claimGates = readJson(root, "tests/reports/foundation-claim-gates.json");
  const rendering = readJson(root, "tests/reports/foundation-rendering.json");
  const assets = readJson(root, "tests/reports/foundation-asset-corpus.json");
  const editor = readJson(root, "tests/reports/foundation-editor-authoring.json");
  const runtime = readJson(root, "tests/reports/foundation-runtime-systems.json");
  const comparison = readJson(root, "tests/reports/foundation-engine-comparison.json");
  const aggregateVerify = readJson(root, "tests/reports/foundation-verify.json");

  const gates: FoundationGateStatus[] = [
    {
      gate: "Gate 0: Honest Current State",
      passed: claimGates?.ok === true,
      blockers: [
        ...(claimGates?.ok === true ? [] : ["foundation claim-gate report is missing or failing"]),
      ],
    },
    {
      gate: "Gate 1: Credible Renderer Evidence",
      passed: rendering?.ok === true,
      blockers: [
        ...(rendering?.ok === true ? [] : ["foundation rendering report is missing, failing, or reports incomplete renderer evidence"]),
      ],
    },
    {
      gate: "Gate 2: Asset Pipeline Credibility",
      passed: assets?.ok === true,
      blockers: assets?.ok === true ? [] : ["foundation asset corpus report is missing, failing, or reports incomplete asset evidence"],
    },
    {
      gate: "Gate 3: Browser Editor Authoring",
      passed: editor?.ok === true,
      blockers: editor?.ok === true ? [] : ["foundation editor authoring report is missing, failing, or reports incomplete editor workflow evidence"],
    },
    {
      gate: "Gate 4: Same-Scene Engine Comparisons",
      passed: comparison?.ok === true,
      blockers: comparison?.ok === true ? [] : ["foundation engine comparison report is missing, failing, or reports incomplete same-scene comparison evidence"],
    },
    {
      gate: "Gate 5: Defined Three.js Advantage",
      passed: comparison?.ok === true && hasSupportedNicheAdvantage(comparison),
      blockers: comparison?.ok === true && hasSupportedNicheAdvantage(comparison)
        ? []
        : ["no foundation comparison report currently proves an exact niche advantage with explicit caveats"],
    },
    {
      gate: "Gate 6: Browser-First Unity/Unreal-Style Workflow",
      passed: editor?.ok === true && Boolean(editor?.exportedAppVerified),
      blockers: editor?.ok === true && Boolean(editor?.exportedAppVerified)
        ? []
        : ["editor-authored exported app workflow is not fully proven by foundation report evidence"],
    },
    {
      gate: "Gate 7: foundation Code Complete",
      passed: uncheckedTaskCount === 0 && aggregateVerify?.ok === true,
      blockers: [
        ...(uncheckedTaskCount === 0 ? [] : [`${uncheckedTaskCount} unchecked foundation markdown tasks remain`]),
        ...(aggregateVerify?.ok === true ? [] : ["aggregate verify:foundation has not been proven by tests/reports/foundation-verify.json"]),
      ],
    },
  ];
  const violations: string[] = [];
  const base = baseReport(root, {
    ok: true,
    command: "pnpm verify:foundation-code",
    runIdPrefix: "foundation-current-capability",
    sourceFiles: [...docs, "tests/reports/foundation-task-assignments.json", "tests/reports/foundation-claim-gates.json", "tests/reports/foundation-verify.json"],
    violations,
  });
  return {
    ...base,
    uncheckedTaskCount,
    checkedTaskCount,
    taskAssignmentReport,
    gates,
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createFoundationCurrentCapabilityReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    uncheckedTaskCount: report.uncheckedTaskCount,
    blockedGates: report.gates.filter((gate) => !gate.passed).length,
  }, null, 2));
}
