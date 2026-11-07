import { camera, createAuraApp, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Shared sky function: used by the sky dome and by the water reflection so both match exactly.
// Colours are linear; the engine tone-maps and sRGB-encodes the output.
const SKY_GLSL = /* glsl */ `
const vec3 SKY_ZENITH = vec3(0.07, 0.22, 0.55);
const vec3 SKY_HORIZON = vec3(0.60, 0.74, 0.88);
const vec3 SUN_DIR = vec3(0.30, 0.22, -0.93);
const vec3 SUN_COLOR = vec3(1.0, 0.90, 0.72);
vec3 skyColor(vec3 d) {
  d = normalize(d);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(SKY_HORIZON, SKY_ZENITH, pow(h, 0.55));
  vec3 s = normalize(SUN_DIR);
  float sd = max(dot(d, s), 0.0);
  c += SUN_COLOR * pow(sd, 8.0) * 0.18;      // wide glow
  c += SUN_COLOR * pow(sd, 256.0) * 1.5;     // inner glow
  c += SUN_COLOR * smoothstep(0.9993, 0.9998, sd) * 6.0; // disc
  return c;
}
`;

// ---- Water: subdivided grid so the waves are real geometry ----
const N = 250;
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

const WAVES_GLSL = /* glsl */ `
// x,y = direction, z = wavenumber, w = amplitude
const vec4 WAVES[4] = vec4[4](
  vec4( 0.80,  0.60, 0.34, 0.34),
  vec4(-0.55,  0.83, 0.62, 0.17),
  vec4( 0.20, -0.98, 1.10, 0.07),
  vec4(-0.90, -0.44, 1.80, 0.03)
);
// returns height, writes d(height)/d(x,z)
float waves(vec2 p, float t, out vec2 grad) {
  float h = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = WAVES[i];
    vec2 d = normalize(w.xy);
    float k = w.z;
    float ph = k * dot(d, p) - sqrt(9.8 * k) * 0.7 * t;
    h += w.w * sin(ph);
    grad += d * (w.w * k * cos(ph));
  }
  return h;
}
`;

const water = material.custom({
  fog: false,
  glsl: {
    vertex: /* glsl */ `
${WAVES_GLSL}
out vec3 vPos;
out vec3 vNormal;
void main() {
  vec2 grad;
  float h = waves(position.xz, clk, grad);
  vec3 p = vec3(position.x, h, position.z);
  vPos = (modelMatrix * vec4(p, 1.0)).xyz;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
${SKY_GLSL}
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return s;
}
float ripple(vec2 p, float t) {
  return fbm(p * 1.6 + vec2(t * 0.35, t * 0.2)) + 0.6 * fbm(p * 3.1 - vec2(t * 0.28, -t * 0.4));
}

void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / dist;

  // noise ripple detail: perturb the normal with the gradient of a noise field, fade with distance
  float e = 0.08;
  float r0 = ripple(vPos.xz, clk);
  float rx = ripple(vPos.xz + vec2(e, 0.0), clk);
  float rz = ripple(vPos.xz + vec2(0.0, e), clk);
  float detail = 1.0 - smoothstep(20.0, 90.0, dist);
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  vec3 n = normalize(vNormal + vec3(-rg.x, 0.0, -rg.y) * 0.16 * detail);

  // fresnel (Schlick): more sky reflection at grazing angles
  float cosT = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 reflection = skyColor(r);

  vec3 deep = vec3(0.005, 0.045, 0.085);
  vec3 shallow = vec3(0.02, 0.17, 0.20);
  float crest = clamp(vPos.y * 1.3 + 0.5, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * crest);
  body += vec3(0.01, 0.05, 0.05) * clamp(r0 - 0.9, 0.0, 1.0);

  vec3 col = mix(body, reflection, clamp(fres, 0.0, 1.0));

  // sun specular glint
  vec3 s = normalize(SUN_DIR);
  float sp = max(dot(reflect(-s, n), v), 0.0);
  col += SUN_COLOR * (pow(sp, 600.0) * 6.0 + pow(sp, 60.0) * 0.25);

  // aerial haze to the sky horizon colour so the water edge disappears
  float haze = max(1.0 - exp(-pow(dist * 0.016, 2.0)), smoothstep(95.0, 115.0, dist));
  col = mix(col, SKY_HORIZON, haze);

  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

// ---- Sky dome (inside-out sphere, gradient + sun) ----
const skyMat = material.custom({
  fog: false,
  side: "back",
  depthWrite: false,
  glsl: {
    vertex: /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
${SKY_GLSL}
in vec3 vDir;
out vec4 outColor;
void main() {
  outColor = vec4(skyColor(vDir), 1.0);
}`
  }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#a9c4e0" })
    .add(lights.directional({ position: [3, 2.2, -9.3], target: [0, 0, 0], intensity: 2.5 }))
    .add(primitives.sphere({ name: "sky", size: 900, material: skyMat, castShadow: false }))
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
    .camera(camera.perspective({ position: [0, 3.5, 20], target: [0, 2.2, -40], fov: 55, near: 0.3, far: 1000 }))
});

let clock = 0;
app.onFrame((f) => {
  clock += f.dt;
  app.nodes.require("water").setUniform?.("clk", clock);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
