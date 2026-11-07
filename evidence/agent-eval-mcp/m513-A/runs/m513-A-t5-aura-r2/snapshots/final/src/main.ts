import { camera, createAuraApp, geometry, lights, material, scene, sky } from "@aura3d/engine";

declare global { interface Window { __EVAL_READY__?: boolean } }

let sc = scene({ background: "#9ec4e6" })
  .camera(camera.perspective({ position: [0, 6, 22], target: [0, 1, -30], fov: 55, near: 0.5, far: 400 }))
  .add(sky.gradient({ zenith: "#2a5fa8", horizon: "#cfe3f4" }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#2b5a78", intensity: 1.0 }))
  .add(lights.directional({ position: [50, 45, -35], target: [0, 0, 0], intensity: 2.5 }));

const N = 200, SIZE = 160;
const positions = new Float32Array((N + 1) ** 2 * 3), normals = new Float32Array(positions.length), indices: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float ph = dot(p, vec2(0.21, 0.13)) * 3.0 + clk;
  float ph2 = dot(p, vec2(-0.17, 0.25)) * 3.0 + clk * 1.3;
  vPos = vec3(p.x, sin(ph) * 0.35 + sin(ph2) * 0.2, p.y);
  vN = normalize(vec3(-cos(ph) * 0.22 + cos(ph2) * 0.1, 1.0, -cos(ph) * 0.14 - cos(ph2) * 0.15));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 2.0 + clk) - 0.5, 0.0, vnoise(vPos.xz * 2.0 - clk) - 0.5) * 0.25);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
  vec3 sky = mix(vec3(0.62, 0.78, 0.92), vec3(0.15, 0.35, 0.7), clamp(reflect(-v, n).y, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(vec3(0.5, 0.45, -0.35)), n), v), 0.0), 140.0);
  vec3 col = mix(vec3(0.02, 0.18, 0.3), sky, clamp(fres * 0.9 + 0.08, 0.0, 1.0)) + vec3(1.0, 0.93, 0.78) * glint * 1.4;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

sc = sc.add(
  geometry.custom(
    geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] } }),
    { name: "water", material: water, castShadow: false }
  ).runtime({ id: "water", mutable: true })
);

let clk = 0;
const app = createAuraApp("#app", { scene: sc });
app.onFrame((f) => {
  clk += f.dt;
  app.nodes.require("water").setUniform?.("clk", clk);
});
await app.ready();
window.__EVAL_READY__ = true;
