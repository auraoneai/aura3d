import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 animation and controls real renderer", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders imported skinned and morph animated assets with orbit control proof", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${server.origin}/tests/browser/production-runtime-animation-controls-real-renderer.html`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => {
          const result = window.__V6_ANIMATION_CONTROLS__ as { status?: string } | undefined;
          return result?.status === "ready" || result?.status === "error";
        },
        undefined,
        { timeout: 45_000 }
      );
    } catch (error) {
      throw new Error(`V6 animation controls harness did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
    }

    const result = await page.evaluate(() => window.__V6_ANIMATION_CONTROLS__) as {
      status: "ready" | "error";
      error?: string;
      hdr?: { realRadianceHdr: boolean; specularMipCount: number };
      results?: {
        id: string;
        expected: "skinning" | "morph-targets";
        metadata: {
          animationCount: number;
          skinCount: number;
          morphTargetCount: number;
          hasSkinning: boolean;
          hasMorphTargets: boolean;
          hasAnimation: boolean;
        };
        animation: {
          importedAnimation: boolean;
          skinningReady: boolean;
          morphTargetsReady: boolean;
          renderable: boolean;
          warnings: readonly string[];
        };
        orbit: {
          distance: number;
          minDistance: number;
          maxDistance: number;
          near: number;
          far: number;
          viewMatrixFinite: boolean;
          projectionMatrixFinite: boolean;
          viewProjectionMatrixFinite: boolean;
        };
        summary: { pass: boolean; missing: readonly string[] };
        proof: { diagnostics: { drawCalls: number; textures?: number; lastError: string | null }; pixels: { nonBlackPixels: number; uniqueColorBuckets: number } };
      }[];
    };

    expect(result.status, result.error).toBe("ready");
    expect(result.hdr?.realRadianceHdr).toBe(true);
    expect(result.hdr?.specularMipCount).toBeGreaterThanOrEqual(9);
    expect(result.results?.length).toBe(2);
    for (const rendered of result.results ?? []) {
      expect(rendered.summary.pass, `${rendered.id}: ${rendered.summary.missing.join(", ")}`).toBe(true);
      expect(rendered.animation.importedAnimation).toBe(true);
      expect(rendered.animation.renderable).toBe(true);
      expect(rendered.animation.warnings).toEqual([]);
      expect(rendered.orbit.distance).toBeGreaterThan(0);
      expect(rendered.orbit.minDistance).toBeGreaterThan(0);
      expect(rendered.orbit.maxDistance).toBeGreaterThan(rendered.orbit.distance);
      expect(rendered.orbit.far).toBeGreaterThan(rendered.orbit.near);
      expect(rendered.orbit.viewMatrixFinite).toBe(true);
      expect(rendered.orbit.projectionMatrixFinite).toBe(true);
      expect(rendered.orbit.viewProjectionMatrixFinite).toBe(true);
      expect(rendered.proof.diagnostics.drawCalls).toBeGreaterThan(0);
      expect(rendered.proof.diagnostics.lastError).toBeNull();
      expect(rendered.proof.pixels.nonBlackPixels).toBeGreaterThan(1000);
      expect(rendered.proof.pixels.uniqueColorBuckets).toBeGreaterThan(4);
    }
    const skinned = result.results?.find((item) => item.id === "cesium-man");
    const morph = result.results?.find((item) => item.id === "animated-morph-cube");
    expect(skinned?.metadata.hasAnimation).toBe(true);
    expect(skinned?.metadata.hasSkinning).toBe(true);
    expect(skinned?.animation.skinningReady).toBe(true);
    expect(morph?.metadata.hasAnimation).toBe(true);
    expect(morph?.metadata.hasMorphTargets).toBe(true);
    expect(morph?.animation.morphTargetsReady).toBe(true);

    mkdirSync(resolve("tests/reports/production-runtime-animation-controls"), { recursive: true });
    await page.locator("#cesium-man").screenshot({ path: "tests/reports/production-runtime-animation-controls/cesium-man-animation.png" });
    await page.locator("#animated-morph-cube").screenshot({ path: "tests/reports/production-runtime-animation-controls/animated-morph-cube.png" });
    writeFileSync(resolve("tests/reports/production-runtime-animation-controls-real-renderer.json"), `${JSON.stringify({
      schema: "a3d-production-runtime-animation-controls-real-renderer/v1",
      generatedAt: new Date().toISOString(),
      screenshots: [
        "tests/reports/production-runtime-animation-controls/cesium-man-animation.png",
        "tests/reports/production-runtime-animation-controls/animated-morph-cube.png"
      ],
      ...result
    }, null, 2)}\n`);
  });
});
