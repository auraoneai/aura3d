// Hull-specific value objects derived from the candidate's coordinate needs.
// They do not implement the existing math package's vector or ray API.

/** A readable three-dimensional coordinate accepted by hull operations. */
export interface HullPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A ray described by an origin and a nonzero direction, without normalization. */
export interface HullRayLike {
  readonly origin: HullPoint3;
  readonly direction: HullPoint3;
}

/** A frozen coordinate value; hull inputs are checked when they are used. */
export class HullVector3 implements HullPoint3 {
  constructor(readonly x = 0, readonly y = 0, readonly z = 0) {
    Object.freeze(this);
  }

  length(): number { return Math.hypot(this.x, this.y, this.z); }
}

/**
 * A frozen ray that copies its inputs. Components must be finite and direction
 * must be nonzero; the direction's magnitude is retained rather than changed.
 */
export class HullRay implements HullRayLike {
  readonly origin: HullVector3;
  readonly direction: HullVector3;

  constructor(origin: HullPoint3, direction: HullPoint3) {
    const p = new HullVector3(origin.x, origin.y, origin.z);
    const d = new HullVector3(direction.x, direction.y, direction.z);
    if (![p.x, p.y, p.z, d.x, d.y, d.z].every(Number.isFinite)) {
      throw new RangeError("HullRay: coordinates must be finite");
    }
    if (d.x === 0 && d.y === 0 && d.z === 0) throw new RangeError("HullRay: direction must be nonzero");
    this.origin = p;
    this.direction = d;
    Object.freeze(this);
  }
}
