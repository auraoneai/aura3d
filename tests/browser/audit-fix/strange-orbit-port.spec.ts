import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G15 (Craterline GP, `strange-orbit-port`), LIGHT-01 / SO-4: steady-state luma of the lit GLB riders.
 * Remote only (tools/remote-acr/run.sh); the ACR run has no artifact egress, so output goes to the log:
 *   SO_META <json>                        whole-frame luma and luma inside the rider mask
 *   SO_JPG  <target> <shot> <i>/<n> <b64> canvas-only JPEG, chunked
 * The rider mask is the set of pixels that change by more than MASK_DELTA when the six rider models are hidden
 * (`setVisible(false)`), so the region number measures the GLBs only, not the custom-shader track and sky.
 * Shots: the menu after SETTLE_S seconds from ready, then a race pose after a deterministic 7 s of pedalling through the
 * QA hooks (the race is then paused so the pose holds). Software GL presents about one frame every 5 to 10 s: the
 * first frame is never judged. Targets pass `?env=<n>` to sweep the neutral environment intensity (ignored by code
 * that has no such switch, e.g. the 4.3.7 and 4.5.0 bases).
 */
const SETTLE_S = 60;
const MASK_DELTA = 10;
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
  app?: () => { nodes: { require(id: string): { setVisible(v: boolean): void } } } | null;
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

async function setRidersVisible(page: Page, visible: boolean): Promise<number> {
  return page.evaluate((v) => {
    const app = (globalThis as unknown as { __AURA_STRANGE_ORBIT__?: Hooks }).__AURA_STRANGE_ORBIT__?.app?.();
    let n = 0;
    for (let i = 0; i < 6; i++) {
      try { app?.nodes.require(`rider-${i}-model`).setVisible(v); n++; } catch { /* primitive riders (?meshy=0) */ }
    }
    return n;
  }, visible);
}

async function canvasPng(page: Page): Promise<{ png: Buffer; jpg: Buffer }> {
  const handle = await page.addStyleTag({ content: CANVAS_ONLY });
  await page.waitForTimeout(250);
  const png = await page.screenshot({ type: "png" });
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  await handle.evaluate((el) => el.remove());
  return { png, jpg };
}

/** Whole-frame stats of `shown`, plus stats inside the mask where `shown` and `hidden` differ. */
async function maskStats(page: Page, shown: Buffer, hidden: Buffer) {
  return page.evaluate(async ([a, b, delta]) => {
    const decode = async (b64: string) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      return { w: c.width, h: c.height, d: ctx.getImageData(0, 0, c.width, c.height).data };
    };
    const A = await decode(a as string), B = await decode(b as string);
    const luma = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    let sum = 0, mSum = 0, mN = 0, mHi = 0, mLo = 0;
    let x0 = A.w, y0 = A.h, x1 = -1, y1 = -1;
    const hist: number[] = [];
    for (let i = 0; i < A.d.length; i += 4) {
      const ya = luma(A.d, i);
      sum += ya;
      if (Math.abs(ya - luma(B.d, i)) > (delta as number)) {
        mSum += ya; mN++; hist.push(ya);
        if (ya >= 245) mHi++;
        if (ya <= 12) mLo++;
        const p = i / 4, x = p % A.w, y = Math.floor(p / A.w);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    hist.sort((p, q) => p - q);
    const q = (f: number) => (hist.length ? +hist[Math.min(hist.length - 1, Math.floor(f * hist.length))]!.toFixed(1) : null);
    return {
      mean: +(sum / (A.d.length / 4)).toFixed(2),
      rider: { pixels: mN, mean: mN ? +(mSum / mN).toFixed(2) : null, p10: q(0.1), p50: q(0.5), p90: q(0.9), hiFrac: mN ? +(mHi / mN).toFixed(4) : null, loFrac: mN ? +(mLo / mN).toFixed(4) : null, bbox: mN ? [x0, y0, x1, y1] : null }
    };
  }, [shown.toString("base64"), hidden.toString("base64"), MASK_DELTA] as const);
}

async function shot(page: Page, target: Target, id: string): Promise<void> {
  await setRidersVisible(page, true);
  await waitFrames(page, 2, 3000);
  const shown = await canvasPng(page);
  const hiddenCount = await setRidersVisible(page, false);
  await waitFrames(page, 2, 3000);
  const hidden = await canvasPng(page);
  await setRidersVisible(page, true);
  const stats = await maskStats(page, shown.png, hidden.png);
  const info = await page.evaluate(() => {
    const app = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__?.all()[0];
    const dg = app?.diagnostics?.();
    return { renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null, version: (globalThis as any).__AURA3D_VERSION__ ?? null };
  }).catch(() => null);
  log(`SO_META ${JSON.stringify({ target: target.name, query: target.query, id, ridersHidden: hiddenCount, ...stats, info })}`);
  const b64 = shown.jpg.toString("base64");
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
