import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageOrder = [
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
  "debug",
  "test-utils"
] as const;

type PackageName = (typeof packageOrder)[number];

const allowedImports: Record<PackageName, readonly PackageName[]> = {
  math: [],
  core: ["math"],
  scene: ["core", "math"],
  ecs: ["core", "math"],
  rendering: ["core", "math", "scene"],
  physics: ["core", "math", "scene", "ecs"],
  animation: ["core", "math", "scene", "ecs"],
  assets: ["core", "math", "scene", "rendering", "animation", "audio"],
  input: ["core", "math", "scene"],
  audio: ["core", "math", "scene"],
  scripting: ["core", "math", "scene", "ecs"],
  "editor-runtime": ["core", "math", "scene", "ecs", "rendering", "physics", "animation", "assets", "input", "audio", "scripting"],
  editor: ["editor-runtime"],
  debug: ["core", "math", "scene", "ecs", "rendering", "physics", "animation", "assets", "input", "audio", "scripting", "editor-runtime", "editor"],
  "test-utils": ["core", "math", "scene", "ecs", "rendering", "physics", "animation", "assets", "input", "audio", "scripting", "editor-runtime", "editor", "debug"]
};

export interface BoundaryViolation {
  file: string;
  importer: string;
  specifier: string;
  message: string;
}

export interface BoundaryReport {
  ok: boolean;
  checkedFiles: number;
  violations: BoundaryViolation[];
}

const importPattern = /\bimport(?:\s+type)?(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']|\bexport(?:\s+type)?[\s\S]*?\sfrom\s*["']([^"']+)["']/g;

function walkTsFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (entry !== "node_modules" && entry !== "dist") walkTsFiles(path, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

function packageFromFile(root: string, file: string): PackageName | undefined {
  const parts = relative(root, file).split(sep);
  if (parts[0] !== "packages") return undefined;
  return packageOrder.includes(parts[1] as PackageName) ? (parts[1] as PackageName) : undefined;
}

function packageRootFromFile(root: string, file: string): string | undefined {
  const parts = relative(root, file).split(sep);
  if (parts[0] !== "packages" || !parts[1]) return undefined;
  return join(root, "packages", parts[1]);
}

function packageFromSpecifier(specifier: string): PackageName | undefined {
  const match = /^@galileo3d\/([^/]+)/.exec(specifier);
  if (!match) return undefined;
  return packageOrder.includes(match[1] as PackageName) ? (match[1] as PackageName) : undefined;
}

function collectImports(source: string): string[] {
  const imports: string[] = [];
  importPattern.lastIndex = 0;
  for (let match = importPattern.exec(source); match; match = importPattern.exec(source)) {
    imports.push(match[1] ?? match[2] ?? "");
  }
  return imports.filter(Boolean);
}

function findCycle(graph: Map<PackageName, Set<PackageName>>): PackageName[] | undefined {
  const visiting = new Set<PackageName>();
  const visited = new Set<PackageName>();
  const stack: PackageName[] = [];

  const visit = (node: PackageName): PackageName[] | undefined => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (visited.has(node)) return undefined;

    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return undefined;
  };

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return undefined;
}

export function verifyBoundaries(root = process.cwd()): BoundaryReport {
  const files = walkTsFiles(join(root, "packages"));
  const violations: BoundaryViolation[] = [];
  const graph = new Map<PackageName, Set<PackageName>>();

  for (const file of files) {
    const importer = packageFromFile(root, file);
    if (!importer) continue;
    graph.set(importer, graph.get(importer) ?? new Set<PackageName>());

    const source = readFileSync(file, "utf8");
    for (const specifier of collectImports(source)) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const resolvedImport = resolve(dirname(file), specifier);
        const importedPackage = packageFromFile(root, resolvedImport);
        if (importedPackage && importedPackage !== importer) {
          violations.push({
            file,
            importer,
            specifier,
            message: "Relative imports across package boundaries are forbidden; import the public package barrel."
          });
        } else if (!resolvedImport.startsWith(packageRootFromFile(root, file) ?? dirname(file))) {
          violations.push({
            file,
            importer,
            specifier,
            message: "Relative imports may not leave their owning package."
          });
        }
        continue;
      }

      const importedPackage = packageFromSpecifier(specifier);
      if (!importedPackage) continue;

      if (/^@galileo3d\/[^/]+\/.+/.test(specifier)) {
        violations.push({
          file,
          importer,
          specifier,
          message: "Private deep package imports are forbidden; import the public package barrel."
        });
        continue;
      }

      if (importedPackage !== importer) {
        graph.get(importer)?.add(importedPackage);
        if (!allowedImports[importer].includes(importedPackage)) {
          violations.push({
            file,
            importer,
            specifier,
            message: `${importer} may not import ${importedPackage}.`
          });
        }
      }
    }
  }

  const cycle = findCycle(graph);
  if (cycle) {
    violations.push({
      file: root,
      importer: cycle[0] ?? "unknown",
      specifier: cycle.join(" -> "),
      message: "Package dependency cycle detected."
    });
  }

  return { ok: violations.length === 0, checkedFiles: files.length, violations };
}

function writeReport(root: string, report: BoundaryReport): void {
  const path = join(root, "tests", "reports", "boundaries.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const rootArg = process.argv[2] === "--root" ? process.argv[3] : undefined;
  const root = rootArg ?? process.cwd();
  const report = verifyBoundaries(root);
  writeReport(root, report);
  if (!report.ok) {
    console.error(JSON.stringify(report.violations, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Boundary verification passed for ${report.checkedFiles} files.`);
  }
}
