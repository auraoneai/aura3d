import { test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lane E1 wave 2 remote evidence (the handoffs from E2 and G01). Remote only (tools/remote-acr/run.sh); the run has no artifact
 * egress, so everything goes to the log:
 *   E1W2_FIT <json>     canvas and parent boxes, backing store, inline size, info().render (G01: C2 canvas fit, triangle count)
 *   E1W2_HOP <json>     Cross Hop per-theme steady-state luma after swapLook (E2: removing the mounted "look" group)
 *   E1W2_LOSS <json>    top-tennis forced context loss and restore: page errors, deviceLost, navigations, luma (G01: C8)
 *   E1W2_JPG <game> <shot> <i>/<n> <b64>   page JPEG, chunked
 * Tags: @w2fit, @w2hop, @w2loss. The software-GL runner presents about one frame every several seconds, so every luma figure is
 * taken after a settle wait, never from the first frame.
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

function logJpg(game: string, shot: string, jpg: Buffer): void {
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`E1W2_JPG ${game} ${shot} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function serveAppPublicAssets(page: Page, folder: string): Promise<void> {
  const dir = join(process.cwd(), "apps", folder, "public", "aura-assets");
  if (!existsSync(dir)) return;
  await page.route("**/aura-assets/**", async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^.*\/aura-assets\//, ""));
    const file = join(dir, name);
    if (!name.includes("..") && existsSync(file)) {
      const type = file.endsWith(".glb") ? "model/gltf-binary" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : file.endsWith(".ogg") ? "audio/ogg" : "application/octet-stream";
      await route.fulfill({ status: 200, body: readFileSync(file), headers: { "content-type": type } });
    } else await route.continue();
  });
}

/** Luma of the visible viewport (page screenshot, HUD hidden) and of the canvas's on-screen part. */
async function viewportLuma(page: Page) {
  const handle = await page.addStyleTag({ content: "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}" });
  let png: Buffer;
  try { png = await page.screenshot({ type: "png" }); } finally { await handle.evaluate((el) => el.remove()); }
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      sum += y; if (y < 8) dark++;
    }
    return { w: c.width, h: c.height, mean: +(sum / n).toFixed(2), darkFrac: +(dark / n).toFixed(4) };
  }, png.toString("base64"));
}

async function fitInfo(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    const canvas = app?.canvas as HTMLCanvasElement | undefined;
    if (!canvas) return { app: Boolean(app) };
    const r = canvas.getBoundingClientRect();
    const p = canvas.parentElement?.getBoundingClientRect();
    const box = (b: DOMRect | undefined) => b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) } : null;
    let render: unknown = null;
    try { render = app.info?.render ?? null; } catch (e) { render = String(e); }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      canvas: box(r), parent: box(p),
      backing: { width: canvas.width, height: canvas.height },
      inline: { width: canvas.style.width, height: canvas.style.height },
      offscreenPx: Math.max(0, Math.round(r.bottom - innerHeight)),
      render
    };
  });
}

test.describe("e1 wave 2", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  // C2: the portrait shell styles the canvas calc(100% - score - controls) with a top margin. Landscape and two other games are controls.
  const FIT: ReadonlyArray<readonly [string, string, number, number]> = [
    ["top-tennis", "showcase-top-tennis", 390, 844],
    ["top-tennis", "showcase-top-tennis", 1280, 720],
    ["cross-hop", "showcase-cross-hop", 390, 844],
    ["pips-big-leap", "showcase-pips-big-leap", 390, 844]
  ];
  for (const [slug, folder, width, height] of FIT) {
    test(`e1w2 fit ${slug} ${width}x${height} @w2fit`, async ({ page }) => {
      page.on("pageerror", (e) => log(`E1W2_ERR ${slug} pageerror ${e.message.slice(0, 300)}`));
      await page.setViewportSize({ width, height });
      await serveAppPublicAssets(page, folder);
      await page.goto(`${server.origin}/apps/${folder}/index.html?capture=1`, { waitUntil: "domcontentloaded", timeout: 240_000 });
      const ready = await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 }).then(() => true, () => false);
      if (!ready) { log(`E1W2_FIT ${JSON.stringify({ game: slug, width, height, ready: false })}`); return; }
      await page.waitForTimeout(20_000);
      const first = await fitInfo(page);
      // Top Tennis: start a match so the shell enters data-mode=playing (the portrait bands apply there too).
      if (slug === "top-tennis") {
        await page.evaluate(() => { document.querySelector<HTMLButtonElement>("#aura-btn-play")?.click(); });
        await page.waitForTimeout(30_000);
      }
      const later = await fitInfo(page);
      const luma = await viewportLuma(page);
      log(`E1W2_FIT ${JSON.stringify({ game: slug, width, height, ready: true, first, later, luma })}`);
      logJpg(slug, `fit-${width}x${height}`, await page.screenshot({ type: "jpeg", quality: 60 }));
    });
  }

  // E2 handoff: swapLook removes the mounted "look" group and adds the theme's look. Before the fix the theme-0 HDRI, key light
  // and AO stayed live, so themes 3 (Emberline) and 4 (Neon District) were lit by both looks.
  test("e1w2 cross-hop themes @w2hop", async ({ page }) => {
    page.on("pageerror", (e) => log(`E1W2_ERR cross-hop pageerror ${e.message.slice(0, 300)}`));
    await page.setViewportSize({ width: 1280, height: 720 });
    await serveAppPublicAssets(page, "showcase-cross-hop");
    await page.goto(`${server.origin}/apps/showcase-cross-hop/index.html?capture=1`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    const ready = await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 }).then(() => true, () => false);
    if (!ready) { log(`E1W2_HOP ${JSON.stringify({ ready: false })}`); return; }
    await page.waitForTimeout(30_000);
    const shots: Record<string, unknown> = { theme0: await viewportLuma(page) };
    logJpg("cross-hop", "theme0", await page.screenshot({ type: "jpeg", quality: 60 }));
    for (const theme of [3, 4, 0]) {
      const clicked = await page.evaluate((t) => {
        const find = () => document.querySelector<HTMLButtonElement>(`button[data-theme="${t}"]`);
        if (!find()) document.querySelector<HTMLButtonElement>('button[data-m="tour"]')?.click();
        const b = find();
        b?.click();
        return Boolean(b);
      }, theme);
      await page.waitForTimeout(45_000);
      const label = await page.evaluate(() => document.querySelector("#ch-theme")?.textContent ?? null);
      shots[`theme${theme}-after-swap`] = { clicked, label, luma: await viewportLuma(page) };
      logJpg("cross-hop", `theme${theme}-swap`, await page.screenshot({ type: "jpeg", quality: 60 }));
    }
    log(`E1W2_HOP ${JSON.stringify(shots)}`);
  });

  // C8: lose the context through WEBGL_lose_context, then restore it.
  test("e1w2 top-tennis context loss @w2loss", async ({ page }) => {
    const errors: string[] = [];
    let navigations = 0;
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations++; });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/apps/showcase-top-tennis/index.html?capture=1`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    const ready = await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 }).then(() => true, () => false);
    if (!ready) { log(`E1W2_LOSS ${JSON.stringify({ ready: false })}`); return; }
    await page.waitForTimeout(20_000);
    const before = { luma: await viewportLuma(page), errors: errors.length, navigations };
    const lost = await page.evaluate(() => {
      const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
      const canvas = reg?.all()[0]?.canvas as HTMLCanvasElement | undefined;
      const gl = canvas?.getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_lose_context");
      (globalThis as unknown as { __E1W2_EXT__?: unknown }).__E1W2_EXT__ = ext;
      ext?.loseContext();
      return Boolean(ext);
    });
    await page.waitForTimeout(10_000);
    const during = await page.evaluate(() => {
      const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
      const app = reg?.all()[0];
      let deviceLost: unknown = null;
      try { deviceLost = app?.deviceLost?.(); } catch (e) { deviceLost = String(e); }
      return { deviceLost, errors: (app?.diagnostics?.().errors ?? []).slice(-3) };
    });
    const duringErrors = [...errors];
    await page.evaluate(() => {
      (globalThis as unknown as { __E1W2_EXT__?: { restoreContext(): void } }).__E1W2_EXT__?.restoreContext();
    });
    await page.waitForTimeout(40_000);
    const after = { luma: await viewportLuma(page).catch((e) => String(e)), navigations };
    log(`E1W2_LOSS ${JSON.stringify({ ready: true, lost, before, during, pageErrorsWhileLost: duringErrors.slice(0, 6), pageErrorsTotal: errors.length, after })}`);
    logJpg("top-tennis", "after-restore", await page.screenshot({ type: "jpeg", quality: 60 }));
  });
});
