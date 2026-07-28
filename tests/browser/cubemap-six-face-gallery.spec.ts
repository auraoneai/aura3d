import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type Face = "px" | "nx" | "py" | "ny" | "pz" | "nz";

declare global {
  interface Window {
    __AURA3D_CUBEMAP_SIX_FACE_PROOF__?: {
      readonly status: "ready" | "error";
      readonly route: string;
      readonly rendererPath: string;
      readonly sampledFaces?: readonly Face[];
      readonly centerPixels?: Readonly<Record<Face, readonly number[]>>;
      readonly diagnostics?: Readonly<Record<Face, { readonly drawCalls: number; readonly lastError: string | null }>>;
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}

const EXPECTED_DOMINANT_CHANNEL: Readonly<Record<Face, readonly [number, number]>> = {
  px: [0, 1],
  nx: [1, 0],
  py: [2, 0],
  ny: [0, 2],
  pz: [0, 1],
  nz: [2, 0]
};

test.describe("advanced gallery cubemap six-face proof", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders and screenshots every cubemap face through EnvironmentBackgroundPass", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(`${server.origin}/apps/advanced-examples-gallery/cubemap-six-face-proof.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_CUBEMAP_SIX_FACE_PROOF__?.status === "ready" ||
        window.__AURA3D_CUBEMAP_SIX_FACE_PROOF__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_CUBEMAP_SIX_FACE_PROOF__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.route).toBe("advanced-examples-gallery/cubemap-six-face-proof");
    expect(result?.rendererPath).toBe("Renderer.environmentBackground -> EnvironmentBackgroundPass");
    expect(result?.sampledFaces).toEqual(["px", "nx", "py", "ny", "pz", "nz"]);
    for (const face of result?.sampledFaces ?? []) {
      expect(result?.diagnostics?.[face]).toEqual({ drawCalls: 1, lastError: null });
      const pixel = result?.centerPixels?.[face] ?? [];
      const [dominant, comparison] = EXPECTED_DOMINANT_CHANNEL[face];
      expect(pixel[dominant] ?? 0, `${face} dominant channel: ${pixel.join(",")}`).toBeGreaterThan((pixel[comparison] ?? 0) + 60);
      expect(pixel[3], `${face} alpha`).toBe(255);
    }
    expect(new Set(Object.values(result?.centerPixels ?? {}).map((pixel) => pixel.slice(0, 3).join(","))).size).toBe(6);
    expect(result?.claimBoundary).toMatch(/does not claim live reflection probes.*createAuraApp exposure/i);

    const screenshotPath = resolve("tests/reports/environment-platform/cubemap-six-face-gallery.png");
    mkdirSync(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(statSync(screenshotPath).size).toBeGreaterThan(10_000);
  });
});
