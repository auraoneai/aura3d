/**
 * GLSL 300 es for the port's `material.custom` surfaces (custom materials are unlit, so the original's hemisphere +
 * sun lighting is evaluated inline from the Vesper Heights `lighting` block). The original authored these as three.js
 * TSL node materials (49 live, 7 with `normalNode`); `material.node` has no scene-light access, so they are hand-ported
 * here to GLSL as the R-24 decision requires. See PORTING-NOTES.md for the node-to-GLSL mapping.
 *

 * Authored uniforms (fogColor, sunDir, baseColor, ...) are declared by the engine prelude from the material spec,
 * so the sources below never declare them.
 *
 * Fog: the original uses exponential height fog (`atmosphere`: density 0.0004, hDensity 0.0022, hBase 18, hFalloff
 * 0.031, maxFog 0.96) tinted by the district's fog colour; `fogMix()` below evaluates the same model.
 */

const COMMON = /* glsl */ `
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
// original atmosphere: density 0.0004, hDensity 0.0022, hBase 18, hFalloff 0.031, maxFog 0.96
vec3 applyFog(vec3 color, vec3 world) {
  float dist = length(world - cameraPosition);
  float height = max(0.0, world.y - 18.0);
  float amount = 1.0 - exp(-(0.0004 * dist + 0.0022 * dist * exp(-0.031 * height)));
  return mix(color, fogColor, min(amount, 0.96));
}
vec3 lit(vec3 albedo, vec3 N) {
  vec3 hemi = mix(groundAmbient, skyAmbient, N.y * 0.5 + 0.5);
  float ndl = max(dot(N, normalize(sunDir)), 0.0);
  return albedo * (hemi + sunColor * ndl) * 0.26;
}
`;

export const ROAD_VERTEX = /* glsl */ `
attribute vec3 roadColor;
attribute vec2 roadUv;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vRoad;
out vec2 vRoadUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  vRoad = roadColor;
  vRoadUv = roadUv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const ROAD_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vRoad;
in vec2 vRoadUv;
out vec4 outColor;
${COMMON}
void main() {
  float u = vRoadUv.x;      // -1..1 across the road
  float s = vRoadUv.y;      // metres along the track
  vec3 N = normalize(vNormal);
  vec3 asphalt = vec3(0.30, 0.31, 0.33) * (0.55 + 0.35 * fbm(vec2(u * 6.0, s * 0.18)));
  float edge = smoothstep(0.90, 0.965, abs(u));
  float edgeCore = smoothstep(0.955, 0.985, abs(u)) * (1.0 - smoothstep(0.985, 1.0, abs(u)));
  float dash = step(0.5, fract(s / 14.0)) * (1.0 - smoothstep(0.0, 0.03, abs(u)));
  float seam = 1.0 - smoothstep(0.0, 0.012, 0.5 - abs(fract(s / 40.0) - 0.5));
  vec3 neon = mix(vRoad, vec3(0.85, 0.95, 1.0), 0.75) * (1.0 + 0.2 * sin(u_time * 2.0 + s * 0.05));
  vec3 color = lit(asphalt, N);
  color += neon * (edge * 0.12 + edgeCore * 0.9);
  color += vec3(0.75, 0.9, 1.0) * dash * 0.55;
  color += vRoad * seam * 0.08;
  outColor = vec4(applyFog(color, vWorld), 1.0);
}`;

export const SOLID_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SOLID_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;
${COMMON}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 hot = vec3(1.0, 0.42, 0.08);
  vec3 color = lit(mix(baseColor, hot * 0.8, heat * 0.55), N);
  color += glowColor * glow * (0.85 + 0.15 * sin(u_time * 5.0));
  color += hot * heat * (0.35 + rim * 1.4);
  color += vec3(1.0, 0.9, 0.7) * flash;
  outColor = vec4(applyFog(color, vWorld), 1.0);
}`;

export const VEIL_VERTEX = /* glsl */ `
out vec3 vWorld;
out vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Additive checkpoint gate and boost-pad glow. `veilTime`/`veilPulse` avoid the reserved `time`/`pulse` lowering to u_time. */
export const VEIL_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float band = veilMode > 0.5
    ? (1.0 - smoothstep(0.55, 1.0, max(abs(c.x), abs(c.y)))) * (0.45 + 0.25 * sin(u_time * 6.0 - c.y * 5.0))
    : (1.0 - smoothstep(0.0, 1.0, abs(c.x))) * (0.25 + 0.15 * sin(u_time * 4.0 + c.y * 9.0));
  float a = band * (0.5 + veilPulse);
  outColor = vec4(veilColor * a, a);
}`;

export const SKY_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 clip = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_Position = clip;
}`;

/** Aurora sky, planet and moon from the map's `lighting.sky`. */
export const SKY_FRAGMENT = /* glsl */ `
in vec3 vDir;
out vec4 outColor;
${COMMON}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sky = h > 0.0 ? mix(horizon, mix(midColor, zenith, smoothstep(0.15, 0.85, h)), smoothstep(0.0, 0.45, h)) : mix(horizon, vec3(0.06, 0.16, 0.19), smoothstep(0.0, 0.3, -h));
  float band = smoothstep(0.02, 0.30, h) * (1.0 - smoothstep(0.30, 0.70, h));
  float curtain = fbm(vec2(atan(d.z, d.x) * 3.0 + u_time * 0.04, h * 6.0));
  vec3 aurora = mix(vec3(0.15, 1.0, 0.7), vec3(0.6, 0.35, 1.0), smoothstep(0.1, 0.6, h)) * band * pow(curtain, 2.0) * 1.35;
  float sun = pow(max(dot(d, normalize(sunDir)), 0.0), 220.0);
  float planetMask = 1.0 - smoothstep(0.165, 0.17, acos(clamp(dot(d, normalize(planetDir)), -1.0, 1.0)));
  vec3 planet = mix(vec3(0.20, 0.12, 0.30), vec3(0.55, 0.38, 0.55), fbm(d.xz * 9.0 + d.y * 4.0)) * planetMask;
  float moonMask = 1.0 - smoothstep(0.022, 0.026, acos(clamp(dot(d, normalize(moonDir)), -1.0, 1.0)));
  vec2 g = floor(d.xz * 700.0 + d.y * 300.0);
  float star = step(0.9985, hash21(g)) * smoothstep(0.0, 0.3, h);
  vec3 color = sky + aurora + sunColor * sun * 0.35 + glowColor * 0.1 * (1.0 - abs(h)) + planet * 0.9 + vec3(1.0, 1.1, 1.5) * moonMask + vec3(star);
  outColor = vec4(color, 1.0);
}`;

export const POINTS_VERTEX = /* glsl */ `
attribute float size;
attribute float fade;
attribute vec3 tint;
out float vFade;
out vec3 vTint;
void main() {
  vFade = fade;
  vTint = tint;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_PointSize = size;
}`;

export const POINTS_FRAGMENT = /* glsl */ `
in float vFade;
in vec3 vTint;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a = (1.0 - smoothstep(0.0, 1.0, length(c))) * vFade;
  outColor = vec4(vTint * a, a);
}`;
