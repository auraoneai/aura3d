import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
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

// ---------- helpers ----------
let seed = 424242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash2 = (ix: number, iy: number): number => {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, y: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
const fbm = (x: number, y: number, oct: number): number => {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i += 1) {
    sum += vnoise(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
};

// ---------- terrain model ----------
const trailX = (z: number): number => 7 * Math.sin(z * 0.035) + 3 * Math.sin(z * 0.09 + 1);
const CABIN_Z = -70;
const CABIN_X = trailX(CABIN_Z) + 7;

const rawH = (x: number, z: number): number => {
  const dx = x - trailX(z);
  const adx = Math.abs(dx);
  let h = -z * 0.11 + 0.45 * Math.sqrt(dx * dx + 4) + 0.004 * dx * dx;
  const w = smooth(1.5, 12, adx);
  h += w * (fbm(x * 0.045 + 3, z * 0.045, 4) - 0.5) * 14 * Math.min(1, adx / 40 + 0.3);
  h += w * (vnoise(x * 0.16, z * 0.16) - 0.5) * 1.6;
  const far = smooth(-110, -300, z);
  h += far * (20 + 50 * fbm(x * 0.02 + 9, z * 0.02, 3)) * smooth(5, 40, adx);
  h += smooth(-250, -330, z) * 70;
  return h;
};
const PAD_Y = rawH(trailX(CABIN_Z) + 5.2, CABIN_Z);
const H = (x: number, z: number): number => {
  const h = rawH(x, z);
  const d = Math.hypot(x - CABIN_X, z - CABIN_Z);
  const w = smooth(8.5, 4.6, d);
  return h + (PAD_Y - h) * w;
};

// ---------- terrain mesh ----------
const NU = 100, NZ = 165, Z0 = 30, DZ = 2.2, DX_MAX = 190;
const grid: V3[][] = [];
for (let j = 0; j <= NZ; j += 1) {
  const z = Z0 - j * DZ;
  const row: V3[] = [];
  for (let i = 0; i <= NU; i += 1) {
    const u = (i / NU) * 2 - 1;
    const dx = DX_MAX * Math.sign(u) * Math.pow(Math.abs(u), 1.8);
    const x = trailX(z) + dx;
    row.push([x, H(x, z), z]);
  }
  grid.push(row);
}
const tPos: number[] = [], tNor: number[] = [], tCol: number[] = [];
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
  const adx = Math.abs(cx - trailX(cz));
  const ny = n[1]!;
  const rockNoise = fbm(cx * 0.07 + 20, cz * 0.07, 3);
  const jitter = (hash2(Math.round(cx * 3.1), Math.round(cz * 3.1)) - 0.5) * 0.06;
  let rgb: V3;
  const distCabin = Math.hypot(cx - CABIN_X, cz - CABIN_Z);
  if (adx < 1.7) {
    rgb = [0.78 + jitter, 0.82 + jitter, 0.89 + jitter];
  } else if (distCabin > 7 && (ny < 0.8 - (rockNoise - 0.5) * 0.35 || (rockNoise > 0.66 && ny < 0.9 && adx > 9))) {
    const r = 0.17 + jitter * 1.5;
    rgb = [r, r + 0.01, r + 0.035];
  } else {
    const t = clamp(fbm(cx * 0.05, cz * 0.05 + 40, 3) * 1.6 - 0.35 + (0.85 - ny) * 1.5, 0, 1);
    rgb = [0.93 - 0.3 * t + jitter, 0.95 - 0.24 * t + jitter, 0.98 - 0.17 * t + jitter];
  }
  const order = k > 0 ? [a, b, c] : [a, c, b];
  for (const p of order) {
    tPos.push(p[0], p[1], p[2]);
    tNor.push(n[0]!, n[1]!, n[2]!);
    tCol.push(rgb[0], rgb[1], rgb[2], 1);
  }
};
for (let j = 0; j < NZ; j += 1) {
  for (let i = 0; i < NU; i += 1) {
    const p00 = grid[j]![i]!, p10 = grid[j]![i + 1]!, p01 = grid[j + 1]![i]!, p11 = grid[j + 1]![i + 1]!;
    face(p00, p01, p10);
    face(p10, p01, p11);
  }
}

let sc = scene({ background: "#c2c8ce" })
  .camera(camera.perspective({ position: [0, H(trailX(0), 0) + 1.7, 0], target: [trailX(-14), H(trailX(-14), -14) + 1.5, -14], fov: 58, near: 0.1, far: 800 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#e4e9ee", groundColor: "#97a3b1", intensity: 1.1 }))
  .add(lights.directional({ name: "overcast", position: [-60, 90, 50], target: [0, 0, -60], intensity: 1.5, color: "#f2f5f8" }))
  .add(effects.fog({ color: "#c2c8ce", density: 0.0105 }))
  .add(
    geometry.custom(
      geometry.define({
        positions: new Float32Array(tPos),
        normals: new Float32Array(tNor),
        colors: new Float32Array(tCol),
        indices: Array.from({ length: tPos.length / 3 }, (_, i) => i),
        bounds: { min: [-260, -10, -345], max: [260, 160, 40] }
      }),
      { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 1 }), castShadow: false }
    )
  );

// ---------- rock outcrops ----------
const rockT: AuraTransformSpec[] = [], rockC: string[] = [];
const capT: AuraTransformSpec[] = [];
for (let i = 0; i < 90; i += 1) {
  const z = 25 - rand() * 250;
  const side = rand() < 0.5 ? -1 : 1;
  const dx = side * (9 + rand() * 60);
  const x = trailX(z) + dx;
  if (Math.hypot(x - CABIN_X, z - CABIN_Z) < 10) continue;
  const base = H(x, z);
  const s = 1.2 + rand() * 3.2;
  const pieces = 2 + Math.floor(rand() * 3);
  for (let p = 0; p < pieces; p += 1) {
    const ps = s * (p === 0 ? 1 : 0.35 + rand() * 0.45);
    const ox = p === 0 ? 0 : (rand() - 0.5) * s * 1.5;
    const oz = p === 0 ? 0 : (rand() - 0.5) * s * 1.5;
    const sx = ps * (0.9 + rand() * 0.8), sy = ps * (0.8 + rand() * 1.0), sz = ps * (0.9 + rand() * 0.8);
    const yy = H(x + ox, z + oz) + sy * 0.3;
    const rot: V3 = [(rand() - 0.5) * 0.5, rand() * 6.28, (rand() - 0.5) * 0.5];
    rockT.push({ position: [x + ox, yy, z + oz], rotation: rot, scale: [sx, sy, sz] });
    const l = 14 + Math.floor(rand() * 10);
    rockC.push(`hsl(220, 8%, ${l}%)`);
    if (rand() < 0.75) capT.push({ position: [x + ox, yy + sy * 0.42, z + oz], rotation: [rot[0] * 0.5, rot[1], rot[2] * 0.5], scale: [sx * 0.8, sy * 0.18, sz * 0.8] });
  }
  void base;
}
const pebbleT: AuraTransformSpec[] = [], pebbleC: string[] = [];
for (let i = 0; i < 220; i += 1) {
  const z = 25 - rand() * 200;
  const side = rand() < 0.5 ? -1 : 1;
  const x = trailX(z) + side * (3.2 + rand() * 30);
  if (Math.hypot(x - CABIN_X, z - CABIN_Z) < 6) continue;
  const s = 0.3 + rand() * 0.7;
  pebbleT.push({ position: [x, H(x, z) + s * 0.15, z], rotation: [0, rand() * 6, 0], scale: [s * 1.3, s * 0.7, s] });
  pebbleC.push(`hsl(220, 7%, ${18 + Math.floor(rand() * 14)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });
sc = sc
  .add(instances.box({ name: "rocks", transforms: rockT, colors: rockC, material: white }))
  .add(instances.box({ name: "rock-snow", transforms: capT, material: material.pbr({ color: "#f3f6f9", roughness: 1 }) }))
  .add(instances.sphere({ name: "pebbles", transforms: pebbleT, colors: pebbleC, material: white }));

// ---------- trail poles ----------
const poleT: AuraTransformSpec[] = [], poleCapT: AuraTransformSpec[] = [], poleFlagT: AuraTransformSpec[] = [], poleBarT: AuraTransformSpec[] = [];
const POLES = 12;
for (let i = 0; i < POLES; i += 1) {
  const z = -9 - i * 12;
  const x = trailX(z) - 2.4;
  const gy = H(x, z);
  const tilt = (rand() - 0.5) * 0.08;
  poleT.push({ position: [x, gy + 1.15, z], rotation: [0, 0, tilt], scale: [0.15, 2.8, 0.15] });
  poleBarT.push({ position: [x, gy + 2.0, z], rotation: [0, 0.4, tilt], scale: [0.7, 0.09, 0.09] });
  poleCapT.push({ position: [x, gy + 2.6, z], scale: [0.3, 0.14, 0.3] });
  poleFlagT.push({ position: [x + 0.2, gy + 1.75, z], scale: [0.4, 0.22, 0.03] });
}
sc = sc
  .add(instances.cylinder({ name: "poles", transforms: poleT, material: material.pbr({ color: "#6b4a2d", roughness: 0.9 }), params: { radialSegments: 8 } }))
  .add(instances.box({ name: "pole-bars", transforms: poleBarT, material: material.pbr({ color: "#5a3d24", roughness: 0.9 }) }))
  .add(instances.sphere({ name: "pole-caps", transforms: poleCapT, material: material.pbr({ color: "#f3f6f9", roughness: 1 }) }))
  .add(instances.box({ name: "pole-flags", transforms: poleFlagT, material: material.pbr({ color: "#b3321f", roughness: 0.8 }) }));

// ---------- cabin ----------
{
  const W = 4.4, D = 3.6, WALL = 2.4;
  const cx = CABIN_X, cz = CABIN_Z, y0 = PAD_Y;
  const yt = y0 + WALL;
  const logT: AuraTransformSpec[] = [], logC: string[] = [];
  for (let k = 0; k < 8; k += 1) {
    const y = y0 + 0.15 + k * 0.3;
    const shade = () => `hsl(${24 + Math.floor(rand() * 6)}, 42%, ${20 + Math.floor(rand() * 9)}%)`;
    for (const sgn of [-1, 1]) {
      logT.push({ position: [cx, y, cz + (sgn * D) / 2], rotation: [0, 0, Math.PI / 2], scale: [0.3, W + 0.4, 0.3] });
      logC.push(shade());
      logT.push({ position: [cx + (sgn * W) / 2, y, cz], rotation: [Math.PI / 2, 0, 0], scale: [0.3, D + 0.4, 0.3] });
      logC.push(shade());
    }
  }
  const th = Math.atan2(1.3, D / 2 + 0.35);
  const slabLen = Math.hypot(D / 2 + 0.35, 1.3) + 0.15;
  const roofT: AuraTransformSpec[] = [], snowT: AuraTransformSpec[] = [];
  for (const sgn of [-1, 1]) {
    roofT.push({ position: [cx, yt + 0.68, cz + sgn * 1.05], rotation: [sgn * th, 0, 0], scale: [W + 0.8, 0.14, slabLen] });
    snowT.push({ position: [cx, yt + 0.84, cz + sgn * 1.0], rotation: [sgn * th, 0, 0], scale: [W + 0.9, 0.22, slabLen - 0.05] });
  }
  snowT.push({ position: [cx, yt + 1.42, cz], scale: [W + 0.9, 0.22, 0.55] });
  const snowM = material.pbr({ color: "#f5f8fb", roughness: 1 });
  const woodM = material.pbr({ color: "#4a3320", roughness: 0.9 });
  const glow = material.emissive({ color: "#ffb347", emissive: "#ffa233", emissiveIntensity: 3.2 });
  const frameM = material.pbr({ color: "#2b1d12", roughness: 0.9 });

  // gable end triangles (double sided)
  const gp: number[] = [], gn: number[] = [], gc: number[] = [], gi: number[] = [];
  const tri = (a: V3, b: V3, c: V3, nx: number): void => {
    for (const dir of [1, -1]) {
      const order = dir === 1 ? [a, b, c] : [a, c, b];
      for (const p of order) {
        gi.push(gi.length);
        gp.push(p[0], p[1], p[2]);
        gn.push(nx * dir, 0, 0);
        gc.push(0.3, 0.2, 0.12, 1);
      }
    }
  };
  for (const sgn of [-1, 1]) {
    const x = cx + sgn * (W / 2 + 0.05);
    tri([x, yt - 0.05, cz - D / 2 - 0.2], [x, yt - 0.05, cz + D / 2 + 0.2], [x, yt + 1.2, cz], sgn);
  }

  const chimneyY = yt + 1.35;
  sc = sc
    .add(instances.cylinder({ name: "cabin-logs", transforms: logT, colors: logC, material: white, params: { radialSegments: 8 } }))
    .add(primitives.box({ name: "cabin-core", size: [W - 0.1, WALL, D - 0.1], material: woodM }).position(cx, y0 + WALL / 2, cz))
    .add(primitives.box({ name: "cabin-foundation", size: [W + 0.5, 0.35, D + 0.5], material: material.pbr({ color: "#4b4f56", roughness: 1 }) }).position(cx, y0 + 0.05, cz))
    .add(instances.box({ name: "cabin-roof", transforms: roofT, material: woodM }))
    .add(instances.box({ name: "cabin-roof-snow", transforms: snowT, material: snowM }))
    .add(
      geometry.custom(
        geometry.define({
          positions: new Float32Array(gp),
          normals: new Float32Array(gn),
          colors: new Float32Array(gc),
          indices: gi,
          bounds: { min: [cx - W, yt - 1, cz - D], max: [cx + W, yt + 2, cz + D] }
        }),
        { name: "cabin-gables", material: material.pbr({ color: "#ffffff", roughness: 0.9 }), castShadow: false }
      )
    )
    .add(primitives.box({ name: "chimney", size: [0.6, 1.8, 0.6], material: material.pbr({ color: "#555a62", roughness: 1 }) }).position(cx + 1.2, chimneyY, cz - 0.8))
    .add(primitives.box({ name: "chimney-snow", size: [0.76, 0.12, 0.76], material: snowM }).position(cx + 1.2, chimneyY + 0.93, cz - 0.8))
    // door and lit windows
    .add(primitives.box({ name: "door", size: [0.07, 1.7, 0.9], material: frameM }).position(cx - W / 2 - 0.19, y0 + 0.95, cz + 0.95))
    .add(primitives.box({ name: "win-w-frame", size: [0.07, 0.9, 1.1], material: frameM }).position(cx - W / 2 - 0.19, y0 + 1.5, cz - 0.7))
    .add(primitives.box({ name: "win-w-glow", size: [0.07, 0.72, 0.92], material: glow, castShadow: false }).position(cx - W / 2 - 0.24, y0 + 1.5, cz - 0.7))
    .add(primitives.box({ name: "win-w-bar", size: [0.08, 0.72, 0.06], material: frameM }).position(cx - W / 2 - 0.26, y0 + 1.5, cz - 0.7))
    .add(primitives.box({ name: "win-s-frame", size: [1.1, 0.9, 0.07], material: frameM }).position(cx + 0.7, y0 + 1.5, cz + D / 2 + 0.19))
    .add(primitives.box({ name: "win-s-glow", size: [0.92, 0.72, 0.07], material: glow, castShadow: false }).position(cx + 0.7, y0 + 1.5, cz + D / 2 + 0.24))
    .add(primitives.box({ name: "win-s-bar", size: [0.06, 0.72, 0.08], material: frameM }).position(cx + 0.7, y0 + 1.5, cz + D / 2 + 0.26))
    .add(lights.point({ name: "win-light-w", position: [cx - W / 2 - 1.6, y0 + 1.6, cz - 0.7], intensity: 14, distance: 14, color: "#ffa550" }))
    .add(lights.point({ name: "win-light-s", position: [cx + 0.7, y0 + 1.6, cz + D / 2 + 1.6], intensity: 10, distance: 12, color: "#ffa550" }));

  // drifts against the walls
  const driftT: AuraTransformSpec[] = [];
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + rand();
    const px = cx + Math.cos(a) * (W / 2 + 0.7), pz = cz + Math.sin(a) * (D / 2 + 0.7);
    driftT.push({ position: [px, y0 + 0.1, pz], rotation: [0, rand() * 3, 0], scale: [1.6 + rand(), 0.7 + rand() * 0.3, 1.2 + rand() * 0.6] });
  }
  sc = sc.add(instances.sphere({ name: "cabin-drifts", transforms: driftT, material: snowM }));
}

// ---------- blizzard flakes ----------
const SMALL = 2200, LARGE = 900;
const flakeMat = material.emissive({ color: "#ffffff", emissive: "#f4f8ff", emissiveIntensity: 0.9 });
const initFlakes = (n: number): AuraTransformSpec[] => Array.from({ length: n }, () => ({ position: [0, -500, 0] as V3, scale: [0.01, 0.01, 0.01] as V3 }));
sc = sc
  .add(instances.box({ name: "flakes-small", transforms: initFlakes(SMALL), material: flakeMat, castShadow: false }).runtime({ id: "flakes-small", mutable: true }))
  .add(instances.box({ name: "flakes-large", transforms: initFlakes(LARGE), material: flakeMat, castShadow: false }).runtime({ id: "flakes-large", mutable: true }));

interface FlakeSet {
  id: string;
  n: number;
  u: Float32Array; v: Float32Array; w: Float32Array; m: Float32Array; sz: Float32Array;
  mats: Float32Array;
  width: number;
  length: number;
}
const makeSet = (id: string, n: number, width: number, length: number): FlakeSet => {
  const set: FlakeSet = { id, n, u: new Float32Array(n), v: new Float32Array(n), w: new Float32Array(n), m: new Float32Array(n), sz: new Float32Array(n), mats: new Float32Array(n * 16), width, length };
  for (let i = 0; i < n; i += 1) {
    set.u[i] = rand(); set.v[i] = rand(); set.w[i] = rand();
    set.m[i] = 0.8 + rand() * 0.45;
    set.sz[i] = 0.7 + rand() * 0.7;
  }
  return set;
};
const sets = [makeSet("flakes-small", SMALL, 0.045, 0.5), makeSet("flakes-large", LARGE, 0.1, 0.95)];

const VX = 9, VY = -4.6, VZ = 2.2;
const ANGLE = Math.atan2(-VX, VY);
const CA = Math.cos(ANGLE), SA = Math.sin(ANGLE);
const VW = 50, VD = 58, VH = 20;
const wrap = (a: number, size: number): number => ((a % size) + size) % size;

const updateFlakes = (set: FlakeSet, drift: number, gust: number, cx: number, cy: number, cz: number, app: ReturnType<typeof createAuraApp>): void => {
  const vis = 0.62 + 0.38 * gust;
  const lenMul = 1 + 0.7 * gust;
  const mats = set.mats;
  for (let i = 0; i < set.n; i += 1) {
    const o = i * 16;
    const rank = (i * 0.61803398875) % 1;
    const mul = set.m[i]!;
    const x = cx - VW / 2 + wrap(set.u[i]! * VW + drift * VX * mul - (cx - VW / 2), VW);
    const y = cy - 6 + wrap(set.v[i]! * VH + drift * VY * mul - (cy - 6), VH);
    const z = cz - VD / 2 + wrap(set.w[i]! * VD + drift * VZ * mul - (cz - VD / 2), VD);
    const show = rank < vis;
    const s = show ? set.sz[i]! : 0;
    const sx = set.width * s, sy = set.length * s * lenMul, sz = set.width * s;
    mats[o] = CA * sx; mats[o + 1] = SA * sx; mats[o + 2] = 0; mats[o + 3] = 0;
    mats[o + 4] = -SA * sy; mats[o + 5] = CA * sy; mats[o + 6] = 0; mats[o + 7] = 0;
    mats[o + 8] = 0; mats[o + 9] = 0; mats[o + 10] = sz; mats[o + 11] = 0;
    mats[o + 12] = x; mats[o + 13] = y; mats[o + 14] = z; mats[o + 15] = 1;
  }
  app.nodes.require(set.id).setInstanceMatrices(mats, set.n);
};

// ---------- app ----------
const app = createAuraApp("#app", { scene: sc });

const SPEED = 2.0, PATH_LEN = 140, LOOK = 14;
let t = 0, drift = 0, fogTimer = 0, culled = false;
let readyFlag = false;

const gustAt = (time: number): number => {
  const g = Math.pow(0.5 + 0.5 * Math.sin(time * 0.55 + Math.sin(time * 0.21) * 2), 3) * 1.5;
  return clamp(g, 0, 1);
};

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  t += dt;
  const gust = gustAt(t);
  drift += dt * (1 + 0.8 * gust);

  // camera walk up the trail
  const dist = (t * SPEED) % PATH_LEN;
  const z = -dist;
  const sway = Math.sin(t * 1.9);
  const bob = Math.sin(t * 3.8);
  const px = trailX(z) + sway * 0.07;
  const py = H(trailX(z), z) + 1.7 + bob * 0.035;
  const lz = z - LOOK;
  const lx = trailX(lz) + Math.sin(t * 0.6) * 0.9;
  const ly = H(trailX(lz), lz) + 1.45 + Math.sin(t * 0.45) * 0.25;
  app.camera?.setPose({ position: [px, py, z], target: [lx, ly, lz], roll: sway * 0.012 }, { cut: true });

  // flakes live in a box ahead of the camera
  const fx = lx - px, fz = lz - z;
  const fl = Math.hypot(fx, fz) || 1;
  const cx = px + (fx / fl) * 20, cz = z + (fz / fl) * 20;
  if (!culled) {
    for (const s of sets) app.nodes.require(s.id).frustumCulled = false;
    culled = true;
  }
  for (const s of sets) updateFlakes(s, drift, gust, cx, py, cz, app);

  // gusts thicken the air
  fogTimer += dt;
  if (fogTimer > 0.12) {
    fogTimer = 0;
    app.atmosphere?.setFog({ color: "#c2c8ce", density: 0.0105 + 0.006 * gust });
  }

  if (!readyFlag) {
    readyFlag = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
window.__EVAL_READY__ = true;
