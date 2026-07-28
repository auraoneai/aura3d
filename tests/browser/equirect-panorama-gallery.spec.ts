import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type ViewId = "left" | "forward" | "right";

declare global {
  interface Window {
    __AURA3D_EQUIRECT_PANORAMA_PROOF__?: {
      readonly status: "ready" | "error";
      readonly route: string;
      readonly rendererPath: string;
      readonly projection: string;
      readonly panoramaSize?: readonly [number, number];
      readonly sampledViews?: readonly ViewId[];
      readonly centerPixels?: Readonly<Record<ViewId, readonly number[]>>;
      readonly horizonPixelPairs?: Readonly<Record<ViewId, readonly [readonly number[], readonly number[]]>>;
      readonly diagnostics?: Readonly<Record<ViewId, { readonly drawCalls: number; readonly lastError: string | null }>>;
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}

test.describe("advanced gallery equirectangular panorama proof", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("projects one directional 2:1 panorama across multiple camera yaws and records a screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 720 });
    await page.goto(`${server.origin}/apps/advanced-examples-gallery/equirect-panorama-proof.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_EQUIRECT_PANORAMA_PROOF__?.status === "ready" ||
        window.__AURA3D_EQUIRECT_PANORAMA_PROOF__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_EQUIRECT_PANORAMA_PROOF__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.route).toBe("advanced-examples-gallery/equirect-panorama-proof");
    expect(result?.rendererPath).toBe("Renderer.environmentBackground -> EnvironmentBackgroundPass");
    expect(result?.projection).toBe("equirect");
    expect(result?.panoramaSize).toEqual([256, 128]);
    expect(result?.sampledViews).toEqual(["left", "forward", "right"]);
    for (const view of result?.sampledViews ?? []) {
      expect(result?.diagnostics?.[view]).toEqual({ drawCalls: 1, lastError: null });
      expect(result?.centerPixels?.[view]?.[3], `${view} center alpha`).toBe(255);
      const pair = result?.horizonPixelPairs?.[view] ?? [];
      expect(pair).toHaveLength(2);
      expect(pair[0]?.[3]).toBe(255);
      expect(pair[1]?.[3]).toBe(255);
      expect(pair[0]?.slice(0, 3)).not.toEqual(pair[1]?.slice(0, 3));
    }
    expect(new Set(Object.values(result?.centerPixels ?? {}).map((pixel) => pixel.slice(0, 3).join(","))).size).toBe(3);
    expect(result?.claimBoundary).toMatch(/does not claim HDR decode.*createAuraApp exposure/i);

    const screenshotPath = resolve("tests/reports/environment-platform/equirect-panorama-gallery.png");
    mkdirSync(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(statSync(screenshotPath).size).toBeGreaterThan(12_000);
  });
});
