import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const N = 256;
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

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
float wave(vec2 p, vec2 d, float freq, float spd) { return sin(dot(p, d) * freq + clk * spd); }
float height(vec2 p) {
  return 0.45 * wave(p, normalize(vec2(1.0, 0.6)), 0.35, 1.2)
       + 0.25 * wave(p, normalize(vec2(-0.7, 1.0)), 0.6, 1.6)
       + 0.12 * wave(p, normalize(vec2(0.3, -1.0)), 1.1, 2.1);
}
void main() {
  vec2 p = position.xz;
  float e = 0.15;
  float h = height(p);
  float hx = height(p + vec2(e, 0.0));
  float hz = height(p + vec2(0.0, e));
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 skyColor(vec3 d) {
  float t = clamp(d.y, 0.0, 1.0);
  return mix(vec3(0.62, 0.78, 0.92), vec3(0.15, 0.35, 0.7), pow(t, 0.6));
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  vec2 q = vPos.xz;
  float nx = vnoise(q * 1.7 + vec2(clk * 0.6, clk * 0.3)) + 0.5 * vnoise(q * 4.1 - vec2(clk * 0.8, 0.0)) - 0.75;
  float nz = vnoise(q * 1.7 + vec2(-clk * 0.4, clk * 0.5) + 31.7) + 0.5 * vnoise(q * 4.1 + vec2(0.0, clk * 0.9) + 17.3) - 0.75;
  float detail = 0.25 / (1.0 + dist * 0.03);
  vec3 n = normalize(vN + vec3(nx, 0.0, nz) * detail);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 sky = skyColor(refl);
  vec3 sunDir = normalize(vec3(0.35, 0.28, -0.9));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 220.0);
  float broad = pow(max(dot(reflect(-sunDir, n), v), 0.0), 24.0);
  vec3 deep = vec3(0.01, 0.10, 0.18);
  vec3 shallow = vec3(0.03, 0.30, 0.38);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 0.8 + 0.4, 0.0, 1.0));
  vec3 col = mix(body, sky, clamp(fres, 0.0, 1.0));
  col += vec3(1.0, 0.92, 0.75) * (glint * 3.0 + broad * 0.15);
  float fogF = 1.0 - exp(-dist * 0.0 - pow(dist / 170.0, 2.0));
  col = mix(col, vec3(0.62, 0.78, 0.92), clamp(fogF, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const sc = scene({ background: "#cfe3ee" })
  .camera(camera.perspective({ position: [0, 5, 30], target: [0, 2.2, -60], fov: 55, near: 0.5, far: 500 }))
  .add(sky.gradient({ zenith: "#4f8fd0", horizon: "#cfe3ee" }))
  .add(
    geometry
      .custom(geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 2, SIZE / 2] } }), {
        name: "water",
        material: water,
        castShadow: false
      })
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
