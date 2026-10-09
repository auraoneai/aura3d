/**
 * assets-decoder-failure.spec.ts — PRD-05 browser gate (§15, S4).
 *
 * Drives the compressed-GLB harness page and asserts the fail-closed half of
 * the C-16 contract in isolation: a decoder that is unavailable (the harness
 * disables `draco` on a draco-required GLB — the same mechanism a blocked
 * `/aura-decoders/basis/` URL exercises for ktx2) produces a named
 * `AssetDecoderUnavailable`, never a silent untextured render.
 *
 * The full corpus assertions live in `assets-compressed-glb.spec.ts`; this
 * spec exists so S4's named surface stays green if the corpus spec is ever
 * split. macos-14 CI only.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd05DevServer, type ExampleDevServer } from "../dev-server";

interface ReadyPayload {
  readonly disabledDracoError: { readonly name: string; readonly decoderId: string; readonly url: string } | null;
  readonly variants: readonly { readonly variant: string; readonly meshCount: number }[];
}

test.describe("PRD-05 decoder failure is fail-closed (P1/S4)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startPrd05DevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("unavailable decoder produces AssetDecoderUnavailable, not a silent render", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd05/browser/assets-decoder-failure.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
      undefined,
      { timeout: 180_000 }
    );
    const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
    const payload = await page.evaluate(() => (window as any).__QR_READY__ as ReadyPayload | undefined);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve(`tests/reports/prd05-assets-decoder-failure${test.info().project.name === "chromium" ? "" : `.${test.info().project.name}`}.json`),
      `${JSON.stringify({ phase: 1, surface: "assets-decoder-failure", error, ...payload }, null, 2)}\n`
    );
    expect(error, "harness error").toBeNull();
    expect(payload).toBeTruthy();

    expect(payload!.disabledDracoError).not.toBeNull();
    expect(payload!.disabledDracoError!.name).toBe("AssetDecoderUnavailable");
    expect(payload!.disabledDracoError!.decoderId).toBe("draco");
    expect(payload!.disabledDracoError!.url).toContain("draco");
  });
});
