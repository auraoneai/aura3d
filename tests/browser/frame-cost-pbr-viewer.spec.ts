import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PBR viewer draw calls for the working tree (beat-three.js PRD target P4: 33 -> <= 25). Same scene as
 * tools/bench-vs-threejs/pbr-viewer/aura, loaded from the in-repo sources. Needs the GLB and HDRI staged:
 *
 *   EXTRA_DIRS="fixtures/environment-corpus/hdri" SPECS=tests/browser/frame-cost-pbr-viewer.spec.ts tools/remote-acr/run.sh
 *
 * Prints PBR_VIEWER lines: draws for one steady frame, grouped by the viewport each draw ran in (shadow map, main target,
 * bloom mips...), so the next reduction targets the right pass. Software WebGL2: counts are renderer-bound, not GPU-bound.
 */
const GL_HOOK = `(() => {
  const c = { draws: 0, byViewport: {}, blits: 0 };
  window.__GLC__ = c;
  const proto = WebGL2RenderingContext.prototype;
  let viewport = "unset";
  const vp = proto.viewport;
  proto.viewport = function (x, y, w, h) { viewport = w + "x" + h; return vp.call(this, x, y, w, h); };
  for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
    const orig = proto[name];
    if (!orig) continue;
    proto[name] = function (...a) { c.draws++; c.byViewport[viewport] = (c.byViewport[viewport] || 0) + 1; return orig.apply(this, a); };
  }
  const bf = proto.blitFramebuffer;
  proto.blitFramebuffer = function (...a) { c.blits++; return bf.apply(this, a); };
})();`;

const TARGET_DRAWS = 25;
const PRODUCTION_BASELINE_DRAWS = 33;

test.describe("PBR viewer draw calls (software WebGL2)", () => {
  test.setTimeout(15 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const quality of ["auto", "production"] as const) {
    test(`milk truck, quality ${quality}`, async ({ browser }) => {
      const sha = createHash("sha256").update(readFileSync(resolve("fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb"))).digest("hex");
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const problems: string[] = [];
      page.on("console", (message) => {
        if ((message.type() === "warning" || message.type() === "error") && !/GPU stall due to ReadPixels/.test(message.text())) problems.push(`${message.type()}: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      await page.addInitScript(GL_HOOK);
      await page.goto(`${server.origin}/tests/browser/frame-cost-pbr-harness.html?sha=${sha}&quality=${quality}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as { __PBR__?: unknown }).__PBR__), undefined, { timeout: 300_000 });
      const result = await page.evaluate(() => {
        const api = (window as unknown as { __PBR__: { ready: boolean; errors: string[]; renderPath: unknown; stepOnce(): void } }).__PBR__;
        const glc = (window as unknown as { __GLC__: { draws: number; byViewport: Record<string, number>; blits: number } }).__GLC__;
        for (let i = 0; i < 10; i += 1) api.stepOnce();
        glc.draws = 0; glc.byViewport = {}; glc.blits = 0;
        api.stepOnce();
        return { ready: api.ready, errors: api.errors, renderPath: api.renderPath, draws: glc.draws, byViewport: glc.byViewport, blits: glc.blits };
      });
      console.log(`PBR_VIEWER ${JSON.stringify({ quality, ...result, problems })}`);
      expect(result.ready, result.errors.join(" | ")).toBe(true);
      expect(problems).toEqual([]);
      if (quality === "auto") {
        expect(result.draws, "P4 PBR viewer draw calls").toBeLessThanOrEqual(TARGET_DRAWS);
      } else {
        // `production` keeps the original pass sequence: its count is the 4.3.7 baseline.
        expect(result.draws, "production draw calls are unchanged").toBe(PRODUCTION_BASELINE_DRAWS);
      }
      await context.close();
    });
  }

  test("fused bloom passes are look-neutral: auto vs production frames", async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    const sha = createHash("sha256").update(readFileSync(resolve("fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb"))).digest("hex");
    const frames: Record<string, Buffer> = {};
    for (const quality of ["production", "auto"] as const) {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(`${server.origin}/tests/browser/frame-cost-pbr-harness.html?sha=${sha}&quality=${quality}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as { __PBR__?: unknown }).__PBR__), undefined, { timeout: 300_000 });
      const base64 = await page.evaluate(() => (window as unknown as { __PBR__: { settledPixels(frames: number): Promise<string> } }).__PBR__.settledPixels(3));
      frames[quality] = Buffer.from(base64, "base64");
      await context.close();
    }
    const production = frames.production!;
    const auto = frames.auto!;
    expect(auto.length).toBe(production.length);
    expect(auto.length).toBe(640 * 360 * 4);
    let sum = 0;
    let maxDiff = 0;
    let over6 = 0;
    let nonBlack = 0;
    const histogram = new Array<number>(256).fill(0);
    for (let i = 0; i < production.length; i += 4) {
      let pixelMax = 0;
      for (let c = 0; c < 3; c += 1) {
        const d = Math.abs(production[i + c]! - auto[i + c]!);
        sum += d;
        if (d > pixelMax) pixelMax = d;
      }
      histogram[pixelMax]! += 1;
      if (pixelMax > maxDiff) maxDiff = pixelMax;
      if (pixelMax > 6) over6 += 1;
      if (production[i]! + production[i + 1]! + production[i + 2]! > 30) nonBlack += 1;
    }
    const pixels = production.length / 4;
    const meanAbs = sum / (pixels * 3);
    const result = { meanAbsDiff: Math.round(meanAbs * 1000) / 1000, maxDiff, pixelsOver6: over6, pixelsOver6Fraction: over6 / pixels, nonBlackPixels: nonBlack, diffHistogramFirst16: histogram.slice(0, 16) };
    console.log(`PBR_FUSION ${JSON.stringify(result)}`);
    expect(nonBlack, "the compared frame must contain the scene").toBeGreaterThan(5000);
    expect(meanAbs, "mean abs diff (0..255 scale)").toBeLessThanOrEqual(2);
    expect(maxDiff, "no pixel changes by more than 6/255").toBeLessThanOrEqual(6);
  });
});
