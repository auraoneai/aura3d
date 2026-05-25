import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { baseReport, writeJson } from "../external-parity-reporting/index.js";

interface PublicDemoDeploymentSmokeReport {
  readonly ok: boolean;
  readonly command: string;
  readonly deploymentUrl: string | null;
  readonly deploymentRunbookPath: "tests/reports/public-demo-deployment-runbook.md";
  readonly sourceManifestPath: string | null;
  readonly publicDeploymentManifestPath: string | null;
  readonly requiredDemos: readonly string[];
  readonly deploymentExecutionPlan: PublicDemoDeploymentExecutionPlan;
  readonly checks: readonly PublicDemoCheck[];
  readonly violations: readonly string[];
}

interface PublicDemoDeploymentExecutionPlan {
  readonly claimBoundary: string;
  readonly requiredCommand: "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment";
  readonly sourceManifestPath: string | null;
  readonly publicDeploymentManifestPath: string | null;
  readonly filesToDeploy: readonly {
    readonly id: string;
    readonly localPath: string;
    readonly publicPath: string;
    readonly sha256: string;
    readonly contentMarkers: readonly string[];
  }[];
  readonly validationCommands: readonly string[];
}

interface PublicDemoCheck {
  readonly id: string;
  readonly url: string;
  readonly status: number | null;
  readonly bytes: number;
  readonly sha256: string | null;
  readonly matchedStaticIntegrity: boolean | null;
  readonly contentOk: boolean | null;
  readonly contentMarkers: readonly string[];
  readonly error?: string;
}

const reportPath = "tests/reports/public-demo-deployment-smoke.json";
const deploymentRunbookPath = "tests/reports/public-demo-deployment-runbook.md" as const;
const exportReportPath = "tests/reports/external-demo-static-export.json";
const requiredDemos = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
  "racing-showcase",
  "large-world-streaming",
] as const;
const sourceFiles = [
  "tools/public-demo-deployment-smoke/index.ts",
  "package.json",
  "tests/reports/external-demo-static-export.json",
  "tests/reports/static-demo-server-smoke.json",
] as const;

export async function createPublicDemoDeploymentSmokeReport(root = process.cwd()): Promise<PublicDemoDeploymentSmokeReport> {
  const deploymentUrlInput = process.env.G3D_PUBLIC_DEMO_URL;
  const deploymentUrl = normalizedDeploymentUrl(deploymentUrlInput);
  const exportReport = readJson(join(root, exportReportPath));
  const sourceManifestPath = typeof exportReport?.integrityManifestPath === "string" ? exportReport.integrityManifestPath : null;
  const publicDeploymentManifestPath = typeof exportReport?.publicDeploymentManifestPath === "string" ? exportReport.publicDeploymentManifestPath : null;
  const sourceManifest = sourceManifestPath ? readJson(join(root, sourceManifestPath)) : null;
  const publicDeploymentManifest = publicDeploymentManifestPath ? readJson(join(root, publicDeploymentManifestPath)) : null;
  const manifestHashes = new Map(
    (Array.isArray(sourceManifest?.files) ? sourceManifest.files : [])
      .filter(isRecord)
      .map((entry) => [String(entry.path), String(entry.sha256)])
  );
  const deploymentFiles = publicDeploymentFiles(publicDeploymentManifest);
  const deploymentExecutionPlan = publicDemoDeploymentExecutionPlan(sourceManifestPath, publicDeploymentManifestPath, deploymentFiles);
  const exportSourceFreshnessViolations = validateReportSourceFileHashes(root, exportReport, "Static demo export");
  const baseViolations = [
    ...(deploymentUrl ? [] : [deploymentUrlInput?.trim()
      ? `G3D_PUBLIC_DEMO_URL must be a durable public HTTPS origin, not localhost/private/reserved/placeholder host: ${deploymentUrlInput.trim()}.`
      : "G3D_PUBLIC_DEMO_URL is not set to a durable public demo origin."]),
    ...(exportReport?.ok === true ? [] : ["Static demo export report is missing or failing."]),
    ...exportSourceFreshnessViolations,
    ...(sourceManifestPath && existsSync(join(root, sourceManifestPath)) ? [] : ["Static integrity manifest is missing."]),
    ...(publicDeploymentManifestPath && existsSync(join(root, publicDeploymentManifestPath)) ? [] : ["Public deployment manifest is missing."]),
    ...(deploymentFiles.length >= 1 + requiredDemos.length * 2 ? [] : ["Public deployment manifest does not list the index plus all required demo HTML/script files."]),
  ];

  const checks = deploymentUrl
    ? await Promise.all(deploymentFiles.map((file) => fetchPublicDemoFile(file, deploymentUrl, manifestHashes)))
    : [];
  const violations = [
    ...baseViolations,
    ...(checks.length === 1 + requiredDemos.length * 2 ? [] : ["Public deployment checks did not cover the index plus all required demo HTML/script files."]),
    ...checks.flatMap((check) => [
      ...(check.status === 200 ? [] : [`${check.id}: expected HTTP 200, received ${check.status ?? "no response"}.`]),
      ...(check.bytes > checkMinBytes(check.id, deploymentFiles) ? [] : [`${check.id}: response is too small.`]),
      ...(check.matchedStaticIntegrity === true ? [] : [`${check.id}: public bytes do not match the static integrity manifest.`]),
      ...(check.contentOk === true ? [] : [`${check.id}: public bytes do not contain expected demo content markers: ${check.contentMarkers.join(", ") || "none"}.`]),
      ...(check.error ? [`${check.id}: ${check.error}`] : []),
    ]),
  ];
  const report: PublicDemoDeploymentSmokeReport = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:public-demo-deployment",
      runIdPrefix: "public-demo-deployment-smoke",
      sourceFiles: [
        ...sourceFiles,
        ...(publicDeploymentManifestPath ? [publicDeploymentManifestPath] : []),
      ],
      violations,
      blockedClaims: [
        "production-ready language",
        "public deployment readiness",
      ],
    }),
    ok: violations.length === 0,
    deploymentUrl,
    deploymentRunbookPath,
    sourceManifestPath,
    publicDeploymentManifestPath,
    requiredDemos,
    deploymentExecutionPlan,
    checks,
    violations,
  };
  writePublicDeploymentRunbook(root, report);
  return report;
}

function publicDemoDeploymentExecutionPlan(
  sourceManifestPath: string | null,
  publicDeploymentManifestPath: string | null,
  deploymentFiles: readonly DeploymentFile[]
): PublicDemoDeploymentExecutionPlan {
  return {
    claimBoundary: "This plan only defines the public-demo deployment evidence required by the production readiness gate. Production readiness remains blocked until a durable HTTPS origin serves bytes that match the static integrity manifest and pass content-marker validation.",
    requiredCommand: "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
    sourceManifestPath,
    publicDeploymentManifestPath,
    filesToDeploy: deploymentFiles.map((file) => ({
      id: file.id,
      localPath: file.localPath,
      publicPath: file.publicPath,
      sha256: file.sha256,
      contentMarkers: file.contentMarkers,
    })),
    validationCommands: [
      "pnpm build:external-demos",
      "pnpm verify:static-demo-server-smoke",
      "G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment",
      "pnpm audit:external-parity-production-readiness",
      "pnpm audit:v4-broad-parity",
      "pnpm verify:external-parity-report-freshness",
    ],
  };
}

async function fetchPublicDemoFile(file: DeploymentFile, deploymentUrl: string, manifestHashes: ReadonlyMap<string, string>): Promise<PublicDemoCheck> {
  const url = new URL(file.publicPath, deploymentUrl).toString();
  try {
    const response = await fetch(url, { redirect: "follow" });
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const manifestPath = file.localPath;
    const contentMarkers = file.contentMarkers;
    const text = bytes.toString("utf8");
    return {
      id: file.id,
      url,
      status: response.status,
      bytes: bytes.byteLength,
      sha256,
      matchedStaticIntegrity: manifestHashes.get(manifestPath) === sha256 && file.sha256 === sha256,
      contentOk: contentMarkers.every((marker) => text.includes(marker)),
      contentMarkers,
    };
  } catch (error) {
    return {
      id: file.id,
      url,
      status: null,
      bytes: 0,
      sha256: null,
      matchedStaticIntegrity: false,
      contentOk: false,
      contentMarkers: file.contentMarkers,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizedDeploymentUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!isDurablePublicHost(parsed.hostname)) return null;
  parsed.pathname = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
  parsed.search = "";
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
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
  if (ipVersion === 6) return isPublicIpV6(host);
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

function isPublicIpV6(host: string): boolean {
  const normalized = host.toLowerCase();
  return !(
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateReportSourceFileHashes(root: string, report: Record<string, unknown> | null, label: string): readonly string[] {
  if (!report) return [`${label} report is missing.`];
  const entries = Array.isArray(report.sourceFileHashes) ? report.sourceFileHashes.filter(isRecord) : [];
  if (entries.length === 0) {
    return [`${label} report does not include sourceFileHashes for current source freshness.`];
  }
  const violations: string[] = [];
  for (const entry of entries) {
    if (typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
      violations.push(`${label} report contains a malformed sourceFileHashes entry.`);
      continue;
    }
    const sourcePath = join(root, entry.path);
    if (!existsSync(sourcePath)) {
      violations.push(`${label} source is missing: ${entry.path}.`);
      continue;
    }
    const currentHash = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
    if (currentHash !== entry.sha256) {
      violations.push(`${label} is stale because source changed after export: ${entry.path}.`);
    }
  }
  return violations;
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
    const contentMarkers = Array.isArray(entry.contentMarkers)
      ? entry.contentMarkers.filter((marker): marker is string => typeof marker === "string")
      : [];
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
      contentMarkers,
    }];
  });
}

function checkMinBytes(id: string, files: readonly DeploymentFile[]): number {
  return files.find((file) => file.id === id)?.minBytes ?? (id.endsWith(":script") ? 10_000 : 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeReport(root: string, report: PublicDemoDeploymentSmokeReport): void {
  writeJson(root, reportPath, report);
}

function writePublicDeploymentRunbook(root: string, report: PublicDemoDeploymentSmokeReport): void {
  const outputPath = join(root, deploymentRunbookPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, publicDeploymentRunbookSource(report));
}

function publicDeploymentRunbookSource(report: PublicDemoDeploymentSmokeReport): string {
  return `# V4 Public Demo Deployment Runbook

Generated by \`pnpm verify:public-demo-deployment\` from \`${reportPath}\`.

${report.deploymentExecutionPlan.claimBoundary}

## Summary

- Deployment ready: ${report.ok ? "yes" : "no"}
- Deployment URL: ${report.deploymentUrl ?? "not set or not durable public HTTPS"}
- Source manifest: ${report.sourceManifestPath ?? "missing"}
- Public deployment manifest: ${report.publicDeploymentManifestPath ?? "missing"}
- Required demos: ${report.requiredDemos.join(", ")}
- Checks completed: ${report.checks.length} / ${report.deploymentExecutionPlan.filesToDeploy.length}

## Required Command

- \`${report.deploymentExecutionPlan.requiredCommand}\`

## Files To Deploy

${report.deploymentExecutionPlan.filesToDeploy.map((file) => `### ${file.id}

- Local path: \`${file.localPath}\`
- Public path: \`${file.publicPath}\`
- SHA-256: \`${file.sha256}\`
- Content markers: ${file.contentMarkers.map((marker) => `\`${marker}\``).join(", ") || "none"}
`).join("\n")}

## Public Checks

${report.checks.length > 0 ? report.checks.map((check) => `### ${check.id}

- URL: ${check.url}
- HTTP status: ${check.status ?? "no response"}
- Bytes: ${check.bytes}
- SHA-256: ${check.sha256 ?? "missing"}
- Matched static integrity: ${check.matchedStaticIntegrity === true ? "yes" : "no"}
- Content markers matched: ${check.contentOk === true ? "yes" : "no"}
${check.error ? `- Error: ${check.error}\n` : ""}`).join("\n") : "- No public checks were run because `G3D_PUBLIC_DEMO_URL` was missing or rejected."}

## Violations

${report.violations.length > 0 ? report.violations.map((violation) => `- ${violation}`).join("\n") : "- none"}

## Validation Commands

${report.deploymentExecutionPlan.validationCommands.map((command) => `- \`${command}\``).join("\n")}

Do not claim production readiness until this runbook shows \`Deployment ready: yes\`, \`${reportPath}\` has \`ok: true\`, \`pnpm audit:external-parity-production-readiness\` has \`productionReady: true\`, and \`pnpm audit:v4-completion\` marks the production-readiness criterion achieved.
`;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await createPublicDemoDeploymentSmokeReport();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    deploymentUrl: report.deploymentUrl,
    checks: report.checks.length,
    violations: report.violations,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
