import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------- constants
const DAY_SECONDS = 20;
const START_HOUR = 9;

// ---------------------------------------------------------------- helpers
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
let seed = 424242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();
const hex = (c: string): V3 => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: V3): string => `rgb(${Math.round(clamp(c[0], 0, 1) * 255)}, ${Math.round(clamp(c[1], 0, 1) * 255)}, ${Math.round(clamp(c[2], 0, 1) * 255)})`;

// ---------------------------------------------------------------- terrain
// Shoreline radius as a function of angle (mirrored in the water shader for the foam ring).
const shore = (a: number): number => 13 + 2.0 * Math.sin(3 * a + 1) + 1.2 * Math.sin(5 * a);
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const d = r / shore(Math.atan2(z, x));
  const dome = 9 * (1 - d * d);
  const bumps = 1.4 * Math.sin(x * 0.6 + 1) * Math.cos(z * 0.5) * clamp(1 - d, 0, 1);
  const peak = 2.2 * Math.exp(-(((x + 2.5) ** 2) + ((z - 1.5) ** 2)) / 14);
  return Math.max(-1.5, dome + bumps + peak);
};

const G = 46, S = 46;
const gridPoint = (i: number, j: number): V3 => {
  const jx = (hash(i, j) - 0.5) * 0.7, jz = (hash(j + 17, i + 3) - 0.5) * 0.7;
  const x = (i / G - 0.5) * S + jx, z = (j / G - 0.5) * S + jz;
  const h = heightAt(x, z);
  return [x, h > -1.4 ? h + (hash(i + 5, j + 9) - 0.5) * 0.5 * clamp(h / 2, 0, 1) : h, z];
};

const tPos: number[] = [], tNor: number[] = [], tCol: number[] = [];
const face = (a: V3, b: V3, c: V3, fi: number): void => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as V3, w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as V3;
  let n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  const k = n[1] < 0 ? -1 : 1;
  n = [(n[0] * k) / l, (n[1] * k) / l, (n[2] * k) / l];
  const y = (a[1] + b[1] + c[1]) / 3;
  const slope = 1 - n[1];
  let rgb: V3;
  if (y < -0.3) rgb = [0.55, 0.5, 0.36];
  else if (y < 0.7) rgb = [0.86, 0.77, 0.52];
  else if (y < 5.2 && slope < 0.38) rgb = [0.24, 0.52, 0.2];
  else if (y < 5.2) rgb = [0.42, 0.36, 0.3];
  else rgb = [0.55, 0.52, 0.48];
  const v = 0.88 + 0.24 * hash(fi, fi * 0.37 + 2);
  rgb = [rgb[0] * v, rgb[1] * v, rgb[2] * v];
  const verts = k > 0 ? [a, b, c] : [a, c, b];
  for (const p of verts) { tPos.push(p[0], p[1], p[2]); tNor.push(n[0], n[1], n[2]); tCol.push(rgb[0], rgb[1], rgb[2], 1); }
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    const f = (j * G + i) * 2;
    face(gridPoint(i, j), gridPoint(i, j + 1), gridPoint(i + 1, j), f);
    face(gridPoint(i + 1, j), gridPoint(i, j + 1), gridPoint(i + 1, j + 1), f + 1);
  }
}
const terrain = geometry.custom(
  geometry.define({
    positions: new Float32Array(tPos),
    normals: new Float32Array(tNor),
    colors: new Float32Array(tCol),
    indices: Array.from({ length: tPos.length / 3 }, (_, i) => i),
    bounds: { min: [-S / 2 - 1, -2, -S / 2 - 1], max: [S / 2 + 1, 12, S / 2 + 1] }
  }),
  { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
);

// ---------------------------------------------------------------- trees and rocks
const trunks: AuraTransformSpec[] = [];
const crowns: AuraTransformSpec[] = [];
const crownColors: string[] = [];
for (let n = 0, tries = 0; n < 34 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2, r = between(2, 15);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightAt(x, z);
  const e = 0.6;
  const slope = Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  if (h < 0.9 || h > 5.2 || slope > 1.1) continue;
  const s = between(0.8, 1.35);
  const y = h - 0.3;
  trunks.push({ position: [x, y + 0.6 * s, z], scale: [0.32 * s, 1.2 * s, 0.32 * s] });
  crowns.push({ position: [x, y + 2.1 * s, z], rotation: [0, rand() * 3, 0], scale: [2.1 * s, 2.6 * s, 2.1 * s] });
  crowns.push({ position: [x, y + 3.3 * s, z], rotation: [0, rand() * 3, 0], scale: [1.5 * s, 2.2 * s, 1.5 * s] });
  const c = `hsl(${128 + Math.floor(rand() * 25)}, 48%, ${24 + Math.floor(rand() * 12)}%)`;
  crownColors.push(c, c);
  n += 1;
}
const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let n = 0, tries = 0; n < 22 && tries < 600; tries += 1) {
  const a = rand() * Math.PI * 2, r = between(4, 18);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightAt(x, z);
  if (h < -0.2 || h > 6) continue;
  const s = between(0.45, 1.3);
  rocks.push({ position: [x, h + s * 0.1, z], rotation: [between(0, 1), between(0, 6), between(0, 1)], scale: [s * 1.3, s * 0.9, s] });
  rockColors.push(`hsl(${25 + Math.floor(rand() * 15)}, 6%, ${38 + Math.floor(rand() * 22)}%)`);
  n += 1;
}

// ---------------------------------------------------------------- water
const WN = 110, WSIZE = 300;
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
  vec3 q = vec3(p.x, h - 0.05, p.y);
  vPos = q;
  gl_Position = modelViewProjectionMatrix * vec4(q, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  float dist = length(cameraPosition - vPos);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);

  float r = length(vPos.xz);
  float a = atan(vPos.z, vPos.x);
  float R = 13.0 + 2.0 * sin(3.0 * a + 1.0) + 1.2 * sin(5.0 * a);
  float near = 1.0 - smoothstep(R - 1.0, R + 9.0, r);

  vec3 deep = vec3(0.03, 0.22, 0.38);
  vec3 shallow = vec3(0.12, 0.62, 0.66);
  vec3 body = mix(deep, shallow, clamp(near * 0.95 + vPos.y * 0.8, 0.0, 1.0));

  float diff = max(dot(n, normalize(sunDir)), 0.0);
  vec3 lit = body * (vec3(ambient) * skyCol * 1.4 + 0.55 * diff * sunCol);
  vec3 col = mix(lit, skyCol * (0.55 + 0.45 * ambient), clamp(fres * 0.85 + 0.05, 0.0, 1.0));

  float glint = pow(max(dot(reflect(-normalize(sunDir), n), v), 0.0), 90.0);
  col += sunCol * glint * 1.2;

  float ring = smoothstep(R + 2.2, R + 0.2, r) * smoothstep(R - 1.5, R - 0.1, r);
  float pulse = 0.55 + 0.45 * sin(r * 2.6 - waveClock * 1.8 + sin(a * 9.0) * 1.5);
  float foam = clamp(ring * (0.35 + 0.65 * pulse), 0.0, 1.0);
  col = mix(col, vec3(0.95, 0.98, 1.0) * (0.35 + 0.65 * ambient), foam * 0.85);

  col = mix(col, skyCol, 1.0 - exp(-dist * 0.006 * dist * 0.012));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    ambient: { type: "f32", value: 1 },
    sunDir: { type: "vec3", value: [0.5, 0.6, 0.3] },
    sunCol: { type: "vec3", value: [1, 0.95, 0.8] },
    skyCol: { type: "vec3", value: [0.6, 0.77, 0.92] }
  }
});

// ---------------------------------------------------------------- sky and sun
const sunAt = (h: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70,
  azimuthDeg: 90 + ((h - 6) / 12) * 180
});
const dirOf = (e: number, a: number, d = 40): V3 => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};

const s0 = sunAt(START_HOUR);
const app = createAuraApp("#app", {
  scene: scene({ background: "#9cc4ea" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 500 } }))
    .add(lights.hemisphere({ name: "hemi", skyColor: "#bcd6f5", groundColor: "#4a5a3c", intensity: 0.9 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: dirOf(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(terrain)
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6a4a2c", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns", transforms: crowns, colors: crownColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 5 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }) }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(effects.fog({ color: "#9cc4ea", density: 0.004 }))
    .camera(camera.orbit({ position: [0, 12, 36], target: [0, 3, 0], fov: 50, near: 0.5, far: 500, autoRotate: 0.1 }))
});

const DAY_SKY = hex("#9cc4ea"), NIGHT_SKY = hex("#16224a"), DUSK = hex("#f0905a");
const SUN_COL = hex("#fff0d0"), MOON_COL = hex("#8fb0ff");
let clock = 0;
app.onFrame((f) => {
  clock += f.dt;
  const hour = (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
  const s = sunAt(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const day = smoothstep(-0.08, 0.3, sinE);
  const dusk = Math.exp(-((sinE / 0.22) ** 2));

  const sunPos = dirOf(s.elevationDeg, s.azimuthDeg);
  const moonPos = dirOf(-s.elevationDeg, s.azimuthDeg + 180);
  app.nodes.require("sun").setPosition(...sunPos);
  app.nodes.require("moon").setPosition(...moonPos);
  const sunI = 3.4 * Math.max(0, sinE) ** 0.8;
  const moonI = 0.35 * (1 - day) + 0.1;
  app.nodes.require("sun").setLight?.({ intensity: sunI, color: css(mix3(SUN_COL, DUSK, dusk * 0.6)) });
  app.nodes.require("moon").setLight?.({ intensity: moonI });
  app.nodes.require("hemi").setLight?.({
    intensity: 0.32 + 0.75 * day,
    skyColor: css(mix3(hex("#4a5f9a"), hex("#bcd6f5"), day)),
    groundColor: css(mix3(hex("#1c2438"), hex("#4a5a3c"), day))
  });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const skyCol = mix3(mix3(NIGHT_SKY, DAY_SKY, day), DUSK, dusk * 0.5);
  app.atmosphere?.setFog({ color: css(skyCol), density: 0.004 });

  const up = sinE >= 0;
  const lp = up ? sunPos : moonPos;
  const ll = Math.hypot(lp[0], lp[1], lp[2]);
  const lightCol = mix3(
    [MOON_COL[0] * 0.35 * (1 - day), MOON_COL[1] * 0.35 * (1 - day), MOON_COL[2] * 0.35 * (1 - day)],
    mix3(SUN_COL, DUSK, dusk * 0.6),
    up ? 1 : 0
  );
  const sunStrength = up ? Math.min(1, sinE * 3) : 0;
  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", clock * 1.2);
  w.setUniform?.("sunDir", [lp[0] / ll, lp[1] / ll, lp[2] / ll]);
  w.setUniform?.("sunCol", [lightCol[0] * (up ? sunStrength : 1), lightCol[1] * (up ? sunStrength : 1), lightCol[2] * (up ? sunStrength : 1)]);
  w.setUniform?.("skyCol", skyCol);
  w.setUniform?.("ambient", 0.35 + 0.65 * day);
});

await app.ready();
requestAnimationFrame(() => { window.__EVAL_READY__ = true; });
