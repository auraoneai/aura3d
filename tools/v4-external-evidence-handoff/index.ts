import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { isRecord, readJson, writeJson } from "../v4-reporting/index.js";
import { createV4ExternalHostRunnerReport } from "../v4-external-host-runner/index.js";

const reportPath = "tests/reports/v4-external-evidence-handoff.json";
const runbookPath = "tests/reports/v4-external-evidence-handoff.md";
const packageDir = "release-artifacts/v4-external-evidence-handoff";
const packageArchivePath = "release-artifacts/v4-external-evidence-handoff.tar.gz";
const packageArchiveSha256Path = `${packageArchivePath}.sha256`;
const transferManifestPath = "release-artifacts/v4-external-evidence-handoff.transfer.json";
const packageManifestPath = `${packageDir}/manifest.json`;
const packageReadmePath = `${packageDir}/START_HERE.md`;
const packageRestoreScriptPath = `${packageDir}/RESTORE_INTO_CHECKOUT.mjs`;
const packageExternalHostScriptPath = `${packageDir}/RUN_EXTERNAL_HOST_PREFLIGHT.mjs`;
const packageStandaloneVerifyScriptPath = `${packageDir}/VERIFY_PACKAGE_INTEGRITY.mjs`;

export interface V4ExternalEvidenceHandoffFile {
  readonly path: string;
  readonly exists: boolean;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly kind: "baseline-kit" | "galileo-reference" | "local-evidence" | "runbook" | "static-export" | "tooling" | "workflow";
}

export interface V4ExternalEvidenceHandoffReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly claimBoundary: string;
  readonly blockedArtifacts: number;
  readonly readyArtifacts: number;
  readonly firstBlockedArtifact?: string;
  readonly firstMissingCapability?: string;
  readonly handoffFilesReady: boolean;
  readonly packagedFilesReady: boolean;
  readonly packageDir: typeof packageDir;
  readonly packageArchivePath: typeof packageArchivePath;
  readonly packageArchiveSha256Path: typeof packageArchiveSha256Path;
  readonly transferManifestPath: typeof transferManifestPath;
  readonly packageManifestPath: typeof packageManifestPath;
  readonly packageReadmePath: typeof packageReadmePath;
  readonly packageRestoreScriptPath: typeof packageRestoreScriptPath;
  readonly packageExternalHostScriptPath: typeof packageExternalHostScriptPath;
  readonly packageStandaloneVerifyScriptPath: typeof packageStandaloneVerifyScriptPath;
  readonly files: readonly V4ExternalEvidenceHandoffFile[];
  readonly packagedFiles: readonly {
    readonly path: string;
    readonly packagePath: string;
    readonly kind: V4ExternalEvidenceHandoffFile["kind"];
    readonly copied: boolean;
    readonly bytes?: number;
    readonly sha256?: string;
    readonly reason?: string;
  }[];
  readonly blockedArtifactChecklist: readonly {
    readonly areaId: string;
    readonly id: string;
    readonly kind: string;
    readonly path?: string;
    readonly command?: string;
    readonly localEvidence: readonly string[];
    readonly requiredExternalEvidence: readonly string[];
    readonly blockers: readonly string[];
  }[];
  readonly commands: {
    readonly localRefresh: readonly string[];
    readonly unityHost: readonly string[];
    readonly unrealHost: readonly string[];
    readonly publicDeploymentHost: readonly string[];
    readonly ingestAndFinalAudit: readonly string[];
  };
  readonly packageVerification?: V4ExternalEvidenceHandoffPackageVerification;
  readonly reportPath: typeof reportPath;
  readonly runbookPath: typeof runbookPath;
}

export interface V4ExternalEvidenceHandoffPackageVerification {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly verificationScope: {
    readonly packageInternalEntries: boolean;
    readonly archiveAndSidecar: boolean;
    readonly externalParityEvidence: boolean;
  };
  readonly packageManifestPath: typeof packageManifestPath;
  readonly packageArchivePath: typeof packageArchivePath;
  readonly packageArchiveSha256Path: typeof packageArchiveSha256Path;
  readonly transferManifestPath: typeof transferManifestPath;
  readonly checkedFiles: number;
  readonly violations: readonly string[];
}

export function createV4ExternalEvidenceHandoffReport(root = process.cwd()): V4ExternalEvidenceHandoffReport {
  if (!readJson(root, "tests/reports/v4-external-host-runner.json")) {
    createV4ExternalHostRunnerReport(root);
  }
  const externalEvidence = readJson(root, "tests/reports/v4-external-evidence-readiness.json");
  const baselineKit = readJson(root, "tests/reports/v4-external-engine-baselines.json");
  const staticExport = readJson(root, "tests/reports/external-demo-static-export.json");
  const blockedArtifactChecklist = artifactChecklist(externalEvidence).filter((artifact) => artifact.ready !== true).map((artifact) => ({
    areaId: stringValue(artifact.areaId),
    id: stringValue(artifact.id),
    kind: stringValue(artifact.kind),
    path: typeof artifact.path === "string" ? artifact.path : undefined,
    command: typeof artifact.command === "string" ? artifact.command : undefined,
    localEvidence: stringArray(artifact.localEvidence),
    requiredExternalEvidence: stringArray(artifact.requiredExternalEvidence),
    blockers: stringArray(artifact.blockers),
  }));
  const files = fileList(root, baselineKit, staticExport);
  const handoffFilesReady = files.every((file) => file.exists);
  const packagedFiles = stageHandoffPackage(root, files);
  const packagedFilesReady = handoffFilesReady && packagedFiles.every((file) => file.copied);
  const report: V4ExternalEvidenceHandoffReport = {
    ok: handoffFilesReady && packagedFilesReady,
    auditComplete: true,
    claimBoundary: "This handoff only packages and inventories local inputs for external Unity/Unreal/public-deployment evidence capture. It is not parity evidence and does not clear any external artifact by itself.",
    blockedArtifacts: numberOrZero(externalEvidence?.blockedArtifacts),
    readyArtifacts: numberOrZero(externalEvidence?.readyArtifacts),
    firstBlockedArtifact: typeof externalEvidence?.firstBlockedArtifact === "string" ? externalEvidence.firstBlockedArtifact : undefined,
    firstMissingCapability: typeof externalEvidence?.firstMissingCapability === "string" ? externalEvidence.firstMissingCapability : undefined,
    handoffFilesReady,
    packagedFilesReady,
    packageDir,
    packageArchivePath,
    packageArchiveSha256Path,
    transferManifestPath,
    packageManifestPath,
    packageReadmePath,
    packageRestoreScriptPath,
    packageExternalHostScriptPath,
    packageStandaloneVerifyScriptPath,
    files,
    packagedFiles,
    blockedArtifactChecklist,
    commands: {
      localRefresh: [
        "pnpm verify:v4",
        "pnpm verify:v4-external-engine-baselines",
        "pnpm build:external-demos",
        "pnpm verify:static-demo-server-smoke",
        "pnpm audit:v4-external-evidence-readiness",
        "pnpm prepare:v4-external-evidence-handoff",
        "pnpm verify:v4-external-evidence-handoff",
        "pnpm doctor:v4-external-host",
        "pnpm run:v4-external-host-evidence",
      ],
      unityHost: [
        "export G3D_UNITY_EDITOR=/absolute/path/to/Unity",
        "export G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true",
        "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
        "node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project",
      ],
      unrealHost: [
        "export G3D_UNREAL_EDITOR=/absolute/path/to/UnrealEditor-Cmd",
        "export G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true",
        "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json",
        "node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject",
      ],
      publicDeploymentHost: [
        "pnpm build:external-demos",
        "pnpm verify:static-demo-server-smoke",
        "deploy release-artifacts/external-demos/0.1.0-alpha.0 to a durable HTTPS origin",
        "G3D_PUBLIC_DEMO_URL=https://your-public-demo.example/ pnpm verify:public-demo-deployment",
        "pnpm audit:v4-production-readiness",
      ],
      ingestAndFinalAudit: [
        "node fixtures/external-engine-baselines/v4/ingest-external-baseline-artifacts.mjs path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits",
        "pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports",
        "pnpm refresh:v4-readiness-reports",
        "pnpm status:v4-local-port",
        "pnpm status:v4-parity",
        "pnpm preflight:v4-parity:after-external-evidence",
      ],
    },
    reportPath,
    runbookPath,
  };
  writeJson(root, reportPath, report);
  writeMarkdown(root, report);
  writePackageEntryPointFiles(root, report);
  copyGeneratedHandoffFilesToPackage(root);
  writePackageManifest(root, packagedFiles);
  const archive = writePackageArchive(root);
  writeTransferManifest(root, report, archive);
  return report;
}

export function verifyV4ExternalEvidenceHandoffPackage(root = process.cwd()): V4ExternalEvidenceHandoffPackageVerification {
  const manifest = readJson(root, packageManifestPath);
  const files = Array.isArray(manifest?.files) ? manifest.files.filter(isRecord) : [];
  const entryPoints = Array.isArray(manifest?.entryPoints) ? manifest.entryPoints.filter(isRecord) : [];
  const violations = [
    ...(manifest?.schemaVersion === "g3d-v4-external-evidence-handoff-package-v1" ? [] : [`${packageManifestPath} is missing or has an invalid schemaVersion.`]),
    ...files.flatMap((file) => verifyPackagedFile(root, file)),
    ...entryPoints.flatMap((file) => verifyPackagedFile(root, file)),
    ...verifyPackageEntryPoints(root),
    ...verifyPackageArchive(root),
  ];
  return {
    ok: violations.length === 0 && files.length > 0,
    auditComplete: true,
    verificationScope: {
      packageInternalEntries: true,
      archiveAndSidecar: true,
      externalParityEvidence: false,
    },
    packageManifestPath,
    packageArchivePath,
    packageArchiveSha256Path,
    transferManifestPath,
    checkedFiles: files.length + entryPoints.length + 2,
    violations,
  };
}

export function verifyAndRecordV4ExternalEvidenceHandoffPackage(root = process.cwd()): V4ExternalEvidenceHandoffPackageVerification {
  const verification = verifyV4ExternalEvidenceHandoffPackage(root);
  const report = readJson(root, reportPath);
  if (isRecord(report)) {
    writeJson(root, reportPath, {
      ...report,
      packageVerification: verification,
    });
  }
  const transferManifest = readJson(root, transferManifestPath);
  if (isRecord(transferManifest)) {
    writeJson(root, transferManifestPath, {
      ...transferManifest,
      packageVerification: verification,
    });
  }
  return verification;
}

function fileList(root: string, baselineKit: Record<string, unknown> | null, staticExport: Record<string, unknown> | null): readonly V4ExternalEvidenceHandoffFile[] {
  const baselineArtifacts = Array.isArray(baselineKit?.artifacts)
    ? baselineKit.artifacts.filter(isRecord).map((artifact) => stringValue(artifact.path)).filter(Boolean)
    : [];
  const galileoReferences = Array.isArray(baselineKit?.sceneSlots)
    ? baselineKit.sceneSlots.filter(isRecord).flatMap((slot) => {
      const screenshot = isRecord(slot.galileoReferenceScreenshot) ? slot.galileoReferenceScreenshot : {};
      return typeof screenshot.path === "string" ? [screenshot.path] : [];
    })
    : [];
  const staticExportPaths = [
    stringValue(staticExport?.outputDir),
    stringValue(staticExport?.integrityManifestPath),
    stringValue(staticExport?.publicDeploymentManifestPath),
    stringValue(staticExport?.deploymentCommandPlanPath),
    stringValue(staticExport?.rollbackPlanPath),
    ...staticExportDemoPaths(staticExport),
  ].filter(Boolean);
  const paths = [
    ...baselineArtifacts.map((path) => ({ path, kind: "baseline-kit" as const })),
    ...galileoReferences.map((path) => ({ path, kind: "galileo-reference" as const })),
    ...localEvidencePaths(root).map((path) => ({ path, kind: "local-evidence" as const })),
    ...staticExportPaths.map((path) => ({ path, kind: "static-export" as const })),
    { path: "tests/reports/v4-external-host-doctor.json", kind: "runbook" as const },
    { path: "tests/reports/v4-external-host-runner.json", kind: "runbook" as const },
    { path: "tests/reports/v4-github-external-readiness.json", kind: "runbook" as const },
    { path: "tests/reports/v4-external-evidence-missing-artifacts.md", kind: "runbook" as const },
    { path: "tests/reports/v4-completion-audit-runbook.md", kind: "runbook" as const },
    { path: "docs/project/v4-parity-execution-prompt.md", kind: "runbook" as const },
    { path: "release-artifacts/v4-external-evidence-operator-runbook.md", kind: "runbook" as const },
    { path: "release-artifacts/v4-parity-external-evidence-pr.md", kind: "runbook" as const },
    { path: "release-artifacts/codingrelated-completion-audit.md", kind: "runbook" as const },
    ...optionalFileEntries(root, [
      { path: "release-artifacts/v4-parity-external-evidence-workflows.patch", kind: "runbook" as const },
      { path: "release-artifacts/v4-current-handoff-supplement.patch", kind: "runbook" as const },
    ]),
    { path: "package.json", kind: "tooling" as const },
    { path: "tools/external-demo-export/index.ts", kind: "tooling" as const },
    { path: "tools/external-demo-validation/index.ts", kind: "tooling" as const },
    { path: "packages/assets/src/AssetImportPreflight.ts", kind: "tooling" as const },
    { path: "packages/assets/src/OBJLoader.ts", kind: "tooling" as const },
    { path: "packages/assets/src/index.ts", kind: "tooling" as const },
    { path: "packages/assets/tests/assets.test.ts", kind: "tooling" as const },
    { path: "examples/portfolio/main.ts", kind: "local-evidence" as const },
    { path: "examples/portfolio/README.md", kind: "local-evidence" as const },
    { path: "tests/browser/example-portfolio.spec.ts", kind: "tooling" as const },
    { path: "tests/browser/example-screenshot-audit-v4.spec.ts", kind: "tooling" as const },
    { path: "tests/unit/assets/asset-import-preflight.test.ts", kind: "tooling" as const },
    { path: "tests/unit/tools/v4-validation.test.ts", kind: "tooling" as const },
    { path: "tools/v4-examples/index.ts", kind: "tooling" as const },
    { path: "tools/v4-claim-gates/index.ts", kind: "tooling" as const },
    { path: "tools/v4-assets/index.ts", kind: "tooling" as const },
    { path: "tools/v4-current-capability/index.ts", kind: "tooling" as const },
    { path: "tools/v4-reporting/index.ts", kind: "tooling" as const },
    { path: "tools/v4-parity-status/index.ts", kind: "tooling" as const },
    { path: "tools/v4-local-port-status/index.ts", kind: "tooling" as const },
    { path: "tools/v4-external-engine-baselines/index.ts", kind: "tooling" as const },
    { path: "tools/v4-external-host-runner/index.ts", kind: "tooling" as const },
    { path: "tools/v4-external-host-doctor/index.ts", kind: "tooling" as const },
    { path: "tools/v4-report-freshness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-github-external-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-external-evidence-handoff/index.ts", kind: "tooling" as const },
    { path: "tools/v4-external-evidence-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-pbr-reference-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-shadow-map-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-hdr-render-target-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-production-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-pbr-gltf-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-ecosystem-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-broad-parity-readiness/index.ts", kind: "tooling" as const },
    { path: "tools/v4-completion-audit/index.ts", kind: "tooling" as const },
    { path: "tools/v4-product-visual-parity/index.ts", kind: "tooling" as const },
    { path: "tools/v4-product-visual-parity/productScene.ts", kind: "tooling" as const },
    { path: "tools/v4-pbr-visual-parity/index.ts", kind: "tooling" as const },
    { path: "tools/v4-shadow-visual-parity/index.ts", kind: "tooling" as const },
    { path: "tools/v4-hdr-visual-parity/index.ts", kind: "tooling" as const },
    { path: "tools/v4-postprocess-suite/index.ts", kind: "tooling" as const },
    { path: "tools/v4-unity-unreal-parity/index.ts", kind: "tooling" as const },
    { path: "tools/public-demo-deployment-smoke/index.ts", kind: "tooling" as const },
    { path: "tools/public-demo-deployment-artifacts/index.ts", kind: "tooling" as const },
    { path: "tools/static-demo-server-smoke/index.ts", kind: "tooling" as const },
    { path: "tools/package-provenance/index.ts", kind: "tooling" as const },
    { path: "tools/compare-engines/index.ts", kind: "tooling" as const },
    { path: ".github/workflows/v4-external-engine-baselines.yml", kind: "workflow" as const },
    { path: ".github/workflows/v4-public-demo-deploy.yml", kind: "workflow" as const },
  ];
  return uniqueByPath(paths).map((entry) => fileEntry(root, entry.path, entry.kind));
}

function localEvidencePaths(root: string): readonly string[] {
  const reportPaths = [
    "tests/reports/v4-product-visual-parity.json",
    "tests/reports/v4-pbr-visual-parity.json",
    "tests/reports/v4-shadow-visual-parity.json",
    "tests/reports/v4-hdr-visual-parity.json",
    "tests/reports/v4-postprocess-suite.json",
  ];
  const screenshotPaths = reportPaths.flatMap((path) => {
    const report = readJson(root, path);
    return stringArray(report?.screenshotPaths);
  });
  return [...new Set([...reportPaths, ...screenshotPaths].filter((path) => path.length > 0 && existsSync(join(root, path))))];
}

function optionalFileEntries<T extends { readonly path: string; readonly kind: V4ExternalEvidenceHandoffFile["kind"] }>(root: string, entries: readonly T[]): T[] {
  return entries.filter((entry) => existsSync(join(root, entry.path)));
}

function staticExportDemoPaths(staticExport: Record<string, unknown> | null): string[] {
  const demos = Array.isArray(staticExport?.demos) ? staticExport.demos.filter(isRecord) : [];
  return demos.flatMap((demo) => [
    typeof demo.outputHtml === "string" ? demo.outputHtml : "",
    typeof demo.outputScript === "string" ? demo.outputScript : "",
  ]).filter(Boolean);
}

function fileEntry(root: string, path: string, kind: V4ExternalEvidenceHandoffFile["kind"]): V4ExternalEvidenceHandoffFile {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) return { path, exists: false, kind };
  const stats = statSync(fullPath);
  if (stats.isDirectory()) return { path, exists: true, bytes: 0, sha256: "directory", kind };
  const bytes = readFileSync(fullPath);
  return {
    path,
    exists: true,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    kind,
  };
}

function stageHandoffPackage(root: string, files: readonly V4ExternalEvidenceHandoffFile[]): V4ExternalEvidenceHandoffReport["packagedFiles"] {
  const outputRoot = join(root, packageDir);
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });
  return files.map((file) => {
    const packagePath = `${packageDir}/${file.path}`;
    if (!file.exists) {
      return { path: file.path, packagePath, kind: file.kind, copied: false, reason: "source file is missing" };
    }
    const sourcePath = join(root, file.path);
    const targetPath = join(root, packagePath);
    if (statSync(sourcePath).isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      return { path: file.path, packagePath, kind: file.kind, copied: true, bytes: 0, sha256: "directory" };
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    return {
      path: file.path,
      packagePath,
      kind: file.kind,
      copied: true,
      bytes: file.bytes,
      sha256: file.sha256,
    };
  });
}

function writePackageManifest(root: string, packagedFiles: V4ExternalEvidenceHandoffReport["packagedFiles"]): void {
  writeFileSync(join(root, packageManifestPath), `${JSON.stringify({
    schemaVersion: "g3d-v4-external-evidence-handoff-package-v1",
    claimBoundary: "Portable local input package only. It is not Unity/Unreal/public-deployment evidence.",
    generatedAt: new Date().toISOString(),
    sourceReportPath: reportPath,
    sourceRunbookPath: runbookPath,
    packageDir,
    packageArchivePath,
    packageArchiveSha256Path,
    transferManifestPath,
    packageReadmePath,
    packageRestoreScriptPath,
    packageExternalHostScriptPath,
    packageStandaloneVerifyScriptPath,
    entryPoints: packageEntryPoints(root),
    files: packagedFiles,
  }, null, 2)}\n`);
}

function writePackageArchive(root: string): { readonly bytes: number; readonly sha256: string } {
  const packageRoot = join(root, packageDir);
  const archiveFullPath = join(root, packageArchivePath);
  const releaseArtifactsRoot = join(root, "release-artifacts");
  const chunks: Buffer[] = [];
  for (const fullPath of listFiles(packageRoot).sort()) {
    const archivePath = normalizeArchivePath(relative(releaseArtifactsRoot, fullPath));
    const bytes = readFileSync(fullPath);
    chunks.push(tarHeader(archivePath, bytes.byteLength), bytes, tarPadding(bytes.byteLength));
  }
  chunks.push(Buffer.alloc(1024));
  mkdirSync(dirname(archiveFullPath), { recursive: true });
  const archiveBytes = gzipSync(Buffer.concat(chunks));
  writeFileSync(archiveFullPath, archiveBytes);
  const sha256 = createHash("sha256").update(archiveBytes).digest("hex");
  writeFileSync(join(root, packageArchiveSha256Path), `${sha256}  ${packageArchivePath}\n`);
  return { bytes: archiveBytes.byteLength, sha256 };
}

function writeTransferManifest(
  root: string,
  report: V4ExternalEvidenceHandoffReport,
  archive: { readonly bytes: number; readonly sha256: string }
): void {
  writeFileSync(join(root, transferManifestPath), `${JSON.stringify({
    schemaVersion: "g3d-v4-external-evidence-transfer-v1",
    claimBoundary: report.claimBoundary,
    generatedAt: new Date().toISOString(),
    packageDir,
    packageArchivePath,
    packageArchiveSha256Path,
    archive,
    archiveBytes: archive.bytes,
    archiveSha256: archive.sha256,
    packageManifestPath,
    packageReadmePath,
    packageStandaloneVerifyScriptPath,
    packageRestoreScriptPath,
    packageExternalHostScriptPath,
    blockedArtifacts: report.blockedArtifacts,
    firstBlockedArtifact: report.firstBlockedArtifact,
    firstBlockedArtifactDetails: report.blockedArtifactChecklist[0] ? {
      areaId: report.blockedArtifactChecklist[0].areaId,
      id: report.blockedArtifactChecklist[0].id,
      kind: report.blockedArtifactChecklist[0].kind,
      path: report.blockedArtifactChecklist[0].path,
      command: report.blockedArtifactChecklist[0].command,
      localEvidence: report.blockedArtifactChecklist[0].localEvidence,
      requiredExternalEvidence: report.blockedArtifactChecklist[0].requiredExternalEvidence,
      blockers: report.blockedArtifactChecklist[0].blockers,
    } : undefined,
    firstMissingCapability: report.firstMissingCapability,
    packageEntryPoints: {
      standaloneVerify: packageStandaloneVerifyScriptPath,
      restoreIntoCheckout: packageRestoreScriptPath,
      externalHostPreflight: packageExternalHostScriptPath
    },
    transferCommands: [
      `shasum -a 256 -c ${packageArchiveSha256Path}`,
      `tar -xzf ${packageArchivePath}`,
      "cd v4-external-evidence-handoff",
      "node VERIFY_PACKAGE_INTEGRITY.mjs",
      "node RESTORE_INTO_CHECKOUT.mjs --dry-run /absolute/path/to/G3D",
      "node RESTORE_INTO_CHECKOUT.mjs /absolute/path/to/G3D",
      "node RUN_EXTERNAL_HOST_PREFLIGHT.mjs /absolute/path/to/G3D",
      "pnpm run:v4-external-host-evidence:execute",
      "pnpm preflight:v4-parity:after-external-evidence",
      "pnpm status:v4-parity"
    ],
  }, null, 2)}\n`);
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

function tarHeader(path: string, size: number): Buffer {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(path);
  writeString(header, name, 0, 100);
  writeOctal(header, 0o644, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, size, 124, 12);
  writeOctal(header, 0, 136, 12);
  header.fill(0x20, 148, 156);
  writeString(header, "0", 156, 1);
  writeString(header, "ustar", 257, 6);
  writeString(header, "00", 263, 2);
  writeString(header, "galileo3d", 265, 32);
  writeString(header, "galileo3d", 297, 32);
  writeString(header, prefix, 345, 155);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = checksum.toString(8).padStart(6, "0");
  writeString(header, `${checksumText}\0 `, 148, 8);
  return header;
}

function tarPadding(size: number): Buffer {
  const remainder = size % 512;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(512 - remainder);
}

function splitTarPath(path: string): { readonly name: string; readonly prefix: string } {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  const slashIndexes = [...path.matchAll(/\//g)].map((match) => match.index ?? -1).filter((index) => index > 0).reverse();
  for (const index of slashIndexes) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`Cannot encode handoff archive path in ustar header: ${path}`);
}

function writeString(buffer: Buffer, value: string, offset: number, length: number): void {
  buffer.write(value.slice(0, length), offset, length, "utf8");
}

function writeOctal(buffer: Buffer, value: number, offset: number, length: number): void {
  const text = value.toString(8).padStart(length - 1, "0");
  buffer.write(`${text}\0`.slice(0, length), offset, length, "ascii");
}

function writePackageEntryPointFiles(root: string, report: V4ExternalEvidenceHandoffReport): void {
  writeFileSync(join(root, packageReadmePath), packageReadmeSource(report));
  writeFileSync(join(root, packageStandaloneVerifyScriptPath), packageStandaloneVerifyScriptSource());
  writeFileSync(join(root, packageRestoreScriptPath), packageRestoreScriptSource());
  writeFileSync(join(root, packageExternalHostScriptPath), packageExternalHostScriptSource());
  chmodSync(join(root, packageStandaloneVerifyScriptPath), 0o755);
  chmodSync(join(root, packageRestoreScriptPath), 0o755);
  chmodSync(join(root, packageExternalHostScriptPath), 0o755);
}

function packageEntryPoints(root: string): V4ExternalEvidenceHandoffReport["packagedFiles"] {
  return [
    packageEntry(root, packageReadmePath, "runbook"),
    packageEntry(root, packageStandaloneVerifyScriptPath, "runbook"),
    packageEntry(root, packageRestoreScriptPath, "runbook"),
    packageEntry(root, packageExternalHostScriptPath, "runbook"),
    packageEntry(root, `${packageDir}/${reportPath}`, "runbook"),
    packageEntry(root, `${packageDir}/${runbookPath}`, "runbook"),
  ];
}

function packageEntry(root: string, packagePath: string, kind: V4ExternalEvidenceHandoffFile["kind"]): V4ExternalEvidenceHandoffReport["packagedFiles"][number] {
  const fullPath = join(root, packagePath);
  if (!existsSync(fullPath)) {
    return { path: packagePath.replace(`${packageDir}/`, ""), packagePath, kind, copied: false, reason: "entry point is missing" };
  }
  const stats = statSync(fullPath);
  if (!stats.isFile()) {
    return { path: packagePath.replace(`${packageDir}/`, ""), packagePath, kind, copied: false, reason: "entry point is not a file" };
  }
  const bytes = readFileSync(fullPath);
  return {
    path: packagePath.replace(`${packageDir}/`, ""),
    packagePath,
    kind,
    copied: true,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function copyGeneratedHandoffFilesToPackage(root: string): void {
  for (const path of [reportPath, runbookPath]) {
    const sourcePath = join(root, path);
    const targetPath = join(root, packageDir, path);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}

function verifyPackagedFile(root: string, file: Record<string, unknown>): string[] {
  const path = stringValue(file.path);
  const packagePath = stringValue(file.packagePath);
  const copied = file.copied === true;
  const expectedSha = stringValue(file.sha256);
  const expectedBytes = typeof file.bytes === "number" && Number.isFinite(file.bytes) ? file.bytes : undefined;
  if (!path || !packagePath) return ["handoff package manifest contains a file entry without path/packagePath."];
  if (!copied) return [`${path}: handoff package manifest says the file was not copied.`];
  if (packagePath.includes("..") || !packagePath.startsWith(`${packageDir}/`)) {
    return [`${path}: packagePath escapes the handoff package directory: ${packagePath}`];
  }
  const fullPath = join(root, packagePath);
  if (!existsSync(fullPath)) return [`${path}: packaged file is missing at ${packagePath}.`];
  const stats = statSync(fullPath);
  if (expectedSha === "directory") {
    return stats.isDirectory() ? [] : [`${path}: expected packaged directory at ${packagePath}.`];
  }
  if (!stats.isFile()) return [`${path}: expected packaged file at ${packagePath}.`];
  const bytes = readFileSync(fullPath);
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  return [
    ...(expectedBytes === undefined || bytes.byteLength === expectedBytes ? [] : [`${path}: packaged byte length ${bytes.byteLength} does not match manifest ${expectedBytes}.`]),
    ...(expectedSha && actualSha === expectedSha ? [] : [`${path}: packaged sha256 ${actualSha} does not match manifest ${expectedSha || "missing"}.`]),
  ];
}

function verifyPackageEntryPoints(root: string): string[] {
  return [
    verifyTextFile(root, packageReadmePath, "# V4 External Evidence Handoff Package"),
    verifyTextFile(root, packageReadmePath, "## GitHub Workflow Route"),
    verifyTextFile(root, packageReadmePath, "Patch-only transfers must copy the patch files"),
    verifyTextFile(root, packageReadmePath, "gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/G3D2025 --ref main"),
    verifyTextFile(root, packageReadmePath, "gh workflow run v4-external-engine-baselines.yml --repo gchahal1982/G3D2025 --ref main -f engine=all"),
    verifyTextFile(root, packageReadmePath, "pnpm preflight:v4-parity:after-external-evidence"),
    verifyTextFile(root, packageStandaloneVerifyScriptPath, "VERIFY_PACKAGE_INTEGRITY"),
    verifyTextFile(root, packageRestoreScriptPath, "RESTORE_INTO_CHECKOUT"),
    verifyTextFile(root, packageExternalHostScriptPath, "RUN_EXTERNAL_HOST_PREFLIGHT"),
    verifyTextFile(root, `${packageDir}/${reportPath}`, "\"claimBoundary\""),
    verifyTextFile(root, `${packageDir}/${runbookPath}`, "# V4 External Evidence Handoff"),
    verifyTextFile(root, `${packageDir}/release-artifacts/v4-parity-external-evidence-pr.md`, "Standalone operator package verification also passed"),
    verifyTextFile(root, `${packageDir}/release-artifacts/v4-parity-external-evidence-pr.md`, "Patch-only transfers must copy the patch files"),
    verifyTextFile(root, `${packageDir}/release-artifacts/codingrelated-completion-audit.md`, "v4-current-handoff-supplement.patch` was regenerated from the current handoff set"),
    verifyTextFile(root, `${packageDir}/release-artifacts/codingrelated-completion-audit.md`, "two-patch simulation against `HEAD^` also passes"),
    verifyOptionalSupplementPatch(root),
  ].flat();
}

function verifyOptionalSupplementPatch(root: string): string[] {
  const path = `${packageDir}/release-artifacts/v4-current-handoff-supplement.patch`;
  if (!existsSync(join(root, path))) return [];
  return [
    verifyTextFile(root, path, "restorePreflight"),
    verifyTextFile(root, path, "verificationScope"),
    verifyTextFile(root, path, "Cannot restore because the handoff package failed integrity verification."),
    verifyTextFile(root, path, "Handoff integrity is now split by scope"),
    verifyTextFile(root, path, "Repo-side handoff verification scope"),
    verifyTextFile(root, path, "Standalone package verification scope"),
    verifyTextFile(root, path, "current handoff set"),
    verifyTextFile(root, path, "two-patch simulation"),
  ].flat();
}

function verifyPackageArchive(root: string): string[] {
  const fullPath = join(root, packageArchivePath);
  if (!existsSync(fullPath)) return [`${packageArchivePath} is missing.`];
  if (!statSync(fullPath).isFile()) return [`${packageArchivePath} is not a file.`];
  const archiveBytes = readFileSync(fullPath);
  const actualSha256 = createHash("sha256").update(archiveBytes).digest("hex");
  const shaPath = join(root, packageArchiveSha256Path);
  const shaViolations = !existsSync(shaPath)
    ? [`${packageArchiveSha256Path} is missing.`]
    : verifyArchiveSha256Sidecar(root, actualSha256);
  const entries = readTarGzEntries(archiveBytes);
  const requiredEntries = [
    "v4-external-evidence-handoff/manifest.json",
    "v4-external-evidence-handoff/START_HERE.md",
    "v4-external-evidence-handoff/VERIFY_PACKAGE_INTEGRITY.mjs",
    "v4-external-evidence-handoff/RESTORE_INTO_CHECKOUT.mjs",
    "v4-external-evidence-handoff/RUN_EXTERNAL_HOST_PREFLIGHT.mjs",
    "v4-external-evidence-handoff/tests/reports/v4-external-evidence-handoff.json",
    "v4-external-evidence-handoff/tests/reports/v4-external-evidence-handoff.md",
    "v4-external-evidence-handoff/tests/reports/v4-external-host-doctor.json",
    "v4-external-evidence-handoff/tests/reports/v4-external-host-runner.json",
    "v4-external-evidence-handoff/docs/project/v4-parity-execution-prompt.md",
    "v4-external-evidence-handoff/release-artifacts/v4-external-evidence-operator-runbook.md",
    "v4-external-evidence-handoff/release-artifacts/v4-parity-external-evidence-pr.md",
    "v4-external-evidence-handoff/release-artifacts/codingrelated-completion-audit.md",
    "v4-external-evidence-handoff/tests/unit/tools/v4-validation.test.ts",
    "v4-external-evidence-handoff/tools/external-demo-export/index.ts",
    "v4-external-evidence-handoff/tools/external-demo-validation/index.ts",
    "v4-external-evidence-handoff/tools/v4-claim-gates/index.ts",
    "v4-external-evidence-handoff/tools/v4-assets/index.ts",
    "v4-external-evidence-handoff/tools/v4-current-capability/index.ts",
    "v4-external-evidence-handoff/tools/v4-reporting/index.ts",
    "v4-external-evidence-handoff/tools/v4-parity-status/index.ts",
    "v4-external-evidence-handoff/tools/v4-local-port-status/index.ts",
    "v4-external-evidence-handoff/tools/v4-external-engine-baselines/index.ts",
    "v4-external-evidence-handoff/tools/v4-report-freshness/index.ts",
    "v4-external-evidence-handoff/tools/v4-github-external-readiness/index.ts",
    "v4-external-evidence-handoff/tools/v4-pbr-reference-readiness/index.ts",
    "v4-external-evidence-handoff/tools/v4-shadow-map-readiness/index.ts",
    "v4-external-evidence-handoff/tools/v4-hdr-render-target-readiness/index.ts",
    "v4-external-evidence-handoff/tools/v4-production-readiness/index.ts",
    "v4-external-evidence-handoff/tools/v4-pbr-gltf-readiness/index.ts",
    "v4-external-evidence-handoff/tools/v4-ecosystem-readiness/index.ts",
    "v4-external-evidence-handoff/tools/v4-broad-parity-readiness/index.ts",
    "v4-external-evidence-handoff/tools/v4-completion-audit/index.ts",
    "v4-external-evidence-handoff/tools/v4-product-visual-parity/index.ts",
    "v4-external-evidence-handoff/tools/v4-product-visual-parity/productScene.ts",
    "v4-external-evidence-handoff/tools/v4-pbr-visual-parity/index.ts",
    "v4-external-evidence-handoff/tools/v4-shadow-visual-parity/index.ts",
    "v4-external-evidence-handoff/tools/v4-hdr-visual-parity/index.ts",
    "v4-external-evidence-handoff/tools/v4-postprocess-suite/index.ts",
    "v4-external-evidence-handoff/tools/v4-unity-unreal-parity/index.ts",
    "v4-external-evidence-handoff/tools/static-demo-server-smoke/index.ts",
    "v4-external-evidence-handoff/tools/package-provenance/index.ts",
    "v4-external-evidence-handoff/tools/compare-engines/index.ts",
  ];
  return [
    ...shaViolations,
    ...verifyTransferManifest(root, archiveBytes.byteLength, actualSha256),
    ...requiredEntries
    .filter((entry) => !entries.has(entry))
    .map((entry) => `${packageArchivePath} is missing archived entry ${entry}.`),
  ];
}

function verifyTransferManifest(root: string, archiveBytes: number, archiveSha256: string): string[] {
  const manifest = readJson(root, transferManifestPath);
  const archive = isRecord(manifest?.archive) ? manifest.archive : {};
  return [
    ...(manifest?.schemaVersion === "g3d-v4-external-evidence-transfer-v1" ? [] : [`${transferManifestPath} is missing or has an invalid schemaVersion.`]),
    ...(manifest?.claimBoundary === "This handoff only packages and inventories local inputs for external Unity/Unreal/public-deployment evidence capture. It is not parity evidence and does not clear any external artifact by itself." ? [] : [`${transferManifestPath} is missing the handoff claim boundary.`]),
    ...(manifest?.packageDir === packageDir ? [] : [`${transferManifestPath} packageDir does not match ${packageDir}.`]),
    ...(manifest?.packageArchivePath === packageArchivePath ? [] : [`${transferManifestPath} packageArchivePath does not match ${packageArchivePath}.`]),
    ...(manifest?.packageArchiveSha256Path === packageArchiveSha256Path ? [] : [`${transferManifestPath} packageArchiveSha256Path does not match ${packageArchiveSha256Path}.`]),
    ...(manifest?.packageManifestPath === packageManifestPath ? [] : [`${transferManifestPath} packageManifestPath does not match ${packageManifestPath}.`]),
    ...(archive.bytes === archiveBytes ? [] : [`${transferManifestPath} archive bytes ${String(archive.bytes)} do not match ${archiveBytes}.`]),
    ...(archive.sha256 === archiveSha256 ? [] : [`${transferManifestPath} archive sha256 ${String(archive.sha256)} does not match ${archiveSha256}.`]),
    ...(manifest?.archiveBytes === archiveBytes ? [] : [`${transferManifestPath} archiveBytes ${String(manifest?.archiveBytes)} do not match ${archiveBytes}.`]),
    ...(manifest?.archiveSha256 === archiveSha256 ? [] : [`${transferManifestPath} archiveSha256 ${String(manifest?.archiveSha256)} does not match ${archiveSha256}.`]),
    ...verifyTransferCommandMarkers(manifest),
  ];
}

function verifyTransferCommandMarkers(manifest: Record<string, unknown> | null): string[] {
  const commands = Array.isArray(manifest?.transferCommands) ? manifest.transferCommands.filter((command): command is string => typeof command === "string") : [];
  const text = commands.join("\n");
  return [
    ...(text.includes(packageArchiveSha256Path) ? [] : [`${transferManifestPath} is missing the archive checksum command.`]),
    ...(text.includes(packageArchivePath) ? [] : [`${transferManifestPath} is missing the archive extraction command.`]),
    ...(text.includes("node VERIFY_PACKAGE_INTEGRITY.mjs") ? [] : [`${transferManifestPath} is missing the standalone integrity command.`]),
    ...(text.includes("node RESTORE_INTO_CHECKOUT.mjs --dry-run /absolute/path/to/G3D") ? [] : [`${transferManifestPath} is missing the restore dry-run command.`]),
    ...(text.includes("node RESTORE_INTO_CHECKOUT.mjs /absolute/path/to/G3D") ? [] : [`${transferManifestPath} is missing the restore command.`]),
    ...(text.includes("node RUN_EXTERNAL_HOST_PREFLIGHT.mjs /absolute/path/to/G3D") ? [] : [`${transferManifestPath} is missing the external-host preflight command.`]),
    ...(text.includes("pnpm run:v4-external-host-evidence:execute") ? [] : [`${transferManifestPath} is missing the external-host runner execution command.`]),
    ...(text.includes("pnpm preflight:v4-parity:after-external-evidence") ? [] : [`${transferManifestPath} is missing the post-external parity preflight command.`]),
    ...(text.includes("pnpm status:v4-parity") ? [] : [`${transferManifestPath} is missing the final parity status command.`]),
  ];
}

function verifyArchiveSha256Sidecar(root: string, actualSha256: string): string[] {
  const text = readFileSync(join(root, packageArchiveSha256Path), "utf8").trim();
  const [expectedSha256, expectedPath] = text.split(/\s+/u);
  return [
    ...(expectedSha256 === actualSha256 ? [] : [`${packageArchiveSha256Path} sha256 ${expectedSha256 || "missing"} does not match archive ${actualSha256}.`]),
    ...(expectedPath === packageArchivePath ? [] : [`${packageArchiveSha256Path} path ${expectedPath || "missing"} does not match ${packageArchivePath}.`]),
  ];
}

function readTarGzEntries(bytes: Buffer): Set<string> {
  const data = gunzipSync(bytes);
  const entries = new Set<string>();
  let offset = 0;
  while (offset + 512 <= data.byteLength) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/u, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/u, "");
    const sizeText = header.subarray(124, 136).toString("ascii").replace(/\0.*$/u, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    entries.add(prefix ? `${prefix}/${name}` : name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function verifyTextFile(root: string, path: string, requiredText: string): string[] {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) return [`${path} is missing from the handoff package.`];
  if (!statSync(fullPath).isFile()) return [`${path} is not a file in the handoff package.`];
  const text = readFileSync(fullPath, "utf8");
  return text.includes(requiredText) ? [] : [`${path} is missing required marker: ${requiredText}`];
}

function normalizeArchivePath(path: string): string {
  return path.split("\\").join("/");
}

function packageReadmeSource(report: V4ExternalEvidenceHandoffReport): string {
  const firstBlocked = report.blockedArtifactChecklist[0];
  return `# V4 External Evidence Handoff Package

This directory is a portable local input package for the remaining Unity, Unreal, and public HTTPS deployment evidence work. It is not parity evidence by itself.

## Current Status

- Current parity completion is \`2 / 13\`: \`full-gltf-parity\` and \`full-webgpu-parity\` are achieved by local readiness reports.
- Remaining criteria are blocked by real external Unity/Unreal same-scene captures, durable public HTTPS deployment smoke evidence, full PBR external/reference parity, production HDR/shadow/postprocess parity, production readiness, and broad Three.js/Babylon superiority gates.
- First missing host capability: \`${report.firstMissingCapability ?? "none"}\`.
- First blocked artifact: \`${report.firstBlockedArtifact ?? "none"}\`.
- This package can be transferred when \`pnpm verify:v4-external-evidence-handoff\` passes, but parity remains blocked until \`tests/reports/v4-external-evidence-readiness.json.externalEvidenceReady === true\` and \`pnpm status:v4-parity\` reports \`ok: true\`.
${firstBlocked ? `
## First Blocked Artifact

- Artifact: \`${firstBlocked.areaId}/${firstBlocked.id}\`
- Kind: \`${firstBlocked.kind || "unknown"}\`
${firstBlocked.path ? `- Target path: \`${firstBlocked.path}\`\n` : ""}${firstBlocked.command ? `- Prepared command: \`${firstBlocked.command}\`\n` : ""}
${firstBlocked.localEvidence.length > 0 ? `Local evidence already present:
${firstBlocked.localEvidence.map((entry) => `- ${entry}`).join("\n")}
` : ""}
${firstBlocked.requiredExternalEvidence.length > 0 ? `External evidence still required:
${firstBlocked.requiredExternalEvidence.map((entry) => `- ${entry}`).join("\n")}
` : ""}
${firstBlocked.blockers.length > 0 ? `Current blockers:
${firstBlocked.blockers.map((entry) => `- ${entry}`).join("\n")}
` : ""}
` : ""}

## Validate Package Integrity

- \`pnpm verify:v4-external-evidence-handoff\`
- \`node VERIFY_PACKAGE_INTEGRITY.mjs\` from inside this package after extracting or transferring it.

## Transfer Manifest Verification

- The archive cannot contain its own post-archive verification record without changing its checksum.
- After \`pnpm verify:v4-external-evidence-handoff\` passes, inspect \`${transferManifestPath}.packageVerification\` for \`ok: true\`, \`checkedFiles\`, and \`violations: []\`.
- If only the archive is transferred without the sidecar transfer manifest, rerun \`node VERIFY_PACKAGE_INTEGRITY.mjs\` from inside the extracted package before restoring it into a checkout.
- \`node VERIFY_PACKAGE_INTEGRITY.mjs\` checks package-internal files only. It does not check the outer archive checksum, the sidecar transfer manifest, or any Unity/Unreal/public deployment parity evidence.

## Restore Into A Repo Checkout

This package is an overlay for a full Galileo3D checkout, not a standalone repository. On the Unity/Unreal/deployment machine, clone or update the repo first, then restore this package into that checkout:

- \`node VERIFY_PACKAGE_INTEGRITY.mjs\`
- \`node RESTORE_INTO_CHECKOUT.mjs --dry-run /absolute/path/to/G3D\`
- \`node RESTORE_INTO_CHECKOUT.mjs /absolute/path/to/G3D\`
- \`node RUN_EXTERNAL_HOST_PREFLIGHT.mjs /absolute/path/to/G3D\`
- \`pnpm doctor:v4-external-host\`
- \`pnpm doctor:v4-external-host:strict\`
- \`pnpm run:v4-external-host-evidence\`
- \`pnpm run:v4-external-host-evidence:execute\`

Patch-only transfers must copy the patch files into \`release-artifacts/\` before applying them. The supplement patch is a transfer artifact carried by this package; applying it from an arbitrary temporary path updates the checkout content but does not self-materialize \`release-artifacts/v4-current-handoff-supplement.patch\` inside that checkout. Use \`RESTORE_INTO_CHECKOUT.mjs\` when you need the checkout to contain the patch artifacts exactly as packaged.

## Main Reports

- Handoff report: \`tests/reports/v4-external-evidence-handoff.json\`
- Handoff runbook: \`tests/reports/v4-external-evidence-handoff.md\`
- Missing-artifacts runbook: \`tests/reports/v4-external-evidence-missing-artifacts.md\`
- Completion runbook: \`tests/reports/v4-completion-audit-runbook.md\`
- External host doctor: \`tests/reports/v4-external-host-doctor.json\`
- Package manifest: \`release-artifacts/v4-external-evidence-handoff/manifest.json\`
- Transfer archive: \`release-artifacts/v4-external-evidence-handoff.tar.gz\`
- Transfer archive checksum: \`release-artifacts/v4-external-evidence-handoff.tar.gz.sha256\`
- Transfer manifest: \`release-artifacts/v4-external-evidence-handoff.transfer.json\`

## Readiness Signals

- \`pnpm doctor:v4-external-host\` prints host readiness, handoff package integrity, external evidence readiness, the first missing host capability, first blocked artifact details, and the missing-artifacts runbook path.
- \`pnpm run:v4-external-host-evidence\` writes \`tests/reports/v4-external-host-runner.json\`; inspect each command's \`expectedEvidencePaths\` and \`validationCommands\` before running execute mode.
- \`tests/reports/v4-external-evidence-missing-artifacts.md\` separates local evidence already present from external evidence still required for each blocked area.
- The package is ready to transfer when \`pnpm verify:v4-external-evidence-handoff\` passes, but parity remains blocked until \`tests/reports/v4-external-evidence-readiness.json.externalEvidenceReady === true\`.

## External Hosts

- Unity: set \`G3D_UNITY_EDITOR\`, run the Unity CLI smoke, then run \`node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project\`.
- Unreal: set \`G3D_UNREAL_EDITOR\`, run the Unreal CLI smoke, then run \`node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject\`.
- Public deployment: deploy \`release-artifacts/external-demos/0.1.0-alpha.0\` to durable HTTPS, then run \`G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment\`.

## GitHub Workflow Route

If using GitHub Actions instead of running the external hosts manually:

- Land \`.github/workflows/v4-public-demo-deploy.yml\` and \`.github/workflows/v4-external-engine-baselines.yml\` on the repository default branch.
- Enable GitHub Pages.
- Provision self-hosted runners labeled \`unity\` and \`unreal\`.
- Configure \`G3D_UNITY_EDITOR\` and \`G3D_UNREAL_EDITOR\`; the workflow sets \`G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true\` internally.
- Trigger \`gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/G3D2025 --ref main\`.
- Trigger \`gh workflow run v4-external-engine-baselines.yml --repo gchahal1982/G3D2025 --ref main -f engine=all\`.
- Download and ingest the workflow artifacts with \`pnpm ingest:public-demo-deployment-reports\` and \`pnpm ingest:v4-external-baseline-artifacts\`.

After collecting and ingesting external artifacts, rerun \`pnpm preflight:v4-parity:after-external-evidence\` and \`pnpm status:v4-parity\`. Do not claim parity unless \`pnpm status:v4-parity\` reports \`ok: true\` and \`13 / 13\` criteria achieved.
`;
}

function packageStandaloneVerifyScriptSource(): string {
  return `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(packageRoot, "manifest.json");
const packagePrefix = "release-artifacts/v4-external-evidence-handoff/";

if (!existsSync(manifestPath)) {
  throw new Error(\`VERIFY_PACKAGE_INTEGRITY could not find manifest.json next to this script: \${manifestPath}\`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entries = [
  ...(Array.isArray(manifest.files) ? manifest.files : []),
  ...(Array.isArray(manifest.entryPoints) ? manifest.entryPoints : [])
];
const violations = [
  ...(manifest.schemaVersion === "g3d-v4-external-evidence-handoff-package-v1" ? [] : ["manifest schemaVersion is invalid"]),
  ...entries.flatMap(verifyEntry)
];

console.log(JSON.stringify({
  ok: violations.length === 0 && entries.length > 0,
  command: "VERIFY_PACKAGE_INTEGRITY",
  verificationScope: {
    packageInternalEntries: true,
    archiveAndSidecar: false,
    externalParityEvidence: false
  },
  packageRoot,
  manifestPath,
  checkedFiles: entries.length,
  violations
}, null, 2));

if (violations.length > 0 || entries.length === 0) process.exit(1);

function verifyEntry(entry) {
  if (!entry || typeof entry !== "object") return ["manifest contains a non-object entry"];
  if (entry.copied !== true) return [\`\${entry.path || "unknown"}: manifest says entry was not copied\`];
  if (typeof entry.packagePath !== "string" || !entry.packagePath.startsWith(packagePrefix)) {
    return [\`\${entry.path || "unknown"}: packagePath is missing or not package-confined\`];
  }
  const relativePath = entry.packagePath.slice(packagePrefix.length);
  if (!relativePath || relativePath.includes("..")) {
    return [\`\${entry.path || "unknown"}: packagePath escapes package root\`];
  }
  const fullPath = resolve(packageRoot, relativePath);
  if (!fullPath.startsWith(packageRoot)) return [\`\${entry.path || relativePath}: resolved path escapes package root\`];
  if (!existsSync(fullPath)) return [\`\${entry.path || relativePath}: packaged entry is missing\`];
  const stats = statSync(fullPath);
  if (entry.sha256 === "directory") return stats.isDirectory() ? [] : [\`\${entry.path || relativePath}: expected directory\`];
  if (!stats.isFile()) return [\`\${entry.path || relativePath}: expected file\`];
  const bytes = readFileSync(fullPath);
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  return [
    ...(typeof entry.bytes === "number" && bytes.byteLength !== entry.bytes ? [\`\${entry.path || relativePath}: byte length \${bytes.byteLength} does not match manifest \${entry.bytes}\`] : []),
    ...(typeof entry.sha256 === "string" && actualSha !== entry.sha256 ? [\`\${entry.path || relativePath}: sha256 \${actualSha} does not match manifest \${entry.sha256}\`] : [])
  ];
}
`;
}

function packageRestoreScriptSource(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetArg = args.find((arg) => arg !== "--dry-run");
const targetRoot = resolve(targetArg || process.cwd());
const entries = [
    ".github",
    "docs/project/v4-parity-execution-prompt.md",
    "docs",
    "fixtures",
    "package.json",
    "tools/external-demo-export",
    "tools/external-demo-validation",
    "examples/portfolio",
    "packages/assets/src/AssetImportPreflight.ts",
    "packages/assets/src/OBJLoader.ts",
    "packages/assets/src/index.ts",
    "packages/assets/tests/assets.test.ts",
    "release-artifacts/external-demos",
    "release-artifacts/v4-external-evidence-operator-runbook.md",
    "release-artifacts/v4-parity-external-evidence-pr.md",
    "release-artifacts/codingrelated-completion-audit.md",
    "release-artifacts/v4-parity-external-evidence-workflows.patch",
    "release-artifacts/v4-current-handoff-supplement.patch",
    "tests/reports",
    "tests/unit/assets/asset-import-preflight.test.ts",
    "tests/browser/example-portfolio.spec.ts",
    "tests/browser/example-screenshot-audit-v4.spec.ts",
    "tests/unit/tools/v4-validation.test.ts",
    "tools/v4-examples",
    "tools/public-demo-deployment-artifacts",
    "tools/public-demo-deployment-smoke",
    "tools/v4-github-external-readiness",
    "tools/v4-local-port-status",
    "tools/v4-parity-status",
    "tools/v4-reporting",
    "tools/v4-claim-gates",
    "tools/v4-assets",
    "tools/v4-current-capability",
    "tools/v4-external-engine-baselines",
    "tools/v4-report-freshness",
    "tools/v4-pbr-reference-readiness",
    "tools/v4-shadow-map-readiness",
    "tools/v4-hdr-render-target-readiness",
    "tools/v4-production-readiness",
    "tools/v4-pbr-gltf-readiness",
    "tools/v4-ecosystem-readiness",
    "tools/v4-broad-parity-readiness",
    "tools/v4-completion-audit",
    "tools/v4-product-visual-parity",
    "tools/v4-pbr-visual-parity",
    "tools/v4-shadow-visual-parity",
    "tools/v4-hdr-visual-parity",
    "tools/v4-postprocess-suite",
    "tools/v4-unity-unreal-parity",
    "tools/v4-external-evidence-handoff",
    "tools/v4-external-evidence-readiness",
    "tools/v4-external-host-doctor",
    "tools/v4-external-host-runner",
    "tools/static-demo-server-smoke",
    "tools/package-provenance",
    "tools/compare-engines",
  ];
const restorePreflight = verifyPackageBeforeRestore();

if (!existsSync(targetRoot)) {
  throw new Error(\`Target checkout does not exist: \${targetRoot}\`);
}
if (!existsSync(resolve(targetRoot, "package.json"))) {
  throw new Error(\`Target does not look like a Galileo3D checkout because package.json is missing: \${targetRoot}\`);
}

const restored = [];
for (const entry of entries) {
  const source = resolve(packageRoot, entry);
  if (!existsSync(source)) continue;
  const target = resolve(targetRoot, entry);
  if (!dryRun) {
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true, force: true });
  }
  restored.push({ entry, kind: statSync(source).isDirectory() ? "directory" : "file" });
}

console.log(JSON.stringify({
  ok: true,
  command: "RESTORE_INTO_CHECKOUT",
  dryRun,
  packageRoot,
  targetRoot,
  restorePreflight,
  restored,
  nextCommands: [
    "pnpm verify:v4-external-evidence-handoff",
    "pnpm doctor:v4-external-host",
    "pnpm run:v4-external-host-evidence",
    "pnpm run:v4-external-host-evidence:execute",
    "pnpm status:v4-local-port",
    "pnpm status:v4-parity",
    "pnpm preflight:v4-parity:after-external-evidence"
  ]
}, null, 2));

function verifyPackageBeforeRestore() {
  const verifier = resolve(packageRoot, "VERIFY_PACKAGE_INTEGRITY.mjs");
  if (!existsSync(verifier)) {
    console.log(JSON.stringify({
      ok: false,
      command: "RESTORE_INTO_CHECKOUT",
      packageRoot,
      reason: "Cannot restore because VERIFY_PACKAGE_INTEGRITY.mjs is missing from the handoff package."
    }, null, 2));
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [verifier], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  let parsed = null;
  try {
    parsed = result.stdout ? JSON.parse(result.stdout) : null;
  } catch (error) {
    parsed = { parseError: error instanceof Error ? error.message : String(error) };
  }
  if (result.status !== 0 || !parsed || parsed.ok !== true) {
    console.log(JSON.stringify({
      ok: false,
      command: "RESTORE_INTO_CHECKOUT",
      packageRoot,
      verifierStatus: result.status,
      verifierStdout: result.stdout || "",
      verifierStderr: result.stderr || "",
      verifierResult: parsed,
      reason: "Cannot restore because the handoff package failed integrity verification."
    }, null, 2));
    process.exit(result.status ?? 1);
  }
  return {
    ok: true,
    command: "VERIFY_PACKAGE_INTEGRITY",
    checkedFiles: typeof parsed.checkedFiles === "number" ? parsed.checkedFiles : 0,
    verificationScope: parsed.verificationScope ?? null
  };
}
`;
}

function packageExternalHostScriptSource(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const targetRoot = resolve(process.argv[2] || process.cwd());
const doctorReportPath = "tests/reports/v4-external-host-doctor.json";

if (!existsSync(resolve(targetRoot, "package.json"))) {
  throw new Error(\`Target does not look like a Galileo3D checkout because package.json is missing: \${targetRoot}\`);
}

const doctor = spawnSync("pnpm", ["doctor:v4-external-host:strict"], {
  cwd: targetRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32"
});

if (doctor.status !== 0) {
  console.log(JSON.stringify({
    ok: false,
    command: "RUN_EXTERNAL_HOST_PREFLIGHT",
    targetRoot,
    doctorStatus: doctor.status,
    doctorStdout: doctor.stdout || "",
    doctorStderr: doctor.stderr || "",
    doctorReportPath,
    doctorSummary: readDoctorSummary(),
    reason: "External host doctor failed. Fix the missing Unity/Unreal/public deployment capabilities and rerun this command.",
    nextCommand: "pnpm doctor:v4-external-host"
  }, null, 2));
  process.exit(doctor.status ?? 1);
}

console.log(JSON.stringify({
  ok: true,
  command: "RUN_EXTERNAL_HOST_PREFLIGHT",
  targetRoot,
  doctorStatus: doctor.status,
  doctorStdout: doctor.stdout || "",
  doctorStderr: doctor.stderr || "",
  doctorReportPath,
  doctorSummary: readDoctorSummary(),
  nextCommands: [
    "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json",
    "node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project",
    "node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json",
    "node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject",
    "G3D_PUBLIC_DEMO_URL=https://your-public-demo.example/ pnpm verify:public-demo-deployment",
    "pnpm run:v4-external-host-evidence:execute",
    "pnpm refresh:v4-readiness-reports",
    "pnpm status:v4-parity",
    "pnpm preflight:v4-parity:after-external-evidence"
  ]
}, null, 2));

function readDoctorSummary() {
  const fullPath = resolve(targetRoot, doctorReportPath);
  if (!existsSync(fullPath)) return null;
  try {
    const report = JSON.parse(readFileSync(fullPath, "utf8"));
    return {
      externalHostReady: report.externalHostReady === true,
      handoffPackageReady: report.handoffPackageReady === true,
      externalEvidenceReady: report.externalEvidenceReady === true,
      firstMissingCapability: typeof report.firstMissingCapability === "string" ? report.firstMissingCapability : null,
      firstBlockedArtifact: typeof report.firstBlockedArtifact === "string" ? report.firstBlockedArtifact : null,
      missingArtifactRunbookPath: typeof report.missingArtifactRunbookPath === "string" ? report.missingArtifactRunbookPath : null
    };
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}
`;
}

function artifactChecklist(externalEvidence: Record<string, unknown> | null): Record<string, unknown>[] {
  return Array.isArray(externalEvidence?.artifactChecklist) ? externalEvidence.artifactChecklist.filter(isRecord) : [];
}

function uniqueByPath(values: readonly { readonly path: string; readonly kind: V4ExternalEvidenceHandoffFile["kind"] }[]): readonly { readonly path: string; readonly kind: V4ExternalEvidenceHandoffFile["kind"] }[] {
  const seen = new Set<string>();
  return values.filter((entry) => {
    if (!entry.path || seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });
}

function writeMarkdown(root: string, report: V4ExternalEvidenceHandoffReport): void {
  const missingFiles = report.files.filter((file) => !file.exists);
  const lines = [
    "# V4 External Evidence Handoff",
    "",
    report.claimBoundary,
    "",
    "## Summary",
    "",
    `- Handoff files ready: ${report.handoffFilesReady ? "yes" : "no"}`,
    `- Packaged files ready: ${report.packagedFilesReady ? "yes" : "no"}`,
    `- Package directory: \`${report.packageDir}\``,
    `- Package archive: \`${report.packageArchivePath}\``,
    `- Package archive checksum: \`${report.packageArchiveSha256Path}\``,
    `- Transfer manifest: \`${report.transferManifestPath}\``,
    `- Package manifest: \`${report.packageManifestPath}\``,
    `- Package readme: \`${report.packageReadmePath}\``,
    `- Package standalone integrity script: \`${report.packageStandaloneVerifyScriptPath}\``,
    `- Package restore script: \`${report.packageRestoreScriptPath}\``,
    `- Package external-host preflight script: \`${report.packageExternalHostScriptPath}\``,
    `- Ready external artifacts: ${report.readyArtifacts}`,
    `- Blocked external artifacts: ${report.blockedArtifacts}`,
    `- First blocked artifact: ${report.firstBlockedArtifact ? `\`${report.firstBlockedArtifact}\`` : "none"}`,
    `- First missing local capability: ${report.firstMissingCapability ? `\`${report.firstMissingCapability}\`` : "none"}`,
    "",
    "## Missing Handoff Files",
    "",
    ...(missingFiles.length > 0 ? missingFiles.map((file) => `- \`${file.path}\``) : ["No handoff input files are missing."]),
    "",
    "## Command Plan",
    "",
    "### Local Refresh",
    "",
    ...report.commands.localRefresh.map((command) => `- \`${command}\``),
    "",
    "### Unity Host",
    "",
    ...report.commands.unityHost.map((command) => `- \`${command}\``),
    "",
    "### Unreal Host",
    "",
    ...report.commands.unrealHost.map((command) => `- \`${command}\``),
    "",
    "### Public Deployment Host",
    "",
    ...report.commands.publicDeploymentHost.map((command) => `- \`${command}\``),
    "",
    "### Ingest And Final Audit",
    "",
    ...report.commands.ingestAndFinalAudit.map((command) => `- \`${command}\``),
    "",
    "## Blocked Artifacts",
    "",
    ...report.blockedArtifactChecklist.map((artifact) => `- \`${artifact.areaId}/${artifact.id}\` -> ${artifact.path ? `\`${artifact.path}\`` : "no path"}${artifact.blockers.length > 0 ? `: ${artifact.blockers.join("; ")}` : ""}`),
    "",
  ];
  const fullPath = join(root, runbookPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${lines.join("\n")}\n`);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--verify")) {
    const verification = verifyAndRecordV4ExternalEvidenceHandoffPackage();
    console.log(JSON.stringify(verification, null, 2));
    process.exit(verification.ok ? 0 : 1);
  }
  const report = createV4ExternalEvidenceHandoffReport();
  console.log(JSON.stringify({
    ok: report.ok,
    handoffFilesReady: report.handoffFilesReady,
    packagedFilesReady: report.packagedFilesReady,
    blockedArtifacts: report.blockedArtifacts,
    firstBlockedArtifact: report.firstBlockedArtifact,
    packageDir: report.packageDir,
    packageArchive: report.packageArchivePath,
    packageArchiveSha256: report.packageArchiveSha256Path,
    transferManifest: report.transferManifestPath,
    packageManifest: report.packageManifestPath,
    packageReadme: report.packageReadmePath,
    packageStandaloneVerifyScript: report.packageStandaloneVerifyScriptPath,
    packageRestoreScript: report.packageRestoreScriptPath,
    packageExternalHostScript: report.packageExternalHostScriptPath,
    report: report.reportPath,
    runbook: report.runbookPath,
  }, null, 2));
}
