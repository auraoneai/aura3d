/**
 * assets-tier-texture-cap.spec.ts — PRD-05 browser gate (§15, 05-BROWSERS).
 *
 * The shared uastc/etc1s fixtures embed 2048×2048 KTX2 textures. Loading
 * them through `createAppAssetDecoders` with the tier cap
 * `?maxTextureSize=1024` must bound every uploaded mip level to ≤ 1024 —
 * the C-27 tier cap flows into the KTX2 transcode (`maxDimension` level
 * skip) instead of ignoring the cap.
 */
import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { startPrd05DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";

interface CapPayload {
  readonly maxTextureSize: number;
  readonly variants: readonly {
    readonly variant: string;
    readonly textureMaxWidths: readonly number[];
  }[];
}

test.describe("PRD-05 tier texture cap bounds KTX2 uploads (P1)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("2048 KTX2 textures upload capped at 1024 under maxTextureSize=1024", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd05/browser/assets-compressed-glb.html?maxTextureSize=1024`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
      undefined,
      { timeout: 180_000 }
    );
    const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
    const payload = await page.evaluate(() => (window as any).__QR_READY__ as CapPayload | undefined);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve(`tests/reports/prd05-assets-tier-texture-cap${test.info().project.name === "chromium" ? "" : `.${test.info().project.name}`}.json`),
      `${JSON.stringify({ surface: "assets-tier-texture-cap", error, ...payload }, null, 2)}\n`
    );
    expect(error, "harness error").toBeNull();
    expect(payload).toBeTruthy();
    expect(payload!.maxTextureSize).toBe(1024);

    for (const variant of ["uastc", "etc1s"] as const) {
      const result = payload!.variants.find((v) => v.variant === variant);
      expect(result, `variant ${variant} missing`).toBeTruthy();
      expect(result!.textureMaxWidths.length, `${variant} has no textures`).toBeGreaterThan(0);
      for (const width of result!.textureMaxWidths) {
        expect(width, `${variant} texture mip width ${width} exceeds the 1024 tier cap`).toBeLessThanOrEqual(1024);
      }
    }
  });
});
