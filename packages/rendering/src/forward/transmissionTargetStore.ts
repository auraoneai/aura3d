/**
 * Latest captured transmission target (PRD-04 P4-2, T0-05 review).
 *
 * The capture pass publishes the opaque-scene copy on the frame blackboard
 * under `prd04.transmissionTarget`. Per-draw C-02 `bindUniforms` gets no frame
 * context, so the capture also records it here and the
 * `prd04.transmissionTarget` feature binds it as
 * `a3d_prd04_transmissionSampler` / `a3d_prd04_transmissionSamplerSize`.
 * Module store: the last captured frame wins, which matches the single
 * renderer per page that lane 04 targets today (same pattern as the prd07
 * wetness store). A material that pins `u_prd04TransmissionTarget` still wins.
 */
import type { Texture } from "../Texture.js";

export interface CapturedTransmissionTarget {
  readonly texture: Texture;
  readonly width: number;
  readonly height: number;
}

let latest: CapturedTransmissionTarget | undefined;

export function setCapturedTransmissionTarget(target: CapturedTransmissionTarget | undefined): void {
  latest = target;
}

export function capturedTransmissionTarget(): CapturedTransmissionTarget | undefined {
  return latest;
}
