import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Subdivided grid: the waves are real vertex displacement.
const N = 250; // (N+1)^2 = 63001 vertices, stays within 16-bit indices
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

// Shared GLSL: sum of directional waves (height + analytic slope).
const waveGlsl = `
const int NW = 5;
const vec2 WD[5] = vec2[5](vec2(0.92, 0.38), vec2(-0.45, 0.89), vec2(0.2, -0.98), vec2(-0.85, -0.52), vec2(0.6, 0.8));
const float WK[5] = float[5](0.42, 0.65, 0.95, 1.4, 2.1);
const float WA[5] = float[5](0.42, 0.26, 0.15, 0.08, 0.04);
const float WS[5] = float[5](1.0, 1.25, 1.5, 1.9, 2.3);
vec3 waves(vec2 p, float t) {
  float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    float ph = dot(WD[i], p) * WK[i] + t * WS[i];
    h += sin(ph) * WA[i];
    g += WD[i] * (cos(ph) * WA[i] * WK[i]);
  }
  return vec3(h, g);
}
`;

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
${waveGlsl}
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
  for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return s;
}
vec3 skyColor(vec3 d) {
  float y = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.52, 0.76, 1.0), zenith = vec3(0.014, 0.115, 0.55);
  vec3 c = mix(horizon, zenith, pow(y, 0.55));
  vec3 sd = normalize(vec3(0.34, 0.21, -0.92));
  float s = max(dot(d, sd), 0.0);
  c += vec3(1.0, 0.85, 0.6) * (pow(s, 24.0) * 0.25 + pow(s, 1200.0) * 6.0);
  return c;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  // noise ripples, faded with distance to avoid shimmer
  float fade = 1.0 - smoothstep(25.0, 110.0, dist);
  vec2 q = vPos.xz * 1.3;
  float e = 0.12;
  float t = clk * 0.6;
  float r0 = fbm(q + vec2(t, t * 0.7));
  float rx = fbm(q + vec2(e, 0.0) + vec2(t, t * 0.7));
  float rz = fbm(q + vec2(0.0, e) + vec2(t, t * 0.7));
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  vec3 n = normalize(vN + vec3(-rg.x, 0.0, -rg.y) * 0.16 * fade);
  if (dot(n, v) < 0.0) n = reflect(n, v);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);
  // body colour: deep to shallow, lighter on wave crests
  float crest = clamp(vPos.y * 1.2 + 0.5, 0.0, 1.0);
  vec3 body = mix(vec3(0.004, 0.05, 0.10), vec3(0.02, 0.2, 0.26), crest * 0.7 + 0.15 * r0);
  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
  // sun specular glint
  vec3 sd = normalize(vec3(0.34, 0.21, -0.92));
  vec3 hv = normalize(sd + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 700.0) * 14.0 + pow(nh, 90.0) * 0.5;
  col += vec3(1.0, 0.9, 0.7) * glint;
  // distance haze towards the horizon colour
  float haze = smoothstep(80.0, 175.0, dist);
  col = mix(col, vec3(0.52, 0.76, 1.0), haze);
  outColor = vec4(col, 1.0);
}`,
  },
  uniforms: { clk: { type: "f32", value: 0 } },
});

const sc = scene({ background: "#8fc9ff" })
  .camera(camera.perspective({ position: [0, 4.5, 20], target: [0, 1.6, -40], fov: 55, near: 0.5, far: 500 }))
  .add(sky.gradient({ zenith: "#1f5fc4", horizon: "#bfe2ff", sun: { elevationDeg: 12, azimuthDeg: 20, intensity: 1 } }))
  .add(
    geometry
      .custom(geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 2, SIZE / 2] } }), {
        name: "water",
        material: water,
        castShadow: false,
      })
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
