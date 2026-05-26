import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

interface TemplatePackageJson {
  name: string;
  private: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface TemplateResult {
  template: string;
  status: "passed" | "failed";
  checks: string[];
  errors: string[];
  tempApp?: string;
}

const root = process.cwd();
const packageVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const starterTemplateEntries = [
  { name: "vite-vanilla", entry: "src/main.ts" },
  { name: "react", entry: "src/main.tsx" },
  { name: "vue", entry: "src/main.ts" },
  { name: "svelte", entry: "src/App.svelte" }
] as const;
const templates = discoverTemplates();
const localRuntimePackages = discoverLocalRuntimePackages();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function verifyTemplate(template: { name: string; entry: string }): TemplateResult {
  const base = `templates/${template.name}`;
  const checks: string[] = [];
  const errors: string[] = [];
  let tempApp: string | undefined;

  const packagePath = `${base}/package.json`;
  const indexPath = `${base}/index.html`;
  const entryPath = `${base}/${template.entry}`;

  for (const path of [packagePath, indexPath, entryPath]) {
    if (!existsSync(join(root, path))) {
      errors.push(`${path} is missing`);
    } else {
      checks.push(`${path} exists`);
    }
  }

  if (errors.length === 0) {
    const packageJson = JSON.parse(read(packagePath)) as TemplatePackageJson;
    const allDependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {})
    };
    const serializedDependencies = JSON.stringify(allDependencies);
    const sourceText = readTemplateSource(base);
    const index = read(indexPath);

    if (packageJson.private !== true) {
      errors.push(`${packagePath} must stay private until package publishing is real`);
    } else {
      checks.push("template is private");
    }

    if (packageJson.scripts?.build !== "vite build") {
      errors.push(`${packagePath} must expose a Vite build script`);
    } else {
      checks.push("build script uses vite");
    }

    const aura3dDependencies = Object.keys(allDependencies).filter((dependency) => dependency.startsWith("@aura3d/"));
    if (aura3dDependencies.length === 0) {
      errors.push(`${packagePath} must depend on at least one public @aura3d package`);
    } else {
      for (const dependency of aura3dDependencies) {
        checks.push(`uses public ${dependency} package`);
      }
    }

    if (serializedDependencies.includes("workspace:")) {
      errors.push(`${packagePath} must not use workspace protocol dependencies`);
    } else {
      checks.push("does not use workspace protocol dependencies");
    }

    if (!sourceText.includes("@aura3d/")) {
      errors.push(`${base}/src must use public Aura3D imports`);
    } else {
      checks.push("entry uses required public imports");
    }

    if (sourceText.includes("@aura3d/rendering")) {
      if (!sourceText.includes("Renderer.create") || !sourceText.includes('backend: "webgl2"')) {
        errors.push(`${base}/src must create a WebGL2 Aura3D renderer through public imports`);
      } else {
        checks.push("entry creates WebGL2 renderer through public imports");
      }
    }

    if (sourceText.includes("@aura3d/assets")) {
      if (!sourceText.includes("AssetManager") || !sourceText.includes("GLTFLoader")) {
        errors.push(`${base}/src must exercise the public asset pipeline`);
      } else {
        checks.push("entry is asset-pipeline backed");
      }
    }

    if (!index.includes('<script type="module"')) {
      errors.push(`${indexPath} must load a module entrypoint`);
    } else {
      checks.push("index loads a module entrypoint");
    }

    if (errors.length === 0) {
      try {
        tempApp = verifyFreshTemplateBuild(base, packageJson, template.entry);
        checks.push("copies template into a fresh temporary app");
        checks.push("installs external dependencies without workspace protocols");
        checks.push("copies sanitized local Aura3D package artifacts into node_modules");
        checks.push("builds the copied template with npm run build");
        checks.push("smoke-checks dist output for the starter renderer bundle");
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  return {
    template: template.name,
    status: errors.length === 0 ? "passed" : "failed",
    checks,
    errors,
    tempApp
  };
}

function verifyFreshTemplateBuild(base: string, packageJson: TemplatePackageJson, entry: string): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "aura3d-template-"));
  const appDir = join(tempRoot, basename(base));
  cpSync(join(root, base), appDir, {
    recursive: true,
    filter: (source) => !source.includes(`${join(base, "node_modules")}`)
  });

  const installPackageJson = {
    ...packageJson,
    dependencies: removeAura3DDependencies(packageJson.dependencies),
    devDependencies: removeAura3DDependencies(packageJson.devDependencies)
  };
  writeFileSync(join(appDir, "package.json"), `${JSON.stringify(installPackageJson, null, 2)}\n`);

  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], {
    cwd: appDir,
    stdio: "pipe"
  });

  writeFileSync(join(appDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  copyLocalRuntimePackages(appDir);

  execFileSync("npm", ["run", "build", "--silent"], {
    cwd: appDir,
    stdio: "pipe"
  });

  smokeBuiltTemplate(appDir, entry);

  if (process.env.AURA3D_KEEP_TEMPLATE_TMP !== "1") {
    rmSync(tempRoot, { recursive: true, force: true });
    return "<removed>";
  }
  return appDir;
}

function removeAura3DDependencies(dependencies: Record<string, string> | undefined): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [name, version] of Object.entries(dependencies ?? {})) {
    if (!name.startsWith("@aura3d/")) {
      next[name] = version;
    }
  }
  return next;
}

function copyLocalRuntimePackages(appDir: string): void {
  const scopeDir = join(appDir, "node_modules", "@aura3d");
  mkdirSync(scopeDir, { recursive: true });
  for (const packageName of localRuntimePackages) {
    const sourceDir = join(root, "packages", packageName);
    const targetDir = join(scopeDir, packageName);
    cpSync(join(sourceDir, "dist"), join(targetDir, "dist"), { recursive: true });

    const sourcePackageJson = JSON.parse(readFileSync(join(sourceDir, "package.json"), "utf8")) as TemplatePackageJson;
    const sanitizedPackageJson = {
      ...sourcePackageJson,
      dependencies: replaceWorkspaceDependencies(sourcePackageJson.dependencies)
    };
    if (packageName === "rendering") {
      sanitizedPackageJson.dependencies = {
        ...(sanitizedPackageJson.dependencies ?? {}),
        "@aura3d/scene": packageVersion.version
      };
    }
    writeFileSync(join(targetDir, "package.json"), `${JSON.stringify(sanitizedPackageJson, null, 2)}\n`);
  }
}

function replaceWorkspaceDependencies(dependencies: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!dependencies) return undefined;
  const next: Record<string, string> = {};
  for (const [name, version] of Object.entries(dependencies)) {
    next[name] = version.startsWith("workspace:") ? packageVersion.version : version;
  }
  return next;
}

function smokeBuiltTemplate(appDir: string, entry: string): void {
  const distDir = join(appDir, "dist");
  const index = readFileSync(join(distDir, "index.html"), "utf8");
  if (!index.includes("<script") || !index.includes("/assets/")) {
    throw new Error(`${appDir} built dist/index.html does not load a bundled asset`);
  }

  const assetsDir = join(distDir, "assets");
  const builtAssets = readdirSync(assetsDir).filter((file) => file.endsWith(".js"));
  const bundleText = builtAssets.map((file) => readFileSync(join(assetsDir, file), "utf8")).join("\n");
  const knownSmokeMarker = bundleText.includes("starter-triangle")
    || bundleText.includes("product-configurator")
    || bundleText.includes("game-slice")
    || bundleText.includes("asset-viewer");
  if (!knownSmokeMarker) {
    throw new Error(`${appDir} bundle smoke failed for ${entry}; expected starter renderer markers`);
  }
  if (bundleText.includes("workspace:")) {
    throw new Error(`${appDir} bundle contains a workspace protocol reference`);
  }
}

function discoverTemplates(): Array<{ name: string; entry: string }> {
  const configured = new Map<string, string>(starterTemplateEntries.map((template) => [template.name, template.entry]));
  return readdirSync(join(root, "templates"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(root, "templates", entry.name, "package.json")))
    .map((entry) => ({
      name: entry.name,
      entry: configured.get(entry.name) ?? discoverTemplateEntry(entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function discoverTemplateEntry(name: string): string {
  for (const entry of ["src/main.ts", "src/main.tsx", "src/App.svelte"]) {
    if (existsSync(join(root, "templates", name, entry))) return entry;
  }
  return "src/main.ts";
}

function discoverLocalRuntimePackages(): string[] {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(root, "packages", entry.name, "package.json")))
    .filter((entry) => existsSync(join(root, "packages", entry.name, "dist")))
    .filter((entry) => {
      const packageJson = JSON.parse(readFileSync(join(root, "packages", entry.name, "package.json"), "utf8")) as { private?: boolean };
      return packageJson.private !== true;
    })
    .map((entry) => entry.name)
    .sort();
}

function readTemplateSource(base: string): string {
  const sourceDir = join(root, base, "src");
  if (!existsSync(sourceDir)) return "";
  return readSourceFiles(sourceDir).join("\n");
}

function readSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readSourceFiles(path));
    } else if (entry.isFile()) {
      files.push(readFileSync(path, "utf8"));
    }
  }
  return files;
}

const results = templates.map(verifyTemplate);
const failed = results.filter((result) => result.status === "failed");
const report = {
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "passed" : "failed",
  boundary: [
    "Each template is copied to a fresh temporary directory.",
    "External framework and Vite dependencies are installed from npm.",
    "The unpublished Aura3D 0.0.0-rebuild runtime packages are copied from local dist artifacts with workspace protocols sanitized.",
    "This is starter-template CI evidence, not registry publishing or independent clean-checkout evidence."
  ],
  templates: results
};

writeFileSync(join(root, "tests/reports/template-verification.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failed.length > 0) {
  for (const result of failed) {
    for (const error of result.errors) {
      console.error(`[${result.template}] ${error}`);
    }
  }
  process.exitCode = 1;
} else {
  console.log(`Verified ${results.length} starter templates.`);
}
