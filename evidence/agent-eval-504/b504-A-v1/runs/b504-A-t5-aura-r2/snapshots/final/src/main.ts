import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const N = 256;
const SIZE = 320;
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

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void wave(vec2 p, vec2 d, float k, float w, float a, inout float h, inout vec2 g) {
  float ph = dot(p, d) * k + uTime * w;
  h += a * sin(ph);
  g += a * k * cos(ph) * d;
}
void main() {
  vec2 p = position.xz;
  float h = 0.0; vec2 g = vec2(0.0);
  wave(p, normalize(vec2(0.3, -1.0)), 0.45, 1.2, 0.30, h, g);
  wave(p, normalize(vec2(-0.6, -0.8)), 0.80, 1.7, 0.16, h, g);
  wave(p, normalize(vec2(0.9, -0.3)), 1.30, 2.3, 0.08, h, g);
  wave(p, normalize(vec2(-0.2, 0.9)), 2.10, 3.1, 0.035, h, g);
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 skyColor(vec3 d) {
  float t = pow(clamp(d.y, 0.0, 1.0), 0.5);
  return mix(vec3(0.62, 0.76, 0.9), vec3(0.12, 0.34, 0.72), t);
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  vec2 q = vPos.xz;
  float e = 0.08 / (1.0 + dist * 0.03);
  vec2 r = vec2(
    vnoise(q * 1.7 + vec2(uTime * 0.6, 0.0)) + 0.5 * vnoise(q * 4.1 - vec2(0.0, uTime * 0.9)) - 0.75,
    vnoise(q * 1.7 + vec2(7.3, uTime * 0.5)) + 0.5 * vnoise(q * 4.1 + vec2(uTime * 0.8, 3.1)) - 0.75
  );
  vec3 n = normalize(vN + vec3(r.x, 0.0, r.y) * (0.55 / (1.0 + dist * 0.02)) + vec3(0.0, e, 0.0));
  float cosT = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 reflected = skyColor(refl);
  vec3 deep = vec3(0.01, 0.10, 0.18);
  vec3 shallow = vec3(0.02, 0.28, 0.36);
  float crest = clamp(vPos.y * 1.8 + 0.5, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * 0.6);
  vec3 col = mix(body, reflected, clamp(fres, 0.0, 1.0));
  vec3 sunDir = normalize(vec3(0.25, 0.22, -0.9));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 220.0);
  float broad = pow(max(dot(reflect(-sunDir, n), v), 0.0), 18.0);
  col += vec3(1.0, 0.9, 0.7) * (glint * 3.0 + broad * 0.12);
  float fog = 1.0 - exp(-dist * 0.0045);
  fog = clamp(fog * fog * 1.6, 0.0, 1.0);
  col = mix(col, vec3(0.62, 0.76, 0.9), fog);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {}
});

const sc = scene({ background: "#9fc2e6" })
  .camera(camera.perspective({ position: [0, 5, 22], target: [0, 1.5, -30], fov: 55, near: 0.5, far: 600 }))
  .add(sky.gradient({ zenith: "#3b7fd0", horizon: "#b5d0ea" }))
  .add(
    geometry.custom(
      geometry.define({
        positions,
        normals,
        indices,
        bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] }
      }),
      { name: "water", material: water, castShadow: false }
    )
  );

const app = createAuraApp("#app", { scene: sc });
await app.ready();
window.__EVAL_READY__ = true;
