/**
 * assets-decoder-failure.spec.ts — PRD-05 browser gate (§15, S4).
 *
 * Asserts the fail-closed half of the C-16 contract in isolation: a decoder
 * fetch that is unavailable (the page uses a blocked `/aura-decoders-blocked/`
 * basePath — the same mechanism a missing `/aura-decoders/draco/` exercises in
 * production) produces a named `AssetDecoderUnavailable`, never a silent
 * untextured render.
 *
 * Drives the dedicated `assets-decoder-failure` page — imports assets-package
 * source only so the dev-server esbuild bundle stays small on every runner
 * (the engine-graph bundle silently deadlocked on windows-latest).
 *
 * The full corpus assertions live in `assets-compressed-glb.spec.ts`; this
 * spec exists so S4's named surface stays green if the corpus spec is ever
 * split.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd05DevServer, type ExampleDevServer } from "../dev-server";

interface ReadyPayload {
  readonly disabledDracoError: { readonly name: string; readonly decoderId: string; readonly url: string } | null;
  readonly sameOriginResources?: boolean;
  readonly offOriginResources?: readonly string[];
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
    const failedRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("response", (r) => { if (!r.ok()) failedRequests.push(`${r.status()} ${r.url()}`); });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(`${server.origin}/tests/qr/prd05/browser/assets-decoder-failure.html`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
      undefined,
      { timeout: 120_000 }
    );
    const error = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null);
    const payload = await page.evaluate(() => (window as any).__QR_READY__ as ReadyPayload | undefined);
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve(`tests/reports/prd05-assets-decoder-failure${test.info().project.name === "chromium" ? "" : `.${test.info().project.name}`}.json`),
      `${JSON.stringify({ phase: 1, surface: "assets-decoder-failure", error, failedRequests, pageErrors, ...payload }, null, 2)}\n`
    );
    expect(error, "harness error").toBeNull();
    expect(payload).toBeTruthy();

    expect(payload!.disabledDracoError).not.toBeNull();
    expect(payload!.disabledDracoError!.name).toBe("AssetDecoderUnavailable");
    expect(payload!.disabledDracoError!.decoderId).toBe("draco");
    expect(payload!.disabledDracoError!.url).toContain("draco");
  });
});
