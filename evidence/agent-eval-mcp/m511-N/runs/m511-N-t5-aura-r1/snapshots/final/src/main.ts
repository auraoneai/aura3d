import { camera, createAuraApp, geometry, lights, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Subdivided grid: waves are real geometry displaced in the vertex shader.
const N = 400;
const SIZE = 360;
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

// Sun direction (towards the sun): azimuth -17 deg from -Z, elevation 14 deg.
const SUN_AZ = -17;
const SUN_EL = 14;

const SKY_FN = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.2837, 0.2419, -0.9279);
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.50, 0.69, 0.86);
  vec3 zenith = vec3(0.03, 0.15, 0.46);
  vec3 c = mix(horizon, zenith, pow(h, 0.5));
  float s = max(dot(d, SUN_DIR), 0.0);
  c += vec3(1.0, 0.8, 0.5) * (pow(s, 8.0) * 0.15 + pow(s, 256.0) * 2.0);
  return c;
}`;

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
// four directional sine waves: height + analytic slope
void wave(vec2 p, float t, out float h, out vec2 slope) {
  h = 0.0;
  slope = vec2(0.0);
  vec2 d0 = vec2(0.80, 0.60);  float k0 = 0.45; float a0 = 0.55; float s0 = 1.1;
  vec2 d1 = vec2(-0.55, 0.83); float k1 = 0.80; float a1 = 0.28; float s1 = 1.5;
  vec2 d2 = vec2(0.30, -0.95); float k2 = 1.30; float a2 = 0.13; float s2 = 1.9;
  vec2 d3 = vec2(-0.95, -0.31); float k3 = 2.10; float a3 = 0.06; float s3 = 2.6;
  float p0 = dot(p, d0) * k0 + t * s0;
  float p1 = dot(p, d1) * k1 + t * s1;
  float p2 = dot(p, d2) * k2 + t * s2;
  float p3 = dot(p, d3) * k3 + t * s3;
  h = sin(p0) * a0 + sin(p1) * a1 + sin(p2) * a2 + sin(p3) * a3;
  slope = d0 * cos(p0) * a0 * k0 + d1 * cos(p1) * a1 * k1 + d2 * cos(p2) * a2 * k2 + d3 * cos(p3) * a3 * k3;
}
void main() {
  float h;
  vec2 slope;
  wave(position.xz, waveClock, h, slope);
  vec3 p = vec3(position.x, h, position.z);
  vPos = p;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
${SKY_FN}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  // procedural ripple detail, fading with distance to avoid aliasing
  float detail = 1.0 - smoothstep(30.0, 120.0, dist);
  vec2 q = vPos.xz * 0.9;
  float e = 0.05;
  float r0 = fbm(q + vec2(waveClock * 0.35, waveClock * 0.2));
  float rx = fbm(q + vec2(e, 0.0) + vec2(waveClock * 0.35, waveClock * 0.2));
  float rz = fbm(q + vec2(0.0, e) + vec2(waveClock * 0.35, waveClock * 0.2));
  vec2 rip = vec2(rx - r0, rz - r0) / e;
  vec3 n = normalize(vNormal + vec3(-rip.x, 0.0, -rip.y) * 0.10 * detail);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 reflection = skyColor(r);
  vec3 deep = vec3(0.004, 0.035, 0.07);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 0.9 + 0.4, 0.0, 1.0));
  vec3 col = mix(body, reflection, clamp(fresnel, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-SUN_DIR, n), v), 0.0), 600.0);
  col += vec3(1.0, 0.9, 0.7) * glint * 6.0;
  // blend into the horizon colour with distance
  float fog = smoothstep(80.0, 170.0, dist);
  col = mix(col, skyColor(normalize(vec3(-v.x, 0.0, -v.z))), fog);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#bcd8ee" })
    .add(sky.gradient({ zenith: "#2f6db5", horizon: "#bcd8ee", sun: { elevationDeg: SUN_EL, azimuthDeg: SUN_AZ } }))
    .add(lights.directional({ position: [-2.3, 2.4, -9.4], target: [0, 0, 0], intensity: 2.5 }))
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
    )
    .camera(camera.perspective({ position: [0, 3.2, 20], target: [0, 1.8, -60], fov: 55, near: 0.5, far: 600 }))
});

let clock = 0;
let flagged = false;
app.onFrame((f) => {
  clock += f.dt;
  app.nodes.require("water").setUniform?.("waveClock", clock);
  if (!flagged) {
    flagged = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
await app.ready();
