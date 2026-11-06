import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const N = 260;
const SIZE = 400;
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

const waveFn = `
const int NW = 4;
const vec2 WD[4] = vec2[4](vec2(0.9, 0.4), vec2(-0.5, 0.85), vec2(0.2, -0.98), vec2(-0.95, -0.3));
const float WK[4] = float[4](0.35, 0.6, 0.95, 1.5);
const float WA[4] = float[4](0.45, 0.25, 0.12, 0.05);
const float WS[4] = float[4](0.9, 1.2, 1.6, 2.1);
// returns height in .x, dh/dx in .y, dh/dz in .z
vec3 waves(vec2 p, float t) {
  float h = 0.0; vec2 d = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    vec2 dir = normalize(WD[i]);
    float ph = dot(dir, p) * WK[i] + t * WS[i];
    h += WA[i] * sin(ph);
    d += dir * (WA[i] * WK[i] * cos(ph));
  }
  return vec3(h, d);
}`;

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
${waveFn}
void main() {
  vec3 w = waves(position.xz, clk);
  vPos = vec3(position.x, w.x, position.z);
  vN = normalize(vec3(-w.y, 1.0, -w.z));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
const vec3 HORIZON = vec3(0.52, 0.68, 0.82);
const vec3 ZENITH = vec3(0.04, 0.17, 0.46);
vec3 skyColor(vec3 d) {
  float t = clamp(d.y, 0.0, 1.0);
  return mix(HORIZON, ZENITH, pow(t, 0.55));
}
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec2 q = vPos.xz;
  float e = 0.02;
  // noise ripple detail: perturb the normal from the gradient of fbm
  float n0 = fbm(q * 1.6 + vec2(clk * 0.35, clk * 0.2));
  float nx = fbm((q + vec2(e, 0.0)) * 1.6 + vec2(clk * 0.35, clk * 0.2));
  float nz = fbm((q + vec2(0.0, e)) * 1.6 + vec2(clk * 0.35, clk * 0.2));
  vec2 g = vec2(nx - n0, nz - n0) / e;
  float dist = length(cameraPosition - vPos);
  float detail = 0.07 / (1.0 + dist * 0.02);
  vec3 n = normalize(vN + vec3(-g.x, 0.0, -g.y) * detail);
  if (dot(n, v) < 0.0) n = reflect(n, v);

  float cosT = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);

  vec3 deep = vec3(0.005, 0.05, 0.1);
  vec3 shallow = vec3(0.02, 0.17, 0.2);
  float crest = clamp((vPos.y + 0.4) * 0.8, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.6 + n0 * 0.3);

  vec3 L = normalize(vec3(-0.35, 0.22, -0.9));
  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 220.0);
  float broad = pow(max(dot(reflect(-L, n), v), 0.0), 24.0);
  vec3 sunCol = vec3(1.0, 0.9, 0.7);

  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
  col += sunCol * (glint * 6.0 + broad * 0.18);
  float fogT = 1.0 - exp(-dist * 0.0065);
  col = mix(col, HORIZON, clamp(fogT * fogT, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const sc = scene({ background: "#85adD1" })
  .camera(camera.perspective({ position: [0, 5, 24], target: [0, 1.6, -40], fov: 55, near: 0.5, far: 600 }))
  .add(sky.gradient({ zenith: "#2a6ab0", horizon: "#bcd6ea" }))
  .add(
    geometry
      .custom(
        geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 2, SIZE / 2] } }),
        { name: "water", material: water, castShadow: false }
      )
      .runtime({ id: "water", mutable: true })
  );

const app = createAuraApp("#app", { scene: sc });
let clk = 0;
app.onFrame((f) => {
  clk += f.dt;
  app.nodes.require("water").setUniform?.("clk", clk);
});
await app.ready();
window.__EVAL_READY__ = true;
