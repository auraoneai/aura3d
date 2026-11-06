import { camera, createAuraApp, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

// Low-poly island, animated faceted water and a 20 second day/night cycle.
// ?hour=14 freezes the clock for a capture.
const DAY_SECONDS = 20;
const START_HOUR = 9;
const fixedHourParam = new URLSearchParams(location.search).get("hour");
const fixedHour = fixedHourParam === null || Number.isNaN(Number(fixedHourParam)) ? null : Number(fixedHourParam);

type Vec3 = [number, number, number];

// ---------- small helpers ----------
let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hexToRgb = (hex: string): Vec3 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const toHex = (c: Vec3): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
const mixHex = (a: string, b: string, t: number): string => toHex(mix3(hexToRgb(a), hexToRgb(b), t));

// ---------- island terrain (flat shaded: every triangle owns its vertices and face normal) ----------
const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const radius = 16 + 2.4 * Math.sin(ang * 3 + 0.7) + 1.4 * Math.sin(ang * 5 + 2.1) + 0.8 * Math.cos(ang * 2 - 1);
  const t = r / radius;
  const dome = 5.4 * (1 - Math.pow(t, 2.2));
  const hills = 1.2 * Math.sin(x * 0.5 + 1) * Math.cos(z * 0.45) * clamp01(1.1 - t);
  const peak = 3.2 * Math.exp(-((x - 3) ** 2 + (z + 2.5) ** 2) / 20);
  return Math.max(-3, dome + hills + peak - 0.1);
};

const GRID = 40;
const EXTENT = 27;
const STEP = (EXTENT * 2) / GRID;
const gridX: number[] = [];
const gridY: number[] = [];
const gridZ: number[] = [];
for (let j = 0; j <= GRID; j += 1) {
  for (let i = 0; i <= GRID; i += 1) {
    const edge = i === 0 || j === 0 || i === GRID || j === GRID;
    const jx = edge ? 0 : (rand() - 0.5) * STEP * 0.7;
    const jz = edge ? 0 : (rand() - 0.5) * STEP * 0.7;
    const x = -EXTENT + i * STEP + jx;
    const z = -EXTENT + j * STEP + jz;
    gridX.push(x);
    gridZ.push(z);
    gridY.push(height(x, z));
  }
}

const palette = {
  seabed: hexToRgb("#8d7c58"),
  wetSand: hexToRgb("#c2ad78"),
  sand: hexToRgb("#e6d29a"),
  grassA: hexToRgb("#5d9a3f"),
  grassB: hexToRgb("#4f8a38"),
  grassC: hexToRgb("#6aa84a"),
  forest: hexToRgb("#3f7433"),
  rock: hexToRgb("#7d7a73"),
  rockLight: hexToRgb("#a09d96"),
  snow: hexToRgb("#eef1f4")
};

const faceColor = (avgY: number, ny: number): Vec3 => {
  if (avgY < -0.9) return palette.seabed;
  if (avgY < 0.05) return palette.wetSand;
  if (ny < 0.72 && avgY > 0.8) return rand() < 0.5 ? palette.rock : palette.rockLight;
  if (avgY < 0.75) return palette.sand;
  if (avgY > 6.6) return palette.snow;
  if (avgY > 5.2) return palette.rockLight;
  const k = rand();
  if (avgY > 3.6) return k < 0.5 ? palette.forest : palette.grassB;
  return k < 0.34 ? palette.grassA : k < 0.67 ? palette.grassB : palette.grassC;
};

const triCount = GRID * GRID * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices: number[] = [];
let tri = 0;
const pushTri = (a: number, b: number, c: number): void => {
  let ia = a, ib = b, ic = c;
  const ex1 = gridX[ib]! - gridX[ia]!, ey1 = gridY[ib]! - gridY[ia]!, ez1 = gridZ[ib]! - gridZ[ia]!;
  const ex2 = gridX[ic]! - gridX[ia]!, ey2 = gridY[ic]! - gridY[ia]!, ez2 = gridZ[ic]! - gridZ[ia]!;
  let nx = ey1 * ez2 - ez1 * ey2;
  let ny = ez1 * ex2 - ex1 * ez2;
  let nz = ex1 * ey2 - ey1 * ex2;
  if (ny < 0) {
    const t = ib; ib = ic; ic = t;
    nx = -nx; ny = -ny; nz = -nz;
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const avgY = (gridY[ia]! + gridY[ib]! + gridY[ic]!) / 3;
  const col = faceColor(avgY, ny);
  [ia, ib, ic].forEach((v, k) => {
    const o = tri * 9 + k * 3;
    positions[o] = gridX[v]!; positions[o + 1] = gridY[v]!; positions[o + 2] = gridZ[v]!;
    normals[o] = nx; normals[o + 1] = ny; normals[o + 2] = nz;
    const co = tri * 12 + k * 4;
    colors[co] = col[0]; colors[co + 1] = col[1]; colors[co + 2] = col[2]; colors[co + 3] = 1;
    indices.push(tri * 3 + k);
  });
  tri += 1;
};
for (let j = 0; j < GRID; j += 1) {
  for (let i = 0; i < GRID; i += 1) {
    const v00 = j * (GRID + 1) + i, v10 = v00 + 1, v01 = v00 + GRID + 1, v11 = v01 + 1;
    if ((i + j) % 2 === 0) {
      pushTri(v00, v01, v10);
      pushTri(v10, v01, v11);
    } else {
      pushTri(v00, v01, v11);
      pushTri(v00, v11, v10);
    }
  }
}

const terrain = geometry.custom(
  geometry.define({
    positions, normals, colors, indices,
    bounds: { min: [-EXTENT, -3.5, -EXTENT], max: [EXTENT, 10, EXTENT] }
  }),
  { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }), castShadow: true, receiveShadow: true }
);

// ---------- trees and rocks ----------
const slopeAt = (x: number, z: number): number => {
  const e = 0.8;
  return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
};
const trunks: AuraTransformSpec[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const crownColorsLow: string[] = [];
const crownColorsHigh: string[] = [];
const placed: Array<[number, number]> = [];
const treeGreens = ["#2f7a3a", "#3a8a3e", "#276b34", "#4a9444"];
for (let attempt = 0; attempt < 600 && trunks.length < 24; attempt += 1) {
  const a = rand() * Math.PI * 2;
  const d = Math.sqrt(rand()) * 17;
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  const h = height(x, z);
  if (h < 1.0 || h > 4.6 || slopeAt(x, z) > 0.6) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.6)) continue;
  placed.push([x, z]);
  const s = 0.8 + rand() * 0.6;
  const green = treeGreens[Math.floor(rand() * treeGreens.length)]!;
  trunks.push({ position: [x, h + 0.7 * s, z], scale: [0.34 * s, 1.8 * s, 0.34 * s] });
  crownsLow.push({ position: [x, h + 2.3 * s, z], scale: [2.3 * s, 2.6 * s, 2.3 * s], rotation: [0, rand() * 3, 0] });
  crownsHigh.push({ position: [x, h + 3.7 * s, z], scale: [1.6 * s, 2.2 * s, 1.6 * s], rotation: [0, rand() * 3, 0] });
  crownColorsLow.push(green);
  crownColorsHigh.push(mixHex(green, "#9bd27a", 0.18));
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
const rockTones = ["#7b7872", "#8d8a83", "#6b6862", "#9a968e"];
for (let attempt = 0; attempt < 400 && rocks.length < 12; attempt += 1) {
  const a = rand() * Math.PI * 2;
  const d = 6 + rand() * 13;
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  const h = height(x, z);
  if (h < -0.1 || h > 3.2) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({
    position: [x, h + 0.15 * s, z],
    scale: [s * (0.9 + rand() * 0.6), s * (0.6 + rand() * 0.5), s * (0.9 + rand() * 0.6)],
    rotation: [rand() * 3, rand() * 3, rand() * 3]
  });
  rockColors.push(rockTones[Math.floor(rand() * rockTones.length)]!);
}

// ---------- water: polar grid, vertex waves, flat-shaded facets, sky reflection ----------
const RINGS = 47;
const SEGMENTS = 72;
const ringRadius = (i: number): number => (i <= 24 ? i * 2 : 48 * Math.pow(1.12, i - 24));
const waterPositions = new Float32Array((RINGS + 1) * SEGMENTS * 3);
const waterNormals = new Float32Array(waterPositions.length);
const waterIndices: number[] = [];
for (let i = 0; i <= RINGS; i += 1) {
  for (let s = 0; s < SEGMENTS; s += 1) {
    const v = i * SEGMENTS + s;
    const ang = (s / SEGMENTS) * Math.PI * 2;
    waterPositions[v * 3] = Math.cos(ang) * ringRadius(i);
    waterPositions[v * 3 + 2] = Math.sin(ang) * ringRadius(i);
    waterNormals[v * 3 + 1] = 1;
    if (i < RINGS) {
      const sn = (s + 1) % SEGMENTS;
      const a = v, b = i * SEGMENTS + sn, c = (i + 1) * SEGMENTS + s, d = (i + 1) * SEGMENTS + sn;
      // winding: upward facing (ccw seen from +y)
      waterIndices.push(a, c, b, b, c, d);
    }
  }
}
const WATER_R = ringRadius(RINGS);

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
float waveH(vec2 p, float t) {
  return sin(dot(p, vec2(0.55, 0.20)) + t * 1.3) * 0.17
       + sin(dot(p, vec2(-0.30, 0.78)) + t * 1.7) * 0.11
       + sin(dot(p, vec2(0.95, -0.85)) + t * 2.4) * 0.06;
}
void main() {
  vec3 p = position;
  p.y = waveH(p.xz, waveClock);
  vPos = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float crest = smoothstep(0.12, 0.3, vPos.y);
  vec3 body = mix(waterDeep, waterShallow, clamp(vPos.y * 2.5 + 0.45, 0.0, 1.0));
  vec3 lit = body * (ambientCol + lightCol * max(dot(n, lightDir), 0.0));
  vec3 col = mix(lit, skyCol, clamp(fres * 0.65 + 0.06, 0.0, 1.0));
  float spec = pow(max(dot(reflect(-lightDir, n), v), 0.0), 60.0);
  col += lightCol * spec * 0.9;
  col += (ambientCol * 0.5 + lightCol * 0.4) * crest * 0.35;
  float dist = length(vPos.xz - cameraPosition.xz);
  col = mix(col, skyCol, smoothstep(160.0, 520.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    lightDir: { type: "vec3", value: [0.4, 0.8, 0.3] },
    lightCol: { type: "vec3", value: [1, 0.95, 0.85] },
    ambientCol: { type: "vec3", value: [0.5, 0.55, 0.6] },
    skyCol: { type: "vec3", value: [0.66, 0.78, 0.9] },
    waterDeep: { type: "vec3", value: [0.03, 0.26, 0.42] },
    waterShallow: { type: "vec3", value: [0.1, 0.55, 0.62] }
  },
  castShadow: false
});

// ---------- sun, moon and sky ----------
const sunAt = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 62,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirTo = (elevationDeg: number, azimuthDeg: number): Vec3 => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaleVec = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

const hourStart = fixedHour ?? START_HOUR;
const s0 = sunAt(hourStart);

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "fill", skyColor: "#bcd7ff", groundColor: "#4d5a3c", intensity: 0.9 }).runtime({ id: "fill", mutable: true }))
    .add(lights.directional({ name: "sun", position: scaleVec(dirTo(s0.elevationDeg, s0.azimuthDeg), 45), target: [0, 0, 0], intensity: 4, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: scaleVec(dirTo(-s0.elevationDeg, s0.azimuthDeg + 180), 45), target: [0, 0, 0], intensity: 0.1, color: "#9db8ff" }).runtime({ id: "moon", mutable: true }))
    .add(terrain)
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crownsLow", transforms: crownsLow, colors: crownColorsLow, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crownsHigh", transforms: crownsHigh, colors: crownColorsHigh, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.polyhedron({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }), params: { variant: "dodecahedron", detail: 0 } }))
    .add(
      geometry.custom(
        geometry.define({
          positions: waterPositions, normals: waterNormals, indices: waterIndices,
          bounds: { min: [-WATER_R, -1, -WATER_R], max: [WATER_R, 1, WATER_R] }
        }),
        { name: "water", material: water, castShadow: false, receiveShadow: false }
      ).runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 21, 38], target: [0, 1.5, 0], fov: 45, near: 0.5, far: 1500 }))
});

const startMs = performance.now();
let handles: ReturnType<typeof getHandles> | null = null;

function getHandles() {
  return {
    sun: app.nodes.require("sun"),
    moon: app.nodes.require("moon"),
    fill: app.nodes.require("fill"),
    water: app.nodes.require("water")
  };
}

const NIGHT_HORIZON = "#0b1430";
const DAY_HORIZON = "#b4d2ee";
const DUSK_HORIZON = "#f2a470";

app.onFrame(() => {
  handles ??= getHandles();
  const t = (performance.now() - startMs) / 1000;
  const hour = fixedHour ?? (START_HOUR + (t / DAY_SECONDS) * 24) % 24;
  const s = sunAt(hour);
  const e = s.elevationDeg;
  const dayF = smoothstep(-5, 14, e);
  const glow = Math.exp(-((e / 9) ** 2)) * (1 - 0.4 * (e < 0 ? 1 : 0));
  const low = 1 - smoothstep(6, 38, e);

  const sunDir = dirTo(e, s.azimuthDeg);
  const moonDir = dirTo(-e, s.azimuthDeg + 180);
  const sunColor = mixHex("#fff3dc", "#ff8e4a", low);
  const sunIntensity = 4.2 * smoothstep(-3, 12, e);
  const moonIntensity = 1.1 * (1 - dayF);

  handles.sun.setPosition(...scaleVec(sunDir, 45));
  handles.moon.setPosition(...scaleVec(moonDir, 45));
  handles.sun.setLight?.({ color: sunColor, intensity: sunIntensity });
  handles.moon.setLight?.({ color: "#9db8ff", intensity: moonIntensity });
  handles.fill.setLight?.({
    color: mixHex("#3b4f8c", mixHex("#bcd7ff", "#ffc9a0", glow * 0.6), dayF),
    intensity: 0.5 + 0.55 * dayF
  });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  // water follows the same light
  const dayWeight = smoothstep(-3, 12, e);
  const lightDir = dayWeight > 0.02 ? sunDir : moonDir;
  const sunRgb = scaleVec(hexToRgb(sunColor), sunIntensity * 0.32);
  const moonRgb = scaleVec(hexToRgb("#9db8ff"), moonIntensity * 0.35);
  const lightRgb: Vec3 = dayWeight > 0.02 ? sunRgb : moonRgb;
  const horizon = mix3(
    hexToRgb(NIGHT_HORIZON),
    mix3(hexToRgb(DAY_HORIZON), hexToRgb(DUSK_HORIZON), clamp01(glow * 0.75)),
    dayF
  );
  const ambient = mix3([0.16, 0.2, 0.34], [0.5, 0.56, 0.62], dayF);
  handles.water
    .setUniform?.("waveClock", t)
    .setUniform?.("lightDir", lightDir)
    .setUniform?.("lightCol", lightRgb)
    .setUniform?.("ambientCol", ambient)
    .setUniform?.("skyCol", horizon);

  // slow orbit around the island
  const ang = t * 0.1;
  const radius = 41;
  app.camera?.setPose({ position: [Math.sin(ang) * radius * 0.93, 21, Math.cos(ang) * radius], target: [0, 1.5, 0] }, { cut: true });
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
});
