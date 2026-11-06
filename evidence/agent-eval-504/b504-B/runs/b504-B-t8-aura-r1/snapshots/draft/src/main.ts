import { camera, createAuraApp, geometry, interactions, lights, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
let seed = 20240607;
const rand = (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hex = (c: V3): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------------------
// Flat-shaded mesh builder: every triangle owns its vertices and a face normal.
// ---------------------------------------------------------------------------
const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const idx: number[] = [];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Adds a triangle. `center` (a point inside a convex shape) fixes the winding to face outward; without it the face points up. */
function tri(a: V3, b: V3, c: V3, color: V3, center?: V3): void {
  let n = cross(sub(b, a), sub(c, a));
  let flip: boolean;
  if (center) {
    const mid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const o = sub(mid, center);
    flip = n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0;
  } else {
    flip = n[1] < 0;
  }
  if (flip) {
    const t = b;
    b = c;
    c = t;
    n = [-n[0], -n[1], -n[2]];
  }
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  for (const p of [a, b, c]) {
    idx.push(pos.length / 3);
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0] / len, n[1] / len, n[2] / len);
    col.push(color[0], color[1], color[2], 1);
  }
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
const R = 17; // half extent
const CELLS = 36;

const height = (x: number, z: number): number => {
  const theta = Math.atan2(z, x);
  const warp = 1 + 0.13 * Math.sin(3 * theta + 1.1) + 0.08 * Math.sin(5 * theta + 2.3) + 0.05 * Math.sin(2 * theta);
  const rr = (Math.hypot(x, z) / R) * warp;
  const land = clamp01(1 - rr / 0.8);
  let h = 6.2 * Math.pow(land, 1.15) - 1.2;
  if (rr > 0.8) h -= (rr - 0.8) * 9;
  h += 1.7 * Math.exp(-((x - 2.2) ** 2 + (z + 1.4) ** 2) / 9);
  h += 0.35 * Math.sin(x * 0.9 + 0.5) * Math.sin(z * 0.8 - 0.3) * clamp01(land * 3);
  return h;
};

const gx: number[] = [];
const gz: number[] = [];
const step = (2 * R) / CELLS;
for (let j = 0; j <= CELLS; j += 1) {
  for (let i = 0; i <= CELLS; i += 1) {
    gx.push(-R + i * step + (rand() - 0.5) * step * 0.6);
    gz.push(-R + j * step + (rand() - 0.5) * step * 0.6);
  }
}
const gv = (i: number, j: number): V3 => {
  const k = j * (CELLS + 1) + i;
  return [gx[k], height(gx[k], gz[k]), gz[k]];
};

const SAND: V3 = [0.83, 0.74, 0.46];
const GRASS: V3 = [0.3, 0.58, 0.22];
const GRASS_DARK: V3 = [0.2, 0.46, 0.2];
const ROCK: V3 = [0.5, 0.45, 0.4];
const PEAK: V3 = [0.68, 0.66, 0.62];

function terrainColor(a: V3, b: V3, c: V3): V3 {
  const h = (a[1] + b[1] + c[1]) / 3;
  const n = cross(sub(b, a), sub(c, a));
  const ny = Math.abs(n[1]) / (Math.hypot(n[0], n[1], n[2]) || 1);
  let base: V3;
  if (h < 0.55) base = SAND;
  else if (h < 2.7) base = mix3(GRASS, GRASS_DARK, smoothstep(1.0, 2.7, h));
  else if (h < 4.4) base = mix3(GRASS_DARK, ROCK, smoothstep(2.7, 4.2, h));
  else base = PEAK;
  if (ny < 0.72 && h > 0.9) base = mix3(base, ROCK, 0.7);
  const v = 0.9 + rand() * 0.2;
  return [base[0] * v, base[1] * v, base[2] * v];
}

for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const p00 = gv(i, j);
    const p10 = gv(i + 1, j);
    const p01 = gv(i, j + 1);
    const p11 = gv(i + 1, j + 1);
    if ((i + j) % 2 === 0) {
      tri(p00, p01, p10, terrainColor(p00, p01, p10));
      tri(p10, p01, p11, terrainColor(p10, p01, p11));
    } else {
      tri(p00, p01, p11, terrainColor(p00, p01, p11));
      tri(p00, p11, p10, terrainColor(p00, p11, p10));
    }
  }
}

// ---------------------------------------------------------------------------
// Props: pines and rocks (same mesh, own vertex colours)
// ---------------------------------------------------------------------------
function cone(cx: number, y0: number, cz: number, radius: number, h: number, sides: number, color: V3, twist: number): void {
  const apex: V3 = [cx, y0 + h, cz];
  const center: V3 = [cx, y0 + h * 0.3, cz];
  const ring: V3[] = [];
  for (let s = 0; s < sides; s += 1) {
    const a = twist + (s / sides) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * radius, y0, cz + Math.sin(a) * radius]);
  }
  const base: V3 = [cx, y0, cz];
  for (let s = 0; s < sides; s += 1) {
    const r0 = ring[s];
    const r1 = ring[(s + 1) % sides];
    const shade = 0.88 + 0.24 * ((s % 3) / 2);
    tri(r0, r1, apex, [color[0] * shade, color[1] * shade, color[2] * shade], center);
    tri(r0, r1, base, [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6], center);
  }
}

function prism(cx: number, y0: number, cz: number, radius: number, h: number, sides: number, color: V3): void {
  const center: V3 = [cx, y0 + h / 2, cz];
  const lo: V3[] = [];
  const hi: V3[] = [];
  for (let s = 0; s < sides; s += 1) {
    const a = (s / sides) * Math.PI * 2;
    lo.push([cx + Math.cos(a) * radius, y0, cz + Math.sin(a) * radius]);
    hi.push([cx + Math.cos(a) * radius, y0 + h, cz + Math.sin(a) * radius]);
  }
  for (let s = 0; s < sides; s += 1) {
    const t = (s + 1) % sides;
    tri(lo[s], lo[t], hi[t], color, center);
    tri(lo[s], hi[t], hi[s], color, center);
    tri(hi[s], hi[t], [cx, y0 + h, cz], color, center);
  }
}

const TRUNK: V3 = [0.4, 0.26, 0.15];
const PINES: V3[] = [[0.12, 0.42, 0.2], [0.16, 0.5, 0.22], [0.1, 0.36, 0.22]];

function pine(x: number, z: number, scale: number): void {
  const y = height(x, z) - 0.2;
  prism(x, y, z, 0.2 * scale, 1.1 * scale, 6, TRUNK);
  const color = PINES[Math.floor(rand() * PINES.length)];
  const twist = rand() * 3;
  cone(x, y + 0.7 * scale, z, 1.35 * scale, 1.5 * scale, 7, color, twist);
  cone(x, y + 1.5 * scale, z, 1.05 * scale, 1.4 * scale, 7, color, twist + 0.4);
  cone(x, y + 2.3 * scale, z, 0.72 * scale, 1.35 * scale, 7, color, twist + 0.8);
}

function rock(x: number, z: number, size: number): void {
  const t = (1 + Math.sqrt(5)) / 2;
  const base: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ];
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  const y = height(x, z) + size * 0.25;
  const pts = base.map((p): V3 => {
    const len = Math.hypot(p[0], p[1], p[2]);
    const k = (size * (0.75 + rand() * 0.5)) / len;
    return [x + p[0] * k * 1.1, y + p[1] * k * 0.75, z + p[2] * k];
  });
  const c: V3 = [x, y, z];
  const tint = 0.85 + rand() * 0.25;
  for (const f of faces) {
    const shade = tint * (0.92 + rand() * 0.16);
    tri(pts[f[0]], pts[f[1]], pts[f[2]], [0.5 * shade, 0.48 * shade, 0.46 * shade], c);
  }
}

const placed: Array<[number, number]> = [];
const free = (x: number, z: number, d: number): boolean => placed.every(([px, pz]) => Math.hypot(px - x, pz - z) > d);
for (let tries = 0, trees = 0; tries < 600 && trees < 16; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = rand() * 13;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 0.9 || h > 3.9 || !free(x, z, 2.4)) continue;
  placed.push([x, z]);
  pine(x, z, 0.8 + rand() * 0.55);
  trees += 1;
}
for (let tries = 0, rocks = 0; tries < 600 && rocks < 9; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 4 + rand() * 11;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < -0.4 || h > 3.0 || !free(x, z, 1.8)) continue;
  placed.push([x, z]);
  rock(x, z, 0.5 + rand() * 0.7);
  rocks += 1;
}

const islandGeometry = geometry.define({
  positions: new Float32Array(pos),
  normals: new Float32Array(nor),
  colors: new Float32Array(col),
  indices: idx,
  bounds: { min: [-R - 2, -5, -R - 2], max: [R + 2, 9, R + 2] }
});

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------
const WN = 240;
const WSIZE = 360;
const wpos = new Float32Array((WN + 1) ** 2 * 3);
const wnor = new Float32Array(wpos.length);
const widx: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    wpos.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
    wnor[v * 3 + 1] = 1;
    if (i < WN && j < WN) widx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
float waveH(vec2 p, float t) {
  float a = sin(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.30;
  float b = sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.20;
  float c = sin(dot(p, vec2(0.40, 0.31)) * 3.0 + t * 2.1) * 0.09;
  return a + b + c;
}
void main() {
  vec3 p = vec3(position.x, waveH(position.xz, waveClock), position.z);
  vPos = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.001);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float r = length(vPos.xz);
  float shore = 1.0 - smoothstep(11.0, 30.0, r);
  vec3 deep = vec3(0.012, 0.10, 0.24);
  vec3 shallow = vec3(0.06, 0.52, 0.56);
  vec3 body = mix(deep, shallow, clamp(shore * 0.85 + vPos.y * 0.25 + 0.1, 0.0, 1.0));
  float amb = 0.12 + 0.88 * dayLight;
  vec3 L = normalize(sunDir);
  body *= amb * 0.75 + sunColor * (0.55 * max(dot(n, L), 0.0));
  vec3 c = mix(body, skyTint, clamp(fres * 0.8 + 0.04, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 50.0);
  c += sunColor * glint * 1.6;
  float crest = smoothstep(0.36, 0.55, vPos.y);
  c = mix(c, vec3(0.85, 0.92, 0.95) * (0.15 + 0.85 * dayLight), crest * 0.45);
  c = mix(c, horizonColor, smoothstep(70.0, 175.0, dist));
  outColor = vec4(c, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    dayLight: { type: "f32", value: 1 },
    sunDir: { type: "vec3", value: [0.4, 0.7, 0.3] },
    sunColor: { type: "vec3", value: [1, 0.9, 0.7] },
    skyTint: { type: "vec3", value: [0.3, 0.5, 0.8] },
    horizonColor: { type: "vec3", value: [0.5, 0.65, 0.8] }
  }
});

// ---------------------------------------------------------------------------
// Day / night
// ---------------------------------------------------------------------------
const CYCLE_SECONDS = 20;
const START_PHASE = 0.4;

const sunAt = (phase: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin((phase - 0.25) * Math.PI * 2) * 55 + 14,
  azimuthDeg: 90 + (phase - 0.25) * 360
});
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 40): V3 => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};

const s0 = sunAt(START_PHASE);
const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#4a5a38", intensity: 1.1 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: lightAt(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 4, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: lightAt(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(islandGeometry, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }) }))
    .add(geometry.custom(
      geometry.define({ positions: wpos, normals: wnor, indices: widx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(interactions.orbit({ target: [0, 1.2, 0], position: [0, 9.5, 29], autoRotate: 0.1 }))
    .camera(camera.orbit({ position: [0, 9.5, 29], target: [0, 1.2, 0], fov: 50, near: 0.5, far: 700 }))
});

const SKY_DAY: V3 = [0.2, 0.42, 0.78];
const SKY_NIGHT: V3 = [0.01, 0.02, 0.07];
const HORIZON_DAY: V3 = [0.5, 0.64, 0.8];
const HORIZON_DUSK: V3 = [0.85, 0.36, 0.16];
const HORIZON_NIGHT: V3 = [0.01, 0.015, 0.05];
const SUN_LOW: V3 = [1, 0.55, 0.3];
const SUN_HIGH: V3 = [1, 0.94, 0.82];
const HEMI_DAY: V3 = [0.72, 0.82, 0.94];
const HEMI_NIGHT: V3 = [0.25, 0.33, 0.6];

let clock = 0;
function update(dt: number): void {
  clock += dt;
  const phase = (START_PHASE + clock / CYCLE_SECONDS) % 1;
  const s = sunAt(phase);
  const elev = s.elevationDeg;
  const sunUp = smoothstep(-2, 14, elev);
  const day = smoothstep(-8, 22, elev);
  const dusk = Math.exp(-(((elev - 2) / 14) ** 2));
  const moonElev = -elev;
  const moonUp = smoothstep(-2, 14, moonElev) * (1 - day);

  const sun = app.nodes.require("sun");
  sun.setPosition(...lightAt(elev, s.azimuthDeg));
  sun.setVisible(elev > 0.5);
  sun.setLight?.({ intensity: 4 * sunUp, color: hex(mix3(SUN_LOW, SUN_HIGH, smoothstep(0, 30, elev))) });

  const moon = app.nodes.require("moon");
  moon.setPosition(...lightAt(moonElev, s.azimuthDeg + 180));
  moon.setVisible(moonElev > 0.5);
  moon.setLight?.({ intensity: 0.9 * moonUp + 0.05 });

  app.nodes.require("hemi").setLight?.({ intensity: lerp(0.75, 1.1, day), color: hex(mix3(HEMI_NIGHT, HEMI_DAY, day)) });
  app.atmosphere?.setSky({ sun: { elevationDeg: elev, azimuthDeg: s.azimuthDeg, intensity: 1 } });

  // Water shader inputs: dominant light is the sun by day and the moon by night.
  const sunVec = lightAt(elev, s.azimuthDeg, 1);
  const moonVec = lightAt(moonElev, s.azimuthDeg + 180, 1);
  const useSun = elev >= 0;
  const dir = useSun ? sunVec : moonVec;
  const sunTint = mix3(SUN_LOW, SUN_HIGH, smoothstep(0, 30, elev));
  const lightColor: V3 = useSun
    ? [sunTint[0] * sunUp, sunTint[1] * sunUp, sunTint[2] * sunUp]
    : [0.35 * moonUp, 0.45 * moonUp, 0.7 * moonUp];
  const skyTint = mix3(SKY_NIGHT, SKY_DAY, day);
  let horizon = mix3(HORIZON_NIGHT, HORIZON_DAY, day);
  horizon = mix3(horizon, HORIZON_DUSK, dusk * 0.55);

  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", clock);
  w.setUniform?.("dayLight", day);
  w.setUniform?.("sunDir", dir);
  w.setUniform?.("sunColor", lightColor);
  w.setUniform?.("skyTint", mix3(skyTint, HORIZON_DUSK, dusk * 0.2));
  w.setUniform?.("horizonColor", horizon);
}

app.onFrame((frame) => update(frame.dt));
await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
