import { WebGL2Device } from "../WebGL2Device";
import type { RenderDevice } from "../RenderDevice";

// Do not bypass application overrides of these public entry points. The
// packed-frame owner independently checks draw and resource/fence methods.
const tryCombined = WebGL2Device.prototype.tryMultiDrawElementsInstanced;
const supportsCombined = WebGL2Device.prototype.supportsMultiDrawElementsInstanced;

/** Capability and method identity only, never proof of a safe draw. */
export function combinedWebGLDevice(device: RenderDevice): device is WebGL2Device {
  try {
    return device instanceof WebGL2Device && Object.getPrototypeOf(device) === WebGL2Device.prototype
      && device.tryMultiDrawElementsInstanced === tryCombined && device.supportsMultiDrawElementsInstanced === supportsCombined
      && !device.disposed && !device.contextLost && supportsCombined.call(device);
  } catch { return false; }
}
