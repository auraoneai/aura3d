import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseReport, blockedExternalParityClaims, listFiles, readJson, writeJson } from "../external-parity-reporting/index.js";

export interface ExternalParityGateStatus {
  readonly gate: string;
  readonly passed: boolean;
  readonly blockers: readonly string[];
}

const reportPath = "tests/reports/external-parity-current-capability.json";

export function createExternalParityCurrentCapabilityReport(root = process.cwd()) {
  const retainedDocs = new Set([
    "docs/project/current-state.md",
    "docs/project/threejs-parity-status.md",
    "docs/project/threejs-parity-claim-boundary.md",
    "docs/project/threejs-parity-parity-matrix.md",
    "docs/project/verification-evidence.md",
    "docs/project/claim-guidelines.md",
    "docs/project/known-limits.md"
  ]);
  const docs = listFiles(root, ["docs/project"], [".md"]).filter((path) => retainedDocs.has(path));
  const docsText = docs.map((path) => readFileSync(`${root}/${path}`, "utf8")).join("\n");
  const uncheckedTaskCount = (docsText.match(/- \[ \]/g) ?? []).length;
  const checkedTaskCount = (docsText.match(/- \[x\]/gi) ?? []).length;
  const claimGates = readJson(root, "tests/reports/external-parity-claim-gates.json");
  const rendering = readJson(root, "tests/reports/external-parity-rendering.json");
  const assets = readJson(root, "tests/reports/external-parity-asset-corpus.json");
  const editor = readJson(root, "tests/reports/external-parity-editor-authoring.json");
  const runtime = readJson(root, "tests/reports/external-parity-runtime.json");
  const examples = readJson(root, "tests/reports/external-parity-example-screenshots/manifest.json");
  const visualQuality = readJson(root, "tests/reports/external-parity-visual-quality.json");
  const comparison = readJson(root, "tests/reports/external-parity-engine-comparison.json");
  const examplesPass = examples?.ok === true || examples?.pass === true;

  const gates: ExternalParityGateStatus[] = [
    {
      gate: "Gate 1: Visual Credibility",
      passed: examplesPass && visualQuality?.ok === true,
      blockers: [
        ...(examplesPass ? [] : ["external-parity example screenshot manifest is missing or failing"]),
        ...(visualQuality?.ok === true ? [] : ["external-parity visual quality report is missing or failing"]),
      ],
    },
    {
      gate: "Gate 2: Renderer Feature Evidence",
      passed: rendering?.ok === true,
      blockers: rendering?.ok === true ? [] : ["external-parity rendering report is missing or failing"],
    },
    {
      gate: "Gate 3: Asset Fidelity",
      passed: assets?.ok === true,
      blockers: assets?.ok === true ? [] : ["external-parity asset corpus report is missing or failing"],
    },
    {
      gate: "Gate 4: Editor-Authored App",
      passed: editor?.ok === true,
      blockers: editor?.ok === true ? [] : ["external-parity editor authoring report is missing or failing"],
    },
    {
      gate: "Gate 5: Same-Scene Comparisons",
      passed: comparison?.ok === true,
      blockers: comparison?.ok === true ? [] : ["external-parity engine comparison report is missing or failing"],
    },
    {
      gate: "Gate 6: External parity Code Complete",
      passed: uncheckedTaskCount === 0,
      blockers: [
        ...(uncheckedTaskCount === 0 ? [] : [`${uncheckedTaskCount} unchecked external-parity markdown tasks remain`]),
      ],
    },
  ];
  const blockedGateViolations = gates.flatMap((gate) =>
    gate.passed ? [] : gate.blockers.map((blocker) => `${gate.gate}: ${blocker}`),
  );
  const violations = [
    ...(claimGates?.ok === true ? [] : ["external-parity claim gate report is missing or failing"]),
    ...blockedGateViolations,
  ];
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:external-parity-code",
      runIdPrefix: "external-parity-current-capability",
      sourceFiles: [
        ...docs,
        "tests/reports/external-parity-claim-gates.json",
        "tests/reports/external-parity-engine-comparison.json",
        "tests/reports/external-parity-rendering.json",
        "tests/reports/external-parity-asset-corpus.json",
        "tests/reports/external-parity-editor-authoring.json",
        "tests/reports/external-parity-runtime.json",
        "tests/reports/external-parity-visual-quality.json",
      ],
      blockedClaims: blockedExternalParityClaims,
      violations,
    }),
    uncheckedTaskCount,
    checkedTaskCount,
    gates,
    blockedGateViolations,
    decisionGateSource: existsSync(`${root}/docs/project/product-studio-decision-gates.md`) ? "docs/project/product-studio-decision-gates.md" : null,
    allowedClaims: [
      "Only the exact narrowed claims in docs/project/product-studio-decision-gates.md may be used when their matching report gates pass.",
    ],
  };
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createExternalParityCurrentCapabilityReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    uncheckedTaskCount: report.uncheckedTaskCount,
    blockedGates: report.gates.filter((gate) => !gate.passed).length,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
