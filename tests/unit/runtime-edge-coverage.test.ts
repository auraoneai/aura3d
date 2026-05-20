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
  "editor-runtime": {
    suites: ["tests/unit/workstream5-runtime.test.ts", "tests/unit/workstream5-input-audio-scripting-editor.test.ts"],
    edgeTerms: [/undo/i, /redo/i, /rollback/i, /delete/i, /selection/i]
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
  physics: {
    suites: ["tests/unit/workstream4.physics-animation.test.ts", "tests/integration/physics-animation-scene-ecs.test.ts"],
    edgeTerms: [/deterministic/i, /collision/i, /sensor/i, /raycast/i, /constraints?/i]
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
      "packages/rendering/src/RendererTiming.ts:return createCpuFallbackGpuTimingBackend(\"EXT_disjoint_timer_query_webgl2 unavailable; using CPU timing fallback.\");"
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
