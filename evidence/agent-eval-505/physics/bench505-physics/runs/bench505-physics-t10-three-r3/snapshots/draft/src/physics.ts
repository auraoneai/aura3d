import { Quaternion, Vector3 } from 'three';

/**
 * Small deterministic rigid-body engine: oriented boxes and spheres,
 * sequential-impulse contact solver with Coulomb friction, sleeping.
 */

export const GRAVITY = 9.81;
const MARGIN = 0.004;
const SLOP = 0.005;
const BETA = 0.2;
const MAX_BIAS = 2.0;
const ITERATIONS = 18;
const FRICTION = 0.5;
const SLEEP_LIN2 = 0.0025;
const SLEEP_ANG2 = 0.0025;
const SLEEP_TIME = 0.4;
const WAKE_SPEED2 = 0.02;

export type Shape =
  | { kind: 'box'; hx: number; hy: number; hz: number }
  | { kind: 'sphere'; r: number };

export class Body {
  readonly pos = new Vector3();
  readonly q = new Quaternion();
  readonly v = new Vector3();
  readonly w = new Vector3();
  readonly invMass: number;
  readonly invILocal = new Vector3();
  readonly iw = new Float64Array(9);
  readonly radius: number;
  readonly isStatic: boolean;
  sleeping = false;
  sleepT = 0;
  held = false;
  frozen = false;
  private readonly p0: Vector3;
  private readonly q0: Quaternion;

  constructor(
    readonly shape: Shape,
    mass: number,
    pos: Vector3,
    q: Quaternion,
    readonly linDamp = 0.02,
    readonly angDamp = 0.02,
  ) {
    this.pos.copy(pos);
    this.q.copy(q);
    this.p0 = pos.clone();
    this.q0 = q.clone();
    this.isStatic = mass <= 0;
    this.invMass = this.isStatic ? 0 : 1 / mass;
    if (shape.kind === 'box') {
      this.radius = Math.hypot(shape.hx, shape.hy, shape.hz);
      if (!this.isStatic) {
        const { hx, hy, hz } = shape;
        this.invILocal.set(
          3 / (mass * (hy * hy + hz * hz)),
          3 / (mass * (hx * hx + hz * hz)),
          3 / (mass * (hx * hx + hy * hy)),
        );
      }
    } else {
      this.radius = shape.r;
      if (!this.isStatic) {
        const i = 1 / (0.4 * mass * shape.r * shape.r);
        this.invILocal.set(i, i, i);
      }
    }
    this.updateInertia();
  }

  get active(): boolean {
    return !this.isStatic && !this.sleeping && !this.held && !this.frozen;
  }

  reset(): void {
    this.pos.copy(this.p0);
    this.q.copy(this.q0);
    this.v.set(0, 0, 0);
    this.w.set(0, 0, 0);
    this.sleepT = 0;
    this.frozen = false;
    this.held = false;
  }

  updateInertia(): void {
    if (this.isStatic) return;
    const { x, y, z, w } = this.q;
    const r = [
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
    ];
    const d = [this.invILocal.x, this.invILocal.y, this.invILocal.z];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += r[i * 3 + k] * d[k] * r[j * 3 + k];
        this.iw[i * 3 + j] = s;
      }
    }
  }

  wake(): void {
    this.sleeping = false;
    this.sleepT = 0;
  }
}

class Row {
  dx = 0; dy = 0; dz = 0;
  iax = 0; iay = 0; iaz = 0;
  ibx = 0; iby = 0; ibz = 0;
  eff = 0;
  sum = 0;
}

class Contact {
  rax = 0; ray = 0; raz = 0;
  rbx = 0; rby = 0; rbz = 0;
  ima = 0; imb = 0;
  bias = 0;
  readonly n = new Row();
  readonly t1 = new Row();
  readonly t2 = new Row();
  constructor(
    readonly a: Body,
    readonly b: Body,
    readonly px: number, readonly py: number, readonly pz: number,
    readonly nx: number, readonly ny: number, readonly nz: number,
    readonly depth: number,
  ) {}
}

function buildRow(c: Contact, row: Row, dx: number, dy: number, dz: number): void {
  row.dx = dx; row.dy = dy; row.dz = dz;
  row.sum = 0;
  let k = c.ima + c.imb;
  if (c.ima > 0) {
    const ax = c.ray * dz - c.raz * dy;
    const ay = c.raz * dx - c.rax * dz;
    const az = c.rax * dy - c.ray * dx;
    const m = c.a.iw;
    row.iax = m[0] * ax + m[1] * ay + m[2] * az;
    row.iay = m[3] * ax + m[4] * ay + m[5] * az;
    row.iaz = m[6] * ax + m[7] * ay + m[8] * az;
    k += ax * row.iax + ay * row.iay + az * row.iaz;
  }
  if (c.imb > 0) {
    const bx = c.rby * dz - c.rbz * dy;
    const by = c.rbz * dx - c.rbx * dz;
    const bz = c.rbx * dy - c.rby * dx;
    const m = c.b.iw;
    row.ibx = m[0] * bx + m[1] * by + m[2] * bz;
    row.iby = m[3] * bx + m[4] * by + m[5] * bz;
    row.ibz = m[6] * bx + m[7] * by + m[8] * bz;
    k += bx * row.ibx + by * row.iby + bz * row.ibz;
  }
  row.eff = k > 1e-12 ? 1 / k : 0;
}

function relVel(c: Contact, r: Row): number {
  const a = c.a, b = c.b;
  const vx = b.v.x + (b.w.y * c.rbz - b.w.z * c.rby) - a.v.x - (a.w.y * c.raz - a.w.z * c.ray);
  const vy = b.v.y + (b.w.z * c.rbx - b.w.x * c.rbz) - a.v.y - (a.w.z * c.rax - a.w.x * c.raz);
  const vz = b.v.z + (b.w.x * c.rby - b.w.y * c.rbx) - a.v.z - (a.w.x * c.ray - a.w.y * c.rax);
  return vx * r.dx + vy * r.dy + vz * r.dz;
}

function applyImpulse(c: Contact, r: Row, l: number): void {
  if (c.ima > 0) {
    const a = c.a;
    a.v.x -= c.ima * l * r.dx; a.v.y -= c.ima * l * r.dy; a.v.z -= c.ima * l * r.dz;
    a.w.x -= l * r.iax; a.w.y -= l * r.iay; a.w.z -= l * r.iaz;
  }
  if (c.imb > 0) {
    const b = c.b;
    b.v.x += c.imb * l * r.dx; b.v.y += c.imb * l * r.dy; b.v.z += c.imb * l * r.dz;
    b.w.x += l * r.ibx; b.w.y += l * r.iby; b.w.z += l * r.ibz;
  }
}

const SIGNS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];

export class World {
  readonly bodies: Body[] = [];
  private contacts: Contact[] = [];
  private readonly s1 = new Vector3();
  private readonly s2 = new Vector3();
  private readonly s3 = new Quaternion();

  add(b: Body): Body {
    this.bodies.push(b);
    return b;
  }

  step(dt: number): void {
    const bodies = this.bodies;
    for (const b of bodies) {
      if (b.isStatic) continue;
      b.updateInertia();
      if (!b.active) continue;
      b.v.y -= GRAVITY * dt;
      b.v.multiplyScalar(1 / (1 + dt * b.linDamp));
      b.w.multiplyScalar(1 / (1 + dt * b.angDamp));
    }

    // Collision detection
    this.contacts = [];
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.held || a.frozen) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.held || b.frozen) continue;
        if (a.isStatic && b.isStatic) continue;
        if (!a.active && !b.active) {
          continue;
        }
        const rr = a.radius + b.radius + 2 * MARGIN;
        if (a.pos.distanceToSquared(b.pos) > rr * rr) continue;
        // wake sleeping neighbours of fast movers
        if (a.sleeping && b.active && b.v.lengthSq() + b.w.lengthSq() > WAKE_SPEED2) a.wake();
        else if (b.sleeping && a.active && a.v.lengthSq() + a.w.lengthSq() > WAKE_SPEED2) b.wake();
        this.collide(a, b);
      }
    }

    // Build constraints
    const invDt = 1 / dt;
    const list = this.contacts;
    for (const c of list) {
      c.ima = c.a.active ? c.a.invMass : 0;
      c.imb = c.b.active ? c.b.invMass : 0;
      c.rax = c.px - c.a.pos.x; c.ray = c.py - c.a.pos.y; c.raz = c.pz - c.a.pos.z;
      c.rbx = c.px - c.b.pos.x; c.rby = c.py - c.b.pos.y; c.rbz = c.pz - c.b.pos.z;
      c.bias = Math.min(MAX_BIAS, BETA * invDt * Math.max(0, c.depth - SLOP - MARGIN));
      buildRow(c, c.n, c.nx, c.ny, c.nz);
      // tangent basis
      let tx: number, ty: number, tz: number;
      if (Math.abs(c.nx) < 0.9) {
        // n x X
        tx = 0; ty = c.nz; tz = -c.ny;
      } else {
        // n x Y
        tx = -c.nz; ty = 0; tz = c.nx;
      }
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const ux = c.ny * tz - c.nz * ty;
      const uy = c.nz * tx - c.nx * tz;
      const uz = c.nx * ty - c.ny * tx;
      buildRow(c, c.t1, tx, ty, tz);
      buildRow(c, c.t2, ux, uy, uz);
    }

    // Solve
    for (let it = 0; it < ITERATIONS; it++) {
      for (const c of list) {
        const n = c.n;
        let l = n.eff * (c.bias - relVel(c, n));
        const ns = Math.max(0, n.sum + l);
        l = ns - n.sum;
        n.sum = ns;
        applyImpulse(c, n, l);

        const lim = FRICTION * n.sum;
        for (const t of [c.t1, c.t2]) {
          let lt = -t.eff * relVel(c, t);
          const s = Math.max(-lim, Math.min(lim, t.sum + lt));
          lt = s - t.sum;
          t.sum = s;
          applyImpulse(c, t, lt);
        }
      }
    }

    // Integrate
    for (const b of bodies) {
      if (!b.active) continue;
      const wl = b.w.length();
      if (wl > 50) b.w.multiplyScalar(50 / wl);
      b.pos.addScaledVector(b.v, dt);
      const q = b.q, w = b.w, h = 0.5 * dt;
      const dx = w.x * q.w + w.y * q.z - w.z * q.y;
      const dy = w.y * q.w + w.z * q.x - w.x * q.z;
      const dz = w.z * q.w + w.x * q.y - w.y * q.x;
      const dw = -w.x * q.x - w.y * q.y - w.z * q.z;
      q.set(q.x + h * dx, q.y + h * dy, q.z + h * dz, q.w + h * dw).normalize();

      if (b.pos.y < -20) {
        b.frozen = true;
        b.v.set(0, 0, 0);
        b.w.set(0, 0, 0);
        continue;
      }
      if (b.v.lengthSq() < SLEEP_LIN2 && b.w.lengthSq() < SLEEP_ANG2) {
        b.sleepT += dt;
        if (b.sleepT >= SLEEP_TIME) {
          b.sleeping = true;
          b.v.set(0, 0, 0);
          b.w.set(0, 0, 0);
        }
      } else {
        b.sleepT = 0;
      }
    }
  }

  private collide(a: Body, b: Body): void {
    const sa = a.shape, sb = b.shape;
    if (sa.kind === 'box' && sb.kind === 'box') {
      if (!a.isStatic) this.vertsInBox(a, sa, b, sb, false);
      if (!b.isStatic) this.vertsInBox(b, sb, a, sa, true);
    } else if (sa.kind === 'box' && sb.kind === 'sphere') {
      this.sphereBox(b, sb.r, a, sa);
    } else if (sa.kind === 'sphere' && sb.kind === 'box') {
      this.sphereBox(a, sa.r, b, sb);
    }
  }

  /** Vertices of box P that lie inside box Q. */
  private vertsInBox(
    p: Body, sp: Shape & { kind: 'box' },
    q: Body, sq: Shape & { kind: 'box' },
    pIsSecond: boolean,
  ): void {
    const inv = this.s3.copy(q.q).invert();
    const v = this.s1;
    const hxq = sq.hx + MARGIN, hyq = sq.hy + MARGIN, hzq = sq.hz + MARGIN;
    for (const s of SIGNS) {
      v.set(s[0] * sp.hx, s[1] * sp.hy, s[2] * sp.hz).applyQuaternion(p.q).add(p.pos);
      const wx = v.x, wy = v.y, wz = v.z;
      v.sub(q.pos).applyQuaternion(inv);
      const ax = hxq - Math.abs(v.x);
      const ay = hyq - Math.abs(v.y);
      const az = hzq - Math.abs(v.z);
      if (ax <= 0 || ay <= 0 || az <= 0) continue;
      const n = this.s2;
      let depth: number;
      if (ax <= ay && ax <= az) {
        n.set(v.x < 0 ? -1 : 1, 0, 0); depth = ax;
      } else if (ay <= az) {
        n.set(0, v.y < 0 ? -1 : 1, 0); depth = ay;
      } else {
        n.set(0, 0, v.z < 0 ? -1 : 1); depth = az;
      }
      n.applyQuaternion(q.q); // outward from q toward p
      if (pIsSecond) {
        // p is body B, q is body A: normal A->B equals outward from q
        this.contacts.push(new Contact(q, p, wx, wy, wz, n.x, n.y, n.z, depth));
      } else {
        // p is body A, q is body B: normal A->B is opposite of outward
        this.contacts.push(new Contact(p, q, wx, wy, wz, -n.x, -n.y, -n.z, depth));
      }
    }
  }

  private sphereBox(s: Body, r: number, bx: Body, sh: Shape & { kind: 'box' }): void {
    const inv = this.s3.copy(bx.q).invert();
    const c = this.s1.copy(s.pos).sub(bx.pos).applyQuaternion(inv);
    const qx = Math.max(-sh.hx, Math.min(sh.hx, c.x));
    const qy = Math.max(-sh.hy, Math.min(sh.hy, c.y));
    const qz = Math.max(-sh.hz, Math.min(sh.hz, c.z));
    const dx = c.x - qx, dy = c.y - qy, dz = c.z - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const rm = r + MARGIN;
    if (d2 > rm * rm) return;
    const n = this.s2;
    const p = new Vector3();
    let depth: number;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      n.set(dx / d, dy / d, dz / d);
      p.set(qx, qy, qz);
      depth = rm - d;
    } else {
      const ax = sh.hx - Math.abs(c.x);
      const ay = sh.hy - Math.abs(c.y);
      const az = sh.hz - Math.abs(c.z);
      if (ax <= ay && ax <= az) {
        const sg = c.x < 0 ? -1 : 1;
        n.set(sg, 0, 0); p.set(sg * sh.hx, c.y, c.z); depth = rm + ax;
      } else if (ay <= az) {
        const sg = c.y < 0 ? -1 : 1;
        n.set(0, sg, 0); p.set(c.x, sg * sh.hy, c.z); depth = rm + ay;
      } else {
        const sg = c.z < 0 ? -1 : 1;
        n.set(0, 0, sg); p.set(c.x, c.y, sg * sh.hz); depth = rm + az;
      }
    }
    n.applyQuaternion(bx.q);
    p.applyQuaternion(bx.q).add(bx.pos);
    this.contacts.push(new Contact(bx, s, p.x, p.y, p.z, n.x, n.y, n.z, depth));
  }
}
