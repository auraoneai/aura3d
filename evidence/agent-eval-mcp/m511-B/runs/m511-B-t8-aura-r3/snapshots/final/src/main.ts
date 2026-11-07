import { camera, createAuraApp, geometry, interactions, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type RGB = [number, number, number];

// ---------------------------------------------------------------- island shape
const shoreRadius = (a: number): number => 9 + 1.2 * Math.sin(3 * a + 1) + 0.7 * Math.sin(5 * a + 2); // mirrored in the water GLSL
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const height = (x: number, z: number): number => {
  const q = Math.hypot(x, z) / shoreRadius(Math.atan2(z, x));
  if (q >= 1) return Math.max(-3, -(q - 1) * 6);
  const t = 1 - q;
  const noise = 0.7 * Math.sin(x * 0.8 + 1) * Math.sin(z * 0.7) + 0.5 * Math.sin(x * 0.45 + z * 0.6);
  return 5.5 * Math.pow(t, 1.3) + 1.6 * Math.exp(-q * q * 9) + noise * Math.min(t * 3, 1) * 0.8;
};

// ---------------------------------------------------------------- flat-shaded mesh builder
const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/** Adds one triangle with a face normal; `ref` is a point on the inner side so the winding faces outward. */
const tri = (a: V3, b: V3, c: V3, color: RGB, ref: V3): void => {
  let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-7) return;
  nx /= len; ny /= len; nz /= len;
  const cx = (a[0] + b[0] + c[0]) / 3 - ref[0], cy = (a[1] + b[1] + c[1]) / 3 - ref[1], cz = (a[2] + b[2] + c[2]) / 3 - ref[2];
  if (nx * cx + ny * cy + nz * cz < 0) {
    [b, c] = [c, b];
    nx = -nx; ny = -ny; nz = -nz;
  }
  for (const p of [a, b, c]) {
    pos.push(p[0], p[1], p[2]);
    nor.push(nx, ny, nz);
    col.push(color[0], color[1], color[2], 1);
  }
};
const shade = (c: RGB, k: number): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

// terrain
const CELLS = 56, SIZE = 40;
const colorFor = (h: number, slope: number): RGB => {
  if (h < 0.55) return [0.86, 0.78, 0.5]; // sand
  if (h > 5.7) return [0.82, 0.8, 0.76]; // pale summit rock
  if (h > 4.0 || slope > 0.9) return [0.46, 0.43, 0.4]; // rock
  return h > 2.2 ? [0.2, 0.5, 0.18] : [0.3, 0.62, 0.22]; // grass
};
const grid: number[] = [];
for (let j = 0; j <= CELLS; j += 1) for (let i = 0; i <= CELLS; i += 1) {
  const x = (i / CELLS - 0.5) * SIZE, z = (j / CELLS - 0.5) * SIZE;
  grid.push(x, height(x, z), z);
}
const gv = (i: number, j: number): V3 => {
  const k = (j * (CELLS + 1) + i) * 3;
  return [grid[k] ?? 0, grid[k + 1] ?? 0, grid[k + 2] ?? 0];
};
const terrainTri = (a: V3, b: V3, c: V3): void => {
  const h = (a[1] + b[1] + c[1]) / 3;
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ny = Math.abs(e1[2] * e2[0] - e1[0] * e2[2]);
  const nl = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny, e1[0] * e2[1] - e1[1] * e2[0]) || 1;
  const slope = Math.sqrt(Math.max(0, 1 - (ny / nl) * (ny / nl))) ; // sin of tilt from horizontal
  tri(a, b, c, shade(colorFor(h, slope), 0.9 + rand() * 0.2), [(a[0] + b[0] + c[0]) / 3, h - 1, (a[2] + b[2] + c[2]) / 3]);
};
for (let j = 0; j < CELLS; j += 1) for (let i = 0; i < CELLS; i += 1) {
  const v00 = gv(i, j), v10 = gv(i + 1, j), v01 = gv(i, j + 1), v11 = gv(i + 1, j + 1);
  terrainTri(v00, v01, v10);
  terrainTri(v10, v01, v11);
}

// props: pine trees and rocks
const cone = (x: number, y: number, z: number, r: number, h: number, sides: number, color: RGB): void => {
  const apex: V3 = [x, y + h, z];
  const ref: V3 = [x, y + h / 3, z];
  const ring: V3[] = [];
  for (let s = 0; s < sides; s += 1) ring.push([x + Math.cos((s / sides) * Math.PI * 2) * r, y, z + Math.sin((s / sides) * Math.PI * 2) * r]);
  for (let s = 0; s < sides; s += 1) {
    const a = ring[s] as V3, b = ring[(s + 1) % sides] as V3;
    tri(apex, a, b, shade(color, 0.85 + rand() * 0.3), ref);
    tri([x, y, z], b, a, shade(color, 0.6), ref);
  }
};
const prism = (x: number, y: number, z: number, r: number, h: number, sides: number, color: RGB): void => {
  const ref: V3 = [x, y + h / 2, z];
  for (let s = 0; s < sides; s += 1) {
    const a0 = (s / sides) * Math.PI * 2, a1 = ((s + 1) / sides) * Math.PI * 2;
    const b0: V3 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], b1: V3 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
    const t0: V3 = [b0[0], y + h, b0[2]], t1: V3 = [b1[0], y + h, b1[2]];
    const c = shade(color, 0.85 + rand() * 0.3);
    tri(b0, b1, t1, c, ref);
    tri(b0, t1, t0, c, ref);
    tri([x, y + h, z], t0, t1, c, ref);
  }
};
const pine = (x: number, z: number, s: number): void => {
  const y = height(x, z) - 0.1;
  prism(x, y, z, 0.17 * s, 1.0 * s, 6, [0.4, 0.26, 0.14]);
  const g: RGB = [0.13 + rand() * 0.06, 0.4 + rand() * 0.1, 0.17];
  cone(x, y + 0.7 * s, z, 1.1 * s, 1.7 * s, 7, g);
  cone(x, y + 1.6 * s, z, 0.8 * s, 1.5 * s, 7, shade(g, 1.12));
  cone(x, y + 2.4 * s, z, 0.5 * s, 1.2 * s, 7, shade(g, 1.25));
};
const rock = (x: number, z: number, s: number, color: RGB): void => {
  const LAT = 4, SEG = 6;
  const cy = height(x, z) + 0.15 * s;
  const rg: V3[][] = [];
  for (let i = 0; i <= LAT; i += 1) {
    const phi = (Math.PI * i) / LAT;
    const row: V3[] = [];
    for (let j = 0; j < SEG; j += 1) {
      const th = (j / SEG) * Math.PI * 2;
      const k = 0.75 + rand() * 0.5;
      row.push([x + Math.cos(th) * Math.sin(phi) * s * k * 1.2, cy + Math.cos(phi) * s * k * 0.8, z + Math.sin(th) * Math.sin(phi) * s * k * 1.2]);
    }
    if (i === 0 || i === LAT) { const p0 = row[0] as V3; for (let j = 0; j < SEG; j += 1) row[j] = p0; }
    rg.push(row);
  }
  const ref: V3 = [x, cy, z];
  for (let i = 0; i < LAT; i += 1) for (let j = 0; j < SEG; j += 1) {
    const r0 = rg[i] as V3[], r1 = rg[i + 1] as V3[];
    const a = r0[j] as V3, b = r0[(j + 1) % SEG] as V3, c = r1[j] as V3, d = r1[(j + 1) % SEG] as V3;
    const sc = shade(color, 0.8 + rand() * 0.4);
    tri(a, c, b, sc, ref);
    tri(b, c, d, sc, ref);
  }
};
let placed = 0, guard = 0;
while (placed < 16 && guard < 600) {
  guard += 1;
  const a = rand() * Math.PI * 2, r = rand() * 9;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (r > shoreRadius(a) * 0.82 || h < 0.8 || h > 3.9) continue;
  pine(x, z, 0.7 + rand() * 0.6);
  placed += 1;
}
for (let k = 0; k < 9; k += 1) {
  const a = rand() * Math.PI * 2;
  const r = shoreRadius(a) * (0.7 + rand() * 0.45);
  rock(Math.cos(a) * r, Math.sin(a) * r, 0.5 + rand() * 0.8, [0.5, 0.48, 0.46]);
}

const islandGeometry = geometry.define({
  positions: new Float32Array(pos),
  normals: new Float32Array(nor),
  colors: new Float32Array(col),
  indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
  bounds: { min: [-SIZE / 2, -3.5, -SIZE / 2], max: [SIZE / 2, 9, SIZE / 2] }
});

// ---------------------------------------------------------------- shared sky function (GLSL)
const SKY_GLSL = /* glsl */ `
float skyDay() { return smoothstep(-0.12, 0.25, sunDir.y); }
vec3 skyBase(vec3 d) {
  float sh = sunDir.y;
  float day = skyDay();
  float tw = exp(-pow(sh * 3.5, 2.0));
  float h = clamp(d.y, 0.0, 1.0);
  vec3 zen = mix(vec3(0.02, 0.04, 0.16), vec3(0.16, 0.40, 0.85), day);
  vec3 hor = mix(vec3(0.07, 0.10, 0.24), vec3(0.68, 0.84, 0.96), day);
  vec3 c = mix(hor, zen, pow(h, 0.55));
  vec2 dh = d.xz, sd2 = sunDir.xz;
  float az = max(dot(dh / (length(dh) + 1e-4), sd2 / (length(sd2) + 1e-4)), 0.0);
  c = mix(c, vec3(1.0, 0.45, 0.18), tw * pow(az, 2.5) * pow(1.0 - h, 2.5) * 0.85);
  c = mix(c, vec3(0.9, 0.55, 0.5), tw * 0.18 * pow(1.0 - h, 2.0));
  return c;
}
float hash13(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
`;
const SKY_UNIFORMS = { sunDir: { type: "vec3" as const, value: [0, 1, 0] } };

const skyMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float day = skyDay();
  vec3 c = skyBase(d);
  float sd = dot(d, sunDir);
  vec3 sunCol = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.95, 0.8), smoothstep(0.0, 0.4, sunDir.y));
  float above = smoothstep(-0.02, 0.04, d.y);
  c += sunCol * (smoothstep(0.9993, 0.9997, sd) * 4.0 + pow(max(sd, 0.0), 40.0) * 0.4 + pow(max(sd, 0.0), 5.0) * 0.1) * above;
  float md = dot(d, -sunDir);
  c += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9994, 0.9997, md) * 1.6 + pow(max(md, 0.0), 80.0) * 0.12) * (1.0 - day) * above;
  vec3 sp = floor(d * 150.0);
  float star = step(0.9965, hash13(sp)) * (0.5 + 0.5 * hash13(sp + 7.0));
  c += vec3(star) * (1.0 - day) * smoothstep(0.02, 0.2, d.y);
  outColor = vec4(c, 1.0);
}`
  },
  uniforms: SKY_UNIFORMS,
  side: "double",
  depthWrite: false,
  fog: false
});

// ---------------------------------------------------------------- water
const N = 240, WSIZE = 240;
const wPos = new Float32Array((N + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wIdx: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  wPos.set([(i / N - 0.5) * WSIZE, 0, (j / N - 0.5) * WSIZE], v * 3);
  wNor[v * 3 + 1] = 1;
  if (i < N && j < N) wIdx.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out float vClock;
void main() {
  vec2 p = position.xz;
  float t = waveClock;
  vClock = t;
  float h = 0.20 * sin(dot(p, vec2(0.50, 0.30)) + t * 1.2)
          + 0.15 * sin(dot(p, vec2(-0.35, 0.55)) + t * 1.6)
          + 0.07 * sin(dot(p, vec2(0.90, -0.70)) + t * 2.3);
  vPos = vec3(p.x, h, p.y);
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in float vClock;
out vec4 outColor;
${SKY_GLSL}
float shoreR(float a) { return 9.0 + 1.2 * sin(3.0 * a + 1.0) + 0.7 * sin(5.0 * a + 2.0); }
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos))); // faceted normal for the low-poly look
  if (n.y < 0.0) n = -n;
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  float day = skyDay();
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float r = length(vPos.xz);
  float d = r - shoreR(atan(vPos.z, vPos.x));
  vec3 deep = mix(vec3(0.02, 0.06, 0.16), vec3(0.04, 0.30, 0.50), day);
  vec3 shallow = mix(vec3(0.05, 0.14, 0.26), vec3(0.18, 0.72, 0.72), day);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 8.0, d));
  body *= 0.85 + 0.5 * (vPos.y + 0.4);
  vec3 rd = reflect(-v, n);
  vec3 sky = skyBase(vec3(rd.x, abs(rd.y), rd.z));
  vec3 c = mix(body, sky, clamp(fres * 0.9 + 0.08, 0.0, 1.0));
  vec3 L = sunDir.y > 0.0 ? sunDir : -sunDir;
  float lightK = mix(0.45, 1.6, smoothstep(0.0, 0.3, abs(sunDir.y)));
  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 80.0);
  vec3 lightCol = sunDir.y > 0.0 ? mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.95, 0.8), smoothstep(0.0, 0.4, sunDir.y)) : vec3(0.7, 0.8, 1.0);
  c += lightCol * glint * lightK;
  float foam = (1.0 - smoothstep(0.1, 1.8, d)) * (0.55 + 0.45 * sin(vClock * 1.8 - d * 4.0));
  c = mix(c, vec3(0.95, 0.98, 1.0) * (0.35 + 0.65 * day), clamp(foam, 0.0, 1.0) * step(0.0, d + 0.5));
  float fadeK = smoothstep(35.0, 85.0, dist);
  c = mix(c, skyBase(normalize(vec3(-v.x, 0.0, -v.z))), fadeK);
  outColor = vec4(c, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 }, ...SKY_UNIFORMS }
});

// ---------------------------------------------------------------- day/night clock
const CYCLE_SECONDS = 20;
const A0 = 0.9; // start in daylight
const sunAt = (t: number): V3 => {
  const a = A0 + (t / CYCLE_SECONDS) * Math.PI * 2;
  const x = Math.cos(a), y = Math.sin(a), z = 0.35;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
const hex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
const mixc = (a: V3, b: V3, k: number): string => hex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);

const s0 = sunAt(0);
const place = (d: V3, k: number): V3 => [d[0] * k, d[1] * k, d[2] * k];

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(primitives.sphere({ name: "skydome", size: 1, material: skyMaterial, castShadow: false }).scale(600).runtime({ id: "skydome", mutable: true }))
    .add(lights.hemisphere({ name: "ambient", skyColor: "#cfe3ff", groundColor: "#4a5a40", intensity: 0.9 }).runtime({ id: "ambient", mutable: true }))
    .add(lights.directional({ name: "sun", position: place(s0, 40), target: [0, 0, 0], intensity: 3.4, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: place(s0, -40), target: [0, 0, 0], intensity: 0.7, color: "#9db8ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(islandGeometry, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(geometry.custom(
      geometry.define({ positions: wPos, normals: wNor, indices: wIdx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(interactions.orbit({ target: [0, 2, 0], position: [0, 12, 29], autoRotate: 0.12 }))
    .camera(camera.orbit({ position: [0, 12, 29], target: [0, 2, 0], fov: 46, near: 0.5, far: 1200 }))
});

const start = performance.now();
app.onFrame(() => {
  const t = (performance.now() - start) / 1000;
  const s = sunAt(t);
  const dayK = smooth(-0.05, 0.3, s[1]);
  const warm = smooth(0, 0.4, s[1]);

  const water$ = app.nodes.require("water");
  water$.setUniform?.("waveClock", t);
  water$.setUniform?.("sunDir", s);
  app.nodes.require("skydome").setUniform?.("sunDir", s);

  const sun = app.nodes.require("sun");
  sun.setPosition(...place(s, 40));
  sun.setLight?.({ intensity: 3.6 * dayK, color: mixc([1, 0.55, 0.28], [1, 0.95, 0.84], warm) });
  const moon = app.nodes.require("moon");
  moon.setPosition(...place(s, -40));
  moon.setLight?.({ intensity: 0.25 + 0.6 * (1 - dayK) });
  app.nodes.require("ambient").setLight?.({ intensity: 0.45 + 0.6 * dayK, color: mixc([0.42, 0.5, 0.85], [0.82, 0.9, 1], dayK) });
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
