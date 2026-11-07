// Minimal rigid-body physics: unit cubes, one sphere on a rigid rope, and a ground plane.
// Sequential-impulse solver with warm starting, Coulomb friction, restitution, island sleeping.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export type BodyKind = "box" | "sphere" | "ground";

export class Body {
  kind: BodyKind;
  id: number;
  pos: V3 = { x: 0, y: 0, z: 0 };
  q = { x: 0, y: 0, z: 0, w: 1 };
  vel: V3 = { x: 0, y: 0, z: 0 };
  w: V3 = { x: 0, y: 0, z: 0 };
  invMass = 0;
  invI = 0;
  half = 0.5;
  radius = 0;
  friction = 0.6;
  restitution = 0.1;
  asleep = false;
  sleepTimer = 0;
  group = 0;
  kinematic = false;
  home: V3 = { x: 0, y: 0, z: 0 };
  ax: V3[] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 }
  ];

  constructor(kind: BodyKind, id: number) {
    this.kind = kind;
    this.id = id;
  }

  updateAxes(): void {
    const { x, y, z, w } = this.q;
    const a0 = this.ax[0]!, a1 = this.ax[1]!, a2 = this.ax[2]!;
    a0.x = 1 - 2 * (y * y + z * z); a0.y = 2 * (x * y + w * z); a0.z = 2 * (x * z - w * y);
    a1.x = 2 * (x * y - w * z); a1.y = 1 - 2 * (x * x + z * z); a1.z = 2 * (y * z + w * x);
    a2.x = 2 * (x * z + w * y); a2.y = 2 * (y * z - w * x); a2.z = 1 - 2 * (x * x + y * y);
  }

  get im(): number {
    return this.asleep || this.kinematic ? 0 : this.invMass;
  }

  get ii(): number {
    return this.asleep || this.kinematic ? 0 : this.invI;
  }

  speed(): number {
    return Math.hypot(this.vel.x, this.vel.y, this.vel.z);
  }
}

interface Contact {
  a: Body;
  b: Body;
  nx: number; ny: number; nz: number;
  px: number; py: number; pz: number;
  depth: number;
  key: number;
  rax: number; ray: number; raz: number;
  rbx: number; rby: number; rbz: number;
  t1x: number; t1y: number; t1z: number;
  t2x: number; t2y: number; t2z: number;
  kn: number; kt1: number; kt2: number;
  target: number;
  mu: number;
  jn: number; j1: number; j2: number;
  ima: number; imb: number; iia: number; iib: number;
}

interface Cached {
  jn: number;
  fx: number; fy: number; fz: number;
}

const MARGIN = 0.02;
const SLOP = 0.005;
const BETA = 0.2;
const MAX_BIAS = 2.0;
const ITERATIONS = 16;
const GRAVITY = -9.81;

const SIGNS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]
];

export class World {
  bodies: Body[] = [];
  ground: Body;
  ball: Body;
  crates: Body[] = [];
  pivot: V3;
  ropeLength: number;
  private contacts: Contact[] = [];
  private cache = new Map<number, Cached>();
  private nextGroup = 1;

  constructor(pivot: V3, ropeLength: number) {
    this.pivot = pivot;
    this.ropeLength = ropeLength;
    this.ground = new Body("ground", 0);
    this.ground.friction = 0.8;
    this.ground.restitution = 0.05;
    this.ball = new Body("sphere", 1);
    this.ball.radius = 0.8;
    this.ball.invMass = 1 / 20;
    this.ball.friction = 0.4;
    this.ball.restitution = 0.2;
    this.bodies.push(this.ball);
    for (let i = 0; i < 15; i += 1) {
      const c = new Body("box", 2 + i);
      c.invMass = 1;
      c.invI = 6; // cube of side 1: I = m / 6
      c.friction = 0.6;
      c.restitution = 0.1;
      this.crates.push(c);
      this.bodies.push(c);
    }
    this.reset(0);
  }

  /** Rebuild the pyramid at x-centre `centreX`, and hang the ball at rest. */
  reset(centreX: number): void {
    let n = 0;
    for (let row = 0; row < 5; row += 1) {
      const count = 5 - row;
      for (let i = 0; i < count; i += 1) {
        const c = this.crates[n]!;
        n += 1;
        c.pos = { x: centreX + (i - (count - 1) / 2) * 1.004, y: 0.5 + row * 1.002 + 0.001, z: 0 };
        c.home = { ...c.pos };
        c.q = { x: 0, y: 0, z: 0, w: 1 };
        c.vel = { x: 0, y: 0, z: 0 };
        c.w = { x: 0, y: 0, z: 0 };
        c.asleep = false;
        c.sleepTimer = 0;
        c.group = 0;
        c.updateAxes();
      }
    }
    this.setBallAngle(0);
    this.ball.vel = { x: 0, y: 0, z: 0 };
    this.ball.kinematic = false;
    this.cache.clear();
    this.contacts = [];
  }

  /** Signed angle from vertical; positive swings toward +x. */
  ballAngle(): number {
    return Math.atan2(this.ball.pos.x - this.pivot.x, this.pivot.y - this.ball.pos.y);
  }

  setBallAngle(theta: number): void {
    this.ball.pos = {
      x: this.pivot.x + Math.sin(theta) * this.ropeLength,
      y: this.pivot.y - Math.cos(theta) * this.ropeLength,
      z: this.pivot.z
    };
  }

  allCratesAsleep(): boolean {
    return this.crates.every((c) => c.asleep);
  }

  step(dt: number): void {
    // 1. external forces
    for (const b of this.bodies) {
      if (b.asleep || b.kinematic) continue;
      b.vel.y += GRAVITY * dt;
      if (b === this.ball) {
        const d = 1 / (1 + dt * 0.04);
        b.vel.x *= d; b.vel.y *= d; b.vel.z *= d;
      } else {
        const d = 1 / (1 + dt * 0.05), da = 1 / (1 + dt * 0.15);
        b.vel.x *= d; b.vel.y *= d; b.vel.z *= d;
        b.w.x *= da; b.w.y *= da; b.w.z *= da;
      }
    }
    // 2. collision detection
    this.detect();
    // 3. solve
    this.prepare(dt);
    for (let it = 0; it < ITERATIONS; it += 1) {
      for (const c of this.contacts) this.solve(c);
      this.solveRope();
    }
    for (const c of this.contacts) {
      this.cache.set(c.key, {
        jn: c.jn,
        fx: c.t1x * c.j1 + c.t2x * c.j2,
        fy: c.t1y * c.j1 + c.t2y * c.j2,
        fz: c.t1z * c.j1 + c.t2z * c.j2
      });
    }
    // 4. integrate
    for (const b of this.bodies) {
      if (b.asleep || b.kinematic) continue;
      b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.pos.z += b.vel.z * dt;
      if (b.kind === "box") {
        const q = b.q, w = b.w;
        const hx = 0.5 * dt;
        const nx = q.x + hx * (w.x * q.w + w.y * q.z - w.z * q.y);
        const ny = q.y + hx * (w.y * q.w + w.z * q.x - w.x * q.z);
        const nz = q.z + hx * (w.z * q.w + w.x * q.y - w.y * q.x);
        const nw = q.w + hx * (-w.x * q.x - w.y * q.y - w.z * q.z);
        const l = Math.hypot(nx, ny, nz, nw) || 1;
        q.x = nx / l; q.y = ny / l; q.z = nz / l; q.w = nw / l;
        b.updateAxes();
      }
    }
    this.projectRope();
    // 5. sleeping
    this.updateSleep(dt);
  }

  private solveRope(): void {
    const b = this.ball;
    if (b.kinematic) return;
    const ux = b.pos.x - this.pivot.x, uy = b.pos.y - this.pivot.y, uz = b.pos.z - this.pivot.z;
    const l = Math.hypot(ux, uy, uz) || 1;
    const nx = ux / l, ny = uy / l, nz = uz / l;
    const vn = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
    b.vel.x -= vn * nx; b.vel.y -= vn * ny; b.vel.z -= vn * nz;
  }

  private projectRope(): void {
    const b = this.ball;
    if (b.kinematic) return;
    const ux = b.pos.x - this.pivot.x, uy = b.pos.y - this.pivot.y, uz = b.pos.z - this.pivot.z;
    const l = Math.hypot(ux, uy, uz) || 1;
    const k = this.ropeLength / l;
    b.pos.x = this.pivot.x + ux * k;
    b.pos.y = this.pivot.y + uy * k;
    b.pos.z = this.pivot.z + uz * k;
  }

  // ---------- collision detection ----------

  private detect(): void {
    this.contacts = [];
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i += 1) {
      const a = bs[i]!;
      this.groundContacts(a);
      for (let j = i + 1; j < bs.length; j += 1) {
        const b = bs[j]!;
        if (a.asleep && b.asleep) continue;
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
        const reach = (a.kind === "sphere" ? a.radius : 0.8661) + (b.kind === "sphere" ? b.radius : 0.8661) + MARGIN;
        if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
        const before = this.contacts.length;
        if (a.kind === "box" && b.kind === "box") this.boxBox(a, b);
        else if (a.kind === "box" && b.kind === "sphere") this.sphereBox(b, a);
        else if (a.kind === "sphere" && b.kind === "box") this.sphereBox(a, b);
        if (this.contacts.length > before) this.wakeIfHit(a, b);
      }
    }
  }

  private wakeIfHit(a: Body, b: Body): void {
    if (a.asleep === b.asleep) return;
    const sleeper = a.asleep ? a : b;
    const other = a.asleep ? b : a;
    if (other === this.ball || other.kinematic || other.speed() > 0.3 || Math.hypot(other.w.x, other.w.y, other.w.z) > 1.5) {
      this.wakeGroup(sleeper);
    }
  }

  private wakeGroup(seed: Body): void {
    const g = seed.group;
    for (const b of this.bodies) {
      if (b === seed || (g !== 0 && b.group === g)) {
        b.asleep = false;
        b.sleepTimer = 0;
        b.group = 0;
      }
    }
  }

  private groundContacts(a: Body): void {
    if (a.asleep) return;
    if (a.kind === "box") {
      for (let k = 0; k < 8; k += 1) {
        const s = SIGNS[k]!;
        const vy = a.pos.y + (s[0] * a.ax[0]!.y + s[1] * a.ax[1]!.y + s[2] * a.ax[2]!.y) * 0.5;
        if (vy < MARGIN) {
          const vx = a.pos.x + (s[0] * a.ax[0]!.x + s[1] * a.ax[1]!.x + s[2] * a.ax[2]!.x) * 0.5;
          const vz = a.pos.z + (s[0] * a.ax[0]!.z + s[1] * a.ax[1]!.z + s[2] * a.ax[2]!.z) * 0.5;
          this.push(a, this.ground, 0, -1, 0, vx, vy, vz, -vy, k);
        }
      }
    } else if (a.kind === "sphere") {
      const d = a.pos.y - a.radius;
      if (d < MARGIN) this.push(a, this.ground, 0, -1, 0, a.pos.x, a.pos.y - a.radius, a.pos.z, -d, 0);
    }
  }

  private extent(b: Body, nx: number, ny: number, nz: number): number {
    return 0.5 * (Math.abs(nx * b.ax[0]!.x + ny * b.ax[0]!.y + nz * b.ax[0]!.z)
      + Math.abs(nx * b.ax[1]!.x + ny * b.ax[1]!.y + nz * b.ax[1]!.z)
      + Math.abs(nx * b.ax[2]!.x + ny * b.ax[2]!.y + nz * b.ax[2]!.z));
  }

  private boxBox(a: Body, b: Body): void {
    const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
    let best = Infinity;
    let bx = 0, by = 1, bz = 0;
    for (let s = 0; s < 6; s += 1) {
      const u = s < 3 ? a.ax[s]! : b.ax[s - 3]!;
      const dist = dx * u.x + dy * u.y + dz * u.z;
      const overlap = this.extent(a, u.x, u.y, u.z) + this.extent(b, u.x, u.y, u.z) - Math.abs(dist);
      if (overlap < -MARGIN) return;
      // small bias toward the first-found axis keeps the choice stable between near ties
      if (overlap < best - 1e-4) {
        best = overlap;
        const sg = dist < 0 ? -1 : 1;
        bx = u.x * sg; by = u.y * sg; bz = u.z * sg;
      }
    }
    const extA = this.extent(a, bx, by, bz);
    const extB = this.extent(b, bx, by, bz);
    // vertices of B inside A
    for (let k = 0; k < 8; k += 1) {
      const s = SIGNS[k]!;
      const vx = b.pos.x + (s[0] * b.ax[0]!.x + s[1] * b.ax[1]!.x + s[2] * b.ax[2]!.x) * 0.5;
      const vy = b.pos.y + (s[0] * b.ax[0]!.y + s[1] * b.ax[1]!.y + s[2] * b.ax[2]!.y) * 0.5;
      const vz = b.pos.z + (s[0] * b.ax[0]!.z + s[1] * b.ax[1]!.z + s[2] * b.ax[2]!.z) * 0.5;
      const rx = vx - a.pos.x, ry = vy - a.pos.y, rz = vz - a.pos.z;
      const depth = extA - (rx * bx + ry * by + rz * bz);
      if (depth < -MARGIN || !this.insideBox(a, rx, ry, rz)) continue;
      this.push(a, b, bx, by, bz, vx, vy, vz, depth, 8 + k);
    }
    // vertices of A inside B
    for (let k = 0; k < 8; k += 1) {
      const s = SIGNS[k]!;
      const vx = a.pos.x + (s[0] * a.ax[0]!.x + s[1] * a.ax[1]!.x + s[2] * a.ax[2]!.x) * 0.5;
      const vy = a.pos.y + (s[0] * a.ax[0]!.y + s[1] * a.ax[1]!.y + s[2] * a.ax[2]!.y) * 0.5;
      const vz = a.pos.z + (s[0] * a.ax[0]!.z + s[1] * a.ax[1]!.z + s[2] * a.ax[2]!.z) * 0.5;
      const rx = vx - b.pos.x, ry = vy - b.pos.y, rz = vz - b.pos.z;
      const depth = extB + (rx * bx + ry * by + rz * bz);
      if (depth < -MARGIN || !this.insideBox(b, rx, ry, rz)) continue;
      this.push(a, b, bx, by, bz, vx, vy, vz, depth, k);
    }
  }

  private insideBox(b: Body, rx: number, ry: number, rz: number): boolean {
    const lim = 0.5 + MARGIN;
    for (let i = 0; i < 3; i += 1) {
      const u = b.ax[i]!;
      if (Math.abs(rx * u.x + ry * u.y + rz * u.z) > lim) return false;
    }
    return true;
  }

  private sphereBox(s: Body, x: Body): void {
    const rx = s.pos.x - x.pos.x, ry = s.pos.y - x.pos.y, rz = s.pos.z - x.pos.z;
    const l = [0, 0, 0];
    let cx = x.pos.x, cy = x.pos.y, cz = x.pos.z;
    for (let i = 0; i < 3; i += 1) {
      const u = x.ax[i]!;
      const li = rx * u.x + ry * u.y + rz * u.z;
      l[i] = li;
      const c = Math.max(-0.5, Math.min(0.5, li));
      cx += u.x * c; cy += u.y * c; cz += u.z * c;
    }
    const fx = s.pos.x - cx, fy = s.pos.y - cy, fz = s.pos.z - cz;
    const dist = Math.hypot(fx, fy, fz);
    if (dist > s.radius + MARGIN) return;
    if (dist > 1e-6) {
      this.push(x, s, fx / dist, fy / dist, fz / dist, cx, cy, cz, s.radius - dist, 0);
    } else {
      let bi = 0, bd = -1;
      for (let i = 0; i < 3; i += 1) {
        const d = Math.abs(l[i]!);
        if (d > bd) { bd = d; bi = i; }
      }
      const u = x.ax[bi]!;
      const sg = l[bi]! < 0 ? -1 : 1;
      this.push(x, s, u.x * sg, u.y * sg, u.z * sg, s.pos.x, s.pos.y, s.pos.z, s.radius + 0.5 - bd, 0);
    }
  }

  private push(a: Body, b: Body, nx: number, ny: number, nz: number, px: number, py: number, pz: number, depth: number, feature: number): void {
    this.contacts.push({
      a, b, nx, ny, nz, px, py, pz, depth,
      key: (a.id * 64 + b.id) * 32 + feature,
      rax: 0, ray: 0, raz: 0, rbx: 0, rby: 0, rbz: 0,
      t1x: 0, t1y: 0, t1z: 0, t2x: 0, t2y: 0, t2z: 0,
      kn: 1, kt1: 1, kt2: 1, target: 0, mu: 0.5,
      jn: 0, j1: 0, j2: 0, ima: 0, imb: 0, iia: 0, iib: 0
    });
  }

  // ---------- solver ----------

  private prepare(dt: number): void {
    for (const c of this.contacts) {
      const { a, b } = c;
      c.ima = a.im; c.imb = b.im; c.iia = a.ii; c.iib = b.ii;
      c.rax = c.px - a.pos.x; c.ray = c.py - a.pos.y; c.raz = c.pz - a.pos.z;
      c.rbx = c.px - b.pos.x; c.rby = c.py - b.pos.y; c.rbz = c.pz - b.pos.z;
      // tangent basis
      const { nx, ny, nz } = c;
      let tx: number, ty: number, tz: number;
      if (Math.abs(nx) < 0.57) { tx = 0; ty = nz; tz = -ny; } else { tx = -nz; ty = 0; tz = nx; }
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      c.t1x = tx; c.t1y = ty; c.t1z = tz;
      c.t2x = ny * tz - nz * ty; c.t2y = nz * tx - nx * tz; c.t2z = nx * ty - ny * tx;
      c.kn = this.effMass(c, nx, ny, nz);
      c.kt1 = this.effMass(c, c.t1x, c.t1y, c.t1z);
      c.kt2 = this.effMass(c, c.t2x, c.t2y, c.t2z);
      c.mu = Math.sqrt(a.friction * b.friction);
      // relative normal velocity, for restitution and speculative contacts
      const vn = this.relVel(c, nx, ny, nz);
      let target = 0;
      if (c.depth < 0) target = c.depth / dt;
      else target = Math.min(MAX_BIAS, (BETA * Math.max(0, c.depth - SLOP)) / dt);
      const e = Math.max(a.restitution, b.restitution) * 0.5 + Math.min(a.restitution, b.restitution) * 0.5;
      if (vn < -1.0 && c.depth > -MARGIN) target = Math.max(target, -e * vn);
      c.target = target;
      // warm start
      const cached = this.cache.get(c.key);
      if (cached) {
        c.jn = cached.jn;
        c.j1 = cached.fx * c.t1x + cached.fy * c.t1y + cached.fz * c.t1z;
        c.j2 = cached.fx * c.t2x + cached.fy * c.t2y + cached.fz * c.t2z;
        this.apply(c, nx * c.jn + c.t1x * c.j1 + c.t2x * c.j2, ny * c.jn + c.t1y * c.j1 + c.t2y * c.j2, nz * c.jn + c.t1z * c.j1 + c.t2z * c.j2);
      }
    }
  }

  private effMass(c: Contact, dx: number, dy: number, dz: number): number {
    const ra2 = c.rax * c.rax + c.ray * c.ray + c.raz * c.raz;
    const rb2 = c.rbx * c.rbx + c.rby * c.rby + c.rbz * c.rbz;
    const rad = c.rax * dx + c.ray * dy + c.raz * dz;
    const rbd = c.rbx * dx + c.rby * dy + c.rbz * dz;
    const k = c.ima + c.imb + c.iia * (ra2 - rad * rad) + c.iib * (rb2 - rbd * rbd);
    return k > 1e-9 ? 1 / k : 0;
  }

  private relVel(c: Contact, dx: number, dy: number, dz: number): number {
    const { a, b } = c;
    const vax = a.vel.x + a.w.y * c.raz - a.w.z * c.ray;
    const vay = a.vel.y + a.w.z * c.rax - a.w.x * c.raz;
    const vaz = a.vel.z + a.w.x * c.ray - a.w.y * c.rax;
    const vbx = b.vel.x + b.w.y * c.rbz - b.w.z * c.rby;
    const vby = b.vel.y + b.w.z * c.rbx - b.w.x * c.rbz;
    const vbz = b.vel.z + b.w.x * c.rby - b.w.y * c.rbx;
    return (vbx - vax) * dx + (vby - vay) * dy + (vbz - vaz) * dz;
  }

  private apply(c: Contact, px: number, py: number, pz: number): void {
    const { a, b } = c;
    if (c.ima > 0) { a.vel.x -= px * c.ima; a.vel.y -= py * c.ima; a.vel.z -= pz * c.ima; }
    if (c.iia > 0) {
      a.w.x -= c.iia * (c.ray * pz - c.raz * py);
      a.w.y -= c.iia * (c.raz * px - c.rax * pz);
      a.w.z -= c.iia * (c.rax * py - c.ray * px);
    }
    if (c.imb > 0) { b.vel.x += px * c.imb; b.vel.y += py * c.imb; b.vel.z += pz * c.imb; }
    if (c.iib > 0) {
      b.w.x += c.iib * (c.rby * pz - c.rbz * py);
      b.w.y += c.iib * (c.rbz * px - c.rbx * pz);
      b.w.z += c.iib * (c.rbx * py - c.rby * px);
    }
  }

  private solve(c: Contact): void {
    // friction first, so the normal constraint has the last word
    const maxF = c.mu * c.jn;
    let d1 = -this.relVel(c, c.t1x, c.t1y, c.t1z) * c.kt1;
    let d2 = -this.relVel(c, c.t2x, c.t2y, c.t2z) * c.kt2;
    let n1 = c.j1 + d1, n2 = c.j2 + d2;
    const m = Math.hypot(n1, n2);
    if (m > maxF) {
      const s = m > 0 ? maxF / m : 0;
      n1 *= s; n2 *= s;
    }
    d1 = n1 - c.j1; d2 = n2 - c.j2;
    c.j1 = n1; c.j2 = n2;
    this.apply(c, c.t1x * d1 + c.t2x * d2, c.t1y * d1 + c.t2y * d2, c.t1z * d1 + c.t2z * d2);

    const vn = this.relVel(c, c.nx, c.ny, c.nz);
    const dj = (c.target - vn) * c.kn;
    const nj = Math.max(0, c.jn + dj);
    const d = nj - c.jn;
    c.jn = nj;
    this.apply(c, c.nx * d, c.ny * d, c.nz * d);
  }

  // ---------- sleeping ----------

  private updateSleep(dt: number): void {
    const crates = this.crates;
    for (const c of crates) {
      if (c.asleep) continue;
      const slow = c.speed() < 0.09 && Math.hypot(c.w.x, c.w.y, c.w.z) < 0.25;
      c.sleepTimer = slow ? c.sleepTimer + dt : 0;
    }
    // islands via contacts between awake crates
    const parent = new Map<Body, Body>();
    const find = (b: Body): Body => {
      let r = b;
      while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    for (const c of crates) parent.set(c, c);
    for (const ct of this.contacts) {
      if (ct.a.kind === "box" && ct.b.kind === "box" && !ct.a.asleep && !ct.b.asleep) {
        parent.set(find(ct.a), find(ct.b));
      }
      // a ball touching a crate keeps it awake
      if ((ct.a === this.ball || ct.b === this.ball) && this.ball.speed() > 0.3) {
        const other = ct.a === this.ball ? ct.b : ct.a;
        if (other.kind === "box") other.sleepTimer = 0;
      }
    }
    const minTimer = new Map<Body, number>();
    for (const c of crates) {
      if (c.asleep) continue;
      const r = find(c);
      minTimer.set(r, Math.min(minTimer.get(r) ?? Infinity, c.sleepTimer));
    }
    const groupOf = new Map<Body, number>();
    for (const c of crates) {
      if (c.asleep) continue;
      const r = find(c);
      if ((minTimer.get(r) ?? 0) > 0.5) {
        let g = groupOf.get(r);
        if (g === undefined) { g = this.nextGroup; this.nextGroup += 1; groupOf.set(r, g); }
        c.group = g;
        c.asleep = true;
        c.vel = { x: 0, y: 0, z: 0 };
        c.w = { x: 0, y: 0, z: 0 };
      }
    }
  }
}

/** Quaternion to Euler angles in the renderer's default ZYX order. */
export function quatToEulerZYX(q: { x: number; y: number; z: number; w: number }): [number, number, number] {
  const { x, y, z, w } = q;
  const m11 = 1 - 2 * (y * y + z * z);
  const m21 = 2 * (x * y + w * z);
  const m31 = 2 * (x * z - w * y);
  const m12 = 2 * (x * y - w * z);
  const m22 = 1 - 2 * (x * x + z * z);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const cl = Math.min(1, Math.max(-1, -m31));
  const ey = Math.asin(cl);
  if (Math.abs(m31) >= 0.9999999) return [0, ey, Math.atan2(-m12, m22)];
  return [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
}
