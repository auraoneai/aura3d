import { camera, createAuraApp, environments, geometry, lights, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const N = 240;
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
void main() {
  vec2 p = position.xz;
  float a = dot(p, vec2(0.21, 0.13)) * 3.0 + uTime * 1.2;
  float b = dot(p, vec2(-0.17, 0.25)) * 3.0 + uTime * 1.5;
  float c = dot(p, vec2(0.05, -0.31)) * 3.0 + uTime * 0.9;
  float h = sin(a) * 0.30 + sin(b) * 0.18 + sin(c) * 0.12;
  float dx = cos(a) * 0.30 * 0.63 + cos(b) * 0.18 * -0.51 + cos(c) * 0.12 * 0.15;
  float dz = cos(a) * 0.30 * 0.39 + cos(b) * 0.18 * 0.75 + cos(c) * 0.12 * -0.93;
  vPos = vec3(p.x, h, p.y);
  vN = normalize(vec3(-dx, 1.0, -dz));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 skyColor(vec3 d) {
  float t = pow(clamp(d.y, 0.0, 1.0), 0.45);
  vec3 c = mix(vec3(0.50, 0.67, 0.82), vec3(0.03, 0.17, 0.50), t);
  vec3 sunDir = normalize(vec3(0.25, 0.22, -0.9));
  c += vec3(1.0, 0.8, 0.5) * pow(max(dot(d, sunDir), 0.0), 64.0) * 0.5;
  return c;
}
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec2 q = vPos.xz;
  vec2 r = vec2(
    vnoise(q * 1.7 + vec2(uTime * 0.6, uTime * 0.3)) + vnoise(q * 4.3 - vec2(uTime * 0.9, 0.0)) * 0.5,
    vnoise(q * 1.7 + vec2(7.3 - uTime * 0.4, uTime * 0.5)) + vnoise(q * 4.3 + vec2(0.0, uTime * 0.8)) * 0.5
  ) - 0.75;
  vec3 n = normalize(vN + vec3(r.x, 0.0, r.y) * 0.22);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 reflected = skyColor(refl);
  vec3 deep = vec3(0.01, 0.10, 0.18);
  vec3 shallow = vec3(0.03, 0.30, 0.38);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 1.2 + 0.5, 0.0, 1.0) * 0.6 + ndv * 0.2);
  vec3 col = mix(body, reflected, clamp(fres * 1.1 + 0.05, 0.0, 1.0));
  vec3 L = normalize(vec3(0.25, 0.22, -0.9));
  float glint = pow(max(dot(reflect(-L, n), v), 0.0), 220.0);
  col += vec3(1.0, 0.92, 0.75) * glint * 3.0;
  float dist = length(cameraPosition - vPos);
  float fog = 1.0 - exp(-pow(dist * 0.0075, 1.6));
  col = mix(col, vec3(0.50, 0.67, 0.82), clamp(fog, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {}
});

const sc = scene({ background: "#bcd6ea" })
  .camera(camera.perspective({ position: [0, 4, 22], target: [0, 2.2, -30], fov: 55, near: 0.5, far: 600 }))
  .add(sky.gradient({ zenith: "#2f6fb8", horizon: "#bcd6ea" }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.directional({ position: [25, 22, -90], target: [0, 0, 0], intensity: 2.5 }))
  .add(
    geometry.custom(
      geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 2, SIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    )
  );

const app = createAuraApp("#app", { scene: sc });
await app.ready();
window.__EVAL_READY__ = true;
