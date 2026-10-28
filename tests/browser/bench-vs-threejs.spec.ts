import { execFileSync } from "node:child_process";
import { cpus } from "node:os";
import { readFileSync, statSync, createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Aura3D vs three.js 0.185.1 measured benchmark (tools/bench-vs-threejs; the Aura3D version is BENCH_AURA_VERSION in
 * harness/build-all.mjs, default 4.3.7). Remote only (tools/remote-acr/run.sh,
 * software WebGL2 on a CPU runner): timings are NOT GPU timings. Results leave the container through the run log as
 * base64 chunks between BENCH_RESULTS_JSON_BEGIN/END, reassembled by tools/bench-vs-threejs/harness/extract.mjs.
 * Groups G and H (CPU profiles and the capped forest stall run) emit BENCH_AUX chunks, reassembled into aux-<name>.json.
 */
const WORK = process.env.BENCH_WORK ?? "/tmp/bench";
const ALL_SCENES = ["baseline", "pbr-viewer", "forest", "skinned-character", "game-loop", "shader-water"] as const;
const LIBS: readonly string[] = ["three", "aura"];
const MEASURE_FRAMES = Number(process.env.BENCH_FRAMES ?? 60);
const COLD_LOADS = 3;
/** The forest gets 5 minutes to produce a first frame (PRD target P6); a timeout is recorded as a failed result, not a crashed group (group H digs into why). */
const FOREST_READY_MS = 300_000;
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".glb": "model/gltf-binary", ".hdr": "application/octet-stream", ".wasm": "application/wasm", ".png": "image/png",
  ".jpg": "image/jpeg", ".ktx2": "image/ktx2", ".woff2": "font/woff2", ".svg": "image/svg+xml"
};

interface Req { path: string; status: number; bytes: number }
interface Capture { luma: number[]; mean: number; std: number; jpeg: string }
type BenchWin = Window & {
  __BENCH__?: {
    ready: boolean; firstFrameMs: number; errors: string[];
    frame(dt: number): void;
    frameRaw(dt: number): void;
    sync(): void;
    measure(frames: number, dt: number): { cpuMs: number[]; totalMs: number[] };
    capture(dt: number): Capture;
    state(): unknown;
    replay(frames: number): unknown;
  };
  __GLC__?: { draws: number; tris: number; instances: number; programs: number; blits: number; vp: string[]; msaa: string[] };
};

const GL_HOOK = `(() => {
  const c = { draws: 0, tris: 0, instances: 0, programs: 0, blits: 0, vp: [], msaa: [] };
  window.__GLC__ = c;
  const tri = (mode, count, inst) => (mode === 4 ? count / 3 : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0) * inst;
  const wrap = (proto) => {
    const w = (name, countIdx, instIdx) => {
      const orig = proto[name];
      if (!orig) return;
      proto[name] = function (...a) {
        const inst = instIdx === undefined ? 1 : a[instIdx];
        c.draws++; c.instances += inst; c.tris += tri(a[0], a[countIdx], inst);
        return orig.apply(this, a);
      };
    };
    w("drawArrays", 2); w("drawElements", 1); w("drawArraysInstanced", 2, 3); w("drawElementsInstanced", 1, 4); w("drawRangeElements", 3);
    const note = (list, v) => { if (!list.includes(v) && list.length < 24) list.push(v); };
    const vp = proto.viewport;
    proto.viewport = function (x, y, w, h) { note(c.vp, w + "x" + h); return vp.call(this, x, y, w, h); };
    const bf = proto.blitFramebuffer;
    proto.blitFramebuffer = function (...a) { c.blits++; return bf.apply(this, a); };
    const rm = proto.renderbufferStorageMultisample;
    proto.renderbufferStorageMultisample = function (t, samples, fmt, w, h) { note(c.msaa, samples + "x " + fmt + " " + w + "x" + h); return rm.call(this, t, samples, fmt, w, h); };
    const cp = proto.createProgram;
    proto.createProgram = function (...a) { c.programs++; return cp.apply(this, a); };
  };
  wrap(WebGL2RenderingContext.prototype);
})();`;

function serve(root: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      if (rel.endsWith("/")) rel += "index.html";
      const file = join(root, rel);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "content-length": statSync(file).size, "cache-control": "no-store" });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({ server, origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}` });
    });
  });
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  return { n: s.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length, median: q(0.5), p95: q(0.95), min: s[0]!, max: s[s.length - 1]! };
};
const histogram = (luma: number[], bins = 64) => {
  const h = new Array<number>(bins).fill(0);
  for (const l of luma) h[Math.min(bins - 1, Math.floor((l / 256) * bins))]!++;
  return h.map((v) => v / luma.length);
};
const jsd = (p: number[], q: number[]) => {
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    const m = (p[i]! + q[i]!) / 2;
    if (p[i]! > 0) d += 0.5 * p[i]! * Math.log2(p[i]! / m);
    if (q[i]! > 0) d += 0.5 * q[i]! * Math.log2(q[i]! / m);
  }
  return d;
};
const emitChunks = (tag: string, base64: string): void => {
  const size = 3000;
  for (let i = 0; i * size < base64.length; i++) console.log(`${tag}:${i}:${base64.slice(i * size, (i + 1) * size)}`);
};

async function openApp(browser: Browser, origin: string, scene: string, lib: string) {
  const context: BrowserContext = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  await context.addInitScript(GL_HOOK);
  const page: Page = await context.newPage();
  const requests: Req[] = [];
  const consoleMessages: Array<{ type: string; text: string }> = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleMessages.push({ type: m.type(), text: m.text().slice(0, 400) }); });
  page.on("pageerror", (e) => consoleMessages.push({ type: "pageerror", text: String(e.message).slice(0, 400) }));
  page.on("response", (r) => {
    const u = new URL(r.url());
    requests.push({ path: u.pathname, status: r.status(), bytes: Number(r.headers()["content-length"] ?? 0) });
  });
  await page.goto(`${origin}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as BenchWin).__BENCH__), undefined, { timeout: scene === "forest" ? FOREST_READY_MS : 120_000 });
  return { context, page, requests, consoleMessages, scene, lib };
}

async function runGroup(browser: Browser, scenes: readonly string[], libs: readonly string[] = LIBS): Promise<void> {
  execFileSync("node", ["tools/bench-vs-threejs/harness/build-all.mjs", "/repo/tools/bench-vs-threejs", WORK, "/repo/fixtures", scenes.join(","), libs.join(",")], { stdio: "inherit", timeout: 900_000 });
  const build = JSON.parse(readFileSync(join(WORK, "build.json"), "utf8"));
  let env: unknown = null;

  for (const scene of scenes) {
    const captures: Record<string, { a: Capture; b: Capture }> = {};
    // The forest is orders of magnitude slower under software GL with 4x MSAA, so it gets a reduced frame plan (same plan for both libraries).
    const plan = scene === "forest" ? { loads: 1, warmA: 4, gapB: 10, measure: 12 } : { loads: COLD_LOADS, warmA: 19, gapB: scene === "skinned-character" ? 254 : 59, measure: MEASURE_FRAMES };
    const results: Record<string, unknown> = {};
    const frames: Record<string, string> = {};
    for (const lib of libs) {
      const key = `${scene}/${lib}`;
      const root = join(WORK, "dist", scene, lib);
      const { server, origin } = await serve(root);
      try {
        const ttff: number[] = [];
        const libStart = Date.now();
        let record: Record<string, unknown> = {};
        for (let load = 0; load < plan.loads; load++) {
          const app = await openApp(browser, origin, scene, lib).catch((error: unknown) => { record = { failed: true, errors: [`open failed: ${String(error).slice(0, 300)}`], console: [], requests: [] }; return null; });
          if (!app) break;
          const { page } = app;
          try {
            await page.waitForFunction(() => Boolean((window as BenchWin).__BENCH__?.ready) || ((window as BenchWin).__BENCH__?.errors.length ?? 0) > 0, undefined, { timeout: scene === "forest" ? FOREST_READY_MS : 120_000 });
            const first = await page.evaluate(() => ({ ready: (window as BenchWin).__BENCH__!.ready, ms: (window as BenchWin).__BENCH__!.firstFrameMs, errors: (window as BenchWin).__BENCH__!.errors }));
            if (!first.ready) { record = { failed: true, errors: first.errors, console: app.consoleMessages, requests: app.requests }; break; }
            ttff.push(first.ms);
            if (load > 0) continue;

            if (!env) {
              env = await page.evaluate(() => {
                const gl = document.createElement("canvas").getContext("webgl2")!;
                const dbg = gl.getExtension("WEBGL_debug_renderer_info");
                return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), ua: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency };
              });
            }
            const dt = 1 / 60;
            // Per-frame GL counts: the frame after 4 warm frames, so one-time uploads are excluded.
            const perFrame = await page.evaluate((step) => {
              const w = window as BenchWin;
              for (let i = 0; i < 4; i++) w.__BENCH__!.frame(step);
              const c = w.__GLC__!;
              const before = { ...c };
              c.vp.length = 0;
              w.__BENCH__!.frame(step);
              return { draws: c.draws - before.draws, tris: c.tris - before.tris, instances: c.instances - before.instances, programs: c.programs, blits: c.blits - before.blits, viewports: [...c.vp], msaaTargets: [...c.msaa] };
            }, dt);
            // Deterministic captures at identical sim time in both libraries: frame 25 and frame 85 after load (frame 280 for the skinned character, so the second one is mid-run).
            const a = await page.evaluate(([step, n]) => { const w = window as BenchWin; for (let i = 0; i < n!; i++) w.__BENCH__!.frame(step!); return w.__BENCH__!.capture(step!); }, [dt, plan.warmA] as const);
            const b = await page.evaluate(([step, n]) => { const w = window as BenchWin; for (let i = 0; i < n!; i++) w.__BENCH__!.frame(step!); return w.__BENCH__!.capture(step!); }, [dt, plan.gapB] as const);
            const temporalDiff = a.luma.reduce((acc, l, i) => acc + Math.abs(l - b.luma[i]!), 0) / a.luma.length;
            frames[`${scene}-${lib}-a`] = a.jpeg;
            frames[`${scene}-${lib}-b`] = b.jpeg;
            captures[lib] = { a, b };
            // Steady-state frame time: per-frame CPU (JS + command submit) and total (after gl.finish).
            const timing = await page.evaluate(([n, step]) => (window as BenchWin).__BENCH__!.measure(n!, step!), [plan.measure, dt] as const);
            // Deterministic replay (scene 4 only): two replays of 1800 scripted steps must hash identically.
            const replay = scene === "game-loop"
              ? await page.evaluate(() => { const bench = (window as BenchWin).__BENCH__!; return { first: bench.replay(1800), second: bench.replay(1800), short: bench.replay(600) }; })
              : null;
            const state = await page.evaluate(() => (window as BenchWin).__BENCH__!.state());
            record = { perFrame, temporalDiffMeanLuma: temporalDiff, cpuMs: stats(timing.cpuMs), totalMs: stats(timing.totalMs), replay, state, requests: app.requests, console: app.consoleMessages };
          } catch (error) {
            record = { failed: true, errors: [`measure failed: ${String(error).slice(0, 300)}`], console: app.consoleMessages, requests: app.requests };
            break;
          } finally {
            await app.context.close();
          }
        }
        // wallMs: wall-clock for this app's whole measurement (all loads, captures, timing); the forest completion gate (P6) reads it.
        results[lib] = { ...record, wallMs: Date.now() - libStart, ttffMs: ttff.length ? { samples: ttff, median: stats(ttff).median } : null, build: build.apps[key] };
      } finally {
        server.close();
      }
      console.log(`BENCH_DONE ${key}`);
    }

    // Cross-library correctness: luma-histogram JSD and mean luma delta at matched frames.
    const t = captures["three"], a = captures["aura"];
    const correctness = !t || !a ? null : {
      jsdFrame25: jsd(histogram(t.a.luma), histogram(a.a.luma)),
      jsdFrame85: jsd(histogram(t.b.luma), histogram(a.b.luma)),
      meanLuma: { three: [t.a.mean, t.b.mean], aura: [a.a.mean, a.b.mean] },
      meanLumaDeltaFrame25: Math.abs(t.a.mean - a.a.mean),
      meanLumaDeltaFrame85: Math.abs(t.b.mean - a.b.mean),
      std: { three: [t.a.std, t.b.std], aura: [a.a.std, a.b.std] },
      meanAbsLumaDiffFrame25: t.a.luma.reduce((acc, l, i) => acc + Math.abs(l - a.a.luma[i]!), 0) / t.a.luma.length,
      // Exposure-normalised: scale Aura's luma by mean(three)/mean(Aura) first, so a global brightness (light-unit) difference does not mask layout agreement.
      gainMatched: (() => {
        const gain = t.a.mean / Math.max(1e-6, a.a.mean);
        const scaled = a.a.luma.map((l) => Math.min(255, Math.round(l * gain)));
        return { gain, jsdFrame25: jsd(histogram(t.a.luma), histogram(scaled)), meanAbsLumaDiffFrame25: t.a.luma.reduce((acc, l, i) => acc + Math.abs(l - scaled[i]!), 0) / t.a.luma.length };
      })()
    };
    const part = { scene, generatedUtc: new Date().toISOString(), frames: plan.measure, coldLoads: plan.loads, plan, env, cpuCount: cpus().length, installed: build.installed, correctness, results };
    mkdirSync("tests/reports/bench-vs-threejs", { recursive: true });
    writeFileSync(`tests/reports/bench-vs-threejs/${scene}.json`, JSON.stringify(part));
    console.log(`BENCH_PART_BEGIN ${scene}`);
    emitChunks(`BENCH_PART:${scene}`, Buffer.from(JSON.stringify(part)).toString("base64"));
    console.log(`BENCH_PART_END ${scene}`);
    for (const [name, dataUrl] of Object.entries(frames)) {
      console.log(`BENCH_FRAME_BEGIN ${name}`);
      emitChunks(`BENCH_FRAME:${name}`, dataUrl.split(",")[1]!);
      console.log(`BENCH_FRAME_END ${name}`);
    }
  }
}

interface CallFrame { functionName: string; url: string; lineNumber: number }
interface ProfileNode { id: number; callFrame: CallFrame; children?: number[] }
interface CpuProfile { nodes: ProfileNode[]; samples?: number[]; timeDeltas?: number[] }

/** Self and inclusive time per function from a V8 CPU profile (CDP Profiler.stop), top-N by each, plus special buckets. */
function summariseProfile(profile: CpuProfile, top = 15) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const keyOf = (id: number): string => {
    const cf = byId.get(id)!.callFrame;
    const file = cf.url ? (cf.url.split("/").pop() ?? "").split("?")[0] : "";
    return `${cf.functionName || "(anonymous)"} @ ${file || "native"}:${cf.lineNumber + 1}`;
  };
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const self = new Map<string, number>();
  const inclusive = new Map<string, number>();
  const files = new Map<string, number>();
  const special = { idle: 0, program: 0, gc: 0, root: 0 };
  let totalMs = 0;
  for (let i = 0; i < samples.length; i++) {
    const ms = (deltas[i + 1] ?? deltas[i] ?? 0) / 1000; // a sample lasts until the next one
    const id = samples[i]!;
    const name = byId.get(id)!.callFrame.functionName;
    totalMs += ms;
    if (name === "(idle)") { special.idle += ms; continue; }
    if (name === "(program)") special.program += ms;
    else if (name === "(garbage collector)") special.gc += ms;
    else if (name === "(root)") special.root += ms;
    const key = keyOf(id);
    self.set(key, (self.get(key) ?? 0) + ms);
    const file = byId.get(id)!.callFrame.url.split("/").pop()?.split("?")[0] || "native";
    files.set(file, (files.get(file) ?? 0) + ms);
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const k = keyOf(cur);
      if (!seen.has(k)) { seen.add(k); inclusive.set(k, (inclusive.get(k) ?? 0) + ms); }
    }
  }
  const busyMs = totalMs - special.idle;
  const rank = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([fn, ms]) => ({ fn, ms: Math.round(ms * 100) / 100, pct: busyMs > 0 ? Math.round((ms / busyMs) * 1000) / 10 : 0 }));
  return { totalMs: Math.round(totalMs), busyMs: Math.round(busyMs), special: { idleMs: Math.round(special.idle), programMs: Math.round(special.program), gcMs: Math.round(special.gc) }, topSelf: rank(self, top), topInclusive: rank(inclusive, top), byFile: rank(files, 8), sampleCount: samples.length };
}

const emitAux = (name: string, value: unknown): void => {
  console.log(`BENCH_AUX_BEGIN ${name}`);
  emitChunks(`BENCH_AUX:${name}`, Buffer.from(JSON.stringify(value)).toString("base64"));
  console.log(`BENCH_AUX_END ${name}`);
};
const sleep = (ms: number) => new Promise<null>((resolveSleep) => setTimeout(() => resolveSleep(null), ms));

/** WP-0.3: V8 CPU profile of the first-frame path and of 60 steady frames, on UNMINIFIED builds so function names are readable. */
async function profileGroup(browser: Browser, targets: ReadonlyArray<readonly [string, string]>): Promise<void> {
  const work = process.env.BENCH_PROFILE_WORK ?? "/tmp/bench-profile";
  for (const scene of new Set(targets.map((t) => t[0]))) {
    const libs = targets.filter((t) => t[0] === scene).map((t) => t[1]);
    execFileSync("node", ["tools/bench-vs-threejs/harness/build-all.mjs", "/repo/tools/bench-vs-threejs", work, "/repo/fixtures", scene, libs.join(",")], { stdio: "inherit", timeout: 900_000, env: { ...process.env, BENCH_MINIFY: "false" } });
  }
  for (const [scene, lib] of targets) {
    const { server, origin } = await serve(join(work, "dist", scene, lib));
    try {
      // First-frame path: profiler running from before navigation until the first frame is ready.
      const first = await openAppProfiled(browser, origin, true);
      let firstFrame: Record<string, unknown>;
      try {
        await first.page.waitForFunction(() => Boolean((window as BenchWin).__BENCH__?.ready) || ((window as BenchWin).__BENCH__?.errors.length ?? 0) > 0, undefined, { timeout: 180_000 });
        const timing = await first.page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
          const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
          const js = res.filter((r) => /\.m?js(\?|$)/.test(r.name));
          return { firstFrameMs: (window as BenchWin).__BENCH__!.firstFrameMs, domContentLoadedMs: nav.domContentLoadedEventEnd, lastJsResponseEndMs: Math.max(0, ...js.map((r) => r.responseEnd)), jsRequests: js.length, allRequests: res.length };
        });
        const prof = (await first.cdp.send("Profiler.stop")).profile as unknown as CpuProfile;
        firstFrame = { ...timing, afterLastJsMs: timing.firstFrameMs - timing.lastJsResponseEndMs, profile: summariseProfile(prof) };
      } finally { await first.context.close(); }

      // Steady state: 60 frames (frame + readPixels sync, as the timing groups do), profiler on for exactly those frames.
      const steady = await openAppProfiled(browser, origin, false);
      let steadyFrames: Record<string, unknown>;
      try {
        await steady.page.waitForFunction(() => Boolean((window as BenchWin).__BENCH__?.ready), undefined, { timeout: 180_000 });
        await steady.page.evaluate(() => { for (let i = 0; i < 10; i++) (window as BenchWin).__BENCH__!.frame(1 / 60); });
        await steady.cdp.send("Profiler.start");
        const wall = await steady.page.evaluate(() => {
          const b = (window as BenchWin).__BENCH__!;
          const t0 = performance.now(); let cpu = 0;
          for (let i = 0; i < 60; i++) { const a = performance.now(); b.frameRaw(1 / 60); cpu += performance.now() - a; b.sync(); }
          return { wallMs: performance.now() - t0, cpuInsideFrameMs: cpu };
        });
        const prof = (await steady.cdp.send("Profiler.stop")).profile as unknown as CpuProfile;
        steadyFrames = { frames: 60, wallMsPerFrame: wall.wallMs / 60, cpuInsideFrameMsPerFrame: wall.cpuInsideFrameMs / 60, profile: summariseProfile(prof) };
      } finally { await steady.context.close(); }
      emitAux(`profile-${scene}-${lib}`, { scene, lib, minified: false, firstFrame, steady: steadyFrames });
      console.log(`BENCH_DONE profile ${scene}/${lib}`);
    } finally { server.close(); }
  }
}

async function openAppProfiled(browser: Browser, origin: string, profileFromNavigation: boolean) {
  const context: BrowserContext = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const page: Page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  if (profileFromNavigation) await cdp.send("Profiler.start");
  await page.goto(`${origin}/index.html`, { waitUntil: "domcontentloaded" });
  return { context, page, cdp };
}

/** Logs every GL call slower than 500 ms and per-method totals every 10 s, so a stall is attributable even if the page never returns. */
const GL_TIMING_HOOK = `(() => {
  const proto = WebGL2RenderingContext.prototype;
  const tot = {}; window.__GLT__ = tot;
  const t0 = performance.now(); let lastLog = t0;
  const names = ["compileShader","linkProgram","getProgramParameter","getShaderParameter","getProgramInfoLog","getShaderInfoLog","useProgram","bufferData","bufferSubData","texImage2D","texImage3D","texStorage2D","texSubImage2D","generateMipmap","readPixels","clear","clearBufferfv","blitFramebuffer","drawElements","drawArrays","drawElementsInstanced","drawArraysInstanced","finish","flush","getError","checkFramebufferStatus"];
  for (const name of names) {
    const orig = proto[name]; if (!orig) continue;
    proto[name] = function (...a) {
      const s = performance.now();
      const r = orig.apply(this, a);
      const e = performance.now(); const d = e - s;
      const t = tot[name] || (tot[name] = { n: 0, ms: 0, max: 0 });
      t.n++; t.ms += d; if (d > t.max) t.max = d;
      if (d > 500) console.log("GLSLOW " + name + " " + d.toFixed(0) + "ms at +" + ((e - t0) / 1000).toFixed(1) + "s");
      if (e - lastLog > 10000) { lastLog = e; console.log("GLTOT " + JSON.stringify(tot)); }
      return r;
    };
  }
})();`;

/** WP-0.4: Aura3D forest on software GL with a hard wall-clock cap (default 10 min); records where the time goes. */
async function forestStall(browser: Browser): Promise<void> {
  const capMs = Number(process.env.BENCH_FOREST_CAP_MS ?? 600_000);
  const work = process.env.BENCH_FOREST_WORK ?? "/tmp/bench-forest";
  execFileSync("node", ["tools/bench-vs-threejs/harness/build-all.mjs", "/repo/tools/bench-vs-threejs", work, "/repo/fixtures", "forest", "aura"], { stdio: "inherit", timeout: 900_000, env: { ...process.env, BENCH_MINIFY: "false" } });
  const { server, origin } = await serve(join(work, "dist", "forest", "aura"));
  const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  await context.addInitScript(GL_HOOK);
  await context.addInitScript(GL_TIMING_HOOK);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const started = Date.now();
  const log: string[] = [];
  page.on("console", (m) => {
    const text = m.text();
    if (text.startsWith("GLSLOW") || text.startsWith("GLTOT")) {
      const line = `+${((Date.now() - started) / 1000).toFixed(1)}s ${text.slice(0, 1500)}`;
      if (log.length < 400) log.push(line);
      console.log(`[forest-stall] ${line}`);
    } else if (m.type() === "error" || m.type() === "warning") log.push(`+${((Date.now() - started) / 1000).toFixed(1)}s [${m.type()}] ${text.slice(0, 300)}`);
  });
  try {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 2000 });
    await cdp.send("Profiler.start");
    await page.goto(`${origin}/index.html`, { waitUntil: "domcontentloaded" });
    const state = await page.waitForFunction(() => Boolean((window as BenchWin).__BENCH__?.ready) || ((window as BenchWin).__BENCH__?.errors.length ?? 0) > 0, undefined, { timeout: capMs, polling: 1000 }).then(() => "ready" as const).catch(() => "cap" as const);
    const readyAtMs = Date.now() - started;
    const frames: Array<{ cpuMs: number; totalMs: number }> = [];
    let capped = state === "cap";
    let errors: string[] = [];
    if (state === "ready") {
      const first = await page.evaluate(() => ({ firstFrameMs: (window as BenchWin).__BENCH__!.firstFrameMs, ready: (window as BenchWin).__BENCH__!.ready, errors: (window as BenchWin).__BENCH__!.errors }));
      errors = first.errors;
      if (first.ready) {
        for (let i = 0; i < 30 && !capped; i++) {
          const remaining = capMs - (Date.now() - started);
          if (remaining <= 0) { capped = true; break; }
          const r = await Promise.race([page.evaluate(() => { const b = (window as BenchWin).__BENCH__!; const t0 = performance.now(); b.frameRaw(1 / 60); const t1 = performance.now(); b.sync(); return { cpuMs: t1 - t0, totalMs: performance.now() - t0 }; }), sleep(remaining)]);
          if (!r) capped = true; else frames.push(r);
        }
      }
    }
    const profile = await Promise.race([cdp.send("Profiler.stop").then((r) => r.profile as unknown as CpuProfile), sleep(120_000)]);
    const glTotals = await Promise.race([page.evaluate(() => (window as unknown as { __GLT__?: unknown }).__GLT__ ?? null).catch(() => null), sleep(30_000)]);
    const counters = await Promise.race([page.evaluate(() => (window as BenchWin).__GLC__ ?? null).catch(() => null), sleep(30_000)]);
    emitAux("forest-stall-aura", {
      capMs, state, capped, readyAtMs, framesCompleted: frames.length, frames, errors, wallMs: Date.now() - started,
      glTotals, glCounters: counters, log: log.slice(0, 400), profile: profile ? summariseProfile(profile) : null
    });
  } finally {
    await context.close().catch(() => undefined);
    server.close();
  }
}

test.describe("aura3d vs three.js benchmark", () => {
  test.setTimeout(3_300_000);
  // One test per line on purpose: tools/remote-acr/run.sh selects a group with `<spec>:<line>` so groups run in parallel on separate runners.
  test("group A: baseline, pbr-viewer, game-loop", async ({ browser }) => runGroup(browser, ["baseline", "pbr-viewer", "game-loop"]));
  test("group B: forest", async ({ browser }) => runGroup(browser, ["forest"]));
  test("group C: skinned-character", async ({ browser }) => runGroup(browser, ["skinned-character"]));
  test("group D: shader-water", async ({ browser }) => runGroup(browser, ["shader-water"]));
  test("group E: three.js with 4x MSAA (equalised antialiasing), all scenes", async ({ browser }) => runGroup(browser, ALL_SCENES, ["three-msaa"]));
  test("group F: pbr-viewer, all three variants (exposure re-tuned after the first pass)", async ({ browser }) => runGroup(browser, ["pbr-viewer"], ["three", "aura", "three-msaa"]));
  test("group G: CPU profiles (first frame and 60 steady frames), baseline cube and pbr-viewer", async ({ browser }) => profileGroup(browser, [["baseline", "aura"], ["baseline", "three-msaa"], ["pbr-viewer", "aura"]]));
  test("group H: forest stall hunt, Aura3D, 10-minute cap", async ({ browser }) => forestStall(browser));
});
