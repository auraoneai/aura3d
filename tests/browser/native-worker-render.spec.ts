import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("native worker renderer", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("presents pixels, updates a scene from input, resizes and tears down", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    const supported = await page.evaluate(async ({ engineUrl, runtimeUrl, workerUrl }) => {
      const engine = await import(engineUrl);
      const runtime = await import(runtimeUrl);
      const canvas = document.createElement("canvas");
      canvas.id = "worker-stage";
      canvas.width = canvas.height = 96;
      canvas.style.width = canvas.style.height = "96px";
      document.body.append(canvas);
      if (!runtime.supportsWorkerRendering(canvas)) return false;
      const snapshot = engine.scene({ background: "#102540" }).add(engine.primitives.box({ size: 1 })).toJSON();
      const thread = new Worker(workerUrl, { type: "module" });
      const app = runtime.createWorkerRenderer({ canvas, worker: thread, scene: snapshot, autoStart: false });
      (window as any).__nativeWorker = { app, canvas };
      await app.ready;
      const first = await app.step(0, 0);
      if (first.backend !== "webgl2" || first.drawCalls < 1) throw new Error(`No real worker draw: ${JSON.stringify(first)}`);
      return true;
    }, {
      engineUrl: `${server.origin}/packages/engine/src/public/index.ts`,
      runtimeUrl: `${server.origin}/packages/engine/src/public/worker.ts`,
      workerUrl: `${server.origin}/tests/browser/native-worker-render-worker.ts`
    });
    if (!supported) {
      const fallback = await page.evaluate(async (runtimeUrl) => {
        const runtime = await import(runtimeUrl);
        let terminated = 0;
        const worker = { terminate: () => { terminated++; } };
        const result = runtime.createWorkerRendererOrFallback({ canvas: {}, worker, scene: {} }, () => "main-thread");
        return { kind: result.kind, renderer: result.renderer, terminated };
      }, `${server.origin}/packages/engine/src/public/worker.ts`);
      expect(fallback).toEqual({ kind: "fallback", renderer: "main-thread", terminated: 1 });
      return;
    }
    const initial = await page.locator("#worker-stage").screenshot();
    await page.mouse.move(24, 24);
    await page.mouse.down();
    const frame = await page.evaluate(async () => {
      const { app } = (window as any).__nativeWorker;
      return app.step(1 / 60, 16.67);
    });
    await page.mouse.up();
    expect(frame.drawCalls).toBeGreaterThan(0);
    const updated = await page.locator("#worker-stage").screenshot();
    const before = await sharp(initial).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(updated).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(after.info.width).toBe(before.info.width);
    // Corner is the authored background; red increases on a real presented frame.
    expect(after.data[0]).toBeGreaterThan(before.data[0] + 40);

    const outcome = await page.evaluate(async () => {
      const { app, canvas } = (window as any).__nativeWorker;
      await app.resize({ width: 80, height: 48, pixelRatio: 2 });
      const resized = await app.step(1 / 60, 33.34);
      await Promise.all([app.dispose(), app.dispose()]);
      let disposed = "";
      try { await app.step(1); } catch (error) { disposed = (error as { code?: string }).code ?? ""; }
      return { width: resized.width, height: resized.height, disposed, connected: canvas.isConnected };
    });
    expect(outcome).toEqual({ width: 160, height: 96, disposed: "disposed", connected: true });
  });

  test("presents WebGPU frames after bridged input, resizes and tears down", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    const outcome = await page.evaluate(async ({ engineUrl, runtimeUrl, workerUrl }) => {
      const engine = await import(engineUrl);
      const runtime = await import(runtimeUrl);
      const canvas = document.createElement("canvas");
      canvas.id = "worker-gpu-stage";
      canvas.width = canvas.height = 96;
      canvas.style.width = canvas.style.height = "96px";
      document.body.append(canvas);
      if (!runtime.supportsWorkerRendering(canvas)) {
        canvas.remove();
        return { support: "offscreen-unavailable" as const };
      }
      const thread = new Worker(workerUrl, { type: "module" });
      try {
        const available = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => finish(new Error("Worker GPU availability response timed out.")), 10000);
          function finish(error: Error | null, value = false) {
            clearTimeout(timeout);
            thread.removeEventListener("message", receive);
            thread.removeEventListener("error", failed);
            if (error) reject(error); else resolve(value);
          }
          function receive(event: MessageEvent) {
            if (event.data?.type !== "gpu-availability") return;
            if (typeof event.data.available !== "boolean") finish(new Error("Worker GPU probe returned an invalid response."));
            else finish(null, event.data.available);
          }
          function failed() { finish(new Error("Worker GPU probe failed to load.")); }
          thread.addEventListener("message", receive);
          thread.addEventListener("error", failed);
        });
        if (!available) {
          thread.terminate();
          canvas.remove();
          return { support: "adapter-unavailable" as const };
        }
        const lifecycle = { terminations: 0, bridgeErrors: [] as string[] };
        const terminate = thread.terminate.bind(thread);
        thread.terminate = () => { lifecycle.terminations++; terminate(); };
        const snapshot = engine.scene({ background: "#102540" }).add(engine.primitives.box({ size: 1 })).toJSON();
        const app = runtime.createWorkerRenderer({
          canvas, worker: thread, scene: snapshot, renderer: { backend: "webgpu", allowFallback: false }, autoStart: false,
          onError: (error: { code: string }) => lifecycle.bridgeErrors.push(error.code)
        });
        await app.ready;
        const frame = await app.step(0, 0);
        (window as any).__nativeGpuWorker = { app, canvas, lifecycle };
        return { support: "available" as const, frame };
      } catch (error) {
        thread.terminate();
        canvas.remove();
        throw error;
      }
    }, {
      engineUrl: `${server.origin}/packages/engine/src/public/index.ts`,
      runtimeUrl: `${server.origin}/packages/engine/src/public/worker.ts`,
      workerUrl: `${server.origin}/tests/browser/native-worker-render-worker.ts`
    });
    if (outcome.support !== "available") {
      test.skip(true, outcome.support === "adapter-unavailable" ? "No WebGPU adapter is available in the worker." : "OffscreenCanvas transfer is unavailable.");
      return;
    }

    try {
      expect(outcome.frame).toMatchObject({ backend: "webgpu" });
      expect(outcome.frame.drawCalls).toBeGreaterThan(0);
      const initial = await page.locator("#worker-gpu-stage").screenshot();
      const pixels = await sharp(initial).stats();
      expect(pixels.channels.some((channel) => channel.max - channel.min > 10)).toBe(true);

      // Flush the hover before pressing: the host bridge batches pointer input,
      // and the press must reach the worker before the frame is requested.
      await page.locator("#worker-gpu-stage").hover();
      await page.evaluate(async () => { await (window as any).__nativeGpuWorker.app.step(0, 1); });
      await page.mouse.down();
      let frame;
      try {
        frame = await page.evaluate(async () => (window as any).__nativeGpuWorker.app.step(1 / 60, 16.67));
      } finally {
        await page.mouse.up();
      }
      expect(frame).toMatchObject({ backend: "webgpu" });
      expect(frame.drawCalls).toBeGreaterThan(0);
      const updated = await page.locator("#worker-gpu-stage").screenshot();
      const before = await sharp(initial).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const after = await sharp(updated).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(after.info.width).toBe(before.info.width);
      expect(after.info.height).toBe(before.info.height);
      // The worker changes the authored background from blue to red only when
      // a pressed pointer arrives; verify that change on presented pixels.
      expect(after.data[0]).toBeGreaterThan(before.data[0] + 40);
      let redPixels = 0;
      for (let i = 0; i < before.data.length; i += 3) {
        if (after.data[i] > before.data[i] + 40 && after.data[i] > after.data[i + 1] + 40) redPixels++;
      }
      expect(redPixels).toBeGreaterThan(before.info.width * before.info.height / 4);

      const resized = await page.evaluate(async () => {
        const { app } = (window as any).__nativeGpuWorker;
        await app.resize({ width: 80, height: 48, pixelRatio: 2 });
        return app.step(1 / 60, 33.34);
      });
      expect(resized).toMatchObject({ backend: "webgpu", width: 160, height: 96 });
      expect(resized.drawCalls).toBeGreaterThan(0);
    } finally {
      const cleanup = await page.evaluate(async () => {
        const { app, canvas, lifecycle } = (window as any).__nativeGpuWorker;
        await Promise.all([app.dispose(), app.dispose()]);
        let disposed = "";
        try { await app.step(1); } catch (error) { disposed = (error as { code?: string }).code ?? ""; }
        const connected = canvas.isConnected;
        canvas.remove();
        delete (window as any).__nativeGpuWorker;
        return { disposed, connected, removed: !canvas.isConnected, ...lifecycle };
      });
      expect(cleanup).toEqual({ disposed: "disposed", connected: true, removed: true, terminations: 1, bridgeErrors: [] });
    }
    expect(errors).toEqual([]);
  });

  test("loads the emitted default worker entry from the package URL", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async ({ engineUrl, runtimeUrl }) => {
      const engine = await import(engineUrl); const runtime = await import(runtimeUrl);
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
      if (!runtime.supportsWorkerRendering(canvas)) return { support: "offscreen-unavailable" };
      const url = runtime.workerRendererUrl();
      if (url.origin !== location.origin) throw new Error("Default worker must resolve to the application origin.");
      const app = runtime.createWorkerRenderer({ canvas, worker: new Worker(url, { type: "module" }), scene: engine.scene().add(engine.primitives.box()).toJSON(), autoStart: false, bridgeEvents: false });
      await app.ready;
      const frame = await app.step(0, 0);
      await app.dispose();
      return { support: "available", backend: frame.backend, drawCalls: frame.drawCalls };
    }, { engineUrl: `${server.origin}/packages/engine/src/public/index.ts`, runtimeUrl: `${server.origin}/packages/engine/src/public/worker.ts` });
    expect(["available", "offscreen-unavailable"]).toContain(result.support);
    if (result.support === "available") { expect(result.backend).toBe("webgl2"); expect(result.drawCalls).toBeGreaterThan(0); }
  });
});
