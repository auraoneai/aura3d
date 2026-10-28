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
 * Output: `FORESTDRAW <json>` and PERFCOST_CHUNK lines (name `forest-draw-reduction`). Timings are not taken here.
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
  P.begin = () => { P.rec = true; P.total = 0; P.byFbo = new Map(); P.order = []; };
  P.end = () => { P.rec = false; return { total: P.total, passes: P.order.map((k) => [k, P.byFbo.get(k)]) }; };
})();`;

interface Run { draws: { total: number; passes: Array<[string, number]> }; width: number; height: number; rgba: string; errors: string[] }

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
      };
      if (!w.__PROBE__.ready) return { error: w.__PROBE__.error ?? "not ready" };
      const dt = 1 / 60;
      for (let i = 0; i < frames - 1; i += 1) w.__PROBE__.frame(dt);
      w.__DRAWS__.begin();
      w.__PROBE__.frame(dt);
      const draws = w.__DRAWS__.end();
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      // readPixels right after the frame, on the default framebuffer, before the compositor clears the drawing buffer.
      const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
      const buf = new Uint8Array(canvas.width * canvas.height * 4);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      return { draws, width: canvas.width, height: canvas.height, rgba: btoa(bin) };
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
      const diff = compare(off, on);
      emit("forest-draw-reduction", {
        scene: "forest 8000 trunks + 8000 canopies + 2000 rocks, shadow, fog, 640x360",
        frames: FRAMES,
        off: off.draws,
        on: on.draws,
        diff,
        errors: [...off.errors, ...on.errors].slice(0, 10),
        environment: "software WebGL2 (SwiftShader); draw counts are exact, no timing taken",
        generatedUtc: new Date().toISOString()
      });
      if (on.draws.total > 40) throw new Error(`forest draws ${on.draws.total} > 40`);
      if (diff.meanAbs255 > 2 || diff.interiorMeanAbs255 > 2) throw new Error(`forest frame differs: mean ${diff.meanAbs255}, interior ${diff.interiorMeanAbs255}`);
    } finally {
      await server.close();
    }
  });
});
