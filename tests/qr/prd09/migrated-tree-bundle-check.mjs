#!/usr/bin/env node
/*
 * Migrated-tree compile gate (PRD-09 09-MIG, issue #884).
 *
 * The `all-routes-shadow` job applies every migration patch set onto a main
 * worktree. This gate proves the result still compiles, per game route:
 *
 *  1. bundle: esbuild-bundles `apps/<route>/src/main.ts` (dynamic imports
 *     included). Package imports stay external (`packages: "external"`), so a
 *     missing relative file, a missing named export, or a syntax error fails.
 *  2. tsc (with `--base <dir>`): runs `tsc --noEmit --noResolve -p
 *     apps/<route>/tsconfig.json` on the migrated root and on the base root,
 *     and fails on any route-local error the base tree does not already have
 *     (line/column stripped), so pre-existing errors on main are not
 *     attributed to patches. See tscErrors() for the dropped artifact codes.
 *  3. createGame contract: `createGame({ scene })` must be function-valued —
 *     createGame calls `options.scene()` at mount, so a builder/snapshot value
 *     (the `createAuraApp` shape) throws at boot. `--noResolve` types package
 *     values as `any`, so this is checked syntactically. A `scenarios` value
 *     that is a function or an array is reported as a warning (createGame
 *     looks scenarios up by name, so such a registry never stages anything).
 *
 * usage:
 *   node tests/qr/prd09/migrated-tree-bundle-check.mjs
 *       [--root <dir>] [--base <dir>] [--routes <id,...>] [--json <out>]
 * Both roots need a `node_modules` (a symlink to the checkout's install works).
 * Exit code 1 when any route fails.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const ts = createRequire(join(repoRoot, "package.json"))("typescript");
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const root = resolve(opt("--root") ?? repoRoot);
const baseRoot = opt("--base") ? resolve(opt("--base")) : null;
const jsonOut = opt("--json");
const routeFilter = opt("--routes")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

const games = JSON.parse(readFileSync(join(repoRoot, "tools/quality-rebuild-capture/games.json"), "utf8"));
let routes = games.games.map((g) => g.id);
if (routeFilter) routes = routes.filter((r) => routeFilter.includes(r));

const assetLoaders = Object.fromEntries(
  [".css", ".glb", ".gltf", ".bin", ".png", ".jpg", ".jpeg", ".webp", ".ktx2", ".hdr", ".svg",
    ".wav", ".mp3", ".ogg", ".woff", ".woff2", ".wasm"].map((ext) => [ext, "empty"])
);
// Leave Vite query specifiers (`./x.png?url`, `./worker?worker`) to Vite.
const viteQueryExternal = {
  name: "vite-query-external",
  setup(b) {
    b.onResolve({ filter: /\?[a-z-]+$/ }, (a) => ({ path: a.path, external: true }));
  }
};

async function bundleErrors(treeRoot, route) {
  const appDir = join(treeRoot, "apps", route);
  const entry = join(appDir, "src/main.ts");
  if (!existsSync(entry)) return [`missing entry apps/${route}/src/main.ts`];
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      packages: "external",
      format: "esm",
      platform: "browser",
      target: "es2022",
      logLevel: "silent",
      tsconfig: existsSync(join(appDir, "tsconfig.json")) ? join(appDir, "tsconfig.json") : undefined,
      loader: assetLoaders,
      plugins: [viteQueryExternal]
    });
    return [];
  } catch (error) {
    return (error.errors ?? [{ text: String(error) }]).map((e) =>
      e.location ? `${relative(realpathSync(treeRoot), resolve(e.location.file))}:${e.location.line}: ${e.text}` : e.text
    );
  }
}

/** Route-local tsc errors, line/column stripped, de-duplicated. `--noResolve`
 * keeps the program to the route's own `src/**` (the tsconfig `include`), so
 * workspace packages are not type-checked (fast, no build needed). Dropped as
 * artifacts of that: unresolved-module errors (TS2307/TS2792) and implicit-any
 * errors (TS7xxx, package types read as `any`). Undeclared names, missing
 * local exports, TDZ use and syntax errors inside the route remain. */
function tscErrors(treeRoot, route) {
  const tsc = join(repoRoot, "node_modules/.bin/tsc");
  const res = spawnSync(tsc, ["--noEmit", "--skipLibCheck", "--noResolve", "-p", `apps/${route}/tsconfig.json`], {
    cwd: treeRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (res.error) throw res.error;
  const lines = `${res.stdout}\n${res.stderr}`.split("\n");
  return [...new Set(lines
    .filter((l) => l.startsWith(`apps/${route}/`) && /error TS\d+/.test(l) && !/error TS(2307|2792|7\d{3}):/.test(l))
    .map((l) => l.replace(/\(\d+,\d+\)/, "")))].sort();
}

function routeSources(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routeSources(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** createGame option-shape contract (see header, step 3). */
function contractFindings(treeRoot, route) {
  const errors = [];
  const warnings = [];
  for (const file of routeSources(join(treeRoot, "apps", route, "src"))) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("createGame(")) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    // File-local bindings: names declared as functions vs. other values.
    const fns = new Set();
    const values = new Set();
    const collect = (n) => {
      if (ts.isFunctionDeclaration(n) && n.name) fns.add(n.name.text);
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const init = n.initializer;
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init) ? fns : values).add(n.name.text);
      }
      ts.forEachChild(n, collect);
    };
    collect(sf);
    // Top-level lexical bindings (const/let/class) by declaration position, and
    // top-level function declarations, for the scene() TDZ walk below.
    const lexicalAt = new Map();
    const fnDecls = new Map();
    for (const st of sf.statements) {
      if (ts.isVariableStatement(st) && (st.declarationList.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let))) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) lexicalAt.set(d.name.text, st.getStart(sf));
      }
      if (ts.isClassDeclaration(st) && st.name) lexicalAt.set(st.name.text, st.getStart(sf));
      if (ts.isFunctionDeclaration(st) && st.name && st.body) fnDecls.set(st.name.text, st);
    }
    // Names a synchronous call of `node` reads, following top-level function
    // declarations it calls (createGame runs options.scene() during the call).
    const readsOf = (node, seen = new Set()) => {
      const out = new Set();
      const walk = (n) => {
        if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)
          && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) {
          out.add(n.text);
          const fn = fnDecls.get(n.text);
          if (fn && !seen.has(n.text)) { seen.add(n.text); for (const x of readsOf(fn.body, seen)) out.add(x); }
        }
        // Nested function bodies run later; only follow direct reads.
        if (n !== node && (ts.isArrowFunction(n) || ts.isFunctionExpression(n))) return;
        ts.forEachChild(n, walk);
      };
      walk(node);
      return out;
    };
    const topStatementStart = (n) => { let s = n; while (s.parent && !ts.isSourceFile(s.parent)) s = s.parent; return s.getStart(sf); };
    const at = (node) => `${relative(treeRoot, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "createGame"
        && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
        for (const p of n.arguments[0].properties) {
          if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
          const v = p.initializer;
          const isFn = ts.isArrowFunction(v) || ts.isFunctionExpression(v);
          if (p.name.text === "scene") {
            const ok = isFn || (ts.isIdentifier(v) && fns.has(v.text) && !values.has(v.text));
            if (!ok) errors.push(`${at(p)}: createGame scene must be a function (createGame calls options.scene())`);
            else {
              const callAt = topStatementStart(n);
              const body = isFn ? v.body : fnDecls.get(v.text)?.body;
              const late = body ? [...readsOf(body)].filter((name) => (lexicalAt.get(name) ?? -1) > callAt) : [];
              if (late.length) errors.push(`${at(p)}: createGame scene() reads ${late.join(", ")} before declaration (TDZ at mount)`);
            }
          }
          if (p.name.text === "scenarios" && (isFn || ts.isArrayLiteralExpression(v))) {
            warnings.push(`${at(p)}: createGame scenarios should be a name -> GameScenario record`);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { errors: errors.sort(), warnings: warnings.sort() };
}

const results = [];
for (const route of routes) {
  const bundle = await bundleErrors(root, route);
  let tscNew = [];
  if (baseRoot) {
    const before = new Set(tscErrors(baseRoot, route));
    tscNew = tscErrors(root, route).filter((e) => !before.has(e));
  }
  const contract = contractFindings(root, route);
  const ok = bundle.length === 0 && tscNew.length === 0 && contract.errors.length === 0;
  results.push({ route, ok, bundle, tscNew, contract: contract.errors, warnings: contract.warnings });
  console.log(`${ok ? "ok  " : "FAIL"} ${route}`);
  for (const e of bundle) console.log(`       bundle: ${e}`);
  for (const e of tscNew) console.log(`       tsc:    ${e}`);
  for (const e of contract.errors) console.log(`       api:    ${e}`);
  for (const e of contract.warnings) console.log(`       warn:   ${e}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} routes compile (root ${root}${baseRoot ? `, tsc vs ${baseRoot}` : ", bundle only"})`);
if (jsonOut) {
  mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
  writeFileSync(jsonOut, `${JSON.stringify({ root, base: baseRoot, results }, null, 2)}\n`);
}
process.exit(failed.length ? 1 : 0);
