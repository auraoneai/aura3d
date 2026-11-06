import { camera, createAuraApp, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

type V3 = [number, number, number];

const DAY_SECONDS = 20;
const START_HOUR = 9;

// ---------- helpers ----------
let seed = 424242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: V3): string => "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
const hash = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- island terrain ----------
const R = 12.5; // nominal island radius
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const base = 1 - (r / R) * (r / R);
  const n = Math.sin(x * 0.55 + 1.3) * Math.cos(z * 0.5 - 0.4) * 0.8 + Math.sin(x * 1.3 + z * 0.9) * 0.35 + Math.cos(z * 1.7 - x * 0.6) * 0.25;
  const h = base * 6.2 + n * clamp01(base + 0.35) - 0.25;
  return Math.max(-1.4, h);
};

const G = 48;
const S = 36;
const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const P = (i: number, j: number): V3 => {
  const edge = i === 0 || j === 0 || i === G || j === G;
  const jx = edge ? 0 : (hash(i, j) - 0.5) * 0.5;
  const jz = edge ? 0 : (hash(j + 17, i + 5) - 0.5) * 0.5;
  const x = (i / G - 0.5) * S + jx;
  const z = (j / G - 0.5) * S + jz;
  return [x, heightAt(x, z), z];
};
const face = (a: V3, b: V3, c: V3): void => {
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  const k = n[1] < 0 ? -1 : 1;
  n = [(n[0] * k) / len, (n[1] * k) / len, (n[2] * k) / len];
  const y = (a[1] + b[1] + c[1]) / 3;
  const slope = 1 - n[1];
  const jitter = (hash(a[0] * 7.3, a[2] * 3.1 + y) - 0.5) * 0.08;
  let rgb: V3;
  if (y < -0.1) rgb = [0.55, 0.5, 0.35];
  else if (y < 0.5) rgb = [0.86, 0.78, 0.5];
  else if (slope > 0.32 || y > 4.6) rgb = y > 5.2 ? [0.62, 0.6, 0.58] : [0.5, 0.45, 0.4];
  else if (y < 3.0) rgb = [0.3, 0.58, 0.22];
  else rgb = [0.22, 0.46, 0.2];
  const out: V3 = [rgb[0] + jitter, rgb[1] + jitter, rgb[2] + jitter];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0], n[1], n[2]);
    col.push(out[0], out[1], out[2], 1);
  }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    if ((i + j) % 2 === 0) {
      face(P(i, j), P(i, j + 1), P(i + 1, j));
      face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
    } else {
      face(P(i, j), P(i, j + 1), P(i + 1, j + 1));
      face(P(i, j), P(i + 1, j + 1), P(i + 1, j));
    }
  }
}
const terrain = geometry.custom(
  geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -1.5, -S / 2], max: [S / 2, 8, S / 2] }
  }),
  { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
);

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crowns: AuraTransformSpec[] = [];
const crownColors: string[] = [];
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
const placed: Array<[number, number]> = [];
for (let tries = 0; tries < 600 && trunks.length < 26; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 2 + rand() * (R - 3);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightAt(x, z);
  if (h < 0.7 || h > 4.2) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.2)) continue;
  placed.push([x, z]);
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, h + 0.5 * s, z], scale: [0.35 * s, 1.0 * s, 0.35 * s] });
  const c = `hsl(${105 + Math.floor(rand() * 40)}, 48%, ${28 + Math.floor(rand() * 12)}%)`;
  crowns.push({ position: [x, h + 1.7 * s, z], rotation: [0, rand() * 6, 0], scale: [2.0 * s, 2.2 * s, 2.0 * s] });
  crownColors.push(c);
  crowns.push({ position: [x, h + 2.9 * s, z], rotation: [0, rand() * 6, 0], scale: [1.4 * s, 1.8 * s, 1.4 * s] });
  crownColors.push(c);
}
for (let tries = 0; tries < 400 && rocks.length < 14; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 3 + rand() * (R + 2);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightAt(x, z);
  if (h < -0.3 || h > 3.5) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.6)) continue;
  placed.push([x, z]);
  const s = 0.45 + rand() * 0.8;
  rocks.push({ position: [x, h + s * 0.15, z], rotation: [rand() * 0.6, rand() * 6, rand() * 0.6], scale: [s * 1.5, s, s * 1.2] });
  rockColors.push(`hsl(${25 + Math.floor(rand() * 15)}, 6%, ${40 + Math.floor(rand() * 18)}%)`);
}

// ---------- water ----------
const N = 130, SIZE = 260;
const wPos = new Float32Array((N + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    wPos.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < N && j < N) wIdx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
float waveH(vec2 p, float t) {
  return sin(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.3) * 0.30
       + sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.7) * 0.20
       + sin(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.3) * 0.08;
}
void main() {
  vec3 p = vec3(position.x, waveH(position.xz, waveClock), position.z);
  vPos = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float r = length(vPos.xz);
  float shallowK = smoothstep(20.0, 12.0, r);
  vec3 body = mix(deepCol, shallowCol, shallowK);
  body *= 0.8 + 0.5 * clamp(vPos.y * 1.6 + 0.5, 0.0, 1.0);
  float diff = max(dot(n, lightDir), 0.0);
  body *= lum * (0.7 + 0.6 * diff);
  vec3 c = mix(body, skyCol, clamp(fres * 0.85, 0.0, 0.85));
  float glint = pow(max(dot(reflect(-lightDir, n), v), 0.0), 80.0);
  c += lightCol * glint * glintK;
  c += vec3(1.0) * smoothstep(0.38, 0.55, vPos.y) * 0.25 * lum;
  float f = smoothstep(80.0, 125.0, r);
  c = mix(c, fogCol, f);
  outColor = vec4(c, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    deepCol: { type: "vec3", value: [0.05, 0.3, 0.5] },
    shallowCol: { type: "vec3", value: [0.2, 0.7, 0.72] },
    skyCol: { type: "vec3", value: [0.6, 0.78, 0.92] },
    fogCol: { type: "vec3", value: [0.65, 0.8, 0.92] },
    lightCol: { type: "vec3", value: [1, 0.93, 0.78] },
    lightDir: { type: "vec3", value: [0.3, 0.8, 0.5] },
    lum: { type: "f32", value: 1 },
    glintK: { type: "f32", value: 1 }
  }
});

// ---------- sun / sky ----------
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 40): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};

const s0 = sunAt(START_HOUR);
const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .camera(camera.orbit({ position: [0, 16, 31], target: [0, 1.5, 0], fov: 46, near: 0.5, far: 500, autoRotate: 0.12 }))
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#4a5538", intensity: 1.1 }).runtime({ id: "ambient", mutable: true }))
    .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.5, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(terrain)
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns", transforms: crowns, colors: crownColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }), params: { widthSegments: 5, heightSegments: 4 } }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
});

const DAY_SKY: V3 = [0.62, 0.78, 0.93];
const NIGHT_SKY: V3 = [0.03, 0.05, 0.12];
const DUSK_SKY: V3 = [0.95, 0.55, 0.36];
const DEEP_DAY: V3 = [0.04, 0.3, 0.5];
const DEEP_NIGHT: V3 = [0.03, 0.08, 0.2];
const SHALLOW_DAY: V3 = [0.22, 0.72, 0.72];
const SHALLOW_NIGHT: V3 = [0.05, 0.16, 0.3];

let clock = 0;
const update = (): void => {
  const hour = (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
  const s = sunAt(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const day = smooth(-0.12, 0.35, sinE);
  const twilight = Math.exp(-((sinE / 0.2) ** 2)) * 0.65;

  const sunCol = mix3([1, 0.55, 0.3], [1, 0.95, 0.85], smooth(0, 0.5, sinE));
  const sun = app.nodes.require("sun");
  sun.setPosition(...dirOf(s.elevationDeg, s.azimuthDeg));
  sun.setLight?.({ intensity: 3.6 * smooth(-0.02, 0.3, sinE), color: hex(sunCol) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...dirOf(-s.elevationDeg, s.azimuthDeg + 180));
  moon.setLight?.({ intensity: 0.15 + 0.7 * (1 - day) });
  app.nodes.require("ambient").setLight?.({ intensity: 0.45 + 0.8 * day });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const skyCol = mix3(mix3(NIGHT_SKY, DAY_SKY, day), DUSK_SKY, twilight);
  const sunUp = sinE > -0.05;
  const ld = sunUp ? dirOf(s.elevationDeg, s.azimuthDeg, 1) : dirOf(-s.elevationDeg, s.azimuthDeg + 180, 1);
  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", clock);
  w.setUniform?.("deepCol", mix3(DEEP_NIGHT, DEEP_DAY, day));
  w.setUniform?.("shallowCol", mix3(SHALLOW_NIGHT, SHALLOW_DAY, day));
  w.setUniform?.("skyCol", skyCol);
  w.setUniform?.("fogCol", skyCol);
  w.setUniform?.("lightDir", ld);
  w.setUniform?.("lightCol", sunUp ? sunCol : [0.6, 0.72, 1]);
  w.setUniform?.("lum", 0.4 + 0.8 * day);
  w.setUniform?.("glintK", sunUp ? 1.4 * smooth(-0.05, 0.2, sinE) : 0.5);
};

app.onFrame((f) => {
  clock += f.dt;
  update();
});
await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
