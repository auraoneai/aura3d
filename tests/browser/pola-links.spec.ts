import { test } from "@playwright/test";
import { runShots, startServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server?.close(); });

const G = "__AURA3D_SHOWCASE_AURA_LINKS_3D__";
test("pola links mobile", async ({ page }) => {
  await runShots(page, server, {
    slug: "aura-links-3d",
    route: "/apps/showcase-aura-links-3d/index.html",
    titleQuery: "",
    playQuery: "?course=links",
    onlyViewports: ["390x844"],
    skipCards: true,
    playBudgetMs: 120_000,
    readyGlobals: [G],
    evidenceGlobals: [G],
    endPattern: /=(gameover|ended|results|final|finished|complete)\b/i,
    drive: async (p, snap) => {
      await p.waitForFunction((g) => (window as unknown as Record<string, any>)[g]?.phase === "address", G, { timeout: 420_000 }).catch(() => undefined);
      await p.waitForTimeout(2_500);
      await snap("pola-aim");
      await p.keyboard.press("Space");
      await p.waitForTimeout(1_500);
      await snap("pola-power");
      await p.keyboard.press("Space");
      await p.waitForTimeout(1_500);
      await p.keyboard.press("Space");
      for (let i = 0; i < 4; i += 1) { await p.waitForTimeout(500); await snap(`pola-swing-${i}`); }
    }
  });
});
