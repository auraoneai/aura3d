// deps-truth (PRD-15 T6.11, research/13 §9): declared workspace dependencies in
// each package manifest must match the package directories the package's src/
// actually imports — `@aura3d/*` specifiers (resolved through the generated
// tsconfig paths map) plus cross-package relative escapes. `@aura3d/engine`
// names the ROOT product package and also satisfies a dep on packages/engine.
// Manifests owned by lane 15 fail loudly; the rest report as warnings and are
// forwarded to Q-ALL-1 with per-package diffs.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import type { GateFinding } from "../index";
import { ownerOf } from "./shared";

// Statement-position matches only: specifier strings inside codemod payloads
// (e.g. `code.replace(..., \`from "@aura3d/engine"\`)`) are not real imports.
const SPEC_PATTERNS = [
  /(?:^|[;{}\n])\s*(?:import|export)\s+[^"'\`]{0,400}?from\s*["'`]([^"'`]+)["'`]/gm,
  /(?:^|[;{}\n])\s*import\s*["'`]([^"'`]+)["'`]/gm,
  /import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  /require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g
];

interface PackageManifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

const TS_EXT = /\.tsx?$/;
const ROOT_SCAN_DIRS = ["tools", "tests", "benchmarks", "apps", "scripts"];
const ROOT_FILE_EXTS = /\.(?:tsx?|mts|cts|mjs|cjs)$/;
const ROOT_DIR = "<root>";

function listFiles(dir: string, out: string[] = [], exts = TS_EXT): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out, exts);
    else if (exts.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Specifiers a source file imports, verbatim. */
function specifiersIn(file: string): string[] {
  // Strip block comments and full-line // comments (both can contain example
  // import statements, e.g. codemod JSDoc); inline // stays so string literals
  // like "http://" are never corrupted.
  const src = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/^\s*\/\/[^\n]*/gm, "");
  const specs: string[] = [];
  for (const re of SPEC_PATTERNS) {
    for (const m of src.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

/** Package dir a specifier resolves to, via the generated paths map. */
function resolveSpecifierDir(spec: string, paths: ReadonlyMap<string, string>): string | null {
  // Longest concrete prefix wins; entries without a wildcard match literally.
  let best: string | null = null;
  let bestLen = -1;
  for (const [pattern, target] of paths) {
    const concrete = pattern.endsWith("/*") ? pattern.slice(0, -1) : pattern;
    if (!spec.startsWith(concrete)) continue;
    if (concrete.length <= bestLen) continue;
    const m = /^packages\/([^/]+)\//.exec(target);
    if (m) {
      best = m[1];
      bestLen = concrete.length;
    }
  }
  return best;
}

function readManifest(root: string, manifestPath: string): PackageManifest | null {
  try {
    return JSON.parse(readFileSync(join(root, manifestPath), "utf8")) as PackageManifest;
  } catch {
    return null;
  }
}

function declaredDeps(manifest: PackageManifest): Set<string> {
  const declared = new Set<string>();
  for (const key of ["dependencies", "peerDependencies", "devDependencies"] as const) {
    for (const dep of Object.keys(manifest[key] ?? {})) declared.add(dep);
  }
  return declared;
}

interface PackageInfo {
  readonly dir: string;
  readonly manifestPath: string;
  readonly manifest: PackageManifest;
}

function importedDirs(
  root: string,
  files: readonly string[],
  paths: ReadonlyMap<string, string>,
  ownManifestPath: string
): Set<string> {
  const imported = new Set<string>();
  const ownDir = ownManifestPath === "package.json" ? ROOT_DIR : ownManifestPath.split("/")[1];
  for (const file of files) {
    for (const spec of specifiersIn(file)) {
      const dir = resolveSpecifierDir(spec, paths);
      if (dir) {
        if (dir !== ownDir) imported.add(dir);
        continue;
      }
      if (spec.startsWith(".")) {
        const resolved = normalize(join(file.slice(0, file.lastIndexOf("/")), spec));
        if (!resolved.startsWith(root + "/")) continue;
        const rel = resolved.slice(root.length + 1);
        const m = /^packages\/([^/]+)\//.exec(rel);
        if (m && m[1] !== ownDir) imported.add(m[1]);
      }
    }
  }
  return imported;
}

export function checkDepsTruth(root: string): GateFinding[] {
  const findings: GateFinding[] = [];

  // Generated tsconfig paths = the resolution truth for @aura3d/* specifiers.
  const paths = new Map<string, string>();
  const pathsFile = join(root, "tsconfig.paths.generated.json");
  if (existsSync(pathsFile)) {
    const raw = JSON.parse(readFileSync(pathsFile, "utf8")) as {
      paths?: Record<string, string[]>;
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    const table = raw.paths ?? raw.compilerOptions?.paths ?? {};
    for (const [spec, targets] of Object.entries(table)) {
      const target = targets?.[0];
      if (typeof target === "string") paths.set(spec, target.replace(/^\.\//, ""));
    }
  }

  const infos = new Map<string, PackageInfo>(); // dir -> info
  for (const entry of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    const manifestPath = `packages/${entry.name}/package.json`;
    const manifest = readManifest(root, manifestPath);
    if (manifest?.name) infos.set(entry.name, { dir: entry.name, manifestPath, manifest });
  }
  const rootManifest = readManifest(root, "package.json");
  const rootName = rootManifest?.name ?? "@aura3d/engine";

  // Dep name -> dir. `@aura3d/engine` (the root product) satisfies the engine dir.
  const depNameToDir = new Map<string, string>();
  for (const [dir, info] of infos) {
    if (info.manifest.name) depNameToDir.set(info.manifest.name, dir);
  }
  depNameToDir.set(rootName, "engine"); // root product = the engine package

  /** Acceptable dep names for a dir (manifest name, plus the engine product name). */
  function acceptableDepNames(dir: string): string[] {
    const names = [infos.get(dir)?.manifest.name ?? `@aura3d/${dir}`];
    if (dir === "engine") names.push(rootName);
    return names;
  }

  const scans: { manifestPath: string; manifest: PackageManifest; files: string[]; ownDir: string }[] = [];
  for (const [dir, info] of infos) {
    scans.push({
      manifestPath: info.manifestPath,
      manifest: info.manifest,
      files: listFiles(join(root, "packages", dir, "src")),
      ownDir: dir
    });
  }
  if (rootManifest) {
    const files: string[] = [];
    for (const dir of ROOT_SCAN_DIRS) listFiles(join(root, dir), files, ROOT_FILE_EXTS);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && ROOT_FILE_EXTS.test(entry.name)) files.push(join(root, entry.name));
    }
    scans.push({ manifestPath: "package.json", manifest: rootManifest, files, ownDir: ROOT_DIR });
  }

  for (const scan of scans) {
    const enforced = ownerOf(root, scan.manifestPath) === "15";
    const imported = importedDirs(root, scan.files, paths, scan.manifestPath);
    const declared = declaredDeps(scan.manifest);

    const declaredDirs = new Map<string, string>(); // dir -> dep name used
    for (const dep of declared) {
      const dir = depNameToDir.get(dep);
      if (dir && dir !== scan.ownDir) declaredDirs.set(dir, dep);
    }

    for (const dir of [...imported].sort()) {
      if (declaredDirs.has(dir)) continue;
      findings.push({
        file: scan.manifestPath,
        detail: `missing-dependency: src/ imports packages/${dir}; declare ${acceptableDepNames(dir).join(" or ")}`,
        enforced,
        rule: "deps-truth"
      });
    }
    for (const [dir, dep] of [...declaredDirs.entries()].sort()) {
      if (imported.has(dir)) continue;
      findings.push({
        file: scan.manifestPath,
        detail: `unused-dependency: manifest declares ${dep} but src/ never imports packages/${dir}`,
        enforced,
        rule: "deps-truth"
      });
    }
    for (const dep of [...declared].sort()) {
      if (!dep.startsWith("@aura3d/") && dep !== "create-aura3d") continue;
      if (depNameToDir.has(dep)) continue;
      findings.push({
        file: scan.manifestPath,
        detail: `unknown-dependency: manifest declares ${dep}, which is not a workspace package`,
        enforced,
        rule: "deps-truth"
      });
    }
  }
  return findings;
}
