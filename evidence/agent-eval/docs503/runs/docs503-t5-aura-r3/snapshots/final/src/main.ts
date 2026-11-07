import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Water grid. Vertex displacement needs vertices, so the surface is a subdivided
// grid. Spacing grows with distance from the origin (t^1.5) so the near field is
// dense and the far field still reaches the horizon.
// ---------------------------------------------------------------------------
const N = 280;
const EXTENT = 200;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
const warp = (t: number): number => Math.sign(t) * Math.abs(t) ** 1.5 * EXTENT;
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([warp((i / N) * 2 - 1), 0, warp((j / N) * 2 - 1)], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

// ---------------------------------------------------------------------------
// Shared GLSL: procedural sky (gradient + sun glow + sun disc). Colours are linear
// light; the engine output stage tone maps (ACES) and sRGB-encodes.
// ---------------------------------------------------------------------------
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.2425, 0.1552, -0.9578);
const vec3 HORIZON_COL = vec3(0.62, 0.74, 0.88);
const vec3 ZENITH_COL = vec3(0.07, 0.22, 0.58);
vec3 skyBase(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(HORIZON_COL, ZENITH_COL, pow(h, 0.5));
  float s = max(dot(d, SUN_DIR), 0.0);
  c += vec3(1.0, 0.62, 0.32) * pow(s, 6.0) * 0.30;
  c += vec3(1.0, 0.80, 0.55) * pow(s, 80.0) * 0.9;
  return c;
}
float skySunDisc(vec3 d) {
  float s = dot(d, SUN_DIR);
  return smoothstep(0.99955, 0.99985, s);
}
`;

const NOISE_GLSL = /* glsl */ `
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
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
float ripple(vec2 p, float t) {
  return fbm(p * 1.4 + vec2(t * 0.22, t * 0.13)) * 0.6 + fbm(p * 3.3 - vec2(t * 0.28, -t * 0.19)) * 0.4;
}
`;

const water = material.custom({
  side: "double",
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out float vHeight;
out float vTime;
void addWave(inout float h, inout vec2 g, vec2 p, vec2 k, float amp, float t) {
  float w = sqrt(9.8 * length(k));
  float ph = dot(k, p) + t * w;
  h += amp * sin(ph);
  g += amp * cos(ph) * k;
}
void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(h, g, p, vec2(0.35, 0.20), 0.28, waveClock);
  addWave(h, g, p, vec2(-0.25, 0.45), 0.18, waveClock);
  addWave(h, g, p, vec2(0.70, -0.30), 0.09, waveClock);
  addWave(h, g, p, vec2(-0.90, -0.80), 0.04, waveClock);
  vec3 local = vec3(p.x, h, p.y);
  vWorld = (modelMatrix * vec4(local, 1.0)).xyz;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  vHeight = h;
  vTime = waveClock;
  gl_Position = modelViewProjectionMatrix * vec4(local, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in float vHeight;
in float vTime;
out vec4 outColor;
${SKY_GLSL}
${NOISE_GLSL}
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // Procedural ripple detail: noise height field -> perturbed normal, faded with distance.
  vec2 q = vWorld.xz;
  float e = 0.06;
  float r0 = ripple(q, vTime);
  float rx = ripple(q + vec2(e, 0.0), vTime);
  float rz = ripple(q + vec2(0.0, e), vTime);
  float fade = 1.0 - smoothstep(25.0, 110.0, dist);
  vec3 n = normalize(vNormal + vec3(-(rx - r0), 0.0, -(rz - r0)) / e * 0.10 * fade);

  // Fresnel (Schlick): more sky reflection at grazing angles.
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // Reflected sky.
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 reflected = skyBase(r);

  // Water body: deep blue, lighter on crests, a little scatter toward the sun side.
  vec3 deep = vec3(0.004, 0.035, 0.07);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  float crest = clamp(vHeight * 1.6 + 0.45, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * crest);
  body += vec3(0.01, 0.05, 0.04) * (r0 - 0.4) * fade;

  vec3 col = mix(body, reflected, fresnel);

  // Sun specular glint: tight lobe plus a broader sheen.
  float sr = max(dot(r, SUN_DIR), 0.0);
  col += vec3(1.0, 0.86, 0.62) * (pow(sr, 900.0) * 14.0 + pow(sr, 120.0) * 0.9 + pow(sr, 22.0) * 0.12);

  // Far water melts into the horizon haze so the grid edge never shows.
  vec3 haze = skyBase(normalize(vec3(r.x, 0.015, r.z)));
  col = mix(col, haze, smoothstep(90.0, 185.0, dist));

  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

// Sky dome: inside of a huge sphere, shaded from the view direction.
const skyDome = material.custom({
  side: "double",
  depthWrite: false,
  fog: false,
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
  vec3 col = skyBase(d) + vec3(1.0, 0.92, 0.75) * skySunDisc(d) * 10.0;
  outColor = vec4(col, 1.0);
}`
  }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#9dbbd8" })
    .add(primitives.sphere({ name: "sky", size: 1, material: skyDome, castShadow: false }).scale([1600, 1600, 1600]))
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-EXTENT, -1.5, -EXTENT], max: [EXTENT, 1.5, EXTENT] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.2, 24], target: [0, -0.9, -60], fov: 50, near: 0.5, far: 3000 }))
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
