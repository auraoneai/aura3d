import { fileURLToPath } from "node:url";
import { isRecord, readJson, writeJson } from "../v4-reporting/index.js";
import { externalEvidenceLocalPreflight } from "../v4-external-evidence-readiness/index.js";
import { verifyV4ExternalEvidenceHandoffPackage } from "../v4-external-evidence-handoff/index.js";

const reportPath = "tests/reports/v4-external-host-doctor.json";
const readinessReportPath = "tests/reports/v4-external-evidence-readiness.json";
const missingArtifactRunbookPath = "tests/reports/v4-external-evidence-missing-artifacts.md" as const;

export interface V4ExternalHostDoctorReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly externalHostReady: boolean;
  readonly handoffPackageReady: boolean;
  readonly externalEvidenceReady: boolean;
  readonly firstMissingCapability?: string;
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
  readonly localPreflight: ReturnType<typeof externalEvidenceLocalPreflight>;
  readonly handoffPackage: ReturnType<typeof verifyV4ExternalEvidenceHandoffPackage>;
  readonly nextCommands: readonly string[];
  readonly reportPath: typeof reportPath;
}

export interface ExternalHostBlockedArtifactDetails {
  readonly areaId?: string;
  readonly id: string;
  readonly kind?: string;
  readonly path?: string;
  readonly command?: string;
  readonly validationCommands: readonly string[];
  readonly localEvidence: readonly string[];
  readonly requiredExternalEvidence: readonly string[];
  readonly blockers: readonly string[];
}

export function createV4ExternalHostDoctorReport(root = process.cwd()): V4ExternalHostDoctorReport {
  const externalReadiness = externalEvidenceReadinessForDoctor(root);
  const localPreflight = externalEvidenceLocalPreflight();
  const handoffPackage = verifyV4ExternalEvidenceHandoffPackage(root);
  const externalHostReady = localPreflight.canRunExternalEvidenceHere && handoffPackage.ok;
  const nextCommands = externalHostReady
    ? [
      localPreflight.unity.smokeCommand,
      "node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project",
      localPreflight.unreal.smokeCommand,
      "node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject",
      localPreflight.publicDeployment.command,
      "pnpm run:v4-external-host-evidence:execute",
      "pnpm refresh:v4-readiness-reports",
      "pnpm status:v4-parity",
      "pnpm preflight:v4-parity:after-external-evidence",
    ]
    : blockedNextCommands(localPreflight, handoffPackage);
  const report: V4ExternalHostDoctorReport = {
    ok: true,
    auditComplete: true,
    externalHostReady,
    handoffPackageReady: handoffPackage.ok,
    externalEvidenceReady: externalReadiness.externalEvidenceReady,
    firstMissingCapability: localPreflight.firstMissingCapability || (!handoffPackage.ok ? "handoff-package-integrity" : undefined),
    firstBlockedArtifact: externalReadiness.firstBlockedArtifact,
    firstBlockedArtifactDetails: externalReadiness.firstBlockedArtifactDetails,
    missingArtifactRunbookPath,
    externalReadinessSummary: {
      readyAreas: externalReadiness.readyAreas,
      blockedAreas: externalReadiness.blockedAreas,
      readyArtifacts: externalReadiness.readyArtifacts,
      blockedArtifacts: externalReadiness.blockedArtifacts,
      firstBlockedArea: externalReadiness.firstBlockedArea,
      firstBlockedArtifact: externalReadiness.firstBlockedArtifact,
    },
    localPreflight,
    handoffPackage,
    nextCommands,
    reportPath,
  };
  writeJson(root, reportPath, report);
  return report;
}

function externalEvidenceReadinessForDoctor(root: string): {
  readonly externalEvidenceReady: boolean;
  readonly readyAreas: number;
  readonly blockedAreas: number;
  readonly readyArtifacts: number;
  readonly blockedArtifacts: number;
  readonly firstBlockedArea?: string;
  readonly firstBlockedArtifact?: string;
  readonly firstBlockedArtifactDetails?: ExternalHostBlockedArtifactDetails;
} {
  const report = readJson(root, readinessReportPath);
  const summary = isRecord(report?.summary) ? report.summary : {};
  const artifactChecklist = Array.isArray(report?.artifactChecklist) ? report.artifactChecklist.filter(isRecord) : [];
  const firstBlockedArtifact = artifactChecklist.find((artifact) => artifact.ready !== true);
  return {
    externalEvidenceReady: report?.externalEvidenceReady === true,
    readyAreas: numberOrZero(summary.readyAreas ?? report?.readyAreas),
    blockedAreas: numberOrZero(summary.blockedAreas ?? report?.blockedAreas),
    readyArtifacts: numberOrZero(summary.readyArtifacts ?? report?.readyArtifacts),
    blockedArtifacts: numberOrZero(summary.blockedArtifacts ?? report?.blockedArtifacts),
    firstBlockedArea: typeof summary.firstBlockedArea === "string"
      ? summary.firstBlockedArea
      : typeof firstBlockedArtifact?.areaId === "string" ? firstBlockedArtifact.areaId : undefined,
    firstBlockedArtifact: typeof (summary.firstBlockedArtifact ?? report?.firstBlockedArtifact) === "string"
      ? String(summary.firstBlockedArtifact ?? report?.firstBlockedArtifact)
      : typeof firstBlockedArtifact?.id === "string" ? firstBlockedArtifact.id : undefined,
    firstBlockedArtifactDetails: blockedArtifactDetails(firstBlockedArtifact),
  };
}

function blockedArtifactDetails(artifact: Record<string, unknown> | undefined): ExternalHostBlockedArtifactDetails | undefined {
  if (!artifact || typeof artifact.id !== "string") return undefined;
  return {
    areaId: typeof artifact.areaId === "string" ? artifact.areaId : undefined,
    id: artifact.id,
    kind: typeof artifact.kind === "string" ? artifact.kind : undefined,
    path: typeof artifact.path === "string" ? artifact.path : undefined,
    command: typeof artifact.command === "string" ? artifact.command : undefined,
    validationCommands: stringArray(artifact.validationCommands),
    localEvidence: stringArray(artifact.localEvidence),
    requiredExternalEvidence: stringArray(artifact.requiredExternalEvidence),
    blockers: stringArray(artifact.blockers),
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function blockedNextCommands(
  localPreflight: ReturnType<typeof externalEvidenceLocalPreflight>,
  handoffPackage: ReturnType<typeof verifyV4ExternalEvidenceHandoffPackage>
): readonly string[] {
  return [
    ...(!handoffPackage.ok ? ["pnpm prepare:v4-external-evidence-handoff && pnpm verify:v4-external-evidence-handoff"] : []),
    ...(localPreflight.unity.executableAvailable ? [] : ["export G3D_UNITY_EDITOR=/absolute/path/to/Unity"]),
    ...(localPreflight.unreal.executableAvailable ? [] : ["export G3D_UNREAL_EDITOR=/absolute/path/to/UnrealEditor-Cmd"]),
    ...(localPreflight.unity.cliSmokeOptIn && localPreflight.unreal.cliSmokeOptIn ? [] : ["export G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true"]),
    ...(localPreflight.publicDeployment.durableHttpsCandidate ? [] : ["export G3D_PUBLIC_DEMO_URL=https://your-public-demo.example/"]),
    "pnpm doctor:v4-external-host",
    "pnpm run:v4-external-host-evidence",
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createV4ExternalHostDoctorReport();
  console.log(JSON.stringify({
    ok: report.ok,
    externalHostReady: report.externalHostReady,
    handoffPackageReady: report.handoffPackageReady,
    externalEvidenceReady: report.externalEvidenceReady,
    firstMissingCapability: report.firstMissingCapability,
    firstBlockedArtifact: report.firstBlockedArtifact,
    firstBlockedArtifactDetails: report.firstBlockedArtifactDetails,
    missingArtifactRunbookPath: report.missingArtifactRunbookPath,
    externalReadinessSummary: report.externalReadinessSummary,
    report: report.reportPath,
    nextCommands: report.nextCommands,
  }, null, 2));
  if (process.argv.includes("--strict") && !report.externalHostReady) process.exit(1);
}
