import { execSync } from "node:child_process";
import { test } from "@playwright/test";
import { runShots, startDistServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => {
  execSync(`npx vite build --config apps/showcase-aura-links-3d/vite.config.ts --outDir ${process.cwd()}/tests/browser/shotsa-dist-links --emptyOutDir`, { stdio: "inherit", timeout: 900_000 });
  server = await startDistServer("tests/browser/shotsa-dist-links");
});
test.afterAll(async () => { await server?.close(); });

const END = /=(gameover|ended|results|final|finished|complete)\b/i;
const LINKS = "__AURA3D_SHOWCASE_AURA_LINKS_3D__";

test("neck frames aura-links-3d", async ({ page }) => {
  await runShots(page, server, {
    slug: "neck-links", route: "/apps/showcase-aura-links-3d/index.html", titleQuery: "", playQuery: "?course=links", readyGlobals: [LINKS], evidenceGlobals: [LINKS], endPattern: END, playBudgetMs: 40_000, onlyViewports: ["1280x720"],
    drive: async (p, snap) => {
      await p.waitForFunction((g) => (window as unknown as Record<string, any>)[g]?.phase === "address", LINKS, { timeout: 420_000 }).catch(() => undefined);
      await p.waitForTimeout(1_500);
      await snap("address");
      for (let i = 0; i < 3; i += 1) { await p.keyboard.press("Space"); await p.waitForTimeout(1_500); }
      for (let i = 0; i < 4; i += 1) { await p.waitForTimeout(700); await snap(`swing-${i}`); }
    }
  });
});
