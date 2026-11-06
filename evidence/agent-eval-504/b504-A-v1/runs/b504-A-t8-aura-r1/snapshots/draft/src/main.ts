import { camera, createAuraApp, environments, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

const DAY = 20;
const START_HOUR = 9;
const WATER_Y = 0.25;

// ---------- sun helpers ----------
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 60): [number, number, number] => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};

// ---------- seeded random ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- terrain ----------
type V3 = [number, number, number];
const G = 48, S = 56;
const H = (x: number, z: number): number => {
  const r2 = x * x + z * z;
  const base = 7 * (1 - r2 / 520);
  const bumps = Math.sin(x * 0.55) * Math.cos(z * 0.47) * 0.9 + Math.sin(x * 0.2 + z * 0.3) * 0.8;
  return Math.max(-1.2, base + bumps * Math.max(0, Math.min(1, base / 3 + 0.3)));
};
const P = (i: number, j: number): V3 => {
  const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S;
  return [x, H(x, z), z];
};
const pos: number[] = [], nor: number[] = [], col: number[] = [];
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(...n) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const j = (rand() - 0.5) * 0.08;
  const rgb = y < 0.1 ? [0.55, 0.5, 0.38] : y < 0.9 ? [0.85, 0.77, 0.5] : y < 4.6 ? [0.22 + j, 0.5 + j, 0.2 + j] : [0.52 + j, 0.48 + j, 0.44 + j];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) { pos.push(...p); nor.push(...n); col.push(rgb[0]!, rgb[1]!, rgb[2]!, 1); }
};
for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
  face(P(i, j), P(i, j + 1), P(i + 1, j));
  face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
}

// ---------- water grid ----------
const N = 160, WS = 200;
const wpos = new Float32Array((N + 1) ** 2 * 3), wnor = new Float32Array(wpos.length), widx: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  wpos.set([(i / N - 0.5) * WS, 0, (j / N - 0.5) * WS], v * 3);
  wnor[v * 3 + 1] = 1;
  if (i < N && j < N) widx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float a1 = dot(p, vec2(0.21, 0.13)) * 2.2 + uTime * 1.6;
  float a2 = dot(p, vec2(-0.17, 0.25)) * 2.0 + uTime * 2.1;
  float h = sin(a1) * 0.16 + sin(a2) * 0.1;
  vPos = vec3(p.x, ${WATER_Y.toFixed(2)} + h, p.y);
  vN = normalize(vec3(-cos(a1) * 0.16 * 0.46 - cos(a2) * 0.1 * -0.34, 1.0, -cos(a1) * 0.16 * 0.29 - cos(a2) * 0.1 * 0.5));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float E = radians(sunE), A = radians(sunA);
  vec3 sunDir = normalize(vec3(sin(A) * cos(E), sin(E), -cos(A) * cos(E)));
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.5 + uTime * 0.8) - 0.5, 0.0, vnoise(vPos.xz * 1.5 - uTime * 0.8) - 0.5) * 0.35);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float dayAmt = clamp(sunE / 25.0 + 0.35, 0.0, 1.0);
  vec3 skyDay = mix(vec3(0.62, 0.78, 0.92), vec3(0.2, 0.42, 0.75), clamp(reflect(-v, n).y, 0.0, 1.0));
  vec3 skyNight = mix(vec3(0.05, 0.07, 0.15), vec3(0.02, 0.03, 0.09), clamp(reflect(-v, n).y, 0.0, 1.0));
  float dusk = clamp(1.0 - abs(sunE) / 18.0, 0.0, 1.0);
  vec3 skyCol = mix(skyNight, skyDay, dayAmt) + vec3(0.5, 0.2, 0.05) * dusk * 0.5;
  vec3 deepDay = vec3(0.03, 0.30, 0.42), deepNight = vec3(0.01, 0.04, 0.09);
  vec3 deep = mix(deepNight, deepDay, dayAmt);
  float depthMix = clamp(length(vPos.xz) / 40.0, 0.0, 1.0);
  vec3 shallow = mix(deep, mix(vec3(0.08, 0.02, 0.1), vec3(0.15, 0.7, 0.65), dayAmt), 0.55 * (1.0 - depthMix));
  vec3 base = mix(shallow, skyCol, clamp(fres * 0.85 + 0.06, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 120.0) * step(0.0, sunE);
  float moon = pow(max(dot(reflect(sunDir, n), v), 0.0), 120.0) * step(sunE, 0.0);
  float sparkle = smoothstep(0.78, 1.0, vnoise(vPos.xz * 4.0 + uTime * 0.6)) * 0.12 * dayAmt;
  vec3 col = base + vec3(1.0, 0.9, 0.7) * glint * 1.6 + vec3(0.6, 0.7, 1.0) * moon * 0.8 + vec3(sparkle);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { sunE: { type: "f32", value: 30 }, sunA: { type: "f32", value: 90 } }
});

// ---------- scatter trees and rocks ----------
const trunks: AuraTransformSpec[] = [], canopies: AuraTransformSpec[] = [], canopies2: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const canopyColors: string[] = [], canopyColors2: string[] = [], rockColors: string[] = [];
let tries = 0;
while (trunks.length < 34 && tries < 4000) {
  tries += 1;
  const a = rand() * 6.283, r = 20 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < 1.1 || y > 4.8) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, y + 0.7 * s, z], scale: [0.35 * s, 1.4 * s, 0.35 * s] });
  canopies.push({ position: [x, y + 1.4 * s + 1.3 * s, z], scale: [2.4 * s, 3 * s, 2.4 * s] });
  canopies2.push({ position: [x, y + 1.4 * s + 2.6 * s, z], scale: [1.7 * s, 2.4 * s, 1.7 * s] });
  const hue = 105 + Math.floor(rand() * 40);
  canopyColors.push(`hsl(${hue}, 55%, ${24 + Math.floor(rand() * 10)}%)`);
  canopyColors2.push(`hsl(${hue}, 58%, ${32 + Math.floor(rand() * 10)}%)`);
}
tries = 0;
while (rocks.length < 28 && tries < 4000) {
  tries += 1;
  const a = rand() * 6.283, r = 6 + 17 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < -0.2 || y > 5.5) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, y + 0.1 * s, z], rotation: [rand(), rand() * 6, rand()], scale: [s, s * 0.7, s * 0.9] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 25)}%)`);
}

// ---------- scene ----------
const s0 = sunAt(START_HOUR);
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });
const sc = scene({ background: "#0a0e1a" })
  .camera(camera.orbit({ position: [0, 30, 62], target: [0, 1.5, 0], fov: 45, near: 1, far: 600, autoRotate: 0.1 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(environments.neutral({ intensity: 0.25, background: false }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(geometry.custom(geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 9, S / 2] }
  }), { name: "island", material: white }))
  .add(geometry.custom(geometry.define({
    positions: wpos, normals: wnor, indices: widx,
    bounds: { min: [-WS / 2, -1, -WS / 2], max: [WS / 2, 1, WS / 2] }
  }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 1 }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.cone({ name: "canopies2", transforms: canopies2, colors: canopyColors2, material: white, params: { radialSegments: 7 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const hour = (START_HOUR + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const lift = Math.sin(((hour - 6) / 24) * Math.PI * 2); // +1 noon, -1 midnight
  const sun = app.nodes.require("sun");
  const night = lift < 0;
  // after sunset the same light becomes a dim blue moon on the opposite side of the sky
  const dir = night ? dirOf(-s.elevationDeg, s.azimuthDeg + 180) : dirOf(s.elevationDeg, s.azimuthDeg);
  sun.setPosition(...dir);
  const k = Math.min(1, Math.abs(lift) * 4);
  sun.setLight?.(night
    ? { intensity: 0.15 + 0.5 * k, color: "#8fa8ff" }
    : { intensity: 0.15 + 3.0 * k, color: lift < 0.3 ? "#ffb070" : "#fff4e0" });
  app.nodes.require("hemi").setLight?.({ intensity: 0.3 + 0.8 * Math.max(0, lift) });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const water = app.nodes.require("water");
  water.setUniform?.("sunE", s.elevationDeg);
  water.setUniform?.("sunA", s.azimuthDeg);
});

await app.ready();
window.__EVAL_READY__ = true;
