import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

const DAY_SECONDS = 20;

// ---------- deterministic random ----------
let seed = 11;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- low-poly island (flat shaded: every triangle owns its vertices) ----------
const CELLS = 26;
const SIZE = 36;
const height = (x: number, z: number): number => {
  const r = Math.hypot(x * 1.0, z * 1.15) / (SIZE * 0.5);
  const bumps = 1.1 * Math.sin(x * 0.45 + 0.7) * Math.cos(z * 0.38) + 0.6 * Math.sin(x * 0.9 + z * 0.7);
  return 3.4 * (1 - r * r * 1.9) + bumps * Math.max(0, 1 - r) - 0.6;
};
const shade = (h: number): [number, number, number, number] =>
  h < 0.35 ? [0.82, 0.72, 0.46, 1] : h < 2.2 ? [0.25, 0.55, 0.2, 1] : h < 3.2 ? [0.45, 0.4, 0.34, 1] : [0.92, 0.94, 0.96, 1];

const pts: number[][] = [];
for (let j = 0; j <= CELLS; j += 1) {
  for (let i = 0; i <= CELLS; i += 1) {
    const x = (i / CELLS - 0.5) * SIZE + (rand() - 0.5) * 0.8;
    const z = (j / CELLS - 0.5) * SIZE + (rand() - 0.5) * 0.8;
    pts.push([x, Math.max(height(x, z), -2.5), z]);
  }
}
const tris: number[][] = [];
for (let j = 0; j < CELLS; j += 1) {
  for (let i = 0; i < CELLS; i += 1) {
    const a = j * (CELLS + 1) + i, b = a + 1, c = a + CELLS + 1, d = c + 1;
    tris.push([a, c, b], [b, c, d]);
  }
}
const positions = new Float32Array(tris.length * 9);
const normals = new Float32Array(tris.length * 9);
const colors = new Float32Array(tris.length * 12);
const indices: number[] = [];
tris.forEach((t, k) => {
  const p = t.map((id) => pts[id]!) as [number[], number[], number[]];
  const e1 = [p[1][0]! - p[0][0]!, p[1][1]! - p[0][1]!, p[1][2]! - p[0][2]!];
  const e2 = [p[2][0]! - p[0][0]!, p[2][1]! - p[0][1]!, p[2][2]! - p[0][2]!];
  let nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
  let ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
  let nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const avg = (p[0][1]! + p[1][1]! + p[2][1]!) / 3;
  const col = shade(avg);
  const tint = 0.92 + rand() * 0.16;
  for (let v = 0; v < 3; v += 1) {
    const o = k * 3 + v;
    positions.set([p[v]![0]!, p[v]![1]!, p[v]![2]!], o * 3);
    normals.set([nx, ny, nz], o * 3);
    colors.set([col[0] * tint, col[1] * tint, col[2] * tint, 1], o * 4);
  }
  // keep counter-clockwise facing up regardless of the winding above
  const up = (e1[2]! * e2[0]! - e1[0]! * e2[2]!) >= 0;
  if (up) indices.push(o3(k, 0), o3(k, 1), o3(k, 2));
  else indices.push(o3(k, 0), o3(k, 2), o3(k, 1));
});
function o3(k: number, v: number): number { return k * 3 + v; }

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const crowns: AuraTransformSpec[] = [];
const crowns2: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
for (let n = 0, tries = 0; n < 16 && tries < 600; tries += 1) {
  const x = (rand() - 0.5) * SIZE * 0.7, z = (rand() - 0.5) * SIZE * 0.7;
  const h = height(x, z);
  if (h < 0.7 || h > 2.9) continue;
  const s = 0.8 + rand() * 0.6;
  trunks.push({ position: [x, h + 0.5 * s, z], scale: [0.3 * s, 1.0 * s, 0.3 * s] });
  crowns.push({ position: [x, h + 1.5 * s, z], scale: [1.5 * s, 1.8 * s, 1.5 * s] });
  crowns2.push({ position: [x, h + 2.4 * s, z], scale: [1.1 * s, 1.5 * s, 1.1 * s] });
  n += 1;
}
for (let n = 0, tries = 0; n < 9 && tries < 600; tries += 1) {
  const x = (rand() - 0.5) * SIZE * 0.8, z = (rand() - 0.5) * SIZE * 0.8;
  const h = height(x, z);
  if (h < 0.0 || h > 3.4) continue;
  const s = 0.5 + rand() * 0.7;
  rocks.push({ position: [x, h + 0.25 * s, z], rotation: [0, rand() * 6, 0], scale: [s * 1.2, s * 0.8, s] });
  n += 1;
}

// ---------- sun ----------
const sunAt = (phase: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(phase * Math.PI * 2) * 65,
  azimuthDeg: 90 + phase * 360
});
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 40): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};

// ---------- animated water ----------
const WN = 90, WSIZE = 120;
const wpos = new Float32Array((WN + 1) ** 2 * 3);
const wnor = new Float32Array(wpos.length);
const widx: number[] = [];
for (let j = 0; j <= WN; j += 1) for (let i = 0; i <= WN; i += 1) {
  const v = j * (WN + 1) + i;
  wpos.set([(i / WN - 0.5) * WSIZE, 0, (j / WN - 0.5) * WSIZE], v * 3);
  wnor[v * 3 + 1] = 1;
  if (i < WN && j < WN) widx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
}
const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
void main() {
  vec2 p = position.xz;
  float t = waveClock;
  float a1 = dot(p, vec2(0.21, 0.13)) * 2.2 + t * 1.6;
  float a2 = dot(p, vec2(-0.17, 0.25)) * 2.2 + t * 2.0;
  float a3 = dot(p, vec2(0.4, 0.31)) * 2.2 + t * 2.8;
  float h = sin(a1) * 0.16 + sin(a2) * 0.11 + sin(a3) * 0.05;
  float sx = cos(a1) * 0.16 * 0.462 - cos(a2) * 0.11 * 0.374 + cos(a3) * 0.05 * 0.88;
  float sz = cos(a1) * 0.16 * 0.286 + cos(a2) * 0.11 * 0.55 + cos(a3) * 0.05 * 0.682;
  vec3 pos = vec3(p.x, h - 0.05, p.y);
  vPos = pos;
  vNormal = normalize(vec3(-sx, 1.0, -sz));
  gl_Position = modelViewProjectionMatrix * vec4(pos, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vPos);
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float day = clamp(dayAmount, 0.0, 1.0);
  vec3 deep = mix(vec3(0.01, 0.03, 0.08), vec3(0.03, 0.30, 0.50), day);
  vec3 shallow = mix(vec3(0.02, 0.06, 0.12), vec3(0.12, 0.62, 0.70), day);
  vec3 skyCol = mix(vec3(0.05, 0.08, 0.18), vec3(0.62, 0.80, 0.95), day);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 3.0 + 0.5, 0.0, 1.0));
  vec3 sunDir = normalize(vec3(sunX, sunY, sunZ));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 90.0) * step(0.0, sunY);
  vec3 col = mix(body, skyCol, clamp(fresnel * 0.8 + 0.05, 0.0, 1.0));
  col += vec3(1.0, 0.9, 0.7) * glint * 1.5;
  col += vec3(0.5, 0.65, 1.0) * pow(max(dot(reflect(sunDir, n), v), 0.0), 90.0) * step(sunY, 0.0) * 0.4;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    sunX: { type: "f32", value: 0.5 },
    sunY: { type: "f32", value: 0.5 },
    sunZ: { type: "f32", value: 0.3 },
    dayAmount: { type: "f32", value: 1 }
  }
});

const s0 = sunAt(0.2);
const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#3a4a35", intensity: 0.8 }))
    .add(lights.directional({ name: "sun", position: lightAt(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.6, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: lightAt(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.4, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -4, -SIZE / 2], max: [SIZE / 2, 8, SIZE / 2] } }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 1 }) }
    ))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#6b4a2b", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns", transforms: crowns, material: material.pbr({ color: "#2e7d3a", roughness: 1 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns2", transforms: crowns2, material: material.pbr({ color: "#3a9147", roughness: 1 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#8a8a90", roughness: 1 }), params: { radialSegments: 5 } }))
    .add(geometry.custom(
      geometry.define({ positions: wpos, normals: wnor, indices: widx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(effects.fog({ color: "#a9c4e0", density: 0.004 }))
    .camera(camera.perspective({ position: [26, 20, 30], target: [0, 0.5, 0], fov: 44, near: 0.5, far: 500 }))
});

let clock = 0;
let flagged = false;
app.onFrame((frame) => {
  clock += frame.dt;
  const s = sunAt(0.2 + clock / DAY_SECONDS);
  const [sx, sy, sz] = lightAt(s.elevationDeg, s.azimuthDeg);
  const day = Math.min(1, Math.max(0, (s.elevationDeg + 8) / 25));
  app.nodes.require("sun").setPosition(sx, sy, sz);
  app.nodes.require("moon").setPosition(-sx, -sy, -sz);
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
  const w = app.nodes.require("water");
  w.setUniform?.("waveClock", clock);
  w.setUniform?.("sunX", sx / 40);
  w.setUniform?.("sunY", sy / 40);
  w.setUniform?.("sunZ", sz / 40);
  w.setUniform?.("dayAmount", day);
  if (!flagged) {
    flagged = true;
    (window as unknown as Record<string, unknown>).__EVAL_READY__ = true;
  }
});
await app.ready();
