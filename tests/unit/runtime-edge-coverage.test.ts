import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

interface RuntimeSuiteMapping {
  readonly suites: readonly string[];
  readonly edgeTerms: readonly RegExp[];
}

interface ChecklistSourceFile {
  readonly file: string;
  readonly requiredTests: string;
}

interface ChecklistFile {
  readonly file: string;
  readonly requiredTests: string;
  readonly completionChecklist: string;
}

const runtimeSuiteMappings: Record<string, RuntimeSuiteMapping> = {
  animation: {
    suites: ["tests/unit/workstream4.physics-animation.test.ts", "tests/integration/physics-animation-scene-ecs.test.ts"],
    edgeTerms: [/missing targets?/i, /loop/i, /disposal/i, /deterministic/i, /state transitions?/i]
  },
  assets: {
    suites: ["tests/unit/workstream5-runtime.test.ts", "tests/browser/asset-texture-browser.spec.ts"],
    edgeTerms: [/duplicate/i, /failed loads?/i, /dependency/i, /GLB/i, /disposal/i]
  },
  audio: {
    suites: ["tests/unit/workstream5-input-audio-scripting-editor.test.ts", "tests/browser/audio-browser.spec.ts"],
    edgeTerms: [/unavailable/i, /dispose/i, /spatial/i, /context/i, /lifecycle/i]
  },
  core: {
    suites: [
      "tests/unit/core/config-time.test.ts",
      "tests/unit/core/edge-cases.test.ts",
      "tests/unit/core/events-disposal-diagnostics.test.ts",
      "tests/unit/core/scheduler-engine.test.ts",
      "tests/integration/engine-loop.test.ts"
    ],
    edgeTerms: [/rejects?/i, /throws?/i, /disposed/i, /deterministic/i, /listener failures?/i]
  },
  controls: {
    suites: [
      "tests/unit/controls/interaction-controls.test.ts",
      "tests/unit/controls/picking-contract.test.ts",
      "tests/unit/controls/three-compat-controls.test.ts",
      "tests/unit/controls/transform-controls-three-parity.test.ts"
    ],
    edgeTerms: [/pointer/i, /drag/i, /dispose/i, /invalid/i, /selection/i]
  },
  "create-g3d": {
    suites: [
      "tests/integration/production-runtime-create-g3d.test.ts",
      "tests/integration/three-compat-create-g3d.test.ts"
    ],
    edgeTerms: [/template/i, /dependencies/i, /README/i, /package/i, /throws?/i]
  },
  debug: {
    suites: [
      "tests/unit/debug/debug-runtime.test.ts",
      "tests/unit/debug/rendering-diagnostics.test.ts",
      "tests/unit/workstream4.physics-animation.test.ts"
    ],
    edgeTerms: [/snapshot/i, /disposed/i, /stable/i, /diagnostics?/i, /without mutation/i]
  },
  ecs: {
    suites: ["tests/unit/ecs/runtime.test.ts", "tests/integration/scene-ecs-contracts.test.ts"],
    edgeTerms: [/stale/i, /cycle/i, /mutation/i, /serialization/i, /edge-case/i]
  },
  engine: {
    suites: [
      "tests/unit/engine/runtime-parity-production-runtime-public-sdk.test.ts",
      "tests/unit/engine/runtime-parity-production-runtime-runtime-boundary.test.ts",
      "tests/unit/engine/threejs-parity-public-runtime.test.ts",
      "tests/browser/production-runtime-webgl2-context-loss.spec.ts"
    ],
    edgeTerms: [/fallback/i, /unavailable/i, /dispose/i, /diagnostics?/i, /runtime/i]
  },
  "editor-runtime": {
    suites: ["tests/unit/workstream5-runtime.test.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts"],
    edgeTerms: [/undo/i, /redo/i, /rollback/i, /delete/i, /selection/i]
  },
  environments: {
    suites: [
      "tests/unit/environments/production-runtime-hdr-environment-corpus.test.ts",
      "tests/unit/environments/three-compat-environments.test.ts",
      "tests/unit/rendering/environment-platform.test.ts"
    ],
    edgeTerms: [/HDR/i, /missing/i, /diagnostics?/i, /fallback/i, /PMREM/i]
  },
  input: {
    suites: [
      "tests/unit/input/camera-controls.test.ts",
      "tests/unit/workstream5-input-audio-scripting-editor.test.ts",
      "tests/browser/input-browser.spec.ts"
    ],
    edgeTerms: [/cleanup/i, /keyboard/i, /pointer/i, /gamepad/i, /controls?/i]
  },
  math: {
    suites: ["tests/unit/math/edge-cases.test.ts", "tests/unit/math/geometry-random.test.ts", "tests/unit/math/vector-matrix.test.ts"],
    edgeTerms: [/degenerate/i, /rejects?/i, /undefined/i, /deterministic/i, /singular/i]
  },
  materials: {
    suites: [
      "tests/unit/materials/three-compat-material-library.test.ts",
      "tests/unit/rendering/material-binding.test.ts",
      "tests/unit/rendering/material-presets.test.ts",
      "tests/unit/rendering/physical-material-presets.test.ts"
    ],
    edgeTerms: [/invalid/i, /texture/i, /diagnostics?/i, /preset/i, /material/i]
  },
  physics: {
    suites: ["tests/unit/workstream4.physics-animation.test.ts", "tests/integration/physics-animation-scene-ecs.test.ts"],
    edgeTerms: [/deterministic/i, /collision/i, /sensor/i, /raycast/i, /constraints?/i]
  },
  "product-studio": {
    suites: [
      "tests/unit/product-studio/product-asset-loader.test.ts",
      "tests/unit/product-studio/product-camera.test.ts",
      "tests/unit/product-studio/product-export.test.ts",
      "tests/unit/product-studio/product-materials.test.ts",
      "tests/unit/product-studio/product-showcase-layout.test.ts"
    ],
    edgeTerms: [/missing/i, /bounds/i, /manifest/i, /export/i, /asset/i]
  },
  rendering: {
    suites: [
      "tests/unit/rendering/geometry-primitives.test.ts",
      "tests/unit/rendering/material-binding.test.ts",
      "tests/unit/rendering/pbr-lighting.test.ts",
      "tests/unit/rendering/render-graph.test.ts",
      "tests/unit/rendering/render-resources.test.ts",
      "tests/unit/rendering/renderer.test.ts",
      "tests/unit/rendering/shadow-pass.test.ts",
      "tests/unit/rendering/vertex-buffer.test.ts",
      "tests/unit/rendering/vertex-format.test.ts",
      "tests/browser/rendering-webgl2.spec.ts",
      "tests/visual/rendering-pixels.spec.ts"
    ],
    edgeTerms: [/invalid/i, /throws?/i, /readback/i, /resize/i, /disposal/i]
  },
  scene: {
    suites: [
      "tests/unit/scene/camera-frustum.test.ts",
      "tests/unit/scene/hierarchy-serialization.test.ts",
      "tests/integration/scene-ecs-contracts.test.ts"
    ],
    edgeTerms: [/cycle/i, /removal/i, /negative scale/i, /serialization/i, /validation/i]
  },
  scripting: {
    suites: ["tests/unit/workstream5-input-audio-scripting-editor.test.ts", "tests/integration/scripting-scene-ecs.test.ts"],
    edgeTerms: [/validation/i, /execution order/i, /event/i, /serialization/i, /deterministic/i]
  },
  "three-compat": {
    suites: [
      "tests/unit/three-compat/three-compat-core-compat.test.ts",
      "tests/unit/three-compat/three-compat-material-geometry-compat.test.ts",
      "tests/unit/three-compat/three-compat-migration.test.ts",
      "tests/unit/three-compat/three-compat-threejs-inventory.test.ts"
    ],
    edgeTerms: [/compat/i, /migration/i, /warnings?/i, /unsupported/i, /inventory/i]
  },
  workflows: {
    suites: [
      "tests/unit/workflows/asset-viewer-workflow.test.ts",
      "tests/unit/workflows/product-configurator-workflow.test.ts",
      "tests/unit/workflows/material-studio-workflow.test.ts",
      "tests/unit/workflows/production-runtime-workflows.test.ts"
    ],
    edgeTerms: [/workflow/i, /diagnostics?/i, /asset/i, /missing/i, /runtime/i]
  }
};

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function runtimeSourceFiles(): string[] {
  return walk(join(root, "packages"))
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => /^packages\/[^/]+\/src\/.+\.ts$/.test(path))
    .filter((path) => !path.endsWith("/index.ts"))
    .filter((path) => !path.startsWith("packages/test-utils/"))
    .sort();
}

function checklistFiles(): ChecklistFile[] {
  const checklistPath = join(root, "docs/24-File-by-File-Rebuild-Checklist.md");
  const rows = readFileSync(checklistPath, "utf8")
    .split("\n")
    .filter((line) => /^\|\s*`[^`]+`/.test(line));

  return rows
    .map((line) => line.split("|").map((column) => column.trim()))
    .map((columns) => ({
      file: columns[1].replaceAll("`", ""),
      requiredTests: columns[4] ?? "",
      completionChecklist: columns[5] ?? ""
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function checklistSourceFiles(): ChecklistSourceFile[] {
  return checklistFiles()
    .filter((row) => /^packages\/[^/]+\/src\/.+\.ts$/.test(row.file))
    .map((row) => ({ file: row.file, requiredTests: row.requiredTests }));
}

function packageName(file: string): string {
  const match = /^packages\/([^/]+)\//.exec(file);
  if (!match) throw new Error(`Cannot derive package name from ${file}`);
  return match[1];
}

describe("runtime edge-case coverage audit", () => {
  it("maps every pure runtime source file to an edge-focused test suite", () => {
    const sourceFiles = runtimeSourceFiles();
    const missing = sourceFiles.filter((file) => runtimeSuiteMappings[packageName(file)] === undefined);

    expect(sourceFiles.length).toBeGreaterThan(200);
    expect(missing).toEqual([]);
  });

  it("keeps every mapped suite present and explicitly exercising edge behavior", () => {
    const failures: string[] = [];

    for (const [packageId, mapping] of Object.entries(runtimeSuiteMappings)) {
      let packageEvidence = "";
      for (const suite of mapping.suites) {
        const suitePath = join(root, suite);
        if (!existsSync(suitePath)) {
          failures.push(`${packageId}: missing ${suite}`);
          continue;
        }
        packageEvidence += `\n${readFileSync(suitePath, "utf8")}`;
      }
      if (!mapping.edgeTerms.some((term) => term.test(packageEvidence))) {
        failures.push(`${packageId}: mapped suites lack package edge-case evidence terms`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("does not allow new runtime packages to bypass the edge-case audit", () => {
    const packagesWithRuntime = new Set(runtimeSourceFiles().map((file) => packageName(file)));
    const mappedPackages = new Set(Object.keys(runtimeSuiteMappings));
    const unmappedPackages = [...packagesWithRuntime].filter((packageId) => !mappedPackages.has(packageId));
    const deadMappings = [...mappedPackages].filter((packageId) => !packagesWithRuntime.has(packageId));

    expect(unmappedPackages).toEqual([]);
    expect(deadMappings).toEqual([]);
  });

  it("maps every rebuild checklist implementation file to required test evidence", () => {
    const checklistFiles = checklistSourceFiles();
    const sourceFiles = new Set(runtimeSourceFiles());
    const publicApiSuite = "tests/unit/public-api-contracts.test.ts";
    const failures: string[] = [];

    expect(checklistFiles.length).toBeGreaterThan(200);

    for (const row of checklistFiles) {
      if (!existsSync(join(root, row.file))) {
        failures.push(`${row.file}: checklist file is missing from packages/src`);
      }
      if (row.requiredTests.length === 0 || /^none$/i.test(row.requiredTests)) {
        failures.push(`${row.file}: checklist row has no required tests`);
      }

      if (row.file.endsWith("/index.ts")) {
        if (!existsSync(join(root, publicApiSuite))) {
          failures.push(`${row.file}: missing ${publicApiSuite}`);
        }
        continue;
      }

      if (!sourceFiles.has(row.file)) {
        failures.push(`${row.file}: not included in runtime source audit`);
      }

      const mapping = runtimeSuiteMappings[packageName(row.file)];
      if (mapping === undefined) {
        failures.push(`${row.file}: package has no runtime suite mapping`);
        continue;
      }

      const missingSuites = mapping.suites.filter((suite) => !existsSync(join(root, suite)));
      for (const suite of missingSuites) {
        failures.push(`${row.file}: mapped suite missing ${suite}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps every rebuild checklist file present with test and completion criteria", () => {
    const checklistRows = checklistFiles();
    const failures: string[] = [];

    expect(checklistRows.length).toBeGreaterThan(240);

    for (const row of checklistRows) {
      if (!existsSync(join(root, row.file))) {
        failures.push(`${row.file}: checklist file is missing`);
      }
      if (row.requiredTests.length === 0 || /^none$/i.test(row.requiredTests)) {
        failures.push(`${row.file}: required tests column is empty`);
      }
      if (row.completionChecklist.length === 0) {
        failures.push(`${row.file}: completion checklist column is empty`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("does not expose unavailable or placeholder markers from required production source features", () => {
    const allowedCapabilityMarkers = new Set([
      "packages/core/src/EngineLoop.ts:if (typeof requestAnimationFrame !== \"function\") throw new Error(\"requestAnimationFrame is unavailable.\");",
      "packages/debug/src/GPUProfiler.ts:unavailableReason?: string;",
      "packages/debug/src/GPUProfiler.ts:private readonly unavailableReason = \"GPU timing extension unavailable\"",
      "packages/debug/src/GPUProfiler.ts:unavailableReason: this.unavailableReason",
      "packages/debug/src/ChromeTraceExporter.ts:args: { reason: gpu.unavailableReason ?? \"GPU timing unavailable\" }",
      "packages/rendering/src/RendererFeatureGates.ts:return supportedIf(feature, capabilities.has(\"gpu-timing\"), \"GPU timing is unavailable; callers must use CPU timing diagnostics.\");",
      "packages/rendering/src/RendererFeatureGates.ts:\"WebGPU compute is unavailable on this backend or adapter.\"",
      "packages/rendering/src/RendererTiming.ts:this.fallbackReason = options.fallbackReason ?? this.gpuBackend.unavailableReason ?? \"GPU timing unavailable; using CPU timing fallback.\";",
      "packages/rendering/src/RendererTiming.ts:unavailableReason = \"GPU timing unavailable; using CPU timing fallback.\"",
      "packages/rendering/src/RendererTiming.ts:return createCpuFallbackGpuTimingBackend(\"EXT_disjoint_timer_query_webgl2 unavailable; using CPU timing fallback.\");",
      "packages/rendering/src/EnvironmentPlatform.ts:capability(\"cube-camera-reflections\", \"Cube Camera Reflections\", \"missing\", false, [], \"ReflectionProbe is a descriptor helper; live six-direction capture is not implemented.\", \"Implement cube camera/probe capture and reflective material binding.\"),",
      "packages/rendering/src/EnvironmentPlatform.ts:\"Requested reflective floor falls back to staged geometry; planar reflector/cube-camera floor reflections are not implemented.\"",
      "packages/rendering/src/EnvironmentPlatform.ts:\"Requested terrain ground falls back to outdoor backdrop geometry; reusable terrain/heightfield generation is not implemented.\"",
      "packages/rendering/src/EnvironmentPlatform.ts:\"Softbox preset uses emissive panels and environment lighting; true rectangular area-light shading is not implemented.\"",
      "packages/rendering/src/EnvironmentPlatform.ts:\"Cube-camera reflection requests remain unsupported; live six-direction probe capture and reflective material binding are not implemented.\"",
      "packages/rendering/src/ReflectionSurfaces.ts:return [\"Planar reflector helper is not implemented; no mirror render target or clip-plane path exists in this contract.\"];",
      "packages/rendering/src/ReflectionSurfaces.ts:return [\"Glass/refractor helper is not implemented; material alpha/transmission must not be claimed as scene-space refraction.\"];",
      "packages/rendering/src/ReflectionSurfaces.ts:return [\"Water reflection/refraction helper is not implemented; procedural water remains separate and must disclose no true refraction.\"];",
      "packages/rendering/src/effects/ParticleDiagnostics.ts:warnings.push(backend.reason ?? \"GPU particle backend is unavailable in this runtime\");",
      "packages/rendering/src/postprocess/CinematicDiagnostics.ts:...(supportsDepthTexture ? [] : [\"Renderer-owned DOF injection is unavailable without depth-textures; callers may still provide a depth binding to the pixel kernel.\"]),",
      "packages/rendering/src/postprocess/CinematicDiagnostics.ts:...(supportsDepthTexture ? [] : [\"Renderer-owned SSAO injection is unavailable without depth-textures; callers may still provide a depth binding to the pixel kernel.\"]),",
      "packages/rendering/src/postprocess/EffectComposer.ts:reason: \"SMAA is not implemented in the public G3D postprocess pass catalog; use FXAA or TAA.\"",
      "packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts:export type V6WebGPUStatus = \"available\" | \"unavailable\" | \"blocked\";",
      "packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts:return unavailable(\"navigator.gpu is not exposed in this browser/runtime.\");",
      "packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts:return unavailable(\"WebGPU requestAdapter returned null.\");",
      "packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts:function unavailable(reason: string): V6WebGPUReport {",
      "packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts:status: \"unavailable\","
    ]);
    const markerPattern = /\b(?:unavailable|not implemented|placeholder|stub|fake success|deferred)\b/i;
    const failures: string[] = [];

    for (const file of runtimeSourceFiles()) {
      const lines = readFileSync(join(root, file), "utf8").split("\n");
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!markerPattern.test(trimmed)) return;
        const marker = `${file}:${trimmed}`;
        if (!allowedCapabilityMarkers.has(marker)) failures.push(marker);
      });
    }

    expect(failures).toEqual([]);
  });
});
