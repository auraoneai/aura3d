import {
  camera,
  createAuraApp,
  effects,
  geometry,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type Kid = NonNullable<Parameters<typeof group>[1]>[number];

// ---------- helpers ----------
let seed = 20240613;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();
let uid = 0;
const nm = (s: string): string => `${s}${uid++}`;
const TAU = Math.PI * 2;

const WATER = "#0f5a6e";

// ---------- seabed height field ----------
const H = (x: number, z: number): number =>
  0.45 * Math.sin(x * 0.09 + 1) * Math.cos(z * 0.11) +
  0.09 * Math.sin(x * 1.25 + 1.6 * Math.sin(z * 0.3)) +
  0.04 * Math.sin(z * 2.3 + x * 0.7);

const N = 180;
const SIZE = 100;
const positions = new Float32Array((N + 1) * (N + 1) * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    const x = (i / N - 0.5) * SIZE;
    const z = (j / N - 0.5) * SIZE;
    const e = 0.05;
    const dx = (H(x + e, z) - H(x - e, z)) / (2 * e);
    const dz = (H(x, z + e) - H(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    positions.set([x, H(x, z), z], v * 3);
    normals.set([-dx / l, 1 / l, -dz / l], v * 3);
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const sandMaterial = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vPos = position;
  vN = normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float caustic(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.5);
}
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(0.25, 1.0, 0.15));
  float diff = max(dot(n, L), 0.0);
  float rip = 0.5 + 0.5 * sin(vPos.x * 1.25 + 1.6 * sin(vPos.z * 0.3));
  float rip2 = 0.5 + 0.5 * sin(vPos.z * 2.3 + vPos.x * 0.7);
  vec3 sand = mix(vec3(0.50, 0.40, 0.25), vec3(0.78, 0.68, 0.46), rip * 0.7 + rip2 * 0.3);
  sand *= 0.9 + 0.5 * (vN.x * 0.6 + vN.z * 0.4);
  float dist = length(cameraPosition - vPos);
  float c1 = caustic(vPos.xz * 0.32 + 11.0, clk * 0.6);
  float c2 = caustic(vPos.xz * 0.21 - 7.0, clk * 0.45 + 3.0);
  float caus = (c1 * 0.6 + c2 * 0.5);
  vec3 col = sand * (0.4 + 0.8 * diff) * vec3(0.55, 0.95, 0.95);
  col += vec3(0.45, 1.0, 0.85) * caus * 0.55 * diff;
  col *= exp(-dist * vec3(0.05, 0.015, 0.01));
  float f = 1.0 - exp(-dist * 0.035);
  vec3 fogCol = vec3(0.005, 0.10, 0.156);
  col = mix(col, fogCol, clamp(f, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const seabed = geometry
  .custom(
    geometry.define({
      positions,
      normals,
      indices,
      bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1.5, SIZE / 2] }
    }),
    { name: "seabed", material: sandMaterial, castShadow: false }
  )
  .runtime({ id: "seabed", mutable: true });

// ---------- corals ----------
const mat = (c: string) => material.pbr({ color: c, roughness: 0.65 });
const cyl = (m: ReturnType<typeof mat>, r: number, len: number, p: V3): Kid =>
  primitives.cylinder({ name: nm("cyl"), size: [2 * r, len, 2 * r], material: m, params: { radialSegments: 10 } }).position(...p);
const ball = (m: ReturnType<typeof mat>, size: V3 | number, p: V3): Kid =>
  primitives.sphere({ name: nm("ball"), size, material: m }).position(...p);

function branching(x: number, z: number, s: number, m: ReturnType<typeof mat>): Kid {
  const kids: Kid[] = [];
  const nb = 7;
  for (let k = 0; k < nb; k += 1) {
    const a = (k / nb) * TAU + rand() * 0.5;
    const tilt = k === 0 ? 0.05 : 0.3 + rand() * 0.4;
    const L = 1.5 + rand() * 1.1;
    const sub: Kid[] = [cyl(m, 0.14, L, [0, L / 2, 0]), ball(m, 0.34, [0, L, 0])];
    for (let j = 0; j < 2; j += 1) {
      const ta = rand() * TAU;
      const tl = 0.7 + rand() * 0.5;
      sub.push(
        group(
          nm("twig"),
          [cyl(m, 0.09, tl, [0, tl / 2, 0]), ball(m, 0.22, [0, tl, 0])],
          { position: [0, L * (0.45 + 0.25 * j), 0], rotation: [0.7 * Math.sin(ta), 0, -0.7 * Math.cos(ta)] }
        )
      );
    }
    kids.push(group(nm("branch"), sub, { rotation: [tilt * Math.sin(a), 0, -tilt * Math.cos(a)] }));
  }
  return group(nm("branching"), kids, { position: [x, H(x, z) - 0.1, z], scale: s });
}

function brain(x: number, z: number, s: number, m: ReturnType<typeof mat>, ridge: ReturnType<typeof mat>): Kid {
  const kids: Kid[] = [ball(m, [3, 2, 2.8], [0, 0.4, 0])];
  for (let k = 0; k < 16; k += 1) {
    const ph = rand() * 1.15;
    const th = rand() * TAU;
    kids.push(ball(ridge, [0.7, 0.4, 0.7], [1.5 * Math.sin(ph) * Math.cos(th) * 0.97, 0.4 + 1.0 * Math.cos(ph) * 0.97, 1.4 * Math.sin(ph) * Math.sin(th) * 0.97]));
  }
  return group(nm("brain"), kids, { position: [x, H(x, z), z], scale: s });
}

function fan(x: number, z: number, s: number, yaw: number, m: ReturnType<typeof mat>, rib: ReturnType<typeof mat>): Kid {
  const kids: Kid[] = [cyl(rib, 0.12, 1.0, [0, 0.5, 0]), ball(m, [3.2, 2.5, 0.12], [0, 2.1, 0])];
  for (let k = 0; k < 9; k += 1) {
    const ang = -0.95 + (k / 8) * 1.9;
    kids.push(group(nm("rib"), [cyl(rib, 0.07, 2.3, [0, 1.15, 0])], { position: [0, 0.9, 0], rotation: [0, 0, ang] }));
  }
  return group(nm("fan"), kids, { position: [x, H(x, z) - 0.1, z], rotation: [0, yaw, 0], scale: s });
}

function tubes(x: number, z: number, s: number, m: ReturnType<typeof mat>, hole: ReturnType<typeof mat>): Kid {
  const kids: Kid[] = [];
  for (let k = 0; k < 9; k += 1) {
    const a = rand() * TAU;
    const d = k === 0 ? 0 : 0.4 + rand() * 0.9;
    const h = 1.2 + rand() * 1.6;
    const r = 0.2 + rand() * 0.13;
    const px = Math.cos(a) * d;
    const pz = Math.sin(a) * d;
    kids.push(cyl(m, r, h, [px, h / 2 - 0.1, pz]));
    kids.push(cyl(hole, r * 0.78, 0.06, [px, h - 0.08, pz]));
  }
  return group(nm("tubes"), kids, { position: [x, H(x, z), z], scale: s });
}

function table(x: number, z: number, s: number, m: ReturnType<typeof mat>): Kid {
  return group(
    nm("table"),
    [cyl(m, 0.3, 1.3, [0, 0.55, 0]), cyl(m, 1.7, 0.25, [0, 1.3, 0]), ball(m, [3.2, 0.3, 3.2], [0, 1.1, 0])],
    { position: [x, H(x, z) - 0.1, z], scale: s }
  );
}

const cOrange = mat("#ff7a3c");
const cPink = mat("#ff5fa2");
const cPurple = mat("#9b59d6");
const cYellow = mat("#f2c93a");
const cRed = mat("#e0393e");
const cTeal = mat("#34d6b0");
const cLilac = mat("#c9a0ff");
const cDark = mat("#3a1f3d");
const cCream = mat("#f3d9b0");

const worldKids: Kid[] = [
  seabed,
  branching(0, 0, 1.5, cOrange),
  branching(-6.5, 4, 1.2, cPink),
  branching(7, -3, 1.3, cYellow),
  branching(2, -9, 1.0, cPurple),
  branching(-9, -6, 1.1, cRed),
  brain(3.5, 3.5, 1.1, cTeal, cCream),
  brain(-3, -4.5, 1.3, cYellow, cOrange),
  brain(10, 4.5, 1.0, cPink, cLilac),
  fan(-3.5, 2.5, 1.2, 0.4, cPurple, cLilac),
  fan(5.5, 8, 1.4, -0.7, cRed, cPink),
  fan(-10, 1, 1.2, 1.1, cOrange, cYellow),
  tubes(-6, -1.5, 1.2, cOrange, cDark),
  tubes(6.5, 2, 1.1, cPurple, cDark),
  tubes(0.5, 7, 1.0, cYellow, cDark),
  tubes(-1.5, -9, 1.2, cTeal, cDark),
  table(9, -8, 1.3, cTeal),
  table(-7.5, 8.5, 1.2, cLilac)
];

// ---------- seaweed ----------
const weedMats = [mat("#2f8f3a"), mat("#4aa63c"), mat("#7a9a2a"), mat("#1f7a52")];
const weeds: { a: string; b: string; ph: number; sp: number }[] = [];
const weedSpots: V3[] = [];
for (let c = 0; c < 8; c += 1) {
  const a = rand() * TAU;
  const d = 5 + rand() * 11;
  weedSpots.push([Math.cos(a) * d, 0, Math.sin(a) * d]);
}
for (let c = 0; c < weedSpots.length; c += 1) {
  const [cx, , cz] = weedSpots[c]!;
  for (let k = 0; k < 5; k += 1) {
    const x = cx + range(-1.2, 1.2);
    const z = cz + range(-1.2, 1.2);
    const s = range(0.8, 1.6);
    const wm = weedMats[(c + k) % weedMats.length]!;
    const ia = nm("wa");
    const ib = nm("wb");
    const upper = group(
      ib,
      [primitives.capsule({ name: nm("seg"), size: [0.16, 1.4, 0.05], material: wm }).position(0, 0.6, 0)],
      { position: [0, 1.4, 0] }
    ).runtime({ id: ib, mutable: true });
    const blade = group(
      ia,
      [primitives.capsule({ name: nm("seg"), size: [0.2, 1.6, 0.06], material: wm }).position(0, 0.7, 0), upper],
      { position: [x, H(x, z) - 0.05, z], scale: s, rotation: [0, rand() * TAU, 0] }
    ).runtime({ id: ia, mutable: true });
    worldKids.push(blade);
    weeds.push({ a: ia, b: ib, ph: rand() * TAU, sp: range(0.8, 1.3) });
  }
}

// ---------- anemones ----------
const anemones: { id: string; ph: number }[] = [];
const anemoneSpots: [number, number, string, string][] = [
  [-4.5, -7.5, "#ff4fa0", "#ffd0e6"],
  [4, -5.5, "#b36bff", "#f0d8ff"],
  [-1.5, 4.5, "#ff9a3c", "#fff0b0"],
  [8.5, 1, "#42e0b8", "#d8fff0"],
  [-8, -1, "#ff5a5a", "#ffe0d0"],
  [1.5, 10, "#a0e03c", "#f4ffb0"]
];
for (const [x, z, body, tip] of anemoneSpots) {
  const id = nm("anemone");
  const bm = mat(body);
  const tm = mat(tip);
  const kids: Kid[] = [cyl(bm, 0.35, 0.6, [0, 0.3, 0])];
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * TAU;
    const tilt = 0.5 + (k % 2) * 0.3;
    kids.push(
      group(
        nm("tent"),
        [primitives.capsule({ name: nm("t"), size: [0.09, 0.8, 0.09], material: k % 3 === 0 ? tm : bm }).position(0, 0.4, 0)],
        { position: [Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22], rotation: [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt] }
      )
    );
  }
  worldKids.push(group(id, kids, { position: [x, H(x, z) - 0.05, z], scale: 1.3 }).runtime({ id, mutable: true }));
  anemones.push({ id, ph: rand() * TAU });
}

// ---------- fish ----------
interface Fish {
  pos: (t: number) => V3;
  len: number;
  ph: number;
}
const school: Fish[] = [];
const schoolCenter = (t: number): V3 => [13 * Math.cos(0.22 * t), 3.4 + Math.sin(0.5 * t), 10 * Math.sin(0.22 * t)];
for (let i = 0; i < 40; i += 1) {
  const o: V3 = [range(-3, 3), range(-1.2, 1.2), range(-3, 3)];
  const ph = rand() * TAU;
  school.push({
    len: range(0.5, 0.7),
    ph,
    pos: (t) => {
      const c = schoolCenter(t);
      return [
        c[0] + o[0] + 1.2 * Math.sin(0.9 * t + ph),
        c[1] + o[1] + 0.5 * Math.sin(1.3 * t + ph * 2),
        c[2] + o[2] + 1.2 * Math.cos(0.8 * t + ph * 1.5)
      ];
    }
  });
}
const ellipse = (cx: number, cz: number, rx: number, rz: number, y: number, sp: number, ph: number) => (t: number): V3 => [
  cx + rx * Math.cos(sp * t + ph),
  y + 0.7 * Math.sin(sp * 1.7 * t + ph),
  cz + rz * Math.sin(sp * t + ph)
];
const bigFish: Fish[] = [
  { len: 2.2, ph: 0.3, pos: ellipse(0, 0, 17, 9, 4.5, 0.2, 0) },
  { len: 1.8, ph: 1.7, pos: ellipse(2, -2, 8, 13, 2.8, -0.17, 2) },
  { len: 1.5, ph: 3.1, pos: ellipse(-3, 3, 11, 6, 6, 0.3, 4) }
];
const bigColors = ["#ff6a3d", "#3d7bff", "#e8e8f0"];
const schoolColors = school.map(() => `hsl(${35 + Math.floor(rand() * 20)}, 95%, ${52 + Math.floor(rand() * 12)}%)`);
const schoolTailColors = schoolColors;

const white = material.pbr({ color: "#ffffff", roughness: 0.5 });
const mkInst = (id: string) =>
  instances.sphere({ name: id, transforms: [{ position: [0, -50, 0], scale: 0.1 }], colors: ["#ffffff"], material: white, castShadow: false }).runtime({
    id,
    mutable: true
  });
worldKids.push(mkInst("schoolBody"), mkInst("schoolTail"), mkInst("bigBody"), mkInst("bigTail"));

const fishTransforms = (fish: Fish[], t: number, body: AuraTransformSpec[], tail: AuraTransformSpec[]): void => {
  body.length = 0;
  tail.length = 0;
  for (const f of fish) {
    const p = f.pos(t);
    const q = f.pos(t + 0.1);
    const yaw = Math.atan2(-(q[2] - p[2]), q[0] - p[0]);
    const L = f.len;
    body.push({ position: p, rotation: [0, yaw, 0], scale: [L, L * 0.4, L * 0.2] });
    const wag = 0.5 * Math.sin(t * 9 + f.ph);
    tail.push({
      position: [p[0] - Math.cos(yaw) * L * 0.55, p[1], p[2] + Math.sin(yaw) * L * 0.55],
      rotation: [0, yaw + wag, 0],
      scale: [L * 0.32, L * 0.5, L * 0.05]
    });
  }
};
const sBody: AuraTransformSpec[] = [];
const sTail: AuraTransformSpec[] = [];
const bBody: AuraTransformSpec[] = [];
const bTail: AuraTransformSpec[] = [];

// ---------- bubbles and particles ----------
const vents: V3[] = [
  [1.5, 0, 1.5],
  [-5, 0, 3],
  [6, 0, -2],
  [-2, 0, -7]
];
const bubbleData = Array.from({ length: 48 }, (_, i) => ({
  v: vents[i % vents.length]!,
  ph: rand(),
  sp: range(0.35, 0.7),
  r: range(0.07, 0.17),
  w: rand() * TAU
}));
const bubbleMat = material.pbr({ color: "#ffffff", roughness: 0.05, opacity: 0.55 });
worldKids.push(
  instances
    .sphere({
      name: "bubbles",
      transforms: [{ position: [0, -50, 0], scale: 0.1 }],
      colors: ["#e0ffff"],
      material: bubbleMat,
      castShadow: false
    })
    .runtime({ id: "bubbles", mutable: true })
);
const specks = Array.from({ length: 80 }, () => ({
  x: range(-20, 20),
  y: range(0.5, 10),
  z: range(-20, 20),
  ph: rand() * TAU,
  sp: range(0.05, 0.15)
}));
worldKids.push(
  instances
    .sphere({
      name: "specks",
      transforms: [{ position: [0, -50, 0], scale: 0.1 }],
      colors: ["#cfeee8"],
      material: white,
      castShadow: false
    })
    .runtime({ id: "specks", mutable: true })
);
const bubbleT: AuraTransformSpec[] = [];
const bubbleC: string[] = bubbleData.map(() => "#e0ffff");
const speckT: AuraTransformSpec[] = [];
const speckC: string[] = specks.map(() => "#cfeee8");

// ---------- scene ----------
const sc = scene({ background: WATER })
  .camera(camera.orbit({ position: [0, 6, 23], target: [0, 2, 0], fov: 50, near: 0.5, far: 160, autoRotate: 0.16 }))
  .add(lights.hemisphere({ skyColor: "#5fd0d0", groundColor: "#1d5a5a", intensity: 1.0 }))
  .add(lights.directional({ position: [8, 40, 5], target: [0, 0, 0], intensity: 3.2, color: "#c8fff0", shadow: true }))
  .add(effects.fog({ color: WATER, density: 0.035 }))
  .add(group("world", worldKids).runtime({ id: "world", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let clk = 0;
app.onFrame((f) => {
  clk += f.dt;
  const t = clk;
  const n = (id: string) => app.nodes.require(id);

  n("seabed").setUniform?.("clk", t);
  // gentle camera bob: shift the world opposite to a slow vertical motion
  n("world").setPosition(0, 0.35 * Math.sin(t * 0.5), 0);

  for (const w of weeds) {
    n(w.a).setRotation(0.18 * Math.sin(t * w.sp + w.ph), 0, 0.22 * Math.sin(t * w.sp * 0.8 + w.ph * 1.3));
    n(w.b).setRotation(0.3 * Math.sin(t * w.sp * 1.1 + w.ph + 1), 0, 0.32 * Math.sin(t * w.sp * 0.9 + w.ph * 1.3 + 1));
  }
  for (const a of anemones) {
    n(a.id).setRotation(0.07 * Math.sin(t * 1.1 + a.ph), 0, 0.07 * Math.cos(t * 0.9 + a.ph));
  }

  fishTransforms(school, t, sBody, sTail);
  n("schoolBody").setInstances(sBody, schoolColors);
  n("schoolTail").setInstances(sTail, schoolTailColors);
  fishTransforms(bigFish, t, bBody, bTail);
  n("bigBody").setInstances(bBody, bigColors);
  n("bigTail").setInstances(bTail, bigColors);

  bubbleT.length = 0;
  for (const b of bubbleData) {
    const u = (b.ph + t * b.sp * 0.1) % 1;
    const y = 0.8 + u * 12;
    bubbleT.push({
      position: [b.v[0] + 0.3 * Math.sin(t * 1.5 + b.w) * u * 2, y, b.v[2] + 0.3 * Math.cos(t * 1.2 + b.w) * u * 2],
      scale: b.r * (0.6 + 0.6 * u)
    });
  }
  n("bubbles").setInstances(bubbleT, bubbleC);

  speckT.length = 0;
  for (const s of specks) {
    const y = 0.5 + ((s.y - 0.5 + t * s.sp) % 10);
    speckT.push({
      position: [s.x + 0.8 * Math.sin(t * 0.2 + s.ph), y, s.z + 0.8 * Math.cos(t * 0.17 + s.ph)],
      scale: 0.05
    });
  }
  n("specks").setInstances(speckT, speckC);
});

await app.ready();
window.__EVAL_READY__ = true;
