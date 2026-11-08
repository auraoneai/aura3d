/**
 * Which curve the WebGL2 fused LDR present runs for `toneMapping: "neutral"`.
 *
 * - `"legacy"` (default): the per-channel `x (1 + x / 7.5) / (1 + x)` curve this route always ran. It is not Khronos PBR
 *   Neutral: scene white lands at 0.57 linear (sRGB ~198) and every channel is compressed on its own, which darkens and
 *   greys mid tones.
 * - `"khronos"`: Khronos PBR Neutral, the coupled curve the output pass (`NeutralToneMapping`), the WGSL output and the
 *   CPU reference (`neutralToneMapping`) compute: identity below the 0.76 knee apart from the dark offset.
 *
 * Per device, so one app's choice never reaches another canvas. The engine selects `"khronos"` for apps on the N3 plain
 * look path (no authored look or output); every other app keeps `"legacy"` and renders as before.
 */
export type NeutralToneCurve = "legacy" | "khronos";

const curves = new WeakMap<object, NeutralToneCurve>();

export function setNeutralToneCurve(device: object, curve: NeutralToneCurve): void {
  if (curve === "legacy") curves.delete(device);
  else curves.set(device, curve);
}

export function neutralToneCurve(device?: object | null): NeutralToneCurve {
  return (device ? curves.get(device) : undefined) ?? "legacy";
}
