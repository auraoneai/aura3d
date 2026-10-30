import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * GU47 WP-6 (E-F) floating-dot receipt for the three games that force `effects.runtime = "off"` (Aura FC 3D,
 * Aura Links 3D, Iron Crown). Remote only, phase 2, after E-F merges:
 *   RUN_ID=gu47-vfx-floating-dot SPECS='tests/browser/gu47/vfx-floating-dot.spec.ts' \
 *   EXTRA_DIRS='apps/showcase-aura-fc-3d apps/showcase-aura-links-3d apps/showcase-iron-crown' tools/remote-acr/run.sh
 * Each game opens with `?vfx=on` (overrides the game's "off") and `?vfxdebug=1`. The spec fires the game-effect
 * presets those games use through `app.effects.spawn` for 60 s of simulated time (the page's own app, stepped in
 * 1/60 s increments so the soak does not depend on the software-GL frame rate), then checks that `liveCount`
 * returns to 0 within 1.2 s after the last effect, that no runtime emitter or batch is left, and that an idle
 * frame after the soak matches the idle frame before it (no hanging bright blobs). Software WebGL2.
 * Output: `RECEIPT vfx-floating-dot <json>` per game; frames under tests/reports/gu47/.
 */

const GAMES = [
  { slug: "aura-fc-3d", url: "/apps/showcase-aura-fc-3d/index.html?vfx=on&vfxdebug=1" },
  { slug: "aura-links-3d", url: "/apps/showcase-aura-links-3d/index.html?vfx=on&vfxdebug=1" },
  { slug: "iron-crown", url: "/apps/showcase-iron-crown/?vfx=on&vfxdebug=1" }
] as const;

const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

async function canvasLuma(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return [];
    const copy = document.createElement("canvas");
    copy.width = 160;
    copy.height = 90;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0, 160, 90);
    const { data } = ctx.getImageData(0, 0, 160, 90);
    const out: number[] = [];
    for (let i = 0; i < data.length; i += 4) out.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    return out;
  });
}

test.describe("GU47 E-F receipt: no floating dots with runtime effects on", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const game of GAMES) {
    test(`${game.slug}: runtime effects settle to nothing`, async ({ page }) => {
      test.setTimeout(1_500_000);
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${game.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 1000 });
      await page.waitForTimeout(5000);
      const before = await canvasLuma(page);

      const soak = await page.evaluate(() => {
        const app = (window as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__?.all()[0];
        if (!app?.effects) return { error: "no app.effects" };
        const kinds = ["spark", "dust", "streak", "impact-flash", "aura-burst", "ring", "super-flash"];
        let seed = 1414;
        const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
        let t = 0;
        let next = 0;
        let last = 0;
        let peak = 0;
        while (t < 60) {
          if (t >= next) {
            app.effects.spawn(kinds[Math.floor(rand() * kinds.length)], [rand() * 6 - 3, 0.6 + rand() * 1.4, rand() * 6 - 3], { camera: false });
            last = t;
            next = t + 0.05 + rand() * 0.4;
          }
          app.step(1 / 60);
          peak = Math.max(peak, app.effects.liveCount);
          t += 1 / 60;
        }
        let settle = t - last;
        while (app.effects.liveCount > 0 && settle < 5) {
          app.step(1 / 60);
          settle += 1 / 60;
        }
        const debug = (window as unknown as { __AURA_VFX_DEBUG__?: () => { transients: unknown[]; notes: { code: string }[] } }).__AURA_VFX_DEBUG__?.();
        return { peak, settle, live: app.effects.liveCount, transients: debug?.transients.length ?? -1, notes: (debug?.notes ?? []).map((n) => n.code) };
      });
      await page.waitForTimeout(8000);
      const after = await canvasLuma(page);
      let maxDiff = 0;
      let meanDiff = 0;
      for (let i = 0; i < Math.min(before.length, after.length); i++) {
        const d = Math.abs(before[i] - after[i]);
        maxDiff = Math.max(maxDiff, d);
        meanDiff += d / before.length;
      }
      mkdirSync(resolve("tests/reports/gu47"), { recursive: true });
      await page.screenshot({ path: resolve(`tests/reports/gu47/vfx-floating-dot-${game.slug}.png`) });
      const record = { game: game.slug, ...soak, meanIdleDiff: meanDiff, maxIdleDiff: maxDiff, pageErrors };
      writeFileSync(resolve(`tests/reports/gu47/vfx-floating-dot-${game.slug}.json`), `${JSON.stringify(record, null, 2)}\n`);
      console.log(`RECEIPT vfx-floating-dot ${JSON.stringify(record)}`);

      expect(pageErrors).toEqual([]);
      expect("error" in soak ? soak.error : null).toBeNull();
      const result = soak as { peak: number; settle: number; live: number; transients: number; notes: string[] };
      expect(result.peak).toBeGreaterThan(0);
      expect(result.settle).toBeLessThanOrEqual(1.2);
      expect(result.live).toBe(0);
      expect(result.transients).toBe(0);
      expect(result.notes).not.toContain("VFX_LINGERING_PARTICLES");
      // Idle frame after the soak vs before it: animated scenery moves a little, hanging dots would add bright blobs.
      expect(meanDiff).toBeLessThan(6);
    });
  }
});
