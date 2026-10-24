#!/usr/bin/env node
// Install-and-build smoke for the PACKED @aura3d tarballs.
//
// Why: `exact-package-smoke.mjs` only `import()`s entrypoints under Node, where `node:fs` exists, so it
// cannot see a Node-only module that is statically reachable from the browser entry. A stock `vite build`
// of the published 4.1.2 engine failed on exactly that, and nothing in the gates noticed.
//
// What it does, for each template plus a config-less `createAuraApp` hello-world:
//   1. copies the template into a fresh temp project OUTSIDE the repo,
//   2. installs the packed tarballs (package.json deps + `overrides` point at the .tgz files),
//   3. walks the static import graph from the engine browser entry and fails on any reachable `node:*` import,
//   4. runs a stock `vite build` (default target, no extra plugin) and records raw/gzip JS+CSS sizes,
//   5. starts `vite dev` and transforms the entry module, failing on any logged error.
//
// Usage (offline once the npm cache holds vite and its dependencies):
//   node tools/release/publish-all.mjs --pack-only
//   node tools/release/consumer-build-smoke.mjs [--tarballs DIR] [--templates a,b] [--out FILE] [--keep]
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DEFAULT_TEMPLATES = ["mini-game", "racing-starter", "falling-blocks-starter", "product-viewer"];
const HELLO = "hello-world";
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g;

/** Static import graph walk over built ESM; returns [{ chain, builtins }] for every module that imports `node:*`. */
export function findNodeBuiltinImports(distRoot, entryRelative) {
  const entry = resolve(distRoot, entryRelative);
  const parents = new Map();
  const queue = [[entry, null]];
  const hits = [];
  while (queue.length) {
    const [file, parent] = queue.shift();
    if (parents.has(file)) continue;
    parents.set(file, parent);
    if (!existsSync(file)) continue;
    const builtins = [];
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
      const specifier = match[1];
      if (specifier.startsWith("node:")) builtins.push(specifier);
      else if (specifier.startsWith(".")) {
        let target = resolve(dirname(file), specifier);
        if (!/\.[cm]?js$/.test(target)) target += existsSync(`${target}.js`) ? ".js" : "/index.js";
        queue.push([target, file]);
      }
    }
    if (builtins.length) hits.push({ file, builtins });
  }
  const chain = (file) => {
    const out = [];
    for (let f = file; f; f = parents.get(f)) out.push(f.slice(distRoot.length + 1));
    return out.reverse();
  };
  return hits.map(({ file, builtins }) => ({ chain: chain(file), builtins }));
}

function sizes(dir) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(js|css)$/.test(entry)) files.push(path);
    }
  };
  visit(dir);
  let raw = 0, gzip = 0, largest = 0;
  for (const file of files) {
    const bytes = readFileSync(file);
    raw += bytes.length;
    gzip += gzipSync(bytes, { level: 9 }).length;
    largest = Math.max(largest, bytes.length);
  }
  return { files: files.length, raw, gzip, largest };
}

function tarballIndex(dir) {
  const index = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".tgz")) continue;
    const path = join(dir, name);
    const manifest = JSON.parse(execFileSync("tar", ["-xOzf", path, "package/package.json"], { encoding: "utf8" }));
    index.set(manifest.name, { path, version: manifest.version });
  }
  return index;
}

const HELLO_FILES = {
  "package.json": { name: "aura3d-hello-world", version: "0.0.0", private: true, type: "module", dependencies: { "@aura3d/engine": "*" }, devDependencies: { vite: "^7.3.2" } },
  "index.html": '<!doctype html><html><body><div id="app"></div><script type="module" src="./src/main.ts"></script></body></html>\n',
  "src/main.ts": 'import { camera, createAuraApp, lights, primitives, material, scene } from "@aura3d/engine";\n\ncreateAuraApp("#app", {\n  scene: scene({ background: "#07080a" })\n    .add(primitives.box({ material: material.standard({ color: "#4ade9d" }) }))\n    .add(lights.studio())\n    .camera(camera.orbit({ distance: 4, target: [0, 0, 0] }))\n});\n'
};

function stageProject(name, tarballs, workRoot) {
  const project = join(workRoot, name);
  if (name === HELLO) {
    for (const [file, content] of Object.entries(HELLO_FILES)) {
      mkdirSync(dirname(join(project, file)), { recursive: true });
      writeFileSync(join(project, file), typeof content === "string" ? content : JSON.stringify(content, null, 2));
    }
  } else {
    const source = join(ROOT, "packages", "create-aura3d", "templates", name);
    if (!existsSync(source)) throw new Error(`Unknown template ${name}`);
    cpSync(source, project, { recursive: true, filter: (path) => !/[\\/](node_modules|dist)([\\/]|$)/.test(path.slice(source.length)) });
  }
  const manifestPath = join(project, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const overrides = {};
  for (const [pkg, { path }] of tarballs) overrides[pkg] = `file:${path}`;
  for (const section of ["dependencies", "devDependencies"]) {
    for (const dep of Object.keys(manifest[section] ?? {})) if (tarballs.has(dep)) manifest[section][dep] = overrides[dep];
  }
  manifest.overrides = { ...(manifest.overrides ?? {}), ...overrides };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return project;
}

async function devServerCheck(project) {
  const { createServer } = await import(pathToFileURL(join(project, "node_modules", "vite", "dist", "node", "index.js")).href);
  const errors = [];
  const logger = { hasWarned: false, info() {}, warn() {}, warnOnce() {}, error: (message) => errors.push(String(message)), clearScreen() {}, hasErrorLogged: () => false };
  const server = await createServer({ root: project, customLogger: logger, logLevel: "error", configFile: existsSync(join(project, "vite.config.ts")) ? join(project, "vite.config.ts") : false, server: { port: 0, host: "127.0.0.1" }, clearScreen: false });
  try {
    await server.listen();
    const base = server.resolvedUrls?.local?.[0];
    const html = await (await fetch(base)).text();
    if (!html.includes("src/main.ts")) errors.push("dev index.html did not reference src/main.ts");
    const transformed = await server.transformRequest("/src/main.ts");
    if (!transformed?.code) errors.push("dev transform of /src/main.ts returned no code");
    const engine = await server.transformRequest("@aura3d/engine").catch((error) => { errors.push(`dev transform of @aura3d/engine failed: ${error.message}`); return null; });
    void engine;
  } finally {
    await server.close();
  }
  return errors;
}

export async function runConsumerBuildSmoke(options = {}) {
  const tarballDir = resolve(ROOT, options.tarballs ?? "tests/reports/release-tarballs");
  if (!existsSync(tarballDir)) throw new Error(`No tarballs at ${tarballDir}. Run: node tools/release/publish-all.mjs --pack-only`);
  const tarballs = tarballIndex(tarballDir);
  if (!tarballs.has("@aura3d/engine")) throw new Error(`@aura3d/engine tarball missing from ${tarballDir}`);
  const workRoot = mkdtempSync(join(tmpdir(), "aura3d-consumer-build-"));
  const results = [];
  try {
    for (const name of options.templates ?? [...DEFAULT_TEMPLATES, HELLO]) {
      const result = { name, ok: false, problems: [] };
      results.push(result);
      try {
        const project = stageProject(name, tarballs, workRoot);
        const env = { ...process.env, npm_config_audit: "false", npm_config_fund: "false", npm_config_prefer_offline: "true" };
        execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: project, env, stdio: "pipe", timeout: 600000 });
        const engineDist = join(project, "node_modules", "@aura3d", "engine", "dist");
        for (const hit of findNodeBuiltinImports(engineDist, "engine/public/index.js")) result.problems.push(`browser entry reaches ${hit.builtins.join(",")} via ${hit.chain.join(" -> ")}`);
        try {
          const out = execFileSync(join(project, "node_modules", ".bin", "vite"), ["build"], { cwd: project, env, encoding: "utf8", stdio: "pipe", timeout: 600000 });
          if (/__vite-browser-external|is not exported by/.test(out)) result.problems.push("vite build output mentions a browser-externalized module");
          result.build = sizes(join(project, "dist"));
        } catch (error) {
          result.problems.push(`vite build failed: ${String(error.stderr || error.message).split("\n").filter(Boolean).slice(0, 4).join(" | ")}`);
        }
        for (const message of await devServerCheck(project)) result.problems.push(`vite dev: ${message.split("\n")[0]}`);
      } catch (error) {
        result.problems.push(String(error.stderr || error.message).split("\n").slice(0, 3).join(" | "));
      }
      result.ok = result.problems.length === 0;
    }
  } finally {
    if (!options.keep) rmSync(workRoot, { recursive: true, force: true });
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const results = await runConsumerBuildSmoke({ tarballs: value("--tarballs"), templates: value("--templates")?.split(","), keep: args.includes("--keep") });
  for (const r of results) {
    const size = r.build ? ` raw ${(r.build.raw / 1024).toFixed(0)} kB, gzip ${(r.build.gzip / 1024).toFixed(0)} kB, largest chunk ${(r.build.largest / 1024).toFixed(0)} kB` : "";
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${size}`);
    for (const problem of r.problems) console.log(`  - ${problem}`);
  }
  if (value("--out")) writeFileSync(resolve(ROOT, value("--out")), `${JSON.stringify(results, null, 2)}\n`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
