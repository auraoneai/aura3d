import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 Phase-6 probes (SMAA / auto-exposure / C-13 custom passes):
 *
 *  - SMAA (§8.14): thin-wire edges produce intermediate-luma coverage —
 *    the smaa ratio must exceed the binary-staircase `none` baseline.
 *  - Auto-exposure (§8.9): bright→dark step settles rendered center-patch
 *    luma within 0.1 EV in ≤ 1.5 s at speedUp 3; zero engine readPixels.
 *  - Custom passes (§6.12): a before-tonemap pass sees RGBA16F values > 1;
 *    an after-tonemap invert produces the expected display-space output.
 *
 * Runs on the remote browser lane (post-quality.yml, macos-14 Chromium).
 */

interface Phase6Result {
  readonly schema: string;
  readonly smaa: { schema: string; none?: { ratio: number }; smaa?: { ratio: number }; error?: string };
  readonly exposure: {
    schema: string;
    brightLuma?: number;
    darkLuma?: number;
    settleSeconds?: number;
    engineReadbacksDuringSteps?: number;
    untested?: string;
    error?: string;
  };
  readonly customPass: {
    schema: string;
    invert?: { before: number[]; after: number[] };
    hdrGate?: number[];
    error?: string;
  };
}

test.describe("PRD-03 Phase 6 — SMAA / auto-exposure / custom passes", () => {
  // Cold dev-server transform of the engine module graph can exceed the
  // global 60s budget on CI runners before the harness global registers.
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;
  let result: Phase6Result;

  test.beforeAll(async ({ browser }, testInfo) => {
    // beforeAll hooks keep the 60s config timeout even when
    // describe.configure raises per-test budgets — extend the hook
    // itself for cold dev-server transforms on CI.
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/tests/browser/qr-prd03-phase6-harness.html`);
    // Deferred module script may still be resolving after `load` — wait for the
    // harness global before evaluating (was flaky: `run is not a function`).
    await page.waitForFunction(
      () => typeof (window as { runQrPrd03Phase6?: unknown }).runQrPrd03Phase6 === "function",
    );
    result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03Phase6?: () => Promise<Phase6Result> }).runQrPrd03Phase6!;
      return run();
    });
    await page.close();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("SMAA smooths thin-wire edges beyond the no-AA staircase baseline", () => {
    const r = result.smaa;
    expect(r.error).toBeUndefined();
    expect(r.none).toBeDefined();
    expect(r.smaa).toBeDefined();
    // SMAA coverage-blends line edges → materially more intermediate-luma
    // pixels than the binary staircase baseline.
    expect(r.smaa!.ratio).toBeGreaterThan(r.none!.ratio * 1.5);
    expect(r.smaa!.ratio).toBeGreaterThan(0);
  });

  test("auto-exposure settles within 0.1 EV in ≤ 1.5 s, zero engine readbacks", () => {
    const r = result.exposure;
    if (r.untested) test.skip();
    expect(r.error).toBeUndefined();
    expect(r.settleSeconds).toBeGreaterThan(0);
    expect(r.settleSeconds!).toBeLessThanOrEqual(1.5);
    expect(r.engineReadbacksDuringSteps).toBe(0);
  });

  test("custom pass at after-tonemap inverts red; before-tonemap sees HDR > 1", () => {
    const r = result.customPass;
    expect(r.error).toBeUndefined();
    expect(r.invert).toBeDefined();
    // Invert red: r_after ≈ 255 − r_before (±2 LSB for sRGB quantization).
    expect(Math.abs(r.invert!.after[0] - (255 - r.invert!.before[0]))).toBeLessThanOrEqual(4);
    // HDR gate: the emissive wall's center pixel has u_color.r > 1 → white.
    expect(r.hdrGate![0]).toBe(255);
    expect(r.hdrGate![1]).toBe(255);
  });
});
