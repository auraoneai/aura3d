import { test } from "@playwright/test";
import { runShots, startServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server?.close(); });

test("fclegs-reg aura-diamond-3d", async ({ page }) => {
  await runShots(page, server, {
    slug: "aura-diamond-3d",
    route: "/apps/showcase-aura-diamond-3d/index.html",
    titleQuery: "",
    playQuery: "?mode=quick",
    readyGlobals: ["__AURA3D_GAME_DIAMOND__"],
    onlyViewports: ["1280x720"], skipCards: true, playBudgetMs: 150_000,
    endPattern: /=(gameover|ended|results|final|finished|complete)\b/i,
    drive: async (p, snap) => {
      await p.waitForTimeout(4_000);
      await snap("stance");
      for (let i = 0; i < 3; i += 1) {
        await p.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.triggerSwing?.(0.84));
        for (const t of [250, 450, 700]) { await p.waitForTimeout(t); await snap(`swing-${i}-${t}`); }
        await p.waitForTimeout(6_000);
      }
    }
  });
});
