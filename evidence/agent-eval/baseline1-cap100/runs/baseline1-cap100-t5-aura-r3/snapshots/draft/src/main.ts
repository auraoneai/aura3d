import { createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

/* -------------------------------------------------------------------------- */
/* Shared GLSL: sky model, tone mapping, wave field                           */
/* All colours are LINEAR light. The engine output stage sRGB-encodes, and we */
/* tone map ourselves (app output toneMapping is "none"), so sky + water use  */
/* the same filmic curve and nothing is washed out.                           */
/* -------------------------------------------------------------------------- */

const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(0.1938, 0.1550, -0.9691);
const vec3 SUN_COL = vec3(1.0, 0.86, 0.66);

vec3 skyBase(vec3 dirIn) {
  vec3 d = normalize(vec3(dirIn.x, max(dirIn.y, 0.0), dirIn.z));
  float y = d.y;
  vec3 horizon = vec3(0.46, 0.62, 0.80);
  vec3 zenith = vec3(0.03, 0.14, 0.48);
  vec3 c = mix(horizon, zenith, pow(y, 0.5));
  float s = max(dot(d, SUN_DIR), 0.0);
  c += SUN_COL * (pow(s, 6.0) * 0.18 + pow(s, 80.0) * 0.45);
  return c;
}

vec3 filmic(vec3 x) {
  x *= 0.95;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
`;

const WAVES_GLSL = /* glsl */ `
float waveTerm(vec2 p, float t, vec2 dir, float amp, float k, float sharp, inout vec2 g) {
  float ph = dot(dir, p) * k + t * sqrt(9.81 * k);
  float s = 0.5 + 0.5 * sin(ph);
  float e = pow(s, sharp);
  g += dir * (amp * sharp * pow(s, sharp - 1.0) * cos(ph) * k);
  return amp * (2.0 * e - 1.0);
}

// Sum of directional swell + chop. Returns height, writes the xz gradient.
float waveHeight(vec2 p, float t, out vec2 g) {
  g = vec2(0.0);
  float h = 0.0;
  h += waveTerm(p, t, normalize(vec2(0.18, 1.0)), 0.34, 0.27, 1.8, g);
  h += waveTerm(p, t, normalize(vec2(-0.5, 1.0)), 0.22, 0.45, 1.8, g);
  h += waveTerm(p, t, normalize(vec2(0.7, 0.8)), 0.14, 0.80, 1.8, g);
  h += waveTerm(p, t, normalize(vec2(-0.3, 1.0)), 0.07, 1.50, 1.3, g);
  h += waveTerm(p, t, normalize(vec2(0.9, 0.4)), 0.035, 2.60, 1.3, g);
  return h;
}
`;

/* -------------------------------------------------------------------------- */
/* Water shader                                                               */
/* -------------------------------------------------------------------------- */

const WATER_VERTEX = /* glsl */ `
out vec3 vWorld;
out float vH;
${WAVES_GLSL}
void main() {
  vec3 p = position;
  vec2 g;
  float h = waveHeight(p.xz, uTime, g);
  p.y += h;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vH = h;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}
`;

const WATER_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in float vH;
out vec4 outColor;
${SKY_GLSL}
${WAVES_GLSL}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}

// Procedural noise ripple height (two scrolling fbm layers).
float ripple(vec2 p, float t) {
  return fbm(p * 1.1 + vec2(t * 0.11, t * 0.07)) * 0.6
       + fbm(p * 2.7 - vec2(t * 0.15, -t * 0.10)) * 0.4;
}

vec2 rippleGrad(vec2 p, float t) {
  float e = 0.08;
  float r0 = ripple(p, t);
  return vec2(ripple(p + vec2(e, 0.0), t) - r0, ripple(p + vec2(0.0, e), t) - r0) / e;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = max(length(toCam), 0.001);
  vec3 V = toCam / dist;

  // Analytic wave slope + noise ripple detail, flattened with distance (anti-alias).
  vec2 g;
  float h = waveHeight(vWorld.xz, uTime, g);
  vec2 rg = rippleGrad(vWorld.xz, uTime);
  float lod = 1.0 / (1.0 + dist * 0.02);
  vec2 slope = (g + rg * 0.15) * lod;
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  float ndv = clamp(dot(N, V), 0.0, 1.0);
  // Fresnel (Schlick): grazing angles reflect the sky much more strongly.
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyBase(R);

  // Water body: deep blue-green, brighter/shallower tint on crests.
  float crest = clamp(h * 1.3 + 0.5, 0.0, 1.0);
  vec3 deep = vec3(0.004, 0.050, 0.095);
  vec3 shallow = vec3(0.020, 0.240, 0.280);
  vec3 body = mix(deep, shallow, crest * crest * 0.8);
  body += SUN_COL * vec3(0.02, 0.05, 0.045) * max(dot(N, SUN_DIR), 0.0);

  vec3 col = mix(body, refl, F);

  // Foam on the highest crests, broken up by noise.
  float fnoise = fbm(vWorld.xz * 0.9 + vec2(uTime * 0.05, 0.0));
  float foam = smoothstep(0.42, 0.75, h + (fnoise - 0.5) * 0.35) * lod;
  col = mix(col, vec3(0.62, 0.68, 0.72) * (0.5 + 0.5 * refl), foam * 0.5);

  // Distance haze toward the horizon colour (matches the sky dome exactly).
  vec3 fogCol = skyBase(vec3(-V.x, 0.0, -V.z));
  float fog = smoothstep(60.0, 270.0, dist);
  col = mix(col, fogCol, fog);

  // Sun specular glint: tight core + soft sheen, modulated by fresnel.
  float sd = max(dot(R, SUN_DIR), 0.0);
  float glint = pow(sd, 900.0) * 40.0 + pow(sd, 120.0) * 1.6 + pow(sd, 12.0) * 0.12;
  col += SUN_COL * glint * (0.15 + F) * (1.0 - 0.5 * fog);

  outColor = vec4(filmic(col), 1.0);
}
`;

/* -------------------------------------------------------------------------- */
/* Sky dome shader                                                            */
/* -------------------------------------------------------------------------- */

const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 c = skyBase(d);
  float s = dot(d, SUN_DIR);
  c += SUN_COL * 18.0 * smoothstep(0.99975, 0.99993, s) * step(0.0, d.y);
  outColor = vec4(filmic(c), 1.0);
}
`;

/* -------------------------------------------------------------------------- */
/* Subdivided water grid (waves are real geometry)                            */
/* Cells are dense near the camera and stretch toward the horizon.            */
/* -------------------------------------------------------------------------- */

function buildWaterGrid(segments: number, radius: number) {
  const n = segments + 1;
  const positions = new Float32Array(n * n * 3);
  const map = (u: number): number => radius * u * (0.06 + 0.94 * u * u);
  for (let j = 0; j < n; j += 1) {
    const v = (j / segments) * 2 - 1;
    for (let i = 0; i < n; i += 1) {
      const u = (i / segments) * 2 - 1;
      const o = (j * n + i) * 3;
      positions[o] = map(u);
      positions[o + 1] = 0;
      positions[o + 2] = map(v);
    }
  }
  const indices = new Uint16Array(segments * segments * 6);
  let k = 0;
  for (let j = 0; j < segments; j += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // counter-clockwise seen from +Y
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return geometry.define({
    positions,
    indices,
    bounds: { min: [-radius, -1.5, -radius], max: [radius, 1.5, radius] }
  });
}

const water = geometry.custom(buildWaterGrid(200, 280), {
  name: "water surface",
  castShadow: false,
  receiveShadow: false,
  material: material.custom({
    glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
    side: "double"
  })
});

const skyDome = primitives.sphere({
  name: "sky dome",
  size: 900,
  castShadow: false,
  receiveShadow: false,
  material: material.custom({
    glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
    side: "double",
    depthWrite: false
  })
});

const app = createAuraApp("#app", {
  scene: scene()
    .background("#9dbbd8")
    .add(skyDome)
    .add(water)
    .camera({
      mode: "perspective",
      position: [0, 3.6, 0],
      target: [0, -1.3, -40],
      fov: 52,
      near: 0.1,
      far: 1500
    }),
  output: { toneMapping: "none" },
  resize: false,
  pixelRatio: 1
});

let frames = 0;
const markReady = (): void => {
  frames += 1;
  if (frames >= 2) window.__EVAL_READY__ = true;
};
app.onFrame(markReady);

// Fallback: guarantee the flag even if the engine callback never fires.
const tick = (): void => {
  markReady();
  if (!window.__EVAL_READY__) requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
