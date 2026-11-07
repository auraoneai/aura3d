import { camera, createAuraApp, geometry, instances, interactions, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

// Low-poly island, animated faceted water and a 20 second day/night cycle.
const DAY_SECONDS = 20;
const START_HOUR = 9;

// ---------- deterministic random ----------
let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- terrain height ----------
const shoreRadius = (theta: number): number => 14 + 2.5 * Math.sin(3 * theta + 1) + 1.5 * Math.sin(5 * theta + 2);
const height = (x: number, z: number): number => {
  const t = Math.hypot(x, z) / shoreRadius(Math.atan2(z, x));
  const noise = 0.5 * Math.sin(x * 0.45 + 1) * Math.cos(z * 0.4) + 0.3 * Math.sin(x * 0.9 + z * 0.7);
  return Math.max(-4, (1 - t * t) * 7 - 1.2 + noise * Math.min(1, Math.max(0, 1.3 - t)));
};

const hash = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function faceColor(h: number, jitter: number): [number, number, number, number] {
  let c: [number, number, number];
  if (h < 0.55) c = [0.82, 0.73, 0.5]; // sand
  else if (h < 3.3) c = [0.3, 0.55, 0.2]; // grass
  else if (h < 5.0) c = [0.45, 0.4, 0.36]; // rock
  else c = [0.82, 0.82, 0.84]; // pale summit
  const k = 0.85 + jitter * 0.3;
  return [c[0] * k, c[1] * k, c[2] * k, 1];
}

// ---------- flat-shaded terrain (one triangle soup, one normal per face) ----------
const CELLS = 64;
const SIZE = 44;
const triCount = CELLS * CELLS * 2;
const tPos = new Float32Array(triCount * 9);
const tNor = new Float32Array(triCount * 9);
const tCol = new Float32Array(triCount * 12);
const tIdx: number[] = [];
let tri = 0;
function addTri(a: [number, number, number], b: [number, number, number], c: [number, number, number], jitter: number): void {
  let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (ny < 0) { // make the face point up
    [b, c] = [c, b];
    ux = b[0] - a[0]; uy = b[1] - a[1]; uz = b[2] - a[2];
    vx = c[0] - a[0]; vy = c[1] - a[1]; vz = c[2] - a[2];
    nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  const col = faceColor((a[1] + b[1] + c[1]) / 3, jitter);
  [a, b, c].forEach((p, k) => {
    const v = tri * 3 + k;
    tPos.set(p, v * 3);
    tNor.set([nx / len, ny / len, nz / len], v * 3);
    tCol.set(col, v * 4);
    tIdx.push(v);
  });
  tri += 1;
}
const P = (i: number, j: number): [number, number, number] => {
  const x = (i / CELLS - 0.5) * SIZE, z = (j / CELLS - 0.5) * SIZE;
  return [x, height(x, z), z];
};
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const p00 = P(i, j), p10 = P(i + 1, j), p01 = P(i, j + 1), p11 = P(i + 1, j + 1);
    if ((i + j) % 2 === 0) {
      addTri(p00, p01, p10, hash(i, j));
      addTri(p10, p01, p11, hash(i + 50, j));
    } else {
      addTri(p00, p01, p11, hash(i, j));
      addTri(p00, p11, p10, hash(i + 50, j));
    }
  }
}
const terrain = geometry.define({
  positions: tPos, normals: tNor, colors: tCol, indices: tIdx,
  bounds: { min: [-SIZE / 2, -4.5, -SIZE / 2], max: [SIZE / 2, 8, SIZE / 2] }
});

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const trunkColors: string[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const crownLowColors: string[] = [];
const crownHighColors: string[] = [];
const treeSpots: Array<[number, number]> = [];
for (let tries = 0; tries < 600 && treeSpots.length < 26; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = rand() * 13;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 0.9 || h > 4.2) continue;
  if (treeSpots.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 2.2)) continue;
  treeSpots.push([x, z]);
  const s = 0.8 + rand() * 0.7;
  trunks.push({ position: [x, h + 0.5 * s, z], scale: [0.35 * s, 1.0 * s, 0.35 * s] });
  trunkColors.push("#6b4a2b");
  crownsLow.push({ position: [x, h + 1.5 * s, z], scale: [2.0 * s, 2.0 * s, 2.0 * s], rotation: [0, rand() * 3, 0] });
  crownsHigh.push({ position: [x, h + 2.6 * s, z], scale: [1.5 * s, 1.8 * s, 1.5 * s], rotation: [0, rand() * 3, 0] });
  const g = rand();
  crownLowColors.push(g < 0.5 ? "#2f7a3a" : "#3c8a35");
  crownHighColors.push(g < 0.5 ? "#3a8c44" : "#4a9a3c");
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let tries = 0; tries < 400 && rocks.length < 14; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 4 + rand() * 13;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < -0.4 || h > 3.8) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, h + 0.15 * s, z], scale: [s * 1.3, s * 0.9, s], rotation: [rand() * 0.6, rand() * 3, rand() * 0.6] });
  rockColors.push(rand() < 0.5 ? "#7d7a76" : "#6a6864");
}

// ---------- water ----------
const WN = 150, WSIZE = 320;
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
const waterGeo = geometry.define({
  positions: wPos, normals: wNor, indices: wIdx,
  bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] }
});

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vec3 p = position;
  p.y += 0.22 * sin(p.x * 0.55 + waveClock * 1.3) + 0.16 * sin(p.z * 0.7 - waveClock * 1.1) + 0.1 * sin((p.x + p.z) * 1.1 + waveClock * 2.0);
  vPos = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 fn = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (fn.y < 0.0) fn = -fn;
  float dist = length(cameraPosition - vPos);
  vec3 n = normalize(mix(fn, vec3(0.0, 1.0, 0.0), smoothstep(45.0, 110.0, dist)));
  vec3 v = normalize(cameraPosition - vPos);

  float th = atan(vPos.z, vPos.x);
  float R = 14.0 + 2.5 * sin(3.0 * th + 1.0) + 1.5 * sin(5.0 * th + 2.0);
  float t = length(vPos.xz) / R;

  vec3 deep = vec3(0.03, 0.22, 0.40);
  vec3 shallow = vec3(0.12, 0.62, 0.66);
  vec3 body = mix(shallow, deep, smoothstep(0.95, 1.5, t));
  body += vec3(0.04, 0.08, 0.08) * clamp(vPos.y * 2.0, -1.0, 1.0);

  float diff = max(dot(n, normalize(lightDir)), 0.0);
  vec3 col = body * (waterAmb + 0.5 * diff * length(lightCol));

  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
  col = mix(col, skyCol, clamp(fresnel * 0.85 + 0.05, 0.0, 1.0));

  float glint = pow(max(dot(reflect(-normalize(lightDir), n), v), 0.0), 90.0);
  col += lightCol * glint * 1.6;

  float ripple = 0.5 + 0.5 * sin(t * 40.0 - waveClock * 2.5 + th * 6.0);
  float foam = smoothstep(0.86, 0.93, t) * (1.0 - smoothstep(0.97, 1.08, t)) * (0.55 + 0.45 * ripple);
  col = mix(col, vec3(0.95, 0.98, 1.0) * (0.35 + 0.65 * waterAmb), foam * 0.8);

  col = mix(col, skyCol, smoothstep(70.0, 150.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    lightDir: { type: "vec3", value: [0.5, 0.7, 0.4] },
    lightCol: { type: "vec3", value: [1, 0.95, 0.85] },
    skyCol: { type: "vec3", value: [0.5, 0.72, 0.95] },
    waterAmb: { type: "f32", value: 1 }
  }
});

// ---------- sun / moon ----------
const sunAt = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 40): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const hex = (c: [number, number, number]): string =>
  "#" + c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0")).join("");
const norm3 = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

const s0 = sunAt(START_HOUR);
const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#4a5040", intensity: 0.7 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: lightAt(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.6, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: lightAt(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.9, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(terrain, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1, metallic: 0 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, colors: trunkColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crownsLow", transforms: crownsLow, colors: crownLowColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crownsHigh", transforms: crownsHigh, colors: crownHighColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }) }))
    .add(geometry.custom(waterGeo, { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }))
    .add(interactions.orbit({ target: [0, 1.5, 0], position: [0, 17, 36], autoRotate: 0.12 }))
    .camera(camera.orbit({ position: [0, 17, 36], target: [0, 1.5, 0], fov: 45, near: 0.5, far: 600 }))
});

let clock = 0;
let sunOn = true;
let moonOn = true;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
  const s = sunAt(hour);
  const sunPos = lightAt(s.elevationDeg, s.azimuthDeg);
  const moonPos = lightAt(-s.elevationDeg, s.azimuthDeg + 180);
  const elev = s.elevationDeg;
  const dayF = smooth(-8, 10, elev);
  const sunF = smooth(0, 12, elev);
  const moonF = smooth(0, 12, -elev);
  const twilight = Math.exp(-((elev / 12) ** 2));

  const sun = app.nodes.require("sun");
  const moon = app.nodes.require("moon");
  sun.setPosition(...sunPos);
  moon.setPosition(...moonPos);
  const warm: [number, number, number] = [1, mix(0.95, 0.62, twilight), mix(0.85, 0.4, twilight)];
  sun.setLight?.({ intensity: 3.6 * sunF + 0.001, color: hex(warm) });
  moon.setLight?.({ intensity: 0.9 * moonF + 0.001 });
  app.nodes.require("hemi").setLight?.({ intensity: mix(0.35, 0.75, dayF) });
  if ((elev > 0.5) !== sunOn) { sunOn = elev > 0.5; sun.setVisible(sunOn); }
  if ((elev < -0.5) !== moonOn) { moonOn = elev < -0.5; moon.setVisible(moonOn); }

  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  // water uniforms follow the dominant light
  const useSun = elev >= 0;
  const dir = norm3(useSun ? sunPos : moonPos);
  const lc: [number, number, number] = useSun
    ? [warm[0] * sunF, warm[1] * sunF, warm[2] * sunF]
    : [0.55 * moonF, 0.68 * moonF, 1.0 * moonF];
  const night: [number, number, number] = [0.03, 0.05, 0.13];
  const day: [number, number, number] = [0.5, 0.72, 0.95];
  const dusk: [number, number, number] = [0.95, 0.5, 0.35];
  const sky3: [number, number, number] = [0, 1, 2].map((k) => mix(mix(night[k]!, day[k]!, dayF), dusk[k]!, twilight * 0.55)) as [number, number, number];
  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", clock);
  w.setUniform?.("lightDir", dir);
  w.setUniform?.("lightCol", lc);
  w.setUniform?.("skyCol", sky3);
  w.setUniform?.("waterAmb", mix(0.4, 1.0, dayF));
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
}));
