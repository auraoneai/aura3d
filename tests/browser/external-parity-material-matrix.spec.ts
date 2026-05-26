import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-material-matrix-browser.json";

test.describe("V4 physical material matrix browser evidence", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves visible material variation and public material diagnostics", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/_quarantine/material-showroom/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_MATERIAL_SHOWROOM__?.status === "ready", undefined, { timeout: 30_000 });

    const screenshotPath = "tests/reports/external-gallery/materials/material-matrix.png";
    mkdirSync(join(process.cwd(), "tests/reports/external-gallery/materials"), { recursive: true });
    await page.locator("[data-testid='material-showroom-canvas']").screenshot({ path: screenshotPath });

    const state = await page.evaluate(() => window.__AURA3D_MATERIAL_SHOWROOM__);
    const v4Materials = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.ts") as typeof import("../../packages/rendering/src");
      const matrix = rendering.analyzeV4MaterialMatrix();
      const transmission = rendering.evaluateV4Transmission({
        baseColor: [0.8, 0.95, 1],
        thickness: 0.2,
        attenuationColor: [0.95, 0.98, 1],
        attenuationDistance: 1.2,
        ior: 1.45,
        intensity: 1.6
      });
      return {
        materialIds: matrix.map((entry) => entry.descriptor.id),
        reflectanceClasses: matrix.map((entry) => entry.reflectanceClass),
        boundedDiagnostics: matrix.flatMap((entry) => entry.extensionDiagnostics.filter((extension) => extension.support === "bounded").map((extension) => extension.extension)),
        transmission,
        alphaSorted: rendering.sortV4AlphaItems([
          { id: "glass-near", depth: 2, alphaMode: "blend" },
          { id: "opaque-mid", depth: 5, alphaMode: "opaque" },
          { id: "glass-far", depth: 8, alphaMode: "blend" }
        ]).map((entry) => entry.id)
      };
    });
    const pixels = state?.pixels ?? {};
    const pixelBuckets = new Set(Object.values(pixels).map((pixel) => Array.isArray(pixel) ? `${pixel[0] >> 4}:${pixel[1] >> 4}:${pixel[2] >> 4}` : "missing"));
    const report = {
      ok: errors.length === 0 &&
        state?.status === "ready" &&
        v4Materials.materialIds.length === 12 &&
        v4Materials.boundedDiagnostics.includes("clearcoat") &&
        v4Materials.boundedDiagnostics.includes("transmission") &&
        v4Materials.transmission.bounded === true &&
        pixelBuckets.size >= 8,
      generatedAt: new Date().toISOString(),
      screenshotPath,
      productBoundary: "Browser material matrix evidence for V4 Milestone 4 only. Same-scene Three.js material screenshots and licensed material textures are still required before flagship proof.",
      requiredNextProof: [
        "same material matrix in Three.js",
        "texture-backed material library",
        "licensed material texture provenance",
        "flagship product/material studio screenshots"
      ],
      errors,
      pixelBucketCount: pixelBuckets.size,
      state,
      v4Materials
    };
    mkdirSync(join(process.cwd(), "tests/reports"), { recursive: true });
    writeFileSync(join(process.cwd(), reportPath), `${JSON.stringify(report, null, 2)}\n`);

    expect(errors).toEqual([]);
    expect(state?.status).toBe("ready");
    expect(v4Materials.materialIds).toHaveLength(12);
    expect(v4Materials.boundedDiagnostics).toContain("clearcoat");
    expect(v4Materials.boundedDiagnostics).toContain("transmission");
    expect(v4Materials.transmission.bounded).toBe(true);
    expect(pixelBuckets.size).toBeGreaterThanOrEqual(8);
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

declare global {
  interface Window {
    __AURA3D_MATERIAL_SHOWROOM__?: {
      readonly status?: "ready" | "error";
      readonly pixels?: Record<string, readonly number[]>;
    };
  }
}
