import { camera, createAuraApp, geometry, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

type V3 = [number, number, number];

// ---------- helpers ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (r: number, g: number, b: number): string => {
  const h = (v: number): string => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
};
const mixc = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- island terrain ----------
const G = 56, S = 56;
const hash2 = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const H = (x: number, z: number): number => {
  const th = Math.atan2(z, x), r = Math.hypot(x, z);
  const R = 19 * (1 + 0.12 * Math.sin(3 * th + 1) + 0.07 * Math.sin(5 * th + 2));
  const q = r / R;
  const base = 7 * (1 - q * q) - 1.2;
  const bump = Math.sin(x * 0.45) * Math.cos(z * 0.38) * 0.9 * clamp01(1.3 - q) + (hash2(Math.round(x * 2), Math.round(z * 2)) - 0.5) * 0.9;
  return Math.max(-2, base + bump);
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
  const j = 0.85 + rand() * 0.3;
  let rgb: V3;
  if (y < 0.55) rgb = [0.82, 0.72, 0.46];
  else if (y < 3.6) rgb = mixc([0.2, 0.5, 0.17], [0.34, 0.55, 0.2], clamp01((y - 0.55) / 3));
  else if (y < 4.9) rgb = [0.48, 0.44, 0.4];
  else rgb = [0.9, 0.9, 0.92];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0] * j, rgb[1] * j, rgb[2] * j, 1);
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
const islandGeo = geometry.define({
  positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
  indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
  bounds: { min: [-S / 2, -2.5, -S / 2], max: [S / 2, 9, S / 2] }
});

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [], crowns: AuraTransformSpec[] = [], crowns2: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const crownColors: string[] = [], crown2Colors: string[] = [], rockColors: string[] = [];
for (let tries = 0, placed = 0; tries < 600 && placed < 26; tries += 1) {
  const x = (rand() - 0.5) * 36, z = (rand() - 0.5) * 36, y = H(x, z);
  if (y < 0.9 || y > 4.2) continue;
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, y + 0.7 * s, z], scale: [0.3 * s, 1.4 * s, 0.3 * s] });
  crowns.push({ position: [x, y + 2.3 * s, z], scale: [2.2 * s, 2.8 * s, 2.2 * s] });
  crowns2.push({ position: [x, y + 3.5 * s, z], scale: [1.6 * s, 2.2 * s, 1.6 * s] });
  crownColors.push(`hsl(${115 + Math.floor(rand() * 30)}, 50%, ${24 + Math.floor(rand() * 10)}%)`);
  crown2Colors.push(`hsl(${120 + Math.floor(rand() * 30)}, 55%, ${30 + Math.floor(rand() * 10)}%)`);
  placed += 1;
}
for (let tries = 0, placed = 0; tries < 800 && placed < 18; tries += 1) {
  const x = (rand() - 0.5) * 42, z = (rand() - 0.5) * 42, y = H(x, z);
  if (y < -0.4 || y > 5.5) continue;
  const s = 0.5 + rand() * 1.1;
  rocks.push({ position: [x, y + 0.2 * s, z], rotation: [rand() * 0.6, rand() * 6, rand() * 0.6], scale: [s * 1.2, s * 0.8, s] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 22)}%)`);
  placed += 1;
}
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });

// ---------- water ----------
const N = 240, WS = 480;
const wpos = new Float32Array((N + 1) ** 2 * 3), wnor = new Float32Array(wpos.length), widx: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    wpos.set([(i / N - 0.5) * WS, 0, (j / N - 0.5) * WS], v * 3);
    wnor[v * 3 + 1] = 1;
    if (i < N && j < N) widx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}
const waveFns = `
float waveH(vec2 p, float t) {
  return sin(dot(p, vec2(0.63, 0.39)) + t * 1.1) * 0.22
       + sin(dot(p, vec2(-0.51, 0.75)) + t * 1.4) * 0.16
       + sin(dot(p, vec2(0.9, -0.4)) + t * 1.9) * 0.08;
}
vec2 waveD(vec2 p, float t) {
  vec2 a = vec2(0.63, 0.39) * cos(dot(p, vec2(0.63, 0.39)) + t * 1.1) * 0.22;
  vec2 b = vec2(-0.51, 0.75) * cos(dot(p, vec2(-0.51, 0.75)) + t * 1.4) * 0.16;
  vec2 c = vec2(0.9, -0.4) * cos(dot(p, vec2(0.9, -0.4)) + t * 1.9) * 0.08;
  return a + b + c;
}`;
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos;
${waveFns}
void main() {
  vec2 p = position.xz;
  vPos = vec3(p.x, waveH(p, clk), p.y);
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; out vec4 outColor;
${waveFns}
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec2 d = waveD(vPos.xz, clk);
  vec3 na = normalize(vec3(-d.x, 1.0, -d.y));
  vec3 nf = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (nf.y < 0.0) nf = -nf;
  vec3 n = normalize(mix(na, nf, 0.55));
  vec3 sunDir = normalize(vec3(sunX, sunY, sunZ));
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  vec3 r = reflect(-v, n);
  vec3 skyDay = mix(vec3(0.62, 0.78, 0.92), vec3(0.18, 0.4, 0.78), clamp(r.y * 1.5, 0.0, 1.0));
  vec3 skyNight = mix(vec3(0.05, 0.07, 0.14), vec3(0.01, 0.02, 0.06), clamp(r.y * 1.5, 0.0, 1.0));
  vec3 dusk = vec3(1.0, 0.5, 0.25) * (1.0 - day) * smoothstep(-0.2, 0.1, sunY / 40.0) * 0.5;
  vec3 skyC = mix(skyNight, skyDay, day) + dusk * (1.0 - clamp(r.y * 2.0, 0.0, 1.0));
  vec3 deepC = mix(vec3(0.01, 0.04, 0.09), vec3(0.03, 0.30, 0.45), day);
  vec3 shallowC = mix(vec3(0.02, 0.09, 0.14), vec3(0.15, 0.62, 0.62), day);
  float rad = length(vPos.xz);
  float shore = 1.0 - smoothstep(14.0, 30.0, rad);
  vec3 body = mix(deepC, shallowC, shore * 0.8);
  // foam ring around the island
  float ring = smoothstep(0.55, 1.0, sin(rad * 1.3 - clk * 1.5 + sin(vPos.x * 0.3 + vPos.z * 0.2) * 2.0)) * (1.0 - smoothstep(19.0, 26.0, rad)) * smoothstep(14.0, 18.0, rad);
  vec3 col = mix(body, skyC, clamp(fres * 0.85 + 0.06, 0.0, 1.0));
  col += vec3(1.0) * ring * 0.25 * (0.25 + day);
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 120.0);
  col += vec3(1.0, 0.9, 0.7) * glint * 2.0 * smoothstep(0.0, 0.25, sunY / 40.0);
  float dist = length(cameraPosition - vPos);
  col = mix(col, skyC * 0.9, smoothstep(160.0, 330.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    clk: { type: "f32", value: 0 },
    day: { type: "f32", value: 1 },
    sunX: { type: "f32", value: 0 },
    sunY: { type: "f32", value: 30 },
    sunZ: { type: "f32", value: 0 }
  }
});
const waterGeo = geometry.define({
  positions: wpos, normals: wnor, indices: widx,
  bounds: { min: [-WS / 2, -1, -WS / 2], max: [WS / 2, 1, WS / 2] }
});

// ---------- sun ----------
const DAY = 20, START_HOUR = 9;
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 60): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(START_HOUR);

const sc = scene({ background: "#7aa7d8" })
  .camera(camera.orbit({ position: [0, 38, 62], target: [0, 1, 0], fov: 50, near: 1, far: 700, autoRotate: 0.1 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 600 } }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#bcd4f0", groundColor: "#4a5a3a", intensity: 1.1 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.5, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(lights.directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.2, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
  .add(geometry.custom(islandGeo, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 5 } }))
  .add(instances.cone({ name: "crowns", transforms: crowns, colors: crownColors, material: white, params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "crowns2", transforms: crowns2, colors: crown2Colors, material: white, params: { radialSegments: 6 } }))
  .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
  .add(geometry.custom(waterGeo, { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let clk = 0, t = 0;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  clk += dt;
  t += dt;
  const hour = (START_HOUR + (t / DAY) * 24) % 24;
  const s = sunAt(hour);
  const sinE = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  const day = smooth(-0.12, 0.3, sinE);
  const sunP = dirOf(s.elevationDeg, s.azimuthDeg);
  const moonP = dirOf(-s.elevationDeg, s.azimuthDeg + 180);

  const sun = app.nodes.require("sun");
  sun.setPosition(sunP[0], Math.max(sunP[1], 3), sunP[2]);
  const warm = mixc([1, 0.55, 0.3], [1, 0.95, 0.85], smooth(0.05, 0.5, sinE));
  sun.setLight?.({ intensity: 3.6 * smooth(-0.02, 0.25, sinE), color: hex(warm[0], warm[1], warm[2]) });

  const moon = app.nodes.require("moon");
  moon.setPosition(moonP[0], Math.max(moonP[1], 3), moonP[2]);
  moon.setLight?.({ intensity: 0.3 + 0.7 * (1 - day) });

  app.nodes.require("hemi").setLight?.({ intensity: 0.35 + 0.85 * day });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const w = app.nodes.require("water");
  w.setUniform?.("clk", clk);
  w.setUniform?.("day", day);
  w.setUniform?.("sunX", sunP[0]);
  w.setUniform?.("sunY", sunP[1]);
  w.setUniform?.("sunZ", sunP[2]);
});
await app.ready();
window.__EVAL_READY__ = true;
