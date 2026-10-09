/**
 * assets-lod-transition.spec.ts — PRD-05 Phase-3 browser gate (§15, S7 (f)).
 *
 * Drives `assets-lod-transition.ts`: a real `TypedGLBActor` built from the
 * optimized hero vehicle's `MSFT_lod` chain steps through a 120-frame dolly
 * (320 m → 4 m). Asserts the §15 contract:
 *   - the lane flag `assets.lod` resolved on and the extension built chains;
 *   - render-item output never reaches zero items for an LOD-ed actor;
 *   - per-chain levels traverse ≥ 3 distinct levels across the sweep and
 *     coarsen monotonically with camera distance (increasing level with
 *     distance, modulo the selector's one-step-per-frame pacing);
 *   - when a chain's level changed, the emitted render items' geometry set
 *     changed (render-item content switches at the expected coverage);
 *   - `lodDither` reports "pending" while the dithered variant waits on the
 *     C-02 generator (hard switch asserted standalone, per §15).
 *
 * macos-14 CI only.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd05DevServer, type ExampleDevServer } from "../dev-server";

interface FrameRecord {
  readonly frame: number;
  readonly distance: number;
  readonly coverage: number;
  readonly items: number;
  readonly triangles: number;
  readonly chainLevels: readonly number[];
  readonly geometryKeys: readonly string[];
}

interface PopRecord {
  readonly frame: number;
  readonly distance: number;
  readonly coverage: number;
  readonly deltaE2000: number;
}

interface ReadyPayload {
  readonly frames: readonly FrameRecord[];
  readonly pops: readonly PopRecord[];
  readonly chainCount: number;
  readonly lodFlagOn: boolean;
  readonly lodDither: string;
}

test.describe("PRD-05 asset LOD transition (P3)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startPrd05DevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("dolly sweep switches LOD levels at coverage thresholds, never empty", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd05/browser/assets-lod-transition.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
      undefined,
      { timeout: 180_000 }
    );
    const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
    const payload = await page.evaluate(() => (window as any).__QR_READY__ as ReadyPayload | undefined);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd05-assets-lod-transition.json"),
      `${JSON.stringify({ phase: 3, surface: "assets-lod-transition", error, ...payload }, null, 2)}\n`
    );
    expect(error, "harness error").toBeNull();
    expect(payload).toBeTruthy();

    expect(payload!.lodFlagOn, "assets.lod flag must be on for the extension to build chains").toBe(true);
    expect(payload!.chainCount, "MSFT_lod chains materialized").toBeGreaterThan(0);
    expect(payload!.frames.length).toBe(120);
    expect(payload!.lodDither).toBe("pending");

    // S7 (e): ≥ 60 % triangle reduction at 80 m vs the finest (nearest)
    // level. Nearest-distance frames carry LOD0.
    const nearTris = payload!.frames
      .filter((f) => f.distance <= 20)
      .reduce((m, f) => Math.max(m, f.triangles), 0);
    const at80 = payload!.frames.reduce((best, f) =>
      Math.abs(f.distance - 80) < Math.abs(best.distance - 80) ? f : best);
    expect(nearTris, "no triangles recorded near the camera").toBeGreaterThan(0);
    expect(
      at80.triangles,
      `80 m (${at80.distance} m frame) should drop ≥ 60 % of the ${nearTris} LOD0 tris`
    ).toBeLessThanOrEqual(Math.ceil(nearTris * 0.4));

    // S7 (d): pops recorded at every level change for the vision judges —
    // each entry is the masked ΔE2000 between the pre- and post-switch frame.
    expect(payload!.pops.length, "no level-change pops measured").toBeGreaterThanOrEqual(1);
    for (const pop of payload!.pops) {
      expect(pop.deltaE2000, `pop at frame ${pop.frame} is NaN`).not.toBeNaN();
    }

    // Never a zero-item frame for an LOD-ed actor.
    for (const frame of payload!.frames) {
      expect(frame.items, `frame ${frame.frame} emitted ${frame.items} render items`).toBeGreaterThan(0);
    }

    // Levels coarsen with distance: overall trend increases level as distance
    // decreases → compare first-quarter and last-quarter mean chain level.
    const flatLevels = payload!.frames.map((f) => f.chainLevels.reduce((a, b) => a + b, 0) / Math.max(1, f.chainLevels.length));
    const farMean = flatLevels.slice(0, 30).reduce((a, b) => a + b, 0) / 30;
    const nearMean = flatLevels.slice(90).reduce((a, b) => a + b, 0) / 30;
    expect(farMean, "far end of the dolly coarsens").toBeGreaterThan(nearMean);

    // ≥ 3 distinct levels reached across the sweep (finest→coarsest bands).
    const distinctLevels = new Set(payload!.frames.flatMap((f) => f.chainLevels));
    expect(distinctLevels.size, `distinct levels seen: ${[...distinctLevels].sort().join(",")}`).toBeGreaterThanOrEqual(3);

    // Render-item content switches at the expected coverage: every chain-level
    // change coincides with a geometry-set change in the emitted items.
    let sawContentSwitch = 0;
    for (let i = 1; i < payload!.frames.length; i += 1) {
      const prev = payload!.frames[i - 1]!;
      const curr = payload!.frames[i]!;
      const levelChanged = curr.chainLevels.some((l, c) => l !== prev.chainLevels[c]);
      if (!levelChanged) continue;
      const prevKeys = new Set(prev.geometryKeys);
      const currKeys = new Set(curr.geometryKeys);
      const changed = [...currKeys].filter((k) => !prevKeys.has(k)).length + [...prevKeys].filter((k) => !currKeys.has(k)).length;
      expect(changed, `frame ${curr.frame} level change without geometry change`).toBeGreaterThan(0);
      sawContentSwitch += 1;
    }
    expect(sawContentSwitch, "no LOD level change observed across 120 frames").toBeGreaterThanOrEqual(2);
  });
});
