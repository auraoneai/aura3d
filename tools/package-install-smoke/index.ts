import { withNpmTransport } from "../release/npm-transport.mjs";
import { runExactPackageSmoke, type ExactPackageSmoke } from "../release/exact-package-smoke.mjs";
import { loadValidatedReleasePlan, inspectInstalledRelease } from "../release/exact-release-plan.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import ts from "typescript";

interface PackageInstallSmokeReport {
  readonly exactPackages?: ExactPackageSmoke;
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly command: string;
  readonly packageName: string | null;
  readonly packageVersion: string | null;
  readonly tarballPath: string;
  readonly tarballSha256: string | null;
  readonly packMode: "existing-release-artifact" | "fresh-current-checkout-pack" | "validated-release-plan";
  readonly releasePlan?: {path:string;sha256:string};
  readonly installedIdentity?: unknown;
  readonly packCommand?: readonly string[];
  readonly tempProjectKind: "external-clean-npm-project";
  readonly installCommand: readonly string[];
  readonly smokeCommand: readonly string[];
  readonly viteBuildCommand: readonly string[];
  readonly nativeChecks: readonly { readonly name: string; readonly command: readonly string[]; readonly status: "pass" | "fail" | "not-run"; readonly output: string }[];
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
  const exactPlan = loadValidatedReleasePlan(root);
  const freshPack = !exactPlan && options.freshPack === true;
  let installedIdentity: unknown;
  let exactPackages: ExactPackageSmoke | undefined;
  const packDirectory = join(root, freshPackDirectory);
  const packCommand = ["npm", "pack", "--pack-destination", packDirectory, "--silent"] as const;
  const tempProject = mkdtempSync(join(tmpdir(), "a3d-package-smoke-"));
  const smokeCommand = ["node", "smoke.mjs"] as const;
  const viteBuildCommand = [join(tempProject, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite"), "build", "--logLevel", "warn"] as const;
  const nativeCommand = ["node", "native-smoke.mjs"] as const;
  const browserConditionsCommand = ["node", "--conditions=browser", "native-smoke.mjs"] as const;
  const nativeChecks: Array<{ name: string; command: readonly string[]; status: "pass" | "fail" | "not-run"; output: string }> = [
    { name: "optional peers absent, SSR and import conditions", command: nativeCommand, status: "not-run", output: "" },
    { name: "optional peers absent, browser export conditions", command: browserConditionsCommand, status: "not-run", output: "" },
    { name: "install optional peers", command: [], status: "not-run", output: "" },
    { name: "optional peers present, SSR and import conditions", command: nativeCommand, status: "not-run", output: "" },
    { name: "optional peers present, browser export conditions", command: browserConditionsCommand, status: "not-run", output: "" }
  ];
  const recordNative = (name: string, command: readonly string[], status: "pass" | "fail", output: string): void => {
    const check = nativeChecks.find((item) => item.name === name);
    if (!check || check.status !== "not-run") throw new Error(`Unexpected or duplicated native check ${name}`);
    Object.assign(check, { command, status, output });
  };
  let recordedInstallCommand: readonly string[] = [];
  const violations: string[] = [];
  let tarballPath = exactPlan?.packages.find(p=>p.name===packageInfo.name)?.tarball ?? options.tarballPath ?? defaultTarballPath;
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

    // First install the candidate with optional peers absent, then explicitly add
    // every declared optional peer and rerun in a fresh Node process.
    const optionalPeers = Object.entries(packageInfo.peerDependencies ?? {})
      .filter(([name]) => packageInfo.peerDependenciesMeta?.[name]?.optional === true);
    const peerSpecs = optionalPeers.map(([name, version]) => `${name}@${version}`);
    const installCommand = ["npm", ...withNpmTransport(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballFullPath])] as const;
    recordedInstallCommand = installCommand;

    writeFileSync(join(tempProject, "package.json"), `${JSON.stringify({
      name: "a3d-external-install-smoke",
      version: "0.0.0",
      private: true,
      type: "module",
      devDependencies: { vite: packageInfo.viteVersion ?? "^7.3.2" }
    }, null, 2)}\n`);
    writeFileSync(join(tempProject, "smoke.mjs"), smokeSource(packageInfo.name ?? "@aura3d/engine"));
    writeFileSync(join(tempProject, "native-smoke.mjs"), nativeSmokeSource(packageInfo.name ?? "@aura3d/engine", optionalPeers.map(([name]) => name)));
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

    if (violations.length === 0 && exactPlan) {
      try { installedIdentity = inspectInstalledRelease(root,tempProject,exactPlan); } catch(error) { violations.push(String(error)); }
    }
    if (violations.length === 0 && packageInfo.name) {
      const installedPackage = join(tempProject, "node_modules", ...packageInfo.name.split("/"));
      const conditionViolations = inspectPackageExportConditions(installedPackage);
      if (conditionViolations.length) violations.push(...conditionViolations);
    }
    const runNative = (name: string, command: readonly string[], peerMode: "absent" | "present"): void => {
      try {
        const output = execFileSync(command[0]!, command.slice(1), {
          cwd: tempProject, encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, A3D_OPTIONAL_PEERS: peerMode }
        });
        recordNative(name, command, "pass", output.trim());
      } catch (error) {
        const output = formatExecError(error);
        recordNative(name, command, "fail", output);
        violations.push(`${name} failed: ${output}`);
      }
    };
    if (violations.length === 0) runNative("optional peers absent, SSR and import conditions", nativeCommand, "absent");
    if (violations.length === 0) runNative("optional peers absent, browser export conditions", browserConditionsCommand, "absent");
    if (violations.length === 0 && peerSpecs.length) {
      const addPeers = ["npm", ...withNpmTransport(["install", "--ignore-scripts", "--no-audit", "--no-fund", ...peerSpecs])] as const;
      try {
        const output = execFileSync(addPeers[0], addPeers.slice(1), { cwd: tempProject, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
        recordNative("install optional peers", addPeers, "pass", output.trim());
      } catch (error) {
        const output = formatExecError(error);
        recordNative("install optional peers", addPeers, "fail", output);
        violations.push(`optional peer installation failed: ${output}`);
      }
      if (violations.length === 0) runNative("optional peers present, SSR and import conditions", nativeCommand, "present");
      if (violations.length === 0) runNative("optional peers present, browser export conditions", browserConditionsCommand, "present");
    } else if (violations.length === 0 && peerSpecs.length === 0) {
      violations.push("No optional peer declarations found: required absent/present consumer cases cannot be established.");
    }
    if (violations.length === 0) violations.push(...missingNativeChecks(nativeChecks));
    if (violations.length === 0 && packageInfo.name) {
      const installedPackage = join(tempProject, "node_modules", ...packageInfo.name.split("/"));
      const unresolvedImports = findUnresolvedInternalAuraImports(installedPackage);
      if (unresolvedImports.length > 0) {
        violations.push(
          `Packed root contains unresolved internal Aura3D imports: ${unresolvedImports.join(", ")}. `
          + "Declare each shipped package dependency and install it in the consumer."
        );
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

  if (exactPlan) {
    try { exactPackages=runExactPackageSmoke(root,exactPlan,process.env.A3D_REGISTRY_INSTALL === "1" ? {registry:true,retainDir:"tests/reports/registry-consumer"} : {}); if(!exactPackages.ok) violations.push("Exact29package smoke failed; inspect exactPackages."); }
    catch(error) { violations.push(`Exact29package smoke failed: ${formatExecError(error)}`); }
  }
  return {
    exactPackages,
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    command: freshPack ? "pnpm verify:package-install-smoke:fresh" : "pnpm verify:package-install-smoke",
    packageName: packageInfo.name,
    packageVersion: packageInfo.version,
    tarballPath,
    tarballSha256,
    packMode: exactPlan ? "validated-release-plan" : freshPack ? "fresh-current-checkout-pack" : "existing-release-artifact",
    releasePlan: exactPlan?.reference,
    installedIdentity,
    packCommand: freshPack ? packCommand : undefined,
    tempProjectKind: "external-clean-npm-project",
    installCommand: recordedInstallCommand,
    nativeChecks,
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
      "packed root declares every internal @aura3d/* dependency",
      "all packed export condition targets exist inside the installed package",
      "root import is SSR-safe with each optional peer absent and present",
      "all literal JavaScript entrypoints resolve under import and browser conditions",
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

/** A required native probe may never silently turn into a passing skip. */
export function missingNativeChecks(checks: ReadonlyArray<{ readonly name: string; readonly status: "pass" | "fail" | "not-run" }>): string[] {
  const required = ["optional peers absent, SSR and import conditions", "optional peers absent, browser export conditions", "install optional peers", "optional peers present, SSR and import conditions", "optional peers present, browser export conditions"];
  return required.filter((name) => checks.filter((check) => check.name === name && check.status === "pass").length !== 1)
    .map((name) => `Required native consumer check did not pass exactly once: ${name}`);
}

export function findUnresolvedInternalAuraImports(packageRoot: string): string[] {
  const distRoot = join(packageRoot, "dist");
  if (!existsSync(distRoot)) return [`${relative(packageRoot, distRoot) || "dist"} is missing`];

  const findings = new Set<string>();
  let declared = new Set<string>();
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      name?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>
    };
    declared = new Set([pkg.name ?? "", ...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
  } catch { /* an absent manifest never grants permission for an import */ }
  for (const file of walkJavaScriptFiles(distRoot)) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    const record = (specifier: string | undefined): void => {
      if (!specifier || !specifier.startsWith("@aura3d/")) return;
      if (declared.has(specifier.split("/").slice(0, 2).join("/"))) return;
      findings.add(`${relative(packageRoot, file)} -> ${specifier}`);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) record(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node)) {
        const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const requireCall = ts.isIdentifier(node.expression) && node.expression.text === "require";
        if ((dynamicImport || requireCall) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
          record(node.arguments[0].text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return [...findings].sort();
}

function walkJavaScriptFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walkJavaScriptFiles(path, files);
    else if (path.endsWith(".js")) files.push(path);
  }
  return files;
}

/** Validate every declared condition target against the actual installed payload. */
export function inspectPackageExportConditions(packageRoot: string): string[] {
  const errors: string[] = [];
  let exportsMap: unknown;
  try { exportsMap = (JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { exports?: unknown }).exports; }
  catch { return ["Installed package.json is missing or invalid."]; }
  if (!exportsMap || typeof exportsMap !== "object") return ["Installed package has no export map."];
  const walk = (value: unknown, label: string): void => {
    if (value === null) return; // Explicitly blocked condition.
    if (typeof value === "string") {
      if (!value.startsWith("./")) { errors.push(`${label}: invalid export target ${value}`); return; }
      const target = resolve(packageRoot, value);
      if (!target.startsWith(`${resolve(packageRoot)}${sep}`)) { errors.push(`${label}: export target escapes package`); return; }
      if (value.includes("*")) {
        const expression = new RegExp(`^${value.slice(2).split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
        const walkFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
          const item = join(dir, entry.name);
          return entry.isDirectory() ? walkFiles(item) : entry.isFile() ? [relative(packageRoot, item).split(sep).join("/")] : [];
        });
        if (!walkFiles(packageRoot).some((path) => expression.test(path))) errors.push(`${label}: wildcard target has no files (${value})`);
      } else if (!existsSync(target) || !statSync(target).isFile()) errors.push(`${label}: missing export target ${value}`);
      return;
    }
    if (Array.isArray(value)) { if (!value.length) errors.push(`${label}: empty condition alternatives`); value.forEach((entry, i) => walk(entry, `${label}[${i}]`)); return; }
    if (value && typeof value === "object") { const entries = Object.entries(value); if (!entries.length) errors.push(`${label}: empty export condition`); for (const [key, entry] of entries) walk(entry, `${label}/${key}`); return; }
    errors.push(`${label}: invalid export condition`);
  };
  walk(exportsMap, "exports");
  return errors;
}

function nativeSmokeSource(packageName: string, peers: readonly string[]): string {
  return `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const name = ${JSON.stringify(packageName)};
const peers = ${JSON.stringify(peers)};
const rootDir = join(process.cwd(), "node_modules", ...name.split("/"));
const manifest = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
for (const peer of peers) {
  let present = true;
  try { require.resolve(peer); } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND" && error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    if (error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") present = true; else present = false;
  }
  assert.equal(present, process.env.A3D_OPTIONAL_PEERS === "present", peer + " optional-peer state");
}
// A normal Node process has no browser window or document; importing here proves the SSR boundary.
assert.equal(typeof globalThis.window, "undefined");
assert.equal(typeof globalThis.document, "undefined");
const root = await import(name);
assert.equal(typeof root.createAuraApp, "function");
const entries = Object.keys(manifest.exports).filter((key) => key.startsWith(".") && !key.includes("*") && !key.endsWith(".css"));
assert.ok(entries.includes("."), "root export is required");
for (const subpath of entries) {
  const specifier = subpath === "." ? name : name + subpath.slice(1);
  const resolved = fileURLToPath(import.meta.resolve(specifier));
  assert.ok(!relative(rootDir, resolved).startsWith(".."), specifier + " resolves in candidate package");
  assert.ok(statSync(resolved).isFile(), specifier + " resolves to an installed file");
  const declaresRequire = (value) => value && typeof value === "object" &&
    (Object.hasOwn(value, "require") || Object.values(value).some(declaresRequire));
  if (declaresRequire(manifest.exports[subpath])) {
    const required = require.resolve(specifier);
    assert.ok(!relative(rootDir, required).startsWith(".."), specifier + " require resolves in the candidate package");
    assert.ok(statSync(required).isFile(), specifier + " require resolves to an installed file");
    require(specifier);
  }
}
console.log(JSON.stringify({ peerMode: process.env.A3D_OPTIONAL_PEERS, peers, resolved: entries.length, ssr: true, conditions: process.execArgv }));
`;
}

function smokeSource(packageName: string): string {
  return `
import assert from "node:assert/strict";

const root = await import(${JSON.stringify(packageName)});
const rendering = await import(${JSON.stringify(`${packageName}/rendering`)});
const scene = await import(${JSON.stringify(`${packageName}/scene`)});
const math = await import(${JSON.stringify(`${packageName}/math`)});
const assets = await import(${JSON.stringify(`${packageName}/assets`)});

assert.equal(typeof root.createAuraApp, "function");
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
assert.equal(typeof root.collectAuraSceneEvidence, "function");
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
import { camera, character, charts, city, collectAuraSceneEvidence, createAuraApp, defineAuraAssets, effects, games, lights, prefabs, scene, sceneKits, timeline } from ${JSON.stringify(packageName)};
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
  characterConnected: character.visualQA(character.primitiveHumanoid()).connected,
  effectCount: helperScene.toJSON().nodes.filter((node) => node.kind === "effect").length,
  sceneKitCount: sceneKitCases.length,
  sceneKitBudgetCount: sceneKitEvidence.performance.budgets.length
};
`;
}

function readPackageInfo(root: string): { readonly name: string | null; readonly version: string | null; readonly viteVersion?: string; readonly peerDependencies?: Readonly<Record<string, string>>; readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>> } {
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      version: typeof parsed.version === "string" ? parsed.version : null,
      viteVersion: typeof (parsed.devDependencies as Record<string, unknown> | undefined)?.vite === "string" ? (parsed.devDependencies as Record<string, string>).vite : undefined,
      peerDependencies: parsed.peerDependencies && typeof parsed.peerDependencies === "object" ? parsed.peerDependencies as Record<string, string> : undefined,
      peerDependenciesMeta: parsed.peerDependenciesMeta && typeof parsed.peerDependenciesMeta === "object" ? parsed.peerDependenciesMeta as Record<string, { optional?: boolean }> : undefined
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
