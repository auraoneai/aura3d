// Pip's Big Leap — follow-camera framing per viewport aspect (pure).
//
// The desktop framing (52 deg vertical FOV, 4.5 m boom) is kept at aspect
// >= 1. Narrower viewports widen the vertical FOV and lengthen the boom so a
// 390x844 phone still sees the platform ahead: at aspect 0.46 the FOV is
// 68 deg (about 34 deg horizontal instead of 25) and the boom 5.6 m.

export interface Framing {
  readonly fov: number;
  readonly boom: number;
}

const DESKTOP: Framing = { fov: 52, boom: 4.5 };
const PORTRAIT: Framing = { fov: 68, boom: 5.6 };
const PORTRAIT_ASPECT = 0.46;

export function framingFor(aspect: number): Framing {
  if (!(aspect > 0) || aspect >= 1) return DESKTOP;
  const k = Math.min(1, (1 - aspect) / (1 - PORTRAIT_ASPECT));
  return {
    fov: DESKTOP.fov + (PORTRAIT.fov - DESKTOP.fov) * k,
    boom: DESKTOP.boom + (PORTRAIT.boom - DESKTOP.boom) * k
  };
}

/** Horizontal FOV in degrees for a vertical FOV and aspect. */
export function horizontalFov(fovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI;
}
