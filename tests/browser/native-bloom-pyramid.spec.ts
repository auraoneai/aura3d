import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { artifact, sha256, sourceIdentity, sameSource } from "../../tools/muse3jsparity-readiness/source-identity";
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
  readonly nativeDrawArrays: number;
  readonly nativeDrawElements: number;
  readonly hotPathReadbacks: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}


interface PyramidWindow extends Omit<Window, "__AURA3D_BLOOM_PYRAMID_RUNNER__"> {
  readonly __AURA3D_BLOOM_PYRAMID_RUNNER__?: {
    renderVariant(id: string): Promise<PyramidCapture>;
    renderAsyncTwin(id: string): Promise<PyramidCapture>;
    lifecycle(): Promise<{ mutationRejected: boolean; disposedRejected: boolean; resizeDeferred: boolean; resizeApplied: boolean; captureFailureRecovered: boolean; pausePreserved: boolean }>;
  };
  readonly __AURA3D_BLOOM_PYRAMID_ERROR__?: string;
}

/**
 * A1 native bloom pyramid (muse3jsparity-PRD Phase 1):
 * - performance keeps the legacy single-scale path (1 mip);
 * - balanced runs the 3-mip pyramid; cinematic runs the 5-mip pyramid + half-float;
 * - soft-knee + shoulder change real pixels (white-bar probe);
 * - every root variant executes renderer-owned-fused-ldr-native (sync);
 * - the root asynchronous twins submit the same native scene and real pixels.
 */
test("native bloom pyramid executes on sync and async paths", async ({ page }, testInfo) => {
  // Seven full production-root captures plus three async twins and lifecycle
  // controls exceed four minutes on the disclosed remote software adapter.
  // Keep every workload and threshold unchanged; allow the measured wall time.
  test.setTimeout(900_000);
  const startedAt = new Date().toISOString();
  const source = sourceIdentity(process.cwd());
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
    const v01 = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderVariant("bloom-v01")
    );
    const v01Disabled = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderVariant("bloom-v01-disabled")
    );

    for (const capture of [performance, balanced, cinematic, hardKnee, softKnee]) {
      expect(capture.nativeDrawArrays).toBeGreaterThan(0);
      expect(capture.nativeDrawArrays + capture.nativeDrawElements).toBeGreaterThan(1);
      expect(capture.hotPathReadbacks).toBe(0);
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
    // V01 frozen settings must produce a usable enabled state, not only pass metadata.
    const v01Delta = pixelDelta(v01, v01Disabled);
    expect(v01Delta.changedFraction).toBeGreaterThan(0.0005);
    expect(v01Delta.meanAbsoluteDelta).toBeGreaterThan(0.01);

    // Soft-knee + shoulder must be device-observed and change real pixels.
    expect(hardKnee.bloom).toMatchObject({ softKnee: 0, shoulder: 0 });
    expect(softKnee.bloom).toMatchObject({ softKnee: 0.5, shoulder: 0.6 });
    const kneeDelta = pixelDelta(softKnee, hardKnee);
    expect(kneeDelta.changedFraction).toBeGreaterThan(0.002);
    expect(kneeDelta.meanAbsoluteDelta).toBeGreaterThan(0.05);

    const asyncTwins: PyramidCapture[] = [];
    for (const sync of [performance, balanced, cinematic]) {
      const twin = await page.evaluate((id) =>
        (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.renderAsyncTwin(id), sync.id);
      expect(twin.nativeDrawArrays).toBeGreaterThan(0);
      expect(twin.nativeDrawArrays + twin.nativeDrawElements).toBeGreaterThan(1);
      expect(twin.hotPathReadbacks).toBe(0);
      expect(twin.actualPasses).toContain("bloom");
      expect(twin.executionMode).toBe("renderer-owned-fused-ldr-native");
      expect(twin.pixelBacked).toBe(true);
      expect(twin.bloom).toMatchObject({ quality: sync.bloom!.quality, mipCount: sync.bloom!.mipCount });
      expect(twin.pixels.some((value, index) => index % 4 !== 3 && value > 30)).toBe(true);
      expect(pixelDelta(twin, sync).meanAbsoluteDelta).toBeLessThan(1);
      asyncTwins.push(twin);
    }
    const lifecycle = await page.evaluate(() =>
      (window as PyramidWindow).__AURA3D_BLOOM_PYRAMID_RUNNER__!.lifecycle());
    expect(lifecycle).toEqual({ mutationRejected: true, disposedRejected: true, resizeDeferred: true, resizeApplied: true, captureFailureRecovered: true, pausePreserved: true });

    // Encode the captured GPU readback itself: the lifecycle probe above has
    // already disposed its canvas, which is not a balanced-bloom screenshot.
    const retained = new Map<PyramidCapture, Awaited<ReturnType<typeof retainCapture>>>();
    for (const capture of [performance, balanced, cinematic, hardKnee, softKnee]) {
      retained.set(capture, await retainCapture(page, capture, "sync"));
    }
    for (const capture of asyncTwins) retained.set(capture, await retainCapture(page, capture, "async"));
    for (const image of retained.values()) await testInfo.attach(image.path, {
      path: resolve(image.path), contentType: "image/png"
    });
    const summarize = (capture: PyramidCapture) => {
      const { pixels, ...observations } = capture;
      return { ...observations, pixelChannels: pixels.length, pixelsSha256: sha256(Uint8Array.from(pixels)),
        pixelOrigin: "bottom-left", image: retained.get(capture) };
    };
    expect(sameSource(source, sourceIdentity(process.cwd())), "source must not change during native bloom evidence").toBe(true);
    writeJson(REPORT, {
      schema: "aura3d.native-bloom-pyramid/3.0.1",
      generatedAt: new Date().toISOString(), startedAt, endedAt: new Date().toISOString(), source,
      producer: { command: "pnpm exec playwright test tests/browser/native-bloom-pyramid.spec.ts",
        argv: process.argv, cwd: process.cwd(), test: testInfo.title, project: testInfo.project.name,
        browser: page.context().browser()?.browserType().name(), browserVersion: page.context().browser()?.version(),
        claimSurface: "createAuraApp root safe API", backend: "webgl2" },
      artifacts: [...retained.values()],
      performance: summarize(performance), balanced: summarize(balanced), cinematic: summarize(cinematic),
      hardKnee: summarize(hardKnee), softKnee: summarize(softKnee), kneeDelta,
      asyncTwins: asyncTwins.map(summarize), lifecycle
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

/** Same lossless readback encoding pattern as asset-compression-browser.spec.ts. */
async function retainCapture(page: Page, capture: PyramidCapture, mode: "sync" | "async") {
  expect(capture.pixels.length).toBe(capture.width * capture.height * 4);
  const dataUrl = await page.evaluate(({ width, height, pixels }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG encoding context unavailable");
    const topLeft = new Uint8ClampedArray(pixels.length);
    const rowBytes = width * 4;
    // WebGL readPixels rows start at bottom-left; PNG rows start at top-left.
    for (let y = 0; y < height; y++) {
      topLeft.set(pixels.slice((height - y - 1) * rowBytes, (height - y) * rowBytes), y * rowBytes);
    }
    context.putImageData(new ImageData(topLeft, width, height), 0, 0);
    return canvas.toDataURL("image/png");
  }, { width: capture.width, height: capture.height, pixels: [...capture.pixels] });
  expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  const path = `tests/reports/native-bloom-pyramid/${mode}-${capture.id}.png`;
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  return { ...artifact(process.cwd(), path), width: capture.width, height: capture.height,
    mode, captureId: capture.id, imageOrigin: "top-left" };
}
