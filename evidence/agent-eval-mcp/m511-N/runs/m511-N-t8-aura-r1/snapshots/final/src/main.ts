import { camera, createAuraApp, geometry, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------- seeded random ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- island height field ----------
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const R = 15 + 1.8 * Math.sin(3 * a + 1) + 1.2 * Math.sin(5 * a + 2);
  const q = r / R;
  const h = (1 - q * q) * 7.2 - 1.2 + 0.6 * Math.sin(x * 0.5) * Math.cos(z * 0.45) + 0.4 * Math.sin(x * 1.1 + z * 0.7);
  return Math.max(-2.5, h);
};

// ---------- flat-shaded terrain ----------
const G = 56, S = 46;
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
  const j = 0.86 + rand() * 0.28;
  let rgb: number[];
  if (y < -0.2) rgb = [0.55, 0.5, 0.36];
  else if (y < 0.7) rgb = [0.85, 0.74, 0.46];
  else if (y > 4.3 || slope > 0.32) rgb = [0.52, 0.48, 0.45];
  else if (y > 3.0) rgb = [0.34, 0.5, 0.2];
  else rgb = [0.2, 0.46, 0.17];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0]! * j, rgb[1]! * j, rgb[2]! * j, 1);
  }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    if ((i + j) % 2 === 0) {
      face(P(i, j), P(i, j + 1), P(i + 1, j));
      face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
    } else {
      face(P(i, j), P(i, j + 1), P(i + 1, j + 1));
      face(P(i, j), P(i + 1, j + 1), P(i + 1, j));
    }
  }
}
const island = geometry.custom(
  geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -3, -S / 2], max: [S / 2, 8, S / 2] }
  }),
  { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
);

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [], lower: AuraTransformSpec[] = [], upper: AuraTransformSpec[] = [];
const lowerColors: string[] = [], upperColors: string[] = [];
const rocks: AuraTransformSpec[] = [], rockColors: string[] = [];
for (let tries = 0; tries < 400 && trunks.length < 34; tries += 1) {
  const x = (rand() - 0.5) * 32, z = (rand() - 0.5) * 32, h = heightAt(x, z);
  if (h < 0.9 || h > 4.0) continue;
  const s = 0.85 + rand() * 0.7;
  trunks.push({ position: [x, h + 0.7 * s, z], scale: [0.4 * s, 1.5 * s, 0.4 * s] });
  lower.push({ position: [x, h + 2.3 * s, z], rotation: [0, rand() * 6, 0], scale: [2.8 * s, 3.2 * s, 2.8 * s] });
  upper.push({ position: [x, h + 3.9 * s, z], rotation: [0, rand() * 6, 0], scale: [2.0 * s, 2.7 * s, 2.0 * s] });
  const hue = 120 + Math.floor(rand() * 30);
  lowerColors.push(`hsl(${hue}, 50%, ${24 + Math.floor(rand() * 8)}%)`);
  upperColors.push(`hsl(${hue}, 52%, ${30 + Math.floor(rand() * 8)}%)`);
}
for (let tries = 0; tries < 400 && rocks.length < 16; tries += 1) {
  const x = (rand() - 0.5) * 38, z = (rand() - 0.5) * 38, h = heightAt(x, z);
  if (h < -0.4 || h > 5.0) continue;
  const s = 0.5 + rand() * 1.0;
  rocks.push({ position: [x, h + 0.2 * s, z], rotation: [rand() * 0.6, rand() * 6, rand() * 0.6], scale: [s * 1.3, s * 0.9, s] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 22)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });

// ---------- water ----------
const N = 200, WS = 400;
const wPos = new Float32Array((N + 1) ** 2 * 3), wNor = new Float32Array(wPos.length), wIdx: number[] = [];
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
  vec2 k1 = vec2(0.30, 0.18), k2 = vec2(-0.22, 0.34), k3 = vec2(0.55, -0.40);
  float p1 = dot(p, k1) + clk * 1.4, p2 = dot(p, k2) + clk * 1.1, p3 = dot(p, k3) + clk * 1.9;
  float h = 0.22 * sin(p1) + 0.16 * sin(p2) + 0.07 * sin(p3);
  vec2 g = 0.22 * cos(p1) * k1 + 0.16 * cos(p2) * k2 + 0.07 * cos(p3) * k3;
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.3 + clk * 0.8) - 0.5, 0.0, vnoise(vPos.xz * 1.3 - clk * 0.8) - 0.5) * 0.35);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  vec3 horizon = mix(vec3(0.025, 0.04, 0.09), vec3(0.62, 0.78, 0.92), day);
  horizon = mix(horizon, vec3(0.9, 0.42, 0.22), dusk * 0.7);
  vec3 zenith = mix(vec3(0.01, 0.02, 0.06), vec3(0.12, 0.32, 0.7), day);
  vec3 skyCol = mix(horizon, zenith, clamp(reflect(-v, n).y * 1.5, 0.0, 1.0));
  vec3 deep = mix(vec3(0.03, 0.08, 0.14), vec3(0.03, 0.30, 0.42), day);
  vec3 shallow = mix(vec3(0.05, 0.12, 0.2), vec3(0.1, 0.5, 0.55), day);
  vec3 body = mix(deep, shallow, clamp(n.x * 0.8 + 0.5 + vnoise(vPos.xz * 0.15) * 0.4, 0.0, 1.0));
  vec3 col = mix(body, skyCol, clamp(fres * 0.9 + 0.12, 0.0, 1.0));
  vec3 L = normalize(vec3(ldx, ldy, ldz));
  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 90.0);
  col += mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.7), day) * glint * glintI;
  float sparkle = step(0.93, vnoise(vPos.xz * 3.0 + clk * 0.5)) * 0.06 * (0.3 + day);
  col += sparkle;
  float d = length(cameraPosition - vPos);
  col = mix(col, horizon, smoothstep(90.0, 230.0, d));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    clk: { type: "f32", value: 0 },
    ldx: { type: "f32", value: 0.3 },
    ldy: { type: "f32", value: 0.8 },
    ldz: { type: "f32", value: 0.3 },
    day: { type: "f32", value: 1 },
    dusk: { type: "f32", value: 0 },
    glintI: { type: "f32", value: 1 }
  }
});

// ---------- sun ----------
const DAY = 20;
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 40): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const HOUR0 = 9;
const s0 = sunAt(HOUR0);

const sc = scene({ background: "#7aa7d8" })
  .camera(camera.orbit({ position: [0, 25, 36], target: [0, 1, 0], fov: 45, near: 1, far: 500, autoRotate: 0.1 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#bcd4f0", groundColor: "#4a5a3a", intensity: 1.1 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.5, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(lights.directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
  .add(island)
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6a4a2c", roughness: 0.95 }), params: { radialSegments: 5 } }))
  .add(instances.cone({ name: "lowerCrowns", transforms: lower, colors: lowerColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "upperCrowns", transforms: upper, colors: upperColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
  .add(
    geometry
      .custom(geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WS / 2, -1, -WS / 2], max: [WS / 2, 1, WS / 2] } }), {
        name: "water",
        material: water,
        castShadow: false
      })
      .runtime({ id: "water", mutable: true })
  );

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const hour = (HOUR0 + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const sinE = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  const day = smooth(-0.12, 0.25, sinE);
  const dusk = Math.exp(-sinE * sinE * 14);

  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  const sun = app.nodes.require("sun");
  sun.setPosition(...sunPos);
  sun.setLight?.({ intensity: 3.6 * Math.min(1, Math.max(0, sinE * 3)) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...dirOf(-s.elevationDeg, s.azimuthDeg + 180));
  moon.setLight?.({ intensity: 0.1 + 0.7 * (1 - day) });
  app.nodes.require("hemi").setLight?.({ intensity: 0.42 + 0.85 * day });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const up = sinE >= 0 ? 1 : -1;
  const len = Math.hypot(...sunPos) || 1;
  const w = app.nodes.require("water");
  w.setUniform?.("clk", t);
  w.setUniform?.("ldx", (sunPos[0] * up) / len);
  w.setUniform?.("ldy", Math.max(0.12, (sunPos[1] * up) / len));
  w.setUniform?.("ldz", (sunPos[2] * up) / len);
  w.setUniform?.("day", day);
  w.setUniform?.("dusk", dusk);
  w.setUniform?.("glintI", sinE >= 0 ? 1.5 * smooth(0, 0.15, sinE) : 0.5 * (1 - day));
});
await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
