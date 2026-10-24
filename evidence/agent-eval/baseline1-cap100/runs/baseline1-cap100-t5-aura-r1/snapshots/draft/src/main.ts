import { createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

/* ------------------------------------------------------------------------ */
/* Shared sky function (used by the sky dome and by the water reflection).   */
/* Authored colours are sRGB hex-style values decoded to linear light; the   */
/* app runs with toneMapping "none", so the output stage only sRGB-encodes.  */
/* ------------------------------------------------------------------------ */
const SKY_GLSL = /* glsl */ `
#include <a3d_math>
#include <a3d_noise>
#include <a3d_sky>
#include <colorspace_decode>

// Unit vector toward the sun (normalize(0.30, 0.15, -1.0), precomputed).
const vec3 SUN_DIR = vec3(0.2844, 0.1422, -0.9481);

vec3 skyColor(vec3 dir, float sunDiscMix) {
  // Below the horizon the sky is clamped to the horizon colour so the far
  // edge of the water blends into it without a seam.
  dir.y = max(dir.y, 0.0);
  dir = normalize(dir + vec3(0.0, 1e-3, 0.0));

  vec3 horizon = a3dSrgbToLinear(vec3(0.84, 0.90, 0.95));
  vec3 mid     = a3dSrgbToLinear(vec3(0.46, 0.67, 0.89));
  vec3 zenith  = a3dSrgbToLinear(vec3(0.13, 0.33, 0.70));

  float h = dir.y;
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.28, h));
  col = mix(col, zenith, smoothstep(0.18, 0.95, h));

  // Warm glow around the sun and the sun disc itself.
  vec3 warm = vec3(1.0, 0.72, 0.42);
  col += warm * (0.20 * a3dSunGlow(dir, SUN_DIR, 5.0) + 0.55 * a3dSunGlow(dir, SUN_DIR, 90.0));
  col += vec3(14.0, 11.0, 7.5) * a3dSunDisc(dir, SUN_DIR, 0.03) * sunDiscMix;

  // Soft procedural clouds.
  if (h > 0.0) {
    vec2 cp = dir.xz / (h + 0.14) * 0.85 + vec2(uTime * 0.015, 0.0);
    float c = a3dFbm(cp, 4);
    float cover = smoothstep(0.46, 0.76, c) * smoothstep(0.02, 0.22, h);
    vec3 cloud = a3dSrgbToLinear(vec3(0.96, 0.96, 0.98));
    cloud = mix(cloud * 0.78, cloud, smoothstep(0.35, 0.8, c));
    col = mix(col, cloud, cover * 0.8);
  }
  return col;
}

// Soft shoulder so linear highlights above ~0.8 roll off instead of clipping hard.
vec3 shoulder(vec3 c) {
  c = max(c, vec3(0.0));
  vec3 hi = max(c - 0.8, vec3(0.0));
  return min(c, vec3(0.8)) + 0.2 * hi / (hi + 0.2);
}
`;

/* ------------------------------------------------------------------------ */
/* Sky dome                                                                  */
/* ------------------------------------------------------------------------ */
const skyVertex = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
${SKY_GLSL}
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  outColor = vec4(shoulder(skyColor(dir, 1.0)), 1.0);
}
`;

/* ------------------------------------------------------------------------ */
/* Water                                                                     */
/* ------------------------------------------------------------------------ */
const waterVertex = /* glsl */ `
out vec3 vWorld;
out vec3 vNormalW;
out float vHeight;

// xy = direction, z = wavelength (m), w = amplitude (m)
const vec4 WAVES[5] = vec4[5](
  vec4( 1.00,  0.35, 22.0, 0.55),
  vec4( 0.70, -0.60, 13.0, 0.30),
  vec4(-0.40,  0.90,  7.5, 0.16),
  vec4( 0.90,  0.60,  4.2, 0.07),
  vec4(-0.80, -0.30,  2.4, 0.035)
);

void waveField(vec2 p, float t, float fade, out float h, out vec2 grad) {
  h = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    vec2 d = normalize(WAVES[i].xy);
    float k = 6.2831853 / WAVES[i].z;
    float w = sqrt(9.81 * k);
    float a = WAVES[i].w * fade;
    float ph = k * dot(d, p) - w * t + float(i) * 1.7;
    float s = sin(ph);
    // exp(sin - 1) gives sharper crests and flatter troughs than a plain sine.
    float e = exp(s - 1.0);
    h += a * (e - 0.466) * 1.6;
    grad += a * 1.6 * e * cos(ph) * k * d;
  }
}

void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 p = w.xz;
  float dist = length(p - cameraPosition.xz);
  float fade = 1.0 / (1.0 + dist * 0.006);

  float h;
  vec2 grad;
  waveField(p, uTime * 0.9, fade, h, grad);

  vec3 displaced = position + vec3(0.0, h, 0.0);
  vWorld = (modelMatrix * vec4(displaced, 1.0)).xyz;
  vNormalW = normalize(vec3(-grad.x, 1.0, -grad.y));
  vHeight = h;
  gl_Position = modelViewProjectionMatrix * vec4(displaced, 1.0);
}
`;

const waterFragment = /* glsl */ `
${SKY_GLSL}
in vec3 vWorld;
in vec3 vNormalW;
in float vHeight;
out vec4 outColor;

float ripple(vec2 p, float t) {
  float a = a3dFbm(p * 0.9 + vec2(t * 0.15, t * 0.09), 3);
  float b = a3dFbm(p * 2.3 - vec2(t * 0.22, -t * 0.17), 3);
  return a * 0.65 + b * 0.35;
}

void main() {
  float t = uTime;
  vec3 toP = vWorld - cameraPosition;
  float dist = length(toP);
  vec3 V = normalize(-toP);

  // Procedural noise ripples perturb the wave normal; fade them with distance.
  vec2 p = vWorld.xz;
  float eps = 0.05;
  float r0 = ripple(p, t);
  float rx = ripple(p + vec2(eps, 0.0), t);
  float rz = ripple(p + vec2(0.0, eps), t);
  vec2 rg = vec2(rx - r0, rz - r0) / eps;
  float rf = 1.0 / (1.0 + dist * 0.03);
  vec3 N = normalize(vec3(vNormalW.x - rg.x * 0.22 * rf, vNormalW.y, vNormalW.z - rg.y * 0.22 * rf));

  float ndv = clamp(dot(N, V), 0.0, 1.0);

  // Fresnel (Schlick, F0 of water ~0.02): more sky reflection at grazing angles.
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // Sky reflection.
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyColor(R, 0.0);

  // Water body colour: darker in troughs, brighter turquoise on crests.
  vec3 deep    = a3dSrgbToLinear(vec3(0.01, 0.10, 0.17));
  vec3 shallow = a3dSrgbToLinear(vec3(0.05, 0.36, 0.42));
  float sss = smoothstep(-0.25, 0.5, vHeight + (r0 - 0.5) * 0.15);
  vec3 body = mix(deep, shallow, sss * (0.45 + 0.55 * ndv));

  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));

  // Sun specular glint (Blinn-Phong lobes on the perturbed normal).
  vec3 H = normalize(SUN_DIR + V);
  float nh = max(dot(N, H), 0.0);
  vec3 sunCol = vec3(1.0, 0.85, 0.6);
  float glint = pow(nh, 700.0) * 5.0 + pow(nh, 90.0) * 0.35;
  col += sunCol * glint * (0.35 + fres);

  // Whitecap hint on the tallest crests.
  float foam = smoothstep(0.34, 0.6, vHeight + (r0 - 0.5) * 0.2) * rf;
  col = mix(col, vec3(0.85, 0.9, 0.92), foam * 0.35);

  // Blend into the horizon colour with distance so the far edge has no seam.
  vec3 hz = skyColor(vec3(toP.x, 0.0, toP.z), 0.0);
  col = mix(col, hz, smoothstep(100.0, 360.0, dist));

  outColor = vec4(shoulder(col), 1.0);
}
`;

/* ------------------------------------------------------------------------ */
/* Water grid: subdivided, denser near the camera (quadratic spacing)        */
/* ------------------------------------------------------------------------ */
function buildWaterGrid(segX: number, segZ: number) {
  const halfWidth = 320;
  const zNear = 14; // slightly behind the camera
  const zFar = -400;
  const cols = segX + 1;
  const rows = segZ + 1;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  let o = 0;
  for (let j = 0; j < rows; j++) {
    const b = j / segZ;
    const z = zNear + (zFar - zNear) * (b * b * 0.85 + b * 0.15);
    for (let i = 0; i < cols; i++) {
      const a = (i / segX) * 2 - 1;
      const x = Math.sign(a) * a * a * halfWidth * 0.85 + a * halfWidth * 0.15;
      positions[o] = x;
      positions[o + 1] = 0;
      positions[o + 2] = z;
      normals[o] = 0;
      normals[o + 1] = 1;
      normals[o + 2] = 0;
      o += 3;
    }
  }
  const indices = new Uint32Array(segX * segZ * 6);
  let k = 0;
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const i0 = j * cols + i;
      const i1 = i0 + 1;
      const i2 = i0 + cols;
      const i3 = i2 + 1;
      indices[k++] = i0;
      indices[k++] = i2;
      indices[k++] = i1;
      indices[k++] = i1;
      indices[k++] = i2;
      indices[k++] = i3;
    }
  }
  return geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-halfWidth, -3, zFar], max: [halfWidth, 3, zNear] }
  });
}

const waterMaterial = material.custom({
  glsl: { vertex: waterVertex, fragment: waterFragment },
  side: "double"
});

const skyMaterial = material.custom({
  glsl: { vertex: skyVertex, fragment: skyFragment },
  side: "double"
});

const water = geometry.custom(buildWaterGrid(220, 220), {
  name: "water",
  material: waterMaterial,
  castShadow: false,
  receiveShadow: false
});

const skyDome = primitives.sphere({
  name: "sky-dome",
  size: 1800,
  material: skyMaterial,
  castShadow: false,
  receiveShadow: false
});

const world = scene()
  .background("#d6e6f2", { toneMapped: false })
  .camera({
    mode: "perspective",
    position: [0, 3.2, 10],
    target: [0, -0.3, -40],
    fov: 50,
    near: 0.3,
    far: 3000
  })
  .add(skyDome)
  .add(water);

const app = createAuraApp("#app", {
  scene: world,
  resize: false,
  pixelRatio: 1,
  output: { toneMapping: "none", exposure: 1 }
});

let flagged = false;
const markReady = (): void => {
  if (flagged) return;
  flagged = true;
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
};

app.onFrame(markReady);
void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(markReady));
});
