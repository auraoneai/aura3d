import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type WebGPUFeatureState = "supported" | "partial" | "blocked" | "untested";

export interface WebGPUFeatureMatrixRow {
  readonly id: string;
  readonly label: string;
  readonly state: WebGPUFeatureState;
  readonly evidenceFiles: readonly string[];
  readonly detail: string;
}

export interface WebGPUFeatureMatrixReport {
  readonly schema: "a3d-webgpu-feature-matrix";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly rows: readonly WebGPUFeatureMatrixRow[];
  readonly failures: readonly string[];
}

export const WEBGPU_FEATURE_MATRIX_REPORT = "tests/reports/webgpu-feature-matrix.json";

const rows: readonly WebGPUFeatureMatrixRow[] = [
  row("geometry", "Triangle geometry", "supported", ["apps/wow-webgpu-triangle/src/main.ts", "tests/reports/current-route-health/screenshots/apps-wow-webgpu-triangle.png"], "Root route renders a WebGPU triangle."),
  row("indexed-geometry", "Indexed geometry", "supported", ["tests/browser/rendering-webgpu.spec.ts", "packages/rendering/src/WebGPUDevice.ts"], "WebGPUDevice validates indexed draw paths and existing browser tests cover indexed commands."),
  row("lines", "Line primitives", "supported", ["tests/browser/rendering-webgpu.spec.ts", "packages/rendering/src/WebGPUDevice.ts"], "WebGPU browser test covers line topology."),
  row("points", "Point primitives", "supported", ["tests/browser/rendering-webgpu.spec.ts", "packages/rendering/src/WebGPUDevice.ts"], "WebGPU browser test covers point topology."),
  row("pbr", "PBR material", "supported", ["apps/wow-webgpu-pbr-asset/src/main.ts", "tests/reports/current-route-health/screenshots/apps-wow-webgpu-pbr-asset.png"], "Damaged Helmet route renders imported PBR materials through WebGPU."),
  row("textures", "Sampled textures", "supported", ["packages/rendering/src/WebGPUDevice.ts", "tests/browser/runtime-parity-webgpu-imported-asset.spec.ts"], "Native sampled texture bindings are implemented and exercised by imported-asset evidence."),
  row("hdr-ibl", "HDR/IBL", "partial", ["apps/wow-webgpu-pbr-asset/src/main.ts", "fixtures/environment-corpus/manifest.json"], "WebGPU routes use the shared HDR environment pipeline; broad hardware parity remains gated by visual reports."),
  row("render-targets", "Render targets", "supported", ["apps/wow-webgpu-render-target/src/main.ts", "tests/unit/rendering/webgpu-render-to-texture-proof.test.ts"], "Route and unit proof cover WebGPU render targets."),
  row("readback", "Texture readback", "supported", ["packages/rendering/src/WebGPUDevice.ts", "tests/browser/runtime-parity-webgpu-imported-asset.spec.ts"], "Native texture-to-buffer readback path exists and product proof requires it."),
  row("postprocess", "Postprocess", "partial", ["packages/rendering/src/Renderer.ts", "tests/browser/webgpu-parity.spec.ts"], "Async postprocess path exists; per-pass WebGPU rows remain separate hardening work."),
  row("shadows", "Shadows", "partial", ["packages/rendering/src/ShadowPass.ts", "tests/browser/webgpu-parity.spec.ts"], "Shadow map binding evidence exists; PCF/filter fallback proof remains partial."),
  row("instancing", "Instancing workload", "supported", ["apps/wow-webgpu-instancing/src/main.ts", "tests/reports/current-route-health/screenshots/apps-wow-webgpu-instancing.png"], "Root WebGPU instancing route renders repeated geometry workload."),
  row("skinning", "Skinning", "partial", ["packages/rendering/src/WebGPUDevice.ts", "tests/browser/webgpu-parity.spec.ts"], "Generated skinned shader path exists; no root WebGPU character route is approved yet."),
  row("morphs", "Morph targets", "partial", ["packages/rendering/src/WebGPUDevice.ts", "tests/browser/webgpu-parity.spec.ts"], "Generated morph shader path exists; no root WebGPU morph route is approved yet."),
  row("transmission", "Transmission", "partial", ["packages/rendering/src/production-runtime/TransmissionBackdropCapture.ts", "tests/browser/runtime-parity-webgpu-sdk-production.spec.ts"], "Transmission capture path exists in production runtime; root WebGPU route does not claim it yet."),
  row("lifecycle", "Resource lifecycle", "supported", ["apps/wow-webgpu-render-target/src/main.ts", "tests/unit/rendering/webgpu-render-to-texture-proof.test.ts"], "Render-target disposal is explicit in route and unit proof."),
  row("device-loss", "Device loss diagnostics", "partial", ["packages/rendering/src/WebGPUDevice.ts"], "WebGPUDevice observes device.lost and publishes context loss; structured event taxonomy remains partial."),
  row("webgpu-compute", "WebGPU compute", "supported", ["apps/wow-webgpu-compute-particles/src/main.ts", "packages/rendering/src/webgpu/WebGPUCompute.ts", "packages/rendering/src/effects/GPUParticleBackend.ts"], "Root route uses WebGPUParticleBackend storage-buffer compute dispatches and renders the updated particle positions.")
] as const;

export function createWebGPUFeatureMatrixReport(options: { readonly rows?: readonly WebGPUFeatureMatrixRow[] } = {}): WebGPUFeatureMatrixReport {
  const reportRows = options.rows ?? rows;
  const failures = reportRows.flatMap((entry) => {
    if (entry.state !== "supported") return [];
    const missing = entry.evidenceFiles.filter((file) => !existsSync(resolve(file)));
    return missing.length > 0 ? [`${entry.id} is supported but missing evidence: ${missing.join(", ")}`] : [];
  });
  return {
    schema: "a3d-webgpu-feature-matrix",
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    rows: reportRows,
    failures
  };
}

export function writeWebGPUFeatureMatrixReport(report = createWebGPUFeatureMatrixReport()): void {
  mkdirSync(dirname(resolve(WEBGPU_FEATURE_MATRIX_REPORT)), { recursive: true });
  writeFileSync(resolve(WEBGPU_FEATURE_MATRIX_REPORT), `${JSON.stringify(report, null, 2)}\n`);
}

function row(id: string, label: string, state: WebGPUFeatureState, evidenceFiles: readonly string[], detail: string): WebGPUFeatureMatrixRow {
  return { id, label, state, evidenceFiles, detail };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createWebGPUFeatureMatrixReport();
  writeWebGPUFeatureMatrixReport(report);
  if (!report.pass) {
    throw new Error(`WebGPU feature matrix failed:\n${report.failures.join("\n")}`);
  }
  console.log(`WebGPU feature matrix passed. Report: ${WEBGPU_FEATURE_MATRIX_REPORT}`);
}
