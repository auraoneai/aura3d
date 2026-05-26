import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("V6 WebGPU report", () => {
  test.setTimeout(30_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("reports real browser WebGPU availability or explicit hardware-unavailable status", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/production-runtime-webgl2-real-renderer.html`, { waitUntil: "domcontentloaded" });
    const report = await page.evaluate(async () => {
      const module = await import("/packages/rendering/src/production-runtime/index.js");
      return module.createV6WebGPUReport(navigator.gpu);
    }) as {
      schema: string;
      status: "available" | "unavailable" | "blocked";
      canCreateDevice: boolean;
      realHardwareRequiredForParity: boolean;
      doesNotBlockWebGL2Production: boolean;
      warnings: readonly string[];
    };
    expect(report.schema).toBe("a3d-production-runtime-webgpu-report/v1");
    expect(["available", "unavailable", "blocked"]).toContain(report.status);
    expect(report.realHardwareRequiredForParity).toBe(true);
    expect(report.doesNotBlockWebGL2Production).toBe(true);
    if (report.status === "available") {
      expect(report.canCreateDevice).toBe(true);
    } else {
      expect(report.canCreateDevice).toBe(false);
      expect(report.warnings.length).toBeGreaterThan(0);
    }
    const reportPath = "tests/reports/production-runtime-webgpu-browser-report.json";
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      ...report
    }, null, 2)}\n`);

    const readiness = await page.evaluate(async () => {
      const module = await import("/packages/rendering/src/production-runtime/index.js");
      return module.createV7WebGPUReadinessReport(navigator.gpu);
    }) as {
      schema: string;
      productionBackend: "webgpu-production-sdk-path";
      primaryRendererClaim: true;
      safetyChecks: readonly { id: string; status: "ready" | "missing" | "blocked"; evidence: string }[];
      requiredForCompletion: readonly { id: string; status: "ready" | "missing" | "blocked"; evidence: string }[];
      blockers: readonly string[];
    };
    expect(readiness.schema).toBe("a3d-v7-webgpu-readiness/v1");
    expect(readiness.productionBackend).toBe("webgpu-production-sdk-path");
    expect(readiness.primaryRendererClaim).toBe(true);
    expect(readiness.safetyChecks.find((item) => item.id === "renderer-production-runtime-webgpu-uses-production-webgpu-path")?.status).toBe("ready");
    expect(readiness.safetyChecks.find((item) => item.id === "sdk-webgpu-exposes-async-production-render")?.status).toBe("ready");
    expect(readiness.requiredForCompletion.find((item) => item.id === "low-level-gltf-hdr-pbr-webgpu-imported-asset")?.status).toBe("ready");
    expect(readiness.requiredForCompletion.find((item) => item.id === "gltf-hdr-pbr-webgpu-product-viewer")?.status).toBe("ready");
    expect(readiness.requiredForCompletion.find((item) => item.id === "webgpu-threejs-visual-delta")?.status).toBe("ready");
    expect(readiness.requiredForCompletion.find((item) => item.id === "webgpu-sdk-production-backend")?.status).toBe("ready");
    if (report.status === "available") {
      expect(readiness.requiredForCompletion.find((item) => item.id === "real-browser-webgpu-device")?.status).toBe("ready");
      expect(readiness.blockers).toEqual([]);
    } else {
      expect(readiness.requiredForCompletion.find((item) => item.id === "real-browser-webgpu-device")?.status).toBe("blocked");
      expect(readiness.blockers.length).toBeGreaterThanOrEqual(1);
    }
    const readinessPath = "tests/reports/runtime-parity/webgpu-readiness.json";
    mkdirSync(dirname(resolve(readinessPath)), { recursive: true });
    writeFileSync(resolve(readinessPath), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      ...readiness
    }, null, 2)}\n`);
  });
});
