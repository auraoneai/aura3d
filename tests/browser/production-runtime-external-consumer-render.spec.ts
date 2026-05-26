import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 external consumer render", () => {
  test.setTimeout(90_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders the built external Vite consumer from the packed package", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${server.origin}/tests/reports/production-runtime-external-consumer-preview/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const runtime = window.__a3dV6Example as { status?: string } | undefined;
        return runtime?.status === "ready" || runtime?.status === "error";
      },
      undefined,
      { timeout: 60_000 }
    );
    const runtime = await page.evaluate(() => window.__a3dV6Example) as {
      status: "ready" | "error";
      error?: string;
      rendererBackend?: string;
      runtime?: { drawCalls: number; textureMemoryEstimate: number; assetIds: readonly string[]; hdrEnvironmentId: string };
      proofSummary?: { pass: boolean; missing: readonly string[] };
      proof?: { pixels: { nonBlackPixels: number; uniqueColorBuckets: number } };
    };

    expect(runtime.status, `${runtime.error ?? ""}\n${errors.join("\n")}`).toBe("ready");
    expect(runtime.rendererBackend).toBe("webgl2");
    expect(runtime.runtime?.assetIds).toContain("damaged-helmet");
    expect(runtime.runtime?.hdrEnvironmentId).toBe("studio-small-08");
    expect(runtime.runtime?.drawCalls).toBeGreaterThan(0);
    expect(runtime.runtime?.textureMemoryEstimate).toBeGreaterThan(0);
    expect(runtime.proofSummary?.pass, runtime.proofSummary?.missing.join(", ")).toBe(true);
    expect(runtime.proof?.pixels.nonBlackPixels).toBeGreaterThan(1000);
    expect(runtime.proof?.pixels.uniqueColorBuckets).toBeGreaterThan(4);

    mkdirSync(resolve("tests/reports/production-runtime-external-consumer"), { recursive: true });
    const screenshot = "tests/reports/production-runtime-external-consumer/external-consumer-render.png";
    await page.locator("#viewport").screenshot({ path: screenshot });
    writeFileSync(resolve("tests/reports/production-runtime-external-consumer-render.json"), `${JSON.stringify({
      schema: "a3d-production-runtime-external-consumer-render/v1",
      generatedAt: new Date().toISOString(),
      pass: true,
      screenshot,
      runtime
    }, null, 2)}\n`);
  });
});
