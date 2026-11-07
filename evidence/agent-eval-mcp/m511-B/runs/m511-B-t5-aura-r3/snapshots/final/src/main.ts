import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

// Custom GLSL water + gradient sky dome. Both shaders share one sky function, so the water
// reflects exactly what the dome shows. Shaders write linear light; tone mapping is "none"
// and a soft shoulder is applied in the shader so colours are not washed out or clipped hard.

// ---- shared GLSL ----
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(0.28, 0.17, -0.944);
vec3 a3Lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 skyColor(vec3 d) {
  vec3 dir = normalize(d);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 horizon = a3Lin(vec3(0.86, 0.91, 0.96));
  vec3 mid = a3Lin(vec3(0.42, 0.65, 0.92));
  vec3 zenith = a3Lin(vec3(0.10, 0.30, 0.72));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  col = mix(col, zenith, smoothstep(0.15, 0.9, h));
  float s = max(dot(dir, normalize(SUN_DIR)), 0.0);
  col += vec3(1.0, 0.72, 0.42) * pow(s, 6.0) * 0.18;
  col += vec3(1.0, 0.82, 0.55) * pow(s, 64.0) * 0.45;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9998, s) * 6.0;
  return col;
}
`;

const SKY_DOME = material.custom({
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
  vec3 c = skyColor(d);
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`
  },
  side: "double"
});

const WATER = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vT;
out float vHeight;

// Sum of directional sine waves with analytic slope.
float waves(vec2 p, float t, out vec2 slope) {
  float h = 0.0;
  slope = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a = 1.57 + 0.75 * sin(fi * 2.3 + 1.0);
    vec2 d = vec2(cos(a), sin(a));
    float k = 0.26 * pow(1.55, fi);
    float amp = 0.42 * pow(0.56, fi);
    float w = sqrt(9.8 * k);
    float ph = dot(d, p) * k + w * t;
    h += sin(ph) * amp;
    slope += d * cos(ph) * amp * k;
  }
  return h;
}

void main() {
  vec2 slope;
  float h = waves(position.xz, waveClock, slope);
  float dist = length(position.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(60.0, 180.0, dist);
  h *= fade;
  slope *= fade;
  vec3 p = vec3(position.x, h, position.z);
  vPos = p;
  vHeight = h;
  vT = waveClock;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vT;
in float vHeight;
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
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += vnoise(p) * a;
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}
float ripple(vec2 p, float t) {
  return fbm(p * 1.6 + vec2(t * 0.35, t * 0.22)) + 0.6 * fbm(p * 3.1 - vec2(t * 0.28, -t * 0.4));
}

void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);

  // Noise ripple detail: perturb the wave normal with the gradient of animated fbm.
  float e = 0.06;
  vec2 q = vPos.xz;
  float r0 = ripple(q, vT);
  float rx = ripple(q + vec2(e, 0.0), vT);
  float rz = ripple(q + vec2(0.0, e), vT);
  float detailFade = 1.0 - smoothstep(25.0, 110.0, dist);
  vec2 g = vec2(rx - r0, rz - r0) / e;
  vec3 n = normalize(vNormal + vec3(-g.x, 0.0, -g.y) * 0.16 * detailFade);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // Reflected sky (keep the ray above the horizon).
  vec3 rdir = reflect(-v, n);
  rdir.y = abs(rdir.y);
  vec3 refl = skyColor(rdir);

  // Water body colour: deeper in troughs, brighter on crests.
  vec3 deep = a3Lin(vec3(0.02, 0.17, 0.27));
  vec3 shallow = a3Lin(vec3(0.07, 0.42, 0.50));
  float crest = clamp(vHeight * 1.1 + 0.5, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.8 + (r0 - 0.5) * 0.25);

  vec3 col = mix(body, refl, clamp(fresnel, 0.0, 1.0));

  // Sun specular glint (Blinn-Phong on the rippled normal).
  vec3 sunDir = normalize(SUN_DIR);
  vec3 hv = normalize(sunDir + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 700.0) * 14.0 + pow(nh, 90.0) * 0.6;
  col += vec3(1.0, 0.88, 0.65) * glint;

  // Light foam on the highest crests.
  float foam = smoothstep(0.62, 0.9, vHeight * 1.2 + 0.45 + (r0 - 0.6) * 0.5) * (1.0 - smoothstep(30.0, 90.0, dist));
  col = mix(col, vec3(0.85, 0.9, 0.92), foam * 0.35);

  // Distance haze toward the horizon colour of the sky (matches the dome).
  vec3 flatDir = normalize(vec3(-toCam.x, 0.0, -toCam.z));
  vec3 haze = skyColor(flatDir);
  float hz = 1.0 - exp(-dist * 0.011);
  col = mix(col, haze, clamp(hz * hz + smoothstep(120.0, 190.0, dist), 0.0, 1.0));

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double"
});

// ---- water grid: dense near the origin (camera area), coarser toward the edge ----
const N = 300;
const HALF = 260;
const positions = new Float32Array((N + 1) * (N + 1) * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
const warp = (u: number): number => Math.sign(u) * u * u * HALF;
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions[v * 3] = warp((i / N) * 2 - 1);
    positions[v * 3 + 1] = 0;
    positions[v * 3 + 2] = warp((j / N) * 2 - 1);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#dbe8f5" })
    .add(primitives.sphere({ name: "sky", size: 1, material: SKY_DOME, castShadow: false }).scale([900, 900, 900]))
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-HALF, -3, -HALF], max: [HALF, 3, HALF] }
          }),
          { name: "water", material: WATER, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.2, 16], target: [0, 1.0, -40], fov: 50, near: 0.3, far: 1500 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
(window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
