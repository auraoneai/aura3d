import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const N = 240;
const SIZE = 300;
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
vec3 waveAt(vec2 p, float t) {
  float h = 0.0; vec2 g = vec2(0.0);
  vec2 d1 = normalize(vec2(0.8, 0.6));  float k1 = 0.35, a1 = 0.55;
  vec2 d2 = normalize(vec2(-0.4, 0.9)); float k2 = 0.6,  a2 = 0.28;
  vec2 d3 = normalize(vec2(0.9, -0.3)); float k3 = 1.1,  a3 = 0.12;
  float p1 = dot(p, d1) * k1 + t * 1.1;
  float p2 = dot(p, d2) * k2 + t * 1.5;
  float p3 = dot(p, d3) * k3 + t * 2.1;
  h = sin(p1) * a1 + sin(p2) * a2 + sin(p3) * a3;
  g = d1 * cos(p1) * a1 * k1 + d2 * cos(p2) * a2 * k2 + d3 * cos(p3) * a3 * k3;
  return vec3(g, h);
}`;

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
${waveFn}
void main() {
  vec3 w = waveAt(position.xz, clk);
  vPos = vec3(position.x, w.z, position.z);
  vN = normalize(vec3(-w.x, 1.0, -w.y));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 skyColor(vec3 d) {
  vec3 horizon = vec3(0.50, 0.67, 0.86);
  vec3 zenith = vec3(0.03, 0.16, 0.46);
  return mix(horizon, zenith, pow(clamp(d.y, 0.0, 1.0), 0.5));
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  vec2 q = vPos.xz;
  float e = 0.08;
  float n0 = vnoise(q * 1.7 + vec2(clk * 0.4, clk * 0.2));
  float nx = vnoise((q + vec2(e, 0.0)) * 1.7 + vec2(clk * 0.4, clk * 0.2));
  float nz = vnoise((q + vec2(0.0, e)) * 1.7 + vec2(clk * 0.4, clk * 0.2));
  float m0 = vnoise(q * 4.3 - vec2(clk * 0.6, -clk * 0.3));
  float mx = vnoise((q + vec2(e, 0.0)) * 4.3 - vec2(clk * 0.6, -clk * 0.3));
  float mz = vnoise((q + vec2(0.0, e)) * 4.3 - vec2(clk * 0.6, -clk * 0.3));
  float detail = 1.0 / (1.0 + dist * 0.02);
  vec3 rip = vec3(((n0 - nx) + (m0 - mx) * 0.6) / e, 0.0, ((n0 - nz) + (m0 - mz) * 0.6) / e) * 0.06 * detail;
  vec3 n = normalize(vN + rip);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);
  vec3 deep = vec3(0.005, 0.07, 0.14);
  vec3 shallow = vec3(0.02, 0.22, 0.28);
  vec3 body = mix(deep, shallow, clamp(0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0)) - 0.4 + vPos.y * 0.15, 0.0, 1.0));
  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
  vec3 L = normalize(vec3(0.25, 0.22, -0.9));
  float glint = pow(max(dot(reflect(-v, n), L), 0.0), 220.0);
  col += vec3(1.0, 0.9, 0.7) * glint * 6.0;
  float crest = smoothstep(0.55, 0.9, vPos.y);
  col += vec3(0.05, 0.08, 0.09) * crest * detail;
  float fog = 1.0 - exp(-pow(dist * 0.0065, 1.6));
  col = mix(col, skyColor(vec3(v.x * -1.0, 0.0, 0.0)), clamp(fog, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`,
  },
  uniforms: { clk: { type: "f32", value: 0 } },
});

const sc = scene({ background: "#bcd6ee" })
  .camera(camera.perspective({ position: [0, 5, 22], target: [0, 1.5, -30], fov: 55, near: 0.5, far: 400 }))
  .add(sky.gradient({ zenith: "#2f6fb5", horizon: "#bcd6ee" }))
  .add(
    geometry
      .custom(
        geometry.define({
          positions,
          normals,
          indices,
          bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 2, SIZE / 2] },
        }),
        { name: "water", material: water, castShadow: false },
      )
      .runtime({ id: "water", mutable: true }),
  );

const app = createAuraApp("#app", { scene: sc });
let clk = 0;
app.onFrame((f) => {
  clk += f.dt;
  app.nodes.require("water").setUniform?.("clk", clk);
});
await app.ready();
window.__EVAL_READY__ = true;
