import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

type Track = "code" | "examples" | "rendering" | "assets" | "editor" | "runtime" | "benchmarks" | "all";

interface V3Task {
  readonly document: string;
  readonly line: number;
  readonly text: string;
  readonly checked: boolean;
  readonly owner: Track;
}

interface V3ReportFreshness {
  readonly path: string;
  readonly exists: boolean;
  readonly modifiedAt?: string;
  readonly generatedAt?: string;
  readonly commit?: string;
  readonly runId?: string;
  readonly freshForCurrentCommit: boolean;
  readonly messages: readonly string[];
}

interface V3VerificationReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly runId: string;
  readonly command: string;
  readonly commit: string;
  readonly track: Track;
  readonly strict: boolean;
  readonly docs: readonly string[];
  readonly sourceHashes: Record<string, string>;
  readonly totalTasks: number;
  readonly checkedTasks: number;
  readonly uncheckedTasks: number;
  readonly scopedUncheckedTasks: readonly V3Task[];
  readonly requiredReports: readonly V3ReportFreshness[];
  readonly blockedClaims: readonly string[];
  readonly failures: readonly string[];
}

const root = process.cwd();
const broadClaimPatterns = [
  /\bbetter\s+than\s+three\.?js\b/i,
  /\b(?:unity\s*\/\s*unreal|unreal\s*\/\s*unity)\s+for\s+the\s+web\b/i,
  /\bproduction[-\s]+ready\b/i,
  /\bproduction\s+pbr\s+parity\b|\bpbr\s+parity\b/i,
  /\bfull\s+webgpu\s+support\b/i,
  /\bcomplete\s+gltf\s+support\b/i,
];

const requiredReportsByTrack: Record<Track, readonly string[]> = {
  code: ["tests/reports/foundation-current-capability.json", "tests/reports/foundation-task-assignments.json"],
  examples: ["tests/reports/foundation-example-truth-audit.json", "tests/reports/foundation-example-screenshots/manifest.json"],
  rendering: ["tests/reports/foundation-rendering.json"],
  assets: ["tests/reports/foundation-asset-corpus.json"],
  editor: ["tests/reports/foundation-editor-authoring.json"],
  runtime: ["tests/reports/foundation-runtime-systems.json"],
  benchmarks: ["tests/reports/foundation-engine-comparison.json"],
  all: [
    "tests/reports/foundation-current-capability.json",
    "tests/reports/foundation-task-assignments.json",
    "tests/reports/foundation-example-truth-audit.json",
    "tests/reports/foundation-example-screenshots/manifest.json",
    "tests/reports/foundation-rendering.json",
    "tests/reports/foundation-asset-corpus.json",
    "tests/reports/foundation-editor-authoring.json",
    "tests/reports/foundation-runtime-systems.json",
    "tests/reports/foundation-engine-comparison.json",
    "tests/reports/foundation-claim-gates.json",
  ],
};

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const tasks = readV3Tasks();
  const scopedTasks = tasks.filter((task) => args.track === "all" || task.owner === args.track || args.track === "code");
  const unchecked = scopedTasks.filter((task) => !task.checked);
  const docs = listV3Docs();
  const commit = gitSha();
  const runId = process.env.G3D_RELEASE_RUN_ID ?? `v3-${args.track}-${Date.now()}`;

  if (args.track === "examples" || args.track === "all") {
    runCommand("node --experimental-strip-types tools/example-truth-audit/index.ts", runId);
  }

  const broadClaims = scanBroadClaims();
  const requiredReports = requiredReportsByTrack[args.track].map((path) => inspectReport(path, commit));
  const failures = [
    ...unchecked.map((task) => `${task.document}:${task.line} unchecked: ${task.text}`),
    ...requiredReports.flatMap((report) => report.messages.map((message) => `${report.path}: ${message}`)),
    ...broadClaims.map((claim) => `blocked broad claim wording appears in public source: ${claim}`),
  ];

  const report: V3VerificationReport = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    runId,
    command: `node --experimental-strip-types tools/foundation-verification/index.ts --track ${args.track}${args.strict ? " --strict" : ""}`,
    commit,
    track: args.track,
    strict: args.strict,
    docs,
    sourceHashes: Object.fromEntries(docs.map((path) => [path, sha256(readFileSync(join(root, path), "utf8"))])),
    totalTasks: scopedTasks.length,
    checkedTasks: scopedTasks.length - unchecked.length,
    uncheckedTasks: unchecked.length,
    scopedUncheckedTasks: unchecked,
    requiredReports,
    blockedClaims: broadClaims,
    failures,
  };

  const reportPath = reportPathForTrack(args.track);
  writeJson(reportPath, report);
  if (args.track === "all") writeClaimGateReport(commit, runId, tasks, requiredReports, broadClaims);
  if (args.track === "code") writeCurrentCapabilityReport(commit, runId, tasks, requiredReports, broadClaims);
  console.log(JSON.stringify({ ok: report.ok, track: args.track, reportPath, uncheckedTasks: unchecked.length, failures: failures.length }, null, 2));
  if (args.strict && !report.ok) process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): { track: Track; strict: boolean } {
  const trackIndex = argv.indexOf("--track");
  const rawTrack = trackIndex >= 0 ? argv[trackIndex + 1] : "all";
  const validTracks: readonly Track[] = ["code", "examples", "rendering", "assets", "editor", "runtime", "benchmarks", "all"];
  const track = validTracks.includes(rawTrack as Track) ? (rawTrack as Track) : "all";
  return { track, strict: argv.includes("--strict") };
}

function listV3Docs(): readonly string[] {
  return readdirSync(join(root, "docs/project"))
    .filter((file) => file.startsWith("v3-"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `docs/project/${file}`)
    .sort((left, right) => left.localeCompare(right));
}

function readV3Tasks(): readonly V3Task[] {
  return listV3Docs().flatMap((document) => {
    const lines = readFileSync(join(root, document), "utf8").split(/\r?\n/);
    return lines.flatMap((line, index): V3Task[] => {
      const match = line.match(/^- \[([ x])\] (.+)$/);
      if (!match) return [];
      const text = match[2] ?? "";
      return [{ document, line: index + 1, text, checked: match[1] === "x", owner: ownerForTask(document, text) }];
    });
  });
}

function ownerForTask(document: string, text: string): Track {
  const source = `${document} ${text}`.toLowerCase();
  if (document.includes("renderer-and-gpu")) return "rendering";
  if (document.includes("asset-pipeline")) return "assets";
  if (document.includes("editor-authoring")) return "editor";
  if (document.includes("runtime-systems")) return "runtime";
  if (document.includes("examples-and-benchmarks")) return "benchmarks";
  if (document.includes("testing-and-validation") || document.includes("decision-gates")) return "all";
  if (/(renderer|webgl|webgpu|pbr|shadow|postprocess|hdr|ibl|tone|culling|lod|instancing)/.test(source)) return "rendering";
  if (/(asset|gltf|glb|texture|image|corpus|draco|meshopt|ktx2|basis|skin|morph|variant)/.test(source)) return "assets";
  if (/(editor|hierarchy|inspector|gizmo|project|prefab|play mode|export)/.test(source)) return "editor";
  if (/(physics|animation|input|audio|script|particle|game|character|runtime)/.test(source)) return "runtime";
  if (/(example|product|architecture|benchmark|three\.js|babylon|comparison|same-scene|bundle)/.test(source)) return "benchmarks";
  return "all";
}

function inspectReport(path: string, commit: string): V3ReportFreshness {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return { path, exists: false, freshForCurrentCommit: false, messages: ["missing required report"] };
  }
  const modifiedAt = statSync(absolute).mtime.toISOString();
  let generatedAt: string | undefined;
  let reportCommit: string | undefined;
  let runId: string | undefined;
  const messages: string[] = [];
  try {
    const parsed = JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
    generatedAt = typeof parsed.generatedAt === "string" ? parsed.generatedAt : undefined;
    reportCommit = typeof parsed.commit === "string" ? parsed.commit : typeof parsed.gitSha === "string" ? parsed.gitSha : undefined;
    runId = typeof parsed.runId === "string" ? parsed.runId : typeof parsed.releaseRunId === "string" ? parsed.releaseRunId : undefined;
    if (!generatedAt) messages.push("missing generatedAt");
    if (!runId) messages.push("missing runId/releaseRunId");
    if (!reportCommit) messages.push("missing commit/gitSha");
    if (reportCommit && reportCommit !== commit) messages.push(`report commit ${reportCommit} is not current ${commit}`);
  } catch (error) {
    messages.push(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    path,
    exists: true,
    modifiedAt,
    ...(generatedAt ? { generatedAt } : {}),
    ...(reportCommit ? { commit: reportCommit } : {}),
    ...(runId ? { runId } : {}),
    freshForCurrentCommit: messages.length === 0,
    messages,
  };
}

function scanBroadClaims(): readonly string[] {
  const paths = [
    "README.md",
    "examples/README.md",
    "examples/portfolio/README.md",
    "examples/portfolio/main.ts",
    ...listV3Docs(),
  ];
  const blocked: string[] = [];
  for (const path of paths) {
    const text = readFileSync(join(root, path), "utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (isNegatedOrScoped(line)) continue;
      if (broadClaimPatterns.some((pattern) => pattern.test(line))) blocked.push(`${path}:${index + 1}: ${line.trim()}`);
    }
  }
  return blocked;
}

function isNegatedOrScoped(line: string): boolean {
  return /\b(not|do not|does not|no|blocked|unless|until|before|remain|future|must not|cannot|current evidence|not true yet|not evidence)\b/i.test(line);
}

function writeClaimGateReport(
  commit: string,
  runId: string,
  tasks: readonly V3Task[],
  requiredReports: readonly V3ReportFreshness[],
  broadClaims: readonly string[],
): void {
  const unchecked = tasks.filter((task) => !task.checked);
  writeJson("tests/reports/foundation-claim-gates.json", {
    ok: unchecked.length === 0 && requiredReports.every((report) => report.freshForCurrentCommit) && broadClaims.length === 0,
    generatedAt: new Date().toISOString(),
    runId,
    commit,
    command: "node --experimental-strip-types tools/foundation-verification/index.ts --track all",
    gates: [
      { id: "examples-honest", pass: unchecked.every((task) => !/example|claim|truth/i.test(task.text)) },
      { id: "product-grade-examples", pass: unchecked.every((task) => !/product-grade|product configurator|architecture viewer|game scene/i.test(task.text)) },
      { id: "asset-corpus", pass: unchecked.every((task) => !/asset corpus|gltf corpus|corpus/i.test(task.text)) },
      { id: "browser-editor", pass: unchecked.every((task) => !/editor|author|export/i.test(task.text)) },
      { id: "engine-comparisons", pass: unchecked.every((task) => !/comparison|benchmark|Three\.js|Babylon/i.test(task.text)) },
      { id: "claim-boundary", pass: broadClaims.length === 0 },
    ],
    uncheckedTasks: unchecked.length,
    requiredReports,
    blockedClaims: broadClaims,
  });
}

function writeCurrentCapabilityReport(
  commit: string,
  runId: string,
  tasks: readonly V3Task[],
  requiredReports: readonly V3ReportFreshness[],
  broadClaims: readonly string[],
): void {
  const byOwner = tasks.reduce<Record<string, { total: number; checked: number; unchecked: number }>>((acc, task) => {
    acc[task.owner] ??= { total: 0, checked: 0, unchecked: 0 };
    acc[task.owner].total += 1;
    if (task.checked) acc[task.owner].checked += 1;
    else acc[task.owner].unchecked += 1;
    return acc;
  }, {});
  writeJson("tests/reports/foundation-current-capability.json", {
    ok: false,
    generatedAt: new Date().toISOString(),
    runId,
    commit,
    command: "node --experimental-strip-types tools/foundation-verification/index.ts --track code",
    status: "blocked",
    reason: "V3 docs still contain unchecked implementation, example, benchmark, report, and decision-gate tasks.",
    totalTasks: tasks.length,
    checkedTasks: tasks.filter((task) => task.checked).length,
    uncheckedTasks: tasks.filter((task) => !task.checked).length,
    byOwner,
    requiredReports,
    blockedClaims: broadClaims,
  });
}

function reportPathForTrack(track: Track): string {
  return track === "all" ? "tests/reports/foundation.json" : `tests/reports/foundation-${track}.json`;
}

function writeJson(path: string, value: unknown): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`);
}

function runCommand(command: string, runId: string): void {
  spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, G3D_RELEASE_RUN_ID: runId },
  });
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

main();
