import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const templates = [
  "v6-product-configurator",
  "v6-asset-inspector",
  "v6-material-studio",
  "v6-architecture-viewer",
  "v6-webgpu-starter"
] as const;

test.describe("V6 V6 templates", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const template of templates) {
    test(`renders template ${template}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });

      await page.goto(`${server.origin}/templates/${template}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => {
          const runtime = window.__g3dV6Example as { status?: string } | undefined;
          return runtime?.status === "ready" || runtime?.status === "error";
        },
        undefined,
        { timeout: 90_000 }
      );
      const runtime = await page.evaluate(() => window.__g3dV6Example) as {
        status: "ready" | "error";
        error?: string;
        rendererBackend?: string;
        runtime?: { drawCalls: number; triangleCount: number; hdrEnvironmentId: string; assetIds: readonly string[] };
        proofSummary?: { pass: boolean; missing: readonly string[] };
        proof?: { pixels: { nonBlackPixels: number; uniqueColorBuckets: number } };
      };

      expect(runtime.status, `${runtime.error ?? ""}\n${errors.join("\n")}`).toBe("ready");
      expect(runtime.rendererBackend).toBe("webgl2");
      expect(runtime.runtime?.drawCalls).toBeGreaterThan(0);
      expect(runtime.runtime?.triangleCount).toBeGreaterThan(0);
      expect(runtime.runtime?.hdrEnvironmentId).toBeTruthy();
      expect(runtime.runtime?.assetIds.length).toBeGreaterThan(0);
      expect(runtime.proofSummary?.pass, runtime.proofSummary?.missing.join(", ")).toBe(true);
      expect(runtime.proof?.pixels.nonBlackPixels).toBeGreaterThan(1000);
      expect(runtime.proof?.pixels.uniqueColorBuckets).toBeGreaterThan(4);

      mkdirSync(resolve("tests/reports/v6-templates"), { recursive: true });
      const screenshot = `tests/reports/v6-templates/${template}.png`;
      await page.locator("#viewport").screenshot({ path: screenshot });
      writeFileSync(resolve(`tests/reports/v6-templates/${template}.json`), `${JSON.stringify({
        schema: "g3d-v6-template-runtime/v1",
        generatedAt: new Date().toISOString(),
        template,
        screenshot,
        runtime
      }, null, 2)}\n`);
    });
  }
});
