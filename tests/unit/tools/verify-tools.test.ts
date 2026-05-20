import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyBoundaries } from "../../../tools/verify-boundaries/index.js";
import { verifyArchitecture } from "../../../tools/verify-architecture/index.js";
import { verifyExports } from "../../../tools/verify-exports/index.js";
import { verifyPublicImports } from "../../../tools/verify-imports/index.js";
import { verifyShaders } from "../../../tools/verify-shaders/index.js";
import { isNonBlank } from "../../../tools/visual-baseline/index.js";
import { defaultCommands, runReleaseRepeat, runReleaseVerification, verifyReleaseReportFreshness } from "../../../tools/release-verification/index.js";
import { analyzeTraceReport } from "../../../tools/verify-trace/index.js";
import { verifySourceCleanliness } from "../../../tools/verify-source-cleanliness/index.js";
import { validateFinalDemos } from "../../../tools/final-demo-validation/index.js";
import { createCleanCheckoutReport } from "../../../tools/clean-checkout-verification/index.js";
import { scanDocContradictions } from "../../../tools/doc-contradiction-scan/index.js";
import { validateVersionedRelease } from "../../../tools/versioned-release-verification/index.js";
import { buildExternalDemoExport } from "../../../tools/external-demo-export/index.js";

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "g3d-tools-"));
}

function writePackage(root: string, name: string, source: string): void {
  const dir = join(root, "packages", name);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.ts"), source);
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: `@galileo3d/${name}`,
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }
  }));
}

describe("verification tools", () => {
  it("boundary verifier passes valid imports and fails invalid/private imports", () => {
    const valid = fixtureRoot();
    writePackage(valid, "math", "export const x = 1;\n");
    writePackage(valid, "core", "import { x } from '@galileo3d/math'; export const y = x;\n");
    expect(verifyBoundaries(valid)).toMatchObject({ ok: true });

    const invalid = fixtureRoot();
    writePackage(invalid, "core", "import { bad } from '@galileo3d/ecs'; export const y = bad;\n");
    writePackage(invalid, "ecs", "export const bad = 1;\n");
    expect(verifyBoundaries(invalid).ok).toBe(false);

    const deep = fixtureRoot();
    writePackage(deep, "core", "import { Vector3 } from '@galileo3d/math/src/Vector3'; export const y = Vector3;\n");
    writePackage(deep, "math", "export const Vector3 = 1;\n");
    expect(verifyBoundaries(deep).violations[0]?.message).toMatch(/private/i);

    const relative = fixtureRoot();
    writePackage(relative, "debug", "import { x } from '../../physics/src/index.js'; export const y = x;\n");
    writePackage(relative, "physics", "export const x = 1;\n");
    expect(verifyBoundaries(relative).violations[0]?.message).toMatch(/relative imports across package boundaries/i);
  });

  it("export verifier detects missing barrels and root exports", () => {
    const root = fixtureRoot();
    writePackage(root, "math", "export const x = 1;\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@galileo3d/engine", exports: { ".": "./dist/index.js", "./math": "./dist/math/index.js" } }));
    expect(verifyExports(root).ok).toBe(true);

    const broken = fixtureRoot();
    mkdirSync(join(broken, "packages", "math", "src"), { recursive: true });
    writeFileSync(join(broken, "packages", "math", "package.json"), JSON.stringify({ name: "@galileo3d/math", main: "./dist/index.js", types: "./dist/index.d.ts", exports: { ".": "./dist/index.js" } }));
    expect(verifyExports(broken).ok).toBe(false);
  });

  it("architecture verifier checks target layout, scripts, public exports, and private test utilities", () => {
    const root = fixtureRoot();
    for (const dir of ["docs", "examples", "packages", "tests/unit", "tests/integration", "tests/browser", "tests/visual", "tests/performance"]) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    for (const dir of [
      "tools/verify-architecture",
      "tools/verify-boundaries",
      "tools/verify-exports",
      "tools/verify-imports",
      "tools/verify-shaders",
      "tools/verify-source-cleanliness",
      "tools/verify-trace",
      "tools/visual-baseline",
      "tools/package-size",
      "tools/release-verification",
      "tools/requirements-trace",
      "tools/final-demo-validation",
      "tools/finalize-dist"
    ]) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    for (const file of ["pnpm-workspace.yaml", "tsconfig.build.json", "vitest.config.ts", "playwright.config.ts", "eslint.config.js"]) {
      writeFileSync(join(root, file), "");
    }

    const packages = [
      "math",
      "core",
      "scene",
      "ecs",
      "rendering",
      "physics",
      "animation",
      "assets",
      "input",
      "audio",
      "scripting",
      "editor-runtime",
      "editor",
      "debug",
      "test-utils"
    ];
    for (const packageName of packages) {
      mkdirSync(join(root, "packages", packageName, "src"), { recursive: true });
      writeFileSync(join(root, "packages", packageName, "src", "index.ts"), "export {};\n");
      writeFileSync(join(root, "packages", packageName, "package.json"), JSON.stringify({
        name: `@galileo3d/${packageName}`,
        private: packageName === "test-utils" ? true : undefined
      }));
    }
    writeFileSync(join(root, "packages", "rendering", "src", "Renderer.ts"), "export class Renderer {}\n");
    writeFileSync(join(root, "packages", "rendering", "src", "ShaderLibrary.ts"), "export class ShaderLibrary {}\n");
    writeFileSync(join(root, "packages", "rendering", "src", "index.ts"), "export { Renderer } from './Renderer.js';\n");
    writeFileSync(join(root, "packages", "core", "src", "EventBus.ts"), "export class EventBus {}\n");
    writeFileSync(join(root, "packages", "scene", "src", "Hierarchy.ts"), "export class Hierarchy {}\n");

    const exportsMap = Object.fromEntries(packages.filter((packageName) => packageName !== "test-utils").map((packageName) => [`./${packageName}`, `./dist/${packageName}/index.js`]));
    const scripts = Object.fromEntries([
      "typecheck",
      "build",
      "test",
      "test:unit",
      "test:integration",
      "test:browser",
      "test:visual",
      "verify",
      "verify:architecture",
      "verify:boundaries",
      "verify:exports",
      "verify:imports",
      "verify:shaders",
      "verify:size",
      "verify:source-cleanliness",
      "verify:performance",
      "verify:demos",
      "trace:requirements",
      "verify:trace",
      "verify:release"
    ].map((script) => [script, "node -e \"\""]));
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts, exports: exportsMap }));
    writeFileSync(join(root, "tsconfig.base.json"), JSON.stringify({
      compilerOptions: {
        paths: Object.fromEntries(packages.map((packageName) => [`@galileo3d/${packageName}`, [`packages/${packageName}/src/index.ts`]]))
      }
    }));

    expect(verifyArchitecture(root)).toMatchObject({ ok: true });

    const legacy = fixtureRoot();
    mkdirSync(join(legacy, "Docs"), { recursive: true });
    const report = verifyArchitecture(legacy);
    expect(report.ok).toBe(false);
    expect(report.violations.some((violation) => violation.kind === "legacy-docs-tree")).toBe(true);
  });

  it("architecture verifier accepts grouped public Renderer exports", () => {
    const root = fixtureRoot();
    for (const dir of ["docs", "examples", "packages", "tests/unit", "tests/integration", "tests/browser", "tests/visual", "tests/performance"]) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    for (const dir of [
      "tools/verify-architecture",
      "tools/verify-boundaries",
      "tools/verify-exports",
      "tools/verify-imports",
      "tools/verify-shaders",
      "tools/verify-source-cleanliness",
      "tools/verify-trace",
      "tools/visual-baseline",
      "tools/package-size",
      "tools/release-verification",
      "tools/requirements-trace",
      "tools/final-demo-validation",
      "tools/finalize-dist"
    ]) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    for (const file of ["pnpm-workspace.yaml", "tsconfig.build.json", "vitest.config.ts", "playwright.config.ts", "eslint.config.js"]) {
      writeFileSync(join(root, file), "");
    }

    const packages = [
      "math",
      "core",
      "scene",
      "ecs",
      "rendering",
      "physics",
      "animation",
      "assets",
      "input",
      "audio",
      "scripting",
      "editor-runtime",
      "editor",
      "debug",
      "test-utils"
    ];
    for (const packageName of packages) {
      mkdirSync(join(root, "packages", packageName, "src"), { recursive: true });
      writeFileSync(join(root, "packages", packageName, "src", "index.ts"), "export {};\n");
      writeFileSync(join(root, "packages", packageName, "package.json"), JSON.stringify({
        name: `@galileo3d/${packageName}`,
        private: packageName === "test-utils" ? true : undefined
      }));
    }
    writeFileSync(join(root, "packages", "rendering", "src", "Renderer.ts"), "export class Renderer {}\n");
    writeFileSync(join(root, "packages", "rendering", "src", "ShaderLibrary.ts"), "export class ShaderLibrary {}\n");
    writeFileSync(join(root, "packages", "rendering", "src", "index.ts"), "export { DEFAULT_RENDERER_ENVIRONMENT_LIGHTING, Renderer } from './Renderer.js';\n");
    writeFileSync(join(root, "packages", "core", "src", "EventBus.ts"), "export class EventBus {}\n");
    writeFileSync(join(root, "packages", "scene", "src", "Hierarchy.ts"), "export class Hierarchy {}\n");

    const exportsMap = Object.fromEntries(packages.filter((packageName) => packageName !== "test-utils").map((packageName) => [`./${packageName}`, `./dist/${packageName}/index.js`]));
    const scripts = Object.fromEntries([
      "typecheck",
      "build",
      "test",
      "test:unit",
      "test:integration",
      "test:browser",
      "test:visual",
      "verify",
      "verify:architecture",
      "verify:boundaries",
      "verify:exports",
      "verify:imports",
      "verify:shaders",
      "verify:size",
      "verify:source-cleanliness",
      "verify:performance",
      "verify:demos",
      "trace:requirements",
      "verify:trace",
      "verify:release"
    ].map((script) => [script, "node -e \"\""]));
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts, exports: exportsMap }));
    writeFileSync(join(root, "tsconfig.base.json"), JSON.stringify({
      compilerOptions: {
        paths: Object.fromEntries(packages.map((packageName) => [`@galileo3d/${packageName}`, [`packages/${packageName}/src/index.ts`]]))
      }
    }));

    expect(verifyArchitecture(root)).toMatchObject({ ok: true });
  });

  it("shader verifier accepts markers and rejects missing markers", () => {
    const valid = fixtureRoot();
    mkdirSync(join(valid, "packages", "rendering", "src"), { recursive: true });
    writeFileSync(join(valid, "packages", "rendering", "src", "basic.wgsl"), "// @galileo3d-shader:basic\n");
    const validReport = verifyShaders(valid);
    expect(validReport.ok).toBe(true);
    expect(validReport.coverage.status).toBe("covered");
    expect(validReport.coverage.filesByExtension[".wgsl"]).toBe(1);
    expect(validReport.coverage.markerIds).toEqual(["basic"]);

    const invalid = fixtureRoot();
    mkdirSync(join(invalid, "packages", "rendering", "src"), { recursive: true });
    writeFileSync(join(invalid, "packages", "rendering", "src", "bad.wgsl"), "// missing marker\n");
    expect(verifyShaders(invalid).ok).toBe(false);

    const empty = fixtureRoot();
    const emptyReport = verifyShaders(empty);
    expect(emptyReport.ok).toBe(true);
    expect(emptyReport.coverage.status).toBe("not_applicable");
    expect(emptyReport.coverage.note).toMatch(/No shader source files/);
  });

  it("visual baseline helper catches blank buffers", () => {
    expect(isNonBlank({ width: 2, height: 1, rgba: [0, 0, 0, 255, 1, 0, 0, 255] })).toBe(true);
    expect(isNonBlank({ width: 2, height: 1, rgba: [0, 0, 0, 255, 0, 0, 0, 255] })).toBe(false);
  });

  it("import smoke verifier imports every root public subpath target", async () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "dist", "math"), { recursive: true });
    mkdirSync(join(root, "dist", "core"), { recursive: true });
    writeFileSync(join(root, "dist", "index.js"), "export const root = true;\n");
    writeFileSync(join(root, "dist", "math", "index.js"), "export const math = true;\n");
    writeFileSync(join(root, "dist", "core", "index.js"), "export const core = true;\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@galileo3d/engine",
      type: "module",
      exports: {
        ".": "./dist/index.js",
        "./math": "./dist/math/index.js",
        "./core": "./dist/core/index.js"
      }
    }));

    const report = await verifyPublicImports(root);
    expect(report.ok).toBe(true);
    expect(report.checkedSubpaths).toBe(3);
    expect(report.entries.map((entry) => entry.specifier).sort()).toEqual([
      "@galileo3d/engine",
      "@galileo3d/engine/core",
      "@galileo3d/engine/math"
    ]);
  });

  it("release verification report captures command output and failures", () => {
    const root = fixtureRoot();
    const report = runReleaseVerification(root, [
      ["pass", "node -e \"console.log('ok')\""],
      ["fail", "node -e \"console.error('bad'); process.exit(7)\""]
    ]);

    expect(report.ok).toBe(false);
    expect(report.commands[0]).toMatchObject({ name: "pass", exitCode: 0 });
    expect(report.commands[0]?.stdout).toContain("ok");
    expect(report.commands[1]).toMatchObject({ name: "fail", exitCode: 7 });
    expect(report.commands[1]?.stderr).toContain("bad");
  });

  it("release verification stamps run IDs and rejects stale final reports", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    const freshReportCommand = [
      "node -e",
      JSON.stringify("const fs=require('fs'); fs.mkdirSync('tests/reports',{recursive:true}); const report={generatedAt:new Date().toISOString(),releaseRunId:process.env.G3D_RELEASE_RUN_ID,status:'pass'}; fs.writeFileSync('tests/reports/performance.json',JSON.stringify(report)); fs.writeFileSync('tests/reports/final-performance.json',JSON.stringify(report));")
    ].join(" ");
    const report = runReleaseVerification(root, [["performance", freshReportCommand]], "test-release-run");
    expect(report.ok).toBe(false);
    expect(report.commandsOk).toBe(true);
    expect(report.freshnessOk).toBe(true);
    expect(report.fullGate).toBe(false);
    expect(report.releaseRunId).toBe("test-release-run");
    expect(report.reportFreshness.every((entry) => entry.fresh && entry.runIdMatches && entry.statusOk)).toBe(true);

    writeFileSync(join(root, "tests", "reports", "final-performance.json"), JSON.stringify({
      generatedAt: "2000-01-01T00:00:00.000Z",
      releaseRunId: "old-run",
      status: "pass"
    }));
    const stale = verifyReleaseReportFreshness(root, "new-run", new Date("2026-01-01T00:00:00.000Z"), ["performance"]);
    expect(stale.find((entry) => entry.path === "tests/reports/final-performance.json")).toMatchObject({
      fresh: false,
      runIdMatches: false,
      statusOk: true
    });
  });

  it("release verification treats real WebGPU matrix evidence as a browser-gate report", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "browser.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      status: "pass"
    }));
    writeFileSync(join(root, "tests", "reports", "final-browser.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      releaseRunId: "webgpu-matrix-run",
      status: "pass"
    }));
    writeFileSync(join(root, "tests", "reports", "webgpu-hardware-matrix.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "tests/browser/webgpu-real-device.spec.ts",
      evidenceType: "real-navigator-gpu-probe",
      results: [{
        browserName: "chromium",
        os: { platform: "darwin", release: "25.3.0" },
        hasNavigatorGpu: true,
        adapterStatus: "missing",
        deviceStatus: "not-requested",
        unsupportedCases: ["navigator.gpu.requestAdapter returned null"]
      }]
    }));

    const freshness = verifyReleaseReportFreshness(root, "webgpu-matrix-run", new Date(Date.now() - 10_000), ["browser"]);

    expect(freshness.map((entry) => entry.path)).toContain("tests/reports/webgpu-hardware-matrix.json");
    expect(freshness.find((entry) => entry.path === "tests/reports/webgpu-hardware-matrix.json")).toMatchObject({
      fresh: true,
      runIdMatches: true,
      statusOk: true
    });
  });

  it("release verification rejects green command exits when a required final report is failed", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    const failedReportCommand = [
      "node -e",
      JSON.stringify("const fs=require('fs'); fs.mkdirSync('tests/reports',{recursive:true}); const report={generatedAt:new Date().toISOString(),releaseRunId:process.env.G3D_RELEASE_RUN_ID,status:'fail'}; fs.writeFileSync('tests/reports/performance.json',JSON.stringify(report)); fs.writeFileSync('tests/reports/final-performance.json',JSON.stringify(report));")
    ].join(" ");
    const report = runReleaseVerification(root, [["performance", failedReportCommand]], "failed-report-run");

    expect(report.commandsOk).toBe(true);
    expect(report.freshnessOk).toBe(false);
    expect(report.failedCommands).toContain("failed-report:tests/reports/performance.json");
    expect(report.reportFreshness.find((entry) => entry.path === "tests/reports/final-performance.json")).toMatchObject({
      fresh: true,
      runIdMatches: true,
      statusOk: false
    });
  });

  it("release repeat summarizes repeated gate failures", () => {
    const root = fixtureRoot();
    const repeat = runReleaseRepeat(root, 2, [
      ["pass", "node -e \"process.exit(0)\""],
      ["fail", "node -e \"process.exit(3)\""]
    ]);

    expect(repeat.ok).toBe(false);
    expect(repeat.runs).toHaveLength(2);
    expect(repeat.commandFailureCounts.fail).toBe(2);
    expect(repeat.runs.every((run) => run.releaseRunId.startsWith("release-"))).toBe(true);
    expect(repeat.hardGateRows.find((row) => row.row === 81)).toMatchObject({
      proven: false
    });
    expect(repeat.hardGateRows.find((row) => row.row === 696)?.blockers.join(" ")).toMatch(/independent/i);
  });

  it("release verification default gates include trace and performance", () => {
    const names = defaultCommands.map(([name]) => name);
    expect(names).toContain("build");
    expect(names).toContain("unit");
    expect(names).toContain("integration");
    expect(names.indexOf("unit")).toBeLessThan(names.indexOf("integration"));
    expect(names).toContain("architecture");
    expect(names).toContain("source-cleanliness");
    expect(names).toContain("clean-checkout");
    expect(names.indexOf("source-cleanliness")).toBeLessThan(names.indexOf("clean-checkout"));
    expect(names).toContain("performance");
    expect(names.indexOf("performance")).toBeLessThan(names.indexOf("browser"));
    expect(names).toContain("demo-validation");
    expect(names.indexOf("visual")).toBeLessThan(names.indexOf("demo-validation"));
    expect(names).toContain("docs-consistency");
    expect(names.indexOf("demo-validation")).toBeLessThan(names.indexOf("docs-consistency"));
    expect(names).toContain("claims");
    expect(names.indexOf("docs-consistency")).toBeLessThan(names.indexOf("claims"));
    expect(names).toContain("requirements-trace");
    expect(names.indexOf("claims")).toBeLessThan(names.indexOf("requirements-trace"));
    expect(names).toContain("trace");
  });

  it("doc contradiction scan rejects GO audit language mixed with incomplete status and stale totals", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "completion-audit.md"), [
      "# Completion Audit",
      "",
      "The final status is GO.",
      "",
      "The renderer production path remains incomplete.",
      "",
      "| Final status | GO |",
      "| Number of traced requirements | 1,627 |"
    ].join("\n"));

    const failed = scanDocContradictions(root, ["docs/project/completion-audit.md"]);
    expect(failed.ok).toBe(false);
    expect(failed.violations.map((violation) => violation.kind).sort()).toEqual([
      "go-with-incomplete-language",
      "stale-trace-total"
    ]);

    writeFileSync(join(root, "docs", "completion-audit.md"), [
      "# Completion Audit",
      "",
      "Current status: NO-GO.",
      "",
      "The renderer production path remains incomplete.",
      "",
      "| Number of traced requirements | 1,625 |"
    ].join("\n"));
    expect(scanDocContradictions(root, ["docs/project/completion-audit.md"]).ok).toBe(true);
  });

  it("doc contradiction scan rejects disagreement between audit, final plan, and v2 decision gate status", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "docs", "v2"), { recursive: true });
    writeFileSync(join(root, "docs", "completion-audit.md"), "Current status: NO-GO.\n");
    writeFileSync(join(root, "docs", "implementation-plan-final.md"), "Current status: GO.\n");
    writeFileSync(join(root, "docs", "v2", "decision-gates.md"), "Current status: **not met**.\n");

    const failed = scanDocContradictions(root, [
      "docs/project/completion-audit.md",
      "docs/project/implementation-plan.md",
      "docs/project/v2-decision-gates.md"
    ]);
    expect(failed.ok).toBe(false);
    expect(failed.violations.some((violation) => violation.kind === "status-disagreement")).toBe(true);

    writeFileSync(join(root, "docs", "implementation-plan-final.md"), "Current status: NO-GO.\n");
    expect(scanDocContradictions(root, [
      "docs/project/completion-audit.md",
      "docs/project/implementation-plan.md",
      "docs/project/v2-decision-gates.md"
    ]).ok).toBe(true);
  });

  it("clean-checkout verification records git, package manager, OS, browser, GPU, and run ID fields", () => {
    const previousIndependent = process.env.G3D_INDEPENDENT_REPRODUCTION;
    const previousEvidence = process.env.G3D_INDEPENDENT_REPRODUCTION_EVIDENCE;

    delete process.env.G3D_INDEPENDENT_REPRODUCTION;
    delete process.env.G3D_INDEPENDENT_REPRODUCTION_EVIDENCE;

    try {
      const report = createCleanCheckoutReport(process.cwd());
      expect(report.releaseRunId).toBeTruthy();
      expect(Array.isArray(report.blockers)).toBe(true);
      expect(report.git).toHaveProperty("sha");
      expect(typeof report.git.dirty).toBe("boolean");
      expect(Array.isArray(report.git.dirtyFiles)).toBe(true);
      expect(report.ok).toBe(!report.git.dirty);
      expect(report.packageManager.pnpmVersion).toBeTruthy();
      expect(report.environment.nodeVersion).toBe(process.version);
      expect(report.environment.platform).toBe(process.platform);
      expect(report.browser).toHaveProperty("playwrightVersion");
      expect(report.gpu).toMatchObject({
        available: false,
        renderer: null,
        vendor: null
      });
      expect(report.reproduction.cleanCheckout).toBe(!report.git.dirty);
      expect(report.reproduction.independentMachineOrAgent).toBe(false);
      expect(report.reproduction.blockers.join(" ")).toMatch(/Independent/i);
    } finally {
      if (previousIndependent === undefined) {
        delete process.env.G3D_INDEPENDENT_REPRODUCTION;
      } else {
        process.env.G3D_INDEPENDENT_REPRODUCTION = previousIndependent;
      }

      if (previousEvidence === undefined) {
        delete process.env.G3D_INDEPENDENT_REPRODUCTION_EVIDENCE;
      } else {
        process.env.G3D_INDEPENDENT_REPRODUCTION_EVIDENCE = previousEvidence;
      }
    }
  }, 15_000);

  it("final demo validator requires browser, visual, interaction, and performance evidence", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    const examples = [
      "00-basic-triangle",
      "01-basic-scene",
      "02-materials-pbr",
      "03-shadows",
      "04-physics-stack",
      "05-animation-character",
      "06-asset-gltf",
      "07-input-controls",
      "08-audio-spatial",
      "09-editor-runtime",
      "10-particles",
      "11-showcase-world"
    ];
    const productExamples = ["product-configurator", "architecture-viewer", "game-slice"];
    writeFileSync(join(root, "tests", "reports", "browser.json"), JSON.stringify({
      stats: { unexpected: 0 },
      errors: [],
      suites: [{
        specs: [
          ...examples.map((id) => ({ title: `${id} reaches ready in Chromium`, ok: true, tests: [] })),
          ...productExamples.map((id) => ({ title: `${id} product demo reaches ready in Chromium`, ok: true, tests: [] })),
          { title: "input and editor examples expose first-person, orbit, and editor selection metrics", ok: true, tests: [] }
        ]
      }]
    }));
    writeFileSync(join(root, "tests", "reports", "visual-browser.json"), JSON.stringify({
      stats: { unexpected: 0 },
      errors: [],
      suites: [{ specs: examples.map((id) => ({ title: `${id} has expected visible pixels`, ok: true, tests: [] })) }]
    }));
    writeFileSync(join(root, "tests", "reports", "visual.json"), JSON.stringify({ ok: true, browserChecks: 20, violations: [] }));
    writeFileSync(join(root, "tests", "reports", "performance.json"), JSON.stringify({ status: "pass", baselines: [] }));
    writeFileSync(join(root, "tests", "reports", "pbr-environment-validation.json"), JSON.stringify({
      ok: true,
      claimBoundary: {
        supported: "Renderer-backed WebGL2 PBR material lab with a bounded diffuse ambient environment approximation.",
        unsupported: ["No production PBR parity claim."]
      },
      validations: [{ name: "pbr-material-lab" }, { name: "pbr-camera-threejs-comparison" }]
    }));
    writeFileSync(join(root, "tests", "reports", "pbr-rendering-comparison.json"), JSON.stringify({
      ok: true,
      claimBoundary: {
        supported: "One bounded perspective-camera WebGL2 PBR scene is rendered in Galileo3D and a same-page Three.js reference.",
        unsupported: ["No production PBR parity claim."]
      }
    }));

    expect(validateFinalDemos(root)).toMatchObject({
      ok: true,
      interactionMetricsPassed: true,
      productRendererBackedPassed: true,
      pbrEnvironmentReportPassed: true,
      browserReadyExamples: examples,
      productBrowserReadyExamples: productExamples,
      visualPixelExamples: examples
    });

    writeFileSync(join(root, "tests", "reports", "visual.json"), JSON.stringify({ ok: true, browserChecks: 2, violations: [] }));
    const failed = validateFinalDemos(root);
    expect(failed).toMatchObject({ ok: false });
    expect(failed.upstreamReports.find((report) => report.name === "visual")).toMatchObject({
      path: "tests/reports/visual.json",
      ok: false,
      reason: "ok=true, browserChecks=2"
    });
  });

  it("versioned release verifier requires a concrete tarball with matching sha256", () => {
    const root = fixtureRoot();
    const artifactPath = join(root, "release-artifacts", "engine.tgz");
    mkdirSync(join(root, "release-artifacts"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@galileo3d/engine",
      version: "0.1.0-alpha.0",
      private: false
    }));
    writeFileSync(artifactPath, "package bytes");
    const sha256 = createHash("sha256").update("package bytes").digest("hex");
    writeFileSync(join(root, "docs", "release-artifacts.json"), JSON.stringify({
      version: "0.1.0-alpha.0",
      artifacts: [
        {
          type: "tarball",
          name: "@galileo3d/engine",
          version: "0.1.0-alpha.0",
          pathOrUrl: "release-artifacts/engine.tgz",
          sha256,
          createdAt: "2026-05-07T00:00:00.000Z"
        }
      ]
    }));

    expect(validateVersionedRelease(root)).toMatchObject({ ok: true, artifactCount: 1 });

    writeFileSync(join(root, "docs", "release-artifacts.json"), JSON.stringify({
      version: "0.1.0-alpha.0",
      artifacts: [
        {
          type: "tarball",
          name: "@galileo3d/engine",
          version: "0.1.0-alpha.0",
          pathOrUrl: "release-artifacts/engine.tgz",
          sha256: "bad",
          createdAt: "2026-05-07T00:00:00.000Z"
        }
      ]
    }));

    const broken = validateVersionedRelease(root);
    expect(broken.ok).toBe(false);
    expect(broken.violations.some((violation) => /sha256/.test(violation))).toBe(true);
  });

  it("external demo exporter builds the five required deployable static demo pages", async () => {
    const outputDir = join(fixtureRoot(), "external-demos");
    const reportPath = join(process.cwd(), "tests", "reports", "external-demo-static-export.json");
    const previousReport = existsSync(reportPath) ? readFileSync(reportPath) : null;
    try {
      const report = await buildExternalDemoExport(process.cwd(), outputDir);

      expect(report).toMatchObject({
        ok: true,
        command: "pnpm build:external-demos",
        deploymentCommandPlanPath: expect.stringContaining("deployment-command-plan.json")
      });
      expect(report.demos.map((demo) => demo.id).sort()).toEqual([
        "architecture-viewer",
        "game-slice",
        "large-world-streaming",
        "product-configurator",
        "racing-showcase"
      ]);
      expect(report.sourceFileHashes.length).toBeGreaterThan(20);
      for (const demo of report.demos) {
        expect(demo.bytes).toBeGreaterThan(1000);
        expect(existsSync(join(process.cwd(), demo.outputHtml))).toBe(true);
        expect(existsSync(join(process.cwd(), demo.outputScript))).toBe(true);
        expect(readFileSync(join(process.cwd(), demo.outputHtml), "utf8")).toContain("./main.js");
      }
      const deploymentCommandPlan = JSON.parse(readFileSync(join(process.cwd(), report.deploymentCommandPlanPath), "utf8"));
      expect(deploymentCommandPlan).toMatchObject({
        schemaVersion: "g3d-public-demo-deployment-command-plan-v1",
        outputDir: report.outputDir,
        validationCommands: expect.arrayContaining([
          "pnpm build:external-demos",
          "pnpm verify:static-demo-server-smoke",
          "G3D_PUBLIC_DEMO_URL=https://demo.your-real-domain.com/ pnpm verify:public-demo-deployment",
          "pnpm audit:v4-production-readiness",
        ]),
        githubPagesWorkflow: ".github/workflows/v4-public-demo-deploy.yml",
        githubPagesWorkflowNotes: expect.arrayContaining([
          expect.stringContaining("verify:public-demo-deployment"),
        ]),
        blockedUntilPublicValidationPasses: expect.arrayContaining([
          "production-ready language",
          "public deployment readiness",
        ]),
      });
      expect(deploymentCommandPlan.validationCommands.join("\n")).not.toContain("your-durable-demo-origin.example");
      expect(deploymentCommandPlan.filesToDeploy).toHaveLength(11);
      expect(deploymentCommandPlan.sourceFileHashes.length).toBe(report.sourceFileHashes.length);
      const publicDeploymentManifest = JSON.parse(readFileSync(join(process.cwd(), report.publicDeploymentManifestPath), "utf8"));
      expect(publicDeploymentManifest.sourceFileHashes.length).toBe(report.sourceFileHashes.length);
      const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "v4-public-demo-deploy.yml"), "utf8");
      expect(workflow).toContain("pnpm/action-setup@v4");
      expect(workflow).toContain("version: 8");
      expect(workflow).toContain("pnpm verify:public-demo-deployment");
      expect(workflow).toContain("actions/deploy-pages@v4");
    } finally {
      if (previousReport) {
        writeFileSync(reportPath, previousReport);
      } else {
        rmSync(reportPath, { force: true });
      }
    }
  }, 30_000);

  it("source cleanliness verifier rejects production backup, copy, and marker files while allowing docs and tests", () => {
    const clean = fixtureRoot();
    mkdirSync(join(clean, "packages", "core", "src"), { recursive: true });
    mkdirSync(join(clean, "packages", "core", "tests"), { recursive: true });
    mkdirSync(join(clean, "docs"), { recursive: true });
    writeFileSync(join(clean, "packages", "core", "src", "index.ts"), "export const ready = true;\n");
    writeFileSync(join(clean, "packages", "core", "tests", "cleanliness.test.ts"), "it('can mention TODO stub incomplete fake-success', () => {});\n");
    writeFileSync(join(clean, "docs", "cleanliness.md"), "Docs can discuss TODO, stub, incomplete, and fake-success markers.\n");
    expect(verifySourceCleanliness(clean)).toMatchObject({ ok: true, checkedTextFiles: 1 });

    const dirty = fixtureRoot();
    mkdirSync(join(dirty, "packages", "core", "src"), { recursive: true });
    mkdirSync(join(dirty, "packages", "core", "tests"), { recursive: true });
    writeFileSync(join(dirty, "packages", "core", "src", "index.ts"), "export const todo = 'TODO: replace fake-success path';\n");
    writeFileSync(join(dirty, "packages", "core", "src", "Vector copy.ts"), "export const copied = true;\n");
    writeFileSync(join(dirty, "packages", "core", "src", "Config.ts.bak"), "export const backup = true;\n");
    writeFileSync(join(dirty, "packages", "core", "tests", "allowed.test.ts"), "it('can say stub incomplete', () => {});\n");

    const report = verifySourceCleanliness(dirty);
    expect(report.ok).toBe(false);
    expect(report.violations.map((violation) => violation.kind).sort()).toEqual([
      "backup-file",
      "marker",
      "source-copy-file"
    ]);
    expect(report.violations.find((violation) => violation.kind === "marker")).toMatchObject({
      marker: "TODO",
      line: 1
    });
  });

  it("trace verifier reports incomplete rows by owner and prefix", () => {
    const report = analyzeTraceReport({
      totalRequirements: 5,
      complete: false,
      statusCounts: {},
      rows: [
        {
          id: "CORE-0001",
          sourceDocument: "docs/04-Core-Engine-PRD.md",
          sourceSection: "Lifecycle",
          requirement: "Engine lifecycle is deterministic.",
          owner: "Workstream 1",
          status: "Implemented and verified",
          evidence: "tests/unit/core/scheduler-engine.test.ts"
        },
        {
          id: "CORE-0002",
          sourceDocument: "docs/04-Core-Engine-PRD.md",
          sourceSection: "Lifecycle",
          requirement: "Plugins roll back on failure.",
          owner: "Workstream 1",
          status: "Implemented but unverified",
          evidence: ""
        },
        {
          id: "RENDER-0001",
          sourceDocument: "docs/05-Renderer-PRD.md",
          sourceSection: "Renderer",
          requirement: "Renderer supports backend fallback.",
          owner: "Workstream 3",
          status: "Partially implemented",
          evidence: ""
        },
        {
          id: "TRACE-0001",
          sourceDocument: "docs/project/final-prompt.md",
          sourceSection: "Final Gate",
          requirement: "Statuses must be from the approved set.",
          owner: "Coordinator",
          status: "Almost done",
          evidence: ""
        },
        {
          id: "CORE-0003",
          sourceDocument: "docs/04-Core-Engine-PRD.md",
          sourceSection: "Diagnostics",
          requirement: "Completed rows must cite evidence.",
          owner: "Workstream 1",
          status: "Implemented and verified",
          evidence: ""
        }
      ]
    });

    expect(report.complete).toBe(false);
    expect(report.incompleteRows).toHaveLength(3);
    expect(report.invalidStatusRows.map((row) => row.id)).toEqual(["TRACE-0001"]);
    expect(report.missingEvidenceRows.map((row) => row.id)).toEqual(["CORE-0003"]);
    expect(report.incompleteByOwner["Workstream 1"]?.total).toBe(1);
    expect(report.incompleteByOwner["Workstream 3"]?.total).toBe(1);
    expect(report.incompleteByOwner.Coordinator?.total).toBe(1);
    expect(report.incompleteByPrefix.CORE?.statusCounts["Implemented but unverified"]).toBe(1);
    expect(report.incompleteByPrefix.RENDER?.statusCounts["Partially implemented"]).toBe(1);
    expect(report.incompleteByPrefix.TRACE?.statusCounts["Almost done"]).toBe(1);
  });

  it("trace verifier rejects generated audit artifacts and rebuild-progress pass text as sole evidence", () => {
    const report = analyzeTraceReport({
      totalRequirements: 3,
      complete: true,
      statusCounts: {},
      rows: [
        {
          id: "FINAL-0001",
          sourceDocument: "docs/project/final-prompt.md",
          sourceSection: "Generated Evidence",
          requirement: "Generated audit artifacts must not prove themselves.",
          owner: "Coordinator",
          implementationFiles: ["docs/project/rebuild-progress.md"],
          testFiles: ["tests/reports/final-requirements-trace.json"],
          status: "Implemented and verified",
          evidence: "Generated audit artifact passed."
        },
        {
          id: "FINAL-0002",
          sourceDocument: "docs/project/final-prompt.md",
          sourceSection: "Weak Evidence",
          requirement: "Rebuild progress pass text is not enough.",
          owner: "Coordinator",
          implementationFiles: [],
          testFiles: [],
          status: "Implemented and verified",
          evidence: "docs/project/rebuild-progress.md passed"
        },
        {
          id: "CORE-0001",
          sourceDocument: "docs/04-Core-Engine-PRD.md",
          sourceSection: "Concrete Evidence",
          requirement: "Concrete source and test evidence is accepted.",
          owner: "Workstream 1",
          implementationFiles: ["packages/core/src/Engine.ts"],
          testFiles: ["tests/unit/core/scheduler-engine.test.ts"],
          status: "Implemented and verified",
          evidence: "packages/core/src/Engine.ts and tests/unit/core/scheduler-engine.test.ts passed"
        }
      ]
    });

    expect(report.complete).toBe(false);
    expect(report.weakEvidenceRows.map((row) => row.id)).toEqual(["FINAL-0001", "FINAL-0002"]);
  });

  it("verify trace CLI fails against a stale generated-evidence fixture root", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "final-requirements-trace.json"), JSON.stringify({
      totalRequirements: 1,
      complete: true,
      statusCounts: {},
      rows: [{
        id: "FINAL-0001",
        sourceDocument: "docs/project/final-prompt.md",
        sourceSection: "Generated Evidence",
        requirement: "Generated audit artifacts must not prove product completion.",
        owner: "Coordinator",
        implementationFiles: ["docs/project/completion-audit.md"],
        testFiles: ["tests/reports/final-requirements-trace.json"],
        status: "Implemented and verified",
        evidence: "Generated audit artifact passed."
      }]
    }));

    const result = spawnSync(process.execPath, [
      "--experimental-strip-types",
      "tools/verify-trace/index.ts",
      "--root",
      root
    ], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("1 weak evidence rows");
  });
});
