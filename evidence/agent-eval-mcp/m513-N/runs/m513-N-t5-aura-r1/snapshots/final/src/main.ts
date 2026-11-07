import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Subdivided grid: waves are real geometry displaced in the vertex shader.
const N = 256;
const SIZE = 400;
const positions = new Float32Array((N + 1) * (N + 1) * 3);
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

// Sky colours shared between the sky dome (CSS, sRGB) and the water shader (linear).
const SKY_ZENITH = "#2f6db5";
const SKY_HORIZON = "#bcd6ea";

const WAVES = `
const int NW = 5;
const vec4 WV[5] = vec4[5](
  vec4(0.9, 0.3, 0.16, 0.55),
  vec4(-0.5, 0.85, 0.23, 0.35),
  vec4(0.2, -0.95, 0.35, 0.22),
  vec4(-0.85, -0.4, 0.55, 0.12),
  vec4(0.6, 0.7, 0.9, 0.06)
); // xy = direction, z = frequency, w = amplitude
vec3 waveAt(vec2 p, float t) {
  float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    vec2 d = normalize(WV[i].xy);
    float f = WV[i].z, a = WV[i].w;
    float ph = dot(p, d) * f + t * (0.8 + sqrt(f) * 1.2);
    h += sin(ph) * a;
    g += d * cos(ph) * a * f;
  }
  return vec3(h, g);
}`;

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
${WAVES}
void main() {
  vec3 w = waveAt(position.xz, clk);
  vPos = vec3(position.x, w.x, position.z);
  vN = normalize(vec3(-w.y, 1.0, -w.z));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
const vec3 ZENITH = vec3(0.028, 0.153, 0.462);
const vec3 HORIZON = vec3(0.503, 0.672, 0.823);
const vec3 SUN_DIR = vec3(0.298, 0.259, -0.919);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return s;
}
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(HORIZON, ZENITH, pow(h, 0.5));
  float s = max(dot(d, normalize(SUN_DIR)), 0.0);
  c += vec3(1.0, 0.85, 0.6) * (pow(s, 24.0) * 0.35 + pow(s, 600.0) * 4.0);
  return c;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  // procedural ripple detail: noise gradient perturbs the normal, faded with distance against aliasing
  vec2 q = vPos.xz * 0.9;
  float e = 0.08;
  vec2 tt = vec2(clk * 0.35, clk * 0.2);
  float n0 = fbm(q + tt);
  float nx = fbm(q + tt + vec2(e, 0.0));
  float nz = fbm(q + tt + vec2(0.0, e));
  float fade = 1.0 / (1.0 + dist * 0.025);
  vec2 rip = vec2(nx - n0, nz - n0) / e * 0.22 * fade;
  vec3 n = normalize(vN + vec3(rip.x, 0.0, rip.y));
  if (dot(n, v) < 0.0) n = normalize(n + v * (0.02 - dot(n, v)));
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  // fresnel (Schlick, F0 of water ~0.02)
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);
  // body colour: deeper in the troughs, lighter on crests
  float crest = clamp(vPos.y * 0.6 + 0.5, 0.0, 1.0);
  vec3 body = mix(vec3(0.005, 0.07, 0.13), vec3(0.03, 0.26, 0.32), crest * 0.6 + n0 * 0.3);
  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
  // sun specular glint
  vec3 L = normalize(SUN_DIR);
  vec3 hv = normalize(L + v);
  float spec = pow(max(dot(n, hv), 0.0), 400.0) * 6.0 + pow(max(dot(n, hv), 0.0), 60.0) * 0.25;
  col += vec3(1.0, 0.9, 0.7) * spec;
  // blend into the sky at the far edge so the grid border is invisible
  float fog = smoothstep(80.0, 190.0, dist);
  col = mix(col, HORIZON, fog);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const sc = scene({ background: SKY_HORIZON })
  .camera(camera.perspective({ position: [0, 4, 20], target: [0, 2.2, -60], fov: 55, near: 0.5, far: 700 }))
  .add(sky.gradient({ zenith: SKY_ZENITH, horizon: SKY_HORIZON, exponent: 0.5, sun: { elevationDeg: 15, azimuthDeg: 18, intensity: 1 } }))
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
