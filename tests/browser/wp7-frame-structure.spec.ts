import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { test } from "@playwright/test";

/**
 * PRD-2 WP-7: structure of one steady frame of the skinned-character and game-loop bench scenes (draw order, framebuffer,
 * program identity and defines per draw), plus steady frame time and a matched frame capture per arm.
 * Remote only (tools/remote-acr/run.sh, software WebGL2): timings are software-rasteriser times, never GPU times.
 *
 *   tools/bench-vs-threejs/harness/run-wp7.sh
 *
 * Needs tools/bench-vs-threejs/candidate.json (run-wp7.sh stages it) so the Aura3D arms are built from workspace sources:
 * `aura-auto` (scene as written) and `aura-production` (same source with quality: "production").
 * Output leaves the container as base64 chunks between WP7_JSON_BEGIN/END (decode with tools/bench-vs-threejs/harness/wp7-extract.mjs).
 */
const WORK = process.env.WP7_WORK ?? "/tmp/wp7";
const SCENES = (process.env.WP7_SCENES ?? "game-loop,skinned-character").split(",");
const LIBS = (process.env.WP7_LIBS ?? "three-msaa,aura-auto,aura-production").split(",");
const MEASURE_FRAMES = Number(process.env.WP7_FRAMES ?? 60);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".hdr": "application/octet-stream", ".wasm": "application/wasm", ".png": "image/png" };

const NOMINIFY = existsSync("/repo/tools/bench-vs-threejs/wp7-nominify");
const GL_HOOK = `(() => {
  const proto = WebGL2RenderingContext.prototype;
  const STACKS = %STACKS%;
  const S = { frameNo: 0, frame: [], programs: {}, cur: null, fbId: 0, fbs: new WeakMap(), fbCount: 0, vp: "", recording: false, clears: 0, blits: 0, invalidates: 0, progOrder: [] };
  window.__WP7__ = S;
  const ids = new WeakMap(); let nextProg = 1;
  const pid = (p) => { if (!p) return 0; if (!ids.has(p)) ids.set(p, nextProg++); return ids.get(p); };
  const shaderSrc = new WeakMap();
  const ss = proto.shaderSource; proto.shaderSource = function (sh, src) { shaderSrc.set(sh, src); return ss.call(this, sh, src); };
  const attached = new WeakMap();
  const as = proto.attachShader; proto.attachShader = function (p, sh) { (attached.get(p) || attached.set(p, []).get(p)).push(sh); return as.call(this, p, sh); };
  const lp = proto.linkProgram; proto.linkProgram = function (p) {
    const out = lp.call(this, p);
    const shs = attached.get(p) || [];
    const srcs = shs.map((s) => shaderSrc.get(s) || "");
    const defs = []; for (const s of srcs) for (const m of s.matchAll(/^#define\\s+(\\S+)(?:\\s+(\\S+))?/gm)) defs.push(m[1] + (m[2] ? "=" + m[2] : ""));
    let h = 0; for (const s of srcs) for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const id = pid(p);
    S.programs[id] = { id, stack: STACKS ? new Error().stack.split("\\n").slice(2, 14).map((l) => l.trim().replace(/\\(?https?:\\/\\/[^/]+/, "(")).join(" | ") : "", frameAt: S.frameNo, hash: (h >>> 0).toString(16), lens: srcs.map((s) => s.length), defines: [...new Set(defs)].sort(), uniforms: (() => { try { return this.getProgramParameter(p, this.ACTIVE_UNIFORMS); } catch { return -1; } })() };
    return out;
  };
  const up = proto.useProgram; proto.useProgram = function (p) { S.cur = p; return up.call(this, p); };
  const bf = proto.bindFramebuffer; proto.bindFramebuffer = function (t, f) {
    if (f && !S.fbs.has(f)) S.fbs.set(f, ++S.fbCount);
    S.fbId = f ? S.fbs.get(f) : 0; return bf.call(this, t, f);
  };
  const vpf = proto.viewport; proto.viewport = function (x, y, w, h) { S.vp = w + "x" + h; return vpf.call(this, x, y, w, h); };
  const cl = proto.clear; proto.clear = function (m) { if (S.recording) { S.clears++; S.frame.push({ k: "clear", mask: m, fb: S.fbId, vp: S.vp }); } return cl.call(this, m); };
  const blit = proto.blitFramebuffer; proto.blitFramebuffer = function (...a) { if (S.recording) { S.blits++; S.frame.push({ k: "blit", fb: S.fbId, vp: S.vp }); } return blit.apply(this, a); };
  const rec = (name, countIdx, instIdx) => {
    const orig = proto[name]; if (!orig) return;
    proto[name] = function (...a) {
      if (S.recording) S.frame.push({ k: "draw", fn: name, fb: S.fbId, prog: pid(S.cur), vp: S.vp, count: a[countIdx], inst: instIdx === undefined ? 1 : a[instIdx], mode: a[0], dm: this.getParameter(this.DEPTH_WRITEMASK) ? 1 : 0, depth: this.isEnabled(this.DEPTH_TEST) ? 1 : 0, blend: this.isEnabled(this.BLEND) ? 1 : 0, cull: this.isEnabled(this.CULL_FACE) ? 1 : 0, cm: this.getParameter(this.COLOR_WRITEMASK).map((b) => (b ? 1 : 0)).join("") });
      return orig.apply(this, a);
    };
  };
  const glt = (S.glt = {});
  if (STACKS) for (const name of ["drawArrays", "drawElements", "drawElementsInstanced", "drawArraysInstanced", "bindFramebuffer", "clear", "clearBufferfv", "blitFramebuffer", "bufferSubData", "bufferData", "texSubImage2D", "texImage2D", "uniformMatrix4fv", "uniform4fv", "uniform1i", "uniformBlockBinding", "bindBufferBase", "bindTexture", "bindVertexArray", "useProgram", "readPixels", "getError", "finish", "flush", "getUniformLocation", "getParameter", "isEnabled"]) {
    const orig = proto[name]; if (!orig) continue;
    proto[name] = function (...a) { const s = performance.now(); const r = orig.apply(this, a); const e = performance.now() - s; const g = glt[name] || (glt[name] = { n: 0, ms: 0 }); g.n++; g.ms += e; return r; };
  }
  rec("drawArrays", 2); rec("drawElements", 1); rec("drawArraysInstanced", 2, 3); rec("drawElementsInstanced", 1, 4); rec("drawRangeElements", 3);
})();`.replace("%STACKS%", String(NOMINIFY));

function serve(root: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      if (rel.endsWith("/")) rel += "index.html";
      const file = join(root, rel);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "content-length": statSync(file).size, "cache-control": "no-store" });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({ server, origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}` });
    });
  });
}

const emitChunks = (tag: string, base64: string): void => {
  for (let i = 0; i * 3000 < base64.length; i++) console.log(`${tag}:${i}:${base64.slice(i * 3000, (i + 1) * 3000)}`);
};
interface CallFrame { functionName: string; url: string; lineNumber: number }
interface ProfileNode { id: number; callFrame: CallFrame; children?: number[] }
interface CpuProfile { nodes: ProfileNode[]; samples?: number[]; timeDeltas?: number[] }
/** Self and inclusive time per function from a V8 CPU profile, top-N by each. */
function summariseProfile(profile: CpuProfile, top = 30) {
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
  let total = 0, idle = 0;
  for (let i = 0; i < samples.length; i++) {
    const ms = (deltas[i + 1] ?? deltas[i] ?? 0) / 1000;
    const id = samples[i]!;
    total += ms;
    if (byId.get(id)!.callFrame.functionName === "(idle)") { idle += ms; continue; }
    const key = keyOf(id);
    self.set(key, (self.get(key) ?? 0) + ms);
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const k = keyOf(cur);
      if (!seen.has(k)) { seen.add(k); inclusive.set(k, (inclusive.get(k) ?? 0) + ms); }
    }
  }
  const rank = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([fn, ms]) => ({ fn, ms: Math.round(ms * 100) / 100 }));
  return { totalMs: Math.round(total), busyMs: Math.round(total - idle), topSelf: rank(self), topInclusive: rank(inclusive) };
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

type Win = Window & {
  __BENCH__?: { ready: boolean; errors: string[]; frame(dt: number): void; measure(n: number, dt: number): { cpuMs: number[]; totalMs: number[] }; capture(dt: number): { luma: number[]; mean: number; jpeg: string } };
  __WP7__?: { frame: unknown[]; programs: Record<string, unknown>; recording: boolean; clears: number; blits: number };
};

test("wp7 frame structure (software WebGL2)", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  execFileSync("node", ["tools/bench-vs-threejs/harness/build-all.mjs", "/repo/tools/bench-vs-threejs", WORK, "/repo/fixtures", SCENES.join(","), LIBS.join(",")], { stdio: "inherit", timeout: 900_000, env: { ...process.env, ...(NOMINIFY ? { BENCH_MINIFY: "false" } : {}) } });
  const out: Record<string, unknown> = {};
  const frames: Record<string, string> = {};
  for (const scene of SCENES) {
    for (const lib of LIBS) {
      const { server, origin } = await serve(join(WORK, "dist", scene, lib));
      try {
        const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
        await context.addInitScript(GL_HOOK);
        const page = await context.newPage();
        const problems: string[] = [];
        page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/GPU stall/.test(m.text())) problems.push(m.text().slice(0, 300)); });
        page.on("pageerror", (e) => problems.push(String(e.message).slice(0, 300)));
        await page.goto(`${origin}/index.html`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean((window as Win).__BENCH__?.ready) || ((window as Win).__BENCH__?.errors.length ?? 0) > 0, undefined, { timeout: 120_000 });
        const dt = 1 / 60;
        const structure = await page.evaluate((step) => {
          const w = window as Win;
          for (let i = 0; i < 6; i++) w.__BENCH__!.frame(step);
          const S = w.__WP7__!;
          S.frame.length = 0; S.clears = 0; S.blits = 0; S.recording = true;
          w.__BENCH__!.frame(step);
          S.recording = false;
          return { frame: S.frame.slice(), programs: S.programs, clears: S.clears, blits: S.blits };
        }, dt);
        // Matched capture (frame 25 after load, same as the bench) for the tolerance check, then steady timing.
        const cap = await page.evaluate(([step, n]) => { const w = window as Win; for (let i = 0; i < n!; i++) w.__BENCH__!.frame(step!); const c = w.__BENCH__!.capture(step!); return { luma: c.luma, mean: c.mean, jpeg: c.jpeg }; }, [dt, 19] as const);
        frames[`${scene}-${lib}`] = cap.jpeg;
        // GL-call time and call counts over 60 frames (JS frame time without readPixels sync).
        const glTime = await page.evaluate(([n, step]) => {
          const w = window as Win & { __BENCH__: { frameRaw(dt: number): void; sync(): void } };
          const S = w.__WP7__ as unknown as { glt: Record<string, { n: number; ms: number }> };
          for (const k of Object.keys(S.glt)) S.glt[k] = { n: 0, ms: 0 };
          let cpu = 0;
          for (let i = 0; i < n!; i++) { const a = performance.now(); w.__BENCH__.frameRaw(step!); cpu += performance.now() - a; w.__BENCH__.sync(); }
          const out: Record<string, { calls: number; msPerFrame: number }> = {};
          for (const [k, v] of Object.entries(S.glt)) if (v.n > 0) out[k] = { calls: v.n / n!, msPerFrame: v.ms / n! };
          return { cpuMsPerFrame: cpu / n!, byCall: out };
        }, [MEASURE_FRAMES, dt] as const);
        let profile: unknown = null;
        if (NOMINIFY && lib !== "three-msaa") {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Profiler.enable");
          await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
          await cdp.send("Profiler.start");
          await page.evaluate(([n, step]) => {
            const w = window as Win & { __BENCH__: { frameRaw(dt: number): void; sync(): void } };
            for (let i = 0; i < n!; i++) { w.__BENCH__.frameRaw(step!); w.__BENCH__.sync(); }
          }, [120, dt] as const);
          profile = summariseProfile((await cdp.send("Profiler.stop")).profile as unknown as CpuProfile);
        }
        const runs: Array<{ cpuMs: number; totalMs: number }> = [];
        for (let r = 0; r < 3; r++) {
          const t = await page.evaluate(([n, step]) => (window as Win).__BENCH__!.measure(n!, step!), [MEASURE_FRAMES, dt] as const);
          runs.push({ cpuMs: median(t.cpuMs), totalMs: median(t.totalMs) });
        }
        out[`${scene}/${lib}`] = { structure, glTime, profile, lumaMean: cap.mean, lumaSample: cap.luma.length, timing: { runs, cpuMsMedian: median(runs.map((r) => r.cpuMs)), totalMsMedian: median(runs.map((r) => r.totalMs)) }, console: problems };
        // Luma plane for pixel-level comparison between arms.
        (out[`${scene}/${lib}`] as Record<string, unknown>).luma = Buffer.from(Uint8Array.from(cap.luma)).toString("base64");
        await context.close();
      } finally { server.close(); }
      console.log(`WP7_DONE ${scene}/${lib}`);
    }
  }
  mkdirSync("tests/reports/wp7", { recursive: true });
  writeFileSync("tests/reports/wp7/wp7.json", JSON.stringify(out));
  console.log("WP7_JSON_BEGIN");
  emitChunks("WP7_JSON", Buffer.from(JSON.stringify(out)).toString("base64"));
  console.log("WP7_JSON_END");
  for (const [name, dataUrl] of Object.entries(frames)) {
    console.log(`WP7_FRAME_BEGIN ${name}`);
    emitChunks(`WP7_FRAME:${name}`, dataUrl.split(",")[1]!);
    console.log(`WP7_FRAME_END ${name}`);
  }
  void readFileSync;
});
