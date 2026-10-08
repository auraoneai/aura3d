/**
 * PRD-06 T2.4 (unified skinned PBR) — CesiumMan's skinned mesh in bind pose
 * renders through a generated lit PBR program carrying the `prd06.deform`
 * contribution (`skin4` — the per-item select key, stamped by the harness
 * until the forward consumer wires it, Q-01-4) and must be pixel-identical to
 * the same mesh drawn as a static PBR item: ΔE2000 ≤ 2 on ≥99% of covered
 * pixels. Runs on every lane browser project (chromium/webkit/firefox).
 */
import { expect, test } from "@playwright/test";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../../prd04/dev-server";

interface SkinPbrReport {
  status: "running" | "done" | "error";
  error?: string;
  deformKey?: string;
  staticKey?: string;
  deformReady?: boolean;
  staticReady?: boolean;
  boneTextureActive?: boolean;
  missingUniforms?: readonly string[];
  coveredPixels?: number;
  comparedPixels?: number;
  passRate?: number;
  maxDeltaE?: number;
  identicalRedraw?: boolean;
}

test.describe("prd06 unified skinned PBR (T2.4)", () => {
  let server: ExampleDevServer | undefined;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("bind-pose skinned PBR equals static PBR within ΔE2000 ≤ 2 on 99% of pixels", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(`${server!.origin}/tests/qr/prd06/browser/skinned-pbr-parity-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const r = (window as unknown as { __PRD06_SKINNED_PBR_PARITY__?: SkinPbrReport }).__PRD06_SKINNED_PBR_PARITY__;
        return r !== undefined && r.status !== "running";
      },
      undefined,
      { timeout: 60_000 }
    );
    const report = await page.evaluate(() => (window as unknown as { __PRD06_SKINNED_PBR_PARITY__?: SkinPbrReport }).__PRD06_SKINNED_PBR_PARITY__);
    expect(report?.status, report?.error).toBe("done");

    // Both programs compiled: the deform draw acquired a `prd06.deform`-stamped
    // generated program that declares the bone-texture palette path.
    expect(report!.deformReady).toBe(true);
    expect(report!.staticReady).toBe(true);
    expect(report!.deformKey).not.toBe(report!.staticKey);
    expect(report!.boneTextureActive).toBe(true);
    expect(report!.missingUniforms ?? []).toEqual([]);

    // Determinism control: the same static draw twice is byte-identical, so
    // any ΔE spread is the deform splice, not nondeterminism.
    expect(report!.identicalRedraw).toBe(true);

    // The mesh actually covered the canvas…
    expect(report!.coveredPixels).toBeGreaterThan(2000);
    // …and ≥99% of covered pixels match within ΔE2000 2 (spec bar).
    expect(report!.passRate).toBeGreaterThanOrEqual(0.99);

    expect(pageErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });
});
