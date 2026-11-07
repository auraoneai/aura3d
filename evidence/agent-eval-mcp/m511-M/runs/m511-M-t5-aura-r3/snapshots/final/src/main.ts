import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

// ---- shared GLSL: sky gradient, sun, tone mapping (all maths in linear light, output is display-referred) ----
const COMMON = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.30, 0.20, -0.93);
vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.62, 0.74, 0.90);
  vec3 zenith = vec3(0.07, 0.20, 0.52);
  vec3 c = mix(horizon, zenith, pow(h, 0.45));
  float s = max(dot(normalize(d), normalize(SUN_DIR)), 0.0);
  c += vec3(1.0, 0.72, 0.42) * pow(s, 8.0) * 0.18;
  c += vec3(1.0, 0.80, 0.55) * pow(s, 64.0) * 0.45;
  return c;
}
vec3 sunDisc(vec3 d) {
  float s = max(dot(normalize(d), normalize(SUN_DIR)), 0.0);
  return vec3(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9998, s) * 12.0;
}
vec3 toneMap(vec3 x) {
  // ACES (Narkowicz) then linear -> sRGB
  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  return pow(x, vec3(1.0 / 2.2));
}
`;

// ---- sky dome ----
const skyMaterial = material.custom({
  side: "back",
  depthWrite: false,
  fog: false,
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${COMMON}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 c = skyColor(d) + sunDisc(d);
  outColor = vec4(toneMap(c), 1.0);
}`
  }
});

// ---- water grid ----
const N = 260;
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

const water = material.custom({
  side: "double",
  fog: false,
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out float vTime;
// Sum of directional sines: xy = direction, z = wavenumber, w = amplitude; speed derived from k.
void waves(vec2 p, float t, out float h, out vec2 grad) {
  vec4 W0 = vec4( 0.80,  0.60, 0.55, 0.30);
  vec4 W1 = vec4(-0.55,  0.83, 0.80, 0.18);
  vec4 W2 = vec4( 0.30, -0.95, 1.30, 0.09);
  vec4 W3 = vec4(-0.90, -0.44, 2.10, 0.04);
  h = 0.0; grad = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = i == 0 ? W0 : (i == 1 ? W1 : (i == 2 ? W2 : W3));
    float ph = dot(p, w.xy) * w.z + t * sqrt(9.8 * w.z);
    h += sin(ph) * w.w;
    grad += w.xy * (cos(ph) * w.w * w.z);
  }
}
void main() {
  float h; vec2 g;
  waves(position.xz, waveClock, h, g);
  vec3 p = vec3(position.x, h, position.z);
  vPos = p;
  vTime = waveClock;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in float vTime;
out vec4 outColor;
${COMMON}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ripple(vec2 p, float t) {
  float a = vnoise(p * 1.7 + vec2(t * 0.35, t * 0.20));
  float b = vnoise(p * 3.9 - vec2(t * 0.50, -t * 0.30));
  float c = vnoise(p * 8.3 + vec2(-t * 0.70, t * 0.55));
  return a * 0.55 + b * 0.30 + c * 0.15;
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;

  // noise ripple detail: perturb normal by the gradient of the noise field, faded with distance
  float e = 0.08;
  float r0 = ripple(vPos.xz, vTime);
  float rx = ripple(vPos.xz + vec2(e, 0.0), vTime);
  float rz = ripple(vPos.xz + vec2(0.0, e), vTime);
  float fade = 1.0 - smoothstep(25.0, 90.0, dist);
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  n = normalize(n + vec3(-rg.x, 0.0, -rg.y) * 0.22 * fade);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  fresnel = clamp(fresnel * 1.15, 0.0, 1.0);

  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);

  vec3 deep = vec3(0.005, 0.045, 0.10);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  float crest = clamp(vPos.y * 1.6 + 0.35 + (r0 - 0.5) * 0.3, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest);

  vec3 col = mix(body, refl, fresnel);

  // sun specular glint
  vec3 sd = normalize(SUN_DIR);
  float sp = max(dot(r, sd), 0.0);
  col += vec3(1.0, 0.88, 0.65) * (pow(sp, 600.0) * 18.0 + pow(sp, 60.0) * 0.5);

  // blend into the horizon colour at the far edge of the grid
  float edgeMix = smoothstep(90.0, 140.0, length(vPos.xz - cameraPosition.xz));
  col = mix(col, skyColor(vec3(0.0, 0.0, -1.0)), edgeMix);

  outColor = vec4(toneMap(col), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe0f2" })
    .add(primitives.sphere({ name: "sky", size: 1, material: skyMaterial, castShadow: false }).scale(900))
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
    .camera(camera.perspective({ position: [0, 3.5, 14], target: [0, 1.6, -40], fov: 55, near: 0.3, far: 1800 }))
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
});
