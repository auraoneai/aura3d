import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** Remote only. Starts Cumulus Dash at the first boulder and prints its node position, drawn bounds and a frame per sample. */
let server: ExampleDevServer;
test.setTimeout(1_800_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test("cumulus boulder grounding", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto(`${server.origin}/examples/kid-goku-beyond-the-clouds-port/index.html?diag=1&chapterStart=205`, { waitUntil: "load", timeout: 240_000 });
  for (let i = 0; i < 90; i += 1) {
    await page.waitForTimeout(2000);
    const n = await page.evaluate(() => (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0]?.nodes?.all?.().length ?? 0).catch(() => 0);
    if (n > 0) break;
  }
  for (let k = 0; k < 6; k += 1) {
    await page.waitForTimeout(1500);
    const rows = await page.evaluate(() => {
      const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
      const out: unknown[] = [];
      for (const h of app?.nodes?.all?.() ?? []) {
        if (!/^(boulder|hero$|ptera-body|rex-body)/.test(String(h.name ?? h.id))) continue;
        const b = h.bounds?.();
        const r = (v: number) => Math.round(v * 100) / 100;
        out.push({ name: h.name ?? h.id, visible: h.visible, pos: h.position?.map(r), min: b?.min?.map(r), max: b?.max?.map(r) });
      }
      return out;
    }).catch(() => []);
    console.log(`CUMBOULDER ${k} ${JSON.stringify(rows)}`);
    const buf = await page.screenshot({ type: "jpeg", quality: 80 }).catch(() => undefined);
    if (buf) console.log(`CUMFRAME ${k} ${buf.toString("base64")}`);
  }
});
