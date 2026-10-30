import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lane E1 wave 3, remote only (tools/remote-acr/run.sh; never local Playwright). G22 handoff: with `resize: false` and a game that
 * resizes its own backing store on `window.resize` (Saltwind Highway, `examples/roadster-hours-port`), growing the page from
 * 1280x720 to 1440x900 after load left the frame at the old size with black bands. The ACR run has no artifact egress, so
 * records go to the log:
 *   E1W3_META <json>             canvas CSS box, inline style, backing size, luma of the band and inner regions
 *   E1W3_JPG  <name> <i>/<n> <b64>  full-page JPEG, chunked
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
type Hooks = Record<string, any>;

async function api<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([name, rest]) => {
    const hooks = (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__;
    return (hooks[name as string] as (...a: unknown[]) => unknown)(...(rest as unknown[]));
  }, [fn, args] as const) as Promise<T>;
}

/** Mean luma (Rec. 601, 0-255) of page regions, read from a page screenshot decoded in the page. */
async function regionLuma(page: Page, png: Buffer, regions: Record<string, [number, number, number, number]>): Promise<Record<string, number>> {
  return page.evaluate(async ([b64, rs]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const out: Record<string, number> = {};
    for (const [name, [x, y, w, h]] of Object.entries(rs as Record<string, [number, number, number, number]>)) {
      if (w <= 0 || h <= 0) { out[name] = -1; continue; }
      const d = ctx.getImageData(x, y, w, h).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      out[name] = +(sum / (d.length / 4)).toFixed(2);
    }
    return out;
  }, [png.toString("base64"), regions] as const);
}

async function record(page: Page, name: string, viewport: { width: number; height: number }): Promise<void> {
  await api(page, "renderNow");
  await page.waitForTimeout(500);
  const canvas = await page.evaluate(() => {
    const el = document.querySelector("canvas#world") as HTMLCanvasElement;
    const r = el.getBoundingClientRect();
    const h = (window as unknown as { __AURA_ROADSTER_HOURS__: Hooks }).__AURA_ROADSTER_HOURS__;
    const dg = h.diagnostics?.() ?? {};
    return { css: [Math.round(r.width), Math.round(r.height)], inline: [el.style.width, el.style.height], backing: [el.width, el.height], renderSize: dg.renderSize ?? null, errors: (dg.errors ?? []).length };
  });
  const png = await page.screenshot({ type: "png" });
  // Bands: the strips right of x=1280 and below y=720 (where the old frame ended). Inner: the old frame's area.
  const luma = await regionLuma(page, png, {
    inner: [0, 0, Math.min(1280, viewport.width), Math.min(720, viewport.height)],
    rightBand: [1280, 0, viewport.width - 1280, viewport.height],
    bottomBand: [0, 720, Math.min(1280, viewport.width), viewport.height - 720]
  });
  log(`E1W3_META ${JSON.stringify({ name, viewport, ...canvas, luma })}`);
  const b64 = (await page.screenshot({ type: "jpeg", quality: 80 })).toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`E1W3_JPG ${name} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("e1 wave 3 @e1w3", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("roadster-hours-port grows from 1280x720 to 1440x900 after load", async ({ page }) => {
    page.on("pageerror", (e) => log(`E1W3_ERR pageerror ${e.message.slice(0, 300)}`));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1&meshy=0&level=0`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA_ROADSTER_HOURS__?: Hooks }).__AURA_ROADSTER_HOURS__?.ready), undefined, { timeout: 900_000, polling: 1000 });
    await api(page, "begin");
    await api(page, "setAutopilot", true);
    await api(page, "stepSteps", 330 + 600);
    await record(page, "start-1280x720", { width: 1280, height: 720 });
    await page.setViewportSize({ width: 1440, height: 900 });
    // Steady state: two shots after the resize, 15 s apart; judge the later one.
    for (const [i, wait] of [[0, 5_000], [1, 15_000]] as const) {
      await page.waitForTimeout(wait);
      await record(page, `grown-1440x900-${i}`, { width: 1440, height: 900 });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(5_000);
    await record(page, "shrunk-1280x720", { width: 1280, height: 720 });
    log("E1W3_DONE resize");
  });
});
