// PRD-06 §16 S3 — flag-on lane copy of `tests/browser/animation-resource-lifecycle.spec.ts`.
// Under `?a3d-qr=animation,animation.gpu_morph`, actor teardown frees the deform
// resources the runtime stamped: C-18 palette bytes, §8.2 morph array-texture
// bytes, and the WebGL2 live-texture count all return to their pre-load values
// exactly. The harness renders once per cycle so the counters provably rise
// before disposal (the equality check can't pass vacuously).

import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

interface LifecycleCounters {
  readonly paletteBytes: number;
  readonly morphBytes: number;
  readonly liveTextures: number;
}

interface LifecycleReport {
  readonly done?: boolean;
  readonly error?: string;
  readonly stack?: string;
  readonly cycles?: readonly {
    readonly cycle: number;
    readonly clipName?: string;
    readonly applied?: unknown;
    readonly flags?: unknown;
    readonly paletteAcquires?: number;
    readonly morphAcquires?: number;
    readonly rendered?: unknown;
    readonly baseline: LifecycleCounters;
    readonly afterRender: LifecycleCounters;
    readonly afterDispose: LifecycleCounters;
  }[];
}

declare global {
  interface Window {
    __AURA3D_QR_ANIMATION_LIFECYCLE__?: LifecycleReport;
  }
}

test.describe("PRD-06 animation resource lifecycle (flag on)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("actor dispose releases palette and morph textures back to pre-load values", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd06/browser/animation-resource-lifecycle-harness.html?a3d-qr=animation,animation.gpu_morph`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_QR_ANIMATION_LIFECYCLE__?.done === true || window.__AURA3D_QR_ANIMATION_LIFECYCLE__?.error !== undefined,
      undefined,
      { timeout: 60_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_QR_ANIMATION_LIFECYCLE__);
    expect(result?.error, result?.error).toBeUndefined();
    expect(result?.cycles?.length).toBe(3);
    for (const cycle of result!.cycles!) {
      // Resources actually got created — the flag-on binds acquired a palette
      // and built a morph array texture, otherwise the equality checks below
      // are vacuous.
      expect(cycle.paletteAcquires, `cycle ${cycle} skinned bindings were never stamped`).toBeGreaterThan(0);
      expect(cycle.morphAcquires, `cycle ${cycle} morph items were never acquired`).toBeGreaterThan(0);
      expect(cycle.afterRender.paletteBytes, `cycle ${cycle} palette was never acquired`).toBeGreaterThan(cycle.baseline.paletteBytes);
      expect(cycle.afterRender.morphBytes, `cycle ${cycle} morph texture was never built`).toBeGreaterThan(cycle.baseline.morphBytes);
      // §16 S3: all three counters return to their pre-load values exactly.
      expect(cycle.afterDispose.paletteBytes).toBe(cycle.baseline.paletteBytes);
      expect(cycle.afterDispose.morphBytes).toBe(cycle.baseline.morphBytes);
      expect(cycle.afterDispose.liveTextures).toBe(cycle.baseline.liveTextures);
    }
  });
});
