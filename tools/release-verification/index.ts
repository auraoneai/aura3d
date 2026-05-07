import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type ReleaseCommand = readonly [string, string];

export interface ReleaseCommandResult {
  readonly name: string;
  readonly command: string;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ReleaseReportFreshness {
  readonly path: string;
  readonly exists: boolean;
  readonly generatedAt?: string;
  readonly modifiedAt?: string;
  readonly releaseRunId?: string;
  readonly fresh: boolean;
  readonly runIdMatches: boolean;
  readonly statusOk: boolean;
  readonly messages: readonly string[];
}

export interface ReleaseVerificationReport {
  readonly ok: boolean;
  readonly fullGate: boolean;
  readonly commandsOk: boolean;
  readonly freshnessOk: boolean;
  readonly releaseRunId: string;
  readonly startedAt: string;
  readonly generatedAt: string;
  readonly root: string;
  readonly failedCommands: readonly string[];
  readonly reportPaths: readonly string[];
  readonly reportFreshness: readonly ReleaseReportFreshness[];
  readonly commands: readonly ReleaseCommandResult[];
}

export interface ReleaseRepeatRunSummary {
  readonly index: number;
  readonly releaseRunId: string;
  readonly ok: boolean;
  readonly failedCommands: readonly string[];
  readonly cleanCheckout: CleanCheckoutRunEvidence;
}

export interface CleanCheckoutRunEvidence {
  readonly reportPath: string;
  readonly reportFound: boolean;
  readonly cleanCheckout: boolean;
  readonly independentMachineOrAgent: boolean;
  readonly blockers: readonly string[];
}

export interface ReleaseHardGateRow {
  readonly row: 81 | 686 | 689 | 692 | 696;
  readonly description: string;
  readonly proven: boolean;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
}

export interface ReleaseRepeatReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly gitSha: string;
  readonly command: string;
  readonly environment: {
    readonly platform: string;
    readonly release: string;
    readonly arch: string;
    readonly node: string;
  };
  readonly sourceInputs: readonly string[];
  readonly repeats: number;
  readonly commandFailureCounts: Record<string, number>;
  readonly hardGateRows: readonly ReleaseHardGateRow[];
  readonly runs: readonly ReleaseRepeatRunSummary[];
}

export const defaultCommands = [
  ["typecheck", "pnpm typecheck"],
  ["build", "pnpm build"],
  ["unit", "pnpm test:unit"],
  ["integration", "pnpm test:integration"],
  ["performance", "pnpm verify:performance"],
  ["engine-comparison", "pnpm exec tsx --tsconfig tsconfig.base.json tools/compare-engines/index.ts --write-reports"],
  ["browser", "pnpm test:browser"],
  ["architecture", "pnpm verify:architecture"],
  ["boundaries", "pnpm verify:boundaries"],
  ["exports", "pnpm verify:exports"],
  ["shaders", "pnpm verify:shaders"],
  ["visual", "pnpm test:visual"],
  ["imports", "pnpm verify:imports"],
  ["package-size", "pnpm verify:size"],
  ["source-cleanliness", "pnpm verify:source-cleanliness"],
  ["clean-checkout", "pnpm verify:clean-checkout"],
  ["demo-validation", "pnpm verify:demos"],
  ["docs-consistency", "pnpm verify:docs-consistency"],
  ["docs-version", "pnpm verify:docs-version"],
  ["claims", "pnpm verify:claims"],
  ["requirements-trace", "pnpm trace:requirements"],
  ["trace", "pnpm verify:trace"]
] as const;

const releaseReportPaths = [
  "tests/reports/release-verification.json",
  "tests/reports/final-release-verification.json"
] as const;

const commandReportPaths: Record<string, readonly string[]> = {
  unit: ["tests/reports/unit.json"],
  integration: ["tests/reports/integration.json"],
  performance: ["tests/reports/performance.json", "tests/reports/final-performance.json"],
  "engine-comparison": [
    "tests/reports/comparison-threejs.json",
    "tests/reports/comparison-babylon.json"
  ],
  browser: [
    "tests/reports/browser.json",
    "tests/reports/final-browser.json",
    "tests/reports/webgpu-hardware-matrix.json",
    "tests/reports/browser-hardware-matrix.json"
  ],
  architecture: ["tests/reports/architecture.json"],
  boundaries: ["tests/reports/boundaries.json"],
  exports: ["tests/reports/exports.json"],
  shaders: ["tests/reports/shaders.json"],
  visual: [
    "tests/reports/visual.json",
    "tests/reports/final-visual.json",
    "tests/reports/pbr-environment-validation.json",
    "tests/reports/pbr-rendering-comparison.json"
  ],
  imports: ["tests/reports/import-smoke.json"],
  "package-size": ["tests/reports/package-size.json", "tests/reports/final-package-size.json"],
  "source-cleanliness": ["tests/reports/source-cleanliness.json", "tests/reports/final-source-cleanliness.json"],
  "clean-checkout": ["tests/reports/clean-checkout.json"],
  "demo-validation": ["tests/reports/final-demo-validation.json"],
  "docs-consistency": ["tests/reports/doc-contradictions.json"],
  claims: ["tests/reports/claim-registry.json"],
  "requirements-trace": ["tests/reports/final-requirements-trace.json"],
  trace: ["tests/reports/final-requirements-trace.json"]
};

function parseArgs(argv: readonly string[]): { root: string; commands: readonly ReleaseCommand[]; repeat: number } {
  const rootIndex = argv.indexOf("--root");
  const repeatIndex = argv.indexOf("--repeat");
  const root = rootIndex === -1 ? process.cwd() : (argv[rootIndex + 1] ?? process.cwd());
  const repeat = repeatIndex === -1 ? 0 : Number(argv[repeatIndex + 1] ?? 3);
  const quick = argv.includes("--quick");
  const commands = quick
    ? defaultCommands.filter(([name]) => !["browser"].includes(name))
    : defaultCommands;
  return { root, commands, repeat: Number.isInteger(repeat) && repeat > 0 ? repeat : 0 };
}

export function createReleaseRunId(now = new Date()): string {
  return `release-${now.toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

export function runReleaseVerification(
  root = process.cwd(),
  commands: readonly ReleaseCommand[] = defaultCommands,
  releaseRunId = process.env.G3D_RELEASE_RUN_ID ?? createReleaseRunId()
): ReleaseVerificationReport {
  const results: ReleaseCommandResult[] = [];
  const startedAt = new Date();

  for (const [name, command] of commands) {
    const started = performance.now();
    const result = spawnSync(command, {
      cwd: root,
      shell: true,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        G3D_RELEASE_RUN_ID: releaseRunId,
        G3D_RELEASE_STARTED_AT: startedAt.toISOString()
      }
    });
    postprocessCommandReports(root, name, releaseRunId);
    results.push({
      name,
      command,
      exitCode: result.status,
      durationMs: Number((performance.now() - started).toFixed(3)),
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    });
    writeReport(root, makeReport(root, releaseRunId, startedAt, results));
  }

  return makeReport(root, releaseRunId, startedAt, results);
}

function postprocessCommandReports(root: string, name: string, releaseRunId: string): void {
  if (name !== "browser") return;
  const sourcePath = join(root, "tests", "reports", "browser.json");
  if (!existsSync(sourcePath)) return;
  const report = JSON.parse(readFileSync(sourcePath, "utf8")) as Record<string, unknown>;
  const finalPath = join(root, "tests", "reports", "final-browser.json");
  mkdirSync(dirname(finalPath), { recursive: true });
  writeFileSync(finalPath, `${JSON.stringify({
    ...report,
    generatedAt: new Date().toISOString(),
    releaseRunId
  }, null, 2)}\n`);
  writeBrowserHardwareMatrix(root, releaseRunId);
}

function writeBrowserHardwareMatrix(root: string, releaseRunId: string): void {
  const webgpuReportPath = join(root, "tests", "reports", "webgpu-hardware-matrix.json");
  const webgpuReport = existsSync(webgpuReportPath)
    ? JSON.parse(readFileSync(webgpuReportPath, "utf8")) as Record<string, unknown>
    : {};
  const webgpuResults = Array.isArray(webgpuReport.results) ? webgpuReport.results.filter(isReleaseRecord) : [];
  const chromiumWebgpu = webgpuResults.find((entry) => entry.browserName === "chromium") ?? webgpuResults[0];
  const browserRows = [
    {
      browserName: "chromium",
      projectName: typeof chromiumWebgpu?.projectName === "string" ? chromiumWebgpu.projectName : "chromium",
      status: "tested",
      os: isReleaseRecord(chromiumWebgpu?.os)
        ? chromiumWebgpu.os
        : { platform: platform(), release: release() },
      userAgent: typeof chromiumWebgpu?.userAgent === "string" ? chromiumWebgpu.userAgent : "recorded by Playwright browser report",
      gpu: {
        adapterStatus: typeof chromiumWebgpu?.adapterStatus === "string" ? chromiumWebgpu.adapterStatus : "not-recorded",
        deviceStatus: typeof chromiumWebgpu?.deviceStatus === "string" ? chromiumWebgpu.deviceStatus : "not-recorded"
      },
      source: "tests/reports/browser.json"
    },
    {
      browserName: "firefox",
      projectName: "firefox",
      status: "not-configured",
      unsupportedCases: ["playwright.config.ts currently configures Chromium only; no Firefox support claim is made."]
    },
    {
      browserName: "webkit",
      projectName: "webkit",
      status: "not-configured",
      unsupportedCases: ["playwright.config.ts currently configures Chromium only; no WebKit support claim is made."]
    }
  ];
  const report = {
    ok: true,
    status: "pass-with-bounded-local-matrix",
    generatedAt: new Date().toISOString(),
    releaseRunId,
    gitSha: gitSha(root),
    command: "postprocess browser release reports in tools/release-verification/index.ts",
    environment: {
      platform: platform(),
      release: release(),
      arch: arch(),
      node: process.version,
      playwrightWorkers: 1
    },
    sourceInputs: [
      "playwright.config.ts",
      "tests/reports/browser.json",
      "tests/reports/final-browser.json",
      "tests/reports/webgpu-hardware-matrix.json",
      "docs/browser-hardware-matrix.md",
      "docs/compatibility.md",
      "docs/v2/claim-registry.md",
      "docs/rendering/webgpu-hardware-matrix.md"
    ],
    artifactLinks: [
      "tests/reports/browser.json",
      "tests/reports/final-browser.json",
      "tests/reports/webgpu-hardware-matrix.json",
      "docs/browser-hardware-matrix.md",
      "docs/compatibility.md",
      "docs/v2/claim-registry.md",
      "docs/rendering/webgpu-hardware-matrix.md"
    ],
    browserRows,
    coverage: {
      webgl2: {
        status: "bounded-local-browser-report",
        browserReport: "tests/reports/browser.json",
        finalBrowserReport: "tests/reports/final-browser.json",
        browser: "Chromium via Playwright",
        limits: [
          "Does not cover Chrome, Edge, Firefox, and Safari as a full matrix.",
          "Does not cover integrated/discrete GPU comparison or mobile-class browsers.",
          "Useful as local browser evidence only, not broad support evidence."
        ]
      },
      webgpu: {
        status: "real-navigator-gpu-probe",
        source: "tests/browser/webgpu-real-device.spec.ts",
        report: "tests/reports/webgpu-hardware-matrix.json",
        browser: typeof chromiumWebgpu?.browserName === "string" ? chromiumWebgpu.browserName : "unknown",
        adapterStatus: typeof chromiumWebgpu?.adapterStatus === "string" ? chromiumWebgpu.adapterStatus : "not-recorded",
        deviceStatus: typeof chromiumWebgpu?.deviceStatus === "string" ? chromiumWebgpu.deviceStatus : "not-recorded",
        unsupportedCases: Array.isArray(chromiumWebgpu?.unsupportedCases) ? chromiumWebgpu.unsupportedCases : [],
        limits: [
          "Does not prove real WebGPU rendering on hardware unless adapterStatus and deviceStatus are both available.",
          "Records unavailable-adapter behavior for this local browser/environment."
        ]
      }
    },
    decision: {
      checklistRow: 688,
      meaning: "Browser/hardware matrix artifact exists for bounded local evidence.",
      notEvidenceFor: [
        "production-ready browser support",
        "full WebGPU support",
        "multi-browser or multi-GPU release coverage"
      ]
    }
  };
  const matrixPath = join(root, "tests", "reports", "browser-hardware-matrix.json");
  mkdirSync(dirname(matrixPath), { recursive: true });
  writeFileSync(matrixPath, `${JSON.stringify(report, null, 2)}\n`);
}

function isReleaseRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function runReleaseRepeat(
  root = process.cwd(),
  repeats = 3,
  commands: readonly ReleaseCommand[] = defaultCommands
): ReleaseRepeatReport {
  const runs: ReleaseRepeatRunSummary[] = [];
  const commandFailureCounts: Record<string, number> = {};

  for (let index = 0; index < repeats; index += 1) {
    const report = runReleaseVerification(root, commands);
    const cleanCheckout = readCleanCheckoutRunEvidence(root);
    runs.push({
      index: index + 1,
      releaseRunId: report.releaseRunId,
      ok: report.ok,
      failedCommands: report.failedCommands,
      cleanCheckout
    });
    for (const failedCommand of report.failedCommands) {
      commandFailureCounts[failedCommand] = (commandFailureCounts[failedCommand] ?? 0) + 1;
    }
  }

  return {
    ok: runs.every((run) => run.ok),
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-release-repeat-run",
    gitSha: gitSha(root),
    command: `pnpm verify:release:repeat --repeat ${repeats}`,
    environment: {
      platform: platform(),
      release: release(),
      arch: arch(),
      node: process.version
    },
    sourceInputs: [
      "tools/release-verification/index.ts",
      "tools/clean-checkout-verification/index.ts",
      "tests/reports/clean-checkout.json",
      "tests/reports/final-release-verification.json"
    ],
    repeats,
    commandFailureCounts,
    hardGateRows: evaluateReleaseHardGateRows(root, repeats, runs),
    runs
  };
}

function gitSha(root: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function evaluateReleaseHardGateRows(root: string, repeats: number, runs: readonly ReleaseRepeatRunSummary[]): readonly ReleaseHardGateRow[] {
  const repeatedCleanReleasePass =
    repeats >= 3 &&
    runs.length >= 3 &&
    runs.every((run) => run.ok && run.cleanCheckout.cleanCheckout);
  const packageVersion = readPackageVersion(root);
  const packageReleaseBlocked = packageVersion === null || packageVersion === "0.0.0-rebuild";
  const independentReproduction = runs.some((run) => run.cleanCheckout.independentMachineOrAgent);
  const externalDemoReport = readJson(join(root, "tests", "reports", "external-demo-validation.json"));
  const externalDemoProven = externalDemoReport?.ok === true;
  const versionedReleaseReport = readJson(join(root, "tests", "reports", "versioned-release.json"));
  const versionedReleaseProven = versionedReleaseReport?.ok === true;

  return [
    {
      row: 81,
      description: "`pnpm verify:release` passes three consecutive times from a clean checkout.",
      proven: repeatedCleanReleasePass,
      evidence: ["tests/reports/release-repeat.json", "tests/reports/final-release-verification.json", "tests/reports/clean-checkout.json"],
      blockers: repeatedCleanReleasePass
        ? []
        : [
            ...(repeats >= 3 ? [] : [`Only ${repeats} repeat run(s) requested; three are required.`]),
            ...(runs.every((run) => run.ok) ? [] : ["At least one repeated release run failed."]),
            ...(runs.every((run) => run.cleanCheckout.cleanCheckout) ? [] : ["At least one run did not prove a clean checkout."])
          ]
    },
    {
      row: 686,
      description: "Release gate passes repeatedly.",
      proven: repeatedCleanReleasePass,
      evidence: ["tests/reports/release-repeat.json"],
      blockers: repeatedCleanReleasePass ? [] : ["Repeated release-gate evidence is not clean-checkout green for three consecutive runs."]
    },
    {
      row: 689,
      description: "External demos exist.",
      proven: externalDemoProven,
      evidence: ["docs/examples/external-demos.md", "docs/examples/external-demo-urls.json", "tests/reports/external-demo-validation.json"],
      blockers: externalDemoProven ? [] : ["No passing public hosted demo URL manifest and public-URL browser/screenshot artifacts are recorded."]
    },
    {
      row: 692,
      description: "Versioned package release exists.",
      proven: !packageReleaseBlocked && versionedReleaseProven,
      evidence: ["package.json", "docs/release-process.md", "docs/release-artifacts.json", "tests/reports/versioned-release.json"],
      blockers: packageReleaseBlocked || !versionedReleaseProven
        ? [`Package version is ${packageVersion ?? "unreadable"}; no passing versioned release artifact/publication evidence is recorded.`]
        : []
    },
    {
      row: 696,
      description: "Independent clean-checkout reproduction succeeds on another machine or agent from documented commands.",
      proven: independentReproduction,
      evidence: ["tests/reports/clean-checkout.json", "docs/release-process.md"],
      blockers: independentReproduction
        ? []
        : ["Current evidence was generated in this workspace only; no independent machine or agent reproduction evidence is recorded."]
    }
  ];
}

function readCleanCheckoutRunEvidence(root: string): CleanCheckoutRunEvidence {
  const reportPath = "tests/reports/clean-checkout.json";
  const path = join(root, reportPath);
  if (!existsSync(path)) {
    return {
      reportPath,
      reportFound: false,
      cleanCheckout: false,
      independentMachineOrAgent: false,
      blockers: ["Clean-checkout report was not generated."]
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const git = typeof parsed.git === "object" && parsed.git !== null ? parsed.git as Record<string, unknown> : {};
    const reproduction = typeof parsed.reproduction === "object" && parsed.reproduction !== null ? parsed.reproduction as Record<string, unknown> : {};
    const blockers = Array.isArray(parsed.blockers) ? parsed.blockers.filter((entry): entry is string => typeof entry === "string") : [];
    const reproductionBlockers = Array.isArray(reproduction.blockers) ? reproduction.blockers.filter((entry): entry is string => typeof entry === "string") : [];
    return {
      reportPath,
      reportFound: true,
      cleanCheckout: parsed.ok === true && git.dirty === false && reproduction.cleanCheckout === true,
      independentMachineOrAgent: reproduction.independentMachineOrAgent === true,
      blockers: [...blockers, ...reproductionBlockers]
    };
  } catch {
    return {
      reportPath,
      reportFound: true,
      cleanCheckout: false,
      independentMachineOrAgent: false,
      blockers: ["Clean-checkout report is not valid JSON."]
    };
  }
}

function readPackageVersion(root: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function makeReport(root: string, releaseRunId: string, startedAt: Date, results: readonly ReleaseCommandResult[]): ReleaseVerificationReport {
  const reportFreshness = verifyReleaseReportFreshness(root, releaseRunId, startedAt, results.map((result) => result.name));
  const failedFreshness = reportFreshness.filter((report) => !report.fresh || !report.runIdMatches || !report.statusOk);
  const commandsOk = results.every((result) => result.exitCode === 0);
  const freshnessOk = failedFreshness.length === 0;
  const fullGate = isFullReleaseGate(results);
  return {
    ok: commandsOk && freshnessOk && fullGate,
    fullGate,
    commandsOk,
    freshnessOk,
    releaseRunId,
    startedAt: startedAt.toISOString(),
    generatedAt: new Date().toISOString(),
    root,
    failedCommands: [
      ...results.filter((result) => result.exitCode !== 0).map((result) => result.name),
      ...failedFreshness.map((report) => reportFailureName(report)),
      ...(fullGate ? [] : ["partial-release-gate"])
    ],
    reportPaths: releaseReportPaths,
    reportFreshness,
    commands: results
  };
}

function isFullReleaseGate(results: readonly ReleaseCommandResult[]): boolean {
  const expectedNames = defaultCommands.map(([name]) => name);
  const actualNames = results.map((result) => result.name);
  return actualNames.length === expectedNames.length && actualNames.every((name, index) => name === expectedNames[index]);
}

function reportFailureName(report: ReleaseReportFreshness): string {
  if (!report.statusOk && report.fresh && report.runIdMatches) return `failed-report:${report.path}`;
  return `stale-report:${report.path}`;
}

export function verifyReleaseReportFreshness(
  root: string,
  releaseRunId: string,
  startedAt: Date,
  completedCommandNames: readonly string[]
): readonly ReleaseReportFreshness[] {
  const paths = [...new Set(completedCommandNames.flatMap((name) => commandReportPaths[name] ?? []))];
  return paths.map((reportPath) => inspectReportFreshness(root, reportPath, releaseRunId, startedAt));
}

function inspectReportFreshness(root: string, reportPath: string, releaseRunId: string, startedAt: Date): ReleaseReportFreshness {
  const path = join(root, reportPath);
  const messages: string[] = [];
  if (!existsSync(path)) {
    return { path: reportPath, exists: false, fresh: false, runIdMatches: false, statusOk: false, messages: ["Report was not generated."] };
  }

  let generatedAt: string | undefined;
  let reportRunId: string | undefined;
  let statusOk = true;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.generatedAt === "string") generatedAt = record.generatedAt;
      if (typeof record.releaseRunId === "string") reportRunId = record.releaseRunId;
      statusOk = reportIndicatesPass(record);
    }
  } catch {
    messages.push("Report is not valid JSON.");
    statusOk = false;
  }

  const modifiedAtMs = statSync(path).mtimeMs;
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const proofTimeMs = Number.isFinite(generatedAtMs) ? generatedAtMs : modifiedAtMs;
  const fresh = proofTimeMs >= startedAt.getTime() - 1000;
  const isFinalReport = /(?:^|\/)final-[^/]+\.json$/.test(reportPath);
  const runIdMatches = isFinalReport ? reportRunId === releaseRunId : reportRunId === undefined || reportRunId === releaseRunId;

  if (!fresh) messages.push("Report was generated before the current release run started.");
  if (!runIdMatches) {
    messages.push(isFinalReport ? "Final report releaseRunId does not match current release run." : "Report releaseRunId does not match current release run.");
  }
  if (!statusOk) messages.push("Report status is not green.");

  return {
    path: reportPath,
    exists: true,
    ...(generatedAt ? { generatedAt } : {}),
    modifiedAt: new Date(modifiedAtMs).toISOString(),
    ...(reportRunId ? { releaseRunId: reportRunId } : {}),
    fresh,
    runIdMatches,
    statusOk,
    messages
  };
}

function reportIndicatesPass(record: Record<string, unknown>): boolean {
  if (typeof record.ok === "boolean") return record.ok;
  if (typeof record.complete === "boolean") return record.complete;
  if (typeof record.status === "string") {
    const normalized = record.status.toLowerCase();
    if (["pass", "passed", "ok", "success"].includes(normalized)) return true;
    if (["fail", "failed", "error", "incomplete", "blocked"].includes(normalized)) return false;
  }
  if (Array.isArray(record.violations) && record.violations.length > 0) return false;
  if (Array.isArray(record.errors) && record.errors.length > 0) return false;
  if (record.stats && typeof record.stats === "object") {
    const stats = record.stats as Record<string, unknown>;
    if (typeof stats.unexpected === "number" && stats.unexpected > 0) return false;
  }
  return true;
}

function writeReport(root: string, report: ReleaseVerificationReport): void {
  for (const reportPath of releaseReportPaths) {
    const path = join(root, reportPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  }
}

function writeRepeatReport(root: string, report: ReleaseRepeatReport): void {
  const path = join(root, "tests", "reports", "release-repeat.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const { root, commands, repeat } = parseArgs(process.argv.slice(2));
  if (repeat > 0) {
    const repeatReport = runReleaseRepeat(root, repeat, commands);
    writeRepeatReport(root, repeatReport);
    for (const run of repeatReport.runs) {
      console.log(`${run.ok ? "PASS" : "FAIL"} repeat ${run.index}: ${run.releaseRunId} (${run.failedCommands.join(", ") || "no failures"})`);
    }
    for (const row of repeatReport.hardGateRows.filter((entry) => !entry.proven)) {
      console.log(`BLOCKED row ${row.row}: ${row.blockers.join("; ")}`);
    }
    if (!repeatReport.ok) process.exitCode = 1;
    process.exit();
  }

  const report = runReleaseVerification(root, commands);
  writeReport(root, report);
  for (const command of report.commands) {
    console.log(`${command.exitCode === 0 ? "PASS" : "FAIL"} ${command.name}: ${command.command} (${command.durationMs}ms)`);
  }
  for (const staleReport of report.reportFreshness.filter((entry) => !entry.fresh || !entry.runIdMatches || !entry.statusOk)) {
    console.log(`FAIL report freshness: ${staleReport.path} (${staleReport.messages.join("; ")})`);
  }
  if (!report.ok) process.exitCode = 1;
}
