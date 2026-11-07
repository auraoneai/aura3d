import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

type V3 = [number, number, number];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length] as T;
const lit = (n: number): string => n.toFixed(3);

/** Sand dune height: the same formula runs in the sand vertex shader. */
const duneH = (x: number, z: number): number =>
  0.22 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) + 0.1 * Math.sin(x * 0.43 - z * 0.31);

/** Euler rotation that points a unit cylinder's +Y axis along (dx, dy, dz) (engine default Rz*Ry*Rx order). */
const orient = (dx: number, dy: number, dz: number): V3 => {
  const l = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const uz = dz / l;
  return [Math.asin(Math.max(-1, Math.min(1, uz))), 0, Math.atan2(-ux, uy)];
};

interface Bucket {
  t: AuraTransformSpec[];
  c: string[];
}
const bucket = (): Bucket => ({ t: [], c: [] });

const add3 = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---------------------------------------------------------------------------------------------
// Reef layout
// ---------------------------------------------------------------------------------------------
interface Spot {
  x: number;
  z: number;
  r: number;
}
const spots: Spot[] = [];
const placeSpot = (rMin: number, rMax: number, radius: number, spacing: number): Spot | undefined => {
  for (let tries = 0; tries < 400; tries += 1) {
    const a = rand() * Math.PI * 2;
    const rr = rMin + (rMax - rMin) * Math.sqrt(rand());
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (spots.every((s) => Math.hypot(s.x - x, s.z - z) > (s.r + radius) * spacing)) {
      const spot = { x, z, r: radius };
      spots.push(spot);
      return spot;
    }
  }
  return undefined;
};

const rocks = bucket();
const branchCyl = bucket();
const branchTips = bucket();
const domes = bucket();
const bumps = bucket();
const fanDisc = bucket();
const fanRibs = bucket();
const tubes = bucket();
const tubeHoles = bucket();
const anemoneBase = bucket();
const footprints: Spot[] = [];

// Rocks first so that corals avoid them.
for (let i = 0; i < 9; i += 1) {
  const sx = between(0.9, 1.6);
  const sy = between(0.5, 0.9);
  const sz = between(0.8, 1.5);
  const spot = placeSpot(0.5, 5.6, Math.max(sx, sz) * 0.55, 0.9);
  if (!spot) continue;
  rocks.t.push({ position: [spot.x, duneH(spot.x, spot.z) + sy * 0.28, spot.z], rotation: [0, rand() * 6, 0], scale: [sx, sy, sz] });
  rocks.c.push(pick(["#4c6b69", "#566f6a", "#44605f", "#5d7770"]));
  footprints.push({ x: spot.x, z: spot.z, r: Math.max(sx, sz) * 0.7 });
}

const branchColors = ["#ff6b8b", "#ff9d4d", "#b27be0", "#f0d85a", "#ff7f6a", "#4fd1c0"];
const tipColors = ["#ffd3de", "#ffe4c4", "#e6d2fb", "#fff6bd", "#ffd8cf", "#c8fff6"];

function branch(p: V3, d: V3, len: number, rad: number, depth: number, col: string, tipCol: string): void {
  const e = add3(p, d, len);
  branchCyl.t.push({
    position: [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2, (p[2] + e[2]) / 2],
    rotation: orient(d[0], d[1], d[2]),
    scale: [rad * 2, len, rad * 2]
  });
  branchCyl.c.push(col);
  if (depth === 0) {
    branchTips.t.push({ position: e, scale: rad * 2.8 });
    branchTips.c.push(tipCol);
    return;
  }
  const n = depth === 3 ? 3 : rand() < 0.5 ? 2 : 3;
  const helper: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm3(cross3(d, helper));
  const v = cross3(d, u);
  const phase = rand() * 6.28;
  for (let k = 0; k < n; k += 1) {
    const az = phase + (k / n) * Math.PI * 2 + between(-0.3, 0.3);
    const tilt = between(0.4, 0.75);
    const side: V3 = [u[0] * Math.cos(az) + v[0] * Math.sin(az), u[1] * Math.cos(az) + v[1] * Math.sin(az), u[2] * Math.cos(az) + v[2] * Math.sin(az)];
    const nd = norm3([
      d[0] * Math.cos(tilt) + side[0] * Math.sin(tilt),
      d[1] * Math.cos(tilt) + side[1] * Math.sin(tilt) + 0.22,
      d[2] * Math.cos(tilt) + side[2] * Math.sin(tilt)
    ]);
    branch(e, nd, len * 0.74, rad * 0.72, depth - 1, col, tipCol);
  }
}

const kinds: Array<"branch" | "brain" | "fan" | "tube"> = [
  "branch", "branch", "branch", "branch", "branch", "branch",
  "brain", "brain", "brain", "brain", "brain",
  "fan", "fan", "fan",
  "tube", "tube", "tube", "tube"
];
for (const kind of kinds) {
  const radius = kind === "branch" ? 0.8 : kind === "brain" ? 0.65 : kind === "fan" ? 0.7 : 0.6;
  const spot = placeSpot(0.2, 5.4, radius, 1.0);
  if (!spot) continue;
  const base = duneH(spot.x, spot.z) - 0.05;
  footprints.push({ x: spot.x, z: spot.z, r: radius * 0.9 });
  if (kind === "branch") {
    const ci = Math.floor(rand() * branchColors.length);
    const s = between(0.85, 1.3);
    branch([spot.x, base, spot.z], norm3([between(-0.15, 0.15), 1, between(-0.15, 0.15)]), 0.5 * s, 0.075 * s, 3, branchColors[ci] ?? "#ff6b8b", tipColors[ci] ?? "#ffffff");
  } else if (kind === "brain") {
    const R = between(0.5, 0.8);
    const col = pick(["#a8c46a", "#d98f5c", "#c46b8f", "#8fb8a0", "#e0c070"]);
    domes.t.push({ position: [spot.x, base + R * 0.3, spot.z], scale: [R * 2, R * 1.3, R * 2] });
    domes.c.push(col);
    for (let i = 0; i < 34; i += 1) {
      const az = rand() * Math.PI * 2;
      const el = between(0.1, 1.35);
      bumps.t.push({
        position: [spot.x + R * Math.cos(el) * Math.cos(az), base + R * 0.3 + R * 0.65 * Math.sin(el), spot.z + R * Math.cos(el) * Math.sin(az)],
        scale: [R * between(0.26, 0.4), R * 0.2, R * between(0.26, 0.4)]
      });
      bumps.c.push(pick(["#ffffff", "#f3e6c0", "#d9ecd0", "#ffd9c4"]));
    }
  } else if (kind === "fan") {
    const psi = rand() * Math.PI;
    const len = between(1.0, 1.5);
    const pair = pick([["#8e2f6a", "#ff8fb0"], ["#a3321f", "#ffb36b"], ["#5b3aa8", "#d8b4ff"]] as const);
    fanDisc.t.push({ position: [spot.x, base + len * 0.5, spot.z], rotation: [0, -psi, 0], scale: [len * 1.5, len, 0.035] });
    fanDisc.c.push(pair[0]);
    const ribCount = 13;
    for (let i = 0; i < ribCount; i += 1) {
      const a = (-0.95 + (1.9 * i) / (ribCount - 1));
      const d: V3 = [Math.sin(a) * Math.cos(psi), Math.cos(a), Math.sin(a) * Math.sin(psi)];
      const l = len * 0.97;
      fanRibs.t.push({
        position: [spot.x + d[0] * l * 0.5, base + 0.04 + d[1] * l * 0.5, spot.z + d[2] * l * 0.5],
        rotation: orient(d[0], d[1], d[2]),
        scale: [0.065, l, 0.065]
      });
      fanRibs.c.push(pair[1]);
    }
  } else {
    const col = pick(["#f2c230", "#7e5cc9", "#2f9fd8", "#ff7fa8"]);
    const count = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const off = between(0.05, 0.4);
      const x = spot.x + Math.cos(a) * off;
      const z = spot.z + Math.sin(a) * off;
      const h = between(0.5, 1.3);
      const r = between(0.08, 0.14);
      const d = norm3([between(-0.18, 0.18), 1, between(-0.18, 0.18)]);
      const b0: V3 = [x, duneH(x, z) - 0.05, z];
      const rot = orient(d[0], d[1], d[2]);
      tubes.t.push({ position: add3(b0, d, h / 2), rotation: rot, scale: [r * 2, h, r * 2] });
      tubes.c.push(col);
      tubeHoles.t.push({ position: add3(b0, d, h), rotation: rot, scale: [r * 1.55, r * 0.5, r * 1.55] });
      tubeHoles.c.push("#241638");
    }
  }
}

// Anemones sit in the gaps between corals.
interface Anemone {
  x: number;
  y: number;
  z: number;
  tentacles: number;
  phase: number;
  hue: string;
  tip: string;
}
const anemones: Anemone[] = [];
for (let i = 0; i < 6; i += 1) {
  const spot = placeSpot(0.3, 5.2, 0.4, 1.0);
  if (!spot) continue;
  const y = duneH(spot.x, spot.z) - 0.02;
  const [hue, tip] = pick([["#d83a8f", "#ffd1ec"], ["#e87a2a", "#fff0a0"], ["#7a4fd0", "#b8ffcf"]] as const);
  anemones.push({ x: spot.x, y, z: spot.z, tentacles: 18, phase: rand() * 6.28, hue, tip });
  anemoneBase.t.push({ position: [spot.x, y + 0.1, spot.z], scale: [0.5, 0.26, 0.5] });
  anemoneBase.c.push("#6e3a63");
  footprints.push({ x: spot.x, z: spot.z, r: 0.45 });
}

// ---------------------------------------------------------------------------------------------
// Swaying seaweed (dynamic instance transforms)
// ---------------------------------------------------------------------------------------------
interface Strand {
  x: number;
  y: number;
  z: number;
  height: number;
  az: number;
  lean: number;
  phase: number;
}
const strands: Strand[] = [];
const SEG = 6;
const weedColors: string[] = [];
const weedPalette = ["#2f9e4a", "#5fbf3a", "#a6b82e", "#1f8a5e"];
for (let i = 0; i < 30; i += 1) {
  const a = rand() * Math.PI * 2;
  const rr = between(1.2, 6.5);
  const x = Math.cos(a) * rr;
  const z = Math.sin(a) * rr;
  if (footprints.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 0.15)) continue;
  strands.push({ x, y: duneH(x, z) - 0.05, z, height: between(1.0, 2.3), az: rand() * 6.28, lean: between(0.05, 0.22), phase: rand() * 6.28 });
  const col = pick(weedPalette);
  for (let k = 0; k < SEG; k += 1) weedColors.push(col);
}

function weedTransforms(t: number): AuraTransformSpec[] {
  const out: AuraTransformSpec[] = [];
  for (const s of strands) {
    let p: V3 = [s.x, s.y, s.z];
    const L = s.height / SEG;
    for (let k = 0; k < SEG; k += 1) {
      const sway = 0.2 * Math.sin(t * 0.95 + s.phase + k * 0.65) * (0.45 + 0.2 * k);
      const tilt = s.lean * (0.5 + k * 0.25) + sway;
      const az = s.az + 0.5 * Math.sin(t * 0.55 + s.phase * 1.3 + k * 0.4);
      const d: V3 = [Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)];
      const e = add3(p, d, L);
      const w = 0.1 * (1 - k * 0.1);
      out.push({ position: [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2, (p[2] + e[2]) / 2], rotation: orient(d[0], d[1], d[2]), scale: [w, L * 1.06, w * 0.55] });
      p = e;
    }
  }
  return out;
}

const tentacleColors: string[] = [];
const tentacleTipColors: string[] = [];
for (const a of anemones) {
  for (let k = 0; k < a.tentacles; k += 1) {
    tentacleColors.push(a.hue);
    tentacleTipColors.push(a.tip);
  }
}
function tentacleTransforms(t: number): { body: AuraTransformSpec[]; tips: AuraTransformSpec[] } {
  const body: AuraTransformSpec[] = [];
  const tips: AuraTransformSpec[] = [];
  for (const a of anemones) {
    for (let k = 0; k < a.tentacles; k += 1) {
      const ang = (k / a.tentacles) * Math.PI * 2 + a.phase;
      const ring = k % 2 === 0 ? 0.16 : 0.08;
      const tilt = (k % 2 === 0 ? 0.6 : 0.3) + 0.2 * Math.sin(t * 1.6 + a.phase + k * 1.3);
      const az = ang + 0.25 * Math.sin(t * 0.9 + k);
      const d: V3 = [Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)];
      const b: V3 = [a.x + Math.cos(ang) * ring, a.y + 0.2, a.z + Math.sin(ang) * ring];
      const len = 0.4;
      const e = add3(b, d, len);
      body.push({ position: [(b[0] + e[0]) / 2, (b[1] + e[1]) / 2, (b[2] + e[2]) / 2], rotation: orient(d[0], d[1], d[2]), scale: [0.055, len, 0.055] });
      tips.push({ position: e, scale: 0.095 });
    }
  }
  return { body, tips };
}

// ---------------------------------------------------------------------------------------------
// Sand: rippled dunes with animated caustics (custom shader)
// ---------------------------------------------------------------------------------------------
const SAND_CELLS = 140;
const SAND_SIZE = 120;
const sandPositions = new Float32Array((SAND_CELLS + 1) ** 2 * 3);
const sandNormals = new Float32Array(sandPositions.length);
const sandIndices: number[] = [];
for (let j = 0; j <= SAND_CELLS; j += 1) {
  for (let i = 0; i <= SAND_CELLS; i += 1) {
    const v = j * (SAND_CELLS + 1) + i;
    const x = (i / SAND_CELLS - 0.5) * SAND_SIZE;
    const z = (j / SAND_CELLS - 0.5) * SAND_SIZE;
    sandPositions.set([x, duneH(x, z), z], v * 3);
    sandNormals[v * 3 + 1] = 1;
    if (i < SAND_CELLS && j < SAND_CELLS) sandIndices.push(v, v + SAND_CELLS + 1, v + 1, v + 1, v + SAND_CELLS + 1, v + SAND_CELLS + 2);
  }
}

const occlusionCode = footprints
  .map((f) => {
    const cx = lit(f.x - 0.3);
    const cz = lit(f.z - 0.2);
    const rr = lit(f.r * f.r * 1.4);
    return `  { vec2 q = p - vec2(${cx}, ${cz}); occ *= 1.0 - 0.55 * exp(-dot(q, q) / ${rr}); }`;
  })
  .join("\n");

const sandMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
float dune(vec2 p) {
  return 0.22 * sin(p.x * 0.21 + 1.3) * cos(p.y * 0.17) + 0.1 * sin(p.x * 0.43 - p.y * 0.31);
}
void main() {
  vec3 p = position;
  p.y = dune(p.xz);
  vWorld = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;

vec2 duneGrad(vec2 p) {
  float gx = 0.22 * 0.21 * cos(p.x * 0.21 + 1.3) * cos(p.y * 0.17) + 0.1 * 0.43 * cos(p.x * 0.43 - p.y * 0.31);
  float gz = -0.22 * 0.17 * sin(p.x * 0.21 + 1.3) * sin(p.y * 0.17) - 0.1 * 0.31 * cos(p.x * 0.43 - p.y * 0.31);
  return vec2(gx, gz);
}

// Iterated sine warp: the classic tiling water-caustic network.
float caust(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    float sx = max(abs(sin(i.x + tt)), 0.001) / inten;
    float sy = max(abs(cos(i.y + tt)), 0.001) / inten;
    c += 1.0 / (length(vec2(p.x / sx, p.y / sy)) + 0.0001);
  }
  c /= 5.0;
  c = 1.17 - pow(max(c, 0.0001), 1.4);
  return pow(abs(c), 8.0);
}

void main() {
  vec2 p = vWorld.xz;
  vec2 g = duneGrad(p);

  // Sand ripples: wavy parallel ridges plus a finer cross pattern.
  vec2 rd = vec2(0.8, 0.6);
  float ph = dot(p, rd) * 7.0 + 1.6 * sin(p.x * 0.35) + 1.2 * sin(p.y * 0.27);
  vec2 gp = rd * 7.0 + vec2(0.56 * cos(p.x * 0.35), 0.324 * cos(p.y * 0.27));
  vec2 slope = g + 0.05 * cos(ph) * gp;
  float ph2 = dot(p, vec2(-0.5, 0.87)) * 17.0 + 2.0 * sin(p.x * 0.8);
  slope += 0.012 * cos(ph2) * vec2(-8.5, 14.79);

  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 L = normalize(vec3(0.22, 0.95, 0.16));
  float ndl = clamp(dot(n, L), 0.0, 1.0);

  float rip = 0.5 + 0.5 * sin(ph);
  vec3 sand = mix(vec3(0.58, 0.45, 0.25), vec3(0.78, 0.64, 0.38), rip);
  sand *= 0.93 + 0.14 * sin(p.x * 1.7) * sin(p.y * 1.3);

  float occ = 1.0;
${occlusionCode}
  occ = clamp(occ, 0.25, 1.0);

  float cc = caust(p * 1.2 - vec2(250.0), tClock * 0.5 + 23.0)
           + 0.6 * caust(p * 0.7 + vec2(-120.0, -90.0), tClock * 0.37 + 5.0);
  cc = min(cc, 3.0);

  vec3 tint = vec3(0.62, 1.0, 0.95);
  float light = ((0.3 + 0.75 * ndl) + 1.1 * cc * ndl) * occ;
  outColor = vec4(sand * tint * light, 1.0);
}`
  },
  uniforms: { tClock: { type: "f32", value: 0 } },
  fog: true
});

// ---------------------------------------------------------------------------------------------
// Light shafts (additive custom shader on tall cylinders)
// ---------------------------------------------------------------------------------------------
const shaftMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vW;
out vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vW;
in vec3 vN;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN + vec3(0.0, 0.00001, 0.0));
  vec3 v = normalize(cameraPosition - vW + vec3(0.00001));
  float e = clamp(abs(dot(n, v)), 0.0, 1.0);
  float cap = 1.0 - smoothstep(0.75, 0.95, abs(n.y));
  float h = clamp(vW.y / 14.0, 0.0, 1.0);
  float flick = 0.65 + 0.35 * sin(shaftClock * 0.6 + vW.x * 0.35 + vW.z * 0.2);
  float a = e * e * cap * (0.2 + 0.8 * h) * flick * 0.11;
  outColor = vec4(vec3(0.35, 0.95, 0.85) * a, 1.0);
}`
  },
  uniforms: { shaftClock: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

// ---------------------------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------------------------
const fishMat = (color: string) => material.pbr({ color, roughness: 0.4, metallic: 0.15, emissive: color, emissiveIntensity: 0.2 });

function fishBuilder(id: string, len: number, tall: number, body: ReturnType<typeof fishMat>, fin: ReturnType<typeof fishMat>, start: V3, yaw: number, dorsal: boolean) {
  const parts = [
    primitives.sphere({ name: `${id}-body`, size: [len * 0.26, len * 0.5 * tall, len], material: body, castShadow: false }),
    group(
      `${id}-tailg`,
      [primitives.sphere({ name: `${id}-tail`, size: [len * 0.05, len * 0.4 * tall, len * 0.28], material: fin, castShadow: false }).position(0, 0, -len * 0.12)],
      { position: [0, 0, -len * 0.45] }
    ).runtime({ id: `${id}-t`, mutable: true })
  ];
  if (dorsal) {
    parts.push(primitives.sphere({ name: `${id}-dorsal`, size: [len * 0.04, len * 0.22 * tall, len * 0.36], material: fin, castShadow: false }).position(0, len * 0.25 * tall, -len * 0.05));
  }
  return group(id, parts, { position: start, rotation: [0, yaw, 0] }).runtime({ id, mutable: true });
}

interface Swimmer {
  id: string;
  pos: (t: number) => V3;
  tailRate: number;
  tailPhase: number;
}

const swimmers: Swimmer[] = [];
const fishNodes: ReturnType<typeof fishBuilder>[] = [];

interface Center {
  (t: number): V3;
}
const schoolCenterA: Center = (t) => {
  const a = 0.19 * t;
  const R = 4.6 + 1.1 * Math.sin(0.07 * t + 1);
  return [R * Math.cos(a), 2.0 + 0.55 * Math.sin(0.23 * t), R * Math.sin(a)];
};
const schoolCenterB: Center = (t) => {
  const a = -0.15 * t + 2.0;
  const R = 3.3 + 0.8 * Math.sin(0.09 * t);
  return [R * Math.cos(a), 1.4 + 0.45 * Math.sin(0.31 * t + 2), R * Math.sin(a)];
};

function addSchool(prefix: string, count: number, center: Center, mats: Array<[ReturnType<typeof fishMat>, ReturnType<typeof fishMat>]>, lenRange: [number, number]): void {
  for (let i = 0; i < count; i += 1) {
    const id = `${prefix}${i}`;
    const ax = between(0.4, 1.6);
    const ay = between(0.15, 0.55);
    const az = between(0.4, 1.6);
    const w1 = between(0.5, 1.1);
    const w2 = between(0.6, 1.4);
    const w3 = between(0.5, 1.1);
    const p1 = rand() * 6.28;
    const p2 = rand() * 6.28;
    const p3 = rand() * 6.28;
    const pos = (t: number): V3 => {
      const c = center(t);
      return [c[0] + ax * Math.sin(w1 * t + p1), Math.max(0.8, c[1] + ay * Math.sin(w2 * t + p2)), c[2] + az * Math.cos(w3 * t + p3)];
    };
    const p0 = pos(0);
    const p1v = pos(0.15);
    const [bodyM, finM] = mats[i % mats.length] ?? mats[0] as [ReturnType<typeof fishMat>, ReturnType<typeof fishMat>];
    fishNodes.push(fishBuilder(id, between(lenRange[0], lenRange[1]), 1, bodyM, finM, p0, Math.atan2(p1v[0] - p0[0], p1v[2] - p0[2]), false));
    swimmers.push({ id, pos, tailRate: between(7, 10), tailPhase: rand() * 6.28 });
  }
}

addSchool("sa", 36, schoolCenterA, [[fishMat("#ffb92e"), fishMat("#ff7d3a")], [fishMat("#ffb92e"), fishMat("#ff7d3a")], [fishMat("#ff8a4a"), fishMat("#ffd166")]], [0.4, 0.55]);
addSchool("sb", 10, schoolCenterB, [[fishMat("#3b8bff"), fishMat("#9ad1ff")]], [0.38, 0.5]);

interface SoloSpec {
  id: string;
  len: number;
  tall: number;
  body: string;
  fin: string;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  w: number;
  y0: number;
  ay: number;
  phase: number;
  dorsal: boolean;
}
const solos: SoloSpec[] = [
  { id: "parrot", len: 1.5, tall: 0.9, body: "#27c4a0", fin: "#2f7fd8", cx: 0.5, cz: 0, rx: 6.6, rz: 5.2, w: 0.22, y0: 1.7, ay: 0.4, phase: 0.5, dorsal: true },
  { id: "tang", len: 1.1, tall: 1.5, body: "#ffe233", fin: "#2a6bd0", cx: -1, cz: 1, rx: 3.9, rz: 4.4, w: -0.28, y0: 2.3, ay: 0.5, phase: 2.2, dorsal: true },
  { id: "grouper", len: 2.0, tall: 0.95, body: "#7a5cc4", fin: "#4b3592", cx: 0, cz: -1, rx: 8.0, rz: 3.8, w: 0.15, y0: 1.2, ay: 0.3, phase: 4.0, dorsal: true },
  { id: "barracuda", len: 2.1, tall: 0.45, body: "#c8d6dc", fin: "#8fa3ad", cx: 0, cz: 0, rx: 8.6, rz: 7.4, w: -0.17, y0: 3.1, ay: 0.6, phase: 1.1, dorsal: false }
];
for (const s of solos) {
  const pos = (t: number): V3 => [
    s.cx + s.rx * Math.cos(s.w * t + s.phase),
    s.y0 + s.ay * Math.sin(1.7 * s.w * t + s.phase * 2),
    s.cz + s.rz * Math.sin(s.w * t + s.phase)
  ];
  const p0 = pos(0);
  const p1 = pos(0.15);
  fishNodes.push(fishBuilder(s.id, s.len, s.tall, fishMat(s.body), fishMat(s.fin), p0, Math.atan2(p1[0] - p0[0], p1[2] - p0[2]), s.dorsal));
  swimmers.push({ id: s.id, pos, tailRate: 3.5, tailPhase: s.phase });
}

// ---------------------------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------------------------
const WATER = "#0d6a7c";
const coralWhite = material.pbr({ color: "#ffffff", roughness: 0.72 });
const rockMat = material.pbr({ color: "#ffffff", roughness: 0.95 });

const stage = scene({ background: WATER })
  .add(environments.neutral({ intensity: 0.55, background: false }))
  .add(lights.hemisphere({ skyColor: "#8fe3e0", groundColor: "#1e6a66", intensity: 0.9 }))
  .add(lights.directional({ name: "sun", position: [6, 22, 4], target: [0, 0, 0], intensity: 3.2, color: "#d6fff2", shadow: true }))
  .add(effects.fog({ color: WATER, density: 0.045 }))
  .add(geometry.custom(
    geometry.define({ positions: sandPositions, normals: sandNormals, indices: sandIndices, bounds: { min: [-SAND_SIZE / 2, -1, -SAND_SIZE / 2], max: [SAND_SIZE / 2, 1, SAND_SIZE / 2] } }),
    { name: "sand", material: sandMaterial, castShadow: false }
  ).runtime({ id: "sand", mutable: true }));

if (rocks.t.length > 0) stage.add(instances.sphere({ name: "rocks", transforms: rocks.t, colors: rocks.c, material: rockMat }));
if (branchCyl.t.length > 0) {
  stage.add(instances.cylinder({ name: "branches", transforms: branchCyl.t, colors: branchCyl.c, material: coralWhite, params: { radialSegments: 8 } }));
  stage.add(instances.sphere({ name: "branch-tips", transforms: branchTips.t, colors: branchTips.c, material: coralWhite }));
}
if (domes.t.length > 0) {
  stage.add(instances.sphere({ name: "brain-domes", transforms: domes.t, colors: domes.c, material: coralWhite }));
  stage.add(instances.sphere({ name: "brain-ridges", transforms: bumps.t, colors: bumps.c, material: coralWhite, castShadow: false }));
}
if (fanDisc.t.length > 0) {
  stage.add(instances.sphere({ name: "fan-discs", transforms: fanDisc.t, colors: fanDisc.c, material: coralWhite }));
  stage.add(instances.cylinder({ name: "fan-ribs", transforms: fanRibs.t, colors: fanRibs.c, material: coralWhite, params: { radialSegments: 6 }, castShadow: false }));
}
if (tubes.t.length > 0) {
  stage.add(instances.cylinder({ name: "tubes", transforms: tubes.t, colors: tubes.c, material: coralWhite, params: { radialSegments: 10 } }));
  stage.add(instances.sphere({ name: "tube-holes", transforms: tubeHoles.t, colors: tubeHoles.c, material: coralWhite, castShadow: false }));
}
if (anemoneBase.t.length > 0) {
  const initial = tentacleTransforms(0);
  stage.add(instances.sphere({ name: "anemone-bases", transforms: anemoneBase.t, colors: anemoneBase.c, material: coralWhite }));
  stage.add(instances.cylinder({ name: "tentacles", transforms: initial.body, colors: tentacleColors, material: coralWhite, params: { radialSegments: 5 }, castShadow: false }).runtime({ id: "tentacles", mutable: true }));
  stage.add(instances.sphere({ name: "tentacle-tips", transforms: initial.tips, colors: tentacleTipColors, material: coralWhite, castShadow: false }).runtime({ id: "tentacle-tips", mutable: true }));
}
if (strands.length > 0) {
  stage.add(instances.cylinder({ name: "seaweed", transforms: weedTransforms(0), colors: weedColors, material: coralWhite, params: { radialSegments: 6 }, castShadow: false }).runtime({ id: "seaweed", mutable: true }));
}

for (const f of fishNodes) stage.add(f);

// Sunbeams.
const SHAFTS = 7;
for (let i = 0; i < SHAFTS; i += 1) {
  const a = (i / SHAFTS) * Math.PI * 2 + 0.4;
  const rr = between(1.5, 7.5);
  const d = between(1.4, 3.0);
  stage.add(
    primitives.cylinder({ name: `shaft-${i}`, size: [d, 20, d], material: shaftMaterial, castShadow: false, receiveShadow: false })
      .position(Math.cos(a) * rr, 8, Math.sin(a) * rr)
      .rotate(0, 0, -0.22)
      .runtime({ id: `shaft-${i}`, mutable: true })
  );
}

// Bubbles and drifting specks.
const bubbleSpots: V3[] = [[-1.5, 0.3, 1.2], [2.2, 0.3, -1.8], [0.4, 0.3, 3.1], [-3.0, 0.3, -2.4], [3.6, 0.3, 2.0], [-0.6, 0.3, -3.6]];
bubbleSpots.forEach((p, i) => {
  stage.add(effects.particles({
    name: `bubbles-${i}`, position: p, rate: 3.5, maxParticles: 40, lifetime: [7, 10], speed: [0.2, 0.35], size: [0.07, 0.15],
    gravity: -0.3, drag: 0.8, sprite: "bubble", blend: "additive", seed: 40 + i, color: "#dffcff", intensity: 0.9,
    noise: { strength: 0.25, frequency: 0.6 }
  }));
});
stage.add(effects.particles({
  name: "plankton", position: [0, 3, 0], shape: "box", shapeSize: [16, 6, 16], rate: 20, maxParticles: 220, lifetime: [9, 14], speed: [0.02, 0.07],
  size: [0.03, 0.06], gravity: 0, drag: 0.3, sprite: "dust-mote", blend: "additive", seed: 77, color: "#bff4e6", intensity: 0.7,
  noise: { strength: 0.1, frequency: 0.3 }
}));

const ORBIT_R = 9;
stage.camera(camera.perspective({ position: [ORBIT_R, 2.8, 0], target: [0, 1.0, 0], fov: 62, near: 0.1, far: 200 }));

const app = createAuraApp("#app", { scene: stage, resize: false });

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

async function main(): Promise<void> {
  try {
    await app.ready();
  } catch (err) {
    console.error(err);
  }

  const handles = swimmers.map((s) => ({ s, body: app.nodes.require(s.id), tail: app.nodes.require(`${s.id}-t`) }));
  const sand = app.nodes.require("sand");
  const shafts = Array.from({ length: SHAFTS }, (_, i) => app.nodes.require(`shaft-${i}`));
  const weed = strands.length > 0 ? app.nodes.require("seaweed") : undefined;
  const tent = anemones.length > 0 ? app.nodes.require("tentacles") : undefined;
  const tentTips = anemones.length > 0 ? app.nodes.require("tentacle-tips") : undefined;

  const start = performance.now();
  app.onFrame(() => {
    const t = (performance.now() - start) / 1000;

    // Camera: slow orbit around the reef centre with a gentle bob.
    const ang = 0.1 * t;
    const radius = ORBIT_R + 0.8 * Math.sin(0.17 * t);
    const height = 2.8 + 0.35 * Math.sin(0.7 * t);
    app.camera?.setPose({
      position: [Math.cos(ang) * radius, height, Math.sin(ang) * radius],
      target: [0, 1.0 + 0.1 * Math.sin(0.7 * t + 1), 0],
      fov: 62
    });

    sand.setUniform?.("tClock", t);
    for (const sh of shafts) sh.setUniform?.("shaftClock", t);

    for (const h of handles) {
      const p0 = h.s.pos(t);
      const p1 = h.s.pos(t + 0.15);
      h.body.setPosition(p0[0], p0[1], p0[2]);
      h.body.setRotation(0, Math.atan2(p1[0] - p0[0], p1[2] - p0[2]), 0);
      h.tail.setRotation(0, 0.5 * Math.sin(t * h.s.tailRate + h.s.tailPhase), 0);
    }

    weed?.setInstances(weedTransforms(t), weedColors);
    if (tent && tentTips) {
      const tr = tentacleTransforms(t);
      tent.setInstances(tr.body, tentacleColors);
      tentTips.setInstances(tr.tips, tentacleTipColors);
    }
  });

  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
}

void main();
