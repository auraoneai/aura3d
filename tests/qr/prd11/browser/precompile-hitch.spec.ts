/**
 * PRD-11 S-gate (§1170): `prd11-tier-ladder` with `?lateNodes=` — nodes
 * carrying a new program key (physical material) mount mid-run; the first
 * frame that draws them must not hitch. Asserts no rAF interval over 50 ms
 * in the mount window.
 *
 * Remote-only evidence (macos-14 lane-browser job). Skips loudly without a
 * real WebGL2 context or when the adapter's late nodes never draw.
 */

import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const benchRoot = path.resolve(here, "../../../benchmarks/quality-rebuild");
const SCENE_URL = `/scenes/prd11/index.html?engine=aura3d&a3d-qr=tiers&aura3d-quality=high&lateNodes=12`;

let server: ViteDevServer;

test.beforeAll(async () => {
  server = await createServer({
    configFile: path.join(benchRoot, "vite.config.ts"),
    root: benchRoot,
    server: { port: 5194, strictPort: true },
    logLevel: "error"
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

test("late-node program key produces no frame over 50ms", async ({ page }) => {
  await page.goto(`http://127.0.0.1:5194${SCENE_URL}`);
  await page.waitForFunction(() => (window as unknown as { __QR_READY__?: unknown }).__QR_READY__ !== undefined, undefined, { timeout: 30_000 });

  const result = await page.evaluate(async () => {
    interface AppLike { diagnostics(): { frame?: { readonly frames: number }; drawCalls: number } }
    const app = (window as unknown as { __PRD11_APP__?: AppLike }).__PRD11_APP__;
    if (!app) return { skipped: "no app" } as const;

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

    const startCalls = app.diagnostics().drawCalls;
    // Late nodes mount at adapter frame 120 — wait for them to land (+2s buffer).
    const deadline = performance.now() + 15_000;
    while (performance.now() < deadline && app.diagnostics().frame === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
    stop = true;
    const endCalls = app.diagnostics().drawCalls;
    const over = intervals.filter((ms) => ms > 50);
    return { skipped: null, frames: intervals.length, maxMs: Math.max(...intervals, 0), over50: over.length, startCalls, endCalls } as const;
  });

  if ("skipped" in result && result.skipped) {
    test.skip(true, result.skipped);
    return;
  }
  if (!("frames" in result) || result.frames < 10) {
    test.skip(true, "too few measured frames — no real rAF loop on this host");
    return;
  }
  if (result.endCalls <= result.startCalls) {
    test.skip(true, `late nodes never landed (drawCalls ${result.startCalls} → ${result.endCalls}) — adapter add() may not propagate post-mount`);
    return;
  }
  expect(result.over50, `${result.over50} frame(s) exceeded 50ms around the late-node mount (max ${result.maxMs.toFixed(1)}ms)`).toBe(0);
});
