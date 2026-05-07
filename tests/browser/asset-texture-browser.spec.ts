import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("asset texture browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("loads an image through TextureLoader, uploads it to WebGL2, displays textured pixels, and renders glTF texture and instancing bindings", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/asset-texture-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_ASSET_TEXTURE_BROWSER_TEST__?.status === "ready" || window.__GALILEO3D_ASSET_TEXTURE_BROWSER_TEST__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_ASSET_TEXTURE_BROWSER_TEST__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.textureSize).toEqual([2, 2]);
    const [r = 0, g = 0, b = 0, a = 0] = result?.pixel ?? [];
    expect(r).toBeGreaterThan(180);
    expect(g).toBeGreaterThan(20);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(60);
    expect(a).toBe(255);

    expect(result?.gltfRenderTextureSize).toEqual([1, 1]);
    expect(result?.gltfRenderDiagnostics?.drawCalls).toBe(1);
    const [gr = 0, gg = 0, gb = 0, ga = 0] = result?.gltfRenderPixel ?? [];
    expect(gr).toBeGreaterThan(10);
    expect(gr).toBeLessThan(140);
    expect(gg).toBeGreaterThan(160);
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);
    expect(gb).toBeGreaterThan(30);
    expect(gb).toBeLessThan(100);
    expect(ga).toBe(255);

    expect(result?.gltfInstancedDiagnostics?.drawCalls).toBe(1);
    const [ilr = 0, ilg = 0, ilb = 0, ila = 0] = result?.gltfInstancedLeftPixel ?? [];
    const [irr = 0, irg = 0, irb = 0, ira = 0] = result?.gltfInstancedRightPixel ?? [];
    for (const [r, g, b, a] of [[ilr, ilg, ilb, ila], [irr, irg, irb, ira]]) {
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(80);
      expect(g).toBeGreaterThan(120);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
      expect(b).toBeGreaterThan(10);
      expect(b).toBeLessThan(90);
      expect(a).toBe(255);
    }
  });
});

declare global {
  interface Window {
    __GALILEO3D_ASSET_TEXTURE_BROWSER_TEST__?: {
      readonly status: "ready" | "error";
      readonly textureSize?: readonly [number, number];
      readonly pixel?: readonly number[];
      readonly gltfRenderTextureSize?: readonly [number, number];
      readonly gltfRenderPixel?: readonly number[];
      readonly gltfRenderDiagnostics?: { readonly drawCalls: number };
      readonly gltfInstancedDiagnostics?: { readonly drawCalls: number };
      readonly gltfInstancedLeftPixel?: readonly number[];
      readonly gltfInstancedRightPixel?: readonly number[];
      readonly error?: string;
    };
  }
}
