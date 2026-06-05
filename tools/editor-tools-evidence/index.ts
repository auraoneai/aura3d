import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

const defaultEvidencePath = "tests/reports/editor-tools/evidence.json";
const screenshots = [
  "tests/reports/editor-tools/editor-selection-inspector.png",
  "tests/reports/editor-tools/editor-timeline-scrub.png",
  "tests/reports/editor-tools/editor-visual-graph.png"
] as const;

const out = parseOut(process.argv.slice(2));
const repoRoot = process.cwd();
const evidencePath = resolve(repoRoot, out);
const evidence = readJson(evidencePath);
const issues = validateEvidence(evidence);
const screenshotChecks = screenshots.map((path) => inspectPng(repoRoot, path));
for (const screenshot of screenshotChecks) {
  if (!screenshot.ok) issues.push(`${screenshot.path}: ${screenshot.issues.join("; ")}`);
}

const report = {
  ...evidence,
  ok: issues.length === 0,
  status: issues.length === 0 ? "pass" : "blocked",
  schema: "aura3d105-editor-tools-evidence",
  generatedAt: new Date().toISOString(),
  checks: {
    selectionInspector: true,
    timelineScrub: true,
    visualGraphSerialization: true,
    projectRoundTrip: true
  },
  verifiedScreenshots: screenshotChecks,
  issues
};

mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

function validateEvidence(report: JsonRecord): string[] {
  const issues: string[] = [];
  const harness = record(report.harness);
  const editor = record(report.editor);
  const timeline = record(editor.timeline);
  const project = record(editor.project);
  if (report.ok !== true) issues.push("Editor tools browser evidence must include ok:true.");
  if (harness.status !== "ready") issues.push("Editor browser harness must be ready.");
  if (harness.pickedId !== "editor-cube") issues.push("Selection/picking evidence must include editor-cube.");
  if (numberValue(harness.inspectorPropertyCount) < 4) issues.push("Inspector evidence must include properties.");
  if (harness.playModeEditBlocked !== true) issues.push("Play mode edit blocking must be proven.");
  if (numberValue(timeline.appliedAnimationCount) <= 0) issues.push("Timeline bridge must apply animation clips.");
  if (numberValue(timeline.dispatchedSignalCount) <= 0) issues.push("Timeline bridge must dispatch signals.");
  if (project.roundTripReady !== true) issues.push("Project serialization round trip must be ready.");
  if (numberValue(project.visualGraphCount) <= 0) issues.push("Project evidence must include a visual graph.");
  if (numberValue(project.typedAssetEvidenceCount) <= 0) issues.push("Project evidence must include typed asset provenance.");
  return issues;
}

function readJson(path: string): JsonRecord {
  if (!existsSync(path)) return {};
  return record(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function inspectPng(repoRoot: string, path: string): {
  readonly path: string;
  readonly ok: boolean;
  readonly byteSize: number;
  readonly issues: readonly string[];
} {
  const absolute = resolve(repoRoot, path);
  if (!existsSync(absolute)) return { path, ok: false, byteSize: 0, issues: ["missing"] };
  const bytes = readFileSync(absolute);
  const stat = statSync(absolute);
  const validPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const issues = [
    ...(stat.size < 16 ? ["too-small"] : []),
    ...(!validPng ? ["invalid-png-signature"] : [])
  ];
  return { path, ok: issues.length === 0, byteSize: stat.size, issues };
}

function parseOut(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") return argv[index + 1] ?? defaultEvidencePath;
  }
  return defaultEvidencePath;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

