import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("rendering context lifecycle", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("reports WebGL2 context loss, rejects lost/disposed renders, and recreates on the same canvas", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async (moduleUrl) => {
      const { Geometry, Renderer, UnlitMaterial } = await import(moduleUrl);
      const canvas = document.createElement("canvas");
      canvas.id = "lifecycle-canvas";
      document.body.append(canvas);

      const geometry = Geometry.triangle();
      const material = new UnlitMaterial({
        color: [0.95, 0.18, 0.08, 1],
        renderState: { depthTest: false, depthWrite: false, cullMode: "none" }
      });
      const frames: unknown[] = [];
      const scaleMatrix = (x: number, y: number, z: number): readonly number[] => [
        x, 0, 0, 0,
        0, y, 0, 0,
        0, 0, z, 0,
        0, 0, 0, 1
      ];

      let renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width: 64,
        height: 64,
        clearColor: [0.01, 0.015, 0.02, 1],
        preserveDrawingBuffer: true
      });

      function renderFrame(label: string): void {
        const display = renderer.resizeToDisplay({ cssWidth: 32, cssHeight: 32, devicePixelRatio: 2 });
        const diagnostics = renderer.render([{
          geometry,
          material,
          modelMatrix: scaleMatrix(1.65, 1.65, 1),
          label
        }]);
        frames.push({
          label,
          display,
          diagnostics,
          state: Object.fromEntries(renderer.device.captureState()),
          pixel: Array.from(renderer.device.readPixels(32, 32, 1, 1))
        });
      }

      renderFrame("initial");

      const lostEvent = new Event("webglcontextlost", { cancelable: true });
      const lossDispatched = canvas.dispatchEvent(lostEvent);
      const lostDiagnostics = renderer.getDiagnostics();
      let lostRenderError = "";
      try {
        renderFrame("lost");
      } catch (error) {
        lostRenderError = error instanceof Error ? error.message : String(error);
      }

      canvas.dispatchEvent(new Event("webglcontextrestored"));
      const restoredDiagnostics = renderer.getDiagnostics();
      renderFrame("restored");

      renderer.dispose();
      const disposedDiagnostics = renderer.getDiagnostics();
      let disposedRenderError = "";
      try {
        renderer.render([]);
      } catch (error) {
        disposedRenderError = error instanceof Error ? error.message : String(error);
      }

      renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width: 64,
        height: 64,
        clearColor: [0.01, 0.015, 0.02, 1],
        preserveDrawingBuffer: true
      });
      renderFrame("recreated");
      const recreatedDiagnostics = renderer.getDiagnostics();

      let loopFrames = 0;
      const loop = renderer.startAnimationLoop((_timeMs, activeRenderer) => {
        activeRenderer.resizeToDisplay({ cssWidth: 32, cssHeight: 32, devicePixelRatio: 2 });
        activeRenderer.render([{
          geometry,
          material,
          modelMatrix: scaleMatrix(1.65, 1.65, 1),
          label: `loop-${loopFrames}`
        }]);
        loopFrames += 1;
        if (loopFrames >= 8) {
          loop.stop();
        }
      });
      await new Promise<void>((resolve, reject) => {
        const started = performance.now();
        const poll = () => {
          if (!loop.running && loopFrames >= 8) {
            resolve();
            return;
          }
          if (performance.now() - started > 3000) {
            reject(new Error(`animation loop stopped at ${loopFrames} frames`));
            return;
          }
          requestAnimationFrame(poll);
        };
        poll();
      });
      const loopDiagnostics = renderer.getDiagnostics();
      const loopState = Object.fromEntries(renderer.device.captureState());

      renderer.dispose();
      geometry.dispose();

      return {
        status: "ready",
        lossDispatched,
        lostEventDefaultPrevented: lostEvent.defaultPrevented,
        lostDiagnostics,
        restoredDiagnostics,
        disposedDiagnostics,
        recreatedDiagnostics,
        loopDiagnostics,
        loopState,
        loopFrames,
        lostRenderError,
        disposedRenderError,
        canvasFrame: { width: canvas.width, height: canvas.height },
        frames
      };
    }, `${server.origin}/packages/rendering/src/index.ts`);

    expect(result.status).toBe("ready");
    expect(result.lossDispatched).toBe(false);
    expect(result.lostEventDefaultPrevented).toBe(true);
    expect(result.lostDiagnostics).toMatchObject({ contextLost: true, lastError: "CONTEXT_LOST" });
    expect(result.lostRenderError).toMatch(/context is lost/i);
    expect(result.restoredDiagnostics).toMatchObject({ contextLost: false, lastError: null });
    expect(result.disposedDiagnostics).toMatchObject({ contextLost: false });
    expect(result.disposedRenderError).toMatch(/disposed/i);
    expect(result.recreatedDiagnostics).toMatchObject({ drawCalls: 1, contextLost: false, lastError: null });
    expect(result.loopFrames).toBe(8);
    expect(result.loopDiagnostics).toMatchObject({ drawCalls: 1, contextLost: false, lastError: null });
    expect(result.loopState).toMatchObject({ viewportWidth: 64, viewportHeight: 64 });
    expect(result.canvasFrame).toEqual({ width: 64, height: 64 });
    expect(result.frames).toHaveLength(3);

    for (const frame of result.frames as LifecycleFrame[]) {
      expect(frame.diagnostics.drawCalls).toBe(1);
      expect(frame.diagnostics.lastError).toBeNull();
      expect(frame.display).toMatchObject({ cssWidth: 32, cssHeight: 32, devicePixelRatio: 2, width: 64, height: 64 });
      expect(frame.state.viewportWidth).toBe(64);
      expect(frame.state.viewportHeight).toBe(64);
      expect(isWarmPixel(frame.pixel), `${frame.label}: ${JSON.stringify(frame.pixel)}`).toBe(true);
    }
  });
});

interface LifecycleFrame {
  readonly label: string;
  readonly diagnostics: { readonly drawCalls: number; readonly lastError: string | null };
  readonly display: { readonly cssWidth: number; readonly cssHeight: number; readonly devicePixelRatio: number; readonly width: number; readonly height: number };
  readonly state: { readonly viewportWidth: number; readonly viewportHeight: number };
  readonly pixel: readonly number[];
}

function isWarmPixel(pixel: readonly number[]): boolean {
  return (pixel[0] ?? 0) > 180 && (pixel[1] ?? 0) > 20 && (pixel[1] ?? 0) < 80 && (pixel[2] ?? 0) < 50 && pixel[3] === 255;
}
