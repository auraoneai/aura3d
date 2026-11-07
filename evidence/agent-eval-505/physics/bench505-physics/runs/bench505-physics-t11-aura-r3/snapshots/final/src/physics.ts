// Small rigid-body engine: boxes, one sphere, a ground plane and a rigid rope.
// Fixed-step sequential impulses with SAT box-box manifolds, warm starting, friction,
// restitution and island sleeping. Written for this scene, so only what it needs exists.

export type V3 = [number, number, number];
export type Quat = [number, number, number, number];

const MARGIN = 0.05; // speculative contact distance
const SLOP = 0.005;
const BAUMGARTE = 0.2;
const MAX_PUSH = 2.0;
const REST_THRESHOLD = 1.0;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export type BodyKind = "plane" | "sphere" | "box";

export interface Body {
  readonly id: number;
  readonly kind: BodyKind;
  index: number;
  invMass: number;
  invI: number; // isotropic inverse inertia (cube and sphere)
  half: V3;
  radius: number;
  bound: number;
  friction: number;
  restitution: number;
  linDamp: number;
  angDamp: number;
  neverSleep: boolean;
  p: V3;
  v: V3;
  w: V3;
  q: Quat;
  ax: [V3, V3, V3];
  asleep: boolean;
  sleepT: number;
  readonly initialP: V3;
}

function updateAxes(b: Body): void {
  const [x, y, z, w] = b.q;
  b.ax[0] = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
  b.ax[1] = [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)];
  b.ax[2] = [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
}

/** Euler angles (radians) such that R = Rz * Ry * Rx, the order the renderer's setRotation uses. */
export function eulerZYX(b: Body): V3 {
  const r20 = b.ax[0][2];
  const r21 = b.ax[1][2];
  const r22 = b.ax[2][2];
  const r10 = b.ax[0][1];
  const r00 = b.ax[0][0];
  const r11 = b.ax[1][1];
  const r12 = b.ax[2][1];
  const ey = Math.asin(clamp(-r20, -1, 1));
  if (Math.abs(r20) < 0.99999) return [Math.atan2(r21, r22), ey, Math.atan2(r10, r00)];
  return [Math.atan2(-r12, r11), ey, 0];
}

let nextId = 1;

function makeBody(kind: BodyKind, p: V3, mass: number, invI: number, half: V3, radius: number): Body {
  const bound = kind === "box" ? Math.hypot(half[0], half[1], half[2]) : kind === "sphere" ? radius : 0;
  const b: Body = {
    id: nextId++,
    kind,
    index: 0,
    invMass: mass > 0 ? 1 / mass : 0,
    invI,
    half,
    radius,
    bound,
    friction: 0.5,
    restitution: 0.1,
    linDamp: 0.02,
    angDamp: 0.05,
    neverSleep: false,
    p: [p[0], p[1], p[2]],
    v: [0, 0, 0],
    w: [0, 0, 0],
    q: [0, 0, 0, 1],
    ax: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    asleep: false,
    sleepT: 0,
    initialP: [p[0], p[1], p[2]]
  };
  return b;
}

interface ContactPt {
  p: V3;
  depth: number;
  ra: V3;
  rb: V3;
  kN: number;
  kT1: number;
  kT2: number;
  vTarget: number;
  jn: number;
  jt1: number;
  jt2: number;
}

interface Manifold {
  a: Body;
  b: Body;
  n: V3; // from a to b
  t1: V3;
  t2: V3;
  mu: number;
  e: number;
  key: string;
  pts: ContactPt[];
}

interface RawPt {
  p: V3;
  depth: number;
}
interface Raw {
  n: V3;
  pts: RawPt[];
}

interface PrevPt {
  p: V3;
  jn: number;
  f: V3; // friction impulse as a world vector
}

// ---------------------------------------------------------------- collision

function projR(b: Body, L: V3): number {
  return (
    b.half[0] * Math.abs(dot(b.ax[0], L)) + b.half[1] * Math.abs(dot(b.ax[1], L)) + b.half[2] * Math.abs(dot(b.ax[2], L))
  );
}

function clipPoly(poly: V3[], nrm: V3, off: number): V3[] {
  const out: V3[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const da = dot(a, nrm) - off;
    const db = dot(b, nrm) - off;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push(add(a, mul(sub(b, a), t)));
    }
  }
  return out;
}

function faceManifold(ref: Body, inc: Body, axis: number): Raw | null {
  let n = ref.ax[axis];
  const d = sub(inc.p, ref.p);
  if (dot(n, d) < 0) n = neg(n);
  let j = 0;
  let bestAbs = -1;
  for (let k = 0; k < 3; k += 1) {
    const a = Math.abs(dot(inc.ax[k], n));
    if (a > bestAbs) {
      bestAbs = a;
      j = k;
    }
  }
  const m = mul(inc.ax[j], dot(inc.ax[j], n) > 0 ? -1 : 1);
  const fc = add(inc.p, mul(m, inc.half[j]));
  const k1 = (j + 1) % 3;
  const k2 = (j + 2) % 3;
  const e1 = mul(inc.ax[k1], inc.half[k1]);
  const e2 = mul(inc.ax[k2], inc.half[k2]);
  let poly: V3[] = [add(add(fc, e1), e2), add(sub(fc, e1), e2), sub(sub(fc, e1), e2), sub(add(fc, e1), e2)];
  for (const s of [(axis + 1) % 3, (axis + 2) % 3]) {
    const u = ref.ax[s];
    const c = dot(ref.p, u);
    const h = ref.half[s];
    poly = clipPoly(poly, u, c + h);
    if (poly.length === 0) return null;
    poly = clipPoly(poly, neg(u), -c + h);
    if (poly.length === 0) return null;
  }
  const faceOff = dot(ref.p, n) + ref.half[axis];
  const pts: RawPt[] = [];
  for (const x of poly) {
    const sep = dot(x, n) - faceOff;
    if (sep <= MARGIN) pts.push({ p: sub(x, mul(n, 0.5 * sep)), depth: -sep });
  }
  return pts.length > 0 ? { n, pts } : null;
}

function boxBox(A: Body, B: Body): Raw | null {
  const d = sub(B.p, A.p);
  let faceSep = -Infinity;
  let faceRef = 0;
  for (let i = 0; i < 6; i += 1) {
    const L = i < 3 ? A.ax[i] : B.ax[i - 3];
    const sep = Math.abs(dot(d, L)) - projR(A, L) - projR(B, L);
    if (sep > MARGIN) return null;
    if (sep > faceSep) {
      faceSep = sep;
      faceRef = i;
    }
  }
  let edgeSep = -Infinity;
  let edgeI = -1;
  let edgeJ = -1;
  let edgeL: V3 = [0, 1, 0];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const c = cross(A.ax[i], B.ax[j]);
      const cl = Math.hypot(c[0], c[1], c[2]);
      if (cl < 1e-4) continue;
      const L = mul(c, 1 / cl);
      const sep = Math.abs(dot(d, L)) - projR(A, L) - projR(B, L);
      if (sep > MARGIN) return null;
      if (sep > edgeSep) {
        edgeSep = sep;
        edgeI = i;
        edgeJ = j;
        edgeL = L;
      }
    }
  }
  if (edgeI >= 0 && edgeSep > faceSep + 0.01) {
    const n = dot(edgeL, d) < 0 ? neg(edgeL) : edgeL;
    let pa: V3 = [A.p[0], A.p[1], A.p[2]];
    for (let k = 0; k < 3; k += 1) {
      if (k === edgeI) continue;
      pa = add(pa, mul(A.ax[k], dot(A.ax[k], n) >= 0 ? A.half[k] : -A.half[k]));
    }
    let pb: V3 = [B.p[0], B.p[1], B.p[2]];
    for (let k = 0; k < 3; k += 1) {
      if (k === edgeJ) continue;
      pb = add(pb, mul(B.ax[k], dot(B.ax[k], n) >= 0 ? -B.half[k] : B.half[k]));
    }
    const da = A.ax[edgeI];
    const db = B.ax[edgeJ];
    const r = sub(pa, pb);
    const bb = dot(da, db);
    const c = dot(da, r);
    const f = dot(db, r);
    const den = 1 - bb * bb;
    const u = clamp((f - bb * c) / den, -B.half[edgeJ], B.half[edgeJ]);
    const t = clamp(u * bb - c, -A.half[edgeI], A.half[edgeI]);
    const p1 = add(pa, mul(da, t));
    const p2 = add(pb, mul(db, u));
    return { n, pts: [{ p: mul(add(p1, p2), 0.5), depth: -edgeSep }] };
  }
  if (faceRef < 3) return faceManifold(A, B, faceRef);
  const raw = faceManifold(B, A, faceRef - 3);
  return raw ? { n: neg(raw.n), pts: raw.pts } : null;
}

function boxPlane(P: Body, B: Body): Raw | null {
  const pts: RawPt[] = [];
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        let v: V3 = [B.p[0], B.p[1], B.p[2]];
        v = add(v, mul(B.ax[0], sx * B.half[0]));
        v = add(v, mul(B.ax[1], sy * B.half[1]));
        v = add(v, mul(B.ax[2], sz * B.half[2]));
        const sep = v[1] - P.p[1];
        if (sep <= MARGIN) pts.push({ p: [v[0], P.p[1] + sep * 0.5, v[2]], depth: -sep });
      }
    }
  }
  return pts.length > 0 ? { n: [0, 1, 0], pts } : null;
}

function spherePlane(P: Body, S: Body): Raw | null {
  const sep = S.p[1] - S.radius - P.p[1];
  if (sep > MARGIN) return null;
  return { n: [0, 1, 0], pts: [{ p: [S.p[0], P.p[1], S.p[2]], depth: -sep }] };
}

function sphereBox(S: Body, B: Body): Raw | null {
  const d = sub(S.p, B.p);
  const l: V3 = [dot(d, B.ax[0]), dot(d, B.ax[1]), dot(d, B.ax[2])];
  const h = B.half;
  const inside = Math.abs(l[0]) <= h[0] && Math.abs(l[1]) <= h[1] && Math.abs(l[2]) <= h[2];
  let boxToSphere: V3;
  let depth: number;
  let point: V3;
  if (!inside) {
    const c: V3 = [clamp(l[0], -h[0], h[0]), clamp(l[1], -h[1], h[1]), clamp(l[2], -h[2], h[2])];
    const dl: V3 = [l[0] - c[0], l[1] - c[1], l[2] - c[2]];
    const dist = Math.hypot(dl[0], dl[1], dl[2]);
    if (dist - S.radius > MARGIN) return null;
    const diff = add(add(mul(B.ax[0], dl[0]), mul(B.ax[1], dl[1])), mul(B.ax[2], dl[2]));
    boxToSphere = mul(diff, 1 / dist);
    depth = S.radius - dist;
    point = add(add(add(B.p, mul(B.ax[0], c[0])), mul(B.ax[1], c[1])), mul(B.ax[2], c[2]));
  } else {
    let k = 0;
    let best = Infinity;
    for (let i = 0; i < 3; i += 1) {
      const pen = h[i] - Math.abs(l[i]);
      if (pen < best) {
        best = pen;
        k = i;
      }
    }
    boxToSphere = mul(B.ax[k], l[k] >= 0 ? 1 : -1);
    depth = S.radius + best;
    point = [S.p[0], S.p[1], S.p[2]];
  }
  return { n: neg(boxToSphere), pts: [{ p: point, depth }] };
}

// -------------------------------------------------------------------- world

export interface WorldConfig {
  pivot: V3;
  ropeLength: number;
  ballRadius: number;
  ballMass: number;
  crateMass: number;
  rows: number;
  pyramidX: number;
}

const rank = (b: Body): number => (b.kind === "plane" ? 0 : b.kind === "sphere" ? 1 : 2);

export class World {
  readonly dt = 1 / 120;
  readonly bodies: Body[] = [];
  readonly crates: Body[] = [];
  readonly ground: Body;
  readonly ball: Body;
  readonly pivot: V3;
  readonly ropeLength: number;
  private readonly gravityY = -9.81;
  private readonly iterations = 18;
  private prev = new Map<string, PrevPt[]>();
  private parent: number[] = [];

  constructor(cfg: WorldConfig) {
    this.pivot = cfg.pivot;
    this.ropeLength = cfg.ropeLength;

    this.ground = makeBody("plane", [0, 0, 0], 0, 0, [0, 0, 0], 0);
    this.ground.friction = 0.7;
    this.ground.restitution = 0.05;
    this.bodies.push(this.ground);

    for (let row = 0; row < cfg.rows; row += 1) {
      const count = cfg.rows - row;
      for (let i = 0; i < count; i += 1) {
        const x = cfg.pyramidX + (i - (count - 1) / 2);
        const crate = makeBody("box", [x, 0.5 + row, 0], cfg.crateMass, 6 / cfg.crateMass, [0.5, 0.5, 0.5], 0);
        crate.friction = 0.5;
        crate.restitution = 0.1;
        this.crates.push(crate);
        this.bodies.push(crate);
      }
    }

    const r = cfg.ballRadius;
    const invI = 1 / (0.4 * cfg.ballMass * r * r);
    this.ball = makeBody("sphere", [cfg.pivot[0], cfg.pivot[1] - cfg.ropeLength, cfg.pivot[2]], cfg.ballMass, invI, [r, r, r], r);
    this.ball.friction = 0.3;
    this.ball.restitution = 0.25;
    this.ball.neverSleep = true;
    this.ball.linDamp = 0.12;
    this.ball.angDamp = 0.5;
    this.bodies.push(this.ball);

    this.bodies.forEach((b, i) => {
      b.index = i;
    });
    this.reset();
  }

  /** Rebuild the pyramid at its initial pose and hang the ball at rest. */
  reset(): void {
    for (const c of this.crates) {
      c.p = [c.initialP[0], c.initialP[1], c.initialP[2]];
      c.v = [0, 0, 0];
      c.w = [0, 0, 0];
      c.q = [0, 0, 0, 1];
      updateAxes(c);
      c.asleep = true;
      c.sleepT = 1;
    }
    const b = this.ball;
    b.p = [this.pivot[0], this.pivot[1] - this.ropeLength, this.pivot[2]];
    b.v = [0, 0, 0];
    b.w = [0, 0, 0];
    b.asleep = false;
    b.sleepT = 0;
    this.prev.clear();
  }

  /** Pull the ball back to `deg` degrees on the side away from the pyramid and release it from rest. */
  releaseFrom(deg: number): void {
    const a = (deg * Math.PI) / 180;
    const b = this.ball;
    b.p = [this.pivot[0] - Math.sin(a) * this.ropeLength, this.pivot[1] - Math.cos(a) * this.ropeLength, this.pivot[2]];
    b.v = [0, 0, 0];
    b.w = [0, 0, 0];
  }

  /** Signed pendulum angle in degrees: positive on the pulled-back side, negative towards the pyramid. */
  ballAngleDeg(): number {
    const dx = this.ball.p[0] - this.pivot[0];
    const dy = this.ball.p[1] - this.pivot[1];
    return (-Math.atan2(dx, -dy) * 180) / Math.PI + 0;
  }

  step(): void {
    const dt = this.dt;
    for (const b of this.bodies) {
      if (b.invMass === 0 || b.asleep) continue;
      b.v[1] += this.gravityY * dt;
      const lf = 1 / (1 + b.linDamp * dt);
      const af = 1 / (1 + b.angDamp * dt);
      b.v[0] *= lf;
      b.v[1] *= lf;
      b.v[2] *= lf;
      b.w[0] *= af;
      b.w[1] *= af;
      b.w[2] *= af;
    }
    const manifolds = this.collide();
    this.islands(manifolds);
    this.prepare(manifolds);
    this.solve(manifolds);
    this.integrate();
    this.projectRope();
    this.updateSleep();
    this.storeImpulses(manifolds);
  }

  // ---- detection
  private collide(): Manifold[] {
    const out: Manifold[] = [];
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i += 1) {
      for (let j = i + 1; j < bs.length; j += 1) {
        let a = bs[i];
        let b = bs[j];
        const ia = a.invMass === 0 || a.asleep;
        const ib = b.invMass === 0 || b.asleep;
        if (ia && ib) continue;
        if (rank(a) > rank(b)) {
          const t = a;
          a = b;
          b = t;
        }
        if (a.kind === "plane") {
          if (b.p[1] - b.bound - a.p[1] > MARGIN) continue;
        } else {
          const dx = a.p[0] - b.p[0];
          const dy = a.p[1] - b.p[1];
          const dz = a.p[2] - b.p[2];
          const r = a.bound + b.bound + MARGIN;
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
        }
        let raw: Raw | null = null;
        if (a.kind === "plane") raw = b.kind === "box" ? boxPlane(a, b) : spherePlane(a, b);
        else if (a.kind === "sphere") raw = b.kind === "box" ? sphereBox(a, b) : null;
        else raw = boxBox(a, b);
        if (!raw) continue;
        const n = raw.n;
        const helper: V3 = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
        const t1 = cross(n, helper);
        const tl = Math.hypot(t1[0], t1[1], t1[2]);
        const tt1 = mul(t1, 1 / tl);
        out.push({
          a,
          b,
          n,
          t1: tt1,
          t2: cross(n, tt1),
          mu: Math.sqrt(a.friction * b.friction),
          e: Math.max(a.restitution, b.restitution),
          key: `${a.id}:${b.id}`,
          pts: raw.pts.map((q) => ({
            p: q.p,
            depth: q.depth,
            ra: sub(q.p, a.p),
            rb: sub(q.p, b.p),
            kN: 0,
            kT1: 0,
            kT2: 0,
            vTarget: 0,
            jn: 0,
            jt1: 0,
            jt2: 0
          }))
        });
      }
    }
    return out;
  }

  // ---- islands: touching dynamic bodies share a sleep state
  private find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r];
    let c = i;
    while (this.parent[c] !== r) {
      const nx = this.parent[c];
      this.parent[c] = r;
      c = nx;
    }
    return r;
  }

  private islands(manifolds: Manifold[]): void {
    this.parent = this.bodies.map((_, i) => i);
    for (const m of manifolds) {
      if (m.a.invMass > 0 && m.b.invMass > 0) {
        const ra = this.find(m.a.index);
        const rb = this.find(m.b.index);
        if (ra !== rb) this.parent[ra] = rb;
      }
    }
    const awake = new Set<number>();
    for (const b of this.bodies) if (b.invMass > 0 && !b.asleep) awake.add(this.find(b.index));
    for (const b of this.bodies) {
      if (b.invMass > 0 && b.asleep && awake.has(this.find(b.index))) {
        b.asleep = false;
        b.sleepT = 0;
      }
    }
  }

  // ---- constraint setup
  private prepare(manifolds: Manifold[]): void {
    const dt = this.dt;
    for (const m of manifolds) {
      const { a, b, n, t1, t2 } = m;
      const prevPts = this.prev.get(m.key);
      for (const pt of m.pts) {
        const ran = cross(pt.ra, n);
        const rbn = cross(pt.rb, n);
        pt.kN = a.invMass + b.invMass + a.invI * dot(ran, ran) + b.invI * dot(rbn, rbn);
        const rat1 = cross(pt.ra, t1);
        const rbt1 = cross(pt.rb, t1);
        pt.kT1 = a.invMass + b.invMass + a.invI * dot(rat1, rat1) + b.invI * dot(rbt1, rbt1);
        const rat2 = cross(pt.ra, t2);
        const rbt2 = cross(pt.rb, t2);
        pt.kT2 = a.invMass + b.invMass + a.invI * dot(rat2, rat2) + b.invI * dot(rbt2, rbt2);
        const vn0 = relVelDot(m, pt, n[0], n[1], n[2]);
        let vt = pt.depth > SLOP ? Math.min((BAUMGARTE * (pt.depth - SLOP)) / dt, MAX_PUSH) : pt.depth >= 0 ? 0 : pt.depth / dt;
        if (vn0 < -REST_THRESHOLD && pt.depth - vn0 * dt >= 0) vt = Math.max(vt, -m.e * vn0);
        pt.vTarget = vt;
        if (prevPts && pt.depth > -0.002) {
          let best: PrevPt | undefined;
          let bestD = 0.1 * 0.1;
          for (const pp of prevPts) {
            const dx = pp.p[0] - pt.p[0];
            const dy = pp.p[1] - pt.p[1];
            const dz = pp.p[2] - pt.p[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD) {
              bestD = d2;
              best = pp;
            }
          }
          if (best) {
            pt.jn = best.jn;
            pt.jt1 = dot(best.f, t1);
            pt.jt2 = dot(best.f, t2);
            applyImpulse(
              m,
              pt,
              n[0] * pt.jn + t1[0] * pt.jt1 + t2[0] * pt.jt2,
              n[1] * pt.jn + t1[1] * pt.jt1 + t2[1] * pt.jt2,
              n[2] * pt.jn + t1[2] * pt.jt1 + t2[2] * pt.jt2
            );
          }
        }
      }
    }
  }

  private solve(manifolds: Manifold[]): void {
    for (let it = 0; it < this.iterations; it += 1) {
      for (const m of manifolds) {
        const { n, t1, t2 } = m;
        for (const pt of m.pts) {
          const maxF = m.mu * pt.jn;
          let vt = relVelDot(m, pt, t1[0], t1[1], t1[2]);
          let dj = -vt / pt.kT1;
          let old = pt.jt1;
          pt.jt1 = clamp(old + dj, -maxF, maxF);
          dj = pt.jt1 - old;
          if (dj !== 0) applyImpulse(m, pt, t1[0] * dj, t1[1] * dj, t1[2] * dj);

          vt = relVelDot(m, pt, t2[0], t2[1], t2[2]);
          dj = -vt / pt.kT2;
          old = pt.jt2;
          pt.jt2 = clamp(old + dj, -maxF, maxF);
          dj = pt.jt2 - old;
          if (dj !== 0) applyImpulse(m, pt, t2[0] * dj, t2[1] * dj, t2[2] * dj);

          const vn = relVelDot(m, pt, n[0], n[1], n[2]);
          dj = (pt.vTarget - vn) / pt.kN;
          old = pt.jn;
          pt.jn = Math.max(old + dj, 0);
          dj = pt.jn - old;
          if (dj !== 0) applyImpulse(m, pt, n[0] * dj, n[1] * dj, n[2] * dj);
        }
      }
      this.ropeVelocity();
    }
  }

  /** Rigid rope: remove the ball's velocity along the rope. */
  private ropeVelocity(): void {
    const b = this.ball;
    const dx = b.p[0] - this.pivot[0];
    const dy = b.p[1] - this.pivot[1];
    const dz = b.p[2] - this.pivot[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / l;
    const ny = dy / l;
    const nz = dz / l;
    const vr = b.v[0] * nx + b.v[1] * ny + b.v[2] * nz;
    b.v[0] -= nx * vr;
    b.v[1] -= ny * vr;
    b.v[2] -= nz * vr;
  }

  private integrate(): void {
    const dt = this.dt;
    for (const b of this.bodies) {
      if (b.invMass === 0 || b.asleep) continue;
      b.p[0] += b.v[0] * dt;
      b.p[1] += b.v[1] * dt;
      b.p[2] += b.v[2] * dt;
      const [wx, wy, wz] = b.w;
      const [qx, qy, qz, qw] = b.q;
      const h = 0.5 * dt;
      let nx = qx + h * (wx * qw + wy * qz - wz * qy);
      let ny = qy + h * (wy * qw + wz * qx - wx * qz);
      let nz = qz + h * (wz * qw + wx * qy - wy * qx);
      let nw = qw + h * (-wx * qx - wy * qy - wz * qz);
      const l = Math.hypot(nx, ny, nz, nw) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      nw /= l;
      b.q = [nx, ny, nz, nw];
      updateAxes(b);
    }
  }

  /** Keep the ball exactly one rope length from the pivot. */
  private projectRope(): void {
    const b = this.ball;
    const dx = b.p[0] - this.pivot[0];
    const dy = b.p[1] - this.pivot[1];
    const dz = b.p[2] - this.pivot[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const s = this.ropeLength / l;
    b.p = [this.pivot[0] + dx * s, this.pivot[1] + dy * s, this.pivot[2] + dz * s];
    this.ropeVelocity();
  }

  private updateSleep(): void {
    const dt = this.dt;
    const minT = new Map<number, number>();
    for (const b of this.bodies) {
      if (b.invMass === 0 || b.asleep) continue;
      if (b.neverSleep) b.sleepT = 0;
      else {
        const quiet = dot(b.v, b.v) < 0.08 * 0.08 && dot(b.w, b.w) < 0.25 * 0.25;
        b.sleepT = quiet ? b.sleepT + dt : 0;
      }
      const r = this.find(b.index);
      minT.set(r, Math.min(minT.get(r) ?? Infinity, b.sleepT));
    }
    for (const b of this.bodies) {
      if (b.invMass === 0 || b.asleep) continue;
      if ((minT.get(this.find(b.index)) ?? 0) >= 0.5) {
        b.asleep = true;
        b.v = [0, 0, 0];
        b.w = [0, 0, 0];
      }
    }
  }

  private storeImpulses(manifolds: Manifold[]): void {
    this.prev.clear();
    for (const m of manifolds) {
      const list: PrevPt[] = [];
      for (const pt of m.pts) {
        list.push({
          p: pt.p,
          jn: pt.jn,
          f: [
            m.t1[0] * pt.jt1 + m.t2[0] * pt.jt2,
            m.t1[1] * pt.jt1 + m.t2[1] * pt.jt2,
            m.t1[2] * pt.jt1 + m.t2[2] * pt.jt2
          ]
        });
      }
      this.prev.set(m.key, list);
    }
  }
}

// ----------------------------------------------------------- scalar helpers

function relVelDot(m: Manifold, pt: ContactPt, dx: number, dy: number, dz: number): number {
  const a = m.a;
  const b = m.b;
  const ra = pt.ra;
  const rb = pt.rb;
  const vax = a.v[0] + a.w[1] * ra[2] - a.w[2] * ra[1];
  const vay = a.v[1] + a.w[2] * ra[0] - a.w[0] * ra[2];
  const vaz = a.v[2] + a.w[0] * ra[1] - a.w[1] * ra[0];
  const vbx = b.v[0] + b.w[1] * rb[2] - b.w[2] * rb[1];
  const vby = b.v[1] + b.w[2] * rb[0] - b.w[0] * rb[2];
  const vbz = b.v[2] + b.w[0] * rb[1] - b.w[1] * rb[0];
  return (vbx - vax) * dx + (vby - vay) * dy + (vbz - vaz) * dz;
}

function applyImpulse(m: Manifold, pt: ContactPt, px: number, py: number, pz: number): void {
  const a = m.a;
  const b = m.b;
  const ra = pt.ra;
  const rb = pt.rb;
  if (a.invMass > 0) {
    a.v[0] -= px * a.invMass;
    a.v[1] -= py * a.invMass;
    a.v[2] -= pz * a.invMass;
    a.w[0] -= a.invI * (ra[1] * pz - ra[2] * py);
    a.w[1] -= a.invI * (ra[2] * px - ra[0] * pz);
    a.w[2] -= a.invI * (ra[0] * py - ra[1] * px);
  }
  if (b.invMass > 0) {
    b.v[0] += px * b.invMass;
    b.v[1] += py * b.invMass;
    b.v[2] += pz * b.invMass;
    b.w[0] += b.invI * (rb[1] * pz - rb[2] * py);
    b.w[1] += b.invI * (rb[2] * px - rb[0] * pz);
    b.w[2] += b.invI * (rb[0] * py - rb[1] * px);
  }
}
