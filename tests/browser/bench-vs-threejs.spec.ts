import { execFileSync } from "node:child_process";
import { cpus } from "node:os";
import { readFileSync, statSync, createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Aura3D 4.1.2 vs three.js 0.185.1 measured benchmark (tools/bench-vs-threejs). Remote only (tools/remote-acr/run.sh,
 * software WebGL2 on a CPU runner): timings are NOT GPU timings. Results leave the container through the run log as
 * base64 chunks between BENCH_RESULTS_JSON_BEGIN/END, reassembled by tools/bench-vs-threejs/harness/extract.mjs.
 */
const WORK = process.env.BENCH_WORK ?? "/tmp/bench";
const ALL_SCENES = ["baseline", "pbr-viewer", "forest", "skinned-character", "game-loop", "shader-water"] as const;
const LIBS: readonly string[] = ["three", "aura"];
const MEASURE_FRAMES = Number(process.env.BENCH_FRAMES ?? 60);
const COLD_LOADS = 3;
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
  await page.waitForFunction(() => Boolean((window as BenchWin).__BENCH__), undefined, { timeout: 120_000 });
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
        let record: Record<string, unknown> = {};
        for (let load = 0; load < plan.loads; load++) {
          const app = await openApp(browser, origin, scene, lib);
          const { page } = app;
          try {
            await page.waitForFunction(() => Boolean((window as BenchWin).__BENCH__?.ready) || ((window as BenchWin).__BENCH__?.errors.length ?? 0) > 0, undefined, { timeout: 120_000 });
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
          } finally {
            await app.context.close();
          }
        }
        results[lib] = { ...record, ttffMs: ttff.length ? { samples: ttff, median: stats(ttff).median } : null, build: build.apps[key] };
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

test.describe("aura3d vs three.js benchmark", () => {
  test.setTimeout(3_300_000);
  // One test per line on purpose: tools/remote-acr/run.sh selects a group with `<spec>:<line>` so groups run in parallel on separate runners.
  test("group A: baseline, pbr-viewer, game-loop", async ({ browser }) => runGroup(browser, ["baseline", "pbr-viewer", "game-loop"]));
  test("group B: forest", async ({ browser }) => runGroup(browser, ["forest"]));
  test("group C: skinned-character", async ({ browser }) => runGroup(browser, ["skinned-character"]));
  test("group D: shader-water", async ({ browser }) => runGroup(browser, ["shader-water"]));
  test("group E: three.js with 4x MSAA (equalised antialiasing), all scenes", async ({ browser }) => runGroup(browser, ALL_SCENES, ["three-msaa"]));
  test("group F: pbr-viewer, all three variants (exposure re-tuned after the first pass)", async ({ browser }) => runGroup(browser, ["pbr-viewer"], ["three", "aura", "three-msaa"]));
});
