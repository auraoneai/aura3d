import { camera, createAuraApp, geometry, material, scene } from "@aura3d/engine";

// Custom GLSL water under a gradient sky dome. Both shaders share SKY_GLSL, so the water reflects exactly
// the colours the dome shows. All colours are linear light: the engine tone-maps and sRGB-encodes the output.

const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(0.2425, 0.2134, -0.9463); // normalised: ~12 degrees above the horizon, ahead of the camera
vec3 skyBase(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.80, 0.88, 0.97);
  vec3 zenith = vec3(0.09, 0.26, 0.70);
  vec3 col = mix(horizon, zenith, pow(h, 0.42));
  float s = max(dot(d, SUN_DIR), 0.0);
  col += vec3(1.0, 0.72, 0.42) * (pow(s, 6.0) * 0.12 + pow(s, 48.0) * 0.35); // warm glow around the sun
  return col;
}
`;

// ---- water grid: dense near the camera, sparse towards the horizon, so waves are real geometry ----
const N = 320;
const HALF = 300;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
const spread = (t: number): number => {
  const u = t * 2 - 1;
  return u * Math.abs(u) * HALF;
};
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([spread(i / N), 0, spread(j / N)], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vN;
// Sum of travelling sines: height in .z, gradient (dh/dx, dh/dz) in .xy
vec3 waves(vec2 p, float t) {
  vec4 dirs[4];
  dirs[0] = vec4(0.10, -1.00, 14.0, 0.34);
  dirs[1] = vec4(-0.55, -0.85, 8.0, 0.20);
  dirs[2] = vec4(0.80, -0.60, 5.0, 0.10);
  dirs[3] = vec4(-0.30, 0.95, 3.0, 0.05);
  float h = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 d = normalize(dirs[i].xy);
    float k = 6.2831853 / dirs[i].z;
    float w = sqrt(9.8 * k);
    float ph = dot(d, p) * k + t * w;
    h += sin(ph) * dirs[i].w;
    g += d * (cos(ph) * dirs[i].w * k);
  }
  return vec3(g, h);
}
void main() {
  vec3 w = waves(position.xz, uTime);
  vec3 p = vec3(position.x, w.z, position.z);
  vPos = p;
  vN = normalize(vec3(-w.x, 1.0, -w.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vN;
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
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 5.3); a *= 0.5; }
  return s;
}
void main() {
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 0.0001);

  // noise ripple detail: gradient of an animated fbm height field, faded with distance to avoid shimmer
  vec2 q = vPos.xz * 1.6 + vec2(uTime * 0.35, uTime * 0.2);
  float e = 0.06;
  float r0 = fbm(q);
  vec2 rg = vec2(fbm(q + vec2(e, 0.0)) - r0, fbm(q + vec2(0.0, e)) - r0) / e;
  float rippleFade = 1.0 / (1.0 + dist * 0.045);
  vec3 n = normalize(vN + vec3(-rg.x, 0.0, -rg.y) * 0.075 * rippleFade);

  // fresnel (Schlick, F0 of water) pushed a bit for a clearly visible grazing reflection
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = clamp(0.02 + 0.98 * pow(1.0 - ndv, 4.0), 0.0, 1.0);

  vec3 r = reflect(-v, n);
  r.y = max(r.y, 0.015);
  vec3 reflected = skyBase(normalize(r));

  // water body: deep blue, turquoise on lit crests
  float crest = smoothstep(-0.25, 0.55, vPos.y);
  vec3 deep = vec3(0.004, 0.030, 0.075);
  vec3 shallow = vec3(0.020, 0.200, 0.250);
  float diffuse = 0.45 + 0.55 * max(dot(n, SUN_DIR), 0.0);
  vec3 body = mix(deep, shallow, crest * 0.8 + 0.1) * diffuse;

  vec3 col = mix(body, reflected, fres);

  // sun glint: tight Blinn-Phong lobe plus a broad soft one, driven by the rippled normal
  vec3 hv = normalize(SUN_DIR + v);
  float nh = max(dot(n, hv), 0.0);
  float glint = pow(nh, 900.0) * 14.0 + pow(nh, 90.0) * 0.5;
  col += vec3(1.0, 0.86, 0.62) * glint * smoothstep(0.0, 0.2, SUN_DIR.y);

  // aerial haze: far water melts into the horizon colour of the sky dome
  float haze = clamp(1.0 - exp(-dist * 0.0045), 0.0, 1.0);
  haze = max(haze, smoothstep(180.0, 290.0, dist));
  col = mix(col, skyBase(vec3(1.0, 0.0, 0.0)), haze);

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`
  },
  uniforms: {},
  side: "double",
  fog: false
});

// ---- sky dome: inverted-visible UV sphere around the camera, same gradient as the water reflects ----
const RADIUS = 450;
const LAT = 32;
const LON = 64;
const domePositions = new Float32Array((LAT + 1) * (LON + 1) * 3);
const domeNormals = new Float32Array(domePositions.length);
const domeIndices: number[] = [];
for (let a = 0; a <= LAT; a += 1) {
  const phi = (a / LAT) * Math.PI;
  for (let b = 0; b <= LON; b += 1) {
    const theta = (b / LON) * Math.PI * 2;
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    const v = a * (LON + 1) + b;
    domePositions.set([x * RADIUS, y * RADIUS, z * RADIUS], v * 3);
    domeNormals.set([x, y, z], v * 3);
    if (a < LAT && b < LON) domeIndices.push(v, v + LON + 1, v + 1, v + 1, v + LON + 1, v + LON + 2);
  }
}

const skyMat = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vDir;
out vec4 outColor;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vDir - vec3(0.0, 3.0, 0.0));
  vec3 col = skyBase(d);
  float s = max(dot(d, SUN_DIR), 0.0);
  col += vec3(1.0, 0.9, 0.7) * smoothstep(0.99965, 0.99985, s) * 9.0; // sun disc
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {},
  side: "double",
  depthWrite: false,
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfe0f2" })
    .add(geometry.custom(
      geometry.define({ positions: domePositions, normals: domeNormals, indices: domeIndices, bounds: { min: [-RADIUS, -RADIUS, -RADIUS], max: [RADIUS, RADIUS, RADIUS] } }),
      { name: "sky-dome", material: skyMat, castShadow: false, receiveShadow: false }
    ))
    .add(geometry.custom(
      geometry.define({ positions, normals, indices, bounds: { min: [-HALF, -1.5, -HALF], max: [HALF, 1.5, HALF] } }),
      { name: "water", material: water, castShadow: false }
    ))
    .camera(camera.perspective({ position: [0, 3, 0], target: [0, 0.9, -60], fov: 55, near: 0.3, far: 1000 }))
});
await app.ready();
(window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
