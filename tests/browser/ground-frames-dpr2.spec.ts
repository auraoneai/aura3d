import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** Remote only, software WebGL2 at DPR 2 (no real GPU is agent-reachable). Cumulus Dash sprint + boulders and Gridlock Courier road frames. */
let server: ExampleDevServer;
test.setTimeout(3_000_000);
test.use({ deviceScaleFactor: 2 });
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

const emit = async (page: import("@playwright/test").Page, tag: string, extra: unknown) => {
  const buf = await page.screenshot({ type: "jpeg", quality: 84 });
  console.log(`GF ${tag} ${JSON.stringify(extra)} ${buf.toString("base64")}`);
};

test("cumulus sprint and boulders", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  for (const [label, qs] of [["sprint", "?diag=1&autostart=1"], ["boulder", "?diag=1&chapterStart=205"]] as const) {
    await page.goto(`${server.origin}/examples/kid-goku-beyond-the-clouds-port/index.html${qs}`, { waitUntil: "load", timeout: 240_000 });
    for (let i = 0; i < 90; i += 1) {
      await page.waitForTimeout(2000);
      if (await page.evaluate(() => ((globalThis as any).__AURA3D_LIVE_APPS__?.all()[0]?.nodes?.all?.().length ?? 0) > 0).catch(() => false)) break;
    }
    await page.waitForTimeout(6000);
    for (let k = 0; k < 5; k += 1) {
      await page.waitForTimeout(label === "sprint" ? 900 : 1500);
      const info = await page.evaluate(() => {
        const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
        const r = (v: number) => Math.round(v * 100) / 100;
        return (app?.nodes?.all?.() ?? []).filter((h: any) => /^(hero$|boulder-)/.test(String(h.name ?? h.id)) && h.visible).map((h: any) => ({ n: h.name ?? h.id, pos: h.position?.map(r), min: h.bounds?.()?.min?.map(r) }));
      }).catch(() => []);
      await emit(page, `cumulus-${label}-${k}`, info);
    }
  }
});

test("gridlock road along the course", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto(`${server.origin}/examples/drift-and-deliver-port/?manual=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).__AURA_DRIFT_AND_DELIVER__?.ready() === true, undefined, { timeout: 540_000 });
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ArrowUp");
  for (let k = 0; k < 8; k += 1) {
    await page.evaluate(() => (window as any).__AURA_DRIFT_AND_DELIVER__.stepFrames(60));
    if (k === 3) { await page.keyboard.down("KeyD"); } else if (k === 5) { await page.keyboard.up("KeyD"); await page.keyboard.down("KeyA"); } else if (k === 7) { await page.keyboard.up("KeyA"); }
    const d = await page.evaluate(() => (window as any).__AURA_DRIFT_AND_DELIVER__.diagnostics?.() ?? null);
    await emit(page, `gridlock-${k}`, { drawCalls: d?.drawCalls, errors: d?.errors?.length ?? 0 });
  }
});
