import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { baseReport, isRecord, readJson, writeJson } from "../external-parity-reporting/index.js";

export interface ExternalParityProductionReadinessReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly productionReady: boolean;
  readonly releaseAreas: readonly {
    readonly id: string;
    readonly requiredForProduction: string;
    readonly currentEvidence: string;
    readonly ready: boolean;
    readonly blockers: readonly string[];
  }[];
  readonly violations: readonly string[];
}

export interface PublicDemoDeploymentEvidenceValidation {
  readonly ok: boolean;
  readonly blockers: readonly string[];
  readonly expectedChecks: number;
  readonly actualChecks: number;
}

const reportPath = "tests/reports/external-parity-production-readiness.json";
const sourceFiles = [
  "tools/external-parity-production-readiness/index.ts",
  "package.json",
  "docs/project/security-policy.md",
  "docs/project/support-policy.md",
  "docs/project/compatibility.md",
  "docs/project/deployment-rollback.md",
  "docs/project/release-process.md",
  "docs/project/product-studio-decision-gates.md",
  "docs/project/documentation-index.md",
  "tests/reports/external-parity-current-capability.json",
  "tests/reports/external-parity-rendering.json",
  "tests/reports/external-parity-asset-corpus.json",
  "tests/reports/external-parity-engine-comparison.json",
  "tests/reports/external-parity-visual-quality.json",
  "tests/reports/versioned-release.json",
  "tests/reports/package-install-smoke.json",
  "tests/reports/package-provenance.json",
  "tests/reports/external-demo-static-export.json",
  "tests/reports/static-demo-server-smoke.json",
  "tests/reports/public-demo-deployment-smoke.json",
  "tests/reports/public-demo-deployment-runbook.md",
  "tools/static-demo-server-smoke/index.ts",
  "tools/public-demo-deployment-smoke/index.ts",
  "tools/public-demo-deployment-artifacts/index.ts",
  ".github/workflows/public-demo-deploy.yml",
] as const;

export function createExternalParityProductionReadinessReport(root = process.cwd()): ExternalParityProductionReadinessReport {
  const currentCapability = readJson(root, "tests/reports/external-parity-current-capability.json");
  const rendering = readJson(root, "tests/reports/external-parity-rendering.json");
  const assets = readJson(root, "tests/reports/external-parity-asset-corpus.json");
  const engineComparison = readJson(root, "tests/reports/external-parity-engine-comparison.json");
  const visualQuality = readJson(root, "tests/reports/external-parity-visual-quality.json");
  const broadReadiness = readJson(root, "tests/reports/external-parity-broad-parity-readiness.json");
  const versionedRelease = readJson(root, "tests/reports/versioned-release.json");
  const packageInstallSmoke = readJson(root, "tests/reports/package-install-smoke.json");
  const packageProvenance = readJson(root, "tests/reports/package-provenance.json");
  const staticExport = readJson(root, "tests/reports/external-demo-static-export.json");
  const staticDemoServerSmoke = readJson(root, "tests/reports/static-demo-server-smoke.json");
  const publicDemoDeploymentSmoke = readJson(root, "tests/reports/public-demo-deployment-smoke.json");
  const staticExportSourceValidation = validateReportSourceFileHashes(root, staticExport, "static demo export");
  const publicDemoDeploymentValidation = validatePublicDemoDeploymentSmokeEvidence(root, publicDemoDeploymentSmoke, staticExport);
  const publicDemoWorkflowValidation = validatePublicDemoDeploymentWorkflow(root);
  const packageJsonExists = existsSync(join(root, "package.json"));
  const operationalPolicyFiles = [
    "docs/project/security-policy.md",
    "docs/project/support-policy.md",
    "docs/project/compatibility.md",
    "docs/project/deployment-rollback.md",
    "docs/project/release-process.md",
  ] as const;
  const operationalPolicyBlockers = operationalPolicyFiles
    .filter((path) => !existsSync(join(root, path)))
    .map((path) => `Required operational policy file is missing: ${path}`);
  const releaseAreas = [
    releaseArea("local-verification", "All scoped External parity verification commands pass on this checkout.", "Core External parity reports are present and locally generated.", [
      ...(currentCapability?.ok === true ? [] : ["external-parity-current-capability report is missing or failing"]),
      ...(rendering?.ok === true ? [] : ["external-parity-rendering report is missing or failing"]),
      ...(assets?.ok === true ? [] : ["external-parity-asset-corpus report is missing or failing"]),
      ...(engineComparison?.ok === true ? [] : ["external-parity-engine-comparison report is missing or failing"]),
      ...(visualQuality?.ok === true ? [] : ["external-parity-visual-quality report is missing or failing"]),
    ]),
    releaseArea("claim-boundary", "Production claim boundaries are clean and broad competitor/replacement claims are blocked until evidence exists.", "Broad readiness report exists and currently blocks broad claims.", [
      ...(broadReadiness?.claimReady === false ? [] : ["broad readiness report is missing or not blocking unresolved broad claims"]),
      ...(Number((broadReadiness?.summary as Record<string, unknown> | undefined)?.blockedClaims ?? 0) > 0 ? [] : ["broad readiness report does not list unresolved blockers"]),
    ]),
    releaseArea("package-release", "A published release artifact, versioning policy, changelog, provenance, and clean install reproduction exist.", packageProvenance?.ok === true ? "Local alpha tarball artifact, release-artifact manifest, SHA-256 verification, external clean npm-project install smoke evidence, and signed local provenance exist." : packageInstallSmoke?.ok === true ? "Local alpha tarball artifact, release-artifact manifest, SHA-256 verification, and external clean npm-project install smoke evidence exist." : versionedRelease?.ok === true ? "Local alpha tarball artifact, release-artifact manifest, package version, and SHA-256 verification exist." : packageJsonExists ? "package.json exists and docs/project/release-process.md defines release-candidate and publishing rules." : "package.json missing.", [
      ...(packageInstallSmoke?.ok === true ? [] : ["No clean external install/import smoke reproduction for the packed tarball is attached."]),
      ...(versionedRelease?.ok === true ? [] : ["No local package tarball artifact or versioned-release verification evidence is attached."]),
      ...(packageProvenance?.ok === true && isRecord(packageProvenance.signature) && packageProvenance.signature.verified === true ? [] : ["No npm/package registry publication or signed provenance evidence is attached."]),
    ]),
    releaseArea("operational-support", "Security, support, compatibility, deprecation, incident, and upgrade policies exist.", operationalPolicyBlockers.length === 0 ? "docs/project/security-policy.md, docs/project/support-policy.md, docs/project/compatibility.md, and docs/project/release-process.md exist and explicitly keep production claims bounded." : "Operational policy files are incomplete.", operationalPolicyBlockers),
    releaseArea("deployment", "Public demo deployment and build artifact validation exist for required examples.", publicDemoDeploymentValidation.ok ? "Durable public demo URL validation, local static demo export, SHA-256 integrity manifest, deployment command plan, rollback plan, validated GitHub Pages deployment workflow, and local HTTP static-server smoke validation exist with per-file status/hash/content-marker evidence." : staticDemoServerSmoke?.ok === true ? "Local static demo export, SHA-256 integrity manifest, deployment command plan, rollback plan, validated GitHub Pages deployment workflow, and local HTTP static-server smoke validation exist. Public URL validation remains blocked until A3D_PUBLIC_DEMO_URL is smoke-tested." : hasStaticExportIntegrity(root, staticExport) ? "Local static demo export, SHA-256 integrity manifest, deployment command plan, validated GitHub Pages deployment workflow, and rollback plan exist." : "Local browser screenshots and reports exist for examples.", [
      ...(publicDemoDeploymentValidation.ok ? [] : [
        "No durable public deployment URL validation is attached for External parity examples with current per-file HTTP/hash/content-marker evidence. Run `A3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment` against the deployed static demo origin.",
        "Use `tests/reports/public-demo-deployment-runbook.md` for the exact files, SHA-256 values, content markers, and validation commands required by the public deployment smoke gate.",
        ...publicDemoDeploymentValidation.blockers.map((blocker) => `public deployment evidence: ${blocker}`),
      ]),
      ...staticExportSourceValidation.blockers,
      ...(hasStaticExportIntegrity(root, staticExport) ? [] : ["No CDN/static artifact integrity or deployment rollback evidence is attached."]),
      ...(staticDemoServerSmoke?.ok === true ? [] : ["No local HTTP static-server smoke validation is attached for the exported demos."]),
      ...publicDemoWorkflowValidation.blockers,
    ]),
  ] as const;
  const violations = releaseAreas.flatMap((area) => area.blockers.map((blocker) => `${area.id}: ${blocker}`));
  const productionReady = releaseAreas.every((area) => area.ready);
  return {
    ...baseReport(root, {
      ok: true,
      command: "pnpm audit:external-parity-production-readiness",
      runIdPrefix: "external-parity-production-readiness",
      sourceFiles: [
        ...sourceFiles,
        ...staticExportSourceValidation.sourceFiles,
        ...(typeof staticExport?.publicDeploymentManifestPath === "string" ? [staticExport.publicDeploymentManifestPath] : []),
        ...(typeof staticExport?.deploymentCommandPlanPath === "string" ? [staticExport.deploymentCommandPlanPath] : []),
      ],
      violations,
      blockedClaims: [
        "production-ready language",
        "Unity/Unreal replacement language",
        "broad better-than-Three.js language",
        "broad better-than-Babylon.js language",
      ],
    }),
    auditComplete: true,
    productionReady,
    releaseAreas,
    violations,
  };
}

function validatePublicDemoDeploymentWorkflow(root: string): { readonly ok: boolean; readonly blockers: readonly string[] } {
  const workflowPath = ".github/workflows/public-demo-deploy.yml";
  const fullPath = join(root, workflowPath);
  if (!existsSync(fullPath)) {
    return { ok: false, blockers: ["No public demo deployment workflow is attached for the static demo artifact."] };
  }
  const source = readFileSync(fullPath, "utf8");
  const requiredMarkers = [
    ["manual workflow dispatch", "workflow_dispatch:"],
    ["Pages write permission", "pages: write"],
    ["OIDC token permission", "id-token: write"],
    ["GitHub Pages environment", "name: github-pages"],
    ["static demo export build", "pnpm build:external-demos"],
    ["local static server smoke", "pnpm verify:static-demo-server-smoke"],
    ["GitHub Pages configuration", "actions/configure-pages"],
    ["Pages artifact upload", "actions/upload-pages-artifact"],
    ["Pages deployment", "actions/deploy-pages"],
    ["public deployment smoke", "pnpm verify:public-demo-deployment"],
    ["deployed Pages URL environment", "A3D_PUBLIC_DEMO_URL:"],
    ["production readiness audit", "pnpm audit:external-parity-production-readiness"],
    ["external evidence readiness audit", "pnpm audit:external-parity-external-evidence-readiness"],
    ["broad parity readiness audit", "pnpm audit:external-parity-broad-parity"],
    ["completion audit", "pnpm audit:external-parity-completion"],
    ["report freshness verification", "pnpm verify:external-parity-report-freshness"],
    ["non-blocking broad parity audit capture", "pnpm audit:external-parity-broad-parity || true"],
    ["non-blocking completion audit capture", "pnpm audit:external-parity-completion || true"],
    ["always-upload public deployment reports", "if: always()"],
    ["public deployment smoke report upload", "tests/reports/public-demo-deployment-smoke.json"],
    ["public deployment runbook upload", "tests/reports/public-demo-deployment-runbook.md"],
    ["production readiness report upload", "tests/reports/external-parity-production-readiness.json"],
    ["external evidence readiness report upload", "tests/reports/external-parity-external-evidence-readiness.json"],
    ["external evidence missing-artifacts runbook upload", "tests/reports/external-parity-external-evidence-missing-artifacts.md"],
    ["broad parity readiness report upload", "tests/reports/external-parity-broad-parity-readiness.json"],
    ["completion audit report upload", "tests/reports/external-parity-completion-audit.json"],
    ["completion audit runbook upload", "tests/reports/external-parity-completion-audit-runbook.md"],
    ["report freshness upload", "tests/reports/external-parity-report-freshness.json"],
  ] as const;
  const blockers = requiredMarkers.flatMap(([label, marker]) => source.includes(marker) ? [] : [`Public demo deployment workflow is missing ${label}: ${marker}`]);
  if (!/A3D_PUBLIC_DEMO_URL:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/u.test(source)) {
    blockers.push("Public demo deployment workflow does not validate against the GitHub Pages deployment URL.");
  }
  return { ok: blockers.length === 0, blockers };
}

export function validatePublicDemoDeploymentSmokeEvidence(
  root: string,
  report: Record<string, unknown> | null,
  staticExport: Record<string, unknown> | null
): PublicDemoDeploymentEvidenceValidation {
  const sourceManifestPath = typeof staticExport?.integrityManifestPath === "string" ? staticExport.integrityManifestPath : "";
  const publicDeploymentManifestPath = typeof staticExport?.publicDeploymentManifestPath === "string" ? staticExport.publicDeploymentManifestPath : "";
  const sourceManifest = sourceManifestPath ? readJson(root, sourceManifestPath) : null;
  const publicDeploymentManifest = publicDeploymentManifestPath ? readJson(root, publicDeploymentManifestPath) : null;
  const sourceManifestHashes = new Map(
    (Array.isArray(sourceManifest?.files) ? sourceManifest.files : [])
      .filter(isRecord)
      .map((entry) => [String(entry.path), String(entry.sha256)])
  );
  const deploymentFiles = publicDeploymentFiles(publicDeploymentManifest);
  const checks = Array.isArray(report?.checks) ? report.checks.filter(isRecord) : [];
  const checkById = new Map(checks.map((check) => [String(check.id), check]));
  const deploymentUrl = typeof report?.deploymentUrl === "string" ? report.deploymentUrl : "";
  const blockers = [
    ...(report?.ok === true ? [] : ["public deployment smoke report is missing or failing."]),
    ...(isDurableHttpsUrl(deploymentUrl) ? [] : ["deploymentUrl is not a durable public HTTPS origin."]),
    ...(sourceManifestPath.length > 0 && existsSync(join(root, sourceManifestPath)) ? [] : ["static integrity manifest is missing."]),
    ...(publicDeploymentManifestPath.length > 0 && existsSync(join(root, publicDeploymentManifestPath)) ? [] : ["public deployment manifest is missing."]),
    ...(report?.sourceManifestPath === sourceManifestPath ? [] : ["report sourceManifestPath does not match current static export report."]),
    ...(report?.publicDeploymentManifestPath === publicDeploymentManifestPath ? [] : ["report publicDeploymentManifestPath does not match current static export report."]),
    ...(requiredDemos.every((id) => stringArray(report?.requiredDemos).includes(id)) ? [] : ["report requiredDemos does not include all required demos."]),
    ...(deploymentFiles.length === 1 + requiredDemos.length * 2 ? [] : ["public deployment manifest does not list the index plus all required demo HTML/script files."]),
    ...(checks.length === deploymentFiles.length && checks.length === 1 + requiredDemos.length * 2 ? [] : ["public deployment report does not include one check for every required deployed file."]),
    ...(Array.isArray(report?.violations) && report.violations.length === 0 ? [] : ["public deployment report still contains violations."]),
    ...deploymentFiles.flatMap((file) => validatePublicDeploymentCheck(file, checkById.get(file.id), deploymentUrl, sourceManifestHashes)),
  ];
  return {
    ok: blockers.length === 0,
    blockers,
    expectedChecks: deploymentFiles.length,
    actualChecks: checks.length,
  };
}

const requiredDemos = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "racing-showcase",
  "large-world-streaming",
] as const;

function validatePublicDeploymentCheck(
  file: DeploymentFile,
  check: Record<string, unknown> | undefined,
  deploymentUrl: string,
  sourceManifestHashes: ReadonlyMap<string, string>
): readonly string[] {
  if (!check) return [`${file.id}: public deployment check is missing.`];
  const expectedUrl = isDurableHttpsUrl(deploymentUrl) ? new URL(file.publicPath, deploymentUrl).toString() : "";
  const expectedSha = sourceManifestHashes.get(file.localPath);
  const contentMarkers = stringArray(check.contentMarkers);
  return [
    ...(check.url === expectedUrl ? [] : [`${file.id}: checked URL does not match deployment manifest public path.`]),
    ...(check.status === 200 ? [] : [`${file.id}: expected HTTP 200 evidence.`]),
    ...(Number(check.bytes ?? 0) > file.minBytes ? [] : [`${file.id}: response byte count is below deployment manifest minimum.`]),
    ...(typeof check.sha256 === "string" && check.sha256 === file.sha256 && check.sha256 === expectedSha ? [] : [`${file.id}: response sha256 does not match current static integrity and deployment manifests.`]),
    ...(check.matchedStaticIntegrity === true ? [] : [`${file.id}: matchedStaticIntegrity is not true.`]),
    ...(check.contentOk === true ? [] : [`${file.id}: contentOk is not true.`]),
    ...(file.contentMarkers.every((marker) => contentMarkers.includes(marker)) ? [] : [`${file.id}: content marker evidence does not match deployment manifest.`]),
  ];
}

function releaseArea(id: string, requiredForProduction: string, currentEvidence: string, blockers: readonly string[]) {
  return {
    id,
    requiredForProduction,
    currentEvidence,
    ready: blockers.length === 0,
    blockers,
  };
}

function hasStaticExportIntegrity(root: string, report: Record<string, unknown> | null): boolean {
  if (report?.ok !== true) return false;
  const integrityManifestPath = typeof report.integrityManifestPath === "string" ? report.integrityManifestPath : "";
  const publicDeploymentManifestPath = typeof report.publicDeploymentManifestPath === "string" ? report.publicDeploymentManifestPath : "";
  const deploymentCommandPlanPath = typeof report.deploymentCommandPlanPath === "string" ? report.deploymentCommandPlanPath : "";
  const rollbackPlanPath = typeof report.rollbackPlanPath === "string" ? report.rollbackPlanPath : "";
  const demos = Array.isArray(report.demos) ? report.demos : [];
  return demos.length >= 3 &&
    integrityManifestPath.length > 0 &&
    publicDeploymentManifestPath.length > 0 &&
    deploymentCommandPlanPath.length > 0 &&
    rollbackPlanPath.length > 0 &&
    existsSync(join(root, integrityManifestPath)) &&
    existsSync(join(root, publicDeploymentManifestPath)) &&
    existsSync(join(root, deploymentCommandPlanPath)) &&
    existsSync(join(root, rollbackPlanPath));
}

function validateReportSourceFileHashes(root: string, report: Record<string, unknown> | null, label: string): { readonly sourceFiles: readonly string[]; readonly blockers: readonly string[] } {
  if (!report) return { sourceFiles: [], blockers: [`${label} report is missing.`] };
  const entries = Array.isArray(report.sourceFileHashes) ? report.sourceFileHashes.filter(isRecord) : [];
  if (entries.length === 0) {
    return { sourceFiles: [], blockers: [`${label} report does not include sourceFileHashes for current source freshness.`] };
  }
  const sourceFiles: string[] = [];
  const blockers: string[] = [];
  for (const entry of entries) {
    if (typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
      blockers.push(`${label} report contains a malformed sourceFileHashes entry.`);
      continue;
    }
    sourceFiles.push(entry.path);
    const sourcePath = join(root, entry.path);
    if (!existsSync(sourcePath)) {
      blockers.push(`${label} source is missing: ${entry.path}.`);
      continue;
    }
    const currentHash = createSha256(sourcePath);
    if (currentHash !== entry.sha256) {
      blockers.push(`${label} is stale because source changed after export: ${entry.path}.`);
    }
  }
  return { sourceFiles: Array.from(new Set(sourceFiles)), blockers };
}

function createSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isDurableHttpsUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && isDurablePublicHost(parsed.hostname);
}

function isDurablePublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, "").replace(/^\[(.*)\]$/u, "$1");
  if (
    host.length === 0 ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".test") ||
    host.endsWith(".invalid") ||
    host.endsWith(".example")
  ) {
    return false;
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPublicIpv4(host);
  if (ipVersion === 6) return isPublicIpProduction(host);
  return host.includes(".");
}

function isPublicIpv4(host: string): boolean {
  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = 0, b = 0, c = 0] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 18) ||
    (a === 198 && b === 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpProduction(host: string): boolean {
  const normalized = host.toLowerCase();
  return !(
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createExternalParityProductionReadinessReport();
  writeJson(process.cwd(), reportPath, report);
  console.log(JSON.stringify({
    ok: report.ok,
    auditComplete: report.auditComplete,
    productionReady: report.productionReady,
    readyAreas: report.releaseAreas.filter((area) => area.ready).length,
    blockedAreas: report.releaseAreas.filter((area) => !area.ready).length,
    report: reportPath,
  }, null, 2));
}
