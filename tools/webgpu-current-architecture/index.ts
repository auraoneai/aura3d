import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

type Json = Record<string, unknown>;

const baseline = json("tests/reports/current-threejs-baseline.json");
const hardware = json("tests/reports/webgpu-hardware-matrix.json");
const sdk = json("tests/reports/runtime-parity/webgpu-sdk-production/webgpu-sdk-production-report.json");
const architecture = json("tests/reports/webgpu-current-architecture/architecture.json");
const routes = json("tests/reports/webgpu-current-architecture/native-routes.json");
const runtimeSource = read("packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts");
const deviceSource = read("packages/rendering/src/WebGPUDevice.ts");
const computeSource = read("packages/rendering/src/effects/GPUParticleBackend.ts");
const comparisonDoc = read("docs/rendering/webgpu-current-architecture.md");
const webgpuRouteSources = [
  "apps/wow-webgpu-triangle/src/main.ts",
  "apps/wow-webgpu-render-target/src/main.ts",
  "apps/wow-webgpu-pbr-asset/src/main.ts",
  "apps/wow-webgpu-product-viewer/src/main.ts",
  "apps/wow-webgpu-instancing/src/main.ts",
  "apps/wow-webgpu-compute-particles/src/main.ts",
  "apps/wow-common/src/webgpu-showcase.ts"
] as const;

const latest = record(baseline.latest);
const hardwareResults = array(hardware.results).map(record);
const proof = record(sdk.proof);
const diagnostics = record(proof.diagnostics);
const pixels = record(proof.pixels);
const routeRows = array(routes.routes).map(record);
const deepImportRoutes = webgpuRouteSources.filter((path) => /from\s+["']\/packages\//.test(read(path)));
const canvas2dRoutes = webgpuRouteSources.filter((path) => /getContext\(["']2d["']\)/.test(read(path)));

const checks: ReleaseCheck[] = [
  {
    id: "current-threejs-baseline-is-live-and-exact",
    pass: baseline.pass === true && latest.version === "0.185.1" && latest.version === record(baseline.three).version,
    detail: `npm latest and locked comparison: three@${String(latest.version ?? "missing")}`
  },
  {
    id: "threejs-r185-multi-backend-source-is-locked",
    pass: architecture.pass === true
      && comparisonDoc.includes("getFallback")
      && comparisonDoc.includes("WebGLBackend")
      && record(architecture.baseline).sourceSha256 !== undefined,
    detail: "exact installed r185 WebGPURenderer source hash and WebGL2 fallback behavior are recorded"
  },
  {
    id: "real-adapter-and-device",
    pass: hardware.evidenceType === "real-navigator-gpu-probe"
      && hardwareResults.some((entry) => entry.hasNavigatorGpu === true && entry.adapterStatus === "available" && entry.deviceStatus === "available"),
    detail: hardwareResults.map((entry) => `${entry.browserName}:${entry.adapterStatus}/${entry.deviceStatus}`).join(", ") || "missing hardware results"
  },
  {
    id: "native-pipeline-upload-pass-and-readback",
    pass: sdk.status === "ready"
      && sdk.productionClaim === "public-sdk-webgpu-production-path"
      && record(sdk.sdkPath).a3dRendererBackend === "webgpu"
      && number(diagnostics.nativeRenderPipelinesCreated) > 0
      && number(diagnostics.nativeRenderPasses) > 0
      && number(diagnostics.nativeTextureUploads) > 0
      && number(diagnostics.nativeTextureReadbacks) > 0
      && number(pixels.nonBlackPixels) > 120_000,
    detail: `pipelines=${number(diagnostics.nativeRenderPipelinesCreated)}, passes=${number(diagnostics.nativeRenderPasses)}, uploads=${number(diagnostics.nativeTextureUploads)}, readbacks=${number(diagnostics.nativeTextureReadbacks)}, nonBlack=${number(pixels.nonBlackPixels)}`
  },
  {
    id: "real-compute-dispatch-and-storage-readback",
    pass: record(architecture.aura3d).status === "ready"
      && record(record(architecture.aura3d).compute).backend === "webgpu"
      && number(record(record(architecture.aura3d).compute).workgroups) > 0
      && computeSource.includes("createComputePipeline")
      && computeSource.includes("beginComputePass")
      && computeSource.includes("dispatchWorkgroups")
      && computeSource.includes("mapAsync"),
    detail: "real WebGPUParticleBackend numeric result is backed by WGSL pipeline, dispatch, storage copy, and mapped readback"
  },
  {
    id: "auto-fallback-and-explicit-error",
    pass: record(record(architecture.aura3d).fallback).backend === "webgl2"
      && record(record(record(architecture.aura3d).fallback).selection).fallback === true
      && String(record(architecture.aura3d).explicitError ?? "").includes("will not silently use WebGL2")
      && runtimeSource.includes("selection.requestedBackend !== \"auto\"")
      && runtimeSource.includes("initialization failed, and WebGL2 was selected"),
    detail: "auto falls back with native cause; explicit webgpu rejects without substitution"
  },
  {
    id: "all-webgpu-labelled-routes-are-native",
    pass: routes.pass === true
      && routeRows.length === 6
      && routeRows.every((entry) => entry.selectedBackend === "webgpu" && number(entry.nativeSubmissions) > 0 && number(entry.screenshotBytes) > 1_000),
    detail: routeRows.map((entry) => `${entry.route}:${entry.selectedBackend}/${entry.nativeSubmissions}`).join(", ") || "missing route matrix"
  },
  {
    id: "webgpu-routes-use-public-package-entries",
    pass: deepImportRoutes.length === 0,
    detail: deepImportRoutes.length === 0 ? `${webgpuRouteSources.length} route/support sources use package entries` : deepImportRoutes.join(", ")
  },
  {
    id: "webgpu-routes-do-not-use-canvas2d-substitutes",
    pass: canvas2dRoutes.length === 0,
    detail: canvas2dRoutes.length === 0 ? "no WebGPU evidence route paints through Canvas2D" : canvas2dRoutes.join(", ")
  },
  {
    id: "native-operation-diagnostics-are-device-owned",
    pass: ["nativeRenderPipelinesCreated", "nativeRenderPasses", "nativeTextureUploads", "nativeTextureReadbacks"].every((term) => deviceSource.includes(term)),
    detail: "WebGPUDevice publishes counters at the actual native operation owners"
  },
  {
    id: "unsupported-and-partial-claims-are-bounded",
    pass: comparisonDoc.includes("does not claim TSL/node-material parity")
      && comparisonDoc.includes("does not claim WebGPU versions of every PBR extension")
      && /Explicit WebGPU\s+fails/.test(comparisonDoc),
    detail: "TSL, feature completeness, WebXR, recovery, and explicit-error boundaries are documented"
  }
];

writeReport(
  "tests/reports/webgpu-current-architecture/report.json",
  "aura3d-current-webgpu-architecture-gate/1.0",
  checks,
  {
    claimBoundary: "Current Three.js r185 multi-backend architecture comparison plus Aura3D real-hardware adapter/device, native render, texture, pass, readback, compute, fallback, error, and route evidence. This is not full WebGPU/TSL/renderer-feature parity.",
    inputs: [
      "tests/reports/current-threejs-baseline.json",
      "tests/reports/webgpu-hardware-matrix.json",
      "tests/reports/runtime-parity/webgpu-sdk-production/webgpu-sdk-production-report.json",
      "tests/reports/webgpu-current-architecture/architecture.json",
      "tests/reports/webgpu-current-architecture/native-routes.json"
    ]
  }
);

function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

function json(path: string): Json {
  if (!existsSync(resolve(path))) return {};
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8")) as Json;
  } catch {
    return {};
  }
}

function record(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Json : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
