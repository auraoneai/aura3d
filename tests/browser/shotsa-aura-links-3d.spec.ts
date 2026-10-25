import { test } from "@playwright/test";
import { runShots, startDistServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startDistServer("tests/browser/shotsa-dist-links"); });
test.afterAll(async () => { await server?.close(); });

const G = "__AURA3D_SHOWCASE_AURA_LINKS_3D__";
test("shotsa aura-links-3d", async ({ page }) => {
  await runShots(page, server, {
    slug: "aura-links-3d",
    route: "/",
    titleQuery: "",
    playQuery: "?course=links",
    readyGlobals: [G],
    evidenceGlobals: [G],
    endPattern: /=(gameover|ended|results|final|finished|complete)\b/i,
    drive: async (p, snap) => {
      await p.waitForFunction((g) => (window as unknown as Record<string, any>)[g]?.phase === "address", G, { timeout: 420_000 }).catch(() => undefined);
      await p.waitForTimeout(1_500);
      await snap("address");
      await p.keyboard.press("Space");
      await p.waitForTimeout(1_500);
      await snap("power");
      await p.keyboard.press("Space");
      await p.waitForTimeout(1_500);
      await snap("accuracy");
      await p.keyboard.press("Space");
      for (let i = 0; i < 6; i += 1) { await p.waitForTimeout(700); await snap(`swing-${i}`); }
    }
  });
});
