import { camera } from "@aura3d/engine";
import type { Vec3 } from "../contract/units";

export const CAMERA_EYE: Vec3 = [0, 25.5, 37.1];
export const CAMERA_TARGET: Vec3 = [0, 0, 0.7];
export const CAMERA_FOV_DEG = 15;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 180;

/**
 * Horizontal half-width the court camera must keep, as tan(half horizontal FOV): 0.19 keeps both doubles sidelines and an
 * athlete stretched wide of them (x = +-7 m at the near baseline, about 38.7 m from the eye) inside the frame.
 */
export const CAMERA_MIN_TAN_HALF_HFOV = 0.19;
/** Widest vertical FOV the aspect compensation may use (tall, narrow canvases). */
export const CAMERA_MAX_FOV_DEG = 60;

/**
 * Aspect-aware vertical FOV (C2). Wide canvases keep the live 15 degrees, so desktop frames do not change (it applies at
 * aspect >= 1.44, which includes 16:10 and 16:9). Narrower canvases widen the vertical FOV until the horizontal coverage
 * reaches `CAMERA_MIN_TAN_HALF_HFOV`, so both athletes stay in frame on a portrait phone.
 */
export function cameraFovForAspect(aspect: number): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const base = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const need = CAMERA_MIN_TAN_HALF_HFOV / a;
  if (need <= base) return CAMERA_FOV_DEG;
  return Math.min(CAMERA_MAX_FOV_DEG, (Math.atan(need) * 360) / Math.PI);
}

export function cameraNode() {
  return camera.perspective({ fov: CAMERA_FOV_DEG, near: CAMERA_NEAR, far: CAMERA_FAR, position: [...CAMERA_EYE], target: [...CAMERA_TARGET] });
}

export interface ProjectedPoint { x: number; y: number; visible: boolean; ndc: Vec3 }

/** Pinhole projection of a scene-space point to canvas pixels for the fixed court camera (HUD anchors), with the aspect-aware FOV. */
export function projectWorldPoint(viewportWidth: number, viewportHeight: number, wx: number, wy: number, wz: number, fovDeg?: number): ProjectedPoint {
  const fxRaw = CAMERA_TARGET[0] - CAMERA_EYE[0];
  const fyRaw = CAMERA_TARGET[1] - CAMERA_EYE[1];
  const fzRaw = CAMERA_TARGET[2] - CAMERA_EYE[2];
  const fLen = Math.hypot(fxRaw, fyRaw, fzRaw) || 1;
  const fx = fxRaw / fLen;
  const fy = fyRaw / fLen;
  const fz = fzRaw / fLen;
  const rLen = Math.hypot(fz, fx) || 1;
  const rx = -fz / rLen;
  const ry = 0;
  const rz = fx / rLen;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const dx = wx - CAMERA_EYE[0];
  const dy = wy - CAMERA_EYE[1];
  const dz = wz - CAMERA_EYE[2];
  const cx = dx * rx + dy * ry + dz * rz;
  const cy = dx * ux + dy * uy + dz * uz;
  const cz = -(dx * fx + dy * fy + dz * fz);
  if (cz >= -0.1) return { x: viewportWidth * 0.5, y: viewportHeight * 0.5, visible: false, ndc: [0, 0, 2] };
  const aspect = Math.max(0.2, viewportWidth / Math.max(1, viewportHeight));
  const tanHalfFov = Math.tan(((fovDeg ?? cameraFovForAspect(viewportWidth / Math.max(1, viewportHeight))) * Math.PI) / 360);
  const ndcX = cx / (-cz * tanHalfFov * aspect);
  const ndcY = cy / (-cz * tanHalfFov);
  const screenX = (ndcX + 1) * 0.5 * viewportWidth;
  const screenY = (1 - ndcY) * 0.5 * viewportHeight;
  const visible = Math.abs(ndcX) <= 1.05 && Math.abs(ndcY) <= 1.05 && cz < -0.1;
  return { x: screenX, y: screenY, visible, ndc: [ndcX, ndcY, 0.5] };
}
