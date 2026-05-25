import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord, readJson } from "../external-parity-reporting/index.js";

export interface MarkdownUncheckedSummary {
  readonly total: number;
  readonly files: readonly {
    readonly path: string;
    readonly unchecked: number;
    readonly lines: readonly string[];
  }[];
}

export interface V4LocalPortStatusSummary {
  readonly ok: boolean;
  readonly localDocsComplete: boolean;
  readonly oldCodebasePortPlanComplete: boolean;
  readonly docsV3: MarkdownUncheckedSummary;
  readonly docsV4: MarkdownUncheckedSummary;
  readonly oldCodebasePortPlan: MarkdownUncheckedSummary;
  readonly achievedCriteria: number;
  readonly totalCriteria: number;
  readonly achievedCriteriaIds: readonly string[];
  readonly missingCriteriaIds: readonly string[];
  readonly productionReady: boolean;
  readonly externalEvidenceReady: boolean;
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
  readonly claimBoundary: string;
  readonly evidencePaths: {
    readonly oldCodebasePortPlan: "docs/project/v4-old-codebase-port-plan.md";
    readonly completionAudit: "tests/reports/external-parity-completion-audit.json";
    readonly externalEvidence: "tests/reports/external-parity-external-evidence-readiness.json";
    readonly completionRunbook: "tests/reports/external-parity-completion-audit-runbook.md";
    readonly externalEvidenceRunbook: "tests/reports/external-parity-external-evidence-missing-artifacts.md";
  };
  readonly commands: {
    readonly localPortStatus: "pnpm status:v4-local-port";
    readonly parityStatus: "pnpm status:v4-parity";
    readonly localPreflight: "pnpm preflight:v4-parity";
    readonly postExternalEvidencePreflight: "pnpm preflight:v4-parity:after-external-evidence";
    readonly reportRefresh: "pnpm refresh:v4-readiness-reports";
    readonly externalEvidencePreflight: "pnpm preflight:v4-external-evidence";
  };
}

export function createV4LocalPortStatusSummary(root = process.cwd()): V4LocalPortStatusSummary {
  const docsV3 = scanMarkdownUnchecked(root, "docs/project", "v3-");
  const docsV4 = scanMarkdownUnchecked(root, "docs/project", "v4-");
  const oldCodebasePortPlan = scanMarkdownUnchecked(root, "docs/project/v4-old-codebase-port-plan.md");
  const completion = readJson(root, "tests/reports/external-parity-completion-audit.json");
  const externalEvidence = readJson(root, "tests/reports/external-parity-external-evidence-readiness.json");
  const githubExternal = readJson(root, "tests/reports/external-parity-github-external-readiness.json");
  const production = readJson(root, "tests/reports/external-parity-production-readiness.json");
  const criteria = Array.isArray(completion?.criteria) ? completion.criteria.filter(isRecord) : [];
  const achievedCriteriaIds = criteria
    .filter((entry) => entry.achieved === true && typeof entry.id === "string")
    .map((entry) => String(entry.id));
  const missingCriteriaIds = criteria
    .filter((entry) => entry.achieved !== true && typeof entry.id === "string")
    .map((entry) => String(entry.id));
  const localDocsComplete = docsV3.total === 0 && docsV4.total === 0;
  const oldCodebasePortPlanComplete = oldCodebasePortPlan.total === 0;
  const productionReady = production?.productionReady === true;
  const externalEvidenceReady = externalEvidence?.externalEvidenceReady === true;
  return {
    ok: localDocsComplete && oldCodebasePortPlanComplete && completion?.ok === true,
    localDocsComplete,
    oldCodebasePortPlanComplete,
    docsV3,
    docsV4,
    oldCodebasePortPlan,
    achievedCriteria: numberOrZero(completion?.achievedCriteria),
    totalCriteria: numberOrZero(completion?.totalCriteria),
    achievedCriteriaIds,
    missingCriteriaIds,
    productionReady,
    externalEvidenceReady,
    firstMissingCapability: typeof externalEvidence?.firstMissingCapability === "string" ? externalEvidence.firstMissingCapability : undefined,
    firstBlockedExternalArea: firstBlockedExternalArea(externalEvidence),
    firstBlockedExternalArtifact: typeof externalEvidence?.firstBlockedArtifact === "string" ? externalEvidence.firstBlockedArtifact : undefined,
    firstBlockedExternalArtifactDetails: firstBlockedArtifactDetails(externalEvidence),
    githubExternalReady: typeof githubExternal?.githubExternalReady === "boolean" ? githubExternal.githubExternalReady : undefined,
    githubExternalReadiness: githubExternalReadiness(githubExternal),
    claimBoundary: claimBoundary(localDocsComplete, oldCodebasePortPlanComplete, productionReady, externalEvidenceReady, completion?.ok === true),
    evidencePaths: {
      oldCodebasePortPlan: "docs/project/v4-old-codebase-port-plan.md",
      completionAudit: "tests/reports/external-parity-completion-audit.json",
      externalEvidence: "tests/reports/external-parity-external-evidence-readiness.json",
      completionRunbook: "tests/reports/external-parity-completion-audit-runbook.md",
      externalEvidenceRunbook: "tests/reports/external-parity-external-evidence-missing-artifacts.md",
    },
    commands: {
      localPortStatus: "pnpm status:v4-local-port",
      parityStatus: "pnpm status:v4-parity",
      localPreflight: "pnpm preflight:v4-parity",
      postExternalEvidencePreflight: "pnpm preflight:v4-parity:after-external-evidence",
      reportRefresh: "pnpm refresh:v4-readiness-reports",
      externalEvidencePreflight: "pnpm preflight:v4-external-evidence",
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

function firstBlockedArtifactDetails(externalEvidence: Record<string, unknown> | null): V4LocalPortStatusSummary["firstBlockedExternalArtifactDetails"] {
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

function githubExternalReadiness(githubExternal: Record<string, unknown> | null): V4LocalPortStatusSummary["githubExternalReadiness"] {
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

function scanMarkdownUnchecked(root: string, relativePath: string, filePrefix?: string): MarkdownUncheckedSummary {
  const fullPath = join(root, relativePath);
  const paths = existsSync(fullPath)
    ? readdirOrSingleFile(root, relativePath)
      .filter((path) => !filePrefix || path.split("/").at(-1)?.startsWith(filePrefix))
    : [];
  const files = paths.flatMap((path) => {
    const lines = readFileSync(join(root, path), "utf8")
      .split(/\r?\n/)
      .map((line, index) => ({ line, index: index + 1 }))
      .filter(({ line }) => /^- \[ \]/.test(line))
      .map(({ line, index }) => `${index}: ${line}`);
    return lines.length > 0 ? [{ path, unchecked: lines.length, lines }] : [];
  });
  return {
    total: files.reduce((sum, file) => sum + file.unchecked, 0),
    files,
  };
}

function readdirOrSingleFile(root: string, relativePath: string): string[] {
  if (relativePath.endsWith(".md")) return [relativePath];
  return readdirSync(join(root, relativePath), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `${relativePath}/${entry.name}`)
    .sort();
}

function claimBoundary(
  localDocsComplete: boolean,
  oldCodebasePortPlanComplete: boolean,
  productionReady: boolean,
  externalEvidenceReady: boolean,
  completionOk: boolean
): string {
  if (completionOk) {
    return "All local port, external evidence, production readiness, and parity completion gates are currently satisfied by generated reports.";
  }
  if (localDocsComplete && oldCodebasePortPlanComplete && (!productionReady || !externalEvidenceReady)) {
    return "Local docs and old-codebase port plan rows are complete, but broad parity remains blocked by external evidence or production deployment gates.";
  }
  return "Local source documentation or old-codebase port rows still contain unchecked work; broad parity claims remain blocked.";
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(createV4LocalPortStatusSummary(), null, 2));
}
