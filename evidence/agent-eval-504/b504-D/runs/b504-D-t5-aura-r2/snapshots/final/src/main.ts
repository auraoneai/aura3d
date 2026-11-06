import { camera, createAuraApp, geometry, material, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Shared GLSL: authored sRGB colours are decoded to linear, the app output uses toneMapping "none" and the
// output stage sRGB-encodes, so the colours read as authored (no ACES wash-out).
const COMMON = /* glsl */ `
vec3 toLin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 sunDir() { return normalize(vec3(0.28, 0.17, -1.0)); }
vec3 skyColor(vec3 dir) {
  vec3 d = normalize(dir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = toLin(vec3(0.80, 0.88, 0.96));
  vec3 zenith = toLin(vec3(0.10, 0.30, 0.68));
  vec3 c = mix(horizon, zenith, pow(h, 0.45));
  float s = max(dot(d, sunDir()), 0.0);
  c += toLin(vec3(1.0, 0.78, 0.5)) * pow(s, 18.0) * 0.45;
  c += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9998, s) * 4.0;
  return c;
}
`;

// Sky dome: inward-facing sphere around the scene, same gradient the water reflects.
const skyMat = material.custom({
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
${COMMON}
void main() {
  outColor = vec4(skyColor(vWorld - cameraPosition), 1.0);
}`
  },
  side: "double",
  depthWrite: false,
  fog: false
});

const R = 250;
const LAT = 32, LON = 64;
const dPos = new Float32Array((LAT + 1) * (LON + 1) * 3);
const dNor = new Float32Array(dPos.length);
const dIdx: number[] = [];
for (let a = 0; a <= LAT; a += 1) {
  const phi = (a / LAT) * Math.PI;
  for (let b = 0; b <= LON; b += 1) {
    const th = (b / LON) * Math.PI * 2;
    const v = a * (LON + 1) + b;
    const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
    dPos.set([x * R, y * R, z * R], v * 3);
    dNor.set([-x, -y, -z], v * 3);
    if (a < LAT && b < LON) dIdx.push(v, v + LON + 1, v + 1, v + 1, v + LON + 1, v + LON + 2);
  }
}

// Water: subdivided grid, waves are real vertex displacement.
const N = 300, SIZE = 300;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out float vTime;
void addWave(vec2 p, float t, vec2 d, float k, float amp, float sp, inout float h, inout vec2 slope) {
  float ph = dot(p, d) * k + t * sp;
  h += amp * sin(ph);
  slope += amp * k * cos(ph) * d;
}
void main() {
  float t = waveClock;
  vec2 p = position.xz;
  float h = 0.0;
  vec2 slope = vec2(0.0);
  addWave(p, t, vec2(0.8, 0.6), 0.55, 0.30, 1.2, h, slope);
  addWave(p, t, vec2(-0.6, 0.8), 0.90, 0.18, 1.6, h, slope);
  addWave(p, t, vec2(0.3, -0.954), 1.70, 0.08, 2.3, h, slope);
  addWave(p, t, vec2(-0.913, -0.408), 2.40, 0.04, 3.0, h, slope);
  vec3 pos = vec3(p.x, h, p.y);
  vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vTime = t;
  gl_Position = modelViewProjectionMatrix * vec4(pos, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in float vTime;
out vec4 outColor;
${COMMON}
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ripple(vec2 p, float t) {
  float s = 0.0;
  s += vnoise(p * 1.7 + vec2(t * 0.35, t * 0.2)) * 0.55;
  s += vnoise(p * 3.9 + vec2(-t * 0.5, t * 0.4)) * 0.30;
  s += vnoise(p * 8.3 + vec2(t * 0.7, -t * 0.6)) * 0.15;
  return s;
}
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);

  // noise ripple detail perturbs the geometric normal, faded with distance to avoid shimmer
  vec2 q = vWorld.xz;
  float e = 0.06;
  float r0 = ripple(q, vTime);
  float rx = ripple(q + vec2(e, 0.0), vTime) - r0;
  float rz = ripple(q + vec2(0.0, e), vTime) - r0;
  float strength = 1.6 / (1.0 + dist * 0.03);
  vec3 n = normalize(normalize(vNormal) + vec3(-rx, 0.0, -rz) / e * 0.18 * strength);

  float cosT = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = clamp(0.02 + 0.98 * pow(1.0 - cosT, 5.0), 0.0, 1.0);

  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y) + 0.01;
  vec3 reflCol = skyColor(refl);

  vec3 deep = toLin(vec3(0.02, 0.20, 0.32));
  vec3 shallow = toLin(vec3(0.10, 0.50, 0.58));
  float crest = clamp(vWorld.y * 1.2 + 0.45 + (r0 - 0.5) * 0.4, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.8);

  vec3 col = mix(body, reflCol, fresnel);
  float spec = pow(max(dot(refl, sunDir()), 0.0), 700.0) * 6.0 + pow(max(dot(refl, sunDir()), 0.0), 60.0) * 0.35;
  col += vec3(1.0, 0.92, 0.75) * spec;

  // distance haze into the horizon colour so the water edge meets the sky
  vec3 farCol = skyColor(vec3(-toCam.x, 0.0, -toCam.z));
  float haze = smoothstep(60.0, 140.0, dist);
  col = mix(col, farCol, haze);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe3f5" })
    .add(geometry.custom(
      geometry.define({ positions: dPos, normals: dNor, indices: dIdx, bounds: { min: [-R, -R, -R], max: [R, R, R] } }),
      { name: "sky", material: skyMat, castShadow: false }
    ))
    .add(geometry.custom(
      geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 2, SIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .camera(camera.perspective({ position: [0, 3.5, 40], target: [0, 2.6, -100], fov: 55, near: 0.5, far: 700 })),
  output: { toneMapping: "none", exposure: 1 }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
