import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

interface RootPackageJson {
  name?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
}

export interface ImportSmokeEntry {
  readonly subpath: string;
  readonly specifier: string;
  readonly ok: boolean;
  readonly exportCount?: number;
  readonly error?: string;
}

export interface ImportSmokeReport {
  readonly ok: boolean;
  readonly packageName: string;
  readonly checkedSubpaths: number;
  readonly entries: readonly ImportSmokeEntry[];
  readonly workspaceDependencies: readonly WorkspaceDependencyEntry[];
}

export interface WorkspaceDependencyEntry {
  readonly packageName: string;
  readonly ok: boolean;
  readonly importedPackages: readonly string[];
  readonly declaredRuntimePackages: readonly string[];
  readonly missingRuntimeDependencies: readonly string[];
}

function readRootManifest(root: string): RootPackageJson {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as RootPackageJson;
}

function resolveExportTarget(root: string, target: unknown): string | undefined {
  if (typeof target === "string") return join(root, target);
  if (typeof target === "object" && target !== null) {
    const record = target as Record<string, unknown>;
    if (typeof record.import === "string") return join(root, record.import);
    if (typeof record.default === "string") return join(root, record.default);
  }
  return undefined;
}

export async function verifyPublicImports(root = process.cwd()): Promise<ImportSmokeReport> {
  const manifest = readRootManifest(root);
  const packageName = manifest.name ?? "@galileo3d/engine";
  const exportsMap = manifest.exports ?? {};
  const entries: ImportSmokeEntry[] = [];
  const workspaceDependencies = verifyWorkspaceRuntimeDependencies(root);

  for (const subpath of Object.keys(exportsMap).sort()) {
    const target = resolveExportTarget(root, exportsMap[subpath]);
    const specifier = subpath === "." ? packageName : `${packageName}${subpath.slice(1)}`;
    if (!target) {
      entries.push({ subpath, specifier, ok: false, error: "Export target is not an importable string target." });
      continue;
    }
    if (!existsSync(target)) {
      entries.push({ subpath, specifier, ok: false, error: `Export target does not exist: ${target}` });
      continue;
    }

    try {
      const moduleExports = await import(pathToFileURL(target).href);
      entries.push({ subpath, specifier, ok: true, exportCount: Object.keys(moduleExports as Record<string, unknown>).length });
    } catch (error) {
      entries.push({
        subpath,
        specifier,
        ok: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
    }
  }

  return {
    ok: entries.every((entry) => entry.ok) && workspaceDependencies.every((entry) => entry.ok),
    packageName,
    checkedSubpaths: entries.length,
    entries,
    workspaceDependencies
  };
}

function verifyWorkspaceRuntimeDependencies(root: string): readonly WorkspaceDependencyEntry[] {
  const packagesRoot = join(root, "packages");
  if (!existsSync(packagesRoot)) return [];
  const entries: WorkspaceDependencyEntry[] = [];
  for (const directory of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const packageRoot = join(packagesRoot, directory.name);
    const manifestPath = join(packageRoot, "package.json");
    const sourceRoot = join(packageRoot, "src");
    if (!existsSync(manifestPath) || !existsSync(sourceRoot)) continue;
    const packageManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RootPackageJson;
    const importedPackages = [...scanWorkspaceImports(sourceRoot)]
      .filter((specifier) => specifier !== packageManifest.name)
      .sort();
    const declaredRuntimePackages = Object.keys({
      ...(packageManifest.dependencies ?? {}),
      ...(packageManifest.peerDependencies ?? {}),
      ...(packageManifest.optionalDependencies ?? {})
    }).sort();
    const declared = new Set(declaredRuntimePackages);
    const missingRuntimeDependencies = importedPackages.filter((specifier) => !declared.has(specifier));
    entries.push({
      packageName: packageManifest.name ?? directory.name,
      ok: missingRuntimeDependencies.length === 0,
      importedPackages,
      declaredRuntimePackages,
      missingRuntimeDependencies
    });
  }
  return entries;
}

function scanWorkspaceImports(sourceRoot: string): ReadonlySet<string> {
  const imports = new Set<string>();
  for (const path of listTypeScriptFiles(sourceRoot)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](@galileo3d\/[^/"']+)/g)) {
      const specifier = match[1];
      if (specifier) imports.add(specifier);
    }
  }
  return imports;
}

function listTypeScriptFiles(root: string): readonly string[] {
  const output: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...listTypeScriptFiles(path));
    } else if (entry.isFile() && path.endsWith(".ts")) {
      output.push(path);
    }
  }
  return output;
}

function writeReport(root: string, report: ImportSmokeReport): void {
  const path = join(root, "tests", "reports", "import-smoke.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const rootArg = process.argv[2] === "--root" ? process.argv[3] : undefined;
  const root = rootArg ?? process.cwd();
  const report = await verifyPublicImports(root);
  writeReport(root, report);
  if (!report.ok) {
    console.error(JSON.stringify({
      failedImports: report.entries.filter((entry) => !entry.ok),
      failedWorkspaceDependencies: report.workspaceDependencies.filter((entry) => !entry.ok)
    }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Import smoke verification passed for ${report.checkedSubpaths} public subpaths and ${report.workspaceDependencies.length} workspace package manifests.`);
  }
}
