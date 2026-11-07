import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Custom GLSL water under a procedural gradient sky dome.
// Colour contract: both shaders write linear light, tone-map themselves (ACES fit) and the app sets
// output.toneMapping = "none", so the output stage only sRGB-encodes. Authored colours are sRGB, decoded with a3dSrgbToLinear.

// ---- Water grid: dense near the camera, sparse towards the horizon (geometry, so waves are real displacement). ----
const N = 320;
const HALF = 300;
const CAM_Z = 18;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
const warp = (t: number): number => Math.sign(t) * t * t;
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    const x = warp((i / N - 0.5) * 2) * HALF;
    const z = CAM_Z + warp((j / N - 0.5) * 2) * HALF;
    positions.set([x, 0, z], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

// ---- Shared sky (used by the dome and by the water reflection so they match exactly). ----
const SKY_GLSL = /* glsl */ `
#include <a3d_noise>
#include <a3d_sky>
#include <colorspace_decode>
const vec3 SUN_DIR = vec3(-0.3549, 0.2028, -0.9127);
const vec3 SUN_COL = vec3(1.0, 0.82, 0.58);
vec3 horizonColor() { return a3dSrgbToLinear(vec3(0.86, 0.90, 0.94)); }
vec3 skyColor(vec3 d, bool disc) {
  vec3 horizon = horizonColor();
  vec3 zenith = a3dSrgbToLinear(vec3(0.14, 0.36, 0.74));
  vec3 ground = horizon * 0.6;
  vec3 c = a3dSkyGradient(d, horizon, zenith, ground);
  // soft clouds
  vec2 cuv = d.xz / (max(d.y, 0.0) + 0.18);
  float cl = smoothstep(0.52, 0.88, a3dFbm(cuv * 1.3 + vec2(3.7, 1.1), 4)) * smoothstep(0.02, 0.2, d.y);
  c = mix(c, vec3(0.92, 0.9, 0.88), cl * 0.55);
  // sun glow and disc
  c += SUN_COL * (a3dSunGlow(d, SUN_DIR, 14.0) * 0.45 + a3dSunGlow(d, SUN_DIR, 3.0) * 0.08);
  if (disc) c += SUN_COL * a3dSunDisc(d, SUN_DIR, 0.03) * 25.0;
  return c;
}
vec3 finish(vec3 x) {
  x = max(x, vec3(0.0));
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
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
${SKY_GLSL}
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  outColor = vec4(finish(skyColor(d, true)), 1.0);
}`
  },
  side: "double",
  depthWrite: false,
  fog: false
});

const AMP = 0.85; // upper bound of the wave height, used to normalise crest height

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vH;
out float vT;
void addWave(vec2 p, vec2 dir, float k, float amp, float t, inout float h, inout vec2 g) {
  float phase = dot(p, dir) * k + t * sqrt(9.8 * k);
  h += amp * sin(phase);
  g += amp * k * cos(phase) * dir;
}
void main() {
  vec2 p = position.xz;
  float dist = length(cameraPosition - vec3(p.x, 0.0, p.y));
  float small = 1.0 - smoothstep(40.0, 140.0, dist); // fade short waves out with distance
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(p, normalize(vec2(0.35, -0.94)), 0.30, 0.46, waveClock, h, g);
  addWave(p, normalize(vec2(-0.62, -0.78)), 0.52, 0.24, waveClock, h, g);
  addWave(p, normalize(vec2(0.82, -0.57)), 0.85, 0.10 * (0.4 + 0.6 * small), waveClock, h, g);
  addWave(p, normalize(vec2(-0.30, -0.95)), 1.30, 0.045 * small, waveClock, h, g);
  addWave(p, normalize(vec2(0.95, 0.31)), 1.90, 0.02 * small, waveClock, h, g);
  vec3 world = vec3(p.x, h, p.y);
  vPos = world;
  vH = h;
  vT = waveClock;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(world, 1.0);
}`,
    fragment: /* glsl */ `
${SKY_GLSL}
in vec3 vPos;
in vec3 vNormal;
in float vH;
in float vT;
out vec4 outColor;
float ripple(vec2 p, float t) {
  float a = a3dFbm(p * 1.7 + vec2(t * 0.35, t * 0.20), 4);
  float b = a3dFbm(p * 2.9 + vec2(-t * 0.25, t * 0.40) + 7.3, 3);
  return a * 0.65 + b * 0.35;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);
  vec3 n = normalize(vNormal);

  // noise ripple detail perturbs the wave normal, fading out with distance to avoid shimmer
  float fade = 1.0 - smoothstep(25.0, 140.0, dist);
  float rip = 0.5;
  if (fade > 0.0) {
    vec2 q = vPos.xz;
    float e = 0.06;
    rip = ripple(q, vT);
    vec2 grad = vec2(ripple(q + vec2(e, 0.0), vT) - rip, ripple(q + vec2(0.0, e), vT) - rip) / e;
    n = normalize(n + vec3(-grad.x, 0.0, -grad.y) * 0.22 * fade);
  }

  // fresnel: more sky reflection at grazing angles
  float cosT = clamp(dot(n, v), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(normalize(r), false);

  // water body: deep blue-green, brighter turquoise on lit crests
  vec3 deepC = a3dSrgbToLinear(vec3(0.02, 0.17, 0.27));
  vec3 shallowC = a3dSrgbToLinear(vec3(0.10, 0.52, 0.54));
  float lit = clamp(dot(n, SUN_DIR) * 0.5 + 0.5, 0.0, 1.0);
  float crest = smoothstep(-0.3, 0.9, vH / ${AMP.toFixed(2)});
  vec3 body = mix(deepC, shallowC, clamp(crest * (0.35 + 0.65 * lit), 0.0, 1.0));

  vec3 col = mix(body, refl, F);

  // sun glint
  vec3 hv = normalize(SUN_DIR + v);
  float nh = max(dot(n, hv), 0.0);
  float facing = smoothstep(0.0, 0.1, dot(n, SUN_DIR));
  float glint = (pow(nh, 1200.0) * 40.0 + pow(nh, 120.0) * 0.9) * facing;
  col += SUN_COL * glint;

  // whitecaps on tall crests
  float foam = smoothstep(0.62, 0.95, vH / ${AMP.toFixed(2)}) * smoothstep(0.45, 0.7, rip) * (0.4 + 0.6 * fade);
  col = mix(col, vec3(0.8, 0.84, 0.86), foam * 0.45);

  // aerial haze into the horizon colour
  col = mix(col, horizonColor(), smoothstep(80.0, 300.0, dist));

  outColor = vec4(finish(col), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double",
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#dbe6ef" })
    .add(
      primitives
        .sphere({ name: "sky", size: 1600, material: sky, castShadow: false, receiveShadow: false })
        .position(0, 0, 0)
    )
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-HALF, -2, CAM_Z - HALF], max: [HALF, 2, CAM_Z + HALF] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.2, CAM_Z], target: [0, -4.8, -60], fov: 50, near: 0.3, far: 4000 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
let first = true;
const tick = (): void => {
  const t = (performance.now() - start) / 1000;
  app.nodes.require("water").setUniform?.("waveClock", t);
  if (first) {
    first = false;
    void app.ready().then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__EVAL_READY__ = true;
      }));
    });
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
