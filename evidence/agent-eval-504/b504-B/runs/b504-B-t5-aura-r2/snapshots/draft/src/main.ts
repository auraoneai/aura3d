import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Water grid: warped so vertices are dense near the camera and sparse far away.
// ---------------------------------------------------------------------------
const N = 320;
const HALF = 420;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
const warp = (u: number): number => Math.sign(u) * u * u * HALF;
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([warp((i / N) * 2 - 1), 0, warp((j / N) * 2 - 1)], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

// ---------------------------------------------------------------------------
// Shared sky function (linear light). Colours are authored in sRGB and decoded.
// The sky dome and the water reflection both call it, so they match exactly.
// ---------------------------------------------------------------------------
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(0.19245, 0.19245, -0.96225);
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = srgb(vec3(0.80, 0.89, 0.97));
  vec3 mid = srgb(vec3(0.40, 0.65, 0.93));
  vec3 zenith = srgb(vec3(0.10, 0.30, 0.70));
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
  c = mix(c, zenith, smoothstep(0.18, 0.95, h));
  float s = max(dot(d, SUN_DIR), 0.0);
  c += vec3(1.0, 0.72, 0.42) * pow(s, 6.0) * 0.10;
  c += vec3(1.0, 0.85, 0.60) * pow(s, 80.0) * 0.45;
  c += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 3.0;
  return c;
}
`;

const sky = material.custom({
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
  outColor = vec4(skyColor(d), 1.0);
}`
  },
  side: "back",
  depthWrite: false
});

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out float vH;

void addWave(vec2 p, vec2 dir, float len, float amp, float t, inout float h, inout vec2 g) {
  vec2 d = normalize(dir);
  float k = 6.2831853 / len;
  float ph = dot(d, p) * k + sqrt(9.81 * k) * t * 0.8;
  h += amp * sin(ph);
  g += amp * k * cos(ph) * d;
}

void main() {
  vec2 p = position.xz;
  float dist = length(p - cameraPosition.xz);
  float fade = 1.0 - smoothstep(80.0, 300.0, dist);
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(p, vec2(0.9, -0.5), 22.0, 0.45, waveClock, h, g);
  addWave(p, vec2(-0.4, -0.9), 13.0, 0.28, waveClock, h, g);
  addWave(p, vec2(0.6, 0.8), 7.0, 0.14, waveClock, h, g);
  addWave(p, vec2(-0.9, 0.3), 4.0, 0.07, waveClock, h, g);
  h *= fade;
  g *= fade;
  vec3 world = vec3(p.x, h, p.y);
  vWorld = world;
  vH = h;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(world, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in float vH;
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
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);
  float t = waveClock;

  // Procedural ripple detail: gradient of scrolling fbm perturbs the normal.
  float detail = 1.0 - smoothstep(25.0, 140.0, dist);
  vec2 q1 = vWorld.xz * 0.9 + vec2(t * 0.22, t * 0.14);
  vec2 q2 = vWorld.xz * 1.9 + vec2(-t * 0.18, t * 0.25);
  float e = 0.06;
  float r1 = fbm(q1);
  float r2 = fbm(q2);
  vec2 g1 = vec2(fbm(q1 + vec2(e, 0.0)) - r1, fbm(q1 + vec2(0.0, e)) - r1) / e;
  vec2 g2 = vec2(fbm(q2 + vec2(e, 0.0)) - r2, fbm(q2 + vec2(0.0, e)) - r2) / e;
  vec2 rip = (g1 * 0.7 + g2 * 0.4) * 0.09 * detail;
  vec3 n = normalize(vNormal + vec3(-rip.x, 0.0, -rip.y));

  // Fresnel (Schlick): more sky reflection at grazing angles.
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);

  // Water body colour: deep teal, lighter on wave crests.
  vec3 deep = srgb(vec3(0.02, 0.17, 0.27));
  vec3 shallow = srgb(vec3(0.10, 0.46, 0.52));
  float crest = clamp(vH * 0.9 + 0.45 + (r1 - 0.5) * 0.25, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * crest);

  // Reflection of the sky.
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(normalize(r));
  vec3 col = mix(body, refl, fresnel);

  // Sun specular glint: tight lobe plus a broader sheen.
  float sd = max(dot(r, SUN_DIR), 0.0);
  vec3 sunCol = vec3(1.0, 0.90, 0.70);
  col += sunCol * (pow(sd, 700.0) * 4.0 + pow(sd, 60.0) * 0.35) * (0.4 + 0.6 * detail);

  // Subtle foam on the highest crests, broken up by noise.
  float foam = smoothstep(0.62, 0.95, vH * 1.1 + (r2 - 0.5) * 0.5) * detail;
  col = mix(col, vec3(0.85, 0.9, 0.92), foam * 0.35);

  // Distance haze into the sky colour at the horizon.
  vec3 hz = normalize(vec3(-toCam.x, 0.0, -toCam.z));
  col = mix(col, skyColor(hz), smoothstep(120.0, 380.0, dist));

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#ccdff5" })
    .add(
      primitives
        .sphere({ name: "sky", size: 1, material: sky, castShadow: false })
        .scale([700, 700, 700])
    )
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-HALF, -2, -HALF], max: [HALF, 2, HALF] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3, 0], target: [0, 7.5, -50], fov: 50, near: 0.3, far: 2000 })),
  // Custom shaders write linear light and the output stage sRGB-encodes it.
  // Colours are authored in sRGB and decoded in the shader, so tone mapping is off to keep them as authored.
  output: { toneMapping: "none" }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
