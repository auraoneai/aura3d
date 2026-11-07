import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const DAY_SECONDS = 20; // one full 24 h cycle
const START_HOUR = 8;

// ---------- helpers ----------
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
  (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
  (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t
];
const hex = (c: readonly number[]): string =>
  "#" + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("");

let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash2 = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- island height field ----------
const SEA_FLOOR = -1.6;
const height = (x: number, z: number): number => {
  const ang = Math.atan2(z, x);
  const d = Math.hypot(x, z) * (1 + 0.13 * Math.sin(ang * 3 + 0.7) + 0.07 * Math.sin(ang * 5 + 2.1));
  const mask = clamp(1 - d / 16, 0, 1);
  const base = 7.4 * Math.pow(mask, 1.15);
  const bumps = (0.9 * Math.sin(x * 0.38 + 1.0) * Math.cos(z * 0.33) + 0.35 * Math.sin(x * 0.85 + z * 0.65)) * Math.min(1, mask * 3);
  return SEA_FLOOR + base + bumps;
};

// ---------- flat-shaded terrain (non-indexed triangles, one normal and colour per face) ----------
const N = 40;
const SIZE = 48;
const CELL = SIZE / N;
const grid: [number, number, number][] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const edge = i === 0 || j === 0 || i === N || j === N;
    const jx = edge ? 0 : (hash2(i, j) - 0.5) * CELL * 0.6;
    const jz = edge ? 0 : (hash2(j + 17, i + 5) - 0.5) * CELL * 0.6;
    const x = (i / N - 0.5) * SIZE + jx;
    const z = (j / N - 0.5) * SIZE + jz;
    grid.push([x, height(x, z) + (hash2(i + 3, j + 9) - 0.5) * 0.25, z]);
  }
}
const at = (i: number, j: number): [number, number, number] => grid[j * (N + 1) + i] as [number, number, number];

const triCount = N * N * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices: number[] = [];
let tri = 0;
const addTri = (p0: number[], p1: number[], p2: number[], seedA: number, seedB: number): void => {
  let a = p0, b = p1, c = p2;
  const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  let nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
  let ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
  let nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
  if (ny < 0) {
    [b, c] = [c, b];
    nx = -nx; ny = -ny; nz = -nz;
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const h = (a[1]! + b[1]! + c[1]!) / 3;
  let col: number[];
  if (h < -0.15) col = [0.55, 0.5, 0.36];
  else if (h < 0.55) col = [0.88, 0.8, 0.54];
  else if (h < 2.2) col = [0.36, 0.68, 0.24];
  else if (h < 3.7) col = [0.24, 0.55, 0.22];
  else if (h < 5.0) col = [0.52, 0.49, 0.46];
  else col = [0.9, 0.9, 0.92];
  const shadeVar = 0.9 + hash2(seedA, seedB) * 0.2;
  [a, b, c].forEach((p, k) => {
    const v = tri * 3 + k;
    positions.set([p[0]!, p[1]!, p[2]!], v * 3);
    normals.set([nx, ny, nz], v * 3);
    colors.set([col[0]! * shadeVar, col[1]! * shadeVar, col[2]! * shadeVar, 1], v * 4);
    indices.push(v);
  });
  tri += 1;
};
for (let j = 0; j < N; j += 1) {
  for (let i = 0; i < N; i += 1) {
    const p00 = at(i, j), p10 = at(i + 1, j), p01 = at(i, j + 1), p11 = at(i + 1, j + 1);
    if ((i + j) % 2 === 0) {
      addTri(p00, p01, p10, i, j);
      addTri(p10, p01, p11, i + 100, j);
    } else {
      addTri(p00, p01, p11, i, j + 100);
      addTri(p00, p11, p10, i + 200, j);
    }
  }
}

// ---------- water grid ----------
const WN = 160;
const WSIZE = 320;
const wPositions = new Float32Array((WN + 1) ** 2 * 3);
const wNormals = new Float32Array(wPositions.length);
const wIndices: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    wPositions.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
    wNormals[v * 3 + 1] = 1;
    if (i < WN && j < WN) wIndices.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
float waveH(vec2 p, float t) {
  return sin(p.x * 0.45 + p.y * 0.28 + t * 1.1) * 0.17
       + sin(p.x * -0.36 + p.y * 0.55 + t * 1.4) * 0.12
       + sin(p.x * 0.9 + p.y * 0.7 + t * 2.1) * 0.05;
}
void main() {
  vec3 p = position;
  p.y += waveH(p.xz, waveClock);
  vPos = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.001);
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float r = length(vPos.xz);
  float shore = smoothstep(21.0, 11.0, r);
  vec3 deep = vec3(0.03, 0.22, 0.42);
  vec3 shallow = vec3(0.10, 0.66, 0.68);
  vec3 body = mix(deep, shallow, shore);
  body += vec3(0.05, 0.08, 0.09) * clamp(vPos.y * 3.0 + 0.3, 0.0, 1.0);
  float diff = clamp(dot(n, sunDirW), 0.0, 1.0);
  vec3 lit = body * (mix(0.16, 0.8, dayAmt) + 0.5 * diff * dayAmt) * mix(vec3(1.0), sunCol, 0.35);
  vec3 col = mix(lit, skyCol, clamp(fresnel * 0.85 + 0.05, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-sunDirW, n), v), 0.0), 80.0);
  col += sunCol * glint * 1.6 * glintAmt;
  col = mix(col, horizCol, smoothstep(70.0, 230.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    dayAmt: { type: "f32", value: 1 },
    glintAmt: { type: "f32", value: 1 },
    sunDirW: { type: "vec3", value: [0.5, 0.6, 0.3] },
    sunCol: { type: "vec3", value: [1, 0.95, 0.85] },
    skyCol: { type: "vec3", value: [0.5, 0.72, 0.95] },
    horizCol: { type: "vec3", value: [0.75, 0.85, 0.95] }
  },
  receiveShadow: false,
  castShadow: false
});

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crownLow: AuraTransformSpec[] = [];
const crownHigh: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
for (let tries = 0, placed = 0; tries < 600 && placed < 26; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 2 + rand() * 11;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 0.9 || h > 3.9) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, h + 0.55 * s, z], scale: [0.3 * s, 1.3 * s, 0.3 * s] });
  crownLow.push({ position: [x, h + 1.7 * s, z], scale: [2.0 * s, 2.0 * s, 2.0 * s] });
  crownHigh.push({ position: [x, h + 2.8 * s, z], scale: [1.4 * s, 1.7 * s, 1.4 * s] });
  placed += 1;
}
for (let tries = 0, placed = 0; tries < 600 && placed < 14; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 3 + rand() * 12;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < -0.5 || h > 3.0) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({
    position: [x, h + 0.15 * s, z],
    rotation: [rand() * 0.8, rand() * Math.PI, rand() * 0.8],
    scale: [1.3 * s, 0.9 * s, 1.1 * s]
  });
  placed += 1;
}

// ---------- sun / sky model ----------
const sunAngles = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 68,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirFrom = (elevationDeg: number, azimuthDeg: number): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaleV = (v: readonly number[], k: number): [number, number, number] => [(v[0] ?? 0) * k, (v[1] ?? 0) * k, (v[2] ?? 0) * k];

const s0 = sunAngles(START_HOUR);
const d0 = dirFrom(s0.elevationDeg, s0.azimuthDeg);

const app = createAuraApp("#app", {
  scene: scene({ background: "#9fc4e8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "hemi", skyColor: "#cfe3ff", groundColor: "#4d5a3c", intensity: 0.6 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: scaleV(d0, 45), target: [0, 0, 0], intensity: 3.2, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: scaleV(d0, -45), target: [0, 0, 0], intensity: 0, color: "#9db8ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -3, -SIZE / 2], max: [SIZE / 2, 9, SIZE / 2] } }),
      { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
    ))
    .add(geometry.custom(
      geometry.define({ positions: wPositions, normals: wNormals, indices: wIndices, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4528", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crownLow", transforms: crownLow, material: material.pbr({ color: "#2c7a3a", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crownHigh", transforms: crownHigh, material: material.pbr({ color: "#3a9447", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#8a8780", roughness: 1 }) }))
    .add(effects.fog({ color: "#b7d2ea", density: 0.003 }))
    .camera(camera.perspective({ position: [30, 17, 0], target: [0, 1, 0], fov: 45, near: 0.5, far: 600 }))
});

let clock = 0;
const CAM_R = 34, CAM_H = 17;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
  const s = sunAngles(hour);
  const e = s.elevationDeg;
  const sd = dirFrom(e, s.azimuthDeg);
  const md = scaleV(sd, -1);

  const dayF = smooth(-6, 20, e);
  const duskF = Math.exp(-((e / 9) ** 2));
  const upDay = smooth(-2, 10, e);

  const horizon = mix3(mix3([0.05, 0.07, 0.15], [0.74, 0.85, 0.95], dayF), [0.98, 0.58, 0.36], duskF * 0.75);
  const zenith = mix3(mix3([0.02, 0.03, 0.09], [0.35, 0.58, 0.92], dayF), [0.42, 0.4, 0.62], duskF * 0.4);
  const sunColor = mix3([1, 0.95, 0.85], [1, 0.55, 0.28], duskF);
  const moonUp = smooth(2, -10, e);

  const sun = app.nodes.require("sun");
  sun.setPosition(...scaleV(sd, 45));
  sun.setLight?.({ intensity: 3.6 * upDay, color: hex(sunColor) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...scaleV(md, 45));
  moon.setLight?.({ intensity: 0.9 * moonUp });
  app.nodes.require("hemi").setLight?.({
    intensity: 0.28 + 0.5 * dayF,
    color: hex(mix3([0.35, 0.45, 0.8], [0.81, 0.89, 1], dayF))
  });

  // Water follows the strongest light: sun by day, moon by night.
  const w = app.nodes.require("water");
  const lightDir = e > -3 ? sd : md;
  const lightCol = e > -3 ? sunColor : [0.6, 0.72, 1];
  w.setUniform?.("waveClock", clock);
  w.setUniform?.("dayAmt", dayF);
  w.setUniform?.("glintAmt", e > -3 ? upDay : 0.45 * moonUp);
  w.setUniform?.("sunDirW", lightDir);
  w.setUniform?.("sunCol", [lightCol[0] ?? 1, lightCol[1] ?? 1, lightCol[2] ?? 1]);
  w.setUniform?.("skyCol", mix3(horizon, zenith, 0.55));
  w.setUniform?.("horizCol", horizon);

  app.atmosphere?.setSky({ sun: { elevationDeg: e, azimuthDeg: s.azimuthDeg, intensity: 1 } });
  app.atmosphere?.setFog({ color: hex(horizon), density: 0.003 });

  const ca = clock * 0.12;
  app.camera?.setPose({ position: [Math.cos(ca) * CAM_R, CAM_H, Math.sin(ca) * CAM_R], target: [0, 1, 0] }, { cut: true });
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
