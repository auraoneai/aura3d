import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("Aura3D product viewer reaches ready state", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");
  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const diagnostics = await page.evaluate(() => (window as unknown as { __AURA3D_ROUTE_READY__?: { diagnostics?: { backend?: string } } }).__AURA3D_ROUTE_READY__?.diagnostics);
  expect(diagnostics?.backend).toBe("webgl2");
  expect(drawCalls).toBeGreaterThan(0);

  const proof = await page.evaluate(() => (window as unknown as {
    __AURA3D_PRODUCT_VIEWER__?: {
      look: { id: string };
      camera: { mode: string; subjectHeightFraction: readonly number[]; orbit: boolean };
      product: { assetId: string; url: string };
      evidence: { entry: string };
    };
  }).__AURA3D_PRODUCT_VIEWER__);
  expect(proof).toBeTruthy();
  expect(proof!.look.id).toBe("product-studio");
  expect(proof!.camera.mode).toBe("orbit");
  expect(proof!.camera.orbit).toBe(true);
  expect(proof!.camera.subjectHeightFraction).toEqual([0.45, 0.7]);
  expect(proof!.product.assetId).toBe("product");
  expect(proof!.product.url).toContain("/aura-assets/");
  expect(proof!.evidence.entry).toBe("@aura3d/engine");

  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({ ready: true, backend: diagnostics?.backend, drawCalls, proof }, null, 2)}\n`);
});
