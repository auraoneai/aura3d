import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { expectWebGPURouteSettles, WEBGPU_ROOT_ROUTES } from "./webgpu-route-helpers";

interface NativeRouteRuntime {
  readonly appId: string;
  readonly status: string;
  readonly backend: string;
  readonly selectedBackend: string;
  readonly adapterName: string;
  readonly drawCalls: number;
  readonly frameCount: number;
  readonly nativeSubmissions: number;
  readonly nativeTextureBindings: number;
  readonly nativePbrSubmissions: number;
  readonly readbackMode?: string;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
}

test.describe("native WebGPU public evidence routes", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("all WebGPU-labelled routes use native WebGPU or fail the gate", async ({ page }, testInfo) => {
    const results: Array<NativeRouteRuntime & { readonly route: string; readonly screenshotBytes: number; readonly screenshotSha256: string }> = [];
    for (const route of WEBGPU_ROOT_ROUTES) {
      await expectWebGPURouteSettles(page, server.origin, route, testInfo);
      const runtime = await page.evaluate(() => (window as unknown as { __a3dWowRuntime?: unknown }).__a3dWowRuntime) as NativeRouteRuntime | undefined;
      expect(runtime, `${route} must publish backend evidence`).toBeTruthy();
      expect(runtime?.status, `${route} cannot pass as unsupported on the retained native-hardware run`).not.toBe("unsupported");
      expect(runtime?.backend).toBe("a3d-webgpu");
      expect(runtime?.selectedBackend).toBe("webgpu");
      expect(runtime?.adapterName).toBeTruthy();
      expect(runtime?.drawCalls ?? 0).toBeGreaterThan(0);
      expect(runtime?.frameCount ?? 0).toBeGreaterThan(0);
      expect(runtime?.nativeSubmissions ?? 0).toBeGreaterThan(0);
      const screenshot = await page.locator("canvas#viewport").screenshot();
      expect(screenshot.byteLength).toBeGreaterThan(1_000);
      results.push({
        ...runtime!,
        route,
        screenshotBytes: screenshot.byteLength,
        screenshotSha256: createHash("sha256").update(screenshot).digest("hex")
      });
    }

    const pbrRoutes = results.filter((entry) => entry.route.includes("pbr-asset") || entry.route.includes("product-viewer"));
    expect(pbrRoutes).toHaveLength(2);
    expect(pbrRoutes.every((entry) => entry.nativeTextureBindings > 0 && entry.nativePbrSubmissions > 0)).toBe(true);
    const renderTarget = results.find((entry) => entry.route.includes("render-target"));
    expect(renderTarget?.readbackMode).toMatch(/native|texture-to-buffer|readback/i);
    const compute = results.find((entry) => entry.route.includes("compute-particles"));
    expect(compute?.fields?.["Compute backend"]).toBe("webgpu");
    expect(Number(compute?.fields?.["Compute dispatches"] ?? 0)).toBeGreaterThan(0);
    expect(Number(compute?.fields?.Workgroups ?? 0)).toBeGreaterThan(0);
    expect(new Set(results.map((entry) => entry.screenshotSha256)).size).toBe(results.length);

    const report = {
      schema: "aura3d-native-webgpu-routes/1.0",
      generatedAt: new Date().toISOString(),
      pass: results.length === WEBGPU_ROOT_ROUTES.length
        && results.every((entry) => entry.selectedBackend === "webgpu" && entry.nativeSubmissions > 0 && entry.screenshotBytes > 1_000),
      claimBoundary: "Every WebGPU-labelled evidence route mounted the native Aura3D WebGPU renderer on the retained real adapter. No unsupported, WebGL2, Canvas2D, or zero-native-submission route can pass.",
      routes: results
    };
    mkdirSync(resolve("tests/reports/webgpu-current-architecture"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/webgpu-current-architecture/native-routes.json"),
      `${JSON.stringify(report, null, 2)}\n`
    );
    expect(report.pass).toBe(true);
  });
});
