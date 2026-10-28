#!/usr/bin/env node
/* Build evidence/vs-threejs/RESULTS.md tables (with verdicts) from results.json + static-metrics.json.
   Usage: node report.mjs <results.json> <static-metrics.json> <out.md> [authoring.json] */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [resultsPath, staticPath, outPath, extraPath, repeatPath] = process.argv.slice(2);
const R = JSON.parse(readFileSync(resultsPath, "utf8"));
const S = JSON.parse(readFileSync(staticPath, "utf8"));
const R2 = repeatPath && existsSync(repeatPath) ? JSON.parse(readFileSync(repeatPath, "utf8")) : null;
const X = extraPath && existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, "utf8")) : {};
const SCENES = ["pbr-viewer", "forest", "skinned-character", "game-loop", "shader-water"];
const ALL = ["baseline", ...SCENES];
const TITLES = { baseline: "baseline (one cube)", "pbr-viewer": "1 PBR viewer", forest: "2 forest 10k", "skinned-character": "3 skinned character", "game-loop": "4 game loop", "shader-water": "5 shader water" };
const TIE = 0.05;

const f = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n) ? "n/a" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const kb = (n) => (n === null || n === undefined ? "n/a" : `${f(n / 1024, 1)} KB`);
const verdict = (three, aura, tol = TIE) => {
  if (three === null || three === undefined || aura === null || aura === undefined || Number.isNaN(three) || Number.isNaN(aura)) return "unmeasurable";
  const base = Math.max(Math.abs(three), Math.abs(aura), 1e-9);
  if (Math.abs(three - aura) / base <= tol) return "tie";
  return aura < three ? "Aura3D better" : "three.js better";
};
const ratio = (three, aura) => (three && aura ? `${f(aura / three, 2)}x` : "n/a");
const run = (scene, lib) => R.scenes?.[scene]?.results?.[lib];
const stat = (scene, lib) => S.apps[`${scene}/${lib}`];

const out = [];
const table = (head, rows) => { out.push(`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`), ""); };
const tally = { "Aura3D better": 0, "three.js better": 0, tie: 0, unmeasurable: 0 };
const row = (label, t, a, fmt, tol, lowerLabel = "") => {
  const v = verdict(t, a, tol);
  tally[v]++;
  return [label, fmt(t), fmt(a), v + lowerLabel];
};

out.push(`# Aura3D ${R.installed?.aura ?? "?"} vs three.js ${R.installed?.three ?? "?"}: measured results`, "");
out.push(`Generated ${new Date().toISOString()} from \`results.json\` (run groups on separate remote runners) and \`static-metrics.json\`. Method: \`tools/bench-vs-threejs/README.md\`.`, "");
out.push("**Read this first.** All timings come from a CPU-only remote runner with **software WebGL2 (SwiftShader), not a GPU**. They compare CPU/driver cost under identical conditions; they are not GPU performance numbers and say nothing about an Apple M-series or desktop GPU. Rows are marked `tie` within 5%. Lower is better in every numeric row. Verdicts are per row and are not averaged into a score.", "");
if (R.env) out.push(`Runner: ${R.env.renderer} (vendor ${R.env.vendor}), ${R.env.hardwareConcurrency} logical CPUs reported by the browser. Libraries as installed in the container: @aura3d/engine ${R.installed?.aura}, three ${R.installed?.three}, vite ${R.installed?.vite}.`, "");

if (X.summary) out.push(X.summary, "");
const header = ["Scene", "three.js", "Aura3D", "Verdict"];

out.push("## 1. Source size: lines of code (scene.ts only)", "");
table(header, ALL.map((s) => row(TITLES[s], stat(s, "three").scene.loc, stat(s, "aura").scene.loc, (v) => f(v))));
out.push("Extra files an Aura3D app needed to build (three.js needed none):", "");
table(["Scene", "assets.generated.ts", "vite.config.ts", "shared/aura-vite.ts (shared by all)"], ALL.map((s) => { const e = stat(s, "aura").extraFiles; return [TITLES[s], f(e["assets.generated.ts"] ?? 0), f(e["vite.config.ts"] ?? 0), f(e["shared/aura-vite.ts"] ?? 0)]; }));

out.push(`## 2. Source size: tokens (${S.tokenizer})`, "");
table(header, ALL.map((s) => row(TITLES[s], stat(s, "three").scene.tokens, stat(s, "aura").scene.tokens, (v) => f(v))));

out.push("## 3. Distinct import modules and API concepts", "");
table(["Scene", "three.js modules", "Aura3D modules", "Verdict (modules)", "three.js symbols", "Aura3D symbols", "Verdict (symbols)"], ALL.map((s) => {
  const t = stat(s, "three").scene, a = stat(s, "aura").scene;
  const vm = verdict(t.distinctModules, a.distinctModules, 0), vs = verdict(t.distinctSymbols, a.distinctSymbols, TIE);
  tally[vm]++; tally[vs]++;
  return [TITLES[s], f(t.distinctModules), f(a.distinctModules), vm, f(t.distinctSymbols), f(a.distinctSymbols), vs];
}));

out.push("## 4. Production bundle (vite build, JS only)", "");
out.push("`raw` is the sum of every emitted `.js` file; `largest chunk` is the single biggest file. Assets (GLB, HDR) are excluded and listed in section 5.", "");
out.push("### 4a. Total JS emitted: raw", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.build?.bundle?.raw, run(s, "aura")?.build?.bundle?.raw, (v) => kb(v))));
out.push("### 4b. Total JS emitted: gzip -9", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.build?.bundle?.gzip, run(s, "aura")?.build?.bundle?.gzip, (v) => kb(v))));
out.push("### 4c. Total JS emitted: brotli -11", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.build?.bundle?.brotli, run(s, "aura")?.build?.bundle?.brotli, (v) => kb(v))));
out.push("### 4d. Largest single chunk (raw / gzip)", "");
table(header, ALL.map((s) => { const t = run(s, "three")?.build?.bundle?.largestChunk, a = run(s, "aura")?.build?.bundle?.largestChunk; return row(TITLES[s], t?.raw, a?.raw, () => "", TIE).map((c, i) => (i === 1 ? `${kb(t?.raw)} / ${kb(t?.gzip)}` : i === 2 ? `${kb(a?.raw)} / ${kb(a?.gzip)}` : c)); }));
const bt = run("baseline", "three")?.build?.bundle, ba = run("baseline", "aura")?.build?.bundle;
if (bt && ba) {
  out.push(`**Check against the earlier figure (engine chunk ~2.9 MB raw / ~845 KB gzip vs three ~366 KB / ~87 KB).** Measured here for the one-cube baseline: three.js ${kb(bt.largestChunk.raw)} raw / ${kb(bt.largestChunk.gzip)} gzip in its largest chunk (${kb(bt.raw)} / ${kb(bt.gzip)} all JS); Aura3D ${kb(ba.largestChunk.raw)} raw / ${kb(ba.largestChunk.gzip)} gzip in its largest chunk (${kb(ba.raw)} raw / ${kb(ba.gzip)} gzip across ${ba.jsFiles} JS files). Aura3D's total is ${ratio(bt.raw, ba.raw)} three.js raw and ${ratio(bt.gzip, ba.gzip)} gzip. ${ba.largestChunk.raw > 2.7e6 && ba.largestChunk.raw < 3.1e6 ? "The single-chunk ~2.9 MB figure reproduces." : "The single-chunk figure does not reproduce exactly here: the build splits the engine across several chunks, so compare the totals."}`, "");
}

out.push("## 5. Network on first load (one cold load, uncompressed static server)", "");
const net = (scene, lib) => {
  const reqs = run(scene, lib)?.requests;
  if (!reqs) return null;
  const ok = reqs.filter((r) => r.status < 400);
  return { count: ok.length, failed: reqs.filter((r) => r.status >= 400).length, bytes: ok.reduce((a, r) => a + r.bytes, 0), jsBytes: ok.filter((r) => /\.m?js$/.test(r.path)).reduce((a, r) => a + r.bytes, 0), jsCount: ok.filter((r) => /\.m?js$/.test(r.path)).length };
};
out.push("### 5a. Request count (successful responses)", "");
table(header, ALL.map((s) => row(TITLES[s], net(s, "three")?.count, net(s, "aura")?.count, (v) => f(v), 0)));
out.push("### 5b. JS bytes actually fetched on load (raw)", "");
table(["Scene", "three.js", "Aura3D", "Verdict", "three.js JS files", "Aura3D JS files"], ALL.map((s) => { const r = row(TITLES[s], net(s, "three")?.jsBytes, net(s, "aura")?.jsBytes, (v) => kb(v)); return [...r, f(net(s, "three")?.jsCount), f(net(s, "aura")?.jsCount)]; }));
out.push("### 5c. Total bytes fetched on load (JS + assets + document)", "");
table(header, ALL.map((s) => row(TITLES[s], net(s, "three")?.bytes, net(s, "aura")?.bytes, (v) => kb(v))));
out.push("Failed requests (status >= 400) on load: " + ALL.map((s) => `${s} three ${net(s, "three")?.failed ?? "n/a"} / aura ${net(s, "aura")?.failed ?? "n/a"}`).join("; "), "");

out.push("## 6. Time to first frame (median of 3 cold loads, ms; includes asset load and shader compile, software GL)", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.ttffMs?.median, run(s, "aura")?.ttffMs?.median, (v) => f(v))));

out.push("## 7. Steady-state frame time (60 frames, software WebGL2, ms)", "");
out.push("### 7a. Total per frame, median (until gl.finish)", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.totalMs?.median, run(s, "aura")?.totalMs?.median, (v) => f(v, 1))));
out.push("### 7b. Total per frame, p95", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.totalMs?.p95, run(s, "aura")?.totalMs?.p95, (v) => f(v, 1))));
out.push("### 7c. CPU time inside frame(), median (JS + command submission, before gl.finish)", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.cpuMs?.median, run(s, "aura")?.cpuMs?.median, (v) => f(v, 2))));

out.push("### 7d. Total per frame, median, antialiasing equalised", "");
out.push("The default Aura3D production profile renders into 4x multisampled RGBA16F targets (section 8d). The three.js apps above have no antialiasing, so 7a compares unequal work. This table adds three.js with 4x MSAA (`antialias: true`, or a 4-sample `EffectComposer` target for the post scenes). Both are software GL.", "");
table(["Scene", "three.js (no AA)", "three.js (4x MSAA)", "Aura3D (4x MSAA default)", "Verdict (three.js 4x vs Aura3D)"], ALL.map((s) => {
  const t0 = run(s, "three")?.totalMs?.median, t4 = run(s, "three-msaa")?.totalMs?.median, a = run(s, "aura")?.totalMs?.median;
  const v = verdict(t4, a); tally[v]++;
  return [TITLES[s], f(t0, 1), f(t4, 1), f(a, 1), v];
}));
out.push("### 7e. Time to first frame (ms), antialiasing equalised", "");
table(["Scene", "three.js (no AA)", "three.js (4x MSAA)", "Aura3D", "Verdict (three.js 4x vs Aura3D)"], ALL.map((s) => {
  const t0 = run(s, "three")?.ttffMs?.median, t4 = run(s, "three-msaa")?.ttffMs?.median, a = run(s, "aura")?.ttffMs?.median;
  const v = verdict(t4, a); tally[v]++;
  return [TITLES[s], f(t0), f(t4), f(a), v];
}));

out.push("## 8. Draw calls and triangles per steady frame (all passes)", "");
out.push("### 8a. Draw calls", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.perFrame?.draws, run(s, "aura")?.perFrame?.draws, (v) => f(v), 0.1)));
out.push("### 8b. Triangles submitted", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.perFrame?.tris, run(s, "aura")?.perFrame?.tris, (v) => f(v), 0.1)));
out.push("### 8c. Distinct shader programs created by the time of measurement", "");
table(header, ALL.map((s) => row(TITLES[s], run(s, "three")?.perFrame?.programs, run(s, "aura")?.perFrame?.programs, (v) => f(v), 0)));

out.push("### 8d. What the renderers set up per frame (viewport sizes, resolve blits, multisampled targets)", "");
table(["Scene", "three.js viewports", "three.js blits", "three.js MSAA targets", "Aura3D viewports", "Aura3D blits", "Aura3D MSAA targets"], ALL.map((s) => { const t = run(s, "three")?.perFrame, a = run(s, "aura")?.perFrame; return [TITLES[s], (t?.viewports ?? []).join(", ") || "n/a", f(t?.blits), (t?.msaaTargets ?? []).join("; ") || "none", (a?.viewports ?? []).join(", ") || "n/a", f(a?.blits), (a?.msaaTargets ?? []).join("; ") || "none"]; }));

out.push("## 9. Correctness", "");
out.push("There is no ground-truth image, so *which library is right* is `unmeasurable`; the table says how close the two libraries' pictures are at identical simulated time (frame 25; frame 85 in the JSD f85 column, frame 280 for the skinned character). JSD is Jensen-Shannon divergence of 64-bin luma histograms (0 identical, 1 maximal). Mean luma is 0-255. `gain-matched` rescales Aura3D's luma by mean(three)/mean(Aura3D) first, so a global exposure difference does not hide whether the layout agrees. The baseline cube is not a visual scene and is excluded.", "");
table(["Scene", "JSD f25", "JSD f85", "mean luma three / Aura (f25)", "mean luma delta f25", "mean abs luma diff f25", "gain-matched JSD f25", "gain-matched mean abs diff f25", "Verdict"], SCENES.map((s) => {
  const c = R.scenes?.[s]?.correctness;
  if (!c) return [TITLES[s], "n/a", "n/a", "n/a", "n/a", "n/a", "n/a", "n/a", "unmeasurable"];
  tally.unmeasurable++;
  return [TITLES[s], f(c.jsdFrame25, 4), f(c.jsdFrame85, 4), `${f(c.meanLuma.three[0], 1)} / ${f(c.meanLuma.aura[0], 1)}`, f(c.meanLumaDeltaFrame25, 1), f(c.meanAbsLumaDiffFrame25, 1), f(c.gainMatched?.jsdFrame25, 4), f(c.gainMatched?.meanAbsLumaDiffFrame25, 1), "unmeasurable (no reference image); see frames"];
}));
out.push("Animation and determinism checks:", "");
const gl3 = run("game-loop", "three")?.replay, gla = run("game-loop", "aura")?.replay;
const det = (r) => (r ? (r.first === r.second ? "yes" : "NO") : "n/a");
table(["Check", "three.js", "Aura3D", "Verdict"], [
  ["Game loop: two 1800-step replays hash identically", det(gl3), det(gla), verdict(det(gl3) === "yes" ? 0 : 1, det(gla) === "yes" ? 0 : 1, 0)],
  ["Game loop: replay hash (1800 steps)", gl3?.first ?? "n/a", gla?.first ?? "n/a", gl3 && gla ? (gl3.first === gla.first ? "tie (same rules, same stream)" : "differ: rng streams or sim diverged") : "unmeasurable"],
  ["Game loop: replay hash (600 steps)", gl3?.short ?? "n/a", gla?.short ?? "n/a", gl3 && gla ? (gl3.short === gla.short ? "tie" : "differ") : "unmeasurable"],
  ["Skinned character: luma change between frame 25 and 85 (mean abs, proves motion)", f(run("skinned-character", "three")?.temporalDiffMeanLuma, 2), f(run("skinned-character", "aura")?.temporalDiffMeanLuma, 2), "see note: both must be > 0"],
  ["Skinned character: clips reported", JSON.stringify(run("skinned-character", "three")?.state?.clips ?? "n/a"), JSON.stringify(run("skinned-character", "aura")?.state?.clips ?? "n/a"), "unmeasurable"]
]);
out.push("Console errors and warnings during the run (first few per app):", "");
for (const s of ALL) for (const lib of ["three", "aura"]) {
  const c = run(s, lib)?.console ?? [];
  const failed = run(s, lib)?.failed ? ` START FAILED: ${(run(s, lib).errors ?? []).join(" | ").slice(0, 300)}` : "";
  out.push(`- ${s}/${lib}: ${c.length} message(s)${failed}${c.length ? ": " + c.slice(0, 3).map((m) => `[${m.type}] ${m.text.slice(0, 160).replace(/\n/g, " ")}`).join(" ; ") : ""}`);
}
out.push("");

if (R2) {
  out.push("## 10. Repeatability: a second, independent run on fresh runners", "");
  out.push("Same code, same image tag family, separate ACR tasks. Ratios are Aura3D / three.js (steady-state total frame median and median time to first frame); if the two runs disagree about the ordering the row would show it.", "");
  const r2 = (scene, lib) => R2.scenes?.[scene]?.results?.[lib];
  table(["Scene", "frame ratio run 1", "frame ratio run 2", "TTFF ratio run 1", "TTFF ratio run 2", "three.js frame ms run 1 / 2", "Aura3D frame ms run 1 / 2"], ALL.map((s) => {
    const q = (r, sc) => ratio(r(sc, "three")?.totalMs?.median, r(sc, "aura")?.totalMs?.median);
    const g = (r, sc) => ratio(r(sc, "three")?.ttffMs?.median, r(sc, "aura")?.ttffMs?.median);
    return [TITLES[s], q(run, s), q(r2, s), g(run, s), g(r2, s), `${f(run(s, "three")?.totalMs?.median, 1)} / ${f(r2(s, "three")?.totalMs?.median, 1)}`, `${f(run(s, "aura")?.totalMs?.median, 1)} / ${f(r2(s, "aura")?.totalMs?.median, 1)}`];
  }));
}

if (X.sections) for (const section of X.sections) out.push(section, "");

out.push("## Tally of numeric rows", "", `Aura3D better: ${tally["Aura3D better"]}; three.js better: ${tally["three.js better"]}; tie: ${tally.tie}; unmeasurable: ${tally.unmeasurable}. (Rows counted: every per-scene row in sections 1 to 9.)`, "");
writeFileSync(outPath, out.join("\n"));
console.log(`wrote ${outPath}`, JSON.stringify(tally));
