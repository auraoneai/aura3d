import { camera, createAuraApp, effects, geometry, lights, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

// ---------------------------------------------------------------- helpers
let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
  [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
const hex = (c: readonly number[]): string =>
  "#" + c.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")).join("");

type V3 = [number, number, number];
type C3 = [number, number, number];

// ------------------------------------------------- flat-shaded mesh builder
const P: number[] = [];
const N: number[] = [];
const C: number[] = [];
const I: number[] = [];

const addTri = (a: V3, b: V3, c: V3, col: C3, center?: V3): void => {
  let q = b, r = c;
  const cross = (u: V3, v: V3, w: V3): V3 => {
    const e1: V3 = [v[0] - u[0], v[1] - u[1], v[2] - u[2]];
    const e2: V3 = [w[0] - u[0], w[1] - u[1], w[2] - u[2]];
    return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  };
  let n = cross(a, q, r);
  const flip = center
    ? n[0] * ((a[0] + b[0] + c[0]) / 3 - center[0]) + n[1] * ((a[1] + b[1] + c[1]) / 3 - center[1]) + n[2] * ((a[2] + b[2] + c[2]) / 3 - center[2]) < 0
    : n[1] < 0;
  if (flip) { q = c; r = b; n = cross(a, q, r); }
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  const base = P.length / 3;
  for (const p of [a, q, r]) {
    P.push(p[0], p[1], p[2]);
    N.push(n[0] / len, n[1] / len, n[2] / len);
    C.push(col[0], col[1], col[2], 1);
  }
  I.push(base, base + 1, base + 2);
};

const jitter = (c: C3, amt: number): C3 => {
  const k = 1 + (rand() - 0.5) * amt;
  return [c[0] * k, c[1] * k, c[2] * k];
};

// ------------------------------------------------------------- terrain
const CELLS = 46;
const SIZE = 32;
const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const R = 9 + 1.3 * Math.sin(3 * a + 1) + 0.8 * Math.sin(5 * a + 2);
  const d = r / R;
  const base = (1 - d * d) * 4.0;
  const noise = 0.4 * Math.sin(x * 0.9) * Math.cos(z * 0.8) + 0.3 * Math.sin(x * 0.45 + z * 0.65);
  const peak = 3.6 * Math.exp(-((x + 2) * (x + 2) + (z - 1) * (z - 1)) / 10);
  return Math.max(-2, base + noise * clamp(1.4 - d * 0.6) + peak);
};
const SAND: C3 = [0.86, 0.76, 0.5];
const GRASS: C3 = [0.25, 0.55, 0.2];
const GRASS_HI: C3 = [0.38, 0.62, 0.24];
const ROCK: C3 = [0.45, 0.42, 0.4];
const SEABED: C3 = [0.5, 0.45, 0.32];
const faceColor = (h: number): C3 => {
  if (h < -0.2) return jitter(SEABED, 0.1);
  if (h < 0.55) return jitter(SAND, 0.12);
  if (h < 3.3) return jitter(mix3(GRASS, GRASS_HI, smoothstep(0.8, 3.3, h)), 0.22);
  return jitter(ROCK, 0.25);
};

const grid: V3[][] = [];
for (let j = 0; j <= CELLS; j += 1) {
  const row: V3[] = [];
  for (let i = 0; i <= CELLS; i += 1) {
    const edge = i === 0 || j === 0 || i === CELLS || j === CELLS;
    const x = (i / CELLS - 0.5) * SIZE + (edge ? 0 : (rand() - 0.5) * 0.5);
    const z = (j / CELLS - 0.5) * SIZE + (edge ? 0 : (rand() - 0.5) * 0.5);
    row.push([x, height(x, z), z]);
  }
  grid.push(row);
}
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const p00 = grid[j]![i]!, p10 = grid[j]![i + 1]!, p01 = grid[j + 1]![i]!, p11 = grid[j + 1]![i + 1]!;
    if ((i + j) % 2 === 0) {
      addTri(p00, p01, p10, faceColor((p00[1] + p01[1] + p10[1]) / 3));
      addTri(p10, p01, p11, faceColor((p10[1] + p01[1] + p11[1]) / 3));
    } else {
      addTri(p00, p01, p11, faceColor((p00[1] + p01[1] + p11[1]) / 3));
      addTri(p00, p11, p10, faceColor((p00[1] + p11[1] + p10[1]) / 3));
    }
  }
}

// ---------------------------------------------------------- trees, rocks
const addCone = (cx: number, y0: number, cz: number, radius: number, h: number, sides: number, col: C3): void => {
  const center: V3 = [cx, y0 + h * 0.25, cz];
  const apex: V3 = [cx, y0 + h, cz];
  const ring: V3[] = [];
  const phase = rand() * Math.PI;
  for (let k = 0; k < sides; k += 1) {
    const a = phase + (k / sides) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * radius, y0, cz + Math.sin(a) * radius]);
  }
  for (let k = 0; k < sides; k += 1) {
    const a = ring[k]!, b = ring[(k + 1) % sides]!;
    addTri(apex, a, b, jitter(col, 0.18), center);
    addTri([cx, y0, cz], a, b, jitter(col, 0.1), center);
  }
};
const addTrunk = (cx: number, y0: number, cz: number, r0: number, r1: number, h: number, sides: number, col: C3): void => {
  const center: V3 = [cx, y0 + h / 2, cz];
  for (let k = 0; k < sides; k += 1) {
    const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
    const b0: V3 = [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0];
    const b1: V3 = [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0];
    const t0: V3 = [cx + Math.cos(a0) * r1, y0 + h, cz + Math.sin(a0) * r1];
    const t1: V3 = [cx + Math.cos(a1) * r1, y0 + h, cz + Math.sin(a1) * r1];
    addTri(b0, b1, t0, jitter(col, 0.15), center);
    addTri(b1, t1, t0, jitter(col, 0.15), center);
  }
};
const addRock = (cx: number, cy: number, cz: number, size: number, col: C3): void => {
  const center: V3 = [cx, cy, cz];
  const sx = size * (0.9 + rand() * 0.5), sy = size * (0.55 + rand() * 0.3), sz = size * (0.9 + rand() * 0.5);
  const top: V3 = [cx + (rand() - 0.5) * size * 0.3, cy + sy, cz + (rand() - 0.5) * size * 0.3];
  const bot: V3 = [cx, cy - sy * 0.6, cz];
  const sides = 6;
  const ring: V3[] = [];
  for (let k = 0; k < sides; k += 1) {
    const a = (k / sides) * Math.PI * 2 + rand() * 0.4;
    const rr = 0.8 + rand() * 0.35;
    ring.push([cx + Math.cos(a) * sx * rr, cy + (rand() - 0.5) * sy * 0.4, cz + Math.sin(a) * sz * rr]);
  }
  for (let k = 0; k < sides; k += 1) {
    const a = ring[k]!, b = ring[(k + 1) % sides]!;
    addTri(top, a, b, jitter(col, 0.3), center);
    addTri(bot, a, b, jitter(col, 0.3), center);
  }
};

const placed: Array<[number, number]> = [];
for (let tries = 0, trees = 0; tries < 600 && trees < 26; tries += 1) {
  const a = rand() * Math.PI * 2, r = 1 + rand() * 9;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 0.9 || h > 3.6) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.7)) continue;
  placed.push([x, z]);
  trees += 1;
  const s = 0.8 + rand() * 0.7;
  addTrunk(x, h - 0.25, z, 0.17 * s, 0.12 * s, 1.2 * s + 0.25, 5, [0.4, 0.27, 0.16]);
  addCone(x, h + 0.7 * s, z, 0.95 * s, 1.7 * s, 6, [0.13, 0.42, 0.2]);
  addCone(x, h + 1.55 * s, z, 0.7 * s, 1.5 * s, 6, [0.17, 0.5, 0.23]);
}
for (let tries = 0, rocks = 0; tries < 400 && rocks < 12; tries += 1) {
  const a = rand() * Math.PI * 2, r = 3 + rand() * 9;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < -0.3 || h > 1.4) continue;
  rocks += 1;
  const s = 0.35 + rand() * 0.6;
  addRock(x, h + s * 0.15, z, s, [0.5, 0.48, 0.46]);
}
// a couple of boulders near the peak
addRock(-1.2, height(-1.2, 2.6) + 0.3, 2.6, 0.9, [0.5, 0.47, 0.45]);
addRock(-3.4, height(-3.4, -0.4) + 0.3, -0.4, 0.7, [0.52, 0.5, 0.47]);

const islandGeometry = geometry.define({
  positions: new Float32Array(P),
  normals: new Float32Array(N),
  colors: new Float32Array(C),
  indices: I,
  bounds: { min: [-SIZE / 2, -3, -SIZE / 2], max: [SIZE / 2, 10, SIZE / 2] }
});

// --------------------------------------------------------------- water
const WATER_SIZE = 360;
const WATER_CELLS = 150;
const wPos = new Float32Array((WATER_CELLS + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= WATER_CELLS; j += 1) {
  for (let i = 0; i <= WATER_CELLS; i += 1) {
    const v = j * (WATER_CELLS + 1) + i;
    wPos.set([(i / WATER_CELLS - 0.5) * WATER_SIZE, 0, (j / WATER_CELLS - 0.5) * WATER_SIZE], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < WATER_CELLS && j < WATER_CELLS) {
      wIdx.push(v, v + WATER_CELLS + 1, v + 1, v + 1, v + WATER_CELLS + 1, v + WATER_CELLS + 2);
    }
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vec2 p = position.xz;
  float y = sin(dot(p, vec2(0.21, 0.13)) * 2.4 + waveClock * 1.3) * 0.16
          + sin(dot(p, vec2(-0.17, 0.25)) * 2.6 + waveClock * 1.7) * 0.11
          + sin(dot(p, vec2(0.40, 0.31)) * 2.2 + waveClock * 2.3) * 0.05;
  vec3 w = vec3(p.x, y - 0.05, p.y);
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
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float r = length(vPos.xz);
  float shallow = smoothstep(15.0, 8.0, r);
  vec3 body = mix(deepCol, shallowCol, shallow) * lightLevel;
  vec3 col = mix(body, skyCol, clamp(fresnel * 0.8 + 0.06, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(lightDir), n), v), 0.0), 90.0);
  col += lightCol * glint * 1.6;
  float crest = smoothstep(0.17, 0.3, vPos.y + 0.05);
  col += vec3(0.5) * crest * lightLevel * 0.35;
  float foam = smoothstep(11.5, 9.5, r) * smoothstep(7.5, 9.0, r) * (0.5 + 0.5 * sin(vPos.x * 1.7 + vPos.z * 1.3 + waveClock * 2.0));
  col += vec3(0.9) * foam * lightLevel * 0.25;
  float fade = smoothstep(60.0, 170.0, length(cameraPosition - vPos));
  col = mix(col, skyCol, fade);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    lightLevel: { type: "f32", value: 1 },
    deepCol: { type: "vec3", value: [0.03, 0.25, 0.42] },
    shallowCol: { type: "vec3", value: [0.12, 0.6, 0.62] },
    skyCol: { type: "vec3", value: [0.6, 0.78, 0.95] },
    lightDir: { type: "vec3", value: [0.5, 0.6, 0.3] },
    lightCol: { type: "vec3", value: [1, 0.93, 0.78] }
  }
});

// ------------------------------------------------------ day / night cycle
const DAY_SECONDS = 20;
const START_HOUR = 9;
const sunAt = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirOf = (elev: number, azim: number, d = 40): V3 => {
  const e = (elev * Math.PI) / 180, a = (azim * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, -Math.cos(a) * Math.cos(e) * d];
};

const s0 = sunAt(START_HOUR);
const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#4a4f3a", intensity: 1.0 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.2, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(islandGeometry, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }) }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WATER_SIZE / 2, -1, -WATER_SIZE / 2], max: [WATER_SIZE / 2, 1, WATER_SIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(effects.fog({ color: "#a9c4e0", density: 0.002 }))
    .camera(camera.orbit({ position: [17, 11, 20], target: [0, 1.2, 0], fov: 45, near: 0.5, far: 600, autoRotate: 0.12 }))
});

const DAY_SKY: C3 = [0.55, 0.74, 0.95];
const NIGHT_SKY: C3 = [0.04, 0.06, 0.15];
const WARM: C3 = [0.95, 0.5, 0.25];

let clock = 0;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
  const s = sunAt(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const dayF = smoothstep(-0.12, 0.35, sinE);
  const warm = Math.exp(-Math.pow(sinE / 0.22, 2));

  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  const moonPos = dirOf(-s.elevationDeg, s.azimuthDeg + 180);

  const sun = app.nodes.require("sun");
  sun.setPosition(...sunPos);
  sun.setLight?.({
    intensity: 3.4 * smoothstep(-0.02, 0.3, sinE),
    color: hex(mix3([1, 0.95, 0.85], [1, 0.62, 0.35], warm))
  });
  const moon = app.nodes.require("moon");
  moon.setPosition(...moonPos);
  moon.setLight?.({ intensity: 0.9 * (1 - dayF) });
  app.nodes.require("hemi").setLight?.({
    intensity: 0.55 + 0.6 * dayF,
    color: hex(mix3([0.32, 0.4, 0.7], mix3([0.72, 0.82, 0.95], [0.95, 0.7, 0.55], warm * 0.6), dayF))
  });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const skyCol = mix3(NIGHT_SKY, DAY_SKY, dayF);
  const horizon = mix3(skyCol, WARM, warm * 0.45);
  app.atmosphere?.setFog({ color: hex(horizon), density: 0.002 });

  const lightUp = sinE > -0.05;
  const lp = lightUp ? sunPos : moonPos;
  const lightCol = lightUp ? mix3([1, 0.93, 0.78], [1, 0.55, 0.3], warm) : [0.55, 0.65, 1];
  const strength = lightUp ? smoothstep(-0.05, 0.2, sinE) : 0.5;
  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", clock);
  w.setUniform?.("lightLevel", 0.3 + 0.7 * dayF);
  w.setUniform?.("skyCol", horizon);
  w.setUniform?.("lightDir", lp);
  w.setUniform?.("lightCol", [lightCol[0]! * strength, lightCol[1]! * strength, lightCol[2]! * strength]);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
