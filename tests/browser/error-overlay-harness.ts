import { createAuraApp, lights, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __AURA3D_ERROR_OVERLAY__?: {
      status: "waiting" | "ready";
      overlayAttached: boolean;
      readyRejected: boolean;
      error?: string;
    };
  }
}

const mount = document.getElementById("mount");
const canvas = document.createElement("canvas");
canvas.width = 640;
canvas.height = 360;
mount?.append(canvas);

// Deterministic renderer-mount failure: every context request returns null, so
// the production mount path rejects like a device with no GL support.
canvas.getContext = (() => null) as never;

const result = {
  status: "waiting",
  overlayAttached: false,
  readyRejected: false,
  error: undefined as string | undefined
};
window.__AURA3D_ERROR_OVERLAY__ = result as Window["__AURA3D_ERROR_OVERLAY__"];

try {
  const app = createAuraApp(canvas, {
    scene: scene().add(primitives.box()).add(lights.studio({ intensity: 1 })),
    strict: true,
    pixelRatio: 1,
    resize: false
  });
  await app.ready().then(
    () => {
      result.error = "ready() resolved despite mount failure";
    },
    () => {
      result.readyRejected = true;
    }
  );
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
}
result.overlayAttached = Boolean(canvas.parentElement?.querySelector('[data-aura3d-error-overlay="true"]'));
result.status = "ready";
