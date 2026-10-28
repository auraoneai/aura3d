import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Forest draw reduction (beat-three.js PRD-2 WP-9, G5). Remote only (tools/remote-acr/run.sh, software WebGL2).
 *
 * The bench's forest (8,000 trunks + 8,000 canopies + 2,000 rocks, shadow, fog, 640x360, production profile) is loaded twice from
 * WORKSPACE source: with the dense-depth-draw switch OFF (`?densedepth=off`: uniform-array batches of 64, the pre-WP-9 behaviour) and
 * ON (the default). Each load runs the same frames at the same dt, so the camera pose is identical; the last frame is read back with
 * `gl.readPixels` straight after it is drawn (no extra frame) and the two images are compared. GL draw calls are counted per frame
 * and per draw framebuffer (each cascade is its own FBO pass).
 *
 * Three loads: dense depth draws OFF, ON, and ON with shadows disabled (`shadow=0`). The shadow-less frame is the control that proves
 * the OFF/ON equality is not two identical blank or unshadowed frames: both shadowed frames must differ from it on a real share of
 * pixels, must not be flat, and the ON load must have reported its three instanced shadow proxies (the nodes the path is limited to).
 * GL object creation is hooked too: per frame, buffers and vertex arrays created vs deleted (the attribute path makes one instance
 * buffer and VAO per node per cascade per frame, so live objects must stay flat over a further 12 frames), plus the CPU ms of frame() and the total ms including the GPU wait. The OFF and ON loads run
 * interleaved (off, on, off, on) in one container so slow-runner drift hits both alike.
 *
 * Output: `FORESTDRAW <json>` and PERFCOST_CHUNK lines (name `forest-draw-reduction`). The CPU ms are software-rasteriser-host times
 * from sequential loads, indicative only (never a hardware claim).
 */
const FRAMES = 3;
const QUERY = "scene=forest&trees=8000&rocks=2000";

const HOOK = `(() => {
  const proto = WebGL2RenderingContext.prototype;
  const fbos = new WeakMap();
  let nextId = 1, drawFbo = null;
  const P = window.__DRAWS__ = { rec: false, total: 0, byFbo: new Map(), order: [] };
  const label = () => (drawFbo ? "fbo" + (fbos.get(drawFbo) ?? (fbos.set(drawFbo, nextId++), fbos.get(drawFbo))) : "default");
  const bf = proto.bindFramebuffer;
  proto.bindFramebuffer = function (t, f) { if (t === 36009 || t === 36160) drawFbo = f; return bf.call(this, t, f); };
  for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
    const orig = proto[name];
    proto[name] = function (...a) {
      if (P.rec) {
        P.total++;
        const k = label();
        if (!P.byFbo.has(k)) { P.byFbo.set(k, 0); P.order.push(k); }
        P.byFbo.set(k, P.byFbo.get(k) + 1);
      }
      return orig.apply(this, a);
    };
  }
  const A = window.__ALLOC__ = { createBuffer: 0, deleteBuffer: 0, createVertexArray: 0, deleteVertexArray: 0, bufferData: 0, bufferBytes: 0 };
  for (const name of ["createBuffer", "deleteBuffer", "createVertexArray", "deleteVertexArray"]) {
    const orig = proto[name];
    proto[name] = function (...a) { A[name]++; return orig.apply(this, a); };
  }
  const bd = proto.bufferData;
  proto.bufferData = function (...a) { A.bufferData++; const d = a[1]; A.bufferBytes += typeof d === "number" ? d : (d && d.byteLength) || 0; return bd.apply(this, a); };
  P.begin = () => { P.rec = true; P.total = 0; P.byFbo = new Map(); P.order = []; };
  P.end = () => { P.rec = false; return { total: P.total, passes: P.order.map((k) => [k, P.byFbo.get(k)]) }; };
})();`;

interface Alloc { createBuffer: number; deleteBuffer: number; createVertexArray: number; deleteVertexArray: number; bufferData: number; bufferBytes: number }
interface Run {
  draws: { total: number; passes: Array<[string, number]> };
  width: number;
  height: number;
  rgba: string;
  errors: string[];
  proxies: Array<{ node: string; primitive: string; instances: number; cameraTriangles: number | null; proxyTriangles: number }>;
  /** GL objects created and deleted during the one measured frame. */
  frameAlloc: Alloc;
  /** Over 12 further frames: live buffers / vertex arrays gained, CPU ms of frame() (submit side) and total ms (incl. GPU wait). */
  steady: { liveBufferDelta: number; liveVertexArrayDelta: number; cpuMsMedian: number; cpuMsMin: number; cpuMsMax: number; totalMsMedian: number; totalMsMin: number; totalMsMax: number };
}

async function load(browser: import("@playwright/test").Browser, origin: string, extraQuery: string): Promise<Run> {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  await context.addInitScript(HOOK);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    if (/GL Driver Message .*ReadPixels/.test(m.text())) return;
    errors.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  try {
    await page.goto(`${origin}/tests/browser/perf-frame-cost/index.html?${QUERY}${extraQuery}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PROBE__?: unknown }).__PROBE__), undefined, { timeout: 1_200_000 });
    const out = await page.evaluate((frames) => {
      const w = window as unknown as {
        __PROBE__: { ready: boolean; error?: string; frame(dt: number): unknown };
        __DRAWS__: { begin(): void; end(): { total: number; passes: Array<[string, number]> } };
        __ALLOC__: Alloc;
        __A3D_SHADOW_PROXIES__?: Run["proxies"];
      };
      if (!w.__PROBE__.ready) return { error: w.__PROBE__.error ?? "not ready" };
      const dt = 1 / 60;
      for (let i = 0; i < frames - 1; i += 1) w.__PROBE__.frame(dt);
      const snap = (): Alloc => ({ ...w.__ALLOC__ });
      const a0 = snap();
      w.__DRAWS__.begin();
      w.__PROBE__.frame(dt);
      const draws = w.__DRAWS__.end();
      const a1 = snap();
      const frameAlloc = Object.fromEntries(Object.keys(a0).map((k) => [k, a1[k as keyof Alloc] - a0[k as keyof Alloc]])) as unknown as Alloc;
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      // readPixels right after the frame, on the default framebuffer, before the compositor clears the drawing buffer.
      const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
      const buf = new Uint8Array(canvas.width * canvas.height * 4);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      // Steady state after the readback (the readback frame is already measured): 12 more frames.
      const b0 = snap();
      const cpu: number[] = [];
      const total: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const r = w.__PROBE__.frame(dt) as { cpuMs: number; totalMs: number };
        cpu.push(r.cpuMs);
        total.push(r.totalMs);
      }
      const b1 = snap();
      cpu.sort((x, y) => x - y);
      total.sort((x, y) => x - y);
      const steady = {
        liveBufferDelta: (b1.createBuffer - b0.createBuffer) - (b1.deleteBuffer - b0.deleteBuffer),
        liveVertexArrayDelta: (b1.createVertexArray - b0.createVertexArray) - (b1.deleteVertexArray - b0.deleteVertexArray),
        cpuMsMedian: cpu[6]!, cpuMsMin: cpu[0]!, cpuMsMax: cpu[11]!,
        totalMsMedian: total[6]!, totalMsMin: total[0]!, totalMsMax: total[11]!
      };
      return { draws, width: canvas.width, height: canvas.height, rgba: btoa(bin), proxies: JSON.parse(JSON.stringify(w.__A3D_SHADOW_PROXIES__ ?? [])), frameAlloc, steady };
    }, FRAMES);
    if ("error" in out) throw new Error(String(out.error));
    return { ...out, errors };
  } finally {
    await context.close();
  }
}

function compare(a: Run, b: Run) {
  const da = Buffer.from(a.rgba, "base64"), db = Buffer.from(b.rgba, "base64");
  const w = a.width, h = a.height;
  let sum = 0, max = 0, changed = 0, interiorSum = 0, interiorN = 0;
  const luma = (buf: Buffer, p: number) => (buf[p]! + buf[p + 1]! + buf[p + 2]!) / 3;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 4;
      const d = (Math.abs(da[p]! - db[p]!) + Math.abs(da[p + 1]! - db[p + 1]!) + Math.abs(da[p + 2]! - db[p + 2]!)) / 3;
      sum += d;
      if (d > max) max = d;
      if (d > 0) changed += 1;
      // Interior: pixels whose reference (OFF) 4-neighbours are within 16/255 (not a silhouette or texture edge).
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const l = luma(da, p);
        if (Math.abs(l - luma(da, p - 4)) <= 16 && Math.abs(l - luma(da, p + 4)) <= 16 && Math.abs(l - luma(da, p - w * 4)) <= 16 && Math.abs(l - luma(da, p + w * 4)) <= 16) {
          interiorSum += d;
          interiorN += 1;
        }
      }
    }
  }
  return { pixels: w * h, meanAbs255: sum / (w * h), maxAbs255: max, differingPixels: changed, interiorMeanAbs255: interiorN ? interiorSum / interiorN : 0, interiorPixels: interiorN };
}

/** Luma standard deviation and the share of the most common colour (a blank or cleared frame is one colour). */
function frameStats(run: Run) {
  const d = Buffer.from(run.rgba, "base64");
  const n = run.width * run.height;
  let sum = 0, sumSq = 0;
  const counts = new Map<number, number>();
  for (let p = 0; p < n * 4; p += 4) {
    const l = (d[p]! + d[p + 1]! + d[p + 2]!) / 3;
    sum += l;
    sumSq += l * l;
    const key = (d[p]! << 16) | (d[p + 1]! << 8) | d[p + 2]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const mean = sum / n;
  let modal = 0;
  for (const c of counts.values()) if (c > modal) modal = c;
  return { lumaMean: mean, lumaStd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), distinctColors: counts.size, modalColorShare: modal / n };
}

/** Share of pixels whose channel-mean difference is above `threshold` /255. */
function changedShare(a: Run, b: Run, threshold: number): number {
  const da = Buffer.from(a.rgba, "base64"), db = Buffer.from(b.rgba, "base64");
  let changed = 0;
  const n = a.width * a.height;
  for (let p = 0; p < n * 4; p += 4) {
    if ((Math.abs(da[p]! - db[p]!) + Math.abs(da[p + 1]! - db[p + 1]!) + Math.abs(da[p + 2]! - db[p + 2]!)) / 3 > threshold) changed += 1;
  }
  return changed / n;
}

const emit = (name: string, value: unknown): void => {
  const json = JSON.stringify(value);
  mkdirSync("tests/reports/forest-draw-reduction", { recursive: true });
  writeFileSync(`tests/reports/forest-draw-reduction/${name}.json`, json);
  console.log(`FORESTDRAW ${json}`);
  const b64 = Buffer.from(json).toString("base64");
  const size = 3000, n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) console.log(`PERFCOST_CHUNK ${name} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}`);
};

test.describe("forest draw reduction", () => {
  test.setTimeout(1_800_000);

  test("dense depth draws: forest draws per frame and pixel diff against uniform-array batches", async ({ browser }) => {
    const server = await startExampleDevServer();
    try {
      const off = await load(browser, server.origin, "&densedepth=off");
      const on = await load(browser, server.origin, "");
      const off2 = await load(browser, server.origin, "&densedepth=off");
      const on2 = await load(browser, server.origin, "");
      const noShadow = await load(browser, server.origin, "&shadow=0");
      const diff = compare(off, on);
      const stats = { off: frameStats(off), on: frameStats(on), noShadow: frameStats(noShadow) };
      // Shadow-less control: share of pixels the shadows change (> 4/255) between the shadowed and the shadow-less render of the same frame.
      const shadowShare = { off: changedShare(off, noShadow, 4), on: changedShare(on, noShadow, 4) };
      const errors = [...off.errors, ...on.errors, ...off2.errors, ...on2.errors, ...noShadow.errors];
      emit("forest-draw-reduction", {
        scene: "forest 8000 trunks + 8000 canopies + 2000 rocks, shadow, fog, 640x360",
        frames: FRAMES,
        off: off.draws,
        on: on.draws,
        noShadowDraws: noShadow.draws,
        diff,
        stats,
        shadowShare,
        proxies: on.proxies,
        frameAlloc: { off: off.frameAlloc, on: on.frameAlloc },
        steady: { off: off.steady, on: on.steady, off2: off2.steady, on2: on2.steady },
        diff2: compare(off2, on2),
        errors: errors.slice(0, 10),
        environment: "software WebGL2 (SwiftShader); draw counts are exact, CPU ms are host-side frame() times from sequential loads, indicative only",
        generatedUtc: new Date().toISOString()
      });
      if (on.draws.total > 40) throw new Error(`forest draws ${on.draws.total} > 40`);
      if (diff.meanAbs255 > 2 || diff.interiorMeanAbs255 > 2) throw new Error(`forest frame differs: mean ${diff.meanAbs255}, interior ${diff.interiorMeanAbs255}`);
      // The equality above must not come from two degraded frames.
      for (const [name, st] of Object.entries(stats)) {
        if (st.lumaStd < 5 || st.distinctColors < 200 || st.modalColorShare > 0.6) throw new Error(`${name} frame looks blank or flat: ${JSON.stringify(st)}`);
      }
      if (shadowShare.on < 0.005 || shadowShare.off < 0.005) throw new Error(`shadows do not show in the frame: changed share vs shadow-less ${JSON.stringify(shadowShare)}`);
      if (noShadow.draws.total >= on.draws.total) throw new Error(`shadow-less control draws ${noShadow.draws.total} should be fewer than ${on.draws.total}`);
      // The path is limited to nodes that got an instanced shadow proxy: all three forest nodes must have reported one.
      const proxied = new Set(on.proxies.map((p) => p.node));
      for (const node of ["trunks", "canopies", "rocks"]) if (!proxied.has(node)) throw new Error(`no shadow proxy reported for ${node}: ${JSON.stringify(on.proxies)}`);
      // No GL object growth: per-frame instance buffers and their VAOs are created and deleted in balance over 12 frames.
      const diff2 = compare(off2, on2);
      if (diff2.meanAbs255 > 2 || diff2.interiorMeanAbs255 > 2) throw new Error(`second pair differs: mean ${diff2.meanAbs255}, interior ${diff2.interiorMeanAbs255}`);
      if (on.steady.liveBufferDelta !== 0 || on.steady.liveVertexArrayDelta !== 0) throw new Error(`GL objects grow across frames: ${JSON.stringify(on.steady)}`);
      if (errors.length > 0) throw new Error(`console errors: ${JSON.stringify(errors.slice(0, 5))}`);
    } finally {
      await server.close();
    }
  });
});
