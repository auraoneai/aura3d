import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export interface ArchitectureViolation {
  readonly kind: string;
  readonly path: string;
  readonly message: string;
}

export interface ArchitectureReport {
  readonly ok: boolean;
  readonly checkedTopLevelPaths: readonly string[];
  readonly checkedPackages: readonly string[];
  readonly publicPackages: readonly string[];
  readonly privatePackages: readonly string[];
  readonly checkedTestDirs: readonly string[];
  readonly checkedToolDirs: readonly string[];
  readonly requiredScripts: readonly string[];
  readonly violations: readonly ArchitectureViolation[];
}

const requiredTopLevelPaths = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "tsconfig.build.json",
  "vitest.config.ts",
  "playwright.config.ts",
  "eslint.config.js",
  "docs",
  "examples",
  "packages",
  "tests",
  "tools"
] as const;

const publicPackages = [
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
  "debug"
] as const;

const privatePackages = ["test-utils"] as const;
const requiredPackages = [...publicPackages, ...privatePackages] as const;

const requiredTestDirs = [
  "tests/unit",
  "tests/integration",
  "tests/browser",
  "tests/visual",
  "tests/performance"
] as const;

const requiredToolDirs = [
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
] as const;

const requiredScripts = [
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
] as const;

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function packageNameFor(name: string): string {
  return `@aura3d/${name}`;
}

function hasPath(root: string, relativePath: string): boolean {
  return existsSync(join(root, relativePath));
}

function hasExactRootEntry(root: string, name: string): boolean {
  try {
    return readdirSync(root, { withFileTypes: true }).some((entry) => entry.name === name);
  } catch {
    return false;
  }
}

function walkSourceFiles(dir: string, root: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (entry !== "dist" && entry !== "node_modules") walkSourceFiles(path, root, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  return out;
}

function sourceDeclaresClass(root: string, relativePath: string, className: string): boolean {
  const source = readFileSync(join(root, relativePath), "utf8");
  return new RegExp(`\\bclass\\s+${className}\\b`).test(source);
}

function exportedRenderingEntries(root: string): string[] {
  const indexPath = join(root, "packages", "rendering", "src", "index.ts");
  if (!existsSync(indexPath)) return [];
  const source = readFileSync(indexPath, "utf8");
  const directRendererExports = [...source.matchAll(/export\s+\{[^}]*\bRenderer\b[^}]*\}\s+from\s+["'][^"']+["']/g)].map((match) => match[0]);
  return directRendererExports;
}

export function verifyArchitecture(root = process.cwd()): ArchitectureReport {
  const violations: ArchitectureViolation[] = [];

  for (const path of requiredTopLevelPaths) {
    if (!hasPath(root, path)) {
      violations.push({ kind: "missing-top-level-path", path, message: "Required top-level repository path is missing." });
    }
  }

  if (hasExactRootEntry(root, "Docs")) {
    violations.push({
      kind: "legacy-docs-tree",
      path: "Docs",
      message: "Legacy uppercase Docs tree must not coexist with the target lowercase docs tree."
    });
  }

  const rootManifestPath = join(root, "package.json");
  const rootManifest = existsSync(rootManifestPath) ? readJson(rootManifestPath) : {};
  const rootScripts = isObject(rootManifest.scripts) ? rootManifest.scripts : {};
  const rootExports = isObject(rootManifest.exports) ? rootManifest.exports : {};

  for (const script of requiredScripts) {
    if (typeof rootScripts[script] !== "string" || rootScripts[script].length === 0) {
      violations.push({ kind: "missing-script", path: "package.json", message: `Missing package script: ${script}.` });
    }
  }

  for (const packageName of requiredPackages) {
    const packageDir = join("packages", packageName);
    if (!hasPath(root, packageDir)) {
      violations.push({ kind: "missing-package", path: packageDir, message: `Missing target package ${packageName}.` });
      continue;
    }
    const manifestPath = join(packageDir, "package.json");
    const indexPath = join(packageDir, "src", "index.ts");
    if (!hasPath(root, manifestPath)) {
      violations.push({ kind: "missing-package-manifest", path: manifestPath, message: "Package must declare package metadata." });
    }
    if (!hasPath(root, indexPath)) {
      violations.push({ kind: "missing-package-barrel", path: indexPath, message: "Package must expose src/index.ts as its source barrel." });
    }

    if (hasPath(root, manifestPath)) {
      const manifest = readJson(join(root, manifestPath));
      if (manifest.name !== packageNameFor(packageName)) {
        violations.push({
          kind: "package-name-mismatch",
          path: manifestPath,
          message: `Package manifest name must be ${packageNameFor(packageName)}.`
        });
      }
      if (privatePackages.includes(packageName as (typeof privatePackages)[number]) && manifest.private !== true) {
        violations.push({ kind: "private-package-not-private", path: manifestPath, message: "Test utility package must be private." });
      }
    }
  }

  for (const packageName of publicPackages) {
    const exportKey = `./${packageName}`;
    if (!(exportKey in rootExports)) {
      violations.push({ kind: "missing-root-export", path: "package.json", message: `Missing root package export ${exportKey}.` });
    }
  }
  for (const packageName of privatePackages) {
    const exportKey = `./${packageName}`;
    if (exportKey in rootExports) {
      violations.push({ kind: "private-root-export", path: "package.json", message: `Private package ${exportKey} must not be exported from the root package.` });
    }
  }

  const tsconfigPath = join(root, "tsconfig.base.json");
  const tsconfig = existsSync(tsconfigPath) ? readJson(tsconfigPath) : {};
  const compilerOptions = isObject(tsconfig.compilerOptions) ? tsconfig.compilerOptions : {};
  const paths = isObject(compilerOptions.paths) ? compilerOptions.paths : {};
  for (const packageName of requiredPackages) {
    const alias = packageNameFor(packageName);
    if (!(alias in paths)) {
      violations.push({ kind: "missing-tsconfig-path", path: "tsconfig.base.json", message: `Missing TypeScript path alias for ${alias}.` });
    }
  }

  for (const path of requiredTestDirs) {
    if (!hasPath(root, path)) {
      violations.push({ kind: "missing-test-dir", path, message: "Required test directory is missing." });
    }
  }

  for (const path of requiredToolDirs) {
    if (!hasPath(root, path)) {
      violations.push({ kind: "missing-tool-dir", path, message: "Required verification/build tool directory is missing." });
    }
  }

  const packageEntries = hasPath(root, "packages")
    ? readdirSync(join(root, "packages"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  for (const packageName of packageEntries) {
    if (!requiredPackages.includes(packageName as (typeof requiredPackages)[number])) {
      violations.push({ kind: "unknown-package", path: join("packages", packageName), message: "Package is outside the target repository structure." });
    }
  }

  const packageSourceFiles = walkSourceFiles(join(root, "packages"), root);
  for (const file of packageSourceFiles) {
    const lowerName = basename(file).toLowerCase();
    if (/(^|[-_.])(legacy|compat|compatibility|deprecated)([-_.]|$)/.test(lowerName)) {
      violations.push({
        kind: "deprecated-compatibility-wrapper",
        path: file,
        message: "Package source must not contain deprecated or compatibility wrapper files in the rebuild structure."
      });
    }
  }

  const rendererClassFiles = packageSourceFiles.filter((file) => sourceDeclaresClass(root, file, "Renderer"));
  if (rendererClassFiles.length !== 1 || rendererClassFiles[0] !== "packages/rendering/src/Renderer.ts") {
    violations.push({
      kind: "renderer-entry-point-count",
      path: "packages/rendering/src",
      message: `Expected exactly one canonical Renderer class in packages/rendering/src/Renderer.ts; found ${rendererClassFiles.join(", ") || "none"}.`
    });
  }
  const rendererExports = exportedRenderingEntries(root);
  if (rendererExports.length !== 1) {
    violations.push({
      kind: "renderer-public-export-count",
      path: "packages/rendering/src/index.ts",
      message: `Expected exactly one public Renderer export; found ${rendererExports.length}.`
    });
  }

  const shaderRegistryFiles = packageSourceFiles.filter((file) => /Shader(?:Registry|Library)\.ts$/.test(file));
  if (shaderRegistryFiles.length !== 1 || shaderRegistryFiles[0] !== "packages/rendering/src/ShaderLibrary.ts") {
    violations.push({
      kind: "shader-registry-count",
      path: "packages/rendering/src",
      message: `Expected ShaderLibrary.ts to be the only shader registry; found ${shaderRegistryFiles.join(", ") || "none"}.`
    });
  }

  const eventBusFiles = packageSourceFiles.filter((file) => sourceDeclaresClass(root, file, "EventBus"));
  if (eventBusFiles.length !== 1 || eventBusFiles[0] !== "packages/core/src/EventBus.ts") {
    violations.push({
      kind: "event-bus-count",
      path: "packages/core/src",
      message: `Expected EventBus.ts to be the only event bus owner; found ${eventBusFiles.join(", ") || "none"}.`
    });
  }

  const hierarchyFiles = packageSourceFiles.filter((file) => /(?:^|\/)(?:Transform)?Hierarchy\.ts$/.test(file));
  if (hierarchyFiles.length !== 1 || hierarchyFiles[0] !== "packages/scene/src/Hierarchy.ts") {
    violations.push({
      kind: "transform-hierarchy-owner-count",
      path: "packages/scene/src",
      message: `Expected Hierarchy.ts to be the only transform hierarchy owner; found ${hierarchyFiles.join(", ") || "none"}.`
    });
  }

  return {
    ok: violations.length === 0,
    checkedTopLevelPaths: requiredTopLevelPaths,
    checkedPackages: requiredPackages,
    publicPackages,
    privatePackages,
    checkedTestDirs: requiredTestDirs,
    checkedToolDirs: requiredToolDirs,
    requiredScripts,
    violations
  };
}

function writeReport(root: string, report: ArchitectureReport): void {
  const path = join(root, "tests", "reports", "architecture.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const rootArg = process.argv[2] === "--root" ? process.argv[3] : undefined;
  const root = rootArg ?? process.cwd();
  const report = verifyArchitecture(root);
  writeReport(root, report);
  if (!report.ok) {
    console.error(JSON.stringify(report.violations, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Architecture verification passed for ${report.checkedPackages.length} packages.`);
  }
}
