import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Water: subdivided grid (waves are real vertex displacement) + custom GLSL.
// Shaders output scene-linear colour; the engine's output pass does tone mapping and sRGB encoding.
// ---------------------------------------------------------------------------
const N = 360;
const SIZE = 360;
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

// Shared sky gradient (used by the sky dome and by the water reflection).
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(0.28, 0.16, -0.95);
vec3 skyColor(vec3 d) {
  d = normalize(d);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.62, 0.74, 0.86);
  vec3 zenith = vec3(0.06, 0.20, 0.52);
  vec3 col = mix(horizon, zenith, pow(h, 0.45));
  vec3 sun = normalize(SUN_DIR);
  float s = max(dot(d, sun), 0.0);
  col += vec3(1.0, 0.72, 0.42) * pow(s, 8.0) * 0.35;
  col += vec3(1.0, 0.85, 0.6) * pow(s, 64.0) * 0.8;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9998, s) * 12.0;
  return col;
}
`;

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
void addWave(vec2 p, float t, vec2 dir, float k, float amp, float speed, inout float h, inout vec2 g) {
  vec2 d = normalize(dir);
  float ph = dot(p, d) * k + t * speed;
  h += amp * sin(ph);
  g += amp * k * cos(ph) * d;
}
void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(p, waveClock, vec2(1.0, 0.3), 0.45, 0.32, 1.1, h, g);
  addWave(p, waveClock, vec2(-0.6, 1.0), 0.78, 0.2, 1.4, h, g);
  addWave(p, waveClock, vec2(0.4, 1.0), 1.35, 0.1, 1.9, h, g);
  addWave(p, waveClock, vec2(-1.0, 0.7), 2.3, 0.045, 2.6, h, g);
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
${SKY_GLSL}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ripple(vec2 p, float t) {
  float a = vnoise(p * 1.7 + vec2(t * 0.35, t * 0.2));
  float b = vnoise(p * 3.9 - vec2(t * 0.5, -t * 0.3)) * 0.5;
  float c = vnoise(p * 8.3 + vec2(-t * 0.8, t * 0.6)) * 0.25;
  return a + b + c;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);

  // Noise ripple detail: perturb the wave normal with the gradient of a noise height field.
  float e = 0.06;
  float r0 = ripple(vPos.xz, waveClock);
  float rx = ripple(vPos.xz + vec2(e, 0.0), waveClock);
  float rz = ripple(vPos.xz + vec2(0.0, e), waveClock);
  float fade = 1.0 / (1.0 + dist * 0.05);
  vec2 rg = vec2(rx - r0, rz - r0) / e * 0.11 * fade;
  vec3 n = normalize(normalize(vNormal) + vec3(-rg.x, 0.0, -rg.y));

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 reflected = skyColor(refl);

  float depthMix = clamp(vPos.y * 1.2 + 0.5, 0.0, 1.0);
  vec3 body = mix(vec3(0.005, 0.06, 0.11), vec3(0.03, 0.22, 0.26), depthMix);
  body += vec3(0.02, 0.10, 0.10) * (r0 - 0.9) * 0.4;

  vec3 col = mix(body, reflected, clamp(fresnel, 0.0, 1.0));

  // Sun glint
  vec3 sun = normalize(SUN_DIR);
  float sp = max(dot(refl, sun), 0.0);
  col += vec3(1.0, 0.9, 0.7) * (pow(sp, 900.0) * 14.0 + pow(sp, 120.0) * 0.8);

  // Distance haze into the horizon colour of the sky
  vec3 haze = skyColor(vec3(normalize(-v.xz + vec2(0.0001)).x, 0.0, normalize(-v.xz + vec2(0.0001)).y));
  float f = smoothstep(40.0, 165.0, dist);
  col = mix(col, vec3(0.62, 0.74, 0.86), f);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

// ---------------------------------------------------------------------------
// Sky dome: big sphere seen from inside, gradient from view direction.
// ---------------------------------------------------------------------------
const sky = material.custom({
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
  side: "double",
  depthWrite: false,
  fog: false
});

async function main(): Promise<void> {
  const app = createAuraApp("#app", {
    scene: scene({ background: "#9dbbd8" })
      .add(primitives.sphere({ name: "sky", size: 1, material: sky, castShadow: false }).scale(800))
      .add(
        geometry
          .custom(geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -2, -SIZE / 2], max: [SIZE / 2, 2, SIZE / 2] } }), {
            name: "water",
            material: water,
            castShadow: false
          })
          .runtime({ id: "water", mutable: true })
      )
      .camera(camera.perspective({ position: [0, 3.2, 20], target: [0, 2.2, -60], fov: 55, near: 0.5, far: 1200 }))
  });

  const start = performance.now();
  app.onFrame(() => {
    app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
  });
  await app.ready();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
}

void main();
