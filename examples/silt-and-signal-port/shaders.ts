/**
 * GLSL 300 es for the port's `material.custom` surfaces.
 *
 * SKY is a port of the original's sky dome (the shader attached to the 2100-radius inside-out
 * sphere in the captured bundle: day gradient from `bottom` to `top`, a night variant with an aurora band
 * and a star field, mixed by `night`). WATER and RING are written for this port; terrain, props and the rider
 * are lit PBR surfaces (see world.ts). Uniforms named `time` would lower to the engine's built-in
 * `u_time`, so the port uses `siltTime`.
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
 * GU47 DG-S1: the inked poster sky (default look; `?look=original` keeps SKY_FRAGMENT). A gradient from `skyBottom` to
 * `skyTop`, a sun or moon disc with a soft glow on `sunDir` (the same vector as the shadowed key and the water glint),
 * two thin inked cirrus bands, a warm horizon dust band, storm cover (`skyStorm`) and stars at night (`skyStars`).
 * One program for all seven chapters; only uniforms change.
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
  float h = smoothstep(-0.08, 0.7, dir.y);
  vec3 c = mix(skyBottom, skyTop, h);
  float cosA = dot(dir, sd);
  // horizon glow toward the key, then the disc with a hard inked edge
  float glow = pow(max(0.0, cosA), 24.0) * skyGlow + pow(max(0.0, cosA), 4.0) * skyGlow * 0.18 * (1.0 - h);
  c += sunColor * glow * (1.0 - skyStorm * 0.85);
  float disc = smoothstep(cos(sunSize * 1.08), cos(sunSize), cosA);
  c = mix(c, sunColor * 2.4, disc * (1.0 - skyStorm));
  // two thin cirrus bands, broken by noise (the poster's brush strokes)
  vec2 p = vec2(atan(dir.x, dir.z), dir.y);
  float n = noise(vec2(p.x * 9.0, p.y * 3.0) + 3.1);
  float band1 = exp(-pow((p.y - 0.24 - sin(p.x * 1.5) * 0.04) * 38.0, 2.0));
  float band2 = exp(-pow((p.y - 0.38 - sin(p.x * 2.3 + 1.7) * 0.05) * 52.0, 2.0));
  float cirrus = (band1 + band2 * 0.7) * smoothstep(0.35, 0.7, n) * skyCirrus;
  c = mix(c, mix(skyBottom, sunColor, 0.45) * 1.08, clamp(cirrus, 0.0, 1.0) * 0.75);
  // horizon dust band: warm, low, always a little moving with the sand
  float dust = exp(-pow(dir.y * 11.0, 2.0)) * (0.75 + 0.25 * noise(vec2(p.x * 14.0, 0.0))) * skyDust;
  c = mix(c, skyBottom * vec3(1.06, 0.98, 0.88), clamp(dust, 0.0, 1.0) * 0.6);
  // storm cover: a slate deck over the dome that lifts into a bright gap just above the horizon (storm light), so the
  // dark horizon ridges stand against light instead of a pale band under a dark lid
  float deck = noise(dir.xz / max(0.15, dir.y + 0.3) * 2.2) * 0.6 + noise(dir.xz / max(0.15, dir.y + 0.3) * 5.1) * 0.4;
  c = mix(c, mix(skyTop, skyBottom, 0.2) * (0.62 + 0.45 * deck), skyStorm * smoothstep(0.03, 0.42, dir.y) * 0.85);
  // stars at night
  vec2 starP = vec2(atan(dir.x, dir.z), asin(dir.y)) * 800.0;
  float sparkle = pow(max(0.0, 1.0 - length(fract(starP) - 0.5) * 2.0), 12.0) * step(0.996, hash(floor(starP)));
  c += vec3(0.5, 0.56, 0.7) * sparkle * smoothstep(0.04, 0.3, dir.y) * skyStars;
  // DG-S5 lightning: the storm deck lights up from above for < 200 ms (0 outside the storm chapter)
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

/** The original's road follows x = 82 + sin(z * 0.006) * 8 (`Tt`); the generated chapters run their canal 62 m west of it, chapters 0 and 6 along it (`canalShift`). */
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
  // GU47 DG-M3 (inked look only; inkLook = 0 is today's water): fresnel toward the chapter sky, a sun glint on the
  // key vector the sky disc uses, silt foam and flow streaks along the canal
  if (inkLook > 0.5) {
    vec3 n = normalize(vec3((ripple - 0.5) * 0.35, 1.0, (fbm(flow * 5.0 + 1.3) - 0.5) * 0.35));
    vec3 r = reflect(-view, n);
    float spec = pow(max(0.0, dot(r, normalize(sunDir))), 420.0);
    c = mix(c, inkSky, fres * 0.3);
    c += sunColor * spec * 1.2;
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
