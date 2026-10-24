import { createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

/**
 * Custom GLSL water + gradient sky dome.
 *
 * - Water: a subdivided grid (geometry.custom) displaced in the vertex shader by
 *   four animated Gerstner waves, shaded in the fragment shader with a fresnel
 *   term, procedural noise ripples (normal perturbation), foam and a sun glint.
 * - Sky: an inside-out dome with the same analytic gradient sky function that the
 *   water reflects, so reflection and background match.
 * - Colour: custom shaders write linear light. Colours are authored in sRGB and
 *   decoded with a3dSrgbToLinear; output tone mapping is "none" and a gentle
 *   highlight soft-clip in the shader keeps the sun from hard clipping.
 */

// ---------------------------------------------------------------- constants
const CAMERA_POS: readonly [number, number, number] = [0, 3, 10];
const CAMERA_TARGET: readonly [number, number, number] = [0, -0.5, -40];

// Sun: 7 degrees above the horizon, 20 degrees right of straight ahead (-Z).
const SUN_ELEV = (7 * Math.PI) / 180;
const SUN_AZIM = (20 * Math.PI) / 180;
const SUN_DIR: readonly [number, number, number] = [
  Math.cos(SUN_ELEV) * Math.sin(SUN_AZIM),
  Math.sin(SUN_ELEV),
  -Math.cos(SUN_ELEV) * Math.cos(SUN_AZIM)
];
const f = (n: number): string => n.toFixed(6);
const SUN_GLSL = `const vec3 kSunDir = vec3(${f(SUN_DIR[0])}, ${f(SUN_DIR[1])}, ${f(SUN_DIR[2])});`;

// ------------------------------------------------------- shared sky (GLSL)
const SKY_GLSL = /* glsl */ `
${SUN_GLSL}

// Analytic sky gradient, linear light. withDisc adds the visible sun disc.
vec3 skyColor(vec3 d, bool withDisc) {
  vec3 dd = normalize(vec3(d.x, max(d.y, 0.0), d.z));
  float h = dd.y;
  vec3 horizon = a3dSrgbToLinear(vec3(0.80, 0.88, 0.95));
  vec3 mid     = a3dSrgbToLinear(vec3(0.38, 0.65, 0.92));
  vec3 zenith  = a3dSrgbToLinear(vec3(0.10, 0.30, 0.72));
  float t = pow(clamp(h / 0.5, 0.0, 1.0), 0.6);
  vec3 col = mix(horizon, mid, t);
  col = mix(col, zenith, smoothstep(0.3, 1.0, h));

  float sd = max(dot(dd, kSunDir), 0.0);
  col += vec3(1.0, 0.75, 0.45) * (pow(sd, 8.0) * 0.30 + pow(sd, 200.0) * 1.2);
  if (withDisc) {
    col += vec3(1.0, 0.93, 0.80) * smoothstep(0.99955, 0.99985, sd) * 12.0;
  }
  return col;
}

// Gentle highlight shoulder: identity below 0.75, smoothly approaches 1.0.
vec3 softClip(vec3 c) {
  c = clamp(c, vec3(0.0), vec3(1000.0));
  float t = 0.75;
  vec3 over = max(c - vec3(t), vec3(0.0));
  return min(c, vec3(t)) + (1.0 - t) * (vec3(1.0) - exp(-over / (1.0 - t)));
}
`;

// ------------------------------------------------------------ sky dome
const skyMaterial = material.custom({
  side: "double",
  glsl: {
    vertex: /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}
`,
    fragment: /* glsl */ `
#include <colorspace_decode>
out vec4 outColor;
in vec3 vDir;
${SKY_GLSL}
void main() {
  vec3 col = skyColor(normalize(vDir), true);
  outColor = vec4(softClip(col), 1.0);
}
`
  }
});

// ----------------------------------------------------------- water shader
const waterVertex = /* glsl */ `
out vec3 vWorld;
out vec3 vNrm;
out float vHeight;

// One Gerstner wave. Evaluated at the rest position; accumulates the
// displacement and the analytic surface gradient.
void addWave(vec2 p, vec2 dir, float wl, float amp, float steep, float fade,
             inout vec3 disp, inout vec3 grad) {
  vec2 d = normalize(dir);
  float k = 6.2831853 / wl;
  float w = sqrt(9.81 * k) * 0.55;
  float ph = k * dot(d, p) - w * uTime;
  float a = amp * fade;
  float c = cos(ph);
  float s = sin(ph);
  disp.xz += steep * a * d * c;
  disp.y  += a * s;
  grad.x  += d.x * k * a * c;
  grad.z  += d.y * k * a * c;
  grad.y  += steep * k * a * s;
}

void main() {
  vec4 rest = modelMatrix * vec4(position, 1.0);
  vec2 p = rest.xz;
  float dist = length(rest.xyz - eye);

  // Fade the shorter waves with distance so the far field does not alias.
  float fadeA = 1.0 - smoothstep(250.0, 520.0, dist);
  float fadeB = 1.0 - smoothstep(90.0, 300.0, dist);
  float fadeC = 1.0 - smoothstep(40.0, 160.0, dist);

  vec3 disp = vec3(0.0);
  vec3 grad = vec3(0.0);
  addWave(p, vec2( 0.15, 1.00), 26.0, 0.62, 0.80, fadeA, disp, grad);
  addWave(p, vec2(-0.50, 0.90), 15.0, 0.34, 0.80, fadeA, disp, grad);
  addWave(p, vec2( 0.75, 0.65),  8.0, 0.15, 0.70, fadeB, disp, grad);
  addWave(p, vec2(-0.90, 0.40),  4.2, 0.065, 0.60, fadeC, disp, grad);

  vec3 local = position + disp;
  vWorld = (modelMatrix * vec4(local, 1.0)).xyz;
  vNrm = normalize(vec3(-grad.x, 1.0 - grad.y, -grad.z));
  vHeight = disp.y;
  gl_Position = modelViewProjectionMatrix * vec4(local, 1.0);
}
`;

const waterFragment = /* glsl */ `
#include <colorspace_decode>
out vec4 outColor;
in vec3 vWorld;
in vec3 vNrm;
in float vHeight;
${SKY_GLSL}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 fr = fract(p);
  fr = fr * fr * (3.0 - 2.0 * fr);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, fr.x), mix(c, d, fr.x), fr.y);
}

// Procedural ripple height: 4 octaves of scrolling value noise.
float ripple(vec2 p, float t) {
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  vec2 q = p * 0.9;
  float amp = 0.5;
  float h = 0.0;
  for (int i = 0; i < 4; i++) {
    h += amp * vnoise(q + vec2(0.7, 1.3) * t * (0.35 + 0.18 * float(i)));
    q = rot * q * 2.03;
    amp *= 0.5;
  }
  return h;
}

void main() {
  vec3 toEye = eye - vWorld;
  float dist = length(toEye);
  vec3 V = toEye / max(dist, 1e-4);
  vec3 L = kSunDir;

  // --- normal: analytic wave normal + noise ripple detail
  vec3 N = normalize(vNrm);
  float detail = 1.0 - smoothstep(30.0, 220.0, dist);
  float e = 0.06 + dist * 0.0015;
  vec2 p = vWorld.xz;
  float h0 = ripple(p, uTime);
  float hx = ripple(p + vec2(e, 0.0), uTime);
  float hz = ripple(p + vec2(0.0, e), uTime);
  vec2 g = vec2(hx - h0, hz - h0) / e;
  N = normalize(N + vec3(-g.x, 0.0, -g.y) * 0.24 * detail);

  float cosT = clamp(dot(N, V), 0.0, 1.0);

  // --- fresnel (Schlick): more sky reflection at grazing angles
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  // --- reflected sky (no sun disc: the glint is added explicitly below)
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyColor(R, false);

  // --- water body colour
  float hN = clamp(vHeight / 1.175 * 0.5 + 0.5, 0.0, 1.0);
  vec3 deepC    = a3dSrgbToLinear(vec3(0.03, 0.20, 0.30));
  vec3 shallowC = a3dSrgbToLinear(vec3(0.10, 0.52, 0.56));
  vec3 body = mix(deepC, shallowC, hN * 0.75 + 0.05);
  body *= 0.6 + 0.5 * max(dot(N, L), 0.0);
  // sub-surface glow on back-lit crests (camera looks toward the sun)
  float sss = pow(max(dot(-V, L), 0.0), 3.0) * hN * hN;
  body += a3dSrgbToLinear(vec3(0.25, 0.80, 0.65)) * sss * 0.35;

  vec3 col = mix(body, refl, fres);

  // --- sun glint: sharp + broad Blinn-Phong lobes with Schlick on V.H
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float vh = clamp(dot(V, H), 0.0, 1.0);
  float fs = 0.04 + 0.96 * pow(1.0 - vh, 5.0);
  float nl = clamp(dot(N, L) * 4.0, 0.0, 1.0);
  vec3 sunC = vec3(1.0, 0.85, 0.62);
  float glint = pow(nh, 900.0) * 7.0 + pow(nh, 70.0) * 0.45;
  col += sunC * glint * fs * nl * (0.35 + 0.65 * detail + 0.25);

  // --- foam on high crests, broken up by noise
  float foamN = vnoise(p * 2.3 + vec2(0.0, uTime * 0.5));
  float foam = smoothstep(0.68, 0.90, hN) * smoothstep(0.40, 0.70, foamN) * detail;
  col = mix(col, vec3(0.85, 0.90, 0.92) * (0.55 + 0.45 * max(dot(N, L), 0.0)), foam * 0.55);

  // --- distance haze toward the horizon colour (matches the dome)
  vec3 fogC = skyColor(normalize(vec3(-V.x, 0.0, -V.z)), false);
  float fogT = smoothstep(120.0, 430.0, dist);
  col = mix(col, fogC, fogT);

  outColor = vec4(softClip(col), 1.0);
}
`;

const waterMaterial = material.custom({
  side: "double",
  uniforms: {
    eye: { type: "vec3", value: [...CAMERA_POS] }
  },
  glsl: { vertex: waterVertex, fragment: waterFragment }
});

// ------------------------------------------------------- water grid mesh
// Rows are spaced quadratically in distance from the camera (fine near, coarse
// far) and widen with distance so the grid always covers the view frustum.
// 201 * 321 = 64,521 vertices, which fits 16-bit indices.
const COLS = 200;
const ROWS = 320;
const NEAR_BEHIND = 15;
const REACH = 435;

function buildWaterGrid() {
  const vertCount = (COLS + 1) * (ROWS + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  let v = 0;
  for (let j = 0; j <= ROWS; j += 1) {
    const t = j / ROWS;
    const ahead = -NEAR_BEHIND + REACH * t * t;
    const z = CAMERA_POS[2] - ahead;
    const halfW = 14 + 1.15 * Math.max(ahead, 0);
    for (let i = 0; i <= COLS; i += 1) {
      const s = (2 * i) / COLS - 1;
      positions[v * 3] = CAMERA_POS[0] + s * halfW;
      positions[v * 3 + 1] = 0;
      positions[v * 3 + 2] = z;
      normals[v * 3 + 1] = 1;
      uvs[v * 2] = i / COLS;
      uvs[v * 2 + 1] = t;
      v += 1;
    }
  }
  const indices = new Uint16Array(COLS * ROWS * 6);
  let k = 0;
  const stride = COLS + 1;
  for (let j = 0; j < ROWS; j += 1) {
    for (let i = 0; i < COLS; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // counter-clockwise when viewed from +Y
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  return { kind: "aura-custom-geometry" as const, positions, normals, uvs, indices };
}

// ----------------------------------------------------------------- scene
const world = scene()
  .background("#cfe0ee")
  .camera({
    mode: "perspective",
    position: [...CAMERA_POS],
    target: [...CAMERA_TARGET],
    fov: 50,
    near: 0.2,
    far: 4000
  })
  .add(
    primitives.sphere({
      name: "sky-dome",
      position: [...CAMERA_POS],
      scale: 1200,
      material: skyMaterial,
      castShadow: false,
      receiveShadow: false,
      frustumCulled: false
    })
  )
  .add(
    geometry.custom(buildWaterGrid(), {
      name: "water",
      material: waterMaterial,
      castShadow: false,
      receiveShadow: false,
      frustumCulled: false
    })
  );

// ------------------------------------------------------------------- app
const canvas = document.getElementById("app") as HTMLCanvasElement;
const app = createAuraApp(canvas, {
  scene: world,
  resize: false,
  pixelRatio: 1,
  output: { toneMapping: "none", exposure: 1 }
});

let signalled = false;
const signalReady = (): void => {
  if (signalled) return;
  signalled = true;
  // Wait for two animation frames so at least one full frame has been presented.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
    });
  });
};

app.onFrame(() => signalReady());
void app.ready().then(signalReady);
