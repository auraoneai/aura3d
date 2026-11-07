import { camera, createAuraApp, effects, geometry, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------- deterministic random + noise ----------
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, y: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), fx), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx), fy);
};
const fbm = (x: number, y: number): number => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 5.2, y * 2.1 + 1.7) * 0.3 + vnoise(x * 4.3 + 9.1, y * 4.3 + 3.3) * 0.15;

// ---------- terrain definition ----------
// Terrain coordinates: u = lateral offset from the trail centre line, z = distance along the valley.
const trailX = (z: number): number => 7 * Math.sin(z * 0.035) + 4 * Math.sin(z * 0.09 + 1.0);
const rise = (z: number): number => -0.16 * z;
const side = (a: number): number => (a <= 3 ? 0.03 * a * a : 0.27 + 0.55 * (a - 3));

const CABIN_Z = -62;
const CABIN_U = -8;
const cabinGround = rise(CABIN_Z) + side(Math.abs(CABIN_U));

const heightAt = (u: number, z: number): number => {
  const a = Math.abs(u);
  let h = rise(z) + side(a);
  const amp = 14 * smooth(5, 40, a) * (1 + Math.max(0, -z) / 150);
  h += (fbm(u * 0.05 + 3.1, z * 0.05 + 7.7) - 0.4) * 2 * amp;
  const ridge = 1 - Math.abs(2 * vnoise(u * 0.03 + 11, z * 0.03 + 2) - 1);
  h += 22 * ridge * ridge * smooth(20, 110, a) * (1 + Math.max(0, -z) / 200);
  h += Math.max(0, -z - 220) * 0.6 * (0.6 + fbm(u * 0.02, z * 0.02));
  const d = Math.hypot((u - CABIN_U) * 0.8, z - CABIN_Z);
  const w = 1 - smooth(4, 9, d);
  return lerp(h, cabinGround, w);
};

const U_STEPS = [0, 1.5, 3, 5, 8, 12, 17, 23, 30, 38, 48, 60, 75, 92, 110, 130, 150, 175, 200];
const COLS = [...U_STEPS.slice(1).reverse().map((v) => -v), ...U_STEPS];
const ROWS = 210;
const Z_START = 40;
const Z_STEP = 2.2;

const tPos: number[] = [], tNor: number[] = [], tCol: number[] = [];
const vertex = (i: number, j: number): { p: V3; u: number; z: number } => {
  const u = COLS[i]!, z = Z_START - j * Z_STEP;
  return { p: [trailX(z) + u, heightAt(u, z), z], u, z };
};
const grid: { p: V3; u: number; z: number }[][] = [];
for (let j = 0; j <= ROWS; j += 1) {
  const row: { p: V3; u: number; z: number }[] = [];
  for (let i = 0; i < COLS.length; i += 1) row.push(vertex(i, j));
  grid.push(row);
}
const face = (A: { p: V3; u: number; z: number }, B: { p: V3; u: number; z: number }, C: { p: V3; u: number; z: number }): void => {
  const a = A.p, b = B.p, c = C.p;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const ny = n[1]!;
  const uu = (A.u + B.u + C.u) / 3, zz = (A.z + B.z + C.z) / 3;
  const onTrail = Math.abs(A.u) <= 1.5 && Math.abs(B.u) <= 1.5 && Math.abs(C.u) <= 1.5;
  const var1 = (hash2(uu * 3.7, zz * 1.9) - 0.5) * 0.08;
  const n1 = vnoise(uu * 0.08 + 20, zz * 0.08 + 4);
  let rgb: number[];
  if (onTrail) {
    rgb = [0.4 + var1, 0.45 + var1, 0.53 + var1];
  } else if (ny < 0.8 - 0.06 * n1) {
    const kk = hash2(uu, zz);
    const dark = 0.05 + 0.06 * kk;
    const patch = ny > 0.74 ? 0.3 : 0;
    rgb = [lerp(dark, 0.6, patch), lerp(dark, 0.66, patch), lerp(dark + 0.01, 0.78, patch)];
  } else {
    const t = clamp(0.35 + n1 * 0.8 + (ny - 0.88) * 1.5, 0, 1);
    rgb = [lerp(0.5, 0.88, t) + var1, lerp(0.6, 0.92, t) + var1, lerp(0.76, 0.97, t) + var1];
  }
  for (const v of k > 0 ? [A, B, C] : [A, C, B]) {
    tPos.push(...v.p);
    tNor.push(n[0]!, n[1]!, n[2]!);
    tCol.push(rgb[0]!, rgb[1]!, rgb[2]!, 1);
  }
};
for (let j = 0; j < ROWS; j += 1) {
  for (let i = 0; i < COLS.length - 1; i += 1) {
    face(grid[j]![i]!, grid[j + 1]![i]!, grid[j]![i + 1]!);
    face(grid[j]![i + 1]!, grid[j + 1]![i]!, grid[j + 1]![i + 1]!);
  }
}

const BG = "#c6cbd0";
const snowWhite = material.pbr({ color: "#f2f6fb", roughness: 0.95 });
const white = material.pbr({ color: "#ffffff", roughness: 0.92 });
const wood = material.pbr({ color: "#5b3a20", roughness: 0.9 });

const startZ = 24;
const eyeAt = (z: number): V3 => [trailX(z), rise(z) + 1.7, z];
const startEye = eyeAt(startZ);
const startTarget: V3 = [trailX(startZ - 14), rise(startZ - 14) + 1.75, startZ - 14];

let sc = scene({ background: BG })
  .camera(camera.perspective({ position: startEye, target: startTarget, fov: 62, near: 0.15, far: 700 }))
  .add(lights.hemisphere({ skyColor: "#e4e8ee", groundColor: "#8f9bad", intensity: 1.0 }))
  .add(lights.directional({ name: "overcast", position: [-50, 90, 30], target: [0, 0, 0], intensity: 1.5, color: "#f4f6fa" }))
  .add(effects.fog({ color: BG, density: 0.0085 }))
  .add(
    geometry.custom(
      geometry.define({
        positions: new Float32Array(tPos),
        normals: new Float32Array(tNor),
        colors: new Float32Array(tCol),
        indices: Array.from({ length: tPos.length / 3 }, (_, i) => i),
        bounds: { min: [-260, -10, -440], max: [260, 220, 60] }
      }),
      { name: "terrain", material: white, castShadow: false }
    )
  );

// ---------- rock outcrops ----------
const rocks: AuraTransformSpec[] = [], rockColors: string[] = [];
const caps: AuraTransformSpec[] = [];
const addRock = (u: number, z: number, s: number): void => {
  const h = heightAt(u, z);
  const x = trailX(z) + u;
  const sx = s * (0.9 + rand() * 0.8), sy = s * (0.6 + rand() * 0.7), sz = s * (0.9 + rand() * 0.8);
  rocks.push({ position: [x, h + sy * 0.15, z], rotation: [(rand() - 0.5) * 0.7, rand() * 6.28, (rand() - 0.5) * 0.7], scale: [sx, sy, sz] });
  rockColors.push(`hsl(${215 + Math.floor(rand() * 20)}, 7%, ${14 + Math.floor(rand() * 16)}%)`);
  if (s > 0.7) caps.push({ position: [x, h + sy * 0.15 + sy * 0.42, z], scale: [sx * 0.95, sy * 0.3, sz * 0.95] });
};
for (let i = 0; i < 110; i += 1) {
  const sgn = rand() < 0.5 ? -1 : 1;
  const u = sgn * (6 + rand() * 40);
  const z = 25 - rand() * 170;
  if (Math.hypot((u - CABIN_U) * 0.8, z - CABIN_Z) < 11) continue;
  addRock(u, z, 0.8 + rand() * 2.4);
}
for (let i = 0; i < 70; i += 1) {
  const sgn = rand() < 0.5 ? -1 : 1;
  addRock(sgn * (25 + rand() * 130), -120 - rand() * 220, 3 + rand() * 8);
}
sc = sc
  .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: white, castShadow: false }))
  .add(instances.sphere({ name: "rock-caps", transforms: caps, material: snowWhite, castShadow: false }));

// ---------- trail poles ----------
const poles: AuraTransformSpec[] = [], tapes: AuraTransformSpec[] = [], poleCaps: AuraTransformSpec[] = [];
let poleCount = 0;
for (let z = 14; z > -170; z -= 8) {
  const u = 2.4, x = trailX(z) + u, h = heightAt(u, z);
  const lx = (rand() - 0.5) * 0.1, lz = (rand() - 0.5) * 0.1;
  poles.push({ position: [x, h + 1.0, z], rotation: [lx, 0, lz], scale: [0.13, 2.4, 0.13] });
  tapes.push({ position: [x, h + 1.9, z], rotation: [lx, 0, lz], scale: [0.16, 0.28, 0.16] });
  poleCaps.push({ position: [x, h + 2.2, z], scale: [0.26, 0.1, 0.26] });
  poleCount += 1;
}
void poleCount;
sc = sc
  .add(instances.cylinder({ name: "poles", transforms: poles, material: wood, params: { radialSegments: 6 }, castShadow: false }))
  .add(instances.cylinder({ name: "pole-tape", transforms: tapes, material: material.pbr({ color: "#b8321f", roughness: 0.8 }), params: { radialSegments: 6 }, castShadow: false }))
  .add(instances.sphere({ name: "pole-caps", transforms: poleCaps, material: snowWhite, castShadow: false }));

// ---------- cabin ----------
const cabinX = trailX(CABIN_Z) + CABIN_U;
const logA = material.pbr({ color: "#6b4526", roughness: 0.9 });
const logB = material.pbr({ color: "#5a3a1e", roughness: 0.9 });
const darkWood = material.pbr({ color: "#33200f", roughness: 0.9 });
const glow = material.emissive({ color: "#ffb347", emissive: "#ff9a2e", emissiveIntensity: 3 });
const W = 5, D = 4, WALL = 2.6;
const cabinParts = [];
for (let i = 0; i < 8; i += 1) {
  const y = 0.17 + i * 0.33, m = i % 2 === 0 ? logA : logB;
  for (const sz of [-1, 1]) {
    cabinParts.push(primitives.cylinder({ name: `logx${i}_${sz}`, size: [0.36, W + 0.35, 0.36], material: m, castShadow: false }).position(0, y, sz * (D / 2)).rotate(0, 0, Math.PI / 2));
  }
  for (const sx of [-1, 1]) {
    cabinParts.push(primitives.cylinder({ name: `logz${i}_${sx}`, size: [0.36, D + 0.35, 0.36], material: m, castShadow: false }).position(sx * (W / 2), y + 0.16, 0).rotate(Math.PI / 2, 0, 0));
  }
}
const pitch = 0.5;
const slabLen = (D / 2 + 0.4) / Math.cos(pitch);
for (const s of [-1, 1]) {
  const cy = WALL + 0.76, cz = s * 1.2;
  cabinParts.push(primitives.box({ name: `roof${s}`, size: [W + 0.8, 0.18, slabLen], material: darkWood, castShadow: false }).position(0, cy, cz).rotate(s * pitch, 0, 0));
  cabinParts.push(
    primitives
      .box({ name: `roofsnow${s}`, size: [W + 0.95, 0.28, slabLen + 0.1], material: snowWhite, castShadow: false })
      .position(0, cy + Math.cos(pitch) * 0.2, cz + s * Math.sin(pitch) * 0.2)
      .rotate(s * pitch, 0, 0)
  );
}
cabinParts.push(
  primitives.box({ name: "ridgesnow", size: [W + 0.95, 0.3, 0.5], material: snowWhite, castShadow: false }).position(0, WALL + 1.44, 0),
  primitives.box({ name: "gable", size: [W - 0.1, 0.9, 1.5], material: logB, castShadow: false }).position(0, WALL + 0.4, 0),
  primitives.box({ name: "core", size: [W - 0.1, WALL, D - 0.1], material: darkWood, castShadow: false }).position(0, WALL / 2, 0),
  primitives.box({ name: "chimney", size: [0.55, 1.2, 0.55], material: material.pbr({ color: "#6a6866", roughness: 1 }), castShadow: false }).position(1.5, WALL + 1.5, -0.9),
  primitives.box({ name: "chimney-snow", size: [0.7, 0.14, 0.7], material: snowWhite, castShadow: false }).position(1.5, WALL + 2.14, -0.9),
  primitives.box({ name: "door", size: [0.12, 1.8, 0.9], material: darkWood, castShadow: false }).position(W / 2 + 0.2, 0.9, 0.9),
  primitives.box({ name: "win-front-frame", size: [1.25, 1.05, 0.1], material: darkWood, castShadow: false }).position(-0.6, 1.5, D / 2 + 0.2),
  primitives.box({ name: "win-front", size: [1.0, 0.8, 0.1], material: glow, castShadow: false }).position(-0.6, 1.5, D / 2 + 0.26),
  primitives.box({ name: "win-side-frame", size: [0.1, 1.05, 1.25], material: darkWood, castShadow: false }).position(W / 2 + 0.2, 1.5, -1.0),
  primitives.box({ name: "win-side", size: [0.1, 0.8, 1.0], material: glow, castShadow: false }).position(W / 2 + 0.26, 1.5, -1.0),
  primitives.box({ name: "step-snow", size: [1.4, 0.25, 1.4], material: snowWhite, castShadow: false }).position(W / 2 + 0.9, 0.1, 0.9),
  primitives.sphere({ name: "drift1", size: 1, material: snowWhite, castShadow: false }).position(-W / 2 - 0.4, 0.2, D / 2).scale([2.2, 0.9, 1.6]),
  primitives.sphere({ name: "drift2", size: 1, material: snowWhite, castShadow: false }).position(-0.5, 0.15, D / 2 + 0.7).scale([3, 0.6, 1.2]),
  primitives.sphere({ name: "drift3", size: 1, material: snowWhite, castShadow: false }).position(W / 2 + 0.3, 0.2, -D / 2 - 0.2).scale([1.8, 0.8, 2.2])
);
sc = sc
  .add(group("cabin", cabinParts, { position: [cabinX, cabinGround - 0.1, CABIN_Z], rotation: [0, 0.25, 0] }))
  .add(lights.point({ name: "cabin-glow", position: [cabinX + 1.5, cabinGround + 1.8, CABIN_Z + 3.8], color: "#ff9d42", intensity: 14, distance: 20 }));

// ---------- snow ----------
const BOX: V3 = [36, 20, 44];
const WIND: V3 = [-8, -3.5, 3];
const windLen = Math.hypot(...WIND);
const dir: V3 = [WIND[0] / windLen, WIND[1] / windLen, WIND[2] / windLen];
const streakRot: V3 = [Math.asin(clamp(-dir[1], -1, 1)), Math.atan2(dir[0], dir[2]), 0];

interface Flakes {
  id: string;
  n: number;
  base: Float32Array;
  vari: Float32Array;
  thick: number;
  len: number;
}
const makeFlakes = (id: string, n: number, thick: number, len: number): Flakes => {
  const base = new Float32Array(n * 3), vari = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    base[i * 3] = rand() * BOX[0];
    base[i * 3 + 1] = rand() * BOX[1];
    base[i * 3 + 2] = rand() * BOX[2];
    vari[i] = 0.7 + rand() * 0.6;
  }
  return { id, n, base, vari, thick, len };
};
const smallFlakes = makeFlakes("snow-small", 2250, 0.035, 0.7);
const largeFlakes = makeFlakes("snow-large", 750, 0.1, 1.3);
const flakeMat = material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1 });
const initialTransforms = (f: Flakes): AuraTransformSpec[] =>
  Array.from({ length: f.n }, (_, i) => ({
    position: [startEye[0] + f.base[i * 3]! - BOX[0] / 2, startEye[1] + f.base[i * 3 + 1]! - BOX[1] / 2, startEye[2] - 14 + f.base[i * 3 + 2]! - BOX[2] / 2] as V3,
    rotation: streakRot,
    scale: [f.thick, f.thick, f.len] as V3
  }));
sc = sc
  .add(instances.box({ name: "flakes-small", transforms: initialTransforms(smallFlakes), material: flakeMat, castShadow: false, frustumCulled: false }).runtime({ id: smallFlakes.id, mutable: true }))
  .add(instances.box({ name: "flakes-large", transforms: initialTransforms(largeFlakes), material: flakeMat, castShadow: false, frustumCulled: false }).runtime({ id: largeFlakes.id, mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
let frame = 0;
const disp: V3 = [0, 0, 0];
const mod = (a: number, m: number): number => ((a % m) + m) % m;
const SPEED = 1.5, Z_END = -118;
const PATH_LEN = startZ - Z_END;

const updateFlakes = (f: Flakes, center: V3, gust: number): void => {
  const out: AuraTransformSpec[] = new Array<AuraTransformSpec>(f.n);
  const lenMul = 1 + 0.8 * gust;
  for (let i = 0; i < f.n; i += 1) {
    const gustOnly = i % 3 === 2;
    const vis = gustOnly ? smooth(0.05, 0.6, gust) : 1;
    const ox = mod(f.base[i * 3]! + disp[0] - center[0], BOX[0]) - BOX[0] / 2;
    const oy = mod(f.base[i * 3 + 1]! + disp[1] - center[1], BOX[1]) - BOX[1] / 2;
    const oz = mod(f.base[i * 3 + 2]! + disp[2] - center[2], BOX[2]) - BOX[2] / 2;
    const v = f.vari[i]!;
    const sc3 = vis < 0.02 ? 0.0001 : vis;
    out[i] = {
      position: [center[0] + ox, center[1] + oy, center[2] + oz],
      rotation: streakRot,
      scale: [f.thick * v * sc3, f.thick * v * sc3, f.len * v * lenMul * sc3]
    };
  }
  app.nodes.require(f.id).setInstances(out);
};

app.onFrame((fr) => {
  const dt = Math.min(fr.dt, 0.1);
  t += dt;
  frame += 1;

  // gusts: slow periodic bursts
  const gs = Math.sin(t * 0.5 + 1.2) + 0.6 * Math.sin(t * 1.13 + 1.3);
  const gust = smooth(0.35, 1.3, gs);
  const speedMul = 1 + 0.7 * gust;
  disp[0] += WIND[0] * speedMul * dt;
  disp[1] += WIND[1] * speedMul * dt;
  disp[2] += WIND[2] * speedMul * dt;

  // camera walks up the trail and loops
  const walked = (t * SPEED) % PATH_LEN;
  const z = startZ - walked;
  const zt = z - 14;
  const eye: V3 = [
    trailX(z) + 0.07 * Math.sin(t * 1.7),
    rise(z) + 1.7 + 0.04 * Math.sin(t * 3.6) + 0.015 * Math.sin(t * 1.3),
    z
  ];
  const target: V3 = [trailX(zt) + 0.9 * Math.sin(t * 0.4), rise(zt) + 1.75 + 0.15 * Math.sin(t * 0.9), zt];
  app.camera?.setPose({ position: eye, target, roll: 0.015 * Math.sin(t * 1.8 + 1) }, { cut: true });

  const fx = target[0] - eye[0], fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fz) || 1;
  const center: V3 = [eye[0] + (fx / fl) * 14, eye[1] + 1, eye[2] + (fz / fl) * 14];
  updateFlakes(smallFlakes, center, gust);
  updateFlakes(largeFlakes, center, gust);

  if (frame % 6 === 0) app.atmosphere?.setFog({ color: BG, density: 0.0085 + 0.006 * gust });
});

await app.ready();
window.__EVAL_READY__ = true;
