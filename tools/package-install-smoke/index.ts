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
const defaultTarballPath = "release-artifacts/galileo3d-engine-0.1.0-alpha.0.tgz";
const freshPackDirectory = "tests/reports/package-install-smoke-fresh";

export function runPackageInstallSmoke(
  root = process.cwd(),
  options: { readonly tarballPath?: string; readonly freshPack?: boolean } = {}
): PackageInstallSmokeReport {
  const packageInfo = readPackageInfo(root);
  const freshPack = options.freshPack === true;
  const packDirectory = join(root, freshPackDirectory);
  const packCommand = ["npm", "pack", "--pack-destination", packDirectory, "--silent"] as const;
  const tempProject = mkdtempSync(join(tmpdir(), "g3d-package-smoke-"));
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
      name: "g3d-external-install-smoke",
      version: "0.0.0",
      private: true,
      type: "module"
    }, null, 2)}\n`);
    writeFileSync(join(tempProject, "smoke.mjs"), smokeSource(packageInfo.name ?? "@galileo3d/engine"));
    mkdirSync(join(tempProject, "src"), { recursive: true });
    writeFileSync(join(tempProject, "index.html"), `<div id="app"></div><script type="module" src="/src/main.js"></script>\n`);
    writeFileSync(join(tempProject, "src", "main.js"), viteSmokeSource(packageInfo.name ?? "@galileo3d/engine"));

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
      "@galileo3d/engine",
      "@galileo3d/engine/rendering",
      "@galileo3d/engine/scene",
      "@galileo3d/engine/math",
      "@galileo3d/engine/assets"
    ],
    smokeAssertions: [
      "root export map resolves",
      "rendering export map resolves",
      "scene export map resolves",
      "math export map resolves",
      "assets export map resolves",
      "Geometry.litCube creates vertex/index buffers",
      "PBRMaterial can be instantiated",
      "V4 generated environment lighting validates BRDF LUT and diffuse irradiance resources",
      "clean Vite browser build resolves engine export map and subpath imports"
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

const lighting = rendering.createV4EnvironmentLighting("studio");
assert.equal(lighting.presetId, "galileo3d-external-parity-visual-quality-preset");
assert.equal(lighting.resources.validation.brdfLutTexture, true);
assert.equal(lighting.resources.validation.diffuseIrradiance, true);
assert.ok(lighting.resources.specularMipCount >= 4);

console.log(JSON.stringify({
  ok: true,
  cubeVertices: cube.vertexBuffer.vertexCount,
  cubeIndices: cube.indexBuffer.data.length,
  material: material.name,
  environmentPreset: lighting.preset,
  specularMipCount: lighting.resources.specularMipCount
}));
`;
}

function viteSmokeSource(packageName: string): string {
  return `
import { Engine } from ${JSON.stringify(packageName)};
import { Geometry, PBRMaterial, Renderer, createV4EnvironmentLighting } from ${JSON.stringify(`${packageName}/rendering`)};
import { Scene } from ${JSON.stringify(`${packageName}/scene`)};
import { GLTFLoader, createRenderableScene, loadRenderableAsset } from ${JSON.stringify(`${packageName}/assets`)};

const cube = Geometry.litCube(1);
const material = new PBRMaterial({ name: "vite-smoke-pbr", baseColor: [0.7, 0.3, 0.2, 1] });
const lighting = createV4EnvironmentLighting("studio");
const scene = new Scene();
const loader = new GLTFLoader();

globalThis.__GALILEO3D_PACKAGE_VITE_SMOKE__ = {
  engine: typeof Engine,
  cubeVertices: cube.vertexBuffer.vertexCount,
  material: material.name,
  environmentPreset: lighting.preset,
  scene: scene.root.name,
  loader: typeof loader.load,
  renderer: typeof Renderer,
  loadRenderableAsset: typeof loadRenderableAsset,
  createRenderableScene: typeof createRenderableScene
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
