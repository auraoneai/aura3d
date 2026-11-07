import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

const DAY_SECONDS = 20;

// ---------- helpers ----------
let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
type RGB = [number, number, number];
const hexToRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const toHex = (c: RGB): string => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

// ---------- island (flat-shaded heightfield) ----------
const CELLS = 44;
const SIZE = 36;
const height = (x: number, z: number): number => {
  const d = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const radius = 12.5 + 2.2 * Math.sin(3 * a + 1) + 1.2 * Math.sin(5 * a + 2);
  const t = d / radius;
  const dome = (1 - t * t) * 5.4 - 0.5;
  const bumps = (1.1 * Math.sin(x * 0.55) * Math.cos(z * 0.47) + 0.5 * Math.sin(x * 1.1 + z * 0.9)) * clamp01(1.1 - t);
  return Math.max(-1.6, dome + bumps);
};

// Jittered grid vertices for an irregular, hand-made low-poly look.
const gx: number[] = [];
const gz: number[] = [];
const gy: number[] = [];
const cell = SIZE / CELLS;
for (let j = 0; j <= CELLS; j += 1) for (let i = 0; i <= CELLS; i += 1) {
  const edge = i === 0 || j === 0 || i === CELLS || j === CELLS;
  const x = (i / CELLS - 0.5) * SIZE + (edge ? 0 : (rand() - 0.5) * cell * 0.7);
  const z = (j / CELLS - 0.5) * SIZE + (edge ? 0 : (rand() - 0.5) * cell * 0.7);
  gx.push(x); gz.push(z); gy.push(height(x, z));
}

const faceColor = (h: number, jitter: number): [number, number, number, number] => {
  let c: RGB;
  if (h < 0.35) c = [0.86, 0.76, 0.5];       // sand
  else if (h < 2.5) c = [0.34, 0.62, 0.22];  // grass
  else if (h < 3.9) c = [0.5, 0.46, 0.42];   // rock
  else c = [0.94, 0.95, 0.97];               // snow cap
  const k = 1 + jitter;
  return [c[0] * k, c[1] * k, c[2] * k, 1];
};

const triCount = CELLS * CELLS * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices: number[] = [];
let tri = 0;
const pushTri = (a: number, b: number, c: number): void => {
  const ax = gx[a]!, ay = gy[a]!, az = gz[a]!;
  const bx = gx[b]!, by = gy[b]!, bz = gz[b]!;
  const cx = gx[c]!, cy = gy[c]!, cz = gz[c]!;
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const col = faceColor((ay + by + cy) / 3, (rand() - 0.5) * 0.14);
  const p = [ax, ay, az, bx, by, bz, cx, cy, cz];
  positions.set(p, tri * 9);
  for (let k = 0; k < 3; k += 1) {
    normals.set([nx, ny, nz], tri * 9 + k * 3);
    colors.set(col, tri * 12 + k * 4);
    indices.push(tri * 3 + k);
  }
  tri += 1;
};
for (let j = 0; j < CELLS; j += 1) for (let i = 0; i < CELLS; i += 1) {
  const v = j * (CELLS + 1) + i;
  const flip = (i + j) % 2 === 0;
  // wound so the face normal points up (+y)
  if (flip) { pushTri(v, v + CELLS + 1, v + 1); pushTri(v + 1, v + CELLS + 1, v + CELLS + 2); }
  else { pushTri(v, v + CELLS + 2, v + 1); pushTri(v, v + CELLS + 1, v + CELLS + 2); }
}

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
for (let n = 0, tries = 0; n < 24 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2, r = 2 + rand() * 11;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = height(x, z);
  if (h < 0.7 || h > 2.9) continue;
  const s = 0.75 + rand() * 0.6;
  trunks.push({ position: [x, h + 0.45 * s, z], scale: [0.3 * s, 0.9 * s, 0.3 * s] });
  crownsLow.push({ position: [x, h + 1.45 * s, z], scale: [1.7 * s, 1.7 * s, 1.7 * s], rotation: [0, rand() * 3, 0] });
  crownsHigh.push({ position: [x, h + 2.35 * s, z], scale: [1.2 * s, 1.5 * s, 1.2 * s], rotation: [0, rand() * 3, 0] });
  n += 1;
}
for (let n = 0, tries = 0; n < 16 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2, r = 1 + rand() * 14;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = height(x, z);
  if (h < -0.1 || h > 4.2) continue;
  const s = 0.35 + rand() * 0.7;
  rocks.push({ position: [x, h + 0.15 * s, z], scale: [s * 1.3, s * 0.9, s], rotation: [rand() * 1.2, rand() * 3, rand() * 1.2] });
  n += 1;
}

// ---------- water ----------
const WN = 120;
const WSIZE = 160;
const wPos = new Float32Array((WN + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= WN; j += 1) for (let i = 0; i <= WN; i += 1) {
  const v = j * (WN + 1) + i;
  wPos.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
  wNor[v * 3 + 1] = 1;
  if (i < WN && j < WN) wIdx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
void main() {
  vec2 p = position.xz;
  vec2 d1 = vec2(0.30, 0.18), d2 = vec2(-0.22, 0.34), d3 = vec2(0.55, -0.42);
  float p1 = dot(p, d1) * 2.0 + waveClock * 1.3;
  float p2 = dot(p, d2) * 2.0 + waveClock * 1.7;
  float p3 = dot(p, d3) * 2.0 + waveClock * 2.4;
  float h = sin(p1) * 0.14 + sin(p2) * 0.10 + sin(p3) * 0.04;
  vec2 slope = cos(p1) * 0.14 * d1 * 2.0 + cos(p2) * 0.10 * d2 * 2.0 + cos(p3) * 0.04 * d3 * 2.0;
  vec3 wp = vec3(p.x, h - 0.05, p.y);
  vPos = wp;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
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
  float fresnel = pow(1.0 - ndv, 4.0);
  float dist = length(vPos.xz);
  float shore = 1.0 - smoothstep(11.0, 19.0, dist);
  vec3 deep = vec3(0.03, 0.22, 0.38);
  vec3 shallow = vec3(0.12, 0.62, 0.66);
  vec3 body = mix(deep, shallow, shore * 0.85 + clamp(vPos.y * 1.5 + 0.35, 0.0, 0.3));
  body *= mix(0.22, 1.0, daylight);
  // soft foam ring where the water meets the beach
  float foamBand = smoothstep(0.45, 1.0, shore) * (0.5 + 0.5 * sin(dist * 3.0 - waveClock * 1.5));
  body += vec3(0.5, 0.55, 0.55) * foamBand * 0.06 * daylight;
  vec3 refl = mix(body, skyCol, clamp(fresnel * 0.9 + 0.1, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-lightDir, n), v), 0.0), 120.0);
  vec3 col = refl + lightCol * glint * 1.6;
  float fogAmt = 1.0 - exp(-dist * 0.012);
  col = mix(col, skyCol, clamp(fogAmt, 0.0, 0.85));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    daylight: { type: "f32", value: 1 },
    lightDir: { type: "vec3", value: [0.5, 0.6, 0.4] },
    lightCol: { type: "vec3", value: [1, 0.93, 0.78] },
    skyCol: { type: "vec3", value: [0.6, 0.78, 0.92] }
  }
});

// ---------- day / night ----------
const P0 = 0.12; // start in the morning with the sun already up
const sunAngles = (phase: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(phase * Math.PI * 2) * 68,
  azimuthDeg: 100 + phase * 360
});
const dirFrom = (elevationDeg: number, azimuthDeg: number): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaleV = (v: [number, number, number], k: number): [number, number, number] => [v[0] * k, v[1] * k, v[2] * k];

const DAY_SKY = hexToRgb("#a6cdee");
const DUSK_SKY = hexToRgb("#f0a47a");
const NIGHT_SKY = hexToRgb("#101a38");
const SUN_WHITE = hexToRgb("#fff3dc");
const SUN_ORANGE = hexToRgb("#ff9a50");

const s0 = sunAngles(P0);
const app = createAuraApp("#app", {
  scene: scene({ background: "#a6cdee" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "fill", skyColor: "#b8d0f0", groundColor: "#4a5a3a", intensity: 1.1 }).runtime({ id: "fill", mutable: true }))
    .add(lights.directional({ name: "sun", position: scaleV(dirFrom(s0.elevationDeg, s0.azimuthDeg), 45), target: [0, 0, 0], intensity: 4, color: "#fff3dc", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: scaleV(dirFrom(-s0.elevationDeg, s0.azimuthDeg + 180), 45), target: [0, 0, 0], intensity: 0, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 7, SIZE / 2] } }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
    ))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns-low", transforms: crownsLow, material: material.pbr({ color: "#2c7a3a", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns-high", transforms: crownsHigh, material: material.pbr({ color: "#3b9446", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#8d8a86", roughness: 1 }) }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(effects.fog({ color: "#a6cdee", density: 0.004 }))
    .camera(camera.perspective({ position: [27, 13, 0], target: [0, 1, 0], fov: 45, near: 0.5, far: 500 }))
});

let clock = 0;
let frames = 0;
app.onFrame((frame) => {
  clock += frame.dt;
  const phase = (P0 + clock / DAY_SECONDS) % 1;
  const s = sunAngles(phase);
  const sunDir = dirFrom(s.elevationDeg, s.azimuthDeg);
  const moonDir = dirFrom(-s.elevationDeg, s.azimuthDeg + 180);
  const e = sunDir[1];
  const daylight = smoothstep(-0.08, 0.25, e);
  const warm = (1 - smoothstep(0.08, 0.45, e)) * smoothstep(-0.12, 0.04, e);
  const night = 1 - daylight;

  const sunCol = mixRgb(SUN_WHITE, SUN_ORANGE, warm);
  app.nodes.require("sun").setLight?.({ position: scaleV(sunDir, 45), intensity: 4.2 * daylight, color: toHex(sunCol) });
  app.nodes.require("moon").setLight?.({ position: scaleV(moonDir, 45), intensity: 1.2 * night });
  app.nodes.require("fill").setLight?.({ intensity: 0.45 + 0.75 * daylight });

  let skyRgb = mixRgb(NIGHT_SKY, DAY_SKY, daylight);
  skyRgb = mixRgb(skyRgb, DUSK_SKY, warm * 0.7);
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  app.atmosphere?.setFog({ color: toHex(skyRgb), density: 0.004 });

  const useSun = e > -0.05;
  const ld = useSun ? sunDir : moonDir;
  const lc: RGB = useSun ? mixRgb([0, 0, 0], sunCol, 1) : [143, 176, 255];
  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", clock);
  water.setUniform?.("daylight", 0.18 + 0.82 * daylight);
  water.setUniform?.("lightDir", [ld[0], Math.max(ld[1], 0.05), ld[2]]);
  water.setUniform?.("lightCol", [lc[0] / 255, lc[1] / 255, lc[2] / 255]);
  water.setUniform?.("skyCol", [skyRgb[0] / 255, skyRgb[1] / 255, skyRgb[2] / 255]);

  // slow orbit above the water, framing the whole island
  const ang = clock * 0.12;
  const R = 29, camH = 13;
  app.camera?.setPose({ position: [Math.cos(ang) * R, camH, Math.sin(ang) * R], target: [0, 1, 0] }, { cut: true });

  frames += 1;
  if (frames === 2) window.__EVAL_READY__ = true;
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
