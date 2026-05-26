import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const browserReportPath = resolve("tests/reports/production-runtime-webgpu-browser-report.json");
const reportPath = resolve("tests/reports/production-runtime-webgpu-readiness.json");
const browserReport = existsSync(browserReportPath)
  ? JSON.parse(readFileSync(browserReportPath, "utf8")) as {
      schema?: string;
      status?: "available" | "unavailable" | "blocked";
      canCreateDevice?: boolean;
      realHardwareRequiredForParity?: boolean;
      doesNotBlockWebGL2Production?: boolean;
      warnings?: readonly string[];
    }
  : null;

const checks = [
  { id: "browser-report-exists", pass: Boolean(browserReport), detail: browserReportPath },
  { id: "schema", pass: browserReport?.schema === "a3d-production-runtime-webgpu-report", detail: browserReport?.schema ?? "missing" },
  { id: "honest-status", pass: browserReport?.status === "available" || browserReport?.status === "unavailable" || browserReport?.status === "blocked", detail: browserReport?.status ?? "missing" },
  { id: "hardware-required-for-parity", pass: browserReport?.realHardwareRequiredForParity === true, detail: "WebGPU parity requires real hardware and later visual gates." },
  { id: "does-not-block-webgl2", pass: browserReport?.doesNotBlockWebGL2Production === true, detail: "WebGL2 production renderer remains valid if WebGPU is unavailable." },
  { id: "no-fake-available", pass: browserReport?.status === "available" ? browserReport.canCreateDevice === true : browserReport?.canCreateDevice === false && (browserReport?.warnings?.length ?? 0) > 0, detail: JSON.stringify(browserReport ?? null) }
];
const report = {
  schema: "a3d-production-runtime-webgpu-readiness",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
