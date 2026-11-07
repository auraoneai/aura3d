import { camera, createAuraApp, geometry, material, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Shared GLSL. Custom shaders write linear light. Colours are authored in sRGB,
// decoded with srgb2lin, shaped by a soft highlight shoulder and written out.
// The app runs with output.toneMapping "none", so the output stage only
// sRGB-encodes and the authored colours reach the screen unchanged.
// ---------------------------------------------------------------------------
const COMMON_GLSL = /* glsl */ `
vec3 srgb2lin(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
// identity below 0.8, smooth roll-off towards 1.0 above it (keeps the sun bright, never clips hard)
vec3 shoulder(vec3 x) {
  x = max(x, vec3(0.0));
  vec3 over = max(x - 0.8, vec3(0.0));
  return min(x, vec3(0.8)) + 0.2 * (1.0 - exp(-over / 0.2));
}
const vec3 SUN_DIR = vec3(0.2182, 0.1987, -0.9556); // normalised, ~11 degrees above the horizon, ahead of the camera
vec3 skyColor(vec3 d, float sunAmount) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = srgb2lin(vec3(0.86, 0.91, 0.95));
  vec3 mid = srgb2lin(vec3(0.52, 0.74, 0.92));
  vec3 zenith = srgb2lin(vec3(0.12, 0.33, 0.66));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, zenith, smoothstep(0.15, 0.95, h));
  float sd = clamp(dot(normalize(d), SUN_DIR), 0.0, 1.0);
  vec3 sunCol = srgb2lin(vec3(1.0, 0.92, 0.75));
  float glow = pow(sd, 6.0) * 0.18 + pow(sd, 40.0) * 0.35;
  col += sunCol * glow * sunAmount;
  col += sunCol * smoothstep(0.99965, 0.99985, sd) * 12.0 * sunAmount;
  return col;
}
`;

const WAVES_GLSL = /* glsl */ `
void addWave(vec2 p, vec2 dir, float k, float amp, float speed, float t, inout float h, inout vec2 s) {
  float ph = dot(p, normalize(dir)) * k + t * speed;
  h += sin(ph) * amp;
  s += normalize(dir) * (cos(ph) * amp * k);
}
// height and horizontal slope of the wave sum at world xz
float waveField(vec2 p, float t, out vec2 slope) {
  float h = 0.0;
  slope = vec2(0.0);
  addWave(p, vec2(0.9, 0.45), 0.42, 0.42, 0.95, t, h, slope);
  addWave(p, vec2(-0.35, 1.0), 0.73, 0.24, 1.25, t, h, slope);
  addWave(p, vec2(0.6, -0.8), 1.35, 0.11, 1.7, t, h, slope);
  addWave(p, vec2(-1.0, -0.25), 2.3, 0.055, 2.2, t, h, slope);
  return h;
}
`;

// ---------------------------------------------------------------------------
// Water surface: a dense grid, finest near the camera, displaced in the vertex shader.
// ---------------------------------------------------------------------------
const N = 256;
const EXTENT = 400;
const positions = new Float32Array((N + 1) * (N + 1) * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    const u = (i / N) * 2 - 1;
    const w = (j / N) * 2 - 1;
    positions.set([Math.sign(u) * u * u * EXTENT, 0, Math.sign(w) * w * w * EXTENT], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
${WAVES_GLSL}
out vec3 vPos;
void main() {
  vec2 slope;
  float h = waveField(position.xz, waveClock, slope);
  vec3 p = vec3(position.x, h, position.z);
  vPos = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
${COMMON_GLSL}
${WAVES_GLSL}
in vec3 vPos;
out vec4 outColor;

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
float ripple(vec2 p, float t) {
  float a = vnoise(p * 1.7 + vec2(t * 0.35, t * 0.22));
  float b = vnoise(p * 3.9 - vec2(t * 0.28, -t * 0.4) + 17.0);
  float c = vnoise(p * 8.3 + vec2(t * 0.5, t * 0.1) + 5.0);
  return a * 0.55 + b * 0.3 + c * 0.15;
}

void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // large-scale normal from the same analytic waves the vertex shader displaced with
  vec2 slope;
  float h = waveField(vPos.xz, waveClock, slope);
  vec3 n = vec3(-slope.x, 1.0, -slope.y);

  // noise-based ripple detail, faded with distance to avoid shimmer
  float e = 0.06;
  float r0 = ripple(vPos.xz, waveClock);
  vec2 grad = vec2(ripple(vPos.xz + vec2(e, 0.0), waveClock) - r0, ripple(vPos.xz + vec2(0.0, e), waveClock) - r0) / e;
  float fade = 1.0 / (1.0 + dist * 0.045);
  n.xz -= grad * 0.22 * fade;
  n = normalize(n);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // reflected sky (mirror the ray if a steep wave pushes it below the horizon)
  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 reflected = skyColor(normalize(refl), 0.0);

  // body colour: deep water, lighter on crests, lit by the sun
  vec3 deep = srgb2lin(vec3(0.02, 0.13, 0.24));
  vec3 shallow = srgb2lin(vec3(0.07, 0.42, 0.5));
  float crest = clamp(h * 0.9 + 0.45, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * crest);
  float diff = 0.55 + 0.45 * max(dot(n, SUN_DIR), 0.0);
  body *= diff;

  vec3 col = mix(body, reflected, clamp(fresnel, 0.0, 1.0));

  // sun glint: tight Blinn-Phong lobe plus a broader sheen
  vec3 hv = normalize(SUN_DIR + v);
  float nh = max(dot(n, hv), 0.0);
  vec3 sunCol = srgb2lin(vec3(1.0, 0.92, 0.75));
  float glint = pow(nh, 700.0) * 14.0 + pow(nh, 90.0) * 0.5;
  col += sunCol * glint * (0.35 + 0.65 * fresnel);

  // distance haze towards the horizon colour so the water meets the sky
  float haze = 1.0 - exp(-pow(dist * 0.0055, 1.4));
  col = mix(col, skyColor(vec3(1.0, 0.0, 0.0), 0.0), clamp(haze, 0.0, 1.0));

  outColor = vec4(shoulder(col), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double",
  fog: false
});

// ---------------------------------------------------------------------------
// Sky dome: an inward-facing sphere around the scene, same gradient the water reflects.
// ---------------------------------------------------------------------------
const DOME_R = 1200;
const LON = 48;
const LAT = 24;
const domePos: number[] = [];
const domeNrm: number[] = [];
const domeIdx: number[] = [];
for (let a = 0; a <= LAT; a += 1) {
  const phi = (a / LAT) * Math.PI;
  for (let b = 0; b <= LON; b += 1) {
    const theta = (b / LON) * Math.PI * 2;
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    domePos.push(x * DOME_R, y * DOME_R, z * DOME_R);
    domeNrm.push(-x, -y, -z);
    if (a < LAT && b < LON) {
      const i0 = a * (LON + 1) + b;
      const i1 = i0 + LON + 1;
      domeIdx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
  }
}

const skyMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
${COMMON_GLSL}
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  outColor = vec4(shoulder(skyColor(d, 1.0)), 1.0);
}`
  },
  side: "double",
  depthWrite: false,
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#dbe8f2" })
    .add(
      geometry.custom(
        geometry.define({
          positions: new Float32Array(domePos),
          normals: new Float32Array(domeNrm),
          indices: domeIdx,
          bounds: { min: [-DOME_R, -DOME_R, -DOME_R], max: [DOME_R, DOME_R, DOME_R] }
        }),
        { name: "sky-dome", material: skyMaterial, castShadow: false, receiveShadow: false }
      )
    )
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-EXTENT, -2, -EXTENT], max: [EXTENT, 2, EXTENT] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.2, 16], target: [0, -0.7, -40], fov: 50, near: 0.3, far: 3000 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
