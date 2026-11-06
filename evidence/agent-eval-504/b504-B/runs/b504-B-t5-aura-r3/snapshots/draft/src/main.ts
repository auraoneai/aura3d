import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---- Shared GLSL: sky gradient (used by the dome and by the water reflection) -------------
// Colours are authored as sRGB and converted to linear; the app runs with tone mapping "none"
// so the output stage only sRGB-encodes, and the authored colours come out as written.
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = normalize(vec3(0.28, 0.17, -1.0));
vec3 srgb2lin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 skyColor(vec3 d) {
  d = normalize(d);
  vec3 horizon = srgb2lin(vec3(0.80, 0.88, 0.95));
  vec3 mid = srgb2lin(vec3(0.42, 0.65, 0.90));
  vec3 zenith = srgb2lin(vec3(0.10, 0.31, 0.66));
  float h = max(d.y, 0.0);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  col = mix(col, zenith, smoothstep(0.15, 0.9, h));
  float s = max(dot(d, SUN_DIR), 0.0);
  col += vec3(1.0, 0.82, 0.55) * pow(s, 6.0) * 0.18;
  col += vec3(1.0, 0.85, 0.6) * pow(s, 64.0) * 0.5;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9998, s) * 3.0;
  return col;
}
`;

// ---- Sky dome ---------------------------------------------------------------------------------
const skyMaterial = material.custom({
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
  vec3 col = skyColor(vec3(d.x, max(d.y, 0.0), d.z));
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  side: "back",
  depthWrite: false,
  fog: false
});

// ---- Water grid -------------------------------------------------------------------------------
// Non-uniform spacing: dense near the camera, coarse towards the horizon.
const NX = 200, NZ = 300;
const positions = new Float32Array((NX + 1) * (NZ + 1) * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= NZ; j += 1) {
  const t = j / NZ;
  const z = 40 - 440 * Math.pow(t, 1.8);
  for (let i = 0; i <= NX; i += 1) {
    const s = (i / NX) * 2 - 1;
    const x = 200 * (0.3 * s + 0.7 * s * Math.abs(s));
    const v = j * (NX + 1) + i;
    positions.set([x, 0, z], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < NX && j < NZ) indices.push(v, v + NX + 1, v + 1, v + 1, v + NX + 1, v + NX + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vHeight;
void addWave(vec2 p, vec2 dir, float wavelength, float amp, float speed, inout float h, inout vec2 grad) {
  float k = 6.2831853 / wavelength;
  float ph = dot(normalize(dir), p) * k + waveClock * speed * sqrt(k);
  h += amp * sin(ph);
  grad += amp * k * cos(ph) * normalize(dir);
}
void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 grad = vec2(0.0);
  addWave(p, vec2(0.15, 1.0), 16.0, 0.38, 2.6, h, grad);
  addWave(p, vec2(-0.55, 1.0), 9.0, 0.22, 2.9, h, grad);
  addWave(p, vec2(0.7, 0.8), 5.0, 0.12, 3.1, h, grad);
  addWave(p, vec2(-0.9, 0.3), 2.8, 0.05, 3.4, h, grad);
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  vHeight = h;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vHeight;
out vec4 outColor;
${SKY_GLSL}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ripple(vec2 p) {
  float t = waveClock;
  float a = vnoise(p * 1.7 + vec2(t * 0.35, t * 0.21));
  float b = vnoise(p * 3.9 + vec2(-t * 0.5, t * 0.37)) * 0.5;
  float c = vnoise(p * 8.3 + vec2(t * 0.8, -t * 0.6)) * 0.25;
  return a + b + c;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // noise ripple detail perturbs the analytic wave normal, faded with distance to avoid shimmer
  vec2 q = vPos.xz;
  float e = 0.06;
  float r0 = ripple(q);
  float rx = ripple(q + vec2(e, 0.0)) - r0;
  float rz = ripple(q + vec2(0.0, e)) - r0;
  float fade = 1.0 / (1.0 + dist * 0.035);
  vec3 n = normalize(vNormal + vec3(-rx, 0.0, -rz) * (0.55 / e) * 0.12 * fade);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // reflected sky
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);

  // water body
  vec3 deep = srgb2lin(vec3(0.02, 0.17, 0.27));
  vec3 shallow = srgb2lin(vec3(0.10, 0.50, 0.55));
  float crest = clamp(vHeight * 1.2 + 0.45, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.7 * (0.4 + 0.6 * ndv));

  // foam-ish highlight on the highest crests broken up by noise
  float foam = smoothstep(0.62, 0.9, vHeight * 1.5 + r0 * 0.35) * fade;
  body = mix(body, vec3(0.75, 0.82, 0.85), foam * 0.35);

  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));

  // sun glint
  vec3 hv = normalize(SUN_DIR + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 600.0) * 12.0 + pow(nh, 80.0) * 0.6;
  col += vec3(1.0, 0.92, 0.75) * glint;

  // distance haze into the horizon colour
  vec3 vh = normalize(vec3(-toCam.x, 0.0, -toCam.z));
  vec3 haze = skyColor(vec3(vh.x, 0.0, vh.z));
  float fogAmt = 1.0 - exp(-dist * 0.0085);
  col = mix(col, haze, clamp(fogAmt, 0.0, 1.0));

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cce0f2" })
    .add(primitives.sphere({ name: "sky", size: 1800, material: skyMaterial, castShadow: false }))
    .add(
      geometry.custom(
        geometry.define({
          positions,
          normals,
          indices,
          bounds: { min: [-200, -1.5, -400], max: [200, 1.5, 40] }
        }),
        { name: "water", material: water, castShadow: false }
      ).runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.2, 14], target: [0, 9, -46], fov: 55, near: 0.5, far: 3000 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
let marked = false;
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
  if (!marked) {
    marked = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
await app.ready();
