import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

// Low-poly island with animated water and a 20 second day/night cycle.
// ?hour=14 freezes the clock for a capture.
const fixedHour = new URLSearchParams(location.search).get("hour");
const DAY_SECONDS = 20;
const START_HOUR = 9;

type Vec3 = [number, number, number];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: Vec3): string => "#" + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");

// Seeded random so the island is identical on every load.
let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- island height field ----------
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const shoreR = 13 + 2.2 * Math.sin(3 * a + 1) + 1.3 * Math.sin(5 * a + 2) + 0.8 * Math.sin(2 * a);
  const d = r / shoreR;
  const hills = 1.1 * Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.4) + 0.6 * Math.sin(x * 0.9 + z * 0.7);
  const peak = 2.6 * Math.exp(-(((x - 1.5) ** 2) + ((z + 1) ** 2)) / 22);
  const h = 3.4 * (1 - d * d) - 0.35 + (hills * 0.6 + peak) * smooth(1.05, 0.5, d);
  return Math.max(h, -3);
};

// ---------- flat-shaded terrain ----------
const CELLS = 44;
const SIZE = 40;
const step = SIZE / CELLS;
const grid: Vec3[] = [];
for (let j = 0; j <= CELLS; j += 1) {
  for (let i = 0; i <= CELLS; i += 1) {
    const edge = i === 0 || j === 0 || i === CELLS || j === CELLS;
    const x = (i - CELLS / 2) * step + (edge ? 0 : (rand() - 0.5) * step * 0.7);
    const z = (j - CELLS / 2) * step + (edge ? 0 : (rand() - 0.5) * step * 0.7);
    grid.push([x, heightAt(x, z), z]);
  }
}
const triPositions: number[] = [];
const triNormals: number[] = [];
const triColors: number[] = [];
const paint = (h: number): [number, number, number] => {
  const v = (rand() - 0.5) * 0.06;
  if (h < -0.4) return [0.5 + v, 0.46 + v, 0.32 + v]; // sea floor
  if (h < 0.45) return [0.78 + v, 0.68 + v, 0.42 + v]; // sand
  if (h < 2.7) return [0.18 + v, 0.42 + v * 1.5, 0.12 + v]; // grass
  if (h < 4.1) return [0.28 + v, 0.34 + v, 0.14 + v]; // dry grass
  return [0.5 + v, 0.47 + v, 0.44 + v]; // rock
};
const pushTri = (a: Vec3, b: Vec3, c: Vec3): void => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const col = paint((a[1] + b[1] + c[1]) / 3);
  for (const p of [a, b, c]) {
    triPositions.push(p[0], p[1], p[2]);
    triNormals.push(nx, ny, nz);
    triColors.push(col[0], col[1], col[2], 1);
  }
};
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const p00 = grid[j * (CELLS + 1) + i]!;
    const p10 = grid[j * (CELLS + 1) + i + 1]!;
    const p01 = grid[(j + 1) * (CELLS + 1) + i]!;
    const p11 = grid[(j + 1) * (CELLS + 1) + i + 1]!;
    if ((i + j) % 2 === 0) {
      pushTri(p00, p01, p10);
      pushTri(p10, p01, p11);
    } else {
      pushTri(p00, p01, p11);
      pushTri(p00, p11, p10);
    }
  }
}
const terrainIndices: number[] = [];
for (let i = 0; i < triPositions.length / 3; i += 1) terrainIndices.push(i);
const terrainGeometry = geometry.define({
  positions: new Float32Array(triPositions),
  normals: new Float32Array(triNormals),
  colors: new Float32Array(triColors),
  indices: terrainIndices,
  bounds: { min: [-SIZE / 2, -3.5, -SIZE / 2], max: [SIZE / 2, 8, SIZE / 2] }
});

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const lowerCrowns: AuraTransformSpec[] = [];
const upperCrowns: AuraTransformSpec[] = [];
const crownColors: string[] = [];
const upperColors: string[] = [];
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let tries = 0, placed = 0; placed < 24 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 2 + rand() * 11;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightAt(x, z);
  if (h < 0.7 || h > 3.3) continue;
  const s = 0.75 + rand() * 0.6;
  const g: Vec3 = [0.1 + rand() * 0.08, 0.38 + rand() * 0.12, 0.14 + rand() * 0.06];
  trunks.push({ position: [x, h + 0.5 * s, z], scale: [0.28 * s, 1.0 * s, 0.28 * s] });
  lowerCrowns.push({ position: [x, h + 1.5 * s, z], scale: [1.8 * s, 1.7 * s, 1.8 * s], rotation: [0, rand() * 3, 0] });
  upperCrowns.push({ position: [x, h + 2.4 * s, z], scale: [1.3 * s, 1.5 * s, 1.3 * s], rotation: [0, rand() * 3, 0] });
  crownColors.push(hex(g));
  upperColors.push(hex(mix3(g, [0.3, 0.6, 0.25], 0.3)));
  placed += 1;
}
for (let tries = 0, placed = 0; placed < 11 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 4 + rand() * 12;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightAt(x, z);
  if (h < -0.3 || h > 4) continue;
  const s = 0.4 + rand() * 0.7;
  rocks.push({ position: [x, h + 0.15 * s, z], scale: [s * 1.3, s * 0.9, s], rotation: [rand() * 0.6, rand() * 6, rand() * 0.6] });
  const gr = 0.4 + rand() * 0.15;
  rockColors.push(hex([gr, gr * 0.96, gr * 0.92]));
  placed += 1;
}

// ---------- water ----------
const WN = 100;
const WL = 220;
const wPos = new Float32Array((WN + 1) ** 2 * 3);
const wNrm = new Float32Array(wPos.length);
const wUv = new Float32Array((WN + 1) ** 2 * 2);
const wIdx: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    const u = (i / WN) * 2 - 1, w = (j / WN) * 2 - 1;
    const x = Math.sign(u) * u * u * WL, z = Math.sign(w) * w * w * WL;
    wPos.set([x, 0, z], v * 3);
    wNrm[v * 3 + 1] = 1;
    wUv[v * 2] = heightAt(x, z); // terrain height under this water vertex, used for shallow tint and foam
    if (i < WN && j < WN) wIdx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out float vTerr;
void main() {
  vec2 p = position.xz;
  float t = waveClock;
  float h = sin(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.16
          + sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.11
          + sin(dot(p, vec2(0.4, 0.31)) * 2.2 + t * 1.9) * 0.06;
  vec3 q = vec3(p.x, h, p.y);
  vPos = q;
  vTerr = uv.x;
  gl_Position = modelViewProjectionMatrix * vec4(q, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in float vTerr;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.001);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float shallow = clamp(1.0 + vTerr * 0.4, 0.0, 1.0);
  vec3 body = mix(wDeep, wShallow, shallow * shallow);
  float lit = 0.8 + 0.2 * max(dot(n, wSun), 0.0);
  body *= lit;
  vec3 col = mix(body, wSky, clamp(fres * 0.85 + 0.04, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-wSun, n), v), 0.0), 60.0);
  col += wGlintCol * glint;
  float band = smoothstep(-0.9, -0.35, vTerr) * (1.0 - smoothstep(-0.15, 0.35, vTerr));
  float stripes = 0.5 + 0.5 * sin(vTerr * 9.0 - waveClock * 1.8 + vPos.x * 0.8 + vPos.z * 0.6);
  float foam = band * smoothstep(0.4, 0.75, stripes);
  col = mix(col, mix(wSky, vec3(1.0), 0.6) * wAmb, foam * 0.85);
  float fogT = smoothstep(50.0, 190.0, dist);
  col = mix(col, wSky, fogT);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    wSun: { type: "vec3", value: [0.5, 0.6, 0.3] },
    wSky: { type: "vec3", value: [0.55, 0.75, 0.92] },
    wDeep: { type: "vec3", value: [0.03, 0.22, 0.36] },
    wShallow: { type: "vec3", value: [0.14, 0.58, 0.62] },
    wGlintCol: { type: "vec3", value: [1, 0.9, 0.7] },
    wAmb: { type: "f32", value: 1 }
  }
});

// ---------- sun and moon ----------
const sunAt = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 62 + 8, // risen from about 5h to 19h
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirOf = (elevationDeg: number, azimuthDeg: number): Vec3 => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scaleV = (d: Vec3, k: number): Vec3 => [d[0] * k, d[1] * k, d[2] * k];

const hour0 = fixedHour === null ? START_HOUR : Number(fixedHour);
const s0 = sunAt(hour0);

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ skyColor: "#bcd7ff", groundColor: "#4d5a3c", intensity: 1 }).runtime({ id: "fill", mutable: true }))
    .add(lights.directional({ name: "sun", position: scaleV(dirOf(s0.elevationDeg, s0.azimuthDeg), 40), target: [0, 0, 0], intensity: 3.6, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: scaleV(dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), 40), target: [0, 0, 0], intensity: 0.2, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(terrainGeometry, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns-low", transforms: lowerCrowns, colors: crownColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns-high", transforms: upperCrowns, colors: upperColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }), params: { widthSegments: 5, heightSegments: 3 } }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNrm, uvs: wUv, indices: wIdx, bounds: { min: [-WL, -1, -WL], max: [WL, 1, WL] } }),
      { name: "water", material: water, castShadow: false, receiveShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(effects.fog({ color: "#b7d2ea", density: 0.003 }))
    .camera(camera.perspective({ position: [0, 17, 36], target: [0, 1, 0], fov: 45, near: 0.5, far: 700 }))
});

// ---------- per-frame day/night ----------
const DAY_SKY: Vec3 = [0.58, 0.76, 0.93];
const DUSK_SKY: Vec3 = [0.95, 0.58, 0.4];
const NIGHT_SKY: Vec3 = [0.04, 0.06, 0.14];
const ORBIT_SECONDS = 80;
const ORBIT_RADIUS = 37;
const ORBIT_HEIGHT = 17;
const ORBIT_START = 0;
let clock = 0;
let frames = 0;

const applyTime = (hour: number, seconds: number): void => {
  const s = sunAt(hour);
  const sunDir = dirOf(s.elevationDeg, s.azimuthDeg);
  const moonDir = dirOf(-s.elevationDeg, s.azimuthDeg + 180);
  const day = smooth(-6, 22, s.elevationDeg); // 0 at night, 1 in daylight
  const dusk = smooth(-8, 0, s.elevationDeg) * (1 - smooth(4, 24, s.elevationDeg));
  const sunVisible = smooth(-2, 8, s.elevationDeg);

  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  app.nodes.require("sun").setPosition(...scaleV(sunDir, 40));
  app.nodes.require("moon").setPosition(...scaleV(moonDir, 40));

  const warm = mix3([1, 0.95, 0.86], [1, 0.62, 0.35], dusk);
  app.nodes.require("sun").setLight?.({ intensity: 3.8 * sunVisible, color: hex(warm) });
  app.nodes.require("moon").setLight?.({ intensity: 0.2 + 0.7 * (1 - day), color: "#8fb0ff" });
  const fillSky = mix3(mix3([0.32, 0.4, 0.7], [0.74, 0.84, 1], day), [1, 0.7, 0.55], dusk * 0.5);
  const fillGround = mix3([0.12, 0.15, 0.22], [0.3, 0.36, 0.24], day);
  app.nodes.require("fill").setLight?.({ intensity: 0.6 + 0.5 * day, color: hex(fillSky) });
  void fillGround;

  // Water follows the same sky and light.
  const skyCol = mix3(mix3(NIGHT_SKY, DAY_SKY, day), DUSK_SKY, dusk * 0.7);
  const amb = 0.25 + 0.75 * day;
  const lightDir = s.elevationDeg > 0 ? sunDir : moonDir;
  const glintStrength = s.elevationDeg > 0 ? 1.3 * sunVisible : 0.35 * (1 - day);
  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", seconds);
  w.setUniform?.("wSun", lightDir);
  w.setUniform?.("wSky", skyCol);
  w.setUniform?.("wDeep", [0.03 * amb + 0.01, 0.2 * amb + 0.02, 0.33 * amb + 0.05]);
  w.setUniform?.("wShallow", [0.14 * amb + 0.02, 0.56 * amb + 0.04, 0.6 * amb + 0.06]);
  w.setUniform?.("wGlintCol", scaleV(mix3([1, 0.93, 0.78], [0.7, 0.8, 1], 1 - sunVisible), glintStrength));
  w.setUniform?.("wAmb", amb);

  // Slow orbit.
  const ang = ORBIT_START + (seconds / ORBIT_SECONDS) * Math.PI * 2;
  app.camera?.setPose({ position: [Math.sin(ang) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.cos(ang) * ORBIT_RADIUS], target: [0, 1, 0] }, { cut: true });
};

app.onFrame((frame) => {
  clock += frame.dt;
  const hour = fixedHour === null ? (hour0 + (clock / DAY_SECONDS) * 24) % 24 : hour0;
  applyTime(hour, clock);
  frames += 1;
  if (frames === 2) (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});

await app.ready();
