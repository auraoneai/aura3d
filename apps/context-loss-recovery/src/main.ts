/**
 * Root-safe production consumer for Aura3D's WebGL context lifecycle API.
 *
 * This is intentionally an internal diagnostic rather than a showcase claim. It proves that an
 * application can subscribe before the asynchronous renderer mount, observe a real browser context
 * loss and restoration, and detach its subscription without importing renderer internals.
 */
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

interface LoseContextExtension {
  loseContext(): void;
  restoreContext(): void;
}

interface ContextLossRecoveryProbe {
  readonly status: "ready" | "lost" | "recovering" | "restored" | "error";
  readonly extensionAvailable: boolean;
  readonly beforeLoss: { readonly litPixels: number; readonly pixelHash: string; readonly deviceLost: boolean };
  readonly afterRestore: { readonly litPixels: number; readonly pixelHash: string; readonly runtimeMounted: boolean };
  readonly lostCount: number;
  readonly restoredCount: number;
  readonly recoveryCount: number;
  readonly deviceLost: boolean;
  readonly pausedOnLoss: boolean;
  readonly resourcesRecreated: boolean;
  readonly sceneRestored: boolean;
  readonly runtimeBackend: string | undefined;
  readonly rendererMode: string;
  readonly lossSubscriptionActive: boolean;
  readonly apiPresent: {
    readonly onDeviceLost: boolean;
    readonly onDeviceRestored: boolean;
    readonly deviceLost: boolean;
  };
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_CONTEXT_LOSS_RECOVERY__?: ContextLossRecoveryProbe;
  }
}

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

function pixelHash(canvas: HTMLCanvasElement): string {
  const probe = document.createElement("canvas");
  probe.width = canvas.width;
  probe.height = canvas.height;
  const context = probe.getContext("2d");
  if (!context) return "00000000";
  context.drawImage(canvas, 0, 0);
  const data = context.getImageData(0, 0, probe.width, probe.height).data;
  let hash = 0x811c9dc5;
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#aura-context-loss-canvas");
  const status = document.querySelector<HTMLOutputElement>("#context-status");
  const loseButton = document.querySelector<HTMLButtonElement>("#lose-context");
  const restoreButton = document.querySelector<HTMLButtonElement>("#restore-context");
  const unsubscribeButton = document.querySelector<HTMLButtonElement>("#unsubscribe-loss");
  if (!canvas || !status || !loseButton || !restoreButton || !unsubscribeButton) {
    throw new Error("Context-loss diagnostic shell is incomplete.");
  }

  const built = scene()
    .background("#05070b")
    .camera(camera.perspective({ position: [0, 0.35, 3.2], target: [0, 0, 0], fov: 45 }))
    .add(lights.ambient({ intensity: 0.22 }))
    .add(lights.directional({ name: "key", intensity: 3 }).position(1.6, 2.1, 2.4))
    .add(
      primitives.box({
        name: "abstract context lifecycle subject",
        material: material.pbr({ color: "#60a5fa", roughness: 0.32, metallic: 0.18 })
      }).rotate(0.32, 0.62, 0)
    );

  const app = createAuraApp(canvas, {
    scene: built,
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { qualityProfile: "production" }
  });

  let lostCount = 0;
  let restoredCount = 0;
  let recoveryCount = 0;
  let lossSubscriptionActive = true;
  let lifecycleStatus: ContextLossRecoveryProbe["status"] = "ready";
  let beforeLoss = { litPixels: 0, pixelHash: "00000000", deviceLost: false };
  let afterRestore = { litPixels: 0, pixelHash: "00000000", runtimeMounted: false };
  let pausedOnLoss = false;
  let resourcesRecreated = false;
  let sceneRestored = false;
  let extension: LoseContextExtension | null = null;

  const publish = (): void => {
    window.__AURA3D_CONTEXT_LOSS_RECOVERY__ = {
      status: lifecycleStatus,
      extensionAvailable: Boolean(extension),
      beforeLoss,
      afterRestore,
      lostCount,
      restoredCount,
      recoveryCount,
      deviceLost: app.deviceLost(),
      pausedOnLoss,
      resourcesRecreated,
      sceneRestored,
      runtimeBackend: app.diagnostics().renderer.runtime.backend,
      rendererMode: app.diagnostics().renderer.rendererMode,
      lossSubscriptionActive,
      apiPresent: {
        onDeviceLost: typeof app.onDeviceLost === "function",
        onDeviceRestored: typeof app.onDeviceRestored === "function",
        deviceLost: typeof app.deviceLost === "function"
      }
    };
    status.value = `status=${lifecycleStatus} lost=${lostCount} restored=${restoredCount} subscription=${lossSubscriptionActive ? "active" : "detached"}`;
  };

  const unsubscribeLost = app.onDeviceLost(() => {
    app.pause();
    lostCount += 1;
    pausedOnLoss = app.runtime.paused;
    lifecycleStatus = "lost";
    loseButton.disabled = true;
    restoreButton.disabled = false;
    publish();
  });
  app.onDeviceRestored(() => {
    restoredCount += 1;
    lifecycleStatus = "recovering";
    publish();
    void (async () => {
      // Context restoration invalidates the old WebGL objects. Re-mounting the same public scene
      // disposes the old controller and creates a fresh device, programs, buffers, and textures.
      app.setScene(built);
      await app.ready();
      app.resume();
      app.step(1 / 60);
      const diagnostics = app.diagnostics();
      afterRestore = {
        litPixels: litPixels(canvas),
        pixelHash: pixelHash(canvas),
        runtimeMounted: diagnostics.renderer?.runtime.mounted === true
      };
      recoveryCount += 1;
      resourcesRecreated = diagnostics.renderer.runtime.backend === "production-runtime"
        && diagnostics.renderer.runtime.mounted
        && afterRestore.litPixels > 1_000;
      sceneRestored = afterRestore.litPixels > 1_000
        && beforeLoss.pixelHash !== "00000000"
        && afterRestore.pixelHash === beforeLoss.pixelHash;
      lifecycleStatus = "restored";
      loseButton.disabled = false;
      restoreButton.disabled = true;
      publish();
    })();
  });

  await app.ready();
  app.step(1 / 60);
  beforeLoss = {
    litPixels: litPixels(canvas),
    pixelHash: pixelHash(canvas),
    deviceLost: app.deviceLost()
  };
  extension = canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context") as LoseContextExtension | null;

  loseButton.disabled = !extension;
  loseButton.addEventListener("click", () => extension?.loseContext());
  restoreButton.addEventListener("click", () => extension?.restoreContext());
  unsubscribeButton.addEventListener("click", () => {
    if (!lossSubscriptionActive) return;
    unsubscribeLost();
    lossSubscriptionActive = false;
    unsubscribeButton.disabled = true;
    publish();
  });

  publish();
  window.addEventListener("beforeunload", () => app.dispose(), { once: true });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  window.__AURA3D_CONTEXT_LOSS_RECOVERY__ = {
    status: "error",
    extensionAvailable: false,
    beforeLoss: { litPixels: 0, pixelHash: "00000000", deviceLost: false },
    afterRestore: { litPixels: 0, pixelHash: "00000000", runtimeMounted: false },
    lostCount: 0,
    restoredCount: 0,
    recoveryCount: 0,
    deviceLost: false,
    pausedOnLoss: false,
    resourcesRecreated: false,
    sceneRestored: false,
    runtimeBackend: undefined,
    rendererMode: "error",
    lossSubscriptionActive: false,
    apiPresent: { onDeviceLost: false, onDeviceRestored: false, deviceLost: false },
    error: message
  };
  const status = document.querySelector<HTMLOutputElement>("#context-status");
  if (status) status.value = `error: ${message}`;
});
