/**
 * GLSL 300 es for Duneglide's `material.custom` surfaces (paired 1:1 with `shaders-wgsl.ts`).
 *
 * SKY_INK_FRAGMENT paints the vast amber desert sunset & seven-hour atmospheric sky dome;
 * DUNE_SAND_FRAGMENT renders wind-rippled aeolian sand with glancing-angle golden mica sparkle;
 * STRATA_CLIFF_FRAGMENT renders height-banded sedimentary canyon cliffs; WATER and RING drive
 * the oasis canal baseline and additive signal rings. Uniforms use `siltTime` to avoid colliding
 * with Aura3D's built-in `u_time`.
 */

export const SKY_VERTEX = /* glsl */ `
out vec3 skyDirection;
void main() {
  skyDirection = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 skyDirection;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
void main() {
  vec3 dir = normalize(skyDirection);
  float h = smoothstep(-0.12, 0.62, dir.y);
  vec3 day = mix(skyBottom, skyTop, h);
  vec2 cp = dir.xz / max(0.18, dir.y + 0.25) * 1.6;
  float cl = noise(cp * 1.2) * 0.6 + noise(cp * 2.7 + 7.0) * 0.4;
  float dayCloud = smoothstep(0.5, 0.8, cl) * smoothstep(0.02, 0.2, dir.y) * (1.0 - smoothstep(0.55, 0.95, dir.y));
  day = mix(day, mix(vec3(1.0, 0.84, 0.7), skyBottom * 1.15, 0.3), dayCloud * 0.7);
  vec3 dark = mix(vec3(0.013, 0.029, 0.059), vec3(0.002, 0.005, 0.019), h);
  vec2 p = vec2(atan(dir.x, dir.z), asin(dir.y));
  float band = exp(-pow((p.y - 0.16 - sin(p.x * 2.0) * 0.10) * 9.0, 2.0));
  float cloud = noise(dir.xz * 18.0 + dir.y * 7.0) * 0.6 + noise(dir.xz * 43.0 + dir.y * 19.0) * 0.3;
  dark += mix(vec3(0.008, 0.026, 0.085), vec3(0.018, 0.115, 0.096), cloud) * band * 0.65;
  vec2 starP = p * 800.0;
  float sparkle = pow(max(0.0, 1.0 - length(fract(starP) - 0.5) * 2.0), 12.0) * step(0.996, hash(floor(starP)));
  dark += vec3(0.24, 0.36, 0.42) * sparkle * smoothstep(0.04, 0.3, dir.y);
  outColor = vec4(mix(day, dark, skyNight), 1.0);
}`;

/**
 * Vast amber desert sunset & seven-hour poster dome (default inked look; `?look=original` keeps SKY_FRAGMENT).
 * Multi-band atmospheric horizon scattering, Mie solar aureole + crisp sun/moon disc on `sunDir`, wind-sheared
 * cirrus strokes, warm desert dust haze, storm slate deck (`skyStorm`) and night stars (`skyStars`).
 */
export const SKY_INK_FRAGMENT = /* glsl */ `
in vec3 skyDirection;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
void main() {
  vec3 dir = normalize(skyDirection);
  vec3 sd = normalize(sunDir);
  float h = smoothstep(-0.08, 0.72, dir.y);
  vec3 midBand = mix(skyBottom * vec3(1.08, 0.94, 0.82), skyTop, 0.44);
  vec3 c = mix(mix(skyBottom, midBand, smoothstep(-0.06, 0.24, dir.y)), skyTop, smoothstep(0.18, 0.76, dir.y));
  float cosA = dot(dir, sd);
  // Mie forward-scattering golden aureole + broad sunset horizon airlight
  float mie = pow(max(0.0, cosA), 7.0) * exp(-max(0.0, dir.y) * 5.2) * skyGlow * 0.42;
  float glow = pow(max(0.0, cosA), 26.0) * skyGlow + pow(max(0.0, cosA), 4.0) * skyGlow * 0.22 * (1.0 - h) + mie;
  c += sunColor * glow * (1.0 - skyStorm * 0.85);
  float disc = smoothstep(cos(sunSize * 1.1), cos(sunSize * 0.96), cosA);
  c = mix(c, sunColor * 2.65, disc * (1.0 - skyStorm));
  // wind-sheared desert cirrus bands tinted by the solar horizon
  vec2 p = vec2(atan(dir.x, dir.z), dir.y);
  float n = noise(vec2(p.x * 9.0, p.y * 3.0) + 3.1) * 0.68 + noise(vec2(p.x * 21.0 - 1.7, p.y * 7.5)) * 0.32;
  float band1 = exp(-pow((p.y - 0.22 - sin(p.x * 1.5) * 0.04) * 36.0, 2.0));
  float band2 = exp(-pow((p.y - 0.37 - sin(p.x * 2.3 + 1.7) * 0.05) * 50.0, 2.0));
  float band3 = exp(-pow((p.y - 0.13 - cos(p.x * 1.9 - 0.8) * 0.03) * 44.0, 2.0)) * 0.55;
  float cirrus = (band1 + band2 * 0.72 + band3) * smoothstep(0.34, 0.72, n) * skyCirrus;
  c = mix(c, mix(skyBottom, sunColor, 0.52) * 1.12, clamp(cirrus, 0.0, 1.0) * 0.78);
  // shimmering desert horizon dust veil
  float dust = exp(-pow(dir.y * 9.5, 2.0)) * (0.72 + 0.28 * noise(vec2(p.x * 14.0, dir.y * 6.0))) * skyDust;
  c = mix(c, mix(skyBottom, sunColor, 0.22) * vec3(1.08, 0.98, 0.86), clamp(dust, 0.0, 1.0) * 0.66);
  // storm cover: slate deck lifting into a luminous horizon gap
  float deck = noise(dir.xz / max(0.15, dir.y + 0.3) * 2.2) * 0.6 + noise(dir.xz / max(0.15, dir.y + 0.3) * 5.1) * 0.4;
  c = mix(c, mix(skyTop, skyBottom, 0.2) * (0.62 + 0.45 * deck), skyStorm * smoothstep(0.03, 0.42, dir.y) * 0.85);
  // crisp night starfield
  vec2 starP = vec2(atan(dir.x, dir.z), asin(dir.y)) * 800.0;
  float sparkle = pow(max(0.0, 1.0 - length(fract(starP) - 0.5) * 2.0), 12.0) * step(0.996, hash(floor(starP)));
  c += vec3(0.55, 0.62, 0.78) * sparkle * smoothstep(0.04, 0.3, dir.y) * skyStars;
  c += vec3(0.82, 0.86, 1.0) * skyFlash * (0.35 + 0.65 * smoothstep(-0.05, 0.45, dir.y));
  outColor = vec4(c, 1.0);
}`;

const NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

/** The road follows x = 82 + sin(z * 0.006) * 8; generated chapters run their canal 62 m west of it (`canalShift`). */
const ROAD = /* glsl */ `
float roadX(float z) { return 82.0 + sin(z * 0.006) * 8.0; }
`;

export const WATER_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const WATER_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${NOISE}
${ROAD}
void main() {
  float d = abs(vWorld.x - (roadX(vWorld.z) - canalShift));
  vec2 flow = vec2(vWorld.x * 0.12, vWorld.z * 0.05 + siltTime * 0.35);
  float ripple = fbm(flow * 3.0) * 0.6 + fbm(flow * 9.0 + 3.7) * 0.4;
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
  vec3 body = mix(waterColor * 0.55, waterColor * 1.3, ripple);
  vec3 skyTint = mix(waterColor * 1.7, vec3(0.78, 0.86, 0.9), 0.55);
  vec3 c = mix(body, skyTint, fres * 0.6);
  float glint = pow(max(0.0, vnoise(flow * 24.0 + siltTime * 0.4) - 0.8) * 5.0, 2.0);
  c += vec3(1.0, 0.92, 0.78) * glint * 0.5;
  float foam = smoothstep(canalHalf - 4.5, canalHalf - 1.2, d) * (0.45 + 0.55 * vnoise(flow * 15.0));
  c = mix(c, vec3(0.93, 0.95, 0.9), foam * 0.7);
  if (inkLook > 0.5) {
    vec3 n = normalize(vec3((ripple - 0.5) * 0.35, 1.0, (fbm(flow * 5.0 + 1.3) - 0.5) * 0.35));
    vec3 r = reflect(-view, n);
    float sd = max(0.0, dot(r, normalize(sunDir)));
    float spec = pow(sd, 420.0);
    vec3 skyRef = mix(inkSky, inkSkyTop, smoothstep(0.02, 0.55, r.y));
    c = mix(c, skyRef, 0.28 + fres * 0.5);
    c += sunColor * (spec * 1.4 + pow(sd, 36.0) * 0.32 * (0.6 + 0.8 * ripple));
    float streak = smoothstep(0.62, 0.9, vnoise(vec2(vWorld.x * 0.6, vWorld.z * 0.02 + siltTime * 0.9)));
    c = mix(c, vec3(0.86, 0.78, 0.62), streak * 0.18 + foam * 0.12);
  }
  float fogT = clamp(length(vWorld - cameraPosition) / fogFar, 0.0, 1.0);
  float alpha = 0.92 * (1.0 - smoothstep(canalHalf - 1.2, canalHalf, d));
  outColor = vec4(mix(c, fogColor, fogT * fogT), alpha);
}`;

export const RING_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const RING_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  float rim = pow(1.0 - abs(dot(N, normalize(cameraPosition - vWorld))), 1.6);
  float pulse = 0.65 + 0.35 * sin(siltTime * 3.0 + vWorld.z * 0.05);
  vec3 c = ringColor * (0.3 + 0.8 * rim) * mix(1.0, pulse, ringActive);
  outColor = vec4(c, mix(0.3, 0.85, ringActive));
}`;

/**
 * Wind-rippled desert dune sand & sparkling mineral mica-glint shader (paired 1:1 with `DUNE_SAND_*_WGSL`).
 * Draws analytical aeolian wind ripples, warm sunlit crest vs cool dusk trough shading, and glancing-angle HDR
 * mica sparkles across open dunes while feathering cleanly around paved plazas, roads, and the oasis canal.
 */
export const DUNE_SAND_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const DUNE_SAND_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${NOISE}
${ROAD}
void main() {
  vec3 L = normalize(sunDir);
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  float warp = fbm(vWorld.xz * 0.045);
  float ripA = sin(vWorld.x * 2.15 + vWorld.z * 0.68 + warp * 5.6);
  float ripB = sin(vWorld.x * 0.92 - vWorld.z * 1.85 + fbm(vWorld.xz * 0.09 + 4.3) * 3.8);
  float ripple = ripA * 0.68 + ripB * 0.32;
  float ripFade = 1.0 - smoothstep(45.0, 260.0, dist);
  vec3 N = normalize(vNormal + vec3(cos(vWorld.x * 2.15 + vWorld.z * 0.68 + warp * 5.6) * 0.22, 0.0, ripB * 0.11) * ripFade);
  float ndl = clamp(dot(N, L), 0.0, 1.0);
  float crest = smoothstep(-0.35, 0.65, ripple);
  vec3 sandBase = mix(sandShadow, mix(sandSlope, sandCrest, crest), smoothstep(0.02, 0.78, ndl * 0.85 + 0.15));
  // grazing velvet desert sheen on backlit dune ridges
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
  sandBase += sunColor * fres * (0.14 + 0.18 * max(0.0, dot(-V, L)));
  // sparkling mineral mica-glints on sunlit dune slopes
  vec3 H = normalize(L + V);
  float spec = pow(max(0.0, dot(N, H)), 24.0);
  float g1 = hash21(floor(vWorld.xz * 24.0));
  float g2 = hash21(floor(vWorld.xz * 39.0 + vec2(13.7, 7.9)));
  float twinkle = 0.5 + 0.5 * sin(g1 * 62.83 + siltTime * 2.6 + dot(vWorld.xz, V.xz) * 4.5);
  float mica = (step(0.968, g1) + step(0.982, g2) * 0.85) * twinkle * (0.35 + 1.65 * spec) * smoothstep(0.06, 0.45, ndl) * (1.0 - smoothstep(18.0, 185.0, dist));
  vec3 c = sandBase + mix(vec3(1.0, 0.93, 0.78), sunColor, 0.45) * mica * 1.85;
  float fogT = clamp(dist / fogFar, 0.0, 1.0);
  c = mix(c, fogColor, fogT * fogT * 0.88);
  float alpha = 1.0;
  if (duneVeil > 0.5) {
    float rx = roadX(vWorld.z);
    float clearRoad = smoothstep(9.5, 17.5, abs(vWorld.x - rx));
    float clearCanal = smoothstep(canalHalf + 1.0, canalHalf + 8.5, abs(vWorld.x - (rx - canalShift)));
    float clearPlaza = 1.0 - (1.0 - smoothstep(-145.0, -95.0, vWorld.z)) * (1.0 - smoothstep(78.0, 128.0, abs(vWorld.x))) * step(-95.0, vWorld.z);
    float slopeMask = smoothstep(0.45, 0.82, N.y);
    float nearFade = 1.0 - smoothstep(220.0, 520.0, dist);
    alpha = clamp((0.34 + 0.22 * crest + min(0.44, mica * 0.75)) * clearRoad * clearCanal * clearPlaza * slopeMask * nearFade, 0.0, 0.92);
  }
  outColor = vec4(c, alpha);
}`;

/**
 * Paired GLSL 300 es + WGSL height-banded sedimentary canyon cliff material (`cliffs` in inked look).
 * Replaces flat stretched rock textures with stratified sandstone, terracotta, ochre, and umber layers.
 */
export const STRATA_CLIFF_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const STRATA_CLIFF_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${NOISE}
void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(sunDir);
  vec3 V = normalize(cameraPosition - vWorld);
  float warp = (fbm(vec2(vWorld.x * 0.05 + vWorld.z * 0.05, vWorld.y * 0.08)) - 0.5) * 2.2;
  float grain = fbm(vec2(vWorld.x * 0.35 - vWorld.z * 0.28, vWorld.y * 0.65)) - 0.5;
  float f = vWorld.y * 0.34 + warp * 0.85;
  float layer = floor(f);
  float within = f - layer;
  float m = mod(layer, 4.0);
  vec3 b0 = vec3(0.56, 0.29, 0.17);
  vec3 b1 = vec3(0.74, 0.46, 0.27);
  vec3 b2 = vec3(0.42, 0.22, 0.15);
  vec3 b3 = vec3(0.84, 0.62, 0.39);
  vec3 albedo = m < 0.5 ? b0 : (m < 1.5 ? b1 : (m < 2.5 ? b2 : b3));
  float seam = smoothstep(0.0, 0.08, within) * (1.0 - smoothstep(0.92, 1.0, within));
  albedo *= (0.68 + 0.32 * seam) * (1.0 + grain * 0.28);
  // wind-blown sand talus on flat canyon ledges and cliff tops
  float ledge = smoothstep(0.68, 0.88, N.y);
  albedo = mix(albedo, sandCap * (0.94 + grain * 0.2), ledge);
  float ndl = clamp(dot(N, L), 0.0, 1.0);
  float hemi = 0.34 + 0.28 * (0.5 * N.y + 0.5);
  float rim = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0) * 0.18;
  vec3 lit = albedo * (skyAmbient * hemi + sunColor * (ndl * 0.92)) + sunColor * rim;
  float fogT = clamp(length(cameraPosition - vWorld) / fogFar, 0.0, 1.0);
  outColor = vec4(mix(lit, fogColor, fogT * fogT * 0.9), 1.0);
}`;
