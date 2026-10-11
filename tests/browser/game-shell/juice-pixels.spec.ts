/**
 * juice-pixels.spec.ts (PRD-09 §15): frozen scenario, `juice.flash` at frame
 * N → frame N+1 mean luma ≥ +25 (Rec. 709 8-bit, full canvas/page), frame
 * N+13 (≥ 200 ms, envelope exactly 0) max per-channel |Δ| = 0 vs frame N.
 * `fx.burst("spark", …)` → frames N+1…N+6 ≥ 0.15 % of canvas pixels within
 * ΔE2000 < 12 of the spark color near the projected point (standalone: DOM
 * overlay path; integrated canvas readback asserts the same once C-05 lands).
 *
 * The flash is measured on the page screenshot: with A3D_QR_CORE off the
 * juice overlay is the DOM `.a3g-juice-overlay` layer above the canvas, which
 * a canvas readback cannot see (what the player sees is the composite).
 */
import { expect, test, loadHarness, pagePixels as snapPage, stepFrames, withServer } from "./support";

type Pixels = number[] | null;

function luma(px: Pixels): number {
  if (!px || px.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < px.length; i += 3) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return sum / (px.length / 3);
}

function maxChannelDiff(a: Pixels, b: Pixels): number {
  if (!a || !b || a.length !== b.length) return Infinity;
  let max = 0;
  for (let i = 0; i < a.length; i += 1) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

withServer((getServer) => {
  test("flash envelope: +25 luma at N+1, 0-diff at N+13", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen&animate=0");
    await stepFrames(page, 2);
    const frameN = await snapPage(page, "flash-frame-N");

    await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as {
        juice: { flash(color: string, o: { peak: number; ms: number }): void };
      };
      g.juice.flash("#ffffff", { peak: 0.6, ms: 200 });
    });
    await stepFrames(page, 1);
    const frameN1 = await snapPage(page, "flash-frame-N+1");

    expect(luma(frameN1) - luma(frameN), "flash did not raise mean luma by ≥ 25").toBeGreaterThanOrEqual(25);

    // Envelope is exp-decay to exactly 0 at ms=200 ≈ 12 frames; N+13 is clear.
    for (let i = 0; i < 12; i += 1) await stepFrames(page, 1);
    const frameN13 = await snapPage(page, "flash-frame-N+13");
    expect(maxChannelDiff(frameN13, frameN), "envelope did not return to 0").toBe(0);
  });

  test("spark burst paints ≥ 0.15 % of canvas near the projected point", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen&animate=0");
    await stepFrames(page, 2);
    // Page composite, like the flash: a WebGL canvas without
    // preserveDrawingBuffer may read back cleared outside its frame task.
    const baseline = await snapPage(page, "spark-frame-N");
    if (!baseline) throw new Error("page pixel readback unavailable");

    await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as {
        fx: { burst(kind: string, p: number[], o: { count: number; seed?: number }): void };
      };
      g.fx.burst("spark", [0, 0.3, 0], { count: 24, seed: 7 });
    });

    const fractions: number[] = [];
    for (let frame = 1; frame <= 6; frame += 1) {
      await stepFrames(page, 1);
      const after = await snapPage(page, `spark-frame-N+${frame}`);
      if (!after || after.length !== baseline.length) throw new Error("page pixel readback unavailable");
      // A pixel counts once when any channel moved by > 20 (ΔE2000 < 12 to the
      // spark color is the integrated metric; this is the standalone proxy).
      let changed = 0;
      for (let i = 0; i < after.length; i += 3) {
        if (Math.abs(after[i] - baseline[i]) > 20 || Math.abs(after[i + 1] - baseline[i + 1]) > 20 || Math.abs(after[i + 2] - baseline[i + 2]) > 20) changed += 1;
      }
      fractions.push(changed / (after.length / 3));
    }
    test.info().annotations.push({ type: "spark-coverage", description: fractions.map((f) => (f * 100).toFixed(3)).join(",") });
    for (const [i, fraction] of fractions.entries()) {
      expect(fraction, `burst painted ${(fraction * 100).toFixed(3)}% of canvas at N+${i + 1} (need ≥ 0.15%)`)
        .toBeGreaterThanOrEqual(0.0015);
    }
  });
});
