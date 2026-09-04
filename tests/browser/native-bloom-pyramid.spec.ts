import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/native-bloom-pyramid/pyramid-probe.json";

interface PyramidBloom {
  readonly quality: string | undefined;
  readonly mipCount: number | undefined;
  readonly targetCount: number | undefined;
  readonly targetBytes: number | undefined;
  readonly halfFloat: boolean | undefined;
  readonly threshold: number | undefined;
  readonly intensity: number | undefined;
  readonly softKnee: number | undefined;
  readonly shoulder: number | undefined;
}

interface PyramidCapture {
  readonly id: string;
  readonly bloom: PyramidBloom | null;
  readonly actualPasses: readonly string[];
  readonly pixelBacked: boolean;
  readonly executionMode: string;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

interface AsyncTwinCapture {
  readonly executionMode: string;
  readonly bloom: PyramidBloom | null;
  readonly passNames: readonly string[];
}

interface PyramidWindow extends Window {
  readonly __AURA3D_BLOOM_PYRAMID_RUNNER__?: {
    renderVariant(id: string): Promise<PyramidCapture>;
    renderAsyncTwin(): Promise<AsyncTwinCapture>;
  };
  readonly __AURA3D_BLOOM_PYRAMID_ERROR__?: string;
}

/**
 * A1 native bloom pyramid (muse3jsparity-PRD Phase 1):
 * - performance keeps the legacy single-scale path (1 mip);
 * - balanced runs the 3-mip pyramid; cinematic runs the 5-mip pyramid + half-float;
 * - soft-knee + shoulder change real pixels (white-bar probe);
 * - every root variant executes renderer-owned-fused-ldr-native (sync);
 * - the duplicate-gated async twin lands on the same fused mode (rendering-level proof).
 */
test("native bloom pyramid executes on sync and async paths", async ({ page }) => {
  test.setTimeout(240_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/native-bloom-pyramid-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const harnessWindow = window as PyramidWindow;
      return Boolean(harnessWindow.__AURA3D_BLOOM_PYRAMID_RUNNER__ || harnessWindow.__AURA3D_BLOOM_PYRAMID_ERROR__);
    }, undefined, { timeout: 90_000 });
    const harnessError = await page.evaluate(() => (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const performance = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderVariant("bloom-performance")
    );
    const balanced = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderVariant("bloom-balanced")
    );
    const cinematic = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderVariant("bloom-cinematic")
    );
    const hardKnee = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderVariant("bloom-hard-knee")
    );
    const softKnee = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderVariant("bloom-soft-knee")
    );

    for (const capture of [performance, balanced, cinematic, hardKnee, softKnee]) {
      expect(capture.actualPasses).toContain("bloom");
      expect(capture.pixelBacked).toBe(true);
      expect(capture.bloom).not.toBeNull();
      // Root bloom routes must execute the native fused path, never readback.
      expect(capture.executionMode).toBe("renderer-owned-fused-ldr-native");
    }
    // Legacy single-scale vs pyramid family (balanced 3-mip, cinematic 5-mip).
    expect(performance.bloom).toMatchObject({ quality: "performance", mipCount: 1 });
    expect(balanced.bloom).toMatchObject({ quality: "balanced", mipCount: 3 });
    expect(cinematic.bloom).toMatchObject({ quality: "cinematic", mipCount: 5, halfFloat: true });
    expect(balanced.bloom!.targetBytes!).toBeGreaterThan(performance.bloom!.targetBytes!);
    expect(cinematic.bloom!.targetBytes!).toBeGreaterThan(balanced.bloom!.targetBytes!);

    // Same scene, different bloom path: the pyramid must change real pixels.
    expect(pixelDelta(balanced, performance).changedFraction).toBeGreaterThan(0.005);

    // Soft-knee + shoulder must be device-observed and change real pixels.
    expect(hardKnee.bloom).toMatchObject({ softKnee: 0, shoulder: 0 });
    expect(softKnee.bloom).toMatchObject({ softKnee: 0.5, shoulder: 0.6 });
    const kneeDelta = pixelDelta(softKnee, hardKnee);
    expect(kneeDelta.changedFraction).toBeGreaterThan(0.002);
    expect(kneeDelta.meanAbsoluteDelta).toBeGreaterThan(0.05);

    // Async twin: duplicate-gated path lands on the same fused mode (rendering-level).
    const asyncTwin = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderAsyncTwin()
    );
    expect(asyncTwin.passNames).toContain("bloom");
    expect(asyncTwin.executionMode).toBe("renderer-owned-fused-ldr-native");
    expect(asyncTwin.bloom).toMatchObject({ quality: "balanced", mipCount: 3, softKnee: 0.25, shoulder: 0.3 });

    await page.screenshot({ path: resolve("tests/reports/native-bloom-pyramid/balanced.png") });
    writeJson(REPORT, {
      generatedAt: new Date().toISOString(),
      performance: { ...performance, pixels: `[${performance.pixels.length} channels]` },
      balanced: { ...balanced, pixels: `[${balanced.pixels.length} channels]` },
      cinematic: { ...cinematic, pixels: `[${cinematic.pixels.length} channels]` },
      hardKnee: { ...hardKnee, pixels: `[${hardKnee.pixels.length} channels]` },
      softKnee: { ...softKnee, pixels: `[${softKnee.pixels.length} channels]` },
      kneeDelta,
      asyncTwin
    });
  } finally {
    await server.close();
  }
});

function pixelDelta(a: PyramidCapture, b: PyramidCapture): { changedFraction: number; meanAbsoluteDelta: number } {
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);
  const total = a.width * a.height;
  let changed = 0;
  let absoluteDelta = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const delta =
      Math.abs((a.pixels[offset] ?? 0) - (b.pixels[offset] ?? 0)) +
      Math.abs((a.pixels[offset + 1] ?? 0) - (b.pixels[offset + 1] ?? 0)) +
      Math.abs((a.pixels[offset + 2] ?? 0) - (b.pixels[offset + 2] ?? 0));
    absoluteDelta += delta;
    if (delta > 12) changed += 1;
  }
  return { changedFraction: changed / total, meanAbsoluteDelta: absoluteDelta / total };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
