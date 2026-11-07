import {
  camera,
  createAuraApp,
  effects,
  environments,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

/* ------------------------------------------------------------------ */
/* Small vector helpers                                                */
/* ------------------------------------------------------------------ */
type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const len = (a: V3): number => Math.sqrt(dot(a, a));
const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-12 ? mul(a, 1 / l) : [0, 1, 0];
};

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const G = 9.81;
const STEP = 1 / 240; // fixed physics timestep
const ITERATIONS = 14;
const PIVOT: V3 = [0, 7.2, 0];
const ROPE_L = 6;
const BALL_R = 0.8;
const BALL_M = 40;
const CRATE_M = 5;
const START_ANGLE = (60 * Math.PI) / 180;
const PULL_TIME = 1.1;
const PYRAMID_X = -4.6;
const ROWS = 5;
const MAST_X = 7;

/* ------------------------------------------------------------------ */
/* Rigid bodies                                                        */
/* ------------------------------------------------------------------ */
interface Body {
  id: number;
  p: V3;
  q: [number, number, number, number]; // x y z w
  v: V3;
  w: V3;
  invM: number;
  invI: number; // isotropic inverse inertia
  ax: [V3, V3, V3]; // world axes (rotation matrix columns)
  p0: V3;
}

function makeBody(id: number, p: V3, invM: number, invI: number): Body {
  return {
    id,
    p: [...p],
    q: [0, 0, 0, 1],
    v: [0, 0, 0],
    w: [0, 0, 0],
    invM,
    invI,
    ax: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    p0: [...p]
  };
}

function updateAxes(b: Body): void {
  const [x, y, z, w] = b.q;
  b.ax[0] = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
  b.ax[1] = [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)];
  b.ax[2] = [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
}

const GROUND = makeBody(-1, [0, 0, 0], 0, 0);
const ball = makeBody(1000, [0, PIVOT[1] - ROPE_L, 0], 0, 0);

const crates: Body[] = [];
function buildCrates(): void {
  crates.length = 0;
  let id = 0;
  for (let r = 0; r < ROWS; r += 1) {
    const count = ROWS - r;
    for (let i = 0; i < count; i += 1) {
      const x = PYRAMID_X + (i - (count - 1) / 2) * 1.002;
      const y = 0.5 + r * 1.001 + 0.001;
      crates.push(makeBody(id, [x, y, 0], 1 / CRATE_M, 6 / CRATE_M)); // I = m/6 for a unit cube
      id += 1;
    }
  }
}
buildCrates();
const CRATE_COUNT = crates.length; // 15

interface Sim {
  asleep: boolean;
  quietT: number;
  ballDyn: boolean;
  ballHit: boolean;
  hitT: number;
  time: number;
}
const sim: Sim = { asleep: true, quietT: 0, ballDyn: false, ballHit: false, hitT: 0, time: 0 };

interface Contact {
  a: Body;
  b: Body;
  n: V3; // from a to b
  p: V3;
  depth: number;
  key: string;
  mu: number;
  e: number;
  ra: V3;
  rb: V3;
  t1: V3;
  t2: V3;
  kn: number;
  kt1: number;
  kt2: number;
  target: number;
  pn: number;
  pt1: number;
  pt2: number;
}

function newContact(a: Body, b: Body, n: V3, p: V3, depth: number, key: string, mu: number, e: number): Contact {
  return {
    a, b, n, p, depth, key, mu, e,
    ra: [0, 0, 0], rb: [0, 0, 0], t1: [1, 0, 0], t2: [0, 0, 1],
    kn: 1, kt1: 1, kt2: 1, target: 0, pn: 0, pt1: 0, pt2: 0
  };
}

/* ---------------- narrow phase ---------------- */
const SPEC = 0.01; // speculative margin
function boxBox(A: Body, B: Body, out: Contact[]): void {
  const t = sub(B.p, A.p);
  if (dot(t, t) > 3.0) return;
  let best = Infinity;
  let axis: V3 = [0, 1, 0];
  let axisIdx = 0;
  let refIsA = true;
  for (let pass = 0; pass < 2; pass += 1) {
    const R = pass === 0 ? A : B;
    const O = pass === 0 ? B : A;
    for (let i = 0; i < 3; i += 1) {
      const L = R.ax[i];
      const rO = 0.5 * (Math.abs(dot(L, O.ax[0])) + Math.abs(dot(L, O.ax[1])) + Math.abs(dot(L, O.ax[2])));
      const overlap = 0.5 + rO - Math.abs(dot(t, L));
      if (overlap < -SPEC) return;
      const score = overlap + (pass === 0 ? 0 : 0.002);
      if (score < best) {
        best = score;
        axis = L;
        axisIdx = i;
        refIsA = pass === 0;
      }
    }
  }
  const s = dot(t, axis) >= 0 ? 1 : -1;
  const nAB = mul(axis, s);
  const R = refIsA ? A : B;
  const O = refIsA ? B : A;
  const nRef = refIsA ? nAB : mul(nAB, -1);
  const ju = R.ax[(axisIdx + 1) % 3];
  const jv = R.ax[(axisIdx + 2) % 3];
  let idx = 0;
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        const corner = add(O.p, mul(add(add(mul(O.ax[0], sx), mul(O.ax[1], sy)), mul(O.ax[2], sz)), 0.5));
        const rel = sub(corner, R.p);
        const d = 0.5 - dot(rel, nRef);
        const u = dot(rel, ju);
        const v = dot(rel, jv);
        if (d >= -SPEC && d < 1 && Math.abs(u) <= 0.52 && Math.abs(v) <= 0.52) {
          out.push(newContact(A, B, nAB, corner, d, `${A.id}:${B.id}:${refIsA ? 0 : 8 + 0}:${idx}`, 0.5, 0.1));
        }
        idx += 1;
      }
    }
  }
}

function boxGround(C: Body, out: Contact[]): void {
  if (C.p[1] > 0.9) return;
  let idx = 0;
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        const corner = add(C.p, mul(add(add(mul(C.ax[0], sx), mul(C.ax[1], sy)), mul(C.ax[2], sz)), 0.5));
        if (corner[1] < SPEC) {
          out.push(newContact(C, GROUND, [0, -1, 0], corner, -corner[1], `${C.id}:g:${idx}`, 0.7, 0.05));
        }
        idx += 1;
      }
    }
  }
}

function ballBox(C: Body, out: Contact[]): void {
  const d = sub(ball.p, C.p);
  if (dot(d, d) > (BALL_R + 0.87) * (BALL_R + 0.87)) return;
  const q: V3 = [dot(d, C.ax[0]), dot(d, C.ax[1]), dot(d, C.ax[2])];
  const cl: V3 = [
    Math.max(-0.5, Math.min(0.5, q[0])),
    Math.max(-0.5, Math.min(0.5, q[1])),
    Math.max(-0.5, Math.min(0.5, q[2]))
  ];
  const diff: V3 = [q[0] - cl[0], q[1] - cl[1], q[2] - cl[2]];
  const dist = len(diff);
  let nLocal: V3;
  let depth: number;
  let cp: V3 = cl;
  if (dist > 1e-9) {
    if (dist >= BALL_R) return;
    nLocal = mul(diff, 1 / dist);
    depth = BALL_R - dist;
  } else {
    // centre inside the box: push out along the shallowest axis
    let bi = 0;
    let bp = Infinity;
    for (let i = 0; i < 3; i += 1) {
      const pen = 0.5 - Math.abs(q[i]);
      if (pen < bp) { bp = pen; bi = i; }
    }
    nLocal = [0, 0, 0];
    nLocal[bi] = q[bi] >= 0 ? 1 : -1;
    depth = BALL_R + bp;
    cp = [q[0], q[1], q[2]];
    cp[bi] = nLocal[bi] * 0.5;
  }
  const n = add(add(mul(C.ax[0], nLocal[0]), mul(C.ax[1], nLocal[1])), mul(C.ax[2], nLocal[2]));
  const pw = add(C.p, add(add(mul(C.ax[0], cp[0]), mul(C.ax[1], cp[1])), mul(C.ax[2], cp[2])));
  out.push(newContact(C, ball, n, pw, depth, `${C.id}:ball:0`, 0.3, 0.25));
}

/* ---------------- solver ---------------- */
let warm = new Map<string, [number, number, number]>();

function velAt(b: Body, r: V3): V3 {
  return add(b.v, cross(b.w, r));
}
function relVel(c: Contact): V3 {
  return sub(velAt(c.b, c.rb), velAt(c.a, c.ra));
}
function effMass(c: Contact, d: V3): number {
  const ca = cross(c.ra, d);
  const cb = cross(c.rb, d);
  return c.a.invM + c.b.invM + c.a.invI * dot(ca, ca) + c.b.invI * dot(cb, cb);
}
function applyImpulse(c: Contact, P: V3): void {
  const a = c.a;
  const b = c.b;
  if (a.invM > 0) {
    a.v[0] -= P[0] * a.invM; a.v[1] -= P[1] * a.invM; a.v[2] -= P[2] * a.invM;
    if (a.invI > 0) {
      const t = cross(c.ra, P);
      a.w[0] -= t[0] * a.invI; a.w[1] -= t[1] * a.invI; a.w[2] -= t[2] * a.invI;
    }
  }
  if (b.invM > 0) {
    b.v[0] += P[0] * b.invM; b.v[1] += P[1] * b.invM; b.v[2] += P[2] * b.invM;
    if (b.invI > 0) {
      const t = cross(c.rb, P);
      b.w[0] += t[0] * b.invI; b.w[1] += t[1] * b.invI; b.w[2] += t[2] * b.invI;
    }
  }
}

function prepare(c: Contact, h: number): void {
  c.ra = sub(c.p, c.a.p);
  c.rb = sub(c.p, c.b.p);
  const helper: V3 = Math.abs(c.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  c.t1 = norm(cross(c.n, helper));
  c.t2 = cross(c.n, c.t1);
  c.kn = Math.max(effMass(c, c.n), 1e-9);
  c.kt1 = Math.max(effMass(c, c.t1), 1e-9);
  c.kt2 = Math.max(effMass(c, c.t2), 1e-9);
  const vn0 = dot(relVel(c), c.n);
  const restVel = vn0 < -1 ? -c.e * vn0 : 0;
  let target = 0;
  if (c.depth < 0) target = c.depth / h;
  else if (c.depth > 0.005) target = Math.min(2.5, (0.2 / h) * (c.depth - 0.005));
  c.target = Math.max(target, restVel);
  const cached = warm.get(c.key);
  if (cached) {
    c.pn = cached[0]; c.pt1 = cached[1]; c.pt2 = cached[2];
    applyImpulse(c, add(add(mul(c.n, c.pn), mul(c.t1, c.pt1)), mul(c.t2, c.pt2)));
  }
}

function solveContact(c: Contact): void {
  // friction first, then the normal row (normal wins)
  let rv = relVel(c);
  const maxF = c.mu * c.pn;
  let l1 = -dot(rv, c.t1) / c.kt1;
  let n1 = Math.max(-maxF, Math.min(maxF, c.pt1 + l1));
  l1 = n1 - c.pt1;
  c.pt1 = n1;
  applyImpulse(c, mul(c.t1, l1));
  rv = relVel(c);
  let l2 = -dot(rv, c.t2) / c.kt2;
  const n2 = Math.max(-maxF, Math.min(maxF, c.pt2 + l2));
  l2 = n2 - c.pt2;
  c.pt2 = n2;
  applyImpulse(c, mul(c.t2, l2));
  rv = relVel(c);
  const vn = dot(rv, c.n);
  let ln = (c.target - vn) / c.kn;
  const nn = Math.max(0, c.pn + ln);
  ln = nn - c.pn;
  c.pn = nn;
  applyImpulse(c, mul(c.n, ln));
}

function solveRope(): void {
  const d = sub(ball.p, PIVOT);
  const n = norm(d);
  const vn = dot(ball.v, n);
  ball.v[0] -= n[0] * vn; ball.v[1] -= n[1] * vn; ball.v[2] -= n[2] * vn;
}

function integrateBody(b: Body, h: number): void {
  b.p[0] += b.v[0] * h; b.p[1] += b.v[1] * h; b.p[2] += b.v[2] * h;
  if (b.invI > 0) {
    const [qx, qy, qz, qw] = b.q;
    const [wx, wy, wz] = b.w;
    const k = 0.5 * h;
    let nx = qx + k * (wx * qw + wy * qz - wz * qy);
    let ny = qy + k * (-wx * qz + wy * qw + wz * qx);
    let nz = qz + k * (wx * qy - wy * qx + wz * qw);
    let nw = qw + k * (-wx * qx - wy * qy - wz * qz);
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw) || 1;
    nx /= l; ny /= l; nz /= l; nw /= l;
    b.q = [nx, ny, nz, nw];
    updateAxes(b);
  }
}

function substep(h: number): void {
  sim.time += h;
  const contacts: Contact[] = [];

  if (sim.asleep) {
    if (sim.ballDyn) {
      for (const c of crates) ballBox(c, contacts);
      if (contacts.length > 0) {
        sim.asleep = false;
        sim.quietT = 0;
      }
    }
    if (sim.asleep) contacts.length = 0;
  }
  if (!sim.asleep) {
    contacts.length = 0;
    for (const c of crates) boxGround(c, contacts);
    for (let i = 0; i < crates.length; i += 1) {
      for (let j = i + 1; j < crates.length; j += 1) boxBox(crates[i], crates[j], contacts);
    }
    if (sim.ballDyn) for (const c of crates) ballBox(c, contacts);
  }
  if (sim.ballDyn && !sim.ballHit && contacts.some((c) => c.b === ball)) {
    sim.ballHit = true;
    sim.hitT = sim.time;
  }

  // forces
  if (sim.ballDyn) {
    ball.v[1] -= G * h;
    const c = sim.ballHit && sim.time - sim.hitT > 3 ? 1.5 : 0.15;
    const f = 1 / (1 + c * h);
    ball.v[0] *= f; ball.v[1] *= f; ball.v[2] *= f;
  }
  if (!sim.asleep) {
    for (const c of crates) {
      c.v[1] -= G * h;
      const fl = 1 / (1 + 0.05 * h);
      const fa = 1 / (1 + 0.4 * h);
      c.v[0] *= fl; c.v[1] *= fl; c.v[2] *= fl;
      c.w[0] *= fa; c.w[1] *= fa; c.w[2] *= fa;
    }
  }

  // constraints
  for (const c of contacts) prepare(c, h);
  for (let it = 0; it < ITERATIONS; it += 1) {
    for (const c of contacts) solveContact(c);
    if (sim.ballDyn) solveRope();
  }
  const nextWarm = new Map<string, [number, number, number]>();
  for (const c of contacts) nextWarm.set(c.key, [c.pn, c.pt1, c.pt2]);
  warm = nextWarm;

  // integrate
  if (sim.ballDyn) {
    integrateBody(ball, h);
    const d = sub(ball.p, PIVOT);
    const n = norm(d);
    ball.p = add(PIVOT, mul(n, ROPE_L));
  }
  if (!sim.asleep) {
    let quiet = true;
    for (const c of crates) {
      integrateBody(c, h);
      if (dot(c.v, c.v) > 0.0144 || dot(c.w, c.w) > 0.0625) quiet = false;
    }
    sim.quietT = quiet ? sim.quietT + h : 0;
    if (sim.quietT > 0.6) {
      sim.asleep = true;
      sim.quietT = 0;
      for (const c of crates) {
        c.v = [0, 0, 0];
        c.w = [0, 0, 0];
      }
      warm = new Map();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Scene geometry                                                      */
/* ------------------------------------------------------------------ */
interface Bar { a: V3; b: V3; t: number }
const bars: Bar[] = [];
const bar = (a: V3, b: V3, t: number): void => { bars.push({ a, b, t }); };

// Lattice mast
const MAST_TOP = 8.3;
const PANEL = 1.0;
const MAST_BASE = 0.3;
const HALF = 0.55;
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    bar([MAST_X + sx * HALF, MAST_BASE, sz * HALF], [MAST_X + sx * HALF, MAST_TOP, sz * HALF], 0.17);
  }
}
const levels = Math.round((MAST_TOP - MAST_BASE) / PANEL);
const lvl = (k: number): number => MAST_BASE + (k * (MAST_TOP - MAST_BASE)) / levels;
for (let k = 0; k <= levels; k += 1) {
  const y = lvl(k);
  bar([MAST_X - HALF, y, HALF], [MAST_X + HALF, y, HALF], 0.1);
  bar([MAST_X - HALF, y, -HALF], [MAST_X + HALF, y, -HALF], 0.1);
  bar([MAST_X - HALF, y, -HALF], [MAST_X - HALF, y, HALF], 0.1);
  bar([MAST_X + HALF, y, -HALF], [MAST_X + HALF, y, HALF], 0.1);
}
for (let k = 0; k < levels; k += 1) {
  const y0 = lvl(k);
  const y1 = lvl(k + 1);
  const flip = k % 2 === 0 ? 1 : -1;
  bar([MAST_X - HALF * flip, y0, HALF], [MAST_X + HALF * flip, y1, HALF], 0.08);
  bar([MAST_X - HALF * flip, y0, -HALF], [MAST_X + HALF * flip, y1, -HALF], 0.08);
  bar([MAST_X + HALF, y0, -HALF * flip], [MAST_X + HALF, y1, HALF * flip], 0.08);
  bar([MAST_X - HALF, y0, -HALF * flip], [MAST_X - HALF, y1, HALF * flip], 0.08);
}
// Jib truss
const JIB_X0 = -1.4;
const JIB_X1 = 8.6;
const JIB_LOW = 7.45;
const JIB_HIGH = 8.3;
bar([JIB_X0, JIB_LOW, 0.32], [JIB_X1, JIB_LOW, 0.32], 0.13);
bar([JIB_X0, JIB_LOW, -0.32], [JIB_X1, JIB_LOW, -0.32], 0.13);
bar([JIB_X0, JIB_HIGH, 0], [JIB_X1, JIB_HIGH, 0], 0.13);
for (let x = JIB_X0; x < JIB_X1 - 0.01; x += 1) {
  for (const sz of [-1, 1]) {
    bar([x, JIB_LOW, sz * 0.32], [x + 0.5, JIB_HIGH, 0], 0.07);
    bar([x + 0.5, JIB_HIGH, 0], [x + 1, JIB_LOW, sz * 0.32], 0.07);
  }
  bar([x, JIB_LOW, -0.32], [x, JIB_LOW, 0.32], 0.07);
}
bar([JIB_X1, JIB_LOW, -0.32], [JIB_X1, JIB_LOW, 0.32], 0.07);

function basisFromBar(b: Bar): { ex: V3; ey: V3; ez: V3; c: V3 } {
  const dir = sub(b.b, b.a);
  const l = len(dir);
  const u = mul(dir, 1 / l);
  const ref: V3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const ex = norm(cross(ref, u));
  const ez = cross(u, ex);
  return { ex: mul(ex, b.t), ey: dir, ez: mul(ez, b.t), c: mul(add(b.a, b.b), 0.5) };
}

function putMat(out: Float32Array, i: number, ex: V3, ey: V3, ez: V3, t: V3): void {
  const o = i * 16;
  out[o] = ex[0]; out[o + 1] = ex[1]; out[o + 2] = ex[2]; out[o + 3] = 0;
  out[o + 4] = ey[0]; out[o + 5] = ey[1]; out[o + 6] = ey[2]; out[o + 7] = 0;
  out[o + 8] = ez[0]; out[o + 9] = ez[1]; out[o + 10] = ez[2]; out[o + 11] = 0;
  out[o + 12] = t[0]; out[o + 13] = t[1]; out[o + 14] = t[2]; out[o + 15] = 1;
}

const craneMats = new Float32Array(bars.length * 16);
bars.forEach((b, i) => {
  const m = basisFromBar(b);
  putMat(craneMats, i, m.ex, m.ey, m.ez, m.c);
});

// Crate visuals: body + 12 frame bars
interface Edge { o: V3; s: V3 }
const EDGES: Edge[] = [];
for (const sa of [-1, 1]) {
  for (const sb of [-1, 1]) {
    EDGES.push({ o: [0, sa * 0.45, sb * 0.45], s: [0.8, 0.1, 0.1] });
    EDGES.push({ o: [sa * 0.45, 0, sb * 0.45], s: [0.1, 1.0, 0.1] });
    EDGES.push({ o: [sa * 0.45, sb * 0.45, 0], s: [0.1, 0.1, 0.8] });
  }
}
const crateBodyMats = new Float32Array(CRATE_COUNT * 16);
const crateEdgeMats = new Float32Array(CRATE_COUNT * EDGES.length * 16);
const LINKS = 20;
const chainMats = new Float32Array(LINKS * 16);

function fillCrateMats(): void {
  crates.forEach((c, i) => {
    putMat(crateBodyMats, i, mul(c.ax[0], 0.92), mul(c.ax[1], 0.92), mul(c.ax[2], 0.92), c.p);
    EDGES.forEach((e, k) => {
      const pos = add(c.p, add(add(mul(c.ax[0], e.o[0]), mul(c.ax[1], e.o[1])), mul(c.ax[2], e.o[2])));
      putMat(crateEdgeMats, i * EDGES.length + k, mul(c.ax[0], e.s[0]), mul(c.ax[1], e.s[1]), mul(c.ax[2], e.s[2]), pos);
    });
  });
}

function fillChainMats(): void {
  const d = norm(sub(ball.p, PIVOT));
  const chainLen = ROPE_L - BALL_R;
  const step = chainLen / LINKS;
  const zAxis: V3 = [0, 0, 1];
  const e1 = norm(cross(d, zAxis));
  for (let i = 0; i < LINKS; i += 1) {
    const c = add(PIVOT, mul(d, step * (i + 0.5)));
    const ey = mul(d, step * 1.25);
    if (i % 2 === 0) putMat(chainMats, i, mul(e1, 0.16), ey, mul(zAxis, 0.05), c);
    else putMat(chainMats, i, mul(e1, 0.05), ey, mul(zAxis, 0.16), c);
  }
}

/* initial (unrotated) transforms so the first frame is already sensible */
const crateBodyInit: AuraTransformSpec[] = crates.map((c) => ({ position: c.p, scale: [0.92, 0.92, 0.92] }));
const crateEdgeInit: AuraTransformSpec[] = [];
for (const c of crates) {
  for (const e of EDGES) {
    crateEdgeInit.push({ position: add(c.p, e.o), scale: e.s });
  }
}
const craneInit: AuraTransformSpec[] = bars.map((b) => ({
  position: mul(add(b.a, b.b), 0.5),
  scale: [b.t, Math.max(len(sub(b.b, b.a)), 0.05), b.t]
}));
const chainInit: AuraTransformSpec[] = Array.from({ length: LINKS }, (_, i) => ({
  position: [0, PIVOT[1] - (i + 0.5) * ((ROPE_L - BALL_R) / LINKS), 0],
  scale: [0.16, ((ROPE_L - BALL_R) / LINKS) * 1.25, 0.05]
}));
const jointInit: AuraTransformSpec[] = [];
for (let k = -20; k <= 20; k += 5) {
  jointInit.push({ position: [k, 0.006, 0], scale: [0.06, 0.012, 80] });
  jointInit.push({ position: [0, 0.006, k], scale: [80, 0.012, 0.06] });
}
const crateColors: string[] = crates.map((_, i) => `hsl(${28 + (i % 4) * 2}, ${52 + (i % 3) * 4}%, ${46 + (i % 5) * 2}%)`);

const steel = material.pbr({ color: "#8d949c", metallic: 1, roughness: 0.3 });
const darkSteel = material.pbr({ color: "#4b5057", metallic: 0.8, roughness: 0.5 });
const craneYellow = material.pbr({ color: "#e2a920", roughness: 0.55, metallic: 0.1 });

const app = createAuraApp("#app", {
  resize: false,
  scene: scene({ background: "#8fb3d6" })
    .add(sky.preetham({ sun: { elevationDeg: 42, azimuthDeg: 150, intensity: 1 } }))
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#8a8a84", intensity: 0.9 }))
    .add(
      lights.directional({
        name: "key",
        position: [9, 15, 12],
        target: [0, 2, 0],
        intensity: 3.2,
        color: "#fff1dc",
        shadow: { mapSize: 2048, filter: "pcf", softness: 1.5, fit: { center: [0, 3, 0], extent: 16, depth: 50 } }
      })
    )
    .add(effects.fog({ color: "#b9cfe2", density: 0.0035 }))
    .add(
      primitives.plane({
        name: "yard",
        size: [200, 1, 200],
        material: material.pbr({ color: "#9b9c99", roughness: 0.95 }),
        castShadow: false,
        receiveShadow: true
      })
    )
    .add(
      instances.box({
        name: "joints",
        transforms: jointInit,
        material: material.pbr({ color: "#5d5e5c", roughness: 1 }),
        castShadow: false,
        receiveShadow: true
      })
    )
    .add(
      primitives.box({
        name: "craneBase",
        size: [2.8, 0.3, 2.8],
        position: [MAST_X, 0.15, 0],
        material: darkSteel,
        castShadow: true,
        receiveShadow: true
      })
    )
    .add(
      primitives.box({
        name: "counterweight",
        size: [1.1, 0.9, 0.7],
        position: [8.0, 8.8, 0],
        material: darkSteel,
        castShadow: true,
        receiveShadow: true
      })
    )
    .add(
      primitives.box({
        name: "trolley",
        size: [0.7, 0.28, 0.7],
        position: [PIVOT[0], PIVOT[1] + 0.1, 0],
        material: darkSteel,
        castShadow: true,
        receiveShadow: true
      })
    )
    .add(
      instances.box({
        name: "craneTruss",
        transforms: craneInit,
        material: craneYellow,
        castShadow: true,
        receiveShadow: true
      }).runtime({ id: "craneTruss", mutable: true })
    )
    .add(
      instances.box({
        name: "chain",
        transforms: chainInit,
        material: darkSteel,
        castShadow: true,
        receiveShadow: false
      }).runtime({ id: "chain", mutable: true })
    )
    .add(
      primitives.sphere({
        name: "wreckingBall",
        size: BALL_R * 2,
        position: [ball.p[0], ball.p[1], ball.p[2]],
        material: steel,
        castShadow: true,
        receiveShadow: true
      }).runtime({ id: "ball", mutable: true })
    )
    .add(
      instances.box({
        name: "crateBodies",
        transforms: crateBodyInit,
        colors: crateColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.85 }),
        castShadow: true,
        receiveShadow: true
      }).runtime({ id: "crateBodies", mutable: true })
    )
    .add(
      instances.box({
        name: "crateFrames",
        transforms: crateEdgeInit,
        material: material.pbr({ color: "#6e4321", roughness: 0.8 }),
        castShadow: true,
        receiveShadow: true
      }).runtime({ id: "crateFrames", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 5.2, 16.5], target: [0, 3.5, 0], fov: 40, near: 0.5, far: 400 }))
});

/* ------------------------------------------------------------------ */
/* Game state                                                          */
/* ------------------------------------------------------------------ */
type Mode = "ready" | "pulling" | "swinging" | "settled";
let mode: Mode = "ready";
let pullT = 0;
let pullFrom = 0;
let releaseT = 0;
let acc = 0;

interface TaskState {
  phase: "ready" | "swinging" | "settled";
  crates: number;
  displaced: number;
  ballAngleDeg: number;
}
let taskState: TaskState = { phase: "ready", crates: CRATE_COUNT, displaced: 0, ballAngleDeg: 0 };
Object.defineProperty(window, "__TASK_STATE__", {
  get: () => taskState,
  set: () => { /* read-only */ },
  configurable: true,
  enumerable: true
});

function ballAngle(): number {
  return Math.atan2(ball.p[0] - PIVOT[0], PIVOT[1] - ball.p[1]);
}
function placeBall(theta: number): void {
  ball.p = [PIVOT[0] + ROPE_L * Math.sin(theta), PIVOT[1] - ROPE_L * Math.cos(theta), 0];
  ball.v = [0, 0, 0];
}

function startSwing(): void {
  if (mode !== "ready" && mode !== "settled") return;
  mode = "pulling";
  pullT = 0;
  pullFrom = ballAngle();
  sim.ballDyn = false;
  ball.invM = 0;
  ball.v = [0, 0, 0];
  sim.ballHit = false;
  acc = 0;
  updateButtons();
}

function resetAll(): void {
  buildCrates();
  warm = new Map();
  sim.asleep = true;
  sim.quietT = 0;
  sim.ballDyn = false;
  sim.ballHit = false;
  sim.hitT = 0;
  sim.time = 0;
  ball.invM = 0;
  placeBall(0);
  mode = "ready";
  pullT = 0;
  releaseT = 0;
  acc = 0;
  updateButtons();
}

function frameUpdate(dtRaw: number): void {
  const dt = Number.isFinite(dtRaw) ? Math.min(Math.max(dtRaw, 0), 0.1) : 0;
  if (mode === "pulling") {
    pullT += dt;
    const k = Math.min(pullT / PULL_TIME, 1);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
    placeBall(pullFrom + (START_ANGLE - pullFrom) * e);
    if (k >= 1) {
      mode = "swinging";
      releaseT = 0;
      sim.ballDyn = true;
      ball.invM = 1 / BALL_M;
      ball.v = [0, 0, 0];
      sim.hitT = sim.time;
      updateButtons();
    }
  } else if (mode === "swinging" || mode === "settled") {
    acc += dt;
    while (acc >= STEP) {
      substep(STEP);
      releaseT += STEP;
      acc -= STEP;
    }
    const ballSpeed = len(ball.v);
    if (mode === "swinging") {
      if (sim.asleep && ((sim.ballHit && releaseT > 3 && ballSpeed < 0.35) || releaseT > 14)) {
        mode = "settled";
        updateButtons();
      }
    } else if (!sim.asleep) {
      mode = "swinging";
      updateButtons();
    }
  }
}

function publishState(): void {
  let displaced = 0;
  for (const c of crates) {
    if (len(sub(c.p, c.p0)) > 0.75) displaced += 1;
  }
  const ang = (ballAngle() * 180) / Math.PI;
  taskState = {
    phase: mode === "ready" ? "ready" : mode === "settled" ? "settled" : "swinging",
    crates: crates.length,
    displaced,
    ballAngleDeg: Number.isFinite(ang) ? ang : 0
  };
}

/* ---------------- render sync ---------------- */
let craneDone = false;
function syncScene(): void {
  if (!craneDone) {
    app.nodes.require("craneTruss").setInstanceMatrices(craneMats, bars.length);
    craneDone = true;
  }
  fillCrateMats();
  app.nodes.require("crateBodies").setInstanceMatrices(crateBodyMats, CRATE_COUNT);
  app.nodes.require("crateFrames").setInstanceMatrices(crateEdgeMats, CRATE_COUNT * EDGES.length);
  fillChainMats();
  app.nodes.require("chain").setInstanceMatrices(chainMats, LINKS);
  app.nodes.require("ball").setPosition(ball.p[0], ball.p[1], ball.p[2]);
}

/* ---------------- HUD ---------------- */
const hud = document.createElement("div");
hud.style.cssText = "position:fixed;left:8px;top:8px;display:flex;gap:8px;z-index:10;";
function makeButton(label: string, id: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.id = id;
  b.type = "button";
  b.textContent = label;
  b.style.cssText =
    "font:600 14px system-ui,sans-serif;padding:6px 16px;border:0;border-radius:6px;cursor:pointer;background:#e2a920;color:#1b1b1b;box-shadow:0 1px 4px rgba(0,0,0,.4);";
  b.addEventListener("click", onClick);
  return b;
}
const swingBtn = makeButton("Swing", "swing", startSwing);
const resetBtn = makeButton("Reset", "reset", resetAll);
hud.append(swingBtn, resetBtn);
document.body.appendChild(hud);
function updateButtons(): void {
  const can = mode === "ready" || mode === "settled";
  swingBtn.style.opacity = can ? "1" : "0.6";
}

/* ---------------- main loop ---------------- */
app.onFrame((frame) => {
  frameUpdate(frame.dt);
  publishState();
  syncScene();
});

placeBall(0);
publishState();
void app.ready().then(() => {
  syncScene();
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
});
