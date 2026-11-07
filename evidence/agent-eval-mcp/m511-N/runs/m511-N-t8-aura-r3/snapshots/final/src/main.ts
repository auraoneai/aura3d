import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------- deterministic random ----------
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash2 = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- island height field ----------
const G = 46; // quads per side
const S = 40; // metres per side
const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const R = 13 + 1.8 * Math.sin(3 * a + 1) + 1.1 * Math.sin(5 * a + 2) + 0.6 * Math.sin(8 * a);
  const t = r / R;
  const dome = 5.2 * (1 - t * t) - 0.35;
  const bumps = 0.7 * Math.sin(x * 0.55 + 0.7) * Math.cos(z * 0.5) + 0.35 * Math.sin(x * 1.1 + z * 0.9);
  const h = dome + bumps * Math.max(0, Math.min(1, 1.3 - t));
  return Math.max(-1.6, h);
};

const grid: V3[] = [];
for (let j = 0; j <= G; j += 1) {
  for (let i = 0; i <= G; i += 1) {
    const jx = (hash2(i, j) - 0.5) * 0.7; // jitter breaks the regular grid into a low-poly look
    const jz = (hash2(i + 91, j + 17) - 0.5) * 0.7;
    const x = (i / G - 0.5) * S + jx;
    const z = (j / G - 0.5) * S + jz;
    grid.push([x, height(x, z), z]);
  }
}
const P = (i: number, j: number): V3 => grid[j * (G + 1) + i]!;

const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const face = (a: V3, b: V3, c: V3, key: number): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
  const k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const v = 0.88 + 0.24 * hash2(key, key * 0.37);
  let rgb: V3;
  if (y < -0.2) rgb = [0.55, 0.5, 0.36];
  else if (y < 0.55) rgb = [0.86, 0.76, 0.5];
  else if (y < 3.0) rgb = [0.24, 0.55, 0.2];
  else if (y < 4.3) rgb = [0.45, 0.4, 0.34];
  else rgb = [0.82, 0.82, 0.8];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0] * v, rgb[1] * v, rgb[2] * v, 1);
  }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    const key = j * G + i;
    if ((i + j) % 2 === 0) {
      face(P(i, j), P(i, j + 1), P(i + 1, j), key);
      face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1), key + 5000);
    } else {
      face(P(i, j), P(i, j + 1), P(i + 1, j + 1), key);
      face(P(i, j), P(i + 1, j + 1), P(i + 1, j), key + 5000);
    }
  }
}
const terrain = geometry.custom(
  geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 7, S / 2] }
  }),
  { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
);

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const crownColors: string[] = [];
const crownColorsHigh: string[] = [];
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let n = 0, tries = 0; n < 26 && tries < 2000; tries += 1) {
  const x = (rand() - 0.5) * 26;
  const z = (rand() - 0.5) * 26;
  const h = height(x, z);
  if (h < 0.8 || h > 3.6) continue;
  n += 1;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, h + 0.6 * s, z], scale: [0.3 * s, 1.2 * s, 0.3 * s] });
  crownsLow.push({ position: [x, h + 1.9 * s, z], rotation: [0, rand() * 6, 0], scale: [1.9 * s, 2.2 * s, 1.9 * s] });
  crownsHigh.push({ position: [x, h + 3.0 * s, z], rotation: [0, rand() * 6, 0], scale: [1.4 * s, 1.8 * s, 1.4 * s] });
  const hue = 105 + Math.floor(rand() * 35);
  crownColors.push(`hsl(${hue}, 50%, ${24 + Math.floor(rand() * 10)}%)`);
  crownColorsHigh.push(`hsl(${hue}, 55%, ${30 + Math.floor(rand() * 10)}%)`);
}
for (let n = 0, tries = 0; n < 16 && tries < 2000; tries += 1) {
  const x = (rand() - 0.5) * 32;
  const z = (rand() - 0.5) * 32;
  const h = height(x, z);
  if (h < -0.3 || h > 4.8) continue;
  n += 1;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, h + 0.2 * s, z], rotation: [rand() * 1.2, rand() * 6, rand() * 1.2], scale: [s * 1.2, s * 0.8, s] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 22)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });

// ---------- water ----------
const WN = 256;
const WS = 400;
const wPos = new Float32Array((WN + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    wPos.set([(i / WN - 0.5) * WS, 0, (j / WN - 0.5) * WS], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < WN && j < WN) wIdx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float a = dot(p, vec2(0.31, 0.17)) * 2.0 + clk * 1.4;
  float b = dot(p, vec2(-0.21, 0.29)) * 2.0 + clk * 1.9;
  float c = dot(p, vec2(0.11, -0.37)) * 2.4 - clk * 1.1;
  float h = sin(a) * 0.16 + sin(b) * 0.1 + sin(c) * 0.07;
  float dx = cos(a) * 0.16 * 0.62 + cos(b) * 0.1 * -0.42 + cos(c) * 0.07 * 0.22 * 1.2;
  float dz = cos(a) * 0.16 * 0.34 + cos(b) * 0.1 * 0.58 + cos(c) * 0.07 * -0.74 * 1.2;
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-dx, 1.0, -dz));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 fn = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (fn.y < 0.0) fn = -fn;
  vec3 n = normalize(mix(vN, fn, 0.75));
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float r = length(vPos.xz);
  float shallow = 1.0 - smoothstep(11.0, 21.0, r);
  float lit = mix(0.22, 1.0, day);
  vec3 deep = mix(vec3(0.01, 0.05, 0.12), vec3(0.02, 0.2, 0.38), day);
  vec3 lagoon = mix(vec3(0.03, 0.12, 0.2), vec3(0.1, 0.62, 0.66), day);
  vec3 base = mix(deep, lagoon, shallow);
  vec3 skyCol = mix(vec3(0.05, 0.08, 0.2), vec3(0.6, 0.78, 0.95), day);
  vec3 col = mix(base, skyCol, clamp(fres * 0.8 + 0.06, 0.0, 1.0));
  vec3 L = normalize(vec3(sunX, sunY, sunZ));
  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 90.0) * day;
  float spark = pow(max(dot(reflect(-L, n), v), 0.0), 12.0) * 0.12 * day;
  float diff = max(dot(n, L), 0.0) * day * 0.25;
  float crest = smoothstep(0.2, 0.33, vPos.y) * 0.25 * lit;
  col += vec3(1.0, 0.9, 0.7) * (glint * 1.6 + spark) + base * diff + vec3(crest);
  // moon sheen at night
  col += vec3(0.1, 0.14, 0.25) * fres * (1.0 - day) * 0.5;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    clk: { type: "f32", value: 0 },
    sunX: { type: "f32", value: 0.5 },
    sunY: { type: "f32", value: 0.6 },
    sunZ: { type: "f32", value: 0.3 },
    day: { type: "f32", value: 1 }
  }
});

// ---------- day / night ----------
const DAY_SECONDS = 20;
const START_HOUR = 9;
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 62,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 40): V3 => {
  const E = (e * Math.PI) / 180;
  const A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: V3): string =>
  "#" + c.map((q) => Math.round(Math.min(1, Math.max(0, q)) * 255).toString(16).padStart(2, "0")).join("");

const s0 = sunAt(START_HOUR);
const app = createAuraApp("#app", {
  scene: scene({ background: "#8fb8e0" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "hemi", skyColor: "#cfe3ff", groundColor: "#566446", intensity: 1.0 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.4, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.1, color: "#9db8ff" }).runtime({ id: "moon", mutable: true }))
    .add(terrain)
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns-low", transforms: crownsLow, colors: crownColors, material: white, params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns-high", transforms: crownsHigh, colors: crownColorsHigh, material: white, params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .add(
      geometry
        .custom(
          geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WS / 2, -1, -WS / 2], max: [WS / 2, 1, WS / 2] } }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .add(effects.fog({ color: "#a9c8e6", density: 0.004 }))
    .camera(camera.orbit({ position: [25, 21, 25], target: [0, 0.8, 0], fov: 45, near: 0.5, far: 600, autoRotate: 0.12 }))
});

let clk = 0;
app.onFrame((f) => {
  clk += f.dt;
  const hour = (START_HOUR + (clk / DAY_SECONDS) * 24) % 24;
  const s = sunAt(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const day = smooth(-0.12, 0.3, sinE);
  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  const moonPos = dirOf(-s.elevationDeg, s.azimuthDeg + 180);

  const sun = app.nodes.require("sun");
  sun.setPosition(...sunPos);
  const warm = smooth(0, 0.45, sinE);
  sun.setLight?.({ intensity: 3.4 * smooth(-0.02, 0.25, sinE), color: hex(mix3([1, 0.55, 0.3], [1, 0.96, 0.88], warm)) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...moonPos);
  moon.setLight?.({ intensity: 0.1 + 0.9 * (1 - day) });
  app.nodes.require("hemi").setLight?.({
    intensity: 0.45 + 0.65 * day,
    color: hex(mix3([0.4, 0.5, 0.85], [1, 1, 1], day))
  });

  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const fogCol = mix3([0.05, 0.08, 0.17], mix3([0.9, 0.6, 0.45], [0.66, 0.78, 0.9], smooth(0.05, 0.5, sinE)), day);
  app.atmosphere?.setFog({ color: hex(fogCol), density: 0.004 });

  const w = app.nodes.require("water");
  w.setUniform?.("clk", clk);
  const L = Math.hypot(sunPos[0], sunPos[1], sunPos[2]);
  w.setUniform?.("sunX", sunPos[0] / L);
  w.setUniform?.("sunY", sunPos[1] / L);
  w.setUniform?.("sunZ", sunPos[2] / L);
  w.setUniform?.("day", day);
});

await app.ready();
window.__EVAL_READY__ = true;
