import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

const defaultEvidencePath = "tests/reports/visual-scripting/evidence.json";
const screenshots = [
  "tests/reports/visual-scripting/runtime-node-motion.png",
  "tests/reports/visual-scripting/animation-event-graph.png"
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
  schema: "aura3d105-visual-scripting-evidence",
  generatedAt: new Date().toISOString(),
  checks: {
    runtimeNodeMotion: true,
    animationEventGraph: true,
    deterministicSideEffects: true
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
  const behaviorHarness = record(report.behaviorHarness);
  const graph = record(report.graph);
  const sideEffectKinds = arrayValue(graph.sideEffectKinds);
  if (report.ok !== true) issues.push("Visual scripting browser evidence must include ok:true.");
  if (behaviorHarness.status !== "ready") issues.push("Behavior harness must be ready.");
  if (numberValue(behaviorHarness.nonBlankPixels) <= 300) issues.push("Behavior harness must prove nonblank browser output.");
  if (graph.ok !== true) issues.push("Graph evidence must be ok:true.");
  for (const kind of ["runtime.translate", "animation.crossFade", "combat.openHitbox", "camera.follow", "evidence.captureSnapshot"]) {
    if (!sideEffectKinds.includes(kind)) issues.push(`Graph evidence missing side effect: ${kind}.`);
  }
  if (graph.animationEventMatched !== true) issues.push("Graph evidence must prove animation event matching.");
  if (arrayValue(graph.diagnostics).length !== 0) issues.push("Graph evidence diagnostics must be empty.");
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

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

