import { Quaternion, Vector3 } from 'three';

/**
 * Small deterministic rigid-body engine: boxes, spheres, an infinite ground plane,
 * sequential-impulse contact solver with Coulomb friction, and body sleeping.
 */

export type Shape = 'box' | 'sphere' | 'plane';

export class Body {
  readonly pos = new Vector3();
  readonly q = new Quaternion();
  readonly qInv = new Quaternion();
  readonly v = new Vector3();
  readonly w = new Vector3();
  readonly half = new Vector3();
  radius = 0;
  boundR = 0;
  invMass = 0;
  readonly invInertia = new Vector3();
  mu = 0.5;
  linDamp = 0.02;
  angDamp = 0.05;
  asleep = false;
  locked = false;
  sleepTimer = 0;
  /** effective inverse mass for the current step (0 for static / sleeping) */
  inv = 0;

  readonly initPos = new Vector3();
  readonly initQ = new Quaternion();
  initAsleep = false;
  initLocked = false;

  constructor(readonly shape: Shape, readonly isStatic: boolean) {}

  static box(size: Vector3, mass: number, pos: Vector3, q: Quaternion, isStatic: boolean): Body {
    const b = new Body('box', isStatic);
    b.half.set(size.x / 2, size.y / 2, size.z / 2);
    b.boundR = b.half.length();
    b.pos.copy(pos);
    b.q.copy(q);
    if (!isStatic) {
      b.invMass = 1 / mass;
      const k = mass / 12;
      b.invInertia.set(
        1 / (k * (size.y * size.y + size.z * size.z)),
        1 / (k * (size.x * size.x + size.z * size.z)),
        1 / (k * (size.x * size.x + size.y * size.y)),
      );
    }
    b.saveInitial();
    return b;
  }

  static sphere(radius: number, mass: number, pos: Vector3): Body {
    const b = new Body('sphere', false);
    b.radius = radius;
    b.boundR = radius;
    b.pos.copy(pos);
    b.invMass = 1 / mass;
    const i = 1 / ((2 / 5) * mass * radius * radius);
    b.invInertia.set(i, i, i);
    b.saveInitial();
    return b;
  }

  static plane(): Body {
    return new Body('plane', true);
  }

  saveInitial(): void {
    this.initPos.copy(this.pos);
    this.initQ.copy(this.q);
    this.initAsleep = this.asleep;
    this.initLocked = this.locked;
  }

  reset(): void {
    this.pos.copy(this.initPos);
    this.q.copy(this.initQ);
    this.v.set(0, 0, 0);
    this.w.set(0, 0, 0);
    this.asleep = this.initAsleep;
    this.locked = this.initLocked;
    this.sleepTimer = 0;
  }

  wake(): void {
    this.asleep = false;
    this.sleepTimer = 0;
  }
}

interface Contact {
  a: Body;
  b: Body;
  n: Vector3; // from a to b
  p: Vector3;
  depth: number;
  ra: Vector3;
  rb: Vector3;
  t1: Vector3;
  t2: Vector3;
  mn: number;
  mt1: number;
  mt2: number;
  accN: number;
  accT1: number;
  accT2: number;
  mu: number;
  bias: number;
}

const GRAVITY = 9.81;
const MARGIN = 0.003;
const SLOP = 0.004;
const BAUMGARTE = 0.2;
const MAX_BIAS = 1.5;
const ITERATIONS = 16;
const WAKE_SPEED = 0.15;
const SLEEP_LIN = 0.03;
const SLEEP_ANG = 0.08;
const SLEEP_TIME = 0.5;

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpD = new Vector3();
const tmpQ = new Quaternion();

function applyInvI(b: Body, t: Vector3, out: Vector3): Vector3 {
  out.copy(t).applyQuaternion(b.qInv);
  out.set(out.x * b.invInertia.x, out.y * b.invInertia.y, out.z * b.invInertia.z);
  return out.applyQuaternion(b.q);
}

function speedMeasure(b: Body): number {
  return b.v.length() + 0.5 * b.w.length();
}

export class World {
  readonly bodies: Body[] = [];
  readonly ground = Body.plane();
  private contacts: Contact[] = [];

  add(b: Body): Body {
    this.bodies.push(b);
    return b;
  }

  reset(): void {
    for (const b of this.bodies) b.reset();
  }

  step(dt: number): void {
    const bodies = this.bodies;
    for (const b of bodies) b.qInv.copy(b.q).invert();

    this.contacts = [];
    this.generateContacts();

    for (const b of bodies) b.inv = b.isStatic || b.asleep ? 0 : b.invMass;

    for (const b of bodies) {
      if (b.inv > 0) b.v.y -= GRAVITY * dt;
    }

    for (const c of this.contacts) this.preStep(c, dt);
    for (let it = 0; it < ITERATIONS; it++) {
      for (const c of this.contacts) this.solve(c);
    }

    for (const b of bodies) {
      if (b.inv === 0) continue;
      const ld = 1 / (1 + b.linDamp * dt);
      const ad = 1 / (1 + b.angDamp * dt);
      b.v.multiplyScalar(ld);
      b.w.multiplyScalar(ad);
      b.pos.addScaledVector(b.v, dt);
      tmpQ.set(b.w.x, b.w.y, b.w.z, 0).multiply(b.q);
      b.q.set(
        b.q.x + 0.5 * dt * tmpQ.x,
        b.q.y + 0.5 * dt * tmpQ.y,
        b.q.z + 0.5 * dt * tmpQ.z,
        b.q.w + 0.5 * dt * tmpQ.w,
      ).normalize();

      if (!b.locked) {
        if (b.v.length() < SLEEP_LIN && b.w.length() < SLEEP_ANG) {
          b.sleepTimer += dt;
          if (b.sleepTimer > SLEEP_TIME) {
            b.asleep = true;
            b.v.set(0, 0, 0);
            b.w.set(0, 0, 0);
          }
        } else {
          b.sleepTimer = 0;
        }
      }
    }
  }

  // ---------------------------------------------------------------- contacts

  private addContact(a: Body, b: Body, n: Vector3, p: Vector3, depth: number): void {
    this.contacts.push({
      a,
      b,
      n,
      p,
      depth,
      ra: new Vector3(),
      rb: new Vector3(),
      t1: new Vector3(),
      t2: new Vector3(),
      mn: 0,
      mt1: 0,
      mt2: 0,
      accN: 0,
      accT1: 0,
      accT2: 0,
      mu: Math.sqrt(a.mu * b.mu),
      bias: 0,
    });
  }

  private generateContacts(): void {
    const bodies = this.bodies;
    const ground = this.ground;
    ground.mu = 0.6;

    for (const b of bodies) {
      if (b.isStatic || b.asleep) continue;
      if (b.shape === 'sphere') {
        const depth = b.radius - b.pos.y;
        if (depth > -MARGIN) {
          this.addContact(ground, b, new Vector3(0, 1, 0), new Vector3(b.pos.x, 0, b.pos.z), depth);
        }
      } else if (b.shape === 'box') {
        for (let i = 0; i < 8; i++) {
          this.corner(b, i, tmpA);
          if (tmpA.y < MARGIN) {
            this.addContact(ground, b, new Vector3(0, 1, 0), tmpA.clone(), -tmpA.y);
          }
        }
      }
    }

    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        if (A.isStatic && B.isStatic) continue;
        const lim = A.boundR + B.boundR + 0.05;
        if (A.pos.distanceToSquared(B.pos) > lim * lim) continue;

        // wake sleeping bodies that are touched by a moving one
        if (A.asleep && !A.locked && !B.isStatic && !B.asleep && speedMeasure(B) > WAKE_SPEED) A.wake();
        if (B.asleep && !B.locked && !A.isStatic && !A.asleep && speedMeasure(A) > WAKE_SPEED) B.wake();

        const aDyn = !A.isStatic && !A.asleep;
        const bDyn = !B.isStatic && !B.asleep;
        if (!aDyn && !bDyn) continue;

        if (A.shape === 'box' && B.shape === 'box') {
          this.boxCorners(A, B);
          this.boxCorners(B, A);
        } else if (A.shape === 'box' && B.shape === 'sphere') {
          this.sphereBox(B, A);
        } else if (A.shape === 'sphere' && B.shape === 'box') {
          this.sphereBox(A, B);
        }
      }
    }
  }

  private corner(b: Body, i: number, out: Vector3): Vector3 {
    out.set(
      i & 1 ? b.half.x : -b.half.x,
      i & 2 ? b.half.y : -b.half.y,
      i & 4 ? b.half.z : -b.half.z,
    );
    return out.applyQuaternion(b.q).add(b.pos);
  }

  /** corners of `src` that lie inside `dst`; contact normal points from dst to src */
  private boxCorners(src: Body, dst: Body): void {
    const h = dst.half;
    for (let i = 0; i < 8; i++) {
      this.corner(src, i, tmpA);
      tmpB.copy(tmpA).sub(dst.pos).applyQuaternion(dst.qInv);
      const px = h.x + MARGIN - Math.abs(tmpB.x);
      const py = h.y + MARGIN - Math.abs(tmpB.y);
      const pz = h.z + MARGIN - Math.abs(tmpB.z);
      if (px <= 0 || py <= 0 || pz <= 0) continue;
      const n = new Vector3();
      let depth: number;
      if (px <= py && px <= pz) {
        n.set(Math.sign(tmpB.x) || 1, 0, 0);
        depth = px;
      } else if (py <= pz) {
        n.set(0, Math.sign(tmpB.y) || 1, 0);
        depth = py;
      } else {
        n.set(0, 0, Math.sign(tmpB.z) || 1);
        depth = pz;
      }
      n.applyQuaternion(dst.q);
      this.addContact(dst, src, n, tmpA.clone(), depth);
    }
  }

  private sphereBox(s: Body, box: Body): void {
    const h = box.half;
    const l = tmpB.copy(s.pos).sub(box.pos).applyQuaternion(box.qInv);
    const c = tmpC.set(
      Math.max(-h.x, Math.min(h.x, l.x)),
      Math.max(-h.y, Math.min(h.y, l.y)),
      Math.max(-h.z, Math.min(h.z, l.z)),
    );
    const diff = tmpD.copy(l).sub(c);
    const dist = diff.length();
    if (dist > s.radius + MARGIN) return;
    const n = new Vector3();
    let depth: number;
    if (dist > 1e-8) {
      n.copy(diff).divideScalar(dist);
      depth = s.radius - dist;
    } else {
      const dx = h.x - Math.abs(l.x);
      const dy = h.y - Math.abs(l.y);
      const dz = h.z - Math.abs(l.z);
      if (dx <= dy && dx <= dz) {
        n.set(Math.sign(l.x) || 1, 0, 0);
        c.x = n.x * h.x;
        depth = s.radius + dx;
      } else if (dy <= dz) {
        n.set(0, Math.sign(l.y) || 1, 0);
        c.y = n.y * h.y;
        depth = s.radius + dy;
      } else {
        n.set(0, 0, Math.sign(l.z) || 1);
        c.z = n.z * h.z;
        depth = s.radius + dz;
      }
    }
    n.applyQuaternion(box.q);
    const p = c.clone().applyQuaternion(box.q).add(box.pos);
    this.addContact(box, s, n, p, depth);
  }

  // ------------------------------------------------------------------ solver

  private effMass(c: Contact, dir: Vector3): number {
    let k = c.a.inv + c.b.inv;
    if (c.a.inv > 0) {
      tmpA.crossVectors(c.ra, dir);
      applyInvI(c.a, tmpA, tmpB);
      k += tmpC.crossVectors(tmpB, c.ra).dot(dir);
    }
    if (c.b.inv > 0) {
      tmpA.crossVectors(c.rb, dir);
      applyInvI(c.b, tmpA, tmpB);
      k += tmpC.crossVectors(tmpB, c.rb).dot(dir);
    }
    return k > 1e-12 ? 1 / k : 0;
  }

  private relVel(c: Contact, out: Vector3): Vector3 {
    out.crossVectors(c.b.w, c.rb).add(c.b.v);
    tmpD.crossVectors(c.a.w, c.ra).add(c.a.v);
    return out.sub(tmpD);
  }

  private preStep(c: Contact, dt: number): void {
    c.ra.copy(c.p).sub(c.a.pos);
    c.rb.copy(c.p).sub(c.b.pos);
    const n = c.n;
    if (Math.abs(n.x) > 0.57) c.t1.set(0, 1, 0).cross(n);
    else c.t1.set(1, 0, 0).cross(n);
    c.t1.normalize();
    c.t2.crossVectors(n, c.t1).normalize();
    c.mn = this.effMass(c, n);
    c.mt1 = this.effMass(c, c.t1);
    c.mt2 = this.effMass(c, c.t2);
    c.bias = Math.min((BAUMGARTE / dt) * Math.max(c.depth - SLOP, 0), MAX_BIAS);
  }

  private impulse(c: Contact, P: Vector3): void {
    const a = c.a;
    const b = c.b;
    if (b.inv > 0) {
      b.v.addScaledVector(P, b.inv);
      tmpA.crossVectors(c.rb, P);
      b.w.add(applyInvI(b, tmpA, tmpB));
    }
    if (a.inv > 0) {
      a.v.addScaledVector(P, -a.inv);
      tmpA.crossVectors(c.ra, P);
      a.w.sub(applyInvI(a, tmpA, tmpB));
    }
  }

  private solve(c: Contact): void {
    const rv = new Vector3();
    const P = new Vector3();

    // normal
    this.relVel(c, rv);
    const vn = rv.dot(c.n);
    let lambda = (-vn + c.bias) * c.mn;
    const old = c.accN;
    c.accN = Math.max(old + lambda, 0);
    lambda = c.accN - old;
    this.impulse(c, P.copy(c.n).multiplyScalar(lambda));

    // friction
    const maxF = c.mu * c.accN;
    this.relVel(c, rv);
    let l1 = -rv.dot(c.t1) * c.mt1;
    const o1 = c.accT1;
    c.accT1 = Math.max(-maxF, Math.min(maxF, o1 + l1));
    l1 = c.accT1 - o1;
    this.impulse(c, P.copy(c.t1).multiplyScalar(l1));

    this.relVel(c, rv);
    let l2 = -rv.dot(c.t2) * c.mt2;
    const o2 = c.accT2;
    c.accT2 = Math.max(-maxF, Math.min(maxF, o2 + l2));
    l2 = c.accT2 - o2;
    this.impulse(c, P.copy(c.t2).multiplyScalar(l2));
  }
}
