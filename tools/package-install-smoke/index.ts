import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

interface PackageInstallSmokeReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly command: string;
  readonly packageName: string | null;
  readonly packageVersion: string | null;
  readonly tarballPath: string;
  readonly tarballSha256: string | null;
  readonly packMode: "existing-release-artifact" | "fresh-current-checkout-pack";
  readonly packCommand?: readonly string[];
  readonly tempProjectKind: "external-clean-npm-project";
  readonly installCommand: readonly string[];
  readonly smokeCommand: readonly string[];
  readonly viteBuildCommand: readonly string[];
  readonly importedEntrypoints: readonly string[];
  readonly smokeAssertions: readonly string[];
  readonly installStdoutTail: string;
  readonly smokeStdout: string;
  readonly viteBuildStdoutTail: string;
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/package-install-smoke.json";
const defaultTarballPath = "release-artifacts/aura3d-engine-0.1.0-alpha.0.tgz";
const freshPackDirectory = "tests/reports/package-install-smoke-fresh";

export function runPackageInstallSmoke(
  root = process.cwd(),
  options: { readonly tarballPath?: string; readonly freshPack?: boolean } = {}
): PackageInstallSmokeReport {
  const packageInfo = readPackageInfo(root);
  const freshPack = options.freshPack === true;
  const packDirectory = join(root, freshPackDirectory);
  const packCommand = ["npm", "pack", "--pack-destination", packDirectory, "--silent"] as const;
  const tempProject = mkdtempSync(join(tmpdir(), "a3d-package-smoke-"));
  const smokeCommand = ["node", "smoke.mjs"] as const;
  const viteBuildCommand = [join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite"), "build", "--logLevel", "warn"] as const;
  const violations: string[] = [];
  let tarballPath = options.tarballPath ?? defaultTarballPath;
  let tarballFullPath = join(root, tarballPath);
  let tarballSha256: string | null = null;
  let installStdout = "";
  let smokeStdout = "";
  let viteBuildStdout = "";

  try {
    if (!packageInfo.name || !packageInfo.version) {
      violations.push("package.json name or version is unreadable.");
    }
    if (freshPack) {
      try {
        rmSync(packDirectory, { recursive: true, force: true });
        mkdirSync(packDirectory, { recursive: true });
        const packStdout = execFileSync(packCommand[0], packCommand.slice(1), {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024
        }).trim();
        const packedName = packStdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
        if (!packedName) {
          violations.push("npm pack did not report a tarball name.");
        } else {
          tarballPath = `${freshPackDirectory}/${packedName}`;
          tarballFullPath = join(root, tarballPath);
        }
      } catch (error) {
        violations.push(`fresh npm pack failed: ${formatExecError(error)}`);
      }
    }

    tarballSha256 = existsSync(tarballFullPath)
      ? createHash("sha256").update(readFileSync(tarballFullPath)).digest("hex")
      : null;
    if (!tarballSha256) {
      violations.push(`Tarball is missing: ${tarballPath}.`);
    }

    const installCommand = ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", tarballFullPath] as const;

    writeFileSync(join(tempProject, "package.json"), `${JSON.stringify({
      name: "a3d-external-install-smoke",
      version: "0.0.0",
      private: true,
      type: "module"
    }, null, 2)}\n`);
    writeFileSync(join(tempProject, "smoke.mjs"), smokeSource(packageInfo.name ?? "@aura3d/engine"));
    mkdirSync(join(tempProject, "src"), { recursive: true });
    writeFileSync(join(tempProject, "index.html"), `<div id="app"></div><script type="module" src="/src/main.js"></script>\n`);
    writeFileSync(join(tempProject, "src", "main.js"), viteSmokeSource(packageInfo.name ?? "@aura3d/engine"));

    if (violations.length === 0) {
      try {
        installStdout = execFileSync(installCommand[0], installCommand.slice(1), {
          cwd: tempProject,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024
        });
      } catch (error) {
        violations.push(`npm install failed: ${formatExecError(error)}`);
      }
    }

    if (violations.length === 0) {
      try {
        smokeStdout = execFileSync(smokeCommand[0], smokeCommand.slice(1), {
          cwd: tempProject,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024
        });
      } catch (error) {
        violations.push(`package import smoke failed: ${formatExecError(error)}`);
      }
    }

    if (violations.length === 0) {
      if (!existsSync(viteBuildCommand[0])) {
        violations.push(`Vite binary is missing for browser import smoke: ${viteBuildCommand[0]}.`);
      } else {
        try {
          viteBuildStdout = execFileSync(viteBuildCommand[0], viteBuildCommand.slice(1), {
            cwd: tempProject,
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024
          });
        } catch (error) {
          violations.push(`Vite browser import smoke failed: ${formatExecError(error)}`);
        }
      }
    }
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    command: freshPack ? "pnpm verify:package-install-smoke:fresh" : "pnpm verify:package-install-smoke",
    packageName: packageInfo.name,
    packageVersion: packageInfo.version,
    tarballPath,
    tarballSha256,
    packMode: freshPack ? "fresh-current-checkout-pack" : "existing-release-artifact",
    packCommand: freshPack ? packCommand : undefined,
    tempProjectKind: "external-clean-npm-project",
    installCommand: ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", tarballFullPath],
    smokeCommand,
    viteBuildCommand,
    importedEntrypoints: [
      "@aura3d/engine",
      "@aura3d/engine/rendering",
      "@aura3d/engine/scene",
      "@aura3d/engine/math",
      "@aura3d/engine/assets",
      "@aura3d/engine/assets/browser"
    ],
    smokeAssertions: [
      "root export map resolves",
      "rendering export map resolves",
      "scene export map resolves",
      "math export map resolves",
      "assets export map resolves",
      "Geometry.litCube creates vertex/index buffers",
      "PBRMaterial can be instantiated",
      "External parity generated environment lighting validates BRDF LUT and diffuse irradiance resources",
      "clean Vite browser build resolves engine browser export map and browser-safe subpath imports",
      "benchmark helper snippets compile from the packed root public API",
      "packed helper snippets expose performance budgets, character visual QA, mini-golf state, charts, effects, city, solar, product, and physics helpers",
      "all ten scene kit one-call snippets compile from a packed package install",
      "packed scene kit snippets cover typed product assets without invented string ids"
    ],
    installStdoutTail: installStdout.split("\n").slice(-12).join("\n"),
    smokeStdout: smokeStdout.trim(),
    viteBuildStdoutTail: viteBuildStdout.split("\n").slice(-12).join("\n"),
    violations
  };
}

function smokeSource(packageName: string): string {
  return `
import assert from "node:assert/strict";

const root = await import(${JSON.stringify(packageName)});
const rendering = await import(${JSON.stringify(`${packageName}/rendering`)});
const scene = await import(${JSON.stringify(`${packageName}/scene`)});
const math = await import(${JSON.stringify(`${packageName}/math`)});
const assets = await import(${JSON.stringify(`${packageName}/assets`)});

assert.equal(typeof root.Engine, "function");
assert.equal(typeof rendering.Geometry?.litCube, "function");
assert.equal(typeof rendering.PBRMaterial, "function");
assert.equal(typeof rendering.Renderer, "function");
assert.equal(typeof scene.Scene, "function");
assert.ok(Object.keys(math).length > 0);
assert.equal(typeof assets.GLTFLoader, "function");
assert.equal(typeof assets.loadRenderableAsset, "function");
assert.equal(typeof assets.createRenderableScene, "function");

const cube = rendering.Geometry.litCube(1);
assert.ok(cube.vertexBuffer.vertexCount > 0);
assert.ok(cube.indexBuffer.data.length > 0);

const material = new rendering.PBRMaterial({ name: "external-smoke-pbr", baseColor: [0.8, 0.2, 0.1, 1], metallic: 0.4, roughness: 0.55 });
assert.equal(material.name, "external-smoke-pbr");
assert.equal(typeof rendering.Renderer.prototype.renderScene, "function");

const lighting = rendering.createExternalParityEnvironmentLighting("studio");
assert.equal(lighting.presetId, "aura3d-external-parity-visual-quality-preset");
assert.equal(lighting.resources.validation.brdfLutTexture, true);
assert.equal(lighting.resources.validation.diffuseIrradiance, true);
assert.ok(lighting.resources.specularMipCount >= 4);

assert.equal(typeof root.scene, "function");
assert.equal(typeof root.prefabs?.physicsPlayground, "function");
assert.equal(typeof root.games?.createMiniGolfState, "function");
assert.equal(typeof root.character?.primitiveHumanoid, "function");
assert.equal(typeof root.character?.lowPolyHumanoid, "function");
assert.equal(typeof root.charts?.barGrid3D, "function");
assert.equal(typeof root.performance?.budgetFor, "function");
assert.equal(typeof root.sceneKits?.physicsPlayground, "function");
assert.equal(typeof root.sceneKits?.productViewer, "function");
assert.equal(typeof root.defineAuraAssets, "function");

const smokeAssets = root.defineAuraAssets({
  product: {
    type: "model",
    format: "glb",
    url: "/aura-assets/package-smoke-product.glb",
    bounds: [1.3, 0.62, 0.84],
    metadata: { materials: ["mesh", "rubber", "laces"] }
  }
});
const dataSet = Array.from({ length: 6 }, (_, row) =>
  Array.from({ length: 6 }, (_, col) => Math.min(0.96, 0.22 + row * 0.09 + col * 0.055))
);
const sceneKitCases = [
  ["physicsPlayground", root.sceneKits.physicsPlayground()],
  ["particleFountain", root.sceneKits.particleFountain({ particleCount: 900, emissionRate: 80 })],
  ["solarSystem", root.sceneKits.solarSystem()],
  ["neonTunnel", root.sceneKits.neonTunnel()],
  ["dataViz", root.sceneKits.dataViz({ dataset: dataSet })],
  ["miniGolf", root.sceneKits.miniGolf()],
  ["materialLab", root.sceneKits.materialLab()],
  ["cityBlock", root.sceneKits.cityBlock({ timeOfDay: "night" })],
  ["humanoidWalk", root.sceneKits.humanoidWalk({ animationState: "benchmark-pose" })],
  ["productViewer", root.sceneKits.productViewer(smokeAssets.product)]
];
for (const [name, kit] of sceneKitCases) {
  assert.ok(Array.isArray(kit.nodes), \`\${name} scene kit exposes nodes\`);
  assert.ok(kit.nodes.length > 0, \`\${name} scene kit has renderable nodes\`);
  assert.equal(typeof kit.toAppOptions, "function", \`\${name} scene kit exposes toAppOptions()\`);
  assert.equal(typeof kit.customize, "function", \`\${name} scene kit exposes customize()\`);
  const appOptions = kit.toAppOptions();
  assert.ok(appOptions.scene, \`\${name} scene kit returns app scene\`);
  const appScene = typeof appOptions.scene.toJSON === "function" ? appOptions.scene.toJSON() : appOptions.scene;
  assert.ok(Array.isArray(appScene.nodes) && appScene.nodes.length > 0, \`\${name} toAppOptions scene has nodes\`);
  assert.ok(Array.isArray(kit.acceptanceEvidence) && kit.acceptanceEvidence.length > 0, \`\${name} scene kit exposes acceptance evidence\`);
}

const helperScene = root.scene()
  .addMany(root.prefabs.physicsPlayground({ cubes: 50 }))
  .addMany(root.prefabs.particleFountain())
  .addMany(root.prefabs.solarSystem())
  .addMany(root.prefabs.neonTunnel({ rings: 24 }))
  .addMany(root.charts.barGrid3D({ grid: 6, selected: { row: 6, col: 6 } }))
  .addMany(root.games.miniGolf())
  .addMany(root.prefabs.materialSwatches())
  .addMany(root.city.createState({ timeOfDay: "night", blocks: 20 }).nodes())
  .addMany(root.character.primitiveHumanoid())
  .addMany(root.prefabs.productStage());
let sceneKitScene = root.scene();
for (const [, kit] of sceneKitCases) sceneKitScene = sceneKitScene.addMany(kit.nodes);
const helperEvidence = root.collectAuraSceneEvidence(helperScene.toJSON());
const sceneKitEvidence = root.collectAuraSceneEvidence(sceneKitScene.toJSON());
assert.ok(helperEvidence.performance.budgets.length >= 10);
assert.ok(sceneKitEvidence.performance.budgets.length >= 10);
assert.ok(helperEvidence.performance.budgets.some((budget) => budget.helper === "physicsPlayground" && budget.maxDrawCalls > 0));
assert.equal(root.character.visualQA(root.character.primitiveHumanoid()).connected, true);
assert.equal(root.games.createMiniGolfState().shoot({ vector: [3, 0, -1.2], power: 1.45 }).shots, 1);

console.log(JSON.stringify({
  ok: true,
  cubeVertices: cube.vertexBuffer.vertexCount,
  cubeIndices: cube.indexBuffer.data.length,
  material: material.name,
  environmentPreset: lighting.preset,
  specularMipCount: lighting.resources.specularMipCount,
  helperBudgets: helperEvidence.performance.budgets.map((budget) => budget.helper),
  sceneKits: sceneKitCases.map(([name]) => name),
  sceneKitBudgets: sceneKitEvidence.performance.budgets.map((budget) => budget.helper)
}));
`;
}

function viteSmokeSource(packageName: string): string {
  return `
import { camera, character, charts, city, collectAuraSceneEvidence, createAuraApp, defineAuraAssets, effects, games, lights, performance, prefabs, scene, sceneKits, timeline } from ${JSON.stringify(packageName)};
import { Geometry, PBRMaterial, Renderer, createExternalParityEnvironmentLighting } from ${JSON.stringify(`${packageName}/rendering`)};
import { Scene as CoreScene } from ${JSON.stringify(`${packageName}/scene`)};
import { GLTFLoader, createRenderableScene, loadRenderableAsset } from ${JSON.stringify(`${packageName}/assets/browser`)};

const cube = Geometry.litCube(1);
const material = new PBRMaterial({ name: "vite-smoke-pbr", baseColor: [0.7, 0.3, 0.2, 1] });
const lighting = createExternalParityEnvironmentLighting("studio");
const coreScene = new CoreScene();
const loader = new GLTFLoader();
const smokeAssets = defineAuraAssets({
  product: {
    type: "model",
    format: "glb",
    url: "/aura-assets/package-smoke-product.glb",
    bounds: [1.3, 0.62, 0.84],
    metadata: { materials: ["mesh", "rubber", "laces"] }
  }
});
const dataSet = Array.from({ length: 6 }, (_, row) =>
  Array.from({ length: 6 }, (_, col) => Math.min(0.96, 0.22 + row * 0.09 + col * 0.055))
);
const sceneKitCases = [
  ["physicsPlayground", sceneKits.physicsPlayground()],
  ["particleFountain", sceneKits.particleFountain({ particleCount: 900, emissionRate: 80 })],
  ["solarSystem", sceneKits.solarSystem()],
  ["neonTunnel", sceneKits.neonTunnel()],
  ["dataViz", sceneKits.dataViz({ dataset: dataSet })],
  ["miniGolf", sceneKits.miniGolf()],
  ["materialLab", sceneKits.materialLab()],
  ["cityBlock", sceneKits.cityBlock({ timeOfDay: "night" })],
  ["humanoidWalk", sceneKits.humanoidWalk({ animationState: "benchmark-pose" })],
  ["productViewer", sceneKits.productViewer(smokeAssets.product)]
];
for (const [name, kit] of sceneKitCases) {
  if (!Array.isArray(kit.nodes) || kit.nodes.length === 0) throw new Error(\`\${name} scene kit did not expose nodes\`);
  if (!Array.isArray(kit.acceptanceEvidence) || kit.acceptanceEvidence.length === 0) throw new Error(\`\${name} scene kit did not expose acceptance evidence\`);
  const appOptions = kit.toAppOptions();
  const appScene = typeof appOptions.scene.toJSON === "function" ? appOptions.scene.toJSON() : appOptions.scene;
  if (!Array.isArray(appScene.nodes) || appScene.nodes.length === 0) throw new Error(\`\${name} scene kit toAppOptions did not expose scene nodes\`);
}
const helperScene = scene()
  .addMany(prefabs.physicsPlayground({ cubes: 50 }))
  .addMany(prefabs.particleFountain())
  .addMany(prefabs.solarSystem())
  .addMany(prefabs.neonTunnel({ rings: 24 }))
  .addMany(charts.barGrid3D({ grid: 6, selected: { row: 6, col: 6 } }))
  .addMany(games.miniGolf())
  .addMany(prefabs.materialSwatches())
  .addMany(city.createState({ timeOfDay: "night", blocks: 20 }).nodes())
  .addMany(character.primitiveHumanoid())
  .addMany(prefabs.productStage())
  .add(lights.studio())
  .camera(camera.neon())
  .timeline(timeline.loop({ duration: 2, captureTime: 0.5 }));
let sceneKitScene = scene();
for (const [, kit] of sceneKitCases) sceneKitScene = sceneKitScene.addMany(kit.nodes);
const helperEvidence = collectAuraSceneEvidence(helperScene.toJSON());
const sceneKitEvidence = collectAuraSceneEvidence(sceneKitScene.toJSON());

globalThis.__AURA3D_PACKAGE_VITE_SMOKE__ = {
  createAuraApp: typeof createAuraApp,
  cubeVertices: cube.vertexBuffer.vertexCount,
  material: material.name,
  environmentPreset: lighting.preset,
  scene: coreScene.root.name,
  loader: typeof loader.load,
  renderer: typeof Renderer,
  loadRenderableAsset: typeof loadRenderableAsset,
  createRenderableScene: typeof createRenderableScene,
  helperBudgetCount: helperEvidence.performance.budgets.length,
  neonBudget: performance.budgetFor("neonTunnel")?.maxDrawCalls,
  characterConnected: character.visualQA(character.primitiveHumanoid()).connected,
  effectCount: helperScene.toJSON().nodes.filter((node) => node.kind === "effect").length,
  sceneKitCount: sceneKitCases.length,
  sceneKitBudgetCount: sceneKitEvidence.performance.budgets.length
};
`;
}

function readPackageInfo(root: string): { readonly name: string | null; readonly version: string | null } {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      version: typeof parsed.version === "string" ? parsed.version : null
    };
  } catch {
    return { name: null, version: null };
  }
}

function formatExecError(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const record = error as { readonly message?: unknown; readonly stdout?: unknown; readonly stderr?: unknown };
  return [
    typeof record.message === "string" ? record.message : undefined,
    typeof record.stdout === "string" && record.stdout.trim().length > 0 ? `stdout: ${record.stdout.trim()}` : undefined,
    typeof record.stderr === "string" && record.stderr.trim().length > 0 ? `stderr: ${record.stderr.trim()}` : undefined
  ].filter(Boolean).join(" ");
}

function writeReport(root: string, report: PackageInstallSmokeReport): void {
  const outputPath = join(root, reportPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = runPackageInstallSmoke(process.cwd(), {
    freshPack: process.argv.includes("--fresh-pack")
  });
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    packageName: report.packageName,
    packageVersion: report.packageVersion,
    tarballPath: report.tarballPath,
    packMode: report.packMode,
    importedEntrypoints: report.importedEntrypoints.length,
    smokeAssertions: report.smokeAssertions.length,
    violations: report.violations
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
