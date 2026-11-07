import { camera, createAuraApp, environments, geometry, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

type V3 = [number, number, number];

// ---------- Sun / sky ----------
const DAY = 20;
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 60): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const START_HOUR = 10;
const s0 = sunAt(START_HOUR);

let sc = scene({ background: "#0b1020" })
  .camera(camera.orbit({ position: [0, 24, 50], target: [0, 1, 0], fov: 45, near: 1, far: 450, autoRotate: 0.1 }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#9fb8dc", groundColor: "#4a5a3c", intensity: 0.6 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }));

// ---------- Flat-shaded island ----------
const G = 48, S = 44, pos: number[] = [], nor: number[] = [], col: number[] = [];
const H = (x: number, z: number): number => {
  const r2 = x * x + z * z;
  const bump = Math.sin(x * 0.45) * Math.cos(z * 0.38) * 0.9 + Math.sin(x * 1.1 + z * 0.7) * 0.25;
  return Math.max(-1.2, 6 * (1 - r2 / 420) + bump * Math.min(1, Math.max(0, 1 - r2 / 500) + 0.3));
};
const P = (i: number, j: number): V3 => { const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S; return [x, H(x, z), z]; };
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(...n) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const rgb = y < 0.5 ? [0.82, 0.74, 0.47] : y < 3.6 ? [0.22, 0.5, 0.2] : y < 5 ? [0.48, 0.43, 0.38] : [0.9, 0.9, 0.92];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) { pos.push(...p); nor.push(...n); col.push(...rgb, 1); }
};
for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
  face(P(i, j), P(i, j + 1), P(i + 1, j));
  face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
}
sc = sc.add(geometry.custom(geometry.define({
  positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
  indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
  bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 8, S / 2] }
}), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));

// ---------- Trees and rocks ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [], canopies: AuraTransformSpec[] = [], tops: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const canopyColors: string[] = [], topColors: string[] = [], rockColors: string[] = [];
for (let tries = 0; tries < 400 && trunks.length < 34; tries += 1) {
  const a = rand() * Math.PI * 2, r = 3 + rand() * 14;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < 0.9 || y > 4.6) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, y + 0.6 * s, z], scale: [0.35 * s, 1.2 * s, 0.35 * s] });
  canopies.push({ position: [x, y + 2.0 * s, z], scale: [2.0 * s, 2.4 * s, 2.0 * s] });
  tops.push({ position: [x, y + 3.2 * s, z], scale: [1.4 * s, 2.0 * s, 1.4 * s] });
  const hue = 110 + Math.floor(rand() * 30);
  canopyColors.push(`hsl(${hue}, 55%, ${26 + Math.floor(rand() * 10)}%)`);
  topColors.push(`hsl(${hue}, 60%, ${32 + Math.floor(rand() * 10)}%)`);
}
for (let tries = 0; tries < 300 && rocks.length < 22; tries += 1) {
  const a = rand() * Math.PI * 2, r = 2 + rand() * 18;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < -0.2) continue;
  const s = 0.4 + rand() * 0.9;
  rocks.push({ position: [x, y + 0.15 * s, z], rotation: [rand(), rand() * 6, rand()], scale: [s, s * 0.7, s] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 25)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
sc = sc
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6a4527", roughness: 1 }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.cone({ name: "tops", transforms: tops, colors: topColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

// ---------- Animated water ----------
const N = 160, WS = 200;
const positions = new Float32Array((N + 1) ** 2 * 3), normals = new Float32Array(positions.length), indices: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  positions.set([(i / N - 0.5) * WS, 0, (j / N - 0.5) * WS], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float ph = dot(p, vec2(0.21, 0.13)) * 3.0 + clk;
  float ph2 = dot(p, vec2(-0.17, 0.25)) * 3.0 + clk * 1.3;
  vPos = vec3(p.x, sin(ph) * 0.12 + sin(ph2) * 0.08, p.y);
  vN = normalize(vec3(-cos(ph) * 0.15 - cos(ph2) * 0.08, 1.0, -cos(ph) * 0.09 + cos(ph2) * 0.1));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.5 + clk) - 0.5, 0.0, vnoise(vPos.xz * 1.5 - clk) - 0.5) * 0.3);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  vec3 skyCol = mix(vec3(0.55, 0.75, 0.92), vec3(0.15, 0.35, 0.7), clamp(reflect(-v, n).y, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(vec3(0.5, 0.45, 0.35)), n), v), 0.0), 120.0);
  float shore = 1.0 - smoothstep(14.0, 26.0, length(vPos.xz));
  vec3 deep = mix(vec3(0.02, 0.2, 0.34), vec3(0.1, 0.5, 0.55), shore);
  float foam = smoothstep(0.62, 0.9, vnoise(vPos.xz * 1.2 + clk * 0.5)) * shore * 0.35;
  vec3 c = mix(deep, skyCol, clamp(fres * 0.8 + 0.06, 0.0, 1.0)) + vec3(1.0, 0.93, 0.78) * glint * 1.0 * dayLevel + vec3(foam);
  outColor = vec4(c * dayLevel, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, dayLevel: { type: "f32", value: 1 } }
});
sc = sc.add(geometry.custom(geometry.define({
  positions, normals, indices, bounds: { min: [-WS / 2, -1, -WS / 2], max: [WS / 2, 1, WS / 2] }
}), { name: "water", material: water, castShadow: false }).position(0, 0.1, 0).runtime({ id: "water", mutable: true }));

// ---------- App ----------
const app = createAuraApp("#app", { scene: sc });
let clk = 0, t = 0;
app.onFrame((f) => {
  clk += f.dt;
  t += f.dt;
  const hour = (START_HOUR + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const light = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  const sun = app.nodes.require("sun");
  sun.setPosition(...dirOf(s.elevationDeg, s.azimuthDeg));
  sun.setLight?.({ intensity: 3.2 * Math.max(0.15, light) });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const w = app.nodes.require("water");
  w.setUniform?.("clk", clk);
  w.setUniform?.("dayLevel", 0.3 + 0.7 * Math.min(1, Math.max(0, light * 2 + 0.3)));
});
await app.ready();
window.__EVAL_READY__ = true;
