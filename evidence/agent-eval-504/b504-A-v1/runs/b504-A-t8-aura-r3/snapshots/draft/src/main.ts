import { camera, createAuraApp, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

type V3 = [number, number, number];

// ---------- terrain ----------
const G = 70, S = 70;
const H = (x: number, z: number): number => {
  const a = Math.atan2(z, x), r0 = Math.hypot(x, z);
  const r = r0 * (1 + 0.16 * Math.sin(a * 3 + 1) + 0.09 * Math.sin(a * 5 + 2));
  const base = 8.5 * Math.max(0, 1 - Math.pow(r / 21, 2)) - 0.9;
  const bump = Math.sin(x * 0.55) * Math.cos(z * 0.47) * 0.7 + Math.sin(x * 1.3 + z * 0.9) * 0.3;
  const k = Math.min(1, Math.max(0, base / 3));
  return Math.max(-2.5, base + bump * k - Math.max(0, r0 - 21) * 0.1);
};

const hash = (n: number): number => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const pos: number[] = [], nor: number[] = [], col: number[] = [];
let faceId = 0;
const P = (i: number, j: number): V3 => { const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S; return [x, H(x, z), z]; };
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3, j = (hash(faceId++) - 0.5) * 0.12;
  let rgb: number[];
  if (y < 0.15) rgb = [0.55, 0.5, 0.36];
  else if (y < 0.9) rgb = [0.86, 0.77, 0.5];
  else if (y < 4.2) rgb = [0.2, 0.5 + j, 0.2];
  else if (y < 6.2) rgb = [0.5, 0.46, 0.42];
  else rgb = [0.92, 0.93, 0.95];
  const m = 1 + j;
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0]! * m, rgb[1]! * m, rgb[2]! * m, 1);
  }
};
for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
  if ((i + j) % 2 === 0) { face(P(i, j), P(i, j + 1), P(i + 1, j)); face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1)); }
  else { face(P(i, j), P(i, j + 1), P(i + 1, j + 1)); face(P(i, j), P(i + 1, j + 1), P(i + 1, j)); }
}

// ---------- trees and rocks ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [], canopyLow: AuraTransformSpec[] = [], canopyHigh: AuraTransformSpec[] = [];
const canopyColors: string[] = [], canopyColors2: string[] = [], rocks: AuraTransformSpec[] = [], rockColors: string[] = [];
for (let tries = 0, n = 0; tries < 2000 && n < 45; tries += 1) {
  const x = (rand() - 0.5) * 44, z = (rand() - 0.5) * 44, h = H(x, z);
  if (h < 1.1 || h > 4.6) continue;
  n += 1;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, h + 0.7 * s, z], scale: [0.4 * s, 1.4 * s, 0.4 * s] });
  canopyLow.push({ position: [x, h + 2.0 * s, z], scale: [2.6 * s, 2.6 * s, 2.6 * s] });
  canopyHigh.push({ position: [x, h + 3.4 * s, z], scale: [1.9 * s, 2.2 * s, 1.9 * s] });
  const hue = 105 + Math.floor(rand() * 35);
  canopyColors.push(`hsl(${hue}, 55%, ${24 + Math.floor(rand() * 10)}%)`);
  canopyColors2.push(`hsl(${hue}, 60%, ${30 + Math.floor(rand() * 10)}%)`);
}
for (let tries = 0, n = 0; tries < 2000 && n < 30; tries += 1) {
  const x = (rand() - 0.5) * 50, z = (rand() - 0.5) * 50, h = H(x, z);
  if (h < -0.2 || h > 6) continue;
  n += 1;
  const s = 0.5 + rand() * 1.0;
  rocks.push({ position: [x, h + 0.2 * s, z], rotation: [rand() * 1.5, rand() * 6, rand() * 1.5], scale: [s * 1.2, s * 0.9, s] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 25)}%)`);
}

// ---------- water ----------
const N = 160, WS = 300;
const wp = new Float32Array((N + 1) ** 2 * 3), wn = new Float32Array(wp.length), wi: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  wp.set([(i / N - 0.5) * WS, 0, (j / N - 0.5) * WS], v * 3);
  wn[v * 3 + 1] = 1;
  if (i < N && j < N) wi.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float a = dot(p, vec2(0.21, 0.13)) * 2.2 + uTime * 1.2;
  float b = dot(p, vec2(-0.17, 0.25)) * 2.6 + uTime * 1.6;
  float y = sin(a) * 0.16 + sin(b) * 0.10;
  vPos = vec3(p.x, y, p.y);
  vN = normalize(vec3(-cos(a) * 0.16 * 0.46 - cos(b) * 0.10 * -0.44, 1.0, -cos(a) * 0.16 * 0.29 - cos(b) * 0.10 * 0.65));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec2 q = vPos.xz * 0.5;
  vec3 n = normalize(vN + vec3(vnoise(q + uTime * 0.4) - 0.5, 0.0, vnoise(q * 1.3 - uTime * 0.4) - 0.5) * 0.5);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float day = clamp(dayK, 0.0, 1.0);
  float E = radians(sunEl), A = radians(sunAz);
  vec3 L = normalize(vec3(sin(A) * cos(E), sin(E), -cos(A) * cos(E)));
  vec3 skyDay = mix(vec3(0.55, 0.72, 0.9), vec3(0.2, 0.4, 0.75), clamp(reflect(-v, n).y, 0.0, 1.0));
  vec3 skyNight = vec3(0.04, 0.06, 0.14);
  vec3 skyDusk = vec3(0.75, 0.4, 0.3);
  float dusk = clamp(1.0 - abs(sunEl) / 25.0, 0.0, 1.0);
  vec3 sky = mix(skyNight, skyDay, day);
  sky = mix(sky, skyDusk, dusk * 0.6);
  vec3 deep = mix(vec3(0.01, 0.04, 0.09), vec3(0.03, 0.30, 0.45), day);
  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 120.0) * step(0.0, sunEl);
  float crest = smoothstep(0.18, 0.3, vPos.y + vnoise(vPos.xz * 1.5 + uTime) * 0.1);
  vec3 c = mix(deep, sky, clamp(fres * 0.85 + 0.1, 0.0, 1.0));
  c += vec3(0.5, 0.6, 0.65) * crest * 0.15 * (0.3 + day);
  c += vec3(1.0, 0.9, 0.7) * glint * 1.6;
  outColor = vec4(c, 1.0);
}`
  },
  uniforms: { dayK: { type: "f32", value: 1 }, sunEl: { type: "f32", value: 30 }, sunAz: { type: "f32", value: 90 } }
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
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });

const sc = scene({ background: "#0a0f1c" })
  .camera(camera.orbit({ position: [0, 32, 52], target: [0, 1.5, 0], fov: 50, near: 1, far: 700, autoRotate: 0.12 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#4d5a45", intensity: 1.0 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(geometry.custom(geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -3, -S / 2], max: [S / 2, 10, S / 2] }
  }), { name: "island", material: white }))
  .add(geometry.custom(geometry.define({ positions: wp, normals: wn, indices: wi, bounds: { min: [-WS / 2, -1, -WS / 2], max: [WS / 2, 1, WS / 2] } }),
    { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 1 }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopy-low", transforms: canopyLow, colors: canopyColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopy-high", transforms: canopyHigh, colors: canopyColors2, material: white, params: { radialSegments: 6 } }))
  .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

const app = createAuraApp("#app", { scene: sc });
let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const hour = (START + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2); // -1..1
  const day = Math.min(1, Math.max(0, elev * 2 + 0.3));
  const sun = app.nodes.require("sun");
  if (s.elevationDeg >= 0) {
    sun.setPosition(...dirOf(Math.max(s.elevationDeg, 4), s.azimuthDeg));
    const warm = Math.min(1, s.elevationDeg / 25);
    sun.setLight?.({ intensity: 0.4 + 3.0 * Math.min(1, elev * 1.5), color: warm > 0.99 ? "#fff4e0" : `rgb(255, ${Math.round(150 + 105 * warm)}, ${Math.round(90 + 134 * warm)})` });
  } else {
    // moon opposite the sun, dim and blue
    sun.setPosition(...dirOf(Math.max(-s.elevationDeg, 20), s.azimuthDeg + 180));
    sun.setLight?.({ intensity: 0.5, color: "#8fa6ff" });
  }
  app.nodes.require("hemi").setLight?.({ intensity: 0.3 + 0.9 * day });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const w = app.nodes.require("water");
  w.setUniform?.("dayK", day);
  w.setUniform?.("sunEl", s.elevationDeg);
  w.setUniform?.("sunAz", s.azimuthDeg);
});
await app.ready();
window.__EVAL_READY__ = true;
