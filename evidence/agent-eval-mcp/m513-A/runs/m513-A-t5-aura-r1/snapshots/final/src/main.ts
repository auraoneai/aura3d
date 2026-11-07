import { camera, createAuraApp, environments, geometry, lights, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const N = 220;
const SIZE = 440;
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
void main() {
  vec2 p = position.xz;
  // three directional waves: height and analytic slope
  vec2 d1 = normalize(vec2(0.8, 0.6)),  d2 = normalize(vec2(-0.5, 0.85)), d3 = normalize(vec2(0.2, -1.0));
  float k1 = 0.45, k2 = 0.8, k3 = 1.3;
  float a1 = 0.55, a2 = 0.28, a3 = 0.12;
  float p1 = dot(p, d1) * k1 + clk * 1.2;
  float p2 = dot(p, d2) * k2 + clk * 1.6;
  float p3 = dot(p, d3) * k3 + clk * 2.1;
  float h = sin(p1) * a1 + sin(p2) * a2 + sin(p3) * a3;
  vec2 g = d1 * (cos(p1) * a1 * k1) + d2 * (cos(p2) * a2 * k2) + d3 * (cos(p3) * a3 * k3);
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
vec3 skyColor(vec3 dir) {
  float t = clamp(dir.y, 0.0, 1.0);
  vec3 horizon = vec3(0.75, 0.84, 0.92);
  vec3 zenith = vec3(0.12, 0.32, 0.68);
  return mix(horizon, zenith, pow(t, 0.55));
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  // noise ripple detail fades with distance to avoid shimmer
  float detail = 1.0 / (1.0 + dist * 0.02);
  vec2 q = vPos.xz;
  float nx = vnoise(q * 1.7 + vec2(clk * 0.6, clk * 0.3)) + vnoise(q * 4.1 - vec2(clk * 0.9, 0.0)) * 0.5 - 0.75;
  float nz = vnoise(q * 1.9 - vec2(clk * 0.4, clk * 0.5)) + vnoise(q * 3.7 + vec2(0.0, clk * 1.1)) * 0.5 - 0.75;
  vec3 n = normalize(vN + vec3(nx, 0.0, nz) * 0.35 * detail);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 sky = skyColor(refl);
  // body colour: deep blue-green, lighter on wave crests
  float crest = clamp(vPos.y * 0.6 + 0.5, 0.0, 1.0);
  vec3 body = mix(vec3(0.01, 0.09, 0.17), vec3(0.04, 0.3, 0.38), crest * 0.6 + 0.1);
  vec3 col = mix(body, sky, clamp(fres * 1.2 + 0.05, 0.0, 1.0));
  // sun specular glint
  vec3 sunDir = normalize(vec3(0.25, 0.22, -0.9));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 220.0);
  float sheen = pow(max(dot(reflect(-sunDir, n), v), 0.0), 16.0);
  col += vec3(1.0, 0.92, 0.75) * (glint * 6.0 + sheen * 0.25);
  // blend into horizon colour in the distance
  float fog = 1.0 - exp(-dist * 0.0045);
  col = mix(col, vec3(0.75, 0.84, 0.92), clamp(fog, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const sc = scene({ background: "#bfd6ea" })
  .camera(camera.perspective({ position: [0, 5, 22], target: [0, 1.5, -30], fov: 55, near: 0.5, far: 600 }))
  .add(sky.gradient({ zenith: "#2a5cad", horizon: "#bfd6ea" }))
  .add(environments.neutral({ intensity: 0.6, background: false }))
  .add(lights.directional({ position: [10, 9, -36], target: [0, 0, 0], intensity: 2.5 }))
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

const app = createAuraApp("#app", { scene: sc });
let clk = 0;
app.onFrame((f) => {
  clk += f.dt;
  app.nodes.require("water").setUniform?.("clk", clk);
});
await app.ready();
window.__EVAL_READY__ = true;
