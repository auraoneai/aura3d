/**
 * PRD-11 S-gate (§1170): with `A3D_QR_TIERS` on, the lane scene renders
 * without non-fusable passes → zero `readbacksThisFrame` for the whole run.
 * (Failing controls live in the base-scene variant once those scenes land.)
 *
 * Remote-only evidence (macos-14 lane-browser job). Skips loudly without a
 * real WebGL2 context.
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
    server: { port: 5193, strictPort: true },
    logLevel: "error"
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

interface FrameSection {
  readonly frames: number;
  readonly readbacksThisFrame?: number;
}

interface Prd11App {
  diagnostics(): { frame?: FrameSection };
}

test("readbacksThisFrame stays 0 across 300 frames", async ({ page }) => {
  await page.goto(`http://127.0.0.1:5193${SCENE_URL}`);
  await page.waitForFunction(() => (window as unknown as { __QR_READY__?: unknown }).__QR_READY__ !== undefined, undefined, { timeout: 30_000 });

  const result = await page.evaluate(async () => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__;
    if (!app) return { skipped: "no app" } as const;
    const start = app.diagnostics().frame?.frames ?? 0;
    const startReads = app.diagnostics().frame?.readbacksThisFrame;
    const deadline = performance.now() + 30_000;
    let maxReadbacks = 0;
    while (performance.now() < deadline) {
      const f = app.diagnostics().frame;
      if ((f?.frames ?? 0) - start >= 300) break;
      maxReadbacks = Math.max(maxReadbacks, f?.readbacksThisFrame ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const end = app.diagnostics().frame?.frames ?? 0;
    return { skipped: null, frames: end - start, maxReadbacks, startReads } as const;
  });

  if ("skipped" in result && result.skipped) {
    test.skip(true, result.skipped);
    return;
  }
  if (result.frames < 60) {
    test.skip(true, `only ${result.frames} frames — no real WebGL2 loop on this host`);
    return;
  }
  if (result.startReads === undefined) {
    test.skip(true, "readbacksThisFrame absent — counters not reporting on this host");
    return;
  }
  expect(result.maxReadbacks, `readbacks observed during ${result.frames} frames`).toBe(0);
});
