import { camera, createAuraApp, geometry, lights, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = (c: V3): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");

let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash2 = (i: number, j: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------------------------------------------------------------------------
// Island height field (analytic) and flat-shaded mesh builder
// ---------------------------------------------------------------------------
const islandRadius = (ang: number): number => 20 + 3 * Math.sin(3 * ang + 1) + 2 * Math.sin(5 * ang + 2);

const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const t = r / islandRadius(Math.atan2(z, x));
  const dome = 6.5 * (1 - t * t) - 0.6;
  const hill = 2.6 * Math.exp(-((x + 3) * (x + 3) + (z - 2) * (z - 2)) / 40);
  const mask = 1 - smoothstep(0.55, 0.95, t);
  const bumps = (Math.sin(x * 0.55 + 1.1) * Math.cos(z * 0.47) + 0.6 * Math.sin(x * 0.9 + z * 0.8)) * 0.55 * mask;
  return dome + hill + bumps;
};

const positions: number[] = [];
const normals: number[] = [];
const colors: number[] = [];
const indices: number[] = [];

/** Append one flat-shaded triangle. The face normal is flipped to point away from `ref`. */
const tri = (a: V3, b: V3, c: V3, color: V3, ref: V3): void => {
  let p1 = b;
  let p2 = c;
  let ux = p1[0] - a[0], uy = p1[1] - a[1], uz = p1[2] - a[2];
  let vx = p2[0] - a[0], vy = p2[1] - a[1], vz = p2[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
  if (nx * (cx - ref[0]) + ny * (cy - ref[1]) + nz * (cz - ref[2]) < 0) {
    p1 = c;
    p2 = b;
    ux = p1[0] - a[0]; uy = p1[1] - a[1]; uz = p1[2] - a[2];
    vx = p2[0] - a[0]; vy = p2[1] - a[1]; vz = p2[2] - a[2];
    nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  const base = positions.length / 3;
  for (const p of [a, p1, p2]) {
    positions.push(p[0], p[1], p[2]);
    normals.push(nx / len, ny / len, nz / len);
    colors.push(color[0], color[1], color[2], 1);
  }
  indices.push(base, base + 1, base + 2);
};

const shadeColor = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k];

// --- terrain ---------------------------------------------------------------
const CELLS = 30;
const SPAN = 60;
const step = SPAN / CELLS;
const grid: V3[] = [];
for (let j = 0; j <= CELLS; j += 1) {
  for (let i = 0; i <= CELLS; i += 1) {
    const edge = i === 0 || j === 0 || i === CELLS || j === CELLS;
    const x = (i - CELLS / 2) * step + (edge ? 0 : (hash2(i, j) - 0.5) * step * 0.7);
    const z = (j - CELLS / 2) * step + (edge ? 0 : (hash2(j + 17, i + 5) - 0.5) * step * 0.7);
    grid.push([x, height(x, z), z]);
  }
}
const SAND: V3 = [0.9, 0.8, 0.52];
const WET_SAND: V3 = [0.55, 0.62, 0.55];
const GRASS: V3 = [0.3, 0.58, 0.22];
const GRASS_DARK: V3 = [0.2, 0.46, 0.18];
const ROCK: V3 = [0.52, 0.49, 0.46];
const SNOW: V3 = [0.94, 0.96, 0.98];

const terrainTri = (a: V3, b: V3, c: V3, tag: number): void => {
  const h = (a[1] + b[1] + c[1]) / 3;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const up = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
  let col: V3;
  if (h < -0.2) col = WET_SAND;
  else if (h < 0.75) col = SAND;
  else if (up < 0.72 && h > 1.5) col = ROCK;
  else if (h < 5.0) col = mix3(GRASS, GRASS_DARK, smoothstep(1.0, 4.5, h));
  else if (h < 6.6) col = ROCK;
  else col = SNOW;
  const jitter = 0.9 + 0.2 * hash2(tag, tag * 3 + 1);
  tri(a, b, c, shadeColor(col, jitter), [(a[0] + b[0] + c[0]) / 3, h - 50, (a[2] + b[2] + c[2]) / 3]);
};
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const p00 = grid[j * (CELLS + 1) + i] as V3;
    const p10 = grid[j * (CELLS + 1) + i + 1] as V3;
    const p01 = grid[(j + 1) * (CELLS + 1) + i] as V3;
    const p11 = grid[(j + 1) * (CELLS + 1) + i + 1] as V3;
    const tag = j * CELLS + i;
    if ((i + j) % 2 === 0) {
      terrainTri(p00, p01, p10, tag * 2);
      terrainTri(p10, p01, p11, tag * 2 + 1);
    } else {
      terrainTri(p00, p01, p11, tag * 2);
      terrainTri(p00, p11, p10, tag * 2 + 1);
    }
  }
}

// --- trees -----------------------------------------------------------------
const addCone = (cx: number, cy: number, cz: number, radius: number, h: number, sides: number, color: V3, rot: number): void => {
  const apex: V3 = [cx, cy + h, cz];
  const ring: V3[] = [];
  for (let k = 0; k < sides; k += 1) {
    const a = rot + (k / sides) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius]);
  }
  const axisTop: V3 = [cx, cy + h * 0.3, cz];
  const axisBase: V3 = [cx, cy + 50, cz];
  for (let k = 0; k < sides; k += 1) {
    const p = ring[k] as V3;
    const q = ring[(k + 1) % sides] as V3;
    tri(apex, p, q, shadeColor(color, 0.85 + 0.3 * hash2(k, Math.round(cx * 10))), axisTop);
    tri([cx, cy, cz], p, q, shadeColor(color, 0.6), axisBase);
  }
};

const addPrism = (cx: number, cy: number, cz: number, radius: number, h: number, sides: number, color: V3): void => {
  const lo: V3[] = [];
  const hi: V3[] = [];
  for (let k = 0; k < sides; k += 1) {
    const a = (k / sides) * Math.PI * 2;
    lo.push([cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius]);
    hi.push([cx + Math.cos(a) * radius * 0.8, cy + h, cz + Math.sin(a) * radius * 0.8]);
  }
  const axis: V3 = [cx, cy + h / 2, cz];
  for (let k = 0; k < sides; k += 1) {
    const n = (k + 1) % sides;
    const shade = 0.85 + 0.3 * hash2(k, 7);
    tri(lo[k] as V3, lo[n] as V3, hi[k] as V3, shadeColor(color, shade), axis);
    tri(lo[n] as V3, hi[n] as V3, hi[k] as V3, shadeColor(color, shade), axis);
  }
};

const treeSpots: V3[] = [];
for (let attempt = 0; attempt < 600 && treeSpots.length < 24; attempt += 1) {
  const x = (rand() - 0.5) * 40;
  const z = (rand() - 0.5) * 40;
  const h = height(x, z);
  if (h < 1.0 || h > 5.2) continue;
  if (treeSpots.some((t) => Math.hypot(t[0] - x, t[2] - z) < 3.6)) continue;
  treeSpots.push([x, h, z]);
}
for (const [x, h, z] of treeSpots) {
  const s = 0.8 + rand() * 0.7;
  const rot = rand() * 3;
  const green = mix3([0.13, 0.42, 0.22], [0.2, 0.55, 0.25], rand());
  addPrism(x, h - 0.2, z, 0.28 * s, 1.5 * s, 5, [0.42, 0.28, 0.16]);
  addCone(x, h + 1.0 * s, z, 1.55 * s, 2.3 * s, 6, green, rot);
  addCone(x, h + 2.2 * s, z, 1.15 * s, 2.0 * s, 6, mix3(green, [0.3, 0.65, 0.3], 0.25), rot + 0.5);
}

// --- rocks (jittered icosahedra) --------------------------------------------
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO: V3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]
];
const ICO_FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
];
const addRock = (cx: number, cy: number, cz: number, size: number, color: V3): void => {
  const verts: V3[] = ICO.map((v, k) => {
    const len = Math.hypot(v[0], v[1], v[2]);
    const j = 0.75 + 0.5 * hash2(k, Math.round(cx * 7 + cz * 3));
    return [cx + (v[0] / len) * size * j * 1.2, cy + (v[1] / len) * size * j * 0.8, cz + (v[2] / len) * size * j * 1.2] as V3;
  });
  ICO_FACES.forEach((f, k) => {
    tri(verts[f[0]] as V3, verts[f[1]] as V3, verts[f[2]] as V3, shadeColor(color, 0.85 + 0.3 * hash2(k, 3)), [cx, cy, cz]);
  });
};
let rocks = 0;
for (let attempt = 0; attempt < 400 && rocks < 12; attempt += 1) {
  const a = rand() * Math.PI * 2;
  const r = islandRadius(a) * (0.68 + rand() * 0.3);
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < -0.4 || h > 3.0) continue;
  const size = 0.6 + rand() * 1.1;
  addRock(x, h + size * 0.15, z, size, mix3([0.5, 0.48, 0.46], [0.38, 0.38, 0.42], rand()));
  rocks += 1;
}

// bounds
const bmin: V3 = [Infinity, Infinity, Infinity];
const bmax: V3 = [-Infinity, -Infinity, -Infinity];
for (let k = 0; k < positions.length; k += 3) {
  for (let d = 0; d < 3; d += 1) {
    const v = positions[k + d] as number;
    if (v < (bmin[d] as number)) bmin[d] = v;
    if (v > (bmax[d] as number)) bmax[d] = v;
  }
}
const islandGeometry = geometry.define({
  positions: new Float32Array(positions),
  normals: new Float32Array(normals),
  colors: new Float32Array(colors),
  indices,
  bounds: { min: bmin, max: bmax }
});

// ---------------------------------------------------------------------------
// Water: custom shader, faceted (flat normals from screen derivatives), animated
// ---------------------------------------------------------------------------
const WATER_N = 128;
const waterPos = new Float32Array((WATER_N + 1) ** 2 * 3);
const waterNor = new Float32Array(waterPos.length);
const waterIdx: number[] = [];
const FAR = 380;
for (let j = 0; j <= WATER_N; j += 1) {
  for (let i = 0; i <= WATER_N; i += 1) {
    const v = j * (WATER_N + 1) + i;
    // uniform ~1.4 m cells near the island, widening exponentially towards the horizon
    const map = (u: number): number => {
      const a = Math.abs(u);
      const x = a < 0.5 ? a * 2 * 45 : 45 * Math.pow(FAR / 45, (a - 0.5) * 2);
      return Math.sign(u) * x;
    };
    waterPos.set([map((i / WATER_N) * 2 - 1), 0, map((j / WATER_N) * 2 - 1)], v * 3);
    waterNor[v * 3 + 1] = 1;
    if (i < WATER_N && j < WATER_N) {
      if ((i + j) % 2 === 0) waterIdx.push(v, v + WATER_N + 1, v + 1, v + 1, v + WATER_N + 1, v + WATER_N + 2);
      else waterIdx.push(v, v + WATER_N + 1, v + WATER_N + 2, v, v + WATER_N + 2, v + 1);
    }
  }
}

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vec2 p = position.xz;
  float t = waveClock;
  float h = sin(dot(p, vec2(0.21, 0.13)) * 2.2 + t * 1.3) * 0.22
          + sin(dot(p, vec2(-0.17, 0.25)) * 2.2 + t * 1.7) * 0.16
          + sin(dot(p, vec2(0.4, 0.31)) * 2.0 + t * 2.3) * 0.08;
  vec3 q = vec3(p.x, h, p.y);
  vPos = q;
  gl_Position = modelViewProjectionMatrix * vec4(q, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  vec3 horizon = vec3(hr, hg, hb);
  vec3 keyCol = vec3(keyR, keyG, keyB);
  vec3 L = normalize(vec3(keyX, keyY, keyZ));

  float r = length(vPos.xz);
  float ang = atan(vPos.z, vPos.x);
  float shoreR = (20.0 + 3.0 * sin(3.0 * ang + 1.0) + 2.0 * sin(5.0 * ang + 2.0)) * 0.95;
  float d = r - shoreR;                     // distance from the shoreline (metres)

  vec3 deep = vec3(0.03, 0.26, 0.46) * lum;
  vec3 shallow = vec3(0.14, 0.70, 0.68) * lum;
  vec3 body = mix(deep, shallow, (1.0 - smoothstep(0.0, 11.0, d)) * 0.85);
  body += keyCol * max(dot(n, L), 0.0) * keyK * 0.16;

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  vec3 col = mix(body, horizon, clamp(fres * 0.8 + 0.06, 0.0, 1.0));

  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 70.0);
  col += keyCol * glint * keyK * 1.1;

  float ring = 0.55 + 0.45 * sin(d * 1.6 - waveClock * 2.0);
  float foam = (1.0 - smoothstep(0.2, 2.4, abs(d))) * ring;
  col = mix(col, vec3(0.95, 0.98, 1.0) * (0.35 + 0.65 * lum), clamp(foam, 0.0, 1.0) * 0.85);

  float dist = length(vPos - cameraPosition);
  col = mix(col, horizon, smoothstep(140.0, 380.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    keyX: { type: "f32", value: 0 },
    keyY: { type: "f32", value: 1 },
    keyZ: { type: "f32", value: 0 },
    keyK: { type: "f32", value: 1 },
    keyR: { type: "f32", value: 1 },
    keyG: { type: "f32", value: 1 },
    keyB: { type: "f32", value: 1 },
    lum: { type: "f32", value: 1 },
    hr: { type: "f32", value: 0.6 },
    hg: { type: "f32", value: 0.78 },
    hb: { type: "f32", value: 0.92 }
  },
  fog: false
});

// ---------------------------------------------------------------------------
// Day / night state
// ---------------------------------------------------------------------------
const CYCLE_SECONDS = 20;
const PHASE_START = 0.2; // late morning

interface SkyState {
  elevationDeg: number;
  azimuthDeg: number;
  sinE: number;
  sun: V3; // direction scaled to distance
  moon: V3;
  sunIntensity: number;
  sunColor: string;
  moonIntensity: number;
  hemiColor: string;
  hemiIntensity: number;
  horizon: V3;
  lum: number;
}

const lightAt = (elevationDeg: number, azimuthDeg: number, distance: number): V3 => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};

const stateAt = (phase: number): SkyState => {
  const elevationDeg = 66 * Math.sin(phase * Math.PI * 2);
  const azimuthDeg = 90 + phase * 360;
  const sinE = Math.sin((elevationDeg * Math.PI) / 180);
  const day = smoothstep(-0.12, 0.35, sinE);
  const dusk = Math.exp(-Math.pow(sinE / 0.25, 2));
  const sunWarm = smoothstep(0.0, 0.5, sinE);
  const hemiDay: V3 = [0.81, 0.89, 1.0];
  const hemiNight: V3 = [0.27, 0.38, 0.65];
  const hemi = mix3(mix3(hemiNight, hemiDay, day), [1.0, 0.7, 0.55], dusk * 0.35);
  const horizonDay: V3 = [0.62, 0.79, 0.93];
  const horizonNight: V3 = [0.05, 0.08, 0.17];
  const horizon = mix3(mix3(horizonNight, horizonDay, day), [0.95, 0.52, 0.35], dusk * 0.6);
  return {
    elevationDeg,
    azimuthDeg,
    sinE,
    sun: lightAt(elevationDeg, azimuthDeg, 60),
    moon: lightAt(-elevationDeg, azimuthDeg + 180, 60),
    sunIntensity: 4.2 * smoothstep(-0.02, 0.2, sinE),
    sunColor: hex(mix3([1.0, 0.5, 0.25], [1.0, 0.95, 0.84], sunWarm)),
    moonIntensity: 1.1 * smoothstep(0.05, -0.2, sinE),
    hemiColor: hex(hemi),
    hemiIntensity: 0.6 + 0.55 * day,
    horizon,
    lum: 0.3 + 0.7 * day
  };
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const s0 = stateAt(PHASE_START);
const ORBIT_RADIUS = 46;
const ORBIT_HEIGHT = 15;
const TARGET: V3 = [0, 2, 0];
const orbitPos = (angle: number): V3 => [Math.sin(angle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.cos(angle) * ORBIT_RADIUS];

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { elevationDeg: s0.elevationDeg, azimuthDeg: s0.azimuthDeg, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "hemi", skyColor: s0.hemiColor, groundColor: "#4d5a3c", intensity: s0.hemiIntensity }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: s0.sun, target: [0, 0, 0], intensity: s0.sunIntensity, color: s0.sunColor, shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: s0.moon, target: [0, 0, 0], intensity: s0.moonIntensity, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(islandGeometry, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }), castShadow: true, receiveShadow: true }))
    .add(geometry.custom(
      geometry.define({ positions: waterPos, normals: waterNor, indices: waterIdx, bounds: { min: [-FAR, -1, -FAR], max: [FAR, 1, FAR] } }),
      { name: "water", material: waterMaterial, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .camera(camera.perspective({ position: orbitPos(0.6), target: TARGET, fov: 45, near: 0.5, far: 900 }))
});

const t0 = performance.now();
app.onFrame(() => {
  const time = (performance.now() - t0) / 1000;
  const phase = (PHASE_START + time / CYCLE_SECONDS) % 1;
  const s = stateAt(phase);

  app.nodes.require("sun").setPosition(...s.sun);
  app.nodes.require("sun").setLight?.({ intensity: s.sunIntensity, color: s.sunColor });
  app.nodes.require("moon").setPosition(...s.moon);
  app.nodes.require("moon").setLight?.({ intensity: s.moonIntensity });
  app.nodes.require("hemi").setLight?.({ intensity: s.hemiIntensity, color: s.hemiColor });
  app.atmosphere?.setSky({ sun: { elevationDeg: s.elevationDeg, azimuthDeg: s.azimuthDeg, intensity: 1 } });

  const sunUp = s.sinE > 0;
  const key = sunUp ? s.sun : s.moon;
  const keyLen = Math.hypot(key[0], key[1], key[2]) || 1;
  const keyK = sunUp ? smoothstep(0, 0.15, s.sinE) : 0.6 * smoothstep(0, -0.15, s.sinE);
  const keyColor: V3 = sunUp ? mix3([1.0, 0.5, 0.25], [1.0, 0.95, 0.84], smoothstep(0, 0.5, s.sinE)) : [0.56, 0.69, 1.0];
  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", time);
  water.setUniform?.("keyX", key[0] / keyLen);
  water.setUniform?.("keyY", key[1] / keyLen);
  water.setUniform?.("keyZ", key[2] / keyLen);
  water.setUniform?.("keyK", keyK);
  water.setUniform?.("keyR", keyColor[0]);
  water.setUniform?.("keyG", keyColor[1]);
  water.setUniform?.("keyB", keyColor[2]);
  water.setUniform?.("lum", s.lum);
  water.setUniform?.("hr", s.horizon[0]);
  water.setUniform?.("hg", s.horizon[1]);
  water.setUniform?.("hb", s.horizon[2]);

  // slow orbit: one revolution per minute
  const p = orbitPos(0.6 + (time / 60) * Math.PI * 2);
  app.camera?.setPose({ position: p, target: TARGET });
});

app
  .ready()
  .then(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  })
  .catch((err: unknown) => {
    console.error(err);
  });
