import { camera, createAuraApp, geometry, instances, interactions, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- time of day
const DAY_SECONDS = 20; // one full 24h cycle
const fixedHour = new URLSearchParams(location.search).get("hour");
const HOUR0 = 8.5;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const sunAngles = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 62,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirFrom = (elevationDeg: number, azimuthDeg: number): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaleVec = (v: readonly [number, number, number], s: number): [number, number, number] => [v[0] * s, v[1] * s, v[2] * s];
const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
  (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
  (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t
];
const hex = (c: readonly number[]): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------- island terrain
const SIZE = 30;
const CELLS = 34;
const hash = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const R = 10 + 1.6 * Math.sin(3 * th + 1) + 1.0 * Math.sin(5 * th + 2);
  const u = r / R;
  const dome = 4.1 * (1 - u * u) - 0.5;
  const bumps = 0.55 * Math.sin(x * 0.9 + 0.4) * Math.cos(z * 0.8) * clamp01(1.3 - u);
  const hill = 1.3 * Math.exp(-(((x + 3) ** 2 + (z - 2) ** 2) / 8));
  return Math.max(-2.5, dome + bumps + hill);
};

const vx = (i: number, j: number): [number, number, number] => {
  const edge = i === 0 || j === 0 || i === CELLS || j === CELLS;
  const jit = edge ? 0 : 0.3;
  const x = (i / CELLS - 0.5) * SIZE + (hash(i, j) - 0.5) * jit * (SIZE / CELLS) * 2;
  const z = (j / CELLS - 0.5) * SIZE + (hash(j + 17, i + 5) - 0.5) * jit * (SIZE / CELLS) * 2;
  return [x, height(x, z), z];
};
const grid: [number, number, number][] = [];
for (let j = 0; j <= CELLS; j += 1) for (let i = 0; i <= CELLS; i += 1) grid.push(vx(i, j));

const triCount = CELLS * CELLS * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices: number[] = [];
let tri = 0;
const faceColor = (h: number, n: number): [number, number, number] => {
  const j = 0.92 + hash(n, 3) * 0.16;
  let c: [number, number, number];
  if (h < -0.1) c = [0.5, 0.45, 0.32];
  else if (h < 0.45) c = [0.86, 0.76, 0.5];
  else if (h < 2.1) c = [0.27 + hash(n, 9) * 0.06, 0.55, 0.2];
  else if (h < 3.1) c = [0.34, 0.47, 0.2];
  else c = [0.55, 0.5, 0.45];
  return [c[0] * j, c[1] * j, c[2] * j];
};
const addTri = (a: readonly number[], b: readonly number[], c: readonly number[]): void => {
  let p0 = a, p1 = b, p2 = c;
  const ux = p1[0]! - p0[0]!, uy = p1[1]! - p0[1]!, uz = p1[2]! - p0[2]!;
  const wx = p2[0]! - p0[0]!, wy = p2[1]! - p0[1]!, wz = p2[2]! - p0[2]!;
  let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  if (ny < 0) {
    [p1, p2] = [p2, p1];
    nx = -nx; ny = -ny; nz = -nz;
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  const col = faceColor((p0[1]! + p1[1]! + p2[1]!) / 3, tri);
  [p0, p1, p2].forEach((p, k) => {
    const o = tri * 9 + k * 3;
    positions.set([p[0]!, p[1]!, p[2]!], o);
    normals.set([nx / len, ny / len, nz / len], o);
    colors.set([col[0], col[1], col[2], 1], tri * 12 + k * 4);
    indices.push(tri * 3 + k);
  });
  tri += 1;
};
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const a = grid[j * (CELLS + 1) + i]!;
    const b = grid[j * (CELLS + 1) + i + 1]!;
    const c = grid[(j + 1) * (CELLS + 1) + i]!;
    const d = grid[(j + 1) * (CELLS + 1) + i + 1]!;
    if ((i + j) % 2 === 0) { addTri(a, c, b); addTri(b, c, d); } else { addTri(a, c, d); addTri(a, d, b); }
  }
}

// ---------------------------------------------------------------- trees and rocks
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let tries = 0; tries < 400 && trunks.length < 18; tries += 1) {
  const x = (rand() - 0.5) * 20, z = (rand() - 0.5) * 20;
  const h = height(x, z);
  if (h < 0.7 || h > 2.7) continue;
  if (trunks.some((t) => Math.hypot((t.position?.[0] ?? 0) - x, (t.position?.[2] ?? 0) - z) < 1.8)) continue;
  const s = 0.75 + rand() * 0.6;
  trunks.push({ position: [x, h + 0.45 * s, z], scale: [0.3 * s, 0.9 * s, 0.3 * s] });
  crownsLow.push({ position: [x, h + 1.4 * s, z], rotation: [0, rand() * 3, 0], scale: [1.7 * s, 1.7 * s, 1.7 * s] });
  crownsHigh.push({ position: [x, h + 2.4 * s, z], rotation: [0, rand() * 3, 0], scale: [1.2 * s, 1.5 * s, 1.2 * s] });
}
for (let tries = 0; tries < 400 && rocks.length < 12; tries += 1) {
  const x = (rand() - 0.5) * 24, z = (rand() - 0.5) * 24;
  const h = height(x, z);
  if (h < -0.3 || h > 0.9) continue;
  const s = 0.4 + rand() * 0.7;
  rocks.push({ position: [x, h + s * 0.2, z], rotation: [rand() * 1.5, rand() * 6, rand() * 1.5], scale: [s * 1.3, s * 0.9, s] });
  const g = 0.42 + rand() * 0.2;
  rockColors.push(hex([g, g * 0.97, g * 0.92]));
}

// ---------------------------------------------------------------- water
const WN = 150;
const WSIZE = 240;
const wpos = new Float32Array((WN + 1) ** 2 * 3);
const wnor = new Float32Array(wpos.length);
const widx: number[] = [];
for (let j = 0; j <= WN; j += 1) for (let i = 0; i <= WN; i += 1) {
  const v = j * (WN + 1) + i;
  wpos.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
  wnor[v * 3 + 1] = 1;
  if (i < WN && j < WN) widx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vec3 p = position;
  float t = waveClock;
  p.y = sin(dot(p.xz, vec2(0.52, 0.31)) + t * 1.3) * 0.16
      + sin(dot(p.xz, vec2(-0.37, 0.58)) + t * 1.7) * 0.11
      + sin(dot(p.xz, vec2(0.91, -0.66)) + t * 2.3) * 0.05;
  vPos = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
#include <colorspace_decode>
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  vec3 deep = a3dSrgbToLinear(vec3(0.05, 0.36, 0.52));
  vec3 shallow = a3dSrgbToLinear(vec3(0.16, 0.66, 0.74));
  vec3 body = mix(deep, shallow, clamp(vPos.y * 2.5 + 0.45, 0.0, 1.0));
  body *= (0.25 + 0.75 * waterLight);
  vec3 sky = a3dSrgbToLinear(skyCol);
  vec3 col = mix(body, sky, clamp(fres * 0.85 + 0.08, 0.0, 1.0));
  float crest = smoothstep(0.17, 0.27, vPos.y);
  col = mix(col, vec3(0.9) * (0.2 + 0.8 * waterLight), crest * 0.6);
  float g = pow(max(dot(reflect(-glintDir, n), v), 0.0), 60.0);
  col += a3dSrgbToLinear(glintCol) * g * 1.5;
  float d = length(vPos.xz - cameraPosition.xz);
  col = mix(col, sky, smoothstep(45.0, 115.0, d) * 0.85);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    waterLight: { type: "f32", value: 1 },
    skyCol: { type: "vec3", value: [0.55, 0.75, 0.95] },
    glintDir: { type: "vec3", value: [0.3, 0.8, 0.3] },
    glintCol: { type: "vec3", value: [1, 0.9, 0.7] }
  }
});

// ---------------------------------------------------------------- scene
const h0 = fixedHour === null ? HOUR0 : Number(fixedHour);
const s0 = sunAngles(h0);
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "ambient", skyColor: "#b8d0f0", groundColor: "#4a5a38", intensity: 1 }).runtime({ id: "ambient", mutable: true }))
    .add(lights.directional({ name: "sun", position: scaleVec(dirFrom(s0.elevationDeg, s0.azimuthDeg), 40), target: [0, 0, 0], intensity: 4, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: scaleVec(dirFrom(-s0.elevationDeg, s0.azimuthDeg + 180), 40), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -3, -SIZE / 2], max: [SIZE / 2, 6, SIZE / 2] } }),
      { name: "island", material: white }
    ))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4528", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns-low", transforms: crownsLow, material: material.pbr({ color: "#2f7a3a", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns-high", transforms: crownsHigh, material: material.pbr({ color: "#3b8f45", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .add(geometry.custom(
      geometry.define({ positions: wpos, normals: wnor, indices: widx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(interactions.orbit({ target: [0, 1, 0], position: [21, 12, 23], autoRotate: 0.12 }))
    .camera(camera.orbit({ position: [21, 12, 23], target: [0, 1, 0], fov: 46, near: 0.5, far: 500 }))
});

const DAY_SKY = [0.55, 0.74, 0.94];
const DUSK_SKY = [0.9, 0.55, 0.4];
const NIGHT_SKY = [0.03, 0.05, 0.13];
let clock = 0;
let readySet = false;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = fixedHour === null ? (h0 + (clock / DAY_SECONDS) * 24) % 24 : h0;
  const s = sunAngles(hour);
  const sd = dirFrom(s.elevationDeg, s.azimuthDeg);
  const md = dirFrom(-s.elevationDeg, s.azimuthDeg + 180);
  const dayF = smoothstep(-6, 14, s.elevationDeg);
  const warm = 1 - smoothstep(4, 28, s.elevationDeg);

  const sunColor = mix3([1, 0.95, 0.82], [1, 0.58, 0.3], warm);
  app.nodes.require("sun").setPosition(...scaleVec(sd, 40)).setLight?.({ intensity: 4.2 * smoothstep(-2, 12, s.elevationDeg), color: hex(sunColor) });
  app.nodes.require("moon").setPosition(...scaleVec(md, 40)).setLight?.({ intensity: 0.7 * (1 - dayF) });
  app.nodes.require("ambient").setLight?.({
    intensity: 0.3 + 0.9 * dayF,
    color: hex(mix3([0.3, 0.38, 0.65], mix3([0.72, 0.8, 0.95], [1, 0.8, 0.65], warm * 0.6), dayF))
  });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const horizon = mix3(NIGHT_SKY, mix3(DAY_SKY, DUSK_SKY, warm * 0.8), dayF);
  const sunUp = s.elevationDeg > 0;
  const gd = sunUp ? sd : md;
  const gc = sunUp ? sunColor : [0.55, 0.65, 0.95];
  const glintK = sunUp ? smoothstep(0, 10, s.elevationDeg) : 0.4 * smoothstep(0, 10, -s.elevationDeg);
  app.nodes.require("water").setUniform?.("waveClock", clock * 1.2);
  app.nodes.require("water").setUniform?.("waterLight", dayF);
  app.nodes.require("water").setUniform?.("skyCol", horizon);
  app.nodes.require("water").setUniform?.("glintDir", gd);
  app.nodes.require("water").setUniform?.("glintCol", [gc[0]! * glintK, gc[1]! * glintK, gc[2]! * glintK]);

  if (!readySet) {
    readySet = true;
    requestAnimationFrame(() => { window.__EVAL_READY__ = true; });
  }
});
await app.ready();
