import { camera, createAuraApp, environments, geometry, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

const DAY = 20;
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 60): [number, number, number] => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(10);

let sc = scene({ background: "#8fb4d8" })
  .camera(camera.orbit({ position: [0, 30, 58], target: [0, 1, 0], fov: 45, near: 1, far: 500, autoRotate: 0.1 }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 0.6 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }));

// ---- Flat-shaded terrain ----
type V3 = [number, number, number];
const G = 44, S = 44, pos: number[] = [], nor: number[] = [], col: number[] = [];
const H = (x: number, z: number): number =>
  Math.max(-1.2, 6 * (1 - (x * x + z * z) / 420) + Math.sin(x * 0.9) * Math.cos(z * 0.8) * 0.5 + Math.sin(x * 0.3 + z * 0.4) * 0.6);
const P = (i: number, j: number): V3 => { const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S; return [x, H(x, z), z]; };
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const rgb = y < 0.5 ? [0.8, 0.72, 0.45] : y < 3.8 ? [0.2, 0.5, 0.2] : [0.52, 0.47, 0.42];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) { pos.push(p[0], p[1], p[2]); nor.push(n[0]!, n[1]!, n[2]!); col.push(rgb[0]!, rgb[1]!, rgb[2]!, 1); }
};
for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
  face(P(i, j), P(i, j + 1), P(i + 1, j));
  face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
}
sc = sc.add(geometry.custom(geometry.define({
  positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
  indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
  bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 9, S / 2] }
}), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));

// ---- Trees and rocks ----
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [], canopies: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const canopyColors: string[] = [], rockColors: string[] = [];
for (let tries = 0; tries < 400 && trunks.length < 22; tries += 1) {
  const x = (rand() - 0.5) * 36, z = (rand() - 0.5) * 36, y = H(x, z);
  if (y < 0.9 || y > 4.5) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, y + 0.8 * s, z], scale: [0.3 * s, 1.6 * s, 0.3 * s] });
  canopies.push({ position: [x, y + 1.3 * s + 1.8 * s, z], scale: [2 * s, 3.6 * s, 2 * s] });
  canopyColors.push(`hsl(${105 + Math.floor(rand() * 35)}, 55%, ${24 + Math.floor(rand() * 14)}%)`);
}
for (let tries = 0; tries < 300 && rocks.length < 14; tries += 1) {
  const x = (rand() - 0.5) * 40, z = (rand() - 0.5) * 40, y = H(x, z);
  if (y < 0.0 || y > 3) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, y + 0.15 * s, z], rotation: [0, rand() * 6, 0], scale: [s, s * 0.7, s] });
  rockColors.push(`hsl(30, 6%, ${35 + Math.floor(rand() * 25)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
sc = sc.add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24" }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

// ---- Animated water ----
const N = 160, SIZE = 200;
const positions = new Float32Array((N + 1) ** 2 * 3), normals = new Float32Array(positions.length), indices: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float ph = dot(p, vec2(0.21, 0.13)) * 3.0 + clk;
  vPos = vec3(p.x, 0.25 + sin(ph) * 0.12 + sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + clk * 1.3) * 0.08, p.y);
  vN = normalize(vec3(-cos(ph) * 0.15, 1.0, -cos(ph) * 0.1));
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
  vec3 skyc = mix(vec3(0.62, 0.78, 0.92), vec3(0.15, 0.35, 0.7), clamp(reflect(-v, n).y, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(vec3(0.5, 0.45, 0.35)), n), v), 0.0), 100.0);
  float foam = smoothstep(0.78, 0.95, vnoise(vPos.xz * 2.5 + clk * 0.5));
  vec3 deep = vec3(0.03, 0.30, 0.45);
  vec3 c = mix(deep, skyc, clamp(fres * 0.8 + 0.1, 0.0, 1.0)) + vec3(1.0, 0.93, 0.78) * glint * 1.2 + vec3(foam * 0.08);
  float lum = max(lvl, 0.12);
  outColor = vec4(c * lum, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, lvl: { type: "f32", value: 1 } }
});
sc = sc.add(geometry.custom(geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] } }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }));

const app = createAuraApp("#app", { scene: sc });
let clk = 0, t = 0;
app.onFrame((f) => {
  clk += f.dt;
  t += f.dt;
  const hour = (10 + (t / DAY) * 24) % 24, s = sunAt(hour), sun = app.nodes.require("sun");
  const day = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  // keep the light above the horizon so it always illuminates (moonlight at night)
  sun.setPosition(...dirOf(Math.max(s.elevationDeg, 15), s.azimuthDeg));
  sun.setLight?.({ intensity: 3.2 * Math.max(0.15, day) });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const w = app.nodes.require("water");
  w.setUniform?.("clk", clk);
  w.setUniform?.("lvl", Math.max(0.12, Math.min(1, day * 1.5 + 0.3)));
});
await app.ready();
window.__EVAL_READY__ = true;
