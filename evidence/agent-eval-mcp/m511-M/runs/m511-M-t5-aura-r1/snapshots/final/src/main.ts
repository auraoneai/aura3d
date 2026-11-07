import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---- Water grid (subdivided so waves are real geometry) -------------------
const N = 250; // (N+1)^2 = 63001 vertices, stays within 16-bit indices
const SIZE = 260;
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

// ---- Shared GLSL: sky gradient (authored in sRGB, converted to linear) ----
const SUN_DIR = "normalize(vec3(-0.35, 0.16, -1.0))";
const SKY_GLSL = /* glsl */ `
vec3 toLin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 skyBase(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = toLin(vec3(0.80, 0.87, 0.94));
  vec3 mid = toLin(vec3(0.42, 0.62, 0.86));
  vec3 zenith = toLin(vec3(0.10, 0.28, 0.66));
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  c = mix(c, zenith, smoothstep(0.15, 0.9, h));
  vec3 sunDir = ${SUN_DIR};
  float s = max(dot(d, sunDir), 0.0);
  c += toLin(vec3(1.0, 0.72, 0.45)) * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.35);
  return c;
}
`;

// ---- Sky dome -------------------------------------------------------------
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
  vec3 c = skyBase(d);
  float s = max(dot(d, ${SUN_DIR}), 0.0);
  c += vec3(6.0, 5.0, 3.6) * smoothstep(0.9993, 0.9998, s);
  outColor = vec4(c, 1.0);
}`
  },
  side: "double",
  fog: false
});

// ---- Water ----------------------------------------------------------------
const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec2 vSlope;
out float vHeight;
void addWave(vec2 p, vec2 dir, float k, float a, float t, inout float h, inout vec2 g) {
  float ph = dot(p, normalize(dir)) * k + t * sqrt(9.8 * k) * 0.7;
  h += a * sin(ph);
  g += a * k * cos(ph) * normalize(dir);
}
void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(p, vec2(0.80, 0.60), 0.45, 0.42, waveClock, h, g);
  addWave(p, vec2(-0.50, 0.85), 0.70, 0.24, waveClock, h, g);
  addWave(p, vec2(0.30, 0.95), 1.10, 0.11, waveClock, h, g);
  addWave(p, vec2(0.95, 0.30), 1.70, 0.05, waveClock, h, g);
  addWave(p, vec2(-0.90, 0.40), 2.60, 0.022, waveClock, h, g);
  vec3 wp = vec3(p.x, h, p.y);
  vWorld = (modelMatrix * vec4(wp, 1.0)).xyz;
  vSlope = g;
  vHeight = h;
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
in vec2 vSlope;
in float vHeight;
out vec4 outColor;
${SKY_GLSL}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // Noise ripple detail: gradient of fbm perturbs the wave normal, faded with distance.
  vec2 q = vWorld.xz * 1.4 + vec2(waveClock * 0.35, waveClock * 0.2);
  float e = 0.08;
  float f0 = fbm(q);
  vec2 rip = vec2(fbm(q + vec2(e, 0.0)) - f0, fbm(q + vec2(0.0, e)) - f0) / e;
  float fade = 1.0 / (1.0 + dist * 0.035);
  vec2 slope = vSlope * (1.0 / (1.0 + dist * 0.004)) + rip * 0.09 * fade;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

  // Fresnel (Schlick): grazing angles reflect the sky.
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyBase(normalize(r));

  vec3 deep = toLin(vec3(0.02, 0.17, 0.27));
  vec3 shallow = toLin(vec3(0.10, 0.50, 0.55));
  float crest = smoothstep(-0.2, 0.8, vHeight + (f0 - 0.5) * 0.3);
  vec3 body = mix(deep, shallow, crest * 0.7);

  vec3 col = mix(body, refl, fres);

  // Sun specular glint.
  vec3 sunDir = ${SUN_DIR};
  vec3 hv = normalize(sunDir + v);
  float ndh = max(dot(n, hv), 0.0);
  float glint = pow(ndh, 600.0) * 18.0 + pow(ndh, 60.0) * 0.5;
  col += vec3(1.0, 0.88, 0.68) * glint * smoothstep(0.0, 0.2, sunDir.y);

  // Atmospheric haze toward the horizon colour, matching the sky dome.
  float haze = max(1.0 - exp(-pow(dist * 0.011, 1.5)), smoothstep(95.0, 125.0, dist));
  col = mix(col, skyBase(vec3(1.0, 0.0, 0.0)), clamp(haze, 0.0, 1.0));

  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cddff0" })
    .add(primitives.sphere({ name: "sky", size: 1, material: skyMaterial, castShadow: false }).scale([800, 800, 800]))
    .add(
      geometry
        .custom(geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -3, -SIZE / 2], max: [SIZE / 2, 3, SIZE / 2] } }), {
          name: "water",
          material: water,
          castShadow: false
        })
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.2, 14], target: [0, 2.4, -30], fov: 55, near: 0.5, far: 3000 })),
  output: { toneMapping: "neutral", exposure: 1.0 }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
