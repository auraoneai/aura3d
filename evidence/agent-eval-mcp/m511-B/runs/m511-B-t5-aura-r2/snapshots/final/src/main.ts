import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

// Custom GLSL water: geometric vertex waves, fresnel sky reflection, noise ripples, sun glint.
// All shader colours are linear light; the app uses toneMapping "none" so the output stage only sRGB-encodes.

const N = 250; // 251^2 = 63001 vertices (fits 16-bit indices)
const SIZE = 200;
const Z_OFFSET = -50; // grid spans z in [-150, 50]; camera sits inside it, horizon is far away
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE + Z_OFFSET], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

// Shared sky model (fragment stage of both the dome and the water).
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.328, 0.150, -0.937);
vec3 srgb2lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 skyColor(vec3 d, bool withSun) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = srgb2lin(vec3(0.86, 0.90, 0.93));
  vec3 mid = srgb2lin(vec3(0.45, 0.68, 0.92));
  vec3 zenith = srgb2lin(vec3(0.10, 0.30, 0.72));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  col = mix(col, zenith, smoothstep(0.2, 0.9, h));
  float s = max(dot(d, SUN_DIR), 0.0);
  col += vec3(1.0, 0.75, 0.45) * pow(s, 12.0) * 0.35; // warm halo
  if (withSun) col += vec3(1.0, 0.92, 0.75) * smoothstep(0.9992, 0.9998, s) * 6.0; // disc
  return col;
}
`;

const dome = material.custom({
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
  vec3 col = skyColor(d, true);
  // below the horizon fade to the horizon haze (the water covers most of it)
  col = mix(col, srgb2lin(vec3(0.80, 0.86, 0.90)), smoothstep(0.0, -0.1, d.y));
  outColor = vec4(min(col, vec3(1.0)), 1.0);
}`,
  },
  side: "back",
  depthWrite: false,
  fog: false,
});

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vDist;

// four directional sine waves: (dir.x, dir.z, amplitude, wavenumber) and speed
void waves(vec2 p, float t, out float h, out vec2 grad) {
  const vec4 W0 = vec4( 0.80,  0.60, 0.55, 0.35);
  const vec4 W1 = vec4(-0.35,  0.94, 0.30, 0.62);
  const vec4 W2 = vec4( 0.20, -0.98, 0.16, 1.10);
  const vec4 W3 = vec4(-0.90, -0.44, 0.07, 2.00);
  h = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = i == 0 ? W0 : (i == 1 ? W1 : (i == 2 ? W2 : W3));
    float speed = 0.9 + 0.5 * float(i);
    float ph = dot(p, w.xy) * w.w + t * speed;
    h += sin(ph) * w.z;
    grad += w.xy * (cos(ph) * w.z * w.w);
  }
}

void main() {
  float h; vec2 g;
  waves(position.xz, waveClock, h, g);
  vec3 p = vec3(position.x, h, position.z);
  vPos = p;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  vec4 clip = modelViewProjectionMatrix * vec4(p, 1.0);
  vDist = length(cameraPosition - p);
  gl_Position = clip;
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vDist;
out vec4 outColor;
${SKY_GLSL}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return s;
}

void main() {
  vec3 n = normalize(vNormal);
  // procedural ripple detail: noise gradient scrolled with time, fading with distance
  vec2 q = vPos.xz * 1.6;
  float e = 0.05;
  vec2 drift = vec2(0.35, 0.2) * waveClock;
  float r0 = fbm(q + drift);
  float rx = fbm(q + drift + vec2(e, 0.0));
  float rz = fbm(q + drift + vec2(0.0, e));
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  float detail = 1.0 / (1.0 + vDist * 0.03);
  n = normalize(n + vec3(-rg.x, 0.0, -rg.y) * 0.16 * detail);

  vec3 v = normalize(cameraPosition - vPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  vec3 refl = reflect(-v, n);
  refl.y = max(refl.y, 0.02);
  vec3 reflected = skyColor(normalize(refl), false);

  vec3 deep = srgb2lin(vec3(0.02, 0.22, 0.32));
  vec3 shallow = srgb2lin(vec3(0.10, 0.52, 0.55));
  float crest = clamp(vPos.y * 0.9 + 0.45 + (r0 - 0.5) * 0.3, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * crest);

  vec3 col = mix(body, reflected, clamp(fresnel, 0.0, 1.0));

  // sun glint (Blinn-Phong on the rippled normal)
  vec3 hv = normalize(SUN_DIR + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 600.0) * 12.0 + pow(nh, 80.0) * 0.5;
  col += vec3(1.0, 0.9, 0.7) * glint * (0.3 + 0.7 * fresnel + 0.2);

  // foam-ish pale crests
  col += vec3(0.7, 0.8, 0.85) * smoothstep(0.85, 1.25, vPos.y * 1.0 + r0 * 0.5) * 0.25;

  // distance haze to the horizon colour
  float haze = 1.0 - exp(-vDist * 0.0075);
  col = mix(col, srgb2lin(vec3(0.80, 0.86, 0.90)), clamp(haze, 0.0, 1.0));

  outColor = vec4(min(col, vec3(1.0)), 1.0);
}`,
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfdde6" })
    .add(
      primitives.sphere({ name: "sky", size: 700, material: dome, castShadow: false }).position(0, 0, 0),
    )
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-SIZE / 2, -3, -SIZE / 2 + Z_OFFSET], max: [SIZE / 2, 3, SIZE / 2 + Z_OFFSET] },
          }),
          { name: "water", material: water, castShadow: false },
        )
        .runtime({ id: "water", mutable: true }),
    )
    .camera(camera.perspective({ position: [0, 3.2, 22], target: [0, 1.6, -40], fov: 55, near: 0.5, far: 1200 })),
  output: { toneMapping: "none" },
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});
await app.ready();
(window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
