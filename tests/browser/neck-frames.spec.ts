import { test } from "@playwright/test";
import { runShots, startServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server?.close(); });

const END = /=(gameover|ended|results|final|finished|complete)\b/i;
const LINKS = "__AURA3D_SHOWCASE_AURA_LINKS_3D__";

test("neck frames aura-hoops-3d", async ({ page }) => {
  await runShots(page, server, { slug: "neck-hoops", route: "/apps/showcase-aura-hoops-3d/index.html", titleQuery: "?menu=1", playQuery: "?autostart=1&autoplay=1", endPattern: END, playBudgetMs: 100_000, onlyViewports: ["1280x720"] });
});

test("neck frames aura-fc-3d", async ({ page }) => {
  await runShots(page, server, { slug: "neck-fc", route: "/apps/showcase-aura-fc-3d/index.html", titleQuery: "", playQuery: "?demo=1", endPattern: END, playBudgetMs: 100_000, onlyViewports: ["1280x720"] });
});

test("neck frames aura-diamond-3d", async ({ page }) => {
  await runShots(page, server, {
    slug: "neck-diamond", route: "/apps/showcase-aura-diamond-3d/index.html", titleQuery: "", playQuery: "?mode=quick", readyGlobals: ["__AURA3D_GAME_DIAMOND__"], endPattern: END, playBudgetMs: 60_000, onlyViewports: ["1280x720"],
    drive: async (p, snap) => {
      await p.waitForTimeout(4_000);
      await snap("stance");
      for (let i = 0; i < 2; i += 1) {
        await p.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.triggerSwing?.(0.84));
        for (const t of [250, 450, 700]) { await p.waitForTimeout(t); await snap(`swing-${i}-${t}`); }
        await p.waitForTimeout(6_000);
      }
    }
  });
});

test("neck frames aura-links-3d", async ({ page }) => {
  await runShots(page, server, {
    slug: "neck-links", route: "/", titleQuery: "", playQuery: "?course=links", readyGlobals: [LINKS], evidenceGlobals: [LINKS], endPattern: END, playBudgetMs: 40_000, onlyViewports: ["1280x720"],
    drive: async (p, snap) => {
      await p.waitForFunction((g) => (window as unknown as Record<string, any>)[g]?.phase === "address", LINKS, { timeout: 420_000 }).catch(() => undefined);
      await p.waitForTimeout(1_500);
      await snap("address");
      for (let i = 0; i < 3; i += 1) { await p.keyboard.press("Space"); await p.waitForTimeout(1_500); }
      for (let i = 0; i < 4; i += 1) { await p.waitForTimeout(700); await snap(`swing-${i}`); }
    }
  });
});
