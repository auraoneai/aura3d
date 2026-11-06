import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const CYCLE_SECONDS = 20;
const fixedHour = new URLSearchParams(location.search).get("hour");

let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- low-poly island (flat shaded: three unique vertices per triangle) ----------
const CELLS = 30;
const SIZE = 32;
const heightAt = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const dome = 5.2 * (1 - (r / 11.5) ** 2);
  const bumps = 0.7 * Math.sin(x * 0.7 + 1.1) * Math.cos(z * 0.6) + 0.5 * Math.sin(x * 0.35 + z * 0.5);
  const h = dome + bumps * Math.min(1, Math.max(0, dome) * 0.4 + 0.2) - 0.2;
  return Math.max(h, -3);
};
const shade = (h: number): [number, number, number] =>
  h < 0.45 ? [0.82, 0.72, 0.46] : h < 3.0 ? [0.22, 0.5, 0.2] : h < 4.4 ? [0.46, 0.4, 0.34] : [0.93, 0.95, 0.98];

const gx = new Float32Array((CELLS + 1) ** 2);
const gy = new Float32Array((CELLS + 1) ** 2);
const gz = new Float32Array((CELLS + 1) ** 2);
for (let j = 0; j <= CELLS; j += 1) for (let i = 0; i <= CELLS; i += 1) {
  const v = j * (CELLS + 1) + i;
  const edge = i === 0 || j === 0 || i === CELLS || j === CELLS;
  const jit = edge ? 0 : 0.35;
  const x = (i / CELLS - 0.5) * SIZE + (rand() - 0.5) * jit * 2;
  const z = (j / CELLS - 0.5) * SIZE + (rand() - 0.5) * jit * 2;
  gx[v] = x; gz[v] = z; gy[v] = heightAt(x, z);
}
const tris: number[][] = [];
for (let j = 0; j < CELLS; j += 1) for (let i = 0; i < CELLS; i += 1) {
  const v = j * (CELLS + 1) + i;
  tris.push([v, v + CELLS + 1, v + 1], [v + 1, v + CELLS + 1, v + CELLS + 2]);
}
const tPos = new Float32Array(tris.length * 9);
const tNor = new Float32Array(tris.length * 9);
const tCol = new Float32Array(tris.length * 12);
const tIdx: number[] = [];
tris.forEach((t, n) => {
  const [a, b, c] = t as [number, number, number];
  const ux = gx[b]! - gx[a]!, uy = gy[b]! - gy[a]!, uz = gz[b]! - gz[a]!;
  const wx = gx[c]! - gx[a]!, wy = gy[c]! - gy[a]!, wz = gz[c]! - gz[a]!;
  let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const len = Math.hypot(nx, ny, nz) || 1;
  const avg = (gy[a]! + gy[b]! + gy[c]!) / 3;
  const base = shade(avg);
  const k = 0.88 + rand() * 0.2;
  [a, b, c].forEach((vi, m) => {
    const o = n * 3 + m;
    tPos.set([gx[vi]!, gy[vi]!, gz[vi]!], o * 3);
    tNor.set([nx / len, ny / len, nz / len], o * 3);
    tCol.set([base[0] * k, base[1] * k, base[2] * k, 1], o * 4);
    tIdx.push(o);
  });
});

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crowns: AuraTransformSpec[] = [];
const crowns2: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
for (let tries = 0, placed = 0; tries < 400 && placed < 16; tries += 1) {
  const a = rand() * Math.PI * 2, r = 1 + rand() * 9;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
  if (h < 0.7 || h > 3.6) continue;
  const s = 0.7 + rand() * 0.6;
  const y = h - 0.2;
  trunks.push({ position: [x, y + 0.5 * s, z], scale: [0.3 * s, 1.0 * s, 0.3 * s] });
  crowns.push({ position: [x, y + 1.5 * s, z], scale: [1.6 * s, 1.7 * s, 1.6 * s] });
  crowns2.push({ position: [x, y + 2.4 * s, z], scale: [1.2 * s, 1.4 * s, 1.2 * s] });
  placed += 1;
}
for (let tries = 0, placed = 0; tries < 300 && placed < 9; tries += 1) {
  const a = rand() * Math.PI * 2, r = 5 + rand() * 7;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
  if (h < -0.3 || h > 2) continue;
  const s = 0.5 + rand() * 0.7;
  rocks.push({ position: [x, h + 0.15 * s, z], scale: [1.3 * s, 0.9 * s, 1.1 * s] });
  placed += 1;
}

// ---------- animated water ----------
const WN = 110, WSIZE = 140;
const wPos = new Float32Array((WN + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= WN; j += 1) for (let i = 0; i <= WN; i += 1) {
  const v = j * (WN + 1) + i;
  wPos.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
  wNor[v * 3 + 1] = 1;
  if (i < WN && j < WN) wIdx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
void addWave(vec2 p, vec2 d, float f, float a, float s, float t, inout float h, inout vec2 slope) {
  float ph = dot(p, d) * f + t * s;
  h += a * sin(ph);
  slope += a * f * cos(ph) * d;
}
void main() {
  float h = 0.0;
  vec2 slope = vec2(0.0);
  vec2 p = position.xz;
  addWave(p, normalize(vec2(1.0, 0.4)), 0.55, 0.14, 1.3, waveClock, h, slope);
  addWave(p, normalize(vec2(-0.5, 1.0)), 0.85, 0.09, 1.7, waveClock, h, slope);
  addWave(p, normalize(vec2(0.7, -0.8)), 1.5, 0.045, 2.4, waveClock, h, slope);
  vec3 q = vec3(p.x, h - 0.05, p.y);
  vPos = q;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(q, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vPos);
  float day = clamp(dayAmt, 0.0, 1.0);
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float r = length(vPos.xz);
  float shore = smoothstep(17.0, 9.5, r);
  vec3 deep = mix(vec3(0.01, 0.04, 0.10), vec3(0.03, 0.26, 0.42), day);
  vec3 shallow = mix(vec3(0.03, 0.12, 0.2), vec3(0.15, 0.62, 0.66), day);
  vec3 body = mix(deep, shallow, shore);
  vec3 skyCol = mix(vec3(0.05, 0.08, 0.18), vec3(0.62, 0.78, 0.94), day);
  vec3 L = normalize(vec3(sunX, sunY, sunZ));
  float up = L.y > 0.0 ? 1.0 : 0.0;
  vec3 Ld = up > 0.5 ? L : -L;
  vec3 glintCol = up > 0.5 ? vec3(1.0, 0.9, 0.7) : vec3(0.5, 0.65, 1.0);
  float glint = pow(max(dot(reflect(-Ld, n), v), 0.0), 90.0) * (up > 0.5 ? 1.4 : 0.6);
  float foam = smoothstep(0.0, 1.0, (1.0 - abs(r - 11.2) / 0.8)) * (0.5 + 0.5 * sin(vPos.x * 3.0 + vPos.z * 2.0 + waveClock * 2.0));
  foam = clamp(foam, 0.0, 1.0) * 0.35;
  float lit = 0.35 + 0.65 * day;
  vec3 col = mix(body, skyCol, clamp(fresnel * 0.85 + 0.06, 0.0, 1.0)) + glintCol * glint + vec3(foam) * lit;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    dayAmt: { type: "f32", value: 1 },
    sunX: { type: "f32", value: 0.5 },
    sunY: { type: "f32", value: 0.6 },
    sunZ: { type: "f32", value: 0.3 }
  }
});

// ---------- sun / moon ----------
const sunDir = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 65,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const dirOf = (elevationDeg: number, azimuthDeg: number): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const at = (d: [number, number, number], dist = 40): [number, number, number] => [d[0] * dist, d[1] * dist, d[2] * dist];

const hour0 = fixedHour === null ? 9 : Number(fixedHour);
const s0 = sunDir(hour0);

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#3a4a38", intensity: 0.9 }))
    .add(lights.directional({ name: "sun", position: at(dirOf(s0.elevationDeg, s0.azimuthDeg)), target: [0, 0, 0], intensity: 3.6, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: at(dirOf(-s0.elevationDeg, s0.azimuthDeg + 180)), target: [0, 0, 0], intensity: 0.9, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({ positions: tPos, normals: tNor, colors: tCol, indices: tIdx, bounds: { min: [-SIZE / 2, -4, -SIZE / 2], max: [SIZE / 2, 8, SIZE / 2] } }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }) }
    ))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns", transforms: crowns, material: material.pbr({ color: "#2f7a3a", roughness: 1 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns2", transforms: crowns2, material: material.pbr({ color: "#3b8f45", roughness: 1 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#8a8a90", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(effects.fog({ color: "#a9c4e0", density: 0.004 }))
    .camera(camera.perspective({ position: [0, 17, 38], target: [0, 0.5, 0], fov: 45, near: 0.5, far: 500 }))
});

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mixHex = (c0: [number, number, number], c1: [number, number, number], t: number): string =>
  "#" + [0, 1, 2].map((i) => Math.round((c0[i]! + (c1[i]! - c0[i]!) * t) * 255).toString(16).padStart(2, "0")).join("");

let clock = 0;
let frameNo = 0;
app.onFrame((frame) => {
  clock += frame.dt;
  frameNo += 1;
  const hour = fixedHour === null ? (hour0 + (clock / CYCLE_SECONDS) * 24) % 24 : hour0;
  const s = sunDir(hour);
  const d = dirOf(s.elevationDeg, s.azimuthDeg);
  const day = smooth(-8, 14, s.elevationDeg);
  app.nodes.require("sun").setPosition(...at(d));
  app.nodes.require("moon").setPosition(...at([-d[0], -d[1], -d[2]]));
  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", clock);
  w.setUniform?.("dayAmt", day);
  w.setUniform?.("sunX", d[0]);
  w.setUniform?.("sunY", d[1]);
  w.setUniform?.("sunZ", d[2]);
  if (frameNo % 2 === 0) app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  if (frameNo % 6 === 0) app.atmosphere?.setFog({ color: mixHex([0.07, 0.09, 0.18], [0.66, 0.77, 0.88], day) });
  const ang = 0.35 + clock * 0.12;
  app.camera?.setPose({ position: [Math.sin(ang) * 38, 17, Math.cos(ang) * 38], target: [0, 0.5, 0] });
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
