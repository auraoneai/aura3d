import { createXRButton } from "./xrButton.js";
import { createAuraXRRuntime } from "./xrRuntime.js";

/**
 * threejs-parity SC-04: WebXR entry points. `xr.button()` is three's
 * `VRButton`/`ARButton`; `app.xr` is the session runtime. Real headset and
 * browser behaviour is not covered by the unit suite (fake XR objects only).
 */
export const xr = Object.freeze({
  button: createXRButton,
  createRuntime: createAuraXRRuntime
});

export { createAuraXRRuntime } from "./xrRuntime.js";
export type { AuraXRLayerConstructor, AuraXRLayerInit, AuraXRRuntimeOptions } from "./xrRuntime.js";
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
  AuraXRViewCamera
} from "./types.js";
