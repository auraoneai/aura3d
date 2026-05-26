import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { FoundationSourceFileHash } from "../foundation-reporting/index.js";
import { baseReport, writeJson } from "../external-parity-reporting/index.js";
import { createExternalParityExternalHostDoctorReport, type ExternalHostBlockedArtifactDetails } from "../external-parity-external-host-doctor/index.js";

const reportPath = "tests/reports/external-parity-external-host-runner.json";
const sourceFiles = [
  "package.json",
  "tools/external-parity-external-host-runner/index.ts",
  "tools/external-parity-external-host-doctor/index.ts",
  "tools/external-parity-external-evidence-handoff/index.ts",
  "tools/external-parity-external-evidence-readiness/index.ts",
  "tools/public-demo-deployment-smoke/index.ts",
  "tools/public-demo-deployment-artifacts/index.ts",
  "fixtures/external-engine-baselines/external-parity/external-baseline-command-plan.json",
  "fixtures/external-engine-baselines/external-parity/run-editor-cli-smoke.mjs",
  "fixtures/external-engine-baselines/external-parity/unity/run-unity-baseline-captures.mjs",
  "fixtures/external-engine-baselines/external-parity/unreal/run-unreal-baseline-captures.mjs",
] as const;

export interface ExternalParityExternalHostRunnerCommand {
  readonly id: string;
  readonly command: readonly string[];
  readonly requiredForParity: boolean;
  readonly expectedEvidencePaths: readonly string[];
  readonly validationCommands: readonly string[];
  readonly claimBoundary: string;
}

export interface ExternalParityExternalHostRunnerResult extends ExternalParityExternalHostRunnerCommand {
  readonly skipped: boolean;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly ok?: boolean;
}

export interface ExternalParityExternalHostRunnerReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly commit: string;
  readonly runId: string;
  readonly command: string;
  readonly sourceFileHashes: readonly FoundationSourceFileHash[];
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
  readonly missingArtifactRunbookPath: "tests/reports/external-parity-external-evidence-missing-artifacts.md";
  readonly externalReadinessSummary: {
    readonly readyAreas: number;
    readonly blockedAreas: number;
    readonly readyArtifacts: number;
    readonly blockedArtifacts: number;
    readonly firstBlockedArea?: string;
    readonly firstBlockedArtifact?: string;
  };
  readonly doctorReportPath: "tests/reports/external-parity-external-host-doctor.json";
  readonly commands: readonly ExternalParityExternalHostRunnerCommand[];
  readonly results: readonly ExternalParityExternalHostRunnerResult[];
  readonly reportPath: typeof reportPath;
}

export function createExternalParityExternalHostRunnerReport(
  root = process.cwd(),
  options: { readonly execute?: boolean } = {}
): ExternalParityExternalHostRunnerReport {
  const execute = options.execute === true;
  const doctor = createExternalParityExternalHostDoctorReport(root);
  const commands = externalHostCommands();
  const readyToExecute = doctor.externalHostReady;
  const results: readonly ExternalParityExternalHostRunnerResult[] = execute && readyToExecute
    ? commands.map((command) => runCommand(root, command))
    : commands.map((command) => ({ ...command, skipped: true }));
  const failures = results.filter((result) => result.ok === false);
  const ok = execute ? readyToExecute && failures.length === 0 : true;
  const violations = [
    ...(execute && !readyToExecute ? [`external host is not ready: ${doctor.firstMissingCapability ?? "unknown capability"}`] : []),
    ...failures.map((failure) => `external-host command failed: ${failure.id}`),
  ];
  const report: ExternalParityExternalHostRunnerReport = {
    ...baseReport(root, {
      ok,
      command: execute ? "pnpm run:external-parity-external-host-evidence:execute" : "pnpm run:external-parity-external-host-evidence",
      runIdPrefix: "external-parity-external-host-runner",
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
    doctorReportPath: "tests/reports/external-parity-external-host-doctor.json",
    commands,
    results,
    reportPath,
  };
  writeJson(root, reportPath, report);
  return report;
}

function externalHostCommands(): readonly ExternalParityExternalHostRunnerCommand[] {
  return [
    command(
      "external-host-doctor",
      ["pnpm", "doctor:external-parity-external-host:strict"],
      ["tests/reports/external-parity-external-host-doctor.json"],
      ["pnpm doctor:external-parity-external-host"],
      "Confirms Unity, Unreal, public deployment URL, and handoff package readiness before any evidence capture."
    ),
    command(
      "unity-editor-cli-smoke",
      ["node", "fixtures/external-engine-baselines/external-parity/run-editor-cli-smoke.mjs", "unity", "tests/reports/external-parity-unity-editor-cli-smoke.json"],
      ["tests/reports/external-parity-unity-editor-cli-smoke.json"],
      ["node fixtures/external-engine-baselines/external-parity/run-editor-cli-smoke.mjs unity tests/reports/external-parity-unity-editor-cli-smoke.json"],
      "Proves the configured Unity editor binary starts and reports a version."
    ),
    command(
      "unity-baseline-captures",
      ["node", "fixtures/external-engine-baselines/external-parity/unity/run-unity-baseline-captures.mjs", "--project", process.env.A3D_UNITY_PROJECT_PATH || ".tmp/external-parity-unity-baseline-project"],
      [
        "tests/reports/external-parity-unity-baseline-render.json",
        "tests/reports/external-parity-unity-product-visual-baseline.json",
        "tests/reports/external-parity-unity-pbr-visual-baseline.json",
        "tests/reports/external-parity-unity-shadow-visual-baseline.json",
        "tests/reports/external-parity-unity-hdr-render-target-baseline.json",
        "tests/reports/external-parity-unity-postprocess-suite-baseline.json",
      ],
      ["node fixtures/external-engine-baselines/external-parity/verify-baseline-reports.mjs --engine unity", "pnpm verify:external-parity-external-baseline-reports"],
      "Captures same-scene Unity product, PBR, shadow, HDR, and postprocess baselines plus render workflow evidence."
    ),
    command(
      "unreal-editor-cli-smoke",
      ["node", "fixtures/external-engine-baselines/external-parity/run-editor-cli-smoke.mjs", "unreal", "tests/reports/external-parity-unreal-editor-cli-smoke.json"],
      ["tests/reports/external-parity-unreal-editor-cli-smoke.json"],
      ["node fixtures/external-engine-baselines/external-parity/run-editor-cli-smoke.mjs unreal tests/reports/external-parity-unreal-editor-cli-smoke.json"],
      "Proves the configured Unreal editor binary starts and reports a version."
    ),
    command(
      "unreal-baseline-captures",
      unrealCaptureCommand(),
      [
        "tests/reports/external-parity-unreal-baseline-render.json",
        "tests/reports/external-parity-unreal-product-visual-baseline.json",
        "tests/reports/external-parity-unreal-pbr-visual-baseline.json",
        "tests/reports/external-parity-unreal-shadow-visual-baseline.json",
        "tests/reports/external-parity-unreal-hdr-render-target-baseline.json",
        "tests/reports/external-parity-unreal-postprocess-suite-baseline.json",
      ],
      ["node fixtures/external-engine-baselines/external-parity/verify-baseline-reports.mjs --engine unreal", "pnpm verify:external-parity-external-baseline-reports"],
      "Captures same-scene Unreal product, PBR, shadow, HDR, and postprocess baselines plus render workflow evidence."
    ),
    command(
      "public-demo-deployment-smoke",
      ["pnpm", "verify:public-demo-deployment"],
      ["tests/reports/public-demo-deployment-smoke.json", "tests/reports/public-demo-deployment-runbook.md"],
      ["A3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment", "pnpm audit:external-parity-production-readiness"],
      "Validates a durable public HTTPS deployment against current static-export hashes and content markers."
    ),
    command(
      "refresh-readiness-reports",
      ["pnpm", "refresh:external-parity-readiness-reports"],
      [
        "tests/reports/external-parity-external-evidence-readiness.json",
        "tests/reports/external-parity-unity-unreal-parity.json",
        "tests/reports/external-parity-production-readiness.json",
        "tests/reports/external-parity-completion-audit.json",
      ],
      ["pnpm verify:external-parity-report-freshness"],
      "Refreshes all dependent External parity readiness reports after external artifacts are generated."
    ),
    command(
      "final-parity-status",
      ["pnpm", "status:external-parity-parity"],
      ["tests/reports/external-parity-completion-audit.json"],
      ["pnpm status:external-parity-parity"],
      "Prints the final achieved and missing parity criteria."
    ),
    command(
      "final-parity-preflight",
      ["pnpm", "preflight:external-parity-parity:after-external-evidence"],
      ["tests/reports/external-parity-completion-audit.json", "tests/reports/external-parity-completion-audit-runbook.md"],
      ["pnpm preflight:external-parity-parity:after-external-evidence"],
      "Runs the full parity preflight against the external artifacts now present without overwriting this execute-runner report with a dry run."
    ),
  ];
}

function unrealCaptureCommand(): readonly string[] {
  const base = ["node", "fixtures/external-engine-baselines/external-parity/unreal/run-unreal-baseline-captures.mjs"];
  return process.env.A3D_UNREAL_PROJECT_PATH ? [...base, "--project", process.env.A3D_UNREAL_PROJECT_PATH] : base;
}

function command(
  id: string,
  commandLine: readonly string[],
  expectedEvidencePaths: readonly string[],
  validationCommands: readonly string[],
  claimBoundary: string
): ExternalParityExternalHostRunnerCommand {
  return {
    id,
    command: commandLine,
    requiredForParity: true,
    expectedEvidencePaths,
    validationCommands,
    claimBoundary,
  };
}

function runCommand(root: string, commandInfo: ExternalParityExternalHostRunnerCommand): ExternalParityExternalHostRunnerResult {
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
  const report = createExternalParityExternalHostRunnerReport(process.cwd(), { execute: process.argv.includes("--execute") });
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
    nextCommand: report.readyToExecute ? "pnpm run:external-parity-external-host-evidence:execute" : "pnpm doctor:external-parity-external-host",
  }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
