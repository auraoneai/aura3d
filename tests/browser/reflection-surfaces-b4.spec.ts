import type {} from "./reflection-surfaces-b4-harness";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("reflection surfaces B4 renderer bindings", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("mirror, glass, and water bindings change real pixels and promote only bound statuses", async ({
    page,
  }, testInfo) => {
    await page.goto(`${server.origin}/tests/browser/reflection-surfaces-b4-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        window.__AURA3D_REFLECTION_SURFACES_B4__?.status === "ready" ||
        window.__AURA3D_REFLECTION_SURFACES_B4__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_REFLECTION_SURFACES_B4__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");

    // (1) Planar mirror re-renders through the oblique-clip camera.
    expect(result?.mirrorRevisions).toEqual([1, 2]);
    expect(result?.mirrorPixelHashes?.[0]).not.toBe(result?.mirrorPixelHashes?.[1]);
    expect(result?.mirrorChangedPixelCount).toBeGreaterThan(20);

    // (2) Reflective floor (first consumer): mirror-bound vs plain pixels.
    expect(result?.floorMirrorVsPlainDelta).toBeGreaterThan(100);

    // (3) Glass: Beer-Lambert thickness tint over the scene-color fetch.
    expect(result?.glassTransmittance).toBeLessThan(1);
    expect(result?.glassTintedDelta).toBeGreaterThan(100);

    // (4) Water: moved reflection changes the composite; the composite
    // differs from raw refraction via the depth tint.
    expect(result?.waterRevisions).toEqual([1, 2]);
    expect(result?.waterChangedPixelCount).toBeGreaterThan(20);
    expect(result?.waterBlendedDelta).toBeGreaterThan(100);

    // Statuses promote ONLY behind the live bindings; SSR stays unsupported.
    expect(result?.planarStatus).toBe("implemented");
    expect(result?.floorStatus).toBe("implemented");
    expect(result?.glassStatus).toBe("implemented");
    expect(result?.waterStatus).toBe("implemented");
    expect(result?.ssrStatus).toBe("implemented");
    const ssr = result?.ssrEvidence;
    const output = testInfo.outputPath("b4-ssr");
    await mkdir(output, { recursive: true });
    for (const [index, image] of (ssr?.images ?? []).entries()) {
      await writeFile(join(output, `frame-${index}.png`), Buffer.from(image.split(",")[1]!, "base64"));
    }
    await writeFile(join(output, "evidence.json"), JSON.stringify({ ...result, ssrEvidence: { ...ssr, images: undefined } }, null, 2));
    expect(ssr?.nativeDraws).toBe(6);
    expect(ssr?.cameraReflectionPixels).toBeGreaterThan(5);
    expect(ssr?.occludedRedReflectionPixels).toBe(0);
    expect(ssr?.reflectedPixels).toBeGreaterThan(10);
    expect(ssr?.movedReflectionPixels).toBeGreaterThan(10);
    expect(ssr?.roughnessDelta).toBeGreaterThan(10);
    expect(ssr?.offscreenDelta).toBe(0);
    expect(ssr?.missingDepthRejected).toBe(true);
    expect(ssr?.disposed).toBe(true);
    expect(result?.planarTrueReflection).toBe(true);
    expect(result?.floorTrueReflection).toBe(true);
    expect(result?.glassTrueReflection).toBe(true);
    expect(result?.waterTrueReflection).toBe(true);
    expect(result?.claimBoundary).toMatch(/native bounded SSR/i);
  });
});
