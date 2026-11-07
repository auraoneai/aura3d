import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const N = 250;
const SIZE = 240;
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

const waveFns = `
const int NW = 4;
const vec2 DIRS[4] = vec2[4](vec2(0.8, 0.6), vec2(-0.5, 0.86), vec2(0.2, -0.98), vec2(-0.95, -0.3));
const float AMP[4] = float[4](0.55, 0.32, 0.18, 0.1);
const float FRQ[4] = float[4](0.35, 0.6, 1.1, 1.9);
const float SPD[4] = float[4](0.9, 1.2, 1.6, 2.1);
float height(vec2 p, float t) {
  float h = 0.0;
  for (int i = 0; i < NW; i++) h += AMP[i] * sin(dot(p, DIRS[i]) * FRQ[i] + t * SPD[i]);
  return h;
}
vec2 slope(vec2 p, float t) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < NW; i++) s += AMP[i] * FRQ[i] * cos(dot(p, DIRS[i]) * FRQ[i] + t * SPD[i]) * DIRS[i];
  return s;
}
`;

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
${waveFns}
void main() {
  vec2 p = position.xz;
  float h = height(p, clk);
  vec2 s = slope(p, clk);
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-s.x, 1.0, -s.y));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
const vec3 ZENITH = vec3(0.03, 0.17, 0.55);
const vec3 HORIZON = vec3(0.52, 0.70, 0.88);
vec3 skyColor(vec3 d) {
  float t = pow(clamp(d.y, 0.0, 1.0), 0.5);
  vec3 c = mix(HORIZON, ZENITH, t);
  vec3 sunDir = normalize(vec3(0.25, 0.22, -0.9));
  float sd = max(dot(d, sunDir), 0.0);
  c += vec3(1.0, 0.85, 0.6) * (pow(sd, 24.0) * 0.35 + pow(sd, 600.0) * 4.0);
  return c;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  // ripple detail: noise-based normal perturbation, fades with distance
  vec2 q = vPos.xz * 1.6;
  float e = 0.08;
  float n0 = fbm(q + vec2(clk * 0.35, clk * 0.2));
  float nx = fbm(q + vec2(e, 0.0) + vec2(clk * 0.35, clk * 0.2));
  float nz = fbm(q + vec2(0.0, e) + vec2(clk * 0.35, clk * 0.2));
  vec2 grad = vec2(nx - n0, nz - n0) / e;
  float detail = 1.0 / (1.0 + dist * 0.03);
  vec3 n = normalize(vN + vec3(-grad.x, 0.0, -grad.y) * 0.22 * detail);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);
  float crest = clamp(vPos.y * 0.9 + 0.5, 0.0, 1.0);
  vec3 deep = vec3(0.01, 0.09, 0.17);
  vec3 shallow = vec3(0.03, 0.30, 0.38);
  vec3 body = mix(deep, shallow, crest * 0.6 + n0 * 0.25);
  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
  vec3 sunDir = normalize(vec3(0.25, 0.22, -0.9));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 220.0);
  col += vec3(1.0, 0.92, 0.75) * glint * 3.0;
  // blend into horizon haze with distance
  float fog = 1.0 - exp(-dist * 0.0085);
  col = mix(col, HORIZON, clamp(fog, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const sc = scene({ background: "#bcd8ee" })
  .camera(camera.perspective({ position: [0, 4, 22], target: [0, 1.2, -30], fov: 55, near: 0.5, far: 400 }))
  .add(sky.gradient({ zenith: "#2a6fc4", horizon: "#bcd8ee" }))
  .add(
    geometry
      .custom(
        geometry.define({
          positions,
          normals,
          indices,
          bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 2, SIZE / 2] }
        }),
        { name: "water", material: water, castShadow: false }
      )
      .runtime({ id: "water", mutable: true })
  );

let clk = 0;
const app = createAuraApp("#app", { scene: sc });
app.onFrame((f) => {
  clk += f.dt;
  app.nodes.require("water").setUniform?.("clk", clk);
});
await app.ready();
window.__EVAL_READY__ = true;
