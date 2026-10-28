#!/usr/bin/env node
/* Stage the ten bench apps into WORK, install the two libraries at their pinned versions, vite-build each app and
   record production bundle bytes (raw / gzip / brotli). Usage: node build-all.mjs <benchRoot> <workDir> <fixturesDir> <viteBin> */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const [benchRoot, workArg, fixtures, sceneArg, libArg] = process.argv.slice(2);
if (!benchRoot || !workArg || !fixtures) throw new Error("usage: build-all.mjs <benchRoot> <workDir> <fixturesDir>");
mkdirSync(workArg, { recursive: true });
const work = realpathSync(workArg);

// Versions are pinned here and overridable for re-runs (the 4.1.2 results in RESULTS.md were taken with BENCH_AURA_VERSION=4.1.2).
const AURA_VERSION = process.env.BENCH_AURA_VERSION ?? "4.3.7";
const THREE_VERSION = process.env.BENCH_THREE_VERSION ?? "0.185.1";
const VITE_VERSION = "7.3.2";
const ALL_SCENES = ["baseline", "pbr-viewer", "forest", "skinned-character", "game-loop", "shader-water"];
const SCENES = sceneArg ? sceneArg.split(",") : ALL_SCENES;
// Candidate mode (harness/run-candidate.sh writes tools/bench-vs-threejs/candidate.json): the Aura3D arms are built from the workspace
// sources (shared/aura-vite-workspace.ts + the repo's generated alias table) instead of an npm install. `aura-auto` is the scene source as
// written; `aura-production` is the same source with `quality: "production"` injected at build time.
const CANDIDATE = existsSync(join(benchRoot, "candidate.json"));
const REPO_ROOT = join(benchRoot, "..", "..");
const AURA_LIBS = CANDIDATE ? ["aura-auto", "aura-production"] : ["aura"];
const LIBS = libArg ? libArg.split(",") : ["three", ...AURA_LIBS];
const isAuraLib = (lib) => lib === "aura" || lib.startsWith("aura-");
const ASSETS = {
  "pbr-viewer": { "model.glb": "threejs-parity/assets/physics/cesium-milk-truck.glb", "env.hdr": "environment-corpus/hdri/studio_small_08_1k.hdr" },
  "skinned-character": { "model.glb": "threejs-parity/assets/character/soldier.glb" }
};
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

rmSync(join(work, "apps"), { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const auraDeps = CANDIDATE ? {} : { "@aura3d/engine": AURA_VERSION, "@aura3d/assets": AURA_VERSION };
writeFileSync(join(work, "package.json"), JSON.stringify({ name: "bench-work", private: true, type: "module", dependencies: { ...auraDeps, three: THREE_VERSION }, devDependencies: { vite: VITE_VERSION } }, null, 2));
if (!existsSync(join(work, "node_modules", ".bin", "vite")) || (!CANDIDATE && !existsSync(join(work, "node_modules", "@aura3d", "assets")))) run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts"], work);
if (CANDIDATE) {
  // vite.aliases.generated.ts is `export const aliasEntries = [["@aura3d/x", "./packages/x/src/index.ts"], ...] as const;`
  const text = readFileSync(join(REPO_ROOT, "vite.aliases.generated.ts"), "utf8");
  const pairs = [...text.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)].map((m) => [m[1], m[2]]);
  if (pairs.length < 50) throw new Error(`candidate mode: parsed only ${pairs.length} alias entries from vite.aliases.generated.ts`);
  writeFileSync(join(work, "bench-aliases.json"), JSON.stringify(pairs));
  process.env.BENCH_ALIASES = join(work, "bench-aliases.json");
  process.env.BENCH_AURA_SOURCE = REPO_ROOT;
}
const readPkg = (p) => JSON.parse(readFileSync(p, "utf8")).version;
const installed = {
  vite: readPkg(join(work, "node_modules/vite/package.json")),
  aura: CANDIDATE ? `workspace ${readPkg(join(REPO_ROOT, "packages/engine/package.json"))} (sources, vite alias build)` : readPkg(join(work, "node_modules/@aura3d/engine/package.json")),
  three: readPkg(join(work, "node_modules/three/package.json"))
};

cpSync(join(benchRoot, "shared"), join(work, "apps", "shared"), { recursive: true });
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const results = { installed, apps: {} };

for (const scene of SCENES) {
  for (const lib of LIBS) {
    const dir = join(work, "apps", scene, lib);
    cpSync(join(benchRoot, scene, isAuraLib(lib) ? "aura" : lib), dir, { recursive: true });
    if (CANDIDATE && isAuraLib(lib)) {
      writeFileSync(join(dir, "vite.config.ts"), 'export { default } from "../../shared/aura-vite-workspace";\n');
      if (lib === "aura-production") {
        const file = join(dir, "scene.ts");
        const source = readFileSync(file, "utf8");
        const patched = source.replace(/createAuraApp\(canvas, \{/, 'createAuraApp(canvas, { quality: "production",');
        if (patched === source) throw new Error(`${scene}: no createAuraApp(canvas, { found to inject quality`);
        writeFileSync(file, patched);
      }
    }
    const pub = join(dir, "public");
    mkdirSync(pub, { recursive: true });
    const hashes = {};
    for (const [name, rel] of Object.entries(ASSETS[scene] ?? {})) {
      cpSync(join(fixtures, rel), join(pub, name));
      hashes[name] = sha256(join(pub, name));
    }
    if (isAuraLib(lib) && existsSync(join(dir, "assets.generated.ts"))) {
      const key = scene === "pbr-viewer" ? "truck" : "soldier";
      writeFileSync(join(dir, "assets.generated.ts"), `export const SHA256 = { ${key}: "${hashes["model.glb"]}" } as const;\n`);
    }
    const out = join(work, "dist", scene, lib);
    const t0 = Date.now();
    // BENCH_MINIFY=false keeps function names so the CPU profile (group G) is readable; never used for size or timing groups.
    const minifyArgs = process.env.BENCH_MINIFY === "false" ? ["--minify", "false"] : [];
    run(join(work, "node_modules", ".bin", "vite"), ["build", dir, "--outDir", out, "--emptyOutDir", "--base", "./", "--logLevel", "warn", ...minifyArgs], work);
    const buildMs = Date.now() - t0;
    const files = walk(out).map((f) => ({ path: relative(out, f), size: statSync(f).size }));
    const js = walk(out).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
    const sum = { jsFiles: js.length, raw: 0, gzip: 0, brotli: 0, largestChunk: { path: "", raw: 0, gzip: 0, brotli: 0 } };
    for (const f of js) {
      const buf = readFileSync(f);
      const raw = buf.length;
      const gzip = gzipSync(buf, { level: 9 }).length;
      const brotli = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
      sum.raw += raw; sum.gzip += gzip; sum.brotli += brotli;
      if (raw > sum.largestChunk.raw) sum.largestChunk = { path: relative(out, f), raw, gzip, brotli };
    }
    const nonJs = files.filter((f) => !/\.(m?js)$/.test(f.path));
    results.apps[`${scene}/${lib}`] = {
      scene, lib, buildMs, bundle: sum,
      nonJsFiles: nonJs.map((f) => ({ ...f })),
      assetBytes: nonJs.filter((f) => /\.(glb|hdr|png|jpg|ktx2)$/.test(f.path)).reduce((a, f) => a + f.size, 0),
      outDir: out
    };
    console.log(`built ${scene}/${lib}: js ${sum.raw} raw / ${sum.gzip} gzip / ${sum.brotli} br in ${buildMs} ms`);
  }
}
writeFileSync(join(work, "build.json"), JSON.stringify(results, null, 2));
console.log(`BUILD_JSON_WRITTEN ${join(work, "build.json")}`);
