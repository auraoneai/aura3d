import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Render-path edge cases (beat-three.js PRD section 6, WP-P1.2): capture without a preserved drawing buffer, context
 * loss and restore, a runtime switch from the direct path to the HDR path, and resize / devicePixelRatio.
 * Remote only (tools/remote-acr/run.sh, software WebGL2). Findings are printed as EDGE_CASE lines and written to
 * tests/reports/render-path-edge-cases/report.json.
 *
 *   SPECS=tests/browser/render-path-edge-cases.spec.ts tools/remote-acr/run.sh
 */
const REPORT = "tests/reports/render-path-edge-cases/report.json";
const findings: Record<string, unknown> = {};
const NOISE = /GPU stall due to ReadPixels/;
const CONTEXT_LOSS_NOISE = /context lost|CONTEXT_LOST|lost context|context restored|restoreContext|loseContext|does not belong to this context/i;

interface PageHandle { page: Page; problems: string[]; contextNoise: string[] }

function watch(page: Page): PageHandle {
  const handle: PageHandle = { page, problems: [], contextNoise: [] };
  page.on("console", (message) => {
    if (message.type() !== "warning" && message.type() !== "error") return;
    const text = message.text();
    if (NOISE.test(text)) return;
    (CONTEXT_LOSS_NOISE.test(text) ? handle.contextNoise : handle.problems).push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => handle.problems.push(`pageerror: ${error.message}`));
  return handle;
}

async function open(page: Page, origin: string, query: string): Promise<void> {
  await page.goto(`${origin}/tests/browser/frame-cost-harness.html?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
  const ok = await page.evaluate(() => (window as unknown as { __FRAME_COST__: { ready: boolean; errors: string[] } }).__FRAME_COST__);
  expect(ok.ready, ok.errors.join(" | ")).toBe(true);
}

/** Render `n` frames synchronously inside the page. */
async function step(page: Page, n = 3): Promise<void> {
  await page.evaluate((count) => {
    const api = (window as unknown as { __FRAME_COST__: { stepOnce(): void } }).__FRAME_COST__;
    for (let i = 0; i < count; i += 1) api.stepOnce();
  }, n);
}

/** Pixels that differ from the top-left pixel (the background) by more than 8 in some channel. */
const COUNT_NON_BACKGROUND = `
  async (source) => {
    const bitmap = typeof source === "string"
      ? await createImageBitmap(await (await fetch(source)).blob())
      : source;
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width; scratch.height = bitmap.height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - data[0]) > 8 || Math.abs(data[i + 1] - data[1]) > 8 || Math.abs(data[i + 2] - data[2]) > 8) count += 1;
    }
    return { width: scratch.width, height: scratch.height, nonBackground: count };
  }`;

async function appCapturePixels(page: Page): Promise<{ width: number; height: number; nonBackground: number }> {
  return page.evaluate(`(async () => {
    const count = ${COUNT_NON_BACKGROUND};
    const bitmap = await window.__FC__.app.capture({ type: "image-bitmap" });
    return count(bitmap);
  })()`) as Promise<{ width: number; height: number; nonBackground: number }>;
}

async function plainCanvasPixels(page: Page): Promise<{ width: number; height: number; nonBackground: number }> {
  // A later task than the one that rendered: this is what a user's own toDataURL / drawImage(canvas) sees.
  return page.evaluate(`(async () => {
    const count = ${COUNT_NON_BACKGROUND};
    await new Promise((resolve) => setTimeout(resolve, 50));
    return count(window.__FC__.canvas.toDataURL("image/png"));
  })()`) as Promise<{ width: number; height: number; nonBackground: number }>;
}

/** `app.screenshot()` in a later task than the one that rendered: it re-renders synchronously so the buffer is populated. */
async function appScreenshotPixels(page: Page): Promise<{ width: number; height: number; nonBackground: number }> {
  return page.evaluate(`(async () => {
    const count = ${COUNT_NON_BACKGROUND};
    await new Promise((resolve) => setTimeout(resolve, 50));
    return count(window.__FC__.app.screenshot().dataUrl);
  })()`) as Promise<{ width: number; height: number; nonBackground: number }>;
}

async function compositorPixels(page: Page): Promise<{ width: number; height: number; nonBackground: number }> {
  const png = (await page.screenshot({ type: "png" })).toString("base64");
  return page.evaluate(`(async () => { const count = ${COUNT_NON_BACKGROUND}; return count("data:image/png;base64,${png}"); })()`) as Promise<{ width: number; height: number; nonBackground: number }>;
}

const renderPath = (page: Page) => page.evaluate(() => (window as unknown as { __FC__: { app: { diagnostics(): { renderPath?: { path: string; reason: string } } } } }).__FC__.app.diagnostics().renderPath);

test.describe("render path edge cases (software WebGL2)", () => {
  test.setTimeout(10 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => {
    await server.close();
    mkdirSync(dirname(resolve(REPORT)), { recursive: true });
    writeFileSync(resolve(REPORT), `${JSON.stringify({ generatedAt: new Date().toISOString(), renderer: "swiftshader", findings }, null, 2)}\n`);
    console.log(`EDGE_CASE_REPORT ${JSON.stringify(findings)}`);
  });

  for (const quality of ["auto", "production"] as const) {
    test(`capture without a preserved drawing buffer: ${quality}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const watched = watch(page);
      await open(page, server.origin, `scene=cube&quality=${quality}`);
      await step(page);
      // QA hooks (`frame()` / `pixels()`) and look capture go through app.capture(): a synchronous render + readPixels in one task.
      const viaCapture = await appCapturePixels(page);
      // check-deploy --browser, look capture and assets thumbnail screenshots take compositor pixels.
      const viaCompositor = await compositorPixels(page);
      // Raw canvas readback in a later task: only guaranteed with a preserved buffer.
      await step(page);
      const viaPlainCanvas = await plainCanvasPixels(page);
      await step(page);
      const viaAppScreenshot = await appScreenshotPixels(page);
      findings[`capture/${quality}`] = { path: await renderPath(page), viaCapture, viaCompositor, viaPlainCanvas, viaAppScreenshot, problems: watched.problems };
      console.log(`EDGE_CASE ${JSON.stringify({ test: `capture/${quality}`, viaCapture, viaCompositor, viaPlainCanvas, viaAppScreenshot })}`);
      expect(viaCapture.nonBackground, "app.capture() (QA hooks, look capture)").toBeGreaterThan(500);
      expect(viaCompositor.nonBackground, "compositor screenshot (check-deploy --browser, thumbnails)").toBeGreaterThan(500);
      expect(viaAppScreenshot.nonBackground, "app.screenshot() in a later task").toBeGreaterThan(500);
      expect(watched.problems).toEqual([]);
      await context.close();
    });

    test(`capture mode (?capture=1) preserves the buffer for raw canvas readback: ${quality}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const watched = watch(page);
      await open(page, server.origin, `scene=cube&quality=${quality}&capture=1`);
      await step(page);
      const viaPlainCanvas = await plainCanvasPixels(page);
      findings[`capture-mode/${quality}`] = { viaPlainCanvas, problems: watched.problems };
      console.log(`EDGE_CASE ${JSON.stringify({ test: `capture-mode/${quality}`, viaPlainCanvas })}`);
      expect(viaPlainCanvas.nonBackground, "toDataURL in a later task with ?capture=1").toBeGreaterThan(500);
      expect(watched.problems).toEqual([]);
      await context.close();
    });

    test(`context loss and restore: ${quality}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const watched = watch(page);
      await open(page, server.origin, `scene=cube&quality=${quality}`);
      await step(page);
      const before = await renderPath(page);
      const beforePixels = await appCapturePixels(page);
      const outcome = await page.evaluate(`(async () => {
        const fc = window.__FC__;
        const ext = fc.canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
        if (!ext) return { extension: false };
        let lost = 0, restored = 0;
        fc.app.onDeviceLost(() => { lost += 1; });
        fc.app.onDeviceRestored(() => { restored += 1; });
        ext.loseContext();
        await new Promise((r) => setTimeout(r, 100));
        const deviceLostWhileLost = typeof fc.app.deviceLost === "function" ? fc.app.deviceLost() : null;
        ext.restoreContext();
        for (let i = 0; i < 100 && restored === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
        // Contract (app-owned pause, explicit remount): the app remounts its scene after a restore.
        fc.app.setScene(fc.makeScene("cube"));
        await fc.app.ready();
        return { extension: true, lost, restored, deviceLostWhileLost, deviceLostAfter: typeof fc.app.deviceLost === "function" ? fc.app.deviceLost() : null };
      })()`) as { extension: boolean; lost?: number; restored?: number; deviceLostWhileLost?: boolean | null; deviceLostAfter?: boolean | null };
      expect(outcome.extension, "WEBGL_lose_context is required").toBe(true);
      await step(page, 4);
      const after = await renderPath(page);
      const afterPixels = await appCapturePixels(page);
      findings[`context-loss/${quality}`] = { before, after, outcome, beforePixels, afterPixels, contextNoise: watched.contextNoise.length, problems: watched.problems };
      console.log(`EDGE_CASE ${JSON.stringify({ test: `context-loss/${quality}`, before, after, outcome, beforePixels, afterPixels })}`);
      expect(outcome.lost).toBeGreaterThanOrEqual(1);
      expect(outcome.restored).toBeGreaterThanOrEqual(1);
      expect(outcome.deviceLostAfter).toBeFalsy();
      expect(after?.path).toBe(before?.path);
      expect(afterPixels.nonBackground).toBeGreaterThan(500);
      expect(Math.abs(afterPixels.nonBackground - beforePixels.nonBackground)).toBeLessThan(Math.max(50, beforePixels.nonBackground * 0.02));
      expect(watched.problems).toEqual([]);
      await context.close();
    });
  }

  test("runtime switch: adding post-processing moves a direct-path app to the HDR path with a diagnostic", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const watched = watch(page);
    await open(page, server.origin, "scene=cube&quality=auto");
    await step(page);
    const direct = await renderPath(page);
    const timing = await page.evaluate(`(async () => {
      const fc = window.__FC__;
      const api = window.__FRAME_COST__;
      const t0 = performance.now();
      fc.app.setScene(fc.makeScene("bloom"));
      await fc.app.ready();
      api.stepOnce();
      const toFirstFrame = performance.now() - t0;
      const frames = [];
      for (let i = 0; i < 10; i += 1) { const a = performance.now(); api.stepOnce(); frames.push(performance.now() - a); }
      const diagnostics = fc.app.diagnostics();
      return { toFirstFrame, worstNext: Math.max(...frames), renderPath: diagnostics.renderPath, errors: diagnostics.errors };
    })()`) as { toFirstFrame: number; worstNext: number; renderPath?: { path: string; reason: string }; errors: string[] };
    const hdrPixels = await appCapturePixels(page);
    // And back: removing the effect returns to the direct path.
    const back = await page.evaluate(`(async () => {
      const fc = window.__FC__;
      fc.app.setScene(fc.makeScene("cube"));
      await fc.app.ready();
      window.__FRAME_COST__.stepOnce();
      return fc.app.diagnostics().renderPath;
    })()`) as { path: string; reason: string } | undefined;
    findings["runtime-switch"] = { direct, timing, hdrPixels, back, problems: watched.problems };
    console.log(`EDGE_CASE ${JSON.stringify({ test: "runtime-switch", direct, timing, hdrPixels, back })}`);
    expect(direct?.path).toBe("direct");
    expect(timing.renderPath?.path).toBe("hdr-msaa");
    expect(timing.renderPath?.reason).toContain('effect "bloom"');
    expect(timing.errors).toEqual([]);
    expect(hdrPixels.nonBackground).toBeGreaterThan(500);
    expect(back?.path).toBe("direct");
    expect(watched.problems).toEqual([]);
    await context.close();
  });

  const sizes = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
  for (const size of sizes) {
    for (const dpr of [1, 2, 3]) {
      test(`resize ${size.width}x${size.height} at devicePixelRatio ${dpr}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: size, deviceScaleFactor: dpr });
        const page = await context.newPage();
        const watched = watch(page);
        await open(page, server.origin, "scene=cube&quality=auto&fit=1");
        await step(page, 4);
        const measured = await page.evaluate(() => {
          const fc = (window as unknown as { __FC__: { canvas: HTMLCanvasElement; app: { diagnostics(): { renderSize: readonly number[] } } } }).__FC__;
          const rect = fc.canvas.getBoundingClientRect();
          return { css: [Math.round(rect.width), Math.round(rect.height)], backing: [fc.canvas.width, fc.canvas.height], renderSize: fc.app.diagnostics().renderSize, dpr: window.devicePixelRatio };
        });
        const pixels = await appCapturePixels(page);
        findings[`size/${size.width}x${size.height}@${dpr}`] = { measured, pixels, problems: watched.problems };
        console.log(`EDGE_CASE ${JSON.stringify({ test: `size/${size.width}x${size.height}@${dpr}`, measured, pixels })}`);
        // Backing store = css size x min(devicePixelRatio, tier cap 2), within a pixel of rounding.
        const effective = Math.min(dpr, 2);
        expect(Math.abs(measured.backing[0]! - measured.css[0]! * effective)).toBeLessThanOrEqual(2);
        expect(Math.abs(measured.backing[1]! - measured.css[1]! * effective)).toBeLessThanOrEqual(2);
        expect(pixels.nonBackground).toBeGreaterThan(500);
        expect(watched.problems).toEqual([]);
        await context.close();
      });
    }
  }
});
