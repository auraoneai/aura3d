import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const DAY_SECONDS = 20;
const TAU = Math.PI * 2;

// ---------- helpers ----------
type V3 = [number, number, number];
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hex = (c: string): V3 => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mixC = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: V3): string => {
  const h = (v: number): string => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
};

let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- island terrain (flat shaded, non-indexed triangles) ----------
const CELLS = 56;
const SIZE = 44;
const baseHeight = (x: number, z: number): number => {
  const a = Math.atan2(z, x);
  const radius = 12.5 + 1.8 * Math.sin(a * 3 + 0.6) + 1.0 * Math.sin(a * 5 + 2.0);
  const r = Math.hypot(x, z) / radius;
  const dome = (1 - r * r) * 6.2 - 0.6;
  const bumps = 0.55 * Math.sin(x * 0.55 + 0.7) * Math.cos(z * 0.5) + 0.35 * Math.sin(x * 1.1 + z * 0.9);
  const h = dome + bumps * smooth(-0.5, 1.5, dome);
  return Math.max(h, -2.5);
};
// jitter vertices so the facets are irregular
const jitter = (i: number, j: number): [number, number] => {
  const s1 = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  const s2 = Math.sin(i * 39.346 + j * 11.135) * 24634.6345;
  return [(s1 - Math.floor(s1) - 0.5) * 0.7, (s2 - Math.floor(s2) - 0.5) * 0.7];
};
const gx = (i: number, j: number): number => (i / CELLS - 0.5) * SIZE + jitter(i, j)[0];
const gz = (i: number, j: number): number => (j / CELLS - 0.5) * SIZE + jitter(i, j)[1];
const gp = (i: number, j: number): V3 => {
  const x = gx(i, j), z = gz(i, j);
  return [x, baseHeight(x, z), z];
};

const SAND = hex("#e2c98b"), GRASS_A = hex("#4fa24a"), GRASS_B = hex("#3b8a3d"), ROCK = hex("#8b8279"), SNOW = hex("#f1f3f6"), WET = hex("#bfa56e");
const faceColor = (h: number, ny: number, variation: number): V3 => {
  let c: V3;
  if (h < 0.15) c = WET;
  else if (h < 0.85) c = SAND;
  else if (h < 3.6) c = mixC(GRASS_A, GRASS_B, variation);
  else if (h < 4.8) c = ROCK;
  else c = SNOW;
  if (ny < 0.72 && h > 0.85) c = ROCK;
  const k = 0.92 + variation * 0.16;
  return [c[0] * k, c[1] * k, c[2] * k];
};

const triCount = CELLS * CELLS * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices = new Uint32Array(triCount * 3);
let tri = 0;
const pushTri = (a: V3, b: V3, c: V3): void => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const avgH = (a[1] + b[1] + c[1]) / 3;
  const variation = (Math.sin(a[0] * 7.1 + a[2] * 3.7) + 1) * 0.5;
  const col = faceColor(avgH, ny, variation);
  [a, b, c].forEach((p, k) => {
    const o = tri * 9 + k * 3;
    positions.set(p, o);
    normals.set([nx, ny, nz], o);
    colors.set([col[0], col[1], col[2], 1], tri * 12 + k * 4);
    indices[tri * 3 + k] = tri * 3 + k;
  });
  tri += 1;
};
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const p00 = gp(i, j), p10 = gp(i + 1, j), p01 = gp(i, j + 1), p11 = gp(i + 1, j + 1);
    // counter-clockwise seen from above (+y normal)
    if ((i + j) % 2 === 0) {
      pushTri(p00, p01, p10);
      pushTri(p10, p01, p11);
    } else {
      pushTri(p00, p01, p11);
      pushTri(p00, p11, p10);
    }
  }
}

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const leavesLow: AuraTransformSpec[] = [];
const leavesHigh: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
for (let n = 0, tries = 0; n < 26 && tries < 600; tries += 1) {
  const x = (rand() - 0.5) * 26, z = (rand() - 0.5) * 26;
  const h = baseHeight(x, z);
  if (h < 1.0 || h > 3.4) continue;
  const s = 0.75 + rand() * 0.6;
  trunks.push({ position: [x, h + 0.55 * s, z], scale: [0.32 * s, 1.3 * s, 0.32 * s] });
  leavesLow.push({ position: [x, h + 1.9 * s, z], scale: [2.0 * s, 2.2 * s, 2.0 * s] });
  leavesHigh.push({ position: [x, h + 3.0 * s, z], scale: [1.4 * s, 1.7 * s, 1.4 * s] });
  n += 1;
}
for (let n = 0, tries = 0; n < 14 && tries < 600; tries += 1) {
  const x = (rand() - 0.5) * 30, z = (rand() - 0.5) * 30;
  const h = baseHeight(x, z);
  if (h < 0.1 || h > 4.2) continue;
  const s = 0.45 + rand() * 0.7;
  rocks.push({ position: [x, h + 0.2 * s, z], scale: [1.3 * s, 0.9 * s, 1.1 * s], rotation: [0, rand() * TAU, 0] });
  n += 1;
}

// ---------- water (custom shader, animated) ----------
const WN = 200, WSIZE = 260;
const wPositions = new Float32Array((WN + 1) ** 2 * 3);
const wNormals = new Float32Array(wPositions.length);
const wIndices: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    wPositions.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
    wNormals[v * 3 + 1] = 1;
    if (i < WN && j < WN) wIndices.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const waterMat = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
void main() {
  vec2 p = position.xz;
  float p1 = dot(p, vec2(0.21, 0.13)) * 3.0 + waveClock * 1.3;
  float p2 = dot(p, vec2(-0.17, 0.25)) * 3.0 + waveClock * 1.7;
  float p3 = dot(p, vec2(0.4, 0.31)) * 3.0 + waveClock * 2.4;
  float h = sin(p1) * 0.16 + sin(p2) * 0.11 + sin(p3) * 0.04;
  float dx = cos(p1) * 0.16 * 0.63 - cos(p2) * 0.11 * 0.51 + cos(p3) * 0.04 * 1.2;
  float dz = cos(p1) * 0.16 * 0.39 + cos(p2) * 0.11 * 0.75 + cos(p3) * 0.04 * 0.93;
  vec3 wp = vec3(p.x, h - 0.05, p.y);
  vPos = wp;
  vNormal = normalize(vec3(-dx, 1.0, -dz));
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 3.0);
  vec3 body = mix(deepCol, shallowCol, clamp(vPos.y * 3.0 + 0.5, 0.0, 1.0));
  float diff = max(dot(n, normalize(lightDir)), 0.0);
  vec3 lit = body * (ambientCol + lightCol * diff * 0.6);
  vec3 col = mix(lit, horizonCol, clamp(fresnel * 0.75 + 0.05, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(lightDir), n), v), 0.0), 90.0);
  col += lightCol * glint * 1.2;
  // sparkling wave crests
  float crest = smoothstep(0.17, 0.3, vPos.y);
  col += vec3(0.8, 0.9, 1.0) * crest * (0.15 + 0.5 * dot(ambientCol, vec3(0.33)));
  float dist = length(cameraPosition - vPos);
  col = mix(col, horizonCol, smoothstep(45.0, 115.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    deepCol: { type: "vec3", value: [0.03, 0.2, 0.34] },
    shallowCol: { type: "vec3", value: [0.1, 0.5, 0.6] },
    horizonCol: { type: "vec3", value: [0.7, 0.85, 0.95] },
    lightDir: { type: "vec3", value: [0.4, 0.8, 0.4] },
    lightCol: { type: "vec3", value: [1, 0.95, 0.85] },
    ambientCol: { type: "vec3", value: [0.7, 0.75, 0.8] }
  }
});

// ---------- day / night model ----------
interface SkyState {
  elevationDeg: number;
  azimuthDeg: number;
  dayK: number;
  zenith: V3;
  horizon: V3;
  sunColor: V3;
}
const ZEN_DAY = hex("#2f78d0"), HOR_DAY = hex("#bfe0f5");
const ZEN_DUSK = hex("#40508f"), HOR_DUSK = hex("#ff9d62");
const ZEN_NIGHT = hex("#0a1233"), HOR_NIGHT = hex("#26366a");
const skyAt = (phase: number): SkyState => {
  const s = Math.sin(phase); // sun height, -1..1
  const elevationDeg = s * 62;
  const azimuthDeg = 180 + 70 * Math.cos(phase);
  let zenith: V3, horizon: V3;
  if (s >= 0) {
    const t = smooth(0.0, 0.45, s);
    zenith = mixC(ZEN_DUSK, ZEN_DAY, t);
    horizon = mixC(HOR_DUSK, HOR_DAY, t);
  } else {
    const t = smooth(0.0, 0.3, -s);
    zenith = mixC(ZEN_DUSK, ZEN_NIGHT, t);
    horizon = mixC(HOR_DUSK, HOR_NIGHT, t);
  }
  const sunColor = mixC(hex("#ff9a55"), hex("#fff3d8"), smooth(0.0, 0.5, s));
  return { elevationDeg, azimuthDeg, dayK: smooth(-0.12, 0.3, s), zenith, horizon, sunColor };
};
const dirFrom = (elevationDeg: number, azimuthDeg: number): V3 => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaled = (d: V3, k: number): V3 => [d[0] * k, d[1] * k, d[2] * k];

const PHASE0 = 1.0; // start with the sun well above the horizon
const s0 = skyAt(PHASE0);

const app = createAuraApp("#app", {
  scene: scene({ background: css(s0.horizon) })
    .add(sky.gradient({
      zenith: css(s0.zenith),
      horizon: css(s0.horizon),
      ground: css(s0.horizon),
      sun: { elevationDeg: s0.elevationDeg, azimuthDeg: s0.azimuthDeg, intensity: 1, discSize: 0.06 },
      stars: { count: 500, brightness: 0 }
    }))
    .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#5a6a4a", intensity: 0.9 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: scaled(dirFrom(s0.elevationDeg, s0.azimuthDeg), 40), target: [0, 0, 0], intensity: 3.6, color: "#fff3d8", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: scaled(dirFrom(-s0.elevationDeg, s0.azimuthDeg + 180), 40), target: [0, 0, 0], intensity: 0.0, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -3, -SIZE / 2], max: [SIZE / 2, 8, SIZE / 2] } }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1, metallic: 0 }) }
    ))
    .add(geometry.custom(
      geometry.define({ positions: wPositions, normals: wNormals, indices: wIndices, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: waterMat, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "leaves-low", transforms: leavesLow, material: material.pbr({ color: "#2f8a3e", roughness: 1 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "leaves-high", transforms: leavesHigh, material: material.pbr({ color: "#43a64d", roughness: 1 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#8d9096", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(effects.fog({ color: css(s0.horizon), density: 0.004 }))
    .camera(camera.perspective({ position: [0, 16, 29], target: [0, 0.5, 0], fov: 40, near: 0.5, far: 500 }))
});

let clock = 0;
let frameNo = 0;
app.onFrame((frame) => {
  clock += Math.min(frame.dt, 0.1);
  frameNo += 1;
  const phase = PHASE0 + (clock / DAY_SECONDS) * TAU;
  const st = skyAt(phase);
  const night = 1 - st.dayK;

  const sunDir = dirFrom(st.elevationDeg, st.azimuthDeg);
  const moonDir = dirFrom(-st.elevationDeg, st.azimuthDeg + 180);
  app.nodes.require("sun").setLight?.({ position: scaled(sunDir, 40), intensity: 3.8 * st.dayK, color: css(st.sunColor) });
  app.nodes.require("moon").setLight?.({ position: scaled(moonDir, 40), intensity: 0.9 * night, color: "#8fb0ff" });
  const hemiSky = mixC(mixC(hex("#ffd2a8"), hex("#cfe3ff"), st.dayK), hex("#5d72b8"), night * 0.8);
  app.nodes.require("hemi").setLight?.({ intensity: 0.38 + 0.6 * st.dayK, color: css(hemiSky) });

  // water uniforms
  const lightCol: V3 = st.dayK > 0.05 ? scaled([st.sunColor[0], st.sunColor[1], st.sunColor[2]], 0.15 + 1.1 * st.dayK) : [0.35, 0.45, 0.7];
  const lightDir: V3 = st.dayK > 0.05 ? sunDir : moonDir;
  const ambient = mixC([0.22, 0.28, 0.45], [0.8, 0.85, 0.9], st.dayK);
  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", clock);
  water.setUniform?.("horizonCol", st.horizon);
  water.setUniform?.("lightDir", lightDir);
  water.setUniform?.("lightCol", lightCol);
  water.setUniform?.("ambientCol", ambient);
  water.setUniform?.("deepCol", mixC([0.01, 0.06, 0.15], [0.03, 0.2, 0.34], st.dayK));
  water.setUniform?.("shallowCol", mixC([0.03, 0.14, 0.26], [0.1, 0.5, 0.6], st.dayK));

  if (frameNo % 2 === 0) {
    app.atmosphere?.setSky({
      model: "gradient",
      zenith: css(st.zenith),
      horizon: css(st.horizon),
      ground: css(st.horizon),
      sun: { elevationDeg: st.elevationDeg, azimuthDeg: st.azimuthDeg, intensity: 1, discSize: 0.06 },
      stars: { count: 500, brightness: night }
    });
  }
  if (frameNo % 4 === 0) app.atmosphere?.setFog({ color: css(st.horizon) });

  // slow orbit
  const ang = clock * 0.12;
  const R = 29;
  app.camera?.setPose({ position: [Math.sin(ang) * R, 16, Math.cos(ang) * R], target: [0, 0.5, 0] });
});

await app.ready();
window.__EVAL_READY__ = true;
