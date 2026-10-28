import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Aura3D per-frame cost probe (remote only, software WebGL2): per-pass GPU-wait segments, GL call counts, and a CDP JS CPU profile of
 * the production renderer, built from WORKSPACE source through the example dev server. Output leaves the container as
 * `PERFCOST_CHUNK <name> <i> <n> <base64>` lines in the run log (tests/browser/perf-frame-cost/extract.mjs rebuilds the JSON).
 * Timings are software-rasteriser timings, not GPU timings.
 */
interface Cfg { id: string; query: string; frames: number; modes: readonly Mode[]; budgetMs?: number }
type Mode = "plain" | "counts" | "segments";

const GL_HOOK = `(() => {
  const mode = window.__GLMODE__;
  const P = window.__GLP__ = { calls: {}, bytes: { buf: 0, tex: 0 }, segs: [], rec: false };
  const proto = WebGL2RenderingContext.prototype;
  const O = {};
  let gl = null;
  const sink = new Uint8Array(4);
  const fboIds = new WeakMap(), rbInfo = new WeakMap(), fboAtt = new WeakMap();
  let nextFbo = 1, boundRb = null, drawFbo = null, readFbo = null, vp = "0x0", seg = null, curProgram = null;
  const newSeg = () => ({ fbo: drawFbo, t0: performance.now(), draws: 0, tris: 0, inst: 0, clears: 0, progs: new Set(), upBuf: 0, upTex: 0, vps: new Set() });
  const label = (f) => { if (!f) return "default"; const id = fboIds.get(f); const att = fboAtt.get(f) || []; return "fbo" + id + "[" + att.join("+") + "]"; };
  const tri = (m, c, n) => (m === 4 ? c / 3 : m === 5 || m === 6 ? Math.max(0, c - 2) : 0) * n;
  const sync = () => {
    if (!gl) return;
    O.bindFramebuffer.call(gl, 36008, null);
    O.readPixels.call(gl, 0, 0, 1, 1, 6408, 5121, sink);
    O.bindFramebuffer.call(gl, 36008, readFbo);
  };
  const closeSeg = (kind, extra) => {
    if (!seg) seg = newSeg();
    const a = performance.now();
    sync();
    const b = performance.now();
    P.segs.push(Object.assign({ kind, fbo: label(seg.fbo), draws: seg.draws, tris: Math.round(seg.tris), inst: seg.inst, clears: seg.clears, progs: seg.progs.size, vps: [...seg.vps], upBuf: seg.upBuf, upTex: seg.upTex, fullscreen: seg.fullscreen || null, jsMs: +(a - seg.t0).toFixed(3), waitMs: +(b - a).toFixed(3) }, extra || {}));
    seg = newSeg();
  };
  for (const name of Object.getOwnPropertyNames(proto)) {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (name === "constructor" || typeof d.value !== "function") continue;
    const fn = d.value;
    O[name] = fn;
    proto[name] = function (...a) { gl = this; if (P.rec) P.calls[name] = (P.calls[name] | 0) + 1; return fn.apply(this, a); };
  }
  const wrap = (name, f) => { const g = proto[name]; proto[name] = function (...a) { return f.call(this, g, a); }; };
  wrap("createFramebuffer", function (g, a) { const f = g.apply(this, a); fboIds.set(f, nextFbo++); fboAtt.set(f, []); return f; });
  wrap("bindRenderbuffer", function (g, a) { boundRb = a[1]; return g.apply(this, a); });
  wrap("renderbufferStorageMultisample", function (g, a) { if (boundRb) rbInfo.set(boundRb, "rb" + a[3] + "x" + a[4] + "ms" + a[1]); return g.apply(this, a); });
  wrap("renderbufferStorage", function (g, a) { if (boundRb) rbInfo.set(boundRb, "rb" + a[2] + "x" + a[3]); return g.apply(this, a); });
  wrap("framebufferRenderbuffer", function (g, a) { const f = a[0] === 36008 ? readFbo : drawFbo; if (f) { const l = fboAtt.get(f); const s = (a[1] === 36096 ? "D:" : "C:") + (rbInfo.get(a[3]) || "rb?"); if (!l.includes(s)) l.push(s); } return g.apply(this, a); });
  wrap("framebufferTexture2D", function (g, a) { const f = a[0] === 36008 ? readFbo : drawFbo; if (f) { const l = fboAtt.get(f); const s = (a[1] === 36096 ? "D:" : "C:") + "tex"; if (!l.includes(s)) l.push(s); } return g.apply(this, a); });
  wrap("framebufferTextureLayer", function (g, a) { const f = a[0] === 36008 ? readFbo : drawFbo; if (f) { const l = fboAtt.get(f); const s = (a[1] === 36096 ? "D:" : "C:") + "texlayer"; if (!l.includes(s)) l.push(s); } return g.apply(this, a); });
  wrap("viewport", function (g, a) { vp = a[2] + "x" + a[3]; if (seg) seg.vps.add(vp); return g.apply(this, a); });
  wrap("useProgram", function (g, a) { curProgram = a[0]; if (seg && a[0]) seg.progs.add(a[0]); return g.apply(this, a); });
  wrap("bindFramebuffer", function (g, a) {
    const t = a[0], f = a[1];
    if (P.rec && mode === "segments" && (t === 36160 || t === 36009) && f !== drawFbo) closeSeg("pass");
    const r = g.apply(this, a);
    if (t === 36160 || t === 36009) drawFbo = f;
    if (t === 36160 || t === 36008) readFbo = f;
    if (seg && (t === 36160 || t === 36009)) { seg.fbo = f; }
    return r;
  });
  const drawWrap = (name, countIdx, instIdx) => wrap(name, function (g, a) {
    if (P.rec) {
      const n = instIdx === undefined ? 1 : a[instIdx];
      if (!seg) seg = newSeg();
      seg.draws++; seg.inst += n; seg.tris += tri(a[0], a[countIdx], n); seg.vps.add(vp);
      P.draws = (P.draws | 0) + 1; P.tris = (P.tris || 0) + tri(a[0], a[countIdx], n); P.inst = (P.inst || 0) + n;
    }
    return g.apply(this, a);
  });
  const progInfo = new WeakMap();
  const describeProgram = (prog) => {
    if (!gl || !prog) return null;
    let info = progInfo.get(prog);
    if (info) return info;
    const shaders = O.getAttachedShaders.call(gl, prog) || [];
    let fs = "";
    for (const s of shaders) { if (O.getShaderParameter.call(gl, s, 35663) === 35632) fs = O.getShaderSource.call(gl, s) || ""; }
    const tags = [];
    for (const [tag, needle] of [["ldr-legacy", "u_hasToneMapping"], ["finalize", "u_rcasSharpness"], ["fxaa", "ApplyFXAA"], ["bloom", "u_bloom"], ["shadow-depth", "depth"], ["pbr", "u_baseColorFactor"], ["fog", "fog"]]) if (fs.includes(needle)) tags.push(tag);
    const uniforms = {};
    const n = O.getProgramParameter.call(gl, prog, 35718);
    for (let i = 0; i < n; i++) {
      const u = O.getActiveUniform.call(gl, prog, i);
      if (!u) continue;
      const loc = O.getUniformLocation.call(gl, prog, u.name);
      try { const v = O.getUniform.call(gl, prog, loc); uniforms[u.name] = typeof v === "object" && v && v.length !== undefined ? Array.from(v).slice(0, 4) : v; } catch (e) { uniforms[u.name] = "?"; }
    }
    for (let guard = 0; guard < 16 && O.getError.call(gl) !== 0; guard++) { /* drain errors raised by the introspection above so the engine's frame error check never sees them */ }
    info = { fsLen: fs.length, tags, uniforms };
    progInfo.set(prog, info);
    return info;
  };
  wrap("drawArrays", function (g, a) {
    if (P.rec && mode === "segments" && a[2] === 3) { if (!seg) seg = newSeg(); seg.fullscreen = describeProgram(curProgram); }
    return g.apply(this, a);
  });
  drawWrap("drawArrays", 2); drawWrap("drawElements", 1); drawWrap("drawArraysInstanced", 2, 3); drawWrap("drawElementsInstanced", 1, 4); drawWrap("drawRangeElements", 3);
  wrap("clear", function (g, a) { if (P.rec && seg) seg.clears++; return g.apply(this, a); });
  const bytesOf = (d) => (d && d.byteLength) || 0;
  wrap("bufferData", function (g, a) { if (P.rec) { const n = typeof a[1] === "number" ? a[1] : bytesOf(a[1]); P.bytes.buf += n; if (seg) seg.upBuf += n; } return g.apply(this, a); });
  wrap("bufferSubData", function (g, a) { if (P.rec) { const n = bytesOf(a[2]); P.bytes.buf += n; if (seg) seg.upBuf += n; } return g.apply(this, a); });
  wrap("texImage2D", function (g, a) { if (P.rec) { const last = a[a.length - 1]; const n = bytesOf(last) || (a.length >= 9 ? a[3] * a[4] * 4 : 0); P.bytes.tex += n; if (seg) seg.upTex += n; } return g.apply(this, a); });
  wrap("texSubImage2D", function (g, a) { if (P.rec) { const last = a[a.length - 1]; const n = bytesOf(last) || (a.length >= 9 ? a[4] * a[5] * 4 : 0); P.bytes.tex += n; if (seg) seg.upTex += n; } return g.apply(this, a); });
  wrap("blitFramebuffer", function (g, a) {
    const src = label(readFbo), dst = label(drawFbo);
    const r = g.apply(this, a);
    if (P.rec && mode === "segments") closeSeg("blit", { blit: src + " -> " + dst + " " + (a[2] - a[0]) + "x" + (a[3] - a[1]) + "->" + (a[6] - a[4]) + "x" + (a[7] - a[5]) });
    else if (P.rec) (P.blits = P.blits || []).push(src + " -> " + dst + " " + (a[2] - a[0]) + "x" + (a[3] - a[1]));
    return r;
  });
  P.begin = () => { P.calls = {}; P.bytes = { buf: 0, tex: 0 }; P.segs = []; P.draws = 0; P.tris = 0; P.inst = 0; P.blits = []; P.rec = true; seg = newSeg(); };
  P.end = () => { if (mode === "segments") closeSeg("tail"); P.rec = false; return { calls: P.calls, bytes: P.bytes, segs: P.segs, draws: P.draws, tris: P.tris, inst: P.inst, blits: P.blits }; };
})();`;

const stats = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, median: s[Math.floor(s.length / 2)]!, min: s[0]!, max: s[s.length - 1]!, mean: xs.reduce((a, b) => a + b, 0) / xs.length };
};

const emit = (name: string, value: unknown): void => {
  const b64 = Buffer.from(JSON.stringify(value)).toString("base64");
  const size = 3000, n = Math.ceil(b64.length / size);
  mkdirSync("tests/reports/perf-frame-cost", { recursive: true });
  writeFileSync(`tests/reports/perf-frame-cost/${name}.json`, JSON.stringify(value));
  for (let i = 0; i < n; i++) console.log(`PERFCOST_CHUNK ${name} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}`);
};

interface CpuNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }
function summariseProfile(profile: { nodes: CpuNode[]; samples: number[]; timeDeltas: number[] }) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map<number, number>();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const fn = new Map<string, number>(), file = new Map<string, number>();
  let total = 0;
  for (const [id, us] of self) {
    const cf = byId.get(id)!.callFrame;
    const short = cf.url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
    const key = `${cf.functionName || "(anon)"} ${short}:${cf.lineNumber + 1}`;
    fn.set(key, (fn.get(key) ?? 0) + us);
    file.set(short || "(native)", (file.get(short || "(native)") ?? 0) + us);
    total += us;
  }
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => ({ k, ms: +(us / 1000).toFixed(1), pct: +((us / total) * 100).toFixed(1) }));
  return { totalMs: +(total / 1000).toFixed(1), topFunctions: top(fn, 30), topFiles: top(file, 15) };
}

async function openProbe(browser: Browser, origin: string, query: string, mode: Mode): Promise<{ page: Page; close: () => Promise<void>; errors: string[] }> {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  if (mode !== "plain") {
    await context.addInitScript(`window.__GLMODE__ = ${JSON.stringify(mode)};`);
    await context.addInitScript(GL_HOOK);
  }
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  await page.goto(`${origin}/tests/browser/perf-frame-cost/index.html?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __PROBE__?: unknown }).__PROBE__), undefined, { timeout: 1_200_000 });
  return { page, close: () => context.close(), errors };
}

async function runConfig(browser: Browser, cfg: Cfg): Promise<void> {
  const server = await startExampleDevServer();
  try {
    for (const mode of cfg.modes) {
      const t0 = Date.now();
      const { page, close, errors } = await openProbe(browser, server.origin, cfg.query, mode);
      try {
        const probe = await page.evaluate(() => { const p = (window as unknown as { __PROBE__: { ready: boolean; error?: string; setup?: unknown } }).__PROBE__; return { ready: p.ready, error: p.error, setup: p.setup }; });
        if (!probe.ready) { emit(`${cfg.id}.${mode}`, { cfg, mode, failed: probe.error, errors }); continue; }
        const dt = 1 / 60;
        const budget = cfg.budgetMs ?? 600_000;
        const one = () => page.evaluate((step) => (window as unknown as { __PROBE__: { frame(d: number): { cpuMs: number; totalMs: number } } }).__PROBE__.frame(step), dt);
        const first = await one();
        const warm: Array<{ cpuMs: number; totalMs: number }> = [];
        for (let i = 0; i < 3; i++) warm.push(await one());
        const result: Record<string, unknown> = { cfg, mode, setup: probe.setup, firstFrame: first, warm };
        const spent = () => Date.now() - t0;

        if (mode === "plain") {
          const samples: Array<{ cpuMs: number; totalMs: number }> = [];
          const cdp = await page.context().newCDPSession(page);
          await cdp.send("Profiler.enable");
          await cdp.send("Profiler.setSamplingInterval", { interval: 400 });
          await cdp.send("Profiler.start");
          for (let i = 0; i < cfg.frames && spent() < budget; i++) samples.push(await one());
          const { profile } = await cdp.send("Profiler.stop") as { profile: { nodes: CpuNode[]; samples: number[]; timeDeltas: number[] } };
          result.cpuMs = stats(samples.map((s) => s.cpuMs));
          result.totalMs = stats(samples.map((s) => s.totalMs));
          result.frames = samples.length;
          result.profile = summariseProfile(profile);
          result.diagnostics = await page.evaluate(() => (window as unknown as { __PROBE__: { diagnostics(): unknown } }).__PROBE__.diagnostics());
          result.meanLuma = await page.evaluate(() => (window as unknown as { __PROBE__: { luma(): number } }).__PROBE__.luma());
        } else {
          const rec: unknown[] = [];
          const n = mode === "segments" ? Math.min(cfg.frames, 3) : Math.min(cfg.frames, 3);
          for (let i = 0; i < n && spent() < budget; i++) {
            rec.push(await page.evaluate((step) => {
              const w = window as unknown as { __GLP__: { begin(): void; end(): unknown }; __PROBE__: { frame(d: number): { cpuMs: number; totalMs: number } } };
              w.__GLP__.begin();
              const timing = w.__PROBE__.frame(step);
              return { timing, gl: w.__GLP__.end() };
            }, dt));
          }
          result.recorded = rec;
        }
        result.errors = errors.slice(0, 20);
        result.wallMs = Date.now() - t0;
        emit(`${cfg.id}.${mode}`, result);
        console.log(`PERFCOST_DONE ${cfg.id}.${mode} ${result.wallMs}ms`);
      } finally {
        await close();
      }
    }
  } finally {
    await server.close();
  }
}

const M: readonly Mode[] = ["plain", "counts", "segments"];
const cfg = (id: string, query: string, frames: number, modes: readonly Mode[] = M, budgetMs?: number): Cfg => ({ id, query, frames, modes, budgetMs });

test.describe("aura3d per-frame cost probe", () => {
  test.setTimeout(3_300_000);
  // One test per line: tools/remote-acr/run.sh selects a group with `<spec>:<line>` so groups run in parallel on separate runners.
  test("cube", async ({ browser }) => { for (const c of [cfg("cube", "scene=cube", 30), cfg("cube-envnone", "scene=cube&env=none", 6, ["plain"]), cfg("cube-bloom", "scene=cube&bloom=1", 10), cfg("cube-shadow", "scene=cube&cubeshadow=1", 10)]) await runConfig(browser, c); });
  test("bench scenes", async ({ browser }) => { for (const c of [cfg("bench-game-loop", "scene=bench&name=game-loop", 20), cfg("bench-shader-water", "scene=bench&name=shader-water", 20)]) await runConfig(browser, c); });
  test("forest small", async ({ browser }) => { for (const c of [cfg("forest-n250", "scene=forest&trees=200&rocks=50", 5), cfg("forest-n1000", "scene=forest&trees=800&rocks=200", 5)]) await runConfig(browser, c); });
  test("forest mid", async ({ browser }) => { for (const c of [cfg("forest-n2500", "scene=forest&trees=2000&rocks=500", 4), cfg("forest-n5000", "scene=forest&trees=4000&rocks=1000", 3)]) await runConfig(browser, c); });
  test("forest full", async ({ browser }) => { await runConfig(browser, cfg("forest-n10000", "scene=forest&trees=8000&rocks=2000", 2, M, 1_500_000)); });
  test("forest full ablate", async ({ browser }) => { for (const c of [cfg("forest-n10000-noshadow", "scene=forest&trees=8000&rocks=2000&shadow=0", 3, ["plain", "counts"], 900_000), cfg("forest-n10000-nofog", "scene=forest&trees=8000&rocks=2000&fog=0", 3, ["plain"], 900_000), cfg("forest-n10000-plain", "scene=forest&trees=8000&rocks=2000&shadow=0&fog=0", 3, ["plain"], 900_000)]) await runConfig(browser, c); });
  test("forest ablate", async ({ browser }) => { for (const c of [cfg("forest-n2500-noshadow", "scene=forest&trees=2000&rocks=500&shadow=0", 4), cfg("forest-n2500-nofog", "scene=forest&trees=2000&rocks=500&fog=0", 4), cfg("forest-n2500-plain", "scene=forest&trees=2000&rocks=500&shadow=0&fog=0", 4)]) await runConfig(browser, c); });
});

test.describe("aura3d gl micro", () => {
  test.setTimeout(900_000);
  test("gl micro", async ({ browser }) => {
    const server = await startExampleDevServer();
    try {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      const legacy = readFileSync("packages/rendering/src/webgl2/LegacyPost.ts", "utf8");
      const marker = "FRAGMENT_SHADER, `#version 300 es\nprecision highp float;\nuniform sampler2D u_source;\nuniform vec2 u_texelSize;\nuniform int u_hasToneMapping;";
      const start = legacy.indexOf(marker);
      const body = start >= 0 ? legacy.slice(start + "FRAGMENT_SHADER, `".length, legacy.indexOf("`, \"webgl2-ldr-postprocess\"", start)) : "";
      await context.addInitScript(`window.__LDR_FS__ = ${JSON.stringify(body)};`);
      const page = await context.newPage();
      await page.goto(`${server.origin}/tests/browser/perf-frame-cost/glmicro.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as { __MICRO__?: unknown }).__MICRO__), undefined, { timeout: 600_000 });
      emit("glmicro", await page.evaluate(() => (window as unknown as { __MICRO__: unknown }).__MICRO__));
      await context.close();
    } finally { await server.close(); }
  });
});
