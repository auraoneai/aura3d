/**
 * WS-2.6 harness — context loss observed through the ROOT API.
 *
 * Imports `@aura3d/engine` only, so this satisfies R1's harness-import shape. The point of the test is
 * that a developer using `createAuraApp` can see a lost context: `WebGL2Device` has handled
 * `webglcontextlost` for a long time, but nothing surfaced it, so the only symptom reaching a developer
 * was a canvas that stopped updating.
 */
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

function litPixels(canvas: HTMLCanvasElement): number {
  const probe = document.createElement("canvas");
  probe.width = canvas.width;
  probe.height = canvas.height;
  const context = probe.getContext("2d");
  if (!context) return 0;
  context.drawImage(canvas, 0, 0);
  const data = context.getImageData(0, 0, probe.width, probe.height).data;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index]! > 24 || data[index + 1]! > 24 || data[index + 2]! > 24) count += 1;
  }
  return count;
}

async function main(): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  document.body.replaceChildren(canvas);

  const built = scene()
    .background("#05070b")
    .camera(camera.perspective({ position: [0, 0, 2.6], target: [0, 0, 0], fov: 45 }))
    .add(lights.directional({ name: "key", intensity: 3 }).position(1.6, 1.8, 2.4))
    .add(primitives.box({ name: "subject", material: material.pbr({ color: "#c8d3e0", roughness: 0.4 }) }));

  const app = createAuraApp(canvas, { scene: built, autoStart: false, pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" } });

  /*
   * Subscribe BEFORE awaiting ready(), deliberately. The renderer mounts asynchronously, so this is the
   * line a developer would naturally write — and an API that silently does nothing depending on timing
   * would be the same trap WS-2.9 fixed. The subscription must be held and attached on mount.
   */
  let lostCount = 0;
  let restoredCount = 0;
  const unsubscribeLost = app.onDeviceLost(() => { lostCount += 1; });
  app.onDeviceRestored(() => { restoredCount += 1; });

  await app.ready();
  app.step(1 / 60);
  const beforeLoss = { litPixels: litPixels(canvas), deviceLost: app.deviceLost() };

  // WEBGL_lose_context is the only way to provoke a real loss from script.
  const gl = canvas.getContext("webgl2");
  const extension = gl?.getExtension("WEBGL_lose_context") as { loseContext(): void; restoreContext(): void } | null;
  const extensionAvailable = Boolean(extension);
  if (extension) {
    extension.loseContext();
    // The event is dispatched asynchronously; one macrotask is enough.
    await new Promise((done) => setTimeout(done, 50));
  }
  const afterLoss = { lostCount, deviceLost: app.deviceLost() };

  if (extension) {
    extension.restoreContext();
    await new Promise((done) => setTimeout(done, 200));
  }
  const afterRestore = { restoredCount, deviceLost: app.deviceLost() };

  // Unsubscribing must actually detach, or a long-lived page leaks listeners on every scene swap.
  unsubscribeLost();
  if (extension) {
    extension.loseContext();
    await new Promise((done) => setTimeout(done, 50));
  }
  const afterUnsubscribe = { lostCount };

  (window as unknown as { __contextLossProbe: unknown }).__contextLossProbe = {
    extensionAvailable,
    beforeLoss,
    afterLoss,
    afterRestore,
    afterUnsubscribe,
    apiPresent: {
      onDeviceLost: typeof app.onDeviceLost === "function",
      onDeviceRestored: typeof app.onDeviceRestored === "function",
      deviceLost: typeof app.deviceLost === "function"
    }
  };
  app.dispose();
}

void main().catch((error: unknown) => {
  (window as unknown as { __contextLossProbeError: string }).__contextLossProbeError =
    error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
});
