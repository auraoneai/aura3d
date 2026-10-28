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
const LIBS = libArg ? libArg.split(",") : ["three", "aura"];
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
writeFileSync(join(work, "package.json"), JSON.stringify({ name: "bench-work", private: true, type: "module", dependencies: { "@aura3d/engine": AURA_VERSION, "@aura3d/assets": AURA_VERSION, three: THREE_VERSION }, devDependencies: { vite: VITE_VERSION } }, null, 2));
if (!existsSync(join(work, "node_modules", "@aura3d", "assets")) || !existsSync(join(work, "node_modules", ".bin", "vite"))) run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts"], work);
const installed = {
  vite: JSON.parse(readFileSync(join(work, "node_modules/vite/package.json"), "utf8")).version,
  aura: JSON.parse(readFileSync(join(work, "node_modules/@aura3d/engine/package.json"), "utf8")).version,
  three: JSON.parse(readFileSync(join(work, "node_modules/three/package.json"), "utf8")).version
};

cpSync(join(benchRoot, "shared"), join(work, "apps", "shared"), { recursive: true });
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const results = { installed, apps: {} };

for (const scene of SCENES) {
  for (const lib of LIBS) {
    const dir = join(work, "apps", scene, lib);
    cpSync(join(benchRoot, scene, lib), dir, { recursive: true });
    const pub = join(dir, "public");
    mkdirSync(pub, { recursive: true });
    const hashes = {};
    for (const [name, rel] of Object.entries(ASSETS[scene] ?? {})) {
      cpSync(join(fixtures, rel), join(pub, name));
      hashes[name] = sha256(join(pub, name));
    }
    if (lib === "aura" && existsSync(join(dir, "assets.generated.ts"))) {
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
