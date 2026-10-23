/**
 * GLSL 300 es for the port. The original had 67 live ShaderMaterial instances built from a
 * handful of `onBeforeCompile` patches (sprite wind sway, painted ground, water, haze, jetty
 * grain). The port maps them to four parameterised `material.custom` programs, below.
 *
 *   WIND_*   foliage cards: grass, flowers, ferns, shrubs, reeds, tree billboards (sway by `sway` attr)
 *   PAINT_*  ground and sea: vertex-tinted, lambert-lit, painted noise
 *   SOLID_*  props (cottage, windmill, oak, fences, jetty, bell, letters, player): flat lit colour
 *   HAZE_*   the original's drifting mist ribbons (vUv noise, alpha)
 */

const LIGHT = /* glsl */ `
vec3 shade(vec3 albedo, vec3 n, vec3 emissive) {
  vec3 sun = normalize(vec3(-0.35, 0.82, -0.45));
  float lam = clamp(dot(n, sun) * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = vec3(0.68, 0.80, 0.92);
  vec3 ground = vec3(0.42, 0.38, 0.28);
  vec3 amb = mix(ground, sky, n.y * 0.5 + 0.5);
  return albedo * (amb * 0.62 + vec3(1.0, 0.95, 0.82) * lam * 0.58) + emissive;
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

export const WIND_VERTEX = /* glsl */ `
attribute vec3 tint;
attribute float sway;
attribute float phase;
out vec3 vTint;
out vec2 vUv;
out vec3 vWorld;
void main() {
  vTint = tint;
  vUv = uv;
  vec3 p = position;
  float w = windTime * 1.6 + phase;
  p.x += sin(w) * sway * uv.y * windStrength;
  p.z += cos(w * 0.73 + phase) * sway * 0.6 * uv.y * windStrength;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

export const WIND_FRAGMENT = /* glsl */ `
in vec3 vTint;
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
${LIGHT}
void main() {
  // soft leaf-blade card: narrow at the tip, painted edge noise
  float widthAtY = mix(0.5, 0.06, vUv.y);
  float edge = abs(vUv.x - 0.5);
  float n = vnoise(vWorld.xz * 3.0 + vUv * 4.0);
  if (edge > widthAtY * (0.8 + 0.4 * n)) discard;
  vec3 base = vTint * (0.78 + 0.28 * vUv.y);
  outColor = vec4(shade(base, vec3(0.0, 1.0, 0.0), vec3(0.0)), 1.0);
}`;

export const PAINT_VERTEX = /* glsl */ `
attribute vec3 tint;
out vec3 vTint;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vTint = tint;
  vNormal = normalize(normalMatrix * normal);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const PAINT_FRAGMENT = /* glsl */ `
in vec3 vTint;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${LIGHT}
void main() {
  float brush = vnoise(vWorld.xz * 0.9) * 0.6 + vnoise(vWorld.xz * 3.1) * 0.4;
  vec3 albedo = vTint * (0.86 + 0.26 * brush) * tintScale;
  vec3 n = normalize(vNormal);
  outColor = vec4(shade(albedo, n, vec3(0.0)), 1.0);
}`;

export const SEA_FRAGMENT = /* glsl */ `
in vec3 vTint;
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
${LIGHT}
void main() {
  float ripple = vnoise(vWorld.xz * 0.35 + vec2(windTime * 0.08, -windTime * 0.05));
  vec3 deep = vec3(0.20, 0.45, 0.58);
  vec3 shallow = vec3(0.48, 0.74, 0.74);
  vec3 col = mix(deep, shallow, ripple * 0.7);
  outColor = vec4(col, 0.94);
}`;

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
${LIGHT}
void main() {
  vec3 n = normalize(vNormal);
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
  float grain = vnoise(vObject.xy * 7.0 + vObject.zz * 3.0);
  vec3 albedo = baseColor * (0.92 + 0.14 * grain);
  outColor = vec4(shade(albedo, n, glowColor * glow), 1.0);
}`;

export const HAZE_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const HAZE_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
${LIGHT}
void main() {
  vec2 p = vec2(vUv.x * 15.0 - windTime * 0.035 + hazePhase, vUv.y * 3.0 + hazePhase);
  float n = 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.1 + windTime * 0.013);
  float edge = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
  float height = smoothstep(0.0, 0.16, vUv.y) * (1.0 - smoothstep(0.40, 1.0, vUv.y));
  float a = edge * height * (0.3 + n * 0.7) * hazeOpacity;
  outColor = vec4(hazeColor, a);
}`;
