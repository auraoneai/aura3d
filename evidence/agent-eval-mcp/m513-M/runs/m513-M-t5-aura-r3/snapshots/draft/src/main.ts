import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---- Shared GLSL: procedural sky gradient + sun (used by the dome and by the water reflection).
// Values are linear; the engine's output pass applies tone mapping and sRGB encoding.
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.28, 0.20, -0.94);
vec3 skyColor(vec3 d) {
  vec3 dir = normalize(d);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 horizon = vec3(0.62, 0.74, 0.88);
  vec3 zenith = vec3(0.07, 0.20, 0.52);
  vec3 col = mix(horizon, zenith, pow(h, 0.5));
  vec3 sun = normalize(SUN_DIR);
  float s = max(dot(dir, sun), 0.0);
  col += vec3(1.0, 0.78, 0.50) * pow(s, 6.0) * 0.18;
  col += vec3(1.0, 0.85, 0.60) * pow(s, 80.0) * 0.6;
  col += vec3(1.0, 0.95, 0.80) * smoothstep(0.9993, 0.9998, s) * 12.0;
  return col;
}
`;

// ---- Sky dome
const skyMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
void main() {
  outColor = vec4(skyColor(vWorld - cameraPosition), 1.0);
}`
  },
  side: "back",
  depthWrite: false,
  fog: false
});

// ---- Water grid (geometry is subdivided so waves are real displacement)
const N = 360;
const SIZE = 240;
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

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;

// 4 summed sine waves: direction, wavenumber, amplitude, angular speed.
void addWave(vec2 p, vec2 dir, float k, float amp, float spd, float t, inout float h, inout vec2 grad) {
  vec2 d = normalize(dir);
  float ph = dot(p, d) * k + t * spd;
  h += amp * sin(ph);
  grad += amp * k * cos(ph) * d;
}

void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 grad = vec2(0.0);
  addWave(p, vec2(1.0, 0.35), 0.45, 0.34, 1.10, waveClock, h, grad);
  addWave(p, vec2(-0.6, 1.0), 0.80, 0.18, 1.45, waveClock, h, grad);
  addWave(p, vec2(0.3, -1.0), 1.30, 0.09, 1.90, waveClock, h, grad);
  addWave(p, vec2(-1.0, -0.5), 2.10, 0.04, 2.60, waveClock, h, grad);
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
${SKY_GLSL}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float ripple(vec2 p, float t) {
  float r = 0.0;
  float amp = 0.5;
  vec2 q = p;
  for (int i = 0; i < 4; i++) {
    r += amp * vnoise(q + vec2(t * 0.35, t * 0.22) * (1.0 + float(i) * 0.4));
    q = mat2(1.6, 1.2, -1.2, 1.6) * q;
    amp *= 0.5;
  }
  return r;
}

void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;

  // Noise ripples perturb the analytic wave normal; faded with distance to avoid shimmering.
  vec2 rp = vPos.xz * 1.1;
  float e = 0.06;
  float r0 = ripple(rp, waveClock);
  float rx = ripple(rp + vec2(e, 0.0), waveClock);
  float rz = ripple(rp + vec2(0.0, e), waveClock);
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  float rippleFade = exp(-dist * 0.025);
  vec3 n = normalize(vNormal + vec3(-rg.x, 0.0, -rg.y) * 0.22 * rippleFade);

  // Fresnel (Schlick): more sky reflection at grazing angles.
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // Reflected sky.
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 reflected = skyColor(r);

  // Water body: deep to shallow, brighter on crests.
  vec3 deep = vec3(0.005, 0.045, 0.09);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  float crest = clamp(vPos.y * 1.2 + 0.45 + (r0 - 0.5) * 0.3, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest);

  vec3 col = mix(body, reflected, fresnel);

  // Sun glint.
  vec3 sun = normalize(SUN_DIR);
  float sp = max(dot(r, sun), 0.0);
  col += vec3(1.0, 0.90, 0.70) * (pow(sp, 700.0) * 18.0 + pow(sp, 60.0) * 0.5);

  // Blend to the sky horizon colour at distance so the water edge meets the dome.
  vec3 hdir = normalize(vec3(-toCam.x, 0.0, -toCam.z));
  float far = smoothstep(40.0, 105.0, dist);
  col = mix(col, skyColor(hdir), far);

  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#9db9d9" })
    .add(
      primitives
        .sphere({ name: "sky", size: 1, material: skyMaterial, castShadow: false })
        .scale([700, 700, 700])
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
    .camera(camera.perspective({ position: [0, 3.2, 24], target: [0, 2.2, -30], fov: 50, near: 0.3, far: 2000 }))
});

const start = performance.now();
let first = true;
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
await app.ready();
