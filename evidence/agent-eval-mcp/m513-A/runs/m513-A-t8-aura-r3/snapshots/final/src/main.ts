import { camera, createAuraApp, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

// ---------- helpers ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, y: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
type RGB = [number, number, number];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB): string => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

// ---------- terrain ----------
const R = 17;
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const shape = R * (0.82 + 0.28 * vnoise(Math.cos(ang) * 1.6 + 5, Math.sin(ang) * 1.6 + 5));
  const k = r / shape;
  const dome = 5.2 * (1 - k * k);
  const bumps = (vnoise(x * 0.22, z * 0.22) - 0.5) * 3.2 * clamp01(1.2 - k);
  return Math.max(-0.9, dome + bumps - 0.2);
};

type V3 = [number, number, number];
const G = 56, S = 52;
const pos: number[] = [], nor: number[] = [], col: number[] = [];
const P = (i: number, j: number): V3 => {
  const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S;
  return [x, heightAt(x, z), z];
};
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const slope = 1 - n[1]!;
  const jitter = (hash2(a[0] * 3.1 + c[0], a[2] * 2.7 + b[2]) - 0.5) * 0.12;
  let rgb: RGB;
  if (y < 0.45) rgb = y < -0.1 ? [0.62, 0.55, 0.38] : [0.86, 0.78, 0.5];
  else if (y > 4.0 || slope > 0.38) rgb = [0.5, 0.47, 0.44];
  else rgb = [0.22, 0.5 + (y / 4) * 0.08, 0.18];
  const shaded: RGB = [rgb[0] + jitter, rgb[1] + jitter, rgb[2] + jitter];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(shaded[0], shaded[1], shaded[2], 1);
  }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    face(P(i, j), P(i, j + 1), P(i + 1, j));
    face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
  }
}

// ---------- water ----------
const N = 240, SIZE = 300;
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
  float ph = dot(p, vec2(0.21, 0.13)) * 3.0 + clk * 1.4;
  float ph2 = dot(p, vec2(-0.17, 0.25)) * 3.0 + clk * 1.9;
  float h = sin(ph) * 0.14 + sin(ph2) * 0.09;
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-cos(ph) * 0.09 + cos(ph2) * 0.04, 1.0, -cos(ph) * 0.055 - cos(ph2) * 0.07));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.5 + clk * 0.8) - 0.5, 0.0, vnoise(vPos.xz * 1.5 - clk * 0.8) - 0.5) * 0.35);
  vec3 sunDir = normalize(vec3(sx, sy, sz));
  float day = smoothstep(-0.12, 0.25, sunDir.y);
  float dusk = 1.0 - clamp(abs(sunDir.y) * 3.0, 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  vec3 r = reflect(-v, n);
  vec3 skyDay = mix(vec3(0.62, 0.78, 0.92), vec3(0.15, 0.35, 0.7), clamp(r.y, 0.0, 1.0));
  vec3 skyNight = mix(vec3(0.05, 0.07, 0.16), vec3(0.02, 0.03, 0.09), clamp(r.y, 0.0, 1.0));
  vec3 skyCol = mix(skyNight, skyDay, day);
  skyCol = mix(skyCol, vec3(0.95, 0.5, 0.3), dusk * 0.45 * (1.0 - clamp(r.y, 0.0, 1.0)));
  vec3 deep = mix(vec3(0.015, 0.05, 0.1), vec3(0.03, 0.30, 0.42), day);
  float wob = vnoise(vPos.xz * 0.5 + clk * 0.2);
  deep = mix(deep, deep * vec3(1.2, 1.3, 1.1) + vec3(0.0, 0.03, 0.03) * day, wob);
  vec3 col = mix(deep, skyCol, clamp(fres * 0.85 + 0.08, 0.0, 1.0));
  vec3 lightDir = sunDir.y > 0.0 ? sunDir : -sunDir;
  vec3 lightCol = sunDir.y > 0.0 ? mix(vec3(1.0, 0.6, 0.35), vec3(1.0, 0.93, 0.78), smoothstep(0.0, 0.4, sunDir.y)) : vec3(0.55, 0.65, 0.95);
  float strength = sunDir.y > 0.0 ? 1.5 : 0.5;
  float glint = pow(max(dot(reflect(-lightDir, n), v), 0.0), 120.0);
  col += lightCol * glint * strength;
  // sparkling crests
  float spark = smoothstep(0.82, 1.0, vnoise(vPos.xz * 3.0 + vec2(clk * 0.7, -clk * 0.5)));
  col += lightCol * spark * 0.06 * (0.3 + day);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    clk: { type: "f32", value: 0 },
    sx: { type: "f32", value: 0.5 },
    sy: { type: "f32", value: 0.5 },
    sz: { type: "f32", value: 0.3 }
  }
});

// ---------- sun ----------
const DAY = 20;
const START_HOUR = 9;
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 40): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(START_HOUR);

// ---------- scene ----------
let sc = scene({ background: "#7aa6d0" })
  .camera(camera.orbit({ position: [0, 24, 40], target: [0, 1, 0], fov: 45, near: 1, far: 450, autoRotate: 0.12 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.0 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(geometry.custom(geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -1, -S / 2], max: [S / 2, 8, S / 2] }
  }), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
  .add(geometry.custom(geometry.define({
    positions: wPos, normals: wNor, indices: wIdx,
    bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] }
  }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }));

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [], lower: AuraTransformSpec[] = [], upper: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const lowerColors: string[] = [], upperColors: string[] = [], rockColors: string[] = [];
const placed: Array<[number, number]> = [];
for (let tries = 0, trees = 0; tries < 600 && trees < 26; tries += 1) {
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 15;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
  if (y < 0.9 || y > 3.8) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.6)) continue;
  placed.push([x, z]);
  trees += 1;
  const s = 0.8 + rand() * 0.6, ry = rand() * 6;
  trunks.push({ position: [x, y + 0.7 * s, z], scale: [0.35 * s, 1.4 * s, 0.35 * s] });
  lower.push({ position: [x, y + 2.0 * s, z], rotation: [0, ry, 0], scale: [2.4 * s, 2.4 * s, 2.4 * s] });
  upper.push({ position: [x, y + 3.2 * s, z], rotation: [0, ry, 0], scale: [1.7 * s, 2.0 * s, 1.7 * s] });
  const hue = 105 + Math.floor(rand() * 35), l = 22 + Math.floor(rand() * 12);
  lowerColors.push(`hsl(${hue}, 55%, ${l}%)`);
  upperColors.push(`hsl(${hue}, 58%, ${l + 6}%)`);
}
for (let tries = 0, n = 0; tries < 600 && n < 14; tries += 1) {
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 19;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
  if (y < -0.2 || y > 4.5) continue;
  const s = 0.5 + rand() * 1.0;
  rocks.push({ position: [x, y + 0.2 * s, z], rotation: [rand() * 3, rand() * 6, rand() * 3], scale: [s * 1.2, s * 0.8, s] });
  rockColors.push(`hsl(${20 + Math.floor(rand() * 20)}, 6%, ${38 + Math.floor(rand() * 22)}%)`);
  n += 1;
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
sc = sc
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6a4527", roughness: 1 }), params: { radialSegments: 5 } }))
  .add(instances.cone({ name: "canopy-low", transforms: lower, colors: lowerColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopy-up", transforms: upper, colors: upperColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white, params: { widthSegments: 5, heightSegments: 4 } }));

// ---------- app ----------
const app = createAuraApp("#app", { scene: sc });
let t = 0, clk = 0;

const SUN_DAY: RGB = [1.0, 0.95, 0.82], SUN_LOW: RGB = [1.0, 0.55, 0.3], MOON: RGB = [0.45, 0.55, 0.95];
const SKY_DAY: RGB = [0.81, 0.88, 0.95], SKY_NIGHT: RGB = [0.25, 0.3, 0.55];
const GND_DAY: RGB = [0.36, 0.42, 0.27], GND_NIGHT: RGB = [0.12, 0.14, 0.2];

app.onFrame((f) => {
  t += f.dt;
  clk += f.dt;
  const hour = (START_HOUR + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const day = smooth(-0.12, 0.25, sinE);
  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);

  // light: sun by day, moon (opposite side, above horizon) by night
  const above = sinE >= 0;
  const lightPos: V3 = above ? sunPos : [-sunPos[0], Math.max(12, -sunPos[1]), -sunPos[2]];
  const sunNode = app.nodes.require("sun");
  sunNode.setPosition(...lightPos);
  const warm = smooth(0.0, 0.45, sinE);
  const sunColor = above ? lerp3(SUN_LOW, SUN_DAY, warm) : MOON;
  const intensity = above ? 0.9 + 2.5 * Math.pow(Math.max(sinE, 0), 0.6) : 0.75;
  sunNode.setLight?.({ intensity: Math.max(0.75, intensity), color: css(sunColor) });
  app.nodes.require("hemi").setLight?.({
    intensity: 0.55 + 0.6 * day,
    skyColor: css(lerp3(SKY_NIGHT, SKY_DAY, day)),
    groundColor: css(lerp3(GND_NIGHT, GND_DAY, day))
  } as never);

  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const water = app.nodes.require("water");
  const len = Math.hypot(...sunPos) || 1;
  water.setUniform?.("clk", clk);
  water.setUniform?.("sx", sunPos[0] / len);
  water.setUniform?.("sy", sunPos[1] / len);
  water.setUniform?.("sz", sunPos[2] / len);
});

await app.ready();
window.__EVAL_READY__ = true;
