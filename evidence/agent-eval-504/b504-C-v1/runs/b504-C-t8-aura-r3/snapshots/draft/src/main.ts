import { camera, createAuraApp, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

type V3 = [number, number, number];

// ---------- seeded random ----------
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- island height field ----------
const smooth = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const H = (x: number, z: number): number => {
  const r = Math.hypot(x, z), th = Math.atan2(z, x);
  const R = 11 + 1.6 * Math.sin(3 * th + 0.5) + 1.0 * Math.sin(5 * th + 1.7);
  const q = r / R;
  const base = 5.2 * (1 - q * q);
  const bumps = (Math.sin(x * 0.8) * Math.cos(z * 0.7) * 0.45 + Math.sin(x * 0.35 + z * 0.5) * 0.4) * smooth(0, 0.35, 1 - q);
  return Math.max(-1.5, base + bumps);
};

// ---------- flat-shaded terrain ----------
const G = 56, S = 44;
const pos: number[] = [], nor: number[] = [], col: number[] = [];
const P = (i: number, j: number): V3 => {
  const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S;
  return [x, H(x, z), z];
};
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const steep = 1 - n[1]!;
  const jitter = (rand() - 0.5) * 0.08;
  let rgb: number[];
  if (y < -0.1) rgb = [0.55, 0.5, 0.33];
  else if (y < 0.55) rgb = [0.86, 0.78, 0.5];
  else if (y > 3.6 || steep > 0.38) rgb = [0.5, 0.47, 0.44];
  else if (y > 2.4) rgb = [0.3, 0.55, 0.2];
  else rgb = [0.2, 0.46, 0.17];
  rgb = rgb.map((q) => Math.min(1, Math.max(0, q + jitter)));
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0]!, rgb[1]!, rgb[2]!, 1);
  }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    face(P(i, j), P(i, j + 1), P(i + 1, j));
    face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
  }
}
const islandGeo = geometry.define({
  positions: new Float32Array(pos),
  normals: new Float32Array(nor),
  colors: new Float32Array(col),
  indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
  bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 8, S / 2] }
});

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [], canopies: AuraTransformSpec[] = [], canopies2: AuraTransformSpec[] = [];
const canopyColors: string[] = [], canopy2Colors: string[] = [];
const rocks: AuraTransformSpec[] = [], rockColors: string[] = [];
const placed: [number, number][] = [];
for (let tries = 0; tries < 600 && trunks.length < 26; tries += 1) {
  const x = (rand() - 0.5) * 24, z = (rand() - 0.5) * 24, h = H(x, z);
  if (h < 0.8 || h > 3.4) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.2)) continue;
  placed.push([x, z]);
  const s = 0.8 + rand() * 0.6, yaw = rand() * 6;
  trunks.push({ position: [x, h + 0.6 * s, z], scale: [0.3 * s, 1.2 * s, 0.3 * s] });
  canopies.push({ position: [x, h + 1.9 * s, z], rotation: [0, yaw, 0], scale: [2.0 * s, 2.4 * s, 2.0 * s] });
  canopies2.push({ position: [x, h + 3.0 * s, z], rotation: [0, yaw, 0], scale: [1.4 * s, 1.8 * s, 1.4 * s] });
  canopyColors.push(`hsl(${105 + Math.floor(rand() * 35)}, 50%, ${24 + Math.floor(rand() * 10)}%)`);
  canopy2Colors.push(`hsl(${105 + Math.floor(rand() * 35)}, 55%, ${30 + Math.floor(rand() * 10)}%)`);
}
for (let tries = 0; tries < 400 && rocks.length < 14; tries += 1) {
  const x = (rand() - 0.5) * 30, z = (rand() - 0.5) * 30, h = H(x, z);
  if (h < -0.2 || h > 1.6) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, h + 0.2 * s, z], rotation: [rand() * 0.6, rand() * 6, rand() * 0.6], scale: [s * 1.2, s * 0.8, s] });
  const l = 38 + Math.floor(rand() * 20);
  rockColors.push(`hsl(30, 6%, ${l}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });

// ---------- water ----------
const N = 140, SIZE = 220;
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
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vN;
void main() {
  vec2 p = position.xz;
  float a1 = dot(p, vec2(0.21, 0.13)) * 2.0 + uTime * 1.2;
  float a2 = dot(p, vec2(-0.17, 0.25)) * 2.5 + uTime * 1.5;
  float a3 = dot(p, vec2(0.4, 0.31)) * 3.0 + uTime * 2.3;
  float h = sin(a1) * 0.14 + sin(a2) * 0.10 + sin(a3) * 0.04;
  float dx = cos(a1) * 0.14 * 0.42 + cos(a2) * 0.10 * -0.425 + cos(a3) * 0.04 * 1.2;
  float dz = cos(a1) * 0.14 * 0.26 + cos(a2) * 0.10 * 0.625 + cos(a3) * 0.04 * 0.93;
  vPos = vec3(p.x, h + 0.05, p.y);
  vN = normalize(vec3(-dx, 1.0, -dz));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vN;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.5 + uTime * 0.6) - 0.5, 0.0, vnoise(vPos.xz * 1.5 - uTime * 0.6) - 0.5) * 0.3);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float d = length(vPos.xz);
  vec3 body = mix(shallowCol, deepCol, smoothstep(9.0, 22.0, d));
  vec3 col = mix(body, skyCol, clamp(fres * 0.85 + 0.05, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(sunDir), n), v), 0.0), 120.0);
  col += sunCol * glint * glintAmt;
  float crest = smoothstep(0.17, 0.26, vPos.y - 0.05 + (vnoise(vPos.xz * 3.0 + uTime) - 0.5) * 0.08);
  col = mix(col, mix(vec3(0.9), skyCol, 0.4) * dayAmt, crest * 0.35);
  float dist = length(cameraPosition.xz - vPos.xz);
  col = mix(col, horizonCol, smoothstep(55.0, 100.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    sunDir: { type: "vec3", value: [0.5, 0.6, 0.3] },
    sunCol: { type: "vec3", value: [1, 0.9, 0.7] },
    skyCol: { type: "vec3", value: [0.5, 0.7, 0.9] },
    horizonCol: { type: "vec3", value: [0.6, 0.75, 0.9] },
    deepCol: { type: "vec3", value: [0.02, 0.18, 0.3] },
    shallowCol: { type: "vec3", value: [0.1, 0.55, 0.6] },
    glintAmt: { type: "f32", value: 1 },
    dayAmt: { type: "f32", value: 1 }
  }
});

// ---------- sun / sky ----------
const DAY = 20;
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 40): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(10);
const mix3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c: V3): string => `rgb(${Math.round(Math.min(1, c[0]) * 255)}, ${Math.round(Math.min(1, c[1]) * 255)}, ${Math.round(Math.min(1, c[2]) * 255)})`;

const sc = scene({ background: "#8fb8e0" })
  .camera(camera.orbit({ position: [0, 19, 34], target: [0, 1.5, 0], fov: 45, near: 1, far: 500, autoRotate: 0.12 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 600, brightness: 1 } }))
  .add(lights.hemisphere({ name: "amb", skyColor: "#cfe0f2", groundColor: "#6b7a55", intensity: 1.0 }).runtime({ id: "amb", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(lights.directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0, color: "#9db4ff" }).runtime({ id: "moon", mutable: true }))
  .add(geometry.custom(islandGeo, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 1 }), params: { radialSegments: 5 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies2", transforms: canopies2, colors: canopy2Colors, material: white, params: { radialSegments: 6 } }))
  .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
  .add(geometry.custom(
    geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] } }),
    { name: "water", material: water, castShadow: false }
  ).runtime({ id: "water", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

const DAY_SKY: V3 = [0.45, 0.68, 0.95], NIGHT_SKY: V3 = [0.03, 0.05, 0.12];
const DAY_HOR: V3 = [0.65, 0.8, 0.93], NIGHT_HOR: V3 = [0.05, 0.07, 0.15];
const DAY_DEEP: V3 = [0.02, 0.2, 0.34], NIGHT_DEEP: V3 = [0.01, 0.04, 0.09];
const DAY_SHAL: V3 = [0.1, 0.58, 0.62], NIGHT_SHAL: V3 = [0.03, 0.12, 0.18];

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const hour = (10 + (t / DAY) * 24) % 24, s = sunAt(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const dayF = smooth(-0.12, 0.3, sinE);
  // warm tint near the horizon
  const warm = (1 - smooth(0.05, 0.45, Math.abs(sinE))) * dayF;

  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  app.nodes.require("sun").setPosition(...sunPos);
  app.nodes.require("sun").setLight?.({ intensity: 3.2 * smooth(0, 0.3, sinE), color: css(mix3([1, 0.97, 0.9], [1, 0.6, 0.35], warm)) });
  app.nodes.require("moon").setPosition(...dirOf(Math.max(20, -s.elevationDeg), s.azimuthDeg + 180));
  app.nodes.require("moon").setLight?.({ intensity: 0.9 * (1 - dayF) });
  app.nodes.require("amb").setLight?.({ intensity: 0.45 + 0.6 * dayF, color: css(mix3([0.45, 0.52, 0.8], [0.85, 0.9, 1], dayF)) });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const w = app.nodes.require("water");
  const sd = dirOf(Math.max(s.elevationDeg, 1), s.azimuthDeg, 1);
  w.setUniform?.("sunDir", sd);
  w.setUniform?.("sunCol", mix3([1, 0.93, 0.78], [1, 0.55, 0.3], warm));
  w.setUniform?.("skyCol", mix3(NIGHT_SKY, mix3(DAY_SKY, [0.95, 0.6, 0.45], warm * 0.5), dayF));
  w.setUniform?.("horizonCol", mix3(NIGHT_HOR, mix3(DAY_HOR, [0.95, 0.65, 0.5], warm * 0.6), dayF));
  w.setUniform?.("deepCol", mix3(NIGHT_DEEP, DAY_DEEP, dayF));
  w.setUniform?.("shallowCol", mix3(NIGHT_SHAL, DAY_SHAL, dayF));
  w.setUniform?.("glintAmt", 1.4 * smooth(0.0, 0.15, sinE));
  w.setUniform?.("dayAmt", 0.25 + 0.75 * dayF);
});

await app.ready();
window.__EVAL_READY__ = true;
