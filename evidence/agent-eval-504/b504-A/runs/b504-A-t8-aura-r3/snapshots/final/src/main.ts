import { camera, createAuraApp, geometry, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

type V3 = [number, number, number];

// ---------- deterministic random ----------
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash2 = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- terrain ----------
const G = 38, S = 60;
const H = (x: number, z: number): number => {
  const ang = Math.atan2(z, x);
  const R = 19 + 3 * Math.sin(ang * 3 + 1) + 1.8 * Math.cos(ang * 5);
  const rr = Math.hypot(x, z) / R;
  const peak = 2.6 * Math.exp(-((x - 3) * (x - 3) + (z + 2) * (z + 2)) / 40);
  const bumps = rr < 1 ? Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.5 : 0;
  return Math.max(-2, 6 * (1 - rr * rr) - 0.6 + peak + bumps);
};
const P = (i: number, j: number): V3 => {
  const edge = i === 0 || j === 0 || i === G || j === G;
  const jx = edge ? 0 : (hash2(i, j) - 0.5) * 0.9;
  const jz = edge ? 0 : (hash2(j + 17, i + 5) - 0.5) * 0.9;
  const x = (i / G - 0.5) * S + jx, z = (j / G - 0.5) * S + jz;
  return [x, H(x, z), z];
};

const pos: number[] = [], nor: number[] = [], col: number[] = [];
let faceId = 0;
const face = (a: V3, b: V3, c: V3): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1, k = n[1]! < 0 ? -1 : 1;
  n = n.map((q) => (q * k) / l);
  const y = (a[1] + b[1] + c[1]) / 3;
  faceId += 1;
  const v = 0.88 + 0.24 * hash2(faceId, 3);
  const rgb = y < 0.45 ? [0.82, 0.72, 0.46] : y < 3.6 ? [0.2, 0.5, 0.17] : y < 5.2 ? [0.5, 0.44, 0.4] : [0.9, 0.92, 0.95];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0]!, n[1]!, n[2]!);
    col.push(rgb[0]! * v, rgb[1]! * v, rgb[2]! * v, 1);
  }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    face(P(i, j), P(i, j + 1), P(i + 1, j));
    face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
  }
}

// ---------- scene ----------
const DAY = 20;
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 60): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const START_HOUR = 9;
const s0 = sunAt(START_HOUR);

let sc = scene({ background: "#8fb6dc" })
  .camera(camera.orbit({ position: [0, 30, 58], target: [0, 1.5, 0], fov: 45, near: 1, far: 700, autoRotate: 0.1 }))
  .add(sky.preetham({ sun: { ...s0, intensity: 1 } }))
  .add(lights.hemisphere({ name: "hemi", skyColor: "#cfe0f2", groundColor: "#4d5a40", intensity: 1 }).runtime({ id: "hemi", mutable: true }))
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }))
  .add(geometry.custom(geometry.define({
    positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2, -2.5, -S / 2], max: [S / 2, 9, S / 2] }
  }), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));

// trees and rocks
const trunks: AuraTransformSpec[] = [], lower: AuraTransformSpec[] = [], upper: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const lowerColors: string[] = [], upperColors: string[] = [], rockColors: string[] = [];
for (let n = 0, tries = 0; n < 45 && tries < 3000; tries += 1) {
  const a = rand() * Math.PI * 2, r = 22 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = H(x, z);
  if (h < 0.9 || h > 4.4) continue;
  n += 1;
  const s = 0.8 + rand() * 0.7, hue = 100 + Math.floor(rand() * 40);
  trunks.push({ position: [x, h + 0.8 * s, z], scale: [0.4 * s, 1.6 * s, 0.4 * s] });
  lower.push({ position: [x, h + 1.6 * s + 1.2 * s, z], rotation: [0, rand() * 6, 0], scale: [3 * s, 3.2 * s, 3 * s] });
  upper.push({ position: [x, h + 1.6 * s + 3 * s, z], rotation: [0, rand() * 6, 0], scale: [2.2 * s, 2.8 * s, 2.2 * s] });
  lowerColors.push(`hsl(${hue}, 50%, ${24 + Math.floor(rand() * 10)}%)`);
  upperColors.push(`hsl(${hue}, 55%, ${30 + Math.floor(rand() * 10)}%)`);
}
for (let n = 0, tries = 0; n < 28 && tries < 3000; tries += 1) {
  const a = rand() * Math.PI * 2, r = 24 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = H(x, z);
  if (h < 0.1 || h > 5.2) continue;
  n += 1;
  const s = 0.5 + rand() * 1.1;
  rocks.push({ position: [x, h + 0.15 * s, z], rotation: [rand(), rand() * 6, rand()], scale: [s * 1.2, s * 0.8, s] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 25)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
sc = sc
  .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.9 }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopyLow", transforms: lower, colors: lowerColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.cone({ name: "canopyUp", transforms: upper, colors: upperColors, material: white, params: { radialSegments: 7 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));

// water
const N = 150, SIZE = 340;
const wPos = new Float32Array((N + 1) ** 2 * 3), wNor = new Float32Array(wPos.length), wIdx: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    wPos.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < N && j < N) wIdx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}
const f32 = (value: number) => ({ type: "f32" as const, value });
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
float waveH(vec2 p) {
  return sin(dot(p, vec2(0.21, 0.13)) * 2.2 + clk * 1.4) * 0.28
       + sin(dot(p, vec2(-0.17, 0.25)) * 2.6 + clk * 1.9) * 0.18
       + sin(dot(p, vec2(0.4, 0.05)) * 3.0 - clk * 2.3) * 0.08;
}
void main() {
  vec2 p = position.xz;
  float h = waveH(p);
  float e = 0.3;
  float hx = waveH(p + vec2(e, 0.0)) - h;
  float hz = waveH(p + vec2(0.0, e)) - h;
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-hx / e, 1.0, -hz / e));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 hor = vec3(hr, hg, hb);
  vec3 zen = vec3(zr, zg, zb);
  vec3 L = normalize(vec3(sunX, sunY, sunZ));
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 1.5 + clk * 0.6) - 0.5, 0.0, vnoise(vPos.xz * 1.5 - clk * 0.6) - 0.5) * 0.35);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  vec3 refl = mix(hor, zen, clamp(reflect(-v, n).y * 1.5, 0.0, 1.0));
  float lk = 0.2 + 0.8 * day;
  vec3 body = mix(vec3(0.03, 0.22, 0.34), vec3(0.06, 0.42, 0.5), ndv * ndv) * lk;
  vec3 col = mix(body, refl, clamp(fres * 0.9 + 0.12, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 120.0);
  col += mix(vec3(1.0, 0.93, 0.78), vec3(0.6, 0.7, 1.0), 1.0 - day) * glint * glintK;
  float crest = smoothstep(0.38, 0.5, vPos.y + vnoise(vPos.xz * 2.0 + clk) * 0.1);
  col += vec3(0.5) * crest * lk * 0.35;
  float d = length(vPos - cameraPosition);
  col = mix(col, hor, smoothstep(90.0, 230.0, d));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    clk: f32(0), day: f32(1), sunX: f32(0), sunY: f32(1), sunZ: f32(0), glintK: f32(1),
    hr: f32(0.6), hg: f32(0.78), hb: f32(0.92), zr: f32(0.15), zg: f32(0.4), zb: f32(0.8)
  }
});
sc = sc.add(geometry.custom(geometry.define({
  positions: wPos, normals: wNor, indices: wIdx,
  bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] }
}), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (k: number): number => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };

app.onFrame((f) => {
  t += f.dt;
  const hour = (START_HOUR + (t / DAY) * 24) % 24, s = sunAt(hour);
  const e = s.elevationDeg;
  const day = smooth((e + 6) / 30);
  const dusk = Math.exp(-((e / 12) * (e / 12)));

  // light: sun by day, dim bluish moon (opposite side) at night
  const moon = e < 0;
  const le = moon ? -e : e, la = moon ? s.azimuthDeg + 180 : s.azimuthDeg;
  const lp = dirOf(Math.max(le, 12), la);
  const sun = app.nodes.require("sun");
  sun.setPosition(lp[0], lp[1], lp[2]);
  if (moon) {
    sun.setLight?.({ intensity: 0.5 * (1 - day) + 0.3, color: "#8fa6ff" });
  } else {
    sun.setLight?.({ intensity: 0.5 + 2.7 * smooth(e / 35), color: dusk > 0.35 ? "#ffb070" : "#fff4e0" });
  }
  app.nodes.require("hemi").setLight?.({ intensity: 0.35 + 0.75 * day });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  // sky colours for the water reflection
  const hor: V3 = [mix(0.03, 0.62, day), mix(0.05, 0.78, day), mix(0.12, 0.92, day)];
  const k = dusk * 0.7;
  hor[0] = mix(hor[0], 1.0, k); hor[1] = mix(hor[1], 0.5, k); hor[2] = mix(hor[2], 0.3, k);
  const zen: V3 = [mix(0.01, 0.12, day), mix(0.02, 0.36, day), mix(0.07, 0.8, day)];
  const w = app.nodes.require("water");
  w.setUniform?.("clk", t);
  w.setUniform?.("day", day);
  w.setUniform?.("sunX", lp[0]);
  w.setUniform?.("sunY", lp[1]);
  w.setUniform?.("sunZ", lp[2]);
  w.setUniform?.("glintK", moon ? 0.5 : 1.5);
  w.setUniform?.("hr", hor[0]);
  w.setUniform?.("hg", hor[1]);
  w.setUniform?.("hb", hor[2]);
  w.setUniform?.("zr", zen[0]);
  w.setUniform?.("zg", zen[1]);
  w.setUniform?.("zb", zen[2]);
});

await app.ready();
window.__EVAL_READY__ = true;
