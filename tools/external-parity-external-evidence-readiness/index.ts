import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../external-parity-reporting/index.js";
import { validatePublicDemoDeploymentSmokeEvidence } from "../external-parity-production-readiness/index.js";

export interface V4ExternalEvidenceReadinessReport {
  readonly ok: boolean;
  readonly sourceFileHashes: readonly { readonly path: string; readonly sha256: string }[];
  readonly auditComplete: true;
  readonly externalEvidenceReady: boolean;
  readonly localPreflight: ExternalEvidenceLocalPreflight;
  readonly canRunExternalEvidenceHere: boolean;
  readonly firstMissingCapability?: string;
  readonly totalArtifacts: number;
  readonly readyArtifacts: number;
  readonly blockedArtifacts: number;
  readonly firstBlockedArtifact?: string;
  readonly summary: {
    readonly totalAreas: number;
    readonly readyAreas: number;
    readonly blockedAreas: number;
    readonly firstBlockedArea?: string;
    readonly totalArtifacts: number;
    readonly readyArtifacts: number;
    readonly blockedArtifacts: number;
    readonly firstBlockedArtifact?: string;
  };
  readonly areas: readonly ExternalEvidenceArea[];
  readonly artifactChecklist: readonly ExternalEvidenceArtifact[];
  readonly missingArtifactRunbookPath: "tests/reports/external-parity-external-evidence-missing-artifacts.md";
  readonly nextActions: readonly ExternalEvidenceNextAction[];
  readonly requiredCommands: readonly string[];
  readonly violations: readonly string[];
}

interface ExternalEvidenceArea {
  readonly id: string;
  readonly ready: boolean;
  readonly evidencePaths: readonly string[];
  readonly localEvidence: readonly string[];
  readonly requiredExternalEvidence: readonly string[];
  readonly blockers: readonly string[];
}

interface ExternalEvidenceNextAction {
  readonly areaId: string;
  readonly evidencePaths: readonly string[];
  readonly localEvidence: readonly string[];
  readonly requiredExternalEvidence: readonly string[];
  readonly commands: readonly string[];
  readonly blockers: readonly string[];
}

interface ExternalEvidenceArtifact {
  readonly areaId: string;
  readonly id: string;
  readonly kind: "ci-workflow" | "editor-cli-smoke" | "render-workflow-report" | "asset-import-workflow-report" | "external-scene-baseline" | "public-deployment-check" | "final-audit-report";
  readonly ready: boolean;
  readonly path?: string;
  readonly expectedScreenshotPath?: string;
  readonly expectedRunnerEvidencePath?: string;
  readonly descriptorPath?: string;
  readonly runbookPath?: string;
  readonly publicPath?: string;
  readonly expectedSha256?: string;
  readonly minBytes?: number;
  readonly contentMarkers?: readonly string[];
  readonly minimumEvidence?: Readonly<Record<string, number | string | boolean>>;
  readonly command?: string;
  readonly validationCommands?: readonly string[];
  readonly localEvidence: readonly string[];
  readonly requiredExternalEvidence: readonly string[];
  readonly blockers: readonly string[];
}

interface ExternalEvidenceLocalPreflight {
  readonly unity: ExternalEditorPreflight;
  readonly unreal: ExternalEditorPreflight;
  readonly publicDeployment: {
    readonly envName: "G3D_PUBLIC_DEMO_URL";
    readonly envSet: boolean;
    readonly value?: string;
    readonly durableHttpsCandidate: boolean;
    readonly command: "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment";
    readonly blockers: readonly string[];
  };
  readonly canRunExternalEvidenceHere: boolean;
  readonly firstMissingCapability?: string;
}

interface ExternalEditorPreflight {
  readonly engine: "unity" | "unreal";
  readonly envName: "G3D_UNITY_EDITOR" | "G3D_UNREAL_EDITOR";
  readonly searchRootsEnvName: "G3D_UNITY_SEARCH_ROOTS" | "G3D_UNREAL_SEARCH_ROOTS";
  readonly envSet: boolean;
  readonly envPath?: string;
  readonly envExecutable?: string;
  readonly autoDiscoveredExecutable?: string;
  readonly searchRoots: readonly string[];
  readonly executableAvailable: boolean;
  readonly cliSmokeOptIn: boolean;
  readonly smokeReportPath: string;
  readonly smokeCommand: string;
  readonly blockers: readonly string[];
}

interface ExternalEvidenceLocalSummaries {
  readonly editor: readonly string[];
  readonly assetImport: readonly string[];
  readonly runtime: readonly string[];
  readonly rendering: readonly string[];
  readonly deployment: readonly string[];
}

const reportPath = "tests/reports/external-parity-external-evidence-readiness.json";
const missingArtifactRunbookPath = "tests/reports/external-parity-external-evidence-missing-artifacts.md" as const;
const sourceFiles = [
  ".github/workflows/external-parity-external-engine-baselines.yml",
  ".github/workflows/v4-public-demo-deploy.yml",
  "package.json",
  "tools/external-parity-external-evidence-readiness/index.ts",
  "tools/external-parity-external-host-doctor/index.ts",
  "tools/external-parity-external-host-runner/index.ts",
  "tools/external-parity-github-external-readiness/index.ts",
  "tools/external-parity-external-evidence-handoff/index.ts",
  "docs/project/v4-external-evidence-execution-prompt.md",
  "fixtures/external-engine-baselines/v4/RUNBOOK.md",
  "fixtures/external-engine-baselines/v4/external-baseline-command-plan.json",
  "tests/reports/external-parity-external-engine-baselines.json",
  "tests/reports/external-parity-github-external-readiness.json",
  "tests/reports/external-parity-unity-unreal-parity.json",
  "tests/reports/external-parity-product-visual-parity.json",
  "tests/reports/external-parity-production-readiness.json",
  "tests/reports/public-demo-deployment-smoke.json",
  "tests/reports/public-demo-deployment-runbook.md",
  "tests/reports/external-demo-static-export.json",
  "tests/reports/external-parity-pbr-gltf-readiness.json",
  "tools/public-demo-deployment-artifacts/index.ts",
] as const;

export function createV4ExternalEvidenceReadinessReport(root = process.cwd()): V4ExternalEvidenceReadinessReport {
  const baselineKit = readJson(root, "tests/reports/external-parity-external-engine-baselines.json");
  const unityUnreal = readJson(root, "tests/reports/external-parity-unity-unreal-parity.json");
  const productVisual = readJson(root, "tests/reports/external-parity-product-visual-parity.json");
  const production = readJson(root, "tests/reports/external-parity-production-readiness.json");
  const pbrGltf = readJson(root, "tests/reports/external-parity-pbr-gltf-readiness.json");
  const publicDeployment = readJson(root, "tests/reports/public-demo-deployment-smoke.json");
  const staticExport = readJson(root, "tests/reports/external-demo-static-export.json");
  const githubExternal = readJson(root, "tests/reports/external-parity-github-external-readiness.json");
  const commandPlan = readJson(root, "fixtures/external-engine-baselines/v4/external-baseline-command-plan.json");
  const localPreflight = externalEvidenceLocalPreflight();

  const localEvidence = externalEvidenceLocalSummaries(unityUnreal);
  const areas = [
    externalBaselineKitArea(baselineKit),
    externalBaselineCiWorkflowArea(root),
    publicDeploymentCiWorkflowArea(root),
    githubRemoteExternalReadinessArea(githubExternal),
    unityUnrealEditorArea(root, "unity", baselineKit, localEvidence),
    unityUnrealEditorArea(root, "unreal", baselineKit, localEvidence),
    renderedProductVisualArea(productVisual, localEvidence),
    publicDeploymentArea(root, publicDeployment, production, staticExport, localEvidence),
    blenderSameCorpusArea(pbrGltf),
    fullPbrExternalReferenceArea(pbrGltf, localEvidence),
    finalParityAuditArea(unityUnreal, production, pbrGltf, localEvidence),
  ] as const;
  const artifactChecklist = [
    externalBaselineCiWorkflowArtifact(root),
    publicDeploymentCiWorkflowArtifact(root),
    ...unityUnrealArtifactChecklist(root, "unity", baselineKit, commandPlan),
    ...unityUnrealArtifactChecklist(root, "unreal", baselineKit, commandPlan),
    ...publicDeploymentArtifactChecklist(root, publicDeployment, staticExport),
    ...finalAuditArtifactChecklist(unityUnreal, production, pbrGltf),
  ] as const;
  const violations = [
    ...areas.flatMap((area) => area.blockers.map((blocker) => `${area.id}: ${blocker}`)),
    ...artifactChecklist.flatMap((artifact) => artifact.blockers.map((blocker) => `${artifact.areaId}/${artifact.id}: ${blocker}`)),
  ];
  const externalEvidenceReady = areas.every((area) => area.ready) && artifactChecklist.every((artifact) => artifact.ready);
  const requiredCommands = [
    "pnpm status:v4-local-port",
    "pnpm status:v4-parity",
    "pnpm prepare:external-parity-external-evidence-handoff",
    "pnpm doctor:v4-external-host",
    "pnpm run:v4-external-host-evidence",
    "pnpm run:v4-external-host-evidence:execute",
    "pnpm audit:external-parity-github-external-readiness",
    "pnpm preflight:v4-parity:after-external-evidence",
    "pnpm preflight:v4-parity",
    "pnpm verify:external-parity-external-engine-baselines",
    "pnpm dry-run:v4-unity-baselines",
    "pnpm dry-run:v4-unreal-baselines",
    "pnpm write:v4-external-baseline-reports",
    "pnpm verify:v4-external-baseline-reports",
    "pnpm preflight:external-parity-production-readiness",
    "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
    "pnpm audit:external-parity-unity-unreal-parity",
    "pnpm audit:external-parity-production-readiness",
    "pnpm audit:external-parity-pbr-gltf-readiness",
    "pnpm audit:v4-broad-parity",
    "pnpm audit:v4-completion",
    "pnpm verify:external-parity-report-freshness",
    "pnpm verify:v4",
  ] as const;
  const nextActions = areas
    .filter((area) => !area.ready)
    .map((area) => ({
      areaId: area.id,
      evidencePaths: area.evidencePaths,
      localEvidence: area.localEvidence,
      requiredExternalEvidence: area.requiredExternalEvidence,
      commands: commandsForArea(area.id),
      blockers: area.blockers,
    }));
  const readyArtifacts = artifactChecklist.filter((artifact) => artifact.ready).length;
  const blockedArtifacts = artifactChecklist.filter((artifact) => !artifact.ready).length;
  const firstBlockedArtifact = artifactChecklist.find((artifact) => !artifact.ready)?.id;
  const totalArtifacts = artifactChecklist.length;
  const report = {
    ...baseReport(root, {
      ok: true,
      command: "pnpm audit:external-parity-external-evidence-readiness",
      runIdPrefix: "external-parity-external-evidence-readiness",
      sourceFiles,
      violations,
      blockedClaims: [
        "Unity/Unreal replacement language",
        "production-ready language",
        "complete PBR parity language",
        "broad better-than-Three.js language",
        "broad better-than-Babylon.js language",
      ],
    }),
    auditComplete: true as const,
    externalEvidenceReady,
    localPreflight,
    canRunExternalEvidenceHere: localPreflight.canRunExternalEvidenceHere,
    firstMissingCapability: localPreflight.firstMissingCapability,
    totalArtifacts,
    readyArtifacts,
    blockedArtifacts,
    firstBlockedArtifact,
    summary: {
      totalAreas: areas.length,
      readyAreas: areas.filter((area) => area.ready).length,
      blockedAreas: areas.filter((area) => !area.ready).length,
      firstBlockedArea: areas.find((area) => !area.ready)?.id,
      totalArtifacts,
      readyArtifacts,
      blockedArtifacts,
      firstBlockedArtifact,
    },
    areas,
    artifactChecklist,
    missingArtifactRunbookPath,
    nextActions,
    requiredCommands,
    violations,
  };
  writeJson(root, reportPath, report);
  writeFileSync(join(root, missingArtifactRunbookPath), renderMissingArtifactRunbook(report));
  return report;
}

function renderMissingArtifactRunbook(report: V4ExternalEvidenceReadinessReport): string {
  const blockedArtifacts = report.artifactChecklist.filter((artifact) => !artifact.ready);
  const readyArtifacts = report.artifactChecklist.filter((artifact) => artifact.ready);
  const lines = [
    "# V4 External Evidence Missing Artifacts",
    "",
    "Generated by `pnpm audit:external-parity-external-evidence-readiness` from `tests/reports/external-parity-external-evidence-readiness.json`.",
    "",
    "Do not fabricate these files, loosen thresholds, reuse Galileo screenshots as Unity/Unreal screenshots, or mark parity complete until the validators accept real external evidence.",
    "",
    "## Summary",
    "",
    `- External evidence ready: ${report.externalEvidenceReady ? "yes" : "no"}`,
    `- Ready areas: ${report.summary.readyAreas} / ${report.summary.totalAreas}`,
    `- Blocked areas: ${report.summary.blockedAreas}`,
    `- Ready artifacts: ${readyArtifacts.length} / ${report.artifactChecklist.length}`,
    `- Blocked artifacts: ${blockedArtifacts.length}`,
    "",
    "## Local Preflight",
    "",
    `- Can run external evidence on this host now: ${report.localPreflight.canRunExternalEvidenceHere ? "yes" : "no"}`,
    ...(report.localPreflight.firstMissingCapability ? [`- First missing capability: \`${report.localPreflight.firstMissingCapability}\``] : []),
    ...renderEditorPreflightMarkdown(report.localPreflight.unity),
    ...renderEditorPreflightMarkdown(report.localPreflight.unreal),
    `- Public deployment URL env: ${report.localPreflight.publicDeployment.envSet ? "`G3D_PUBLIC_DEMO_URL` is set" : "`G3D_PUBLIC_DEMO_URL` is not set"}`,
    `- Public deployment durable HTTPS candidate: ${report.localPreflight.publicDeployment.durableHttpsCandidate ? "yes" : "no"}`,
    `- Public deployment command: \`${report.localPreflight.publicDeployment.command}\``,
    ...(report.localPreflight.publicDeployment.blockers.length > 0 ? [
      "- Public deployment preflight blockers:",
      ...report.localPreflight.publicDeployment.blockers.map((blocker) => `  - ${blocker}`),
    ] : []),
    "",
    "## Local Refresh Commands",
    "",
    "- `pnpm status:v4-local-port`: prints a read-only JSON summary that separates completed local docs and old-codebase port rows from blocked external parity evidence.",
    "- `pnpm status:v4-parity`: prints a quick read-only JSON summary of achieved criteria, missing criteria, first blocked external artifact, and the preflight/refresh commands to run next.",
    "- `pnpm prepare:external-parity-external-evidence-handoff`: inventories the current external baseline kit, Galileo references, static export, blocked artifacts, and command plan for a Unity/Unreal/public-deployment handoff.",
    "- `pnpm audit:external-parity-github-external-readiness`: checks remote branch, default-branch workflow discoverability, GitHub Pages, self-hosted runners, and required Actions variables/secrets without pushing or dispatching workflows.",
    "- `pnpm preflight:v4-parity`: rebuilds local static demo evidence, enumerates Unity/Unreal dry-run capture commands, refreshes dependent readiness reports, reruns completion, and verifies report freshness. This is a local status command, not external evidence.",
    "- `pnpm preflight:v4-parity:after-external-evidence`: reruns the final parity preflight after real external artifacts are present without overwriting an execute-mode external-host runner report with a dry run.",
    "- `pnpm refresh:v4-readiness-reports`: refreshes dependent report JSON and report freshness after source/report edits when local export and external dry-run outputs are already current.",
    "",
    "## Next Actions",
    "",
    ...report.nextActions.flatMap((action) => renderNextActionMarkdown(action)),
    ...(report.nextActions.length === 0 ? ["No blocked areas remain.", ""] : []),
    "## Blocked Artifacts",
    "",
    ...blockedArtifacts.flatMap((artifact) => renderArtifactMarkdown(artifact)),
    ...(readyArtifacts.length > 0 ? [
      "## Ready Artifacts",
      "",
      ...readyArtifacts.flatMap((artifact) => renderArtifactMarkdown(artifact)),
    ] : []),
    "## Required Final Commands",
    "",
    ...report.requiredCommands.map((command) => `- \`${command}\``),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderNextActionMarkdown(action: ExternalEvidenceNextAction): readonly string[] {
  return [
    `### ${action.areaId}`,
    "",
    "Evidence paths:",
    ...action.evidencePaths.map((path) => `- \`${path}\``),
    ...(action.localEvidence.length > 0 ? [
      "",
      "Local evidence already present:",
      ...action.localEvidence.map((evidence) => `- ${evidence}`),
    ] : []),
    ...(action.requiredExternalEvidence.length > 0 ? [
      "",
      "External evidence still required:",
      ...action.requiredExternalEvidence.map((evidence) => `- ${evidence}`),
    ] : []),
    "",
    "Commands:",
    ...action.commands.map((command) => `- \`${command}\``),
    ...(action.blockers.length > 0 ? [
      "",
      "Blockers:",
      ...action.blockers.map((blocker) => `- ${blocker}`),
    ] : []),
    "",
  ];
}

function renderEditorPreflightMarkdown(preflight: ExternalEditorPreflight): readonly string[] {
  const label = preflight.engine === "unity" ? "Unity" : "Unreal";
  return [
    `- ${label} env: ${preflight.envSet ? `\`${preflight.envName}\` is set` : `\`${preflight.envName}\` is not set`}`,
    ...(preflight.envPath ? [`- ${label} env path: \`${preflight.envPath}\``] : []),
    `- ${label} search roots env: \`${preflight.searchRootsEnvName}\``,
    `- ${label} search roots: ${preflight.searchRoots.map((root) => `\`${root}\``).join(", ")}`,
    `- ${label} executable available: ${preflight.executableAvailable ? "yes" : "no"}`,
    ...(preflight.envExecutable ? [`- ${label} env executable: \`${preflight.envExecutable}\``] : []),
    ...(preflight.autoDiscoveredExecutable ? [`- ${label} auto-discovered executable: \`${preflight.autoDiscoveredExecutable}\``] : []),
    `- ${label} CLI smoke opt-in: ${preflight.cliSmokeOptIn ? "yes" : "no"}`,
    `- ${label} smoke command: \`${preflight.smokeCommand}\``,
    ...(preflight.blockers.length > 0 ? [
      `- ${label} preflight blockers:`,
      ...preflight.blockers.map((blocker) => `  - ${blocker}`),
    ] : []),
  ];
}

function renderArtifactMarkdown(artifact: ExternalEvidenceArtifact): readonly string[] {
  const details = [
    `- ${artifact.ready ? "[x]" : "[ ]"} \`${artifact.id}\` (${artifact.kind})`,
    `  - Area: \`${artifact.areaId}\``,
    ...(artifact.path ? [`  - Target path: \`${artifact.path}\``] : []),
    ...(artifact.expectedScreenshotPath ? [`  - Expected screenshot: \`${artifact.expectedScreenshotPath}\``] : []),
    ...(artifact.expectedRunnerEvidencePath ? [`  - Expected runner evidence: \`${artifact.expectedRunnerEvidencePath}\``] : []),
    ...(artifact.descriptorPath ? [`  - Descriptor: \`${artifact.descriptorPath}\``] : []),
    ...(artifact.runbookPath ? [`  - Runbook: \`${artifact.runbookPath}\``] : []),
    ...(artifact.publicPath ? [`  - Public path: \`${artifact.publicPath}\``] : []),
    ...(artifact.expectedSha256 ? [`  - Expected SHA-256: \`${artifact.expectedSha256}\``] : []),
    ...(artifact.minBytes !== undefined ? [`  - Minimum bytes: ${artifact.minBytes}`] : []),
    ...(artifact.contentMarkers && artifact.contentMarkers.length > 0 ? [
      "  - Required content markers:",
      ...artifact.contentMarkers.map((marker) => `    - \`${marker}\``),
    ] : []),
    ...(artifact.minimumEvidence ? [
      "  - Minimum evidence:",
      ...Object.entries(artifact.minimumEvidence).map(([key, value]) => `    - \`${key}\`: ${String(value)}`),
    ] : []),
    ...(artifact.command ? [`  - Command: \`${artifact.command}\``] : []),
    ...(artifact.validationCommands && artifact.validationCommands.length > 0 ? [
      "  - Validation commands:",
      ...artifact.validationCommands.map((command) => `    - \`${command}\``),
    ] : []),
    ...(artifact.localEvidence.length > 0 ? [
      "  - Local evidence already present:",
      ...artifact.localEvidence.map((evidence) => `    - ${evidence}`),
    ] : []),
    ...(artifact.requiredExternalEvidence.length > 0 ? [
      "  - External evidence still required:",
      ...artifact.requiredExternalEvidence.map((evidence) => `    - ${evidence}`),
    ] : []),
    ...(artifact.blockers.length > 0 ? [
      "  - Blockers:",
      ...artifact.blockers.map((blocker) => `    - ${blocker}`),
    ] : []),
    "",
  ];
  return details;
}

function unityUnrealArtifactChecklist(
  root: string,
  engine: "unity" | "unreal",
  baselineKit: Record<string, unknown> | null,
  commandPlan: Record<string, unknown> | null
): readonly ExternalEvidenceArtifact[] {
  const smokeReportPath = `tests/reports/external-parity-${engine}-editor-cli-smoke.json`;
  const renderWorkflowReportPath = `tests/reports/external-parity-${engine}-baseline-render.json`;
  const assetImportWorkflowReportPath = `tests/reports/external-parity-${engine}-asset-import-workflow.json`;
  const captures = Array.isArray(commandPlan?.captures) ? commandPlan.captures.filter(isRecord) : [];
  const renderWorkflowReports = Array.isArray(commandPlan?.renderWorkflowBaselineReports) ? commandPlan.renderWorkflowBaselineReports.filter(isRecord) : [];
  const renderWorkflowPlan = renderWorkflowReports.find((entry) => entry.engine === engine);
  const assetImportWorkflowReports = Array.isArray(commandPlan?.assetImportWorkflowReports) ? commandPlan.assetImportWorkflowReports.filter(isRecord) : [];
  const assetImportWorkflowPlan = assetImportWorkflowReports.find((entry) => entry.engine === engine);
  const sceneReports = targetReportPaths(baselineKit, engine);
  const sceneArtifacts = sceneReports.map((path): ExternalEvidenceArtifact => {
    const capture = captures.find((entry) => entry.engine === engine && entry.targetReportPath === path);
    const ready = externalSceneBaselineReportReady(root, path, engine);
    return {
      areaId: `${engine}-external-baselines`,
      id: `${engine}:${typeof capture?.baselineKind === "string" ? capture.baselineKind : path}`,
      kind: "external-scene-baseline",
      ready,
      path,
      expectedScreenshotPath: typeof capture?.expectedScreenshotPath === "string" ? capture.expectedScreenshotPath : undefined,
      expectedRunnerEvidencePath: typeof capture?.expectedRunnerEvidencePath === "string" ? capture.expectedRunnerEvidencePath : undefined,
      descriptorPath: typeof capture?.descriptorPath === "string" ? capture.descriptorPath : undefined,
      minimumEvidence: primitiveRecord(capture?.minimumEvidence),
      command: typeof capture?.reportCommand === "string" ? capture.reportCommand : `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs ${engine} <baseline-kind> <screenshot-path> ${path}`,
      validationCommands: stringArray(capture?.validationCommands),
      localEvidence: [
        `${engine} ${typeof capture?.baselineKind === "string" ? capture.baselineKind : "scene"} descriptor, Galileo reference, report writer command, and validation thresholds are prepared locally.`,
        "The current checkout can validate report shape, screenshot pixels, descriptor hashes, and runner-evidence sidecars, but it cannot create real Unity/Unreal output without that editor.",
      ],
      requiredExternalEvidence: [
        `Run the ${engine} capture on a real ${engine === "unity" ? "Unity" : "Unreal"} editor host.`,
        "Attach the real external screenshot and runner-evidence sidecar, then generate the baseline report with the prepared writer command.",
      ],
      blockers: ready ? [] : [`${path} is missing, does not contain ok=true for engine="${engine}", or lacks validated runner evidence sidecar`],
    };
  });
  const smokeReady = baselineReportReady(root, smokeReportPath, engine);
  const renderWorkflowReady = baselineReportReady(root, renderWorkflowReportPath, engine);
  const assetImportWorkflowReady = baselineReportReady(root, assetImportWorkflowReportPath, engine);
  return [
    {
      areaId: `${engine}-external-baselines`,
      id: `${engine}:editor-cli-smoke`,
      kind: "editor-cli-smoke",
      ready: smokeReady,
      path: smokeReportPath,
      command: typeof renderWorkflowPlan?.cliSmokeCommand === "string"
        ? renderWorkflowPlan.cliSmokeCommand
        : `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs ${engine} ${smokeReportPath}`,
      localEvidence: [
        `${engine} CLI smoke command and target report path are prepared locally.`,
      ],
      requiredExternalEvidence: [
        `Run the ${engine} editor CLI smoke against a real ${engine === "unity" ? "Unity" : "Unreal"} editor executable and write ${smokeReportPath} with ok=true.`,
      ],
      blockers: smokeReady ? [] : [`${smokeReportPath} is missing or does not contain ok=true for engine="${engine}"`],
    },
    ...sceneArtifacts,
    {
      areaId: `${engine}-external-baselines`,
      id: `${engine}:render-workflow`,
      kind: "render-workflow-report",
      ready: renderWorkflowReady,
      path: renderWorkflowReportPath,
      command: typeof renderWorkflowPlan?.reportCommand === "string"
        ? renderWorkflowPlan.reportCommand
        : `node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs ${engine} ${renderWorkflowReportPath}`,
      localEvidence: [
        `${engine} render workflow report command and baseline kit slots are prepared locally.`,
      ],
      requiredExternalEvidence: [
        `Open/build/render the current baseline kit in a real ${engine === "unity" ? "Unity" : "Unreal"} editor workflow and write ${renderWorkflowReportPath} with ok=true.`,
      ],
      blockers: renderWorkflowReady ? [] : [`${renderWorkflowReportPath} is missing or does not contain ok=true for engine="${engine}"`],
    },
    {
      areaId: `${engine}-external-baselines`,
      id: `${engine}:asset-import-workflow`,
      kind: "asset-import-workflow-report",
      ready: assetImportWorkflowReady,
      path: assetImportWorkflowReportPath,
      expectedRunnerEvidencePath: typeof assetImportWorkflowPlan?.runnerEvidencePath === "string" ? assetImportWorkflowPlan.runnerEvidencePath : `tests/reports/external-parity-${engine}-asset-import-workflow.evidence.json`,
      command: typeof assetImportWorkflowPlan?.reportCommand === "string"
        ? assetImportWorkflowPlan.reportCommand
        : `node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs ${engine} tests/reports/external-parity-${engine}-asset-import-workflow.evidence.json ${assetImportWorkflowReportPath}`,
      validationCommands: [
        "pnpm audit:external-parity-external-evidence-readiness",
        "pnpm audit:external-parity-unity-unreal-parity",
      ],
      localEvidence: [
        `${engine} asset-import workflow report schema, template, writer command, and target report path are prepared locally.`,
        "The current checkout can validate a real external editor import sidecar while allowing bounded native OBJ geometry import and keeping native FBX/USD/USDZ/DAE support blocked.",
      ],
      requiredExternalEvidence: [
        `Run the ${engine} asset-import workflow in a real ${engine === "unity" ? "Unity" : "Unreal"} editor project and write the runner-evidence sidecar.`,
        `Generate ${assetImportWorkflowReportPath} from that sidecar with ok=true.`,
      ],
      blockers: assetImportWorkflowReady ? [] : [`${assetImportWorkflowReportPath} is missing or does not contain ok=true for engine="${engine}"`],
    },
  ];
}

function externalBaselineCiWorkflowArea(root: string): ExternalEvidenceArea {
  const validation = externalBaselineWorkflowValidation(root);
  return {
    id: "external-baseline-ci-workflow",
    ready: validation.ready,
    evidencePaths: [validation.path],
    localEvidence: [
      "Self-hosted Unity/Unreal GitHub Actions workflow is present and marker-validated locally.",
    ],
    requiredExternalEvidence: [
      "A real self-hosted runner execution must still upload Unity and Unreal baseline artifacts.",
    ],
    blockers: validation.blockers,
  };
}

function externalBaselineCiWorkflowArtifact(root: string): ExternalEvidenceArtifact {
  const validation = externalBaselineWorkflowValidation(root);
  return {
    areaId: "external-baseline-ci-workflow",
    id: "github-actions:self-hosted-unity-unreal-baselines",
    kind: "ci-workflow",
    ready: validation.ready,
    path: validation.path,
    command: "gh workflow run external-parity-external-engine-baselines.yml -f engine=all",
    validationCommands: ["pnpm audit:external-parity-external-evidence-readiness", "pnpm audit:v4-completion"],
    localEvidence: [
      "The self-hosted Unity/Unreal workflow file exists and contains the required smoke, capture, ingest, and final-audit steps.",
    ],
    requiredExternalEvidence: [
      "Run the workflow on real self-hosted runners labeled unity and unreal and download/ingest the uploaded evidence artifacts.",
    ],
    blockers: validation.blockers,
  };
}

function publicDeploymentCiWorkflowArea(root: string): ExternalEvidenceArea {
  const validation = publicDeploymentWorkflowValidation(root);
  return {
    id: "public-deployment-ci-workflow",
    ready: validation.ready,
    evidencePaths: [validation.path],
    localEvidence: [
      "GitHub Pages deployment workflow is present and marker-validated locally.",
    ],
    requiredExternalEvidence: [
      "A real workflow run must deploy the static demo and publish public-deployment smoke reports.",
    ],
    blockers: validation.blockers,
  };
}

function publicDeploymentCiWorkflowArtifact(root: string): ExternalEvidenceArtifact {
  const validation = publicDeploymentWorkflowValidation(root);
  return {
    areaId: "public-deployment-ci-workflow",
    id: "github-actions:public-demo-deployment",
    kind: "ci-workflow",
    ready: validation.ready,
    path: validation.path,
    command: "gh workflow run v4-public-demo-deploy.yml",
    validationCommands: ["pnpm audit:external-parity-production-readiness", "pnpm audit:external-parity-external-evidence-readiness"],
    localEvidence: [
      "The GitHub Pages workflow file exists and contains static export, deployment, public smoke, production audit, external evidence audit, completion audit, and report upload steps.",
    ],
    requiredExternalEvidence: [
      "Run the workflow against the repository Pages environment and ingest the public deployment reports it uploads.",
    ],
    blockers: validation.blockers,
  };
}

function githubRemoteExternalReadinessArea(githubExternal: Record<string, unknown> | null): ExternalEvidenceArea {
  const ready = githubExternal?.githubExternalReady === true;
  const blockers = ready
    ? []
    : stringArray(githubExternal?.blockers);
  return {
    id: "github-remote-external-readiness",
    ready,
    evidencePaths: ["tests/reports/external-parity-github-external-readiness.json"],
    localEvidence: [
      "The read-only GitHub readiness audit checks whether the branch, default-branch workflows, Pages, self-hosted runners, and required Actions variables/secrets are actually configured.",
      ...(githubExternal ? [
        `GitHub readiness report currently targets repo=${String(githubExternal.repo ?? "unknown")}, currentBranch=${String(githubExternal.currentBranch ?? "unknown")}, defaultBranch=${String(githubExternal.defaultBranch ?? "unknown")}.`,
      ] : []),
    ],
    requiredExternalEvidence: [
      "The V4 workflow files must be landed on the repository default branch.",
      "GitHub Pages must be enabled for the repository.",
      "Self-hosted GitHub Actions runners labeled unity and unreal must be registered.",
      "G3D_UNITY_EDITOR and G3D_UNREAL_EDITOR must be configured as Actions variables or secrets; the checked-in workflow sets G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true internally.",
    ],
    blockers: githubExternal
      ? blockers
      : ["tests/reports/external-parity-github-external-readiness.json is missing; run pnpm audit:external-parity-github-external-readiness."],
  };
}

function externalBaselineWorkflowValidation(root: string): { readonly path: ".github/workflows/external-parity-external-engine-baselines.yml"; readonly ready: boolean; readonly blockers: readonly string[] } {
  const path = ".github/workflows/external-parity-external-engine-baselines.yml" as const;
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    return { path, ready: false, blockers: [`${path} is missing; external Unity/Unreal captures have no manual self-hosted CI entry point`] };
  }
  const workflow = readFileSync(fullPath, "utf8");
  const requiredFragments = [
    ["manual workflow_dispatch trigger", "workflow_dispatch:"],
    ["engine choice input", "type: choice"],
    ["self-hosted Unity runner label", "runs-on: [self-hosted, unity]"],
    ["self-hosted Unreal runner label", "runs-on: [self-hosted, unreal]"],
    ["Unity editor env", "G3D_UNITY_EDITOR"],
    ["Unreal editor env", "G3D_UNREAL_EDITOR"],
    ["Unity CLI smoke", "run-editor-cli-smoke.mjs unity tests/reports/external-parity-unity-editor-cli-smoke.json"],
    ["Unreal CLI smoke", "run-editor-cli-smoke.mjs unreal tests/reports/external-parity-unreal-editor-cli-smoke.json"],
    ["Unity batch capture helper", "run-unity-baseline-captures.mjs --project"],
    ["Unreal batch capture helper", "run-unreal-baseline-captures.mjs --project"],
    ["merged final audit job", "final-audits:"],
    ["baseline evidence artifact download", "pattern: v4-*-baseline-evidence"],
    ["merged artifact restore", "merge-multiple: true"],
    ["allowlisted artifact ingestion", "ingest-external-baseline-artifacts.mjs --no-audit _v4-external-baseline-evidence"],
    ["final audit artifact upload", "v4-external-baseline-final-audits"],
    ["external evidence runbook upload", "tests/reports/external-parity-external-evidence-missing-artifacts.md"],
    ["completion runbook upload", "tests/reports/external-parity-completion-audit-runbook.md"],
    ["artifact upload", "actions/upload-artifact@v4"],
    ["Unity editor smoke report upload", "tests/reports/external-parity-unity-editor-cli-smoke.json"],
    ["Unity render workflow report upload", "tests/reports/external-parity-unity-baseline-render.json"],
    ["Unity product baseline report upload", "tests/reports/external-parity-unity-product-visual-baseline.json"],
    ["Unity PBR baseline report upload", "tests/reports/external-parity-unity-pbr-visual-baseline.json"],
    ["Unity shadow baseline report upload", "tests/reports/external-parity-unity-shadow-visual-baseline.json"],
    ["Unity HDR baseline report upload", "tests/reports/external-parity-unity-hdr-render-target-baseline.json"],
    ["Unity postprocess baseline report upload", "tests/reports/external-parity-unity-postprocess-suite-baseline.json"],
    ["Unreal editor smoke report upload", "tests/reports/external-parity-unreal-editor-cli-smoke.json"],
    ["Unreal render workflow report upload", "tests/reports/external-parity-unreal-baseline-render.json"],
    ["Unreal product baseline report upload", "tests/reports/external-parity-unreal-product-visual-baseline.json"],
    ["Unreal PBR baseline report upload", "tests/reports/external-parity-unreal-pbr-visual-baseline.json"],
    ["Unreal shadow baseline report upload", "tests/reports/external-parity-unreal-shadow-visual-baseline.json"],
    ["Unreal HDR baseline report upload", "tests/reports/external-parity-unreal-hdr-render-target-baseline.json"],
    ["Unreal postprocess baseline report upload", "tests/reports/external-parity-unreal-postprocess-suite-baseline.json"],
    ["product screenshot artifact upload", "tests/reports/external-parity-product-visual/**"],
    ["PBR screenshot artifact upload", "tests/reports/external-parity-pbr-visual/**"],
    ["shadow screenshot artifact upload", "tests/reports/external-parity-shadow-visual/**"],
    ["HDR screenshot artifact upload", "tests/reports/external-parity-hdr-render-target/**"],
    ["postprocess screenshot artifact upload", "tests/reports/external-parity-postprocess-suite/**"],
    ["product visual final audit upload", "tests/reports/external-parity-product-visual-parity.json"],
    ["PBR/glTF final audit upload", "tests/reports/external-parity-pbr-gltf-readiness.json"],
    ["Unity/Unreal final audit upload", "tests/reports/external-parity-unity-unreal-parity.json"],
    ["production final audit upload", "tests/reports/external-parity-production-readiness.json"],
    ["broad parity final audit upload", "tests/reports/external-parity-broad-parity-readiness.json"],
    ["freshness final audit upload", "tests/reports/external-parity-report-freshness.json"],
  ] as const;
  const blockers = requiredFragments.flatMap(([label, fragment]) => workflow.includes(fragment) ? [] : [`${path} is missing ${label}: ${fragment}`]);
  return { path, ready: blockers.length === 0, blockers };
}

function publicDeploymentWorkflowValidation(root: string): { readonly path: ".github/workflows/v4-public-demo-deploy.yml"; readonly ready: boolean; readonly blockers: readonly string[] } {
  const path = ".github/workflows/v4-public-demo-deploy.yml" as const;
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    return { path, ready: false, blockers: [`${path} is missing; durable public deployment validation has no GitHub Pages workflow entry point`] };
  }
  const workflow = readFileSync(fullPath, "utf8");
  const requiredFragments = [
    ["manual workflow_dispatch trigger", "workflow_dispatch:"],
    ["Pages write permission", "pages: write"],
    ["OIDC token permission", "id-token: write"],
    ["GitHub Pages environment", "name: github-pages"],
    ["static demo export build", "pnpm build:external-demos"],
    ["local static server smoke", "pnpm verify:static-demo-server-smoke"],
    ["GitHub Pages deployment", "actions/deploy-pages"],
    ["public deployment smoke", "pnpm verify:public-demo-deployment"],
    ["deployed Pages URL environment", "G3D_PUBLIC_DEMO_URL:"],
    ["production readiness audit", "pnpm audit:external-parity-production-readiness"],
    ["external evidence readiness audit", "pnpm audit:external-parity-external-evidence-readiness"],
    ["broad parity audit", "pnpm audit:v4-broad-parity"],
    ["completion audit", "pnpm audit:v4-completion"],
    ["freshness verification", "pnpm verify:external-parity-report-freshness"],
    ["public deployment smoke report upload", "tests/reports/public-demo-deployment-smoke.json"],
    ["production readiness report upload", "tests/reports/external-parity-production-readiness.json"],
    ["external evidence readiness report upload", "tests/reports/external-parity-external-evidence-readiness.json"],
    ["external evidence missing-artifacts runbook upload", "tests/reports/external-parity-external-evidence-missing-artifacts.md"],
    ["completion audit runbook upload", "tests/reports/external-parity-completion-audit-runbook.md"],
  ] as const;
  const blockers = requiredFragments.flatMap(([label, fragment]) => workflow.includes(fragment) ? [] : [`${path} is missing ${label}: ${fragment}`]);
  if (!/G3D_PUBLIC_DEMO_URL:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/u.test(workflow)) {
    blockers.push(`${path} does not validate against the GitHub Pages deployment URL.`);
  }
  return { path, ready: blockers.length === 0, blockers };
}

function publicDeploymentArtifactChecklist(
  root: string,
  publicDeployment: Record<string, unknown> | null,
  staticExport: Record<string, unknown> | null
): readonly ExternalEvidenceArtifact[] {
  const publicDeploymentManifestPath = typeof staticExport?.publicDeploymentManifestPath === "string" ? staticExport.publicDeploymentManifestPath : "";
  const publicDeploymentManifest = publicDeploymentManifestPath ? readJson(root, publicDeploymentManifestPath) : null;
  const deploymentUrl = typeof publicDeployment?.deploymentUrl === "string" ? publicDeployment.deploymentUrl : "";
  const checks = Array.isArray(publicDeployment?.checks) ? publicDeployment.checks.filter(isRecord) : [];
  const checkById = new Map(checks.map((check) => [String(check.id), check]));
  return publicDeploymentFiles(publicDeploymentManifest).map((file): ExternalEvidenceArtifact => {
    const check = checkById.get(file.id);
    const ready = check?.status === 200 &&
      Number(check.bytes ?? 0) > file.minBytes &&
      check.sha256 === file.sha256 &&
      check.matchedStaticIntegrity === true &&
      check.contentOk === true;
    return {
      areaId: "durable-public-demo-deployment",
      id: `public:${file.id}`,
      kind: "public-deployment-check",
      ready,
      path: file.localPath,
      runbookPath: "tests/reports/public-demo-deployment-runbook.md",
      publicPath: file.publicPath,
      expectedSha256: file.sha256,
      minBytes: file.minBytes,
      contentMarkers: file.contentMarkers,
      command: "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
      validationCommands: ["pnpm audit:external-parity-production-readiness", "pnpm audit:external-parity-external-evidence-readiness"],
      localEvidence: [
        `Static export manifest lists ${file.localPath} with expected SHA-256, minimum bytes, public path, and content markers.`,
      ],
      requiredExternalEvidence: [
        `Serve ${file.publicPath} from a durable public HTTPS origin and verify status, bytes, SHA-256, static integrity, and content markers.`,
      ],
      blockers: ready ? [] : [`${file.id}: public deployment check is missing or failing for ${deploymentUrl ? new URL(file.publicPath, deploymentUrl).toString() : file.publicPath}`],
    };
  });
}

function finalAuditArtifactChecklist(
  unityUnreal: Record<string, unknown> | null,
  production: Record<string, unknown> | null,
  pbrGltf: Record<string, unknown> | null
): readonly ExternalEvidenceArtifact[] {
  const audits = [
    { id: "unity-unreal-parity", path: "tests/reports/external-parity-unity-unreal-parity.json", ready: unityUnreal?.unityParity === true && unityUnreal.unrealParity === true && unityUnreal.replacement === true, command: "pnpm audit:external-parity-unity-unreal-parity" },
    { id: "production-readiness", path: "tests/reports/external-parity-production-readiness.json", ready: production?.productionReady === true, command: "pnpm audit:external-parity-production-readiness" },
    { id: "pbr-gltf-readiness", path: "tests/reports/external-parity-pbr-gltf-readiness.json", ready: pbrGltf?.pbrParity === true && pbrGltf.gltfParity === true, command: "pnpm audit:external-parity-pbr-gltf-readiness" },
  ] as const;
  return audits.map((audit): ExternalEvidenceArtifact => ({
    areaId: "final-external-parity-audits",
    id: audit.id,
    kind: "final-audit-report",
    ready: audit.ready,
    path: audit.path,
    command: audit.command,
    localEvidence: [
      `${audit.path} is generated by the local audit command and records whether dependent evidence is ready.`,
    ],
    requiredExternalEvidence: [
      "Rerun this final audit after real Unity, Unreal, PBR, deployment, and completion evidence has been ingested.",
    ],
    blockers: audit.ready ? [] : [`${audit.path} is not ready for final external parity completion`],
  }));
}

function commandsForArea(areaId: string): readonly string[] {
  switch (areaId) {
    case "external-baseline-kit":
      return ["pnpm verify:external-parity-external-engine-baselines"];
    case "external-baseline-ci-workflow":
      return [
        "register self-hosted GitHub Actions runners labeled unity and unreal",
        "set repository variables or secrets for G3D_UNITY_EDITOR and G3D_UNREAL_EDITOR",
        "gh workflow run external-parity-external-engine-baselines.yml -f engine=all",
        "download v4-unity-baseline-evidence and v4-unreal-baseline-evidence artifacts",
        "pnpm ingest:v4-external-baseline-artifacts --dry-run path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
        "pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
      ];
    case "public-deployment-ci-workflow":
      return [
        "gh workflow run v4-public-demo-deploy.yml",
        "download v4-public-demo-deployment-reports",
        "pnpm ingest:public-demo-deployment-reports --dry-run path/to/v4-public-demo-deployment-reports",
        "pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports",
        "review tests/reports/public-demo-deployment-runbook.md if deployment smoke remains blocked",
      ];
    case "github-remote-external-readiness":
      return [
        "pnpm audit:external-parity-github-external-readiness",
        "git push origin <current-branch>",
        "open and merge a PR that lands .github/workflows/external-parity-external-engine-baselines.yml and .github/workflows/v4-public-demo-deploy.yml on the default branch",
        "enable GitHub Pages for the repository",
        "register self-hosted GitHub Actions runners labeled unity and unreal",
        "configure G3D_UNITY_EDITOR and G3D_UNREAL_EDITOR as Actions variables or secrets; the workflow sets G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true internally",
        "pnpm audit:external-parity-github-external-readiness",
      ];
    case "unity-external-baselines":
      return [
        "export G3D_UNITY_EDITOR=/absolute/path/to/Unity",
        "optional: export G3D_UNITY_SEARCH_ROOTS=/Applications:/Users/Shared/Unity",
        "export G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true",
        "pnpm doctor:v4-external-host:strict",
        "pnpm run:v4-external-host-evidence",
        "pnpm run:v4-external-host-evidence:execute",
        "pnpm preflight:v4-parity:after-external-evidence",
        "pnpm dry-run:v4-unity-baselines",
        "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/external-parity-unity-editor-cli-smoke.json",
        "follow fixtures/external-engine-baselines/v4/external-baseline-command-plan.json for every unity capture",
        "or run .github/workflows/external-parity-external-engine-baselines.yml on a self-hosted runner labeled unity",
        "pnpm ingest:v4-external-baseline-artifacts --dry-run path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
        "pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
        "node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unity",
        "pnpm verify:v4-external-baseline-reports",
        "node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unity tests/reports/external-parity-unity-baseline-render.json",
        "node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unity tests/reports/external-parity-unity-asset-import-workflow.evidence.json tests/reports/external-parity-unity-asset-import-workflow.json",
        "pnpm audit:external-parity-unity-unreal-parity",
      ];
    case "unreal-external-baselines":
      return [
        "export G3D_UNREAL_EDITOR=/absolute/path/to/UnrealEditor-Cmd",
        "optional: export G3D_UNREAL_SEARCH_ROOTS=/Applications:/Users/Shared/Epic Games",
        "export G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true",
        "pnpm doctor:v4-external-host:strict",
        "pnpm run:v4-external-host-evidence",
        "pnpm run:v4-external-host-evidence:execute",
        "pnpm preflight:v4-parity:after-external-evidence",
        "pnpm dry-run:v4-unreal-baselines",
        "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/external-parity-unreal-editor-cli-smoke.json",
        "follow fixtures/external-engine-baselines/v4/external-baseline-command-plan.json for every unreal capture",
        "or run .github/workflows/external-parity-external-engine-baselines.yml on a self-hosted runner labeled unreal",
        "pnpm ingest:v4-external-baseline-artifacts --dry-run path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
        "pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
        "node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unreal",
        "pnpm verify:v4-external-baseline-reports",
        "node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unreal tests/reports/external-parity-unreal-baseline-render.json",
        "node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unreal tests/reports/external-parity-unreal-asset-import-workflow.evidence.json tests/reports/external-parity-unreal-asset-import-workflow.json",
        "pnpm audit:external-parity-unity-unreal-parity",
      ];
    case "unity-unreal-rendered-product-visual-parity":
      return [
        "generate tests/reports/external-parity-unity-product-visual-baseline.json from a real Unity product screenshot",
        "generate tests/reports/external-parity-unreal-product-visual-baseline.json from a real Unreal product screenshot",
        "pnpm audit:external-parity-product-visual-parity",
      ];
    case "durable-public-demo-deployment":
      return [
        "pnpm preflight:external-parity-production-readiness",
        "pnpm build:external-demos",
        "review tests/reports/public-demo-deployment-runbook.md for exact public paths, hashes, and content markers",
        "deploy release-artifacts/external-demos/0.1.0-alpha.0 to a durable public HTTPS origin",
        "pnpm doctor:v4-external-host:strict",
        "pnpm run:v4-external-host-evidence",
        "pnpm run:v4-external-host-evidence:execute",
        "pnpm preflight:v4-parity:after-external-evidence",
        "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
        "or run .github/workflows/v4-public-demo-deploy.yml and download v4-public-demo-deployment-reports",
        "pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports",
        "pnpm audit:external-parity-production-readiness",
      ];
    case "blender-same-corpus-export-coverage":
      return [
        "install Blender or set PATH to a Blender executable",
        "run same-corpus Blender export validation for the pinned glTF compatibility corpus",
        "pnpm audit:external-parity-pbr-gltf-readiness",
      ];
    case "external-physical-pbr-reference-parity":
      return [
        "generate real Unity and Unreal pbr-visual baselines",
        "pnpm audit:external-parity-pbr-visual-parity",
        "pnpm audit:external-parity-pbr-reference-readiness",
        "pnpm audit:external-parity-pbr-gltf-readiness",
      ];
    case "final-external-parity-audits":
      return [
        "pnpm audit:external-parity-unity-unreal-parity",
        "pnpm audit:external-parity-production-readiness",
        "pnpm audit:external-parity-pbr-gltf-readiness",
        "pnpm audit:v4-broad-parity",
        "pnpm audit:v4-completion",
        "pnpm preflight:v4-parity:after-external-evidence",
      ];
    default:
      return ["pnpm audit:external-parity-external-evidence-readiness"];
  }
}

export function externalEvidenceLocalPreflight(): ExternalEvidenceLocalPreflight {
  const unity = editorLocalPreflight("unity");
  const unreal = editorLocalPreflight("unreal");
  const deploymentUrl = process.env.G3D_PUBLIC_DEMO_URL?.trim();
  const publicDeployment = {
    envName: "G3D_PUBLIC_DEMO_URL" as const,
    envSet: Boolean(deploymentUrl),
    value: deploymentUrl || undefined,
    durableHttpsCandidate: isDurableHttpsCandidate(deploymentUrl),
    command: "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment" as const,
    blockers: [
      ...(deploymentUrl ? [] : ["G3D_PUBLIC_DEMO_URL is not set."]),
      ...(isDurableHttpsCandidate(deploymentUrl) ? [] : ["G3D_PUBLIC_DEMO_URL is not a durable public HTTPS candidate."]),
    ],
  };
  const missing = [
    ...(unity.executableAvailable ? [] : ["unity-editor-executable"]),
    ...(unreal.executableAvailable ? [] : ["unreal-editor-executable"]),
    ...(unity.cliSmokeOptIn && unreal.cliSmokeOptIn ? [] : ["unity-unreal-cli-smoke-opt-in"]),
    ...(publicDeployment.durableHttpsCandidate ? [] : ["durable-public-demo-url"]),
  ];
  return {
    unity,
    unreal,
    publicDeployment,
    canRunExternalEvidenceHere: missing.length === 0,
    firstMissingCapability: missing[0],
  };
}

function editorLocalPreflight(engine: "unity" | "unreal"): ExternalEditorPreflight {
  const envName = engine === "unity" ? "G3D_UNITY_EDITOR" as const : "G3D_UNREAL_EDITOR" as const;
  const searchRootsEnvName = engine === "unity" ? "G3D_UNITY_SEARCH_ROOTS" as const : "G3D_UNREAL_SEARCH_ROOTS" as const;
  const envPath = process.env[envName]?.trim();
  const envExecutable = normalizeEditorExecutablePath(engine, envPath);
  const searchRoots = editorSearchRoots(engine);
  const autoDiscoveredExecutable = findExternalEditorExecutable(engine);
  const executableAvailable = Boolean(envExecutable || autoDiscoveredExecutable);
  const cliSmokeOptIn = process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE === "true";
  const smokeReportPath = `tests/reports/external-parity-${engine}-editor-cli-smoke.json`;
  return {
    engine,
    envName,
    searchRootsEnvName,
    envSet: Boolean(envPath),
    envPath: envPath || undefined,
    envExecutable: envExecutable || undefined,
    autoDiscoveredExecutable: autoDiscoveredExecutable || undefined,
    searchRoots,
    executableAvailable,
    cliSmokeOptIn,
    smokeReportPath,
    smokeCommand: `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs ${engine} ${smokeReportPath}`,
    blockers: [
      ...(executableAvailable ? [] : [`${envName} is not set to a usable executable and no ${engine} editor executable was auto-discovered.`]),
      ...(cliSmokeOptIn ? [] : ["G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true has not been set."]),
    ],
  };
}

function isDurableHttpsCandidate(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".localhost") ||
      hostname === "example.com" ||
      hostname === "example.org" ||
      hostname === "example.net" ||
      hostname.endsWith(".example.com") ||
      hostname.endsWith(".invalid") ||
      hostname.endsWith(".test")
    ) {
      return false;
    }
    if (/^(10|127|169\.254|192\.168)\./.test(hostname)) return false;
    const match = hostname.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
    return hostname.includes(".");
  } catch {
    return false;
  }
}

function externalBaselineKitArea(report: Record<string, unknown> | null): ExternalEvidenceArea {
  const sceneSlots = Array.isArray(report?.sceneSlots) ? report.sceneSlots.filter(isRecord) : [];
  return {
    id: "external-baseline-kit",
    ready: report?.ok === true && sceneSlots.length >= 5,
    evidencePaths: ["tests/reports/external-parity-external-engine-baselines.json", "fixtures/external-engine-baselines/v4"],
    localEvidence: [
      `External baseline kit report ${report?.ok === true ? "passes" : "does not pass"} locally with ${sceneSlots.length} scene slots.`,
    ],
    requiredExternalEvidence: [
      "The kit still needs real Unity and Unreal executions for the prepared scene slots.",
    ],
    blockers: [
      ...(report?.ok === true ? [] : ["external baseline kit report is missing or failing"]),
      ...(sceneSlots.length >= 5 ? [] : [`expected at least 5 external baseline scene slots, found ${sceneSlots.length}`]),
    ],
  };
}

function externalEvidenceLocalSummaries(report: Record<string, unknown> | null): ExternalEvidenceLocalSummaries {
  const editor = isRecord(report?.editorEvidence) ? report.editorEvidence : null;
  const assetImport = isRecord(report?.assetImportPreflight) ? report.assetImportPreflight : null;
  const runtime = isRecord(report?.runtimeEvidence) ? report.runtimeEvidence : null;
  const rendering = isRecord(report?.renderingEvidence) ? report.renderingEvidence : null;
  const deployment = isRecord(report?.deploymentEvidence) ? report.deploymentEvidence : null;
  return {
    editor: editor ? [
      `Browser editor evidence ok=${String(editor.editorReportOk === true)} with ${Number(editor.passedCheckCount ?? 0)} passed checks, ${stringArray(editor.authoredWorkflowSignals).length} workflow signals, ${Number(editor.timelineTrackCount ?? 0)} timeline tracks, ${Number(editor.visualScriptingNodeCount ?? 0)} visual-scripting nodes, prefab export node count ${Number(editor.prefabExportedNodeCount ?? 0)}, and static export without editor code=${String(editor.staticExportWithoutEditorCode === true)}.`,
      String(editor.claimBoundary ?? "Browser editor authoring evidence does not prove Unity/Unreal editor workflow equivalence."),
    ] : ["No local editor workflow summary is present in tests/reports/external-parity-unity-unreal-parity.json."],
    assetImport: assetImport ? [
      `Asset import preflight is ${String(assetImport.currentPipeline ?? "unknown")} with supported formats ${stringArray(assetImport.supportedFormats).join(", ") || "none"} and conversion-required formats ${stringArray(assetImport.conversionRequiredFormats).join(", ") || "none"}.`,
      String(assetImport.claimBoundary ?? "Asset import preflight does not prove native Unity/Unreal/DCC import parity."),
    ] : ["No local asset import preflight summary is present in tests/reports/external-parity-unity-unreal-parity.json."],
    runtime: runtime ? [
      `Browser runtime report ok=${String(runtime.runtimeReportOk === true)} with ${Number(runtime.completedRuntimeTaskCount ?? 0)} completed runtime tasks, game-slice status=${String(runtime.gameSliceStatus ?? "unknown")}, drawCalls=${Number(runtime.gameSliceDrawCalls ?? 0)}, and ${Number(runtime.oldBranchRuntimePortEvidence ? stringArray(runtime.oldBranchRuntimePortEvidence).length : 0)} old-branch runtime concept ports recorded.`,
      String(runtime.claimBoundary ?? "Browser runtime evidence does not prove native Unity/Unreal runtime parity."),
    ] : ["No local runtime summary is present in tests/reports/external-parity-unity-unreal-parity.json."],
    rendering: rendering ? [
      `Local rendering report ok=${String(rendering.renderingReportOk === true)} with ${Number(rendering.renderingValidationCount ?? 0)} validations and ${Number(rendering.renderingScreenshotCount ?? 0)} screenshots; product visual parity reports Three.js=${String(rendering.productVisualThreeJs === true)}, Babylon.js=${String(rendering.productVisualBabylon === true)}, Unity=${String(rendering.productVisualUnity === true)}, Unreal=${String(rendering.productVisualUnreal === true)}.`,
      `Bounded renderer parity flags: PBR=${String(rendering.boundedPbrVisualParity === true)}, shadows=${String(rendering.boundedShadowVisualParity === true)}, HDR targets=${String(rendering.boundedHdrRenderTargetParity === true)}, real-scene postprocess=${String(rendering.postprocessRealSceneValidation === true)}, forward shadow sampling=${String(rendering.forwardShadowSamplingValidation === true)}.`,
      String(rendering.claimBoundary ?? "Local rendering evidence does not prove Unity/Unreal rendered-output parity."),
    ] : ["No local rendering summary is present in tests/reports/external-parity-unity-unreal-parity.json."],
    deployment: deployment ? [
      `Local deployment evidence: staticExportOk=${String(deployment.staticExportOk === true)}, output=${String(deployment.staticExportOutputDir ?? "unknown")}, static server smoke=${String(deployment.staticDemoServerSmokeOk === true)}, public deployment smoke=${String(deployment.publicDeploymentSmokeOk === true)}, workflow=${String(deployment.githubPagesWorkflowPath ?? "unknown")}.`,
      String(deployment.claimBoundary ?? "Local static export evidence does not prove production deployment readiness."),
    ] : ["No local deployment summary is present in tests/reports/external-parity-unity-unreal-parity.json."],
  };
}

function unityUnrealEditorArea(root: string, engine: "unity" | "unreal", baselineKit: Record<string, unknown> | null, localEvidence: ExternalEvidenceLocalSummaries): ExternalEvidenceArea {
  const envName = engine === "unity" ? "G3D_UNITY_EDITOR" : "G3D_UNREAL_EDITOR";
  const executable = normalizeEditorExecutablePath(engine, process.env[envName]);
  const pathExecutable = Boolean(findExternalEditorExecutable(engine));
  const cliSmoke = process.env.G3D_RUN_UNITY_UNREAL_CLI_SMOKE === "true";
  const sceneReportPaths = targetReportPaths(baselineKit, engine);
  const smokeReportPath = `tests/reports/external-parity-${engine}-editor-cli-smoke.json`;
  const renderWorkflowReportPath = `tests/reports/external-parity-${engine}-baseline-render.json`;
  const missingReports = sceneReportPaths.filter((path) => !externalSceneBaselineReportReady(root, path, engine));
  const smokeReady = baselineReportReady(root, smokeReportPath, engine);
  const renderWorkflowReady = baselineReportReady(root, renderWorkflowReportPath, engine);
  return {
    id: `${engine}-external-baselines`,
    ready: Boolean(executable || pathExecutable) && cliSmoke && smokeReady && renderWorkflowReady && missingReports.length === 0,
    evidencePaths: [
      smokeReportPath,
      renderWorkflowReportPath,
      ...sceneReportPaths,
      "tests/reports/external-parity-unity-unreal-parity.json",
      "fixtures/external-engine-baselines/v4/external-baseline-command-plan.json",
    ],
    localEvidence: [
      ...localEvidence.editor,
      ...localEvidence.assetImport,
      ...localEvidence.runtime,
    ],
    requiredExternalEvidence: [
      `${engine} editor executable discovery and CLI smoke report.`,
      `${engine} render workflow report for the current external baseline kit.`,
      `${engine} same-scene external baseline reports with runner evidence sidecars for product, PBR, shadow, HDR, and postprocess scenes.`,
    ],
    blockers: [
      ...(executable || pathExecutable ? [] : [`${envName} is not set and no ${engine} editor executable was found on PATH`]),
      ...(cliSmoke ? [] : ["G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true has not been set for editor binary verification"]),
      ...(smokeReady ? [] : [`${smokeReportPath} is missing or does not contain ok=true for engine="${engine}"`]),
      ...(renderWorkflowReady ? [] : [`${renderWorkflowReportPath} is missing or does not contain ok=true for engine="${engine}"`]),
      ...missingReports.map((path) => `${path} is missing, does not contain ok=true for engine="${engine}", or lacks validated runner evidence sidecar`),
    ],
  };
}

function renderedProductVisualArea(report: Record<string, unknown> | null, localEvidence: ExternalEvidenceLocalSummaries): ExternalEvidenceArea {
  const rendered = isRecord(report?.renderedProductVisualParity) ? report.renderedProductVisualParity : {};
  return {
    id: "unity-unreal-rendered-product-visual-parity",
    ready: report?.visualParityReady === true && rendered.unity === true && rendered.unreal === true,
    evidencePaths: [
      "tests/reports/external-parity-product-visual-parity.json",
      "tests/reports/external-parity-unity-product-visual-baseline.json",
      "tests/reports/external-parity-unreal-product-visual-baseline.json",
    ],
    localEvidence: [
      ...localEvidence.rendering,
      `Product visual report has Three.js parity=${String(rendered.threejs === true)} and Babylon.js parity=${String(rendered.babylon === true)}.`,
    ],
    requiredExternalEvidence: [
      "Real Unity product visual baseline report and screenshot must pass current Galileo diff validation.",
      "Real Unreal product visual baseline report and screenshot must pass current Galileo diff validation.",
    ],
    blockers: [
      ...(rendered.unity === true ? [] : ["Unity product visual baseline is missing or failing current Galileo diff validation"]),
      ...(rendered.unreal === true ? [] : ["Unreal product visual baseline is missing or failing current Galileo diff validation"]),
      ...(report?.visualParityReady === true ? [] : ["product visual parity report keeps visualParityReady=false"]),
    ],
  };
}

function publicDeploymentArea(root: string, publicDeployment: Record<string, unknown> | null, production: Record<string, unknown> | null, staticExport: Record<string, unknown> | null, localEvidence: ExternalEvidenceLocalSummaries): ExternalEvidenceArea {
  const deploymentUrl = typeof publicDeployment?.deploymentUrl === "string" ? publicDeployment.deploymentUrl : null;
  const validation = validatePublicDemoDeploymentSmokeEvidence(root, publicDeployment, staticExport);
  return {
    id: "durable-public-demo-deployment",
    ready: validation.ok && production?.productionReady === true,
    evidencePaths: [
      "tests/reports/public-demo-deployment-smoke.json",
      "tests/reports/public-demo-deployment-runbook.md",
      "tests/reports/external-parity-production-readiness.json",
      "release-artifacts/external-demos/0.1.0-alpha.0/public-deployment-manifest.json",
    ],
    localEvidence: localEvidence.deployment,
    requiredExternalEvidence: [
      "Static export must be deployed to a durable public HTTPS origin.",
      "Public deployment smoke must return current HTTP/hash/content-marker evidence for every manifest file.",
    ],
    blockers: [
      ...(deploymentUrl ? [] : ["G3D_PUBLIC_DEMO_URL has not been validated against a durable public HTTPS origin"]),
      ...(validation.ok ? [] : [
        "public deployment smoke report is missing, failing, or lacks current per-file HTTP/hash/content-marker evidence",
        ...validation.blockers.map((blocker) => `public deployment evidence: ${blocker}`),
      ]),
      ...(production?.productionReady === true ? [] : ["v4 production readiness remains false"]),
    ],
  };
}

function blenderSameCorpusArea(report: Record<string, unknown> | null): ExternalEvidenceArea {
  const dimension = gltfDimension(report, "blender-export-same-corpus-coverage");
  const metrics = isRecord(dimension?.metrics) ? dimension.metrics : {};
  const notRun = Number(metrics.sameCorpusNotRun ?? 0);
  const expectedFail = Number(metrics.sameCorpusExpectedFail ?? 0);
  const blenderAvailable = commandExists("blender") || existsSync("/Applications/Blender.app/Contents/MacOS/Blender");
  return {
    id: "blender-same-corpus-export-coverage",
    ready: dimension?.ready === true && notRun === 0,
    evidencePaths: ["tests/reports/external-parity-pbr-gltf-readiness.json", "tests/reports/blender-export-validation.json", "tests/reports/blender-same-corpus-export.json"],
    localEvidence: [
      `Blender same-corpus dimension ready=${String(dimension?.ready === true)} with ${notRun} not-run entries and ${expectedFail} expected-fail entries.`,
    ],
    requiredExternalEvidence: [
      "Blender must remain available when refreshing same-corpus export evidence.",
    ],
    blockers: [
      ...(blenderAvailable ? [] : ["Blender executable is not available locally; same-corpus export round-trip cannot be run here"]),
      ...(dimension?.ready === true ? [] : [`same-corpus Blender-export coverage is not ready${Number.isFinite(notRun) && Number.isFinite(expectedFail) ? ` (${notRun} not-run, ${expectedFail} expected-fail entries)` : ""}`]),
    ],
  };
}

function fullPbrExternalReferenceArea(report: Record<string, unknown> | null, localEvidence: ExternalEvidenceLocalSummaries): ExternalEvidenceArea {
  const pbrBlockers = stringArray(report?.pbrBlockers);
  return {
    id: "external-physical-pbr-reference-parity",
    ready: report?.pbrParity === true,
    evidencePaths: [
      "tests/reports/external-parity-pbr-gltf-readiness.json",
      "tests/reports/external-parity-pbr-reference-readiness.json",
      "tests/reports/external-parity-unity-pbr-visual-baseline.json",
      "tests/reports/external-parity-unreal-pbr-visual-baseline.json",
    ],
    localEvidence: [
      ...localEvidence.rendering,
      `PBR/glTF report has gltfParity=${String(report?.gltfParity === true)} and pbrParity=${String(report?.pbrParity === true)}.`,
    ],
    requiredExternalEvidence: [
      "Real Unity PBR visual baseline must pass against the current physical-reference scene.",
      "Real Unreal PBR visual baseline must pass against the current physical-reference scene.",
      "External physical reference or conformance evidence must clear the remaining PBR blockers.",
    ],
    blockers: pbrBlockers.length > 0 ? pbrBlockers : report?.pbrParity === true ? [] : ["pbrParity is not true"],
  };
}

function finalParityAuditArea(
  unityUnreal: Record<string, unknown> | null,
  production: Record<string, unknown> | null,
  pbrGltf: Record<string, unknown> | null,
  localEvidence: ExternalEvidenceLocalSummaries,
): ExternalEvidenceArea {
  return {
    id: "final-external-parity-audits",
    ready: unityUnreal?.unityParity === true &&
      unityUnreal.unrealParity === true &&
      unityUnreal.replacement === true &&
      production?.productionReady === true &&
      pbrGltf?.pbrParity === true &&
      pbrGltf.gltfParity === true,
    evidencePaths: [
      "tests/reports/external-parity-unity-unreal-parity.json",
      "tests/reports/external-parity-production-readiness.json",
      "tests/reports/external-parity-pbr-gltf-readiness.json",
      "tests/reports/external-parity-broad-parity-readiness.json",
      "tests/reports/external-parity-completion-audit.json",
    ],
    localEvidence: [
      ...localEvidence.editor,
      ...localEvidence.assetImport,
      ...localEvidence.runtime,
      ...localEvidence.rendering,
      ...localEvidence.deployment,
    ],
    requiredExternalEvidence: [
      "Unity and Unreal parity audits must both report true.",
      "Replacement, production readiness, full PBR parity, and final completion audits must all report ready after external evidence is ingested.",
    ],
    blockers: [
      ...(unityUnreal?.unityParity === true ? [] : ["unityParity is not true"]),
      ...(unityUnreal?.unrealParity === true ? [] : ["unrealParity is not true"]),
      ...(unityUnreal?.replacement === true ? [] : ["Unity/Unreal replacement is not true"]),
      ...(production?.productionReady === true ? [] : ["productionReady is not true"]),
      ...(pbrGltf?.pbrParity === true ? [] : ["pbrParity is not true"]),
      ...(pbrGltf?.gltfParity === true ? [] : ["gltfParity is not true"]),
    ],
  };
}

function targetReportPaths(report: Record<string, unknown> | null, engine: "unity" | "unreal"): string[] {
  const slots = Array.isArray(report?.sceneSlots) ? report.sceneSlots.filter(isRecord) : [];
  return slots.flatMap((slot) => {
    const targetReports = isRecord(slot.targetReports) ? slot.targetReports : {};
    return typeof targetReports[engine] === "string" ? [targetReports[engine]] : [];
  });
}

function baselineReportReady(root: string, path: string, engine: "unity" | "unreal"): boolean {
  const report = readJson(root, path);
  return existsSync(join(root, path)) && report?.ok === true && report.engine === engine;
}

function externalSceneBaselineReportReady(root: string, path: string, engine: "unity" | "unreal"): boolean {
  const report = readJson(root, path);
  if (!baselineReportReady(root, path, engine) || !isRecord(report)) return false;
  const evidencePath = typeof report.runnerEvidencePath === "string" ? report.runnerEvidencePath : "";
  const expectedSha256 = typeof report.runnerEvidenceSha256 === "string" ? report.runnerEvidenceSha256 : "";
  if (!expectedSha256.match(/^[0-9a-f]{64}$/) || evidencePath.length === 0) return false;
  const fullEvidencePath = join(root, evidencePath);
  if (!existsSync(fullEvidencePath)) return false;
  const evidenceText = readFileSync(fullEvidencePath, "utf8");
  if (createHash("sha256").update(evidenceText).digest("hex") !== expectedSha256) return false;
  const sidecar = parseJsonRecord(evidenceText);
  const embedded = isRecord(report.runnerEvidence) ? report.runnerEvidence : null;
  if (!sidecar || !embedded) return false;
  return sidecar.ok === true &&
    sidecar.engine === engine &&
    sidecar.baselineKind === report.baselineKind &&
    sidecar.sceneDescriptorId === report.sceneDescriptorId &&
    sidecar.sceneDescriptorVersion === report.sceneDescriptorVersion &&
    sidecar.screenshotPath === report.screenshotPath &&
    sidecar.renderedFrameCaptured === true &&
    sidecar.cameraConfigured === true &&
    embedded.ok === sidecar.ok &&
    embedded.engine === sidecar.engine &&
    embedded.baselineKind === sidecar.baselineKind &&
    embedded.sceneDescriptorId === sidecar.sceneDescriptorId &&
    embedded.sceneDescriptorVersion === sidecar.sceneDescriptorVersion &&
    embedded.screenshotPath === sidecar.screenshotPath;
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(command)} >/dev/null 2>&1`], { stdio: "ignore" });
  return result.status === 0;
}

function findExternalEditorExecutable(engine: "unity" | "unreal"): string | null {
  const commands = engine === "unity" ? ["Unity", "unity"] : ["UnrealEditor-Cmd", "UnrealEditor", "unreal"];
  const pathCommand = commands.find((command) => commandExists(command));
  if (pathCommand) return pathCommand;
  const candidates = engine === "unity" ? unityMacCandidates() : unrealMacCandidates();
  return candidates.find((path) => existsSync(path)) ?? null;
}

function normalizeEditorExecutablePath(engine: "unity" | "unreal", path: string | undefined): string | null {
  if (!path) return null;
  if (existsSync(path) && !path.endsWith(".app")) return path;
  const appExecutable = engine === "unity"
    ? join(path, "Contents/MacOS/Unity")
    : join(path, "Contents/MacOS/UnrealEditor");
  return existsSync(appExecutable) ? appExecutable : null;
}

function unityMacCandidates(): string[] {
  return uniqueStrings(editorSearchRoots("unity").flatMap((root) => {
    const hubRoots = [
      join(root, "Unity", "Hub", "Editor"),
      join(root, "Hub", "Editor"),
      root,
    ];
    return [
      join(root, "Unity.app", "Contents", "MacOS", "Unity"),
      join(root, "Unity", "Unity.app", "Contents", "MacOS", "Unity"),
      ...hubRoots.flatMap((hubRoot) => safeReadDirectoryNames(hubRoot)
        .sort()
        .reverse()
        .map((version) => join(hubRoot, version, "Unity.app", "Contents", "MacOS", "Unity"))),
    ];
  }));
}

function unrealMacCandidates(): string[] {
  return uniqueStrings(editorSearchRoots("unreal").flatMap((root) => {
    const epicRoots = [
      join(root, "Epic Games"),
      root,
    ];
    return [
      join(root, "UnrealEditor-Cmd"),
      join(root, "UnrealEditor.app", "Contents", "MacOS", "UnrealEditor"),
      ...epicRoots.flatMap((epicRoot) => safeReadDirectoryNames(epicRoot)
        .sort()
        .reverse()
        .flatMap((version) => [
          join(epicRoot, version, "Engine", "Binaries", "Mac", "UnrealEditor-Cmd"),
          join(epicRoot, version, "Engine", "Binaries", "Mac", "UnrealEditor.app", "Contents", "MacOS", "UnrealEditor"),
        ])),
    ];
  }));
}

function editorSearchRoots(engine: "unity" | "unreal"): readonly string[] {
  const envName = engine === "unity" ? "G3D_UNITY_SEARCH_ROOTS" : "G3D_UNREAL_SEARCH_ROOTS";
  const defaults = engine === "unity"
    ? ["/Applications", "/Users/Shared/Unity"]
    : ["/Applications", "/Users/Shared/Epic Games", "/Users/Shared"];
  const envRoots = process.env[envName]
    ?.split(":")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0) ?? [];
  return uniqueStrings([...envRoots, ...defaults]);
}

function safeReadDirectoryNames(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function gltfDimension(report: Record<string, unknown> | null, id: string): Record<string, unknown> | null {
  const dimensions = Array.isArray(report?.gltfParityDimensions) ? report.gltfParityDimensions : [];
  return dimensions.find((entry) => isRecord(entry) && entry.id === id) as Record<string, unknown> | undefined ?? null;
}

interface DeploymentFile {
  readonly id: string;
  readonly localPath: string;
  readonly publicPath: string;
  readonly sha256: string;
  readonly minBytes: number;
  readonly contentMarkers: readonly string[];
}

function publicDeploymentFiles(report: Record<string, unknown> | null): readonly DeploymentFile[] {
  const files = Array.isArray(report?.files) ? report.files : [];
  return files.filter(isRecord).flatMap((entry) => {
    if (
      typeof entry.id !== "string" ||
      typeof entry.localPath !== "string" ||
      typeof entry.publicPath !== "string" ||
      typeof entry.sha256 !== "string" ||
      typeof entry.minBytes !== "number"
    ) {
      return [];
    }
    return [{
      id: entry.id,
      localPath: entry.localPath,
      publicPath: entry.publicPath,
      sha256: entry.sha256,
      minBytes: entry.minBytes,
      contentMarkers: stringArray(entry.contentMarkers),
    }];
  });
}

function primitiveRecord(value: unknown): Readonly<Record<string, number | string | boolean>> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, number | string | boolean] => {
    const primitive = entry[1];
    return typeof primitive === "number" || typeof primitive === "string" || typeof primitive === "boolean";
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4ExternalEvidenceReadinessReport();
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    externalEvidenceReady: report.externalEvidenceReady,
    readyAreas: report.summary.readyAreas,
    blockedAreas: report.summary.blockedAreas,
    firstBlockedArea: report.summary.firstBlockedArea,
    readyArtifacts: report.summary.readyArtifacts,
    blockedArtifacts: report.summary.blockedArtifacts,
    firstBlockedArtifact: report.summary.firstBlockedArtifact,
    canRunExternalEvidenceHere: report.localPreflight.canRunExternalEvidenceHere,
    firstMissingCapability: report.localPreflight.firstMissingCapability,
    missingArtifactRunbookPath: report.missingArtifactRunbookPath,
    report: reportPath,
  }, null, 2));
}
