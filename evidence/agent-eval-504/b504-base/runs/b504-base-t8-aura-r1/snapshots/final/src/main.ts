import { camera, createAuraApp, geometry, instances, lights, material, scene, sky, type AuraTransformSpec, type AuraVec3 } from "@aura3d/engine";

// Low-poly island with animated custom-shader water and a 20 second day/night cycle.
const DAY_SECONDS = 20;
const START_HOUR = 9;

// ---------- helpers ----------
let seed = 1234;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: AuraVec3, b: AuraVec3, t: number): AuraVec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hexToRgb = (hex: string): AuraVec3 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const toHex = (c: AuraVec3): string =>
  "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
const mixHex = (a: string, b: string, t: number): string => toHex(mix3(hexToRgb(a), hexToRgb(b), t));

// ---------- terrain ----------
const CELLS = 38;
const SIZE = 42;
const RADIUS = 17;

const height = (x: number, z: number): number => {
  const theta = Math.atan2(z, x);
  const r = Math.hypot(x, z) / (RADIUS * (1 + 0.16 * Math.sin(3 * theta + 1) + 0.09 * Math.sin(5 * theta + 2)));
  const dome = 4.6 * (1 - r * r) - 0.4;
  const bumps = 0.8 * Math.sin(x * 0.55 + 1) * Math.cos(z * 0.47) + 0.45 * Math.sin(x * 0.95 + z * 0.8);
  const falloff = clamp01(1.3 - r); // bumps fade out at sea
  return Math.max(-2.5, dome + bumps * falloff);
};

type V3 = [number, number, number];
const grid: V3[] = [];
for (let j = 0; j <= CELLS; j += 1) {
  for (let i = 0; i <= CELLS; i += 1) {
    const cell = SIZE / CELLS;
    const edge = i === 0 || j === 0 || i === CELLS || j === CELLS;
    const x = (i / CELLS - 0.5) * SIZE + (edge ? 0 : (rand() - 0.5) * cell * 0.7);
    const z = (j / CELLS - 0.5) * SIZE + (edge ? 0 : (rand() - 0.5) * cell * 0.7);
    grid.push([x, height(x, z), z]);
  }
}

const triCount = CELLS * CELLS * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices: number[] = [];
let tri = 0;
const colorFor = (h: number): [number, number, number] => {
  const jitter = 0.9 + rand() * 0.2;
  let c: [number, number, number];
  if (h < -0.6) c = [0.42, 0.45, 0.4];       // sea floor
  else if (h < 0.5) c = [0.9, 0.78, 0.5];    // sand
  else if (h < 2.5) c = [0.28, 0.6, 0.2];    // grass
  else if (h < 3.6) c = [0.45, 0.4, 0.34];   // rock
  else c = [0.78, 0.78, 0.8];                // summit
  return [c[0] * jitter, c[1] * jitter, c[2] * jitter];
};
const pushTri = (a: V3, b: V3, c: V3): void => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const col = colorFor((a[1] + b[1] + c[1]) / 3);
  [a, b, c].forEach((p, k) => {
    const o = tri * 3 + k;
    positions.set(p, o * 3);
    normals.set([nx, ny, nz], o * 3);
    colors.set([col[0], col[1], col[2], 1], o * 4);
    indices.push(o);
  });
  tri += 1;
};
const W = CELLS + 1;
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const p00 = grid[j * W + i]!, p10 = grid[j * W + i + 1]!, p01 = grid[(j + 1) * W + i]!, p11 = grid[(j + 1) * W + i + 1]!;
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
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
for (let tries = 0; tries < 600 && trunks.length < 24; tries += 1) {
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * RADIUS;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = height(x, z);
  if (h < 0.9 || h > 3.0) continue;
  const s = 0.7 + rand() * 0.45;
  trunks.push({ position: [x, h + 0.7 * s, z], scale: [0.32 * s, 1.6 * s, 0.32 * s] });
  crownsLow.push({ position: [x, h + 2.2 * s, z], scale: [2.1 * s, 2.4 * s, 2.1 * s] });
  crownsHigh.push({ position: [x, h + 3.5 * s, z], scale: [1.5 * s, 2.0 * s, 1.5 * s] });
}
for (let tries = 0; tries < 600 && rocks.length < 14; tries += 1) {
  const a = rand() * Math.PI * 2, r = (0.35 + rand() * 0.8) * RADIUS;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = height(x, z);
  if (h < -0.5 || h > 3.8) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({
    position: [x, h + 0.15 * s, z],
    rotation: [rand() * 3, rand() * 6, rand() * 3],
    scale: [s * (1 + rand() * 0.5), s * 0.7, s * (1 + rand() * 0.5)]
  });
}

// ---------- water ----------
const WN = 160;
const WSIZE = 320;
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

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vSunDir;
out vec3 vSunCol;
out vec3 vAmb;
out vec3 vHorizon;
out vec3 vDeep;
out vec3 vShallow;
float waveH(vec2 p, float t) {
  return sin(dot(p, vec2(0.55, 0.30)) + t * 1.3) * 0.16
       + sin(dot(p, vec2(-0.32, 0.50)) + t * 1.7) * 0.12
       + sin(dot(p, vec2(0.80, -0.65)) + t * 2.3) * 0.06;
}
void main() {
  vec3 p = vec3(position.x, waveH(position.xz, waveClock), position.z);
  vPos = p;
  vSunDir = normalize(lightDir);
  vSunCol = lightCol;
  vAmb = ambCol;
  vHorizon = horizonCol;
  vDeep = deepCol;
  vShallow = shallowCol;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vSunDir;
in vec3 vSunCol;
in vec3 vAmb;
in vec3 vHorizon;
in vec3 vDeep;
in vec3 vShallow;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  float shore = 1.0 - smoothstep(13.0, 32.0, length(vPos.xz));
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float diff = max(dot(n, vSunDir), 0.0);
  vec3 body = mix(vDeep, vShallow, shore) * (vAmb + vSunCol * diff * 0.8);
  float spec = pow(max(dot(reflect(-vSunDir, n), v), 0.0), 50.0);
  vec3 col = mix(body, vHorizon, clamp(fres * 0.7, 0.0, 1.0)) + vSunCol * spec * 1.2;
  float fade = smoothstep(70.0, 150.0, length(vPos - cameraPosition));
  outColor = vec4(mix(col, vHorizon, fade), 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    lightDir: { type: "vec3", value: [0, 1, 0] },
    lightCol: { type: "vec3", value: [1, 1, 1] },
    ambCol: { type: "vec3", value: [0.5, 0.5, 0.5] },
    horizonCol: { type: "vec3", value: [0.7, 0.8, 0.9] },
    deepCol: { type: "vec3", value: [0.04, 0.3, 0.45] },
    shallowCol: { type: "vec3", value: [0.15, 0.62, 0.66] }
  }
});

// ---------- day/night ----------
const sunAngles = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 65,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirFrom = (elevationDeg: number, azimuthDeg: number): AuraVec3 => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaled = (d: AuraVec3, k: number): AuraVec3 => [d[0] * k, d[1] * k, d[2] * k];

const s0 = sunAngles(START_HOUR);
const SKY_STARS = { count: 700 };

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: SKY_STARS }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#3d4a30", intensity: 1.1 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.ambient({ color: "#6070a0", intensity: 0.22 }))
    .add(lights.directional({ name: "sun", position: scaled(dirFrom(s0.elevationDeg, s0.azimuthDeg), 45), target: [0, 0, 0], intensity: 3.6, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: scaled(dirFrom(-s0.elevationDeg, s0.azimuthDeg + 180), 45), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -3, -SIZE / 2], max: [SIZE / 2, 6, SIZE / 2] } }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }) }
    ))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crownsLow", transforms: crownsLow, material: material.pbr({ color: "#2f8a3c", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crownsHigh", transforms: crownsHigh, material: material.pbr({ color: "#3ca04a", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#8a8780", roughness: 1 }), params: { widthSegments: 5, heightSegments: 3 } }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: waterMaterial, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .camera(camera.perspective({ position: [0, 10.5, 38], target: [0, 1.5, 0], fov: 55, near: 0.5, far: 500 }))
});

const start = performance.now();
const update = (): void => {
  const t = (performance.now() - start) / 1000;
  const hour = (START_HOUR + (t / DAY_SECONDS) * 24) % 24;
  const s = sunAngles(hour);
  const elev = s.elevationDeg;
  const day = smoothstep(-6, 14, elev);                     // 0 night, 1 day
  const twilight = Math.exp(-(((elev - 3) / 10) ** 2));     // warm tint near the horizon
  const sunVis = smoothstep(-3, 10, elev);
  const sunDirV = dirFrom(elev, s.azimuthDeg);
  const moonDirV = dirFrom(-elev, s.azimuthDeg + 180);
  const moonLevel = smoothstep(-6, 10, -elev);

  const sunColor = mixHex("#ff9a55", "#fff1d6", smoothstep(2, 30, elev));
  const nodes = app.nodes;
  nodes.require("sun").setLight?.({ position: scaled(sunDirV, 45), color: sunColor, intensity: 3.6 * sunVis });
  nodes.require("moon").setLight?.({ position: scaled(moonDirV, 45), intensity: 0.15 + 0.85 * moonLevel * (1 - day) });
  nodes.require("hemi").setLight?.({ color: mixHex("#3a4f8a", mixHex("#b8d0f0", "#ffc9a0", twilight * 0.5), day), intensity: mix(0.6, 1.1, day) });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  // water follows the dominant light (sun by day, moon by night)
  const sunRgb = hexToRgb(sunColor);
  const lightDirV = elev > -2 ? sunDirV : moonDirV;
  const lightColV: AuraVec3 = elev > -2
    ? [sunRgb[0] * sunVis, sunRgb[1] * sunVis, sunRgb[2] * sunVis]
    : [0.35 * moonLevel, 0.45 * moonLevel, 0.8 * moonLevel];
  const horizonDay = mix3(hexToRgb("#b9d3ea"), hexToRgb("#f2a877"), twilight * 0.8);
  const horizon = mix3(hexToRgb("#10182e"), horizonDay, day);
  const water = nodes.require("water");
  water.setUniform?.("waveClock", t);
  water.setUniform?.("lightDir", [lightDirV[0], Math.max(lightDirV[1], 0.05), lightDirV[2]]);
  water.setUniform?.("lightCol", lightColV);
  const ambLevel = mix(0.95, 0.6, day);
  water.setUniform?.("ambCol", [ambLevel, ambLevel, ambLevel]);
  water.setUniform?.("horizonCol", horizon);
  water.setUniform?.("deepCol", mix3([0.05, 0.1, 0.24], [0.04, 0.3, 0.45], day));
  water.setUniform?.("shallowCol", mix3([0.1, 0.2, 0.34], [0.15, 0.62, 0.66], day));

  // slow orbit above the water
  const ang = 0.4 + t * 0.05;
  app.camera?.setPose({ position: [Math.sin(ang) * 38, 10.5, Math.cos(ang) * 38], target: [0, 1.5, 0] });
};
app.onFrame(update);

await app.ready();
update();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
});
