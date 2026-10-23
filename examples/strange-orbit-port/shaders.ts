/**
 * GLSL for the port's `material.custom` surfaces. The original patched three's
 * MeshStandardMaterial through `onBeforeCompile` and sampled a remote
 * `impasto.png`; here the same pigment mixing runs in a self-contained shader
 * with a procedural impasto texture, and the original's hemisphere + two
 * directional lights are evaluated inline (custom materials are unlit).
 * Sources use GLSL 300 es varyings and GLSL1 `attribute` for author attributes.
 */

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

/** The original's hemisphere (1.65) + key (2.15) + fill (0.95) lights, then exposure 1.2. */
const LIGHTING = /* glsl */ `
vec3 shade(vec3 albedo, vec3 N, vec3 emissive) {
  vec3 key = normalize(vec3(150.0, 280.0, -150.0));
  vec3 fill = normalize(vec3(-140.0, 80.0, 210.0));
  vec3 skyC = vec3(0.973, 0.831, 0.627);
  vec3 groundC = vec3(0.184, 0.223, 0.343);
  vec3 hemi = mix(groundC, skyC, N.y * 0.5 + 0.5) * 1.65;
  vec3 keyC = vec3(1.0, 0.815, 0.604) * 2.15 * max(dot(N, key), 0.0);
  vec3 fillC = vec3(0.508, 0.584, 0.737) * 0.95 * max(dot(N, fill), 0.0);
  return albedo * (hemi + keyC + fillC) * (1.2 / 3.14159265) + emissive;
}
`;

export const TRACK_VERTEX = /* glsl */ `
attribute vec3 pigmentBase;
attribute vec3 pigmentVein;
attribute vec3 pigmentChalk;
attribute float paintOriginal;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec3 vBase;
out vec3 vVein;
out vec3 vChalk;
out float vOriginal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  vBase = pigmentBase;
  vVein = pigmentVein;
  vChalk = pigmentChalk;
  vOriginal = paintOriginal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const TRACK_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec3 vBase;
in vec3 vVein;
in vec3 vChalk;
in float vOriginal;
out vec4 outColor;
${NOISE}
${LIGHTING}
void main() {
  // Procedural stand-in for impasto.png: warm paint with brush streaks along the track.
  vec2 q = vec2(vUv.x * 90.0, vUv.y * 9.0);
  float streak = fbm(q + vec2(fbm(q * 0.35) * 4.0, 0.0));
  float grain = vnoise(q * 6.0);
  vec3 sampled = mix(vec3(0.50, 0.36, 0.30), vec3(0.93, 0.74, 0.58), streak) * (0.9 + 0.2 * grain);
  float lum = dot(sampled, vec3(0.2126, 0.7152, 0.0722));
  float warm = smoothstep(-0.005, 0.12, sampled.r - sampled.g);
  vec3 pigment = mix(vVein, vBase, warm);
  pigment = mix(pigment, vChalk, smoothstep(0.29, 0.73, lum) * 0.84);
  vec3 original = sampled;
  float warmMask = smoothstep(0.015, 0.18, original.r - original.g);
  original = mix(original, vec3(0.56, 0.285, 0.245) * (0.65 + lum), warmMask * 0.38);
  original = mix(original, vec3(lum), 0.09);
  original *= mix(vec3(0.94), vec3(0.88, 0.67, 0.55), warmMask);
  vec3 albedo = mix(pigment * (0.24 + 1.38 * pow(max(0.0, lum), 0.65)), original, vOriginal);
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  vec3 emissive = albedo * (0.1 * (1.0 - vOriginal));
  outColor = vec4(shade(albedo, N, emissive), 1.0);
}`;

/** Opal / mineral surfaces: strata banding with an iridescent tint (the original's `Mf`). */
export const MINERAL_VERTEX = /* glsl */ `
out vec3 vObject;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vObject = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const MINERAL_FRAGMENT = /* glsl */ `
in vec3 vObject;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${LIGHTING}
void main() {
  float strata = sin(vObject.y * 3.6 + sin(vObject.z * 1.8) * 1.1 + sin(vObject.x * 2.1));
  float fine = sin(vObject.y * 37.0 + sin(vObject.z * 11.0) * 1.6);
  vec3 albedo = baseColor * (0.9 + 0.08 * strata + 0.02 * fine);
  if (opal > 0.5) albedo *= mix(vec3(0.64, 0.88, 1.0), vec3(1.0, 0.69, 0.86), strata * 0.5 + 0.5);
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  float glow = opal > 0.5 ? 0.17 : 0.025;
  outColor = vec4(shade(albedo, N, albedo * glow), 1.0);
}`;

/** Flat or lit solid colour (riders, rocks, pillars, planet bands). */
export const SOLID_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vObject;
out vec3 vWorld;
void main() {
  vObject = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SOLID_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vObject;
in vec3 vWorld;
out vec4 outColor;
${NOISE}
${LIGHTING}
void main() {
  vec3 albedo = baseColor;
  if (banding > 0.0) {
    float b = fbm(vec2(vObject.y * banding, vObject.x * banding * 0.4 + vObject.z * banding * 0.3));
    albedo = mix(baseColor, glowColor, b * 0.9);
  }
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  vec3 emissive = glowColor * glow * (banding > 0.0 ? 0.0 : 1.0);
  outColor = vec4(shade(albedo, N, emissive), 1.0);
}`;

/** Additive checkpoint veil (ported from the original gate `ShaderMaterial`; uv.y runs up the 13 m curtain). */
export const VEIL_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const VEIL_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float y = vUv.y * 13.0;
  float t = clamp((y + 0.6) / 13.5, 0.0, 1.0);
  float z = (vUv.x - 0.5) * 23.0;
  float edge = 10.1 - 8.3 * t * t - (1.3 * pow(1.0 - t, 0.55) + 0.1);
  float mask = 1.0 - smoothstep(edge - 0.35, edge, abs(z));
  float stream = pow(max(0.0, sin(z * 8.0 + sin(y * 0.65 - veilTime) * 1.1 - veilTime * 0.4)), 30.0);
  float rim = exp(-pow((abs(z) - edge + 0.25) * 3.0, 2.0));
  float alpha = (stream * 0.09 + rim * 0.4) * mask * smoothstep(0.0, 0.7, y) * (1.0 - smoothstep(11.5, 13.0, y));
  outColor = vec4(mix(vec3(0.48, 0.79, 1.0), vec3(1.0, 0.75, 0.3), 0.65 + 0.35 * sin(veilTime + y)), alpha * (1.0 + veilPulse * 2.0));
}`;

/** Round glowing points with a per-point `size` (stars, stardust, exhaust). */
export const POINTS_VERTEX = /* glsl */ `
attribute float size;
attribute vec3 tint;
attribute float fade;
out vec3 vTint;
out float vFade;
void main() {
  vTint = tint;
  vFade = fade;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_PointSize = size;
}`;

export const POINTS_FRAGMENT = /* glsl */ `
in vec3 vTint;
in float vFade;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float soft = smoothstep(1.0, 0.0, d);
  outColor = vec4(vTint * (additive > 0.5 ? 1.4 : 1.0), soft * vFade);
}`;
