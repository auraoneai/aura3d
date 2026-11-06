import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Colour contract: shaders write linear light, tone mapping is "none", the output stage sRGB-encodes.
// Colours below are authored in sRGB and converted with lin(), so they appear as written.

// Shared GLSL: gradient sky with sun, used by the dome and by the water reflection.
const SKY_GLSL = /* glsl */ `
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
const vec3 SUN_DIR = normalize(vec3(-0.30, 0.17, -0.94));
vec3 horizonColor() { return lin(vec3(0.80, 0.88, 0.96)); }
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = horizonColor();
  vec3 mid = lin(vec3(0.46, 0.68, 0.92));
  vec3 zenith = lin(vec3(0.12, 0.33, 0.74));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
  col = mix(col, zenith, smoothstep(0.12, 0.85, h));
  float s = max(dot(d, SUN_DIR), 0.0);
  vec3 sunCol = vec3(1.0, 0.86, 0.60);
  col += sunCol * (pow(s, 6.0) * 0.12 + pow(s, 80.0) * 0.45);
  col += vec3(1.0, 0.95, 0.80) * smoothstep(0.9993, 0.9997, s) * 6.0;
  return col;
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
${SKY_GLSL}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 col = d.y < 0.0 ? horizonColor() : skyColor(d);
  outColor = vec4(col, 1.0);
}`
  },
  side: "double",
  depthWrite: false
});

// Water grid: subdivided so the waves are real geometry. 250 x 250 quads = 63001 vertices (16-bit indices).
const N = 250;
const SX = 240;
const SZ = 240;
const CZ = -60; // grid centre in z: extends well behind the horizon fade
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([(i / N - 0.5) * SX, 0, (j / N - 0.5) * SZ + CZ], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out float vHeight;

// Sum of directional sines: height plus analytic slope.
float waves(vec2 p, float t, out vec2 grad) {
  const int COUNT = 5;
  vec2 dirs[COUNT] = vec2[COUNT](vec2(0.95, 0.31), vec2(-0.55, 0.83), vec2(0.30, -0.95), vec2(-0.90, -0.43), vec2(0.70, 0.71));
  float amp[COUNT] = float[COUNT](0.34, 0.20, 0.10, 0.05, 0.025);
  float len[COUNT] = float[COUNT](14.0, 8.5, 4.6, 2.8, 1.7);
  float spd[COUNT] = float[COUNT](1.0, 1.25, 1.6, 1.9, 2.3);
  float h = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < COUNT; i++) {
    float k = 6.2831853 / len[i];
    float ph = dot(dirs[i], p) * k + t * spd[i];
    h += amp[i] * sin(ph);
    grad += amp[i] * k * cos(ph) * dirs[i];
  }
  return h;
}

void main() {
  vec2 g;
  float h = waves(position.xz, waveClock, g);
  vec3 p = vec3(position.x, h, position.z);
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  vHeight = h;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
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
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ripple(vec2 p, float t) {
  float a = vnoise(p * 1.3 + vec2(t * 0.35, t * 0.20));
  float b = vnoise(p * 2.9 - vec2(t * 0.30, -t * 0.45)) * 0.5;
  float c = vnoise(p * 6.1 + vec2(-t * 0.6, t * 0.5)) * 0.25;
  return a + b + c;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);

  // Noise ripple detail perturbs the wave normal; fades with distance to avoid shimmer.
  vec2 p = vWorld.xz;
  float e = 0.06;
  float r0 = ripple(p, waveClock);
  float rx = ripple(p + vec2(e, 0.0), waveClock);
  float rz = ripple(p + vec2(0.0, e), waveClock);
  float rippleAmt = 0.22 * (1.0 - smoothstep(25.0, 90.0, dist));
  vec3 n = normalize(vNormal + vec3(-(rx - r0) / e, 0.0, -(rz - r0) / e) * rippleAmt);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // Reflection of the shared sky (kept above the horizon).
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 reflected = skyColor(normalize(r));

  // Body colour: deep blue-green, lighter toward wave crests.
  vec3 deep = lin(vec3(0.03, 0.20, 0.30));
  vec3 shallow = lin(vec3(0.12, 0.50, 0.55));
  vec3 body = mix(deep, shallow, clamp(vHeight * 1.2 + 0.45, 0.0, 1.0) * 0.8 + 0.2 * ndv);

  vec3 col = mix(body, reflected, clamp(fresnel, 0.0, 1.0));

  // Sun glint.
  vec3 hv = normalize(SUN_DIR + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 700.0) * 14.0 + pow(nh, 90.0) * 0.5;
  col += vec3(1.0, 0.90, 0.68) * glint * smoothstep(0.0, 0.1, SUN_DIR.y);

  // Atmospheric haze toward the horizon so the grid edge melts into the sky.
  float haze = smoothstep(55.0, 170.0, dist);
  col = mix(col, horizonColor(), haze);

  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double"
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cde0f5" })
    .add(primitives.sphere({ name: "sky", size: 1, material: skyMaterial, castShadow: false }).position(0, 0, 0).scale([600, 600, 600]))
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-SX / 2, -1.5, CZ - SZ / 2], max: [SX / 2, 1.5, CZ + SZ / 2] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.2, 24], target: [0, -1.5, -60], fov: 50, near: 0.3, far: 2000 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
