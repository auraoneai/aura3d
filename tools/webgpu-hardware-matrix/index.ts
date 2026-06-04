import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WEBGPU_HARDWARE_MATRIX_REPORT = "tests/reports/webgpu-hardware-matrix.json";
export const WEBGPU_HARDWARE_MATRIX_VALIDATION_REPORT = "tests/reports/webgpu-hardware-matrix-validation.json";

export function createWebGPUHardwareMatrixValidationReport(): Record<string, unknown> {
  const failures: string[] = [];
  let matrix: Record<string, unknown> | null = null;
  if (!existsSync(resolve(WEBGPU_HARDWARE_MATRIX_REPORT))) {
    failures.push(`Missing ${WEBGPU_HARDWARE_MATRIX_REPORT}; run the hardware matrix browser test first.`);
  } else {
    matrix = JSON.parse(readFileSync(resolve(WEBGPU_HARDWARE_MATRIX_REPORT), "utf8")) as Record<string, unknown>;
    if (matrix.status !== "pass") failures.push(`${WEBGPU_HARDWARE_MATRIX_REPORT} does not have status=pass.`);
    if (matrix.evidenceType !== "real-navigator-gpu-probe") failures.push(`${WEBGPU_HARDWARE_MATRIX_REPORT} is not real navigator.gpu evidence.`);
    if (!Array.isArray(matrix.results) || matrix.results.length === 0) failures.push(`${WEBGPU_HARDWARE_MATRIX_REPORT} has no browser/device rows.`);
  }
  return {
    schema: "a3d-webgpu-hardware-matrix-validation",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    sourceReport: WEBGPU_HARDWARE_MATRIX_REPORT,
    resultCount: Array.isArray(matrix?.results) ? matrix.results.length : 0,
    failures
  };
}

export function writeWebGPUHardwareMatrixValidationReport(report = createWebGPUHardwareMatrixValidationReport()): void {
  mkdirSync(dirname(resolve(WEBGPU_HARDWARE_MATRIX_VALIDATION_REPORT)), { recursive: true });
  writeFileSync(resolve(WEBGPU_HARDWARE_MATRIX_VALIDATION_REPORT), `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createWebGPUHardwareMatrixValidationReport();
  writeWebGPUHardwareMatrixValidationReport(report);
  if (report.pass !== true) {
    const failures = Array.isArray(report.failures) ? report.failures.join("\n") : "unknown failure";
    throw new Error(`WebGPU hardware matrix validation failed:\n${failures}`);
  }
  console.log(`WebGPU hardware matrix validation passed. Report: ${WEBGPU_HARDWARE_MATRIX_VALIDATION_REPORT}`);
}
