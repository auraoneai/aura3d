import { camera, createAuraApp, geometry, material, primitives, scene } from "@aura3d/engine";

// Custom-shader water under a gradient sky dome. Both shaders write LINEAR light; the app uses
// toneMapping "none" so authored sRGB colours (decoded below) appear as intended after sRGB output encoding.

const N = 240;        // quads per side (241^2 = 58081 vertices, below the 65535 index limit)
const HALF = 110;     // half extent of the water in metres

// Grid with quadratic spacing: dense near the middle (camera), sparse towards the edges.
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    const u = (i / N) * 2 - 1;
    const w = (j / N) * 2 - 1;
    positions.set([Math.sign(u) * u * u * HALF, 0, Math.sign(w) * w * w * HALF], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

// Shared by the sky dome and the water so the water reflects exactly what the dome shows.
const COMMON = /* glsl */ `
vec3 srgb2lin(vec3 c) {
  return mix(c / 12.92, pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
const vec3 SUN_DIR = vec3(0.30, 0.16, -0.94);
vec3 skyColor(vec3 d) {
  d.y = max(d.y, 0.002);
  d = normalize(d);
  vec3 horizon = srgb2lin(vec3(0.80, 0.88, 0.95));
  vec3 mid     = srgb2lin(vec3(0.42, 0.64, 0.90));
  vec3 zenith  = srgb2lin(vec3(0.09, 0.28, 0.68));
  float h = d.y;
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  col = mix(col, zenith, smoothstep(0.15, 0.9, h));
  vec3 sunDir = normalize(SUN_DIR);
  float sd = max(dot(d, sunDir), 0.0);
  vec3 sunCol = srgb2lin(vec3(1.0, 0.92, 0.75));
  col += sunCol * (pow(sd, 6.0) * 0.12 + pow(sd, 48.0) * 0.35);
  col += sunCol * smoothstep(0.9993, 0.9998, sd) * 6.0;
  return col;
}
`;

const sky = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${COMMON}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  outColor = vec4(min(skyColor(d), vec3(8.0)), 1.0);
}`
  },
  side: "double",
  depthWrite: false,
  fog: false
});

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out float vH;
out vec2 vGrad;

void addWave(vec2 p, float t, vec2 dir, float k, float amp, float speed, inout float h, inout vec2 g) {
  vec2 dn = normalize(dir);
  float ph = dot(p, dn) * k + t * speed;
  h += amp * sin(ph);
  g += amp * k * cos(ph) * dn;
}

void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 g = vec2(0.0);
  addWave(p, waveClock, vec2( 0.80, -0.60), 0.35, 0.30, 0.90, h, g);
  addWave(p, waveClock, vec2(-0.50, -0.85), 0.55, 0.20, 1.20, h, g);
  addWave(p, waveClock, vec2( 0.95,  0.30), 0.90, 0.09, 1.60, h, g);
  addWave(p, waveClock, vec2(-0.30, -0.95), 1.60, 0.05, 2.20, h, g);
  vec3 wp = vec3(p.x, h, p.y);
  vWorld = wp;
  vH = h;
  vGrad = g;
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
in float vH;
in vec2 vGrad;
out vec4 outColor;
${COMMON}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}
float ripple(vec2 p) {
  float t = waveClock;
  return fbm(p * 1.3 + vec2(t * 0.25, t * 0.15)) + 0.5 * fbm(p * 2.1 - vec2(t * 0.2, -t * 0.3));
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // Geometric wave normal from analytic slopes.
  vec3 n = normalize(vec3(-vGrad.x, 1.0, -vGrad.y));

  // Noise ripple detail, faded with distance to avoid aliasing.
  float fade = 1.0 - smoothstep(20.0, 85.0, dist);
  float e = 0.06;
  vec2 p = vWorld.xz;
  vec2 rg = vec2(ripple(p + vec2(e, 0.0)) - ripple(p - vec2(e, 0.0)),
                 ripple(p + vec2(0.0, e)) - ripple(p - vec2(0.0, e))) / (2.0 * e);
  n = normalize(n + vec3(-rg.x, 0.0, -rg.y) * 0.05 * fade);

  float ndv = clamp(dot(n, v), 0.0, 1.0);

  // Fresnel (Schlick): more sky reflection at grazing angles.
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fres = clamp(fres * 1.15, 0.0, 1.0);

  // Reflected sky.
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyColor(r);

  // Water body colour.
  vec3 deep    = srgb2lin(vec3(0.02, 0.17, 0.30));
  vec3 shallow = srgb2lin(vec3(0.07, 0.48, 0.55));
  float tint = clamp(smoothstep(-0.5, 0.6, vH) * 0.8 + (1.0 - ndv) * 0.2, 0.0, 1.0);
  vec3 body = mix(deep, shallow, tint);

  vec3 col = mix(body, refl, fres);

  // Foam on the highest crests, broken up by noise.
  float crest = smoothstep(0.38, 0.62, vH);
  float foamN = smoothstep(0.55, 0.85, fbm(p * 3.0 + vec2(waveClock * 0.3, 0.0)));
  col = mix(col, srgb2lin(vec3(0.92, 0.96, 0.98)), crest * foamN * 0.7 * fade);

  // Sun glint (Blinn-Phong on the ripple-perturbed normal).
  vec3 sunDir = normalize(SUN_DIR);
  vec3 hv = normalize(sunDir + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 320.0) * 9.0 + pow(nh, 40.0) * 0.25;
  vec3 sunCol = srgb2lin(vec3(1.0, 0.92, 0.75));
  col += sunCol * glint * (0.4 + 0.6 * fres);

  // Aerial haze: blend into the horizon colour at the far edge so the water meets the dome.
  vec3 horizonDir = normalize(vec3(-v.x, 0.0, -v.z));
  float haze = smoothstep(55.0, 108.0, dist);
  col = mix(col, skyColor(horizonDir), haze);

  outColor = vec4(min(col, vec3(8.0)), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe0f2" })
    .add(primitives.sphere({ name: "sky", size: 600, material: sky, castShadow: false }).position(0, 0, 0))
    .add(
      geometry
        .custom(
          geometry.define({
            positions,
            normals,
            indices,
            bounds: { min: [-HALF, -2, -HALF], max: [HALF, 2, HALF] }
          }),
          { name: "water", material: water, castShadow: false }
        )
        .runtime({ id: "water", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 3, 10], target: [0, 2.3, -30], fov: 50, near: 0.3, far: 700 })),
  output: { toneMapping: "none" }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
});
