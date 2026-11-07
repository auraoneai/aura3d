import {
  camera,
  createAuraApp,
  effects,
  geometry,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

const DAY_SECONDS = 20;
const HOUR0 = 9;

// ---------- deterministic helpers ----------
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: V3): string =>
  `rgb(${Math.round(clamp(c[0], 0, 1) * 255)},${Math.round(clamp(c[1], 0, 1) * 255)},${Math.round(clamp(c[2], 0, 1) * 255)})`;

// ---------- island terrain ----------
const shoreRadius = (a: number): number => 14 * (1 + 0.12 * Math.sin(3 * a + 1) + 0.07 * Math.sin(5 * a + 2));
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const t = r / shoreRadius(Math.atan2(z, x));
  const base = 6.5 * (1 - t * t) - 0.8;
  const bump = (0.5 * Math.sin(x * 0.5 + 1) * Math.cos(z * 0.45) + 0.3 * Math.sin(x * 0.9 + z * 0.7)) * clamp(base / 2, 0, 1);
  return Math.max(-2, base + bump);
};

const G = 46;
const S = 46;
const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const P = (i: number, j: number): V3 => {
  const edge = i === 0 || j === 0 || i === G || j === G;
  const jx = edge ? 0 : (hash2(i, j) - 0.5) * 0.7;
  const jz = edge ? 0 : (hash2(j + 17, i + 3) - 0.5) * 0.7;
  const x = (i / G - 0.5) * S + jx;
  const z = (j / G - 0.5) * S + jz;
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
  const jit = 0.88 + 0.24 * hash2(a[0] * 3.1 + b[0], c[2] * 2.3 + a[2]);
  let rgb: V3;
  if (y < 0.15) rgb = [0.55, 0.5, 0.36];
  else if (y < 0.85) rgb = [0.85, 0.76, 0.5];
  else if (y < 3.6) rgb = n[1]! < 0.72 ? [0.45, 0.4, 0.34] : [0.24, 0.52, 0.2];
  else if (y < 4.8) rgb = [0.5, 0.46, 0.42];
  else rgb = [0.92, 0.92, 0.95];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0] * jit, rgb[1] * jit, rgb[2] * jit, 1);
  }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    face(P(i, j), P(i, j + 1), P(i + 1, j));
    face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
  }
}
const islandGeometry = geometry.define({
  positions: new Float32Array(pos),
  normals: new Float32Array(nor),
  colors: new Float32Array(col),
  indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
  bounds: { min: [-S / 2, -2.5, -S / 2], max: [S / 2, 8, S / 2] }
});

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const crownColorsLow: string[] = [];
const crownColorsHigh: string[] = [];
let tries = 0;
while (trunks.length < 34 && tries < 4000) {
  tries += 1;
  const a = rand() * Math.PI * 2;
  const r = 15 * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const y = heightAt(x, z);
  if (y < 1.0 || y > 3.6) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, y + 0.7 * s, z], scale: [0.3 * s, 1.4 * s, 0.3 * s] });
  crownsLow.push({ position: [x, y + 2.0 * s, z], rotation: [0, rand() * 6, 0], scale: [2.0 * s, 2.4 * s, 2.0 * s] });
  crownsHigh.push({ position: [x, y + 3.3 * s, z], rotation: [0, rand() * 6, 0], scale: [1.4 * s, 2.0 * s, 1.4 * s] });
  const h = 110 + Math.floor(rand() * 35);
  crownColorsLow.push(`hsl(${h}, 50%, ${24 + Math.floor(rand() * 10)}%)`);
  crownColorsHigh.push(`hsl(${h}, 55%, ${30 + Math.floor(rand() * 10)}%)`);
}
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
tries = 0;
while (rocks.length < 22 && tries < 4000) {
  tries += 1;
  const a = rand() * Math.PI * 2;
  const r = 4 + 14 * rand();
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const y = heightAt(x, z);
  if (y < -0.3 || y > 4.5) continue;
  const s = 0.5 + rand() * 1.0;
  rocks.push({
    position: [x, y + 0.2 * s, z],
    rotation: [rand() * 0.8, rand() * 6, rand() * 0.8],
    scale: [s * 1.2, s * 0.8, s]
  });
  rockColors.push(`hsl(${25 + Math.floor(rand() * 20)}, 6%, ${38 + Math.floor(rand() * 22)}%)`);
}

// ---------- water ----------
const N = 250;
const WSIZE = 500;
const wPos = new Float32Array((N + 1) * (N + 1) * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    wPos.set([(i / N - 0.5) * WSIZE, 0, (j / N - 0.5) * WSIZE], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < N && j < N) wIdx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}
const waterMaterial = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float ph1 = dot(p, vec2(0.35, 0.22)) + clk * 1.4;
  float ph2 = dot(p, vec2(-0.28, 0.4)) + clk * 1.9;
  float ph3 = dot(p, vec2(0.7, -0.5)) + clk * 2.6;
  float h = sin(ph1) * 0.16 + sin(ph2) * 0.1 + sin(ph3) * 0.04;
  vPos = vec3(p.x, h, p.y);
  float dx = cos(ph1) * 0.16 * 0.35 + cos(ph2) * 0.1 * -0.28 + cos(ph3) * 0.04 * 0.7;
  float dz = cos(ph1) * 0.16 * 0.22 + cos(ph2) * 0.1 * 0.4 + cos(ph3) * 0.04 * -0.5;
  vN = normalize(vec3(-dx, 1.0, -dz));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float shoreR(float a) { return 14.0 * (1.0 + 0.12 * sin(3.0 * a + 1.0) + 0.07 * sin(5.0 * a + 2.0)); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec2 q = vPos.xz;
  vec3 n = normalize(vN + vec3(vnoise(q * 0.9 + clk * 0.6) - 0.5, 0.0, vnoise(q * 0.9 - clk * 0.5 + 7.0) - 0.5) * 0.35);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  vec3 rd = reflect(-v, n);
  vec3 skyc = mix(horizonCol, zenithCol, pow(clamp(rd.y, 0.0, 1.0), 0.5));
  float d = length(q) - 0.936 * shoreR(atan(q.y, q.x));
  float shallow = 1.0 - smoothstep(0.0, 8.0, d);
  vec3 body = mix(vec3(0.02, 0.17, 0.32), vec3(0.08, 0.5, 0.55), shallow) * (0.18 + 0.82 * lightAmt);
  float wob = 0.45 * sin(clk * 1.6 - d * 1.5) + (vnoise(q * 1.5 + clk * 0.3) - 0.5) * 0.9;
  float foam = (1.0 - smoothstep(0.1, 1.1, d + wob)) * smoothstep(-1.5, -0.2, d);
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 90.0);
  vec3 col = mix(body, skyc, clamp(fres * 0.85 + 0.06, 0.0, 1.0));
  col += sunCol * glint * 1.6;
  col = mix(col, vec3(0.95, 0.97, 1.0) * (0.25 + 0.75 * lightAmt), clamp(foam, 0.0, 1.0) * 0.85);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    clk: { type: "f32", value: 0 },
    lightAmt: { type: "f32", value: 1 },
    sunDir: { type: "vec3", value: [0, 1, 0] },
    sunCol: { type: "vec3", value: [1, 0.9, 0.7] },
    horizonCol: { type: "vec3", value: [0.6, 0.75, 0.9] },
    zenithCol: { type: "vec3", value: [0.2, 0.4, 0.8] }
  }
});

// ---------- sun / sky math ----------
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 40): V3 => {
  const E = (e * Math.PI) / 180;
  const A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};

const s0 = sunAt(HOUR0);
const sc = scene({ background: "#8fb4d8" })
  .camera(camera.orbit({ position: [0, 17, 46], target: [0, 2, 0], fov: 45, near: 1, far: 700, autoRotate: 0.12 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#bcd4f0", groundColor: "#4a5a3a", intensity: 1.1 }).runtime({ id: "hemi", mutable: true }))
  .add(
    lights
      .directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, color: "#fff0d0", shadow: true })
      .runtime({ id: "sun", mutable: true })
  )
  .add(
    lights
      .directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0, color: "#8fb0ff" })
      .runtime({ id: "moon", mutable: true })
  )
  .add(effects.fog({ color: "#a9c4e0", density: 0.003 }))
  .add(
    geometry.custom(islandGeometry, {
      name: "island",
      material: material.pbr({ color: "#ffffff", roughness: 0.95 })
    })
  )
  .add(
    geometry
      .custom(
        geometry.define({
          positions: wPos,
          normals: wNor,
          indices: wIdx,
          bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] }
        }),
        { name: "water", material: waterMaterial, castShadow: false }
      )
      .runtime({ id: "water", mutable: true })
  )
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 5 } }))
  .add(
    instances.cone({
      name: "crownsLow",
      transforms: crownsLow,
      colors: crownColorsLow,
      material: material.pbr({ color: "#ffffff", roughness: 0.9 }),
      params: { radialSegments: 6 }
    })
  )
  .add(
    instances.cone({
      name: "crownsHigh",
      transforms: crownsHigh,
      colors: crownColorsHigh,
      material: material.pbr({ color: "#ffffff", roughness: 0.9 }),
      params: { radialSegments: 6 }
    })
  )
  .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));

const app = createAuraApp("#app", { scene: sc });

const HORIZON_DAY: V3 = [0.62, 0.76, 0.92];
const ZENITH_DAY: V3 = [0.16, 0.36, 0.78];
const HORIZON_DUSK: V3 = [0.95, 0.5, 0.28];
const ZENITH_DUSK: V3 = [0.25, 0.25, 0.5];
const HORIZON_NIGHT: V3 = [0.05, 0.07, 0.16];
const ZENITH_NIGHT: V3 = [0.01, 0.02, 0.07];

let clk = 0;
let t = 0;
app.onFrame((f) => {
  clk += f.dt;
  t += f.dt;
  const hour = (HOUR0 + (t / DAY_SECONDS) * 24) % 24;
  const s = sunAt(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const day = smooth(-0.1, 0.35, sinE);
  const dusk = Math.exp(-Math.pow(sinE / 0.22, 2));

  let horizon = mix3(HORIZON_NIGHT, HORIZON_DAY, day);
  let zenith = mix3(ZENITH_NIGHT, ZENITH_DAY, day);
  horizon = mix3(horizon, HORIZON_DUSK, dusk * 0.7);
  zenith = mix3(zenith, ZENITH_DUSK, dusk * 0.4);

  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  const moonPos = dirOf(-s.elevationDeg, s.azimuthDeg + 180);
  const sunVisible = smooth(-0.05, 0.12, sinE);
  const sunWarm = mix3([1, 0.95, 0.85], [1, 0.55, 0.28], dusk);

  const sun = app.nodes.require("sun");
  sun.setPosition(...sunPos);
  sun.setLight?.({ intensity: 3.4 * sunVisible * Math.max(0.15, sinE), color: css(sunWarm) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...moonPos);
  moon.setLight?.({ intensity: 0.9 * (1 - day) });
  app.nodes.require("hemi").setLight?.({ intensity: 0.35 + 0.8 * day });

  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  app.atmosphere?.setFog({ color: css(mix3(horizon, [0.3, 0.3, 0.35], 0.0)), density: 0.003 });

  const len = Math.hypot(...sunPos) || 1;
  const water = app.nodes.require("water");
  water.setUniform?.("clk", clk);
  water.setUniform?.("lightAmt", 0.2 + 0.8 * day);
  water.setUniform?.("sunDir", [sunPos[0] / len, sunPos[1] / len, sunPos[2] / len]);
  water.setUniform?.("sunCol", [sunWarm[0] * sunVisible, sunWarm[1] * sunVisible, sunWarm[2] * sunVisible]);
  water.setUniform?.("horizonCol", horizon);
  water.setUniform?.("zenithCol", zenith);
});

await app.ready();
window.__EVAL_READY__ = true;
