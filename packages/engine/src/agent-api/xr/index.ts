import { createXRButton } from "./xrButton.js";
import { createAuraXRRuntime } from "./xrRuntime.js";
import { attachXRSceneHelpers, createXRSceneHelpers } from "./XRSceneHelpers.js";

/**
 * threejs-parity SC-04: WebXR entry points. `xr.button()` is three's
 * `VRButton`/`ARButton`; `app.xr` is the session runtime. The unit suite uses fake
 * XR objects; `tests/browser/parity-xr.spec.ts` additionally runs it against the
 * independent iwer WebXR emulator. A real headset or native browser is untested.
 */
export const xr = Object.freeze({
  button: createXRButton,
  createRuntime: createAuraXRRuntime,
  createSceneHelpers: createXRSceneHelpers,
  attachSceneHelpers: attachXRSceneHelpers
});

export { createAuraXRRuntime } from "./xrRuntime.js";
export type { AuraXRLayerConstructor, AuraXRLayerInit, AuraXRRuntimeOptions, AuraXRWebGLBindingConstructor } from "./xrRuntime.js";
export { attachXRSceneHelpers, createXRSceneHelpers } from "./XRSceneHelpers.js";
export type { AuraXRSceneHelperOptions, AuraXRSceneHelpers, AuraXRVisual } from "./XRSceneHelpers.js";
export { createXRButton } from "./xrButton.js";
export type {
  AuraXRButtonDocumentLike,
  AuraXRButtonElementLike,
  AuraXRButtonHandle,
  AuraXRButtonLabels,
  AuraXRButtonOptions,
  AuraXRButtonState
} from "./xrButton.js";
export { applyXRViewOverride, getXRViewCamera, setXRViewCamera } from "./xrViewOverride.js";
export type {
  AuraXRDeviceBridge,
  AuraXREnterResult,
  AuraXREventMap,
  AuraXREventName,
  AuraXRFrameEvent,
  AuraXRMode,
  AuraXRRuntime,
  AuraXRSessionInit,
  AuraXRSessionProvenance,
  AuraXRViewCamera
} from "./types.js";
