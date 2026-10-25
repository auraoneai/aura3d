import type { Browser, Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Gridlock Courier first-frame regression (docs/workflows/game-rework-prompt.md). Remote-only (tools/remote-acr/run.sh).
 *
 * `await app.ready()` settles the mount, not the shader programs: a draw whose program is still compiling is skipped,
 * so a game that renders right after `ready()` lost the road (and more) for as long as the compile took. The game now
 * awaits `warmPrograms(app)` first. The draw-call sequence the engine publishes on `<body data-aura3d-draw-calls>` shows it
 * without depending on timing: with the warm-up every frame after the warm frame draws the full scene.
 * Frames go to the log as `@@FG <name> <i> <n> <base64 jpeg>`.
 */
export const HOOK = "__AURA_DRIFT_AND_DELIVER__";

export const emit = (name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@FG ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};

export interface Look {
  yellow: number;
  std: number;
  carBright: number;
  carMean: number;
}

/** Decode a PNG in the page: lane dashes and luma spread over the lower road region, brightness of the car's body core. */
export async function look(page: Page, png: Buffer): Promise<Look> {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const W = bmp.width, H = bmp.height;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.drawImage(bmp, 0, 0);
    const x0 = Math.round(W * 0.04), x1 = Math.round(W * 0.96), y0 = Math.round(H * 0.66), y1 = Math.round(H * 0.9);
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const rw = x1 - x0;
    let yellow = 0, sum = 0, sum2 = 0, n = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const x = x0 + (p % rw), y = y0 + Math.floor(p / rw);
      if (x > W * 0.82 && y > H * 0.72) continue; // minimap
      if (x < W * 0.3 && y > H * 0.86) continue; // nitro bar
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += l;
      sum2 += l * l;
      n++;
      if (d[i] > 165 && d[i + 1] > 125 && d[i + 2] < 100 && d[i] - d[i + 2] > 80) yellow++;
    }
    const mean = sum / n;
    const cx0 = Math.round(W * 0.462), cx1 = Math.round(W * 0.518), cy0 = Math.round(H * 0.592), cy1 = Math.round(H * 0.66);
    const cd = g.getImageData(cx0, cy0, cx1 - cx0, cy1 - cy0).data;
    let bright = 0, csum = 0;
    const cn = cd.length / 4;
    for (let i = 0; i < cd.length; i += 4) {
      const l = 0.2126 * cd[i] + 0.7152 * cd[i + 1] + 0.0722 * cd[i + 2];
      csum += l;
      if (l > 95) bright++;
    }
    return { yellow: yellow / n, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), carBright: bright / cn, carMean: csum / cn };
  }, png.toString("base64"));
}

// calibrated on frames with and without the road: a flat ground fill reads a luma spread of about 14, a road 19 (a plain straight street) to 39 (lane
// dashes are not required: an intersection view has none in the sampled strip)
export const hasRoad = (s: Look): boolean => s.std > 17;

export const raf = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

export async function open(browser: Browser, server: ExampleDevServer, query: string, w: number, h: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const seq: number[] = [];
    (window as unknown as Record<string, unknown>).__drawSeq = seq;
    new MutationObserver(() => { seq.push(Number(document.body?.dataset.aura3dDrawCalls ?? "NaN")); }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-aura3d-draw-calls"] });
  });
  await page.goto(`${server.origin}/examples/drift-and-deliver-port/${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((hk) => (window as unknown as Record<string, any>)[hk]?.ready?.() === true, HOOK, { timeout: 900_000 });
  return page;
}

/** Draw-call counts of the frames the player could see: the port's `frames` counter only advances for visible renders. */
async function visibleSeq(page: Page): Promise<{ all: number[]; visible: number[] }> {
  const all = await page.evaluate(() => ((window as unknown as { __drawSeq?: number[] }).__drawSeq ?? []).slice());
  const frames = await page.evaluate((hk) => Number((window as unknown as Record<string, any>)[hk].state().frames), HOOK);
  return { all, visible: all.slice(Math.max(0, all.length - frames)) };
}

