import { camera, createAuraApp, geometry, material, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

/* -------------------------------------------------------------------------- */
/* Scene constants                                                            */
/* -------------------------------------------------------------------------- */

const EYE: readonly [number, number, number] = [0, 2.2, 0];
const LOOK_AT: readonly [number, number, number] = [0.0, -3.0, -60];
const SKY_RADIUS = 700;
const GRID = 254; // 255 x 255 = 65025 vertices, fits 16-bit indices

/* -------------------------------------------------------------------------- */
/* Shared GLSL: noise, sky gradient (also sampled by the water), roll-off     */
/* -------------------------------------------------------------------------- */

const COMMON_GLSL = /* glsl */ `
#include <colorspace_decode>

const vec3 SUN_DIR = vec3(0.2367, 0.2178, -0.9468);

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
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}

// Sky colour in LINEAR light for a unit direction. sunAmt scales the tight
// sun disc / core so the water can add its own analytic glint instead.
vec3 skyColor(vec3 d, float t, float sunAmt) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = a3dSrgbToLinear(vec3(0.80, 0.90, 0.97));
  vec3 mid     = a3dSrgbToLinear(vec3(0.40, 0.66, 0.92));
  vec3 zenith  = a3dSrgbToLinear(vec3(0.10, 0.32, 0.70));
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  c = mix(c, zenith, smoothstep(0.12, 0.9, h));

  float sd = max(dot(d, SUN_DIR), 0.0);

  if (d.y > 0.02) {
    vec2 cp = d.xz / (d.y + 0.15) * 1.4 + vec2(t * 0.015, 0.0);
    float cl = smoothstep(0.50, 0.80, fbm(cp));
    cl *= smoothstep(0.02, 0.22, d.y);
    vec3 cloudCol = a3dSrgbToLinear(vec3(0.96, 0.97, 0.99)) * (0.78 + 0.35 * pow(sd, 3.0));
    c = mix(c, cloudCol, cl * 0.85);
  }

  c += vec3(1.0, 0.78, 0.5) * 0.30 * pow(sd, 10.0);
  c += vec3(1.0, 0.88, 0.65) * 0.9 * pow(sd, 220.0) * sunAmt;
  c += vec3(1.0, 0.95, 0.85) * 30.0 * smoothstep(0.9993, 0.9997, sd) * sunAmt;
  return c;
}

// Linear to linear soft shoulder: identity below 0.8, saturates smoothly at 1.0.
vec3 rolloff(vec3 c) {
  c = max(c, vec3(0.0));
  vec3 over = max(c - vec3(0.8), vec3(0.0));
  return min(c, vec3(0.8)) + 0.2 * (vec3(1.0) - exp(-over / 0.2));
}
`;

/* -------------------------------------------------------------------------- */
/* Sky dome shader                                                            */
/* -------------------------------------------------------------------------- */

const SKY_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
${COMMON_GLSL}
out vec4 outColor;
in vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  outColor = vec4(rolloff(skyColor(d, skyTime, 1.0)), 1.0);
}
`;

/* -------------------------------------------------------------------------- */
/* Water shader                                                               */
/* -------------------------------------------------------------------------- */

const WATER_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec3 vWaveN;
out float vCrest;

// Gerstner wave: displaces vertically and horizontally, accumulates the
// analytic slope of the surface.
void addWave(vec2 dir, float L, float A, float Q, vec2 xz, float t,
             inout vec3 disp, inout vec3 nrm) {
  vec2 d = normalize(dir);
  float k = 6.2831853 / L;
  float c = sqrt(9.8 / k);
  float ph = k * (dot(d, xz) - c * t);
  float s = sin(ph);
  float co = cos(ph);
  disp.xz += Q * A * d * co;
  disp.y += A * s;
  nrm.xz -= d * (k * A * co);
  nrm.y -= Q * k * A * s;
}

void main() {
  vec3 p = position;
  float t = waterTime * 0.6;
  vec3 disp = vec3(0.0);
  vec3 nrm = vec3(0.0, 1.0, 0.0);

  addWave(vec2( 0.15, -1.00), 22.0, 0.40, 0.8, p.xz, t, disp, nrm);
  addWave(vec2(-0.45, -1.00), 13.0, 0.17, 0.8, p.xz, t, disp, nrm);
  addWave(vec2( 0.80, -0.60),  7.5, 0.08, 0.8, p.xz, t, disp, nrm);
  addWave(vec2(-0.90, -0.40),  4.2, 0.04, 0.8, p.xz, t, disp, nrm);
  addWave(vec2( 0.30,  0.90),  2.6, 0.015, 0.8, p.xz, t, disp, nrm);

  vec3 w = vec3(p.x + disp.x, disp.y, p.z + disp.z);
  vWorld = w;
  vWaveN = nrm;
  vCrest = clamp(disp.y * 0.7 + 0.5, 0.0, 1.0);
  gl_Position = modelViewProjectionMatrix * vec4(w, 1.0);
}
`;

const WATER_FRAGMENT = /* glsl */ `
${COMMON_GLSL}
out vec4 outColor;
in vec3 vWorld;
in vec3 vWaveN;
in float vCrest;

float rippleH(vec2 q, float t) {
  return fbm(q * 1.6 + vec2(0.35, 0.20) * t) * 0.6
       + fbm(q * 4.1 - vec2(0.25, 0.55) * t) * 0.4;
}

void main() {
  vec3 toEye = eye - vWorld;
  float dist = max(length(toEye), 1e-3);
  vec3 V = toEye / dist;

  // Procedural noise ripple detail on top of the geometric wave normal.
  float t = waterTime * 0.6;
  vec2 q = vWorld.xz;
  float e = 0.06;
  float h0 = rippleH(q, t);
  float hx = rippleH(q + vec2(e, 0.0), t);
  float hz = rippleH(q + vec2(0.0, e), t);
  vec2 grad = vec2(hx - h0, hz - h0) / e;
  float detailFade = 1.0 / (1.0 + dist * dist * 0.0009);
  vec3 N = normalize(vWaveN + vec3(-grad.x, 0.0, -grad.y) * 0.10 * detailFade);

  // Fresnel: more sky reflection at grazing angles.
  float cosv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
  fres = clamp(fres, 0.0, 1.0);

  // Reflected sky (same gradient as the dome, no analytic sun disc).
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyColor(normalize(R), waterTime, 0.0);

  // Water body: deep blue-green, brighter / greener on wave crests.
  vec3 deep    = a3dSrgbToLinear(vec3(0.02, 0.20, 0.30));
  vec3 shallow = a3dSrgbToLinear(vec3(0.10, 0.52, 0.58));
  vec3 body = mix(deep, shallow, smoothstep(0.35, 0.95, vCrest));
  float diff = 0.55 + 0.45 * max(dot(N, SUN_DIR), 0.0);
  body *= diff;

  vec3 col = mix(body, refl, fres);

  // Sun specular glint (tight lobe + broad sheen), broken up by sparkle noise.
  vec3 Hh = normalize(SUN_DIR + V);
  float nh = max(dot(N, Hh), 0.0);
  float sparkle = 0.65 + 0.7 * vnoise(q * 6.0 + vec2(waterTime * 0.8, -waterTime * 0.5));
  float glint = pow(nh, 700.0) * 14.0 * sparkle + pow(nh, 70.0) * 0.45;
  col += vec3(1.0, 0.90, 0.72) * glint;

  // Distance haze toward the horizon colour so the edge of the grid vanishes.
  float fogF = 1.0 - exp(-(dist * dist) / (180.0 * 180.0));
  vec3 flatDir = normalize(vec3(-V.x, 0.0, -V.z) + vec3(0.0, 0.0, 1e-4));
  vec3 haze = skyColor(flatDir, waterTime, 0.0);
  col = mix(col, haze, fogF);

  outColor = vec4(rolloff(col), 1.0);
}
`;

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

// Subdivided grid that is dense around the camera and sparse towards the
// horizon. Waves displace these vertices in the vertex shader.
function buildWaterGrid() {
  const n = GRID;
  const stride = n + 1;
  const positions = new Float32Array(stride * stride * 3);
  const normals = new Float32Array(stride * stride * 3);
  const uvs = new Float32Array(stride * stride * 2);
  const rx = 300;
  const zLen = 420;
  const zNear = 20;

  for (let j = 0; j <= n; j++) {
    const s = j / n;
    const z = zNear - zLen * (0.15 * s + 0.85 * s * s);
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * 2 - 1;
      const x = rx * (0.2 * u + 0.8 * u * Math.abs(u));
      const v = j * stride + i;
      positions[v * 3] = x;
      positions[v * 3 + 1] = 0;
      positions[v * 3 + 2] = z;
      normals[v * 3 + 1] = 1;
      uvs[v * 2] = i / n;
      uvs[v * 2 + 1] = j / n;
    }
  }

  const indices = new Uint16Array(n * n * 6);
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // counter-clockwise seen from +Y (z decreases with j)
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }

  return {
    kind: "aura-custom-geometry" as const,
    positions,
    normals,
    uvs,
    indices,
    bounds: {
      min: [-rx, -2, zNear - zLen] as [number, number, number],
      max: [rx, 2, zNear] as [number, number, number]
    }
  };
}

function buildSkyDome(radius: number) {
  const rings = 24;
  const segs = 48;
  const stride = segs + 1;
  const positions = new Float32Array((rings + 1) * stride * 3);
  const normals = new Float32Array((rings + 1) * stride * 3);
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s <= segs; s++) {
      const theta = (s / segs) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      const v = r * stride + s;
      positions[v * 3] = x * radius;
      positions[v * 3 + 1] = y * radius;
      positions[v * 3 + 2] = z * radius;
      normals[v * 3] = -x;
      normals[v * 3 + 1] = -y;
      normals[v * 3 + 2] = -z;
    }
  }
  const indices = new Uint16Array(rings * segs * 6);
  let k = 0;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return {
    kind: "aura-custom-geometry" as const,
    positions,
    normals,
    indices,
    bounds: {
      min: [-radius, -radius, -radius] as [number, number, number],
      max: [radius, radius, radius] as [number, number, number]
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Scene                                                                      */
/* -------------------------------------------------------------------------- */

const waterMaterial = material.custom({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: {
    waterTime: { type: "f32", value: 0 },
    eye: { type: "vec3", value: [...EYE] }
  },
  side: "double"
});

const skyMaterial = material.custom({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: {
    skyTime: { type: "f32", value: 0 }
  },
  side: "double"
});

const sky = geometry
  .custom(buildSkyDome(SKY_RADIUS), { name: "sky-dome", material: skyMaterial })
  .position(EYE[0], EYE[1], EYE[2])
  .runtime({ id: "sky", mutable: true });

const water = geometry
  .custom(buildWaterGrid(), { name: "water-surface", material: waterMaterial })
  .runtime({ id: "water", mutable: true });

const worldScene = scene()
  .background("#cfe6f5")
  .camera(
    camera.perspective({
      position: [...EYE],
      target: [...LOOK_AT],
      fov: 50,
      near: 0.1,
      far: 1500
    })
  )
  .add(sky)
  .add(water);

const app = createAuraApp("#app", {
  scene: worldScene,
  pixelRatio: 1,
  // Custom shaders write linear light; with no tone mapping the authored
  // (sRGB-decoded) palette comes out exactly as written. The shaders apply
  // their own soft highlight shoulder.
  output: { toneMapping: "none", exposure: 1 }
});

const startMs = performance.now();
let firstFrameSeen = false;

app.onFrame(() => {
  const t = (performance.now() - startMs) / 1000;
  app.nodes.require("water").setUniform?.("waterTime", t);
  app.nodes.require("sky").setUniform?.("skyTime", t);
  if (!firstFrameSeen) {
    firstFrameSeen = true;
    // The frame callback runs before the draw of this frame; flag readiness
    // once a following animation frame has been presented.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.__EVAL_READY__ = true;
      });
    });
  }
});

void app.ready().catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
  console.error(error);
});
