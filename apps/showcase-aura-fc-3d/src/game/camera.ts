// Aura FC 3D — camera framing helpers (pure, unit-tested in tests/unit/aura-fc-3d/audit-fixes.test.ts).

type Vec3 = [number, number, number];

/** Widest vertical FOV the portrait fit may use before it pulls the eye back instead (degrees). */
export const PORTRAIT_MAX_FOV = 62;
/** The fit keeps the horizontal coverage the shot has at this aspect (about 20 m of pitch for the broadcast rig). */
export const DESIGN_MIN_ASPECT = 1.3;

/**
 * FC-09: the director authors every shot for a landscape frame. On a narrower screen (portrait phone) keep the
 * horizontal coverage the shot would have at DESIGN_MIN_ASPECT: widen the vertical FOV up to PORTRAIT_MAX_FOV, then
 * move the eye back along its view line for the rest. Landscape frames pass through unchanged.
 */
export function fitCameraToAspect(eye: Vec3, target: Vec3, fovDeg: number, aspect: number): { eye: Vec3; fov: number } {
  if (!(aspect > 0) || aspect >= DESIGN_MIN_ASPECT) return { eye, fov: fovDeg };
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  // tan of the vertical half-angle that gives the design horizontal coverage at this aspect
  const want = (tanHalf * DESIGN_MIN_ASPECT) / aspect;
  const capped = Math.tan((PORTRAIT_MAX_FOV * Math.PI) / 360);
  const useTan = Math.min(want, capped);
  const fov = (Math.atan(useTan) * 360) / Math.PI;
  const pull = want / useTan;   // >= 1: how much further back the eye goes
  const dx = eye[0] - target[0], dy = eye[1] - target[1], dz = eye[2] - target[2];
  return { eye: [target[0] + dx * pull, target[1] + dy * pull, target[2] + dz * pull], fov };
}

/** Width of ground (m) a camera covers across the frame at its target distance. */
export function horizontalCoverage(eye: Vec3, target: Vec3, fovDeg: number, aspect: number): number {
  const d = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
  return 2 * d * Math.tan((fovDeg * Math.PI) / 360) * aspect;
}
