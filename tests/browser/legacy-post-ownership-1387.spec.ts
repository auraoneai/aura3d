import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * #1387 reproduction probe: does a production showcase route still throw
 * "Render target is not a live WebGL2 resource owned by this device"
 * (INVALID_RESOURCE from LegacyPost.presentLdrPostprocess) under headless
 * Chromium + SwiftShader, and is the black capture an engine ownership failure
 * or a compositor failure?
 *
 * Each variant records (a) the console/page-error text that matches the
 * ownership failure, (b) gl.readPixels of the default framebuffer (the hooked
 * variants force preserveDrawingBuffer so the last presented frame is readable;
 * that attribute does not change which render target the engine binds), and
 * (c) a page.screenshot of the same page. Engine failure = the ownership error
 * is thrown or readPixels is dark. Compositor failure = readPixels is lit while
 * the screenshot is dark. Results are printed as LEGACY_POST_1387 lines
 * (remote runs cannot egress files except through the artifact upload).
 */

const OWNERSHIP = /not a live WebGL2 resource owned by this device|INVALID_RESOURCE|non-device-owned/i;
const OUT = resolve(process.cwd(), "tests/reports/legacy-post-1387");
const SWIFTSHADER_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

const HOOK = `(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  window.__a3dGl = [];
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    const isGl = type === "webgl2" || type === "webgl";
    const ctx = original.call(this, type, isGl ? Object.assign({}, attributes, { preserveDrawingBuffer: true }) : attributes);
    if (isGl && ctx && !window.__a3dGl.some((entry) => entry.ctx === ctx)) window.__a3dGl.push({ ctx, canvas: this });
    return ctx;
  };
})();`;

interface Stats { readonly width: number; readonly height: number; readonly meanLuma: number; readonly nonBlack: number; readonly colors: number }

async function pngStats(page: Page, png: Buffer): Promise<Stats> {
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0; let sum = 0; const seen = new Set<number>(); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (luma > 8) nonBlack++;
      sum += luma;
      seen.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3));
    }
    return { width: c.width, height: c.height, meanLuma: sum / n, nonBlack: nonBlack / n, colors: seen.size };
  }, png.toString("base64"));
}

/** gl.readPixels of the default framebuffer of the largest hooked canvas, as stats plus a PNG. */
async function readPixelsProbe(page: Page): Promise<{ stats: Stats; png: Buffer } | { error: string }> {
  const result = await page.evaluate(() => {
    const entries = ((window as unknown as { __a3dGl?: Array<{ ctx: WebGL2RenderingContext; canvas: HTMLCanvasElement }> }).__a3dGl) ?? [];
    if (entries.length === 0) return { error: "no hooked WebGL canvas" };
    const entry = entries.reduce((best, e) => (e.canvas.width * e.canvas.height > best.canvas.width * best.canvas.height ? e : best));
    const gl = entry.ctx;
    if (gl.isContextLost()) return { error: "context lost" };
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonBlack = 0; let sum = 0; const seen = new Set<number>(); const n = w * h;
    for (let i = 0; i < px.length; i += 4) {
      const luma = 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
      if (luma > 8) nonBlack++;
      sum += luma;
      seen.add(((px[i]! >> 3) << 10) | ((px[i + 1]! >> 3) << 5) | (px[i + 2]! >> 3));
    }
    const flipped = new Uint8ClampedArray(px.length);
    for (let y = 0; y < h; y++) flipped.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    const c2 = document.createElement("canvas");
    c2.width = w; c2.height = h;
    c2.getContext("2d")!.putImageData(new ImageData(flipped, w, h), 0, 0);
    return { width: w, height: h, meanLuma: sum / n, nonBlack: nonBlack / n, colors: seen.size, dataUrl: c2.toDataURL("image/png") };
  });
  if ("error" in result) return { error: result.error };
  const { dataUrl, ...stats } = result;
  return { stats, png: Buffer.from(dataUrl.split(",")[1]!, "base64") };
}

interface Variant {
  readonly name: string;
  readonly path: string;
  readonly hooked: boolean;
  /** `still`: route steps N frames itself; `live`: wait wall-clock after ready. */
  readonly mode: "still" | "live" | "control";
  readonly budgetMs: number;
}

const VARIANTS: readonly Variant[] = [
  { name: "control-red-clear", path: "", hooked: true, mode: "control", budgetMs: 60_000 },
  { name: "links-still60-hooked", path: "/apps/showcase-aura-links-3d/?still=60", hooked: true, mode: "still", budgetMs: 330_000 },
  { name: "links-still60-native", path: "/apps/showcase-aura-links-3d/?still=60", hooked: false, mode: "still", budgetMs: 330_000 },
  { name: "heatsink-live-hooked", path: "/apps/showcase-heatsink/", hooked: true, mode: "live", budgetMs: 240_000 },
  { name: "links-still60-core-output-off-hooked", path: "/apps/showcase-aura-links-3d/?still=60&a3d-qr=-core.output", hooked: true, mode: "still", budgetMs: 330_000 }
];
const ONLY = process.env.LEGACY_POST_1387_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);

test.describe.configure({ mode: "serial" });

let server: ExampleDevServer;
test.beforeAll(async () => { server = await startExampleDevServer(process.cwd()); mkdirSync(OUT, { recursive: true }); });
test.afterAll(async () => { await server?.close(); });

for (const variant of VARIANTS) {
  if (ONLY && !ONLY.includes(variant.name)) continue;
  test(`#1387 ${variant.name}`, async () => {
    test.setTimeout(variant.budgetMs + 120_000);
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true, args: SWIFTSHADER_ARGS });
      const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      if (variant.hooked) await page.addInitScript(HOOK);
      const messages: string[] = [];
      const record = (kind: string, text: string): void => { if (messages.length < 400) messages.push(`${kind}: ${text.slice(0, 300)}`); };
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") record(`console.${m.type()}`, m.text()); });
      page.on("pageerror", (e) => record("pageerror", String(e.message ?? e)));
      const startedAt = Date.now();
      if (variant.mode === "control") {
        await page.setContent(`<body style="margin:0"><canvas id="c" width="800" height="600"></canvas><script>
          const gl = document.getElementById("c").getContext("webgl2");
          gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
          requestAnimationFrame(function tick() { gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); requestAnimationFrame(tick); });
        </script></body>`);
        await page.waitForTimeout(1500);
      } else {
        await page.goto(`${server.origin}${variant.path}`, { waitUntil: "load", timeout: 120_000 });
        const ready = await page.waitForFunction(() => document.body?.dataset?.aura3dReady === "true"
          || Boolean((window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__), undefined, { timeout: variant.budgetMs - 30_000 }).then(() => true).catch(() => false);
        record("probe", `ready=${ready} after ${Date.now() - startedAt}ms`);
        if (variant.mode === "still") {
          await page.waitForFunction(() => {
            const w = window as unknown as { __AURA3D_GAME_EVIDENCE__?: { framesRendered?: number } };
            return (w.__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= 60;
          }, undefined, { timeout: Math.max(5_000, variant.budgetMs - (Date.now() - startedAt) - 20_000), polling: 1000 }).catch(() => record("probe", "framesRendered did not reach 60 inside the budget"));
        } else {
          await page.waitForTimeout(Math.max(0, Math.min(25_000, variant.budgetMs - (Date.now() - startedAt) - 20_000)));
        }
      }
      const evidence = await page.evaluate(() => {
        const w = window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>; __AURA3D_ROUTE_READY__?: { diagnostics?: unknown; state?: unknown } };
        const e = w.__AURA3D_GAME_EVIDENCE__ ?? {};
        return { framesRendered: e.framesRendered ?? null, ready: e.ready ?? null, routeState: w.__AURA3D_ROUTE_READY__?.state ?? null, diagnostics: JSON.stringify(w.__AURA3D_ROUTE_READY__?.diagnostics ?? null).slice(0, 600) };
      }).catch(() => null);
      const screenshot = await page.screenshot({ type: "png", timeout: 90_000 }).catch((e: unknown) => { record("screenshot", String(e)); return null; });
      const shotStats = screenshot ? await pngStats(page, screenshot) : null;
      const pixels = variant.hooked ? await readPixelsProbe(page).catch((e: unknown) => ({ error: String(e) })) : null;
      if (screenshot) writeFileSync(resolve(OUT, `${variant.name}.screenshot.png`), screenshot);
      if (pixels && "png" in pixels) writeFileSync(resolve(OUT, `${variant.name}.readpixels.png`), pixels.png);
      const ownership = messages.filter((m) => OWNERSHIP.test(m));
      const result = {
        variant: variant.name, path: variant.path, hooked: variant.hooked, elapsedMs: Date.now() - startedAt, evidence,
        ownershipErrorCount: ownership.length, ownershipSample: ownership.slice(0, 3),
        screenshot: shotStats, readPixels: pixels ? ("stats" in pixels ? pixels.stats : pixels) : null,
        // lit readPixels with a dark screenshot is a compositor failure; a dark readPixels (or the ownership throw) is the engine.
        verdict: ownership.length > 0 ? "ENGINE_OWNERSHIP_ERROR"
          : pixels && "stats" in pixels && shotStats
            ? (pixels.stats.nonBlack > 0.02 && shotStats.nonBlack <= 0.02 ? "COMPOSITOR_BLACK_ENGINE_LIT" : pixels.stats.nonBlack <= 0.02 ? "ENGINE_DARK" : "BOTH_LIT")
            : shotStats ? (shotStats.nonBlack > 0.02 ? "SCREENSHOT_LIT" : "SCREENSHOT_DARK") : "NO_CAPTURE",
        messages: messages.slice(0, 40)
      };
      writeFileSync(resolve(OUT, `${variant.name}.json`), JSON.stringify(result, null, 2));
      console.log(`LEGACY_POST_1387 ${JSON.stringify(result)}`);
      expect(shotStats ?? pixels).not.toBeNull();
    } finally {
      await browser?.close().catch(() => undefined);
    }
  });
}
