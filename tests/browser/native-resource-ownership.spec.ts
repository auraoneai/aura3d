import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * WP-21 acceptance source. This specification exercises real root-app
 * lifecycle paths on the Phase B browser runner; it is not a Phase A probe.
 */
test.describe("native resource ownership", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("superseded and disposed mounts settle without reviving subscriptions", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const moduleUrl = "/packages/engine/src/public/index.ts";
      const engine = await import(moduleUrl) as typeof import("@aura3d/engine");
      const build = (name: string) => engine.scene()
        .background("#05070b")
        .camera(engine.camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 45 }))
        .add(engine.lights.directional({ intensity: 3 }).position(2, 3, 4))
        .add(engine.primitives.box({ name, material: engine.material.pbr({ color: "#60b9ef" }) }));
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 192;
      document.body.append(canvas);
      const app = engine.createAuraApp(canvas, { scene: build("superseded"), autoStart: false, resize: false, pixelRatio: 1 });
      let lost = 0;
      let restored = 0;
      app.onDeviceLost(() => { lost += 1; });
      app.onDeviceRestored(() => { restored += 1; });
      try {
        const firstMount = app.readiness({ stage: "renderer" });
        app.setScene(build("current"));
        const abort = new AbortController();
        const abortedWait = app.readiness({ stage: "renderer", signal: abort.signal });
        abort.abort();
        const [superseded, current, aborted] = await Promise.all([firstMount, app.readiness({ stage: "renderer" }), abortedWait]);
        const firstFrameWait = app.readiness({ stage: "first-frame" });
        for (let frame = 0; frame < 90; frame += 1) {
          app.step(1 / 60);
          if (app.diagnostics().drawCalls > 0) break;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        const firstFrame = await firstFrameWait;
        const currentNodePresent = app.nodes.has("current");
        const staleNodePresent = app.nodes.has("superseded");
        const currentDrawCalls = app.diagnostics().drawCalls;

        // Dispose an active replacement while its own mount is still pending.
        app.setScene(build("disposed during mount"));
        const pendingAtDispose = app.readiness({ stage: "renderer" });
        app.dispose();
        app.dispose();
        const disposed = await pendingAtDispose;
        await app.disposeAsync();
        const countsAtDispose = { lost, restored };
        // Synthetic events only check listener teardown after disposal; the
        // next test exercises real context loss with WEBGL_lose_context.
        canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
        canvas.dispatchEvent(new Event("webglcontextrestored"));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        return { superseded, current, aborted, firstFrame, currentNodePresent, staleNodePresent, currentDrawCalls, disposed, countsAtDispose, finalCounts: { lost, restored } };
      } finally {
        await app.disposeAsync();
        canvas.remove();
      }
    });
    expect(result.superseded.state).toBe("cancelled");
    expect(result.current).toEqual({ state: "ready", stage: "renderer", backend: "webgl2" });
    expect(result.aborted.state).toBe("cancelled");
    expect(result.firstFrame).toEqual({ state: "ready", stage: "first-frame", backend: "webgl2" });
    expect(result.currentNodePresent).toBe(true);
    expect(result.staleNodePresent).toBe(false);
    expect(result.currentDrawCalls).toBeGreaterThan(0);
    expect(result.disposed.state).toBe("disposed");
    expect(result.finalCounts).toEqual(result.countsAtDispose);
    expect(pageErrors).toEqual([]);
  });

  test("a real context loss, resize and restore remount produces the scene again", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const moduleUrl = "/packages/engine/src/public/index.ts";
      const engine = await import(moduleUrl) as typeof import("@aura3d/engine");
      const built = engine.scene()
        .background("#05070b")
        .camera(engine.camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 45 }))
        .add(engine.lights.directional({ intensity: 3 }).position(2, 3, 4))
        .add(engine.primitives.box({ name: "recovering subject", material: engine.material.pbr({ color: "#efb658", roughness: 0.4 }) }));
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 192;
      document.body.append(canvas);
      const app = engine.createAuraApp(canvas, { scene: built, autoStart: false, resize: false, pixelRatio: 1, quality: "production" });
      const waitForEvent = (subscribe: (listener: () => void) => () => void): Promise<void> => new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => { unsubscribe(); reject(new Error("Timed out waiting for a device lifecycle event.")); }, 15_000);
        const unsubscribe = subscribe(() => { clearTimeout(timer); unsubscribe(); resolve(); });
      });
      const countPixels = async (): Promise<number> => {
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("Expected a WebGL2 context.");
        for (let frame = 0; frame < 90; frame += 1) {
          app.step(1 / 60);
          const pixels = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let different = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (Math.abs(pixels[index]! - pixels[0]!) + Math.abs(pixels[index + 1]! - pixels[1]!) + Math.abs(pixels[index + 2]! - pixels[2]!) > 16) different += 1;
          }
          if (different > 300) return different;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        return 0;
      };
      let lostCount = 0;
      let restoredCount = 0;
      app.onDeviceLost(() => { lostCount += 1; });
      app.onDeviceRestored(() => { restoredCount += 1; });
      try {
        const beforeReady = await app.readiness({ stage: "renderer" });
        const beforePixels = await countPixels();
        const gl = canvas.getContext("webgl2");
        if (!gl) throw new Error("Expected a WebGL2 context.");
        const extension = gl.getExtension("WEBGL_lose_context");
        if (!extension) return { extensionAvailable: false as const };
        const lost = waitForEvent((listener) => app.onDeviceLost(listener));
        extension.loseContext();
        await lost;
        const reportedLost = app.deviceLost();
        // Resize races with the lost device; the restored mount must use the
        // new backing size rather than keeping resources from the old device.
        canvas.width = 240;
        canvas.height = 200;
        app.step(1 / 60);
        const restored = waitForEvent((listener) => app.onDeviceRestored(listener));
        extension.restoreContext();
        await restored;
        const afterReady = await app.readiness({ stage: "renderer" });
        const afterPixels = await countPixels();
        const afterDiagnostics = app.diagnostics();
        const reportedRestored = !app.deviceLost();
        const liveNode = app.nodes.has("recovering subject");
        await app.disposeAsync();
        const countsAtDispose = { lostCount, restoredCount };
        canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
        canvas.dispatchEvent(new Event("webglcontextrestored"));
        return {
          extensionAvailable: true as const,
          beforeReady, afterReady, beforePixels, afterPixels, reportedLost, reportedRestored,
          renderSize: afterDiagnostics.renderSize, errors: afterDiagnostics.errors, liveNode,
          countsAtDispose, countsAfterDispose: { lostCount, restoredCount }
        };
      } finally {
        await app.disposeAsync();
        canvas.remove();
      }
    });
    expect(result.extensionAvailable, "WEBGL_lose_context must be available to exercise this recovery path").toBe(true);
    if (!result.extensionAvailable) return;
    expect(result.beforeReady).toEqual({ state: "ready", stage: "renderer", backend: "webgl2" });
    expect(result.afterReady).toEqual({ state: "ready", stage: "renderer", backend: "webgl2" });
    expect(result.reportedLost).toBe(true);
    expect(result.reportedRestored).toBe(true);
    expect(result.countsAtDispose).toEqual({ lostCount: 1, restoredCount: 1 });
    expect(result.countsAfterDispose).toEqual(result.countsAtDispose);
    expect(result.beforePixels).toBeGreaterThan(300);
    expect(result.afterPixels).toBeGreaterThan(300);
    expect(result.renderSize).toEqual([240, 200]);
    expect(result.liveNode).toBe(true);
    expect(result.errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
