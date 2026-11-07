// Small 2D rigid-body solver (sequential impulses, warm starting, Coulomb friction, restitution).
// All motion happens in the XY plane; the renderer draws the bodies as 3D shapes at z = 0.

export type BodyTag = "ground" | "crate" | "ball";

export interface Body {
  id: number;
  tag: BodyTag;
  kind: "box" | "circle";
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  w: number;
  im: number;
  ii: number;
  hx: number;
  hy: number;
  r: number;
  mu: number;
  e: number;
  lin: number;
  ang: number;
}

let nextId = 0;

export function makeBox(tag: BodyTag, x: number, y: number, hx: number, hy: number, mass: number, mu: number, e: number): Body {
  const m = mass > 0 ? mass : 0;
  const inertia = m > 0 ? (m * (hx * hx + hy * hy)) / 3 : 0;
  return {
    id: nextId++, tag, kind: "box", x, y, a: 0, vx: 0, vy: 0, w: 0,
    im: m > 0 ? 1 / m : 0, ii: inertia > 0 ? 1 / inertia : 0, hx, hy, r: 0, mu, e, lin: 0.04, ang: 0.15
  };
}

export function makeCircle(tag: BodyTag, x: number, y: number, r: number, mass: number, mu: number, e: number): Body {
  const inertia = 0.5 * mass * r * r;
  return {
    id: nextId++, tag, kind: "circle", x, y, a: 0, vx: 0, vy: 0, w: 0,
    im: 1 / mass, ii: 1 / inertia, hx: 0, hy: 0, r, mu, e, lin: 0.06, ang: 0.1
  };
}

interface Hit { px: number; py: number; nx: number; ny: number; sep: number }

interface Contact {
  px: number; py: number; nx: number; ny: number; sep: number;
  rax: number; ray: number; rbx: number; rby: number;
  mn: number; mt: number; target: number;
  pn: number; pt: number;
}

interface Manifold { a: Body; b: Body; mu: number; contacts: Contact[] }

interface Vec { x: number; y: number }

const MARGIN = 0.02;
const SLOP = 0.01;
const BIAS = 0.2;
const ITERATIONS = 24;
const GRAVITY = -9.81;

function faceNormals(b: Body): Vec[] {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  // local x axis u = (c, s), local y axis v = (-s, c); faces: bottom, right, top, left
  return [{ x: s, y: -c }, { x: c, y: s }, { x: -s, y: c }, { x: -c, y: -s }];
}

function verts(b: Body): Vec[] {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  const ux = c * b.hx, uy = s * b.hx, vx = -s * b.hy, vy = c * b.hy;
  return [
    { x: b.x - ux - vx, y: b.y - uy - vy },
    { x: b.x + ux - vx, y: b.y + uy - vy },
    { x: b.x + ux + vx, y: b.y + uy + vy },
    { x: b.x - ux + vx, y: b.y - uy + vy }
  ];
}

function bestFace(a: Body, b: Body): { sep: number; face: number } {
  const normals = faceNormals(a);
  const vs = verts(b);
  let best = -Infinity, face = 0;
  for (let i = 0; i < 4; i += 1) {
    const n = normals[i]!;
    const h = i % 2 === 0 ? a.hy : a.hx;
    let m = Infinity;
    for (const v of vs) {
      const d = (v.x - a.x) * n.x + (v.y - a.y) * n.y;
      if (d < m) m = d;
    }
    const sep = m - h;
    if (sep > best) { best = sep; face = i; }
  }
  return { sep: best, face };
}

function boxBox(A: Body, B: Body): Hit[] {
  const fa = bestFace(A, B);
  if (fa.sep > MARGIN) return [];
  const fb = bestFace(B, A);
  if (fb.sep > MARGIN) return [];
  let R = A, I = B, face = fa.face, flip = false;
  if (fb.sep > fa.sep + 0.005) { R = B; I = A; face = fb.face; flip = true; }
  const n = faceNormals(R)[face]!;
  const along = face % 2 === 0 ? R.hy : R.hx;
  const hw = face % 2 === 0 ? R.hx : R.hy;
  const normalsI = faceNormals(I);
  let j = 0, minDot = Infinity;
  for (let k = 0; k < 4; k += 1) {
    const q = normalsI[k]!;
    const d = q.x * n.x + q.y * n.y;
    if (d < minDot) { minDot = d; j = k; }
  }
  const vi = verts(I);
  let p0 = vi[j]!, p1 = vi[(j + 1) % 4]!;
  const tx = -n.y, ty = n.x;
  for (const sign of [1, -1]) {
    const s0 = hw - sign * ((p0.x - R.x) * tx + (p0.y - R.y) * ty);
    const s1 = hw - sign * ((p1.x - R.x) * tx + (p1.y - R.y) * ty);
    if (s0 < 0 && s1 < 0) return [];
    const q0 = s0 < 0 ? lerp(p0, p1, s0 / (s0 - s1)) : p0;
    const q1 = s1 < 0 ? lerp(p1, p0, s1 / (s1 - s0)) : p1;
    p0 = q0; p1 = q1;
  }
  const fcx = R.x + n.x * along, fcy = R.y + n.y * along;
  const out: Hit[] = [];
  for (const q of [p0, p1]) {
    const sep = (q.x - fcx) * n.x + (q.y - fcy) * n.y;
    if (sep <= MARGIN) {
      out.push({
        px: q.x - n.x * sep * 0.5, py: q.y - n.y * sep * 0.5,
        nx: flip ? -n.x : n.x, ny: flip ? -n.y : n.y, sep
      });
    }
  }
  return out;
}

function lerp(a: Vec, b: Vec, k: number): Vec {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

// Normal points from the box to the circle.
function boxCircle(box: Body, circ: Body): Hit[] {
  const c = Math.cos(box.a), s = Math.sin(box.a);
  const dx = circ.x - box.x, dy = circ.y - box.y;
  const lx = c * dx + s * dy, ly = -s * dx + c * dy;
  const cx = Math.max(-box.hx, Math.min(box.hx, lx));
  const cy = Math.max(-box.hy, Math.min(box.hy, ly));
  const ex = lx - cx, ey = ly - cy;
  const d2 = ex * ex + ey * ey;
  const reach = circ.r + MARGIN;
  let nlx: number, nly: number, qx: number, qy: number, sep: number;
  if (d2 > 1e-12) {
    if (d2 > reach * reach) return [];
    const d = Math.sqrt(d2);
    nlx = ex / d; nly = ey / d; qx = cx; qy = cy; sep = d - circ.r;
  } else {
    const penX = box.hx - Math.abs(lx), penY = box.hy - Math.abs(ly);
    if (penX < penY) {
      const sg = lx >= 0 ? 1 : -1;
      nlx = sg; nly = 0; qx = sg * box.hx; qy = ly; sep = -penX - circ.r;
    } else {
      const sg = ly >= 0 ? 1 : -1;
      nlx = 0; nly = sg; qx = lx; qy = sg * box.hy; sep = -penY - circ.r;
    }
  }
  const nx = c * nlx - s * nly, ny = s * nlx + c * nly;
  const wx = box.x + c * qx - s * qy, wy = box.y + s * qx + c * qy;
  return [{ px: wx + nx * sep * 0.5, py: wy + ny * sep * 0.5, nx, ny, sep }];
}

export class World {
  bodies: Body[] = [];
  ballHit = false;
  private manifolds = new Map<string, Manifold>();
  private rope: { body: Body; px: number; py: number; len: number } | null = null;

  add(b: Body): Body {
    this.bodies.push(b);
    return b;
  }

  setRope(body: Body, px: number, py: number, len: number): void {
    this.rope = { body, px, py, len };
  }

  private applyImpulse(a: Body, b: Body, rax: number, ray: number, rbx: number, rby: number, px: number, py: number): void {
    a.vx -= a.im * px; a.vy -= a.im * py; a.w -= a.ii * (rax * py - ray * px);
    b.vx += b.im * px; b.vy += b.im * py; b.w += b.ii * (rbx * py - rby * px);
  }

  private collide(dt: number): void {
    const next = new Map<string, Manifold>();
    const list = this.bodies;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        let A = list[i]!, B = list[j]!;
        if (A.im === 0 && B.im === 0) continue;
        if (A.kind === "circle" && B.kind === "circle") continue;
        if (A.kind === "circle") { const t = A; A = B; B = t; }
        const bound = (q: Body): number => (q.kind === "circle" ? q.r : Math.hypot(q.hx, q.hy));
        if (Math.hypot(A.x - B.x, A.y - B.y) > bound(A) + bound(B) + 0.1) continue;
        const hits = B.kind === "box" ? boxBox(A, B) : boxCircle(A, B);
        if (hits.length === 0) continue;
        if (A.tag === "ball" || B.tag === "ball") this.ballHit = true;
        const key = `${A.id}:${B.id}`;
        const old = this.manifolds.get(key);
        const claimed: boolean[] = old ? old.contacts.map(() => false) : [];
        const contacts: Contact[] = [];
        for (const h of hits) {
          const rax = h.px - A.x, ray = h.py - A.y, rbx = h.px - B.x, rby = h.py - B.y;
          const nx = h.nx, ny = h.ny, tx = ny, ty = -nx;
          const rnA = rax * ny - ray * nx, rnB = rbx * ny - rby * nx;
          const rtA = rax * ty - ray * tx, rtB = rbx * ty - rby * tx;
          const kn = A.im + B.im + A.ii * rnA * rnA + B.ii * rnB * rnB;
          const kt = A.im + B.im + A.ii * rtA * rtA + B.ii * rtB * rtB;
          const e = Math.max(A.e, B.e);
          const dvx = B.vx - B.w * rby - (A.vx - A.w * ray);
          const dvy = B.vy + B.w * rbx - (A.vy + A.w * rax);
          const vn = dvx * nx + dvy * ny;
          const bounce = vn < -1.5 ? -e * vn : 0;
          const push = Math.min(3, (-BIAS / dt) * Math.min(0, h.sep + SLOP));
          let pn = 0, pt = 0;
          if (old) {
            let bestK = -1, bestD = 0.01;
            old.contacts.forEach((oc, k) => {
              if (claimed[k]) return;
              const d = (oc.px - h.px) ** 2 + (oc.py - h.py) ** 2;
              if (d < bestD) { bestD = d; bestK = k; }
            });
            if (bestK >= 0) {
              claimed[bestK] = true;
              pn = old.contacts[bestK]!.pn;
              pt = old.contacts[bestK]!.pt;
            }
          }
          contacts.push({
            px: h.px, py: h.py, nx, ny, sep: h.sep, rax, ray, rbx, rby,
            mn: kn > 0 ? 1 / kn : 0, mt: kt > 0 ? 1 / kt : 0, target: Math.max(push, bounce), pn, pt
          });
        }
        next.set(key, { a: A, b: B, mu: Math.sqrt(A.mu * B.mu), contacts });
      }
    }
    this.manifolds = next;
  }

  step(dt: number): void {
    for (const b of this.bodies) {
      if (b.im === 0) continue;
      b.vy += GRAVITY * dt;
      const dl = 1 / (1 + dt * b.lin), da = 1 / (1 + dt * b.ang);
      b.vx *= dl; b.vy *= dl; b.w *= da;
    }
    this.collide(dt);
    for (const m of this.manifolds.values()) {
      for (const c of m.contacts) {
        const tx = c.ny, ty = -c.nx;
        this.applyImpulse(m.a, m.b, c.rax, c.ray, c.rbx, c.rby, c.pn * c.nx + c.pt * tx, c.pn * c.ny + c.pt * ty);
      }
    }
    for (let it = 0; it < ITERATIONS; it += 1) {
      for (const m of this.manifolds.values()) {
        const A = m.a, B = m.b;
        for (const c of m.contacts) {
          let dvx = B.vx - B.w * c.rby - (A.vx - A.w * c.ray);
          let dvy = B.vy + B.w * c.rbx - (A.vy + A.w * c.rax);
          const vn = dvx * c.nx + dvy * c.ny;
          const pn0 = c.pn;
          c.pn = Math.max(pn0 + c.mn * (c.target - vn), 0);
          const ln = c.pn - pn0;
          this.applyImpulse(A, B, c.rax, c.ray, c.rbx, c.rby, ln * c.nx, ln * c.ny);

          dvx = B.vx - B.w * c.rby - (A.vx - A.w * c.ray);
          dvy = B.vy + B.w * c.rbx - (A.vy + A.w * c.rax);
          const tx = c.ny, ty = -c.nx;
          const vt = dvx * tx + dvy * ty;
          const maxF = m.mu * c.pn;
          const pt0 = c.pt;
          c.pt = Math.max(-maxF, Math.min(maxF, pt0 - c.mt * vt));
          const lt = c.pt - pt0;
          this.applyImpulse(A, B, c.rax, c.ray, c.rbx, c.rby, lt * tx, lt * ty);
        }
      }
      this.solveRope();
    }
    for (const b of this.bodies) {
      if (b.im === 0) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.w * dt;
    }
    this.projectRope();
  }

  private solveRope(): void {
    const r = this.rope;
    if (!r) return;
    const dx = r.body.x - r.px, dy = r.body.y - r.py;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const vn = r.body.vx * nx + r.body.vy * ny;
    r.body.vx -= vn * nx;
    r.body.vy -= vn * ny;
  }

  private projectRope(): void {
    const r = this.rope;
    if (!r) return;
    const dx = r.body.x - r.px, dy = r.body.y - r.py;
    const d = Math.hypot(dx, dy) || 1;
    r.body.x = r.px + (dx / d) * r.len;
    r.body.y = r.py + (dy / d) * r.len;
  }
}
