import { Quaternion, Vector3 } from 'three';

/**
 * Minimal rigid-body engine: unit cubes, one sphere and an infinite ground plane.
 * Cubes and spheres have isotropic inertia, so a scalar inverse inertia is enough.
 * Contacts are solved with warm-started sequential impulses, Coulomb friction,
 * restitution, and sleeping. A fixed-length pendulum constraint can be attached
 * to one body.
 */

const HALF = 0.5;
const MARGIN = 0.03; // speculative contact distance
const SLOP = 0.005;
const BAUMGARTE = 0.2;
const MAX_PUSH = 2.0; // max penetration recovery speed (m/s)
const RESTITUTION_THRESHOLD = 1.0;

export type BodyKind = 'box' | 'sphere' | 'ground';

export class Body {
  readonly pos = new Vector3();
  readonly quat = new Quaternion();
  readonly vel = new Vector3();
  readonly ang = new Vector3();
  readonly axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  invMass = 0;
  invInertia = 0;
  friction = 0.5;
  restitution = 0;
  radius = 0;
  linDamp = 0;
  angDamp = 0;
  sleeping = false;
  sleepTimer = 0;
  kinematic = false;
  canSleep = true;

  constructor(
    readonly id: number,
    readonly kind: BodyKind,
  ) {}

  updateAxes(): void {
    this.axes[0].set(1, 0, 0).applyQuaternion(this.quat);
    this.axes[1].set(0, 1, 0).applyQuaternion(this.quat);
    this.axes[2].set(0, 0, 1).applyQuaternion(this.quat);
  }

  get boundRadius(): number {
    return this.kind === 'sphere' ? this.radius : HALF * Math.sqrt(3);
  }
}

interface Contact {
  a: Body;
  b: Body;
  n: Vector3; // from a to b
  p: Vector3;
  ra: Vector3;
  rb: Vector3;
  t1: Vector3;
  t2: Vector3;
  depth: number;
  key: number;
  ln: number;
  lt1: number;
  lt2: number;
  mn: number;
  mt1: number;
  mt2: number;
  bias: number;
  mu: number;
  ima: number;
  imb: number;
  iia: number;
  iib: number;
}

export interface Pendulum {
  body: Body;
  pivot: Vector3;
  length: number;
}

const _c = new Vector3();
const _v = new Vector3();
const _d = new Vector3();
const _rv = new Vector3();
const _t = new Vector3();
const _P = new Vector3();
const _q = new Quaternion();

export class World {
  readonly bodies: Body[] = [];
  readonly ground = new Body(0, 'ground');
  gravity = -9.81;
  iterations = 24;
  pendulum: Pendulum | null = null;
  private contacts: Contact[] = [];
  private cache = new Map<number, Contact>();
  private pendN = new Vector3(1, 0, 0);

  add(b: Body): void {
    this.bodies.push(b);
  }

  clearCache(): void {
    this.cache.clear();
  }

  wake(b: Body): void {
    if (b.sleeping) {
      b.sleeping = false;
      b.sleepTimer = 0;
    }
  }

  // ---------------------------------------------------------------- contacts

  private make(a: Body, b: Body, n: Vector3, p: Vector3, depth: number, feature: number): Contact {
    return {
      a,
      b,
      n: n.clone(),
      p: p.clone(),
      ra: new Vector3(),
      rb: new Vector3(),
      t1: new Vector3(),
      t2: new Vector3(),
      depth,
      key: (a.id * 32 + b.id) * 32 + feature,
      ln: 0,
      lt1: 0,
      lt2: 0,
      mn: 0,
      mt1: 0,
      mt2: 0,
      bias: 0,
      mu: 0,
      ima: 0,
      imb: 0,
      iia: 0,
      iib: 0,
    };
  }

  private vertex(out: Vector3, b: Body, vi: number): Vector3 {
    const sx = vi & 1 ? HALF : -HALF;
    const sy = vi & 2 ? HALF : -HALF;
    const sz = vi & 4 ? HALF : -HALF;
    return out
      .copy(b.pos)
      .addScaledVector(b.axes[0], sx)
      .addScaledVector(b.axes[1], sy)
      .addScaledVector(b.axes[2], sz);
  }

  private groundContacts(b: Body, out: Contact[]): void {
    const up = new Vector3(0, 1, 0);
    if (b.kind === 'box') {
      for (let vi = 0; vi < 8; vi++) {
        this.vertex(_v, b, vi);
        if (_v.y < MARGIN) out.push(this.make(this.ground, b, up, _v, -_v.y, vi));
      }
    } else if (b.kind === 'sphere') {
      const gap = b.pos.y - b.radius;
      if (gap < MARGIN) {
        _v.set(b.pos.x, 0, b.pos.z);
        out.push(this.make(this.ground, b, up, _v, -gap, 16));
      }
    }
  }

  /** Vertices of `vb` that lie inside (the margin-expanded) box `bx`. */
  private vertsInBox(vb: Body, bx: Body, vertIsA: boolean, out: Contact[]): void {
    _c.subVectors(vb.pos, bx.pos);
    const cl = [_c.dot(bx.axes[0]), _c.dot(bx.axes[1]), _c.dot(bx.axes[2])];
    const clLen = Math.hypot(cl[0], cl[1], cl[2]) || 1;
    for (let vi = 0; vi < 8; vi++) {
      this.vertex(_v, vb, vi);
      _d.subVectors(_v, bx.pos);
      const l = [_d.dot(bx.axes[0]), _d.dot(bx.axes[1]), _d.dot(bx.axes[2])];
      const pen = [HALF - Math.abs(l[0]), HALF - Math.abs(l[1]), HALF - Math.abs(l[2])];
      if (pen[0] < -MARGIN || pen[1] < -MARGIN || pen[2] < -MARGIN) continue;
      // prefer the axis aligned with the centre-to-centre direction when penetrations tie
      let k = 0;
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const score = pen[i] - 0.05 * (Math.abs(cl[i]) / clLen);
        if (score < best) {
          best = score;
          k = i;
        }
      }
      const sign = l[k] > 1e-6 ? 1 : l[k] < -1e-6 ? -1 : cl[k] >= 0 ? 1 : -1;
      const n = _t.copy(bx.axes[k]).multiplyScalar(vertIsA ? -sign : sign);
      if (vertIsA) out.push(this.make(vb, bx, n, _v, pen[k], vi));
      else out.push(this.make(bx, vb, n, _v, pen[k], 8 + vi));
    }
  }

  private sphereBox(box: Body, sph: Body, out: Contact[]): void {
    _d.subVectors(sph.pos, box.pos);
    const l = [_d.dot(box.axes[0]), _d.dot(box.axes[1]), _d.dot(box.axes[2])];
    const cp = l.map((x) => Math.max(-HALF, Math.min(HALF, x)));
    const df = [l[0] - cp[0], l[1] - cp[1], l[2] - cp[2]];
    const dist = Math.hypot(df[0], df[1], df[2]);
    if (dist > sph.radius + MARGIN) return;
    const n = new Vector3();
    const pt = new Vector3();
    let depth: number;
    if (dist > 1e-6) {
      for (let i = 0; i < 3; i++) n.addScaledVector(box.axes[i], df[i] / dist);
      for (let i = 0; i < 3; i++) pt.addScaledVector(box.axes[i], cp[i]);
      pt.add(box.pos);
      depth = sph.radius - dist;
    } else {
      let k = 0;
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const pn = HALF - Math.abs(l[i]);
        if (pn < best) {
          best = pn;
          k = i;
        }
      }
      const sign = l[k] >= 0 ? 1 : -1;
      n.copy(box.axes[k]).multiplyScalar(sign);
      pt.copy(sph.pos).addScaledVector(n, -sph.radius);
      depth = sph.radius + best;
    }
    out.push(this.make(box, sph, n, pt, depth, 16));
  }

  private collidePair(a: Body, b: Body, out: Contact[]): void {
    if (a.sleeping && b.sleeping) return;
    const reach = a.boundRadius + b.boundRadius + MARGIN;
    if (_c.subVectors(a.pos, b.pos).lengthSq() > reach * reach) return;
    const tmp: Contact[] = [];
    if (a.kind === 'box' && b.kind === 'box') {
      this.vertsInBox(a, b, true, tmp);
      this.vertsInBox(b, a, false, tmp);
    } else if (a.kind === 'box' && b.kind === 'sphere') {
      this.sphereBox(a, b, tmp);
    } else if (a.kind === 'sphere' && b.kind === 'box') {
      this.sphereBox(b, a, tmp);
    }
    if (tmp.length === 0) return;
    if (a.sleeping !== b.sleeping) {
      const sleeper = a.sleeping ? a : b;
      const mover = a.sleeping ? b : a;
      if (!mover.kinematic && (mover.vel.length() > 0.2 || mover.ang.length() > 0.5)) {
        this.wake(sleeper);
      }
    }
    for (const c of tmp) out.push(c);
  }

  // ------------------------------------------------------------------ solver

  private relVel(c: Contact, out: Vector3): Vector3 {
    out.copy(c.b.ang).cross(c.rb).add(c.b.vel);
    _t.copy(c.a.ang).cross(c.ra).add(c.a.vel);
    return out.sub(_t);
  }

  private apply(c: Contact, P: Vector3): void {
    c.b.vel.addScaledVector(P, c.imb);
    _t.copy(c.rb).cross(P);
    c.b.ang.addScaledVector(_t, c.iib);
    c.a.vel.addScaledVector(P, -c.ima);
    _t.copy(c.ra).cross(P);
    c.a.ang.addScaledVector(_t, -c.iia);
  }

  private effMass(c: Contact, d: Vector3): number {
    _t.copy(c.ra).cross(d);
    const ka = c.iia * _t.lengthSq();
    _t.copy(c.rb).cross(d);
    const kb = c.iib * _t.lengthSq();
    const k = c.ima + c.imb + ka + kb;
    return k > 1e-9 ? 1 / k : 0;
  }

  private prepare(c: Contact, dt: number): void {
    const { a, b } = c;
    const aLive = !a.sleeping && !a.kinematic;
    const bLive = !b.sleeping && !b.kinematic;
    c.ima = aLive ? a.invMass : 0;
    c.iia = aLive ? a.invInertia : 0;
    c.imb = bLive ? b.invMass : 0;
    c.iib = bLive ? b.invInertia : 0;
    c.ra.subVectors(c.p, a.pos);
    c.rb.subVectors(c.p, b.pos);
    if (Math.abs(c.n.x) < 0.9) c.t1.set(1, 0, 0).cross(c.n).normalize();
    else c.t1.set(0, 1, 0).cross(c.n).normalize();
    c.t2.crossVectors(c.n, c.t1);
    c.mn = this.effMass(c, c.n);
    c.mt1 = this.effMass(c, c.t1);
    c.mt2 = this.effMass(c, c.t2);
    c.mu = Math.sqrt(a.friction * b.friction);
    const e = Math.max(a.restitution, b.restitution);
    const vn0 = this.relVel(c, _rv).dot(c.n);
    if (c.depth < 0) {
      c.bias = -c.depth / dt;
    } else {
      const push = Math.min(MAX_PUSH, (BAUMGARTE * Math.max(c.depth - SLOP, 0)) / dt);
      c.bias = -push;
      if (vn0 < -RESTITUTION_THRESHOLD) c.bias = Math.min(c.bias, e * vn0);
    }
    const prev = this.cache.get(c.key);
    if (prev && prev.n.dot(c.n) > 0.9) {
      c.ln = prev.ln;
      c.lt1 = prev.lt1;
      c.lt2 = prev.lt2;
      _P.set(0, 0, 0).addScaledVector(c.n, c.ln).addScaledVector(c.t1, c.lt1).addScaledVector(c.t2, c.lt2);
      this.apply(c, _P);
    }
  }

  private solve(c: Contact): void {
    if (c.mn === 0) return;
    const maxF = c.mu * c.ln;
    // friction
    let vt = this.relVel(c, _rv).dot(c.t1);
    let nl = Math.max(-maxF, Math.min(maxF, c.lt1 - vt * c.mt1));
    let dl = nl - c.lt1;
    c.lt1 = nl;
    this.apply(c, _P.copy(c.t1).multiplyScalar(dl));
    vt = this.relVel(c, _rv).dot(c.t2);
    nl = Math.max(-maxF, Math.min(maxF, c.lt2 - vt * c.mt2));
    dl = nl - c.lt2;
    c.lt2 = nl;
    this.apply(c, _P.copy(c.t2).multiplyScalar(dl));
    // normal
    const vn = this.relVel(c, _rv).dot(c.n);
    nl = Math.max(0, c.ln - (vn + c.bias) * c.mn);
    dl = nl - c.ln;
    c.ln = nl;
    this.apply(c, _P.copy(c.n).multiplyScalar(dl));
  }

  // -------------------------------------------------------------------- step

  step(dt: number): void {
    const bodies = this.bodies;
    for (const b of bodies) {
      if (b.kind === 'box') b.updateAxes();
    }

    // forces
    for (const b of bodies) {
      if (b.sleeping || b.kinematic) continue;
      b.vel.y += this.gravity * dt;
      b.vel.multiplyScalar(1 / (1 + b.linDamp * dt));
      b.ang.multiplyScalar(1 / (1 + b.angDamp * dt));
    }

    // collision detection
    const contacts: Contact[] = [];
    for (const b of bodies) {
      if (!b.sleeping && !b.kinematic) this.groundContacts(b, contacts);
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        this.collidePair(a, b, contacts);
      }
    }
    this.contacts = contacts;

    for (const c of contacts) this.prepare(c, dt);

    // pendulum setup
    const pend = this.pendulum;
    let pendActive = false;
    let pendBias = 0;
    if (pend && !pend.body.kinematic) {
      _d.subVectors(pend.body.pos, pend.pivot);
      const len = _d.length();
      if (len > 1e-6) {
        this.pendN.copy(_d).multiplyScalar(1 / len);
        pendBias = (BAUMGARTE / dt) * (len - pend.length);
        pendActive = true;
      }
    }

    for (let it = 0; it < this.iterations; it++) {
      if (pendActive && pend) {
        const body = pend.body;
        const vn = body.vel.dot(this.pendN);
        const lambda = -(vn + pendBias) / body.invMass;
        body.vel.addScaledVector(this.pendN, lambda * body.invMass);
      }
      for (const c of contacts) this.solve(c);
    }

    // cache for warm starting
    this.cache.clear();
    for (const c of contacts) this.cache.set(c.key, c);

    // integrate
    for (const b of bodies) {
      if (b.sleeping || b.kinematic) continue;
      const vl = b.vel.length();
      if (vl > 50) b.vel.multiplyScalar(50 / vl);
      const al = b.ang.length();
      if (al > 40) b.ang.multiplyScalar(40 / al);
      b.pos.addScaledVector(b.vel, dt);
      _q.set(b.ang.x, b.ang.y, b.ang.z, 0).multiply(b.quat);
      b.quat.set(
        b.quat.x + 0.5 * dt * _q.x,
        b.quat.y + 0.5 * dt * _q.y,
        b.quat.z + 0.5 * dt * _q.z,
        b.quat.w + 0.5 * dt * _q.w,
      );
      b.quat.normalize();
    }

    // rigid rope: project onto the sphere of radius `length` around the pivot
    if (pend && !pend.body.kinematic) {
      const body = pend.body;
      _d.subVectors(body.pos, pend.pivot);
      const len = _d.length();
      if (len > 1e-6) {
        _d.multiplyScalar(1 / len);
        body.pos.copy(pend.pivot).addScaledVector(_d, pend.length);
        const vr = body.vel.dot(_d);
        body.vel.addScaledVector(_d, -vr);
      }
    }

    // sleeping
    for (const b of bodies) {
      if (!b.canSleep || b.sleeping || b.kinematic) continue;
      if (b.vel.lengthSq() < 0.1 * 0.1 && b.ang.lengthSq() < 0.2 * 0.2) {
        b.sleepTimer += dt;
        if (b.sleepTimer > 0.5) {
          b.sleeping = true;
          b.vel.set(0, 0, 0);
          b.ang.set(0, 0, 0);
        }
      } else {
        b.sleepTimer = 0;
      }
    }
  }
}
