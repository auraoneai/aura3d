// Cases that cannot be written as identical source against both libraries
// (the API shapes differ, so each side has its own adapter), plus cases that
// need a fake clock. See cases.mjs for the contract; goldens come from `three`.

/** Run `fn` with performance.now() replaced by a scripted sequence of ms values. */
const withClock = (script, fn) => {
  const original = performance.now.bind(performance);
  let i = 0;
  performance.now = () => script[Math.min(i++, script.length - 1)];
  try {
    return fn();
  } finally {
    performance.now = original;
  }
};

const TIMES = [0, 0.5, 1.25, 2, 3.5];
const probes = [-1, 0, 0.1, 0.5, 0.75, 1.25, 1.9, 2, 2.6, 3.5, 5];

const flat = (value) => (typeof value === "number" ? [value] : typeof value === "boolean" ? [value ? 1 : 0] : Array.from(value));

const trackCase = ({ threeName, auraName, values, stride, convert, discrete }) => ({
  three: ({ THREE }) => {
    const track = new THREE[threeName](".prop", TIMES, values, discrete ? THREE.InterpolateDiscrete : THREE.InterpolateLinear);
    const interpolant = track.createInterpolant();
    return probes.flatMap((t) => Array.from(interpolant.evaluate(t)).map(convert ?? ((x) => x)));
  },
  aura: ({ animation }) => {
    const track = discrete ? animation[auraName](".prop", TIMES, values, "step") : animation[auraName](".prop", TIMES, values);
    return probes.flatMap((t) => flat(track.sample(t)).map(convert ?? ((x) => x)));
  },
  stride,
});

export const extraCases = {
  Clock: {
    three: ({ THREE }) => clockRun(THREE),
    aura: ({ engine }) => clockRun(engine),
  },
  NumberKeyframeTrack: trackCase({ threeName: "NumberKeyframeTrack", auraName: "NumberKeyframeTrack", values: [0, 10, 4, 4, -2] }),
  VectorKeyframeTrack: trackCase({
    threeName: "VectorKeyframeTrack",
    auraName: "VectorKeyframeTrack",
    values: [0, 0, 0, 1, 2, 3, 2, 2, 2, -1, 0, 5, 0, 0, 1],
  }),
  ColorKeyframeTrack: trackCase({
    threeName: "ColorKeyframeTrack",
    auraName: "ColorKeyframeTrack",
    values: [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0.5, 0.5, 0.5],
  }),
  QuaternionKeyframeTrack: trackCase({
    threeName: "QuaternionKeyframeTrack",
    auraName: "QuaternionKeyframeTrack",
    values: [0, 0, 0, 1, 0, 0.3826834, 0, 0.9238795, 0, 0.7071068, 0, 0.7071068, 0.5, 0.5, 0.5, 0.5, 0, 0, 0, 1],
  }),
  BooleanKeyframeTrack: {
    three: ({ THREE }) => {
      const interpolant = new THREE.BooleanKeyframeTrack(".visible", TIMES, [true, false, false, true, false]).createInterpolant();
      return probes.flatMap((t) => Array.from(interpolant.evaluate(t)).map((x) => (x ? 1 : 0)));
    },
    aura: ({ animation }) => {
      const track = animation.BooleanKeyframeTrack(".visible", TIMES, [true, false, false, true, false]);
      return probes.map((t) => (track.sample(t) ? 1 : 0));
    },
  },
  StringKeyframeTrack: {
    three: ({ THREE }) => {
      const names = ["idle", "run", "jump", "run", "idle"];
      const interpolant = new THREE.StringKeyframeTrack(".name", TIMES, names).createInterpolant();
      return probes.flatMap((t) => Array.from(interpolant.evaluate(t)).map((x) => names.indexOf(x)));
    },
    aura: ({ animation }) => {
      const names = ["idle", "run", "jump", "run", "idle"];
      const track = animation.StringKeyframeTrack(".name", TIMES, names);
      return probes.map((t) => names.indexOf(track.sample(t)));
    },
  },
};

function clockRun(L) {
  // Time is set explicitly so the result does not depend on how many times each
  // implementation reads the clock.
  const real = performance.now.bind(performance);
  let nowMs = 1000;
  performance.now = () => nowMs;
  try {
    const out = [];
    const c = new L.Clock();
    out.push(c.running ? 1 : 0);
    out.push(c.getDelta(), c.running ? 1 : 0);
    nowMs = 1016;
    out.push(c.getDelta());
    nowMs = 1500;
    out.push(c.getElapsedTime(), c.elapsedTime);
    nowMs = 1600;
    c.stop();
    out.push(c.running ? 1 : 0, c.getDelta());
    nowMs = 2600;
    c.start();
    nowMs = 2700;
    out.push(c.running ? 1 : 0, c.getDelta(), c.getElapsedTime());
    const manual = new L.Clock(false);
    out.push(manual.running ? 1 : 0);
    nowMs = 2800;
    out.push(manual.getDelta(), manual.running ? 1 : 0);
    manual.start();
    nowMs = 3000;
    out.push(manual.getDelta(), manual.getElapsedTime());
    return out;
  } finally {
    performance.now = real;
  }
}

// ── Geometry buffers: three geometry vs the verbatim-port parity generators ──
// The primitives.* node path (packages/rendering/src/geometry/Primitives.ts)
// hands `params` to these generators unchanged at the default segment tier.
const attrs = (g) => [
  g.attributes.position.count,
  ...Array.from(g.attributes.position.array),
  ...(g.attributes.normal ? [g.attributes.normal.count, ...Array.from(g.attributes.normal.array)] : [0]),
  ...(g.attributes.uv ? [g.attributes.uv.count, ...Array.from(g.attributes.uv.array)] : [0]),
  ...(g.index ? [g.index.count, ...Array.from(g.index.array)] : [0]),
];
const mesh = (m) => [
  m.positions.length / 3,
  ...m.positions,
  ...(m.normals ? [m.normals.length / 3, ...m.normals] : [0]),
  ...(m.uvs ? [m.uvs.length / 2, ...m.uvs] : [0]),
  ...(m.indices ? [m.indices.length, ...m.indices] : [0]),
];

const geometryCase = (threeBuild, auraBuild) => ({
  three: (ctx) => attrs(threeBuild(ctx)),
  aura: (ctx) => mesh(auraBuild(ctx)),
});

const lathePoints = [[0.2, 0], [1, 0.5], [0.6, 1.2], [0.9, 2], [0.1, 2.5]];
const polyhedron = (threeName, variant) =>
  geometryCase(
    ({ THREE }) => new THREE[threeName](1.5, 1),
    ({ parity }) => parity.polyhedronParityMesh({ radius: 1.5, detail: 1, variant })
  );
const tubeCurve = (L) =>
  new L.CatmullRomCurve3([new L.Vector3(0, 0, 0), new L.Vector3(2, 1, 0), new L.Vector3(3, 3, 1), new L.Vector3(5, 2, 2)]);
const buildShape = (L) => {
  const s = new L.Shape();
  s.moveTo(0, 0);
  s.lineTo(4, 0);
  s.lineTo(4, 3);
  s.lineTo(2, 4.5);
  s.lineTo(0, 3);
  s.lineTo(0, 0);
  const hole = new L.Path();
  hole.moveTo(1, 1);
  hole.lineTo(1, 2);
  hole.lineTo(2, 2);
  hole.lineTo(2, 1);
  hole.lineTo(1, 1);
  s.holes.push(hole);
  return s;
};

Object.assign(extraCases, {
  ConeGeometry: geometryCase(
    ({ THREE }) => new THREE.ConeGeometry(1.5, 3, 12, 2, false, 0.2, 4),
    ({ parity }) => parity.coneParityMesh({ radius: 1.5, height: 3, radialSegments: 12, heightSegments: 2, openEnded: false, thetaStart: 0.2, thetaLength: 4 })
  ),
  CircleGeometry: geometryCase(
    ({ THREE }) => new THREE.CircleGeometry(2, 10, 0.3, 5),
    ({ parity }) => parity.circleParityMesh({ radius: 2, segments: 10, thetaStart: 0.3, thetaLength: 5 })
  ),
  RingGeometry: geometryCase(
    ({ THREE }) => new THREE.RingGeometry(0.5, 2, 12, 3, 0.1, 5),
    ({ parity }) => parity.ringParityMesh({ innerRadius: 0.5, outerRadius: 2, thetaSegments: 12, phiSegments: 3, thetaStart: 0.1, thetaLength: 5 })
  ),
  TorusKnotGeometry: geometryCase(
    ({ THREE }) => new THREE.TorusKnotGeometry(1.2, 0.3, 40, 6, 2, 3),
    ({ parity }) => parity.torusKnotParityMesh({ radius: 1.2, tube: 0.3, tubularSegments: 40, radialSegments: 6, p: 2, q: 3 })
  ),
  IcosahedronGeometry: polyhedron("IcosahedronGeometry", "icosahedron"),
  TetrahedronGeometry: polyhedron("TetrahedronGeometry", "tetrahedron"),
  OctahedronGeometry: polyhedron("OctahedronGeometry", "octahedron"),
  DodecahedronGeometry: polyhedron("DodecahedronGeometry", "dodecahedron"),
  LatheGeometry: geometryCase(
    ({ THREE }) => new THREE.LatheGeometry(lathePoints.map(([x, y]) => new THREE.Vector2(x, y)), 14, 0.4, 5),
    ({ parity }) => parity.latheParityMesh({ points: lathePoints, segments: 14, phiStart: 0.4, phiLength: 5 })
  ),
  TubeGeometry: geometryCase(
    ({ THREE }) => new THREE.TubeGeometry(tubeCurve(THREE), 20, 0.4, 6, false),
    ({ parity, math }) => parity.tubeParityMesh({ path: tubeCurve(math), tubularSegments: 20, radius: 0.4, radialSegments: 6, closed: false })
  ),
  ExtrudeGeometry: geometryCase(
    ({ THREE }) => new THREE.ExtrudeGeometry(buildShape(THREE), { depth: 1.5, steps: 2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelOffset: 0, bevelSegments: 2 }),
    ({ parity, math }) => parity.extrudeParityMesh({ shape: buildShape(math), depth: 1.5, steps: 2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelOffset: 0, bevelSegments: 2 })
  ),
  ShapeGeometry: geometryCase(
    ({ THREE }) => new THREE.ShapeGeometry(buildShape(THREE)),
    ({ parity, math }) => parity.shapeParityMesh({ shape: buildShape(math) })
  ),
  RoundedBoxGeometry: geometryCase(
    ({ addons }) => new addons.RoundedBoxGeometry(2, 1.5, 1, 3, 0.2),
    ({ parity }) => parity.roundedBoxParityMesh({ width: 2, height: 1.5, depth: 1, segments: 3, radius: 0.2 })
  ),
  EdgesGeometry: geometryCase(
    ({ THREE }) => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 2, 3, 2, 2, 2), 1),
    ({ parity }) => parity.edgesParityMesh(parity.boxParityMesh(1, 2, 3, 2, 2, 2), 1)
  ),
  WireframeGeometry: geometryCase(
    ({ THREE }) => new THREE.WireframeGeometry(new THREE.BoxGeometry(1, 2, 3, 2, 2, 2)),
    ({ parity }) => parity.wireframeParityMesh(parity.boxParityMesh(1, 2, 3, 2, 2, 2))
  ),
});
