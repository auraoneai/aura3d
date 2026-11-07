// Measurement hook shared by the before/after pages. It does not touch the scene: it exposes the subject's world
// bounds and the live camera pose so the capture tool can compute the subject's fraction of the frame
// (larger of projected height / width, the same definition camera.frame solves for) at the instant of capture.
import { measureFrameFill, type AuraFrameBounds } from "@aura3d/engine";

export interface CameraPoseLike {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

export function record(getBounds: () => AuraFrameBounds, getPose: () => CameraPoseLike): void {
  (window as unknown as { __f514: unknown }).__f514 = {
    measure: (aspect: number) => measureFrameFill(getBounds(), getPose() as never, aspect),
    bounds: () => getBounds(),
    pose: () => getPose()
  };
}
