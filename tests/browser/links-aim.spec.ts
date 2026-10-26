import { execSync } from "node:child_process";
import { test } from "@playwright/test";
import { runShots, startDistServer } from "./shotsa-lib";
import type { ExampleDevServer } from "./example-dev-server";

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => {
  execSync(`npx vite build --config apps/showcase-aura-links-3d/vite.config.ts --outDir ${process.cwd()}/tests/browser/shotsa-dist-links-aim --emptyOutDir`, { stdio: "inherit" });
  server = await startDistServer("tests/browser/shotsa-dist-links-aim");
});
test.afterAll(async () => { await server?.close(); });

const G = "__AURA3D_SHOWCASE_AURA_LINKS_3D__";
const COURSES = (process.env.LINKS_AIM_COURSES ?? "stAuroras,mapleHollow,cinderRim,cloudTerrace,neonBay,mareCourse").split(",");

for (const id of COURSES) {
  test(`links-aim ${id}`, async ({ page }) => {
    // the slim remote context has no public/aura-assets: serve the same hash-named files from production
    await page.route(/\/aura-assets\//, async (route) => {
      const u = new URL(route.request().url());
      const response = await route.fetch({ url: `https://aura3d.auraone.ai${u.pathname}${u.search}` });
      await route.fulfill({ response });
    });
    await runShots(page, server, {
      slug: `links-aim-${id}`,
      route: "/apps/showcase-aura-links-3d/index.html",
      titleQuery: "",
      playQuery: `?course=${id}`,
      readyGlobals: [G],
      evidenceGlobals: [G],
      onlyViewports: ["1280x720"],
      skipCards: true,
      playBudgetMs: 60_000,
      drive: async (p, snap) => {
        await p.waitForFunction((g) => (window as unknown as Record<string, any>)[g]?.phase === "address", G, { timeout: 420_000 }).catch(() => undefined);
        await p.waitForTimeout(2_000);
        const read = () => p.evaluate((g) => {
          const o = (window as unknown as Record<string, any>)[g] ?? {};
          const arrow = document.getElementById("h-pin-arrow")?.style.transform ?? "?";
          const dist = document.getElementById("h-pin-dist")?.textContent ?? "?";
          return { phase: o.phase, aimYaw: o.aimYaw as number, arrow, dist, cameraMode: o.cameraMode };
        }, G);
        const start = await read();
        process.stdout.write(`@@LINKSAIM ${id} tee ${JSON.stringify(start)}\n`);
        await snap("aim-tee");
        const base = start.aimYaw;
        for (const degrees of [90, 180, 270]) {
          const target = (degrees * Math.PI) / 180;
          let turned = 0;
          for (let i = 0; i < 120 && turned < target; i += 1) {
            await p.keyboard.down("KeyA");
            await p.waitForTimeout(160);
            await p.keyboard.up("KeyA");
            const now = await read();
            turned = (((now.aimYaw - base) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          }
          await p.waitForTimeout(1_200);
          const after = await read();
          process.stdout.write(`@@LINKSAIM ${id} turned~${degrees} ${JSON.stringify({ ...after, turnedDeg: Math.round((turned * 180) / Math.PI) })}\n`);
          await snap(`aim-${degrees}`);
        }
        await p.keyboard.press("KeyP");
        await p.waitForTimeout(1_200);
        const pin = await read();
        process.stdout.write(`@@LINKSAIM ${id} after-P ${JSON.stringify(pin)}\n`);
        await snap("aim-pin-key");
      }
    });
  });
}
