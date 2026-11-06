import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

// Shared GLSL sky function (linear light). Used by the sky dome and by the water's reflection.
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.28, 0.2, -0.94);
vec3 skyColor(vec3 d) {
  d = normalize(d);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.60, 0.74, 0.90);
  vec3 mid = vec3(0.16, 0.38, 0.78);
  vec3 zenith = vec3(0.025, 0.12, 0.52);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  col = mix(col, zenith, smoothstep(0.15, 0.9, h));
  vec3 sun = normalize(SUN_DIR);
  float s = max(dot(d, sun), 0.0);
  col += vec3(1.0, 0.72, 0.42) * pow(s, 6.0) * 0.22;
  col += vec3(1.0, 0.80, 0.55) * pow(s, 64.0) * 0.6;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9998, s) * 12.0;
  col = mix(col, horizon * 0.8, smoothstep(0.0, -0.3, d.y));
  return col;
}
`;

// ---- Sky dome -------------------------------------------------------------
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
${SKY_GLSL}
void main() {
  outColor = vec4(skyColor(vWorld - cameraPosition), 1.0);
}`
  },
  side: "double",
  depthWrite: false
});

// ---- Water grid (subdivided, denser near the camera) ------------------------
const N = 400;
const EXTENT = 500;
const CENTER_Z = 16;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices = new Uint32Array(N * N * 6);
let ic = 0;
const warp = (c: number): number => Math.sign(c) * c * c * EXTENT;
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([warp((i / N - 0.5) * 2), 0, warp((j / N - 0.5) * 2) + CENTER_Z], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) {
      indices[ic++] = v; indices[ic++] = v + N + 1; indices[ic++] = v + 1;
      indices[ic++] = v + 1; indices[ic++] = v + N + 1; indices[ic++] = v + N + 2;
    }
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vHeight;

void addWave(inout float h, inout vec2 g, vec2 p, float t, vec2 dir, float k, float a) {
  dir = normalize(dir);
  float w = sqrt(9.8 * k) * 0.7;
  float ph = dot(p, dir) * k + t * w;
  h += sin(ph) * a;
  g += dir * (cos(ph) * a * k);
}

void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(h, g, p, waveClock, vec2(0.25, -1.0), 0.32, 0.42);
  addWave(h, g, p, waveClock, vec2(-0.6, -0.8), 0.55, 0.22);
  addWave(h, g, p, waveClock, vec2(0.9, -0.5), 0.9, 0.11);
  addWave(h, g, p, waveClock, vec2(-0.2, 1.0), 1.5, 0.05);
  addWave(h, g, p, waveClock, vec2(0.7, 0.7), 2.3, 0.025);
  vec3 pos = vec3(p.x, h, p.y);
  vPos = pos;
  vHeight = h;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(pos, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vHeight;
out vec4 outColor;
${SKY_GLSL}

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
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += vnoise(p) * a;
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
vec2 rippleGrad(vec2 p) {
  float e = 0.06;
  return vec2(fbm(p + vec2(e, 0.0)) - fbm(p - vec2(e, 0.0)),
              fbm(p + vec2(0.0, e)) - fbm(p - vec2(0.0, e))) / (2.0 * e);
}

void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // noise ripples: two scrolling layers, faded with distance to avoid shimmer
  float t = waveClock;
  vec2 r = rippleGrad(vPos.xz * 1.6 + vec2(t * 0.35, t * 0.2))
         + rippleGrad(vPos.xz * 3.1 - vec2(t * 0.25, -t * 0.3)) * 0.6;
  float fade = 1.0 / (1.0 + dist * 0.045);
  vec3 n = normalize(vNormal + vec3(-r.x, 0.0, -r.y) * 0.16 * fade);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 4.0);

  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y) + 0.02;
  vec3 skyRefl = skyColor(refl);

  vec3 deep = vec3(0.004, 0.035, 0.085);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  float crest = clamp(vHeight * 1.2 + 0.45, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * crest);
  body += vec3(0.02, 0.07, 0.06) * pow(clamp(1.0 - ndv, 0.0, 1.0), 2.0);

  vec3 col = mix(body, skyRefl, clamp(fresnel, 0.0, 1.0));

  // sun glint
  vec3 sun = normalize(SUN_DIR);
  vec3 hv = normalize(sun + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 700.0) * 14.0 + pow(nh, 90.0) * 0.5;
  col += vec3(1.0, 0.88, 0.68) * glint * (0.3 + 0.7 * fresnel);

  // distance haze into the horizon colour
  vec3 haze = skyColor(vec3(normalize(vec2(-toCam.x, -toCam.z)).x, 0.0, normalize(vec2(-toCam.x, -toCam.z)).y));
  col = mix(col, haze, 1.0 - exp(-dist * 0.0045));

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double"
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#99bde6" })
    .add(primitives.sphere({ name: "sky", size: 1, material: skyMaterial, castShadow: false }).scale([1800, 1800, 1800]))
    .add(
      geometry.custom(
        geometry.define({
          positions,
          normals,
          indices,
          bounds: { min: [-EXTENT, -3, -EXTENT + CENTER_Z], max: [EXTENT, 3, EXTENT + CENTER_Z] }
        }),
        { name: "water", material: water, castShadow: false }
      ).runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.4, 18], target: [0, -2.2, -70], fov: 55, near: 0.5, far: 2600 })),
  output: { toneMapping: "neutral", exposure: 1 }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});
await app.ready();
window.__EVAL_READY__ = true;
