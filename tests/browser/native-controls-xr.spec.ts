import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("native controls and injected XR session", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("real mouse events drive a captured drag and cancellation never emits dragend", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`);
    await page.setContent('<canvas id="target" width="300" height="200" style="width:300px;height:200px"></canvas>');
    await page.evaluate(async () => {
      const path = "/packages/controls/src/DragControls.ts";
      const { DragControls } = await import(/* @vite-ignore */ path);
      const canvas = document.querySelector("#target") as HTMLCanvasElement;
      const object = { position: { x: 0, y: 0, z: 0 } };
      const events: { type: string; pointerId: number }[] = [];
      const controls = new DragControls({
        element: canvas,
        rayFromPointer: (event: PointerEvent) => ({ origin: { x: event.clientX / 100, y: 0, z: 1 }, direction: { x: 0, y: 0, z: -1 } }),
        hitTest: () => ({ object, point: { x: 0, y: 0, z: 0 }, distance: 1 }),
        onEvent: (event: { type: string; pointerId: number }) => events.push({ type: event.type, pointerId: event.pointerId })
      });
      (window as unknown as { dragFixture: unknown }).dragFixture = { object, events, controls };
    });
    const box = (await page.locator("#target").boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 40);
    const moved = await page.evaluate(() => {
      const f = (window as unknown as { dragFixture: { object: { position: { x: number } }; events: { type: string; pointerId: number }[] } }).dragFixture;
      return { x: f.object.position.x, events: f.events };
    });
    expect(moved.x).toBeCloseTo(0.5);
    expect(moved.events.map((event) => event.type)).toContain("dragstart");
    expect(moved.events.map((event) => event.type)).toContain("drag");
    const pointerId = moved.events.find((event) => event.type === "dragstart")!.pointerId;
    await page.locator("#target").dispatchEvent("pointercancel", { pointerId, pointerType: "mouse" });
    await page.mouse.up();
    const types = await page.evaluate(() => {
      const f = (window as unknown as { dragFixture: { events: { type: string }[]; controls: { dispose(): void } } }).dragFixture;
      f.controls.dispose();
      return f.events.map((event) => event.type);
    });
    expect(types).toContain("dragcancel");
    expect(types).not.toContain("dragend");
  });

  test("injected browser-shaped XR session routes a native pose and cleans up (not hardware evidence)", async ({ page }) => {
    test.info().annotations.push({ type: "xr-evidence", description: "injected browser-shaped session; no physical device" });
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`);
    const result = await page.evaluate(async () => {
      const path = "/packages/engine/src/agent-api/xr/xrRuntime.ts";
      const { createAuraXRRuntime } = await import(/* @vite-ignore */ path);
      const space = new EventTarget();
      const hitSource = { cancelled: false, cancel() { this.cancelled = true; } };
      class Session extends EventTarget {
        inputSources = [];
        enabledFeatures = ["hit-test"];
        visibilityState = "visible";
        ended = false;
        callback: ((time: number, frame: unknown) => void) | null = null;
        async requestReferenceSpace() { return space; }
        async requestHitTestSource() { return hitSource; }
        async updateRenderState() {}
        requestAnimationFrame(callback: (time: number, frame: unknown) => void) { this.callback = callback; return 1; }
        cancelAnimationFrame() {}
        async end() { this.ended = true; this.dispatchEvent(new Event("end")); }
      }
      class Layer {
        framebuffer = null;
        framebufferWidth = 100;
        framebufferHeight = 100;
        getViewport() { return { x: 0, y: 0, width: 100, height: 100 }; }
      }
      const session = new Session();
      const xr = { async isSessionSupported() { return true; }, async requestSession() { return session; } };
      const device = { setExternalFramebuffer() {}, setViewport() {}, resetViewport() {} };
      const runtime = createAuraXRRuntime({ key: {}, xr, getGL: () => ({}), layerConstructor: Layer, getDevice: () => device, renderFrame: () => {} });
      const entered = await runtime.enter("immersive-ar", { hitTest: true });
      const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const view = { eye: "none", projectionMatrix: identity, transform: { matrix: identity, inverse: { matrix: identity } } };
      const callback = session.callback as ((time: number, frame: unknown) => void) | null;
      callback?.(100, {
        getViewerPose: () => ({ transform: { position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } }, views: [view] }),
        getHitTestResults: () => [{ getPose: () => ({ transform: { position: { x: 1, y: 0, z: -2 }, matrix: identity } }) }]
      });
      const sample = runtime.lastSample;
      await runtime.exit();
      return { entered, camera: sample?.camera.position, hits: sample?.hitTests, ended: session.ended, cancelled: hitSource.cancelled, presenting: runtime.isPresenting };
    });
    expect(result.entered).toMatchObject({ started: true, provenance: "injected", capabilities: { hitTest: true } });
    expect(result.camera).toEqual([0, 1.6, 0]);
    expect(result.hits?.[0]?.position).toEqual([1, 0, -2]);
    expect(result).toMatchObject({ ended: true, cancelled: true, presenting: false });
  });
});
