import { fileURLToPath } from "node:url";
import { isRecord, readJson } from "../external-parity-reporting/index.js";

export interface ExternalParityParityStatusSummary {
  readonly ok: boolean;
  readonly achievedCriteria: number;
  readonly totalCriteria: number;
  readonly achievedCriteriaIds: readonly string[];
  readonly missingCriteriaIds: readonly string[];
  readonly firstMissingCriterion?: {
    readonly id: string;
    readonly requestedClaim?: string;
    readonly blockerType?: string;
    readonly evidencePaths: readonly string[];
    readonly localEvidence: readonly string[];
    readonly requiredExternalEvidence: readonly string[];
    readonly blockers: readonly string[];
  };
  readonly productionReady: boolean;
  readonly externalEvidenceReady: boolean;
  readonly unityParity: boolean;
  readonly unrealParity: boolean;
  readonly unityUnrealReplacement: boolean;
  readonly firstMissingCapability?: string;
  readonly firstBlockedExternalArea?: string;
  readonly firstBlockedExternalArtifact?: string;
  readonly firstBlockedExternalArtifactDetails?: {
    readonly areaId?: string;
    readonly id: string;
    readonly kind?: string;
    readonly path?: string;
    readonly command?: string;
    readonly validationCommands: readonly string[];
    readonly localEvidence: readonly string[];
    readonly requiredExternalEvidence: readonly string[];
    readonly blockers: readonly string[];
  };
  readonly githubExternalReady?: boolean;
  readonly githubExternalReadiness?: {
    readonly repo?: string;
    readonly currentBranch?: string;
    readonly defaultBranch?: string;
    readonly blockers: readonly string[];
    readonly nextCommands: readonly string[];
    readonly reportPath?: string;
  };
  readonly completionRunbookPath: "tests/reports/external-parity-completion-audit-runbook.md";
  readonly externalEvidenceRunbookPath: "tests/reports/external-parity-external-evidence-missing-artifacts.md";
  readonly commands: {
    readonly localPreflight: "pnpm preflight:external-parity-parity";
    readonly postExternalEvidencePreflight: "pnpm preflight:external-parity-parity:after-external-evidence";
    readonly reportRefresh: "pnpm refresh:external-parity-readiness-reports";
    readonly externalEvidencePreflight: "pnpm preflight:external-parity-external-evidence";
    readonly productionPreflight: "pnpm preflight:external-parity-production-readiness";
  };
}

export function createExternalParityParityStatusSummary(root = process.cwd()): ExternalParityParityStatusSummary {
  const completion = readJson(root, "tests/reports/external-parity-completion-audit.json");
  const externalEvidence = readJson(root, "tests/reports/external-parity-external-evidence-readiness.json");
  const githubExternal = readJson(root, "tests/reports/external-parity-github-external-readiness.json");
  const production = readJson(root, "tests/reports/external-parity-production-readiness.json");
  const unityUnreal = readJson(root, "tests/reports/external-parity-unity-unreal-parity.json");
  const criteria = Array.isArray(completion?.criteria) ? completion.criteria.filter(isRecord) : [];
  const achievedCriteriaIds = criteria
    .filter((entry) => entry.achieved === true && typeof entry.id === "string")
    .map((entry) => String(entry.id));
  const missingCriteriaIds = criteria
    .filter((entry) => entry.achieved !== true && typeof entry.id === "string")
    .map((entry) => String(entry.id));
  const firstMissingCriterion = firstMissingCriterionSummary(criteria);
  return {
    ok: completion?.ok === true,
    achievedCriteria: numberOrZero(completion?.achievedCriteria),
    totalCriteria: numberOrZero(completion?.totalCriteria),
    achievedCriteriaIds,
    missingCriteriaIds,
    firstMissingCriterion,
    productionReady: production?.productionReady === true,
    externalEvidenceReady: externalEvidence?.externalEvidenceReady === true,
    unityParity: unityUnreal?.unityParity === true,
    unrealParity: unityUnreal?.unrealParity === true,
    unityUnrealReplacement: unityUnreal?.replacement === true,
    firstMissingCapability: typeof externalEvidence?.firstMissingCapability === "string" ? externalEvidence.firstMissingCapability : undefined,
    firstBlockedExternalArea: firstBlockedExternalArea(externalEvidence),
    firstBlockedExternalArtifact: typeof externalEvidence?.firstBlockedArtifact === "string" ? externalEvidence.firstBlockedArtifact : undefined,
    firstBlockedExternalArtifactDetails: firstBlockedArtifactDetails(externalEvidence),
    githubExternalReady: typeof githubExternal?.githubExternalReady === "boolean" ? githubExternal.githubExternalReady : undefined,
    githubExternalReadiness: githubExternalReadiness(githubExternal),
    completionRunbookPath: "tests/reports/external-parity-completion-audit-runbook.md",
    externalEvidenceRunbookPath: "tests/reports/external-parity-external-evidence-missing-artifacts.md",
    commands: {
      localPreflight: "pnpm preflight:external-parity-parity",
      postExternalEvidencePreflight: "pnpm preflight:external-parity-parity:after-external-evidence",
      reportRefresh: "pnpm refresh:external-parity-readiness-reports",
      externalEvidencePreflight: "pnpm preflight:external-parity-external-evidence",
      productionPreflight: "pnpm preflight:external-parity-production-readiness",
    },
  };
}

function firstBlockedExternalArea(externalEvidence: Record<string, unknown> | null): string | undefined {
  const summary = isRecord(externalEvidence?.summary) ? externalEvidence.summary : {};
  if (typeof summary.firstBlockedArea === "string") return summary.firstBlockedArea;
  const areas = Array.isArray(externalEvidence?.areas) ? externalEvidence.areas.filter(isRecord) : [];
  const area = areas.find((entry) => entry.ready !== true && typeof entry.id === "string");
  if (typeof area?.id === "string") return area.id;
  const artifacts = Array.isArray(externalEvidence?.artifactChecklist) ? externalEvidence.artifactChecklist.filter(isRecord) : [];
  const artifact = artifacts.find((entry) => entry.ready !== true && typeof entry.areaId === "string");
  return typeof artifact?.areaId === "string" ? artifact.areaId : undefined;
}

function firstBlockedArtifactDetails(externalEvidence: Record<string, unknown> | null): ExternalParityParityStatusSummary["firstBlockedExternalArtifactDetails"] {
  const artifacts = Array.isArray(externalEvidence?.artifactChecklist) ? externalEvidence.artifactChecklist.filter(isRecord) : [];
  const artifact = artifacts.find((entry) => entry.ready !== true && typeof entry.id === "string");
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

function githubExternalReadiness(githubExternal: Record<string, unknown> | null): ExternalParityParityStatusSummary["githubExternalReadiness"] {
  if (!githubExternal || typeof githubExternal.githubExternalReady !== "boolean") return undefined;
  return {
    repo: typeof githubExternal.repo === "string" ? githubExternal.repo : undefined,
    currentBranch: typeof githubExternal.currentBranch === "string" ? githubExternal.currentBranch : undefined,
    defaultBranch: typeof githubExternal.defaultBranch === "string" ? githubExternal.defaultBranch : undefined,
    blockers: stringArray(githubExternal.blockers),
    nextCommands: stringArray(githubExternal.nextCommands),
    reportPath: typeof githubExternal.reportPath === "string" ? githubExternal.reportPath : undefined,
  };
}

function firstMissingCriterionSummary(criteria: readonly Record<string, unknown>[]): ExternalParityParityStatusSummary["firstMissingCriterion"] {
  const entry = criteria.find((criterion) => criterion.achieved !== true && typeof criterion.id === "string");
  if (!entry || typeof entry.id !== "string") return undefined;
  return {
    id: entry.id,
    requestedClaim: typeof entry.requestedClaim === "string" ? entry.requestedClaim : undefined,
    blockerType: typeof entry.blockerType === "string" ? entry.blockerType : undefined,
    evidencePaths: stringArray(entry.evidencePaths),
    localEvidence: stringArray(entry.localEvidence),
    requiredExternalEvidence: stringArray(entry.requiredExternalEvidence),
    blockers: stringArray(entry.blockers),
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(createExternalParityParityStatusSummary(), null, 2));
}
