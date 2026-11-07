import { camera, createAuraApp, geometry, material, scene } from "@aura3d/engine";

// Custom GLSL water: geometric waves (subdivided grid, vertex displacement), analytic normal, noise ripples,
// Schlick fresnel against a gradient sky, sun glint. A second custom material draws the sky dome.
// Colour contract: shaders write linear light, app output uses toneMapping "none" (sRGB encode only).

// ---------- shared GLSL ----------
const SUN = "normalize(vec3(-0.32, 0.2, -1.0))";
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = ${SUN};
vec3 toLin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.82, 0.89, 0.96);
  vec3 mid = vec3(0.38, 0.62, 0.90);
  vec3 zenith = vec3(0.10, 0.30, 0.68);
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
  c = mix(c, zenith, smoothstep(0.22, 0.95, h));
  c = toLin(c);
  float s = max(dot(d, SUN_DIR), 0.0);
  c += vec3(1.0, 0.72, 0.42) * pow(s, 6.0) * 0.18;
  c += vec3(1.0, 0.85, 0.6) * pow(s, 60.0) * 0.5;
  c += vec3(1.0, 0.95, 0.8) * smoothstep(0.9996, 0.9999, s) * 6.0;
  return c;
}`;

// ---------- water grid ----------
const N = 240;
const SIZE = 240;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec2 vSlope;
out float vClock;
void addWave(vec2 p, float t, vec2 d, float k, float a, float w, inout float h, inout vec2 s) {
  float ph = k * dot(p, normalize(d)) + w * t;
  h += a * sin(ph);
  s += a * k * cos(ph) * normalize(d);
}
void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 s = vec2(0.0);
  addWave(p, waveClock, vec2(0.90, 0.44), 0.55, 0.30, 1.1, h, s);
  addWave(p, waveClock, vec2(-0.50, 0.87), 0.80, 0.17, 1.4, h, s);
  addWave(p, waveClock, vec2(0.20, -0.98), 1.30, 0.08, 1.9, h, s);
  addWave(p, waveClock, vec2(-0.95, -0.30), 2.10, 0.035, 2.5, h, s);
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  vSlope = s;
  vClock = waveClock;
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec2 vSlope;
in float vClock;
out vec4 outColor;
${SKY_GLSL}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v;
}
float ripple(vec2 p, float t) {
  return fbm(p * 1.7 + vec2(t * 0.35, t * 0.22)) + 0.6 * fbm(p * 3.1 - vec2(t * 0.28, -t * 0.4));
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);

  // noise ripple detail: height-field gradient by finite differences, faded with distance
  float e = 0.06;
  float r0 = ripple(vPos.xz, vClock);
  float rx = ripple(vPos.xz + vec2(e, 0.0), vClock);
  float rz = ripple(vPos.xz + vec2(0.0, e), vClock);
  float rAmp = 0.22 * exp(-dist * 0.025);
  vec2 rip = vec2(rx - r0, rz - r0) / e * rAmp;

  vec3 n = normalize(vec3(-vSlope.x - rip.x, 1.0, -vSlope.y - rip.y));

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fresnel = clamp(fresnel, 0.0, 1.0);

  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 reflected = skyColor(normalize(refl));

  vec3 deep = toLin(vec3(0.02, 0.15, 0.27));
  vec3 shallow = toLin(vec3(0.07, 0.44, 0.50));
  float crest = smoothstep(-0.2, 0.45, vPos.y) * 0.8 + (r0 - 0.8) * 0.25;
  vec3 body = mix(deep, shallow, clamp(crest, 0.0, 1.0));
  body *= 0.65 + 0.35 * max(dot(n, SUN_DIR), 0.0);

  vec3 col = mix(body, reflected, fresnel);

  // sun glint (Blinn-Phong half vector) plus a broad sheen
  vec3 hv = normalize(SUN_DIR + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 700.0) * 14.0 + pow(nh, 90.0) * 0.45;
  float glintMask = clamp(0.3 + 2.8 * fresnel, 0.3, 1.0);
  col += vec3(1.0, 0.9, 0.72) * glint * glintMask;

  // distance haze into the sky's horizon colour
  vec3 horizonView = normalize(vec3(-v.x, 0.0, -v.z) + vec3(0.0, 0.0001, 0.0));
  vec3 haze = skyColor(horizonView);
  float f = 1.0 - exp(-dist * 0.011);
  col = mix(col, haze, clamp(f * f * 1.4, 0.0, 1.0));

  outColor = vec4(clamp(col, 0.0, 16.0), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

// ---------- sky dome ----------
const DOME_R = 250;
const SEG_U = 48;
const SEG_V = 24;
const dPos = new Float32Array((SEG_U + 1) * (SEG_V + 1) * 3);
const dNor = new Float32Array(dPos.length);
const dIdx: number[] = [];
for (let j = 0; j <= SEG_V; j += 1) {
  const phi = (j / SEG_V) * Math.PI;
  for (let i = 0; i <= SEG_U; i += 1) {
    const th = (i / SEG_U) * Math.PI * 2;
    const x = Math.sin(phi) * Math.cos(th);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(th);
    const v = j * (SEG_U + 1) + i;
    dPos.set([x * DOME_R, y * DOME_R, z * DOME_R], v * 3);
    dNor.set([-x, -y, -z], v * 3);
    if (i < SEG_U && j < SEG_V) dIdx.push(v, v + SEG_U + 1, v + 1, v + 1, v + SEG_U + 1, v + SEG_U + 2);
  }
}

const sky = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position - cameraPosition;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vDir;
out vec4 outColor;
${SKY_GLSL}
void main() {
  outColor = vec4(skyColor(normalize(vDir)), 1.0);
}`
  },
  side: "double",
  depthWrite: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#d1e3f5" })
    .add(
      geometry.custom(
        geometry.define({ positions: dPos, normals: dNor, indices: dIdx, bounds: { min: [-DOME_R, -DOME_R, -DOME_R], max: [DOME_R, DOME_R, DOME_R] } }),
        { name: "sky", material: sky, castShadow: false }
      )
    )
    .add(
      geometry
        .custom(
          geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -1.5, -SIZE / 2], max: [SIZE / 2, 1.5, SIZE / 2] } }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.5, 30], target: [0, 5, 0], fov: 50, near: 0.5, far: 300 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
});
