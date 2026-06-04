import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WEBGPU_COMPLETION_AUDIT_REPORT = "tests/reports/webgpu-completion-audit.json";

const requiredReports = [
  "tests/reports/webgpu-feature-matrix.json",
  "tests/reports/webgpu-route-health.json",
  "tests/reports/webgpu-visual-parity.json",
  "tests/reports/webgpu-hardware-matrix.json"
] as const;

const requiredRoutes = [
  "/apps/wow-webgpu-triangle/",
  "/apps/wow-webgpu-render-target/",
  "/apps/wow-webgpu-pbr-asset/",
  "/apps/wow-webgpu-product-viewer/",
  "/apps/wow-webgpu-instancing/",
  "/apps/wow-webgpu-compute-particles/"
] as const;

export function createWebGPUCompletionAuditReport(): Record<string, unknown> {
  const failures: string[] = [];
  for (const reportPath of requiredReports) {
    if (!existsSync(resolve(reportPath))) {
      failures.push(`Missing required report: ${reportPath}`);
      continue;
    }
    const report = JSON.parse(readFileSync(resolve(reportPath), "utf8")) as Record<string, unknown>;
    if (report.pass !== true && report.status !== "pass") {
      failures.push(`${reportPath} is not passing.`);
    }
  }
  const rootHtml = existsSync(resolve("index.html")) ? readFileSync(resolve("index.html"), "utf8") : "";
  for (const route of requiredRoutes) {
    if (!rootHtml.includes(route)) failures.push(`Root registry missing ${route}.`);
  }
  const forbiddenClaimLines = collectDocsText()
    .split(/\r?\n/)
    .filter((line) => /full WebGPU support/i.test(line))
    .filter((line) => !/forbidden|avoid|must not|without|before|until|unless|not achieved/i.test(line));
  if (forbiddenClaimLines.length > 0) {
    failures.push(`Docs contain unsupported public WebGPU claim language: ${forbiddenClaimLines.join(" | ")}`);
  }
  return {
    schema: "a3d-webgpu-completion-audit",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    requiredReports,
    requiredRoutes,
    failures
  };
}

export function writeWebGPUCompletionAuditReport(report = createWebGPUCompletionAuditReport()): void {
  mkdirSync(dirname(resolve(WEBGPU_COMPLETION_AUDIT_REPORT)), { recursive: true });
  writeFileSync(resolve(WEBGPU_COMPLETION_AUDIT_REPORT), `${JSON.stringify(report, null, 2)}\n`);
}

function collectDocsText(): string {
  const files = ["README.md", "docs/rendering/webgpu-fallback.md", "docs/rendering/webgpu-hardware-matrix.md", "docs/project/claim-guidelines.md"];
  return files.filter((file) => existsSync(resolve(file))).map((file) => readFileSync(resolve(file), "utf8")).join("\n");
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createWebGPUCompletionAuditReport();
  writeWebGPUCompletionAuditReport(report);
  if (report.pass !== true) {
    const failures = Array.isArray(report.failures) ? report.failures.join("\n") : "unknown failure";
    throw new Error(`WebGPU completion audit failed:\n${failures}`);
  }
  console.log(`WebGPU completion audit passed. Report: ${WEBGPU_COMPLETION_AUDIT_REPORT}`);
}
