import { camera, createAuraApp, geometry, material, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const CAM_POS: [number, number, number] = [0, 3.2, 12];
const CAM_TARGET: [number, number, number] = [0, 2.1, -30];

// Subdivided water grid. Vertices are denser near the camera so the waves are real geometry where they are seen.
const N = 240;
const HALF = 300;
function warp(u: number): number {
  const a = Math.abs(u);
  return Math.sign(u) * HALF * (0.12 * a + 0.88 * Math.pow(a, 2.5));
}
function buildWaterGrid() {
  const positions = new Float32Array((N + 1) * (N + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices = new Uint32Array(N * N * 6);
  let t = 0;
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const v = j * (N + 1) + i;
      positions[v * 3] = warp((i / N - 0.5) * 2);
      positions[v * 3 + 1] = 0;
      positions[v * 3 + 2] = warp((j / N - 0.5) * 2);
      normals[v * 3 + 1] = 1;
      if (i < N && j < N) {
        indices[t++] = v; indices[t++] = v + N + 1; indices[t++] = v + 1;
        indices[t++] = v + 1; indices[t++] = v + N + 1; indices[t++] = v + N + 2;
      }
    }
  }
  return geometry.define({
    positions, normals, indices,
    bounds: { min: [-HALF, -3, -HALF], max: [HALF, 3, HALF] }
  });
}

// Sky dome: a sphere around the camera, drawn from the inside.
const DOME_R = 400;
function buildSkyDome() {
  const SEG = 48, RING = 24;
  const positions = new Float32Array((SEG + 1) * (RING + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let r = 0; r <= RING; r += 1) {
    const phi = (r / RING) * Math.PI;
    for (let s = 0; s <= SEG; s += 1) {
      const theta = (s / SEG) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(theta);
      const v = r * (SEG + 1) + s;
      positions.set([CAM_POS[0] + x * DOME_R, CAM_POS[1] + y * DOME_R, CAM_POS[2] + z * DOME_R], v * 3);
      normals.set([-x, -y, -z], v * 3);
      if (r < RING && s < SEG) indices.push(v, v + SEG + 1, v + 1, v + 1, v + SEG + 1, v + SEG + 2);
    }
  }
  return geometry.define({
    positions, normals, indices,
    bounds: {
      min: [CAM_POS[0] - DOME_R, CAM_POS[1] - DOME_R, CAM_POS[2] - DOME_R],
      max: [CAM_POS[0] + DOME_R, CAM_POS[1] + DOME_R, CAM_POS[2] + DOME_R]
    }
  });
}

// ---------------------------------------------------------------------------
// Shaders. All colours are authored in sRGB, decoded to linear, and the app
// outputs with toneMapping "none" so the final image keeps the authored values.
// ---------------------------------------------------------------------------

const SKY_FUNCS = /* glsl */ `
vec3 sunDirection() { return normalize(vec3(-0.35, 0.17, -1.0)); }
vec3 horizonColor() { return a3dSrgbToLinear(vec3(0.80, 0.87, 0.94)); }
vec3 skyColor(vec3 d, vec3 sunDir, float t) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = horizonColor();
  vec3 zenith = a3dSrgbToLinear(vec3(0.10, 0.32, 0.68));
  vec3 col = mix(horizon, zenith, pow(h, 0.45));
  col += vec3(1.0, 0.72, 0.45) * a3dSunGlow(d, sunDir, 18.0) * 0.35;
  col += vec3(1.0, 0.85, 0.65) * a3dSunGlow(d, sunDir, 200.0) * 0.6;
  float cl = 0.0;
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.2) * 0.9 + vec2(t * 0.02, t * 0.01);
    float f = a3dFbm(cp * 1.4, 5);
    cl = smoothstep(0.48, 0.80, f) * smoothstep(0.0, 0.2, d.y);
  }
  vec3 cloudCol = mix(a3dSrgbToLinear(vec3(0.72, 0.76, 0.84)), vec3(1.0, 0.9, 0.78), clamp(a3dSunGlow(d, sunDir, 6.0) * 0.7, 0.0, 1.0));
  return mix(col, cloudCol, cl * 0.75);
}`;

const sky = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
#include <a3d_noise>
#include <a3d_sky>
#include <colorspace_decode>
in vec3 vDir;
out vec4 outColor;
${SKY_FUNCS}
void main() {
  vec3 d = normalize(vDir);
  vec3 sunDir = sunDirection();
  vec3 col = skyColor(d, sunDir, waveClock);
  col += vec3(3.0, 2.7, 2.2) * a3dSunDisc(d, sunDir, 0.035);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double",
  depthWrite: false,
  fog: false
});

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
// xy: direction, z: wave number, w: amplitude
const vec4 WAVES[4] = vec4[4](
  vec4(0.35, 0.94, 0.35, 0.42),
  vec4(-0.55, 0.83, 0.62, 0.22),
  vec4(0.80, 0.60, 1.10, 0.09),
  vec4(-0.30, 0.95, 1.90, 0.04)
);
float waveField(vec2 p, float t, out vec2 grad) {
  float h = 0.0;
  grad = vec2(0.0);
  float fade = 1.0 - smoothstep(25.0, 70.0, length(p - cameraPosition.xz));
  for (int i = 0; i < 4; i++) {
    vec4 w = WAVES[i];
    vec2 d = normalize(w.xy);
    float a = w.w * (i >= 2 ? fade : 1.0);
    float ph = w.z * dot(d, p) - sqrt(9.81 * w.z) * t;
    h += a * sin(ph);
    grad += a * w.z * cos(ph) * d;
  }
  return h;
}
void main() {
  vec2 g;
  vec3 p = position;
  p.y = waveField(p.xz, waveClock, g);
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
#include <a3d_noise>
#include <a3d_sky>
#include <colorspace_decode>
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
${SKY_FUNCS}
float ripple(vec2 p, float t) {
  float a = a3dFbm(p * 1.7 + vec2(t * 0.35, t * 0.22), 3);
  float b = a3dFbm(p * 2.9 + vec2(-t * 0.27, t * 0.41) + 11.3, 3);
  return a + 0.6 * b;
}
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);
  vec3 n = normalize(vNormal);

  // Noise ripple detail, fades with distance to avoid shimmer.
  float e = 0.06;
  float r0 = ripple(vWorld.xz, waveClock);
  float rx = ripple(vWorld.xz + vec2(e, 0.0), waveClock);
  float rz = ripple(vWorld.xz + vec2(0.0, e), waveClock);
  float rs = 1.0 - smoothstep(20.0, 110.0, dist);
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  n = normalize(n + vec3(-rg.x, 0.0, -rg.y) * 0.15 * rs);

  // Fresnel (Schlick, water F0 = 0.02): more sky reflection at grazing angles.
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(clamp(1.0 - ndv, 0.0, 1.0), 5.0);

  vec3 sunDir = sunDirection();
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  r = normalize(r);
  vec3 refl = skyColor(r, sunDir, waveClock);

  vec3 deep = a3dSrgbToLinear(vec3(0.02, 0.17, 0.27));
  vec3 shallow = a3dSrgbToLinear(vec3(0.08, 0.45, 0.50));
  float crest = clamp(vWorld.y * 1.1 + 0.45, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.7);
  body += shallow * 0.25 * max(dot(n, sunDir), 0.0);

  float sd = max(dot(r, sunDir), 0.0);
  float glint = pow(sd, 900.0) * 12.0 + pow(sd, 80.0) * 0.5;
  vec3 col = mix(body, refl, fres) + vec3(1.0, 0.92, 0.75) * glint;

  col = mix(col, horizonColor(), smoothstep(120.0, 300.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe0ee" })
    .add(geometry.custom(buildSkyDome(), { name: "sky", material: sky, castShadow: false }).runtime({ id: "sky", mutable: true }))
    .add(geometry.custom(buildWaterGrid(), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }))
    .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: 50, near: 0.3, far: 1000 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
app.onFrame(() => {
  const t = (performance.now() - start) / 1000;
  app.nodes.require("water").setUniform?.("waveClock", t);
  app.nodes.require("sky").setUniform?.("waveClock", t);
});

void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
});
