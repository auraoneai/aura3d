import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Subdivided grid: the waves are real geometry displaced in the vertex shader.
const N = 300;
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

// Sun placement shared by the sky dome and the water glint.
const SUN_ELEV = 12;
const SUN_AZIM = 12;
const E = (SUN_ELEV * Math.PI) / 180;
const A = (SUN_AZIM * Math.PI) / 180;
const sunDir: [number, number, number] = [Math.sin(A) * Math.cos(E), Math.sin(E), -Math.cos(A) * Math.cos(E)];
const f3 = (n: number): string => n.toFixed(4);

const SKY_GLSL = /* glsl */ `
vec3 skyColor(vec3 d) {
  // Linear-space gradient matching the sky dome: horizon -> zenith.
  vec3 horizon = vec3(0.60, 0.74, 0.88);
  vec3 zenith = vec3(0.07, 0.24, 0.62);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(horizon, zenith, pow(h, 0.5));
  vec3 sd = normalize(vec3(${f3(sunDir[0])}, ${f3(sunDir[1])}, ${f3(sunDir[2])}));
  float s = max(dot(d, sd), 0.0);
  c += vec3(1.0, 0.75, 0.45) * pow(s, 24.0) * 0.35;
  return c;
}`;

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
// Four directional waves: xy = direction, z = frequency, w = amplitude.
vec3 waves(vec2 p, float t, out vec2 grad) {
  vec4 w0 = vec4(0.80, 0.60, 0.30, 0.30);
  vec4 w1 = vec4(-0.55, 0.83, 0.52, 0.17);
  vec4 w2 = vec4(0.30, -0.95, 0.95, 0.07);
  vec4 w3 = vec4(-0.90, -0.43, 1.70, 0.035);
  float h = 0.0;
  grad = vec2(0.0);
  float ph;
  ph = dot(p, w0.xy) * w0.z + t * 0.9;  h += sin(ph) * w0.w; grad += cos(ph) * w0.w * w0.z * w0.xy;
  ph = dot(p, w1.xy) * w1.z + t * 1.2;  h += sin(ph) * w1.w; grad += cos(ph) * w1.w * w1.z * w1.xy;
  ph = dot(p, w2.xy) * w2.z + t * 1.7;  h += sin(ph) * w2.w; grad += cos(ph) * w2.w * w2.z * w2.xy;
  ph = dot(p, w3.xy) * w3.z + t * 2.3;  h += sin(ph) * w3.w; grad += cos(ph) * w3.w * w3.z * w3.xy;
  return vec3(p.x, h, p.y);
}
void main() {
  vec2 grad;
  vec3 p = waves(position.xz, waveClock, grad);
  vPos = p;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
${SKY_GLSL}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return s;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;

  // Noise ripples: perturb the normal with the gradient of animated fbm; fade with distance to avoid shimmer.
  vec2 q = vPos.xz * 1.3;
  float e = 0.05;
  vec2 drift = vec2(waveClock * 0.25, waveClock * 0.18);
  float c0 = fbm(q + drift);
  float cx = fbm(q + drift + vec2(e, 0.0));
  float cz = fbm(q + drift + vec2(0.0, e));
  vec2 rip = vec2(cx - c0, cz - c0) / e;
  float fade = 1.0 - smoothstep(30.0, 110.0, dist);
  vec3 n = normalize(normalize(vNormal) + vec3(-rip.x, 0.0, -rip.y) * 0.22 * fade);

  // Fresnel (Schlick): more sky reflection at grazing angles.
  float cosT = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 reflected = skyColor(r);

  vec3 deep = vec3(0.005, 0.045, 0.085);
  vec3 shallow = vec3(0.02, 0.17, 0.22);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 1.6 + 0.5, 0.0, 1.0));
  body += vec3(0.03, 0.10, 0.10) * smoothstep(0.55, 0.85, c0) * fade; // foamy ripple tint

  vec3 col = mix(body, reflected, clamp(fresnel, 0.0, 1.0));

  // Sun specular glint.
  vec3 sd = normalize(vec3(${f3(sunDir[0])}, ${f3(sunDir[1])}, ${f3(sunDir[2])}));
  float glint = pow(max(dot(reflect(-sd, n), v), 0.0), 220.0);
  col += vec3(1.0, 0.85, 0.6) * glint * 2.5;

  // Blend into the horizon colour with distance so the grid edge is invisible.
  vec3 horizon = vec3(0.60, 0.74, 0.88);
  float fog = 1.0 - exp(-pow(dist / 170.0, 2.0));
  col = mix(col, horizon, clamp(fog, 0.0, 1.0));

  outColor = vec4(col, 1.0); // linear; the engine tone-maps and sRGB-encodes
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#9ec3e6" })
    .add(
      sky.gradient({
        zenith: "#2f6fc4",
        horizon: "#c4d9ec",
        ground: "#c4d9ec",
        sun: { elevationDeg: SUN_ELEV, azimuthDeg: SUN_AZIM, intensity: 1 }
      })
    )
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
    .camera(camera.perspective({ position: [0, 4, 30], target: [0, 1.5, -40], fov: 50, near: 0.5, far: 600 }))
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});
await app.ready();
window.__EVAL_READY__ = true;
