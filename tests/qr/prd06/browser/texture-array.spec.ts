/**
 * PRD-06 T2.0 (E39) — `Texture` `dimension:"2d-array"` uploads via
 * texStorage3D + per-layer texSubImage3D and binds to `sampler2DArray`
 * (§18: WebKit included). The spec runs under every lane browser project.
 *
 * Layer colors: L0 red(200,10,10), L1 green(10,200,10), L2 blue(30,60,190);
 * then `texture.update(plane, {layer:2})` lands 250,220,40 on layer 2 only.
 */
import { expect, test } from "@playwright/test";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../../prd04/dev-server";

interface TextureArrayReport {
  status: "running" | "done" | "error";
  error?: string;
  layer2?: readonly number[];
  layer1?: readonly number[];
  layer2AfterUpdate?: readonly number[];
  layer0AfterUpdate?: readonly number[];
}

test.describe("prd06 texture 2d-array upload", () => {
  let server: ExampleDevServer | undefined;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("sampler2DArray texelFetch reads layer 2 back; update {layer:2} writes layer 2 only", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(`${server!.origin}/tests/qr/prd06/browser/texture-array-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as { __PRD06_TEXTURE_ARRAY__?: TextureArrayReport }).__PRD06_TEXTURE_ARRAY__?.status !== "running",
      undefined,
      { timeout: 60_000 }
    );
    const report = await page.evaluate(() => (window as unknown as { __PRD06_TEXTURE_ARRAY__?: TextureArrayReport }).__PRD06_TEXTURE_ARRAY__);
    expect(report?.status, report?.error).toBe("done");

    // Initial upload: texelFetch(..., layer=2) reads back layer 2's color.
    expect(report!.layer2!.slice(0, 3)).toEqual([30, 60, 190]);
    expect(report!.layer1!.slice(0, 3)).toEqual([10, 200, 10]);

    // Per-layer update {layer:2}: layer 2 takes the new color, layer 0 keeps red.
    expect(report!.layer2AfterUpdate!.slice(0, 3)).toEqual([250, 220, 40]);
    expect(report!.layer0AfterUpdate!.slice(0, 3)).toEqual([200, 10, 10]);

    expect(pageErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });
});
