import { camera, createAuraApp, environments, geometry, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

type V3 = [number, number, number];

// ---------- terrain (flat-shaded, non-indexed) ----------
const G = 44, S = 44;
const H = (x: number, z: number): number => {
  const r2 = x * x + z * z;
  const base = 5.5 * (1 - r2 / 170);
  const bumps = Math.sin(x * 0.7 + 1.3) * Math.cos(z * 0.6) * 0.7 + Math.sin(x * 0.31 - z * 0.37) * 0.8;
  return Math.max(-1.5, base + bumps * Math.max(0, Math.min(1, base / 2 + 0.3)));
};
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
  const slope = 1 - n[1]!;
  const rgb = y < 0.35 ? [0.82, 0.74, 0.47] : slope > 0.28 || y > 4.6 ? [0.5, 0.46, 0.42] : y > 3.4 ? [0.3, 0.55, 0.2] : [0.2, 0.46, 0.17];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) { pos.push(p[0], p[1], p[2]); nor.push(n[0]!, n[1]!, n[2]!); col.push(rgb[0]!, rgb[1]!, rgb[2]!, 1); }
};
for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
  face(P(i, j), P(i, j + 1), P(i + 1, j));
  face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
}

// ---------- trees and rocks ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [], canopies: AuraTransformSpec[] = [], tops: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const canopyColors: string[] = [], topColors: string[] = [], rockColors: string[] = [];
for (let tries = 0; tries < 400 && trunks.length < 28; tries += 1) {
  const a = rand() * 6.283, r = 11 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < 0.9 || y > 4.6) continue;
  const s = 0.8 + rand() * 0.6;
  trunks.push({ position: [x, y + 0.6 * s, z], scale: [0.3 * s, 1.2 * s, 0.3 * s] });
  canopies.push({ position: [x, y + 1.9 * s, z], scale: [1.9 * s, 2.2 * s, 1.9 * s] });
  tops.push({ position: [x, y + 3.1 * s, z], scale: [1.3 * s, 1.8 * s, 1.3 * s] });
  const hue = 105 + Math.floor(rand() * 30);
  canopyColors.push(`hsl(${hue}, 50%, ${24 + Math.floor(rand() * 8)}%)`);
  topColors.push(`hsl(${hue}, 55%, ${30 + Math.floor(rand() * 8)}%)`);
}
for (let tries = 0; tries < 400 && rocks.length < 16; tries += 1) {
  const a = rand() * 6.283, r = 6 + 9 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < -0.2) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, y + 0.15 * s, z], rotation: [rand() * 3, rand() * 6, rand() * 3], scale: [s, s * 0.7, s * 0.9] });
  rockColors.push(`hsl(25, 6%, ${38 + Math.floor(rand() * 22)}%)`);
}

// ---------- water ----------
const N = 200, WS = 240;
const wPos = new Float32Array((N + 1) ** 2 * 3), wNor = new Float32Array(wPos.length), wIdx: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  wPos.set([(i / N - 0.5) * WS, 0, (j / N - 0.5) * WS], v * 3);
  wNor[v * 3 + 1] = 1;
  if (i < N && j < N) wIdx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float ph = dot(p, vec2(0.45, 0.28)) + uTime * 1.2;
  float ph2 = dot(p, vec2(-0.37, 0.52)) + uTime * 1.5;
  float y = sin(ph) * 0.14 + sin(ph2) * 0.1 - 0.15;
  vPos = vec3(p.x, y, p.y);
  vN = normalize(vec3(-cos(ph) * 0.14 * 0.45 - cos(ph2) * 0.1 * -0.37, 1.0, -cos(ph) * 0.14 * 0.28 - cos(ph2) * 0.1 * 0.52));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec2 q = vPos.xz * 0.9;
  vec3 n = normalize(vN + vec3(vnoise(q + uTime * 0.7) - 0.5, 0.0, vnoise(q * 1.3 - uTime * 0.6) - 0.5) * 0.5);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float E = radians(sunE), A = radians(sunA);
  vec3 sd = normalize(vec3(sin(A) * cos(E), sin(E), -cos(A) * cos(E)));
  float day = clamp(daylight, 0.0, 1.0);
  vec3 skyDay = mix(vec3(0.62, 0.78, 0.92), vec3(0.2, 0.42, 0.78), clamp(reflect(-v, n).y, 0.0, 1.0));
  vec3 skyNight = mix(vec3(0.05, 0.07, 0.14), vec3(0.01, 0.02, 0.06), clamp(reflect(-v, n).y, 0.0, 1.0));
  float dusk = smoothstep(0.0, 0.5, 1.0 - abs(sd.y) * 3.0) * step(0.0, sd.y + 0.15);
  vec3 skyCol = mix(skyNight, skyDay, day) + vec3(0.5, 0.2, 0.05) * dusk * 0.35;
  vec3 deep = mix(vec3(0.01, 0.04, 0.09), vec3(0.03, 0.30, 0.42), day);
  float glint = pow(max(dot(reflect(-sd, n), v), 0.0), 120.0) * smoothstep(-0.05, 0.15, sd.y);
  float sparkle = smoothstep(0.78, 1.0, vnoise(q * 3.0 + uTime * 0.9)) * 0.08 * day;
  vec3 col = mix(deep, skyCol, clamp(fres * 0.85 + 0.12, 0.0, 1.0)) + vec3(1.0, 0.9, 0.7) * glint * 1.5 + vec3(sparkle);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    sunE: { type: "f32", value: 40 },
    sunA: { type: "f32", value: 90 },
    daylight: { type: "f32", value: 1 }
  }
});

// ---------- sun ----------
const DAY = 20;
const START = 9;
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 60): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(START);

const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
const sc = scene({ background: "#0b1020" })
  .camera(camera.orbit({ position: [0, 24, 40], target: [0, 1.5, 0], fov: 45, near: 1, far: 500, autoRotate: 0.12 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(environments.neutral({ intensity: 0.25, background: false }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#cfe0f2", groundColor: "#4d5b3a", intensity: 0.9 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(geometry.custom(geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 8, S / 2] }
  }), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.9 }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.cone({ name: "tops", transforms: tops, colors: topColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
  .add(geometry.custom(geometry.define({
    positions: wPos, normals: wNor, indices: wIdx,
    bounds: { min: [-WS / 2, -1, -WS / 2], max: [WS / 2, 1, WS / 2] }
  }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }));

const app = createAuraApp("#app", { scene: sc });
let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const hour = (START + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2); // -1..1
  const day = Math.max(0, Math.min(1, elev * 3 + 0.3));
  const sun = app.nodes.require("sun");
  sun.setPosition(...dirOf(s.elevationDeg, s.azimuthDeg));
  sun.setLight?.({ intensity: 3.2 * Math.max(0.12, elev) });
  app.nodes.require("hemi").setLight?.({ intensity: 0.3 + 0.6 * day });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const w = app.nodes.require("water");
  w.setUniform?.("sunE", s.elevationDeg);
  w.setUniform?.("sunA", s.azimuthDeg);
  w.setUniform?.("daylight", day);
});
await app.ready();
window.__EVAL_READY__ = true;
