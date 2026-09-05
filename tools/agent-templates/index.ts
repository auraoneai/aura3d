import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { checkDeploy } from "../../packages/aura3d-cli/src/index";
import { CREATE_AURA3D_TEMPLATES, createA3DProject, type CreateA3DTemplate } from "../../packages/create-aura3d/src/index";
import { existsCheck, fileIncludes, writeReport, type ReleaseCheck } from "../check-common";

const currentPackageVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const templates = [...CREATE_AURA3D_TEMPLATES];
const requestedSmokeTemplates = process.env.A3D_TEMPLATE_FILTER
  ?.split(",")
  .map((template) => template.trim())
  .filter((template): template is CreateA3DTemplate => CREATE_AURA3D_TEMPLATES.includes(template as CreateA3DTemplate));
const smokeTemplates: readonly CreateA3DTemplate[] = requestedSmokeTemplates?.length
  ? requestedSmokeTemplates
  : templates;
const installedTarballDirectory = process.env.A3D_TEMPLATE_TARBALL_DIR
  ? resolve(process.env.A3D_TEMPLATE_TARBALL_DIR)
  : undefined;
const templateNames = new Set<string>(templates);
const rootPackagedTemplates = ["product-viewer", "cinematic-scene", "mini-game"] as const;
/**
 * Production templates the root package intentionally ships alongside the three starters.
 *
 * These four were added to `package.json`'s `files` by the 1.5.0 release (`ddde00be`), but the
 * `production-` ban in `bannedPackageTemplatePatterns` predates that (`7236ebc0`, 2026-05-28) and
 * was never updated. The result is a gate that has been failing since 1.5.0 for a decision the
 * project made deliberately: `root-package-template-scope` demanded exactly three templates while
 * the package shipped seven, and `non-starter-templates-not-packaged` banned the very prefix those
 * four use.
 *
 * They are real, complete templates — each has `package.json`, `index.html`, `asset-manifest.json`,
 * `README.md` and `src/` — so the honest fix is to allow what is intentionally published rather
 * than to stop publishing it or to delete the gate. The ban still applies to `external-parity-` and
 * `three-compat-` prefixes and to every held-back starter, so its purpose is preserved.
 */
const rootPackagedProductionTemplates = [
  "production-product-viewer",
  "production-product-configurator",
  "production-asset-inspector",
  "production-material-studio"
] as const;
const promptPlanTemplates = ["cinematic-scene"] as const;
// asset-gallery, interactive-scene, and material-studio were README-only
// tombstones in the archive (sources deleted before the move in 7236ebc0)
// and were deliberately pruned with the archive README at the 2.0 freeze
// (5bc7d936). They stay banned from packaging via
// bannedPackageTemplatePatterns below; only the 14 real archived sources
// are asserted present here.
const heldBackTemplateDirs = [
  "production-architecture-viewer",
  "production-asset-inspector",
  "production-material-studio",
  "production-product-configurator",
  "production-product-viewer",
  "production-webgpu-starter",
  "three-compat-architecture-interior",
  "three-compat-asset-inspector",
  "three-compat-character-viewer",
  "three-compat-custom-threejs-migration",
  "three-compat-large-scene",
  "three-compat-material-authoring",
  "three-compat-postprocess-scene",
  "three-compat-premium-product-viewer"
] as const;
const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as { files?: string[] };
const createPackage = JSON.parse(readFileSync("packages/create-aura3d/package.json", "utf8")) as { files?: string[] };
const tsconfig = JSON.parse(readFileSync("tsconfig.base.json", "utf8")) as {
  compilerOptions?: { paths?: Record<string, readonly string[]> };
};
const expectedTemplateFiles = templates.map((template) => `templates/${template}`);
const expectedRootTemplateFiles = [
  ...rootPackagedTemplates.map((template) => `templates/${template}`),
  ...rootPackagedProductionTemplates.map((template) => `templates/${template}`)
];
const activePackageTemplateDirs = readdirSync("packages/create-aura3d/templates", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const bannedPackageTemplatePatterns = [
  /^templates\/(?:external-parity|three-compat)-/,
  /^templates\/(?:asset-viewer|asset-gallery|interactive-scene|material-studio|product-configurator|game-slice|react|svelte|vite-vanilla|vue)$/
];

const checks: ReleaseCheck[] = [
  ...templates.flatMap((template) => [
    existsCheck(`packages/create-aura3d/templates/${template}/package.json`, `${template} package`),
    existsCheck(`packages/create-aura3d/templates/${template}/playwright.config.ts`, `${template} Playwright config`),
    existsCheck(`packages/create-aura3d/templates/${template}/${templateEntry(template)}`, `${template} main`),
    existsCheck(`packages/create-aura3d/templates/${template}/tests/route-health.spec.ts`, `${template} route health test`),
    templateSmokeSpecCheck(template),
    fileIncludes(`packages/create-aura3d/templates/${template}/${templateApiFile(template)}`, [templatePublicPackage(template)], `${template} public Aura3D api`)
  ]),
  ...rootPackagedTemplates.flatMap((template) => [
    existsCheck(`templates/${template}/package.json`, `${template} packaged root template package`),
    existsCheck(`templates/${template}/playwright.config.ts`, `${template} packaged root template Playwright config`),
    existsCheck(`templates/${template}/src/main.ts`, `${template} packaged root template main`),
    fileIncludes(`templates/${template}/src/main.ts`, [templatePublicPackage(template)], `${template} packaged root Aura3D api`)
  ]),
  ...promptPlanTemplates.flatMap((template) => [
    fileIncludes(`templates/${template}/src/main.ts`, ["definePromptPlan", "promptPlanToScene"], `${template} packaged root prompt-plan api`),
    fileIncludes(`packages/create-aura3d/templates/${template}/src/main.ts`, ["definePromptPlan", "promptPlanToScene"], `${template} public prompt-plan api`)
  ]),
  fileIncludes("templates/mini-game/src/main.ts", ["createAuraApp", "game.platformer"], "mini-game packaged root game api"),
  fileIncludes("packages/create-aura3d/templates/mini-game/src/main.ts", ["createAuraApp", "game.platformer"], "mini-game public game api"),
  fileIncludes("templates/product-viewer/src/main.ts", ["@aura3d/lean/product"], "product-viewer packaged root lean-product entry"),
  fileIncludes("packages/create-aura3d/templates/product-viewer/src/main.ts", ["@aura3d/lean/product"], "product-viewer public lean-product entry"),
  fileIncludes("templates/mini-game/src/main.ts", ["@aura3d/lean/game"], "mini-game packaged root lean-game entry"),
  fileIncludes("packages/create-aura3d/templates/mini-game/src/main.ts", ["@aura3d/lean/game"], "mini-game public lean-game entry"),
  ...rootPackagedTemplates.flatMap((template) => [
    fileIncludes(`packages/create-aura3d/templates/${template}/tests/route-health.spec.ts`, ["tests/reports/route-health.json"], `${template} route health report`),
    fileIncludes(`packages/create-aura3d/templates/${template}/tests/screenshot.spec.ts`, ["tests/reports/screenshot.png", "tests/reports/screenshot.json"], `${template} screenshot report`)
  ]),
  fileIncludes("packages/create-aura3d/src/index.ts", templates, "create command templates"),
  {
    id: "root-package-template-scope",
    pass:
      expectedRootTemplateFiles.every((file) => rootPackage.files?.includes(file)) &&
      (rootPackage.files ?? []).filter((file) => file.startsWith("templates/")).every((file) => expectedRootTemplateFiles.includes(file)),
    detail: `root package templates: ${(rootPackage.files ?? []).filter((file) => file.startsWith("templates/")).join(", ")}`
  },
  {
    id: "create-aura3d-package-template-scope",
    pass:
      expectedTemplateFiles.every((file) => createPackage.files?.includes(file)) &&
      (createPackage.files ?? []).filter((file) => file.startsWith("templates/")).every((file) => expectedTemplateFiles.includes(file)),
    detail: `create package templates: ${(createPackage.files ?? []).filter((file) => file.startsWith("templates/")).join(", ")}`
  },
  {
    id: "active-create-aura3d-template-directories",
    pass: activePackageTemplateDirs.length === templates.length && activePackageTemplateDirs.every((template) => templateNames.has(template)),
    detail: `active package template dirs: ${activePackageTemplateDirs.join(", ")}`
  },
  {
    id: "held-back-template-archive-pruned",
    pass:
      !existsSync("archive/held-back-create-aura3d-templates/README.md") &&
      heldBackTemplateDirs.every((template) => existsSync(`archive/held-back-create-aura3d-templates/${template}`)),
    detail: "held-back template sources remain excluded while superseded archive documentation is pruned"
  },
  {
    id: "non-starter-templates-not-packaged",
    pass: (rootPackage.files ?? []).every((file) => !bannedPackageTemplatePatterns.some((pattern) => pattern.test(file))),
    detail: "root package files do not ship held-back templates"
  },
  {
    /*
     * Any `production-` template the package ships must be one of the four declared above.
     * Without this, narrowing the ban would let an arbitrary `production-` template be published
     * unreviewed, which is the hole the original blanket ban was closing.
     */
    id: "packaged-production-templates-are-declared",
    pass: (rootPackage.files ?? [])
      .filter((file) => file.startsWith("templates/production-"))
      .every((file) => (rootPackagedProductionTemplates as readonly string[]).includes(file.slice("templates/".length))),
    detail: `packaged production templates: ${(rootPackage.files ?? []).filter((file) => file.startsWith("templates/production-")).join(", ") || "none"}`
  },
  {
    /** Every declared production template must actually exist on disk, not just in `files`. */
    id: "declared-production-templates-exist",
    pass: rootPackagedProductionTemplates.every((template) => existsSync(`templates/${template}/package.json`)),
    detail: `${rootPackagedProductionTemplates.length} declared production templates present`
  }
];

const scaffoldSmoke = runScaffoldSmoke();
checks.push({
  id: "create-aura3d-scaffold-build-route-health-smoke",
  pass: scaffoldSmoke.pass,
  detail: scaffoldSmoke.pass ? `${scaffoldSmoke.results.length} generated template projects built and ran route-health plus template smoke specs` : scaffoldSmoke.failures.join("; ")
});

writeReport(installedTarballDirectory ? "tests/reports/installed-template-lifecycle.json" : "tests/reports/agent-templates.json", installedTarballDirectory ? "aura3d-installed-template-lifecycle" : "aura3d-agent-templates", checks, {
  mode: installedTarballDirectory ? `fresh-local-${currentPackageVersion}-tarballs` : "workspace-source-aliases",
  scaffoldSmoke: scaffoldSmoke.results
});

function runScaffoldSmoke(): {
  readonly pass: boolean;
  readonly results: readonly Record<string, unknown>[];
  readonly failures: readonly string[];
} {
  const outRoot = resolve("tests/reports/create-aura3d-scaffold-smoke");
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
  const results: Record<string, unknown>[] = [];
  const failures: string[] = [];

  for (const template of smokeTemplates) {
    const targetDir = resolve(outRoot, template);
    try {
      const scaffold = createA3DProject({
        targetDir,
        template: template as CreateA3DTemplate,
        packageVersion: currentPackageVersion,
        rootDir: resolve("packages/create-aura3d")
      });
      const installedPackages = installedTarballDirectory ? installPackedTemplateDependencies(targetDir) : [];
      writeWorkspaceViteConfig(targetDir, !installedTarballDirectory);
      writeWorkspacePlaywrightConfig(targetDir);
      writeReleaseRenderSpec(targetDir);
      const smokeSpecs = templateSmokeSpecs(template);
      if (installedTarballDirectory) run("npm", ["run", "build"], targetDir);
      else run("pnpm", ["exec", "vite", "build", "--config", resolve(targetDir, "vite.config.ts")], targetDir);
      const deploy = checkDeploy({ projectDir: targetDir, distDir: "dist" });
      if (!deploy.ok) throw new Error(`deploy check failed: ${deploy.failures.join("; ")}`);
      const browserSpecs = [...smokeSpecs, "__release-render.spec.ts"];
      // PRD R1.3 flaky-browser policy: browser smoke gets a 2-strike retry.
      // First-boot timing on heavy templates (fighting-game boots ~70s
      // against a 90s harness timeout) flakes near the bound with zero
      // rendering defect; a template that genuinely never renders still
      // fails both strikes and stays red. Attempts are recorded, never
      // silently swallowed.
      let browserAttempts = 0;
      for (;;) {
        browserAttempts += 1;
        try {
          run("pnpm", ["exec", "playwright", "test", ...browserSpecs.map((spec) => `tests/${spec}`), "--config", resolve(targetDir, "playwright.config.ts"), "--reporter=line", "--workers=1"], targetDir);
          break;
        } catch (error) {
          if (browserAttempts >= 2) throw error;
        }
      }
      const routeReportPath = resolve(targetDir, "tests/reports/route-health.json");
      // Keep the release-matrix artifact separate from each template's own
      // screenshot report. Playwright sorts spec files independently of the
      // CLI argument order, so a template screenshot spec may otherwise
      // overwrite the matrix interaction receipt after it has been written.
      const screenshotReportPath = resolve(targetDir, "tests/reports/release-screenshot.json");
      const screenshotPath = resolve(targetDir, "tests/reports/release-screenshot.png");
      const routeReport = existsSync(routeReportPath)
        ? JSON.parse(readFileSync(routeReportPath, "utf8")) as { drawCalls?: number }
        : undefined;
      const screenshotReport = existsSync(screenshotReportPath)
        ? JSON.parse(readFileSync(screenshotReportPath, "utf8")) as {
            bytes?: number;
            profile?: Record<string, unknown>;
            interactionEvents?: readonly string[];
          }
        : undefined;
      if (!existsSync(screenshotPath) || statSync(screenshotPath).size <= 1_000) {
        throw new Error("render smoke did not retain a screenshot larger than 1,000 bytes");
      }
      if (screenshotReport?.interactionEvents?.length !== 3) {
        throw new Error("interaction smoke did not exercise pointer drag, wheel, and keyboard focus");
      }
      results.push({
        template,
        files: scaffold.files.length,
        installMode: installedTarballDirectory ? `fresh-local-${currentPackageVersion}-tarballs` : "workspace-source-aliases",
        installedPackages,
        build: true,
        browserSmoke: true,
        browserSmokeAttempts: browserAttempts,
        interactionSmoke: true,
        deployCheck: true,
        smokeSpecs: browserSpecs,
        routeHealth: true,
        routeHealthReport: existsSync(routeReportPath),
        screenshot: true,
        drawCalls: routeReport?.drawCalls,
        screenshotBytes: screenshotReport?.bytes,
        screenshotProfile: screenshotReport?.profile,
        screenshotFileBytes: existsSync(screenshotPath) ? statSync(screenshotPath).size : undefined
      });
    } catch (error) {
      failures.push(`${template}: ${error instanceof Error ? error.message : String(error)}`);
      results.push({ template, build: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { pass: failures.length === 0, results, failures };
}

function templateSmokeSpecCheck(template: string): ReleaseCheck {
  const specs = templateSmokeSpecs(template);
  return {
    id: `${template}-template-smoke-spec`,
    pass: specs.every((spec) => existsSync(`packages/create-aura3d/templates/${template}/tests/${spec}`)),
    detail: `${template} smoke specs: ${specs.join(", ")}`
  };
}

function templateSmokeSpecs(template: string): readonly string[] {
  if (template === "fighting-game") return ["route-health.spec.ts", "gameplay-smoke.spec.ts"];
  if (template === "animation-channel" || template === "prompt-animation-channel") return ["route-health.spec.ts", "storyboard-playback.spec.ts"];
  if (template === "racing-starter" || template === "falling-blocks-starter") return ["route-health.spec.ts", "playable.spec.ts"];
  return ["route-health.spec.ts", "screenshot.spec.ts"];
}

function writeReleaseRenderSpec(targetDir: string): void {
  writeFileSync(resolve(targetDir, "tests/__release-render.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("release matrix retains a visible Aura3D canvas", async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(750);
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);
  expect(pageErrors).toEqual([]);
  if (!box) throw new Error("visible Aura3D canvas did not expose screenshot bounds");
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await page.evaluate(({ centerX, centerY, dragX, dragY }) => {
    const target = document.querySelector("canvas");
    if (!(target instanceof HTMLCanvasElement)) throw new Error("Aura3D canvas disappeared before interaction smoke.");
    target.dispatchEvent(new PointerEvent("pointerdown", { clientX: centerX, clientY: centerY, pointerId: 1, buttons: 1, bubbles: true }));
    target.dispatchEvent(new PointerEvent("pointermove", { clientX: dragX, clientY: dragY, pointerId: 1, buttons: 1, bubbles: true }));
    target.dispatchEvent(new PointerEvent("pointerup", { clientX: dragX, clientY: dragY, pointerId: 1, buttons: 0, bubbles: true }));
    target.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
  }, {
    centerX,
    centerY,
    dragX: centerX + Math.min(80, box.width / 6),
    dragY: centerY + Math.min(36, box.height / 8)
  });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(250);
  expect(pageErrors).toEqual([]);
  await expect(canvas).toBeVisible();
  // Capture through Chromium's protocol directly. Playwright page/locator
  // screenshots can wait for a continuously rendering game canvas to become
  // stable and consume the whole test timeout even though the route is healthy.
  const cdp = await page.context().newCDPSession(page);
  const capture = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 }
  });
  await cdp.detach();
  const screenshot = Buffer.from(capture.data, "base64");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/release-screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/release-screenshot.json"), JSON.stringify({
    bytes: screenshot.byteLength,
    canvas: box,
    pageErrors,
    interactionEvents: ["pointer-drag", "wheel", "keyboard-tab"]
  }, null, 2) + "\\n");
  expect(screenshot.byteLength).toBeGreaterThan(1_000);
});
`);
}

// animation-studio is the one template whose entry is the render-live route
// (its interactive UI is the bundled studio/), so it has no src/main.ts.
function templateEntry(template: string): string {
  return template === "animation-studio" ? "src/render-live-route.ts" : "src/main.ts";
}

// The file whose public @aura3d/engine usage proves the template builds on the
// public API. For animation-studio that is the generic scene player the entry
// mounts (the entry itself is a thin bootstrap with no direct engine import).
function templateApiFile(template: string): string {
  return template === "animation-studio" ? "src/scene-player.ts" : "src/main.ts";
}

function templatePublicPackage(template: string): string {
  if (template === "product-viewer") return "@aura3d/lean/product";
  if (template === "mini-game") return "@aura3d/lean/game";
  return "@aura3d/engine";
}

function writeWorkspacePlaywrightConfig(targetDir: string): void {
  writeFileSync(resolve(targetDir, "playwright.config.ts"), `import { defineConfig } from "@playwright/test";

export default defineConfig({
  workers: 1,
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4173"
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
`);
}

function writeWorkspaceViteConfig(targetDir: string, sourceAliases: boolean): void {
  if (!sourceAliases) {
    // Installed scaffolds resolve the engine's optional navigation peer
    // from the packed-tarball closure (installed alongside the engine, like
    // the post-publish registry optional install), so the stock template
    // vite config applies unchanged.
    writeFileSync(resolve(targetDir, "vite.config.ts"), `import { defineConfig } from "vite";\n\nexport default defineConfig({});\n`);
    return;
  }
  const aliasEntries = Object.entries(tsconfig.compilerOptions?.paths ?? {})
    .map(([specifier, paths]) => [specifier, paths[0]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    .sort((a, b) => b[0].length - a[0].length)
    .map(([specifier, path]) => {
      const replacement = specifier === "@aura3d/engine"
        ? resolve("packages/engine/src/agent-api/index.ts")
        : specifier === "@aura3d/animation"
          ? resolve("packages/animation/src/browser-index.ts")
          : specifier === "@aura3d/assets"
            ? resolve("packages/assets/src/browser-index.ts")
        : resolve(path);
      return `      { find: ${JSON.stringify(specifier)}, replacement: ${JSON.stringify(replacement)} }`;
    })
    .join(",\n");
  writeFileSync(resolve(targetDir, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
${aliasEntries}
    ]
  }
});
`);
}

function installPackedTemplateDependencies(targetDir: string): readonly string[] {
  if (!installedTarballDirectory) return [];
  const templateManifest = JSON.parse(readFileSync(resolve(targetDir, "package.json"), "utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  const directAuraPackages = Object.keys(templateManifest.dependencies ?? {}).filter((name) => name.startsWith("@aura3d/"));
  const packageDirectories = [".", ...readdirSync(resolve("packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve("packages", entry.name, "package.json")))
    .map((entry) => resolve("packages", entry.name))];
  const manifests = new Map<string, { readonly dependencies?: Readonly<Record<string, string>> }>();
  for (const directory of packageDirectories) {
    const path = resolve(directory, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { readonly name?: string; readonly dependencies?: Readonly<Record<string, string>> };
    if (manifest.name?.startsWith("@aura3d/")) manifests.set(manifest.name, manifest);
  }
  const closure = new Set<string>();
  const visit = (name: string): void => {
    if (closure.has(name)) return;
    closure.add(name);
    const manifest = manifests.get(name);
    if (!manifest) throw new Error(`No workspace manifest found for template dependency ${name}.`);
    // Engine-branch templates declare the optional `@aura3d/navigation-recast`
    // peer directly, so it rides the closure and scaffold builds resolve its
    // lazy dynamic import (fail-closed at runtime when crowds run without
    // it; never bundled when unused). Lean-entry templates stay peer-free.
    for (const dependency of Object.keys(manifest.dependencies ?? {}).filter((entry) => entry.startsWith("@aura3d/"))) visit(dependency);
  };
  for (const name of directAuraPackages) visit(name);
  const tarballs = [...closure].sort().map((name) => {
    const path = resolve(installedTarballDirectory, `${name.slice(1).replace("/", "-")}-${currentPackageVersion}.tgz`);
    if (!existsSync(path)) throw new Error(`Missing packed template dependency ${path}.`);
    return path;
  });
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-save", ...tarballs], targetDir);
  for (const name of directAuraPackages) {
    const installed = JSON.parse(readFileSync(resolve(targetDir, "node_modules", ...name.split("/"), "package.json"), "utf8")) as { readonly version?: string };
    if (installed.version !== currentPackageVersion) throw new Error(`${name}: expected installed ${currentPackageVersion}, found ${installed.version ?? "missing"}.`);
  }
  return tarballs.map((path) => basename(path));
}

function run(command: string, args: readonly string[], cwd: string): void {
  try {
    execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    const message = output.trim().split("\n").slice(-16).join("\n");
    throw new Error(message || `${command} ${args.join(" ")} failed`);
  }
}
