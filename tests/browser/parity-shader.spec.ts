import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const EXAMPLE = "examples/custom-shader-lab/main.ts";
const REPORT_DIRECTORY = resolve("tests/reports/parity-shader");

interface LabState {
  readonly status: string;
  readonly backend: string;
  readonly frame: number;
  readonly materialCount: number;
  readonly uTime: { readonly pulse: number; readonly rim: number };
  readonly setUniformApplied: boolean;
  readonly chunkRegistered: boolean;
  readonly publicApiOnly: boolean;
  readonly errors: readonly string[];
  readonly routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  readonly error?: string;
}

const state = (page: import("@playwright/test").Page): Promise<LabState> =>
  page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB__?: LabState }).__AURA_CUSTOM_SHADER_LAB__!);

// L1-04: the same custom-material adapter on a real `Renderer.create({ backend })` page
// (createAuraApp mounts WebGL2 only, so WebGPU is exercised through this lab).
const BACKEND_LAB_EXAMPLE = "examples/custom-shader-webgpu-lab/main.ts";

interface BackendLabState {
  readonly status: "loading" | "ready" | "error";
  readonly backend: string;
  readonly frame: number;
  readonly wgslAuthored: boolean;
  readonly diagnostics: Record<string, unknown>;
  readonly deviceHealth?: Record<string, unknown>;
  readonly error?: string;
}

const backendLabState = (page: import("@playwright/test").Page): Promise<BackendLabState> =>
  page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_BACKEND_LAB__?: BackendLabState }).__AURA_CUSTOM_SHADER_BACKEND_LAB__!);

/**
 * threejs-parity SH-02/SH-10 (lane L1): `material.custom(spec)` compiles
 * three-style GLSL to portable materials on the authoritative WebGL2 path;
 * `handle.setUniform` mutates parameters without recompiling; a globally
 * registered `#include` chunk resolves through the adapter.
 */
test.describe("parity shader material (SH-02, SH-10)", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("custom materials render on WebGL2 and setUniform mutates without recompile", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    const source = readFileSync(resolve(EXAMPLE), "utf8");
    expect(source).toContain("material.custom");
    expect(source).toContain("registerShaderChunk");
    expect(source).toContain("#include <custom_lab_wave>");
    expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);

    await page.goto(`${server.origin}/examples/custom-shader-lab/?backend=webgl2`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const lab = (window as unknown as { __AURA_CUSTOM_SHADER_LAB__?: LabState }).__AURA_CUSTOM_SHADER_LAB__;
        return lab?.status === "ready" && lab.frame >= 1;
      },
      undefined,
      { timeout: 90_000 }
    ).catch(async () => {
      const lab = await state(page).catch(() => undefined);
      throw new Error(`custom-shader-lab did not become ready: ${errors.join(" | ") || lab?.error || lab?.status || "no browser diagnostic"}`);
    });

    const ready = await state(page);
    expect(ready).toMatchObject({
      status: "ready",
      backend: "webgl2",
      materialCount: 3,
      chunkRegistered: true,
      setUniformApplied: true,
      publicApiOnly: true
    });
    // §8/§11.3: route-health names the parity IDs this port exercised.
    expect(ready.routeHealth?.parityIds).toEqual(["SH-02", "SH-03", "SH-09", "SH-10"]);

    const canvas = page.locator("#stage");
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_TIME__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_TIME__(0));
    const atZero = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, "aura-custom-time0.png") });
    expect((await state(page)).uTime.pulse).toBe(0);
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_TIME__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_TIME__(1));
    const atOne = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, "aura-custom-time1.png") });
    expect((await state(page)).uTime.pulse).toBe(1);
    const zeroHash = createHash("sha256").update(atZero).digest("hex");
    const oneHash = createHash("sha256").update(atOne).digest("hex");
    expect(oneHash).not.toBe(zeroHash);

    // setUniform on an authored uniform changes pixels — with no shader-key
    // churn (the hook writes `strength` through `handle.setUniform`).
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_STRENGTH__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_STRENGTH__(0.05));
    await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_LAB_SET_TIME__: (v: number) => void }).__AURA_CUSTOM_SHADER_LAB_SET_TIME__(1));
    const dimmed = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, "aura-custom-strength-low.png") });
    expect(createHash("sha256").update(dimmed).digest("hex")).not.toBe(oneHash);
    expect(errors).toEqual([]);
  });

  for (const backend of ["webgl2", "webgpu"] as const) {
    test(`custom material adapter renders on ${backend} and authored uniforms change pixels without a new pipeline (L1-04)`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      const source = readFileSync(resolve(BACKEND_LAB_EXAMPLE), "utf8");
      expect(source).toContain("createCustomShaderMaterial");
      expect(source).toContain("wgsl: { fragment: WGSL_FRAGMENT }");
      expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);

      let present: "canvas" | "offscreen" = "canvas";
      if (backend === "webgpu") {
        // Preflight with a bare GPUDevice (no Aura3D code): when even that dies within 3 s the runner's WebGPU
        // stack is unusable, which says nothing about the engine. A bare device that lives while the lab's dies fails below.
        await page.goto(`${server.origin}/examples/custom-shader-webgpu-lab/?backend=webgl2`, { waitUntil: "domcontentloaded" });
        const probe = await page.evaluate(async () => {
          const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ isFallbackAdapter?: boolean; requestDevice(): Promise<{ lost: Promise<{ reason: string }>; destroy(): void }> } | null> } }).gpu;
          if (!gpu) return { ok: false, reason: "navigator.gpu missing", fallbackAdapter: null };
          const adapter = await gpu.requestAdapter();
          if (!adapter) return { ok: false, reason: "no adapter", fallbackAdapter: null };
          const device = await adapter.requestDevice();
          const outcome = await Promise.race([
            device.lost.then((info) => `lost:${info.reason}`),
            new Promise<string>((done) => setTimeout(() => done("alive"), 3000))
          ]);
          if (outcome === "alive") device.destroy();
          return { ok: outcome === "alive", reason: outcome, fallbackAdapter: adapter.isFallbackAdapter ?? null };
        });
        test.info().annotations.push({ type: "webgpu-preflight", description: JSON.stringify(probe) });
        test.skip(!probe.ok, `runner WebGPU unusable before any Aura3D code runs: ${probe.reason}`);
        // Parity R-22 (ACR runner, Chromium 147 headless + SwiftShader, runs r22b/r22c): configuring a canvas context with a
        // GPUDevice destroys that device within ~50 ms ("destroyed: Device was destroyed.") even in bare browser code, under
        // every launch-flag variant tried. When that happens the lab renders into an offscreen render target and the spec
        // asserts on GPU readback instead of a canvas screenshot, so WebGPU is still proven on the real device.
        const canvasProbe = await page.evaluate(async () => {
          const gpu = (navigator as unknown as { gpu: { requestAdapter(): Promise<any>; getPreferredCanvasFormat(): string } }).gpu;
          const adapter = await gpu.requestAdapter();
          const device = await adapter.requestDevice();
          const probeCanvas = document.createElement("canvas");
          probeCanvas.width = 64; probeCanvas.height = 64;
          document.body.appendChild(probeCanvas);
          const probeContext = probeCanvas.getContext("webgpu") as any;
          probeContext.configure({ device, format: gpu.getPreferredCanvasFormat(), alphaMode: "opaque" });
          // The device is only destroyed once a frame is actually presented to the canvas, so draw a few.
          const presentFrames = new Promise<string>((done) => {
            let frames = 0;
            const tick = () => {
              const encoder = device.createCommandEncoder();
              encoder.beginRenderPass({ colorAttachments: [{ view: probeContext.getCurrentTexture().createView(), clearValue: { r: 0.9, g: 0.1, b: 0.1, a: 1 }, loadOp: "clear", storeOp: "store" }] }).end();
              device.queue.submit([encoder.finish()]);
              if (++frames < 8) requestAnimationFrame(tick); else setTimeout(() => done("alive"), 600);
            };
            requestAnimationFrame(tick);
          });
          const outcome = await Promise.race([
            device.lost.then((info: { reason: string }) => `lost:${info.reason}`),
            presentFrames,
            new Promise<string>((done) => setTimeout(() => done("alive"), 4000))
          ]);
          if (outcome === "alive") device.destroy();
          probeCanvas.remove();
          return { ok: outcome === "alive", reason: outcome };
        });
        test.info().annotations.push({ type: "webgpu-canvas-presentation", description: JSON.stringify(canvasProbe) });
        present = canvasProbe.ok ? "canvas" : "offscreen";
      }

      await page.goto(`${server.origin}/examples/custom-shader-webgpu-lab/?backend=${backend}${present === "offscreen" ? "&present=offscreen" : ""}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => {
          const lab = (window as unknown as { __AURA_CUSTOM_SHADER_BACKEND_LAB__?: BackendLabState }).__AURA_CUSTOM_SHADER_BACKEND_LAB__;
          return lab?.status === "ready" || lab?.status === "error";
        },
        undefined,
        { timeout: 90_000 }
      );
      const ready = await backendLabState(page);
      if (ready.status === "error") {
        throw new Error(`backend lab failed on ${backend}: ${ready.error ?? "no lab diagnostic"} | ${errors.join(" | ")}`);
      }
      expect(ready).toMatchObject({ status: "ready", backend, wgslAuthored: true });
      expect(Number(ready.diagnostics.drawCalls)).toBe(1);

      const canvas = page.locator("#stage");
      const readbackMeans = new Map<string, readonly [number, number, number]>();
      const shoot = async (tint: string, gain: number, name: string): Promise<string> => {
        try {
          await page.evaluate(([t, g]) => (window as unknown as { __AURA_CUSTOM_SHADER_BACKEND_LAB_SET__: (tint: string, gain: number) => unknown }).__AURA_CUSTOM_SHADER_BACKEND_LAB_SET__(t, g), [tint, gain] as const);
        } catch (error) {
          const lab = await backendLabState(page).catch(() => undefined);
          throw new Error(`${backend} lab render "${name}" failed: ${(error as Error).message.split("\n")[0]} | deviceHealth=${JSON.stringify(lab?.deviceHealth ?? null)} | console=${errors.join(" | ") || "none"}`);
        }
        if (present === "offscreen") {
          const readback = await page.evaluate(() => (window as unknown as { __AURA_CUSTOM_SHADER_BACKEND_LAB_READ__: () => Promise<{ hash: string; mean: [number, number, number]; litPixels: number }> }).__AURA_CUSTOM_SHADER_BACKEND_LAB_READ__());
          expect(readback.litPixels, `${name}: sphere pixels in GPU readback`).toBeGreaterThan(500);
          readbackMeans.set(name, readback.mean);
          return readback.hash;
        }
        const image = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, `aura-${backend}-${name}.png`) });
        return createHash("sha256").update(image).digest("hex");
      };

      const red = await shoot("#ff3a2a", 1, "red");
      const pipelinesAfterWarmup = Number((await backendLabState(page)).diagnostics.nativeRenderPipelinesCreated ?? 0);
      const blue = await shoot("#2a5cff", 1, "blue");
      const dim = await shoot("#ff3a2a", 0.2, "dim");
      const redAgain = await shoot("#ff3a2a", 1, "red-again");

      expect(blue).not.toBe(red);
      expect(dim).not.toBe(red);
      expect(redAgain).toBe(red);
      if (present === "offscreen") {
        const [r, b, d, ra] = ["red", "blue", "dim", "red-again"].map((n) => readbackMeans.get(n)!);
        expect(r![0], "red tint: R channel dominates").toBeGreaterThan(r![2]!);
        expect(b![2], "blue tint: B channel dominates").toBeGreaterThan(b![0]!);
        expect(d![0], "gain 0.2 dims the red channel").toBeLessThan(r![0]! * 0.6);
        expect(ra![0]).toBeCloseTo(r![0], 3);
      }

      const after = await backendLabState(page);
      if (backend === "webgpu") {
        expect(Number(after.diagnostics.nativeSubmissions)).toBeGreaterThanOrEqual(1);
        expect(pipelinesAfterWarmup).toBeGreaterThanOrEqual(1);
        // setParameter writes uniforms only: no further render pipeline may be created.
        expect(Number(after.diagnostics.nativeRenderPipelinesCreated)).toBe(pipelinesAfterWarmup);
      }
      expect(errors).toEqual([]);
    });
  }
});
