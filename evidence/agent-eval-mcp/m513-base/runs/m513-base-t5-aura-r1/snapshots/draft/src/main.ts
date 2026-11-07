import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Water grid. Vertices are packed densely near the camera (quadratic spacing) so the
// vertex-shader waves are real geometry up close and the grid still reaches the horizon.
// ---------------------------------------------------------------------------
const N = 250; // (N+1)^2 = 63001 vertices, stays below the 65535 16-bit index limit
const HALF = 450;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    const u = (i / N) * 2 - 1;
    const w = (j / N) * 2 - 1;
    positions[v * 3] = Math.sign(u) * u * u * HALF;
    positions[v * 3 + 1] = 0;
    positions[v * 3 + 2] = Math.sign(w) * w * w * HALF;
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

// ---------------------------------------------------------------------------
// Shared sky model. The dome draws it and the water samples it along the reflected ray,
// so the reflection matches what is overhead. Output is scene-linear (the engine's output
// stage tone maps and sRGB-encodes), so display colours are decoded with a3dSrgbToLinear.
// ---------------------------------------------------------------------------
const SKY_GLSL = /* glsl */ `
#include <colorspace_decode>
#include <a3d_noise>
const vec3 SUN_DIR = vec3(-0.30, 0.25, -1.0);
vec3 sunDirection() { return normalize(SUN_DIR); }
vec3 srgb(float r, float g, float b) { return a3dSrgbToLinear(vec3(r, g, b)); }
vec3 horizonColor() { return srgb(0.80, 0.88, 0.95); }
vec3 skyColor(vec3 d, bool withDisc) {
  vec3 sun = sunDirection();
  float h = clamp(d.y, 0.0, 1.0);
  vec3 zenith = srgb(0.16, 0.38, 0.78);
  vec3 col = mix(horizonColor(), zenith, pow(h, 0.5));
  float s = max(dot(d, sun), 0.0);
  col += vec3(1.0, 0.72, 0.42) * (pow(s, 6.0) * 0.18 + pow(s, 40.0) * 0.35);
  if (withDisc) col += vec3(1.0, 0.92, 0.75) * smoothstep(0.99935, 0.99975, dot(d, sun)) * 25.0;
  // soft clouds, projected on a plane above the viewer
  vec2 cuv = d.xz / (d.y + 0.2) * 0.9;
  float c = smoothstep(0.50, 0.82, a3dFbm(cuv * 1.3 + 3.0, 5));
  c *= smoothstep(0.02, 0.22, d.y);
  vec3 cloud = mix(vec3(0.95, 0.95, 0.97), vec3(1.0, 0.86, 0.7), pow(s, 8.0)) * 0.9;
  col = mix(col, cloud, c * 0.75);
  return col;
}`;

const domeMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
${SKY_GLSL}
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 col = skyColor(d, true);
  // below the horizon the dome only shows a faint haze band behind the water
  col = mix(col, horizonColor() * 0.8, smoothstep(0.0, -0.1, d.y));
  outColor = vec4(col, 1.0);
}`
  },
  depthWrite: false,
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out float vHeight;
out float vClock;
void addWave(vec2 p, vec2 dir, float len, float amp, float t, inout float h, inout vec2 g) {
  float k = 6.2831853 / len;
  float w = sqrt(9.81 * k);
  float ph = dot(dir, p) * k - w * t;
  h += amp * sin(ph);
  g += dir * (amp * k * cos(ph));
}
void main() {
  float t = waveClock;
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(position.xz, normalize(vec2(0.15, -1.0)), 26.0, 0.34, t, h, g);
  addWave(position.xz, normalize(vec2(-0.55, -0.85)), 15.0, 0.20, t, h, g);
  addWave(position.xz, normalize(vec2(0.80, -0.55)), 8.5, 0.11, t, h, g);
  addWave(position.xz, normalize(vec2(-0.20, 0.95)), 5.0, 0.05, t, h, g);
  vec3 p = vec3(position.x, h, position.z);
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  vHeight = h;
  vClock = t;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
${SKY_GLSL}
in vec3 vWorld;
in vec3 vNormal;
in float vHeight;
in float vClock;
out vec4 outColor;

float ripple(vec2 p, float t) {
  float a = a3dFbm(p * 0.9 + vec2(t * 0.25, t * 0.12), 3);
  float b = a3dFbm(p * 2.6 + vec2(-t * 0.20, t * 0.31), 3);
  float c = a3dFbm(p * 7.0 + vec2(t * 0.45, -t * 0.38), 2);
  return a + 0.5 * b + 0.2 * c;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // noise ripple detail: perturb the analytic wave normal, fade with distance to avoid shimmer
  vec2 p = vWorld.xz;
  float e = 0.06;
  float r0 = ripple(p, vClock);
  vec2 grad = vec2(ripple(p + vec2(e, 0.0), vClock) - r0, ripple(p + vec2(0.0, e), vClock) - r0) / e;
  float detail = 0.30 * exp(-dist * 0.03);
  vec3 n = normalize(vNormal + vec3(-grad.x, 0.0, -grad.y) * detail);

  // fresnel (Schlick): more sky at grazing angles
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // reflected sky; the ray is folded above the horizon so waves never reflect the underside
  vec3 rdir = reflect(-v, n);
  rdir.y = abs(rdir.y);
  vec3 reflection = skyColor(normalize(rdir), false);

  // water body colour: darker in troughs, greener and brighter on crests
  vec3 deep = srgb(0.02, 0.15, 0.26);
  vec3 shallow = srgb(0.10, 0.46, 0.52);
  float crest = clamp(vHeight * 1.2 + 0.5, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * (0.35 + 0.65 * ndv));

  vec3 col = mix(body, reflection, fresnel);

  // sun specular glint: tight core + broader sheen, broken up by the ripples
  vec3 sun = sunDirection();
  float sp = max(dot(rdir, sun), 0.0);
  vec3 sunCol = vec3(1.0, 0.90, 0.72);
  col += sunCol * (pow(sp, 900.0) * 40.0 + pow(sp, 120.0) * 1.4 + pow(sp, 14.0) * 0.12);

  // aerial haze so the far water melts into the horizon
  float haze = 1.0 - exp(-dist * 0.0030);
  col = mix(col, horizonColor(), haze);

  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe0f0" })
    .add(
      primitives
        .sphere({ name: "sky-dome", size: 1800, material: domeMaterial })
        .runtime({ id: "sky-dome" })
    )
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-HALF, -1.5, -HALF], max: [HALF, 1.5, HALF] }
          }),
          { name: "water", material: waterMaterial, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(
      camera.perspective({
        position: [0, 2.4, 6],
        target: [0, 1.6, -40],
        fov: 55,
        near: 0.3,
        far: 4000
      })
    ),
  output: { toneMapping: "neutral", exposure: 1 }
});

const start = performance.now();
let frames = 0;
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
  frames += 1;
  if (frames === 2) window.__EVAL_READY__ = true;
});

await app.ready();
