import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("current WebGPU architecture", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("proves real compute and Three.js-style auto fallback without weakening explicit errors", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const browser = await page.evaluate(async () => {
      const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
      if (!gpu) {
        return { status: "blocked" as const, reason: "navigator.gpu is unavailable; real WebGPU architecture proof cannot run." };
      }

      const [rendering, production] = await Promise.all([
        import("/packages/rendering/src/index.js"),
        import("/packages/rendering/src/production-runtime/index.js")
      ]);

      const compute = new rendering.WebGPUParticleBackend({ gpu });
      await compute.initialize();
      const computeResult = await compute.update({
        positions: new Float32Array([0, 0, 0, 0, 1, 2, 3, 0]),
        velocities: new Float32Array([1, 0, 0, 0, -1, 1, 0, 0]),
        accelerations: new Float32Array([0, 2, 0, 0, 2, 0, -2, 0]),
        deltaTime: 0.5,
        count: 2
      });
      compute.dispose();

      const unavailableGpu = { requestAdapter: async () => null };
      const fallbackCanvas = document.createElement("canvas");
      fallbackCanvas.width = 96;
      fallbackCanvas.height = 96;
      document.body.append(fallbackCanvas);
      const fallbackRenderer = await production.ProductionRuntimeRenderer.create({
        backend: "auto",
        webgpu: unavailableGpu,
        canvas: fallbackCanvas,
        width: 96,
        height: 96,
        preserveDrawingBuffer: true
      });
      const fallback = {
        backend: fallbackRenderer.backend,
        selection: fallbackRenderer.backendSelection,
        deviceBackend: fallbackRenderer.getDiagnostics().contextLost === false ? "initialized" : "lost"
      };
      fallbackRenderer.dispose();

      const explicitCanvas = document.createElement("canvas");
      explicitCanvas.width = 96;
      explicitCanvas.height = 96;
      document.body.append(explicitCanvas);
      let explicitError = "";
      try {
        await production.ProductionRuntimeRenderer.create({
          backend: "webgpu",
          webgpu: unavailableGpu,
          canvas: explicitCanvas,
          width: 96,
          height: 96
        });
      } catch (error) {
        explicitError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }

      return {
        status: "ready" as const,
        compute: {
          backend: computeResult.backend,
          count: computeResult.count,
          workgroups: computeResult.workgroups,
          positions: Array.from(computeResult.positions),
          velocities: Array.from(computeResult.velocities)
        },
        fallback,
        explicitError
      };
    });

    expect(browser.status, browser.status === "blocked" ? browser.reason : undefined).toBe("ready");
    if (browser.status !== "ready") return;
    expect(browser.compute.backend).toBe("webgpu");
    expect(browser.compute.count).toBe(2);
    expect(browser.compute.workgroups).toBe(1);
    expect(browser.compute.positions[0]).toBeCloseTo(0.5, 5);
    expect(browser.compute.positions[1]).toBeCloseTo(0.5, 5);
    expect(browser.compute.positions[4]).toBeCloseTo(1, 5);
    expect(browser.compute.positions[5]).toBeCloseTo(2.5, 5);
    expect(browser.compute.positions[6]).toBeCloseTo(2.5, 5);
    expect(browser.compute.velocities[0]).toBeCloseTo(1, 5);
    expect(browser.compute.velocities[1]).toBeCloseTo(1, 5);
    expect(browser.compute.velocities[4]).toBeCloseTo(0, 5);
    expect(browser.compute.velocities[6]).toBeCloseTo(-1, 5);
    expect(browser.fallback.backend).toBe("webgl2");
    expect(browser.fallback.selection).toMatchObject({
      requestedBackend: "auto",
      selectedBackend: "webgl2",
      fallback: true,
      asyncRequired: false
    });
    expect(browser.fallback.selection.reason).toContain("attempted WebGPU");
    expect(browser.fallback.selection.reason).toContain("WEBGPU_ADAPTER_MISSING");
    expect(browser.explicitError).toContain("Explicit WebGPU renderer initialization failed");
    expect(browser.explicitError).toContain("will not silently use WebGL2");

    const currentBaseline = JSON.parse(readFileSync(resolve("tests/reports/current-threejs-baseline.json"), "utf8")) as {
      readonly pass: boolean;
      readonly latest: { readonly version: string; readonly gitHead: string };
    };
    const threeSourcePath = resolve("node_modules/three/src/renderers/webgpu/WebGPURenderer.js");
    const threeSource = readFileSync(threeSourcePath, "utf8");
    const comparison = {
      schema: "aura3d-current-webgpu-architecture/1.0",
      generatedAt: new Date().toISOString(),
      pass: currentBaseline.pass
        && currentBaseline.latest.version === "0.185.1"
        && /getFallback/.test(threeSource)
        && /return new WebGLBackend/.test(threeSource)
        && browser.compute.backend === "webgpu"
        && browser.fallback.backend === "webgl2"
        && browser.fallback.selection.fallback
        && browser.explicitError.includes("will not silently use WebGL2"),
      baseline: {
        package: `three@${currentBaseline.latest.version}`,
        gitHead: currentBaseline.latest.gitHead,
        source: "node_modules/three/src/renderers/webgpu/WebGPURenderer.js",
        sourceSha256: createHash("sha256").update(threeSource).digest("hex"),
        behavior: "WebGPURenderer prefers WebGPU, falls back to WebGL2 when WebGPU initialization is unavailable, and supports forceWebGL."
      },
      aura3d: browser,
      claimBoundary: "Aura3D proves a real WebGPU compute pipeline/readback and auto-to-WebGL2 initialization fallback on this Chromium/Apple Metal run. Explicit WebGPU remains a hard error. This does not claim TSL, WebXR, or full renderer-feature parity."
    };
    mkdirSync(resolve("tests/reports/webgpu-current-architecture"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/webgpu-current-architecture/architecture.json"),
      `${JSON.stringify(comparison, null, 2)}\n`
    );
    expect(comparison.pass).toBe(true);
  });
});
