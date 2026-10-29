import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lane E1 (render path and app core) remote evidence. Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so
 * everything goes to the log:
 *   E1_META <json>                         per-game steady-state luma, render path report, fps, E1 warnings
 *   E1_BLOOM <json>                        RP-05: fused bloom (quality auto) against the production pass sequence, same frame
 *   E1_URL <json>                          RP-04: a page with typo'd ?aura3d-render= / ?aura3d-bloom-fusion= still mounts
 *   E1_JPG <game> <shot> <i>/<n> <b64>     canvas-only JPEG, chunked
 * Select a game group with `--grep=@g<n>` in SPECS. The software-GL runner presents about one frame every 5 to 10 s, so the first
 * frame is never judged: the luma shot is taken after SETTLE_MS, and the bloom A/B runs on a paused app after that.
 *
 * RP-05 method: `quality: "auto"` and `quality: "production"` differ on the HDR route only in two device switches set at mount
 * (`bloomFusedPasses`, `skipUnusedShadowCascades`; see app/renderPath.ts and compiler/renderer.ts). The A/B pauses the app, renders
 * the same simulated frame with the switches as mounted (A1), with both off (B, the production sequence) and as mounted again (A2),
 * and reports mean/max absolute RGB difference A1-B against the A1-A2 noise floor. Two page loads (`?aura3d-render=production`) would
 * mix in gameplay and camera motion between loads, so they cannot isolate a 1-2/255 bloom change.
 */
const SETTLE_MS = Number(process.env.E1_SETTLE_MS ?? 30_000);
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

interface Game { readonly slug: string; readonly folder: string; readonly group: number; }
const FOLDERS: ReadonlyArray<readonly [string, string]> = [
  ["top-tennis", "showcase-top-tennis"], ["roadster-rush", "showcase-roadster-rush"], ["heatsink", "showcase-heatsink"],
  ["teleoperator", "showcase-teleoperator"], ["iron-crown", "showcase-iron-crown"], ["pips-big-leap", "showcase-pips-big-leap"],
  ["aura-hoops-3d", "showcase-aura-hoops-3d"], ["aura-diamond-3d", "showcase-aura-diamond-3d"], ["aura-fc-3d", "showcase-aura-fc-3d"],
  ["aura-links-3d", "showcase-aura-links-3d"], ["bunker-zero", "showcase-bunker-zero"], ["slingshot-siege", "showcase-slingshot-siege"],
  ["dot-dash-3d", "showcase-dot-dash-3d"], ["cross-hop", "showcase-cross-hop"], ["strange-orbit-port", "showcase-strange-orbit-port"],
  ["splat-rush-port", "showcase-splat-rush-port"], ["serpentine-sky-run-port", "showcase-serpentine-sky-run-port"],
  ["drift-and-deliver-port", "showcase-drift-and-deliver-port"], ["heatsink-port", "showcase-heatsink-port"],
  ["ninja-runner-port", "showcase-ninja-runner-port"], ["last-train-port", "showcase-last-train-port"],
  ["roadster-hours-port", "showcase-roadster-hours-port"], ["where-the-wind-wanders-port", "showcase-where-the-wind-wanders-port"],
  ["silt-and-signal-port", "showcase-silt-and-signal-port"], ["cloud-runner-port", "showcase-cloud-runner-port"]
];
const GAMES: readonly Game[] = FOLDERS.map(([slug, folder], index) => ({ slug, folder, group: Math.floor(index / 5) + 1 }));
// Ports that wrap an example resolve their GLBs through import.meta.url, which the bundled app entry breaks; load the example page itself
// (same table as fit-grounding-sweep.spec.ts).
const EXAMPLE_PAGE: Record<string, string> = {
  "showcase-ninja-runner-port": "/examples/ninja-runner-port/index.html",
  "showcase-last-train-port": "/examples/last-train-port/index.html",
  "showcase-cloud-runner-port": "/examples/kid-goku-beyond-the-clouds-port/index.html"
};
const pageUrl = (folder: string): string => EXAMPLE_PAGE[folder] ?? `/apps/${folder}/index.html`;

/** Canvas rectangle of the first live app (games can stack HUD canvases over it). */
async function appCanvasClip(page: Page) {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const canvas = reg?.all()[0]?.canvas as HTMLCanvasElement | undefined;
    const r = canvas?.getBoundingClientRect();
    if (!r || r.width < 2 || r.height < 2) return undefined;
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, innerWidth - Math.max(0, r.left)), height: Math.min(r.height, innerHeight - Math.max(0, r.top)) };
  });
}

/** Canvas-only PNG: hide every other element (HUD) so luma and diffs measure the 3D frame. */
async function canvasPng(page: Page): Promise<Buffer> {
  const handle = await page.addStyleTag({ content: "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}" });
  try {
    const clip = await appCanvasClip(page);
    return await page.screenshot({ type: "png", ...(clip ? { clip } : {}) });
  } finally {
    await handle.evaluate((el) => el.remove());
  }
}

async function lumaStats(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const hist = new Uint32Array(256);
    let sum = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
      hist[y]!++; sum += y;
    }
    const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= p * n) return v; } return 255; };
    return { w: c.width, h: c.height, mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95) };
  }, png.toString("base64"));
}

/** Mean and max absolute RGB difference (0..255) and the share of pixels differing by more than 2/255 on any channel. */
async function diffStats(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(async ([a64, b64]) => {
    const decode = async (s: string) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    };
    const [x, y] = [await decode(a64!), await decode(b64!)];
    if (x.width !== y.width || x.height !== y.height) return { sizeMismatch: true };
    let sum = 0, max = 0, over2 = 0;
    const n = x.data.length / 4;
    for (let i = 0; i < x.data.length; i += 4) {
      let px = 0;
      for (let k = 0; k < 3; k++) {
        const dd = Math.abs(x.data[i + k]! - y.data[i + k]!);
        sum += dd;
        if (dd > max) max = dd;
        if (dd > px) px = dd;
      }
      if (px > 2) over2++;
    }
    return { mean: +(sum / (n * 3)).toFixed(3), max, over2Frac: +(over2 / n).toFixed(4) };
  }, [a.toString("base64"), b.toString("base64")] as const);
}

function logJpg(game: string, shot: string, jpg: Buffer): void {
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`E1_JPG ${game} ${shot} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function engineInfo(page: Page) {
  return page.evaluate(async () => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    // ENG-FPS: count real rAF callbacks for 6 s next to the engine's own figure.
    const start = performance.now();
    let frames = 0;
    await new Promise<void>((done) => {
      const tick = (): void => { frames++; if (performance.now() - start < 6000) requestAnimationFrame(tick); else done(); };
      requestAnimationFrame(tick);
    });
    const rafFps = +(frames / ((performance.now() - start) / 1000)).toFixed(2);
    try {
      const dg = app.diagnostics?.();
      const e1 = (dg?.warnings ?? []).filter((w: string) => /QUALITY_URL|RENDERER_QUALITY|SAFE_BASIC|DIRECT_PATH|POST_IGNORED|SCREENSHOT/.test(w));
      return { app: true, renderPath: dg?.renderPath ?? null, drawCalls: dg?.drawCalls ?? null, fps: dg?.fps ?? null, rafFps, e1Warnings: e1 };
    } catch (e) { return { app: true, diagErr: String(e), rafFps }; }
  });
}

/** RP-05 A/B on one paused frame. Returns undefined when the app cannot be stepped (no renderer seam, async frame mode). */
async function bloomAb(page: Page, game: string) {
  const setSwitches = (mode: "as-mounted" | "production") => page.evaluate((m) => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg!.all()[0];
    const device = app[Symbol.for("a3d.prd01.renderer")]?.device as Record<string, unknown> | undefined;
    if (!device) throw new Error("no renderer seam");
    const saved = (globalThis as unknown as { __E1_SAVED__?: Record<string, unknown> });
    saved.__E1_SAVED__ ??= { bloomFusedPasses: device.bloomFusedPasses, skipUnusedShadowCascades: device.skipUnusedShadowCascades };
    if (m === "production") { device.bloomFusedPasses = false; device.skipUnusedShadowCascades = false; }
    else Object.assign(device, saved.__E1_SAVED__);
    return { bloomFusedPasses: device.bloomFusedPasses, skipUnusedShadowCascades: device.skipUnusedShadowCascades };
  }, mode);
  const render = () => page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg!.all()[0];
    // Three frames at dt 0 so temporal passes (TAA, motion blur history) settle on the held frame.
    for (let i = 0; i < 3; i++) app.step(0);
  });
  try {
    await page.evaluate(() => {
      const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
      reg!.all()[0].pause();
    });
    const mounted = await setSwitches("as-mounted");
    await render();
    const a1 = await canvasPng(page);
    const production = await setSwitches("production");
    await render();
    const b = await canvasPng(page);
    await setSwitches("as-mounted");
    await render();
    const a2 = await canvasPng(page);
    const fusedVsProduction = await diffStats(page, a1, b);
    const noiseFloor = await diffStats(page, a1, a2);
    logJpg(game, "ab-fused", await page.screenshot({ type: "jpeg", quality: 70, ...((await appCanvasClip(page)) ?? {}) }));
    return { mounted, production, fusedVsProduction, noiseFloor };
  } catch (error) {
    return { error: String(error).slice(0, 200) };
  }
}

test.describe("e1 render path", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const game of GAMES) {
    test(`e1 ${game.slug} @g${game.group}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`E1_ERR ${game.slug} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error") log(`E1_CONSOLE ${game.slug} ${m.text().slice(0, 200)}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${pageUrl(game.folder)}?capture=1`, { waitUntil: "domcontentloaded", timeout: 240_000 });
      const readyAt = Date.now();
      const ready = await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 }).then(() => true, () => false);
      if (!ready) { log(`E1_META ${JSON.stringify({ game: game.slug, ready: false })}`); return; }
      const loadMs = Date.now() - readyAt;
      await page.waitForTimeout(SETTLE_MS);
      const png = await canvasPng(page);
      const luma = await lumaStats(page, png);
      const info = await engineInfo(page);
      log(`E1_META ${JSON.stringify({ game: game.slug, ready: true, loadMs, settleMs: SETTLE_MS, luma, info })}`);
      logJpg(game.slug, "steady", await page.screenshot({ type: "jpeg", quality: 70, ...((await appCanvasClip(page)) ?? {}) }));
      const fusion = (info as { renderPath?: { bloomFusion?: string } }).renderPath?.bloomFusion;
      if (fusion && fusion !== "off") log(`E1_BLOOM ${JSON.stringify({ game: game.slug, bloomFusion: fusion, ...(await bloomAb(page, game.slug)) })}`);
      else log(`E1_BLOOM ${JSON.stringify({ game: game.slug, bloomFusion: fusion ?? null, skipped: "no fused bloom on this mount" })}`);
      log(`E1_DONE ${game.slug}`);
    });
  }

  // RP-04: debug URL typos. Before the fix the mount threw QUALITY_OPTION_INVALID and the game showed its WebGL error screen.
  for (const [slug, folder] of [["dot-dash-3d", "showcase-dot-dash-3d"], ["heatsink-port", "showcase-heatsink-port"]] as const) {
    test(`e1 url-typo ${slug} @g6`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${pageUrl(folder)}?capture=1&aura3d-render=prodution&aura3d-bloom-fusion=fused`, { waitUntil: "domcontentloaded", timeout: 240_000 });
      const mounted = await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 }).then(() => true, () => false);
      await page.waitForTimeout(10_000);
      const info = mounted ? await engineInfo(page) : undefined;
      log(`E1_URL ${JSON.stringify({ game: slug, mounted, info, messages: errors.filter((e) => /QUALITY|aura3d-render|bloom-fusion|WebGL/i.test(e)).slice(0, 6) })}`);
      logJpg(slug, "url-typo", await page.screenshot({ type: "jpeg", quality: 60 }));
    });
  }
});
