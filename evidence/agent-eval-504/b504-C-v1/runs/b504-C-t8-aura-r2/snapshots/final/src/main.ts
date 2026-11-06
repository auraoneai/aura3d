import { camera, createAuraApp, geometry, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

// ---------- seeded random ----------
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- terrain ----------
type V3 = [number, number, number];
const G = 56, S = 44;
const hash2 = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const H = (x: number, z: number): number => {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const R = 15 + 2.2 * Math.sin(a * 3 + 0.7) + 1.2 * Math.sin(a * 5 + 2.0);
  const t = Math.max(0, 1 - (r / R) ** 2);
  const hills = 1 + 0.35 * Math.sin(x * 0.55 + 1.0) * Math.cos(z * 0.5) + 0.25 * Math.sin(z * 0.9 + x * 0.3);
  const peak = 7 * t * hills;
  return Math.max(-1.5, peak - 0.9 + (t > 0 ? hash2(Math.round(x * 2), Math.round(z * 2)) * 0.5 : 0) - (t > 0 ? 0 : 0.6 * (r - R) * 0.1));
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
  const j = (hash2(a[0] * 3, a[2] * 3) - 0.5) * 0.06;
  let rgb: number[];
  if (y < -0.3) rgb = [0.55, 0.5, 0.35];
  else if (y < 0.7) rgb = [0.86, 0.78, 0.5];
  else if (y < 3.4) rgb = [0.2 + j, 0.5 + j * 2, 0.17 + j];
  else if (y < 4.6) rgb = [0.45 + j, 0.4 + j, 0.36 + j];
  else rgb = [0.92, 0.93, 0.95];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) { pos.push(p[0], p[1], p[2]); nor.push(n[0]!, n[1]!, n[2]!); col.push(rgb[0]!, rgb[1]!, rgb[2]!, 1); }
};
for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
  face(P(i, j), P(i, j + 1), P(i + 1, j));
  face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
}

// ---------- water ----------
const N = 140, SIZE = 300;
const wp = new Float32Array((N + 1) ** 2 * 3), wn = new Float32Array(wp.length), wi: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  wp.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
  wn[v * 3 + 1] = 1;
  if (i < N && j < N) wi.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}
const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vN;
void main() {
  vec2 p = position.xz;
  vec2 k1 = vec2(0.6, 0.35), k2 = vec2(-0.5, 0.7), k3 = vec2(1.1, 0.9);
  float p1 = dot(p, k1) + clk * 1.2, p2 = dot(p, k2) + clk * 1.5, p3 = dot(p, k3) + clk * 2.2;
  float h = sin(p1) * 0.25 + sin(p2) * 0.18 + sin(p3) * 0.07;
  vec2 g = cos(p1) * 0.25 * k1 + cos(p2) * 0.18 * k2 + cos(p3) * 0.07 * k3;
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vN;
out vec4 outColor;
void main() {
  vec3 facet = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (facet.y < 0.0) facet = -facet;
  vec3 n = normalize(mix(normalize(vN), facet, 0.65));
  vec3 v = normalize(cameraPosition - vPos);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float day = clamp(dayF, 0.0, 1.0);
  vec3 horizon = mix(vec3(0.05, 0.07, 0.15), vec3(0.62, 0.78, 0.92), day);
  horizon = mix(horizon, vec3(0.95, 0.55, 0.35), warmF * 0.6);
  vec3 zenith = mix(vec3(0.02, 0.03, 0.09), vec3(0.2, 0.42, 0.78), day);
  vec3 deep = mix(vec3(0.02, 0.06, 0.12), vec3(0.03, 0.30, 0.46), day);
  vec3 shallow = mix(vec3(0.04, 0.12, 0.20), vec3(0.15, 0.68, 0.72), day);
  float r = length(vPos.xz);
  float shore = 1.0 - smoothstep(14.0, 24.0, r);
  vec3 body = mix(deep, shallow, clamp(shore + vPos.y * 1.2 + 0.2, 0.0, 1.0));
  vec3 refl = mix(horizon, zenith, clamp(reflect(-v, n).y, 0.0, 1.0));
  vec3 col = mix(body, refl, clamp(fres * 0.9 + 0.06, 0.0, 1.0));
  vec3 sunDir = normalize(vec3(sunX, sunY, sunZ));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 90.0);
  vec3 glintCol = mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.9, 0.7), day);
  col += glintCol * glint * 1.5 * mix(0.5, 1.0, day);
  // foam on crests and around the island
  float foam = smoothstep(0.38, 0.5, vPos.y) * 0.5;
  float ring = smoothstep(0.55, 1.0, sin(r * 2.2 - clk * 1.5)) * (1.0 - smoothstep(14.0, 19.0, r)) * smoothstep(9.0, 13.0, r) * 0.25;
  col += vec3(0.9, 0.95, 1.0) * (foam + ring) * mix(0.3, 1.0, day);
  float d = length(vPos.xz - cameraPosition.xz);
  col = mix(col, horizon, smoothstep(55.0, 110.0, d));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    clk: { type: "f32", value: 0 },
    dayF: { type: "f32", value: 1 },
    warmF: { type: "f32", value: 0 },
    sunX: { type: "f32", value: 0.5 },
    sunY: { type: "f32", value: 0.5 },
    sunZ: { type: "f32", value: 0.3 }
  }
});

// ---------- sun / sky ----------
const DAY = 20;
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 40): [number, number, number] => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const START_HOUR = 9;
const s0 = sunAt(START_HOUR);

let sc = scene({ background: "#9ec3e6" })
  .camera(camera.orbit({ position: [0, 17, 38], target: [0, 1.5, 0], fov: 45, near: 1, far: 600, autoRotate: 0.12 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 800, brightness: 1 } }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#cfe0f2", groundColor: "#6b6a4a", intensity: 0.9 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(geometry.custom(geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 9, S / 2] }
  }), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
  .add(geometry.custom(geometry.define({
    positions: wp, normals: wn, indices: wi,
    bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] }
  }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }));

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [], canopies: AuraTransformSpec[] = [], canopies2: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const canopyColors: string[] = [], canopyColors2: string[] = [], rockColors: string[] = [];
for (let tries = 0; tries < 400 && trunks.length < 22; tries += 1) {
  const x = (rand() - 0.5) * 30, z = (rand() - 0.5) * 30, y = H(x, z);
  if (y < 0.9 || y > 3.6) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, y + 0.6 * s, z], scale: [0.35 * s, 1.2 * s, 0.35 * s] });
  canopies.push({ position: [x, y + 2.0 * s, z], scale: [2.2 * s, 2.6 * s, 2.2 * s] });
  canopies2.push({ position: [x, y + 3.1 * s, z], scale: [1.6 * s, 2.2 * s, 1.6 * s] });
  const hue = 105 + Math.floor(rand() * 30);
  canopyColors.push(`hsl(${hue}, 55%, ${26 + Math.floor(rand() * 8)}%)`);
  canopyColors2.push(`hsl(${hue}, 55%, ${32 + Math.floor(rand() * 8)}%)`);
}
for (let tries = 0; tries < 400 && rocks.length < 14; tries += 1) {
  const x = (rand() - 0.5) * 36, z = (rand() - 0.5) * 36, y = H(x, z);
  if (y < -0.2 || y > 5) continue;
  const s = 0.5 + rand() * 1.0;
  rocks.push({ position: [x, y + 0.2 * s, z], rotation: [rand() * 0.6, rand() * 6, rand() * 0.6], scale: [s * 1.2, s * 0.8, s] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 22)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
sc = sc
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 1 }), params: { radialSegments: 5 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies2", transforms: canopies2, colors: canopyColors2, material: white, params: { radialSegments: 6 } }))
  .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

// ---------- app ----------
const app = createAuraApp("#app", { scene: sc });
let t = 0;
const smooth = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
app.onFrame((f) => {
  t += f.dt;
  const hour = (START_HOUR + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  const dayF = smooth(-8, 18, s.elevationDeg);
  const warm = 1 - smooth(0, 30, Math.abs(s.elevationDeg)) ;
  const sun = app.nodes.require("sun");
  if (s.elevationDeg >= 0) {
    sun.setPosition(sunPos[0], sunPos[1], sunPos[2]);
    sun.setLight?.({ intensity: 0.4 + 3.0 * Math.sin((s.elevationDeg * Math.PI) / 180), color: warm > 0.3 ? "#ffb070" : "#fff3dc" });
  } else {
    // moonlight from the opposite side of the sky
    sun.setPosition(-sunPos[0], -sunPos[1] + 6, -sunPos[2]);
    sun.setLight?.({ intensity: 0.7, color: "#8fa8ff" });
  }
  app.nodes.require("hemi").setLight?.({ intensity: 0.3 + 0.7 * dayF });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const w = app.nodes.require("water");
  w.setUniform?.("clk", t);
  w.setUniform?.("dayF", dayF);
  w.setUniform?.("warmF", warm * (s.elevationDeg > -5 ? 1 : 0));
  const l = Math.hypot(sunPos[0], sunPos[1], sunPos[2]) || 1;
  const moon = s.elevationDeg < 0;
  w.setUniform?.("sunX", (moon ? -sunPos[0] : sunPos[0]) / l);
  w.setUniform?.("sunY", (moon ? -sunPos[1] : sunPos[1]) / l);
  w.setUniform?.("sunZ", (moon ? -sunPos[2] : sunPos[2]) / l);
});
await app.ready();
window.__EVAL_READY__ = true;
