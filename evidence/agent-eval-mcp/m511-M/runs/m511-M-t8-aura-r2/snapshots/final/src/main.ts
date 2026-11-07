import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  instances,
  lights,
  material,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const DAY_SECONDS = 20; // one full day/night cycle
const START_HOUR = 9;

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
type V3 = [number, number, number];
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: V3): string =>
  "#" + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("");

// ---------- terrain: flat-shaded low-poly island ----------
const CELLS = 32;
const SIZE = 40;
const FLOOR = -1.2;

const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const R = 15 + 1.6 * Math.sin(3 * th + 0.7) + 0.9 * Math.sin(5 * th + 2.1);
  const dome = 5.4 * (1 - (r / R) * (r / R)) - 1;
  const bumps = 0.9 * Math.sin(x * 0.45 + 1) * Math.cos(z * 0.4) + 0.55 * Math.sin(x * 0.8 + z * 0.7);
  const h = dome + bumps * clamp(dome + 1.5, 0, 1);
  return Math.max(FLOOR, h);
};

const SAND: V3 = [0.62, 0.52, 0.3];
const GRASS_A: V3 = [0.14, 0.34, 0.1];
const GRASS_B: V3 = [0.2, 0.42, 0.13];
const ROCK: V3 = [0.33, 0.29, 0.25];
const PEAK: V3 = [0.62, 0.6, 0.58];
const faceColor = (h: number, k: number): V3 =>
  h < 0.55 ? SAND : h < 3.0 ? (k % 2 === 0 ? GRASS_A : GRASS_B) : h < 4.3 ? ROCK : PEAK;

const triCount = CELLS * CELLS * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices = new Uint32Array(triCount * 3);
{
  let t = 0;
  const pt = (i: number, j: number): V3 => {
    const x = (i / CELLS - 0.5) * SIZE;
    const z = (j / CELLS - 0.5) * SIZE;
    return [x, height(x, z), z];
  };
  const emit = (a: V3, b: V3, c: V3, k: number): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const col = faceColor((a[1] + b[1] + c[1]) / 3, k);
    [a, b, c].forEach((p, n) => {
      const o = t * 9 + n * 3;
      positions.set(p, o);
      normals.set([nx, ny, nz], o);
      colors.set([col[0], col[1], col[2], 1], t * 12 + n * 4);
      indices[t * 3 + n] = t * 3 + n;
    });
    t += 1;
  };
  for (let j = 0; j < CELLS; j += 1) {
    for (let i = 0; i < CELLS; i += 1) {
      const p00 = pt(i, j), p10 = pt(i + 1, j), p01 = pt(i, j + 1), p11 = pt(i + 1, j + 1);
      const k = i * 7 + j * 13;
      emit(p00, p01, p10, k);
      emit(p10, p01, p11, k + 1);
    }
  }
}

// ---------- trees and rocks ----------
let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [];
const lowCrowns: AuraTransformSpec[] = [];
const highCrowns: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
for (let n = 0, tries = 0; n < 16 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2, r = 2 + rand() * 11;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 0.9 || h > 3.4) continue;
  const s = 0.75 + rand() * 0.6;
  trunks.push({ position: [x, h + 0.6 * s, z], scale: [0.32 * s, 1.2 * s, 0.32 * s] });
  lowCrowns.push({ position: [x, h + 2.1 * s, z], scale: [2.1 * s, 2.2 * s, 2.1 * s] });
  highCrowns.push({ position: [x, h + 3.05 * s, z], scale: [1.4 * s, 1.7 * s, 1.4 * s] });
  n += 1;
}
for (let n = 0, tries = 0; n < 9 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2, r = 4 + rand() * 12;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < -0.1 || h > 4.5) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({
    position: [x, h + 0.25 * s, z],
    rotation: [rand() * 0.6, rand() * Math.PI, rand() * 0.6],
    scale: [1.3 * s, 0.9 * s, 1.0 * s]
  });
  n += 1;
}

// ---------- water: animated custom shader ----------
const WN = 240;
const WSIZE = 360;
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

const waterMat = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
void addWave(vec2 p, float t, vec2 d, float k, float sp, float a, inout float h, inout vec2 s) {
  float ph = dot(p, d) * k + t * sp;
  h += sin(ph) * a;
  s += d * (cos(ph) * a * k);
}
void main() {
  float h = 0.0;
  vec2 s = vec2(0.0);
  addWave(position.xz, waveClock, normalize(vec2(1.0, 0.6)), 0.55, 1.3, 0.16, h, s);
  addWave(position.xz, waveClock, normalize(vec2(-0.5, 1.0)), 0.85, 1.7, 0.1, h, s);
  addWave(position.xz, waveClock, normalize(vec2(0.8, -0.9)), 1.2, 2.3, 0.05, h, s);
  vec3 p = vec3(position.x, h - 0.05, position.z);
  vPos = p;
  vNormal = normalize(vec3(-s.x, 1.0, -s.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.001);
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float shore = smoothstep(30.0, 12.0, length(vPos.xz));
  vec3 deep = vec3(0.03, 0.22, 0.38);
  vec3 shallow = vec3(0.12, 0.62, 0.66);
  vec3 body = mix(deep, shallow, shore * 0.8 + clamp(vPos.y * 2.0, 0.0, 0.2));
  // faint foam ring where the water meets the beach
  float ring = smoothstep(0.8, 0.0, abs(length(vPos.xz) - 15.5)) * (0.5 + 0.5 * sin(vPos.x * 1.7 + vPos.z * 1.3 + waveClock * 2.0));
  float lit = 0.18 + 0.82 * dayLight;
  vec3 col = mix(body, skyCol, clamp(fresnel * 0.85 + 0.05, 0.0, 1.0)) * lit;
  vec3 r = reflect(-lightDir, n);
  float glint = pow(max(dot(r, v), 0.0), 90.0);
  col += lightCol * glint * 1.6;
  col += vec3(0.8, 0.9, 0.95) * ring * 0.08 * lit;
  col = mix(col, skyCol, smoothstep(70.0, 175.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    dayLight: { type: "f32", value: 1 },
    lightDir: { type: "vec3", value: [0.4, 0.6, 0.3] },
    lightCol: { type: "vec3", value: [1, 0.95, 0.8] },
    skyCol: { type: "vec3", value: [0.62, 0.78, 0.92] }
  }
});

// ---------- time of day ----------
const sunAngles = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 68,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirFrom = (elevationDeg: number, azimuthDeg: number): V3 => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaleV = (v: V3, d: number): V3 => [v[0] * d, v[1] * d, v[2] * d];

const s0 = sunAngles(START_HOUR);
const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(environments.neutral({ intensity: 0.35, background: false }))
    .add(lights.hemisphere({ name: "fill", skyColor: "#b8d0f0", groundColor: "#3a4a30", intensity: 1 }).runtime({ id: "fill", mutable: true }))
    .add(
      lights
        .directional({ name: "sun", position: scaleV(dirFrom(s0.elevationDeg, s0.azimuthDeg), 45), target: [0, 0, 0], intensity: 4, color: "#fff0d0", shadow: true })
        .runtime({ id: "sun", mutable: true })
    )
    .add(
      lights
        .directional({ name: "moon", position: scaleV(dirFrom(-s0.elevationDeg, s0.azimuthDeg + 180), 45), target: [0, 0, 0], intensity: 0, color: "#8fb0ff" })
        .runtime({ id: "moon", mutable: true })
    )
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -3, -SIZE / 2], max: [SIZE / 2, 9, SIZE / 2] } }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }) }
    ))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: waterMat, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns-low", transforms: lowCrowns, material: material.pbr({ color: "#2a6a34", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns-high", transforms: highCrowns, material: material.pbr({ color: "#378040", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#7d7a76", roughness: 1 }) }))
    .add(effects.fog({ color: "#a9c4e0", density: 0.003 }))
    .camera(camera.perspective({ position: [0, 18, 38], target: [0, 0.5, 0], fov: 45, near: 0.5, far: 500 }))
});

const DAY_SKY: V3 = [0.62, 0.78, 0.92];
const DUSK_SKY: V3 = [0.85, 0.5, 0.35];
const NIGHT_SKY: V3 = [0.03, 0.045, 0.1];

let clock = 0;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
  const s = sunAngles(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const day = smooth(-0.12, 0.35, sinE); // 0 night .. 1 full day
  const dusk = 1 - smooth(0, 0.4, Math.abs(sinE)); // peaks at the horizon

  const sunDir = dirFrom(s.elevationDeg, s.azimuthDeg);
  const moonDir = dirFrom(-s.elevationDeg, s.azimuthDeg + 180);
  const sunWarm = mix3([1, 0.95, 0.82], [1, 0.58, 0.3], dusk);

  app.nodes.require("sun").setPosition(...scaleV(sunDir, 45));
  app.nodes.require("moon").setPosition(...scaleV(moonDir, 45));
  app.nodes.require("sun").setLight?.({ intensity: 4.2 * smooth(-0.02, 0.25, sinE), color: hex(sunWarm) });
  app.nodes.require("moon").setLight?.({ intensity: 0.9 * (1 - day), color: "#8fb0ff" });
  app.nodes.require("fill").setLight?.({
    intensity: 0.45 + 0.65 * day,
    color: hex(mix3([0.45, 0.55, 0.85], [0.8, 0.88, 1], day))
  });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const horizon = mix3(mix3(NIGHT_SKY, DAY_SKY, day), DUSK_SKY, dusk * 0.7 * (0.3 + 0.7 * day));
  app.atmosphere?.setFog({ color: hex(horizon) });

  const lightIsSun = sinE > 0;
  const ld = lightIsSun ? sunDir : moonDir;
  const lc: V3 = lightIsSun ? scaleV(sunWarm, 0.4 + 0.6 * day) : [0.35, 0.45, 0.7];
  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", clock);
  water.setUniform?.("dayLight", day);
  water.setUniform?.("lightDir", ld);
  water.setUniform?.("lightCol", lc);
  water.setUniform?.("skyCol", horizon);

  // slow orbit around the island
  const ang = 0.55 + clock * 0.12;
  app.camera?.setPose({ position: [Math.sin(ang) * 40, 18, Math.cos(ang) * 40], target: [0, 0.5, 0] });
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
