import { camera, createAuraApp, effects, geometry, lights, material, primitives, scene } from "@aura3d/engine";

// Water with a custom GLSL material: vertex waves, analytic normal, fresnel mix between deep colour and sky, sun glint.
// Uniforms listed in `uniforms` are auto-declared in GLSL. Prelude names: position/normal/uv (vertex attributes), modelViewProjectionMatrix, modelMatrix, cameraPosition, uTime (uTime advances only while the scene redraws every frame; this recipe drives its own `waveClock` from onFrame).
const N = 200, SIZE = 80;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
vec3 wave(vec2 p, float t, out vec2 slope) {
  float a = sin(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.35;
  float b = sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.22;
  float c = sin(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1) * 0.08;
  slope = vec2(cos(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.35 * 0.63 + cos(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.22 * -0.51 + cos(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1) * 0.08 * 1.2,
              cos(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.35 * 0.39 + cos(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.22 * 0.75 + cos(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1) * 0.08 * 0.93);
  return vec3(p.x, a + b + c, p.y);
}
void main() {
  vec2 slope;
  vec3 p = wave(position.xz, waveClock, slope);
  vPos = p;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vPos); // cameraPosition is a prelude uniform in both stages
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
  vec3 deep = vec3(0.02, 0.18, 0.30);
  vec3 shallow = vec3(0.10, 0.45, 0.55);
  vec3 sky = vec3(0.62, 0.78, 0.92);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 1.4 + 0.5, 0.0, 1.0));
  vec3 sunDir = normalize(vec3(0.5, 0.45, 0.35));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 140.0);
  outColor = vec4(mix(body, sky, clamp(fresnel * 0.9 + 0.08, 0.0, 1.0)) + vec3(1.0, 0.93, 0.78) * glint * 1.4, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#9ec3e6" })
    .add(lights.directional({ position: [5, 4.5, 3.5], target: [0, 0, 0], intensity: 2.5 }))
    .add(geometry.custom(geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] } }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }))
    .add(primitives.sphere({ name: "islet", size: 1, material: material.pbr({ color: "#7a6a52", roughness: 1 }) }).position(9, -0.5, -14).scale([9, 3, 6]))
    .add(effects.fog({ color: "#a9c9e6", density: 0.008 }))
    .camera(camera.perspective({ position: [0, 6, 22], target: [0, 0, 0], fov: 50, near: 0.5, far: 300 }))
});
const start = performance.now();
app.onFrame(() => app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000));
await app.ready();
