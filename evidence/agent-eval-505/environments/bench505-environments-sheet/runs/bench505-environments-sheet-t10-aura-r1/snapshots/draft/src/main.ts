import {
  camera,
  createAuraApp,
  effects,
  geometry,
  instances,
  lights,
  material,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Periodic canyon description. Every function repeats every L metres along z,
// so the camera can wrap from z = -L back to z = 0 with an identical view.
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const L = 240;
const per = (z: number, k: number, ph = 0): number => Math.sin((TAU * k * z) / L + ph);
const cx = (z: number): number => 11 * per(z, 1) + 4 * per(z, 2, 1.3); // canyon centreline
const wl = (z: number): number => 13 + 2.5 * per(z, 3, 0.5) + 1.5 * per(z, 5, 2.0); // left half width
const wr = (z: number): number => 13 + 2.5 * per(z, 3, 3.0) + 1.5 * per(z, 4, 0.7); // right half width
const cb = (z: number): number => 2.5 * per(z, 4, 0.3) + 1.5 * per(z, 7, 1.0); // riverbed offset
const dq = (z: number): number => 2.4 * per(z, 5, 0) + 1.0 * per(z, 7, 1.0); // camera lateral drift
const floorY = (q: number, z: number): number => {
  const c = (q - cb(z)) / 2.4;
  return (
    0.06 * per(z, 9, q * 0.5) +
    0.04 * per(z, 13, q * 0.9 + 1) -
    0.5 * Math.exp(-c * c) +
    0.35 * Math.pow(Math.min(1.4, Math.abs(q) / 14), 3)
  );
};

let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash = (n: number): number => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

const LAYER_COLORS: V3[] = [
  [0.5, 0.25, 0.18],
  [0.66, 0.36, 0.22],
  [0.76, 0.47, 0.29],
  [0.57, 0.29, 0.2],
  [0.82, 0.57, 0.38],
  [0.64, 0.34, 0.23],
  [0.78, 0.5, 0.32],
  [0.53, 0.27, 0.2],
  [0.84, 0.6, 0.41]
];
const SAND: V3 = [0.8, 0.62, 0.42];
const PALE: V3 = [0.88, 0.72, 0.52];
const mix3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

interface SideProfile {
  q: number[];
  y: number[];
  c: V3[];
}

// Profile of one canyon wall, from its foot outward: talus slope, then nine
// sandstone layers (steep riser + gently tilted shelf each), then a mesa top.
function wallProfile(z: number, s: -1 | 1): SideProfile {
  const w = s < 0 ? wl(z) : wr(z);
  const ph = s < 0 ? 0 : 2;
  let qq = w;
  let yy = floorY(s * w, z);
  const q: number[] = [s * qq];
  const y: number[] = [yy];
  const c: V3[] = [];
  qq += 2.4;
  yy += 1.9;
  q.push(s * qq);
  y.push(yy);
  c.push(scale3(SAND, 0.88 + 0.08 * per(z, 8, ph)));
  for (let l = 0; l < LAYER_COLORS.length; l += 1) {
    const th = (2.6 + 1.3 * hash(l + 1)) * (1 + 0.18 * per(z, 2 + (l % 3), l * 1.7 + ph));
    const run = 0.6 + 0.5 * (0.5 + 0.5 * per(z, 3 + (l % 2), l * 2.3 + ph));
    const shelf = 1.2 + 3.2 * (0.5 + 0.5 * per(z, 1 + ((l + 1) % 4), l * 2.1 + 0.8 + ph));
    const base = LAYER_COLORS[l]!;
    const vary = 1 + 0.1 * per(z, 6, l * 3 + ph) + 0.05 * per(z, 13, l + ph * 2);
    qq += run;
    yy += th * 0.9;
    q.push(s * qq);
    y.push(yy);
    c.push(scale3(base, vary));
    qq += shelf;
    yy += th * 0.1;
    q.push(s * qq);
    y.push(yy);
    c.push(scale3(mix3(base, SAND, 0.5), vary * 0.96));
  }
  qq += 40;
  yy += 1;
  q.push(s * qq);
  y.push(yy);
  c.push(scale3(SAND, 0.9));
  return { q, y, c };
}

// Whole cross-section at one z: left plateau -> left foot -> bed -> right foot -> right plateau.
const FLOOR_COLS = 13;
const buildSection = (z: number): { q: number[]; y: number[]; c: V3[] } => {
  const left = wallProfile(z, -1);
  const right = wallProfile(z, 1);
  const q: number[] = [...left.q].reverse();
  const y: number[] = [...left.y].reverse();
  const c: V3[] = [...left.c].reverse();
  const a = -wl(z);
  const b = wr(z);
  const bed = cb(z);
  const floorQ: number[] = [a];
  for (let m = 1; m < FLOOR_COLS; m += 1) {
    const qq = a + ((b - a) * m) / FLOOR_COLS;
    floorQ.push(qq);
    q.push(qq);
    y.push(floorY(qq, z));
  }
  floorQ.push(b);
  for (let m = 0; m < FLOOR_COLS; m += 1) {
    const mid = (floorQ[m]! + floorQ[m + 1]!) / 2;
    const channel = Math.abs(mid - bed) < 2.4;
    const tone = 1 + 0.07 * per(z, 11, mid * 0.6);
    c.push(scale3(channel ? PALE : mix3(SAND, LAYER_COLORS[1]!, 0.25), tone));
  }
  for (let i = 0; i < right.q.length; i += 1) {
    q.push(right.q[i]!);
    y.push(right.y[i]!);
  }
  for (const col of right.c) c.push(col);
  return { q, y, c };
};

// ---------------------------------------------------------------------------
// Terrain mesh: rows along -z, one vertex pair per cross-section segment so
// ledge edges stay crisp across the profile and smooth along the canyon.
// ---------------------------------------------------------------------------
const Z0 = 30;
const DZ = 2;
const ROWS = 375; // z from +30 to -720
const first = buildSection(Z0);
const NP = first.q.length;
const NS = NP - 1;
const P = new Float32Array((ROWS + 1) * NP * 3);
const SEGC = new Float32Array((ROWS + 1) * NS * 3);
for (let i = 0; i <= ROWS; i += 1) {
  const z = Z0 - i * DZ;
  const sec = buildSection(z);
  const x0 = cx(z);
  for (let j = 0; j < NP; j += 1) {
    const o = (i * NP + j) * 3;
    P[o] = x0 + sec.q[j]!;
    P[o + 1] = sec.y[j]!;
    P[o + 2] = z;
  }
  for (let k = 0; k < NS; k += 1) {
    const o = (i * NS + k) * 3;
    const col = sec.c[k]!;
    SEGC[o] = col[0];
    SEGC[o + 1] = col[1];
    SEGC[o + 2] = col[2];
  }
}

const vertCount = (ROWS + 1) * NS * 2;
const tPos = new Float32Array(vertCount * 3);
const tNor = new Float32Array(vertCount * 3);
const tCol = new Float32Array(vertCount * 4);
const tIdx: number[] = [];
const vid = (i: number, k: number, e: number): number => (i * NS + k) * 2 + e;
let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;
for (let i = 0; i <= ROWS; i += 1) {
  const iPrev = Math.max(0, i - 1);
  const iNext = Math.min(ROWS, i + 1);
  for (let k = 0; k < NS; k += 1) {
    for (let e = 0; e < 2; e += 1) {
      const j = k + e;
      const v = vid(i, k, e);
      const po = (i * NP + j) * 3;
      const ax = P[(i * NP + k + 1) * 3]! - P[(i * NP + k) * 3]!;
      const ay = P[(i * NP + k + 1) * 3 + 1]! - P[(i * NP + k) * 3 + 1]!;
      const az = P[(i * NP + k + 1) * 3 + 2]! - P[(i * NP + k) * 3 + 2]!;
      const tx = P[(iNext * NP + j) * 3]! - P[(iPrev * NP + j) * 3]!;
      const ty = P[(iNext * NP + j) * 3 + 1]! - P[(iPrev * NP + j) * 3 + 1]!;
      const tz = P[(iNext * NP + j) * 3 + 2]! - P[(iPrev * NP + j) * 3 + 2]!;
      let nx = ay * tz - az * ty;
      let ny = az * tx - ax * tz;
      let nz = ax * ty - ay * tx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      tPos[v * 3] = P[po]!;
      tPos[v * 3 + 1] = P[po + 1]!;
      tPos[v * 3 + 2] = P[po + 2]!;
      tNor[v * 3] = nx;
      tNor[v * 3 + 1] = ny;
      tNor[v * 3 + 2] = nz;
      const co = (i * NS + k) * 3;
      tCol[v * 4] = SEGC[co]!;
      tCol[v * 4 + 1] = SEGC[co + 1]!;
      tCol[v * 4 + 2] = SEGC[co + 2]!;
      tCol[v * 4 + 3] = 1;
      minX = Math.min(minX, P[po]!);
      maxX = Math.max(maxX, P[po]!);
      minY = Math.min(minY, P[po + 1]!);
      maxY = Math.max(maxY, P[po + 1]!);
    }
  }
}
for (let i = 0; i < ROWS; i += 1) {
  for (let k = 0; k < NS; k += 1) {
    const a0 = vid(i, k, 0);
    const a1 = vid(i, k, 1);
    const b0 = vid(i + 1, k, 0);
    const b1 = vid(i + 1, k, 1);
    tIdx.push(a0, a1, b0, a1, b1, b0);
  }
}

// ---------------------------------------------------------------------------
// Boulders, pebbles and dead shrubs (generated for one period, repeated)
// ---------------------------------------------------------------------------
const PERIODS = 3;
const zAt = (base: number, m: number): number => Z0 - base - m * L;
const corridorOk = (q: number, z: number, margin: number): boolean => Math.abs(q - dq(z)) > margin;

const boulders: AuraTransformSpec[] = [];
const boulderColors: string[] = [];
const boxRocks: AuraTransformSpec[] = [];
const boxColors: string[] = [];
const pebbles: AuraTransformSpec[] = [];
const pebbleColors: string[] = [];
const rockColor = (): string => `hsl(${14 + Math.floor(rand() * 16)}, ${28 + Math.floor(rand() * 18)}%, ${24 + Math.floor(rand() * 20)}%)`;

for (let n = 0; n < 34; n += 1) {
  const base = rand() * L;
  const big = rand() < 0.3;
  const s = big ? 1.8 + rand() * 1.6 : 0.6 + rand() * 1.1;
  const fq = rand() * 2 - 1;
  const asBox = rand() < 0.5;
  const yaw = rand() * TAU;
  const sq = [1, 0.7 + rand() * 0.5, 0.8 + rand() * 0.5] as const;
  const col = rockColor();
  for (let m = 0; m < PERIODS; m += 1) {
    const z = zAt(base, m);
    const w = fq < 0 ? wl(z) : wr(z);
    const q = fq * (w - 1.2);
    if (!corridorOk(q, z, 2.4 + s * 0.6)) continue;
    const t: AuraTransformSpec = {
      position: [cx(z) + q, floorY(q, z) + s * 0.3, z],
      rotation: [rand() * 0.4, yaw, rand() * 0.4],
      scale: [s * sq[0], s * sq[1] * (asBox ? 0.9 : 0.75), s * sq[2]]
    };
    if (asBox) {
      boxRocks.push(t);
      boxColors.push(col);
    } else {
      boulders.push(t);
      boulderColors.push(col);
    }
  }
}
for (let n = 0; n < 70; n += 1) {
  const base = rand() * L;
  const s = 0.15 + rand() * 0.3;
  const fq = rand() * 2 - 1;
  const yaw = rand() * TAU;
  const col = rockColor();
  for (let m = 0; m < PERIODS; m += 1) {
    const z = zAt(base, m);
    const w = fq < 0 ? wl(z) : wr(z);
    const q = fq * (w - 0.8);
    pebbles.push({
      position: [cx(z) + q, floorY(q, z) + s * 0.25, z],
      rotation: [0, yaw, 0],
      scale: [s * 1.3, s * 0.8, s]
    });
    pebbleColors.push(col);
  }
}

const twigs: AuraTransformSpec[] = [];
const twigColors: string[] = [];
const TWIG_TONES = ["#6a5442", "#7d6752", "#4f3d2f", "#8a7660"];
const addBranch = (b: V3, dir: V3, len: number, th: number, col: string, out: [AuraTransformSpec[], string[]]): void => {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  out[0].push({
    position: [b[0] + (d[0] * len) / 2, b[1] + (d[1] * len) / 2, b[2] + (d[2] * len) / 2],
    rotation: [Math.asin(Math.max(-1, Math.min(1, d[2]))), 0, Math.atan2(-d[0], d[1])],
    rotationOrder: "ZYX",
    scale: [th, len, th]
  });
  out[1].push(col);
};
for (let n = 0; n < 22; n += 1) {
  const base = rand() * L;
  const s = 0.7 + rand() * 0.9;
  const fq = rand() * 2 - 1;
  const branches = 5 + Math.floor(rand() * 3);
  const rolls: number[] = [];
  for (let r = 0; r < 80; r += 1) rolls.push(rand());
  const tone = TWIG_TONES[Math.floor(rand() * TWIG_TONES.length)]!;
  for (let m = 0; m < PERIODS; m += 1) {
    const z = zAt(base, m);
    const w = fq < 0 ? wl(z) : wr(z);
    const q = fq * (w - 1.5);
    if (!corridorOk(q, z, 2.0)) continue;
    const root: V3 = [cx(z) + q, floorY(q, z) - 0.02, z];
    const out: [AuraTransformSpec[], string[]] = [twigs, twigColors];
    let ri = 0;
    addBranch(root, [0, 1, 0], 0.45 * s, 0.07 * s, tone, out);
    const top: V3 = [root[0], root[1] + 0.4 * s, root[2]];
    for (let b = 0; b < branches; b += 1) {
      const a = (b / branches) * TAU + rolls[ri++]! * 0.8;
      const h = 0.5 + rolls[ri++]! * 0.7;
      const dir: V3 = [Math.cos(a) * h, 0.8 + rolls[ri++]! * 0.9, Math.sin(a) * h];
      const len = (0.8 + rolls[ri++]! * 0.8) * s;
      const th = 0.04 * s;
      addBranch(top, dir, len, th, tone, out);
      const dl = Math.hypot(dir[0], dir[1], dir[2]);
      for (const f of [0.5, 0.8]) {
        const tb: V3 = [top[0] + (dir[0] / dl) * len * f, top[1] + (dir[1] / dl) * len * f, top[2] + (dir[2] / dl) * len * f];
        const td: V3 = [dir[0] / dl + (rolls[ri++]! - 0.5) * 1.6, dir[1] / dl + 0.2, dir[2] / dl + (rolls[ri++]! - 0.5) * 1.6];
        addBranch(tb, td, len * 0.5, th * 0.6, tone, out);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const FOG = "#c88a90";
const dirOf = (elevDeg: number, azDeg: number, d = 200): V3 => {
  const E = (elevDeg * Math.PI) / 180;
  const A = (azDeg * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const SUN_EL = 10;
const SUN_AZ = 38;

const camPose = (z: number): { position: V3; target: V3 } => {
  const zt = z - 24;
  return {
    position: [cx(z) + dq(z), 1.75 + 0.04 * per(z, 11), z],
    target: [cx(zt) + dq(zt) * 0.5, 3.4, zt]
  };
};
const startPose = camPose(0);

const white = material.pbr({ color: "#ffffff", roughness: 1 });

let sc = scene({ background: FOG })
  .camera(camera.perspective({ position: startPose.position, target: startPose.target, fov: 60, near: 0.3, far: 760 }))
  .add(
    sky.gradient({
      zenith: "#202c7c",
      horizon: "#e0937f",
      ground: "#a8687a",
      exponent: 0.55,
      horizonGlow: 0.9,
      sun: { elevationDeg: SUN_EL, azimuthDeg: SUN_AZ, intensity: 1, color: "#ffb070" },
      bands: [
        { elevationDeg: 4, widthDeg: 10, color: "#ff5aa0", intensity: 0.55 },
        { elevationDeg: 16, widthDeg: 22, color: "#9a5ad8", intensity: 0.3 }
      ]
    })
  )
  .add(lights.hemisphere({ skyColor: "#7a74d0", groundColor: "#d08050", intensity: 0.95 }))
  .add(
    lights.directional({
      name: "sun",
      position: dirOf(SUN_EL, SUN_AZ),
      target: [0, 0, 0],
      intensity: 3.6,
      color: "#ff9a55",
      shadow: { cascades: 3, maxDistance: 220, mapSize: 2048, filter: "pcf", fit: "camera", normalBias: 0.05 }
    })
  )
  .add(
    lights.directional({
      name: "fill",
      position: dirOf(35, 215),
      target: [0, 0, 0],
      intensity: 0.5,
      color: "#6f7cff"
    })
  )
  .add(effects.fog({ color: FOG, density: 0.0062 }))
  .add(
    geometry.custom(
      geometry.define({
        positions: tPos,
        normals: tNor,
        colors: tCol,
        indices: tIdx,
        bounds: { min: [minX, minY, -730], max: [maxX, maxY, Z0 + 5] }
      }),
      { name: "canyon", material: material.pbr({ color: "#ffffff", roughness: 0.95, doubleSided: true }) }
    )
  );

sc = sc
  .add(instances.sphere({ name: "boulders", transforms: boulders, colors: boulderColors, material: white }))
  .add(instances.box({ name: "boxRocks", transforms: boxRocks, colors: boxColors, material: white }))
  .add(instances.sphere({ name: "pebbles", transforms: pebbles, colors: pebbleColors, material: white }))
  .add(instances.cylinder({ name: "deadShrubs", transforms: twigs, colors: twigColors, material: white, params: { radialSegments: 5 } }));

const app = createAuraApp("#app", { scene: sc });

const SPEED = 5; // metres per second along the canyon
let travelled = 0;
app.onFrame((f) => {
  travelled += Math.min(f.dt, 0.1) * SPEED;
  const z = -(travelled % L);
  const pose = camPose(z);
  app.camera?.setPose({ position: pose.position, target: pose.target });
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
