import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G15 (Craterline GP, `strange-orbit-port`), LIGHT-01 / SO-4: steady-state luma of the lit GLB riders.
 * Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so output goes to the log:
 *   SO_META <json>                        whole-frame luma and luma inside the rider mask
 *   SO_JPG  <target> <shot> <i>/<n> <b64> canvas-only JPEG, chunked
 * Region numbers are fixed boxes on the deterministic poses: the menu bike (camera fixed, rider parked at s = 35) and,
 * in the race pose, the player rider, the gate pylon GLB and a sky patch (custom shader, the control). A mask made by
 * hiding the riders does not work: the world update shows the rider models again every frame.
 * Shots: the menu after SETTLE_S seconds from ready, then a race pose after a deterministic 7 s of pedalling through the
 * QA hooks (the race is then paused so the pose holds). Software GL presents about one frame every 5 to 10 s: the
 * first frame is never judged. Targets pass `?env=<n>` to sweep the neutral environment intensity (ignored by code
 * that has no such switch, e.g. the 4.3.7 and 4.5.0 bases).
 */
const SETTLE_S = 60;
const REGIONS = {
  menu: { bike: [620, 350, 910, 525], sky: [900, 180, 1200, 320] },
  race: { rider: [585, 405, 685, 650], pylon: [1090, 20, 1250, 500], sky: [100, 100, 500, 350] }
} as const;
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const PAGE = "/examples/strange-orbit-port/index.html";

interface Target { readonly name: string; readonly query: string }
const TARGETS: readonly Target[] = [
  { name: "so-default", query: "" },
  { name: "so-env-0", query: "?env=0" },
  { name: "so-env-0.5", query: "?env=0.5" },
  { name: "so-env-0.75", query: "?env=0.75" },
  { name: "so-env-1.25", query: "?env=1.25" }
];

type Hooks = {
  ready?: () => boolean;
  begin?: () => void;
  stepFrames?: (n: number, input?: Record<string, unknown>) => unknown;
  frames?: () => number;
};

async function frames(page: Page): Promise<number> {
  return page.evaluate(() => ((globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Hooks }).__AURA_STRANGE_ORBIT__?.frames?.() ?? -1));
}

/** Wait until the game has rendered `n` more frames (and at least `minMs`). */
async function waitFrames(page: Page, n: number, minMs: number): Promise<void> {
  const start = await frames(page);
  const t0 = Date.now();
  await page.waitForFunction(
    (target) => ((globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Hooks }).__AURA_STRANGE_ORBIT__?.frames?.() ?? 0) >= target,
    start + n,
    { timeout: 240_000, polling: 250 }
  ).catch(() => log(`SO_WARN frames did not advance by ${n} from ${start}`));
  const left = minMs - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
}

async function canvasShot(page: Page): Promise<{ png: Buffer; jpg: Buffer }> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  return { png, jpg };
}

/** Whole-frame luma plus the mean luma of each fixed region (x0, y0, x1, y1 in 1280x720 pixels). */
async function regionStats(page: Page, png: Buffer, regions: Readonly<Record<string, readonly [number, number, number, number]>>) {
  return page.evaluate(async ([b64, boxes]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const luma = (i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += luma(i);
    const out: Record<string, number> = { frame: +(sum / (d.length / 4)).toFixed(2) };
    for (const [name, [x0, y0, x1, y1]] of Object.entries(boxes as Record<string, [number, number, number, number]>)) {
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += luma((y * c.width + x) * 4); n++; }
      out[name] = +(s / Math.max(1, n)).toFixed(2);
    }
    return out;
  }, [png.toString("base64"), regions] as const);
}

async function shot(page: Page, target: Target, id: "menu" | "race"): Promise<void> {
  await waitFrames(page, 2, 3000);
  const { png, jpg } = await canvasShot(page);
  const stats = await regionStats(page, png, REGIONS[id]);
  const info = await page.evaluate(() => {
    const app = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__?.all()[0];
    const dg = app?.diagnostics?.();
    return { renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null };
  }).catch(() => null);
  log(`SO_META ${JSON.stringify({ target: target.name, query: target.query, id, ...stats, info })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`SO_JPG ${target.name} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("strange-orbit-port lighting capture", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const target of TARGETS) {
    test(target.name, async ({ page }) => {
      page.on("pageerror", (e) => log(`SO_ERR ${target.name} pageerror ${e.message.slice(0, 300)}`));
      page.on("response", (r) => { if (r.status() >= 400) log(`SO_HTTP ${target.name} ${r.status()} ${r.url().replace(server.origin, "").slice(0, 200)}`); });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${PAGE}${target.query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Hooks }).__AURA_STRANGE_ORBIT__?.ready?.() === true, undefined, { timeout: 480_000, polling: 500 });
      const ready = Date.now();
      await page.waitForTimeout(Math.max(0, SETTLE_S * 1000 - (Date.now() - ready)));
      await shot(page, target, "menu");
      await page.evaluate(() => {
        const h = (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Hooks; __orbit?: { set(p: Record<string, unknown>): void } });
        h.__AURA_STRANGE_ORBIT__?.begin?.();
        h.__AURA_STRANGE_ORBIT__?.stepFrames?.(60 * 7, { pedal: true });
        h.__orbit?.set({ phase: "paused", resumePhase: "racing" });
      });
      await waitFrames(page, 3, 15_000);
      await shot(page, target, "race");
      log(`SO_DONE ${target.name}`);
    });
  }
});
