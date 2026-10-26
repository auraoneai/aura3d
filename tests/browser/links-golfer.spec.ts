import { execSync } from "node:child_process";
import { test } from "@playwright/test";
import { runShots, startDistServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => {
  execSync(`npx vite build --config apps/showcase-aura-links-3d/vite.config.ts --outDir ${process.cwd()}/tests/browser/shotsa-dist-links-golfer --emptyOutDir`, { stdio: "inherit" });
  server = await startDistServer("tests/browser/shotsa-dist-links-golfer");
});
test.afterAll(async () => { await server?.close(); });

const G = "__AURA3D_SHOWCASE_AURA_LINKS_3D__";

test("links golfer grip across the swing", async ({ page }) => {
  await page.route(/\/aura-assets\//, async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({ url: `https://aura3d.auraone.ai${u.pathname}${u.search}` });
    await route.fulfill({ response });
  });
  await runShots(page, server, {
    slug: "links-golfer",
    route: "/apps/showcase-aura-links-3d/index.html",
    titleQuery: "",
    playQuery: "?course=stAuroras",
    readyGlobals: [G],
    evidenceGlobals: [G],
    onlyViewports: ["1280x720"],
    skipCards: true,
    playBudgetMs: 60_000,
    drive: async (p, snap) => {
      await p.waitForFunction((g) => (window as unknown as Record<string, any>)[g]?.phase === "address", G, { timeout: 420_000 }).catch(() => undefined);
      await p.waitForTimeout(1_500);
      await snap("g-address-aimcam");
      await p.keyboard.press("Space");
      await p.waitForTimeout(1_800);
      await snap("g-address-swingcam");
      await p.keyboard.press("Space");
      await p.waitForTimeout(1_200);
      await snap("g-power");
      await p.keyboard.press("Space");
      for (let i = 0; i < 8; i += 1) { await p.waitForTimeout(450); await snap(`g-swing-${i}`); }
    }
  });
});
