#!/usr/bin/env node
/* Full-game comparison build: stage both apps, install the PUBLISHED packages (@aura3d/engine, three) with npm, type-check,
   run a stock `vite build` (no vite.config, no plugin) and record bundle bytes, then count the authored lines.
   Usage: node build.mjs <fullGameRoot> <workDir>. Runs on the remote runner (needs npm registry access). */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const [root, work] = process.argv.slice(2);
if (!root || !work) throw new Error("usage: build.mjs <fullGameRoot> <workDir>");
const THREE = "0.185.1";
const VITE = "7.3.2";
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`.slice(-3000) };
};
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const benchRoot = dirname(root);
// Candidate mode (harness/run-candidate.sh stages tools/bench-vs-threejs/candidate.json): the Aura3D app is built from the workspace sources
// (shared/aura-vite-workspace.ts) instead of the published package, and is not type-checked (no published .d.ts to check against).
// A marker with a "published" version (BENCH_AURA_VERSION on run-candidate.sh) keeps the registry install of that version instead.
const MARKER = existsSync(join(benchRoot, "candidate.json")) ? JSON.parse(readFileSync(join(benchRoot, "candidate.json"), "utf8")) : null;
const PUBLISHED = typeof MARKER?.published === "string" ? MARKER.published : null;
const CANDIDATE = MARKER !== null && PUBLISHED === null;
const AURA = PUBLISHED ?? process.env.FULLGAME_AURA_VERSION ?? "4.3.7";

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
writeFileSync(join(work, "package.json"), JSON.stringify({
  name: "fullgame-work", private: true, type: "module",
  dependencies: CANDIDATE ? { three: THREE } : { "@aura3d/engine": AURA, three: THREE },
  devDependencies: { vite: VITE, typescript: "^5.8.3", "@types/three": THREE }
}, null, 2));
const install = run("npm", ["install", "--no-audit", "--no-fund"], work);
if (!install.ok) throw new Error(`npm install failed\n${install.out}`);
const tokenizerInstall = run("npm", ["install", "--no-audit", "--no-fund", "--no-save", "gpt-tokenizer"], work);
const version = (name) => JSON.parse(readFileSync(join(work, "node_modules", name, "package.json"), "utf8")).version;
const result = { candidate: CANDIDATE, installed: { aura: CANDIDATE ? "workspace sources (vite alias build)" : version("@aura3d/engine"), three: version("three"), vite: version("vite"), typescript: version("typescript") }, tokenizerInstalled: tokenizerInstall.ok, apps: {} };

cpSync(join(benchRoot, "shared"), join(work, "apps", "shared"), { recursive: true });
result.coinSimSha256 = { repo: sha256(join(benchRoot, "shared", "coin-sim.ts")), staged: sha256(join(work, "apps", "shared", "coin-sim.ts")) };
for (const app of ["aura", "three"]) {
  const dir = join(work, "apps", "full-game", app);
  cpSync(join(root, app), dir, { recursive: true, filter: (p) => !/(node_modules|dist)(\/|$)/.test(p) });
  // looks.preset("outdoor-day") fetches /hdri/autumn_field_puresky_1k.hdr; the create-aura3d scaffold ships it in public/, so stage the same file.
  if (app === "aura") {
    mkdirSync(join(dir, "public", "hdri"), { recursive: true });
    cpSync(join(benchRoot, "..", "..", "public", "hdri", "autumn_field_puresky_1k.hdr"), join(dir, "public", "hdri", "autumn_field_puresky_1k.hdr"));
    if (CANDIDATE) {
      const text = readFileSync(join(benchRoot, "..", "..", "vite.aliases.generated.ts"), "utf8");
      const pairs = [...text.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)].map((m) => [m[1], m[2]]);
      if (pairs.length < 50) throw new Error(`candidate mode: parsed only ${pairs.length} alias entries`);
      writeFileSync(join(work, "bench-aliases.json"), JSON.stringify(pairs));
      process.env.BENCH_ALIASES = join(work, "bench-aliases.json");
      process.env.BENCH_AURA_SOURCE = join(benchRoot, "..", "..");
      writeFileSync(join(dir, "vite.config.ts"), 'export { default } from "../../shared/aura-vite-workspace";\n');
    }
  }
  const typecheck = CANDIDATE && app === "aura" ? { ok: true, out: "skipped in candidate mode (workspace sources, no published .d.ts)" } : run(join(work, "node_modules/.bin/tsc"), ["-p", dir], work);
  const dist = join(dir, "dist");
  const t0 = Date.now();
  const build = run(join(work, "node_modules/.bin/vite"), ["build", dir, "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], work);
  const bundle = { jsFiles: 0, raw: 0, gzip: 0, brotli: 0 };
  if (build.ok) {
    for (const f of walk(dist).filter((p) => /\.m?js$/.test(p))) {
      const b = readFileSync(f);
      bundle.jsFiles++;
      bundle.raw += b.length;
      bundle.gzip += gzipSync(b, { level: 9 }).length;
      bundle.brotli += brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
    }
  }
  result.apps[app] = {
    hasViteConfig: existsSync(join(dir, "vite.config.ts")) || existsSync(join(dir, "vite.config.js")),
    typecheckOk: typecheck.ok, typecheckOut: typecheck.ok ? "" : typecheck.out,
    buildOk: build.ok, buildMs: Date.now() - t0, buildOut: build.out.slice(-1500),
    bundle: build.ok ? bundle : null, dist
  };
  console.log(`FULLGAME_BUILD ${app}: typecheck=${typecheck.ok} build=${build.ok} js=${build.ok ? `${bundle.raw} raw / ${bundle.gzip} gzip` : "n/a"}`);
}
const count = run("node", [join(root, "count.mjs"), root, join(work, "count.json"), work], work);
console.log(count.out.trim());
result.count = existsSync(join(work, "count.json")) ? JSON.parse(readFileSync(join(work, "count.json"), "utf8")) : { error: count.out };
writeFileSync(join(work, "build.json"), JSON.stringify(result, null, 2));
console.log(`FULLGAME_BUILD_JSON ${join(work, "build.json")}`);
