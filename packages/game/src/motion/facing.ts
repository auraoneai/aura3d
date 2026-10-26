// Orient an actor toward a target without guessing which way its model faces.
// Model forward axes are not standardised (Meshy GLBs face +Z, hand-built rigs often face -Z), so every
// model states its forward axis once and this helper derives the node yaw from it.

export type ForwardAxis = "+z" | "-z" | "+x" | "-x";

export interface FacingTarget {
  readonly x: number;
  readonly z: number;
}

export interface FaceTowardsOptions {
  /** Which local axis of the model points out of its face. Default "+z" (the glTF convention). */
  readonly forwardAxis?: ForwardAxis;
  /** Maximum turn in radians per second. Omit or pass Infinity to snap. */
  readonly turnRate?: number;
  /** Seconds since the last call. Required when turnRate is finite. */
  readonly dt?: number;
}

const AXIS_ANGLE: Record<ForwardAxis, number> = { "+z": 0, "+x": Math.PI / 2, "-z": Math.PI, "-x": -Math.PI / 2 };

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r > Math.PI) r -= twoPi;
  else if (r <= -Math.PI) r += twoPi;
  return r;
}

/**
 * The node Y rotation (radians, engine convention: rotation `t` about +Y maps +Z to (sin t, cos t)) that makes a model whose
 * forward is `forwardAxis` look along the world direction (dx, dz). Returns 0 for a zero direction.
 */
export function yawToFace(dx: number, dz: number, forwardAxis: ForwardAxis = "+z"): number {
  if (dx === 0 && dz === 0) return 0;
  return wrapAngle(Math.atan2(dx, dz) - AXIS_ANGLE[forwardAxis]);
}

/** The world heading (atan2(dx, dz), 0 = +Z) a node with yaw `yaw` actually faces, given its model's forward axis. */
export function visualHeading(yaw: number, forwardAxis: ForwardAxis = "+z"): number {
  return wrapAngle(yaw + AXIS_ANGLE[forwardAxis]);
}

/** Absolute angle in radians between where a node with `yaw` looks and the direction (dx, dz). 0 means facing it exactly. */
export function facingError(yaw: number, dx: number, dz: number, forwardAxis: ForwardAxis = "+z"): number {
  if (dx === 0 && dz === 0) return 0;
  return Math.abs(wrapAngle(Math.atan2(dx, dz) - visualHeading(yaw, forwardAxis)));
}

/**
 * Turn `current` yaw toward the yaw that faces `target` from `from`. Returns the new yaw. With a finite `turnRate` the turn is
 * limited to `turnRate * dt` per call and takes the short way round.
 */
export function faceTowards(current: number, from: FacingTarget, target: FacingTarget, options: FaceTowardsOptions = {}): number {
  const wanted = yawToFace(target.x - from.x, target.z - from.z, options.forwardAxis ?? "+z");
  const rate = options.turnRate;
  if (rate === undefined || !Number.isFinite(rate)) return wanted;
  const dt = options.dt;
  if (dt === undefined || !(dt >= 0)) throw new Error("faceTowards: a finite turnRate needs dt >= 0");
  const delta = wrapAngle(wanted - current);
  const step = Math.min(Math.abs(delta), rate * dt);
  return wrapAngle(current + Math.sign(delta) * step);
}
