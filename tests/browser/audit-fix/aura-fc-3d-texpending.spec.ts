import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Aura FC 3D phase-3 probe (GU47 lane g09): every luma row of this game reports texPending=1 at 25 s and 60 s on all
 * six venues. This lists the textured-material rows the renderer still reports as pending, so the stuck one can be
 * named. Remote only (tools/remote-acr/run.sh). Logs one `FC_TEXPENDING <json>` line per venue and `GL_META` lines so
 * the shard scheduler sees progress.
 */
const HOOK = "__AURA_AURA_FC_3D__";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

let server: ExampleDevServer;
test.setTimeout(2_400_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

for (const venue of ["lagos", "munich"] as const) {
  test(`fc-texpending-${venue}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/apps/showcase-aura-fc-3d/index.html?venue=${venue}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForFunction((h) => (window as any)[h]?.ready?.() === true, HOOK, { timeout: 600_000, polling: 1000 });
    for (const wait of [20_000, 40_000]) {
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
      log(`GL_META ${JSON.stringify({ target: `fc-texpending-${venue}`, wait, total: rows.length, pending: pending.length })}`);
      log(`FC_TEXPENDING ${JSON.stringify({ venue, wait, total: rows.length, pending, statuses: [...new Set(rows.map((r) => r.status))] })}`);
    }
  });
}
