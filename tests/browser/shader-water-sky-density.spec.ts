import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Shader-water sky sphere density A/B (beat-three.js PRD-2 WP-9, G5). Remote only (tools/remote-acr/run.sh, software WebGL2).
 *
 * The Aura3D bench sky sphere went from the engine default 64 x 32 segments to 32 x 16 (the three.js bench uses 32 x 16) to bring the
 * triangle count to three.js's. This loads the same bench scene twice from WORKSPACE source, `?skysegs=64x32` (before) and the default
 * (after), runs the same frames at the same dt, and records (a) exact triangles submitted in the last frame, counted from the GL draw
 * calls, and (b) the pixel difference of the last frame, read with `gl.readPixels` straight after it is drawn. The sky is shaded from
 * the interpolated view direction, so the expected difference is a few facet-edge pixels at most.
 *
 * Output: `SKYDENSITY <json>` and PERFCOST_CHUNK lines (name `shader-water-sky-density`).
 */
const FRAMES = 8;
const QUERY = "scene=bench&name=shader-water";

const HOOK = `(() => {
  const proto = WebGL2RenderingContext.prototype;
  const P = window.__TRI__ = { rec: false, tris: 0, draws: 0, list: [] };
  const add = (mode, count, inst) => { if (!P.rec) return; P.draws++; P.list.push([mode, count, inst || 1]); if (mode === 4) P.tris += (count / 3) * (inst || 1); else if (mode === 5 || mode === 6) P.tris += Math.max(0, count - 2) * (inst || 1); };
  const wrap = (name, pick) => { const o = proto[name]; proto[name] = function (...a) { const [m, c, i] = pick(a); add(m, c, i); return o.apply(this, a); }; };
  wrap("drawArrays", (a) => [a[0], a[2], 1]);
  wrap("drawElements", (a) => [a[0], a[1], 1]);
  wrap("drawArraysInstanced", (a) => [a[0], a[2], a[3]]);
  wrap("drawElementsInstanced", (a) => [a[0], a[1], a[4]]);
  wrap("drawRangeElements", (a) => [a[0], a[3], 1]);
  P.begin = () => { P.rec = true; P.tris = 0; P.draws = 0; P.list = []; };
  P.end = () => { P.rec = false; return { triangles: P.tris, draws: P.draws, list: P.list }; };
})();`;

interface Run { triangles: number; draws: number; list: Array<[number, number, number]>; width: number; height: number; rgba: string; errors: string[] }

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
    await page.waitForFunction(() => Boolean((window as unknown as { __PROBE__?: unknown }).__PROBE__), undefined, { timeout: 600_000 });
    const out = await page.evaluate((frames) => {
      const w = window as unknown as {
        __PROBE__: { ready: boolean; error?: string; frame(dt: number): unknown };
        __TRI__: { begin(): void; end(): { triangles: number; draws: number; list: Array<[number, number, number]> } };
      };
      if (!w.__PROBE__.ready) return { error: w.__PROBE__.error ?? "not ready" };
      const dt = 1 / 60;
      for (let i = 0; i < frames - 1; i += 1) w.__PROBE__.frame(dt);
      w.__TRI__.begin();
      w.__PROBE__.frame(dt);
      const count = w.__TRI__.end();
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
      const buf = new Uint8Array(canvas.width * canvas.height * 4);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      return { ...count, width: canvas.width, height: canvas.height, rgba: btoa(bin) };
    }, FRAMES);
    if ("error" in out) throw new Error(String(out.error));
    return { ...out, errors };
  } finally {
    await context.close();
  }
}

/** Pixel difference of two frames over rows [y0, y1): mean and max of the channel-mean abs difference (/255), share above 4/255. */
function compareRows(a: Run, b: Run, y0: number, y1: number) {
  const da = Buffer.from(a.rgba, "base64"), db = Buffer.from(b.rgba, "base64");
  const w = a.width;
  let sum = 0, max = 0, over4 = 0, n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 4;
      const d = (Math.abs(da[p]! - db[p]!) + Math.abs(da[p + 1]! - db[p + 1]!) + Math.abs(da[p + 2]! - db[p + 2]!)) / 3;
      sum += d;
      if (d > max) max = d;
      if (d > 4) over4 += 1;
      n += 1;
    }
  }
  return { pixels: n, meanAbs255: sum / n, maxAbs255: max, over4Share: over4 / n };
}

/** Luma standard deviation of a frame (flat or blank frames fail it). */
function lumaStd(run: Run): number {
  const d = Buffer.from(run.rgba, "base64");
  const n = run.width * run.height;
  let s = 0, sq = 0;
  for (let p = 0; p < n * 4; p += 4) {
    const l = (d[p]! + d[p + 1]! + d[p + 2]!) / 3;
    s += l;
    sq += l * l;
  }
  const m = s / n;
  return Math.sqrt(Math.max(0, sq / n - m * m));
}

/** Whole frame plus the top fifth (sky only: the 80 x 80 water plane ends well below it) and the rest. */
function regions(a: Run, b: Run) {
  const h = a.height;
  const cut = Math.floor(h / 5);
  return { all: compareRows(a, b, 0, h), skyBand: compareRows(a, b, 0, cut), below: compareRows(a, b, cut, h) };
}

const emit = (name: string, value: unknown): void => {
  const json = JSON.stringify(value);
  mkdirSync("tests/reports/shader-water-sky-density", { recursive: true });
  writeFileSync(`tests/reports/shader-water-sky-density/${name}.json`, json);
  console.log(`SKYDENSITY ${json}`);
  const b64 = Buffer.from(json).toString("base64");
  const size = 3000, n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) console.log(`PERFCOST_CHUNK ${name} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}`);
};

test.describe("shader-water sky density", () => {
  test.setTimeout(900_000);

  test("sky sphere 64x32 (before) vs 32x16 (after): triangles and last-frame pixel difference", async ({ browser }) => {
    const server = await startExampleDevServer();
    try {
      const before = await load(browser, server.origin, "&skysegs=64x32");
      const after = await load(browser, server.origin, "");
      // Control: the same default configuration loaded again. Whatever differs here is run-to-run noise, not sky density.
      const control = await load(browser, server.origin, "");
      const density = regions(before, after);
      const noise = regions(after, control);
      emit("shader-water-sky-density", {
        scene: "bench shader-water (Aura3D), 640x360",
        frames: FRAMES,
        before: { skySegments: "64x32", triangles: before.triangles, draws: before.draws, drawList: before.list },
        after: { skySegments: "32x16", triangles: after.triangles, draws: after.draws, drawList: after.list },
        control: { triangles: control.triangles, draws: control.draws },
        density,
        noise,
        lumaStd: lumaStd(after),
        errors: [...before.errors, ...after.errors, ...control.errors].slice(0, 10),
        environment: "software WebGL2 (SwiftShader); triangle counts are exact GL draw-call sums",
        generatedUtc: new Date().toISOString()
      });
      if (after.triangles >= before.triangles) throw new Error(`triangles did not drop: ${before.triangles} -> ${after.triangles}`);
      if (lumaStd(after) < 5) throw new Error("frame looks flat");
      if (before.draws !== after.draws) throw new Error(`draw count differs between the two tessellations: ${before.draws} vs ${after.draws}`);
      // The sky band must not change beyond the run-to-run noise of the same configuration by more than 2/255 on average.
      if (density.skyBand.meanAbs255 > noise.skyBand.meanAbs255 + 2) throw new Error(`sky band changes with density: ${JSON.stringify({ density: density.skyBand, noise: noise.skyBand })}`);
    } finally {
      await server.close();
    }
  });
});
