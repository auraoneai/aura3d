import { camera, createAuraApp, geometry, instances, interactions, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const DAY_SECONDS = 20;
const START_HOUR = 9;

// ---------- helpers ----------
let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const toHex = (c: readonly [number, number, number]): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");

// ---------- island height field ----------
const shoreR = (a: number): number => 12 + 0.9 * Math.sin(5 * a + 1) + 0.6 * Math.sin(9 * a + 2.3) + 0.4 * Math.sin(3 * a + 0.2);
const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const d = shoreR(Math.atan2(z, x)) - r; // > 0 inland
  if (d <= 0) return Math.max(-4, d * 0.4);
  const k = Math.tanh(d * 0.12);
  const hills = 1.3 * Math.sin(x * 0.45 + 0.7) * Math.cos(z * 0.4) * clamp01(d / 4) + 2.4 * Math.exp(-(r * r) / 45);
  return 5.2 * k + hills * k;
};

// ---------- flat-shaded terrain ----------
const CELLS = 56;
const EXTENT = 44;
const cellSize = EXTENT / CELLS;
const grid: Array<[number, number]> = [];
for (let j = 0; j <= CELLS; j += 1) {
  for (let i = 0; i <= CELLS; i += 1) {
    const edge = i === 0 || j === 0 || i === CELLS || j === CELLS;
    const jx = edge ? 0 : (rand() - 0.5) * cellSize * 0.6;
    const jz = edge ? 0 : (rand() - 0.5) * cellSize * 0.6;
    grid.push([(i / CELLS - 0.5) * EXTENT + jx, (j / CELLS - 0.5) * EXTENT + jz]);
  }
}
const triCount = CELLS * CELLS * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices = new Uint32Array(triCount * 3);

const faceColor = (h: number, ny: number, r: number): [number, number, number] => {
  const v = 0.92 + r * 0.16;
  let c: [number, number, number];
  if (h < -0.6) c = [0.42, 0.38, 0.3];
  else if (h < 0.75) c = [0.86, 0.76, 0.5];
  else if (h < 4.6) c = ny < 0.78 ? [0.45, 0.4, 0.34] : [0.3, 0.6, 0.22];
  else if (h < 6.4) c = ny < 0.85 ? [0.5, 0.46, 0.42] : [0.38, 0.55, 0.2];
  else c = [0.55, 0.53, 0.52];
  return [c[0] * v, c[1] * v, c[2] * v];
};

let tri = 0;
const addTri = (a: number, b: number, c: number): void => {
  const pa = grid[a], pb = grid[b], pc = grid[c];
  if (!pa || !pb || !pc) return;
  const ya = height(pa[0], pa[1]), yb = height(pb[0], pb[1]), yc = height(pc[0], pc[1]);
  const e1x = pb[0] - pa[0], e1y = yb - ya, e1z = pb[1] - pa[1];
  const e2x = pc[0] - pa[0], e2y = yc - ya, e2z = pc[1] - pa[1];
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const flip = ny < 0;
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const col = faceColor((ya + yb + yc) / 3, ny, rand());
  const order = flip ? [a, c, b] : [a, b, c];
  const ys = new Map<number, number>([[a, ya], [b, yb], [c, yc]]);
  order.forEach((idx, k) => {
    const p = grid[idx];
    if (!p) return;
    const o = (tri * 3 + k) * 3;
    positions[o] = p[0]; positions[o + 1] = ys.get(idx) ?? 0; positions[o + 2] = p[1];
    normals[o] = nx; normals[o + 1] = ny; normals[o + 2] = nz;
    const co = (tri * 3 + k) * 4;
    colors[co] = col[0]; colors[co + 1] = col[1]; colors[co + 2] = col[2]; colors[co + 3] = 1;
    indices[tri * 3 + k] = tri * 3 + k;
  });
  tri += 1;
};
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const v = j * (CELLS + 1) + i;
    addTri(v, v + CELLS + 1, v + 1);
    addTri(v + 1, v + CELLS + 1, v + CELLS + 2);
  }
}

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
let tries = 0;
while (trunks.length < 24 && tries < 2000) {
  tries += 1;
  const a = rand() * Math.PI * 2, r = 2 + rand() * 12;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 1.0 || h > 5.4) continue;
  if (trunks.some((t) => Math.hypot((t.position?.[0] ?? 0) - x, (t.position?.[2] ?? 0) - z) < 2.4)) continue;
  const s = 0.8 + rand() * 0.6;
  trunks.push({ position: [x, h + 0.6 * s, z], scale: [0.4 * s, 1.5 * s, 0.4 * s] });
  crownsLow.push({ position: [x, h + 1.9 * s, z], scale: [2.0 * s, 2.4 * s, 2.0 * s], rotation: [0, rand() * 3, 0] });
  crownsHigh.push({ position: [x, h + 3.2 * s, z], scale: [1.5 * s, 2.0 * s, 1.5 * s], rotation: [0, rand() * 3, 0] });
}
tries = 0;
while (rocks.length < 14 && tries < 2000) {
  tries += 1;
  const a = rand() * Math.PI * 2, r = 3 + rand() * 12;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < -0.3 || h > 6.5) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, h + 0.1 * s, z], scale: [s * 1.3, s * 0.9, s], rotation: [rand(), rand() * 3, rand()] });
  rockColors.push(rand() > 0.5 ? "#8a8782" : "#6f6c68");
}

// ---------- water shader ----------
const WATER_N = 150;
const WATER_SIZE = 320;
const wPos = new Float32Array((WATER_N + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= WATER_N; j += 1) {
  for (let i = 0; i <= WATER_N; i += 1) {
    const v = j * (WATER_N + 1) + i;
    wPos.set([(i / WATER_N - 0.5) * WATER_SIZE, 0, (j / WATER_N - 0.5) * WATER_SIZE], v * 3);
    wNor[v * 3 + 1] = 1;
    if (i < WATER_N && j < WATER_N) wIdx.push(v, v + WATER_N + 1, v + 1, v + 1, v + WATER_N + 1, v + WATER_N + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vec2 p = position.xz;
  float t = waveClock;
  float h = sin(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.22
          + sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.16
          + sin(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1) * 0.07;
  vec3 w = vec3(p.x, h, p.y);
  vPos = w;
  gl_Position = modelViewProjectionMatrix * vec4(w, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);

  float r = length(vPos.xz);
  float a = atan(vPos.z, vPos.x);
  float shoreR = 12.0 + 0.9 * sin(5.0 * a + 1.0) + 0.6 * sin(9.0 * a + 2.3) + 0.4 * sin(3.0 * a + 0.2);
  float d = r - shoreR; // distance from the shoreline, > 0 offshore
  float shallow = 1.0 - smoothstep(0.0, 7.0, d);

  vec3 deep = vec3(0.03, 0.22, 0.38);
  vec3 lagoon = vec3(0.14, 0.62, 0.66);
  vec3 body = mix(deep, lagoon, shallow);
  float crest = clamp(vPos.y * 1.6 + 0.4, 0.0, 1.0);
  body *= 0.85 + 0.3 * crest;

  float lightAmt = uDay;
  vec3 lit = body * (0.22 + 0.9 * lightAmt * (0.55 + 0.45 * max(n.y * 0.5 + dot(n, uLightDir) * 0.5, 0.0)));
  lit = mix(lit, uSkyColor, clamp(fres * 0.75, 0.0, 1.0));

  float glint = pow(max(dot(reflect(-uLightDir, n), v), 0.0), 60.0);
  lit += uLightColor * glint * 1.2;

  float foamBand = 1.0 - smoothstep(0.0, 0.9, abs(d - 0.2 - 0.35 * sin(waveClock * 1.3 + a * 12.0)));
  float foam = foamBand * step(-0.5, d);
  lit = mix(lit, vec3(0.92, 0.97, 1.0) * (0.25 + 0.75 * lightAmt), foam * 0.8);

  float fog = smoothstep(70.0, 170.0, dist);
  lit = mix(lit, uSkyColor, fog);
  outColor = vec4(lit, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    uDay: { type: "f32", value: 1 },
    uLightDir: { type: "vec3", value: [0.5, 0.7, 0.3] },
    uLightColor: { type: "vec3", value: [1, 0.9, 0.7] },
    uSkyColor: { type: "vec3", value: [0.55, 0.75, 0.95] }
  }
});

// ---------- sun, moon, sky colours as a function of the hour ----------
const toDir = (elevationDeg: number, azimuthDeg: number): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const sunAt = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 65,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});

const s0 = sunAt(START_HOUR);
const d0 = toDir(s0.elevationDeg, s0.azimuthDeg);

const app = createAuraApp("#app", {
  scene: scene({ background: "#86b4e0" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "ambient", skyColor: "#bcd4f0", groundColor: "#4a5a3a", intensity: 0.9 }).runtime({ id: "ambient", mutable: true }))
    .add(lights.directional({ name: "sun", position: [d0[0] * 50, d0[1] * 50, d0[2] * 50], target: [0, 0, 0], intensity: 3.5, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: [-d0[0] * 50, Math.max(10, -d0[1] * 50), -d0[2] * 50], target: [0, 0, 0], intensity: 0.4, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-EXTENT / 2, -5, -EXTENT / 2], max: [EXTENT / 2, 10, EXTENT / 2] } }),
      { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
    ))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crownsLow", transforms: crownsLow, material: material.pbr({ color: "#2e7d3a", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crownsHigh", transforms: crownsHigh, material: material.pbr({ color: "#3b9446", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }), params: { widthSegments: 5, heightSegments: 3 } }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WATER_SIZE / 2, -1, -WATER_SIZE / 2], max: [WATER_SIZE / 2, 1, WATER_SIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(interactions.orbit({ target: [0, 1.5, 0], autoRotate: 0.12 }))
    .camera(camera.orbit({ position: [27, 20, 27], target: [0, 1.5, 0], fov: 45, near: 0.5, far: 600 }))
});

const NIGHT_SKY: [number, number, number] = [0.02, 0.03, 0.09];
const DAY_SKY: [number, number, number] = [0.5, 0.72, 0.95];
const DUSK_SKY: [number, number, number] = [0.95, 0.5, 0.3];

let clock = 0;
let ready = false;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
  const s = sunAt(hour);
  const sd = toDir(s.elevationDeg, s.azimuthDeg);
  const day = smoothstep(-10, 22, s.elevationDeg);
  const dusk = Math.exp(-((s.elevationDeg / 14) ** 2));

  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const sunColor = mix3([1, 0.95, 0.85], [1, 0.55, 0.28], dusk);
  app.nodes.require("sun").setPosition(sd[0] * 50, sd[1] * 50, sd[2] * 50);
  app.nodes.require("sun").setLight?.({ intensity: 3.6 * smoothstep(-3, 14, s.elevationDeg), color: toHex(sunColor) });
  app.nodes.require("moon").setPosition(-sd[0] * 50, Math.max(12, -sd[1] * 50), -sd[2] * 50);
  app.nodes.require("moon").setLight?.({ intensity: 0.55 * (1 - day) + 0.05 });
  app.nodes.require("ambient").setLight?.({
    intensity: 0.28 + 0.75 * day,
    color: toHex(mix3([0.35, 0.42, 0.7], [0.78, 0.86, 0.98], day))
  });

  const skyBase = mix3(NIGHT_SKY, DAY_SKY, day);
  const skyCol = mix3(skyBase, DUSK_SKY, dusk * 0.55);
  const useSun = s.elevationDeg > -2;
  const ld: [number, number, number] = useSun ? sd : [-sd[0], Math.max(0.3, -sd[1]), -sd[2]];
  const lc: [number, number, number] = useSun
    ? [sunColor[0] * day, sunColor[1] * day, sunColor[2] * day]
    : [0.25, 0.32, 0.5];
  const wn = app.nodes.require("water");
  wn.setUniform?.("waveClock", clock);
  wn.setUniform?.("uDay", day);
  wn.setUniform?.("uLightDir", ld);
  wn.setUniform?.("uLightColor", lc);
  wn.setUniform?.("uSkyColor", skyCol);

  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});
await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
