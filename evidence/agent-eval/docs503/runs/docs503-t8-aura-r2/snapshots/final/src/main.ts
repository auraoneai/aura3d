import {
  camera,
  createAuraApp,
  environments,
  geometry,
  interactions,
  lights,
  material,
  scene,
  sky
} from "@aura3d/engine";

type V3 = [number, number, number];

// ---------------------------------------------------------------- helpers
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: V3): string => {
  const h = (v: number): string => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
};

// ---------------------------------------------------------------- island height field
// The same formula is repeated in the water fragment shader (shore foam). Keep both in sync.
const noise = (x: number, z: number): number => 0.9 * Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.38) + 0.6 * Math.sin(x * 0.9 + z * 0.7);
function islandHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const d = r / 12 + 0.04 * noise(x, z);
  const base = 5.6 * (1 - d * d) - 1.4;
  const hills = 1.2 * Math.sin(x * 0.5) * Math.sin(z * 0.45 + 0.7) * clamp01(1 - d);
  const peak = 2.4 * Math.exp(-((x + 2.5) * (x + 2.5) + (z - 1.5) * (z - 1.5)) / 14);
  return Math.max(base + hills + peak, -3.5);
}

// ---------------------------------------------------------------- flat-shaded mesh builder
class FlatMesh {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];

  /** Adds one triangle with a face normal. `ref` is an interior point used to face the normal outward; without it the normal points up. */
  tri(a: V3, b: V3, c: V3, col: V3, ref?: V3): void {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-6) return;
    nx /= len; ny /= len; nz /= len;
    let flip: boolean;
    if (ref) {
      const cx = (a[0] + b[0] + c[0]) / 3 - ref[0];
      const cy = (a[1] + b[1] + c[1]) / 3 - ref[1];
      const cz = (a[2] + b[2] + c[2]) / 3 - ref[2];
      flip = nx * cx + ny * cy + nz * cz < 0;
    } else {
      flip = ny < 0;
    }
    let p1 = b, p2 = c;
    if (flip) { p1 = c; p2 = b; nx = -nx; ny = -ny; nz = -nz; }
    for (const p of [a, p1, p2]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(col[0], col[1], col[2], 1);
    }
  }

  /** Cone with `seg` sides, base centre (x, y, z). */
  cone(x: number, y: number, z: number, radius: number, height: number, seg: number, col: V3, spin: number): void {
    const apex: V3 = [x, y + height, z];
    const ref: V3 = [x, y + height * 0.3, z];
    for (let i = 0; i < seg; i += 1) {
      const a0 = spin + (i / seg) * Math.PI * 2;
      const a1 = spin + ((i + 1) / seg) * Math.PI * 2;
      const shade = 0.88 + rand() * 0.2;
      this.tri(apex, [x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius], [x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius],
        [col[0] * shade, col[1] * shade, col[2] * shade], ref);
    }
  }

  /** Straight prism (trunk). */
  prism(x: number, y: number, z: number, radius: number, height: number, seg: number, col: V3): void {
    const ref: V3 = [x, y + height / 2, z];
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0: V3 = [x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius];
      const p1: V3 = [x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius];
      const q0: V3 = [p0[0], y + height, p0[2]];
      const q1: V3 = [p1[0], y + height, p1[2]];
      const shade = 0.9 + rand() * 0.15;
      const c: V3 = [col[0] * shade, col[1] * shade, col[2] * shade];
      this.tri(p0, p1, q1, c, ref);
      this.tri(p0, q1, q0, c, ref);
    }
  }

  /** Lumpy icosahedron (rock). */
  rock(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: V3): void {
    const t = (1 + Math.sqrt(5)) / 2;
    const base: V3[] = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ];
    const verts = base.map((v): V3 => {
      const l = Math.hypot(v[0], v[1], v[2]);
      const j = 0.78 + rand() * 0.4;
      return [cx + (v[0] / l) * sx * j, cy + (v[1] / l) * sy * j, cz + (v[2] / l) * sz * j];
    });
    const faces: Array<[number, number, number]> = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    const ref: V3 = [cx, cy, cz];
    for (const [a, b, c] of faces) {
      const shade = 0.82 + rand() * 0.3;
      this.tri(verts[a] as V3, verts[b] as V3, verts[c] as V3, [col[0] * shade, col[1] * shade, col[2] * shade], ref);
    }
  }

  build(bounds: { min: V3; max: V3 }) {
    const count = this.positions.length / 3;
    const indices: number[] = new Array<number>(count);
    for (let i = 0; i < count; i += 1) indices[i] = i;
    return geometry.define({
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      indices,
      bounds
    });
  }
}

// ---------------------------------------------------------------- terrain (polar grid, jittered, flat shaded)
const SAND: V3 = [0.86, 0.76, 0.5];
const SEABED: V3 = [0.36, 0.55, 0.52];
const GRASS_A: V3 = [0.27, 0.56, 0.2];
const GRASS_B: V3 = [0.4, 0.66, 0.24];
const ROCK: V3 = [0.48, 0.43, 0.39];
const SNOW: V3 = [0.93, 0.95, 0.99];

function terrainColor(h: number): V3 {
  let c: V3;
  if (h < -0.9) c = SEABED;
  else if (h < 0.5) c = mix3(SEABED, SAND, smoothstep(-0.9, -0.2, h));
  else if (h < 3.3) c = mix3(GRASS_A, GRASS_B, rand());
  else if (h < 4.6) c = mix3(GRASS_A, ROCK, smoothstep(3.3, 3.9, h));
  else c = mix3(ROCK, SNOW, smoothstep(4.6, 5.6, h));
  const s = 0.93 + rand() * 0.14;
  return [c[0] * s, c[1] * s, c[2] * s];
}

function buildTerrain() {
  const RINGS = 20, SECT = 44, RADIUS = 16;
  const grid: V3[][] = [];
  for (let i = 0; i <= RINGS; i += 1) {
    const row: V3[] = [];
    const jitterR = i > 0 && i < RINGS ? (rand() - 0.5) * 0.5 : 0;
    for (let j = 0; j < SECT; j += 1) {
      if (i === 0) { row.push([0, islandHeight(0, 0), 0]); continue; }
      const r = (i / RINGS) * RADIUS + jitterR + (i < RINGS ? (rand() - 0.5) * 0.35 : 0);
      const a = ((j + (i % 2) * 0.5 + (rand() - 0.5) * 0.4) / SECT) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const taper = Math.max(0, r - 13) * 2; // sinks the outer rim so the disc edge never shows through the water
      row.push([x, islandHeight(x, z) + (rand() - 0.5) * 0.35 - taper, z]);
    }
    grid.push(row);
  }
  const mesh = new FlatMesh();
  for (let i = 0; i < RINGS; i += 1) {
    for (let j = 0; j < SECT; j += 1) {
      const j1 = (j + 1) % SECT;
      const a = (grid[i] as V3[])[j] as V3;
      const b = (grid[i] as V3[])[j1] as V3;
      const c = (grid[i + 1] as V3[])[j1] as V3;
      const d = (grid[i + 1] as V3[])[j] as V3;
      mesh.tri(a, b, c, terrainColor((a[1] + b[1] + c[1]) / 3));
      mesh.tri(a, c, d, terrainColor((a[1] + c[1] + d[1]) / 3));
    }
  }
  return mesh.build({ min: [-17, -12, -17], max: [17, 9, 17] });
}

// ---------------------------------------------------------------- trees and rocks (one mesh)
function buildProps() {
  const mesh = new FlatMesh();
  const placed: Array<[number, number]> = [];
  for (let attempt = 0; attempt < 600 && placed.length < 20; attempt += 1) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 10;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = islandHeight(x, z);
    if (h < 0.9 || h > 3.7) continue;
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.8)) continue;
    placed.push([x, z]);
    const s = 0.8 + rand() * 0.55;
    const spin = rand() * 3;
    const y = h - 0.2;
    mesh.prism(x, y, z, 0.14 * s, 0.9 * s, 6, [0.42, 0.28, 0.17]);
    mesh.cone(x, y + 0.45 * s, z, 1.0 * s, 1.5 * s, 6, [0.13, 0.42, 0.24], spin);
    mesh.cone(x, y + 1.15 * s, z, 0.78 * s, 1.35 * s, 6, [0.17, 0.5, 0.27], spin + 0.4);
    mesh.cone(x, y + 1.8 * s, z, 0.52 * s, 1.2 * s, 6, [0.24, 0.58, 0.3], spin + 0.8);
  }
  let rocks = 0;
  for (let attempt = 0; attempt < 600 && rocks < 12; attempt += 1) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = islandHeight(x, z);
    if (h < -0.8 || h > 4.8) continue;
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.2)) continue;
    rocks += 1;
    const s = 0.35 + rand() * 0.6;
    mesh.rock(x, h + 0.05 * s, z, s * 1.1, s * 0.75, s, mix3([0.52, 0.5, 0.5], [0.4, 0.37, 0.36], rand()));
  }
  return mesh.build({ min: [-14, -2, -14], max: [14, 9, 14] });
}

// ---------------------------------------------------------------- water (denser near the island, flat-shaded in the fragment shader)
function buildWater() {
  const N = 96, EXTENT = 220;
  const positions = new Float32Array((N + 1) * (N + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  const map = (i: number): number => {
    const u = (i / N) * 2 - 1;
    const m = Math.abs(u);
    return Math.sign(u) * EXTENT * (0.25 * m + 0.75 * m * m * m);
  };
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const v = j * (N + 1) + i;
      positions.set([map(i), 0, map(j)], v * 3);
      normals[v * 3 + 1] = 1;
      if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
    }
  }
  return geometry.define({ positions, normals, indices, bounds: { min: [-EXTENT, -1, -EXTENT], max: [EXTENT, 1, EXTENT] } });
}

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vec3 p = position;
  float t = waveClock;
  float taper = 1.0 - smoothstep(30.0, 90.0, length(p.xz));
  p.y = (0.11 * sin(p.x * 0.9 + t * 1.3) + 0.09 * sin(p.z * 1.2 - t * 1.7) + 0.07 * sin((p.x + p.z) * 1.7 + t * 2.3)) * taper;
  vPos = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;

float islandNoise(vec2 q) {
  return 0.9 * sin(q.x * 0.45 + 1.3) * cos(q.y * 0.38) + 0.6 * sin(q.x * 0.9 + q.y * 0.7);
}
float islandH(vec2 q) {
  float r = length(q);
  float d = r / 12.0 + 0.04 * islandNoise(q);
  float base = 5.6 * (1.0 - d * d) - 1.4;
  float hills = 1.2 * sin(q.x * 0.5) * sin(q.y * 0.45 + 0.7) * clamp(1.0 - d, 0.0, 1.0);
  vec2 pk = q - vec2(-2.5, 1.5);
  float peak = 2.4 * exp(-dot(pk, pk) / 14.0);
  return max(base + hills + peak, -3.5);
}

void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  float dist = length(cameraPosition - vPos);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);

  float tone = clamp(vPos.y * 3.0 + 0.5, 0.0, 1.0);
  vec3 body = mix(deepCol, shallowCol, tone * 0.6 + 0.15);
  body += sunColW * 0.10 * max(dot(n, sunDirW), 0.0) + moonColW * 0.12 * max(dot(n, moonDirW), 0.0);
  vec3 col = mix(body, horizonCol, clamp(fres * 0.85 + 0.05, 0.0, 1.0));

  float glintSun = pow(max(dot(reflect(-sunDirW, n), v), 0.0), 70.0);
  float glintMoon = pow(max(dot(reflect(-moonDirW, n), v), 0.0), 70.0);
  col += sunColW * glintSun * 1.6 + moonColW * glintMoon * 1.2;

  vec3 foamCol = vec3(0.92, 0.96, 1.0) * (0.22 + 0.78 * lightAmt);
  float sh = islandH(vPos.xz) + 0.12 * sin(waveClock * 1.6 + length(vPos.xz) * 2.2);
  float shore = smoothstep(-0.75, -0.2, sh);
  float stripes = 0.65 + 0.35 * step(0.5, fract(length(vPos.xz) * 1.7 - waveClock * 0.35));
  float crest = smoothstep(0.17, 0.23, vPos.y);
  col = mix(col, foamCol, clamp(shore * stripes * 0.8 + crest * 0.6, 0.0, 1.0));

  float far = smoothstep(55.0, 190.0, dist);
  col = mix(col, horizonCol, far);
  float alpha = mix(0.84, 1.0, max(far, fres));
  alpha = mix(alpha, 1.0, shore * 0.5);
  outColor = vec4(col, alpha);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    lightAmt: { type: "f32", value: 1 },
    sunDirW: { type: "vec3", value: [0, 1, 0] },
    sunColW: { type: "vec3", value: [1, 1, 1] },
    moonDirW: { type: "vec3", value: [0, -1, 0] },
    moonColW: { type: "vec3", value: [0, 0, 0] },
    deepCol: { type: "vec3", value: [0.03, 0.25, 0.42] },
    shallowCol: { type: "vec3", value: [0.12, 0.58, 0.62] },
    horizonCol: { type: "vec3", value: [0.62, 0.78, 0.92] }
  },
  transparent: true,
  depthWrite: false,
  fog: false
});

// ---------------------------------------------------------------- day / night state
const CYCLE_SECONDS = 20;
const PHASE_START = 0.7; // start in the morning, sun already up and rising

const SUN_WARM: V3 = [1.0, 0.55, 0.28];
const SUN_WHITE: V3 = [1.0, 0.95, 0.84];
const MOON_COL: V3 = [0.55, 0.68, 1.0];
const HORIZON_NIGHT: V3 = [0.03, 0.05, 0.12];
const HORIZON_DAY: V3 = [0.62, 0.78, 0.92];
const HORIZON_DUSK: V3 = [0.95, 0.55, 0.35];
const DEEP_NIGHT: V3 = [0.008, 0.025, 0.06];
const DEEP_DAY: V3 = [0.03, 0.25, 0.42];
const SHALLOW_NIGHT: V3 = [0.02, 0.07, 0.12];
const SHALLOW_DAY: V3 = [0.12, 0.58, 0.62];
const HEMI_NIGHT: V3 = [0.28, 0.36, 0.63];
const HEMI_DAY: V3 = [0.81, 0.89, 1.0];

const toVec = (elevDeg: number, azDeg: number): V3 => {
  const e = (elevDeg * Math.PI) / 180, a = (azDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaled = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];

function dayState(t: number) {
  const phase = PHASE_START + (t / CYCLE_SECONDS) * Math.PI * 2;
  const elev = 52 * Math.sin(phase) + 10; // degrees; day lasts a little over half the cycle
  const az = 100 + (phase * 180) / Math.PI;
  const dayF = smoothstep(-8, 14, elev);
  const twilight = Math.exp(-(((elev - 2) / 10) ** 2));
  const sunS = smoothstep(-1, 12, elev);
  const moonS = smoothstep(-1, 12, -elev) * 0.8;
  const sunDir = toVec(elev, az);
  const moonDir = toVec(-elev, az + 180);
  const sunColor = mix3(SUN_WARM, SUN_WHITE, smoothstep(3, 30, elev));
  const horizon = mix3(mix3(HORIZON_NIGHT, HORIZON_DAY, dayF), HORIZON_DUSK, twilight * 0.7);
  return {
    elev, az, dayF, sunDir, moonDir, sunColor, sunS, moonS, horizon,
    sunIntensity: 3.2 * sunS,
    moonIntensity: 0.7 * moonS,
    hemiIntensity: 0.3 + 0.55 * dayF,
    hemiColor: mix3(HEMI_NIGHT, HEMI_DAY, dayF),
    deep: mix3(DEEP_NIGHT, DEEP_DAY, dayF),
    shallow: mix3(SHALLOW_NIGHT, SHALLOW_DAY, dayF),
    lightAmt: 0.2 + 0.8 * dayF
  };
}

const LIGHT_DISTANCE = 40;
const s0 = dayState(0);

// ---------------------------------------------------------------- scene
const app = createAuraApp("#app", {
  resize: false,
  scene: scene({ background: hex(s0.horizon) })
    .add(sky.preetham({ sun: { elevationDeg: s0.elev, azimuthDeg: s0.az, intensity: 1 }, stars: { count: 700 }, captureEnvironment: false }))
    .add(environments.neutral({ intensity: 0.25, background: false }))
    .add(lights.hemisphere({ name: "hemi", skyColor: hex(s0.hemiColor), groundColor: "#3d4a35", intensity: s0.hemiIntensity }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({
      name: "sun",
      position: scaled(s0.sunDir, LIGHT_DISTANCE),
      target: [0, 0, 0],
      intensity: s0.sunIntensity,
      color: hex(s0.sunColor),
      shadow: true
    }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({
      name: "moon",
      position: scaled(s0.moonDir, LIGHT_DISTANCE),
      target: [0, 0, 0],
      intensity: Math.max(s0.moonIntensity, 0.001),
      color: "#8fb0ff"
    }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(buildTerrain(), { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(geometry.custom(buildProps(), { name: "props", material: material.pbr({ color: "#ffffff", roughness: 0.9 }) }))
    .add(geometry.custom(buildWater(), { name: "water", material: waterMaterial, castShadow: false }).runtime({ id: "water", mutable: true }))
    .add(interactions.orbit({ target: [0, 2.5, 0], position: [0, 8, 24], autoRotate: 0.12 }))
    .camera(camera.orbit({ position: [0, 8, 24], target: [0, 2.5, 0], fov: 45, near: 0.5, far: 600 }))
});

const startMs = performance.now();
let frameCount = 0;
let ready = false;

function update(): void {
  const t = (performance.now() - startMs) / 1000;
  const s = dayState(t);

  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", t);
  water.setUniform?.("lightAmt", s.lightAmt);
  water.setUniform?.("sunDirW", s.sunDir);
  water.setUniform?.("sunColW", scaled(s.sunColor, s.sunS));
  water.setUniform?.("moonDirW", s.moonDir);
  water.setUniform?.("moonColW", scaled(MOON_COL, s.moonS));
  water.setUniform?.("deepCol", s.deep);
  water.setUniform?.("shallowCol", s.shallow);
  water.setUniform?.("horizonCol", s.horizon);

  const sun = app.nodes.require("sun");
  sun.setPosition(...scaled(s.sunDir, LIGHT_DISTANCE));
  sun.setLight?.({ intensity: s.sunIntensity, color: hex(s.sunColor) });
  sun.setVisible(s.sunIntensity > 0.02);

  const moon = app.nodes.require("moon");
  moon.setPosition(...scaled(s.moonDir, LIGHT_DISTANCE));
  moon.setLight?.({ intensity: s.moonIntensity });
  moon.setVisible(s.moonIntensity > 0.02);

  app.nodes.require("hemi").setLight?.({ intensity: s.hemiIntensity, color: hex(s.hemiColor) });

  if (frameCount % 2 === 0) {
    app.atmosphere?.setSky({
      model: "preetham",
      sun: { elevationDeg: Math.max(s.elev, -30), azimuthDeg: s.az, intensity: 1 },
      stars: { count: 700 }
    });
  }
  frameCount += 1;
}

let warned = false;
const markReady = (): void => {
  if (ready) return;
  ready = true;
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
};

app.onFrame(() => {
  try {
    update();
  } catch (err) {
    if (!warned) { warned = true; console.error("day/night update failed", err); }
  }
  markReady();
});

app.ready().then(markReady, (err: unknown) => console.error("app.ready failed", err));
