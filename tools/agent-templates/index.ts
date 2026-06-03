import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createA3DProject, type CreateA3DTemplate } from "../../packages/create-aura3d/src/index";
import { existsCheck, fileIncludes, writeReport, type ReleaseCheck } from "../check-common";

const templates = ["product-viewer", "cinematic-scene", "mini-game"];
const heldBackTemplateDirs = [
  "asset-gallery",
  "interactive-scene",
  "material-studio",
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
const activePackageTemplateDirs = readdirSync("packages/create-aura3d/templates", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const bannedPackageTemplatePatterns = [
  /^templates\/(?:external-parity|three-compat|production)-/,
  /^templates\/(?:asset-viewer|asset-gallery|interactive-scene|material-studio|product-configurator|game-slice|react|svelte|vite-vanilla|vue)$/
];

const checks: ReleaseCheck[] = [
  ...templates.flatMap((template) => [
    existsCheck(`packages/create-aura3d/templates/${template}/package.json`, `${template} package`),
    existsCheck(`packages/create-aura3d/templates/${template}/playwright.config.ts`, `${template} Playwright config`),
    existsCheck(`packages/create-aura3d/templates/${template}/src/main.ts`, `${template} main`),
    existsCheck(`packages/create-aura3d/templates/${template}/tests/route-health.spec.ts`, `${template} route health test`),
    existsCheck(`packages/create-aura3d/templates/${template}/tests/screenshot.spec.ts`, `${template} screenshot test`),
    existsCheck(`templates/${template}/package.json`, `${template} packaged root template package`),
    existsCheck(`templates/${template}/playwright.config.ts`, `${template} packaged root template Playwright config`),
    existsCheck(`templates/${template}/src/main.ts`, `${template} packaged root template main`),
    fileIncludes(`packages/create-aura3d/templates/${template}/tests/route-health.spec.ts`, ["tests/reports/route-health.json"], `${template} route health report`),
    fileIncludes(`packages/create-aura3d/templates/${template}/tests/screenshot.spec.ts`, ["tests/reports/screenshot.png", "tests/reports/screenshot.json"], `${template} screenshot report`),
    fileIncludes(`packages/create-aura3d/templates/${template}/src/main.ts`, ["@aura3d/engine", "definePromptPlan", "promptPlanToScene"], `${template} public prompt-plan api`),
    fileIncludes(`templates/${template}/src/main.ts`, ["@aura3d/engine", "definePromptPlan", "promptPlanToScene"], `${template} packaged root prompt-plan api`)
  ]),
  fileIncludes("packages/create-aura3d/src/index.ts", templates, "create command templates"),
  {
    id: "root-package-template-scope",
    pass:
      expectedTemplateFiles.every((file) => rootPackage.files?.includes(file)) &&
      (rootPackage.files ?? []).filter((file) => file.startsWith("templates/")).every((file) => expectedTemplateFiles.includes(file)),
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
    id: "only-three-active-create-aura3d-template-directories",
    pass: activePackageTemplateDirs.length === templates.length && activePackageTemplateDirs.every((template) => templates.includes(template)),
    detail: `active package template dirs: ${activePackageTemplateDirs.join(", ")}`
  },
  {
    id: "held-back-template-archive-documented",
    pass:
      existsSync("archive/held-back-create-aura3d-templates/README.md") &&
      heldBackTemplateDirs.every((template) => existsSync(`archive/held-back-create-aura3d-templates/${template}`)),
    detail: "held-back create-aura3d templates are archived with a README boundary"
  },
  {
    id: "non-starter-templates-not-packaged",
    pass: (rootPackage.files ?? []).every((file) => !bannedPackageTemplatePatterns.some((pattern) => pattern.test(file))),
    detail: "root package files do not ship held-back templates"
  }
];

const scaffoldSmoke = runScaffoldSmoke();
checks.push({
  id: "create-aura3d-scaffold-build-route-health-screenshot",
  pass: scaffoldSmoke.pass,
  detail: scaffoldSmoke.pass ? `${scaffoldSmoke.results.length} generated template projects built, ran route-health, and saved screenshots` : scaffoldSmoke.failures.join("; ")
});

writeReport("tests/reports/agent-templates.json", "aura3d-agent-templates", checks, {
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

  for (const template of templates) {
    const targetDir = resolve(outRoot, template);
    try {
      const scaffold = createA3DProject({
        targetDir,
        template: template as CreateA3DTemplate,
        packageVersion: "1.0.0",
        rootDir: resolve("packages/create-aura3d")
      });
      writeWorkspaceViteConfig(targetDir);
      writeWorkspacePlaywrightConfig(targetDir);
      run("pnpm", ["exec", "vite", "build", "--config", resolve(targetDir, "vite.config.ts")], targetDir);
      run("pnpm", ["exec", "playwright", "test", "tests/route-health.spec.ts", "tests/screenshot.spec.ts", "--config", resolve(targetDir, "playwright.config.ts"), "--reporter=line", "--workers=1"], targetDir);
      const routeReportPath = resolve(targetDir, "tests/reports/route-health.json");
      const screenshotReportPath = resolve(targetDir, "tests/reports/screenshot.json");
      const screenshotPath = resolve(targetDir, "tests/reports/screenshot.png");
      const routeReport = JSON.parse(readFileSync(routeReportPath, "utf8")) as { drawCalls?: number };
      const screenshotReport = JSON.parse(readFileSync(screenshotReportPath, "utf8")) as { bytes?: number; profile?: Record<string, unknown> };
      results.push({
        template,
        files: scaffold.files.length,
        build: true,
        routeHealth: existsSync(routeReportPath),
        screenshot: existsSync(screenshotPath),
        drawCalls: routeReport.drawCalls,
        screenshotBytes: screenshotReport.bytes,
        screenshotProfile: screenshotReport.profile,
        screenshotFileBytes: statSync(screenshotPath).size
      });
    } catch (error) {
      failures.push(`${template}: ${error instanceof Error ? error.message : String(error)}`);
      results.push({ template, build: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { pass: failures.length === 0, results, failures };
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

function writeWorkspaceViteConfig(targetDir: string): void {
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
