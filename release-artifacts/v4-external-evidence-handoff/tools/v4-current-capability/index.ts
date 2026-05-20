import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseReport, blockedV4Claims, listFiles, readJson, writeJson } from "../v4-reporting/index.js";

export interface V4GateStatus {
  readonly gate: string;
  readonly passed: boolean;
  readonly blockers: readonly string[];
}

const reportPath = "tests/reports/v4-current-capability.json";

export function createV4CurrentCapabilityReport(root = process.cwd()) {
  const docs = listFiles(root, ["docs/v4"], [".md"]);
  const docsText = docs.map((path) => readFileSync(`${root}/${path}`, "utf8")).join("\n");
  const uncheckedTaskCount = (docsText.match(/- \[ \]/g) ?? []).length;
  const checkedTaskCount = (docsText.match(/- \[x\]/gi) ?? []).length;
  const claimGates = readJson(root, "tests/reports/v4-claim-gates.json");
  const rendering = readJson(root, "tests/reports/v4-rendering.json");
  const assets = readJson(root, "tests/reports/v4-asset-corpus.json");
  const editor = readJson(root, "tests/reports/v4-editor-authoring.json");
  const runtime = readJson(root, "tests/reports/v4-runtime.json");
  const examples = readJson(root, "tests/reports/v4-example-screenshots/manifest.json");
  const visualQuality = readJson(root, "tests/reports/v4-visual-quality.json");
  const comparison = readJson(root, "tests/reports/v4-engine-comparison.json");
  const examplesPass = examples?.ok === true || examples?.pass === true;

  const gates: V4GateStatus[] = [
    {
      gate: "Gate 1: Visual Credibility",
      passed: examplesPass && visualQuality?.ok === true,
      blockers: [
        ...(examplesPass ? [] : ["v4 example screenshot manifest is missing or failing"]),
        ...(visualQuality?.ok === true ? [] : ["v4 visual quality report is missing or failing"]),
      ],
    },
    {
      gate: "Gate 2: Renderer Feature Evidence",
      passed: rendering?.ok === true,
      blockers: rendering?.ok === true ? [] : ["v4 rendering report is missing or failing"],
    },
    {
      gate: "Gate 3: Asset Fidelity",
      passed: assets?.ok === true,
      blockers: assets?.ok === true ? [] : ["v4 asset corpus report is missing or failing"],
    },
    {
      gate: "Gate 4: Editor-Authored App",
      passed: editor?.ok === true,
      blockers: editor?.ok === true ? [] : ["v4 editor authoring report is missing or failing"],
    },
    {
      gate: "Gate 5: Same-Scene Comparisons",
      passed: comparison?.ok === true,
      blockers: comparison?.ok === true ? [] : ["v4 engine comparison report is missing or failing"],
    },
    {
      gate: "Gate 6: V4 Code Complete",
      passed: uncheckedTaskCount === 0,
      blockers: [
        ...(uncheckedTaskCount === 0 ? [] : [`${uncheckedTaskCount} unchecked v4 markdown tasks remain`]),
      ],
    },
  ];
  const blockedGateViolations = gates.flatMap((gate) =>
    gate.passed ? [] : gate.blockers.map((blocker) => `${gate.gate}: ${blocker}`),
  );
  const violations = [
    ...(claimGates?.ok === true ? [] : ["v4 claim gate report is missing or failing"]),
    ...blockedGateViolations,
  ];
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:v4-code",
      runIdPrefix: "v4-current-capability",
      sourceFiles: [
        ...docs,
        "tests/reports/v4-claim-gates.json",
        "tests/reports/v4-engine-comparison.json",
        "tests/reports/v4-rendering.json",
        "tests/reports/v4-asset-corpus.json",
        "tests/reports/v4-editor-authoring.json",
        "tests/reports/v4-runtime.json",
        "tests/reports/v4-visual-quality.json",
      ],
      blockedClaims: blockedV4Claims,
      violations,
    }),
    uncheckedTaskCount,
    checkedTaskCount,
    gates,
    blockedGateViolations,
    decisionGateSource: existsSync(`${root}/docs/project/v4-decision-gates.md`) ? "docs/project/v4-decision-gates.md" : null,
    allowedClaims: [
      "Only the exact narrowed claims in docs/project/v4-decision-gates.md may be used when their matching report gates pass.",
    ],
  };
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4CurrentCapabilityReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    uncheckedTaskCount: report.uncheckedTaskCount,
    blockedGates: report.gates.filter((gate) => !gate.passed).length,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
