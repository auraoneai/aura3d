import { camera, createAuraApp, geometry, material, scene } from "@aura3d/engine";

declare global {
  interface Window { __EVAL_READY__?: boolean }
}

// ---------------------------------------------------------------------------
// Shared GLSL: sky gradient (used by the sky dome and by the water reflection).
// Custom shaders write linear light; the engine applies tone mapping + sRGB encode.
// ---------------------------------------------------------------------------
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.28, 0.2, -0.94);
vec3 srgbToLin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 skyColor(vec3 d) {
  vec3 sd = normalize(SUN_DIR);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = srgbToLin(vec3(0.80, 0.88, 0.95));
  vec3 zenith = srgbToLin(vec3(0.16, 0.38, 0.78));
  vec3 col = mix(horizon, zenith, pow(h, 0.4));
  float s = max(dot(d, sd), 0.0);
  col += vec3(1.0, 0.72, 0.42) * pow(s, 6.0) * 0.18;   // warm halo
  col += vec3(1.0, 0.85, 0.6) * pow(s, 120.0) * 0.8;   // inner glow
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9998, s) * 12.0; // sun disc
  return col;
}`;

// ---------------------------------------------------------------------------
// Sky dome: inside-out sphere around the camera.
// ---------------------------------------------------------------------------
function domeGeometry(radius: number, seg: number, rings: number) {
  const positions = new Float32Array((seg + 1) * (rings + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let r = 0; r <= rings; r += 1) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s <= seg; s += 1) {
      const th = (s / seg) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
      const v = r * (seg + 1) + s;
      positions.set([x * radius, y * radius, z * radius], v * 3);
      normals.set([-x, -y, -z], v * 3);
      if (r < rings && s < seg) indices.push(v, v + seg + 1, v + 1, v + 1, v + seg + 1, v + seg + 2);
    }
  }
  return geometry.define({ positions, normals, indices, bounds: { min: [-radius, -radius, -radius], max: [radius, radius, radius] } });
}

const skyMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  outColor = vec4(skyColor(d), 1.0);
}`
  },
  side: "double",
  depthWrite: false,
  fog: false
});

// ---------------------------------------------------------------------------
// Water: subdivided grid (denser near the camera), waves displaced in the vertex shader.
// ---------------------------------------------------------------------------
const N = 256, R = 260;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  const u = (i / N) * 2 - 1, w = (j / N) * 2 - 1;
  positions.set([u * Math.abs(u) * R, 0, w * Math.abs(w) * R], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out float vHeight;
out float vT;

// x,y = direction, z = wavenumber, w = amplitude
const vec4 WAVES[5] = vec4[5](
  vec4( 1.00,  0.25, 0.30, 0.34),
  vec4( 0.70, -0.65, 0.55, 0.20),
  vec4(-0.35,  1.00, 0.95, 0.10),
  vec4( 0.55,  0.85, 1.70, 0.045),
  vec4(-0.90,  0.30, 2.80, 0.02)
);

void main() {
  vec2 p = position.xz;
  float h = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    vec4 w = WAVES[i];
    vec2 dir = normalize(w.xy);
    float ph = dot(dir, p) * w.z + waveClock * sqrt(9.81 * w.z);
    h += w.w * sin(ph);
    grad += dir * (w.w * w.z * cos(ph));
  }
  vec3 world = vec3(p.x, h, p.y);
  vWorld = world;
  vHeight = h;
  vT = waveClock;
  vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
  gl_Position = modelViewProjectionMatrix * vec4(world, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in float vHeight;
in float vT;
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
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
float ripple(vec2 p, float t) {
  return fbm(p * 1.3 + vec2(t * 0.25, t * 0.15)) + 0.7 * fbm(p * 2.4 - vec2(t * 0.2, -t * 0.3));
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);

  // Large waves from the vertex stage + noise ripples (fade out with distance).
  vec3 n = normalize(vNormal);
  float fade = 1.0 - smoothstep(40.0, 160.0, dist);
  vec2 q = vWorld.xz;
  float e = 0.06;
  float r0 = ripple(q, vT);
  vec2 rg = vec2(ripple(q + vec2(e, 0.0), vT) - r0, ripple(q + vec2(0.0, e), vT) - r0) / e;
  n = normalize(vec3(n.x - rg.x * 0.10 * fade, n.y, n.z - rg.y * 0.10 * fade));
  // Flatten far normals to avoid sparkle aliasing.
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(60.0, 260.0, dist) * 0.85));

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fresnel = clamp(fresnel * 1.15 + 0.03, 0.0, 1.0);

  // Reflection of the sky.
  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 reflected = skyColor(normalize(refl));

  // Water body: deep blue-green, brighter in wave crests and ripple highlights.
  vec3 deep = srgbToLin(vec3(0.02, 0.16, 0.26));
  vec3 shallow = srgbToLin(vec3(0.10, 0.50, 0.56));
  float crest = clamp(vHeight * 1.6 + 0.45 + (r0 - 0.7) * 0.5, 0.0, 1.0);
  vec3 sd = normalize(SUN_DIR);
  float diffuse = max(dot(n, sd), 0.0);
  vec3 body = mix(deep, shallow, crest * crest) + shallow * diffuse * 0.12;

  vec3 col = mix(body, reflected, fresnel);

  // Sun glint (Blinn-Phong, tight + broad lobe).
  vec3 hvec = normalize(sd + v);
  float nh = max(dot(n, hvec), 0.0);
  float glint = pow(nh, 700.0) * 6.0 + pow(nh, 90.0) * 0.5;
  col += vec3(1.0, 0.9, 0.7) * glint * smoothstep(0.0, 0.15, sd.y);

  // Soft foam on the tallest crests.
  float foam = smoothstep(0.62, 0.95, vHeight * 1.5 + r0 * 0.35) * fade;
  col = mix(col, vec3(0.8, 0.85, 0.9) * 0.6, foam * 0.35);

  // Blend into the horizon colour at the far edge of the grid.
  vec3 horizonCol = skyColor(vec3(1.0, 0.0, 0.0));
  col = mix(col, horizonCol, smoothstep(170.0, 255.0, dist));

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double",
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe0f2" })
    .add(geometry.custom(domeGeometry(600, 48, 24), { name: "sky", material: skyMaterial, castShadow: false }))
    .add(geometry.custom(
      geometry.define({ positions, normals, indices, bounds: { min: [-R, -2, -R], max: [R, 2, R] } }),
      { name: "water", material: water, castShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .camera(camera.perspective({ position: [0, 3, 14], target: [0, 0.6, -40], fov: 55, near: 0.3, far: 1200 })),
  output: { toneMapping: "aces", exposure: 1.0 }
});

const start = performance.now();
app.onFrame(() => {
  app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000);
});
await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
