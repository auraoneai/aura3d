import { camera, createAuraApp, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---- Water grid (subdivided so waves are real geometry) -------------------
const N = 320;
const SIZE = 200;
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

// ---- Shared GLSL: sky gradient (linear light) + tone mapping ----------------
const common = /* glsl */ `
const vec3 SUN_DIR = vec3(0.30, 0.17, -0.94);
vec3 skyColor(vec3 d) {
  d = normalize(d);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.62, 0.72, 0.82);
  vec3 zenith = vec3(0.06, 0.20, 0.52);
  vec3 c = mix(horizon, zenith, pow(h, 0.45));
  float sd = max(dot(d, normalize(SUN_DIR)), 0.0);
  c += vec3(1.0, 0.72, 0.42) * pow(sd, 6.0) * 0.18;
  c += vec3(1.0, 0.85, 0.62) * pow(sd, 120.0) * 0.8;
  c += vec3(1.0, 0.92, 0.8) * smoothstep(0.99965, 0.9998, sd) * 30.0;
  return c;
}
vec3 toneMap(vec3 x) {
  x *= 0.9;
  vec3 a = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return pow(clamp(a, 0.0, 1.0), vec3(1.0 / 2.2));
}
`;

// ---- Water material -------------------------------------------------------
const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vT;
const vec2 DIRS[4] = vec2[4](vec2(0.92, 0.39), vec2(-0.55, 0.83), vec2(0.30, -0.95), vec2(-0.85, -0.52));
const float KS[4] = float[4](0.50, 0.85, 1.35, 2.0);
const float AMPS[4] = float[4](0.50, 0.26, 0.11, 0.045);
const float SPD[4] = float[4](0.9, 1.2, 1.6, 2.1);
void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float ph = dot(DIRS[i], p) * KS[i] + waveClock * SPD[i];
    h += AMPS[i] * sin(ph);
    slope += DIRS[i] * AMPS[i] * KS[i] * cos(ph);
  }
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  vT = waveClock;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vT;
out vec4 outColor;
${common}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float ripple(vec2 p, float t) {
  float s = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p + vec2(t * 0.35, t * 0.2) * (1.0 + float(i) * 0.6));
    p = r * p * 2.03;
    a *= 0.5;
  }
  return s;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;

  // procedural noise ripples perturb the analytic wave normal
  vec2 q = vPos.xz * 1.6;
  float e = 0.05;
  float h0 = ripple(q, vT);
  float hx = ripple(q + vec2(e, 0.0), vT);
  float hz = ripple(q + vec2(0.0, e), vT);
  float detail = 1.0 - smoothstep(20.0, 80.0, dist);
  vec2 g = vec2(hx - h0, hz - h0) / e;
  vec3 n = normalize(normalize(vNormal) + vec3(-g.x, 0.0, -g.y) * 0.09 * detail);
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(40.0, 130.0, dist) * 0.6));

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 reflected = skyColor(r);

  vec3 deep = vec3(0.004, 0.035, 0.075);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 0.9 + 0.35 + (h0 - 0.5) * 0.3, 0.0, 1.0));

  vec3 col = mix(body, reflected, fresnel);

  // sun specular glint (Blinn-Phong half vector)
  vec3 sun = normalize(SUN_DIR);
  vec3 hv = normalize(sun + v);
  float glint = pow(max(dot(n, hv), 0.0), 700.0) * 12.0 + pow(max(dot(n, hv), 0.0), 90.0) * 0.25;
  col += vec3(1.0, 0.9, 0.7) * glint;

  // haze toward the horizon so the water edge blends into the sky
  vec3 dir = -v;
  vec3 haze = skyColor(vec3(dir.x, max(dir.y, 0.0), dir.z));
  col = mix(col, haze, smoothstep(40.0, 105.0, dist));

  outColor = vec4(toneMap(col), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

// ---- Sky dome -------------------------------------------------------------
const sky = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${common}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  outColor = vec4(toneMap(skyColor(vec3(d.x, max(d.y, 0.0), d.z))), 1.0);
}`
  },
  side: "double",
  depthWrite: false,
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#9ab8d4" })
    .add(lights.directional({ position: [3, 2, -9], target: [0, 0, 0], intensity: 1 }))
    .add(primitives.sphere({ name: "sky", size: 1, material: sky, castShadow: false }).position(0, 3, 20).scale([700, 700, 700]))
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-SIZE / 2, -1.5, -SIZE / 2], max: [SIZE / 2, 1.5, SIZE / 2] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3, 20], target: [0, 2.2, -50], fov: 55, near: 0.5, far: 2000 }))
});

const start = performance.now();
let first = true;
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
await app.ready();
