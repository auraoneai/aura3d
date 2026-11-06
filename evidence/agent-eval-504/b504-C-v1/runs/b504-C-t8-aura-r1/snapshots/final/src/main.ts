import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------- helpers ----------
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: V3): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
const toLinear = (c: V3): V3 => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];

let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- island height field ----------
// Shoreline radius depends on the angle; the water shader uses the same formula for foam.
const shoreR = (a: number): number => 10 + 0.7 * Math.sin(3 * a + 1) + 0.4 * Math.sin(5 * a + 2);
const H = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const d = shoreR(Math.atan2(z, x)) - r; // > 0 on land
  if (d <= 0) return Math.max(d * 0.35, -2.2);
  const u = Math.min(d / 9, 1);
  const base = 4.4 * u * (2 - u);
  const bumps = (Math.sin(x * 0.9 + 0.5) * Math.cos(z * 0.8) * 0.45 + Math.sin(x * 0.35 - z * 0.5) * 0.5) * Math.min(1, u * 3);
  return base + bumps;
};

// ---------- terrain mesh (flat shaded, one normal and colour per face) ----------
const G = 64, S = 36;
const pos: number[] = [], nor: number[] = [], col: number[] = [];
const P = (i: number, j: number): V3 => {
  const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S;
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
  const jit = 0.88 + rand() * 0.24;
  let rgb: V3;
  if (y < -0.2) rgb = [0.55, 0.5, 0.36];
  else if (y < 0.35) rgb = [0.86, 0.77, 0.5];
  else if (y < 2.6) rgb = [0.27, 0.58, 0.22];
  else if (y < 3.7) rgb = [0.38, 0.5, 0.25];
  else rgb = [0.56, 0.52, 0.47];
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

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
let tries = 0;
while (trunks.length < 22 && tries < 2000) {
  tries += 1;
  const a = rand() * Math.PI * 2, r = rand() * 9;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < 0.7 || y > 3.3) continue;
  const s = 0.75 + rand() * 0.6;
  trunks.push({ position: [x, y + 0.55 * s, z], scale: [0.28 * s, 1.1 * s, 0.28 * s] });
  crownsLow.push({ position: [x, y + 1.55 * s, z], scale: [1.7 * s, 1.8 * s, 1.7 * s] });
  crownsHigh.push({ position: [x, y + 2.45 * s, z], scale: [1.2 * s, 1.5 * s, 1.2 * s] });
}
tries = 0;
while (rocks.length < 14 && tries < 2000) {
  tries += 1;
  const a = rand() * Math.PI * 2, r = 3 + rand() * 8;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, y = H(x, z);
  if (y < 0.1 || y > 4.2) continue;
  const s = 0.35 + rand() * 0.6;
  rocks.push({ position: [x, y + 0.15 * s, z], rotation: [rand() * 0.6, rand() * 6, rand() * 0.6], scale: [s * 1.3, s * 0.9, s * 1.1] });
}

// ---------- water ----------
const WN = 240, WSIZE = 200;
const wPos = new Float32Array((WN + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    wPos.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < WN && j < WN) wIdx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void addWave(vec2 p, float t, vec2 k, float a, float s, inout float h) {
  h += a * sin(dot(p, k) + t * s);
}
void main() {
  float h = 0.0;
  vec2 p = position.xz;
  addWave(p, waveClock, vec2(0.63, 0.39), 0.17, 1.1, h);
  addWave(p, waveClock, vec2(-0.51, 0.75), 0.12, 1.4, h);
  addWave(p, waveClock, vec2(1.2, 0.93), 0.05, 2.1, h);
  vec3 w = vec3(p.x, h, p.y);
  vPos = w;
  gl_Position = modelViewProjectionMatrix * vec4(w, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  float fres = pow(clamp(1.0 - clamp(dot(n, v), 0.0, 1.0), 0.0, 1.0), 3.0);
  float r = length(vPos.xz);
  float a = atan(vPos.z, vPos.x);
  float shore = 10.0 + 0.7 * sin(3.0 * a + 1.0) + 0.4 * sin(5.0 * a + 2.0);
  float d = r - shore;
  vec3 deep = vec3(0.02, 0.2, 0.36);
  vec3 shallow = vec3(0.1, 0.62, 0.66);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 7.0, d));
  float ndl = max(dot(n, normalize(sunDirW)), 0.0);
  body *= (0.2 + 0.8 * dayLevel) * (0.65 + 0.5 * ndl);
  body += sunColW * ndl * 0.08;
  vec3 col = mix(body, skyColW, clamp(fres * 0.85 + 0.04, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(sunDirW), n), v), 0.0), 80.0);
  col += sunColW * glint * 1.3;
  float foam = smoothstep(-0.4, 0.0, d) * (1.0 - smoothstep(0.2, 1.5, d));
  foam *= 0.55 + 0.45 * smoothstep(-0.15, 0.15, vPos.y);
  col = mix(col, vec3(0.9, 0.95, 1.0) * (0.15 + 0.85 * dayLevel), foam * 0.8);
  float dist = length(cameraPosition - vPos);
  col = mix(col, skyColW, smoothstep(45.0, 95.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    sunDirW: { type: "vec3", value: [0.5, 0.7, 0.3] },
    sunColW: { type: "vec3", value: [1, 0.9, 0.7] },
    skyColW: { type: "vec3", value: [0.3, 0.5, 0.8] },
    dayLevel: { type: "f32", value: 1 }
  }
});

// ---------- sun / sky ----------
const DAY = 20; // seconds per full cycle
const HOUR0 = 9;
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 40): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(HOUR0);

const app = createAuraApp("#app", {
  scene: scene({ background: "#6fa0d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "fill", skyColor: "#b8d0f0", groundColor: "#4a5a3a", intensity: 1.0 }).runtime({ id: "fill", mutable: true }))
    .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.5, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(geometry.define({
      positions: new Float32Array(pos),
      normals: new Float32Array(nor),
      colors: new Float32Array(col),
      indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
      bounds: { min: [-S / 2, -3, -S / 2], max: [S / 2, 7, S / 2] }
    }), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crownsLow", transforms: crownsLow, material: material.pbr({ color: "#2f7a3a", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crownsHigh", transforms: crownsHigh, material: material.pbr({ color: "#3b8f45", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#8d8a85", roughness: 1 }) }))
    .add(geometry.custom(geometry.define({
      positions: wPos, normals: wNor, indices: wIdx,
      bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] }
    }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }))
    .add(effects.fog({ color: "#a9c4e0", density: 0.002 }))
    .camera(camera.orbit({ position: [0, 15, 27], target: [0, 1, 0], fov: 50, near: 0.5, far: 400, autoRotate: 0.12 }))
});

let clock = 0;
const NIGHT_SKY: V3 = [0.04, 0.06, 0.15];
const DAY_SKY: V3 = [0.5, 0.72, 0.93];
const DUSK_SKY: V3 = [0.95, 0.55, 0.35];

app.onFrame((f) => {
  clock += f.dt;
  const hour = (HOUR0 + (clock / DAY) * 24) % 24;
  const s = sunAt(hour);
  const el = Math.sin(((hour - 6) / 24) * Math.PI * 2); // -1..1
  const dayF = smooth(-0.12, 0.25, el);
  const sunUp = smooth(0, 0.25, el);
  const moonUp = 1 - smooth(-0.25, 0, el);

  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  const moonPos = dirOf(-s.elevationDeg, s.azimuthDeg + 180);
  app.nodes.require("sun").setPosition(...sunPos);
  app.nodes.require("moon").setPosition(...moonPos);
  app.nodes.require("sun").setLight?.({ intensity: 3.6 * sunUp });
  app.nodes.require("moon").setLight?.({ intensity: 0.15 + 0.9 * moonUp });

  // fill light never drops to zero
  const fillCol = mix3([0.35, 0.45, 0.7], [0.72, 0.82, 0.95], dayF);
  app.nodes.require("fill").setLight?.({ intensity: 0.5 + 0.7 * dayF, color: hex(fillCol) });

  // sky tint used by fog and water
  const dusk = clamp01(1 - Math.abs(el) / 0.35) * 0.85;
  const skyDisp = mix3(mix3(NIGHT_SKY, DAY_SKY, dayF), DUSK_SKY, dusk);
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  app.atmosphere?.setFog({ color: hex(skyDisp), density: 0.002 });

  // water follows the sun (moon at night)
  const useSun = el > 0;
  const lp = useSun ? sunPos : moonPos;
  const ll = Math.hypot(lp[0], lp[1], lp[2]) || 1;
  const warm = mix3([1, 0.95, 0.85], [1, 0.55, 0.3], dusk);
  const sunStrength = sunUp;
  const moonStrength = 0.3 * moonUp;
  const lightCol: V3 = useSun
    ? [warm[0] * sunStrength, warm[1] * sunStrength, warm[2] * sunStrength]
    : [0.6 * moonStrength, 0.7 * moonStrength, 1 * moonStrength];
  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", clock);
  w.setUniform?.("sunDirW", [lp[0] / ll, lp[1] / ll, lp[2] / ll]);
  w.setUniform?.("sunColW", lightCol);
  w.setUniform?.("skyColW", toLinear(skyDisp));
  w.setUniform?.("dayLevel", dayF);
});

await app.ready();
window.__EVAL_READY__ = true;
