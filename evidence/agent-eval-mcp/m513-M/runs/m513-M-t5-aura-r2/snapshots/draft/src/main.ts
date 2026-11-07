import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Subdivided water grid: the waves are real geometry displaced in the vertex shader.
const N = 300;
const SIZE = 500;
const positions = new Float32Array((N + 1) * (N + 1) * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE - 200], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

// Sky gradient colours (display-referred hex); the water shader decodes the same values to linear.
const ZENITH = "#2f6fbf";
const HORIZON = "#b9d8f0";

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;

// (dirX, dirZ, wavelength, amplitude)
const vec4 WAVES[4] = vec4[4](
  vec4( 0.80,  0.60, 16.0, 0.50),
  vec4(-0.55,  0.83, 10.0, 0.30),
  vec4( 0.20, -0.98,  6.5, 0.14),
  vec4(-0.90, -0.44,  4.0, 0.07)
);

void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = WAVES[i];
    vec2 d = normalize(w.xy);
    float k = 6.2831853 / w.z;
    float omega = sqrt(9.8 * k) * 0.8;
    float ph = k * dot(d, p) + omega * waveClock;
    h += w.w * sin(ph);
    slope += d * (w.w * k * cos(ph));
  }
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

vec3 skyColor(vec3 dir) {
  vec3 horizon = toLinear(vec3(0.725, 0.847, 0.941));
  vec3 zenith = toLinear(vec3(0.184, 0.435, 0.749));
  float t = pow(clamp(dir.y, 0.0, 1.0), 0.5);
  return mix(horizon, zenith, t);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 5.7);
    a *= 0.5;
  }
  return s;
}
float ripple(vec2 p) {
  float t = waveClock;
  return fbm(p * 1.3 + vec2(t * 0.35, t * 0.2)) + 0.6 * fbm(p * 2.7 - vec2(t * 0.3, -t * 0.45));
}

void main() {
  vec3 viewVec = cameraPosition - vPos;
  float dist = length(viewVec);
  vec3 v = viewVec / dist;

  // Noise ripple detail: perturb the analytic wave normal with the gradient of fbm noise.
  vec2 q = vPos.xz;
  float e = 0.08;
  float r0 = ripple(q);
  vec2 g = vec2(ripple(q + vec2(e, 0.0)) - r0, ripple(q + vec2(0.0, e)) - r0) / e;
  float fade = 1.0 / (1.0 + dist * 0.035);
  vec3 n = normalize(vNormal + vec3(-g.x, 0.0, -g.y) * 0.12 * fade);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fresnel = clamp(fresnel * 1.15 + 0.03, 0.0, 1.0);

  vec3 refl = reflect(-v, n);
  refl.y = max(refl.y, 0.015);
  vec3 reflected = skyColor(refl);

  vec3 deep = toLinear(vec3(0.02, 0.17, 0.27));
  vec3 shallow = toLinear(vec3(0.10, 0.50, 0.55));
  float crest = clamp(vPos.y * 0.9 + 0.45 + (r0 - 0.9) * 0.3, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * (0.35 + 0.65 * (1.0 - ndv)));

  vec3 col = mix(body, reflected, fresnel);

  // Sun specular glint
  vec3 sunDir = normalize(vec3(-0.25, 0.16, -1.0));
  float sd = max(dot(refl, sunDir), 0.0);
  vec3 sunCol = vec3(1.0, 0.9, 0.7);
  col += sunCol * (pow(sd, 900.0) * 14.0 + pow(sd, 90.0) * 0.5) * (0.4 + 0.6 * fresnel);

  // Distant water melts into the horizon colour
  float haze = 1.0 - exp(-dist * 0.006);
  col = mix(col, skyColor(vec3(0.0, 0.0, 1.0)), haze * haze);

  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

const app = createAuraApp("#app", {
  scene: scene({ background: HORIZON })
    .add(sky.gradient({ zenith: ZENITH, horizon: HORIZON, exponent: 0.5, name: "sky" }))
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-SIZE / 2, -2, -SIZE / 2 - 200], max: [SIZE / 2, 2, SIZE / 2 - 200] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 4, 20], target: [0, -3, -50], fov: 50, near: 0.5, far: 800 }))
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
