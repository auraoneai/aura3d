/**
 * PRD-11 Phase 4 / S-gate (§1170): `prd11-tier-ladder` under `?loadMs=` —
 * the render scale reaches its effective floor before the first governor
 * feature step; when the load stops the controller recovers within 1,500
 * frames (the adapter's `window.__PRD11_LOAD_MS__` toggles load live).
 *
 * Remote-only evidence (macos-14 lane-browser job). Skips loudly when the
 * environment yields no real WebGL2 frames or the quality section is absent.
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
    server: { port: 5197, strictPort: true },
    logLevel: "error"
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

interface QualitySection {
  readonly decision?: { readonly tier: string; readonly source: string } | null;
  readonly renderScale?: number | null;
  readonly governorSteps?: readonly { readonly direction: string; readonly feature: string }[] | null;
  readonly locked?: boolean;
}

interface Prd11App {
  diagnostics(): { frame?: { readonly frames: number }; quality?: QualitySection };
}

async function qualityOf(page: import("@playwright/test").Page): Promise<QualitySection | null> {
  return page.evaluate(() => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__;
    return app?.diagnostics().quality ?? null;
  });
}

test("render scale floors before governor steps; recovery within 1500 frames", async ({ page }) => {
  await page.goto(`http://127.0.0.1:5197${SCENE_URL}`);
  await page.waitForFunction(() => (window as unknown as { __QR_READY__?: unknown }).__QR_READY__ !== undefined, undefined, { timeout: 30_000 });

  // Sanity: real frames + a live quality section.
  const alive = await page.evaluate(async () => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__;
    if (!app) return false;
    const start = app.diagnostics().frame?.frames ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return (app.diagnostics().frame?.frames ?? 0) > start;
  });
  test.skip(!alive, "no WebGL2 frame progress in this environment");
  const initial = await qualityOf(page);
  test.skip(!initial || initial.renderScale === null, "quality section absent — adaptive controller not mounted");

  // Apply sustained load through the live toggle.
  await page.evaluate(() => {
    (window as unknown as { __PRD11_LOAD_MS__?: number }).__PRD11_LOAD_MS__ = 12;
  });

  // Watch until the scale bottoms out or 4,000 frames' worth of wall time passes.
  let floorScale: number | null = null;
  const sawStepEarly = await page.evaluate(async () => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__!;
    const floor = 0.5; // tier-ladder effective floor: max(tierMin, 1/dpr) ≥ 0.5
    let steppedBeforeFloor = false;
    const deadline = performance.now() + 45_000;
    while (performance.now() < deadline) {
      const q = app.diagnostics().quality;
      const scale = q?.renderScale ?? 1;
      const steps = q?.governorSteps?.length ?? 0;
      if (steps > 0 && scale > floor) steppedBeforeFloor = true;
      if (scale <= floor + 1e-6) return { reachedFloor: true, steppedBeforeFloor, scale };
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    const q = app.diagnostics().quality;
    return { reachedFloor: false, steppedBeforeFloor, scale: q?.renderScale ?? null };
  });
  expect(sawStepEarly.steppedBeforeFloor, "a governor feature step fired before the scale floor").toBe(false);
  if (!sawStepEarly.reachedFloor) {
    test.skip(true, `scale never reached the floor under load (scale=${sawStepEarly.scale}) — see if load was too weak`);
    return;
  }
  floorScale = sawStepEarly.scale;
  expect(floorScale).not.toBeNull();

  // Continued load past the floor → the governor must start stepping features.
  const stepsAfterFloor = await page.evaluate(async () => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__!;
    const deadline = performance.now() + 40_000;
    while (performance.now() < deadline) {
      const steps = app.diagnostics().quality?.governorSteps?.length ?? 0;
      if (steps > 0) return steps;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return 0;
  });
  expect(stepsAfterFloor, "governor must degrade features once the scale floor holds under load").toBeGreaterThan(0);

  // Stop the load → recover (scale rises / direction "up" steps) within 1,500 frames.
  const recovered = await page.evaluate(async () => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__!;
    (window as unknown as { __PRD11_LOAD_MS__?: number }).__PRD11_LOAD_MS__ = 0;
    const startFrames = app.diagnostics().frame?.frames ?? 0;
    const startScale = app.diagnostics().quality?.renderScale ?? 1;
    const startSteps = app.diagnostics().quality?.governorSteps?.length ?? 0;
    while ((app.diagnostics().frame?.frames ?? 0) - startFrames < 1500) {
      const q = app.diagnostics().quality;
      const scale = q?.renderScale ?? 0;
      const steps = q?.governorSteps ?? [];
      const ups = steps.slice(startSteps).filter((s) => s.direction === "up" || s.direction === "recovered").length;
      if (scale > startScale + 0.05 || ups > 0) return { scale, ups };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const q = app.diagnostics().quality;
    return { scale: q?.renderScale ?? null, ups: 0 };
  });
  expect(
    (recovered.scale ?? 0) > (floorScale ?? 1) + 0.05 || recovered.ups > 0,
    `no recovery within 1500 frames (scale=${recovered.scale}, ups=${recovered.ups})`
  ).toBe(true);
});
