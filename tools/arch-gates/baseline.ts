// Phase-0 architecture baseline (PRD-15 T0.1). Writes
// docs/project/aura3d-quality-rebuild/evidence/prd15/baselines/phase0.json with:
//   - exportCounts: exported-name count per root package.json export subpath,
//     counted with the TypeScript checker on the subpath's source entry
//   - subpathCount: number of export subpaths in /package.json
//   - scriptCount: Object.keys(scripts).length
//   - toolDirCount: directories under tools/
//   - orphanSourceMapCount: *.map files under packages/*/src
//   - agentApiIndexLines: packages/engine/src/agent-api/index.ts line count
// Existing phase0.json keys (IC-0 run ids, notes) are preserved; the metrics
// fields are replaced on each run.
// Run: pnpm exec tsx --tsconfig tsconfig.base.json tools/arch-gates/baseline.ts
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const PHASE0_RELATIVE = "docs/project/aura3d-quality-rebuild/evidence/prd15/baselines/phase0.json";
const AGENT_API_INDEX_RELATIVE = "packages/engine/src/agent-api/index.ts";
const ENGINE_INDEX_RELATIVE = "packages/engine/src/index.ts";

export interface BaselineMetrics {
  readonly exportCounts: Record<string, number | null>;
  // Names on the in-repo engine barrel (packages/engine/src/index.ts) — the
  // divergent surface PRD-15 §2.3 tracks against the published "." count.
  readonly engineIndexExportCount: number | null;
  readonly subpathCount: number;
  readonly scriptCount: number;
  readonly toolDirCount: number;
  readonly orphanSourceMapCount: number;
  readonly agentApiIndexLines: number;
}

interface ExportTargetShape {
  readonly import?: unknown;
  readonly default?: unknown;
  readonly browser?: unknown;
  readonly types?: unknown;
}

/** "./dist/<pkg>/<rest>.js" -> "packages/<pkg>/src/<rest>.ts" (dist layout from finalize-dist). */
export function subpathSourceFile(root: string, distSpecifier: string): string | null {
  const match = /^\.\/dist\/([^/]+)\/(.+)\.js$/.exec(distSpecifier);
  if (!match) return null;
  return join(root, "packages", match[1]!, "src", `${match[2]}.ts`);
}

function exportDistTarget(spec: unknown): string | null {
  if (typeof spec === "string") return spec;
  if (spec && typeof spec === "object") {
    const shape = spec as ExportTargetShape;
    for (const key of ["import", "default", "browser", "types"] as const) {
      const value = shape[key];
      if (typeof value === "string") return value;
    }
  }
  return null;
}

function countModuleExports(program: ts.Program, sourceFile: string): number | null {
  const source = program.getSourceFile(sourceFile);
  if (!source) return null;
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return null;
  return checker.getExportsOfModule(moduleSymbol).length;
}

function compilerOptionsFor(root: string): ts.CompilerOptions {
  const configPath = join(root, "tsconfig.base.json");
  if (!existsSync(configPath)) return { strict: true, skipLibCheck: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
  const parsed = ts.readConfigFile(configPath, ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(parsed.config ?? {}, ts.sys, root).options;
  return { ...options, noEmit: true, types: [] };
}

function countFiles(dir: string, predicate: (name: string) => boolean): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(path, predicate);
    else if (predicate(entry.name)) count += 1;
  }
  return count;
}

export function collectBaselineMetrics(root: string): BaselineMetrics {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
    scripts?: Record<string, string>;
  };
  const exportsMap = pkg.exports ?? {};
  const subpaths = Object.keys(exportsMap).sort();
  const entries = subpaths.map((subpath) => {
    const target = exportDistTarget(exportsMap[subpath]);
    return { subpath, file: target ? subpathSourceFile(root, target) : null };
  });
  const engineIndex = join(root, ENGINE_INDEX_RELATIVE);
  const rootFiles = entries.map((entry) => entry.file).filter((file): file is string => file !== null && existsSync(file));
  if (existsSync(engineIndex)) rootFiles.push(engineIndex);
  const program = ts.createProgram(rootFiles, compilerOptionsFor(root));
  const exportCounts: Record<string, number | null> = {};
  for (const entry of entries) {
    exportCounts[entry.subpath] = entry.file && existsSync(entry.file) ? countModuleExports(program, entry.file) : null;
  }
  const engineIndexExportCount = existsSync(engineIndex) ? countModuleExports(program, engineIndex) : null;
  const packagesDir = join(root, "packages");
  const orphanSourceMapCount = existsSync(packagesDir)
    ? readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .reduce((sum, entry) => sum + countFiles(join(packagesDir, entry.name, "src"), (name) => name.endsWith(".map")), 0)
    : 0;
  const toolsDir = join(root, "tools");
  const toolDirCount = existsSync(toolsDir)
    ? readdirSync(toolsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).length
    : 0;
  const agentApiIndex = join(root, AGENT_API_INDEX_RELATIVE);
  const agentApiIndexLines = existsSync(agentApiIndex) ? readFileSync(agentApiIndex, "utf8").split("\n").length : 0;
  return {
    exportCounts,
    engineIndexExportCount,
    subpathCount: subpaths.length,
    scriptCount: Object.keys(pkg.scripts ?? {}).length,
    toolDirCount,
    orphanSourceMapCount,
    agentApiIndexLines
  };
}

export function writePhase0Baseline(root: string, metrics: BaselineMetrics): string {
  const path = join(root, PHASE0_RELATIVE);
  const existing = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) : {};
  const next = {
    ...existing,
    exportCounts: metrics.exportCounts,
    engineIndexExportCount: metrics.engineIndexExportCount,
    subpathCount: metrics.subpathCount,
    scriptCount: metrics.scriptCount,
    toolDirCount: metrics.toolDirCount,
    orphanSourceMapCount: metrics.orphanSourceMapCount,
    agentApiIndexLines: metrics.agentApiIndexLines,
    metricsGeneratedUtc: new Date().toISOString()
  };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return path;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("baseline.ts")) {
  const root = process.cwd();
  const path = writePhase0Baseline(root, collectBaselineMetrics(root));
  console.log(`wrote ${path}`);
}
