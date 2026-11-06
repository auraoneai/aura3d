import { camera, createAuraApp, geometry, instances, interactions, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type RGB = readonly [number, number, number];

// ---------- helpers ----------
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: RGB): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// ---------- island terrain (flat shaded: every triangle owns its vertices) ----------
const HALF = 24;
const CELLS = 40;
const STEP = (HALF * 2) / CELLS;

const noise = (x: number, z: number): number =>
  Math.sin(x * 0.9 + 1.3) * Math.cos(z * 0.8) * 0.5 + Math.sin(x * 1.7 + z * 1.3) * 0.3 + Math.sin(z * 2.3 - x * 0.7) * 0.2;

const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const R = 12 + 1.8 * Math.sin(3 * th + 1) + 1.1 * Math.sin(5 * th + 2);
  const f = 1 - r / R;
  if (f > 0) return 7 * Math.pow(f, 1.05) + noise(x, z) * 0.9 * Math.min(1, f * 3) + 0.25 * f;
  return Math.max(f * 11, -5);
};

const SAND: RGB = [0.82, 0.72, 0.46];
const GRASS: RGB = [0.27, 0.55, 0.2];
const GRASS2: RGB = [0.2, 0.46, 0.17];
const ROCK: RGB = [0.5, 0.45, 0.4];
const SNOW: RGB = [0.92, 0.94, 0.97];
const SEABED: RGB = [0.35, 0.4, 0.38];

const faceColor = (h: number, jitter: number): RGB => {
  let c: RGB;
  if (h < -0.2) c = SEABED;
  else if (h < 0.75) c = SAND;
  else if (h < 2.6) c = mix3(GRASS, GRASS2, jitter);
  else if (h < 4.3) c = mix3(GRASS2, ROCK, smooth(2.6, 3.6, h));
  else if (h < 5.4) c = ROCK;
  else c = SNOW;
  const k = 0.92 + jitter * 0.16;
  return [c[0] * k, c[1] * k, c[2] * k];
};

const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const idx: number[] = [];
const addTri = (a: RGB, b: RGB, c: RGB): void => {
  let p1 = b;
  let p2 = c;
  const ux = p1[0] - a[0], uy = p1[1] - a[1], uz = p1[2] - a[2];
  const vx = p2[0] - a[0], vy = p2[1] - a[1], vz = p2[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (ny < 0) {
    [p1, p2] = [p2, p1];
    nx = -nx; ny = -ny; nz = -nz;
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  const hAvg = (a[1] + b[1] + c[1]) / 3;
  const color = faceColor(hAvg, rand());
  const base = pos.length / 3;
  for (const p of [a, p1, p2]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(nx / len, ny / len, nz / len);
    col.push(color[0], color[1], color[2], 1);
  }
  idx.push(base, base + 1, base + 2);
};
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const x0 = -HALF + i * STEP, x1 = x0 + STEP, z0 = -HALF + j * STEP, z1 = z0 + STEP;
    const p00: RGB = [x0, height(x0, z0), z0];
    const p10: RGB = [x1, height(x1, z0), z0];
    const p01: RGB = [x0, height(x0, z1), z1];
    const p11: RGB = [x1, height(x1, z1), z1];
    if ((i + j) % 2 === 0) {
      addTri(p00, p01, p10);
      addTri(p10, p01, p11);
    } else {
      addTri(p00, p01, p11);
      addTri(p00, p11, p10);
    }
  }
}

const terrain = geometry.custom(
  geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: idx,
    bounds: { min: [-HALF, -6, -HALF], max: [HALF, 9, HALF] }
  }),
  { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 1 }) }
);

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crowns: AuraTransformSpec[] = [];
const crownColors: string[] = [];
const placed: Array<[number, number]> = [];
for (let tries = 0; tries < 600 && placed.length < 34; tries += 1) {
  const x = (rand() - 0.5) * 28, z = (rand() - 0.5) * 28;
  const h = height(x, z);
  if (h < 0.9 || h > 4.2) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.2)) continue;
  placed.push([x, z]);
  const s = 0.8 + rand() * 0.6;
  const yaw = rand() * 6;
  trunks.push({ position: [x, h + 0.35 * s, z], scale: [0.32 * s, 1.1 * s, 0.32 * s] });
  crowns.push({ position: [x, h + 1.7 * s, z], rotation: [0, yaw, 0], scale: [1.9 * s, 2.0 * s, 1.9 * s] });
  crownColors.push(hex(mix3([0.12, 0.38, 0.16], [0.28, 0.5, 0.18], rand())));
  crowns.push({ position: [x, h + 2.7 * s, z], rotation: [0, yaw + 0.5, 0], scale: [1.35 * s, 1.7 * s, 1.35 * s] });
  crownColors.push(hex(mix3([0.14, 0.42, 0.18], [0.32, 0.55, 0.2], rand())));
}
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let tries = 0; tries < 400 && rocks.length < 16; tries += 1) {
  const x = (rand() - 0.5) * 34, z = (rand() - 0.5) * 34;
  const h = height(x, z);
  if (h < -0.1 || h > 3.2) continue;
  const s = 0.4 + rand() * 0.7;
  rocks.push({ position: [x, h + s * 0.15, z], rotation: [rand(), rand() * 6, rand()], scale: [s * 1.4, s, s * 1.1] });
  const g = 0.42 + rand() * 0.18;
  rockColors.push(hex([g, g * 0.96, g * 0.9]));
}

// ---------- water ----------
const WN = 200, WSIZE = 240;
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

const waterMat = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
float waveAt(vec2 p, vec2 k, float amp, float spd, float t, inout vec2 s) {
  float ph = dot(p, k) + t * spd;
  s += k * amp * cos(ph);
  return amp * sin(ph);
}
void main() {
  vec2 s = vec2(0.0);
  float h = 0.0;
  h += waveAt(position.xz, vec2(0.21, 0.13) * 2.2, 0.20, 1.1, waveClock, s);
  h += waveAt(position.xz, vec2(-0.17, 0.25) * 2.2, 0.14, 1.5, waveClock, s);
  h += waveAt(position.xz, vec2(0.4, 0.31) * 1.6, 0.06, 2.1, waveClock, s);
  vec3 p = vec3(position.x, h, position.z);
  vPos = p;
  vNormal = normalize(vec3(-s.x, 1.0, -s.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 facet = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (facet.y < 0.0) facet = -facet;
  vec3 n = normalize(mix(vNormal, facet, 0.75));
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  vec3 deep = vec3(0.03, 0.22, 0.36);
  vec3 shallow = vec3(0.12, 0.55, 0.62);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 2.0 + 0.45, 0.0, 1.0));
  float diff = max(dot(n, normalize(sunDir)), 0.0);
  vec3 lit = body * (vec3(ambientAmt) * 0.9 + sunColor * diff * 0.75);
  vec3 refl = reflect(-normalize(sunDir), n);
  float glint = pow(max(dot(refl, v), 0.0), 90.0) * step(0.0, sunDir.y);
  vec3 col = mix(lit, skyColor, clamp(fresnel * 0.7 + 0.05, 0.0, 1.0));
  col += sunColor * glint * 1.2;
  float fade = smoothstep(70.0, 125.0, dist);
  col = mix(col, skyColor, fade);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    sunDir: { type: "vec3", value: [0.5, 0.8, 0.3] },
    sunColor: { type: "vec3", value: [1, 0.95, 0.85] },
    skyColor: { type: "vec3", value: [0.62, 0.78, 0.92] },
    ambientAmt: { type: "f32", value: 1 }
  }
});

// ---------- day / night ----------
const DAY_SECONDS = 20;
const START_HOUR = 9;
const sunAngles = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 65,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirFrom = (elevationDeg: number, azimuthDeg: number): RGB => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scale3 = (d: RGB, k: number): RGB => [d[0] * k, d[1] * k, d[2] * k];

const s0 = sunAngles(START_HOUR);
const sunStart = scale3(dirFrom(s0.elevationDeg, s0.azimuthDeg), 40);
const moonStart = scale3(dirFrom(-s0.elevationDeg, s0.azimuthDeg + 180), 40);

const app = createAuraApp("#app", {
  scene: scene({ background: "#9fc4e8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "ambient", skyColor: "#cfe3ff", groundColor: "#4d5a3c", intensity: 0.9 }).runtime({ id: "ambient", mutable: true }))
    .add(lights.directional({ name: "sun", position: sunStart, target: [0, 0, 0], intensity: 3.5, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: moonStart, target: [0, 0, 0], intensity: 0.2, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(terrain)
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2c", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns", transforms: crowns, colors: crownColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }), params: { widthSegments: 5, heightSegments: 3 } }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WSIZE / 2, -1.5, -WSIZE / 2], max: [WSIZE / 2, 1.5, WSIZE / 2] } }),
      { name: "water", material: waterMat, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(interactions.orbit({ target: [0, 1.5, 0], position: [22, 14, 25], autoRotate: 0.1 }))
    .camera(camera.orbit({ position: [22, 14, 25], target: [0, 1.5, 0], fov: 45, near: 0.5, far: 500 }))
});

const DAY_SKY: RGB = rgb("#a9cbe8");
const DUSK_SKY: RGB = rgb("#f0a070");
const NIGHT_SKY: RGB = rgb("#0c1634");
const SUN_NOON: RGB = rgb("#fff1d6");
const SUN_LOW: RGB = rgb("#ff8a40");
const MOON_COL: RGB = rgb("#8fb0ff");

let clock = 0;
let waveTime = 0;
app.onFrame((frame) => {
  const dt = Math.min(frame.dt, 0.1);
  clock += dt;
  waveTime += dt;
  const hour = (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
  const s = sunAngles(hour);
  const e = s.elevationDeg;
  const day = smooth(-8, 18, e);
  const twilight = clamp01(1 - Math.abs(e) / 20);
  const sunUp = smooth(0, 14, e);

  const sunDirV = dirFrom(e, s.azimuthDeg);
  const moonDirV = dirFrom(-e, s.azimuthDeg + 180);
  const sunCol = mix3(SUN_NOON, SUN_LOW, twilight);

  const sun = app.nodes.require("sun");
  const moon = app.nodes.require("moon");
  const ambient = app.nodes.require("ambient");
  sun.setPosition(...scale3(sunDirV, 40));
  moon.setPosition(...scale3(moonDirV, 40));
  sun.setVisible(e > 1);
  moon.setVisible(e < 4);
  sun.setLight?.({ intensity: 3.6 * sunUp, color: hex(sunCol) });
  moon.setLight?.({ intensity: 0.2 + 0.9 * (1 - day), color: hex(MOON_COL) });
  ambient.setLight?.({ intensity: 0.5 + 0.5 * day });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const horizon = mix3(mix3(NIGHT_SKY, DAY_SKY, day), DUSK_SKY, twilight * 0.6);
  const water = app.nodes.require("water");
  const lightDir = e > 0 ? sunDirV : moonDirV;
  const lightCol = e > 0 ? sunCol : scale3(MOON_COL, 0.5);
  water.setUniform?.("waveClock", waveTime);
  water.setUniform?.("sunDir", lightDir);
  water.setUniform?.("sunColor", lightCol);
  water.setUniform?.("skyColor", horizon);
  water.setUniform?.("ambientAmt", 0.3 + 0.7 * day);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
