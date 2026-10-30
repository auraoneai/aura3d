/**
 * GD-17 remainder (GU47 WP-14): the skippable 3-shot boot intro from static rigs, and the results depth of field.
 * Presentation only. The intro is a camera sequence over the live first seconds of the shift (the sim is not paused or
 * changed; the street keeps scrolling past the car), any key or tap skips it on the next frame, and it never plays on
 * reduced motion, under `?intro=0`, in a QA/capture boot (`?qa`, `?autoplay`) or with an engine A/B query.
 */
import type { AuraCameraPose } from "@aura3d/engine";
import { SCENE_CAM_FOV_DEG } from "./rules";

export const INTRO_SHOT_S = 1.4;

/** Three static shots around the car at view (carX, carZ): low front three-quarter, kerb-side profile, high avenue. */
export function introShots(carX: number, carZ: number): Partial<AuraCameraPose>[] {
  const car: [number, number, number] = [carX, 0.8, carZ];
  return [
    { position: [carX + 3.6, 1.0, carZ - 7.5], target: car, fov: 44 },
    { position: [carX + 6.2, 1.5, carZ + 0.4], target: [carX, 0.9, carZ - 0.6], fov: 40 },
    { position: [carX + 1.5, 15, carZ + 14], target: [carX, 1.5, carZ - 45], fov: SCENE_CAM_FOV_DEG }
  ];
}

export function introEnabled(o: { readonly motionOk: boolean; readonly params: URLSearchParams }): boolean {
  if (!o.motionOk) return false;
  const p = o.params;
  if (p.get("intro") === "0" || p.has("qa") || p.has("autoplay") || p.has("aura3d-tonemap") || p.has("tm")) return false;
  return true;
}

/**
 * Results-screen depth of field: focus on the car, the avenue behind it softens while the summary card is up. Off on
 * reduced motion (PRD §6.3: the row's camera effects are all off when motionOk() is false).
 */
export function resultsDof(carDistance: number): { focusDistance: number; fStop: number; focalLength: number; maxBlur: number } {
  return { focusDistance: Math.max(1, carDistance), fStop: 2.2, focalLength: 50, maxBlur: 0.012 };
}
