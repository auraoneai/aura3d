import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("scene-space transmission refraction", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures opaque scene color and visibly offsets it through transmission geometry", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/transmission-refraction-harness.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => window.__AURA3D_TRANSMISSION_REFRACTION__?.status === "ready" ||
        window.__AURA3D_TRANSMISSION_REFRACTION__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.__AURA3D_TRANSMISSION_REFRACTION__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("production-runtime-webgl2");
    expect(result?.flat?.mode).toBe("renderer-owned-scene-color-readback");
    expect(result?.flat?.excludedTransmissionItems).toBe(1);
    expect(result?.refracted?.excludedTransmissionItems).toBe(1);
    expect(result?.refracted?.materialBindings).toBe(1);
    expect(result?.refracted?.mipCount).toBeGreaterThan(1);
    expect(result?.refracted?.refractionScale).toBe(0.14);
    expect(result?.changedPixels).toBeGreaterThan(300);
    expect(result?.centerChangedPixels).toBeGreaterThan(200);
    expect(result?.iorChangedPixels, "IOR must change the refracted subject pixels").toBeGreaterThan(120);
    expect(result?.backdropColorTransitions, "the red/green/blue backdrop must remain structurally visible through the subject").toBeGreaterThanOrEqual(2);
    expect(result?.strongAttenuationLuma ?? Infinity, "short attenuation distance must remove more transmitted energy").toBeLessThan(result?.weakAttenuationLuma ?? 0);
    expect(result?.strongAttenuationBlueBias ?? -Infinity, "blue attenuation color must increasingly suppress red as travel grows").toBeGreaterThan(result?.weakAttenuationBlueBias ?? Infinity);
    expect(result?.measurementValid, "blank, flat, or camera-only captures invalidate transmission evidence").toBe(true);
    expect(result?.tangentAnisotropyOrientationRange, `authored tangent-frame anisotropy must rotate its highlight: ${JSON.stringify(result?.tangentAnisotropyOrientations)}`).toBeGreaterThan(20);
    expect(result?.tangentAnisotropyMaxElongation, "authored tangent-frame anisotropy must elongate its highlight").toBeGreaterThan(1.35);
    expect(result?.claimBoundary).toMatch(/no depth ray marching.*physical caustic projection/i);

    const reportDir = resolve("tests/reports/pbr-gltf-correctness/transmission");
    mkdirSync(reportDir, { recursive: true });
    for (const id of ["transmission-flat", "transmission-refracted", "transmission-ior-low", "transmission-attenuation-weak", "transmission-attenuation-strong", "anisotropy-0", "anisotropy-45", "anisotropy-90", "anisotropy-135"]) {
      await page.locator(`#${id}`).screenshot({ path: resolve(reportDir, `${id}.png`) });
    }
    writeFileSync(resolve(reportDir, "report.json"), `${JSON.stringify({
      schema: "a3d-production-transmission-structural-proof",
      generatedAt: new Date().toISOString(),
      pass: true,
      ...result,
      assertions: {
        backdropComposition: "horizontal dominant-color transitions >= 2",
        iorResponse: "center changed pixels > 120 between IOR 1.01 and 1.72",
        volumeAttenuation: "short distance lowers luma and increases blue-over-red bias",
        measurementValidity: "subject region has >4,000 nonblack pixels and >12 color buckets",
        tangentAnisotropy: "textured PBR authored tangent frame rotates >=20 degrees and elongates >=1.35"
      }
    }, null, 2)}\n`);
  });
});

declare global {
  interface Window {
    __AURA3D_TRANSMISSION_REFRACTION__?: {
      readonly status: "ready" | "error";
      readonly renderer: "production-runtime-webgl2";
      readonly flat?: {
        readonly mode: string;
        readonly excludedTransmissionItems: number;
      };
      readonly refracted?: {
        readonly excludedTransmissionItems: number;
        readonly materialBindings: number;
        readonly mipCount: number;
        readonly refractionScale: number;
      };
      readonly changedPixels?: number;
      readonly centerChangedPixels?: number;
      readonly iorChangedPixels?: number;
      readonly backdropColorTransitions?: number;
      readonly weakAttenuationLuma?: number;
      readonly strongAttenuationLuma?: number;
      readonly weakAttenuationBlueBias?: number;
      readonly strongAttenuationBlueBias?: number;
      readonly measurementValid?: boolean;
      readonly tangentAnisotropyOrientationRange?: number;
      readonly tangentAnisotropyMaxElongation?: number;
      readonly tangentAnisotropyOrientations?: readonly number[];
      readonly claimBoundary: string;
      readonly error?: string;
    };
  }
}
