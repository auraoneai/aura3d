import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

// ---- Water grid: subdivided, denser near the camera so waves are real geometry -------------
const N = 220;       // quads per side (221^2 = 48.8k vertices, fits 16-bit indices)
const R = 160;       // half extent in metres
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
const warp = (u: number): number => R * (0.3 * u + 0.7 * u * u * u);
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([warp((i / N) * 2 - 1), 0, warp((j / N) * 2 - 1)], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

// ---- Shared sky model (authored in sRGB, converted to linear; output has no tone mapping) ---
const sunLen = Math.hypot(0.28, 0.16, -1);
const SUN = `vec3(${(0.28 / sunLen).toFixed(5)}, ${(0.16 / sunLen).toFixed(5)}, ${(-1 / sunLen).toFixed(5)})`;

const SKY_GLSL = /* glsl */ `
vec3 srgb2lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 skyColor(vec3 d) {
  vec3 sunDir = ${SUN};
  float h = max(d.y, 0.0);
  vec3 horizon = srgb2lin(vec3(0.80, 0.88, 0.95));
  vec3 mid = srgb2lin(vec3(0.43, 0.65, 0.88));
  vec3 zenith = srgb2lin(vec3(0.13, 0.36, 0.72));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
  col = mix(col, zenith, smoothstep(0.1, 0.8, h));
  float s = max(dot(d, sunDir), 0.0);
  col += vec3(1.0, 0.78, 0.5) * pow(s, 6.0) * 0.28;
  col += vec3(1.0, 0.85, 0.6) * pow(s, 64.0) * 0.6;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 6.0;
  return col;
}
`;

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
  outColor = vec4(skyColor(d), 1.0);
}`
  },
  side: "back",
  depthWrite: false,
  fog: false
});

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vHeight;
// one directional sine wave: returns height, accumulates the xz gradient
float wave(vec2 p, vec2 dir, float k, float amp, float speed, float t, inout vec2 grad) {
  float ph = dot(p, normalize(dir)) * k + t * speed;
  grad += normalize(dir) * (amp * k * cos(ph));
  return amp * sin(ph);
}
void main() {
  vec2 p = position.xz;
  vec2 g = vec2(0.0);
  float t = waveClock;
  float h = 0.0;
  h += wave(p, vec2(1.0, 0.35), 0.45, 0.30, 1.0, t, g);
  h += wave(p, vec2(0.7, -0.8), 0.80, 0.16, 1.3, t, g);
  h += wave(p, vec2(-0.4, -1.0), 1.30, 0.09, 1.7, t, g);
  h += wave(p, vec2(-1.0, 0.2), 2.10, 0.045, 2.2, t, g);
  h += wave(p, vec2(0.3, 1.0), 3.20, 0.022, 2.9, t, g);
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  vHeight = h;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vHeight;
out vec4 outColor;
${SKY_GLSL}
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
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return s;
}
float ripple(vec2 p, float t) {
  return fbm(p * 1.6 + vec2(t * 0.20, t * 0.13)) + 0.6 * fbm(p * 3.1 - vec2(t * 0.17, -t * 0.22));
}
void main() {
  vec3 sunDir = ${SUN};
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);

  // procedural ripple detail: perturb the geometric normal with the gradient of fbm noise
  float t = waveClock;
  vec2 q = vPos.xz;
  float e = 0.05;
  float r0 = ripple(q, t);
  float rx = ripple(q + vec2(e, 0.0), t);
  float rz = ripple(q + vec2(0.0, e), t);
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  float detail = 0.22 / (1.0 + dist * 0.045);
  vec3 n = normalize(vNormal + vec3(-rg.x, 0.0, -rg.y) * detail);

  // fresnel (Schlick): more sky reflection at grazing angles
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // reflected sky; never sample below the horizon
  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 reflection = skyColor(normalize(refl));

  // body colour: deep blue-green, brighter in crests and facing the viewer
  vec3 deep = srgb2lin(vec3(0.02, 0.15, 0.24));
  vec3 shallow = srgb2lin(vec3(0.07, 0.45, 0.50));
  float crest = clamp(vHeight * 2.2 + 0.35, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.7 + 0.3 * ndv * ndv);
  body += srgb2lin(vec3(0.10, 0.45, 0.40)) * pow(max(dot(n, sunDir), 0.0), 2.0) * 0.12;

  vec3 col = mix(body, reflection, fresnel);

  // sun glint (Blinn-Phong half vector) with a tight core and a wider sparkle
  vec3 hv = normalize(sunDir + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 900.0) * 14.0 + pow(nh, 140.0) * 1.2;
  col += vec3(1.0, 0.88, 0.65) * glint * step(0.0, dot(n, sunDir));

  // thin foam on the highest crests, broken up by noise
  float foam = smoothstep(0.42, 0.62, vHeight * 1.4 + (ripple(q * 0.8, t * 0.5) - 0.8) * 0.5);
  col = mix(col, vec3(0.75, 0.82, 0.86), foam * 0.35 * (1.0 - fresnel));

  // atmospheric haze toward the horizon
  vec3 haze = skyColor(normalize(vec3(-v.x, 0.0, -v.z)));
  float fogAmt = 1.0 - exp(-pow(dist * 0.0075, 1.6));
  col = mix(col, haze, clamp(fogAmt, 0.0, 1.0));

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double",
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe0f0" })
    .add(primitives.sphere({ name: "sky", size: 1, material: skyMaterial, castShadow: false }).position(0, 0, 0).scale([400, 400, 400]))
    .add(
      geometry
        .custom(
          geometry.define({ positions, normals, indices, bounds: { min: [-R, -2, -R], max: [R, 2, R] } }),
          { name: "water", material: waterMaterial, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 2.4, 0], target: [0, 1.7, -50], fov: 55, near: 0.2, far: 600 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});
await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
