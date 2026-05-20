import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

declare global {
  interface Window {
    __G3D_V9_PUBLIC_SCENE__?: {
      readonly running: boolean;
      readonly disposed?: boolean;
      readonly width: number;
      readonly height: number;
      readonly visibleObjects: number;
      readonly drawCalls: number;
      readonly buffers?: number;
      readonly shaders?: number;
      readonly textures?: number;
      readonly renderTargets?: number;
      readonly approximateGpuMemoryBytes?: number;
      readonly lifecycle?: {
        readonly disposed: boolean;
        readonly animationFrames: number;
        readonly eventListeners: number;
        readonly disposables: number;
        readonly disposeCalls: number;
      };
    };
  }
}

test.describe("V9 v9 public scene route", () => {
  let server: ViteDevServer;
  let origin: string;

  test.beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      configFile: resolve(process.cwd(), "vite.config.ts"),
      logLevel: "silent",
      server: {
        host: "127.0.0.1",
        strictPort: false
      }
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("V9 public scene smoke server did not bind a TCP port.");
    origin = `http://127.0.0.1:${address.port}`;
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders visible pixels through @galileo3d/engine/v9 public APIs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" && text !== "Failed to load resource: the server responded with a status of 404 (Not Found)") errors.push(text);
    });

    await page.goto(`${origin}/apps/v9-public-scene/`, { waitUntil: "domcontentloaded" });
    await expect.poll(
      () => page.evaluate(() => window.__G3D_V9_PUBLIC_SCENE__?.running),
      { timeout: 20_000 }
    ).toBe(true);

    const metrics = await page.evaluate(() => window.__G3D_V9_PUBLIC_SCENE__);
    const nonBackgroundPixels = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");
      if (!canvas || !gl) return 0;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i]! - 18) > 10 || Math.abs(pixels[i + 1]! - 20) > 10 || Math.abs(pixels[i + 2]! - 26) > 10) count += 1;
      }
      return count;
    });

    expect(errors).toEqual([]);
    expect(metrics?.visibleObjects).toBe(3);
    expect(metrics?.drawCalls).toBe(3);
    expect(nonBackgroundPixels).toBeGreaterThan(2_000);
  });

  test("disposes renderer, scene resources, listeners, and animation frames on route teardown", async ({ page }) => {
    await page.goto(`${origin}/apps/v9-public-scene/`, { waitUntil: "domcontentloaded" });
    await expect.poll(
      () => page.evaluate(() => window.__G3D_V9_PUBLIC_SCENE__?.running),
      { timeout: 20_000 }
    ).toBe(true);

    await page.evaluate(() => window.dispatchEvent(new Event("g3d:v9-public-scene-dispose")));
    const disposed = await page.evaluate(() => window.__G3D_V9_PUBLIC_SCENE__);

    expect(disposed?.running).toBe(false);
    expect(disposed?.disposed).toBe(true);
    expect(disposed?.buffers).toBe(0);
    expect(disposed?.shaders).toBe(0);
    expect(disposed?.textures).toBe(0);
    expect(disposed?.renderTargets).toBe(0);
    expect(disposed?.approximateGpuMemoryBytes).toBe(0);
    expect(disposed?.lifecycle).toMatchObject({
      disposed: true,
      animationFrames: 0,
      eventListeners: 0,
      disposables: 0
    });
  });
});
