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

const CLUBS: Array<[string, number, boolean]> = [["driver", 0, false], ["driver-rev", 0, true], ["wedge", 2, false], ["putter", 1, false], ["putter-rev", 1, true]];
for (const [clubName, qPresses, reverse] of CLUBS) test(`links golfer grip across the swing: ${clubName}`, async ({ page }) => {
  await page.route(/\/aura-assets\//, async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({ url: `https://aura3d.auraone.ai${u.pathname}${u.search}` });
    await route.fulfill({ response });
  });
  await runShots(page, server, {
    slug: `links-golfer-${clubName}`,
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
      for (let i = 0; i < qPresses; i += 1) { await p.keyboard.press("KeyQ"); await p.waitForTimeout(250); }
      await p.waitForTimeout(800);
      if (reverse) {
        // view the golfer from the other side: turn the aim 180 degrees so the far arm is the near one
        const read = () => p.evaluate((g) => (window as unknown as Record<string, any>)[g]?.aimYaw as number, G);
        const base = await read();
        for (let i = 0; i < 160; i += 1) {
          await p.keyboard.down("KeyA"); await p.waitForTimeout(160); await p.keyboard.up("KeyA");
          const now = await read();
          if ((((now - base) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) >= Math.PI) break;
        }
        await p.waitForTimeout(1_200);
      }
      await snap(`${clubName}-address-aimcam`);
      await p.keyboard.press("Space");
      await p.waitForTimeout(1_800);
      await snap(`${clubName}-address-swingcam`);
      await p.keyboard.press("Space");
      await p.waitForTimeout(1_200);
      await snap(`${clubName}-power`);
      await p.keyboard.press("Space");
      const frames = clubName === "driver" ? 8 : 5;
      for (let i = 0; i < frames; i += 1) { await p.waitForTimeout(450); await snap(`${clubName}-swing-${i}`); }
    }
  });
});
