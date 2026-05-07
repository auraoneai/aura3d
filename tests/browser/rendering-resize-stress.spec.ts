import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("rendering resize stress", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("keeps CSS size, high-DPI backing buffer, viewport, and pixels aligned across resizes", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 640, height: 480 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();

    try {
      await page.goto(server.origin, { waitUntil: "domcontentloaded" });
      const result = await page.evaluate(async (moduleUrl) => {
        const { Geometry, Renderer, UnlitMaterial } = await import(moduleUrl);
        const canvas = document.createElement("canvas");
        canvas.id = "resize-stress-canvas";
        canvas.style.display = "block";
        document.body.append(canvas);

        const geometry = Geometry.triangle();
        const material = new UnlitMaterial({
          color: [0.1, 0.72, 0.96, 1],
          renderState: { depthTest: false, depthWrite: false, cullMode: "none" }
        });
        const renderer = await Renderer.create({
          backend: "webgl2",
          canvas,
          width: 320,
          height: 180,
          clearColor: [0.01, 0.015, 0.02, 1],
          preserveDrawingBuffer: true
        });
        const scaleMatrix = (x: number, y: number, z: number): readonly number[] => [
          x, 0, 0, 0,
          0, y, 0, 0,
          0, 0, z, 0,
          0, 0, 0, 1
        ];

        const frames = [];
        const steps = [
          { cssWidth: 160, cssHeight: 90 },
          { cssWidth: 241, cssHeight: 137 },
          { cssWidth: 96, cssHeight: 144 },
          { cssWidth: 320, cssHeight: 180 }
        ];

        for (const [index, step] of steps.entries()) {
          const dpr = window.devicePixelRatio;
          const backingWidth = Math.round(step.cssWidth * dpr);
          const backingHeight = Math.round(step.cssHeight * dpr);
          canvas.style.width = `${step.cssWidth}px`;
          canvas.style.height = `${step.cssHeight}px`;
          renderer.resize(backingWidth, backingHeight);
          const diagnostics = renderer.render([{
            geometry,
            material,
            modelMatrix: scaleMatrix(1.65, 1.65, 1),
            label: `resize-step-${index}`
          }]);
          const bounds = canvas.getBoundingClientRect();
          const gl = canvas.getContext("webgl2");
          frames.push({
            index,
            dpr,
            cssWidth: bounds.width,
            cssHeight: bounds.height,
            backingWidth: canvas.width,
            backingHeight: canvas.height,
            drawingBufferWidth: gl?.drawingBufferWidth ?? 0,
            drawingBufferHeight: gl?.drawingBufferHeight ?? 0,
            viewport: Object.fromEntries(renderer.device.captureState()),
            diagnostics,
            centerPixel: Array.from(renderer.device.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1)),
            cornerPixel: Array.from(renderer.device.readPixels(1, 1, 1, 1))
          });
        }

        let invalidResizeError = "";
        try {
          renderer.resize(0, 32);
        } catch (error) {
          invalidResizeError = error instanceof Error ? error.message : String(error);
        }

        renderer.dispose();
        geometry.dispose();
        return { status: "ready", frames, invalidResizeError };
      }, `${server.origin}/packages/rendering/src/index.ts`);

      expect(result.status).toBe("ready");
      expect(result.invalidResizeError).toMatch(/positive integers/i);
      expect(result.frames).toHaveLength(4);

      for (const frame of result.frames as ResizeFrame[]) {
        expect(frame.dpr).toBe(2);
        expect(frame.backingWidth).toBe(Math.round(frame.cssWidth * frame.dpr));
        expect(frame.backingHeight).toBe(Math.round(frame.cssHeight * frame.dpr));
        expect(frame.drawingBufferWidth).toBe(frame.backingWidth);
        expect(frame.drawingBufferHeight).toBe(frame.backingHeight);
        expect(frame.viewport.viewportWidth).toBe(frame.backingWidth);
        expect(frame.viewport.viewportHeight).toBe(frame.backingHeight);
        expect(frame.diagnostics).toMatchObject({ drawCalls: 1, lastError: null, contextLost: false });
        expect(isCyanPixel(frame.centerPixel), `center ${frame.index}: ${JSON.stringify(frame.centerPixel)}`).toBe(true);
        expect(isClearPixel(frame.cornerPixel), `corner ${frame.index}: ${JSON.stringify(frame.cornerPixel)}`).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
});

interface ResizeFrame {
  readonly index: number;
  readonly dpr: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  readonly viewport: { readonly viewportWidth: number; readonly viewportHeight: number };
  readonly diagnostics: { readonly drawCalls: number; readonly lastError: string | null; readonly contextLost: boolean };
  readonly centerPixel: readonly number[];
  readonly cornerPixel: readonly number[];
}

function isCyanPixel(pixel: readonly number[]): boolean {
  return (pixel[0] ?? 0) < 60 && (pixel[1] ?? 0) > 140 && (pixel[2] ?? 0) > 180 && pixel[3] === 255;
}

function isClearPixel(pixel: readonly number[]): boolean {
  return (pixel[0] ?? 0) < 10 && (pixel[1] ?? 0) < 10 && (pixel[2] ?? 0) < 12 && pixel[3] === 255;
}
