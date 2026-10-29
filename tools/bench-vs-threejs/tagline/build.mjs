#!/usr/bin/env node
/* Tagline check: scaffold create-aura3d@AURA (product-viewer, the default), swap in the llms.txt hello world, and build
   it with the stock scaffold config; build two matched three.js apps from the same GLB and HDRI; also rebuild the
   18-line bench cube (baseline/aura/scene.ts) against the same Aura3D version. Records lines and bundle bytes.
   Usage: node build.mjs <taglineDir> <benchRoot> <workDir>. Runs on the remote runner (needs npm registry access). */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const [tagline, benchRoot, work] = process.argv.slice(2);
if (!tagline || !benchRoot || !work) throw new Error("usage: build.mjs <taglineDir> <benchRoot> <workDir>");
const AURA = process.env.TAGLINE_AURA_VERSION ?? "4.5.0";
const THREE = "0.185.1";
const VITE = "7.3.2";
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  return { ok: r.status === 0, status: r.status, out: out.slice(-4000) };
};
const must = (res, what) => { if (!res.ok) throw new Error(`${what} failed (${res.status})\n${res.out}`); return res; };
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
// Counting rule (same as harness/static-metrics.mjs): non-blank lines that are not only a // or /* */ comment.
const countLines = (src) => {
  const lines = src.split("\n");
  let code = 0, inBlock = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (inBlock) { if (l.includes("*/")) inBlock = false; continue; }
    if (!l || l.startsWith("//")) continue;
    if (l.startsWith("/*")) { if (!l.includes("*/")) inBlock = true; continue; }
    code++;
  }
  return { physical: lines.filter((l, i) => i < lines.length - 1 || l !== "").length, code };
};
const bundle = (out) => {
  const js = walk(out).filter((f) => /\.m?js$/.test(f));
  const sum = { jsFiles: js.length, raw: 0, gzip: 0, brotli: 0 };
  for (const f of js) {
    const b = readFileSync(f);
    sum.raw += b.length;
    sum.gzip += gzipSync(b, { level: 9 }).length;
    sum.brotli += brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  }
  return sum;
};

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const result = { aura: AURA, three: THREE, vite: VITE, apps: {} };

// 1. Aura3D: stock scaffold, hello world swapped in for src/main.ts.
const scaffold = must(run("npx", ["--yes", `create-aura3d@${AURA}`, "aura-hello", "--template", "product-viewer", "--no-agent"], work), "create-aura3d");
const auraDir = join(work, "aura-hello");
const install = run("npm", ["install", "--no-audit", "--no-fund"], auraDir);
cpSync(join(auraDir, "src", "main.ts"), join(work, "template-main.ts"));
cpSync(join(tagline, "aura-hello", "main.ts"), join(auraDir, "src", "main.ts"));
const typecheck = run("npx", ["tsc", "--noEmit"], auraDir);
const auraBuild = run("npx", ["vite", "build", "--logLevel", "warn"], auraDir);
result.apps["aura-hello"] = {
  scaffold: scaffold.out.slice(-600), installOk: install.ok, installTail: install.ok ? "" : install.out,
  typecheckOk: typecheck.ok, typecheckOut: typecheck.ok ? "" : typecheck.out,
  buildOk: auraBuild.ok, buildOut: auraBuild.out.slice(-1500),
  lines: { "src/main.ts": countLines(readFileSync(join(auraDir, "src", "main.ts"), "utf8")), "src/aura-assets.ts (generated)": countLines(readFileSync(join(auraDir, "src", "aura-assets.ts"), "utf8")), "vite.config.ts (scaffold)": countLines(readFileSync(join(auraDir, "vite.config.ts"), "utf8")) },
  installed: existsSync(join(auraDir, "node_modules/@aura3d/engine/package.json")) ? JSON.parse(readFileSync(join(auraDir, "node_modules/@aura3d/engine/package.json"), "utf8")).version : null,
  dist: join(auraDir, "dist"),
  bundle: auraBuild.ok ? bundle(join(auraDir, "dist")) : null
};

// 1b. Hero candidates (tagline/aura-variants/*.ts as src/main.ts) and the untouched template (scaffold main.ts).
const variantsDir = join(tagline, "aura-variants");
const variants = existsSync(variantsDir) ? readdirSync(variantsDir).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3)) : [];
for (const name of ["template-stock", ...variants]) {
  const dir = join(work, `aura-${name}`);
  cpSync(auraDir, dir, { recursive: true, filter: (p) => !p.startsWith(join(auraDir, "dist")) });
  if (name === "template-stock") cpSync(join(work, "template-main.ts"), join(dir, "src", "main.ts"));
  else cpSync(join(variantsDir, `${name}.ts`), join(dir, "src", "main.ts"));
  const tc = run("npx", ["tsc", "--noEmit"], dir);
  const b = run("npx", ["vite", "build", "--logLevel", "warn"], dir);
  result.apps[`aura-${name}`] = { typecheckOk: tc.ok, typecheckOut: tc.ok ? "" : tc.out, buildOk: b.ok, buildOut: b.out.slice(-1500), lines: { "src/main.ts": countLines(readFileSync(join(dir, "src", "main.ts"), "utf8")) }, dist: join(dir, "dist"), bundle: b.ok ? bundle(join(dir, "dist")) : null };
}

// 2. The 18-line bench cube against the same Aura3D version, inside the same scaffold (stock vite config).
const cubeDir = join(work, "aura-cube");
cpSync(auraDir, cubeDir, { recursive: true, filter: (p) => !p.includes(`${auraDir}/dist`) });
cpSync(join(benchRoot, "shared", "glue.ts"), join(cubeDir, "src", "glue.ts"));
writeFileSync(join(cubeDir, "src", "scene.ts"), readFileSync(join(benchRoot, "baseline", "aura", "scene.ts"), "utf8").replace("../../shared/glue", "./glue"));
writeFileSync(join(cubeDir, "src", "main.ts"), `import { runBench } from "./glue";\nimport { start } from "./scene";\n\nvoid runBench("baseline-aura", start);\n`);
const cubeBuild = run("npx", ["vite", "build", "--logLevel", "warn"], cubeDir);
result.apps["aura-cube"] = { buildOk: cubeBuild.ok, buildOut: cubeBuild.out.slice(-1500), lines: { "src/scene.ts": countLines(readFileSync(join(cubeDir, "src", "scene.ts"), "utf8")) }, dist: join(cubeDir, "dist"), bundle: cubeBuild.ok ? bundle(join(cubeDir, "dist")) : null };

// 3. three.js: plain Vite apps, same public/ (GLB + HDRI) as the scaffold.
const threeRoot = join(work, "three");
mkdirSync(threeRoot, { recursive: true });
writeFileSync(join(threeRoot, "package.json"), JSON.stringify({ name: "tagline-three", private: true, type: "module", dependencies: { three: THREE }, devDependencies: { vite: VITE, typescript: "^5.8.3", "@types/three": "0.185.1" } }, null, 2));
const threeInstall = must(run("npm", ["install", "--no-audit", "--no-fund"], threeRoot), "three npm install");
for (const variant of ["three-minimal", "three-look"]) {
  const dir = join(threeRoot, variant);
  mkdirSync(join(dir, "src"), { recursive: true });
  cpSync(join(auraDir, "public"), join(dir, "public"), { recursive: true });
  cpSync(join(tagline, variant, "main.ts"), join(dir, "src", "main.ts"));
  writeFileSync(join(dir, "index.html"), `<!doctype html>\n<html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}#app{width:100vw;height:100vh}</style></head>\n<body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n`);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, noEmit: true, lib: ["ES2022", "DOM"], types: [] }, include: ["src"] }));
  const tc = run(join(threeRoot, "node_modules/.bin/tsc"), ["--noEmit", "-p", dir], threeRoot);
  const b = run(join(threeRoot, "node_modules/.bin/vite"), ["build", dir, "--outDir", join(dir, "dist"), "--emptyOutDir", "--logLevel", "warn"], threeRoot);
  result.apps[variant] = { installOk: threeInstall.ok, typecheckOk: tc.ok, typecheckOut: tc.ok ? "" : tc.out, buildOk: b.ok, buildOut: b.out.slice(-1500), lines: { "src/main.ts": countLines(readFileSync(join(dir, "src", "main.ts"), "utf8")) }, dist: join(dir, "dist"), bundle: b.ok ? bundle(join(dir, "dist")) : null };
}

for (const [name, app] of Object.entries(result.apps)) console.log(`TAGLINE_BUILD ${name}: build=${app.buildOk} lines=${JSON.stringify(app.lines)} js=${app.bundle ? app.bundle.raw : "n/a"}`);
writeFileSync(join(work, "build.json"), JSON.stringify(result, null, 2));
console.log(`TAGLINE_BUILD_JSON ${relative(process.cwd(), join(work, "build.json"))}`);
