import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Water surface grid. Radially warped so vertex density is high near the
// camera and sparse towards the horizon. 251x251 = 63001 vertices.
// ---------------------------------------------------------------------------
const N = 250;
const RADIUS = 450;
const positions = new Float32Array((N + 1) * (N + 1) * 3);
const normals = new Float32Array(positions.length);
const indexList = new Uint32Array(N * N * 6);
let ic = 0;
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    const u = (i / N) * 2 - 1;
    const w = (j / N) * 2 - 1;
    positions[v * 3] = Math.sign(u) * u * u * RADIUS;
    positions[v * 3 + 1] = 0;
    positions[v * 3 + 2] = Math.sign(w) * w * w * RADIUS;
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) {
      indexList[ic++] = v;
      indexList[ic++] = v + N + 1;
      indexList[ic++] = v + 1;
      indexList[ic++] = v + 1;
      indexList[ic++] = v + N + 1;
      indexList[ic++] = v + N + 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Shared GLSL: sky gradient, sun, tone mapping + sRGB encode.
// Colours are authored in linear light and encoded once at the end of each
// fragment shader (ACES-fitted curve, then gamma 1/2.2).
// ---------------------------------------------------------------------------
const COMMON = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.25, 0.20, -0.95);
vec3 sunDir() { return normalize(SUN_DIR); }

vec3 skyColor(vec3 d) {
  vec3 horizon = vec3(0.62, 0.70, 0.80);
  vec3 zenith  = vec3(0.07, 0.20, 0.52);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(horizon, zenith, pow(h, 0.5));
  // below the horizon: haze
  c = mix(c, horizon * 0.85, smoothstep(0.0, -0.15, d.y));
  float s = max(dot(d, sunDir()), 0.0);
  c += vec3(1.0, 0.75, 0.45) * pow(s, 24.0) * 0.35;
  c += vec3(1.0, 0.85, 0.6) * pow(s, 400.0) * 1.5;
  c += vec3(1.0, 0.95, 0.85) * smoothstep(0.99965, 0.99985, s) * 25.0;
  return c;
}

vec3 outputEncode(vec3 x) {
  x *= 0.9;
  vec3 a = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  a = clamp(a, 0.0, 1.0);
  return pow(a, vec3(1.0 / 2.2));
}
`;

const skyMaterial = material.custom({
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
${COMMON}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  outColor = vec4(outputEncode(skyColor(d)), 1.0);
}`
  },
  side: "back",
  fog: false,
  depthWrite: false
});

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vTime;
out float vHeight;

const vec2 DIR[6] = vec2[6](
  vec2(0.80, 0.60), vec2(-0.55, 0.83), vec2(0.20, -0.98),
  vec2(-0.90, -0.43), vec2(0.65, -0.76), vec2(-0.30, 0.95));
const float K[6]   = float[6](0.35, 0.52, 0.85, 1.25, 1.8, 2.6);
const float AMP[6] = float[6](0.42, 0.26, 0.14, 0.08, 0.045, 0.025);

void main() {
  vec2 p = position.xz;
  float dist = length(p - cameraPosition.xz);
  float h = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    float k = K[i];
    float w = sqrt(9.8 * k);
    float a = AMP[i] * exp(-dist * 0.006 * k);
    float ph = k * dot(DIR[i], p) - w * waveClock;
    h += a * sin(ph);
    grad += a * k * cos(ph) * DIR[i];
  }
  vec3 pos = vec3(p.x, h, p.y);
  vPos = pos;
  vHeight = h;
  vTime = waveClock;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  gl_Position = modelViewProjectionMatrix * vec4(pos, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vTime;
in float vHeight;
out vec4 outColor;
${COMMON}

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
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
float ripple(vec2 p, float t) {
  return fbm(p * 1.6 + vec2(t * 0.35, t * 0.22)) + fbm(p * 2.7 - vec2(t * 0.28, -t * 0.4)) * 0.6;
}

void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;

  // geometry normal + procedural noise ripples (fade with distance)
  vec3 n = normalize(vNormal);
  vec2 q = vPos.xz;
  float e = 0.06;
  float r0 = ripple(q, vTime);
  float rx = ripple(q + vec2(e, 0.0), vTime) - r0;
  float rz = ripple(q + vec2(0.0, e), vTime) - r0;
  float fade = exp(-dist * 0.018);
  n = normalize(n + vec3(-rx, 0.0, -rz) / e * 0.10 * fade);
  if (dot(n, v) < 0.02) n = normalize(n + v * (0.02 - dot(n, v)));

  // fresnel (Schlick, water F0 ~ 0.02)
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // reflected sky
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);

  // water body colour
  vec3 deep = vec3(0.004, 0.030, 0.060);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  float sss = clamp(vHeight * 0.9 + 0.35, 0.0, 1.0);
  vec3 body = mix(deep, shallow, sss * sss);
  body += vec3(0.05, 0.16, 0.14) * pow(max(dot(n, sunDir()), 0.0), 2.0) * 0.15;

  vec3 col = mix(body, refl, fres);

  // sun specular glint
  vec3 L = sunDir();
  float sd = max(dot(r, L), 0.0);
  col += vec3(1.0, 0.9, 0.7) * (pow(sd, 700.0) * 40.0 + pow(sd, 60.0) * 0.5) * (0.25 + 0.75 * fres + 0.2);

  // distance haze toward the horizon colour
  vec3 hd = normalize(vec3(-v.x, 0.01, -v.z));
  float haze = 1.0 - exp(-dist * 0.0035);
  col = mix(col, skyColor(hd) * 0.9, haze);

  outColor = vec4(outputEncode(col), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#a9b8c9" })
    .add(
      primitives
        .sphere({ name: "sky", size: 1, material: skyMaterial, castShadow: false })
        .scale([1500, 1500, 1500])
        .runtime({ id: "sky" })
    )
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices: indexList,
            bounds: { min: [-RADIUS, -4, -RADIUS], max: [RADIUS, 4, RADIUS] }
          }),
          { name: "water", material: waterMaterial, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3, 8], target: [0, -3, -50], fov: 50, near: 0.5, far: 4000 }))
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
