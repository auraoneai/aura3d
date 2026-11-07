#!/usr/bin/env node
// Aggregates <dir>/runs.jsonl into <dir>/results.json and <dir>/REPORT.md.
//   node report.mjs results/<date>
// Numbers are medians across repetitions (min..max shown for frame p95). No pass/fail thresholds, no comparative claims.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfigs, WARMUP_MS, MEASURE_MS } from "./configs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, process.argv[2] ?? "results");
const runs = readFileSync(join(dir, "runs.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const host = existsSync(join(dir, "host.json")) ? JSON.parse(readFileSync(join(dir, "host.json"), "utf8")) : {};
const configs = buildConfigs();

const med = (a) => { const v = a.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const rng = (a) => { const v = a.filter((x) => typeof x === "number" && Number.isFinite(x)); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
const f = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "n/a" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e4 ? (x / 1e3).toFixed(0) + "K" : x.toFixed(d));
const mb = (x) => (x === null || x === undefined ? "n/a" : (x / 1048576).toFixed(2));

function summarize(rs) {
  const ok = rs.filter((r) => !r.failed && r.measure);
  const failed = rs.filter((r) => r.failed || !r.measure);
  const pick = (g) => ok.map(g);
  const s = {
    runs: rs.length, okRuns: ok.length, failedRuns: failed.length,
    failures: [...new Set(failed.map((r) => String(r.cause ?? "unknown").split("\n")[0].slice(0, 200)))],
    frameP50: med(pick((r) => r.measure.frameTime.p50)), frameP95: med(pick((r) => r.measure.frameTime.p95)), frameP99: med(pick((r) => r.measure.frameTime.p99)),
    frameP95Range: rng(pick((r) => r.measure.frameTime.p95)),
    rafP95: med(pick((r) => r.measure.rafTime.p95)),
    effectiveFps: med(pick((r) => r.measure.effectiveFps)), renderedFrames: med(pick((r) => r.measure.renderedFrames)),
    droppedFrames: med(pick((r) => r.measure.droppedFrames)),
    cpuFrameMean: med(pick((r) => r.measure.cpuPerFrame.mean)), cpuFrameP95: med(pick((r) => r.measure.cpuPerFrame.p95)),
    tickMean: med(pick((r) => r.measure.cpuTick.mean)), tickP95: med(pick((r) => r.measure.cpuTick.p95)), convertMean: med(pick((r) => r.measure.cpuConvert.mean)),
    renderMean: med(pick((r) => r.measure.cpuRender.mean)), labelsMean: med(pick((r) => r.measure.cpuLabels.mean)),
    ticksApplied: med(pick((r) => r.measure.ticksApplied)), ticksSkipped: med(pick((r) => r.measure.ticksSkipped)),
    heapMaxMB: med(pick((r) => r.measure.heap.maxMB)), heapStartMB: med(pick((r) => r.measure.heap.startMB)),
    subBytesPerFrame: med(pick((r) => r.measure.gl.bufferSubDataBytesPerFrame)), dataBytesPerFrame: med(pick((r) => r.measure.gl.bufferDataBytesPerFrame)),
    subCallsPerFrame: med(pick((r) => r.measure.gl.bufferSubDataCallsPerFrame)), dataCallsPerFrame: med(pick((r) => r.measure.gl.bufferDataCallsPerFrame)),
    drawCallsPerFrame: med(pick((r) => r.measure.gl.drawCallsPerFrame)), drawVerticesPerFrame: med(pick((r) => r.measure.gl.drawVerticesPerFrame)),
    gpuP50: med(pick((r) => r.measure.gpu.frameTime.p50)), gpuP95: med(pick((r) => r.measure.gpu.frameTime.p95)), gpuSamples: med(pick((r) => r.measure.gpu.frameTime.n)),
    buildMs: med(ok.map((r) => r.mount?.buildMs)),
    probeMsPerQuery: med(ok.map((r) => r.probe?.perQueryMs)), probeHits: med(ok.map((r) => r.probe?.hits)), probeUsable: ok.some((r) => r.probe) ? ok.filter((r) => r.probe).every((r) => r.probe.usable) : null,
    probeStatus: ok.find((r) => r.probe)?.probe?.status ?? ok.find((r) => r.probe)?.probe?.error ?? null,
    nonBlankFraction: med(ok.map((r) => r.nonBlank?.fraction)),
    loadavg1Start: med(rs.map((r) => r.loadavgStart?.[0])), loadavg1Max: Math.max(...rs.map((r) => r.loadavgStart?.[0] ?? 0), 0),
    consoleErrors: [...new Set(rs.flatMap((r) => r.consoleErrors ?? []))].slice(0, 5)
  };
  return s;
}

const byConfig = configs.map((c) => {
  const row = { id: c.id, config: c };
  for (const v of ["aura", "three"]) {
    const rs = runs.filter((r) => r.configId === c.id && r.viewer === v);
    row[v] = rs.length ? summarize(rs) : null;
  }
  return row;
});

const first = runs.find((r) => r.gl?.renderer);
const libs = { aura: runs.find((r) => r.viewer === "aura" && r.libraryVersion)?.libraryVersion, three: runs.find((r) => r.viewer === "three" && r.libraryVersion)?.libraryVersion };
const auraNotes = [...new Set(runs.filter((r) => r.viewer === "aura").flatMap((r) => r.notes ?? []))];
const env = { ...host, gl: first?.gl, devicePixelRatio: first?.dpr, windowSize: first?.size, libraries: libs, canvasContexts: [...new Set(runs.flatMap((r) => r.canvasContexts ?? []))] };

const results = {
  schema: "spatial-bench/1",
  generatedAt: new Date().toISOString(),
  protocol: { warmupMs: WARMUP_MS, measureMs: MEASURE_MS, repsPlanned: 3, droppedFrameRule: "rendered-frame interval > 2x target period", frameTime: "rAF timestamp delta between consecutive rendered frames", cpuPerFrame: "performance.now() around tick apply + camera + render + label pass; excludes GPU completion" },
  environment: env,
  configs: byConfig,
  runs
};
writeFileSync(join(dir, "results.json"), JSON.stringify(results));

// ---------- REPORT.md
const L = [];
const say = (s = "") => L.push(s);
const ids = (re) => byConfig.filter((r) => re.test(r.id));
function tableFor(rows, title, extra = "") {
  say(`### ${title}`);
  say();
  if (extra) { say(extra); say(); }
  say("Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.");
  say();
  say("| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |");
  say("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) for (const v of ["aura", "three"]) {
    const s = r[v];
    if (!s) { say(`| ${r.id} | ${v} | 0/0 | not run (${v === "aura" ? "n/a" : "three-only variant"}) |||||||||||||`); continue; }
    if (s.okRuns === 0) { say(`| ${r.id} | ${v} | 0/${s.runs} | **FAILED**: ${s.failures.join("; ").slice(0, 160).replace(/\|/g, "/")} |||||||||||||`); continue; }
    const range = s.frameP95Range ? `${f(s.frameP95Range[0])}..${f(s.frameP95Range[1])}` : "n/a";
    say(`| ${r.id} | ${v} | ${s.okRuns}/${s.runs} | ${f(s.frameP50)} | ${f(s.frameP95)} (${range}) | ${f(s.frameP99)} | ${f(s.droppedFrames, 0)} | ${f(s.effectiveFps)} | ${f(s.cpuFrameMean, 2)} | ${f(s.cpuFrameP95, 2)} | ${s.ticksApplied ? f(s.tickMean, 2) : "-"} | ${s.ticksApplied ? f(s.convertMean, 2) : "-"} | ${f((s.subBytesPerFrame ?? 0) + (s.dataBytesPerFrame ?? 0), 0)} | ${f((s.subCallsPerFrame ?? 0) + (s.dataCallsPerFrame ?? 0), 1)} | ${f(s.gpuP50, 2)} | ${f(s.heapMaxMB, 1)} | ${f(s.buildMs, 0)} |`);
  }
  say();
}

say("# E6-01 baseline: Aura3D vs three.js on high-frequency spatial-data workloads");
say();
say(`Generated ${results.generatedAt} by \`tools/spatial-bench/report.mjs\` from \`runs.jsonl\` (${runs.length} runs). Raw per-run data: \`results.json\`. Measurement only: no engine or rendering source was modified, no thresholds are asserted, and no comparative claim follows from these numbers without the evidence rules in \`docs/agents/claims-and-boundaries.md\`.`);
say();
say("## 1. What was and was not run");
say();
say(`- Machine: ${env.macModel ?? "?"}, ${env.cpu ?? "?"}, ${env.cpuCores ?? "?"} cores, ${env.memoryGB ?? "?"} GB, macOS ${env.macOS ?? "?"} (${env.macBuild ?? "?"}).`);
say(`- Browser: ${env.chromeBrowser ?? "?"}, headless=new, loopback CDP, flags \`${env.chromeFlags ?? "?"}\`.`);
say(`- GPU string (UNMASKED_RENDERER): \`${env.gl?.renderer ?? "?"}\`; vendor \`${env.gl?.vendor ?? "?"}\`; ${env.gl?.version ?? ""}; drawing buffer ${env.gl?.drawingBuffer?.join("x") ?? "?"}; devicePixelRatio ${env.devicePixelRatio ?? "?"}; window ${env.windowSize ? env.windowSize.width + "x" + env.windowSize.height : "?"}; max aliased point size ${env.gl?.maxPointSize ? env.gl.maxPointSize[1] : "?"}.`);
say(`- Backend: WebGL2 for both viewers (canvas contexts requested: ${env.canvasContexts.join(", ") || "?"}). WebGPU was **not** run (\`A3D_QR_WEBGPU\` is \`dev\`; E6-00 section 5.1 lists it as optional).`);
say(`- Libraries: Aura3D ${libs.aura ?? "?"} (workspace source through \`vite.aliases.generated.ts\`, production vite build), three.js r${libs.three ?? "?"} (pinned in \`package.json\`/\`package-lock.json\`).`);
say(`- Protocol: ${WARMUP_MS / 1000} s warm-up then ${MEASURE_MS / 1000} s measured per run, 3 repetitions per config and viewer, runs interleaved (rep > config > viewer), one fresh tab per run, canvas 1280x720 at DPR 1. Load average at run start is recorded per run (the machine was shared with other agent lanes: median 1-min load over all runs ${f(med(runs.map((r) => r.loadavgStart?.[0])), 1)}, max ${f(Math.max(...runs.map((r) => r.loadavgStart?.[0] ?? 0)), 1)}), so absolute times carry that noise; the repetition range of frame p95 is shown for that reason.`);
say("- Not measured: GC count/pause (not observable from the page), WebGPU, hardware other than this Mac, battery/thermal state, React embedding, `setScene` remount, determinism, DPR 2.");
say("- Timer resolution: the server sends COOP/COEP so `performance.now()` is not clamped to 0.1 ms.");
say();
say("## 2. Equivalence of the two viewers (read before the tables)");
say();
say("Same seed, same generated data (`src/common/data.ts`), same pre-generated ring of 4 sensor frames replayed cyclically, same orbit camera pose per rendered-frame index, same label pass (own 50-anchor projection in `harness.ts`, view-projection taken from each library), same frame loop and measurement code. Only `src/aura/main.ts` and `src/three/main.ts` differ.");
say();
say("| path | Aura3D (public API only) | three.js |");
say("|---|---|---|");
say("| static points | `points({ positions: Float32Array, colors: string[], size, sizeAttenuation: false })`; colors must be one CSS color string per point | `Points` + `PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors })`, Uint8 normalized RGBA attribute |");
say("| streamed points | `geometry.custom(geometry.dynamic({ topology: \"points\", positions, colors }))` + `handle.updateAttribute(\"position\" and \"color\")`; the only mutable points path; no point-size option on a primitive (drawn at the default) and colors need Float32 RGBA (Uint8 is converted every tick, cost in `convert`) | write into the same attribute arrays, `needsUpdate = true`, Uint8 colors as-is |");
say("| instances | `instances.box({ transforms })` + `handle.setInstanceMatrices(Float32Array, count)` | `InstancedMesh` + direct `instanceMatrix.array.set` (variant `loop` = `setMatrixAt` per instance) |");
say("| trajectories | `lines.segments({ positions })` + `handle.updateAttribute(\"position\")`, native 1 px lines | `LineSegments` + `LineBasicMaterial`, array write + `needsUpdate` |");
say("| picking | `raycast({ camera, ndc }, { handles, mode: \"mesh\" })` | `Raycaster.intersectObject` (Points threshold 0.25) |");
say("| lights / look | ambient + directional, default PBR material, Aura3D default renderer settings | ambient + directional, `MeshStandardMaterial`, no antialiasing |");
say();
say("Known non-equivalences that are part of the result and not corrected for: Aura3D draws points at its default size and tone-maps through its production renderer (screenshots in `frames/` differ in brightness and point size), Aura3D's production renderer may do more work per frame (post, HDR target) than the three.js default, and the Aura3D GPU number comes from its own renderer timing (an external timer query nests with Aura3D's own and raises a GL error: `RenderDeviceError: WebGL texture upload failed`, observed when the harness timer wrapped `app.step`).");
say();
say("## 3. Findings stated as findings (no thresholds)");
say();
const fnd = [];
for (const r of byConfig) for (const v of ["aura", "three"]) { const s = r[v]; if (s && s.failedRuns > 0) fnd.push(`- \`${r.id}\` ${v}: ${s.failedRuns}/${s.runs} runs failed: ${s.failures.join("; ")}`); }
if (!fnd.length) fnd.push("- No config failed to build or run for either viewer.");
for (const l of fnd) say(l);
const staticPts = ids(/^ctl-static-pts/);
say(`- \`points()\` has no live-update path: every streamed-points config uses \`geometry.dynamic\` + \`updateAttribute\` instead (see section 2); static \`points()\` mount cost is in the controls table (\`build ms\`).`);
const pr = byConfig.filter((r) => r.aura?.probeStatus && /pts/.test(r.id));
for (const r of pr) say(`- Picking on points (${r.id}): Aura3D status "${r.aura.probeStatus}", hits ${f(r.aura.probeHits, 0)}, usable=${r.aura.probeUsable}; three.js status "${r.three?.probeStatus}", hits ${f(r.three?.probeHits, 0)}.`);
say();
say("## 4. Tables");
say();
tableFor(ids(/^ctl-/), "4.1 Controls (empty scene, static 0 Hz points and instances)");
tableFor(ids(/^pts-/), "4.2 Points stream: 100K / 250K / 1M x 10/20 Hz x 30/60 FPS");
tableFor(ids(/^inst-/), "4.3 Instanced boxes re-posed each tick: 1K / 5K / 10K x 10/20 Hz x 30/60 FPS");
tableFor(ids(/^trails-/), "4.4 Trajectories as lines (200 trails, 20K segments)");
tableFor(ids(/^labels-/), "4.5 Label overlay (50 DOM labels projected per frame)");
tableFor(ids(/^mixed-/), "4.6 Mixed scene (250K points + 1K instances + 20K segments + 50 labels)");

say("### 4.7 Picking probe (after the measure window; N random NDC points, same points for both viewers)");
say();
say("| config | viewer | N | ms per query | hits | status |");
say("|---|---|---|---|---|---|");
for (const r of byConfig) for (const v of ["aura", "three"]) { const s = r[v]; if (s && s.probeStatus) say(`| ${r.id} | ${v} | ${r.config.probe?.n} | ${f(s.probeMsPerQuery, 2)} | ${f(s.probeHits, 0)} | ${String(s.probeStatus).replace(/\|/g, "/")} |`); }
say();
say("### 4.8 Mount cost, Aura3D-only conversions");
say();
const conv = runs.filter((r) => r.viewer === "aura" && r.mount?.points && r.rep === 1);
say("| config | path | color conversion ms (mount) | builder ms |");
say("|---|---|---|---|");
for (const r of conv) say(`| ${r.configId} | ${r.mount.points.path} | ${f(r.mount.points.colorConvertMs ?? r.mount.points.initialColorConvertMs, 1)} | ${f(r.mount.points.builderMs, 1)} |`);
say();
say("## 5. Notes recorded by the Aura3D viewer");
say();
for (const n of auraNotes) say(`- ${n}`);
say();
say("## 6. Console errors during runs");
say();
const ce = byConfig.flatMap((r) => ["aura", "three"].flatMap((v) => (r[v]?.consoleErrors ?? []).map((e) => `${r.id} ${v}: ${e}`)));
if (ce.length) for (const e of ce.slice(0, 20)) say(`- ${e}`); else say("- none captured");
say();
say("## 7. Reproduce");
say();
say("See `tools/spatial-bench/README.md`.");
writeFileSync(join(dir, "REPORT.md"), L.join("\n") + "\n");
console.log(`wrote ${join(dir, "results.json")} and REPORT.md (${runs.length} runs)`);
