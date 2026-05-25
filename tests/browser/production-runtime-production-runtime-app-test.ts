import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

export interface V6V6AppTestConfig {
  readonly appId: string;
  readonly path: string;
}

export function runV6V6AppTest(config: V6V6AppTestConfig): void {
  test.describe(`V6 ${config.appId}`, () => {
    test.setTimeout(90_000);

    let server: ExampleDevServer;

    test.beforeAll(async () => {
      server = await startExampleDevServer();
    });

    test.afterAll(async () => {
      await server.close();
    });

    test("renders a real imported asset and exposes production runtime metrics", async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
      page.on("console", (message) => {
        if (message.type() === "error") pageErrors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
      });

      await page.setViewportSize({ width: 1536, height: 1120 });
      await page.goto(`${server.origin}${config.path}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(
          () => {
            const runtime = window.__g3dV6Runtime as { status?: string } | undefined;
            return runtime?.status === "ready" || runtime?.status === "error";
          },
          undefined,
          { timeout: 60_000 }
        );
      } catch (error) {
        throw new Error(`${config.appId} did not report ready/error. Page errors:\n${pageErrors.join("\n") || "(none captured)"}`, { cause: error });
      }

      const beforeClick = await page.evaluate(() => window.__g3dV6Runtime) as {
        status: "ready" | "error";
        error?: string;
        appId: string;
        sceneId: string;
        rendererBackend?: string;
        interactionCount: number;
        runtime?: {
          appId: string;
          sceneId: string;
          rendererBackend: string;
          assetIds: readonly string[];
          primaryAssetId: string;
          hdrEnvironmentId: string;
          drawCalls: number;
          triangleCount: number;
          materialCount: number;
          textureCount: number;
          textureMemoryEstimate: number;
          lightCount: number;
          shadowMapCount: number;
          postprocessChain: readonly string[];
          frameTimeMs: number;
          screenshotPath: string;
        };
        metadata?: {
          primitiveCount: number;
          materialCount: number;
          textureCount: number;
          hasPbr: boolean;
          hasAnimation: boolean;
          hasSkinning: boolean;
          hasMorphTargets: boolean;
        };
        proofSummary?: { pass: boolean; missing: readonly string[] };
        proof?: { diagnostics: { drawCalls: number; lastError: string | null }; pixels: { nonBlackPixels: number; uniqueColorBuckets: number } };
        webgpu?: { status: string; realHardwareRequiredForParity: boolean; doesNotBlockWebGL2Production: boolean };
      };

      expect(beforeClick.status, beforeClick.error).toBe("ready");
      expect(beforeClick.appId).toBe(config.appId);
      expect(beforeClick.rendererBackend).toBe("webgl2");
      expect(beforeClick.runtime?.appId).toBe(config.appId);
      expect(beforeClick.runtime?.rendererBackend).toBe("webgl2");
      expect(beforeClick.runtime?.assetIds.length).toBeGreaterThanOrEqual(1);
      expect(beforeClick.runtime?.primaryAssetId).toBeTruthy();
      expect(beforeClick.runtime?.hdrEnvironmentId).toBeTruthy();
      expect(beforeClick.runtime?.drawCalls).toBeGreaterThan(0);
      expect(beforeClick.runtime?.triangleCount).toBeGreaterThan(0);
      expect(beforeClick.runtime?.materialCount).toBeGreaterThan(0);
      expect(beforeClick.runtime?.textureMemoryEstimate).toBeGreaterThanOrEqual(0);
      expect(beforeClick.runtime?.lightCount).toBeGreaterThan(0);
      expect(beforeClick.runtime?.shadowMapCount).toBeGreaterThanOrEqual(0);
      expect(beforeClick.runtime?.postprocessChain.length).toBeGreaterThanOrEqual(0);
      expect(beforeClick.runtime?.frameTimeMs).toBeGreaterThanOrEqual(0);
      expect(beforeClick.metadata?.primitiveCount).toBeGreaterThan(0);
      expect(beforeClick.metadata?.materialCount).toBeGreaterThan(0);
      expect(beforeClick.metadata?.hasPbr).toBe(true);
      expect(beforeClick.proofSummary?.pass, beforeClick.proofSummary?.missing.join(", ")).toBe(true);
      expect(beforeClick.proof?.diagnostics.drawCalls).toBeGreaterThan(0);
      expect(beforeClick.proof?.diagnostics.lastError).toBeNull();
      expect(beforeClick.proof?.pixels.nonBlackPixels).toBeGreaterThan(1000);
      expect(beforeClick.proof?.pixels.uniqueColorBuckets).toBeGreaterThan(4);
      if (config.appId === "webgpu-lab") {
        expect(beforeClick.webgpu?.realHardwareRequiredForParity).toBe(true);
        expect(beforeClick.webgpu?.doesNotBlockWebGL2Production).toBe(true);
      }

      await page.locator("#primary-action").click();
      const afterClick = await page.evaluate(() => window.__g3dV6Runtime) as { interactionCount: number; lastInteraction?: string };
      expect(afterClick.interactionCount).toBeGreaterThan(beforeClick.interactionCount);
      expect(afterClick.lastInteraction).toBeTruthy();

      mkdirSync(resolve("tests/reports/production-runtime-app-suite"), { recursive: true });
      const screenshotPath = `tests/reports/production-runtime-app-suite/${config.appId}.png`;
      await page.locator("#viewport").screenshot({ path: screenshotPath });
      writeFileSync(resolve(`tests/reports/production-runtime-app-suite/${config.appId}.json`), `${JSON.stringify({
        schema: "g3d-production-runtime-app-runtime/v1",
        generatedAt: new Date().toISOString(),
        appId: config.appId,
        screenshot: screenshotPath,
        runtime: await page.evaluate(() => window.__g3dV6Runtime)
      }, null, 2)}\n`);
    });
  });
}
