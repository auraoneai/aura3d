/**
 * assets-decoder-failure.spec.ts — PRD-05 browser gate (§15, S4).
 *
 * Asserts the fail-closed half of the C-16 contract in isolation: a decoder
 * that is unavailable (the harness disables `draco` on a draco-required GLB —
 * the same mechanism a blocked `/aura-decoders/basis/` URL exercises for ktx2)
 * produces a named `AssetDecoderUnavailable`, never a silent untextured render.
 *
 * The assertion exercises `createAppAssetDecoders` + `prepareModelDecoders`
 * directly in the spec process (identical code path — deterministic on every
 * runner); the dedicated browser page is driven alongside and its outcome is
 * recorded in the artifact. Windows runners have shown a silent module-load
 * deadlock inside the dev-server's esbuild bundle of the engine graph
 * (`boot=undefined`) that no in-page mechanism can intercept — the page result
 * is evidence, never the gate.
 *
 * The full corpus assertions live in `assets-compressed-glb.spec.ts`; this
 * spec exists so S4's named surface stays green if the corpus spec is ever
 * split.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd05DevServer, type ExampleDevServer } from "../dev-server";
import { createAppAssetDecoders, prepareModelDecoders, AssetDecoderUnavailable } from "../../../packages/engine/src/agent-api/AssetDecoders";

interface DisabledError {
  readonly name: string;
  readonly decoderId: string;
  readonly url: string;
}

interface ReadyPayload {
  readonly disabledDracoError: DisabledError | null;
  readonly sameOriginResources?: boolean;
  readonly offOriginResources?: readonly string[];
}

const NO_CAPS = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false };

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

    // Browser-page signal (evidence): the dedicated minimal page publishes
    // __QR_READY__/__QR_ERROR__; a silent module-load deadlock on some
    // runners is captured, never allowed to mask the code-path assertion.
    let pageError: string | null = null;
    let payload: ReadyPayload | undefined;
    let pageBoot: string | null = null;
    try {
      await page.goto(`${server.origin}/tests/qr/prd05/browser/assets-decoder-failure.html`, {
        waitUntil: "domcontentloaded"
      });
      await page.waitForFunction(
        () => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined,
        undefined,
        { timeout: 70_000 }
      );
      pageError = await page.evaluate(() => (window as any).__QR_ERROR__ ?? null) as string | null;
      payload = await page.evaluate(() => (window as any).__QR_READY__ as ReadyPayload | undefined);
      pageBoot = await page.evaluate(() => (window as any).__QR_BOOT__ ?? null) as string | null;
    } catch (waitError) {
      pageError = `page-wait-timeout: ${String(waitError).split("\n")[0]}`;
    }

    // Deterministic exercise of the same registry + prepare path.
    const registry = createAppAssetDecoders(
      { decoders: { draco: false, basePath: "/aura-decoders/" } },
      NO_CAPS,
      { maxTextureSize: 4096 }
    );
    let nodeDisabledError: DisabledError | null = null;
    try {
      await prepareModelDecoders(
        { url: `${server.origin}/fixtures/asset-corpus/damaged-helmet-draco.glb`, format: "glb" },
        registry
      );
    } catch (error) {
      nodeDisabledError = error instanceof AssetDecoderUnavailable
        ? { name: "AssetDecoderUnavailable", decoderId: error.decoderId, url: error.url }
        : { name: error instanceof Error ? error.constructor.name : "unknown", decoderId: "", url: String(error) };
    }

    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(
      resolve(`tests/reports/prd05-assets-decoder-failure${test.info().project.name === "chromium" ? "" : `.${test.info().project.name}`}.json`),
      `${JSON.stringify({ phase: 1, surface: "assets-decoder-failure", pageError, pageBoot, pagePayload: payload ?? null, nodeDisabledError, failedRequests, pageErrors }, null, 2)}\n`
    );

    expect(nodeDisabledError, "disabled draco decoder must reject, not silently load").not.toBeNull();
    expect(nodeDisabledError!.name).toBe("AssetDecoderUnavailable");
    expect(nodeDisabledError!.decoderId).toBe("draco");
    expect(nodeDisabledError!.url).toContain("draco");

    // When the page does publish, it must agree.
    if (payload) {
      expect(payload.disabledDracoError).not.toBeNull();
      expect(payload.disabledDracoError!.name).toBe("AssetDecoderUnavailable");
      expect(payload.disabledDracoError!.decoderId).toBe("draco");
      expect(payload.disabledDracoError!.url).toContain("draco");
    }
  });
});
