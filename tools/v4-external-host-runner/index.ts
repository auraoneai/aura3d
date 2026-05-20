import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { V3SourceFileHash } from "../v3-reporting/index.js";
import { baseReport, writeJson } from "../v4-reporting/index.js";
import { createV4ExternalHostDoctorReport, type ExternalHostBlockedArtifactDetails } from "../v4-external-host-doctor/index.js";

const reportPath = "tests/reports/v4-external-host-runner.json";
const sourceFiles = [
  "package.json",
  "tools/v4-external-host-runner/index.ts",
  "tools/v4-external-host-doctor/index.ts",
  "tools/v4-external-evidence-handoff/index.ts",
  "tools/v4-external-evidence-readiness/index.ts",
  "tools/public-demo-deployment-smoke/index.ts",
  "tools/public-demo-deployment-artifacts/index.ts",
  "fixtures/external-engine-baselines/v4/external-baseline-command-plan.json",
  "fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs",
  "fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs",
  "fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs",
] as const;

export interface V4ExternalHostRunnerCommand {
  readonly id: string;
  readonly command: readonly string[];
  readonly requiredForParity: boolean;
  readonly expectedEvidencePaths: readonly string[];
  readonly validationCommands: readonly string[];
  readonly claimBoundary: string;
}

export interface V4ExternalHostRunnerResult extends V4ExternalHostRunnerCommand {
  readonly skipped: boolean;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly ok?: boolean;
}

export interface V4ExternalHostRunnerReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly commit: string;
  readonly runId: string;
  readonly command: string;
  readonly sourceFileHashes: readonly V3SourceFileHash[];
  readonly blockedClaims: readonly string[];
  readonly screenshotPaths: readonly string[];
  readonly violations: readonly string[];
  readonly auditComplete: true;
  readonly execute: boolean;
  readonly readyToExecute: boolean;
  readonly claimBoundary: string;
  readonly firstMissingCapability?: string;
  readonly externalEvidenceReady: boolean;
  readonly firstBlockedArtifact?: string;
  readonly firstBlockedArtifactDetails?: ExternalHostBlockedArtifactDetails;
  readonly missingArtifactRunbookPath: "tests/reports/v4-external-evidence-missing-artifacts.md";
  readonly externalReadinessSummary: {
    readonly readyAreas: number;
    readonly blockedAreas: number;
    readonly readyArtifacts: number;
    readonly blockedArtifacts: number;
    readonly firstBlockedArea?: string;
    readonly firstBlockedArtifact?: string;
  };
  readonly doctorReportPath: "tests/reports/v4-external-host-doctor.json";
  readonly commands: readonly V4ExternalHostRunnerCommand[];
  readonly results: readonly V4ExternalHostRunnerResult[];
  readonly reportPath: typeof reportPath;
}

export function createV4ExternalHostRunnerReport(
  root = process.cwd(),
  options: { readonly execute?: boolean } = {}
): V4ExternalHostRunnerReport {
  const execute = options.execute === true;
  const doctor = createV4ExternalHostDoctorReport(root);
  const commands = externalHostCommands();
  const readyToExecute = doctor.externalHostReady;
  const results: readonly V4ExternalHostRunnerResult[] = execute && readyToExecute
    ? commands.map((command) => runCommand(root, command))
    : commands.map((command) => ({ ...command, skipped: true }));
  const failures = results.filter((result) => result.ok === false);
  const ok = execute ? readyToExecute && failures.length === 0 : true;
  const violations = [
    ...(execute && !readyToExecute ? [`external host is not ready: ${doctor.firstMissingCapability ?? "unknown capability"}`] : []),
    ...failures.map((failure) => `external-host command failed: ${failure.id}`),
  ];
  const report: V4ExternalHostRunnerReport = {
    ...baseReport(root, {
      ok,
      command: execute ? "pnpm run:v4-external-host-evidence:execute" : "pnpm run:v4-external-host-evidence",
      runIdPrefix: "v4-external-host-runner",
      sourceFiles,
      violations,
    }),
    auditComplete: true,
    execute,
    readyToExecute,
    claimBoundary: execute
      ? "This runner only orchestrates external-host evidence commands. Parity remains blocked until the generated Unity, Unreal, and public deployment reports pass the downstream audits."
      : "Dry run only records the external-host command sequence. It is not external evidence and does not clear any parity gate.",
    firstMissingCapability: doctor.firstMissingCapability,
    externalEvidenceReady: doctor.externalEvidenceReady,
    firstBlockedArtifact: doctor.firstBlockedArtifact,
    firstBlockedArtifactDetails: doctor.firstBlockedArtifactDetails,
    missingArtifactRunbookPath: doctor.missingArtifactRunbookPath,
    externalReadinessSummary: doctor.externalReadinessSummary,
    doctorReportPath: "tests/reports/v4-external-host-doctor.json",
    commands,
    results,
    reportPath,
  };
  writeJson(root, reportPath, report);
  return report;
}

function externalHostCommands(): readonly V4ExternalHostRunnerCommand[] {
  return [
    command(
      "external-host-doctor",
      ["pnpm", "doctor:v4-external-host:strict"],
      ["tests/reports/v4-external-host-doctor.json"],
      ["pnpm doctor:v4-external-host"],
      "Confirms Unity, Unreal, public deployment URL, and handoff package readiness before any evidence capture."
    ),
    command(
      "unity-editor-cli-smoke",
      ["node", "fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs", "unity", "tests/reports/v4-unity-editor-cli-smoke.json"],
      ["tests/reports/v4-unity-editor-cli-smoke.json"],
      ["node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json"],
      "Proves the configured Unity editor binary starts and reports a version."
    ),
    command(
      "unity-baseline-captures",
      ["node", "fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs", "--project", process.env.G3D_UNITY_PROJECT_PATH || ".tmp/v4-unity-baseline-project"],
      [
        "tests/reports/v4-unity-baseline-render.json",
        "tests/reports/v4-unity-product-visual-baseline.json",
        "tests/reports/v4-unity-pbr-visual-baseline.json",
        "tests/reports/v4-unity-shadow-visual-baseline.json",
        "tests/reports/v4-unity-hdr-render-target-baseline.json",
        "tests/reports/v4-unity-postprocess-suite-baseline.json",
      ],
      ["node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unity", "pnpm verify:v4-external-baseline-reports"],
      "Captures same-scene Unity product, PBR, shadow, HDR, and postprocess baselines plus render workflow evidence."
    ),
    command(
      "unreal-editor-cli-smoke",
      ["node", "fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs", "unreal", "tests/reports/v4-unreal-editor-cli-smoke.json"],
      ["tests/reports/v4-unreal-editor-cli-smoke.json"],
      ["node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json"],
      "Proves the configured Unreal editor binary starts and reports a version."
    ),
    command(
      "unreal-baseline-captures",
      unrealCaptureCommand(),
      [
        "tests/reports/v4-unreal-baseline-render.json",
        "tests/reports/v4-unreal-product-visual-baseline.json",
        "tests/reports/v4-unreal-pbr-visual-baseline.json",
        "tests/reports/v4-unreal-shadow-visual-baseline.json",
        "tests/reports/v4-unreal-hdr-render-target-baseline.json",
        "tests/reports/v4-unreal-postprocess-suite-baseline.json",
      ],
      ["node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unreal", "pnpm verify:v4-external-baseline-reports"],
      "Captures same-scene Unreal product, PBR, shadow, HDR, and postprocess baselines plus render workflow evidence."
    ),
    command(
      "public-demo-deployment-smoke",
      ["pnpm", "verify:public-demo-deployment"],
      ["tests/reports/public-demo-deployment-smoke.json", "tests/reports/public-demo-deployment-runbook.md"],
      ["G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment", "pnpm audit:v4-production-readiness"],
      "Validates a durable public HTTPS deployment against current static-export hashes and content markers."
    ),
    command(
      "refresh-readiness-reports",
      ["pnpm", "refresh:v4-readiness-reports"],
      [
        "tests/reports/v4-external-evidence-readiness.json",
        "tests/reports/v4-unity-unreal-parity.json",
        "tests/reports/v4-production-readiness.json",
        "tests/reports/v4-completion-audit.json",
      ],
      ["pnpm verify:v4-report-freshness"],
      "Refreshes all dependent V4 readiness reports after external artifacts are generated."
    ),
    command(
      "final-parity-status",
      ["pnpm", "status:v4-parity"],
      ["tests/reports/v4-completion-audit.json"],
      ["pnpm status:v4-parity"],
      "Prints the final achieved and missing parity criteria."
    ),
    command(
      "final-parity-preflight",
      ["pnpm", "preflight:v4-parity:after-external-evidence"],
      ["tests/reports/v4-completion-audit.json", "tests/reports/v4-completion-audit-runbook.md"],
      ["pnpm preflight:v4-parity:after-external-evidence"],
      "Runs the full parity preflight against the external artifacts now present without overwriting this execute-runner report with a dry run."
    ),
  ];
}

function unrealCaptureCommand(): readonly string[] {
  const base = ["node", "fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs"];
  return process.env.G3D_UNREAL_PROJECT_PATH ? [...base, "--project", process.env.G3D_UNREAL_PROJECT_PATH] : base;
}

function command(
  id: string,
  commandLine: readonly string[],
  expectedEvidencePaths: readonly string[],
  validationCommands: readonly string[],
  claimBoundary: string
): V4ExternalHostRunnerCommand {
  return {
    id,
    command: commandLine,
    requiredForParity: true,
    expectedEvidencePaths,
    validationCommands,
    claimBoundary,
  };
}

function runCommand(root: string, commandInfo: V4ExternalHostRunnerCommand): V4ExternalHostRunnerResult {
  const result = spawnSync(commandInfo.command[0] ?? "", commandInfo.command.slice(1), {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return {
    ...commandInfo,
    skipped: false,
    exitCode: result.status,
    signal: result.signal,
    ok: result.status === 0,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createV4ExternalHostRunnerReport(process.cwd(), { execute: process.argv.includes("--execute") });
  console.log(JSON.stringify({
    ok: report.ok,
    execute: report.execute,
    readyToExecute: report.readyToExecute,
    firstMissingCapability: report.firstMissingCapability,
    firstBlockedArtifact: report.firstBlockedArtifact,
    firstBlockedArtifactDetails: report.firstBlockedArtifactDetails,
    externalEvidenceReady: report.externalEvidenceReady,
    externalReadinessSummary: report.externalReadinessSummary,
    commandCount: report.commands.length,
    failedCommands: report.results.filter((result) => result.ok === false).map((result) => result.id),
    report: report.reportPath,
    nextCommand: report.readyToExecute ? "pnpm run:v4-external-host-evidence:execute" : "pnpm doctor:v4-external-host",
  }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
