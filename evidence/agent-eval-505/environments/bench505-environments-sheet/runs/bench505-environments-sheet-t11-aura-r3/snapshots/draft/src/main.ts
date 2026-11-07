import { camera, createAuraApp, effects, geometry, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type Kids = NonNullable<Parameters<typeof group>[1]>;
type Kid = Kids[number];

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const makeRand = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

// ---------- colour helpers ----------
const hexRgb = (h: string): V3 => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255
];
const mixRgb = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: V3): string => `rgb(${Math.round(clamp(c[0], 0, 1) * 255)}, ${Math.round(clamp(c[1], 0, 1) * 255)}, ${Math.round(clamp(c[2], 0, 1) * 255)})`;
const HAZE: V3 = hexRgb("#b9a6cf");

// Camera rest position, used to estimate each object's distance for haze.
const CAM_REST: V3 = [0, 22, 40];
const hazeAmount = (x: number, y: number, z: number): number => {
  const d = Math.hypot(x - CAM_REST[0], y - CAM_REST[1], z - CAM_REST[2]);
  return clamp((d - 50) / 330, 0, 0.72);
};

// ---------- islands ----------
interface IslandSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  R: number;
  seed: number;
  bobAmp: number;
  bobSpeed: number;
  phase: number;
}

const ISLANDS: IslandSpec[] = [
  { id: "isle-main", x: 10, y: 12, z: -75, R: 30, seed: 11, bobAmp: 0.9, bobSpeed: 0.45, phase: 0.3 },
  { id: "isle-b", x: -48, y: 24, z: -45, R: 15, seed: 22, bobAmp: 1.2, bobSpeed: 0.62, phase: 1.7 },
  { id: "isle-c", x: 44, y: 31, z: -38, R: 11, seed: 33, bobAmp: 1.0, bobSpeed: 0.8, phase: 3.1 },
  { id: "isle-d", x: -22, y: -4, z: -18, R: 8, seed: 44, bobAmp: 0.8, bobSpeed: 0.9, phase: 4.4 },
  { id: "isle-e", x: -88, y: 36, z: -120, R: 22, seed: 55, bobAmp: 1.4, bobSpeed: 0.38, phase: 2.2 },
  { id: "isle-f", x: 78, y: 20, z: -140, R: 20, seed: 66, bobAmp: 1.3, bobSpeed: 0.52, phase: 5.0 },
  { id: "isle-g", x: -6, y: 50, z: -170, R: 18, seed: 77, bobAmp: 1.5, bobSpeed: 0.7, phase: 0.9 },
  { id: "isle-h", x: 135, y: 46, z: -215, R: 28, seed: 88, bobAmp: 1.8, bobSpeed: 0.33, phase: 3.8 },
  { id: "isle-i", x: -145, y: 6, z: -205, R: 26, seed: 99, bobAmp: 1.6, bobSpeed: 0.41, phase: 5.6 },
  { id: "isle-j", x: 32, y: 62, z: -255, R: 14, seed: 111, bobAmp: 1.1, bobSpeed: 0.58, phase: 2.7 }
];

const matCache = new Map<string, ReturnType<typeof material.pbr>>();
const pbrOf = (color: string, roughness = 0.9) => {
  const key = `p${color}${roughness}`;
  let m = matCache.get(key);
  if (!m) {
    m = material.pbr({ color, roughness });
    matCache.set(key, m);
  }
  return m;
};
const glowCache = new Map<string, ReturnType<typeof material.emissive>>();
const glowOf = (color: string) => {
  let m = glowCache.get(color);
  if (!m) {
    m = material.emissive({ color, emissive: color, emissiveIntensity: 1.3, roughness: 0.3 });
    glowCache.set(color, m);
  }
  return m;
};

const ROCK_TOP = hexRgb("#94705a");
const ROCK_BOT = hexRgb("#4d4766");
const GRASS = [hexRgb("#86b84c"), hexRgb("#74a643"), hexRgb("#97c156")];
const LIP = hexRgb("#6e6a3c");

const GREENS = ["#3f8c4b", "#4fa056", "#2f7d5d", "#69a94e", "#3c7f6a"];
const AUTUMN = ["#e0872d", "#cc5a40", "#e5a23a"];
const CRYSTALS = ["#58e6ff", "#ff72d6", "#a186ff"];

interface IslandBuilt {
  node: Kid;
  rimR: (th: number) => number;
  topY: (rho: number) => number;
}

function buildIsland(spec: IslandSpec): { kids: Kid[]; rimR: (th: number) => number; topY: (rho: number) => number } {
  const { R, id } = spec;
  const rnd = makeRand(spec.seed);
  const hz = hazeAmount(spec.x, spec.y, spec.z);
  const p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
  const rimR = (th: number): number => R * (1 + 0.1 * Math.sin(2 * th + p1) + 0.07 * Math.sin(3 * th + p2) + 0.04 * Math.sin(5 * th + p3));
  const topY = (rho: number): number => (rho <= 0.5 ? 0.07 * R - 0.035 * R * (rho / 0.5) : 0.035 * R * (1 - (rho - 0.5) / 0.5));
  const D = R * 1.5;
  const N = 20, K = 6;

  const centre: V3 = [0, 0.07 * R, 0];
  const mid: V3[] = [], rim: V3[] = [];
  for (let i = 0; i < N; i += 1) {
    const th = (i / N) * TAU, r = rimR(th);
    mid.push([Math.cos(th) * r * 0.5, 0.035 * R + (rnd() - 0.5) * 0.012 * R, Math.sin(th) * r * 0.5]);
    rim.push([Math.cos(th) * r, 0, Math.sin(th) * r]);
  }
  const rings: V3[][] = [rim];
  for (let k = 1; k < K; k += 1) {
    const t = k / K;
    const prof = Math.pow(1 - Math.pow(t, 1.6), 0.75);
    const ring: V3[] = [];
    for (let i = 0; i < N; i += 1) {
      const th = (i / N) * TAU;
      const rr = rimR(th) * prof * (1 + (rnd() - 0.5) * 0.24 + 0.08 * Math.sin(th * 3 + k * 1.3 + p1));
      const yy = -D * Math.pow(t, 1.1) * (1 + (rnd() - 0.5) * 0.12);
      ring.push([Math.cos(th) * rr, yy, Math.sin(th) * rr]);
    }
    rings.push(ring);
  }
  const tip: V3 = [(rnd() - 0.5) * 0.08 * R, -D, (rnd() - 0.5) * 0.08 * R];

  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const face = (a: V3, b: V3, c: V3, rgb: V3): void => {
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const ref: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 + D * 0.35, (a[2] + b[2] + c[2]) / 3];
    let tri: V3[] = [a, b, c];
    if (n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0) {
      n = [-n[0], -n[1], -n[2]];
      tri = [a, c, b];
    }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    const c2 = mixRgb(rgb, HAZE, hz * 0.55);
    for (const p of tri) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0] / l, n[1] / l, n[2] / l);
      col.push(c2[0], c2[1], c2[2], 1);
    }
  };
  const shade = (c: V3): V3 => {
    const k = 0.88 + rnd() * 0.24;
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  const grassAt = (): V3 => shade(GRASS[Math.floor(rnd() * GRASS.length)]!);

  for (let i = 0; i < N; i += 1) {
    const j = (i + 1) % N;
    face(centre, mid[j]!, mid[i]!, grassAt());
    face(mid[i]!, mid[j]!, rim[i]!, grassAt());
    face(mid[j]!, rim[j]!, rim[i]!, grassAt());
  }
  for (let k = 0; k < K - 1; k += 1) {
    const a = rings[k]!, b = rings[k + 1]!;
    const t = (k + 0.5) / K;
    for (let i = 0; i < N; i += 1) {
      const j = (i + 1) % N;
      const base = k === 0 ? LIP : mixRgb(ROCK_TOP, ROCK_BOT, t);
      face(a[i]!, b[i]!, a[j]!, shade(base));
      face(a[j]!, b[i]!, b[j]!, shade(base));
    }
  }
  const last = rings[K - 1]!;
  for (let i = 0; i < N; i += 1) {
    const j = (i + 1) % N;
    face(last[i]!, tip, last[j]!, shade(ROCK_BOT));
  }

  const idx = Array.from({ length: pos.length / 3 }, (_, i) => i);
  const rock = geometry.custom(
    geometry.define({
      positions: new Float32Array(pos),
      normals: new Float32Array(nor),
      colors: new Float32Array(col),
      indices: idx,
      bounds: { min: [-1.3 * R, -D, -1.3 * R], max: [1.3 * R, 0.2 * R, 1.3 * R] }
    }),
    { name: `${id}-rock`, material: material.pbr({ color: "#ffffff", roughness: 0.95 }), castShadow: false }
  );

  const kids: Kid[] = [rock];
  const hzc = (hex: string, amt = 0.5): string => css(mixRgb(hexRgb(hex), HAZE, hz * amt));

  // trees
  const treeCount = clamp(Math.floor(R / 4.5) + 2, 3, 8);
  const sBase = clamp(R * 0.07, 0.8, 2.1);
  for (let i = 0; i < treeCount; i += 1) {
    const th = rnd() * TAU, rho = 0.18 + rnd() * 0.55;
    const x = Math.cos(th) * rimR(th) * rho, z = Math.sin(th) * rimR(th) * rho;
    const y = topY(rho) - 0.01 * R;
    const s = sBase * (0.8 + rnd() * 0.6);
    const autumn = rnd() < 0.25;
    const leaf = hzc((autumn ? AUTUMN : GREENS)[Math.floor(rnd() * (autumn ? AUTUMN.length : GREENS.length))]!);
    const trunk = hzc("#6a4630");
    const nm = `${id}-tree${i}`;
    const th2 = 0.55 * s;
    kids.push(primitives.cylinder({ name: `${nm}-trunk`, size: [0.22 * s, th2 * 1.6, 0.22 * s], material: pbrOf(trunk), castShadow: false }).position(x, y + th2 * 0.8, z));
    if (rnd() < 0.55) {
      kids.push(primitives.cone({ name: `${nm}-c1`, size: [1.3 * s, 1.7 * s, 1.3 * s], material: pbrOf(leaf), castShadow: false }).position(x, y + th2 * 1.3 + 0.85 * s, z));
      kids.push(primitives.cone({ name: `${nm}-c2`, size: [0.95 * s, 1.4 * s, 0.95 * s], material: pbrOf(leaf), castShadow: false }).position(x, y + th2 * 1.3 + 1.9 * s, z));
    } else {
      kids.push(primitives.sphere({ name: `${nm}-ball`, size: [1.5 * s, 1.35 * s, 1.5 * s], material: pbrOf(leaf), castShadow: false }).position(x, y + th2 * 1.6 + 0.6 * s, z));
      kids.push(primitives.sphere({ name: `${nm}-ball2`, size: [0.95 * s, 0.9 * s, 0.95 * s], material: pbrOf(leaf), castShadow: false }).position(x + 0.35 * s, y + th2 * 1.6 + 1.25 * s, z - 0.2 * s));
    }
  }

  // crystals
  const crystalCount = R > 18 ? 4 : 2;
  for (let i = 0; i < crystalCount; i += 1) {
    const th = rnd() * TAU, rho = 0.25 + rnd() * 0.5;
    const x = Math.cos(th) * rimR(th) * rho, z = Math.sin(th) * rimR(th) * rho;
    const y = topY(rho);
    const s = clamp(R * 0.09, 0.9, 2.4) * (0.8 + rnd() * 0.5);
    const color = hzc(CRYSTALS[Math.floor(rnd() * CRYSTALS.length)]!, 0.35);
    kids.push(
      primitives.cone({ name: `${id}-cry${i}`, size: [0.5 * s, 2.2 * s, 0.5 * s], material: glowOf(color), castShadow: false, params: { radialSegments: 5 } })
        .position(x, y + 0.9 * s, z).rotate((rnd() - 0.5) * 0.4, rnd() * TAU, (rnd() - 0.5) * 0.4)
    );
    kids.push(
      primitives.cone({ name: `${id}-cry${i}b`, size: [0.34 * s, 1.4 * s, 0.34 * s], material: glowOf(color), castShadow: false, params: { radialSegments: 5 } })
        .position(x + 0.5 * s, y + 0.55 * s, z + 0.2 * s).rotate((rnd() - 0.5) * 0.7, rnd() * TAU, 0.35)
    );
  }
  return { kids, rimR, topY };
}

// ---------- waterfall (largest island) ----------
const MAIN = ISLANDS[0]!;
const FALL_LEN = 110;
const lipTheta = 1.38; // mostly toward +z (camera side)
const WF_RND = makeRand(777);

// ---------- sky dome ----------
const skyMat = material.custom({
  glsl: {
    vertex: `out vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vW - cameraPosition);
  vec3 S = normalize(vec3(0.12, 0.10, -1.0));
  float h = d.y;
  vec3 horizon = vec3(1.0, 0.52, 0.2);
  vec3 midc = vec3(0.98, 0.4, 0.5);
  vec3 zenith = vec3(0.36, 0.2, 0.58);
  vec3 low = vec3(0.95, 0.5, 0.42);
  vec3 col = mix(horizon, midc, smoothstep(0.0, 0.28, h));
  col = mix(col, zenith, smoothstep(0.2, 0.95, h));
  col = mix(col, low, smoothstep(0.0, -0.5, h));
  float sd = dot(d, S);
  float azi = pow(max(dot(normalize(d.xz + vec2(0.0001)), normalize(S.xz)), 0.0), 3.0);
  col += vec3(1.0, 0.55, 0.2) * exp(-abs(h) * 7.0) * azi * 0.55;
  col += vec3(1.0, 0.6, 0.3) * pow(max(sd, 0.0), 10.0) * 0.55;
  col += vec3(1.0, 0.8, 0.5) * pow(max(sd, 0.0), 80.0) * 0.8;
  float disk = smoothstep(0.9955, 0.9966, sd);
  col = mix(col, vec3(1.0, 0.9, 0.62) * 2.2, disk);
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.012;
  outColor = vec4(col, 1.0);
}`
  },
  side: "back",
  fog: false,
  depthWrite: false,
  castShadow: false,
  receiveShadow: false
});

// ---------- clouds ----------
const cloudMaterial = (haze: number) =>
  material.custom({
    glsl: {
      vertex: `out vec3 vN; out vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
      fragment: `in vec3 vN; in vec3 vW; out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  vec3 S = normalize(vec3(0.12, 0.10, -1.0));
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float a = pow(smoothstep(0.0, 0.8, ndv), 1.4) * dens;
  float top = n.y * 0.5 + 0.5;
  vec3 col = mix(vec3(0.62, 0.36, 0.62), vec3(1.0, 0.74, 0.66), top);
  col += vec3(1.0, 0.6, 0.28) * max(dot(n, S), 0.0) * 0.45;
  col = mix(col, vec3(0.74, 0.66, 0.86), haze);
  outColor = vec4(col, a * (1.0 - haze * 0.25));
}`
    },
    uniforms: { dens: { type: "f32", value: 0.62 }, haze: { type: "f32", value: haze } },
    transparent: true,
    depthWrite: false,
    side: "front",
    fog: false,
    castShadow: false,
    receiveShadow: false
  });

// [x, y, z, size, drift speed]
const CLOUD_DEFS: Array<[number, number, number, number, number]> = [
  [-120, -38, -90, 45, 0.8],
  [60, -42, -110, 55, 0.6],
  [150, -40, -170, 70, 0.5],
  [-160, -36, -190, 65, 0.4],
  [0, -45, -60, 40, 1.2],
  [-30, -40, -250, 90, 0.3],
  [-90, 30, -20, 22, 1.6],
  [100, 8, -40, 26, 1.4],
  [-60, 0, -150, 40, 0.7],
  [90, 50, -100, 34, 0.8],
  [-10, 38, -130, 38, 0.6],
  [20, -15, 10, 18, 2.2],
  [160, 25, -230, 60, 0.4],
  [-190, 40, -260, 70, 0.3]
];
const cloudRand = makeRand(4242);
const cloudKids: Kid[] = CLOUD_DEFS.map(([x, y, z, size], bi) => {
  const mat = cloudMaterial(hazeAmount(x, y, z));
  const puffs: Kid[] = [];
  const np = 6;
  for (let j = 0; j < np; j += 1) {
    const f = (j - (np - 1) / 2) / ((np - 1) / 2);
    const ox = f * size * 0.9 + (cloudRand() - 0.5) * size * 0.2;
    const oy = (cloudRand() - 0.3) * size * 0.14 + (1 - Math.abs(f)) * size * 0.12;
    const oz = (cloudRand() - 0.5) * size * 0.5;
    const sx = size * (0.45 + cloudRand() * 0.3), sy = size * (0.22 + cloudRand() * 0.14), sz = size * (0.35 + cloudRand() * 0.2);
    puffs.push(primitives.sphere({ name: `cloud${bi}-p${j}`, size: [sx, sy, sz], material: mat, castShadow: false, receiveShadow: false }).position(ox, oy, oz));
  }
  return group(`cloud${bi}`, puffs, { position: [x, y, z] }).runtime({ id: `cloud${bi}`, mutable: true });
});

// ---------- waterfall ribbon material ----------
const waterMat = material.custom({
  glsl: {
    vertex: `out vec3 vP;
void main() {
  vP = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vP; out vec4 outColor;
void main() {
  float v = vP.z + 0.5;
  float u = vP.x + 0.5;
  float edge = smoothstep(0.0, 0.25, u) * smoothstep(1.0, 0.75, u);
  float s = sin(v * 70.0 - clk * 14.0 + sin(u * 9.0) * 2.0) * 0.5 + 0.5;
  float s2 = sin(v * 26.0 - clk * 9.0 + u * 5.0) * 0.5 + 0.5;
  float a = edge * (0.3 + 0.4 * s * s2) * smoothstep(0.0, 0.03, v) * (1.0 - smoothstep(0.5, 1.0, v));
  vec3 col = mix(vec3(0.72, 0.88, 1.0), vec3(1.0, 0.94, 0.94), s * 0.5);
  outColor = vec4(col, a);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// ---------- assemble scene ----------
let sc = scene({ background: "#e9906a" })
  .camera(camera.perspective({ position: CAM_REST, target: [0, 16, -90], fov: 50, near: 1, far: 1100 }))
  .add(lights.hemisphere({ skyColor: "#ffb99a", groundColor: "#7a5f94", intensity: 1.0 }))
  .add(lights.directional({ name: "sunlight", position: [-80, 50, -160], target: [0, 10, -90], intensity: 2.4, color: "#ffad66", shadow: false }))
  .add(lights.directional({ name: "fill", position: [60, 60, 80], target: [0, 10, -90], intensity: 1.3, color: "#ffc8d8", shadow: false }))
  .add(effects.fog({ color: "#b9a6cf", density: 0.0028 }))
  .add(effects.bloom({ intensity: 0.35, threshold: 0.9, radius: 0.5 }))
  .add(primitives.sphere({ name: "sky-dome", size: 1400, material: skyMat, castShadow: false, receiveShadow: false }));

for (const k of cloudKids) sc = sc.add(k);

let lipLocal: V3 = [0, 0, 0];
for (const spec of ISLANDS) {
  const built = buildIsland(spec);
  let kids = built.kids;
  if (spec === MAIN) {
    const r = built.rimR(lipTheta) * 0.93;
    lipLocal = [Math.cos(lipTheta) * r, 0, Math.sin(lipTheta) * r];
    kids = [
      ...kids,
      primitives.plane({ name: "waterfall", size: [2.4, 1, FALL_LEN], material: waterMat, castShadow: false, receiveShadow: false })
        .position(lipLocal[0], -FALL_LEN / 2 + 0.2, lipLocal[2] + 0.6)
        .rotate(Math.PI / 2, 0, 0)
        .runtime({ id: "waterfall", mutable: true })
    ];
  }
  sc = sc.add(group(spec.id, kids, { position: [spec.x, spec.y, spec.z] }).runtime({ id: spec.id, mutable: true }));
}

// droplets falling from the lip of the largest island
const DROPS = 48;
const dropMat = material.emissive({ color: "#d6ecff", emissive: "#d6ecff", emissiveIntensity: 0.9, roughness: 0.4 });
const dropJitter: Array<[number, number, number]> = [];
for (let i = 0; i < DROPS; i += 1) {
  dropJitter.push([(WF_RND() - 0.5) * 2, (WF_RND() - 0.5) * 2, WF_RND()]);
  sc = sc.add(
    primitives.sphere({ name: `drop${i}`, size: 0.5, material: dropMat, castShadow: false, receiveShadow: false })
      .position(MAIN.x, MAIN.y, MAIN.z)
      .runtime({ id: `drop${i}`, mutable: true })
  );
}
sc = sc.add(
  primitives.sphere({ name: "wf-placeholder", size: 0.01, material: dropMat, castShadow: false, receiveShadow: false }).position(0, -500, 0)
);

const app = createAuraApp("#app", { scene: sc });

const ARC_PERIOD = 50; // seconds per full loop of the camera arc
const ARC_AMP = 0.45; // radians either side of centre
const CAM_TARGET: V3 = [0, 16, -90];
const CAM_DIST = 130;
let t = 0;

const islandNodes = ISLANDS.map((s) => ({ s, node: app.nodes.require(s.id) }));
const cloudNodes = CLOUD_DEFS.map((d, i) => ({ d, node: app.nodes.require(`cloud${i}`), x: d[0] }));
const dropNodes = Array.from({ length: DROPS }, (_, i) => app.nodes.require(`drop${i}`));
const fallNode = app.nodes.require("waterfall");

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  t += dt;

  // camera: slow seamless arc around the island field
  const ph = (t / ARC_PERIOD) * TAU;
  const a = ARC_AMP * Math.sin(ph);
  app.camera?.setPose({
    position: [CAM_TARGET[0] + Math.sin(a) * CAM_DIST, 23 + 4 * Math.sin(ph + 1), CAM_TARGET[2] + Math.cos(a) * CAM_DIST],
    target: [CAM_TARGET[0] + 3 * Math.sin(ph * 2), CAM_TARGET[1] + 1.5 * Math.sin(ph + 0.5), CAM_TARGET[2]],
    fov: 50
  });

  // island bobbing
  for (const { s, node } of islandNodes) {
    const b = s.bobAmp * Math.sin(t * s.bobSpeed + s.phase);
    node.setPosition(s.x, s.y + b, s.z);
    if (s !== MAIN) node.setRotation(0, 0, 0.02 * Math.sin(t * s.bobSpeed * 0.7 + s.phase * 1.3));
  }

  // cloud drift (nearer banks move faster)
  for (const c of cloudNodes) {
    const lim = 260 + Math.abs(c.d[2]) * 0.4;
    c.x += c.d[4] * dt;
    if (c.x > lim) c.x -= lim * 2;
    c.node.setPosition(c.x, c.d[1], c.d[2]);
  }

  // waterfall
  fallNode.setUniform?.("clk", t);
  const bob = MAIN.bobAmp * Math.sin(t * MAIN.bobSpeed + MAIN.phase);
  const lx = MAIN.x + lipLocal[0], ly = MAIN.y + bob, lz = MAIN.z + lipLocal[2] + 0.6;
  for (let i = 0; i < DROPS; i += 1) {
    const j = dropJitter[i]!;
    const p = (t * 0.32 + i / DROPS + j[2] * 0.02) % 1;
    const fall = FALL_LEN * (0.45 * p * p + 0.55 * p);
    const spread = 0.2 + p * 1.8;
    const sc2 = 0.15 + 0.55 * Math.pow(1 - p, 0.8);
    dropNodes[i]!.setPosition(lx + j[0] * spread, ly - fall, lz + j[1] * spread * 0.6);
    dropNodes[i]!.setScale(sc2);
  }
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
