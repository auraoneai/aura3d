import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Duneglide phase-7 probe (GU47 lane g24): luma rows keep texPending 1-2 even with GL_TEX_WAIT_S=120. This lists the
 * textured-material rows the renderer still reports as pending (name, stage, pendingMs), so the stuck one can be named.
 * Remote only (tools/remote-acr/run.sh). Logs one `G24_TEXPENDING <json>` line per check and `GL_META` progress lines.
 */
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

let server: ExampleDevServer;
test.setTimeout(2_400_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

for (const view of [{ name: "default", query: "" }, { name: "ch4", query: "?chapter=4&start=1" }] as const) {
  test(`g24-texpending-${view.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/apps/showcase-silt-and-signal-port/${view.query}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 1000 });
    for (const wait of [25_000, 95_000]) {
      await page.waitForTimeout(wait);
      const rows = await page.evaluate(() => {
        const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all?.()[0];
        const list: any[] = app?.diagnostics?.()?.renderer?.runtime?.texturedMaterials ?? [];
        return list.map((r) => {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(r ?? {})) out[k] = typeof v === "object" ? JSON.stringify(v)?.slice(0, 240) : v;
          return out;
        });
      });
      const pending = rows.filter((r) => r.status === "pending");
      log(`GL_META ${JSON.stringify({ target: `g24-texpending-${view.name}`, wait, total: rows.length, pending: pending.length })}`);
      log(`G24_TEXPENDING ${JSON.stringify({ view: view.name, wait, total: rows.length, pending, statuses: [...new Set(rows.map((r) => r.status))] })}`);
    }
  });
}
