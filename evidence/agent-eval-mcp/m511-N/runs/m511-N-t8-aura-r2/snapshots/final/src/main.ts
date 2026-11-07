import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  instances,
  lights,
  material,
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

// ---------- seeded random ----------
let seed = 2024;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- island height field ----------
const R = 24;
const H = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const t = Math.max(0, 1 - r / R);
  const bumps = Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.38) * 0.7 + Math.sin(x * 0.9 - z * 0.7) * 0.3;
  const base = 8 * Math.pow(t, 1.25);
  return base + bumps * Math.min(1, t * 3) - 1.0;
};

// ---------- flat-shaded terrain ----------
const G = 56;
const S = 64;
const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const P = (i: number, j: number): V3 => {
  const x = (i / G - 0.5) * S;
  const z = (j / G - 0.5) * S;
  return [x, H(x, z), z];
};
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
  const k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  const j = 0.9 + rand() * 0.2;
  const base = y < 0.25 ? [0.82, 0.72, 0.46] : y < 4.2 ? [0.22, 0.5, 0.2] : y < 6.2 ? [0.5, 0.45, 0.4] : [0.92, 0.93, 0.95];
  const rgb = y < -0.2 ? [0.55, 0.5, 0.35] : base;
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0]! * j, rgb[1]! * j, rgb[2]! * j, 1);
  }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    face(P(i, j), P(i, j + 1), P(i + 1, j));
    face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
  }
}

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let tries = 0; tries < 400 && trunks.length < 34; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * 20;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const y = H(x, z);
  if (y < 0.6 || y > 4.6) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, y + 0.7 * s, z], scale: [0.35 * s, 1.4 * s, 0.35 * s] });
  canopies.push({ position: [x, y + 1.4 * s + 1.4 * s, z], scale: [2.0 * s, 3.2 * s, 2.0 * s] });
  canopyColors.push(`hsl(${105 + Math.floor(rand() * 30)}, 55%, ${24 + Math.floor(rand() * 14)}%)`);
}
for (let tries = 0; tries < 400 && rocks.length < 16; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * 23;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const y = H(x, z);
  if (y < -0.3 || y > 6) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, y + 0.15 * s, z], rotation: [rand(), rand() * 6, rand()], scale: [s, s * 0.7, s] });
  rockColors.push(`hsl(30, 6%, ${35 + Math.floor(rand() * 25)}%)`);
}

// ---------- water grid ----------
const N = 160;
const WS = 220;
const wPos = new Float32Array((N + 1) * (N + 1) * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    wPos.set([(i / N - 0.5) * WS, 0, (j / N - 0.5) * WS], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < N && j < N) wIdx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float ph = dot(p, vec2(0.21, 0.13)) * 3.0 + clk;
  float ph2 = dot(p, vec2(-0.17, 0.25)) * 3.0 + clk * 1.3;
  vPos = vec3(p.x, sin(ph) * 0.18 + sin(ph2) * 0.12, p.y);
  vN = normalize(vec3(-cos(ph) * 0.11 - cos(ph2) * 0.06, 1.0, -cos(ph) * 0.07 + cos(ph2) * 0.09));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.5 + clk) - 0.5, 0.0, vnoise(vPos.xz * 1.5 - clk) - 0.5) * 0.3);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float lum = 0.12 + 0.88 * day;
  vec3 skyCol = mix(vec3(0.62, 0.78, 0.92), vec3(0.15, 0.35, 0.7), clamp(reflect(-v, n).y, 0.0, 1.0));
  skyCol = mix(skyCol, vec3(0.9, 0.5, 0.3), glow) * lum + vec3(0.02, 0.03, 0.07) * (1.0 - day);
  vec3 deep = vec3(0.03, 0.30, 0.45) * lum + vec3(0.01, 0.02, 0.05);
  vec3 sunDir = normalize(vec3(sx, max(sy, 0.05), sz));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 120.0) * step(0.0, sy);
  float foam = smoothstep(0.78, 1.0, vnoise(vPos.xz * 0.8 + vec2(clk * 0.3, 0.0)) * (0.6 + vPos.y * 2.0 + 0.4)) * 0.15;
  vec3 c = mix(deep, skyCol, clamp(fres * 0.8 + 0.12, 0.0, 1.0)) + vec3(1.0, 0.93, 0.78) * glint * 1.5 + vec3(foam) * lum;
  outColor = vec4(c, 1.0);
}`
  },
  uniforms: {
    clk: { type: "f32", value: 0 },
    day: { type: "f32", value: 1 },
    glow: { type: "f32", value: 0 },
    sx: { type: "f32", value: 0.5 },
    sy: { type: "f32", value: 0.5 },
    sz: { type: "f32", value: 0.3 }
  }
});

// ---------- sun ----------
const DAY = 20;
const START_HOUR = 10;
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 60): V3 => {
  const E = (e * Math.PI) / 180;
  const A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(START_HOUR);

const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
const sc = scene({ background: "#8fb4d8" })
  .camera(camera.orbit({ position: [0, 38, 62], target: [0, 1.5, 0], fov: 45, near: 1, far: 500, autoRotate: 0.12 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(
    lights.hemisphere({ name: "hemi", skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 0.9 }).runtime({ id: "hemi", mutable: true })
  )
  .add(
    lights
      .directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true })
      .runtime({ id: "sun", mutable: true })
  )
  .add(effects.fog({ color: "#a9c4dc", density: 0.0025 }))
  .add(
    geometry.custom(
      geometry.define({
        positions: new Float32Array(pos),
        normals: new Float32Array(nor),
        colors: new Float32Array(col),
        indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
        bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 9, S / 2] }
      }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
    )
  )
  .add(
    geometry.custom(
      geometry.define({
        positions: wPos,
        normals: wNor,
        indices: wIdx,
        bounds: { min: [-WS / 2, -1, -WS / 2], max: [WS / 2, 1, WS / 2] }
      }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true })
  )
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24" }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

const app = createAuraApp("#app", { scene: sc });

let clk = 0;
let t = 0;
app.onFrame((f) => {
  clk += f.dt;
  t += f.dt;
  const hour = (START_HOUR + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2); // -1..1
  const day = Math.min(1, Math.max(0, elev * 2.5 + 0.35));
  const glow = Math.max(0, 1 - Math.abs(elev) * 4) * 0.6;
  const d = dirOf(s.elevationDeg, s.azimuthDeg);

  const sun = app.nodes.require("sun");
  sun.setPosition(d[0], Math.max(d[1], 8), d[2]);
  sun.setLight?.({ intensity: 3.2 * Math.max(0.1, elev) + 0.15, color: glow > 0.2 ? "#ffb070" : "#fff4e0" });
  app.nodes.require("hemi").setLight?.({ intensity: 0.25 + 0.75 * day });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  app.atmosphere?.setFog({ color: day > 0.5 ? "#a9c4dc" : "#1a2238", density: 0.0025 });

  const w = app.nodes.require("water");
  w.setUniform?.("clk", clk);
  w.setUniform?.("day", day);
  w.setUniform?.("glow", glow);
  w.setUniform?.("sx", d[0]);
  w.setUniform?.("sy", d[1]);
  w.setUniform?.("sz", d[2]);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
