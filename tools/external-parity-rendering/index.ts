import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseReport, readJson, sourceFilesFromReport, writeJson } from "../external-parity-reporting/index.js";

const root = process.cwd();
const existing = readJson(root, "tests/reports/external-parity-rendering.json");
const webgpuParity = readJson(root, "tests/reports/external-parity-webgpu-parity.json") ?? readJson(root, "tests/reports/webgpu-parity.json");
const webgpuCases = Array.isArray(webgpuParity?.cases) ? webgpuParity.cases : [];
const injectedContractCases = webgpuCases.filter((entry) => isRecord(entry) && entry.evidenceType === "injected-webgpu-contract");
const navigatorGpuProbe = webgpuCases.find((entry) => isRecord(entry) && entry.name === "real-navigator-gpu-availability" && entry.evidenceType === "real-navigator-gpu-probe");
const navigatorGpuProbeDetails = isRecord(navigatorGpuProbe) && isRecord(navigatorGpuProbe.details) ? navigatorGpuProbe.details : {};
const realHardwarePassed = navigatorGpuProbeDetails.adapterStatus === "available";
const renderingValidations = Array.isArray(existing?.validations) ? existing.validations : [];
const webgpuCapabilityVisual = renderingValidations.find((entry) => isRecord(entry) && entry.name === "webgpu-capability-visual-boundary" && entry.ok === true);
const postprocessRealSceneValidation = renderingValidations.find((entry) => isRecord(entry) && entry.name === "postprocess-lab-external-parity-preset" && entry.ok === true);
const screenshotPaths = uniqueStrings([
  ...(Array.isArray(existing?.screenshots) ? existing.screenshots : []),
  ...(Array.isArray(existing?.screenshotPaths) ? existing.screenshotPaths : []),
]);
const screenshotValidations = screenshotPaths.map((path) => validatePngScreenshot(root, path));

const checks = [
  {
    id: "external-parity-rendering-report-produced-by-renderer-agent",
    passed: existing?.ok === true,
    evidencePaths: ["tests/reports/external-parity-rendering.json"],
    blocker: "External parity renderer visual quality report is not yet passing.",
  },
  {
    id: "external-parity-rendering-screenshots-exist-and-are-valid-pngs",
    passed: screenshotValidations.length >= 5 && screenshotValidations.every((entry) => entry.ok),
    evidencePaths: screenshotPaths,
    blocker: `External parity renderer screenshots are missing, corrupt, tiny, or empty: ${screenshotValidations.filter((entry) => !entry.ok).map((entry) => `${entry.path} (${entry.reason})`).join(", ") || "screenshot list incomplete"}.`,
  },
  {
    id: "external-parity-postprocess-lab-uses-real-scene-input",
    passed: hasRealScenePostprocessEvidence(postprocessRealSceneValidation),
    evidencePaths: ["examples/postprocess-lab/main.ts", "tests/browser/rendering-external-parity-visuals.spec.ts", "tests/reports/external-parity-example-screenshots/postprocess-lab.png"],
    blocker: "External parity postprocess lab does not prove a real WebGL2 scene input before postprocess.",
  },
  {
    id: "external-parity-webgpu-injected-contracts-distinguished",
    passed: webgpuParity?.status === "pass" && injectedContractCases.length >= 5,
    evidencePaths: ["tests/reports/external-parity-webgpu-parity.json", "tests/browser/webgpu-parity.spec.ts"],
    blocker: "External parity WebGPU report does not distinguish injected contract evidence.",
  },
  {
    id: "external-parity-webgpu-real-navigator-probe-distinguished",
    passed: isRecord(navigatorGpuProbe) && typeof navigatorGpuProbeDetails.adapterStatus === "string",
    evidencePaths: ["tests/reports/external-parity-webgpu-parity.json", "tests/browser/webgpu-parity.spec.ts"],
    blocker: "External parity WebGPU report does not include a real navigator.gpu availability probe.",
  },
  {
    id: "external-parity-webgpu-real-hardware-claim-blocked-unless-adapter-passes",
    passed: realHardwarePassed || webgpuParity?.note?.toString().includes("real hardware success is not claimed"),
    evidencePaths: ["tests/reports/external-parity-webgpu-parity.json", "docs/project/product-studio-decision-gates.md"],
    blocker: "External parity WebGPU hardware claim is neither backed by real adapter evidence nor explicitly blocked.",
  },
  {
    id: "external-parity-webgpu-capability-visual-boundary",
    passed: Boolean(webgpuCapabilityVisual),
    evidencePaths: ["examples/webgpu-capability/main.ts", "tests/browser/rendering-external-parity-visuals.spec.ts", "tests/reports/external-parity-example-screenshots/webgpu-capability.png"],
    blocker: "External parity WebGPU capability visual does not prove supported and blocked feature presentation.",
  },
] as const;

const violations = checks.filter((check) => !check.passed).map((check) => check.blocker);
const report = {
  ...baseReport(root, {
    ok: violations.length === 0,
    command: "pnpm verify:external-parity-rendering",
    runIdPrefix: "external-parity-rendering",
    sourceFiles: ["tools/external-parity-rendering/index.ts", "tests/reports/external-parity-rendering.json"],
    violations,
  }),
  subsystem: "renderer-visual-quality",
  checks,
  screenshotValidations,
  webgpuEvidence: summarizeWebGPUEvidence(),
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  if (existing?.ok === true && violations.length === 0) {
    const normalized = {
      ...existing,
      ...baseReport(root, {
        ok: true,
        command: "pnpm verify:external-parity-rendering",
        runIdPrefix: "external-parity-rendering",
        sourceFiles: sourceFilesFromReport(existing, [
          "tools/external-parity-rendering/index.ts",
          "tests/browser/rendering-external-parity-visuals.spec.ts",
          "packages/rendering/src/ExternalParityRenderPreset.ts",
          "packages/rendering/src/WebGPUDevice.ts",
          "examples/material-showroom/main.ts",
          "examples/postprocess-lab/main.ts",
          "examples/shadow-lab/main.ts",
          "examples/webgpu-capability/main.ts",
          "tests/browser/webgpu-parity.spec.ts",
          "tests/reports/external-parity-webgpu-parity.json",
        ], "tests/reports/external-parity-rendering.json"),
        screenshotPaths,
      }),
      normalizedBy: "tools/external-parity-rendering/index.ts",
      checks,
      screenshotValidations,
      webgpuEvidence: summarizeWebGPUEvidence(),
    };
    writeJson(root, "tests/reports/external-parity-rendering.json", normalized);
    console.log(JSON.stringify({ ok: true, normalized: "tests/reports/external-parity-rendering.json" }, null, 2));
    process.exit(0);
  }
  writeJson(root, "tests/reports/external-parity-rendering.json", report);
  console.log(JSON.stringify({ ok: report.ok, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function summarizeWebGPUEvidence() {
  return {
    injectedContractCaseCount: injectedContractCases.length,
    injectedContractCases: injectedContractCases.map((entry) => isRecord(entry) ? String(entry.name) : "unknown"),
    navigatorGpuProbe: isRecord(navigatorGpuProbe) ? navigatorGpuProbe.details : null,
    realHardwarePassed,
    hardwareClaim: realHardwarePassed ? "real-navigator-gpu-adapter-available" : "blocked-no-real-adapter-evidence",
    unsupportedCases: Array.isArray(webgpuParity?.unsupportedCases) ? webgpuParity.unsupportedCases : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasRealScenePostprocessEvidence(validation: unknown): boolean {
  if (!isRecord(validation)) return false;
  const checks = isRecord(validation.checks) ? validation.checks : {};
  const metrics = isRecord(validation.metrics) ? validation.metrics : {};
  return validation.ok === true &&
    checks.realSceneInput === true &&
    Number(metrics.realSceneDrawCalls) >= 1 &&
    Number(metrics.realSceneColorBuckets) >= 2;
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function validatePngScreenshot(root: string, path: string): {
  readonly path: string;
  readonly ok: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly byteLength?: number;
  readonly reason?: string;
} {
  const fullPath = `${root}/${path}`;
  if (!existsSync(fullPath)) return { path, ok: false, reason: "missing" };
  const byteLength = statSync(fullPath).size;
  const dimensions = readPngDimensions(fullPath);
  if (!dimensions.ok) {
    return { path, ok: false, byteLength, width: dimensions.width, height: dimensions.height, reason: dimensions.reason };
  }
  const ok = dimensions.width >= 320 && dimensions.height >= 220 && byteLength > 4_096;
  return {
    path,
    ok,
    width: dimensions.width,
    height: dimensions.height,
    byteLength,
    reason: ok ? undefined : "image is too small or empty",
  };
}

function readPngDimensions(path: string): { readonly ok: true; readonly width: number; readonly height: number } | { readonly ok: false; readonly width: number; readonly height: number; readonly reason: string } {
  const data = readFileSync(path);
  const isPng =
    data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[12] === 0x49 &&
    data[13] === 0x48 &&
    data[14] === 0x44 &&
    data[15] === 0x52;
  if (!isPng) return { ok: false, width: 0, height: 0, reason: "not a PNG" };
  return { ok: true, width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}
