/**
 * assets-compressed-typed-glb.spec.ts — PRD-05 Phase-1 *integrated* gate.
 *
 * The typed-asset lane: `model(assets.x)` through createAuraApp + TypedGLBActor
 * resolves the manifest's `requiredDecoders` against the app's C-16 registry —
 * a compiled `aura.assets.json` entry declaring KHR_texture_basisu gets the
 * app-attached registry's imageDecoder, and a disabled decoder fails closed.
 *
 * This spec is `integrated`: it needs Q-04-1 (TypedGLBActor `decoders` wiring)
 * and Q-15-1 (`createAuraApp` attaching `createAppAssetDecoders` to the app
 * object) to land on main. Until then it is skipped — lane CI does not run it;
 * checkpoint runs enable it.
 */
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { startPrd05DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";

test.describe("PRD-05 typed-GLB via model(assets.x) (P1, integrated)", () => {
  test.skip(true, "integrated gate — pending Q-04-1 (TypedGLBActor decoders) + Q-15-1 (createAuraApp registry attach)");

  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("model(assets.x) with requiredDecoders loads through the app registry", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd05/browser/assets-compressed-typed-glb.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
      undefined,
      { timeout: 180_000 }
    );
    const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
    const payload = await page.evaluate(() => (window as any).__QR_READY__);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd05-assets-compressed-typed-glb.json"),
      `${JSON.stringify({ phase: 1, surface: "assets-compressed-typed-glb", error, ...(payload as object ?? {}) }, null, 2)}\n`
    );
    expect(error).toBeNull();
    expect(payload).toBeTruthy();
  });
});
