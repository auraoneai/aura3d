import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// The one deliberate top-level await: the default solver initialisation, so `app.physics` and `new PhysicsWorld()` are live
// synchronously. Bundlers that cannot emit top-level await select `rapierInit.lazy.js` through the `aura3d-no-tla` condition.
export const ALLOWED_TOP_LEVEL_AWAIT: readonly RegExp[] = [/(^|\/)physics-rapier\/(dist\/)?rapierInit\.js$/];

export interface TopLevelAwait {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

// A top-level `await` makes a module async. esbuild (and other bundlers) cannot always hoist that out of
// an import cycle, so consumers bundling a published package can end up with `await` inside a non-async
// wrapper ("Unexpected reserved word"). Published dist must therefore contain none.
export function findTopLevelAwait(source: string, fileName = "module.js"): TopLevelAwait[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const found: TopLevelAwait[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node)) return;
    const isAwait = ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier !== undefined);
    if (isAwait) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      found.push({ file: fileName, line: line + 1, column: character + 1, text: node.getText(sf).slice(0, 80) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(m?js)$/.test(name)) out.push(full);
  }
}

export function scanPackageDist(packageDir: string): TopLevelAwait[] {
  const dist = join(packageDir, "dist");
  if (!existsSync(dist)) return [];
  const files: string[] = [];
  walk(dist, files);
  const results: TopLevelAwait[] = [];
  for (const file of files) {
    for (const hit of findTopLevelAwait(readFileSync(file, "utf8"), relative(packageDir, file))) {
      results.push({ ...hit, file: `${packageDir.split("/").pop()}/${hit.file}` });
    }
  }
  return results;
}

export function verifyNoTopLevelAwait(root = process.cwd()): { ok: boolean; checkedPackages: number; hits: TopLevelAwait[] } {
  const packagesDir = resolve(root, "packages");
  const hits: TopLevelAwait[] = [];
  let checkedPackages = 0;
  const rootDist = resolve(root, "dist");
  if (existsSync(rootDist)) {
    // Scan what the root tarball ships (package.json#files), not tsc's intermediate dist/packages tree.
    const rootPkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { files?: string[] };
    const shipped = (rootPkg.files ?? []).filter((entry) => entry.startsWith("dist/")).map((entry) => resolve(root, entry));
    const files: string[] = [];
    for (const entry of shipped) {
      if (!existsSync(entry)) continue;
      if (statSync(entry).isDirectory()) walk(entry, files);
      else if (/\.(m?js)$/.test(entry)) files.push(entry);
    }
    checkedPackages += 1;
    for (const file of files) hits.push(...findTopLevelAwait(readFileSync(file, "utf8"), `dist/${relative(rootDist, file)}`));
  }
  for (const name of readdirSync(packagesDir)) {
    const dir = join(packagesDir, name);
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { private?: boolean };
    if (pkg.private === true) continue;
    if (!existsSync(join(dir, "dist"))) continue;
    checkedPackages += 1;
    hits.push(...scanPackageDist(dir));
  }
  const unexpected = hits.filter((hit) => !ALLOWED_TOP_LEVEL_AWAIT.some((allowed) => allowed.test(hit.file)));
  return { ok: unexpected.length === 0, checkedPackages, hits: unexpected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dirs = process.argv.slice(2);
  const report = dirs.length > 0
    ? (() => {
        const hits = dirs.flatMap((d) => scanPackageDist(resolve(d))).filter((hit) => !ALLOWED_TOP_LEVEL_AWAIT.some((allowed) => allowed.test(hit.file)));
        return { ok: hits.length === 0, checkedPackages: dirs.length, hits };
      })()
    : verifyNoTopLevelAwait();
  for (const hit of report.hits) console.error(`top-level await: ${hit.file}:${hit.line}:${hit.column}  ${hit.text}`);
  console.log(`verify-no-tla: ${report.ok ? "OK" : "FAIL"} (${report.checkedPackages} package dist(s) scanned, ${report.hits.length} top-level await(s))`);
  process.exit(report.ok ? 0 : 1);
}
