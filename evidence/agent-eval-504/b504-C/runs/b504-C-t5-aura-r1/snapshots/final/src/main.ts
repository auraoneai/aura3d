import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

// Shared sky model (linear light). The dome draws it and the water reflects it, so they match.
const SKY_GLSL = /* glsl */ `
const vec3 SUN = vec3(-0.38, 0.22, -0.90);
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.70, 0.80, 0.92);
  vec3 zenith = vec3(0.07, 0.24, 0.62);
  vec3 c = mix(horizon, zenith, pow(h, 0.5));
  float s = max(dot(d, normalize(SUN)), 0.0);
  c += vec3(1.0, 0.72, 0.42) * pow(s, 6.0) * 0.25;
  c += vec3(1.0, 0.85, 0.60) * pow(s, 80.0) * 0.8;
  return c;
}
`;

const domeMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 c = skyColor(d);
  float s = dot(d, normalize(SUN));
  c += vec3(1.0, 0.9, 0.7) * smoothstep(0.9993, 0.9997, s) * 12.0; // sun disc
  outColor = vec4(c, 1.0);
}`
  },
  side: "back",
  depthWrite: false,
  fog: false
});

// Water grid: dense near the camera, sparse towards the horizon.
const N = 280, R = 420;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
const warp = (u: number): number => Math.sign(u) * u * u * R;
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  positions.set([warp((i / N - 0.5) * 2), 0, warp((j / N - 0.5) * 2)], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vHeight;
// x,y = direction, z = wavelength (m), w = amplitude (m)
const vec4 WAVES[5] = vec4[5](
  vec4( 0.20, -1.00, 22.0, 0.55),
  vec4( 0.75, -0.65, 13.0, 0.30),
  vec4(-0.55, -0.85,  8.0, 0.17),
  vec4( 0.95,  0.25,  5.5, 0.09),
  vec4(-0.90, -0.30,  3.6, 0.05)
);
void main() {
  vec3 p = position;
  float h = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    vec2 dir = normalize(WAVES[i].xy);
    float k = 6.28318 / WAVES[i].z;
    float w = sqrt(9.81 * k);
    float ph = k * dot(dir, position.xz) + w * waveClock;
    h += WAVES[i].w * sin(ph);
    g += dir * (WAVES[i].w * k * cos(ph));
  }
  p.y = h;
  vPos = p;
  vHeight = h;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
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
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ripple(vec2 p, float t) {
  float a = vnoise(p * 1.7 + vec2(t * 0.35, t * 0.20));
  float b = vnoise(p * 3.9 + vec2(-t * 0.50, t * 0.30)) * 0.5;
  float c = vnoise(p * 8.3 + vec2(t * 0.70, -t * 0.60)) * 0.25;
  return a + b + c;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);

  // procedural ripple detail perturbs the geometric wave normal
  vec3 n = normalize(vNormal);
  float e = 0.06;
  float r0 = ripple(vPos.xz, waveClock);
  float rx = ripple(vPos.xz + vec2(e, 0.0), waveClock);
  float rz = ripple(vPos.xz + vec2(0.0, e), waveClock);
  float fade = 1.0 - smoothstep(25.0, 140.0, dist);
  n = normalize(n + vec3(-(rx - r0), 0.0, -(rz - r0)) / e * 0.10 * fade);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // reflected sky (mirror below-horizon rays upwards)
  vec3 rdir = reflect(-v, n);
  rdir.y = abs(rdir.y);
  vec3 refl = skyColor(normalize(rdir));

  // water body colour: deep blue-green, lighter on crests
  vec3 deep = vec3(0.004, 0.035, 0.070);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  float crest = clamp(vHeight * 0.9 + 0.35 + (r0 - 0.9) * 0.2, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * (0.4 + 0.6 * ndv));

  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));

  // sun glint
  vec3 sunDir = normalize(SUN);
  float sp = max(dot(rdir, sunDir), 0.0);
  float glint = pow(sp, 900.0) * 40.0 + pow(sp, 120.0) * 1.2;
  col += vec3(1.0, 0.88, 0.66) * glint * (0.3 + 0.7 * fade + 0.5 * fres);

  // aerial perspective towards the horizon colour
  vec3 hdir = normalize(vec3(-toCam.x, 0.0, -toCam.z));
  float fog = 1.0 - exp(-dist * 0.0075);
  col = mix(col, skyColor(hdir), clamp(fog, 0.0, 1.0));

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#b3cbe6" })
    .add(primitives.sphere({ name: "sky", size: 1, material: domeMaterial, castShadow: false }).scale([800, 800, 800]))
    .add(geometry.custom(
      geometry.define({ positions, normals, indices, bounds: { min: [-R, -2, -R], max: [R, 2, R] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .camera(camera.perspective({ position: [0, 3.2, 14], target: [0, 2.4, -40], fov: 55, near: 0.3, far: 1200 })),
  output: { toneMapping: "aces", exposure: 1 }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});
await app.ready();
window.__EVAL_READY__ = true;
