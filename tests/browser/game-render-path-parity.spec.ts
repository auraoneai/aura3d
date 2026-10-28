import { expect, test, type Browser } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * A showcase game, `quality: "auto"` against `"production"` (forced with `?aura3d-render=production`), several frames
 * each so state carried from one frame to the next is exercised. Games animate from their own clocks and simulations,
 * so the apps are paused and stepped identically (`__AURA3D_LIVE_APPS__.settle`, Math.random seeded), and a second
 * production load measures how deterministic the route is: auto must sit within that noise plus the PRD tolerance
 * (mean 2/255, interior 6/255).
 *
 *   EXTRA_DIRS="apps/showcase-heatsink" SPECS=tests/browser/game-render-path-parity.spec.ts tools/remote-acr/run.sh
 */
const GAME = process.env.PARITY_GAME ?? "showcase-heatsink";
const ASSET_ORIGIN = process.env.LUMA_ASSET_ORIGIN ?? "https://aura3d.auraone.ai";
const ASSET_PATH = /\.(glb|gltf|bin|ktx2|png|jpe?g|webp|wav|mp3|ogg|hdr|exr|json)(\?.*)?$/i;
const FRAMES = 3;
const SEEDED_RANDOM = `(() => { let s = 0x9e3779b9; Math.random = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0; return s / 4294967296; }; })();`;

async function frames(browser: Browser, origin: string, render: "auto" | "production", fusion: string | null = null): Promise<{ frames: Buffer[]; renderPath: unknown; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(SEEDED_RANDOM);
  await ctx.route((url) => ASSET_PATH.test(url.pathname + url.search) && url.hostname !== new URL(ASSET_ORIGIN).hostname, async (route) => {
    const local = await route.fetch().catch(() => null);
    if (local && local.status() < 400 && !(local.headers()["content-type"] ?? "").includes("text/html")) { await route.fulfill({ response: local }); return; }
    const url = new URL(route.request().url());
    const remote = await fetch(`${ASSET_ORIGIN}${url.pathname}${url.search}`).catch(() => null);
    if (remote && remote.ok) {
      await route.fulfill({ status: 200, headers: { "content-type": remote.headers.get("content-type") ?? "application/octet-stream", "access-control-allow-origin": "*" }, body: Buffer.from(await remote.arrayBuffer()) });
    } else {
      await route.fulfill(local ? { response: local } : { status: 404, body: "" });
    }
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  const query = render === "production" ? "?heal=0&aura3d-render=production" : "?heal=0";
  await page.goto(`${origin}/apps/${GAME}/${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__), undefined, { timeout: 120_000 });
  // Let assets land, then wait until no app still has a pending HDRI / probe (a frame captured before the environment
  // swaps in differs from one captured after, independently of the render path), then freeze and step identically.
  await page.waitForTimeout(8_000);
  await page.waitForFunction(() => {
    const registry = (window as unknown as { __AURA3D_LIVE_APPS__?: { all(): Array<{ diagnostics(): { renderer?: { environment?: { hdriStatus?: string } } } }> } }).__AURA3D_LIVE_APPS__;
    return Boolean(registry) && registry!.all().every((live) => live.diagnostics().renderer?.environment?.hdriStatus !== "pending");
  }, undefined, { timeout: 120_000, polling: 500 });
  await page.waitForTimeout(2_000);
  const result = await page.evaluate(async ([count, fusionSpec]) => {
    const registry = (window as unknown as { __AURA3D_LIVE_APPS__: { settle(steps: number): number; all(): Array<{ step(dt: number): void; screenshot(): { dataUrl: string }; diagnostics(): { renderPath?: unknown } }> } }).__AURA3D_LIVE_APPS__;
    if (fusionSpec !== null) {
      // Diagnosis knob: override the device's bloom fusion config on this page (see webgl2/BloomFusion.ts).
      for (const live of registry.all()) {
        const device = (live as unknown as Record<symbol, { device?: Record<string, unknown> } | undefined>)[Symbol.for("a3d.prd01.renderer")]?.device;
        if (!device) continue;
        if (fusionSpec === "off") { device.bloomFusedPasses = false; continue; }
        const kv = Object.fromEntries(fusionSpec.split(",").map((pair) => pair.split("=") as [string, string]));
        device.bloomFusedPasses = true;
        device.bloomFusion = { accumulate: kv.acc !== "0", blur2dFromLevel: Number(kv.b2d ?? 5), extract: kv.ext !== "0" };
      }
    }
    registry.settle(30);
    const app = registry.all()[0]!;
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      if (i > 0) app.step(1 / 60);
      const img = new Image();
      img.src = app.screenshot().dataUrl;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height).data;
      let binary = "";
      for (let j = 0; j < data.length; j += 0x8000) binary += String.fromCharCode(...data.subarray(j, j + 0x8000));
      out.push(btoa(binary));
    }
    return { frames: out, renderPath: app.diagnostics().renderPath };
  }, [FRAMES, fusion] as const);
  await ctx.close();
  return { frames: result.frames.map((b) => Buffer.from(b, "base64")), renderPath: result.renderPath, errors };
}

function diff(a: Buffer, b: Buffer): { mean: number; max: number; over6: number; pixels: number } {
  let sum = 0;
  let max = 0;
  let over6 = 0;
  const pixels = Math.min(a.length, b.length) / 4;
  for (let p = 0; p < pixels; p += 1) {
    let pixelMax = 0;
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs(a[p * 4 + c]! - b[p * 4 + c]!);
      sum += d;
      if (d > pixelMax) pixelMax = d;
    }
    if (pixelMax > max) max = pixelMax;
    if (pixelMax > 6) over6 += 1;
  }
  return { mean: Math.round((sum / (pixels * 3)) * 1000) / 1000, max, over6, pixels };
}

test.describe("showcase game: auto vs production frames", () => {
  test.setTimeout(20 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test(`${GAME}: ${FRAMES} stepped frames on both paths`, async ({ browser }) => {
    const productionA = await frames(browser, server.origin, "production");
    const productionB = await frames(browser, server.origin, "production");
    const auto = await frames(browser, server.origin, "auto");
    // Diagnosis (PARITY_FUSION_VARIANTS="off;acc=0,b2d=5,ext=1;..."): the same auto page with each fusion config.
    for (const spec of (process.env.PARITY_FUSION_VARIANTS ?? "").split(";").filter(Boolean)) {
      const variant = await frames(browser, server.origin, "auto", spec);
      console.log(`GAME_PARITY_VARIANT ${JSON.stringify({ game: GAME, fusion: spec, frames: variant.frames.map((f, i) => diff(productionA.frames[i]!, f)) })}`);
    }
    const rows = Array.from({ length: FRAMES }, (_, i) => ({
      frame: i,
      control: diff(productionA.frames[i]!, productionB.frames[i]!),
      auto: diff(productionA.frames[i]!, auto.frames[i]!)
    }));
    console.log(`GAME_PARITY ${JSON.stringify({ game: GAME, renderPathAuto: auto.renderPath, renderPathProduction: productionA.renderPath, rows, errors: [...productionA.errors, ...auto.errors] })}`);
    expect([...productionA.errors, ...productionB.errors, ...auto.errors]).toEqual([]);
    for (const row of rows) {
      expect(row.auto.mean, `frame ${row.frame} mean (control ${row.control.mean})`).toBeLessThanOrEqual(row.control.mean + 2);
      expect(row.auto.over6 / row.auto.pixels, `frame ${row.frame} pixels over 6/255 (control ${row.control.over6})`).toBeLessThanOrEqual(row.control.over6 / row.control.pixels + 0.005);
    }
  });
});
