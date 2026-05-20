import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

test.describe("workspace Vite package resolution", () => {
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
    if (!address || typeof address === "string") {
      throw new Error("Vite workspace import smoke server did not bind a TCP port.");
    }
    origin = `http://127.0.0.1:${address.port}`;
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("resolves direct @galileo3d workspace package imports from Vite without example coupling", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" && text !== "Failed to load resource: the server responded with a status of 404 (Not Found)") errors.push(text);
    });

    await page.goto(`${origin}/tests/browser/fixtures/workspace-vite-imports/index.html`, { waitUntil: "domcontentloaded" });
    await expect.poll(
      () => page.evaluate(() => window.__GALILEO3D_WORKSPACE_VITE_IMPORT_SMOKE__?.ok),
      { timeout: 30_000 }
    ).toBe(true);
    const smoke = await page.evaluate(() => window.__GALILEO3D_WORKSPACE_VITE_IMPORT_SMOKE__);

    expect(errors).toEqual([]);
    expect(smoke?.imports.every((entry) => entry === "function")).toBe(true);
    expect(smoke?.cubeVertices ?? 0).toBeGreaterThan(0);
    expect(smoke?.material).toBe("workspace-vite-pbr");
    expect(smoke?.environmentPreset).toBe("studio");
  });
});
