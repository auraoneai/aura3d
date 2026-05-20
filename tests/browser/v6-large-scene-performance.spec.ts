import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 large scene performance", () => {
  test.setTimeout(90_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders a large instanced WebGL2 scene with culling and memory metrics", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${server.origin}/tests/browser/v6-large-scene-performance.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const report = window.__g3dV6Performance as { status?: string } | undefined;
        return report?.status === "ready" || report?.status === "error";
      },
      undefined,
      { timeout: 60_000 }
    );
    const report = await page.evaluate(() => window.__g3dV6Performance) as {
      status: "ready" | "error";
      error?: string;
      realWebGL2: boolean;
      frameMs: number;
      readyMs: number;
      drawCalls: number;
      textureBytes: number;
      candidateInstances: number;
      renderedInstances: number;
      culledInstances: number;
      instancedBatches: number;
      nonBlackPixels: number;
      uniqueColorBuckets: number;
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    };

    expect(report.status, `${report.error ?? ""}\n${errors.join("\n")}`).toBe("ready");
    expect(report.realWebGL2).toBe(true);
    expect(report.frameMs).toBeGreaterThanOrEqual(0);
    expect(report.frameMs).toBeLessThan(250);
    expect(report.readyMs).toBeLessThan(10_000);
    expect(report.drawCalls).toBeGreaterThanOrEqual(report.instancedBatches);
    expect(report.textureBytes).toBeGreaterThan(0);
    expect(report.candidateInstances).toBeGreaterThan(report.renderedInstances);
    expect(report.renderedInstances).toBeGreaterThanOrEqual(2048);
    expect(report.culledInstances).toBeGreaterThan(0);
    expect(report.nonBlackPixels).toBeGreaterThan(1000);
    expect(report.uniqueColorBuckets).toBeGreaterThan(4);

    mkdirSync(resolve("tests/reports/v6-performance"), { recursive: true });
    await page.locator("#viewport").screenshot({ path: "tests/reports/v6-performance/large-scene-performance.png" });
    writeFileSync(resolve("tests/reports/v6-large-scene-performance.json"), `${JSON.stringify({
      schema: "g3d-v6-large-scene-performance/v1",
      generatedAt: new Date().toISOString(),
      pass: true,
      report
    }, null, 2)}\n`);
  });
});
