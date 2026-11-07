import {
  camera,
  createAuraApp,
  geometry,
  interactions,
  lights,
  material,
  scene,
  sky
} from "@aura3d/engine";

// Stylized low-poly island: flat-shaded faceted terrain, pine trees and rocks built from code,
// a custom animated water shader and a 20 second day/night cycle driving sky, sun, moon and water.

type V3 = [number, number, number];

const CYCLE_SECONDS = 20;
const PHASE0 = 0.6; // start in the morning, sun already up
const ISLAND_R = 14;

// ---------- small math helpers ----------
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const norm3 = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const hex = (c: V3): string => {
  const h = (x: number): string => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
};
const dirFromAngles = (elevationDeg: number, azimuthDeg: number): V3 => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};

let seed = 20240607;
const rand = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

// ---------- flat-shaded mesh builder ----------
class MeshBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];

  /** Adds a triangle with a face normal. The winding is fixed so the normal points away from `ref`. */
  tri(a: V3, b: V3, c: V3, color: V3, ref: V3): void {
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    let p2 = b;
    let p3 = c;
    if (n[0] * (cx - ref[0]) + n[1] * (cy - ref[1]) + n[2] * (cz - ref[2]) < 0) {
      p2 = c;
      p3 = b;
      n = [-n[0], -n[1], -n[2]];
    }
    n = norm3(n);
    for (const p of [a, p2, p3]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(color[0], color[1], color[2], 1);
    }
  }

  toGeometry(bounds: { min: V3; max: V3 }) {
    const count = this.pos.length / 3;
    const indices: number[] = [];
    for (let i = 0; i < count; i += 1) indices.push(i);
    return geometry.define({
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nrm),
      colors: new Float32Array(this.col),
      indices,
      bounds
    });
  }
}

// ---------- island shape ----------
const shapeD = (x: number, z: number): number => {
  const a = Math.atan2(z, x);
  return Math.hypot(x, z) / ISLAND_R / (1 + 0.15 * Math.sin(3 * a + 0.5) + 0.1 * Math.sin(5 * a + 2));
};
const height = (x: number, z: number): number => {
  const d = shapeD(x, z);
  let h = 3.6 * (1 - d * d);
  h += 1.1 * Math.sin(x * 0.5 + 1) * Math.cos(z * 0.42) * Math.max(0, 1 - d);
  h += 2.4 * Math.exp(-((x - 3) ** 2 + (z + 2) ** 2) / 20);
  return Math.max(h, -3);
};

// ---------- terrain ----------
const GRID = 44;
const HALF = 22;
const CELL = (HALF * 2) / GRID;
const gridHash = (i: number, j: number, k: number): number => {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const gridPoint = (i: number, j: number): V3 => {
  const x = -HALF + i * CELL + (gridHash(i, j, 1) - 0.5) * CELL * 0.6;
  const z = -HALF + j * CELL + (gridHash(i, j, 2) - 0.5) * CELL * 0.6;
  return [x, height(x, z), z];
};

const terrainColor = (cy: number, ny: number, variation: number): V3 => {
  let c: V3;
  if (cy < 0.55) c = cy < -0.4 ? [0.55, 0.5, 0.36] : [0.86, 0.77, 0.5];
  else if (ny < 0.72 || cy > 4.6) c = [0.47, 0.44, 0.4];
  else if (cy < 2.4) c = [0.3, 0.6, 0.2];
  else c = [0.22, 0.48, 0.17];
  const v = 0.92 + variation * 0.16;
  return [c[0] * v, c[1] * v, c[2] * v];
};

const terrain = new MeshBuilder();
for (let j = 0; j < GRID; j += 1) {
  for (let i = 0; i < GRID; i += 1) {
    const p00 = gridPoint(i, j);
    const p10 = gridPoint(i + 1, j);
    const p01 = gridPoint(i, j + 1);
    const p11 = gridPoint(i + 1, j + 1);
    const quad: Array<[V3, V3, V3]> =
      (i + j) % 2 === 0
        ? [[p00, p01, p10], [p10, p01, p11]]
        : [[p00, p01, p11], [p00, p11, p10]];
    for (const [a, b, c] of quad) {
      const cy = (a[1] + b[1] + c[1]) / 3;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const ny01 = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
      const color = terrainColor(cy, ny01, rand());
      terrain.tri(a, b, c, color, [(a[0] + b[0] + c[0]) / 3, cy - 1, (a[2] + b[2] + c[2]) / 3]);
    }
  }
}

// ---------- props: pine trees and rocks (one merged flat-shaded mesh) ----------
const props = new MeshBuilder();

const addCone = (x: number, baseY: number, z: number, radius: number, h: number, sides: number, color: V3): void => {
  const apex: V3 = [x, baseY + h, z];
  const ref: V3 = [x, baseY, z];
  const rot = rand() * Math.PI;
  for (let k = 0; k < sides; k += 1) {
    const a0 = rot + (k / sides) * Math.PI * 2;
    const a1 = rot + ((k + 1) / sides) * Math.PI * 2;
    const shade = 0.9 + rand() * 0.2;
    props.tri(
      [x + Math.cos(a0) * radius, baseY, z + Math.sin(a0) * radius],
      [x + Math.cos(a1) * radius, baseY, z + Math.sin(a1) * radius],
      apex,
      [color[0] * shade, color[1] * shade, color[2] * shade],
      ref
    );
  }
};

const addTrunk = (x: number, baseY: number, z: number, radius: number, h: number, color: V3): void => {
  const sides = 6;
  const ref: V3 = [x, baseY + h / 2, z];
  for (let k = 0; k < sides; k += 1) {
    const a0 = (k / sides) * Math.PI * 2;
    const a1 = ((k + 1) / sides) * Math.PI * 2;
    const b0: V3 = [x + Math.cos(a0) * radius, baseY, z + Math.sin(a0) * radius];
    const b1: V3 = [x + Math.cos(a1) * radius, baseY, z + Math.sin(a1) * radius];
    const t0: V3 = [b0[0], baseY + h, b0[2]];
    const t1: V3 = [b1[0], baseY + h, b1[2]];
    props.tri(b0, b1, t1, color, ref);
    props.tri(b0, t1, t0, color, ref);
  }
};

const addTree = (x: number, groundY: number, z: number, s: number): void => {
  const base = groundY - 0.15;
  addTrunk(x, base, z, 0.2 * s, 1.1 * s, [0.42, 0.27, 0.15]);
  addCone(x, base + 0.8 * s, z, 1.25 * s, 1.7 * s, 7, [0.13, 0.42, 0.2]);
  addCone(x, base + 1.7 * s, z, 0.95 * s, 1.5 * s, 7, [0.17, 0.5, 0.22]);
  addCone(x, base + 2.5 * s, z, 0.62 * s, 1.3 * s, 7, [0.22, 0.58, 0.25]);
};

const T = (1 + Math.sqrt(5)) / 2;
const ICO_VERTS: V3[] = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
  [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
  [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1]
].map((v) => norm3(v as V3));
const ICO_FACES = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
];

const addRock = (x: number, y: number, z: number, size: number): void => {
  const sx = size * (0.9 + rand() * 0.5);
  const sy = size * (0.6 + rand() * 0.4);
  const sz = size * (0.9 + rand() * 0.5);
  const verts: V3[] = ICO_VERTS.map((v) => {
    const j = 0.75 + rand() * 0.4;
    return [x + v[0] * sx * j, y + v[1] * sy * j, z + v[2] * sz * j];
  });
  const base = 0.5 + rand() * 0.12;
  for (let f = 0; f < ICO_FACES.length; f += 3) {
    const shade = base + rand() * 0.14;
    props.tri(verts[ICO_FACES[f]], verts[ICO_FACES[f + 1]], verts[ICO_FACES[f + 2]], [shade, shade * 0.97, shade * 0.92], [x, y, z]);
  }
};

const placed: Array<[number, number]> = [];
let attempts = 0;
while (placed.length < 30 && attempts < 4000) {
  attempts += 1;
  const x = (rand() - 0.5) * 2 * ISLAND_R;
  const z = (rand() - 0.5) * 2 * ISLAND_R;
  const h = height(x, z);
  const d = shapeD(x, z);
  if (d > 0.82 || h < 0.9 || h > 4.4) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.4)) continue;
  placed.push([x, z]);
  addTree(x, h, z, 0.75 + rand() * 0.55);
}
const rocks: Array<[number, number, number]> = [];
attempts = 0;
while (rocks.length < 12 && attempts < 4000) {
  attempts += 1;
  const a = rand() * Math.PI * 2;
  const r = ISLAND_R * (0.55 + rand() * 0.8);
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const d = shapeD(x, z);
  const h = height(x, z);
  if (d < 0.6 || d > 1.35 || h > 3) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.8)) continue;
  if (rocks.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.5)) continue;
  const size = d > 1.05 ? 0.9 + rand() * 0.7 : 0.5 + rand() * 0.8;
  rocks.push([x, z, size]);
  addRock(x, Math.max(h, -0.3) + size * 0.15, z, size);
}

// ---------- water ----------
const WATER_N = 200;
const WATER_HALF = 320;
const waterPositions = new Float32Array((WATER_N + 1) ** 2 * 3);
const waterNormals = new Float32Array(waterPositions.length);
const waterIndices: number[] = [];
for (let j = 0; j <= WATER_N; j += 1) {
  for (let i = 0; i <= WATER_N; i += 1) {
    const v = j * (WATER_N + 1) + i;
    const warp = (u: number): number => Math.sign(u) * (0.12 * Math.abs(u) + 0.88 * u * u) * WATER_HALF;
    waterPositions.set([warp((i / WATER_N) * 2 - 1), 0, warp((j / WATER_N) * 2 - 1)], v * 3);
    waterNormals[v * 3 + 1] = 1;
    if (i < WATER_N && j < WATER_N) {
      waterIndices.push(v, v + WATER_N + 1, v + 1, v + 1, v + WATER_N + 1, v + WATER_N + 2);
    }
  }
}

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
void main() {
  vec2 p = position.xz;
  float fade = 1.0 / (1.0 + length(p) * 0.012);
  float h = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 dir = vec2(cos(0.9 * fi + 0.3), sin(0.9 * fi + 0.3));
    float k = 0.3 + 0.26 * fi;
    float speed = 1.1 + 0.5 * fi;
    float amp = 0.34 / (1.0 + fi * 1.0);
    float ph = dot(dir, p) * k + tClock * speed;
    h += amp * sin(ph);
    g += amp * k * cos(ph) * dir;
  }
  h *= fade;
  g *= fade;
  vec3 pos = vec3(p.x, h, p.y);
  vPos = pos;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(pos, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;

float islandD(vec2 p) {
  float a = atan(p.y, p.x);
  return length(p) / ${ISLAND_R.toFixed(1)} / (1.0 + 0.15 * sin(3.0 * a + 0.5) + 0.1 * sin(5.0 * a + 2.0));
}

void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);
  vec3 smoothN = normalize(vNormal);
  vec3 flatN = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (flatN.y < 0.0) flatN = -flatN;
  vec3 n = normalize(mix(smoothN, flatN, 0.6));

  float d = islandD(vPos.xz);
  float shallow = 1.0 - smoothstep(1.0, 1.6, d);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);

  vec3 deep = vec3(0.02, 0.2, 0.36);
  vec3 shal = vec3(0.12, 0.66, 0.68);
  vec3 body = mix(deep, shal, shallow);
  float lit = 0.3 + 0.7 * daylight * (0.45 + 0.55 * clamp(dot(n, lightDir), 0.0, 1.0));
  body *= lit;
  vec3 col = mix(body, skyCol, clamp(fres * 0.85 + 0.05, 0.0, 1.0));

  float spec = pow(max(dot(reflect(-lightDir, n), v), 0.0), 80.0);
  col += lightCol * spec * 1.3;

  float wobble = 0.03 * sin(tClock * 1.6 + d * 9.0);
  float foamBand = 1.0 - smoothstep(0.0, 0.07, abs(d - 1.05 - wobble));
  float foamBreak = 0.65 + 0.35 * sin(tClock * 2.0 + atan(vPos.z, vPos.x) * 11.0);
  vec3 foamCol = vec3(0.95, 0.97, 1.0) * (0.3 + 0.7 * daylight);
  col = mix(col, foamCol, clamp(foamBand * foamBreak, 0.0, 1.0) * 0.85);

  col = mix(col, skyCol, smoothstep(160.0, 440.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    tClock: { type: "f32", value: 0 },
    daylight: { type: "f32", value: 1 },
    lightDir: { type: "vec3", value: [0.4, 0.8, -0.4] },
    lightCol: { type: "vec3", value: [1, 0.93, 0.8] },
    skyCol: { type: "vec3", value: [0.55, 0.74, 0.93] }
  }
});

// ---------- day/night state ----------
const SUN_DAY: V3 = [1.0, 0.94, 0.8];
const SUN_LOW: V3 = [1.0, 0.62, 0.35];
const MOON: V3 = [0.56, 0.69, 1.0];
const SKY_DAY: V3 = [0.55, 0.74, 0.93];
const SKY_NIGHT: V3 = [0.06, 0.09, 0.2];
const SKY_TWILIGHT: V3 = [0.9, 0.5, 0.36];

const stateAt = (t: number) => {
  const phase = PHASE0 + (t / CYCLE_SECONDS) * Math.PI * 2;
  const elev = 52 * Math.sin(phase) + 12; // degrees
  const az = -70 * Math.cos(phase);
  const daylight = smoothstep(-6, 14, elev);
  const sunDir = dirFromAngles(elev, az);
  const moonDir = dirFromAngles(-elev, az + 180);
  const warm = 1 - smoothstep(4, 28, elev);
  const sunColor = mix3(SUN_DAY, SUN_LOW, warm);
  const sunIntensity = 4.2 * smoothstep(-2, 16, elev);
  const moonIntensity = 0.9 * (1 - smoothstep(-12, 8, elev));
  const hemiIntensity = 0.6 + 0.55 * daylight;
  const twilight = Math.exp(-((elev / 10) ** 2));
  let skyCol = mix3(SKY_NIGHT, SKY_DAY, daylight);
  skyCol = mix3(skyCol, SKY_TWILIGHT, twilight * 0.55);
  const lightDir = norm3(mix3(moonDir, sunDir, daylight));
  const sunPart = daylight;
  const lightCol: V3 = [
    sunColor[0] * sunPart + MOON[0] * 0.6 * (1 - sunPart),
    sunColor[1] * sunPart + MOON[1] * 0.6 * (1 - sunPart),
    sunColor[2] * sunPart + MOON[2] * 0.6 * (1 - sunPart)
  ];
  return { elev, az, daylight, sunDir, moonDir, sunColor, sunIntensity, moonIntensity, hemiIntensity, skyCol, lightDir, lightCol };
};

const s0 = stateAt(0);
const at = (d: V3, k = 40): V3 => [d[0] * k, d[1] * k, d[2] * k];

const CAM_POS: V3 = [0, 11, 34];
const CAM_TARGET: V3 = [0, 2.5, 0];

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { elevationDeg: s0.elev, azimuthDeg: s0.az, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#3a4a30", intensity: s0.hemiIntensity }).runtime({ id: "hemi", mutable: true }))
    .add(
      lights
        .directional({ name: "sun", position: at(s0.sunDir), target: [0, 0, 0], intensity: s0.sunIntensity, color: hex(s0.sunColor), shadow: true })
        .runtime({ id: "sun", mutable: true })
    )
    .add(
      lights
        .directional({ name: "moon", position: at(s0.moonDir), target: [0, 0, 0], intensity: s0.moonIntensity, color: "#8fb0ff" })
        .runtime({ id: "moon", mutable: true })
    )
    .add(
      geometry.custom(terrain.toGeometry({ min: [-HALF, -3.5, -HALF], max: [HALF, 8, HALF] }), {
        name: "island",
        material: material.pbr({ color: "#ffffff", roughness: 0.95 })
      })
    )
    .add(
      geometry.custom(props.toGeometry({ min: [-HALF, -2, -HALF], max: [HALF, 10, HALF] }), {
        name: "props",
        material: material.pbr({ color: "#ffffff", roughness: 0.92 })
      })
    )
    .add(
      geometry
        .custom(
          geometry.define({
            positions: waterPositions,
            normals: waterNormals,
            indices: waterIndices,
            bounds: { min: [-WATER_HALF, -2, -WATER_HALF], max: [WATER_HALF, 2, WATER_HALF] }
          }),
          { name: "water", material: waterMaterial, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .add(interactions.orbit({ target: CAM_TARGET, position: CAM_POS, autoRotate: 0.05 }))
    .camera(
      camera.orbit({
        position: CAM_POS,
        target: CAM_TARGET,
        distance: Math.hypot(CAM_POS[0] - CAM_TARGET[0], CAM_POS[1] - CAM_TARGET[1], CAM_POS[2] - CAM_TARGET[2]),
        fov: 50,
        near: 0.5,
        far: 1500,
        autoRotate: 0.05
      })
    )
});

const startTime = performance.now();
const applyTime = (t: number): void => {
  const s = stateAt(t);
  const sun = app.nodes.require("sun");
  sun.setPosition(...at(s.sunDir));
  sun.setLight?.({ intensity: s.sunIntensity, color: hex(s.sunColor) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...at(s.moonDir));
  moon.setLight?.({ intensity: s.moonIntensity });
  app.nodes.require("hemi").setLight?.({ intensity: s.hemiIntensity });
  app.atmosphere?.setSky({ sun: { elevationDeg: s.elev, azimuthDeg: s.az, intensity: 1 } });
  const water = app.nodes.require("water");
  water.setUniform?.("tClock", t);
  water.setUniform?.("daylight", s.daylight);
  water.setUniform?.("lightDir", s.lightDir);
  water.setUniform?.("lightCol", s.lightCol);
  water.setUniform?.("skyCol", s.skyCol);
};

app.onFrame(() => applyTime((performance.now() - startTime) / 1000));

void app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
    });
  });
});
