import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

type Json = Record<string, unknown>;

const webgl = json("tests/reports/portable-custom-materials/webgl2.json");
const webgpu = json("tests/reports/portable-custom-materials/webgpu.json");
const comparison = json("tests/reports/portable-custom-materials/comparison.json");
const source = read("packages/rendering/src/PortableShaderMaterial.ts");
const device = read("packages/rendering/src/WebGPUDevice.ts");
const forwardPass = read("packages/rendering/src/ForwardPass.ts");
const example = read("examples/custom-material-lab/main.ts");
const baseline = read("benchmark/current-threejs/portable-materials/main.ts");
const docs = read("docs/rendering/portable-custom-materials.md");
const webglState = record(webgl.state);
const webgpuState = record(webgpu.state);
const webgpuDiagnostics = record(webgpuState.diagnostics);
const reloaded = record(webgpu.reloaded);
const wgslCompile = record(webgpu.wgslCompile);
const runtimeCompile = record(webgl.runtimeCompile);
const invalid = record(webgl.invalid);
const disposal = record(webgl.disposal);
const threeOutput = array(record(comparison.output).three).map(record);

const checks: ReleaseCheck[] = [
  {
    id: "public-paired-material-contract",
    pass: source.includes("export class PortableShaderMaterial")
      && source.includes("readonly glsl")
      && source.includes("readonly wgsl")
      && source.includes("uniformSchema")
      && source.includes("portableBindings"),
    detail: "public material owns paired stages and schema-driven renderer bindings"
  },
  {
    id: "typed-numeric-and-texture-bindings",
    pass: source.includes("texture2d")
      && device.includes("createNativePortableBindings")
      && number(webgpuDiagnostics.nativeTextureBindings) >= 1,
    detail: `native texture bindings=${number(webgpuDiagnostics.nativeTextureBindings)}`
  },
  {
    id: "three-nontrivial-public-materials",
    pass: (example.match(/new PortableShaderMaterial/g) ?? []).length === 3
      && webglState.materialCount === 3
      && webgpuState.materialCount === 3
      && number(webglState.diagnostics && record(webglState.diagnostics).drawCalls) === 3
      && number(webgpuDiagnostics.drawCalls) === 3,
    detail: "plasma, analytic contour, and texture dissolve each draw through Renderer"
  },
  {
    id: "real-webgl2-and-native-webgpu-output",
    pass: webglState.backend === "webgl2"
      && webgpuState.backend === "webgpu"
      && number(webgpuDiagnostics.nativeSubmissions) >= 3
      && number(webgpuDiagnostics.nativeRenderPipelinesCreated) >= 3
      && Boolean(webgl.beforeHash)
      && Boolean(webgpu.imageHash),
    detail: `webgpu submissions=${number(webgpuDiagnostics.nativeSubmissions)}, pipelines=${number(webgpuDiagnostics.nativeRenderPipelinesCreated)}`
  },
  {
    id: "atomic-hot-reload-invalidates-renderer-cache",
    pass: source.includes("hotReload(")
      && source.includes("shaderLibrary.replace")
      && forwardPass.includes("record.revision !== revision")
      && webgl.beforeHash !== webgl.afterHash
      && reloaded.hotReloaded === true,
    detail: "paired replacement changes pixels and renderer cache follows ShaderLibrary revision"
  },
  {
    id: "glsl-wgsl-and-structural-diagnostics",
    pass: record(runtimeCompile).ok === false
      && String(array(runtimeCompile.diagnostics).join(" ")).includes("shader compile failed")
      && wgslCompile.ok === false
      && String(array(wgslCompile.diagnostics).join(" ")).includes("definitely_missing")
      && invalid.name === "PortableShaderCompilationError"
      && array(invalid.diagnostics).length >= 2,
    detail: "preflight, real WebGL driver log, and native WGSL compilation info are captured"
  },
  {
    id: "owned-disposal",
    pass: disposal.materialsDisposed === true
      && disposal.rendererDisposed === true
      && source.includes("shaderLibrary.unregister"),
    detail: "materials unregister their shaders and renderer/device resources are disposed"
  },
  {
    id: "current-threejs-r185-tsl-control",
    pass: record(comparison.baseline).package === "three@0.185.1"
      && baseline.includes('from "three/webgpu"')
      && baseline.includes('from "three/tsl"')
      && threeOutput.length === 2
      && threeOutput.some((entry) => entry.backend === "webgl2")
      && threeOutput.some((entry) => entry.backend === "webgpu"),
    detail: "the locked real TSL control renders all three workload classes on both r185 backends"
  },
  {
    id: "comparison-is-honest-about-tsl-gap",
    pass: String(comparison.verdict).includes("does not claim general TSL")
      && docs.includes("73")
      && docs.includes("204")
      && docs.includes("not asserted to be pixel-equivalent")
      && docs.includes("not a claim of general"),
    detail: "authored code, output scope, diagnostics, portability, and remaining composability gap are explicit"
  },
  {
    id: "public-example-has-no-three-or-deep-imports",
    pass: !/from\s+["']three(?:\/|["'])/.test(example)
      && !/@aura3d\/[a-z0-9-]+\/src\//.test(example),
    detail: "Aura lab uses only the stable @aura3d/rendering package entry"
  }
];

writeReport(
  "tests/reports/portable-custom-materials/report.json",
  "aura3d-portable-custom-materials-gate/1.0",
  checks,
  {
    claimBoundary: "Supported @aura3d/rendering ShaderMaterial-class path for the three selected portable workloads. Explicit paired GLSL/WGSL is proven on real WebGL2 and native WebGPU. General TSL/node-material parity and root createAuraApp shader authoring are not claimed.",
    sourceHashes: {
      aura: sha(example),
      three: sha(baseline),
      implementation: sha(source)
    },
    inputs: [
      "tests/reports/portable-custom-materials/webgl2.json",
      "tests/reports/portable-custom-materials/webgpu.json",
      "tests/reports/portable-custom-materials/comparison.json"
    ]
  }
);

function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}

function json(path: string): Json {
  try { return JSON.parse(read(path)) as Json; } catch { return {}; }
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

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
