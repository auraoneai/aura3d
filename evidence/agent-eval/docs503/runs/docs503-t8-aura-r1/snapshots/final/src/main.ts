import {
  camera,
  createAuraApp,
  effects,
  geometry,
  instances,
  lights,
  material,
  scene,
  sky,
  type AuraTransformSpec,
  type AuraVec3
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- constants
const DAY_SECONDS = 20; // one full day/night cycle
const START_PHASE = 1.0; // radians; morning, sun already up
const ISLAND_R = 15;
const TERRAIN_SIZE = 52;
const TERRAIN_CELLS = 52;
const WATER_SIZE = 150;
const WATER_CELLS = 150;

// ---------------------------------------------------------------- helpers
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: AuraVec3, b: AuraVec3, t: number): AuraVec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = (c: AuraVec3): string => {
  const h = (v: number): string => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
};
const hash = (i: number, j: number, k = 0): number => {
  let h = Math.imul(i + 374761393, 668265263) ^ Math.imul(j + 1274126177, 2246822519) ^ Math.imul(k + 97, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------------------------------------------------------------- island height field
const height = (x: number, z: number): number => {
  const a = Math.atan2(z, x);
  const r = Math.hypot(x, z) * (1 + 0.12 * Math.sin(3 * a + 1) + 0.07 * Math.sin(5 * a + 2));
  const t = r / ISLAND_R;
  const dome = 5.0 * (1 - t * t) - 0.5;
  const peak = 2.6 * Math.exp(-((x + 2.5) ** 2 + (z - 1.5) ** 2) / 20);
  const bumps = 0.55 * Math.sin(x * 0.9 + 0.7) * Math.cos(z * 0.8) + 0.3 * Math.sin(x * 1.7 + z * 1.3);
  const inland = smooth(1.15, 0.55, t);
  return Math.max(dome + peak + bumps * inland, -3);
};

// Faceted terrain: non-indexed triangles, one normal and one colour per face.
const buildTerrain = () => {
  const n = TERRAIN_CELLS + 1;
  const vx = new Float32Array(n * n);
  const vy = new Float32Array(n * n);
  const vz = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
      const x = (i / TERRAIN_CELLS - 0.5) * TERRAIN_SIZE + (edge ? 0 : (hash(i, j, 1) - 0.5) * 0.7);
      const z = (j / TERRAIN_CELLS - 0.5) * TERRAIN_SIZE + (edge ? 0 : (hash(i, j, 2) - 0.5) * 0.7);
      const v = j * n + i;
      vx[v] = x;
      vz[v] = z;
      vy[v] = height(x, z) + (hash(i, j, 3) - 0.5) * 0.35;
    }
  }
  const tris = TERRAIN_CELLS * TERRAIN_CELLS * 2;
  const positions = new Float32Array(tris * 9);
  const normals = new Float32Array(tris * 9);
  const colors = new Float32Array(tris * 12);
  const indices: number[] = [];
  let t = 0;
  const face = (a: number, b: number, c: number, fi: number): void => {
    let p = [a, b, c];
    const e1: AuraVec3 = [vx[p[1]!]! - vx[p[0]!]!, vy[p[1]!]! - vy[p[0]!]!, vz[p[1]!]! - vz[p[0]!]!];
    const e2: AuraVec3 = [vx[p[2]!]! - vx[p[0]!]!, vy[p[2]!]! - vy[p[0]!]!, vz[p[2]!]! - vz[p[0]!]!];
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (ny < 0) {
      p = [a, c, b];
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const cy = (vy[a]! + vy[b]! + vy[c]!) / 3;
    const jitter = (hash(fi, 7, 9) - 0.5) * 0.08;
    let col: AuraVec3;
    if (cy < -0.2) col = [0.55, 0.5, 0.36];
    else if (cy < 0.45) col = [0.82, 0.72, 0.46];
    else if (cy < 3.4 && ny > 0.62) col = hash(fi, 3, 5) > 0.5 ? [0.2, 0.46, 0.17] : [0.25, 0.52, 0.2];
    else if (cy < 4.9) col = [0.42, 0.37, 0.33];
    else col = [0.92, 0.94, 0.97];
    for (let k = 0; k < 3; k += 1) {
      const v = p[k]!;
      const o = t * 9 + k * 3;
      positions[o] = vx[v]!;
      positions[o + 1] = vy[v]!;
      positions[o + 2] = vz[v]!;
      normals[o] = nx;
      normals[o + 1] = ny;
      normals[o + 2] = nz;
      const co = t * 12 + k * 4;
      colors[co] = clamp(col[0] + jitter, 0, 1);
      colors[co + 1] = clamp(col[1] + jitter, 0, 1);
      colors[co + 2] = clamp(col[2] + jitter, 0, 1);
      colors[co + 3] = 1;
      indices.push(t * 3 + k);
    }
    t += 1;
  };
  for (let j = 0; j < TERRAIN_CELLS; j += 1) {
    for (let i = 0; i < TERRAIN_CELLS; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      const fi = j * TERRAIN_CELLS + i;
      if ((i + j) % 2 === 0) {
        face(a, c, b, fi * 2);
        face(b, c, d, fi * 2 + 1);
      } else {
        face(a, c, d, fi * 2);
        face(a, d, b, fi * 2 + 1);
      }
    }
  }
  return geometry.define({
    positions,
    normals,
    colors,
    indices,
    bounds: { min: [-TERRAIN_SIZE / 2, -4, -TERRAIN_SIZE / 2], max: [TERRAIN_SIZE / 2, 9, TERRAIN_SIZE / 2] }
  });
};

// ---------------------------------------------------------------- vegetation and rocks
const trunkT: AuraTransformSpec[] = [];
const trunkC: string[] = [];
const crownT: AuraTransformSpec[] = [];
const crownC: string[] = [];
const rockT: AuraTransformSpec[] = [];
const rockC: string[] = [];
for (let tries = 0, trees = 0; tries < 2000 && trees < 46; tries += 1) {
  const x = (rand() - 0.5) * 2 * ISLAND_R;
  const z = (rand() - 0.5) * 2 * ISLAND_R;
  const h = height(x, z);
  if (h < 0.8 || h > 3.6) continue;
  const s = 0.75 + rand() * 0.6;
  const pine = rand() > 0.5;
  trunkT.push({ position: [x, h + 0.45 * s, z], scale: [0.32 * s, 1.3 * s, 0.32 * s] });
  trunkC.push("#6b4a2b");
  const green = pine ? "#1f5a33" : "#3f8a2e";
  crownT.push({ position: [x, h + 1.7 * s, z], scale: [2.0 * s, 2.3 * s, 2.0 * s], rotation: [0, rand() * 3, 0] });
  crownC.push(green);
  crownT.push({ position: [x, h + 2.9 * s, z], scale: [1.4 * s, 1.8 * s, 1.4 * s], rotation: [0, rand() * 3, 0] });
  crownC.push(green);
  trees += 1;
}
for (let tries = 0, rocks = 0; tries < 2000 && rocks < 16; tries += 1) {
  const x = (rand() - 0.5) * 2 * (ISLAND_R + 2);
  const z = (rand() - 0.5) * 2 * (ISLAND_R + 2);
  const h = height(x, z);
  if (h < -0.3 || h > 4.8) continue;
  const s = 0.5 + rand() * 0.9;
  rockT.push({
    position: [x, h + 0.1 * s, z],
    scale: [s * (1 + rand() * 0.6), s * (0.7 + rand() * 0.4), s * (1 + rand() * 0.5)],
    rotation: [rand() * 0.6, rand() * 6, rand() * 0.6]
  });
  rockC.push(rand() > 0.5 ? "#7d7d80" : "#5f5f64");
  rocks += 1;
}

// ---------------------------------------------------------------- water
const buildWater = () => {
  const n = WATER_CELLS;
  const positions = new Float32Array((n + 1) ** 2 * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const v = j * (n + 1) + i;
      positions.set([(i / n - 0.5) * WATER_SIZE, 0, (j / n - 0.5) * WATER_SIZE], v * 3);
      normals[v * 3 + 1] = 1;
      if (i < n && j < n) indices.push(v, v + n + 1, v + 1, v + 1, v + n + 1, v + n + 2);
    }
  }
  return geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-WATER_SIZE / 2, -1.5, -WATER_SIZE / 2], max: [WATER_SIZE / 2, 1.5, WATER_SIZE / 2] }
  });
};

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
float waveH(vec2 p, float t) {
  return sin(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.22
       + sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.16
       + sin(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1) * 0.07;
}
void main() {
  vec3 p = vec3(position.x, waveH(position.xz, waveClock), position.z);
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
  float fresnel = pow(1.0 - ndv, 4.0);
  float dist = length(vPos.xz);
  vec3 body = mix(deepCol, shallowCol, clamp(1.0 - dist / 30.0, 0.0, 1.0) * 0.6 + n.y * 0.0);
  float diff = clamp(dot(n, normalize(lightDir)), 0.0, 1.0);
  vec3 lit = body * (ambientLum + lightCol * diff * 0.5);
  vec3 col = mix(lit, skyCol, clamp(fresnel * 0.85 + 0.06, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(lightDir), n), v), 0.0), 80.0);
  col += lightCol * glint * 1.2;
  // sparkle crests
  float crest = smoothstep(0.26, 0.4, vPos.y);
  col += lightCol * crest * 0.12 + skyCol * crest * 0.06;
  outColor = vec4(col, 0.86);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    deepCol: { type: "vec3", value: [0.03, 0.22, 0.34] },
    shallowCol: { type: "vec3", value: [0.12, 0.52, 0.58] },
    skyCol: { type: "vec3", value: [0.62, 0.78, 0.92] },
    lightCol: { type: "vec3", value: [1, 0.93, 0.78] },
    lightDir: { type: "vec3", value: [0.5, 0.6, 0.4] },
    ambientLum: { type: "f32", value: 0.7 }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});

// ---------------------------------------------------------------- sky / light state
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 40): AuraVec3 => {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};
const sunAt = (phase: number): { elevationDeg: number; azimuthDeg: number; h: number } => ({
  elevationDeg: Math.sin(phase) * 62,
  azimuthDeg: 90 + (phase / Math.PI) * 180,
  h: Math.sin(phase)
});

const phase0 = START_PHASE;
const s0 = sunAt(phase0);

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { elevationDeg: s0.elevationDeg, azimuthDeg: s0.azimuthDeg, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "ambient", skyColor: "#b8d0f0", groundColor: "#4a5a3a", intensity: 1.0 }).runtime({ id: "ambient", mutable: true }))
    .add(
      lights
        .directional({ name: "sun", position: lightAt(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 4, color: "#fff0d0", shadow: true })
        .runtime({ id: "sun", mutable: true })
    )
    .add(
      lights
        .directional({ name: "moon", position: lightAt(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.2, color: "#8fb0ff" })
        .runtime({ id: "moon", mutable: true })
    )
    .add(geometry.custom(buildTerrain(), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunkT, colors: trunkC, material: material.pbr({ color: "#ffffff", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns", transforms: crownT, colors: crownC, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.sphere({ name: "rocks", transforms: rockT, colors: rockC, material: material.pbr({ color: "#ffffff", roughness: 1 }), params: { widthSegments: 5, heightSegments: 3 } }))
    .add(geometry.custom(buildWater(), { name: "water", material: waterMaterial, castShadow: false }).runtime({ id: "water", mutable: true }))
    .add(effects.fog({ color: "#a9c4e0", density: 0.0035 }))
    .camera(camera.perspective({ position: [0, 20, 40], target: [0, 1, 0], fov: 45, near: 0.5, far: 500 }))
});

// ---------------------------------------------------------------- per-frame update
const DAY_SKY: AuraVec3 = [0.62, 0.78, 0.92];
const NIGHT_SKY: AuraVec3 = [0.03, 0.05, 0.13];
const DUSK_SKY: AuraVec3 = [0.95, 0.5, 0.32];
const DAY_DEEP: AuraVec3 = [0.03, 0.24, 0.36];
const NIGHT_DEEP: AuraVec3 = [0.01, 0.04, 0.09];
const DAY_SHALLOW: AuraVec3 = [0.14, 0.56, 0.6];
const NIGHT_SHALLOW: AuraVec3 = [0.02, 0.1, 0.17];
const SUN_HIGH: AuraVec3 = [1, 0.95, 0.82];
const SUN_LOW: AuraVec3 = [1, 0.52, 0.25];
const MOON: AuraVec3 = [0.45, 0.55, 0.85];

let clock = 0;
app.onFrame((frame) => {
  clock += Math.min(frame.dt, 0.1);
  const phase = phase0 + (clock / DAY_SECONDS) * Math.PI * 2;
  const s = sunAt(phase);
  const day = smooth(-0.12, 0.3, s.h); // 0 at night, 1 in full day
  const dusk = Math.max(0, 1 - Math.abs(s.h) / 0.4);

  const sunPos = lightAt(s.elevationDeg, s.azimuthDeg);
  const moonPos = lightAt(-s.elevationDeg, s.azimuthDeg + 180);
  const sunCol = mix3(SUN_HIGH, SUN_LOW, dusk);
  app.nodes.require("sun").setLight?.({ position: sunPos, intensity: 4.2 * day, color: hex(sunCol) });
  app.nodes.require("moon").setLight?.({ position: moonPos, intensity: 0.25 + 0.55 * (1 - day) });
  app.nodes.require("ambient").setLight?.({
    intensity: 0.38 + 0.7 * day,
    color: hex(mix3([0.45, 0.55, 0.85], [0.85, 0.92, 1], day))
  });
  app.atmosphere?.setSky({ sun: { elevationDeg: s.elevationDeg, azimuthDeg: s.azimuthDeg, intensity: 1 } });

  const skyCol = mix3(mix3(NIGHT_SKY, DAY_SKY, day), DUSK_SKY, dusk * 0.5);
  const lightDir = s.h > -0.05 ? sunPos : moonPos;
  const lightCol: AuraVec3 =
    s.h > -0.05
      ? [sunCol[0] * day, sunCol[1] * day, sunCol[2] * day]
      : [MOON[0] * 0.5, MOON[1] * 0.5, MOON[2] * 0.5];
  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", clock);
  water.setUniform?.("deepCol", mix3(NIGHT_DEEP, DAY_DEEP, day));
  water.setUniform?.("shallowCol", mix3(NIGHT_SHALLOW, DAY_SHALLOW, day));
  water.setUniform?.("skyCol", skyCol);
  water.setUniform?.("lightCol", lightCol);
  water.setUniform?.("lightDir", lightDir);
  water.setUniform?.("ambientLum", 0.3 + 0.7 * day);

  // slow orbit around the island
  const ang = 0.5 + clock * 0.06;
  const radius = 42;
  app.camera?.setPose({
    position: [Math.sin(ang) * radius, 20, Math.cos(ang) * radius],
    target: [0, 1, 0]
  });

  app.atmosphere?.setFog({ color: hex(skyCol), density: 0.0035 });
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
