/**
 * Minimal impulse-based rigid-body physics for axis-free boxes.
 *
 * Built procedurally (no external physics engine). Boxes are integrated with
 * semi-implicit Euler and resolved against static colliders (ground, tilted
 * ramp, containing walls) plus box-vs-box contacts using a sequential-impulse
 * solver with friction, restitution and Baumgarte positional correction.
 *
 * Box-vs-static collisions use the 8 corners of each box (corner-vs-plane),
 * which produces believable resting / tumbling on the tilted ramp. Box-vs-box
 * collisions use a bounding-sphere approximation, enough for a lively pile.
 */
import { Vector3, Quaternion, Matrix3, Matrix4 } from "three";

const GRAVITY = new Vector3(0, -19.6, 0);
const LINEAR_DAMPING = 0.01;
const ANGULAR_DAMPING = 0.04;
const RESTITUTION = 0.18;
const FRICTION = 0.55;
const SOLVER_ITERATIONS = 8;
const BAUMGARTE = 0.2; // positional-correction stiffness
const PENETRATION_SLOP = 0.005;

// Scratch objects reused across the hot loops to avoid per-frame allocation.
const _r = new Vector3();
const _rb = new Vector3();
const _vp = new Vector3();
const _vpb = new Vector3();
const _rel = new Vector3();
const _tmp = new Vector3();
const _tmp2 = new Vector3();
const _cross = new Vector3();
const _impulse = new Vector3();
const _omega = new Quaternion();
const _mat4 = new Matrix4();

export interface Contact {
  a: RigidBody;
  b: RigidBody | null; // null = static collider
  normal: Vector3; // unit, points from the surface into body `a`
  point: Vector3; // world contact point
  penetration: number;
}

export class RigidBody {
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  readonly velocity = new Vector3();
  readonly angularVelocity = new Vector3();
  readonly halfExtents: Vector3;
  readonly invMass: number;
  /** Diagonal of the inverse inertia tensor in body space. */
  private readonly invInertiaLocal: Vector3;
  /** Inverse inertia tensor in world space (rebuilt each step). */
  readonly invInertiaWorld = new Matrix3();
  /** Bounding-sphere radius used for cheap box-vs-box contacts. */
  readonly radius: number;

  constructor(halfExtents: Vector3, mass: number) {
    this.halfExtents = halfExtents.clone();
    this.invMass = mass > 0 ? 1 / mass : 0;
    this.radius = Math.max(halfExtents.x, halfExtents.y, halfExtents.z);

    const hx = halfExtents.x;
    const hy = halfExtents.y;
    const hz = halfExtents.z;
    // Solid box inertia: I_xx = (1/3) m (hy^2 + hz^2), etc.
    const ix = (3 * this.invMass) / (hy * hy + hz * hz);
    const iy = (3 * this.invMass) / (hx * hx + hz * hz);
    const iz = (3 * this.invMass) / (hx * hx + hy * hy);
    this.invInertiaLocal = new Vector3(ix, iy, iz);
  }

  updateInertiaWorld(): void {
    if (this.invMass === 0) {
      this.invInertiaWorld.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
      return;
    }
    const r = new Matrix3().setFromMatrix4(
      _mat4.makeRotationFromQuaternion(this.quaternion),
    );
    const rt = r.clone().transpose();
    const d = this.invInertiaLocal;
    const diag = new Matrix3().set(d.x, 0, 0, 0, d.y, 0, 0, 0, d.z);
    // Iinv_world = R * D * R^T
    this.invInertiaWorld.copy(r.multiply(diag).multiply(rt));
  }

  /** Apply an impulse `j` at world offset `r` from the centre of mass. */
  applyImpulse(j: Vector3, r: Vector3): void {
    if (this.invMass === 0) return;
    this.velocity.addScaledVector(j, this.invMass);
    _cross.crossVectors(r, j).applyMatrix3(this.invInertiaWorld);
    this.angularVelocity.add(_cross);
  }

  /** Velocity of the material point at world offset `r`. */
  pointVelocity(r: Vector3, out: Vector3): Vector3 {
    return out.crossVectors(this.angularVelocity, r).add(this.velocity);
  }

  integrate(dt: number): void {
    if (this.invMass === 0) return;

    this.velocity.addScaledVector(GRAVITY, dt);
    this.velocity.multiplyScalar(1 - LINEAR_DAMPING * dt);
    this.angularVelocity.multiplyScalar(1 - ANGULAR_DAMPING * dt);

    this.position.addScaledVector(this.velocity, dt);

    // Integrate orientation: q += 0.5 * dt * (omega_quat * q)
    const w = this.angularVelocity;
    _omega.set(w.x, w.y, w.z, 0).multiply(this.quaternion);
    this.quaternion.x += 0.5 * dt * _omega.x;
    this.quaternion.y += 0.5 * dt * _omega.y;
    this.quaternion.z += 0.5 * dt * _omega.z;
    this.quaternion.w += 0.5 * dt * _omega.w;
    this.quaternion.normalize();
  }
}

/** Static collider interface: tests one box corner and returns a contact. */
export interface StaticCollider {
  collideCorner(corner: Vector3, out: ContactScratch): boolean;
}

export interface ContactScratch {
  normal: Vector3;
  penetration: number;
}

/** Infinite half-space; bodies are kept on the +normal side of the plane. */
export class PlaneCollider implements StaticCollider {
  constructor(
    private readonly point: Vector3,
    private readonly normal: Vector3,
  ) {}

  collideCorner(corner: Vector3, out: ContactScratch): boolean {
    const d = _tmp.subVectors(corner, this.point).dot(this.normal);
    if (d < 0) {
      out.normal.copy(this.normal);
      out.penetration = -d;
      return true;
    }
    return false;
  }
}

/** Finite tilted slab — the ramp. Only the top face generates contacts. */
export class RampCollider implements StaticCollider {
  private readonly invQuat = new Quaternion();
  private readonly worldUp = new Vector3(0, 1, 0);

  constructor(
    private readonly center: Vector3,
    quaternion: Quaternion,
    private readonly halfX: number,
    private readonly halfZ: number,
    private readonly thickness: number,
  ) {
    this.invQuat.copy(quaternion).invert();
    this.worldUp.set(0, 1, 0).applyQuaternion(quaternion).normalize();
  }

  collideCorner(corner: Vector3, out: ContactScratch): boolean {
    const local = _tmp.subVectors(corner, this.center).applyQuaternion(
      this.invQuat,
    );
    if (
      local.y < 0 &&
      local.y > -this.thickness &&
      Math.abs(local.x) <= this.halfX &&
      Math.abs(local.z) <= this.halfZ
    ) {
      out.normal.copy(this.worldUp);
      out.penetration = -local.y;
      return true;
    }
    return false;
  }
}

export class PhysicsWorld {
  readonly bodies: RigidBody[] = [];
  readonly statics: StaticCollider[] = [];
  /** Number of contacts resolved in the most recent step. */
  contactCount = 0;

  private readonly contacts: Contact[] = [];
  private readonly cornerScratch = new Vector3();
  private readonly scratch: ContactScratch = {
    normal: new Vector3(),
    penetration: 0,
  };
  private readonly corners: Vector3[] = Array.from(
    { length: 8 },
    () => new Vector3(),
  );

  addBody(body: RigidBody): void {
    this.bodies.push(body);
  }

  addStatic(collider: StaticCollider): void {
    this.statics.push(collider);
  }

  /** Advance the simulation by `dt` seconds using `substeps` substeps. */
  step(dt: number, substeps = 2): void {
    const h = dt / substeps;
    let count = 0;
    for (let s = 0; s < substeps; s++) {
      for (const b of this.bodies) {
        b.integrate(h);
        b.updateInertiaWorld();
      }
      this.generateContacts();
      this.solveVelocities();
      this.correctPositions();
      count = this.contacts.length;
    }
    this.contactCount = count;
  }

  private acquireContact(): Contact {
    const c = this.contacts;
    if (this.contactPool.length > 0) {
      const reused = this.contactPool.pop()!;
      c.push(reused);
      return reused;
    }
    const fresh: Contact = {
      a: this.bodies[0],
      b: null,
      normal: new Vector3(),
      point: new Vector3(),
      penetration: 0,
    };
    c.push(fresh);
    return fresh;
  }
  private readonly contactPool: Contact[] = [];

  private generateContacts(): void {
    // Recycle contact objects.
    for (const c of this.contacts) this.contactPool.push(c);
    this.contacts.length = 0;

    // Box corners vs static colliders.
    for (const body of this.bodies) {
      this.computeCorners(body);
      for (const corner of this.corners) {
        for (const collider of this.statics) {
          if (collider.collideCorner(corner, this.scratch)) {
            const c = this.acquireContact();
            c.a = body;
            c.b = null;
            c.normal.copy(this.scratch.normal);
            c.point.copy(corner);
            c.penetration = this.scratch.penetration;
          }
        }
      }
    }

    // Box vs box (bounding-sphere approximation).
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const minDist = a.radius + b.radius;
        _tmp.subVectors(a.position, b.position);
        const distSq = _tmp.lengthSq();
        if (distSq < minDist * minDist && distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const c = this.acquireContact();
          c.a = a;
          c.b = b;
          c.normal.copy(_tmp).multiplyScalar(1 / dist); // from b toward a
          c.point
            .copy(a.position)
            .add(b.position)
            .multiplyScalar(0.5);
          c.penetration = minDist - dist;
        }
      }
    }
  }

  private computeCorners(body: RigidBody): void {
    const h = body.halfExtents;
    let k = 0;
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sy = -1; sy <= 1; sy += 2) {
        for (let sz = -1; sz <= 1; sz += 2) {
          this.corners[k++]
            .set(sx * h.x, sy * h.y, sz * h.z)
            .applyQuaternion(body.quaternion)
            .add(body.position);
        }
      }
    }
  }

  private solveVelocities(): void {
    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      for (const c of this.contacts) {
        this.resolveContact(c);
      }
    }
  }

  private resolveContact(c: Contact): void {
    const a = c.a;
    const b = c.b;
    const n = c.normal;

    _r.subVectors(c.point, a.position);
    a.pointVelocity(_r, _vp);
    if (b) {
      _rb.subVectors(c.point, b.position);
      b.pointVelocity(_rb, _vpb);
      _rel.subVectors(_vp, _vpb);
    } else {
      _rel.copy(_vp);
    }

    const vn = _rel.dot(n);
    if (vn > 0) return; // separating

    const effMass = this.effectiveMass(a, b, _r, _rb, n);
    if (effMass <= 0) return;

    let jn = (-(1 + RESTITUTION) * vn) / effMass;
    if (jn < 0) jn = 0;

    _impulse.copy(n).multiplyScalar(jn);
    a.applyImpulse(_impulse, _r);
    if (b) {
      _impulse.copy(n).multiplyScalar(-jn);
      b.applyImpulse(_impulse, _rb);
    }

    // Friction along the tangential component of the relative velocity.
    a.pointVelocity(_r, _vp);
    if (b) {
      b.pointVelocity(_rb, _vpb);
      _rel.subVectors(_vp, _vpb);
    } else {
      _rel.copy(_vp);
    }
    _tmp2.copy(n).multiplyScalar(_rel.dot(n));
    const tangent = _tmp.subVectors(_rel, _tmp2);
    const tLen = tangent.length();
    if (tLen > 1e-6) {
      tangent.multiplyScalar(1 / tLen);
      const tMass = this.effectiveMass(a, b, _r, _rb, tangent);
      if (tMass > 0) {
        let jt = -_rel.dot(tangent) / tMass;
        const maxF = FRICTION * jn;
        if (jt > maxF) jt = maxF;
        else if (jt < -maxF) jt = -maxF;
        _impulse.copy(tangent).multiplyScalar(jt);
        a.applyImpulse(_impulse, _r);
        if (b) {
          _impulse.copy(tangent).multiplyScalar(-jt);
          b.applyImpulse(_impulse, _rb);
        }
      }
    }
  }

  /** Effective mass along `n` for the (a,b) contact at offsets _r/_rb. */
  private effectiveMass(
    a: RigidBody,
    b: RigidBody | null,
    ra: Vector3,
    rb: Vector3,
    n: Vector3,
  ): number {
    let m = a.invMass;
    _cross.crossVectors(ra, n).applyMatrix3(a.invInertiaWorld);
    _cross.cross(ra);
    m += _cross.dot(n);
    if (b) {
      m += b.invMass;
      _cross.crossVectors(rb, n).applyMatrix3(b.invInertiaWorld);
      _cross.cross(rb);
      m += _cross.dot(n);
    }
    return m;
  }

  private correctPositions(): void {
    for (const c of this.contacts) {
      const corr =
        (Math.max(c.penetration - PENETRATION_SLOP, 0) * BAUMGARTE);
      if (corr <= 0) continue;
      if (c.b) {
        const total = c.a.invMass + c.b.invMass;
        if (total <= 0) continue;
        c.a.position.addScaledVector(c.normal, (corr * c.a.invMass) / total);
        c.b.position.addScaledVector(c.normal, (-corr * c.b.invMass) / total);
      } else {
        c.a.position.addScaledVector(c.normal, corr);
      }
    }
  }
}
