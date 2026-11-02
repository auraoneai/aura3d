import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 lane g11 phase 7b probe (remote runner only, tools/remote-acr/run.sh; never local).
 * Bunker Zero luma rows still carry texPending after the e6 `<img>` decode fallback. This probe names the pending
 * rows: at fixed times after ready it logs `G11TX <variant> <s> <json>` with the status count, the pending and textured
 * rows per floor slot (mesh names are `f<slot> ...`), the stages of the pending rows, the oldest pendingMs, the number
 * of map fetches (all and distinct URLs) and the createImageBitmap / `<img>` decode counters.
 */
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const TIMES_S = [25, 60, 180, 300, 480];
const VARIANTS: [string, string][] = [["default", "/apps/showcase-bunker-zero/"], ["floor4", "/apps/showcase-bunker-zero/?floor=4"]];

let server: ExampleDevServer;
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

const INSTRUMENT = (): void => {
  if (typeof window === "undefined" || typeof window.createImageBitmap !== "function") return;
  const w = window as unknown as { __G11TX__: { bitmapCalls: number; bitmapSettled: number; imgDecodes: number; imgDecoded: number } };
  w.__G11TX__ = { bitmapCalls: 0, bitmapSettled: 0, imgDecodes: 0, imgDecoded: 0 };
  const original = window.createImageBitmap.bind(window);
  (window as unknown as { createImageBitmap: unknown }).createImageBitmap = (...args: unknown[]) => {
    w.__G11TX__.bitmapCalls += 1;
    const result = (original as (...a: unknown[]) => Promise<ImageBitmap>)(...args);
    void result.then(() => { w.__G11TX__.bitmapSettled += 1; }, () => { w.__G11TX__.bitmapSettled += 1; });
    return result;
  };
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
    const blob = this.src.startsWith("blob:");
    if (blob) w.__G11TX__.imgDecodes += 1;
    const result = decode.call(this);
    if (blob) void result.then(() => { w.__G11TX__.imgDecoded += 1; }, () => undefined);
    return result;
  };
};

for (const [variant, url] of VARIANTS) {
  test(`g11 texprobe ${variant}`, async ({ page }) => {
    const fetches: string[] = [];
    page.on("request", (r) => { const p = new URL(r.url()).pathname; if (/\.(jpe?g|png|webp|ktx2)$/i.test(p)) fetches.push(p); });
    await page.addInitScript(INSTRUMENT);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
    const ready = Date.now();
    for (const sec of TIMES_S) {
      const wait = sec * 1000 - (Date.now() - ready);
      if (wait > 0) await page.waitForTimeout(wait);
      const snap = await page.evaluate(() => {
        const app = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__?.all()[0];
        const rows: { nodeName?: string; levelName?: string; status?: string; stage?: string; pendingMs?: number }[] = app?.diagnostics?.()?.renderer?.runtime?.texturedMaterials ?? [];
        const status: Record<string, number> = {};
        const pendingBySlot: Record<string, number> = {};
        const texturedBySlot: Record<string, number> = {};
        const stages: Record<string, number> = {};
        const pendingNames: string[] = [];
        let oldest = 0;
        for (const r of rows) {
          const s = r.status ?? "?";
          status[s] = (status[s] ?? 0) + 1;
          const slot = (/^f(\d)/.exec(r.nodeName ?? "") ?? [])[1] ?? "other";
          if (s === "pending") {
            pendingBySlot[slot] = (pendingBySlot[slot] ?? 0) + 1;
            const stage = (r.stage ?? "none").split(" ")[0]!;
            stages[stage] = (stages[stage] ?? 0) + 1;
            oldest = Math.max(oldest, r.pendingMs ?? 0);
            if (pendingNames.length < 60) pendingNames.push(`${r.nodeName}|${r.levelName}`);
          } else if (s === "textured") texturedBySlot[slot] = (texturedBySlot[slot] ?? 0) + 1;
        }
        const counters = (window as unknown as { __G11TX__?: unknown }).__G11TX__ ?? null;
        return { total: rows.length, status, pendingBySlot, texturedBySlot, stages, oldestPendingMs: Math.round(oldest), counters, pendingNames };
      });
      log(`G11TX ${variant} ${sec} ${JSON.stringify({ ...snap, fetches: fetches.length, distinctFetches: new Set(fetches).size })}`);
    }
    log(`G11TX_DONE ${variant}`);
  });
}
