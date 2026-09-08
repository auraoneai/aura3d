import { withNpmTransport } from "../release/npm-transport.mjs";
import { optionalPeerFixture, validateOptionalPeerObservation } from "../release/optional-peer-fixture.mjs";
import { tmpdir } from "node:os";
import { loadValidatedReleasePlan, inspectInstalledRelease } from "../release/exact-release-plan.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, copyFileSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

interface CommandResult {
  readonly ok: boolean;
  readonly output: string;
  readonly seconds: number;
}

interface TemplateResult {
  readonly template: string;
  readonly assetId: string;
  readonly install: CommandResult;
  readonly build: CommandResult;
  readonly devRouteHealth: CommandResult;
  readonly previewRouteHealth: CommandResult;
  readonly assetReplacement: CommandResult;
  readonly assetReplacementBuild: CommandResult;
  readonly missingAssetOutput: CommandResult;
  readonly inventedAssetId: CommandResult;
  readonly missingManifest: CommandResult;
  readonly screenshotBytes: number;
  readonly screenshotSha256: string;
  readonly screenshotProfile: Record<string, unknown>;
  readonly previewScreenshotBytes: number;
}

const exactPlan = loadValidatedReleasePlan();
const workspace = resolve("tests/reports/package-clean-install-workspace");
const tarballDir = resolve(workspace, "tarballs");
const templates = ["product-viewer", "cinematic-scene", "mini-game"] as const;

rmSync(workspace, { recursive: true, force: true });
mkdirSync(tarballDir, { recursive: true });

const tarballs = {
  engine: pack(".", tarballDir),
  lean: pack("packages/lean", tarballDir),
  assets: pack("packages/assets", tarballDir),
  animation: pack("packages/animation", tarballDir),
  rendering: pack("packages/rendering", tarballDir),
  scene: pack("packages/scene", tarballDir),
  core: pack("packages/core", tarballDir),
  math: pack("packages/math", tarballDir),
  react: pack("packages/react", tarballDir),
  assetIndex: pack("packages/asset-index", tarballDir),
  cli: pack("packages/aura3d-cli", tarballDir),
  create: pack("packages/create-aura3d", tarballDir),
  navigationRecast: pack("packages/navigation-recast", tarballDir)
};

const optionalPeerMatrix = (["absent", "present"] as const).map(runOptionalPeerConsumer);
const engineResult = runEngineInstall();
const reactResult = runReactInstall();
const cliResult = runCliInstall();
const createResult = runCreateInstall();
const templateResults = templates.map((template, index) => runTemplateLifecycle(template, 4310 + index));

const checks: ReleaseCheck[] = [
  ...optionalPeerMatrix.map(result => check(`navigation-optional-peer-${result.mode}`, result.install.ok && result.runtime.ok && result.observation !== null, `${result.install.output}\n${result.runtime.output}`)),
  {
    id: "engine-tarball-clean-typescript-import",
    pass: engineResult.ok,
    detail: engineResult.ok ? "clean TypeScript app imports @aura3d/engine from tarball" : engineResult.output
  },
  {
    id: "react-tarball-clean-typescript-import",
    pass: reactResult.ok,
    detail: reactResult.ok ? "clean TypeScript app imports @aura3d/react from tarball" : reactResult.output
  },
  {
    id: "aura3d-cli-bin-clean-install",
    pass: cliResult.ok,
    detail: cliResult.ok ? "aura3d bin runs from clean npm install" : cliResult.output
  },
  {
    id: "create-aura3d-bin-clean-install",
    pass: createResult.ok,
    detail: createResult.ok ? "create-aura3d --help runs from clean npm install" : createResult.output
  },
  ...templateResults.flatMap((result) => [
    check(`${result.template}-clean-install`, result.install.ok, result.install.output),
    check(`${result.template}-build`, result.build.ok, result.build.output),
    check(`${result.template}-dev-route-health`, result.devRouteHealth.ok, result.devRouteHealth.output),
    check(`${result.template}-preview-route-health`, result.previewRouteHealth.ok, result.previewRouteHealth.output),
    check(`${result.template}-asset-replacement`, result.assetReplacement.ok && result.assetReplacementBuild.ok, `${result.assetReplacement.output}\n${result.assetReplacementBuild.output}`),
    check(`${result.template}-missing-asset-output-actionable`, !result.missingAssetOutput.ok && includesAll(result.missingAssetOutput.output, ["Missing asset output", result.assetId]), result.missingAssetOutput.output),
    check(`${result.template}-invented-asset-id-type-fails`, !result.inventedAssetId.ok && includesAll(result.inventedAssetId.output, ["missingAsset"]), result.inventedAssetId.output),
    check(`${result.template}-missing-manifest-actionable`, !result.missingManifest.ok && includesAll(result.missingManifest.output, ["Missing aura.assets.json", "Suggested fix"]), result.missingManifest.output),
    screenshotProfileCheck(result)
  ]),
  ...templateResults
    .filter((result) => result.template === "product-viewer" || result.template === "mini-game")
    .map((result) => leanTemplateIsolationCheck(result.template)),
  check(
    "starter-screenshot-files-distinct",
    new Set(templateResults.map((result) => result.screenshotSha256)).size === templates.length,
    `screenshot hashes: ${templateResults.map((result) => `${result.template}=${result.screenshotSha256.slice(0, 12)}`).join(", ")}`
  ),
  check(
    "starter-screenshot-profile-keys-distinct",
    new Set(templateResults.map((result) => Object.keys(result.screenshotProfile).sort().join(","))).size === templates.length,
    `profile keys: ${templateResults.map((result) => `${result.template}=${Object.keys(result.screenshotProfile).sort().join("+")}`).join("; ")}`
  )
];

writeCleanInstallMarkdown(checks, templateResults);
writeReport("tests/reports/package-clean-install.json", "aura3d-package-clean-install", checks, {
  releasePlan: exactPlan?.reference,
  installedIdentity: exactPlan ? collectInstalledIdentity(workspace) : undefined,
  workspace: repoRelative(workspace),
  tarballs: Object.fromEntries(Object.entries(tarballs).map(([key, value]) => [key, repoRelative(value)])),
  optionalPeerMatrix,
  engineResult,
  reactResult,
  cliResult,
  createResult,
  templateResults
});

function runOptionalPeerConsumer(mode: "absent" | "present") {
  // Outside the repository: an absent peer must not resolve from workspace node_modules.
  const dir = mkdtempSync(resolve(tmpdir(), `aura3d-301-peer-${mode}-`));
  const retained = resolve(workspace, `optional-peer-${mode}`);
  mkdirSync(retained, { recursive: true });
  const dependencies = {
    "@aura3d/engine": `file:${tarballs.engine}`,
    ...leanClosureTarballDependencies(),
    ...(mode === "present" ? { "@aura3d/navigation-recast": `file:${tarballs.navigationRecast}` } : {})
  };
  try {
    writePackage(dir, { name: `aura3d-optional-peer-${mode}`, private: true, type: "module", dependencies });
    writeFileSync(resolve(dir, "probe.mjs"), optionalPeerFixture(mode));
    const install = run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], dir);
    let runtime: CommandResult = install.ok ? run("node", ["probe.mjs"], dir) : { ok: false, output: "Install failed; runtime was not executed", seconds: 0 };
    let observation: unknown = null;
    let installedIdentity: unknown;
    try {
      if (runtime.ok) {
        observation = JSON.parse(readFileSync(resolve(dir, "optional-peer-result.json"), "utf8"));
        validateOptionalPeerObservation(observation, mode);
      }
      if (install.ok && exactPlan) installedIdentity = inspectInstalledRelease(process.cwd(), dir, exactPlan);
    } catch (error) { runtime = { ...runtime, ok: false, output: `${runtime.output}\n${String(error)}` }; observation = null; }
    for (const name of ["package.json", "package-lock.json", "probe.mjs", "optional-peer-result.json"]) if (existsSync(resolve(dir, name))) copyFileSync(resolve(dir, name), resolve(retained, name));
    writeFileSync(resolve(retained, "commands.json"), JSON.stringify({install,runtime}, null, 2));
    return { mode, install, runtime, observation, installedIdentity, retained: repoRelative(retained) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function collectInstalledIdentity(dir: string): unknown[] {
  const results: unknown[] = [];
  for (const entry of readdirSync(dir, {withFileTypes:true})) {
    if (entry.name === "node_modules" || entry.name.startsWith("optional-peer-")) continue;
    if (entry.isDirectory()) results.push(...collectInstalledIdentity(resolve(dir,entry.name)));
    else if (entry.name === "package-lock.json") results.push(inspectInstalledRelease(process.cwd(),dir,exactPlan!));
  }
  return results;
}
function pack(dir: string, outDir: string): string {
  if (exactPlan) {
    const manifest = JSON.parse(readFileSync(resolve(dir,"package.json"),"utf8")) as {name:string};
    const candidate=exactPlan.packages.find(p=>p.name===manifest.name);
    if(!candidate)throw new Error(`Missing exact candidate ${manifest.name}`);
    return resolve(candidate.tarball);
  }
  const output = execFileSync("pnpm", ["pack", "--pack-destination", outDir], {
    cwd: resolve(dir),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  const file = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
  if (!file) throw new Error(`pnpm pack failed for ${dir}`);
  return resolve(outDir, basename(file));
}

function runEngineInstall(): CommandResult {
  const dir = resolve(workspace, "engine-import");
  mkdirSync(resolve(dir, "src"), { recursive: true });
  writePackage(dir, {
    name: "aura3d-engine-clean-import",
    private: true,
    type: "module",
    dependencies: {
      "@aura3d/engine": `file:${tarballs.engine}`,
      ...leanClosureTarballDependencies()
    },
    devDependencies: { typescript: "^5.8.3" }
  });
  writeTsconfig(dir);
  writeFileSync(resolve(dir, "src/main.ts"), `import { createAuraApp, defineAuraAssets, lights, model, scene } from "@aura3d/engine";

const assets = defineAuraAssets({
  product: { type: "model", format: "glb", url: "/product.glb", bounds: [1, 1, 1], hash: "sha256-clean-install" }
} as const);

const built = scene().add(model(assets.product)).add(lights.studio());
console.log(typeof createAuraApp, built.toJSON().nodes.length);
`);
  return run("sh", ["-lc", "npm install --ignore-scripts --no-audit --no-fund --silent && npm exec tsc -- --noEmit && node -e \"import('@aura3d/engine').then(m=>{if(typeof m.createAuraApp!=='function') process.exit(1)})\""], dir);
}

function runReactInstall(): CommandResult {
  const dir = resolve(workspace, "react-import");
  mkdirSync(resolve(dir, "src"), { recursive: true });
  writePackage(dir, {
    name: "aura3d-react-clean-import",
    private: true,
    type: "module",
    dependencies: {
      "@aura3d/engine": `file:${tarballs.engine}`,
      "@aura3d/react": `file:${tarballs.react}`,
      ...leanClosureTarballDependencies(),
      react: "^19.0.0"
    },
    devDependencies: { "@types/react": "^19.0.0", typescript: "^5.8.3" }
  });
  writeTsconfig(dir);
  writeFileSync(resolve(dir, "src/main.ts"), `import { AuraCanvas, productViewerScene } from "@aura3d/react";

console.log(typeof AuraCanvas, typeof productViewerScene);
`);
  return run("sh", ["-lc", "npm install --ignore-scripts --no-audit --no-fund --silent && npm exec tsc -- --noEmit && node -e \"import('@aura3d/react').then(m=>{if(typeof m.AuraCanvas!=='function') process.exit(1)})\""], dir);
}

function runCliInstall(): CommandResult {
  const dir = resolve(workspace, "cli-bin");
  mkdirSync(dir, { recursive: true });
  writePackage(dir, {
    name: "aura3d-cli-clean-bin",
    private: true,
    type: "module",
    dependencies: {
      "@aura3d/asset-index": `file:${tarballs.assetIndex}`,
      "@aura3d/cli": `file:${tarballs.cli}`,
      "create-aura3d": `file:${tarballs.create}`
    }
  });
  return run("sh", ["-lc", "npm install --ignore-scripts --no-audit --no-fund --silent && npm exec aura3d -- --help"], dir);
}

function runCreateInstall(): CommandResult {
  const dir = resolve(workspace, "create-bin");
  mkdirSync(dir, { recursive: true });
  writePackage(dir, {
    name: "aura3d-create-clean-bin",
    private: true,
    type: "module",
    dependencies: {
      "@aura3d/asset-index": `file:${tarballs.assetIndex}`,
      "create-aura3d": `file:${tarballs.create}`
    }
  });
  return run("sh", ["-lc", "npm install --ignore-scripts --no-audit --no-fund --silent && npm exec create-aura3d -- --help"], dir);
}

function runTemplateLifecycle(template: string, port: number): TemplateResult {
  const parent = resolve(workspace, "templates", template);
  const appDir = resolve(parent, "demo");
  mkdirSync(parent, { recursive: true });
  writePackage(parent, {
    name: `aura3d-${template}-clean-scaffold-runner`,
    private: true,
    type: "module",
    dependencies: {
      "@aura3d/asset-index": `file:${tarballs.assetIndex}`,
      "create-aura3d": `file:${tarballs.create}`
    }
  });
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], parent);
  const scaffold = run("npm", ["exec", "create-aura3d", "--", "demo", "--template", template], parent);
  patchScaffoldPackage(appDir);
  patchScaffoldPlaywrightConfig(appDir, port + 100);
  const install = scaffold.ok ? run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], appDir) : scaffold;
  const build = install.ok ? run("npm", ["run", "build"], appDir) : install;
  const devRouteHealth = build.ok ? run("npm", ["test"], appDir) : build;
  const screenshotReport = readScreenshotReport(appDir, "tests/reports/screenshot.json");
  const screenshotBytes = Math.max(readScreenshotBytes(appDir, "tests/reports/screenshot.png"), screenshotReport.bytes);
  const screenshotSha256 = readFileSha256(appDir, "tests/reports/screenshot.png");
  writePreviewSpec(appDir, port);
  const previewRouteHealth = build.ok
    ? run("npm", ["exec", "--", "playwright", "test", "tests/static-preview.spec.ts", "--config", "playwright.preview.config.ts", "--reporter=line"], appDir)
    : build;
  const previewScreenshotBytes = readScreenshotBytes(appDir, "tests/reports/static-preview.png");
  const assetId = template === "cinematic-scene" ? "hero" : template === "mini-game" ? "playerModel" : "product";
  const assetReplacement = install.ok ? replaceTemplateAsset(appDir, template, assetId) : install;
  const assetReplacementBuild = assetReplacement.ok ? run("npm", ["run", "build"], appDir) : assetReplacement;
  const missingAssetOutput = assetReplacement.ok ? runMissingAssetOutputCheck(appDir, assetId) : assetReplacement;
  const inventedAssetId = install.ok ? runInventedAssetIdCheck(appDir, assetId) : install;
  const missingManifest = assetReplacement.ok ? runMissingManifestCheck(appDir) : assetReplacement;
  return {
    template,
    assetId,
    install,
    build,
    devRouteHealth,
    previewRouteHealth,
    assetReplacement,
    assetReplacementBuild,
    missingAssetOutput,
    inventedAssetId,
    missingManifest,
    screenshotBytes,
    screenshotSha256,
    screenshotProfile: screenshotReport.profile,
    previewScreenshotBytes
  };
}

function patchScaffoldPackage(appDir: string): void {
  const path = resolve(appDir, "package.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const usesLean = parsed.dependencies?.["@aura3d/lean"] !== undefined;
  // The engine's optional navigation peer must be resolvable for scaffold
  // builds (its lazy dynamic import is followed at build time); the packed
  // tarball stands in for the post-publish registry optional install.
  // Lean-entry scaffolds stay peer-free: the lean dist carries no crowds
  // code (verified: zero navigation-recast references in the packed lean
  // tarball), and the isolation gate below forbids it there.
  const navigationPeer = { "@aura3d/navigation-recast": `file:${tarballs.navigationRecast}` };
  parsed.dependencies = usesLean
    ? { ...(parsed.dependencies ?? {}), ...leanClosureTarballDependencies() }
    : {
        ...(parsed.dependencies ?? {}),
        "@aura3d/engine": `file:${tarballs.engine}`,
        ...leanClosureTarballDependencies(),
        ...navigationPeer
      };
  parsed.devDependencies = {
    ...(parsed.devDependencies ?? {}),
    "@aura3d/asset-index": `file:${tarballs.assetIndex}`,
    "@aura3d/cli": `file:${tarballs.cli}`,
    "create-aura3d": `file:${tarballs.create}`
  };
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

function leanClosureTarballDependencies(): Record<string, string> {
  return {
    "@aura3d/lean": `file:${tarballs.lean}`,
    "@aura3d/assets": `file:${tarballs.assets}`,
    "@aura3d/animation": `file:${tarballs.animation}`,
    "@aura3d/rendering": `file:${tarballs.rendering}`,
    "@aura3d/scene": `file:${tarballs.scene}`,
    "@aura3d/core": `file:${tarballs.core}`,
    "@aura3d/math": `file:${tarballs.math}`
  };
}

function patchScaffoldPlaywrightConfig(appDir: string, port: number): void {
  const path = resolve(appDir, "playwright.config.ts");
  if (!existsSync(path)) return;
  const source = readFileSync(path, "utf8");
  const next = source
    .replaceAll("http://127.0.0.1:4173", `http://127.0.0.1:${port}`)
    .replace("--port 4173", `--port ${port}`)
    .replace("reuseExistingServer: !process.env.CI", "reuseExistingServer: false");
  writeFileSync(path, next);
}

function replaceTemplateAsset(appDir: string, template: string, assetId: string): CommandResult {
  mkdirSync(resolve(appDir, "assets"), { recursive: true });
  writeFileSync(resolve(appDir, "assets/real-product.glb"), createMinimalGlb(assetId));
  const add = run("npm", ["exec", "aura3d", "--", "assets", "add", "assets/real-product.glb", "--name", assetId], appDir);
  if (!add.ok) return add;
  if (template === "mini-game") {
    const mainPath = resolve(appDir, "src/main.ts");
    const source = readFileSync(mainPath, "utf8");
    if (source.includes("model(assets.playerModel") || source.includes("asset: assets.playerModel")) {
      return run("npm", ["exec", "aura3d", "--", "assets", "validate"], appDir);
    }
    // J3 template shape: the player is already a certified-hero model
    // (`model(assets.showcaseKenneyOobiPlatformerHero, ...)` via
    // `@aura3d/lean/game`), so replacement swaps the hero for the newly
    // added real asset instead of the retired primitive-player anchors.
    const next = source.replace("model(assets.showcaseKenneyOobiPlatformerHero", "model(assets.playerModel");
    if (next === source || !next.includes("model(assets.playerModel")) {
      return { ok: false, output: "mini-game asset replacement did not update src/main.ts", seconds: 0 };
    }
    writeFileSync(mainPath, next);
  }
  return run("npm", ["exec", "aura3d", "--", "assets", "validate"], appDir);
}

function runMissingAssetOutputCheck(appDir: string, assetId: string): CommandResult {
  const manifestPath = resolve(appDir, "aura.assets.json");
  if (!existsSync(manifestPath)) {
    return { ok: false, output: `Missing aura.assets.json before missing asset output check for ${assetId}`, seconds: 0 };
  }
  const manifest = JSON.parse(readFileSync(resolve(appDir, "aura.assets.json"), "utf8")) as {
    assets?: readonly { id?: string; outputPath?: string }[];
  };
  const asset = manifest.assets?.find((entry) => entry.id === assetId);
  if (!asset?.outputPath) {
    return { ok: false, output: `Missing manifest outputPath for ${assetId}`, seconds: 0 };
  }
  if (asset?.outputPath) rmSync(resolve(appDir, asset.outputPath), { force: true });
  return run("npm", ["exec", "aura3d", "--", "assets", "validate"], appDir);
}

function runInventedAssetIdCheck(appDir: string, assetId: string): CommandResult {
  const mainPath = resolve(appDir, "src/main.ts");
  const original = readFileSync(mainPath, "utf8");
  writeFileSync(mainPath, original.replace(`assets.${assetId}`, "assets.missingAsset"));
  const result = run("npm", ["run", "typecheck"], appDir);
  writeFileSync(mainPath, original);
  return result;
}

function runMissingManifestCheck(appDir: string): CommandResult {
  const manifestPath = resolve(appDir, "aura.assets.json");
  const backup = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : undefined;
  if (existsSync(manifestPath)) unlinkSync(manifestPath);
  const result = run("npm", ["exec", "aura3d", "--", "assets", "validate"], appDir);
  if (backup) writeFileSync(manifestPath, backup);
  return result;
}

function writePreviewSpec(appDir: string, port: number): void {
  writeFileSync(resolve(appDir, "playwright.preview.config.ts"), `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:${port}" },
  webServer: {
    command: "npm run preview -- --port ${port} --strictPort",
    url: "http://127.0.0.1:${port}",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
`);
  writeFileSync(resolve(appDir, "tests/static-preview.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("static preview renders nonblank Aura3D canvas", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect.poll(
    async () => ({ ready: await page.locator("body").getAttribute("data-aura3d-ready"), runtimeErrors }),
    { timeout: 90_000 }
  ).toEqual({ ready: "true", runtimeErrors: [] });
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);
  const screenshot = await canvas.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(1000);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/static-preview.png"), screenshot);
  writeFileSync(resolve("tests/reports/static-preview.json"), JSON.stringify({
    bytes: screenshot.byteLength,
    width: box?.width ?? 0,
    height: box?.height ?? 0
  }, null, 2));
});
`);
}

function writePackage(dir: string, json: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "package.json"), `${JSON.stringify(json, null, 2)}\n`);
}

function writeTsconfig(dir: string): void {
  writeFileSync(resolve(dir, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      skipLibCheck: true,
      noEmit: true
    },
    include: ["src"]
  }, null, 2)}\n`);
}

function run(command: string, args: readonly string[], cwd: string): CommandResult {
  args=command === "npm" ? withNpmTransport(args) : args;
  const start = Date.now();
  try {
    const output = execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output: sanitizeOutput(output.trim()), seconds: roundSeconds(start) };
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    return { ok: false, output: sanitizeOutput(output.trim().split("\n").slice(-48).join("\n")), seconds: roundSeconds(start) };
  }
}

function check(id: string, pass: boolean, detail: string): ReleaseCheck {
  return { id, pass, detail: pass ? "passed" : detail };
}

function screenshotProfileCheck(result: TemplateResult): ReleaseCheck {
  const profile = result.screenshotProfile;
  const profileResult = sceneProfilePass(result.template, profile);
  return check(
    `${result.template}-dev-screenshot-profile-visual-cues`,
    result.screenshotBytes > 1000 && result.previewScreenshotBytes > 1000 && profileResult.pass,
    `dev=${result.screenshotBytes}, profile=${JSON.stringify(profile)}, preview=${result.previewScreenshotBytes}, ${profileResult.detail}`
  );
}

function leanTemplateIsolationCheck(template: string): ReleaseCheck {
  const appDir = resolve(workspace, "templates", template, "demo");
  const manifestPath = resolve(appDir, "package.json");
  const lockPath = resolve(appDir, "package-lock.json");
  if (!existsSync(manifestPath) || !existsSync(lockPath)) {
    return check(
      `${template}-installed-lean-dependency-isolation`,
      false,
      `clean install did not produce ${!existsSync(manifestPath) ? "package.json" : "package-lock.json"}`
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    readonly dependencies?: Record<string, string>;
  };
  const lockText = readFileSync(lockPath, "utf8");
  const forbidden = [
    "@aura3d/engine",
    "@aura3d/physics",
    "@aura3d/physics-rapier",
    "@aura3d/navigation-recast",
    "@aura3d/editor",
    "@aura3d/editor-runtime",
    "@dimforge/rapier3d-compat"
  ].filter((name) => lockText.includes(`\"${name}\"`) || lockText.includes(`node_modules/${name}`));
  const hasLean = manifest.dependencies?.["@aura3d/lean"] !== undefined
    && existsSync(resolve(appDir, "node_modules/@aura3d/lean/package.json"));
  return check(
    `${template}-installed-lean-dependency-isolation`,
    hasLean && forbidden.length === 0,
    hasLean
      ? `forbidden installed dependencies: ${forbidden.join(", ")}`
      : "@aura3d/lean is not declared and installed"
  );
}

function sceneProfilePass(template: string, profile: Record<string, unknown>): { readonly pass: boolean; readonly detail: string } {
  const checks: readonly [string, number][] =
    template === "product-viewer"
      ? [
          ["metalPixels", 5],
          ["warmAccentPixels", 8],
          ["centerObjectPixels", 650],
          ["saturatedStudioPixels", 800],
          ["uniqueBuckets", 18]
        ]
      : template === "cinematic-scene"
        ? [
            ["cyanPixels", 320],
            ["amberPixels", 20],
            ["rainPixels", 90],
            ["wetReflectionPixels", 60],
            ["centerHeroPixels", 600],
            ["darkAlleyPixels", 180],
            ["uniqueBuckets", 22]
          ]
        : [
            ["brightPixels", 900],
            ["cyanPixels", 20],
            ["warmPixels", 10],
            ["redPixels", 5],
            ["uniqueBuckets", 22]
          ];
  const failures = checks.filter(([key, threshold]) => numberValue(profile[key]) <= threshold);
  return {
    pass: failures.length === 0,
    detail: failures.length === 0 ? "scene-specific profile passed" : `profile thresholds failed: ${failures.map(([key, threshold]) => `${key}>${threshold}`).join(", ")}`
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readScreenshotBytes(appDir: string, path: string): number {
  const fullPath = resolve(appDir, path);
  return existsSync(fullPath) ? statSync(fullPath).size : 0;
}

function readFileSha256(appDir: string, path: string): string {
  const fullPath = resolve(appDir, path);
  return existsSync(fullPath) ? createHash("sha256").update(readFileSync(fullPath)).digest("hex") : "";
}

function readScreenshotReport(appDir: string, path: string): { readonly bytes: number; readonly profile: Record<string, unknown> } {
  const fullPath = resolve(appDir, path);
  if (!existsSync(fullPath)) return { bytes: 0, profile: {} };
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as { readonly bytes?: number; readonly profile?: Record<string, unknown> };
    return {
      bytes: Number(parsed.bytes ?? 0),
      profile: parsed.profile ?? {}
    };
  } catch {
    return { bytes: 0, profile: {} };
  }
}

function includesAll(value: string, terms: readonly string[]): boolean {
  return terms.every((term) => value.includes(term));
}

function roundSeconds(start: number): number {
  return Math.round(((Date.now() - start) / 1000) * 10) / 10;
}

function createMinimalGlb(name: string): Buffer {
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "Aura3D clean-install fixture" },
    materials: [{ name }],
    accessors: [{ min: [-1, -1, -1], max: [1, 1, 1] }]
  });
  const jsonPadding = (4 - (Buffer.byteLength(json) % 4)) % 4;
  const jsonChunk = Buffer.from(json + " ".repeat(jsonPadding));
  const totalLength = 12 + 8 + jsonChunk.length;
  const header = Buffer.alloc(20);
  header.write("glTF", 0, "utf8");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.write("JSON", 16, "utf8");
  return Buffer.concat([header, jsonChunk]);
}

function writeCleanInstallMarkdown(checks: readonly ReleaseCheck[], results: readonly TemplateResult[]): void {
  const lines = [
    "# Clean Install Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Checks passing: ${checks.filter((entry) => entry.pass).length}/${checks.length}`,
    `- Workspace: \`${repoRelative(workspace)}\``,
    "",
    "## Template Lifecycle",
    "",
    "| Template | Install | Build | Dev Route | Preview Route | Asset Replacement | Dev Screenshot | Dev Profile | Preview Screenshot |",
    "|---|---:|---:|---:|---:|---:|---:|---|---:|",
    ...results.map((result) => `| \`${result.template}\` | ${yes(result.install.ok)} | ${yes(result.build.ok)} | ${yes(result.devRouteHealth.ok)} | ${yes(result.previewRouteHealth.ok)} | ${yes(result.assetReplacement.ok && result.assetReplacementBuild.ok)} | ${result.screenshotBytes} | ${escapeTable(profileSummary(result.screenshotProfile))} | ${result.previewScreenshotBytes} |`),
    "",
    "## Checks",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("tests/reports/clean-install-results.md", lines.join("\n"));
}

function yes(value: boolean): string {
  return value ? "yes" : "no";
}

function profileSummary(profile: Record<string, unknown>): string {
  return Object.entries(profile).map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function repoRelative(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function sanitizeOutput(value: string): string {
  return value
    .replaceAll(process.cwd(), "<repo>")
    .replaceAll(workspace, "<clean-install-workspace>");
}
