// Before/after fixtures for the three.js -> @aura3d/engine codemod table
// (PRD beat-three.js, contract 3.6). Each case is the SAME source run twice: once
// against real three.js r185 (goldens.json is generated from it by generate.mjs)
// and once against the Aura3D surface the mapping row names (fidelity.test.ts).
// A row may be labelled `exact` only when its case here reproduces the three.js
// golden within the stated tolerance. `lib` is the namespace of the target
// module, with the same constructor names as three.
//
// Cases return a flat array of numbers. Keep inputs deterministic.

const v2 = (v) => [v.x, v.y];
const v3 = (v) => [v.x, v.y, v.z];
const v4 = (v) => [v.x, v.y, v.z, v.w];
const m = (mat) => Array.from(mat.elements);
const box = (b) => [...v3(b.min), ...v3(b.max)];

/** Sample a curve at fixed parameters (getPoint = by t, getPointAt = by arc length). */
const sampleCurve = (curve, dims) => {
  const out = [];
  for (const t of [0, 0.13, 0.5, 0.77, 1]) {
    const p = curve.getPoint(t);
    out.push(...(dims === 3 ? v3(p) : v2(p)));
  }
  for (const u of [0.25, 0.6]) {
    const p = curve.getPointAt(u);
    out.push(...(dims === 3 ? v3(p) : v2(p)));
  }
  out.push(curve.getLength());
  return out;
};

export const TOLERANCE = 1e-5;

export const cases = {
  // Evidence, not a mapping row: three's math classes MUTATE and return `this`; Aura's are immutable value
  // types whose methods return new instances. Statement-form three code (`v.add(w);`) therefore does
  // nothing on Aura's classes. The fidelity test asserts this divergence so it is revisited if that changes.
  MutationSemantics: (L) => {
    const v = new L.Vector3(1, 2, 3);
    v.add(new L.Vector3(1, 1, 1));
    v.multiplyScalar(2);
    const q = new L.Vector3(3, 0, 4);
    q.normalize();
    return [...v3(v), ...v3(q)];
  },

  // ── Math classes ────────────────────────────────────────────────────
  Vector2: (L) => {
    const a = new L.Vector2(1.5, -2.25);
    const b = new L.Vector2(-0.5, 4);
    return [
      ...v2(a.clone().add(b)), ...v2(a.clone().sub(b)), ...v2(a.clone().multiplyScalar(2.5)),
      a.dot(b), a.length(), a.distanceTo(b), a.angle(), ...v2(a.clone().normalize()),
      ...v2(a.clone().lerp(b, 0.3)), ...v2(a.clone().rotateAround(new L.Vector2(1, 1), 0.7)),
      ...v2(a.clone().clamp(new L.Vector2(0, 0), new L.Vector2(1, 1))),
    ];
  },
  Vector4: (L) => {
    const a = new L.Vector4(1, 2, 3, 4);
    const b = new L.Vector4(-1, 0.5, 2, 8);
    return [
      ...v4(a.clone().add(b)), ...v4(a.clone().sub(b)), ...v4(a.clone().multiplyScalar(0.5)),
      a.dot(b), a.length(), ...v4(a.clone().normalize()), ...v4(a.clone().lerp(b, 0.25)),
      ...v4(a.clone().applyMatrix4(new L.Matrix4().makeRotationY(0.4).setPosition(1, 2, 3))),
    ];
  },
  Quaternion: (L) => {
    const a = new L.Quaternion().setFromAxisAngle(new L.Vector3(0, 1, 0), 0.9);
    const b = new L.Quaternion().setFromEuler(new L.Euler(0.3, -0.4, 1.1, "XYZ"));
    return [
      ...v4(a), ...v4(b), ...v4(a.clone().multiply(b)), ...v4(a.clone().slerp(b, 0.35)),
      ...v4(a.clone().invert()), a.angleTo(b), a.dot(b), ...v4(b.clone().normalize()),
      ...v3(new L.Vector3(1, 2, 3).applyQuaternion(b)),
    ];
  },
  Matrix3: (L) => {
    const a = new L.Matrix3().set(2, 0.5, 0, -1, 3, 0.25, 0.1, 0, 1.5);
    const b = new L.Matrix3().set(1, 2, 3, 0, 1, 4, 5, 6, 0);
    const n = new L.Matrix3().getNormalMatrix(new L.Matrix4().makeScale(2, 3, 4).setPosition(1, 2, 3));
    return [...m(a), ...m(a.clone().multiply(b)), ...m(a.clone().transpose()), a.determinant(), ...m(a.clone().invert()), ...m(n)];
  },
  Matrix4: (L) => {
    const t = new L.Matrix4().compose(new L.Vector3(1, 2, 3), new L.Quaternion().setFromEuler(new L.Euler(0.2, 0.5, -0.3)), new L.Vector3(1, 2, 0.5));
    const p = new L.Matrix4().makePerspective(-1, 1, 1, -1, 0.1, 100);
    const o = new L.Matrix4().makeOrthographic(-2, 2, 2, -2, 0.1, 50);
    const look = new L.Matrix4().lookAt(new L.Vector3(3, 4, 5), new L.Vector3(0, 0, 0), new L.Vector3(0, 1, 0));
    const pos = new L.Vector3();
    const q = new L.Quaternion();
    const s = new L.Vector3();
    t.decompose(pos, q, s);
    return [...m(t), ...m(p), ...m(o), ...m(look), ...m(t.clone().invert()), ...m(t.clone().multiply(look)), t.determinant(), ...v3(pos), ...v4(q), ...v3(s),
      ...m(new L.Matrix4().makeRotationAxis(new L.Vector3(1, 1, 0).normalize(), 0.8))];
  },
  Euler: (L) => {
    const out = [];
    for (const order of ["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"]) {
      const e = new L.Euler().setFromQuaternion(new L.Quaternion().setFromEuler(new L.Euler(0.3, -0.5, 0.9, order)), order);
      out.push(e.x, e.y, e.z);
      const mat = new L.Matrix4().makeRotationFromEuler(new L.Euler(0.4, 0.2, -0.6, order));
      out.push(...m(mat));
    }
    return out;
  },
  Box3: (L) => {
    const a = new L.Box3(new L.Vector3(-1, -2, -3), new L.Vector3(4, 5, 6));
    const b = new L.Box3().setFromPoints([new L.Vector3(0, 0, 0), new L.Vector3(7, 1, 2), new L.Vector3(-3, 9, 1)]);
    const sph = new L.Sphere();
    const size = new L.Vector3();
    const center = new L.Vector3();
    a.getSize(size);
    a.getCenter(center);
    a.getBoundingSphere(sph);
    return [
      ...box(a), ...box(b), ...box(a.clone().union(b)), ...box(a.clone().intersect(b)), ...v3(size), ...v3(center),
      a.intersectsBox(b) ? 1 : 0, a.containsPoint(new L.Vector3(0, 0, 0)) ? 1 : 0, a.distanceToPoint(new L.Vector3(10, 0, 0)),
      ...box(a.clone().expandByScalar(0.5)), ...box(a.clone().expandByVector(new L.Vector3(1, 2, 3))), ...v3(sph.center), sph.radius,
      ...box(a.clone().applyMatrix4(new L.Matrix4().makeRotationZ(0.6))), ...v3(a.clampPoint(new L.Vector3(9, -9, 0), new L.Vector3())),
    ];
  },
  Sphere: (L) => {
    const a = new L.Sphere(new L.Vector3(1, 2, 3), 2);
    const b = new L.Sphere(new L.Vector3(4, 2, 3), 1.5);
    const bb = new L.Box3();
    a.getBoundingBox(bb);
    return [
      a.intersectsSphere(b) ? 1 : 0, a.containsPoint(new L.Vector3(1, 2, 4)) ? 1 : 0, a.distanceToPoint(new L.Vector3(9, 2, 3)),
      ...v3(a.clampPoint(new L.Vector3(9, 2, 3), new L.Vector3())), ...box(bb), ...v3(a.clone().union(b).center), a.clone().union(b).radius,
      a.intersectsBox(new L.Box3(new L.Vector3(2, 2, 2), new L.Vector3(5, 5, 5))) ? 1 : 0,
      a.intersectsPlane(new L.Plane(new L.Vector3(0, 1, 0), -3)) ? 1 : 0,
      a.clone().applyMatrix4(new L.Matrix4().makeScale(2, 2, 2).setPosition(1, 0, 0)).radius,
      ...v3(new L.Sphere().setFromPoints([new L.Vector3(0, 0, 0), new L.Vector3(2, 0, 0), new L.Vector3(0, 4, 0)]).center),
    ];
  },
  Plane: (L) => {
    const p = new L.Plane().setFromNormalAndCoplanarPoint(new L.Vector3(0, 1, 0).normalize(), new L.Vector3(0, 2, 0));
    const q = new L.Plane().setFromCoplanarPoints(new L.Vector3(0, 0, 0), new L.Vector3(1, 0, 0), new L.Vector3(0, 0, 1));
    const ln = new L.Line3(new L.Vector3(0, 0, 0), new L.Vector3(0, 5, 0));
    const hit = p.intersectLine(ln, new L.Vector3());
    return [
      ...v3(p.normal), p.constant, ...v3(q.normal), q.constant, p.distanceToPoint(new L.Vector3(3, 7, 1)),
      ...v3(p.projectPoint(new L.Vector3(3, 7, 1), new L.Vector3())), ...v3(p.coplanarPoint(new L.Vector3())),
      hit ? 1 : 0, ...(hit ? v3(hit) : [0, 0, 0]), ...v3(p.clone().applyMatrix4(new L.Matrix4().makeRotationX(0.5)).normal),
      p.clone().negate().constant,
    ];
  },
  Ray: (L) => {
    const r = new L.Ray(new L.Vector3(0, 5, 0), new L.Vector3(0, -1, 0));
    const out = [];
    const pt = (v) => (v ? [1, ...v3(v)] : [0, 0, 0, 0]);
    out.push(...pt(r.intersectPlane(new L.Plane(new L.Vector3(0, 1, 0), 0), new L.Vector3())));
    out.push(...pt(r.intersectSphere(new L.Sphere(new L.Vector3(0, 0, 0), 1), new L.Vector3())));
    out.push(...pt(r.intersectBox(new L.Box3(new L.Vector3(-1, -1, -1), new L.Vector3(1, 1, 1)), new L.Vector3())));
    out.push(...pt(r.intersectTriangle(new L.Vector3(-1, 0, -1), new L.Vector3(1, 0, -1), new L.Vector3(0, 0, 1), false, new L.Vector3())));
    out.push(r.distanceToPoint(new L.Vector3(2, 0, 0)), r.distanceSqToPoint(new L.Vector3(2, 0, 0)), ...v3(r.at(2.5, new L.Vector3())),
      ...v3(r.closestPointToPoint(new L.Vector3(2, 0, 0), new L.Vector3())), r.distanceToPlane(new L.Plane(new L.Vector3(0, 1, 0), 0)),
      ...v3(r.clone().direction));
    return out;
  },
  Frustum: (L) => {
    const proj = new L.Matrix4().makePerspective(-0.5, 0.5, 0.5, -0.5, 0.1, 100);
    const f = new L.Frustum().setFromProjectionMatrix(proj);
    const pts = [[0, 0, -5], [0, 0, 5], [100, 0, -5], [0, 0, -200], [0.4, 0.4, -1]];
    return [
      ...pts.map((p) => (f.containsPoint(new L.Vector3(...p)) ? 1 : 0)),
      f.intersectsSphere(new L.Sphere(new L.Vector3(0, 0, -10), 1)) ? 1 : 0,
      f.intersectsSphere(new L.Sphere(new L.Vector3(50, 0, -10), 1)) ? 1 : 0,
      f.intersectsBox(new L.Box3(new L.Vector3(-1, -1, -20), new L.Vector3(1, 1, -10))) ? 1 : 0,
      f.intersectsBox(new L.Box3(new L.Vector3(40, 40, -20), new L.Vector3(41, 41, -10))) ? 1 : 0,
      ...f.planes.flatMap((p) => [...v3(p.normal), p.constant]),
    ];
  },
  Spherical: (L) => {
    const s = new L.Spherical().setFromCartesianCoords(1, 2, 3);
    const mk = new L.Spherical(5, 0, 0.5).makeSafe();
    return [s.radius, s.phi, s.theta, mk.radius, mk.phi, mk.theta];
  },
  Cylindrical: (L) => {
    const c = new L.Cylindrical().setFromCartesianCoords(1, 2, 3);
    return [c.radius, c.theta, c.y];
  },
  Line3: (L) => {
    const l = new L.Line3(new L.Vector3(0, 0, 0), new L.Vector3(4, 0, 0));
    return [...v3(l.delta(new L.Vector3())), l.distance(), l.distanceSq(), ...v3(l.at(0.25, new L.Vector3())), ...v3(l.getCenter(new L.Vector3())),
      ...v3(l.closestPointToPoint(new L.Vector3(2, 3, 0), true, new L.Vector3())), l.closestPointToPointParameter(new L.Vector3(7, 1, 0), false)];
  },
  Triangle: (L) => {
    const t = new L.Triangle(new L.Vector3(0, 0, 0), new L.Vector3(4, 0, 0), new L.Vector3(0, 3, 0));
    const bc = t.getBarycoord(new L.Vector3(1, 1, 0), new L.Vector3());
    return [t.getArea(), ...v3(t.getNormal(new L.Vector3())), ...v3(t.getMidpoint(new L.Vector3())), ...v3(bc), t.containsPoint(new L.Vector3(1, 1, 0)) ? 1 : 0,
      t.containsPoint(new L.Vector3(5, 5, 0)) ? 1 : 0, ...v3(t.closestPointToPoint(new L.Vector3(6, 6, 2), new L.Vector3())),
      t.intersectsBox(new L.Box3(new L.Vector3(1, 1, -1), new L.Vector3(2, 2, 1))) ? 1 : 0, ...v3(t.getPlane(new L.Plane()).normal)];
  },
  MathUtils: (L) => {
    const U = L.MathUtils;
    return [U.degToRad(37), U.radToDeg(1.3), U.clamp(5, 0, 3), U.lerp(2, 10, 0.25), U.mapLinear(5, 0, 10, 100, 200), U.smoothstep(0.4, 0, 1),
      U.smootherstep(0.4, 0, 1), U.inverseLerp(10, 20, 14), U.damp(0, 10, 4, 0.016), U.pingpong(7.5, 3), U.euclideanModulo(-7, 5),
      U.isPowerOfTwo(64) ? 1 : 0, U.ceilPowerOfTwo(33), U.floorPowerOfTwo(33)];
  },
  SphericalHarmonics3: (L) => {
    const sh = new L.SphericalHarmonics3();
    for (let i = 0; i < 9; i += 1) sh.coefficients[i] = new L.Vector3(0.1 * (i + 1), -0.05 * i, 0.02 * (9 - i));
    const dir = new L.Vector3(0.3, 0.8, -0.5).normalize();
    const basis = [];
    L.SphericalHarmonics3.getBasisAt(dir, basis);
    const irr = sh.getAt(dir, new L.Vector3());
    const irr2 = sh.getIrradianceAt(dir, new L.Vector3());
    const other = new L.SphericalHarmonics3();
    for (let i = 0; i < 9; i += 1) other.coefficients[i] = new L.Vector3(1, 0.5, 0.25);
    const mix = sh.clone().lerp(other, 0.4);
    return [...basis, ...v3(irr), ...v3(irr2), ...mix.coefficients.flatMap(v3)];
  },

  Octree: (L) => {
    // Two ramps and a floor as a triangle soup; same triangles into both octrees.
    const tris = [
      [[-5, 0, -5], [5, 0, -5], [5, 0, 5]], [[-5, 0, -5], [5, 0, 5], [-5, 0, 5]],
      [[0, 0, -2], [4, 2, -2], [0, 0, 2]], [[4, 2, -2], [4, 2, 2], [0, 0, 2]],
      [[-4, 0, -1], [-2, 3, -1], [-4, 0, 1]],
    ];
    const octree = new L.Octree();
    for (const [a, b, c] of tris) octree.addTriangle(new L.Triangle(new L.Vector3(...a), new L.Vector3(...b), new L.Vector3(...c)));
    octree.build();
    const hit = (r) => (r ? [1, ...v3(r.normal), r.depth] : [0, 0, 0, 0, 0]);
    const ray = octree.rayIntersect(new L.Ray(new L.Vector3(2, 10, 0), new L.Vector3(0, -1, 0)));
    return [
      ...hit(octree.sphereIntersect(new L.Sphere(new L.Vector3(0, 0.4, 0), 0.5))),
      ...hit(octree.sphereIntersect(new L.Sphere(new L.Vector3(20, 0.4, 0), 0.5))),
      ...hit(octree.capsuleIntersect(new L.Capsule(new L.Vector3(-4, 0.2, 0), new L.Vector3(-4, 1.5, 0), 0.3))),
      ...hit(octree.boxIntersect(new L.Box3(new L.Vector3(1, 0, -1), new L.Vector3(3, 2, 1)))),
      ray ? 1 : 0, ray ? ray.distance : 0, ...(ray ? v3(ray.position) : [0, 0, 0]),
    ];
  },

  // ── Curves ──────────────────────────────────────────────────────────
  CatmullRomCurve3: (L) => sampleCurve(new L.CatmullRomCurve3([new L.Vector3(0, 0, 0), new L.Vector3(2, 1, 0), new L.Vector3(3, 3, 1), new L.Vector3(5, 2, 2)], false, "catmullrom", 0.5), 3)
    .concat(sampleCurve(new L.CatmullRomCurve3([new L.Vector3(0, 0, 0), new L.Vector3(2, 1, 0), new L.Vector3(3, 3, 1)], true, "centripetal"), 3)),
  CubicBezierCurve3: (L) => sampleCurve(new L.CubicBezierCurve3(new L.Vector3(0, 0, 0), new L.Vector3(1, 2, 0), new L.Vector3(3, 2, 1), new L.Vector3(4, 0, 2)), 3),
  CubicBezierCurve: (L) => sampleCurve(new L.CubicBezierCurve(new L.Vector2(0, 0), new L.Vector2(1, 2), new L.Vector2(3, 2), new L.Vector2(4, 0)), 2),
  QuadraticBezierCurve3: (L) => sampleCurve(new L.QuadraticBezierCurve3(new L.Vector3(0, 0, 0), new L.Vector3(2, 3, 1), new L.Vector3(4, 0, 2)), 3),
  QuadraticBezierCurve: (L) => sampleCurve(new L.QuadraticBezierCurve(new L.Vector2(0, 0), new L.Vector2(2, 3), new L.Vector2(4, 0)), 2),
  LineCurve3: (L) => sampleCurve(new L.LineCurve3(new L.Vector3(0, 0, 0), new L.Vector3(3, 4, 5)), 3),
  LineCurve: (L) => sampleCurve(new L.LineCurve(new L.Vector2(0, 0), new L.Vector2(3, 4)), 2),
  SplineCurve: (L) => sampleCurve(new L.SplineCurve([new L.Vector2(0, 0), new L.Vector2(2, 1), new L.Vector2(3, 3), new L.Vector2(5, 2)]), 2),
  EllipseCurve: (L) => sampleCurve(new L.EllipseCurve(1, 2, 3, 1.5, 0, Math.PI * 1.5, false, 0.4), 2),
  ArcCurve: (L) => sampleCurve(new L.ArcCurve(1, 2, 3, 0.2, 2.4, true), 2),
  CurvePath: (L) => {
    const cp = new L.CurvePath();
    cp.add(new L.LineCurve(new L.Vector2(0, 0), new L.Vector2(2, 0)));
    cp.add(new L.QuadraticBezierCurve(new L.Vector2(2, 0), new L.Vector2(3, 2), new L.Vector2(2, 3)));
    cp.add(new L.LineCurve(new L.Vector2(2, 3), new L.Vector2(0, 0)));
    return sampleCurve(cp, 2).concat(cp.getLength(), cp.getPoints(8).flatMap(v2));
  },
  Path: (L) => {
    const p = new L.Path();
    p.moveTo(0, 0);
    p.lineTo(2, 0);
    p.quadraticCurveTo(3, 1, 2, 2);
    p.bezierCurveTo(1, 3, 0, 3, 0, 2);
    p.splineThru([new L.Vector2(-1, 1), new L.Vector2(0, 0.5)]);
    p.absarc(0, 0, 0.5, 0, Math.PI / 2, false);
    return p.getPoints(6).flatMap(v2).concat(p.getLength(), p.getSpacedPoints(5).flatMap(v2));
  },
  Shape: (L) => {
    const s = new L.Shape();
    s.moveTo(0, 0);
    s.lineTo(4, 0);
    s.lineTo(4, 4);
    s.lineTo(0, 4);
    s.lineTo(0, 0);
    const hole = new L.Path();
    hole.moveTo(1, 1);
    hole.lineTo(1, 3);
    hole.lineTo(3, 3);
    hole.lineTo(3, 1);
    hole.lineTo(1, 1);
    s.holes.push(hole);
    const ex = s.extractPoints(4);
    return [...ex.shape.flatMap(v2), ex.holes.length, ...ex.holes[0].flatMap(v2), s.getPoints(4).length];
  },
};
