import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const catalog = JSON.parse(readFileSync(resolve("examples/production-runtime-examples/catalog.json"), "utf8")) as {
  readonly examples: readonly {
    readonly slug: string;
    readonly title: string;
    readonly browserTested: boolean;
    readonly realAssets: readonly string[];
    readonly hdrEnvironment: string;
  }[];
};

test.describe("V6 real renderer examples", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const example of catalog.examples.filter((item) => item.browserTested)) {
    test(`renders ${example.slug} through the V6 public workflow API`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
      page.on("console", (message) => {
        if (message.type() === "error") pageErrors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
      });

      await page.goto(`${server.origin}/examples/production-runtime-examples/${example.slug}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => {
          const runtime = window.__a3dV6Example as { status?: string } | undefined;
          return runtime?.status === "ready" || runtime?.status === "error";
        },
        undefined,
        { timeout: 90_000 }
      );

      const runtime = await page.evaluate(() => window.__a3dV6Example) as {
        status: "ready" | "error";
        error?: string;
        appId: string;
        rendererBackend?: string;
        runtime?: {
          rendererBackend: string;
          assetIds: readonly string[];
          primaryAssetId: string;
          hdrEnvironmentId: string;
          drawCalls: number;
          triangleCount: number;
          materialCount: number;
          textureCount: number;
          textureMemoryEstimate: number;
          postprocessChain: readonly string[];
          frameTimeMs: number;
        };
        metadata?: { primitiveCount: number; materialCount: number; textureCount: number; hasPbr: boolean };
        proofSummary?: { pass: boolean; missing: readonly string[] };
        proof?: { diagnostics: { drawCalls: number; lastError: string | null }; pixels: { nonBlackPixels: number; uniqueColorBuckets: number } };
        webgpu?: { realHardwareRequiredForParity: boolean; doesNotBlockWebGL2Production: boolean };
      };

      expect(runtime.status, `${runtime.error ?? ""}\n${pageErrors.join("\n")}`).toBe("ready");
      expect(runtime.rendererBackend).toBe("webgl2");
      expect(runtime.runtime?.rendererBackend).toBe("webgl2");
      expect(runtime.runtime?.assetIds).toEqual(expect.arrayContaining(example.realAssets));
      expect(runtime.runtime?.primaryAssetId).toBeTruthy();
      expect(runtime.runtime?.hdrEnvironmentId).toBe(example.hdrEnvironment);
      expect(runtime.runtime?.drawCalls).toBeGreaterThan(0);
      expect(runtime.runtime?.triangleCount).toBeGreaterThan(0);
      expect(runtime.runtime?.materialCount).toBeGreaterThan(0);
      expect(runtime.metadata?.primitiveCount).toBeGreaterThan(0);
      expect(runtime.metadata?.materialCount).toBeGreaterThan(0);
      expect(runtime.metadata?.hasPbr).toBe(true);
      expect(runtime.proofSummary?.pass, runtime.proofSummary?.missing.join(", ")).toBe(true);
      expect(runtime.proof?.diagnostics.drawCalls).toBeGreaterThan(0);
      expect(runtime.proof?.diagnostics.lastError).toBeNull();
      expect(runtime.proof?.pixels.nonBlackPixels).toBeGreaterThan(1000);
      expect(runtime.proof?.pixels.uniqueColorBuckets).toBeGreaterThan(4);
      if (example.slug === "webgpu-product") {
        expect(runtime.webgpu?.realHardwareRequiredForParity).toBe(true);
        expect(runtime.webgpu?.doesNotBlockWebGL2Production).toBe(true);
      }

      await page.locator("#a3d-production-runtime-action").click();
      const interaction = await page.evaluate(() => window.__a3dV6Example) as { interactionCount: number; lastInteraction?: string };
      expect(interaction.interactionCount).toBeGreaterThan(0);
      expect(interaction.lastInteraction).toBe("Inspect");

      mkdirSync(resolve("tests/reports/production-runtime-examples"), { recursive: true });
      const screenshot = `tests/reports/production-runtime-examples/${example.slug}.png`;
      await page.locator("#viewport").screenshot({ path: screenshot });
      writeFileSync(resolve(`tests/reports/production-runtime-examples/${example.slug}.json`), `${JSON.stringify({
        schema: "a3d-production-runtime-example-runtime/v1",
        generatedAt: new Date().toISOString(),
        slug: example.slug,
        screenshot,
        runtime
      }, null, 2)}\n`);
    });
  }

  test("lists the V6 example catalog", async ({ page }) => {
    await page.goto(`${server.origin}/examples/production-runtime-examples/`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("article")).toHaveCount(catalog.examples.length);
  });
});
