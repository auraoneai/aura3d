import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const N = 320;
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
vec3 waveAt(vec2 p, float t) {
  float h = 0.0; vec2 g = vec2(0.0);
  vec2 d1 = normalize(vec2(1.0, 0.6)); float f1 = 0.22, a1 = 0.45;
  vec2 d2 = normalize(vec2(-0.5, 1.0)); float f2 = 0.37, a2 = 0.25;
  vec2 d3 = normalize(vec2(0.2, -1.0)); float f3 = 0.75, a3 = 0.10;
  float p1 = dot(p, d1) * f1 + t * 1.1;
  float p2 = dot(p, d2) * f2 + t * 1.5;
  float p3 = dot(p, d3) * f3 + t * 2.1;
  h = a1 * sin(p1) + a2 * sin(p2) + a3 * sin(p3);
  g = d1 * a1 * f1 * cos(p1) + d2 * a2 * f2 * cos(p2) + d3 * a3 * f3 * cos(p3);
  return vec3(h, g);
}`;

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
${waveFn}
void main() {
  vec2 p = position.xz;
  vec3 w = waveAt(p, clk);
  vPos = vec3(p.x, w.x, p.y);
  vN = normalize(vec3(-w.y, 1.0, -w.z));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
vec3 skyCol(vec3 d) {
  float t = pow(clamp(d.y, 0.0, 1.0), 0.5);
  return mix(vec3(0.62, 0.76, 0.90), vec3(0.10, 0.28, 0.62), t);
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  vec2 q = vPos.xz;
  float e = 0.08;
  float r0 = fbm(q * 0.9 + vec2(clk * 0.15, clk * 0.1));
  float rx = fbm((q + vec2(e, 0.0)) * 0.9 + vec2(clk * 0.15, clk * 0.1));
  float rz = fbm((q + vec2(0.0, e)) * 0.9 + vec2(clk * 0.15, clk * 0.1));
  float detail = 1.0 / (1.0 + dist * 0.03);
  vec3 n = normalize(vN + vec3(-(rx - r0), 0.0, -(rz - r0)) * (3.0 * detail) / e * 0.12);
  float cosv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyCol(r);
  vec3 deep = vec3(0.01, 0.09, 0.17);
  vec3 shallow = vec3(0.03, 0.30, 0.38);
  vec3 body = mix(deep, shallow, clamp(0.5 + (vPos.y) * 0.8 + r0 * 0.3, 0.0, 1.0));
  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
  vec3 sunDir = normalize(vec3(0.35, 0.22, -0.9));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 220.0);
  col += vec3(1.0, 0.92, 0.75) * glint * 3.0;
  float fogT = smoothstep(90.0, 190.0, dist);
  col = mix(col, vec3(0.62, 0.76, 0.90), fogT);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const sc = scene({ background: "#9ec2e6" })
  .camera(camera.perspective({ position: [0, 5, 24], target: [0, 2.5, -40], fov: 55, near: 0.5, far: 600 }))
  .add(sky.gradient({ zenith: "#1a4a9c", horizon: "#9ec2e6", ground: "#9ec2e6", exponent: 0.5 }))
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
