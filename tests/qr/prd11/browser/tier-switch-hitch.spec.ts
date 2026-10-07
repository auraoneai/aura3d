/**
 * PRD-11 S-gate (§1170): `prd11-tier-ladder` High↔Low tier switch must not
 * produce a frame over 50 ms (`tier-switch-hitch`).
 *
 * Remote-only evidence (macos-14 lane-browser job). Skips loudly without a
 * real WebGL2 context or a live `quality` member on the app.
 */

import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const benchRoot = path.resolve(here, "../../../benchmarks/quality-rebuild");
const SCENE_URL = `/scenes/prd11/index.html?engine=aura3d&a3d-qr=tiers&aura3d-quality=high`;

let server: ViteDevServer;

test.beforeAll(async () => {
  server = await createServer({
    configFile: path.join(benchRoot, "vite.config.ts"),
    root: benchRoot,
    server: { port: 5196, strictPort: true },
    logLevel: "error"
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

test("High↔Low tier switch produces no frame over 50ms", async ({ page }) => {
  await page.goto(`http://127.0.0.1:5196${SCENE_URL}`);
  await page.waitForFunction(() => (window as unknown as { __QR_READY__?: unknown }).__QR_READY__ !== undefined, undefined, { timeout: 30_000 });

  const result = await page.evaluate(async () => {
    interface QualityLike {
      set(tier: string, overrides?: Record<string, unknown>): Promise<void>;
      readonly tier: string;
    }
    interface AppLike {
      quality?: QualityLike;
      diagnostics(): { frame?: { readonly frames: number } };
    }
    const app = (window as unknown as { __PRD11_APP__?: AppLike }).__PRD11_APP__;
    if (!app || !app.quality) return { skipped: "no app.quality member" } as const;

    // Warm up.
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Measure rAF intervals across the switch window.
    const intervals: number[] = [];
    let last = 0;
    let stop = false;
    const tick = (now: number): void => {
      if (stop) return;
      if (last > 0) intervals.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    await app.quality.set("low");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await app.quality.set("high");
    await new Promise((resolve) => setTimeout(resolve, 400));
    stop = true;

    const over = intervals.filter((ms) => ms > 50);
    return { skipped: null, frames: intervals.length, maxMs: Math.max(...intervals), over50: over.length } as const;
  });

  if ("skipped" in result && result.skipped) {
    test.skip(true, result.skipped);
    return;
  }
  if (!("frames" in result) || result.frames < 10) {
    test.skip(true, "too few measured frames — no real rAF loop on this host");
    return;
  }
  expect(result.over50, `${result.over50} frame(s) exceeded 50ms (max ${result.maxMs.toFixed(1)}ms)`).toBe(0);
});
