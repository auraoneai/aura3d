import { camera, createAuraApp, environments, group, lights, material, primitives, scene, sky } from "@aura3d/engine";

type Phase = "ready" | "swinging" | "settled";
interface TaskState {
  phase: Phase;
  crates: number;
  displaced: number;
  ballAngleDeg: number;
}

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    readonly __TASK_STATE__?: TaskState;
  }
}

/* ------------------------------------------------------------------ */
/* Minimal rigid-body physics: cubes, one sphere, a ground plane, rope */
/* ------------------------------------------------------------------ */

interface V { x: number; y: number; z: number }
interface Q { x: number; y: number; z: number; w: number }
const v3 = (x = 0, y = 0, z = 0): V => ({ x, y, z });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scl = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a: V): number => Math.sqrt(dot(a, a));
const norm = (a: V): V => scl(a, 1 / (len(a) || 1));
const sgn = (x: number): number => (x >= 0 ? 1 : -1);

interface Body {
  id: number;
  kind: "box" | "sphere" | "ground";
  p: V;
  q: Q;
  v: V;
  w: V;
  invM: number;
  invI: number;
  h: number; // half edge (box) or radius (sphere)
  fric: number;
  rest: number;
  linDamp: number;
  angDamp: number;
  asleep: boolean;
  sleepT: number;
  ax: [V, V, V];
  p0: V;
}

interface Pt { n: V; p: V; pen: number }
interface Contact {
  a: Body;
  b: Body;
  n: V;
  p: V;
  pen: number;
  ra: V;
  rb: V;
  ima: number;
  imb: number;
  iia: number;
  iib: number;
  t1: V;
  t2: V;
  mn: number;
  mt1: number;
  mt2: number;
  fric: number;
  target: number;
  jn: number;
  jt1: number;
  jt2: number;
}

const GRAVITY = 9.81;
const DT = 1 / 120;
const ITERATIONS = 16;
const MARGIN = 0.02;
const SLOP = 0.005;
const BETA = 0.2;

function updateAxes(b: Body): void {
  const { x, y, z, w } = b.q;
  b.ax = [
    { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + w * z), z: 2 * (x * z - w * y) },
    { x: 2 * (x * y - w * z), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + w * x) },
    { x: 2 * (x * z + w * y), y: 2 * (y * z - w * x), z: 1 - 2 * (x * x + y * y) }
  ];
}

let nextId = 0;
function makeBody(kind: Body["kind"], p: V, mass: number, h: number, fric: number, rest: number): Body {
  const inertia = kind === "box" ? (mass * (2 * h) * (2 * h)) / 6 : kind === "sphere" ? 0.4 * mass * h * h : 0;
  const b: Body = {
    id: nextId++, kind, p: { ...p }, q: { x: 0, y: 0, z: 0, w: 1 }, v: v3(), w: v3(),
    invM: mass > 0 ? 1 / mass : 0, invI: inertia > 0 ? 1 / inertia : 0, h, fric, rest,
    linDamp: 0, angDamp: 0, asleep: false, sleepT: 0,
    ax: [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)], p0: { ...p }
  };
  updateAxes(b);
  return b;
}

/* ---- narrow phase ---- */

function boxGround(box: Body): Pt[] {
  const out: Pt[] = [];
  const up = v3(0, 1, 0);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = add(box.p, add(add(scl(box.ax[0], sx * box.h), scl(box.ax[1], sy * box.h)), scl(box.ax[2], sz * box.h)));
    if (c.y <= MARGIN) out.push({ n: up, p: c, pen: -c.y });
  }
  return out;
}

function sphereGround(s: Body): Pt[] {
  if (s.p.y - s.h > MARGIN) return [];
  return [{ n: v3(0, 1, 0), p: v3(s.p.x, 0, s.p.z), pen: s.h - s.p.y }];
}

/** Sphere (a) against box (b). Normal points from sphere to box. */
function sphereBox(s: Body, bx: Body): Pt[] {
  const rel = sub(s.p, bx.p);
  const l = [dot(rel, bx.ax[0]), dot(rel, bx.ax[1]), dot(rel, bx.ax[2])];
  const c = l.map((e) => Math.max(-bx.h, Math.min(bx.h, e)));
  const q = add(bx.p, add(add(scl(bx.ax[0], c[0]!), scl(bx.ax[1], c[1]!)), scl(bx.ax[2], c[2]!)));
  const diff = sub(s.p, q);
  const dist = len(diff);
  if (dist > s.h + MARGIN) return [];
  if (dist < 1e-6) {
    let bi = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(l[i]!) > Math.abs(l[bi]!)) bi = i;
    const nbs = scl(bx.ax[bi]!, sgn(l[bi]!));
    return [{ n: scl(nbs, -1), p: add(bx.p, scl(nbs, bx.h)), pen: s.h + (bx.h - Math.abs(l[bi]!)) }];
  }
  return [{ n: scl(diff, -1 / dist), p: q, pen: s.h - dist }];
}

function clipPoly(poly: V[], origin: V, nrm: V, off: number): V[] {
  const out: V[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = dot(sub(a, origin), nrm) - off;
    const db = dot(sub(b, origin), nrm) - off;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) out.push(add(a, scl(sub(b, a), da / (da - db))));
  }
  return out;
}

const absDot3 = (axes: [V, V, V], L: V): number =>
  Math.abs(dot(axes[0], L)) + Math.abs(dot(axes[1], L)) + Math.abs(dot(axes[2], L));

/** Box (a) against box (b) via SAT and face clipping. Normal points from a to b. */
function boxBox(A: Body, B: Body): Pt[] {
  const d = sub(B.p, A.p);
  const ua = A.ax;
  const ub = B.ax;
  let bestF = -Infinity;
  let faceOwnerA = true;
  let faceIdx = 0;
  let bestE = -Infinity;
  let eI = 0;
  let eJ = 0;
  let eL = v3();
  for (let i = 0; i < 3; i++) {
    const L = ua[i]!;
    const s = Math.abs(dot(d, L)) - (A.h + B.h * absDot3(ub, L));
    if (s > MARGIN) return [];
    if (s > bestF) { bestF = s; faceOwnerA = true; faceIdx = i; }
  }
  for (let j = 0; j < 3; j++) {
    const L = ub[j]!;
    const s = Math.abs(dot(d, L)) - (B.h + A.h * absDot3(ua, L));
    if (s > MARGIN) return [];
    if (s > bestF + 0.002) { bestF = s; faceOwnerA = false; faceIdx = j; }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const c = cross(ua[i]!, ub[j]!);
      const l = len(c);
      if (l < 1e-3) continue;
      const L = scl(c, 1 / l);
      const s = Math.abs(dot(d, L)) - (A.h * absDot3(ua, L) + B.h * absDot3(ub, L));
      if (s > MARGIN) return [];
      if (s > bestE) { bestE = s; eI = i; eJ = j; eL = L; }
    }
  }

  if (bestE > bestF + 0.01) {
    const n = scl(eL, sgn(dot(d, eL)));
    let pA = A.p;
    let pB = B.p;
    for (let k = 0; k < 3; k++) {
      if (k !== eI) pA = add(pA, scl(ua[k]!, A.h * sgn(dot(ua[k]!, n))));
      if (k !== eJ) pB = sub(pB, scl(ub[k]!, B.h * sgn(dot(ub[k]!, n))));
    }
    const dA = ua[eI]!;
    const dB = ub[eJ]!;
    const bb = dot(dA, dB);
    const r = sub(pA, pB);
    const cc = dot(dA, r);
    const ff = dot(dB, r);
    const denom = 1 - bb * bb;
    const sA = denom > 1e-6 ? (bb * ff - cc) / denom : 0;
    const tB = bb * sA + ff;
    const qa = add(pA, scl(dA, sA));
    const qb = add(pB, scl(dB, tB));
    return [{ n, p: scl(add(qa, qb), 0.5), pen: -bestE }];
  }

  const ref = faceOwnerA ? A : B;
  const inc = faceOwnerA ? B : A;
  const refAxis = ref.ax[faceIdx]!;
  const toInc = faceOwnerA ? d : scl(d, -1);
  const nr = scl(refAxis, sgn(dot(toInc, refAxis)));

  let k = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(dot(nr, inc.ax[i]!)) > Math.abs(dot(nr, inc.ax[k]!))) k = i;
  const ni = scl(inc.ax[k]!, -sgn(dot(nr, inc.ax[k]!)));
  const e1 = inc.ax[(k + 1) % 3]!;
  const e2 = inc.ax[(k + 2) % 3]!;
  const fc = add(inc.p, scl(ni, inc.h));
  let poly: V[] = [
    add(fc, add(scl(e1, inc.h), scl(e2, inc.h))),
    add(fc, add(scl(e1, -inc.h), scl(e2, inc.h))),
    add(fc, add(scl(e1, -inc.h), scl(e2, -inc.h))),
    add(fc, add(scl(e1, inc.h), scl(e2, -inc.h)))
  ];
  for (let i = 0; i < 3; i++) {
    if (i === faceIdx) continue;
    const u = ref.ax[i]!;
    poly = clipPoly(poly, ref.p, u, ref.h);
    poly = clipPoly(poly, ref.p, scl(u, -1), ref.h);
    if (poly.length === 0) return [];
  }
  const faceCentre = add(ref.p, scl(nr, ref.h));
  const n = faceOwnerA ? nr : scl(nr, -1);
  const out: Pt[] = [];
  for (const p of poly) {
    const sep = dot(sub(p, faceCentre), nr);
    if (sep <= MARGIN) out.push({ n, p: sub(p, scl(nr, sep * 0.5)), pen: -sep });
  }
  return out;
}

/* ---- world ---- */

const SPACING = 1.02;
const ROWS = 5;
const CRATE_MASS = 10;
const BALL_RADIUS = 0.8;
const BALL_MASS = 200;
const ROPE = 6;
const PIVOT: V = v3(-3.8, 7.0, 0);
const START_ANGLE = (60 * Math.PI) / 180;

const ground = makeBody("ground", v3(), 0, 0, 0.8, 0);
const crates: Body[] = [];
for (let r = 0; r < ROWS; r++) {
  const count = ROWS - r;
  for (let i = 0; i < count; i++) {
    const c = makeBody("box", v3((i - (count - 1) / 2) * SPACING, 0.5 + r, 0), CRATE_MASS, 0.5, 0.6, 0.1);
    c.linDamp = 0.02;
    c.angDamp = 0.3;
    c.asleep = true;
    crates.push(c);
  }
}
const ballRest = v3(PIVOT.x, PIVOT.y - ROPE, 0);
const ball = makeBody("sphere", ballRest, BALL_MASS, BALL_RADIUS, 0.4, 0.3);
ball.linDamp = 0.03;
ball.angDamp = 0.2;
const bodies: Body[] = [ground, ...crates, ball];

let prevContacts = new Map<string, Contact[]>();
let ballHit = false;

const awakeDyn = (b: Body): boolean => b.invM > 0 && !b.asleep;
const speed = (b: Body): number => len(b.v);
function isActive(b: Body): boolean {
  if (b.kind === "sphere") return speed(b) > 0.3;
  return b.sleepT < 0.2;
}

function detect(): Contact[] {
  const found: Contact[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i]!;
      const B = bodies[j]!;
      let a = A;
      let b = B;
      let pts: Pt[] = [];
      if (A.kind === "ground") {
        pts = B.kind === "box" ? boxGround(B) : sphereGround(B);
      } else {
        const reach = (A.kind === "box" ? A.h * 1.74 : A.h) + (B.kind === "box" ? B.h * 1.74 : B.h) + MARGIN;
        if (len(sub(A.p, B.p)) > reach) continue;
        if (A.kind === "box" && B.kind === "box") pts = boxBox(A, B);
        else if (A.kind === "sphere" && B.kind === "box") pts = sphereBox(A, B);
        else if (A.kind === "box" && B.kind === "sphere") { a = B; b = A; pts = sphereBox(B, A); }
      }
      for (const pt of pts) {
        found.push({
          a, b, n: pt.n, p: pt.p, pen: pt.pen, ra: v3(), rb: v3(), ima: 0, imb: 0, iia: 0, iib: 0,
          t1: v3(), t2: v3(), mn: 0, mt1: 0, mt2: 0, fric: 0, target: 0, jn: 0, jt1: 0, jt2: 0
        });
      }
    }
  }
  return found;
}

function wakeIslands(contacts: Contact[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of contacts) {
      for (const [x, y] of [[c.a, c.b], [c.b, c.a]] as const) {
        if (y.asleep && y.invM > 0 && awakeDyn(x) && isActive(x)) {
          y.asleep = false;
          y.sleepT = 0;
          changed = true;
        }
      }
    }
  }
}

function relVel(c: Contact): V {
  const va = add(c.a.v, cross(c.a.w, c.ra));
  const vb = add(c.b.v, cross(c.b.w, c.rb));
  return sub(vb, va);
}

function applyImpulse(c: Contact, P: V): void {
  const { a, b } = c;
  if (c.ima > 0) {
    a.v.x -= P.x * c.ima; a.v.y -= P.y * c.ima; a.v.z -= P.z * c.ima;
    const t = cross(c.ra, P);
    a.w.x -= t.x * c.iia; a.w.y -= t.y * c.iia; a.w.z -= t.z * c.iia;
  }
  if (c.imb > 0) {
    b.v.x += P.x * c.imb; b.v.y += P.y * c.imb; b.v.z += P.z * c.imb;
    const t = cross(c.rb, P);
    b.w.x += t.x * c.iib; b.w.y += t.y * c.iib; b.w.z += t.z * c.iib;
  }
}

function effMass(c: Contact, d: V): number {
  const ra = cross(c.ra, d);
  const rb = cross(c.rb, d);
  const k = c.ima + c.imb + c.iia * dot(ra, ra) + c.iib * dot(rb, rb);
  return k > 0 ? 1 / k : 0;
}

function constrainRope(): void {
  const r = sub(ball.p, PIVOT);
  const l = len(r);
  if (l < 1e-6) return;
  const n = scl(r, 1 / l);
  const vn = dot(ball.v, n);
  ball.v = sub(ball.v, scl(n, vn));
}

function stepWorld(dt: number): void {
  // external forces and damping
  for (const b of bodies) {
    if (!awakeDyn(b)) continue;
    b.v.y -= GRAVITY * dt;
    const ld = Math.max(0, 1 - b.linDamp * dt);
    const ad = Math.max(0, 1 - b.angDamp * dt);
    b.v = scl(b.v, ld);
    b.w = scl(b.w, ad);
  }
  if (ballHit) {
    ball.v = scl(ball.v, Math.max(0, 1 - 0.35 * dt));
  }

  // contacts
  let contacts = detect();
  wakeIslands(contacts);
  contacts = contacts.filter((c) => awakeDyn(c.a) || awakeDyn(c.b));

  for (const c of contacts) {
    const { a, b, n } = c;
    if ((a.kind === "sphere" || b.kind === "sphere") && (awakeDyn(a) && awakeDyn(b)) && (a.kind === "box" || b.kind === "box")) ballHit = true;
    c.ima = awakeDyn(a) ? a.invM : 0;
    c.iia = awakeDyn(a) ? a.invI : 0;
    c.imb = awakeDyn(b) ? b.invM : 0;
    c.iib = awakeDyn(b) ? b.invI : 0;
    c.ra = sub(c.p, a.p);
    c.rb = sub(c.p, b.p);
    c.t1 = norm(cross(n, Math.abs(n.x) > 0.6 ? v3(0, 1, 0) : v3(1, 0, 0)));
    c.t2 = cross(n, c.t1);
    c.mn = effMass(c, n);
    c.mt1 = effMass(c, c.t1);
    c.mt2 = effMass(c, c.t2);
    c.fric = Math.sqrt(a.fric * b.fric);
    const vn0 = dot(relVel(c), n);
    const e = (a.rest + b.rest) * 0.5;
    const bounce = vn0 < -1 ? -e * vn0 : 0;
    const bias = Math.min(2, (BETA / dt) * Math.max(0, c.pen - SLOP));
    c.target = c.pen >= 0 ? Math.max(bounce, bias) : c.pen / dt;

    // warm start from the previous step
    const old = prevContacts.get(`${a.id}-${b.id}`);
    if (old) {
      let best: Contact | undefined;
      let bd = 0.08;
      for (const o of old) {
        const dd = len(sub(o.p, c.p));
        if (dd < bd) { bd = dd; best = o; }
      }
      if (best) {
        c.jn = best.jn;
        c.jt1 = best.jt1 * 0.8;
        c.jt2 = best.jt2 * 0.8;
        applyImpulse(c, add(scl(n, c.jn), add(scl(c.t1, c.jt1), scl(c.t2, c.jt2))));
      }
    }
  }

  for (let it = 0; it < ITERATIONS; it++) {
    for (const c of contacts) {
      // friction first, then the normal so that non-penetration wins
      for (const which of [1, 2] as const) {
        const t = which === 1 ? c.t1 : c.t2;
        const m = which === 1 ? c.mt1 : c.mt2;
        const vt = dot(relVel(c), t);
        const lim = c.fric * c.jn;
        const old = which === 1 ? c.jt1 : c.jt2;
        const nj = Math.max(-lim, Math.min(lim, old - vt * m));
        applyImpulse(c, scl(t, nj - old));
        if (which === 1) c.jt1 = nj; else c.jt2 = nj;
      }
      const vn = dot(relVel(c), c.n);
      const nj = Math.max(0, c.jn + (c.target - vn) * c.mn);
      applyImpulse(c, scl(c.n, nj - c.jn));
      c.jn = nj;
    }
    constrainRope();
  }

  // integrate
  for (const b of bodies) {
    if (!awakeDyn(b)) continue;
    b.p = add(b.p, scl(b.v, dt));
    const { x, y, z, w } = b.q;
    const h = 0.5 * dt;
    const q: Q = {
      x: x + h * (b.w.x * w + b.w.y * z - b.w.z * y),
      y: y + h * (b.w.y * w + b.w.z * x - b.w.x * z),
      z: z + h * (b.w.z * w + b.w.x * y - b.w.y * x),
      w: w + h * (-b.w.x * x - b.w.y * y - b.w.z * z)
    };
    const ql = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
    b.q = { x: q.x / ql, y: q.y / ql, z: q.z / ql, w: q.w / ql };
    updateAxes(b);
  }
  // keep the rope length fixed
  {
    const r = sub(ball.p, PIVOT);
    const n = norm(r);
    ball.p = add(PIVOT, scl(n, ROPE));
    ball.v = sub(ball.v, scl(n, dot(ball.v, n)));
  }

  // sleeping
  for (const b of crates) {
    if (b.asleep) continue;
    if (len(b.v) < 0.1 && len(b.w) < 0.2) {
      b.sleepT += dt;
      if (b.sleepT > 0.5) {
        b.asleep = true;
        b.v = v3();
        b.w = v3();
      }
    } else {
      b.sleepT = 0;
    }
  }

  const store = new Map<string, Contact[]>();
  for (const c of contacts) {
    const key = `${c.a.id}-${c.b.id}`;
    const list = store.get(key);
    if (list) list.push(c); else store.set(key, [c]);
  }
  prevContacts = store;
}

/* ---- simulation state ---- */

let phase: Phase = "ready";
let swingTime = 0;
let calmTime = 0;
let accumulator = 0;

function resetWorld(): void {
  for (const c of crates) {
    c.p = { ...c.p0 };
    c.q = { x: 0, y: 0, z: 0, w: 1 };
    c.v = v3();
    c.w = v3();
    c.asleep = true;
    c.sleepT = 0;
    updateAxes(c);
  }
  ball.p = { ...ballRest };
  ball.q = { x: 0, y: 0, z: 0, w: 1 };
  ball.v = v3();
  ball.w = v3();
  updateAxes(ball);
  prevContacts = new Map();
  ballHit = false;
  phase = "ready";
  swingTime = 0;
  calmTime = 0;
  accumulator = 0;
}

function startSwing(): void {
  ball.p = v3(PIVOT.x - ROPE * Math.sin(START_ANGLE), PIVOT.y - ROPE * Math.cos(START_ANGLE), 0);
  ball.v = v3();
  ball.w = v3();
  ballHit = false;
  prevContacts = new Map();
  phase = "swinging";
  swingTime = 0;
  calmTime = 0;
  accumulator = 0;
}

function updatePhase(dt: number): void {
  if (phase !== "swinging") return;
  swingTime += dt;
  let calm = true;
  for (const c of crates) if (!c.asleep && (len(c.v) > 0.1 || len(c.w) > 0.3)) calm = false;
  calmTime = calm ? calmTime + dt : 0;
  const anyMoved = crates.some((c) => !c.asleep);
  if (swingTime > 2 && calmTime >= 1 && (anyMoved || ballHit || swingTime > 14) && (speed(ball) < 1.5 || swingTime > 12)) {
    phase = "settled";
  }
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const steel = material.pbr({ color: "#8e98a6", metallic: 0.95, roughness: 0.28 });
const chainMat = material.pbr({ color: "#4b5059", metallic: 0.9, roughness: 0.4 });
const craneMat = material.pbr({ color: "#e3a920", metallic: 0.2, roughness: 0.6 });
const darkMat = material.pbr({ color: "#2b2d31", metallic: 0.5, roughness: 0.6 });
const concrete = material.pbr({ color: "#9c9c98", roughness: 0.95 });
const jointMat = material.pbr({ color: "#6f6f6c", roughness: 1 });
const barrelMat = material.pbr({ color: "#2e5d8f", metallic: 0.3, roughness: 0.5 });

let sc = scene({ background: "#bcd6ee" })
  .camera(camera.perspective({ position: [-4.5, 5.6, 16.5], target: [-4.8, 3.5, 0], fov: 45, near: 0.5, far: 220 }))
  .add(sky.gradient({ zenith: "#4f8fd0", horizon: "#e2eef8" }))
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#d6e6f7", groundColor: "#8d8a82", intensity: 0.9 }))
  .add(lights.directional({
    name: "key", position: [7, 15, 11], target: [-3, 0, 0], intensity: 2.8,
    shadow: { mapSize: 2048, filter: "pcf", softness: 1.5 }
  }))
  .add(primitives.plane({ name: "yard", size: [90, 1, 90], material: concrete }));

// slab joints on the concrete
for (let i = -4; i <= 4; i++) {
  sc = sc
    .add(primitives.box({ name: `joint-x${i}`, size: [60, 0.02, 0.06], material: jointMat, castShadow: false }).position(0, 0.01, i * 5))
    .add(primitives.box({ name: `joint-z${i}`, size: [0.06, 0.02, 60], material: jointMat, castShadow: false }).position(i * 5, 0.01, 0));
}

// back wall and barrels
sc = sc
  .add(primitives.box({ name: "wall", size: [46, 1.8, 0.5], material: material.pbr({ color: "#b3b0a8", roughness: 0.95 }) }).position(-4, 0.9, -8))
  .add(primitives.cylinder({ name: "barrel-a", size: [0.9, 1.1, 0.9], material: barrelMat }).position(5.6, 0.55, -3))
  .add(primitives.cylinder({ name: "barrel-b", size: [0.9, 1.1, 0.9], material: barrelMat }).position(6.6, 0.55, -3.3));

// crane: lattice tower, jib, counterweight
const TX = -11.2;
const TOP = 8.2;
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  sc = sc.add(primitives.box({ name: `post-${sx}${sz}`, size: [0.14, TOP, 0.14], material: craneMat }).position(TX + sx * 0.4, TOP / 2, sz * 0.4));
}
for (let y = 0.6, i = 0; y < TOP; y += 0.9, i++) {
  sc = sc
    .add(primitives.box({ name: `rungx-a${i}`, size: [0.8, 0.08, 0.08], material: craneMat }).position(TX, y, 0.4))
    .add(primitives.box({ name: `rungx-b${i}`, size: [0.8, 0.08, 0.08], material: craneMat }).position(TX, y, -0.4))
    .add(primitives.box({ name: `rungz-a${i}`, size: [0.08, 0.08, 0.8], material: craneMat }).position(TX + 0.4, y, 0))
    .add(primitives.box({ name: `rungz-b${i}`, size: [0.08, 0.08, 0.8], material: craneMat }).position(TX - 0.4, y, 0));
}
const JIB_L = TX - 0.5;
const JIB_R = PIVOT.x + 0.4;
const JIB_C = (JIB_L + JIB_R) / 2;
const JIB_W = JIB_R - JIB_L;
for (const sz of [-1, 1]) {
  sc = sc
    .add(primitives.box({ name: `jib-low-${sz}`, size: [JIB_W, 0.12, 0.1], material: craneMat }).position(JIB_C, 7.12, sz * 0.3))
    .add(primitives.box({ name: `jib-top-${sz}`, size: [JIB_W, 0.12, 0.1], material: craneMat }).position(JIB_C, 8.1, sz * 0.3));
}
for (let x = JIB_L + 0.2, i = 0; x < JIB_R; x += 0.8, i++) {
  sc = sc
    .add(primitives.box({ name: `jib-strut-a${i}`, size: [0.08, 0.98, 0.08], material: craneMat }).position(x, 7.61, 0.3))
    .add(primitives.box({ name: `jib-strut-b${i}`, size: [0.08, 0.98, 0.08], material: craneMat }).position(x, 7.61, -0.3))
    .add(primitives.box({ name: `jib-cross${i}`, size: [0.08, 0.08, 0.6], material: craneMat }).position(x, 7.12, 0));
}
sc = sc
  .add(primitives.box({ name: "cab", size: [0.9, 0.7, 0.9], material: darkMat }).position(TX, 8.45, 0))
  .add(primitives.box({ name: "counterweight", size: [1.1, 1.0, 0.9], material: darkMat }).position(JIB_L - 0.2, 7.55, 0))
  .add(primitives.box({ name: "trolley", size: [0.5, 0.2, 0.7], material: darkMat }).position(PIVOT.x, 7.0, 0))
  .add(primitives.sphere({ name: "hook", size: 0.26, material: chainMat }).position(PIVOT.x, PIVOT.y - 0.05, PIVOT.z));

// crates (15)
const woodMat = (k: number) => material.pbr({ color: `hsl(${27 + (k % 3) * 3}, 48%, ${40 + (k % 4) * 2}%)`, roughness: 0.85 });
const frameMat = material.pbr({ color: "#6b4423", roughness: 0.9 });
crates.forEach((c, k) => {
  const kids = [
    primitives.box({ name: `crate-core-${k}`, size: [1, 1, 1], material: woodMat(k) }),
    primitives.box({ name: `crate-band-t${k}`, size: [1.02, 0.14, 1.02], material: frameMat }).position(0, 0.43, 0),
    primitives.box({ name: `crate-band-b${k}`, size: [1.02, 0.14, 1.02], material: frameMat }).position(0, -0.43, 0)
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kids.push(primitives.box({ name: `crate-post-${k}-${sx}${sz}`, size: [0.14, 1.02, 0.14], material: frameMat }).position(sx * 0.43, 0, sz * 0.43));
  }
  sc = sc.add(group(`crate-${k}`, kids, { position: [c.p.x, c.p.y, c.p.z] }).runtime({ id: `crate-${k}`, mutable: true }));
});

// ball and chain
const LINKS = 22;
for (let k = 0; k < LINKS; k++) {
  const t = (k + 1) / (LINKS + 1);
  sc = sc.add(primitives.sphere({ name: `link-${k}`, size: 0.15, material: chainMat })
    .position(PIVOT.x + (ballRest.x - PIVOT.x) * t, PIVOT.y + (ballRest.y - PIVOT.y) * t, 0)
    .runtime({ id: `link-${k}`, mutable: true }));
}
sc = sc.add(primitives.sphere({ name: "ball", size: BALL_RADIUS * 2, material: steel })
  .position(ballRest.x, ballRest.y, 0).runtime({ id: "ball", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

const bar = document.createElement("div");
bar.style.cssText = "position:absolute;left:10px;top:318px;display:flex;gap:8px;z-index:10";
const mkButton = (label: string, onClick: () => void): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.id = `btn-${label.toLowerCase()}`;
  btn.textContent = label;
  btn.style.cssText = "padding:5px 16px;font:600 13px system-ui,sans-serif;color:#fff;background:rgba(20,24,30,0.8);border:1px solid #cfd6df;border-radius:4px;cursor:pointer";
  btn.addEventListener("click", onClick);
  return btn;
};
bar.append(mkButton("Swing", startSwing), mkButton("Reset", resetWorld));
document.body.appendChild(bar);

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */

const state: TaskState = { phase: "ready", crates: crates.length, displaced: 0, ballAngleDeg: 0 };
Object.defineProperty(window, "__TASK_STATE__", { get: () => state, configurable: false, enumerable: true });

function quatToEulerZYX(q: Q): [number, number, number] {
  const { x, y, z, w } = q;
  const m11 = 1 - 2 * (y * y + z * z);
  const m21 = 2 * (x * y + w * z);
  const m31 = 2 * (x * z - w * y);
  const m12 = 2 * (x * y - w * z);
  const m22 = 1 - 2 * (x * x + z * z);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(-Math.min(1, Math.max(-1, m31)));
  if (Math.abs(m31) >= 0.9999999) return [0, ey, Math.atan2(-m12, m22)];
  return [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
}

type NodeHandle = ReturnType<typeof app.nodes.require>;
let crateNodes: NodeHandle[] | null = null;
let linkNodes: NodeHandle[] = [];
let ballNode: NodeHandle | null = null;

app.onFrame((f) => {
  accumulator += Math.min(Math.max(f.dt, 0), 0.1);
  let steps = 0;
  while (accumulator >= DT && steps < 8) {
    stepWorld(DT);
    updatePhase(DT);
    accumulator -= DT;
    steps++;
  }
  if (steps === 8) accumulator = 0;

  if (!crateNodes) {
    crateNodes = crates.map((_, k) => app.nodes.require(`crate-${k}`));
    linkNodes = Array.from({ length: LINKS }, (_, k) => app.nodes.require(`link-${k}`));
    ballNode = app.nodes.require("ball");
  }
  crates.forEach((c, k) => {
    const node = crateNodes![k]!;
    node.setPosition(c.p.x, c.p.y, c.p.z);
    const e = quatToEulerZYX(c.q);
    node.setRotation(e[0], e[1], e[2]);
  });
  ballNode!.setPosition(ball.p.x, ball.p.y, ball.p.z);
  linkNodes.forEach((node, k) => {
    const t = (k + 1) / (LINKS + 1);
    node.setPosition(PIVOT.x + (ball.p.x - PIVOT.x) * t, PIVOT.y + (ball.p.y - PIVOT.y) * t, 0);
  });

  let displaced = 0;
  for (const c of crates) if (len(sub(c.p, c.p0)) > 0.75) displaced++;
  state.phase = phase;
  state.crates = crates.length;
  state.displaced = displaced;
  state.ballAngleDeg = (Math.atan2(PIVOT.x - ball.p.x, PIVOT.y - ball.p.y) * 180) / Math.PI;
});

await app.ready();
window.__EVAL_READY__ = true;
