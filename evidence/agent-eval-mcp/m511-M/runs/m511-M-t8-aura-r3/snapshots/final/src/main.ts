import {
  camera,
  createAuraApp,
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

const DAY_SECONDS = 20; // one full 24 h cycle
const START_HOUR = 9;

// ---------- deterministic random ----------
let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const hash2 = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- island height field ----------
const ISLAND_R = 18;
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const rr = r * (1 + 0.12 * Math.sin(3 * th + 1) + 0.08 * Math.sin(5 * th + 2));
  const q = rr / ISLAND_R;
  const h = 5.5 * (1 - q * q) - 0.6 + 0.45 * Math.sin(x * 0.55 + 1) * Math.cos(z * 0.5) + 0.25 * Math.sin(x * 1.3 + z * 0.9);
  return Math.max(h, -3);
};

const faceColor = (h: number, jitter: number): [number, number, number, number] => {
  const j = 0.88 + jitter * 0.24;
  let c: [number, number, number];
  if (h < -0.1) c = [0.42, 0.36, 0.24];
  else if (h < 0.7) c = [0.82, 0.72, 0.46];
  else if (h < 3.1) c = jitter > 0.5 ? [0.2, 0.44, 0.14] : [0.27, 0.5, 0.17];
  else if (h < 4.4) c = [0.45, 0.4, 0.34];
  else c = [0.58, 0.55, 0.52];
  return [c[0] * j, c[1] * j, c[2] * j, 1];
};

// Flat-shaded terrain: every triangle owns its three vertices and a face normal.
const CELLS = 52;
const EXTENT = 52;
const triCount = CELLS * CELLS * 2;
const positions = new Float32Array(triCount * 9);
const normals = new Float32Array(triCount * 9);
const colors = new Float32Array(triCount * 12);
const indices: number[] = [];
{
  let t = 0;
  const px = (i: number): number => (i / CELLS - 0.5) * EXTENT;
  const addTri = (a: [number, number], b: [number, number], c: [number, number]): void => {
    const pa = [a[0], heightAt(a[0], a[1]), a[1]];
    const pb = [b[0], heightAt(b[0], b[1]), b[1]];
    const pc = [c[0], heightAt(c[0], c[1]), c[1]];
    const ux = pb[0]! - pa[0]!, uy = pb[1]! - pa[1]!, uz = pb[2]! - pa[2]!;
    const vx = pc[0]! - pa[0]!, vy = pc[1]! - pa[1]!, vz = pc[2]! - pa[2]!;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const avg = (pa[1]! + pb[1]! + pc[1]!) / 3;
    const col = faceColor(avg, hash2(a[0] * 3.1 + c[0], a[1] * 2.7 + b[1]));
    [pa, pb, pc].forEach((p, k) => {
      const v = t * 3 + k;
      positions.set(p as number[], v * 3);
      normals.set([nx, ny, nz], v * 3);
      colors.set(col, v * 4);
      indices.push(v);
    });
    t += 1;
  };
  for (let j = 0; j < CELLS; j += 1) {
    for (let i = 0; i < CELLS; i += 1) {
      const a: [number, number] = [px(i), px(j)];
      const b: [number, number] = [px(i), px(j + 1)];
      const c: [number, number] = [px(i + 1), px(j)];
      const d: [number, number] = [px(i + 1), px(j + 1)];
      addTri(a, b, c);
      addTri(c, b, d);
    }
  }
}

// ---------- props: trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crownsLow: AuraTransformSpec[] = [];
const crownsHigh: AuraTransformSpec[] = [];
for (let n = 0, tries = 0; n < 16 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 2 + rand() * 13;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightAt(x, z);
  if (h < 0.9 || h > 3.6) continue;
  const s = 0.8 + rand() * 0.6;
  trunks.push({ position: [x, h + 0.6 * s, z], scale: [0.32 * s, 1.2 * s, 0.32 * s] });
  crownsLow.push({ position: [x, h + 2.0 * s, z], scale: [2.2 * s, 2.2 * s, 2.2 * s], rotation: [0, rand() * 3, 0] });
  crownsHigh.push({ position: [x, h + 3.2 * s, z], scale: [1.5 * s, 1.9 * s, 1.5 * s], rotation: [0, rand() * 3, 0] });
  n += 1;
}
const rocks: AuraTransformSpec[] = [];
for (let n = 0, tries = 0; n < 14 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2;
  const r = 4 + rand() * 17;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightAt(x, z);
  if (h < -0.4 || h > 4.2) continue;
  const s = 0.5 + rand() * 1.1;
  rocks.push({
    position: [x, h + 0.2 * s, z],
    scale: [s * 1.2, s * 0.9, s],
    rotation: [rand() * 0.8, rand() * 6.28, rand() * 0.8]
  });
  n += 1;
}

// ---------- water (custom shader) ----------
const WN = 200;
const WSIZE = 300;
const wPos = new Float32Array((WN + 1) ** 2 * 3);
const wNrm = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    wPos.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
    wNrm[v * 3 + 1] = 1;
    if (i < WN && j < WN) wIdx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
float waveH(vec2 p, float t) {
  return sin(p.x * 0.45 + p.y * 0.30 + t * 1.2) * 0.30
       + sin(p.x * -0.30 + p.y * 0.50 + t * 1.5) * 0.20
       + sin(p.x * 0.90 + p.y * 0.70 + t * 2.1) * 0.08;
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
  // faceted normal from screen-space derivatives gives low-poly water
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);

  float day = dayAmt;
  vec3 sunDir = normalize(vec3(sunX, sunY, sunZ));
  vec3 lightDir = sunY > 0.0 ? sunDir : -sunDir;
  vec3 lightCol = sunY > 0.0 ? mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.55, 0.3), twi) : vec3(0.45, 0.55, 0.9);

  vec3 skyCol = mix(vec3(0.03, 0.05, 0.13), vec3(0.58, 0.77, 0.95), day);
  skyCol = mix(skyCol, vec3(0.95, 0.55, 0.38), twi * 0.45);

  float r = length(vPos.xz);
  float th = atan(vPos.z, vPos.x);
  float rr = r * (1.0 + 0.12 * sin(3.0 * th + 1.0) + 0.08 * sin(5.0 * th + 2.0));
  float shallow = 1.0 - smoothstep(17.0, 30.0, rr);

  vec3 deep = vec3(0.03, 0.22, 0.38);
  vec3 lagoon = vec3(0.12, 0.62, 0.62);
  vec3 body = mix(deep, lagoon, shallow);
  body *= 0.32 + 0.68 * day;
  float diff = max(dot(n, lightDir), 0.0);
  body += lightCol * diff * 0.12 * (0.4 + 0.6 * day);

  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  vec3 col = mix(body, skyCol, clamp(fres * 0.85 + 0.05, 0.0, 1.0));

  float glint = pow(max(dot(reflect(-lightDir, n), v), 0.0), 90.0);
  float lightVis = sunY > 0.0 ? smoothstep(0.0, 0.15, sunY) : smoothstep(0.0, 0.15, -sunY) * 0.5;
  col += lightCol * glint * 1.2 * lightVis;

  // animated foam ring along the shore
  float band = 1.0 - smoothstep(0.0, 2.2, rr - 16.6);
  float pulse = 0.55 + 0.45 * sin(rr * 3.0 - waveClock * 2.0 + vPos.y * 6.0);
  float foam = band * pulse * smoothstep(0.35, 0.7, pulse);
  col = mix(col, vec3(0.95, 0.98, 1.0) * (0.3 + 0.7 * day), clamp(foam, 0.0, 0.85));

  // fade to the horizon colour with distance
  float dist = length(vPos - cameraPosition);
  col = mix(col, skyCol, smoothstep(70.0, 190.0, dist));

  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    sunX: { type: "f32", value: 0 },
    sunY: { type: "f32", value: 1 },
    sunZ: { type: "f32", value: 0 },
    dayAmt: { type: "f32", value: 1 },
    twi: { type: "f32", value: 0 }
  },
  fog: false
});

// ---------- sun / sky helpers ----------
const MAX_ELEV = 55;
const sunAngles = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * MAX_ELEV,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirAt = (elevationDeg: number, azimuthDeg: number): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const scale3 = (d: [number, number, number], k: number): [number, number, number] => [d[0] * k, d[1] * k, d[2] * k];
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
type RGB = readonly [number, number, number];
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (c: RGB): string =>
  "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");

const hour0 = START_HOUR;
const s0 = sunAngles(hour0);

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "fill", skyColor: "#cfe3ff", groundColor: "#4a5a3a", intensity: 1.0 }).runtime({ id: "fill", mutable: true }))
    .add(
      lights
        .directional({ name: "sun", position: scale3(dirAt(s0.elevationDeg, s0.azimuthDeg), 50), target: [0, 0, 0], intensity: 4, color: "#fff0d0", shadow: true })
        .runtime({ id: "sun", mutable: true })
    )
    .add(
      lights
        .directional({ name: "moon", position: scale3(dirAt(-s0.elevationDeg, s0.azimuthDeg + 180), 50), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" })
        .runtime({ id: "moon", mutable: true })
    )
    .add(
      geometry.custom(
        geometry.define({ positions, normals, colors, indices, bounds: { min: [-EXTENT / 2, -4, -EXTENT / 2], max: [EXTENT / 2, 8, EXTENT / 2] } }),
        { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }) }
      )
    )
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6a4526", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crownsLow", transforms: crownsLow, material: material.pbr({ color: "#2c7a3a", roughness: 1 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crownsHigh", transforms: crownsHigh, material: material.pbr({ color: "#378a42", roughness: 1 }), params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#8a8780", roughness: 1 }) }))
    .add(
      geometry
        .custom(
          geometry.define({ positions: wPos, normals: wNrm, indices: wIdx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
          { name: "water", material: waterMaterial, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 16, 38], target: [0, 1.5, 0], fov: 46, near: 0.5, far: 600 }))
});

const NIGHT_SKY: RGB = [0.28, 0.34, 0.6];
const DAY_SKY: RGB = [0.81, 0.89, 1];
const WARM: RGB = [1, 0.55, 0.28];
const WHITE_WARM: RGB = [1, 0.95, 0.82];

const applyTime = (hour: number, clock: number): void => {
  const s = sunAngles(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const day = smooth(-0.08, 0.3, sinE);
  const twi = Math.exp(-((sinE / 0.22) ** 2));
  const sd = dirAt(s.elevationDeg, s.azimuthDeg);
  const md = dirAt(-s.elevationDeg, s.azimuthDeg + 180);

  const sun = app.nodes.require("sun");
  sun.setPosition(...scale3(sd, 50));
  sun.setLight?.({ intensity: 4 * smooth(-0.02, 0.28, sinE), color: hex(mixRgb(WHITE_WARM, WARM, twi)) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...scale3(md, 50));
  moon.setLight?.({ intensity: 0.15 + 0.6 * (1 - day) });
  app.nodes.require("fill").setLight?.({
    intensity: 0.5 + 0.7 * day,
    color: hex(mixRgb(NIGHT_SKY, DAY_SKY, day))
  });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", clock);
  water.setUniform?.("sunX", sd[0]);
  water.setUniform?.("sunY", sd[1]);
  water.setUniform?.("sunZ", sd[2]);
  water.setUniform?.("dayAmt", day);
  water.setUniform?.("twi", twi);
};

const CAM_RADIUS = 38;
const CAM_HEIGHT = 16;
let clock = 0;
app.onFrame((frame) => {
  clock += frame.dt;
  applyTime((hour0 + (clock / DAY_SECONDS) * 24) % 24, clock);
  const a = Math.PI / 2 + clock * 0.12;
  app.camera?.setPose({
    position: [Math.cos(a) * CAM_RADIUS, CAM_HEIGHT, Math.sin(a) * CAM_RADIUS],
    target: [0, 1.5, 0]
  });
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
