import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  lights,
  material,
  primitives,
  instances,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

const WATER = "#0a5468";

// ---------- seeded random ----------
let seed = 20240613;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const rr = (a: number, b: number): number => a + rand() * (b - a);

// ---------- seabed height (shared by sand mesh and object placement) ----------
const ripple = (x: number, z: number): number => {
  const ph = x * 1.5 + z * 0.6 + 2.2 * Math.sin(z * 0.17 + x * 0.05) + 1.4 * Math.sin(x * 0.09);
  return 0.055 * Math.sin(ph) + 0.02 * Math.sin(ph * 2.3 + z * 0.4);
};
const H = (x: number, z: number): number =>
  ripple(x, z) + 0.45 * Math.sin(x * 0.07 + 1) * Math.cos(z * 0.06) + 0.8 * Math.exp(-(x * x + z * z) / 90);

// ---------- sand mesh ----------
const N = 240;
const SIZE = 130;
const sandPos = new Float32Array((N + 1) * (N + 1) * 3);
const sandNor = new Float32Array(sandPos.length);
const sandIdx: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    const x = (i / N - 0.5) * SIZE;
    const z = (j / N - 0.5) * SIZE;
    const e = 0.15;
    const nx = -(H(x + e, z) - H(x - e, z)) / (2 * e);
    const nz = -(H(x, z + e) - H(x, z - e)) / (2 * e);
    const l = Math.hypot(nx, 1, nz);
    sandPos.set([x, H(x, z), z], v * 3);
    sandNor.set([nx / l, 1 / l, nz / l], v * 3);
    if (i < N && j < N) sandIdx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
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
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float caustic(vec2 uv, float t) {
  float TAU = 6.28318530718;
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
void main() {
  vec3 n = normalize(vN);
  float fr = sin(vPos.x * 1.5 + vPos.z * 0.6 + 2.2 * sin(vPos.z * 0.17 + vPos.x * 0.05) + 1.4 * sin(vPos.x * 0.09));
  vec3 L = normalize(vec3(0.25, 1.0, 0.15));
  float diff = max(dot(n, L), 0.0);
  float grain = vnoise(vPos.xz * 6.0) * 0.5 + vnoise(vPos.xz * 23.0) * 0.5;
  vec3 sand = mix(vec3(0.50, 0.38, 0.18), vec3(0.74, 0.60, 0.33), grain);
  sand *= 0.88 + 0.12 * fr;
  float c = caustic(vPos.xz * 0.045, clk) + 0.6 * caustic(vPos.xz * 0.07 + 0.37, clk * 1.3 + 3.0);
  vec3 sunCol = vec3(0.70, 1.0, 0.92);
  vec3 lit = sand * (vec3(0.10, 0.24, 0.27) + sunCol * diff * 0.75) + sand * sunCol * c * 0.9;
  float d = length(cameraPosition - vPos);
  float f = 1.0 - exp(-d * 0.028);
  f = max(f, smoothstep(38.0, 58.0, length(vPos.xz)));
  vec3 water = vec3(0.004, 0.09, 0.14);
  outColor = vec4(mix(lit, water, clamp(f, 0.0, 1.0)), 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  fog: false
});

// ---------- light shaft material ----------
const shaftMaterial = material.custom({
  glsl: {
    vertex: `out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vUv; out vec4 outColor;
void main() {
  float lat = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float vert = pow(clamp(vUv.y, 0.0, 1.0), 1.3);
  float flick = 0.65 + 0.35 * sin(vUv.x * 17.0 + clk * 0.6) * sin(vUv.x * 7.0 - clk * 0.35);
  float a = pow(lat, 1.5) * vert * flick * 0.16;
  outColor = vec4(vec3(0.55, 1.0, 0.85) * a, a);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "additive",
  fog: false
});

// ---------- static reef (instanced spheres / cylinders) ----------
const ballT: AuraTransformSpec[] = [];
const ballC: string[] = [];
const cylT: AuraTransformSpec[] = [];
const cylC: string[] = [];

const ball = (x: number, y: number, z: number, r: number, color: string, sy = 1): void => {
  ballT.push({ position: [x, y, z], scale: [2 * r, 2 * r * sy, 2 * r] });
  ballC.push(color);
};
const tube = (x: number, y: number, z: number, r: number, h: number, color: string): void => {
  cylT.push({ position: [x, y + h / 2, z], scale: [2 * r, h, 2 * r] });
  cylC.push(color);
};
const hsl = (h: number, s: number, l: number): string => `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;

// branching coral: recursive chains of spheres
const grow = (p: V3, d: V3, len: number, r: number, depth: number, hue: number): void => {
  const n = Math.max(2, Math.ceil(len / (r * 0.8)));
  let q: V3 = [p[0], p[1], p[2]];
  for (let i = 0; i < n; i += 1) {
    const k = i / n;
    const rad = r * (1 - 0.35 * k);
    ball(q[0], q[1], q[2], rad, depth === 0 && i > n - 3 ? hsl(hue + 8, 85, 72) : hsl(hue, 75, 52 + depth * 2));
    q = [q[0] + (d[0] * len) / n, q[1] + (d[1] * len) / n, q[2] + (d[2] * len) / n];
  }
  if (depth <= 0) return;
  const kids = depth === 3 ? 4 : 3;
  for (let b = 0; b < kids; b += 1) {
    let nx = d[0] + rr(-0.9, 0.9);
    let ny = d[1] * 0.6 + 0.55;
    let nz = d[2] + rr(-0.9, 0.9);
    const l = Math.hypot(nx, ny, nz);
    nx /= l;
    ny /= l;
    nz /= l;
    grow(q, [nx, ny, nz], len * 0.68, r * 0.68, depth - 1, hue);
  }
};
const branching = (x: number, z: number, hue: number, scale: number): void => {
  grow([x, H(x, z) - 0.1, z], [0, 1, 0], 2.2 * scale, 0.34 * scale, 3, hue);
};

// brain coral: dome of bumpy spheres
const brain = (x: number, z: number, R: number, hue: number): void => {
  const y0 = H(x, z) - R * 0.25;
  ball(x, y0, z, R, hsl(hue, 45, 42), 0.75);
  const count = Math.round(R * R * 55);
  for (let i = 0; i < count; i += 1) {
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(rand() * 0.95 + 0.05); // polar angle from top, upper hemisphere
    const sx = Math.sin(ph) * Math.cos(th);
    const sy = Math.cos(ph);
    const sz = Math.sin(ph) * Math.sin(th);
    const groove = Math.sin(sx * 7 + sz * 5 + sy * 3) > 0;
    ball(x + sx * R * 0.98, y0 + sy * R * 0.75, z + sz * R * 0.98, R * 0.17, groove ? hsl(hue, 55, 66) : hsl(hue + 12, 50, 50));
  }
};

// tube coral cluster
const tubes = (x: number, z: number, hue: number): void => {
  for (let i = 0; i < 10; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 1.0;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const r = rr(0.15, 0.28);
    const h = rr(0.8, 2.3);
    const y = H(px, pz) - 0.1;
    tube(px, y, pz, r, h, hsl(hue + rr(-8, 8), 85, 55));
    tube(px, y + h - 0.02, pz, r * 0.7, 0.06, hsl(hue - 20, 60, 18));
  }
};

// fan coral: lattice of ribs and rings in a vertical plane
const fan = (x: number, z: number, yaw: number, hue: number, R: number): void => {
  const y0 = H(x, z);
  const put = (u: number, v: number, r: number, color: string): void => {
    ball(x + u * Math.cos(yaw), y0 + v, z - u * Math.sin(yaw), r, color);
  };
  tube(x, y0 - 0.1, z, 0.12, 0.5, hsl(hue, 40, 30));
  for (let k = 0; k < 9; k += 1) {
    const a = ((k - 4) / 4) * 1.0;
    for (let rad = 0.35; rad <= R; rad += 0.26) {
      put(rad * Math.sin(a), 0.4 + rad * Math.cos(a), 0.09, hsl(hue, 65, 45));
    }
  }
  for (const rad of [R * 0.4, R * 0.7, R]) {
    for (let a = -1.0; a <= 1.0; a += 0.09) {
      put(rad * Math.sin(a), 0.4 + rad * Math.cos(a), 0.07, hsl(hue + 10, 70, 62));
    }
  }
};

// table coral
const table = (x: number, z: number, R: number, hue: number): void => {
  const y0 = H(x, z);
  tube(x, y0 - 0.1, z, 0.3, 1.2, hsl(hue, 40, 35));
  cylT.push({ position: [x, y0 + 1.25, z], scale: [2 * R, 0.25, 2 * R] });
  cylC.push(hsl(hue, 60, 52));
  cylT.push({ position: [x, y0 + 1.1, z], scale: [1.6 * R, 0.2, 1.6 * R] });
  cylC.push(hsl(hue, 50, 38));
};

branching(-4.2, -2.4, 12, 1.1);
branching(3.4, -4.6, 335, 1.0);
branching(-1.5, 5.4, 48, 1.15);
branching(6.4, 3.2, 280, 0.9);
branching(-7.5, 3.5, 20, 0.85);
brain(0.3, 0.2, 2.0, 38);
brain(-5.8, 0.8, 1.4, 105);
brain(5.2, -0.8, 1.2, 8);
brain(2.4, 6.2, 1.1, 190);
tubes(-7.5, -5.5, 52);
tubes(7.2, -6.2, 200);
tubes(0.8, -7.2, 320);
fan(-3.0, -6.4, 0.3, 300, 2.2);
fan(2.0, 3.6, 2.0, 350, 2.0);
fan(8.6, 0.6, 1.2, 320, 1.9);
fan(-8.5, -0.8, 5.0, 10, 1.8);
table(-9.5, 5.5, 2.2, 60);
table(5.5, 8.4, 1.8, 170);

// rocks around the base
for (let i = 0; i < 28; i += 1) {
  const a = rand() * Math.PI * 2;
  const d = rr(8, 14);
  const s = rr(0.8, 2.4);
  const x = Math.cos(a) * d;
  const z = Math.sin(a) * d;
  ballT.push({ position: [x, H(x, z) + s * 0.1, z], scale: [s * 1.3, s * 0.7, s] });
  ballC.push(hsl(rr(190, 220), 8, rr(25, 38)));
}

// ---------- swaying strands (seaweed + anemone tentacles) ----------
interface Strand {
  x: number;
  y0: number;
  z: number;
  h: number;
  segs: number;
  r: number;
  phase: number;
  amp: number;
}
const strands: Strand[] = [];
const strandColors: string[] = [];

for (let i = 0; i < 70; i += 1) {
  const a = rand() * Math.PI * 2;
  const d = rr(4, 22);
  const x = Math.cos(a) * d;
  const z = Math.sin(a) * d;
  const segs = 6;
  const hue = rr(95, 150);
  strands.push({ x, z, y0: H(x, z) - 0.1, h: rr(2, 4.6), segs, r: rr(0.1, 0.17), phase: rand() * 6.28, amp: rr(0.1, 0.18) });
  for (let s = 0; s < segs; s += 1) strandColors.push(hsl(hue, 60, 28 + (s / segs) * 18));
}
const anemoneSpots: [number, number][] = [
  [-2.2, 2.6],
  [3.2, 1.8],
  [-3.5, -5],
  [6.8, -3.2],
  [-0.8, -3.8],
  [1.5, 8.4]
];
anemoneSpots.forEach(([ax, az], k) => {
  const hue = k % 2 === 0 ? 325 : 275;
  tube(ax, H(ax, az) - 0.1, az, 0.45, 0.35, hsl(hue, 45, 30));
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const d = rr(0.12, 0.38);
    const x = ax + Math.cos(a) * d;
    const z = az + Math.sin(a) * d;
    const segs = 3;
    strands.push({ x, z, y0: H(ax, az) + 0.2, h: rr(0.7, 1.1), segs, r: 0.07, phase: rand() * 6.28, amp: 0.2 });
    for (let s = 0; s < segs; s += 1) strandColors.push(hsl(hue + 8 * s, 80, 52 + s * 9));
  }
});

const swayTransforms = (t: number): AuraTransformSpec[] => {
  const out: AuraTransformSpec[] = [];
  for (const s of strands) {
    for (let j = 0; j < s.segs; j += 1) {
      const hf = (j + 0.5) / s.segs;
      const ox = Math.sin(t * 1.1 + s.phase + hf * 2.0) * s.amp * hf * s.h;
      const oz = Math.cos(t * 0.8 + s.phase * 1.3 + hf * 1.7) * s.amp * hf * s.h * 0.7;
      const w = 2 * s.r * (1 - 0.35 * hf);
      out.push({ position: [s.x + ox, s.y0 + hf * s.h, s.z + oz], scale: [w, (s.h / s.segs) * 1.5, w] });
    }
  }
  return out;
};

// ---------- fish ----------
const SCHOOL = 40;
interface SchoolFish {
  a: number;
  b: number;
  c: number;
  sp: number;
  rad: number;
  sz: number;
}
const school: SchoolFish[] = [];
const schoolColors: string[] = [];
for (let i = 0; i < SCHOOL; i += 1) {
  school.push({ a: rand() * 6.28, b: rand() * 6.28, c: rand() * 6.28, sp: rr(0.8, 1.3), rad: rr(1.0, 3.0), sz: rr(0.85, 1.15) });
  schoolColors.push(hsl(rr(30, 48), 95, rr(52, 62)));
}
const schoolCentre = (t: number): V3 => [15 * Math.cos(t * 0.17 + 1), 4.2 + 1.3 * Math.sin(t * 0.31), 11 * Math.sin(t * 0.22 + 1)];
const schoolPos = (f: SchoolFish, t: number): V3 => {
  const c = schoolCentre(t);
  return [
    c[0] + Math.sin(t * 0.7 * f.sp + f.a) * f.rad,
    c[1] + Math.sin(t * 0.9 * f.sp + f.b) * f.rad * 0.35,
    c[2] + Math.cos(t * 0.6 * f.sp + f.c) * f.rad
  ];
};

interface BigFish {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  w: number;
  ph: number;
  y: number;
  sz: number;
}
const bigFish: BigFish[] = [
  { cx: 0, cz: 0, rx: 18, rz: 14, w: 0.2, ph: 0, y: 3.4, sz: 1.2 },
  { cx: -3, cz: 2, rx: 12, rz: 17, w: -0.15, ph: 2, y: 5.6, sz: 1.5 },
  { cx: 3, cz: -3, rx: 15, rz: 12, w: 0.27, ph: 4, y: 2.6, sz: 1.0 }
];
const bigColors = ["#ff6a3d", "#4a7dff", "#f2e04a"];
const bigPos = (f: BigFish, t: number): V3 => [
  f.cx + f.rx * Math.cos(t * f.w + f.ph),
  f.y + 0.7 * Math.sin(t * 0.5 + f.ph * 2),
  f.cz + f.rz * Math.sin(t * f.w + f.ph)
];

const yawOf = (a: V3, b: V3): number => Math.atan2(b[0] - a[0], b[2] - a[2]);

const fishFrame = (t: number) => {
  const bodies: AuraTransformSpec[] = [];
  const tails: AuraTransformSpec[] = [];
  for (const f of school) {
    const p = schoolPos(f, t);
    const yaw = yawOf(p, schoolPos(f, t + 0.1));
    const s = f.sz;
    bodies.push({ position: p, rotation: [0, yaw, 0], scale: [0.14 * s, 0.22 * s, 0.5 * s] });
    const wag = 0.5 * Math.sin(t * 11 * f.sp + f.a);
    const ty = yaw + wag;
    tails.push({
      position: [p[0] - Math.sin(yaw) * 0.3 * s, p[1], p[2] - Math.cos(yaw) * 0.3 * s - 0],
      rotation: [0, ty, 0],
      scale: [0.03 * s, 0.2 * s, 0.14 * s]
    });
  }
  const bBodies: AuraTransformSpec[] = [];
  const bTails: AuraTransformSpec[] = [];
  const bFins: AuraTransformSpec[] = [];
  for (const f of bigFish) {
    const p = bigPos(f, t);
    const yaw = yawOf(p, bigPos(f, t + 0.1));
    const s = f.sz;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    bBodies.push({ position: p, rotation: [0, yaw, 0], scale: [0.4 * s, 0.7 * s, 1.5 * s] });
    bTails.push({
      position: [p[0] - fx * 0.95 * s, p[1], p[2] - fz * 0.95 * s],
      rotation: [0, yaw + 0.4 * Math.sin(t * 5 + f.ph), 0],
      scale: [0.06 * s, 0.6 * s, 0.5 * s]
    });
    bFins.push({
      position: [p[0] - fx * 0.1 * s, p[1] + 0.45 * s, p[2] - fz * 0.1 * s],
      rotation: [0, yaw, 0],
      scale: [0.05 * s, 0.4 * s, 0.7 * s]
    });
  }
  return { bodies, tails, bBodies, bTails, bFins };
};

// ---------- bubbles and plankton ----------
const vents: [number, number][] = [
  [-1.5, 1.2],
  [4, -2.5],
  [-6, -3]
];
const BUBBLES = 36;
const bubbles = Array.from({ length: BUBBLES }, (_, i) => ({
  v: i % vents.length,
  ph: rand(),
  sp: rr(0.6, 1.2),
  wob: rand() * 6.28
}));
const bubbleTransforms = (t: number): AuraTransformSpec[] =>
  bubbles.map((b) => {
    const [vx, vz] = vents[b.v] ?? [0, 0];
    const rise = (b.ph * 14 + b.sp * t) % 14;
    const s = 0.08 + rise * 0.01;
    return {
      position: [vx + Math.sin(rise * 1.3 + b.wob) * 0.18, H(vx, vz) + 0.8 + rise, vz + Math.cos(rise * 1.1 + b.wob) * 0.18],
      scale: [s, s, s]
    };
  });

const MOTES = 90;
const motes = Array.from({ length: MOTES }, () => ({
  x: rr(-26, 26),
  y: rr(0.5, 10),
  z: rr(-26, 26),
  ph: rand() * 6.28,
  sp: rr(0.1, 0.3)
}));
const moteTransforms = (t: number): AuraTransformSpec[] =>
  motes.map((m) => ({
    position: [m.x + Math.sin(t * m.sp + m.ph) * 1.2, ((m.y + t * 0.12 * (0.5 + m.sp * 2)) % 10) + 0.3, m.z + Math.cos(t * m.sp * 0.8 + m.ph) * 1.2],
    scale: [0.05, 0.05, 0.05]
  }));

// ---------- scene ----------
const white = material.pbr({ color: "#ffffff", roughness: 0.7 });
const fishMat = material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.15 });

let sc = scene({ background: WATER })
  .camera(camera.orbit({ position: [24, 4.4, 0], target: [0, 2.2, 0], fov: 50, near: 0.3, far: 300, autoRotate: 0.15 }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#7fe3d6", groundColor: "#1d5a66", intensity: 1.0 }))
  .add(lights.directional({ name: "sun", position: [10, 40, 6], target: [0, 0, 0], intensity: 3, color: "#d8fff1", shadow: true }))
  .add(effects.fog({ color: WATER, density: 0.028 }))
  .add(
    geometry
      .custom(
        geometry.define({
          positions: sandPos,
          normals: sandNor,
          indices: sandIdx,
          bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 3, SIZE / 2] }
        }),
        { name: "sand", material: sandMaterial, castShadow: false }
      )
      .runtime({ id: "sand", mutable: true })
  )
  .add(instances.sphere({ name: "coral-balls", transforms: ballT, colors: ballC, material: white, params: { widthSegments: 10, heightSegments: 8 } }))
  .add(instances.cylinder({ name: "coral-tubes", transforms: cylT, colors: cylC, material: white, params: { radialSegments: 12 } }))
  .add(instances.sphere({ name: "sway", transforms: swayTransforms(0), colors: strandColors, material: white, params: { widthSegments: 8, heightSegments: 6 } }).runtime({ id: "sway", mutable: true }))
  .add(instances.sphere({ name: "school-bodies", transforms: fishFrame(0).bodies, colors: schoolColors, material: fishMat, params: { widthSegments: 10, heightSegments: 8 } }).runtime({ id: "school-bodies", mutable: true }))
  .add(instances.box({ name: "school-tails", transforms: fishFrame(0).tails, colors: schoolColors, material: fishMat }).runtime({ id: "school-tails", mutable: true }))
  .add(instances.sphere({ name: "big-bodies", transforms: fishFrame(0).bBodies, colors: bigColors, material: fishMat, params: { widthSegments: 14, heightSegments: 10 } }).runtime({ id: "big-bodies", mutable: true }))
  .add(instances.box({ name: "big-tails", transforms: fishFrame(0).bTails, colors: bigColors, material: fishMat }).runtime({ id: "big-tails", mutable: true }))
  .add(instances.box({ name: "big-fins", transforms: fishFrame(0).bFins, colors: bigColors, material: fishMat }).runtime({ id: "big-fins", mutable: true }))
  .add(
    instances
      .sphere({
        name: "bubbles",
        transforms: bubbleTransforms(0),
        material: material.pbr({ color: "#e6ffff", roughness: 0.05, opacity: 0.55 }),
        castShadow: false
      })
      .runtime({ id: "bubbles", mutable: true })
  )
  .add(
    instances
      .sphere({
        name: "motes",
        transforms: moteTransforms(0),
        material: material.emissive({ color: "#bff5ea", emissive: "#bff5ea", emissiveIntensity: 0.6 }),
        castShadow: false
      })
      .runtime({ id: "motes", mutable: true })
  );

// light shafts from the surface
for (let i = 0; i < 7; i += 1) {
  const a = (i / 7) * Math.PI * 2 + 0.4;
  const d = rr(6, 16);
  sc = sc.add(
    primitives
      .box({ name: `shaft${i}`, size: [rr(4, 7), 24, 0.02], material: shaftMaterial, castShadow: false, receiveShadow: false })
      .position(Math.cos(a) * d, 11.8, Math.sin(a) * d)
      .rotate(0, rr(0, 3.14), 0.1)
      .runtime({ id: `shaft${i}`, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: sc });

// camera: slow orbit around the reef centre with a gentle bob
let tAll = 0;
app.camera?.use({
  id: "reef-orbit",
  continuous: true,
  update: () => {
    const ang = tAll * 0.15;
    const R = 24 + 1.2 * Math.sin(tAll * 0.13);
    return {
      position: [Math.cos(ang) * R, 4.4 + 0.45 * Math.sin(tAll * 0.55), Math.sin(ang) * R],
      target: [0, 2.2 + 0.12 * Math.sin(tAll * 0.55 + 1), 0],
      up: [0, 1, 0],
      roll: 0,
      fov: 50,
      near: 0.3,
      far: 300
    };
  }
});

app.onFrame((f) => {
  tAll += f.dt;
  const t = tAll;
  app.nodes.require("sand").setUniform?.("clk", t);
  for (let i = 0; i < 7; i += 1) app.nodes.require(`shaft${i}`).setUniform?.("clk", t + i * 3);
  const fr = fishFrame(t);
  app.nodes.require("sway").setInstances(swayTransforms(t), strandColors);
  app.nodes.require("school-bodies").setInstances(fr.bodies, schoolColors);
  app.nodes.require("school-tails").setInstances(fr.tails, schoolColors);
  app.nodes.require("big-bodies").setInstances(fr.bBodies, bigColors);
  app.nodes.require("big-tails").setInstances(fr.bTails, bigColors);
  app.nodes.require("big-fins").setInstances(fr.bFins, bigColors);
  app.nodes.require("bubbles").setInstances(bubbleTransforms(t));
  app.nodes.require("motes").setInstances(moteTransforms(t));
});

await app.ready();
window.__EVAL_READY__ = true;
