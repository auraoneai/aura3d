/**
 * Whether a device's output keeps colour alpha, so colour alpha must carry opacity and nothing else.
 *
 * The post path normally stores the `prd03.indirectFraction` tag (`2 + f_ind`) in the HDR colour alpha for the AO apply.
 * Under alpha-preserving output (`alphaMode` `"straight"` or `"premultiplied"` with a premultiplied input) that channel is
 * the canvas opacity: a multisample-resolved edge mixes the tag with the clear's 0 and comes out opaque and dark, and
 * WebGPU refuses the tagged programs outright (`WEBGPU_INDIRECT_FRACTION_TARGET_UNSUPPORTED`, blank frame). Such devices
 * draw untagged programs instead; the AO apply then takes its conservative fallback weight for every pixel, as it does
 * for custom shaders.
 *
 * Per device, set by the renderer from its output options. A WebGPU canvas that presents alpha also counts: its
 * generated-program validation already rejects the tag there, so leaving it off can only turn a failed frame into a
 * rendered one. Opaque output (the default) never matches, so its programs and pixels are unchanged.
 */
const preservingDevices = new WeakSet<object>();

interface AlphaPresentingDevice {
  readonly kind?: string;
  getPresentationAlphaMode?(): "opaque" | "straight" | "premultiplied" | undefined;
}

export function setOutputAlphaPreserving(device: object, preserving: boolean): void {
  if (preserving) preservingDevices.add(device);
  else preservingDevices.delete(device);
}

export function outputAlphaPreserving(device?: object | null): boolean {
  if (!device) return false;
  if (preservingDevices.has(device)) return true;
  const presenting = device as AlphaPresentingDevice;
  if (presenting.kind !== "webgpu" || typeof presenting.getPresentationAlphaMode !== "function") return false;
  try {
    const alpha = presenting.getPresentationAlphaMode();
    return alpha === "straight" || alpha === "premultiplied";
  } catch {
    return false;
  }
}
