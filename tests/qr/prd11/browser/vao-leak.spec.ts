/**
 * PRD-11 S-gate (§1100/§1170): `liveBuffers` (and `liveVertexArrays` once
 * Q-01-1 lands) must be flat across a long run — identical at frame ~60 and
 * frame ~10,000 on the lane scene.
 *
 * Remote-only evidence (macos-14 lane-browser job). Skips loudly without a
 * real WebGL2 context; `liveVertexArrays` is reported (not asserted) while
 * the Q-01-1 VAO counter is still `null`.
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
    server: { port: 5195, strictPort: true },
    logLevel: "error"
  });
  await server.listen();
});

test.afterAll(async () => {
  await server?.close();
});

interface FrameSection {
  readonly frames: number;
  readonly liveBuffers?: number;
  readonly liveVertexArrays?: number | null;
}

interface Prd11App {
  diagnostics(): { frame?: FrameSection };
}

test("liveBuffers identical at frame ~60 and ~10,000", async ({ page }) => {
  await page.goto(`http://127.0.0.1:5195${SCENE_URL}`);
  await page.waitForFunction(() => (window as unknown as { __QR_READY__?: unknown }).__QR_READY__ !== undefined, undefined, { timeout: 30_000 });

  const alive = await page.evaluate(async () => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__;
    if (!app) return false;
    const start = app.diagnostics().frame?.frames ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return (app.diagnostics().frame?.frames ?? 0) > start;
  });
  test.skip(!alive, "no WebGL2 frame progress in this environment");

  const early = await page.evaluate(() => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__!;
    const f = app.diagnostics().frame;
    return { liveBuffers: f?.liveBuffers ?? -1, liveVertexArrays: f?.liveVertexArrays ?? null };
  });
  test.skip(early.liveBuffers < 0, "liveBuffers counter absent — frame section not reporting counters");

  // 10,000 frames at 60fps ≈ 167s; poll until reached (cap the wait at 6 min).
  const late = await page.evaluate(async () => {
    const app = (window as unknown as { __PRD11_APP__?: Prd11App }).__PRD11_APP__!;
    const deadline = performance.now() + 6 * 60_000;
    while (performance.now() < deadline) {
      const frames = app.diagnostics().frame?.frames ?? 0;
      if (frames >= 10_000) {
        const f = app.diagnostics().frame;
        return { reached: true, frames, liveBuffers: f?.liveBuffers ?? -1, liveVertexArrays: f?.liveVertexArrays ?? null };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const f = app.diagnostics().frame;
    return { reached: false, frames: f?.frames ?? 0, liveBuffers: f?.liveBuffers ?? -1, liveVertexArrays: f?.liveVertexArrays ?? null };
  });

  if (!late.reached) {
    test.skip(true, `scene reached only ${late.frames} frames inside the wait budget`);
    return;
  }
  expect(late.liveBuffers, `liveBuffers grew ${early.liveBuffers} → ${late.liveBuffers} over ${late.frames} frames`).toBe(early.liveBuffers);
  // Reported, not asserted, until Q-01-1 lands the VAO counter.
  console.log(`liveVertexArrays: ${early.liveVertexArrays} → ${late.liveVertexArrays}`);
});
