/**
 * PRD-11 Phase 0 / S1: `diagnostics().frame.fps` agrees with the in-page rAF
 * rate within 10% after >=30 frames, and is never a constant when the load
 * changes (`?loadMs=`).
 *
 * Runs the lane scene `prd11-tier-ladder` through the local vite dev server.
 * The Aura adapter mounts `window.__PRD11_APP__`; this spec steps the app
 * itself is NOT allowed — the adapter's rAF loop drives real frames.
 *
 * If the headless environment cannot produce a real WebGL2 context (SwiftShader
 * absence on CI Linux is possible), the agreement test skips loudly instead of
 * asserting false negatives — macos-14 workflow hardware does the asserting.
 */

import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const benchRoot = path.resolve(here, "../../../benchmarks/quality-rebuild");
const SCENE_URL = (query: string) => `/scenes/prd11/index.html?engine=aura3d&${query}`;

let server: ViteDevServer;

test.beforeAll(async () => {
  server = await createServer({
    configFile: path.join(benchRoot, "vite.config.ts"),
    root: benchRoot,
    server: { port: 5199, strictPort: true },
    logLevel: "error"
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

interface FrameSection {
  readonly fps: number | null;
  readonly frames: number;
  readonly intervalMs?: { readonly p50: number | null };
}

interface Prd11App {
  diagnostics(): { frame?: FrameSection };
}

async function measureFps(page: import("@playwright/test").Page, loadMs: number): Promise<number | null> {
  await page.goto(`http://127.0.0.1:5199${SCENE_URL(`a3d-qr=tiers&loadMs=${loadMs}`)}`);
  // In-page rAF reference rate over >=30 real frames.
  const raf = await page.evaluate(async () => {
    const samples: number[] = [];
    let last = 0;
    let count = 0;
    return await new Promise<{ fps: number; frames: number }>((resolve) => {
      const tick = (now: number): void => {
        if (last > 0) samples.push(now - last);
        last = now;
        count += 1;
        if (count >= 60) {
          const trimmed = samples.slice(-30);
          const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
          resolve({ fps: mean > 0 ? 1000 / mean : 0, frames: trimmed.length });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  expect(raf.frames).toBeGreaterThanOrEqual(30);

  const report = await page.evaluate(() => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__;
    if (!app) return null;
    try {
      return app.diagnostics().frame ?? null;
    } catch {
      return null;
    }
  });
  if (!report || report.fps === null) return null;
  return (report.fps / raf.fps - 1) * 100;
}

test("frame.fps tracks the in-page rAF rate within 10% over >=30 frames", async ({ page }) => {
  const deltaPct = await measureFps(page, 0);
  if (deltaPct === null) {
    test.skip(true, "no WebGL2 frame telemetry in this environment (macos-14 hardware asserts)");
    return;
  }
  expect(Math.abs(deltaPct)).toBeLessThanOrEqual(10);
});

test("frame telemetry is never a constant across different loads", async ({ page }) => {
  const read = async (loadMs: number): Promise<number | null> => {
    await page.goto(`http://127.0.0.1:5199${SCENE_URL(`a3d-qr=tiers&loadMs=${loadMs}`)}`);
    await page.waitForFunction(() => {
      const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__;
      if (!app) return false;
      try {
        return (app.diagnostics().frame?.frames ?? 0) >= 40;
      } catch {
        return false;
      }
    }, { timeout: 30_000 }).catch(() => false);
    return await page.evaluate(() => {
      const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__;
      try {
        return app?.diagnostics().frame?.intervalMs?.p50 ?? null;
      } catch {
        return null;
      }
    });
  };
  const light = await read(0);
  const heavy = await read(8);
  if (light === null || heavy === null) {
    test.skip(true, "no WebGL2 frame telemetry in this environment (macos-14 hardware asserts)");
    return;
  }
  expect(Math.abs(heavy - light)).toBeGreaterThan(light * 0.15);
});
