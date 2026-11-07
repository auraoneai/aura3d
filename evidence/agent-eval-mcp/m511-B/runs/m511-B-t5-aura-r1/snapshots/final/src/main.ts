import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Subdivided grid (waves are real geometry). Camera sits near the +z edge looking toward -z.
const N = 256;
const SIZE = 320;
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

// Shared sky description: same colours drive sky.gradient and the water reflection.
const SKY_ZENITH = "#2f6fc4";
const SKY_HORIZON = "#cde2f2";
const SUN_ELEVATION = 11;
const SUN_AZIMUTH = 18;
const SKY_EXPONENT = 0.55;

const skyGlsl = /* glsl */ `
vec3 srgbToLin(vec3 c) { return pow(c, vec3(2.2)); }
const vec3 SKY_ZENITH = vec3(${hexToVec(SKY_ZENITH)});
const vec3 SKY_HORIZON = vec3(${hexToVec(SKY_HORIZON)});
const vec3 SUN_DIR = vec3(${sunVec(SUN_ELEVATION, SUN_AZIMUTH)});
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(srgbToLin(SKY_HORIZON), srgbToLin(SKY_ZENITH), pow(h, ${SKY_EXPONENT.toFixed(2)}));
  float s = max(dot(d, SUN_DIR), 0.0);
  c += vec3(1.0, 0.85, 0.6) * (pow(s, 24.0) * 0.25 + pow(s, 600.0) * 4.0);
  return c;
}
`;

function hexToVec(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): string => (v / 255).toFixed(4);
  return `${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)}`;
}
function sunVec(elDeg: number, azDeg: number): string {
  const e = (elDeg * Math.PI) / 180;
  const a = (azDeg * Math.PI) / 180;
  return `${(Math.sin(a) * Math.cos(e)).toFixed(4)}, ${Math.sin(e).toFixed(4)}, ${(-Math.cos(a) * Math.cos(e)).toFixed(4)}`;
}

const vertex = /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vTime;

// direction (xy), wavenumber, amplitude, speed
const int WAVES = 5;
const vec4 W0[WAVES] = vec4[WAVES](
  vec4( 0.0,  1.0, 0.22, 0.5),
  vec4( 0.55, 0.83, 0.37, 0.18),
  vec4(-0.62, 0.78, 0.55, 0.11),
  vec4( 0.9,  0.43, 0.90, 0.05),
  vec4(-0.3,  0.95, 1.40, 0.03)
);

void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < WAVES; i++) {
    vec2 d = normalize(W0[i].xy);
    float k = W0[i].z;
    float a = W0[i].w;
    float ph = dot(d, p) * k + waveClock * (1.0 + k * 1.2) * 0.9;
    // sharpened crest: sin shaped by an exponent for peakier waves
    float s = sin(ph);
    float e = exp(s - 1.0);
    h += a * e;
    grad += d * (a * e * cos(ph) * k);
  }
  h -= 0.1;
  vec3 pos = vec3(p.x, h, p.y);
  vPos = pos;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  vTime = waveClock;
  gl_Position = modelViewProjectionMatrix * vec4(pos, 1.0);
}`;

const fragment = /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vTime;
out vec4 outColor;

${skyGlsl}

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
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
float ripple(vec2 p, float t) {
  return fbm(p * 1.3 + vec2(t * 0.35, t * 0.2)) + 0.6 * fbm(p * 2.7 - vec2(t * 0.28, -t * 0.4));
}

void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // Noise ripple detail perturbs the geometric normal (fades with distance to avoid shimmer).
  vec2 q = vPos.xz;
  float e = 0.08;
  float r0 = ripple(q, vTime);
  float rx = ripple(q + vec2(e, 0.0), vTime);
  float rz = ripple(q + vec2(0.0, e), vTime);
  float detail = 1.0 - smoothstep(25.0, 120.0, dist);
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  vec3 n = normalize(vNormal + vec3(-rg.x, 0.0, -rg.y) * 0.16 * detail);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fresnel = clamp(fresnel, 0.0, 1.0);

  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 reflected = skyColor(normalize(refl));

  vec3 deep = srgbToLin(vec3(0.02, 0.17, 0.27));
  vec3 shallow = srgbToLin(vec3(0.10, 0.50, 0.55));
  float crest = clamp((vPos.y + 0.1) * 0.9, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.8 + (r0 - 0.5) * 0.15 * detail + 0.1 * pow(ndv, 2.0));

  vec3 col = mix(body, reflected, fresnel);

  // sun glint: sharp lobe plus a wider sheen
  float sd = max(dot(refl, SUN_DIR), 0.0);
  float glint = pow(sd, 700.0) * 5.0 + pow(sd, 90.0) * 0.5;
  col += vec3(1.0, 0.88, 0.65) * glint;

  // aerial perspective toward the horizon colour
  float fogAmt = 1.0 - exp(-pow(dist / 190.0, 2.0));
  col = mix(col, srgbToLin(SKY_HORIZON), clamp(fogAmt, 0.0, 1.0));

  outColor = vec4(col, 1.0);
}`;

const water = material.custom({
  glsl: { vertex, fragment },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

const app = createAuraApp("#app", {
  scene: scene({ background: SKY_HORIZON })
    .add(
      sky.gradient({
        zenith: SKY_ZENITH,
        horizon: SKY_HORIZON,
        ground: SKY_HORIZON,
        exponent: SKY_EXPONENT,
        sun: { elevationDeg: SUN_ELEVATION, azimuthDeg: SUN_AZIMUTH, intensity: 1 }
      })
    )
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-SIZE / 2, -4, -SIZE / 2], max: [SIZE / 2, 4, SIZE / 2] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 2.6, 60], target: [0, 1.6, 0], fov: 55, near: 0.3, far: 600 })),
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
