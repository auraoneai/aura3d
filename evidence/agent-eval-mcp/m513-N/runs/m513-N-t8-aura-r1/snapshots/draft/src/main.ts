import { camera, createAuraApp, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

type V3 = [number, number, number];

// ---------- sun helpers ----------
const DAY = 20; // seconds per full cycle
const START_HOUR = 10;
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 60): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const dayFactor = (h: number): number => Math.max(0, Math.min(1, Math.sin(((h - 6) / 24) * Math.PI * 2) * 2.5 + 0.2));

// ---------- terrain (flat shaded, one normal and colour per face) ----------
const G = 56, S = 56;
const H = (x: number, z: number): number => {
  const r2 = x * x + z * z;
  const base = 6.5 * (1 - r2 / 520);
  const bumps = Math.sin(x * 0.55) * Math.cos(z * 0.5) * 0.9 + Math.sin(x * 0.23 + z * 0.31) * 1.1;
  return Math.max(-1.2, base + bumps * Math.max(0, Math.min(1, base / 3)));
};
const P = (i: number, j: number): V3 => {
  const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S;
  return [x, H(x, z), z];
};
const pos: number[] = [], nor: number[] = [], col: number[] = [];
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const jitter = ((Math.sin(a[0] * 12.9898 + a[2] * 78.233) * 43758.5453) % 1) * 0.05;
  const rgb = y < 0.35 ? [0.82, 0.74, 0.47] : y < 3.6 ? [0.2, 0.5, 0.18] : y < 5.2 ? [0.46, 0.43, 0.4] : [0.9, 0.9, 0.92];
  const shade = 1 + jitter;
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0]! * shade, rgb[1]! * shade, rgb[2]! * shade, 1);
  }
};
for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
  face(P(i, j), P(i, j + 1), P(i + 1, j));
  face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
}
const island = geometry.custom(
  geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 9, S / 2] }
  }),
  { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
);

// ---------- trees and rocks ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [], canopies: AuraTransformSpec[] = [], canopies2: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const canopyColors: string[] = [], canopyColors2: string[] = [], rockColors: string[] = [];
for (let tries = 0, placed = 0; tries < 600 && placed < 26; tries += 1) {
  const a = rand() * Math.PI * 2, r = 3 + rand() * 15;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < 0.9 || y > 4.6) continue;
  placed += 1;
  const s = 0.8 + rand() * 0.6;
  trunks.push({ position: [x, y + 0.7 * s, z], scale: [0.35 * s, 1.4 * s, 0.35 * s] });
  canopies.push({ position: [x, y + 2.3 * s, z], rotation: [0, rand() * 6, 0], scale: [2.4 * s, 2.6 * s, 2.4 * s] });
  canopies2.push({ position: [x, y + 3.6 * s, z], rotation: [0, rand() * 6, 0], scale: [1.7 * s, 2.2 * s, 1.7 * s] });
  const hue = 120 + Math.floor(rand() * 30), light = 24 + Math.floor(rand() * 10);
  canopyColors.push(`hsl(${hue}, 55%, ${light}%)`);
  canopyColors2.push(`hsl(${hue}, 55%, ${light + 6}%)`);
}
for (let tries = 0, placed = 0; tries < 600 && placed < 14; tries += 1) {
  const a = rand() * Math.PI * 2, r = 6 + rand() * 16;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < -0.2 || y > 3) continue;
  placed += 1;
  const s = 0.6 + rand() * 1.0;
  rocks.push({ position: [x, y + 0.2 * s, z], rotation: [rand(), rand() * 6, rand()], scale: [s, s * 0.7, s * 0.9] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 25)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });

// ---------- water ----------
const N = 220, SIZE = 480;
const wPos = new Float32Array((N + 1) ** 2 * 3), wNor = new Float32Array(wPos.length), wIdx: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  wPos.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
  wNor[v * 3 + 1] = 1;
  if (i < N && j < N) wIdx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float ph1 = dot(p, vec2(0.21, 0.13)) * 3.0 + clk * 1.6;
  float ph2 = dot(p, vec2(-0.17, 0.25)) * 3.0 + clk * 2.1;
  vPos = vec3(p.x, sin(ph1) * 0.3 + sin(ph2) * 0.2 - 0.1, p.y);
  vN = normalize(vec3(-cos(ph1) * 0.2 - cos(ph2) * 0.1, 1.0, -cos(ph1) * 0.12 + cos(ph2) * 0.12));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.5 + clk) - 0.5, 0.0, vnoise(vPos.xz * 1.5 - clk) - 0.5) * 0.3);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float d = clamp(dayK, 0.0, 1.0);
  vec3 skyDay = mix(vec3(0.62, 0.78, 0.92), vec3(0.2, 0.42, 0.78), clamp(reflect(-v, n).y, 0.0, 1.0));
  vec3 skyNight = mix(vec3(0.07, 0.09, 0.2), vec3(0.03, 0.04, 0.12), clamp(reflect(-v, n).y, 0.0, 1.0));
  vec3 skyCol = mix(skyNight, skyDay, d);
  vec3 deep = mix(vec3(0.015, 0.05, 0.12), vec3(0.03, 0.32, 0.45), d);
  float foam = smoothstep(0.62, 0.9, vnoise(vPos.xz * 0.8 + vec2(clk * 0.6, -clk * 0.4)) + n.x * 0.4);
  float glint = pow(max(dot(reflect(-normalize(sunDir), n), v), 0.0), 120.0);
  vec3 col = mix(deep, skyCol, clamp(fres * 0.9 + 0.12, 0.0, 1.0));
  col += vec3(1.0, 0.93, 0.78) * glint * 1.6 * d;
  col += vec3(0.08) * foam * (0.3 + d);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    clk: { type: "f32", value: 0 },
    dayK: { type: "f32", value: 1 },
    sunDir: { type: "vec3", value: [0.5, 0.45, 0.35] }
  }
});

// ---------- scene ----------
const s0 = sunAt(START_HOUR);
let sc = scene({ background: "#8fb4d8" })
  .camera(camera.orbit({ position: [0, 34, 62], target: [0, 1.5, 0], fov: 45, near: 1, far: 900, autoRotate: 0.1 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.0 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(island)
  .add(geometry.custom(
    geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] } }),
    { name: "water", material: water, castShadow: false }
  ).runtime({ id: "water", mutable: true }))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.9 }), params: { radialSegments: 5 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies2", transforms: canopies2, colors: canopyColors2, material: white, params: { radialSegments: 6 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

const app = createAuraApp("#app", { scene: sc });
let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const hour = (START_HOUR + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const k = dayFactor(hour);
  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  const sun = app.nodes.require("sun");
  sun.setPosition(...sunPos);
  // keep light from underneath the horizon from lighting the scene oddly: use a moon-like minimum
  sun.setLight?.({ intensity: 0.5 + 2.8 * k, color: k > 0.5 ? "#fff3dc" : "#a9b8ff" });
  app.nodes.require("hemi").setLight?.({ intensity: 0.35 + 0.8 * k });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const w = app.nodes.require("water");
  w.setUniform?.("clk", t);
  w.setUniform?.("dayK", k);
  const l = Math.hypot(sunPos[0], sunPos[1], sunPos[2]) || 1;
  w.setUniform?.("sunDir", [sunPos[0] / l, Math.max(0.15, sunPos[1] / l), sunPos[2] / l]);
});
await app.ready();
window.__EVAL_READY__ = true;
