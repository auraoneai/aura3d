import { camera, createAuraApp, environments, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

// ---------- helpers ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

type V3 = [number, number, number];

// ---------- island terrain (flat-shaded, non-indexed) ----------
const R = 17;
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const d = r / R;
  const bump = Math.sin(x * 0.55 + 1.3) * Math.cos(z * 0.47) * 0.9 + Math.sin(x * 0.21 - z * 0.33) * 1.2;
  const fall = Math.max(0, 1 - d * d);
  const h = fall * 6.5 + bump * Math.min(1, fall * 2.5) * 0.8 + (d > 1 ? -(d - 1) * 6 : 0);
  return Math.max(-2, h);
};

const G = 56, S = 46;
const pos: number[] = [], nor: number[] = [], col: number[] = [];
const P = (i: number, j: number): V3 => {
  const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S;
  return [x, heightAt(x, z), z];
};
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
  const k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const v = (rand() - 0.5) * 0.12;
  let rgb: number[];
  if (y < -0.3) rgb = [0.45, 0.4, 0.28];
  else if (y < 0.9) rgb = [0.85 + v, 0.76 + v, 0.5 + v];
  else if (y < 4.4) rgb = [0.2 + v, 0.5 + v * 2, 0.17 + v];
  else rgb = [0.5 + v, 0.46 + v, 0.42 + v];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0]!, rgb[1]!, rgb[2]!, 1);
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

// ---------- water grid ----------
const N = 220, SIZE = 360;
const wPos = new Float32Array((N + 1) ** 2 * 3), wNor = new Float32Array(wPos.length), wIdx: number[] = [];
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
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  vec2 k1 = vec2(0.45, 0.28), k2 = vec2(-0.31, 0.5), k3 = vec2(0.8, -0.6);
  float p1 = dot(p, k1) + clk * 1.3, p2 = dot(p, k2) + clk * 1.7, p3 = dot(p, k3) + clk * 2.1;
  float h = sin(p1) * 0.22 + sin(p2) * 0.15 + sin(p3) * 0.06;
  vec2 g = k1 * cos(p1) * 0.22 + k2 * cos(p2) * 0.15 + k3 * cos(p3) * 0.06;
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 sunDir = normalize(vec3(sin(sunA) * cos(sunE), sin(sunE), -cos(sunA) * cos(sunE)));
  float day = smoothstep(-0.15, 0.3, sin(sunE));
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.5 + clk * 0.7) - 0.5, 0.0, vnoise(vPos.xz * 1.5 - clk * 0.7) - 0.5) * 0.3);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float up = clamp(reflect(-v, n).y, 0.0, 1.0);
  vec3 skyDay = mix(vec3(0.62, 0.78, 0.92), vec3(0.2, 0.42, 0.78), up);
  vec3 skyDusk = mix(vec3(0.95, 0.5, 0.3), vec3(0.3, 0.3, 0.55), up);
  vec3 skyNight = mix(vec3(0.04, 0.07, 0.15), vec3(0.02, 0.04, 0.1), up);
  float dusk = 1.0 - smoothstep(0.0, 0.5, abs(sin(sunE) - 0.05) * 2.0);
  vec3 skyCol = mix(skyNight, skyDay, day);
  skyCol = mix(skyCol, skyDusk, dusk * 0.6);
  vec3 deep = mix(vec3(0.01, 0.04, 0.09), vec3(0.03, 0.30, 0.42), day);
  vec3 shallow = mix(vec3(0.02, 0.07, 0.12), vec3(0.1, 0.55, 0.6), day);
  float r = length(vPos.xz);
  float shore = 1.0 - smoothstep(R0, R0 + 9.0, r);
  vec3 base = mix(deep, shallow, shore);
  float diffuse = max(dot(n, sunDir), 0.0);
  base *= 0.55 + 0.7 * diffuse * day;
  vec3 col = mix(base, skyCol, clamp(fres * 0.85 + 0.05, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 120.0) * step(0.0, sunDir.y);
  vec3 sunCol = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.95, 0.8), smoothstep(0.0, 0.5, sunDir.y));
  col += sunCol * glint * 1.6;
  float fw = vnoise(vPos.xz * 1.2 + vec2(clk * 0.3, 0.0)) * 1.2;
  float band = smoothstep(R0 + 1.2 + fw * 0.8, R0 - 0.2, r) * smoothstep(R0 - 4.0, R0 - 1.0, r);
  float lines = smoothstep(0.55, 0.8, vnoise(vPos.xz * 2.5 + vec2(0.0, clk * 0.5)) + band * 0.6);
  col = mix(col, vec3(0.95, 0.98, 1.0) * (0.25 + 0.75 * day), band * lines * 0.8);
  float dist = length(cameraPosition - vPos);
  col = mix(col, skyCol * 0.9, smoothstep(120.0, 300.0, dist));
  outColor = vec4(col, 1.0);
}`.replace(/R0/g, "17.5")
  },
  uniforms: { clk: { type: "f32", value: 0 }, sunE: { type: "f32", value: 0.8 }, sunA: { type: "f32", value: 2 } }
});

// ---------- sun / sky ----------
const DAY = 20;
const START = 8;
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 60): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(START);

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [], low: AuraTransformSpec[] = [], high: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const lowC: string[] = [], highC: string[] = [], rockC: string[] = [];
let placed = 0, tries = 0;
while (placed < 34 && tries < 4000) {
  tries += 1;
  const a = rand() * Math.PI * 2, r = 14 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
  if (y < 1.1 || y > 5.2) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, y + 0.7 * s, z], scale: [0.45 * s, 1.4 * s, 0.45 * s] });
  low.push({ position: [x, y + 2.0 * s, z], rotation: [0, rand() * 6, 0], scale: [3.0 * s, 2.8 * s, 3.0 * s] });
  high.push({ position: [x, y + 3.5 * s, z], rotation: [0, rand() * 6, 0], scale: [2.2 * s, 2.5 * s, 2.2 * s] });
  const hue = 130 + Math.floor(rand() * 25), l = 24 + Math.floor(rand() * 10);
  lowC.push(`hsl(${hue}, 55%, ${l}%)`);
  highC.push(`hsl(${hue}, 55%, ${l + 6}%)`);
  placed += 1;
}
tries = 0;
let rp = 0;
while (rp < 16 && tries < 4000) {
  tries += 1;
  const a = rand() * Math.PI * 2, r = 6 + 14 * rand();
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
  if (y < -0.4 || y > 4) continue;
  const s = 0.5 + rand() * 1.1;
  rocks.push({ position: [x, y + 0.1 * s, z], rotation: [rand() * 2, rand() * 6, rand() * 2], scale: [s * 1.2, s * 0.8, s] });
  rockC.push(`hsl(${25 + Math.floor(rand() * 20)}, 6%, ${38 + Math.floor(rand() * 22)}%)`);
  rp += 1;
}
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });

let sc = scene({ background: "#0b1020" })
  .camera(camera.orbit({ position: [0, 30, 52], target: [0, 2, 0], fov: 45, near: 1, far: 600, autoRotate: 0.1 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#bcd4f0", groundColor: "#4a5a3a", intensity: 0.5 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(geometry.custom(geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -2.5, -S / 2], max: [S / 2, 9, S / 2] }
  }), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.9 }), params: { radialSegments: 5 } }))
  .add(instances.cone({ name: "canopyLow", transforms: low, colors: lowC, material: white, params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopyHigh", transforms: high, colors: highC, material: white, params: { radialSegments: 6 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockC, material: white }))
  .add(geometry.custom(geometry.define({
    positions: wPos, normals: wNor, indices: wIdx,
    bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] }
  }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }));

const app = createAuraApp("#app", { scene: sc });
let clk = 0;
let t = 0;
app.onFrame((f) => {
  clk += f.dt;
  t += f.dt;
  const hour = (START + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  const sun = app.nodes.require("sun");
  sun.setPosition(...dirOf(s.elevationDeg, s.azimuthDeg));
  sun.setLight?.({
    intensity: 3.2 * Math.max(0.18, elev),
    color: elev < 0.25 ? (elev < 0 ? "#8fa6ff" : "#ffb070") : "#fff4e0"
  });
  app.nodes.require("hemi").setLight?.({ intensity: 0.25 + 0.45 * Math.max(0, elev) });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const w = app.nodes.require("water");
  w.setUniform?.("clk", clk);
  w.setUniform?.("sunE", (s.elevationDeg * Math.PI) / 180);
  w.setUniform?.("sunA", (s.azimuthDeg * Math.PI) / 180);
});
await app.ready();
window.__EVAL_READY__ = true;
