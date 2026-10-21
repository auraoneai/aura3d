/**
 * three.js 0.185.1 math parity (PRD SM-01/SM-04/AD-14) — seeded property
 * comparisons, 1000 cases per method group; tolerance 1e-9 (1e-6 trig-heavy).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { OBB as ThreeOBB } from "three/examples/jsm/math/OBB.js";
import { Capsule as ThreeCapsule } from "three/examples/jsm/math/Capsule.js";
import {
  Box3,
  Color,
  Cylindrical,
  Euler,
  Frustum,
  Line3,
  Matrix3,
  Matrix4,
  MathUtils,
  OBB,
  Capsule,
  Plane,
  Quaternion,
  Ray,
  Sphere,
  Spherical,
  SphericalHarmonics3,
  Triangle,
  Vector2,
  Vector3,
  type EulerOrder
} from "@aura3d/math";

// mulberry32 — deterministic stream shared by every case group
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = 1000;
const TOL = 1e-9;
const TRIG_TOL = 1e-6;

function fv(rand: () => number, scale = 20): number {
  return (rand() * 2 - 1) * scale;
}
function v3(rand: () => number, scale = 20): Vector3 {
  return new Vector3(fv(rand, scale), fv(rand, scale), fv(rand, scale));
}
function tv3(v: Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}
function m4(rand: () => number): Matrix4 {
  const m = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(fv(rand, Math.PI), fv(rand, Math.PI), fv(rand, Math.PI))
  );
  m.setPosition(fv(rand), fv(rand), fv(rand));
  m.elements[0] *= 1 + rand();
  return new Matrix4(m.elements as Matrix4["elements"]);
}
function expectVec3(actual: Vector3, expected: THREE.Vector3, tol = TOL): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(actual.z - expected.z)).toBeLessThanOrEqual(tol);
}
function expectClose(a: number, b: number, tol = TOL): void {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
}

const ORDERS: EulerOrder[] = ["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"];

describe("Vector3/Vector2 parity", () => {
  it("distanceToSquared / addScaled / negate match three", () => {
    const rand = rng(0xa11ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = v3(rand); const b = v3(rand); const s = fv(rand, 2);
      const ta = tv3(a); const tb = tv3(b);
      expectClose(a.distanceToSquared(b), ta.distanceToSquared(tb));
      expectVec3(a.addScaled(b, s), ta.clone().addScaledVector(tb, s));
      expectVec3(a.negate(), ta.clone().negate());
    }
  });

  it("lerp / clampTo / getComponent / fromArray match three", () => {
    const rand = rng(0xb22ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = v3(rand); const b = v3(rand); const t = rand();
      const mn = v3(rand); const mx = mn.add(v3(rand).multiplyScalar(rand()).add(new Vector3(0.5, 0.5, 0.5)));
      expectVec3(a.lerp(b, t), tv3(a).lerp(tv3(b), t));
      expectVec3(a.clampTo(mn, mx), tv3(a).clamp(tv3(mn), tv3(mx)));
      const c = Math.floor(rand() * 3);
      expectClose(a.getComponent(c), tv3(a).getComponent(c));
      const arr = [fv(rand), fv(rand), fv(rand), fv(rand), fv(rand)];
      expectVec3(Vector3.fromArray(arr, 1), new THREE.Vector3().fromArray(arr, 1));
    }
  });

  it("transformDirection / applyMatrix3 / transformMatrix4 match three", () => {
    const rand = rng(0xc33ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = v3(rand);
      const m = m4(rand);
      const tm = new THREE.Matrix4().fromArray([...m.elements]);
      expectVec3(a.transformDirection(m), tv3(a).transformDirection(tm), TRIG_TOL);
      const m3 = Matrix3.fromMatrix4(m);
      const tm3 = new THREE.Matrix3().setFromMatrix4(tm);
      expectVec3(a.applyMatrix3(m3), tv3(a).applyMatrix3(tm3));
      expectVec3(a.transformMatrix4(m), tv3(a).applyMatrix4(tm));
    }
  });

  it("Vector2 distanceToSquared / lerp match three", () => {
    const rand = rng(0xd44ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = new Vector2(fv(rand), fv(rand));
      const b = new Vector2(fv(rand), fv(rand));
      const t = rand();
      const ta = new THREE.Vector2(a.x, a.y);
      expectClose(a.distanceToSquared(b), ta.distanceToSquared(new THREE.Vector2(b.x, b.y)));
      const r = a.lerp(b, t);
      const tr = ta.lerp(new THREE.Vector2(b.x, b.y), t);
      expectClose(r.x, tr.x); expectClose(r.y, tr.y);
    }
  });
});

describe("Quaternion/Euler parity", () => {
  it("Quaternion.fromEuler matches setFromEuler for all six orders", () => {
    const rand = rng(0xe55ce);
    for (let i = 0; i < CASES; i += 1) {
      const x = fv(rand, Math.PI); const y = fv(rand, Math.PI); const z = fv(rand, Math.PI);
      const order = ORDERS[i % ORDERS.length]!;
      const q = Quaternion.fromEuler(x, y, z, order);
      const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));
      expectClose(q.x, tq.x, TRIG_TOL);
      expectClose(q.y, tq.y, TRIG_TOL);
      expectClose(q.z, tq.z, TRIG_TOL);
      expectClose(q.w, tq.w, TRIG_TOL);
    }
  });

  it("Euler.setFromQuaternion / reorder match three", () => {
    const rand = rng(0xf66ce);
    for (let i = 0; i < CASES; i += 1) {
      const x = fv(rand, Math.PI); const y = fv(rand, Math.PI); const z = fv(rand, Math.PI);
      const order = ORDERS[i % ORDERS.length]!;
      const newOrder = ORDERS[(i * 7 + 3) % ORDERS.length]!;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));
      const e = new Euler().setFromQuaternion(new Quaternion(q.x, q.y, q.z, q.w), newOrder);
      const te = new THREE.Euler().setFromQuaternion(q, newOrder);
      expectClose(e.x, te.x, TRIG_TOL);
      expectClose(e.y, te.y, TRIG_TOL);
      expectClose(e.z, te.z, TRIG_TOL);
      const re = new Euler(x, y, z, order).reorder(newOrder);
      const tre = new THREE.Euler(x, y, z, order).reorder(newOrder);
      expectClose(re.x, tre.x, TRIG_TOL);
      expectClose(re.y, tre.y, TRIG_TOL);
      expectClose(re.z, tre.z, TRIG_TOL);
    }
  });

  it("Euler.setFromRotationMatrix matches three", () => {
    const rand = rng(0x077ce);
    for (let i = 0; i < CASES; i += 1) {
      const x = fv(rand, Math.PI); const y = fv(rand, Math.PI); const z = fv(rand, Math.PI);
      const order = ORDERS[i % ORDERS.length]!;
      const outOrder = ORDERS[(i * 5 + 1) % ORDERS.length]!;
      const tm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, order));
      const e = new Euler().setFromRotationMatrix(new Matrix4(tm.elements as Matrix4["elements"]), outOrder);
      const te = new THREE.Euler().setFromRotationMatrix(tm, outOrder);
      expectClose(e.x, te.x, TRIG_TOL);
      expectClose(e.y, te.y, TRIG_TOL);
      expectClose(e.z, te.z, TRIG_TOL);
    }
  });
});

describe("Matrix3/Matrix4 parity", () => {
  it("invert / determinant / multiply / premultiply / multiplyScalar / transpose match", () => {
    const rand = rng(0x188ce);
    for (let i = 0; i < CASES; i += 1) {
      const el = Array.from({ length: 9 }, () => fv(rand, 4));
      const a = new Matrix3(el as unknown as Matrix3["elements"]);
      const ta = new THREE.Matrix3().fromArray(el);
      const s = fv(rand, 3);
      const elb = Array.from({ length: 9 }, () => fv(rand, 4));
      const b = new Matrix3(elb as unknown as Matrix3["elements"]);
      const tb = new THREE.Matrix3().fromArray(elb);
      expectClose(a.determinant(), ta.determinant());
      if (Math.abs(ta.determinant()) > 1e-3) {
        const inv = a.invert().elements;
        const tinv = ta.clone().invert().elements;
        for (let k = 0; k < 9; k += 1) expectClose(inv[k]!, tinv[k]!, 1e-5);
      }
      const mul = a.multiply(b).elements;
      const tmul = ta.clone().multiply(tb).elements;
      for (let k = 0; k < 9; k += 1) expectClose(mul[k]!, tmul[k]!, 1e-6);
      const pre = a.premultiply(b).elements;
      const tpre = ta.clone().premultiply(tb).elements;
      for (let k = 0; k < 9; k += 1) expectClose(pre[k]!, tpre[k]!, 1e-6);
      const sc = a.multiplyScalar(s).elements;
      const tsc = ta.clone().multiplyScalar(s).elements;
      for (let k = 0; k < 9; k += 1) expectClose(sc[k]!, tsc[k]!);
      const tr = a.transpose().elements;
      const ttr = ta.clone().transpose().elements;
      for (let k = 0; k < 9; k += 1) expectClose(tr[k]!, ttr[k]!);
    }
  });

  it("getNormalMatrix / extractBasis / setFromMatrix4 match three", () => {
    const rand = rng(0x299ce);
    for (let i = 0; i < CASES; i += 1) {
      const m = m4(rand);
      const tm = new THREE.Matrix4().fromArray([...m.elements]);
      const nm = new Matrix3().getNormalMatrix(m).elements;
      const tnm = new THREE.Matrix3().getNormalMatrix(tm).elements;
      for (let k = 0; k < 9; k += 1) expectClose(nm[k]!, tnm[k]!, 1e-6);
      const [x, y, z] = Matrix3.fromMatrix4(m).extractBasis();
      const tx = new THREE.Vector3(); const ty = new THREE.Vector3(); const tz = new THREE.Vector3();
      new THREE.Matrix3().setFromMatrix4(tm).extractBasis(tx, ty, tz);
      expectVec3(x, tx); expectVec3(y, ty); expectVec3(z, tz);
    }
  });

  it("Matrix4.maxScaleOnAxis matches getMaxScaleOnAxis", () => {
    const rand = rng(0x3aace);
    for (let i = 0; i < CASES; i += 1) {
      const m = m4(rand);
      const tm = new THREE.Matrix4().fromArray([...m.elements]);
      expectClose(m.maxScaleOnAxis(), tm.getMaxScaleOnAxis(), TRIG_TOL);
    }
  });
});

describe("MathUtils parity", () => {
  it("clamp / mapLinear / lerp / inverseLerp / smoothstep / smootherstep / degrees match", () => {
    const rand = rng(0x4bbce);
    for (let i = 0; i < CASES; i += 1) {
      const x = fv(rand); const y = fv(rand);
      let a = fv(rand); let b = fv(rand);
      if (a > b) { const tmp = a; a = b; b = tmp; }
      if (a === b) b = a + 1;
      const t = rand();
      expectClose(MathUtils.clamp(x, a, b), THREE.MathUtils.clamp(x, a, b));
      expectClose(MathUtils.mapLinear(x, a, b, y, y + 3), THREE.MathUtils.mapLinear(x, a, b, y, y + 3));
      expectClose(MathUtils.lerp(x, y, t), THREE.MathUtils.lerp(x, y, t));
      expectClose(MathUtils.smoothstep(x, a, b), THREE.MathUtils.smoothstep(x, a, b));
      expectClose(MathUtils.smootherstep(x, a, b), THREE.MathUtils.smootherstep(x, a, b));
      expectClose(MathUtils.inverseLerp(a, b, x), THREE.MathUtils.inverseLerp(a, b, x));
      expectClose(MathUtils.degToRad(x), THREE.MathUtils.degToRad(x));
      expectClose(MathUtils.radToDeg(x), THREE.MathUtils.radToDeg(x));
      const n = Math.floor(Math.abs(x));
      expect(MathUtils.isPowerOfTwo(n)).toBe(THREE.MathUtils.isPowerOfTwo(n));
    }
  });

  it("euclideanModulo / pingpong / damp match three", () => {
    const rand = rng(0x5ccce);
    for (let i = 0; i < CASES; i += 1) {
      const n = fv(rand, 50); const m = 0.5 + rand() * 9;
      expectClose(MathUtils.euclideanModulo(n, m), THREE.MathUtils.euclideanModulo(n, m));
      expectClose(MathUtils.pingpong(n, m), THREE.MathUtils.pingpong(n, m));
      const x = fv(rand); const y = fv(rand); const lambda = rand() * 10; const dt = rand() * 0.5;
      expectClose(MathUtils.damp(x, y, lambda, dt), THREE.MathUtils.damp(x, y, lambda, dt));
    }
  });

  it("seededRandom reproduces three's stream", () => {
    let t = THREE.MathUtils.seededRandom(4242);
    let a = MathUtils.seededRandom(4242);
    for (let i = 0; i < CASES; i += 1) {
      expectClose(a, t);
      a = MathUtils.seededRandom();
      t = THREE.MathUtils.seededRandom();
    }
  });
});

describe("Color HSL parity", () => {
  it("setHSL / getHSL / offsetHSL / lerpHSL match three", () => {
    const rand = rng(0x6ddce);
    for (let i = 0; i < CASES; i += 1) {
      const h = rand(); const s = rand(); const l = rand();
      const c = new Color(0, 0, 0).setHSL(h, s, l);
      const tc = new THREE.Color().setHSL(h, s, l);
      expectClose(c.r, tc.r, TRIG_TOL);
      expectClose(c.g, tc.g, TRIG_TOL);
      expectClose(c.b, tc.b, TRIG_TOL);
      const hsl = c.getHSL();
      const thsl = tc.getHSL({ h: 0, s: 0, l: 0 });
      expectClose(hsl.h, thsl.h, TRIG_TOL);
      expectClose(hsl.s, thsl.s, TRIG_TOL);
      expectClose(hsl.l, thsl.l, TRIG_TOL);
      const dh = fv(rand, 0.5); const ds = fv(rand, 0.5); const dl = fv(rand, 0.5);
      const off = c.offsetHSL(dh, ds, dl);
      const toff = tc.clone().offsetHSL(dh, ds, dl);
      expectClose(off.r, toff.r, TRIG_TOL);
      expectClose(off.g, toff.g, TRIG_TOL);
      expectClose(off.b, toff.b, TRIG_TOL);
      const h2 = rand(); const s2 = rand(); const l2 = rand();
      const c2 = new Color(0, 0, 0).setHSL(h2, s2, l2);
      const tc2 = new THREE.Color().setHSL(h2, s2, l2);
      const alpha = rand();
      const lr = c.lerpHSL(c2, alpha);
      const tlr = tc.clone().lerpHSL(tc2, alpha);
      expectClose(lr.r, tlr.r, TRIG_TOL);
      expectClose(lr.g, tlr.g, TRIG_TOL);
      expectClose(lr.b, tlr.b, TRIG_TOL);
    }
  });
});

describe("SphericalHarmonics3 parity", () => {
  it("getAt / getIrradianceAt / getBasisAt match three", () => {
    const rand = rng(0x7eece);
    for (let i = 0; i < CASES; i += 1) {
      const coeffs = Array.from({ length: 9 }, () => v3(rand).multiplyScalar(0.2));
      const sh = new SphericalHarmonics3(coeffs);
      const tsh = new THREE.SphericalHarmonics3();
      coeffs.forEach((c, k) => tsh.coefficients[k]!.set(c.x, c.y, c.z));
      const n = v3(rand).normalize();
      const tn = tv3(n);
      expectVec3(sh.getAt(n), tsh.getAt(tn, new THREE.Vector3()), TRIG_TOL);
      expectVec3(sh.getIrradianceAt(n), tsh.getIrradianceAt(tn, new THREE.Vector3()), TRIG_TOL);
      const basis = sh.getBasisAt(n);
      const tbasis = new Array<number>(9).fill(0);
      THREE.SphericalHarmonics3.getBasisAt(tn, tbasis);
      for (let k = 0; k < 9; k += 1) expectClose(basis[k]!, tbasis[k]!, TRIG_TOL);
    }
  });
});

describe("Spherical/Cylindrical parity", () => {
  it("setFromCartesianCoords / makeSafe match three", () => {
    const rand = rng(0x8ffce);
    for (let i = 0; i < CASES; i += 1) {
      const x = fv(rand); const y = fv(rand); const z = fv(rand);
      const s = new Spherical().setFromCartesianCoords(x, y, z);
      const ts = new THREE.Spherical().setFromCartesianCoords(x, y, z);
      expectClose(s.radius, ts.radius, TRIG_TOL);
      expectClose(s.phi, ts.phi, TRIG_TOL);
      expectClose(s.theta, ts.theta, TRIG_TOL);
      const c = new Cylindrical().setFromCartesianCoords(x, y, z);
      const tc = new THREE.Cylindrical().setFromCartesianCoords(x, y, z);
      expectClose(c.radius, tc.radius, TRIG_TOL);
      expectClose(c.theta, tc.theta, TRIG_TOL);
      expectClose(c.y, tc.y, TRIG_TOL);
      const phi = rand() * 4 - 2;
      const safe = new Spherical(s.radius, phi, s.theta).makeSafe();
      const tsafe = new THREE.Spherical(s.radius, phi, s.theta).makeSafe();
      expectClose(safe.phi, tsafe.phi, TRIG_TOL);
    }
  });
});

describe("Line3/Triangle parity", () => {
  it("Line3 queries match three", () => {
    const rand = rng(0x9a0ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = v3(rand); const b = v3(rand);
      const line = new Line3(a, b);
      const tline = new THREE.Line3(tv3(a), tv3(b));
      expectVec3(line.getCenter(), tline.getCenter(new THREE.Vector3()));
      expectVec3(line.delta(), tline.delta(new THREE.Vector3()));
      expectClose(line.distanceSq(), tline.distanceSq());
      expectClose(line.distance(), tline.distance());
      const p = v3(rand);
      const clamp = rand() > 0.5;
      expectClose(line.closestPointToPointParameter(p, clamp), tline.closestPointToPointParameter(tv3(p), clamp), TRIG_TOL);
      expectVec3(line.closestPointToPoint(p, clamp), tline.closestPointToPoint(tv3(p), clamp, new THREE.Vector3()), TRIG_TOL);
      const t = rand();
      expectVec3(line.at(t), tline.at(t, new THREE.Vector3()));
      const m = m4(rand);
      const tm = new THREE.Matrix4().fromArray([...m.elements]);
      const lt = line.applyMatrix4(m);
      const tlt = tline.clone().applyMatrix4(tm);
      expectVec3(lt.start, tlt.start, TRIG_TOL);
      expectVec3(lt.end, tlt.end, TRIG_TOL);
    }
  });

  it("Line3.distanceSqToLine3 closest points match three", () => {
    const rand = rng(0xab1ce);
    for (let i = 0; i < CASES; i += 1) {
      const l1 = new Line3(v3(rand), v3(rand));
      const l2 = new Line3(v3(rand), v3(rand));
      const tl1 = new THREE.Line3(tv3(l1.start), tv3(l1.end));
      const tl2 = new THREE.Line3(tv3(l2.start), tv3(l2.end));
      const r = l1.distanceSqToLine3(l2);
      const c1 = new THREE.Vector3(); const c2 = new THREE.Vector3();
      const tr = tl1.distanceSqToLine3(tl2, c1, c2);
      expectClose(r.distanceSq, tr, TRIG_TOL);
      expectVec3(r.point1, c1, TRIG_TOL);
      expectVec3(r.point2, c2, TRIG_TOL);
    }
  });

  it("Triangle queries match three", () => {
    const rand = rng(0xac2ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = v3(rand); const b = v3(rand); const c = v3(rand);
      const tri = new Triangle(a, b, c);
      const ttri = new THREE.Triangle(tv3(a), tv3(b), tv3(c));
      expectClose(tri.getArea(), ttri.getArea(), TRIG_TOL);
      expectVec3(tri.getMidpoint(), ttri.getMidpoint(new THREE.Vector3()));
      const p = v3(rand);
      expect(tri.containsPoint(p)).toBe(ttri.containsPoint(tv3(p)));
      const bary = tri.getBarycoord(p);
      const tbary = ttri.getBarycoord(tv3(p), new THREE.Vector3());
      expect(bary === null).toBe(tbary === null);
      if (bary && tbary) expectVec3(bary, tbary, TRIG_TOL);
      expectVec3(tri.closestPointToPoint(p), ttri.closestPointToPoint(tv3(p), new THREE.Vector3()), TRIG_TOL);
      const plane = tri.getPlane();
      const tplane = ttri.getPlane(new THREE.Plane());
      expectVec3(plane.normal, tplane.normal, TRIG_TOL);
      expectClose(plane.constant, tplane.constant, TRIG_TOL);
      const box = new Box3(v3(rand), v3(rand).add(new Vector3(4, 4, 4)));
      const tbox = new THREE.Box3(tv3(box.min), tv3(box.max));
      expect(tri.intersectsBox(box)).toBe(ttri.intersectsBox(tbox));
      const dir = v3(rand);
      expect(tri.isFrontFacing(dir)).toBe(ttri.isFrontFacing(tv3(dir)));
    }
  });
});

describe("Plane/Ray parity", () => {
  it("Plane distance/projection/intersects match three", () => {
    const rand = rng(0xbd3ce);
    for (let i = 0; i < CASES; i += 1) {
      const n = v3(rand).normalize();
      const k = fv(rand, 5);
      const pl = new Plane(n, k);
      const tpl = new THREE.Plane(tv3(n), k);
      const p = v3(rand);
      expectClose(pl.distanceToPoint(p), tpl.distanceToPoint(tv3(p)));
      const sp = new Sphere(v3(rand), rand() * 4);
      const tsp = new THREE.Sphere(tv3(sp.center), sp.radius);
      expectClose(pl.distanceToSphere(sp), tpl.distanceToSphere(tsp));
      expect(pl.intersectsSphere(sp)).toBe(tpl.intersectsSphere(tsp));
      const mn = v3(rand);
      const box = new Box3(mn, mn.add(v3(rand).multiplyScalar(rand()).add(new Vector3(0.5, 0.5, 0.5))));
      const tbox = new THREE.Box3(tv3(box.min), tv3(box.max));
      expect(pl.intersectsBox(box)).toBe(tpl.intersectsBox(tbox));
      expectVec3(pl.projectPoint(p), tpl.projectPoint(tv3(p), new THREE.Vector3()));
      expectVec3(pl.coplanarPoint(), tpl.coplanarPoint(new THREE.Vector3()));
      const l = new Line3(v3(rand), v3(rand));
      const tl = new THREE.Line3(tv3(l.start), tv3(l.end));
      expect(pl.intersectsLine(l)).toBe(tpl.intersectsLine(tl));
      const hit = pl.intersectLine(l);
      const thit = tpl.intersectLine(tl, new THREE.Vector3());
      expect(hit === undefined).toBe(thit === null);
      if (hit && thit) expectVec3(hit, thit, TRIG_TOL);
      const off = v3(rand);
      const tp = pl.translate(off);
      const ttp = tpl.clone().translate(tv3(off));
      expectVec3(tp.normal, ttp.normal);
      expectClose(tp.constant, ttp.constant, TRIG_TOL);
    }
  });

  it("Ray distance/intersect methods match three", () => {
    const rand = rng(0xbe4ce);
    for (let i = 0; i < CASES; i += 1) {
      const origin = v3(rand);
      const dir = v3(rand).normalize();
      const ray = new Ray(origin, dir);
      const tray = new THREE.Ray(tv3(origin), tv3(dir));
      const p = v3(rand);
      expectClose(ray.distanceToPoint(p), tray.distanceToPoint(tv3(p)), TRIG_TOL);
      expectClose(ray.distanceSqToPoint(p), tray.distanceSqToPoint(tv3(p)), TRIG_TOL);
      expectVec3(ray.closestPointToPoint(p), tray.closestPointToPoint(tv3(p), new THREE.Vector3()), TRIG_TOL);
      const t = rand() * 10;
      expectVec3(ray.at(t), tray.at(t, new THREE.Vector3()));
      const sp = new Sphere(v3(rand), rand() * 4 + 0.1);
      const tsp = new THREE.Sphere(tv3(sp.center), sp.radius);
      expect(ray.intersectsSphere(sp)).toBe(tray.intersectsSphere(tsp));
      const rh = ray.intersectSphere(sp);
      const trh = tray.intersectSphere(tsp, new THREE.Vector3());
      expect(rh === undefined).toBe(trh === null);
      if (rh && trh) expectVec3(rh, trh, TRIG_TOL);
      const pl = new Plane(v3(rand).normalize(), fv(rand, 3));
      const tpl = new THREE.Plane(tv3(pl.normal), pl.constant);
      const ad = ray.distanceToPlane(pl);
      const td = tray.distanceToPlane(tpl);
      expect(ad === null).toBe(td === null);
      if (ad !== null && td !== null) expectClose(ad, td, TRIG_TOL);
      const ph = ray.intersectPlane(pl);
      const tph = tray.intersectPlane(tpl, new THREE.Vector3());
      expect(ph === undefined).toBe(tph === null);
      if (ph && tph) expectVec3(ph, tph, TRIG_TOL);
      expect(ray.intersectsPlane(pl)).toBe(tray.intersectsPlane(tpl));
      const v0 = v3(rand); const v1 = v3(rand);
      const seg = ray.distanceSqToSegment(v0, v1);
      const trp = new THREE.Vector3(); const trs = new THREE.Vector3();
      const tseg = tray.distanceSqToSegment(tv3(v0), tv3(v1), trp, trs);
      expectClose(seg.distanceSq, tseg, TRIG_TOL);
      expectVec3(seg.pointOnRay, trp, TRIG_TOL);
      expectVec3(seg.pointOnSegment, trs, TRIG_TOL);
      const m = m4(rand);
      const tm = new THREE.Matrix4().fromArray([...m.elements]);
      const rm = ray.applyMatrix4(m);
      const trm = tray.clone().applyMatrix4(tm);
      expectVec3(rm.origin, trm.origin, TRIG_TOL);
      expectVec3(rm.direction, trm.direction, TRIG_TOL);
    }
  });

  it("Ray.intersectTriangle / intersectBox / recast match three", () => {
    const rand = rng(0xbf5ce);
    for (let i = 0; i < CASES; i += 1) {
      const ray = new Ray(v3(rand), v3(rand).normalize());
      const tray = new THREE.Ray(tv3(ray.origin), tv3(ray.direction));
      const a = v3(rand); const b = v3(rand); const c = v3(rand);
      const backface = i % 2 === 0;
      const hit = ray.intersectTriangle(a, b, c, backface);
      const thit = tray.intersectTriangle(tv3(a), tv3(b), tv3(c), backface, new THREE.Vector3());
      expect(hit === undefined).toBe(thit === null);
      if (hit && thit) expectVec3(hit, thit, TRIG_TOL);
      const mn = v3(rand);
      const size = new Vector3(Math.abs(fv(rand)) + 0.01, Math.abs(fv(rand)) + 0.01, Math.abs(fv(rand)) + 0.01);
      const box = new Box3(mn, mn.add(size));
      const tbox = new THREE.Box3(tv3(box.min), tv3(box.max));
      const bh = ray.intersectBox(box);
      const tbh = tray.intersectBox(tbox, new THREE.Vector3());
      expect(bh === undefined).toBe(tbh === null);
      if (bh && tbh) expectVec3(bh, tbh, TRIG_TOL);
      expect(ray.intersectsBox(box)).toBe(tray.intersectsBox(tbox));
      const t = rand() * 5;
      const rec = ray.recast(t);
      const trec = tray.clone().recast(t);
      expectVec3(rec.origin, trec.origin, TRIG_TOL);
      expectVec3(rec.direction, trec.direction, TRIG_TOL);
      const lookT = v3(rand);
      const look = ray.lookAt(lookT);
      const tlook = tray.clone().lookAt(tv3(lookT));
      expectVec3(look.direction, tlook.direction, TRIG_TOL);
    }
  });
});

describe("Box3/Sphere/Frustum parity", () => {
  it("Box3 queries match three", () => {
    const rand = rng(0xc06ce);
    for (let i = 0; i < CASES; i += 1) {
      const a = v3(rand); const b = v3(rand);
      const box = new Box3(a.min(b), a.max(b));
      const tbox = new THREE.Box3(tv3(box.min), tv3(box.max));
      const p = v3(rand);
      expect(box.containsPoint(p)).toBe(tbox.containsPoint(tv3(p)));
      expectClose(box.distanceToPoint(p), tbox.distanceToPoint(tv3(p)), TRIG_TOL);
      const om = v3(rand);
      const other = new Box3(om, om.add(v3(rand).multiplyScalar(rand()).add(new Vector3(1, 1, 1))));
      const tother = new THREE.Box3(tv3(other.min), tv3(other.max));
      expect(box.intersectsBox(other)).toBe(tbox.intersectsBox(tother));
      const u = box.union(other);
      const tu = tbox.clone().union(tother);
      expectVec3(u.min, tu.min); expectVec3(u.max, tu.max);
      const inter = box.intersect(other);
      const tinter = tbox.clone().intersect(tother);
      expect(inter.isEmpty()).toBe(tinter.isEmpty());
      if (!inter.isEmpty() && !tinter.isEmpty()) {
        expectVec3(inter.min, tinter.min); expectVec3(inter.max, tinter.max);
      }
      const off = v3(rand);
      const tr = box.translate(off);
      const ttr = tbox.clone().translate(tv3(off));
      expectVec3(tr.min, ttr.min); expectVec3(tr.max, ttr.max);
      expectVec3(box.clampPoint(p), tbox.clampPoint(tv3(p), new THREE.Vector3()));
      const sp = box.getBoundingSphere();
      const tsp = tbox.getBoundingSphere(new THREE.Sphere());
      expectVec3(sp.center, tsp.center, TRIG_TOL);
      expectClose(sp.radius, tsp.radius, TRIG_TOL);
      const m = m4(rand);
      const tm = new THREE.Matrix4().fromArray([...m.elements]);
      const tb = box.transform(m);
      const ttb = tbox.clone().applyMatrix4(tm);
      expectVec3(tb.min, ttb.min, TRIG_TOL);
      expectVec3(tb.max, ttb.max, TRIG_TOL);
      expectVec3(box.getCenter(), tbox.getCenter(new THREE.Vector3()));
      expectVec3(box.getSize(), tbox.getSize(new THREE.Vector3()));
      const sphere = new Sphere(v3(rand), rand() * 4);
      const tsphere = new THREE.Sphere(tv3(sphere.center), sphere.radius);
      expect(box.intersectsSphere(sphere)).toBe(tbox.intersectsSphere(tsphere));
      const pl = new Plane(v3(rand).normalize(), fv(rand, 3));
      expect(box.intersectsPlane(pl)).toBe(tbox.intersectsPlane(new THREE.Plane(tv3(pl.normal), pl.constant)));
      const tri = new Triangle(v3(rand), v3(rand), v3(rand));
      const ttri = new THREE.Triangle(tv3(tri.a), tv3(tri.b), tv3(tri.c));
      expect(box.intersectsTriangle(tri)).toBe(tbox.intersectsTriangle(ttri));
      const ex = box.expandByPoint(p);
      const tex = tbox.clone().expandByPoint(tv3(p));
      expectVec3(ex.min, tex.min); expectVec3(ex.max, tex.max);
      const s = rand() * 2;
      const exs = box.expandByScalar(s);
      const texs = tbox.clone().expandByScalar(s);
      expectVec3(exs.min, texs.min); expectVec3(exs.max, texs.max);
    }
  });

  it("Sphere queries match three", () => {
    const rand = rng(0xc17ce);
    for (let i = 0; i < CASES; i += 1) {
      const center = v3(rand); const radius = rand() * 5 + 0.01;
      const sp = new Sphere(center, radius);
      const tsp = new THREE.Sphere(tv3(center), radius);
      const p = v3(rand);
      expect(sp.containsPoint(p)).toBe(tsp.containsPoint(tv3(p)));
      expectClose(sp.distanceToPoint(p), tsp.distanceToPoint(tv3(p)), TRIG_TOL);
      const other = new Sphere(v3(rand), rand() * 4);
      const tother = new THREE.Sphere(tv3(other.center), other.radius);
      expect(sp.intersectsSphere(other)).toBe(tsp.intersectsSphere(tother));
      const mn = v3(rand);
      const box = new Box3(mn, mn.add(v3(rand).multiplyScalar(rand()).add(new Vector3(1, 1, 1))));
      const tbox = new THREE.Box3(tv3(box.min), tv3(box.max));
      expect(sp.intersectsBox(box)).toBe(tsp.intersectsBox(tbox));
      const pl = new Plane(v3(rand).normalize(), fv(rand, 3));
      expect(sp.intersectsPlane(pl)).toBe(tsp.intersectsPlane(new THREE.Plane(tv3(pl.normal), pl.constant)));
      const off = v3(rand);
      const tr = sp.translate(off);
      const ttr = tsp.clone().translate(tv3(off));
      expectVec3(tr.center, ttr.center);
      expectClose(tr.radius, ttr.radius);
      const u = sp.union(other);
      const tu = tsp.clone().union(tother);
      expectVec3(u.center, tu.center, TRIG_TOL);
      expectClose(u.radius, tu.radius, TRIG_TOL);
      const pts = Array.from({ length: 5 }, () => v3(rand));
      const fs = Sphere.setFromPoints(pts);
      const tfs = new THREE.Sphere().setFromPoints(pts.map(tv3));
      expectVec3(fs.center, tfs.center, TRIG_TOL);
      expectClose(fs.radius, tfs.radius, 1e-4);
      const bb = sp.getBoundingBox();
      const tbb = tsp.getBoundingBox(new THREE.Box3());
      expectVec3(bb.min, tbb.min); expectVec3(bb.max, tbb.max);
      expectVec3(sp.clampPoint(p), tsp.clampPoint(tv3(p), new THREE.Vector3()), TRIG_TOL);
      const ep = sp.expandByPoint(p);
      const tep = tsp.clone().expandByPoint(tv3(p));
      expectVec3(ep.center, tep.center, TRIG_TOL);
      expectClose(ep.radius, tep.radius, TRIG_TOL);
    }
  });

  it("Frustum.setFromProjectionMatrix + intersects* match three", () => {
    const rand = rng(0xc28ce);
    for (let i = 0; i < 200; i += 1) {
      const proj = new THREE.Matrix4().makePerspective(
        fv(rand, 1.2), fv(rand, 1.2), 30 + rand() * 60, 30 + rand() * 60, 0.1 + rand(), 100 + rand() * 100
      );
      const view = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(fv(rand, 1), fv(rand, Math.PI), fv(rand, 1)));
      view.setPosition(fv(rand), fv(rand), fv(rand));
      const m = proj.clone().multiply(view);
      const fr = Frustum.setFromProjectionMatrix(new Matrix4(m.elements as Matrix4["elements"]));
      const tfr = new THREE.Frustum().setFromProjectionMatrix(m);
      const p = v3(rand, 60);
      expect(fr.containsPoint(p)).toBe(tfr.containsPoint(tv3(p)));
      const sp = new Sphere(v3(rand, 60), rand() * 20 + 0.5);
      const tsp = new THREE.Sphere(tv3(sp.center), sp.radius);
      expect(fr.intersectsSphere(sp)).toBe(tfr.intersectsSphere(tsp));
      const mn = v3(rand, 60);
      const size = new Vector3(Math.abs(fv(rand, 20)) + 0.1, Math.abs(fv(rand, 20)) + 0.1, Math.abs(fv(rand, 20)) + 0.1);
      const box = new Box3(mn, mn.add(size));
      const tbox = new THREE.Box3(tv3(box.min), tv3(box.max));
      expect(fr.intersectsBox(box)).toBe(tfr.intersectsBox(tbox));
    }
  });
});

describe("OBB/Capsule parity (AD-14)", () => {
  it("OBB queries match three", () => {
    const rand = rng(0xd39ce);
    for (let i = 0; i < CASES; i += 1) {
      const center = v3(rand);
      const half = new Vector3(Math.abs(fv(rand)) + 0.1, Math.abs(fv(rand)) + 0.1, Math.abs(fv(rand)) + 0.1);
      const rot = new THREE.Matrix3().setFromMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(fv(rand, Math.PI), fv(rand, Math.PI), fv(rand, Math.PI)))
      );
      const obb = new OBB(center, half, new Matrix3(rot.elements as Matrix3["elements"]));
      const tobb = new ThreeOBB(tv3(center), tv3(half), rot.clone());
      const p = v3(rand);
      expect(obb.containsPoint(p)).toBe(tobb.containsPoint(tv3(p)));
      expectVec3(obb.clampPoint(p), tobb.clampPoint(tv3(p), new THREE.Vector3()), TRIG_TOL);
      const sp = new Sphere(v3(rand), rand() * 4);
      const tsp = new THREE.Sphere(tv3(sp.center), sp.radius);
      expect(obb.intersectsSphere(sp)).toBe(tobb.intersectsSphere(tsp));
      const pl = new Plane(v3(rand).normalize(), fv(rand, 3));
      expect(obb.intersectsPlane(pl)).toBe(tobb.intersectsPlane(new THREE.Plane(tv3(pl.normal), pl.constant)));
      const ray = new Ray(v3(rand), v3(rand).normalize());
      const tray = new THREE.Ray(tv3(ray.origin), tv3(ray.direction));
      const hit = obb.intersectRay(ray);
      const thit = tobb.intersectRay(tray, new THREE.Vector3());
      expect(hit === undefined).toBe(thit === null);
      if (hit && thit) expectVec3(hit, thit, TRIG_TOL);
      const oc = v3(rand);
      const other = new OBB(oc, half, new Matrix3(rot.elements as Matrix3["elements"]));
      const tother = new ThreeOBB(tv3(oc), tv3(half), rot.clone());
      expect(obb.intersectsOBB(other)).toBe(tobb.intersectsOBB(tother));
      expectVec3(obb.getSize(), tobb.getSize(new THREE.Vector3()));
    }
  });

  it("Capsule queries match three", () => {
    const rand = rng(0xe4ace);
    for (let i = 0; i < CASES; i += 1) {
      const cap = new Capsule(v3(rand), v3(rand), rand() * 2 + 0.05);
      const tcap = new ThreeCapsule(tv3(cap.start), tv3(cap.end), cap.radius);
      const mn = v3(rand);
      const size = new Vector3(Math.abs(fv(rand)) + 0.1, Math.abs(fv(rand)) + 0.1, Math.abs(fv(rand)) + 0.1);
      const box = new Box3(mn, mn.add(size));
      const tbox = new THREE.Box3(tv3(box.min), tv3(box.max));
      expect(cap.intersectsBox(box)).toBe(tcap.intersectsBox(tbox));
      const off = v3(rand);
      const tr = cap.translate(off);
      const ttr = tcap.clone().translate(tv3(off));
      expectVec3(tr.start, ttr.start);
      expectVec3(tr.end, ttr.end);
      expectClose(tr.radius, ttr.radius);
      expectVec3(cap.getCenter(), tcap.getCenter(new THREE.Vector3()));
    }
  });
});
