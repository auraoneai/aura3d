import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Shared GLSL: sky gradient + sun. Authored in sRGB, converted to linear light (custom shaders write linear;
// the output stage applies ACES tone mapping and sRGB encoding).
const SKY_GLSL = /* glsl */ `
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
const vec3 SUN_DIR = vec3(-0.28, 0.2, -0.94);
vec3 skyColor(vec3 d) {
  d = normalize(d);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 horizon = toLin(vec3(0.80, 0.88, 0.96));
  vec3 mid = toLin(vec3(0.38, 0.62, 0.90));
  vec3 zenith = toLin(vec3(0.10, 0.30, 0.68));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, t));
  col = mix(col, zenith, smoothstep(0.2, 0.9, t));
  vec3 sd = normalize(SUN_DIR);
  float s = max(dot(d, sd), 0.0);
  col += vec3(1.0, 0.82, 0.55) * pow(s, 6.0) * 0.25;
  col += vec3(1.0, 0.9, 0.7) * pow(s, 400.0) * 2.0;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9995, 0.9999, s) * 12.0;
  return col;
}`;

// ---- Sky dome (inside of a big sphere, gradient only) ----
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
  vec3 d = vWorld - cameraPosition;
  outColor = vec4(skyColor(d), 1.0);
}`
  },
  side: "back",
  depthWrite: false,
  fog: false
});

// ---- Water: subdivided grid, geometry displaced in the vertex shader ----
const NX = 250, NZ = 250;
const X_SIZE = 300, Z_MIN = -150, Z_MAX = 30;
const positions = new Float32Array((NX + 1) * (NZ + 1) * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= NZ; j += 1) {
  for (let i = 0; i <= NX; i += 1) {
    const v = j * (NX + 1) + i;
    positions.set([(i / NX - 0.5) * X_SIZE, 0, Z_MIN + (j / NZ) * (Z_MAX - Z_MIN)], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < NX && j < NZ) indices.push(v, v + NX + 1, v + 1, v + 1, v + NX + 1, v + NX + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
// Sum of directional sine waves with analytic slope.
vec3 waves(vec2 p, float t, out vec2 slope) {
  vec2 dirs[5] = vec2[5](vec2(0.9, 0.4), vec2(-0.6, 0.8), vec2(0.2, -1.0), vec2(-1.0, -0.3), vec2(0.7, -0.7));
  float amp[5] = float[5](0.34, 0.24, 0.14, 0.09, 0.05);
  float k[5] = float[5](0.55, 0.8, 1.25, 1.9, 3.1);
  float spd[5] = float[5](1.0, 1.25, 1.6, 2.0, 2.6);
  float h = 0.0;
  slope = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    vec2 d = normalize(dirs[i]);
    float ph = dot(p, d) * k[i] + t * spd[i];
    h += amp[i] * sin(ph);
    slope += amp[i] * k[i] * cos(ph) * d;
  }
  return vec3(p.x, h, p.y);
}
void main() {
  vec2 slope;
  vec3 p = waves(position.xz, waveClock, slope);
  vPos = p;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
${SKY_GLSL}
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
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}
void main() {
  vec3 toFrag = vPos - cameraPosition;
  float dist = length(toFrag);
  vec3 v = -toFrag / max(dist, 0.0001);

  // Noise ripple detail: perturb the normal with the gradient of animated fbm, faded with distance.
  vec2 q = vPos.xz * 1.7 + vec2(waveClock * 0.35, waveClock * 0.2);
  float e = 0.05;
  float n0 = fbm(q);
  vec2 g = vec2(fbm(q + vec2(e, 0.0)) - n0, fbm(q + vec2(0.0, e)) - n0) / e;
  float rippleAmt = 0.16 / (1.0 + dist * 0.06);
  vec3 n = normalize(vNormal + vec3(-g.x, 0.0, -g.y) * rippleAmt);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  // Fresnel (Schlick, boosted so grazing angles read clearly as sky reflection)
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fres = clamp(fres * 1.15, 0.0, 1.0);

  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 reflected = skyColor(r);

  vec3 deep = toLin(vec3(0.02, 0.17, 0.27));
  vec3 shallow = toLin(vec3(0.10, 0.48, 0.52));
  float crest = clamp(vPos.y * 1.1 + 0.5, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.8);

  vec3 col = mix(body, reflected, fres);

  // Sun specular glint
  vec3 sd = normalize(SUN_DIR);
  float sp = max(dot(r, sd), 0.0);
  float glint = pow(sp, 700.0) * 25.0 + pow(sp, 60.0) * 0.6;
  col += vec3(1.0, 0.9, 0.7) * glint;

  // Blend into the horizon sky with distance so the finite grid has no visible edge.
  vec3 vd = -v;
  vec3 hd = normalize(vec3(vd.x, max(vd.y, 0.0), vd.z));
  float f = smoothstep(70.0, 145.0, dist);
  col = mix(col, skyColor(hd), f);

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false,
  castShadow: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe0f2" })
    .add(primitives.sphere({ name: "sky", size: 1, material: sky, castShadow: false }).scale([700, 700, 700]))
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-X_SIZE / 2, -1.5, Z_MIN], max: [X_SIZE / 2, 1.5, Z_MAX] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3.2, 24], target: [0, -2, -60], fov: 50, near: 0.5, far: 1200 })),
  output: { toneMapping: "aces", exposure: 1.1 }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
