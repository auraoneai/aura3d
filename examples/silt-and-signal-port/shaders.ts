/**
 * GLSL 300 es for the port's `material.custom` surfaces.
 *
 * SKY is a port of the original's sky dome (the shader attached to the 2100-radius inside-out
 * sphere in the captured bundle: day gradient from `bottom` to `top`, a night variant with an aurora band
 * and a star field, mixed by `night`). GROUND, WATER, RING and BIKE are stand-ins written for this
 * port: the original's equivalents depend on its terrain generator and GLB assets, which are not
 * reproduced (see PORTING-NOTES.md). Uniforms named `time` would lower to the engine's built-in
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

/** The original's road follows x = 82 + sin(z * 0.006) * 8 (`Tt`). */
const ROAD = /* glsl */ `
float roadX(float z) { return 82.0 + sin(z * 0.006) * 8.0; }
`;

export const GROUND_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const GROUND_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${NOISE}
${ROAD}
void main() {
  float d = abs(vWorld.x - roadX(vWorld.z));
  float grain = fbm(vWorld.xz * 0.045) * 0.5 + fbm(vWorld.xz * 0.31) * 0.25;
  vec3 ground = mix(groundColor * 0.82, groundColor * 1.12, grain);
  float road = 1.0 - smoothstep(9.0, 12.5, d);
  vec3 stone = mix(stoneColor * 0.9, stoneColor * 1.06, fbm(vWorld.xz * 0.9));
  vec3 c = mix(ground, stone, road);
  float edge = smoothstep(11.0, 12.5, d) * (1.0 - smoothstep(12.5, 14.0, d));
  c *= 1.0 - edge * 0.25;
  float fogT = clamp(length(vWorld - cameraPosition) / fogFar, 0.0, 1.0);
  outColor = vec4(mix(c, fogColor, fogT * fogT), 1.0);
}`;

export const WATER_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${NOISE}
${ROAD}
void main() {
  float d = abs(vWorld.x - (roadX(vWorld.z) - 62.0));
  float bank = 1.0 - smoothstep(14.0, 24.0, d);
  if (bank < 0.01) discard;
  vec2 flow = vec2(vWorld.x * 0.12, vWorld.z * 0.05 + siltTime * 0.35);
  float ripple = fbm(flow * 3.0) * 0.6 + fbm(flow * 9.0 + 3.7) * 0.4;
  vec3 c = mix(waterColor * 0.7, waterColor * 1.35, ripple);
  float spark = pow(max(0.0, vnoise(flow * 22.0) - 0.82) * 5.5, 2.0);
  c += vec3(spark) * 0.35;
  float fogT = clamp(length(vWorld - cameraPosition) / fogFar, 0.0, 1.0);
  outColor = vec4(mix(c, fogColor, fogT * fogT), bank * 0.88);
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
  vec3 c = ringColor * (0.55 + 1.6 * rim) * mix(1.0, pulse, ringActive);
  outColor = vec4(c, mix(0.35, 0.95, ringActive));
}`;

export const BIKE_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const BIKE_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  vec3 sun = normalize(vec3(0.45, 0.8, 0.35));
  float lit = max(dot(N, sun), 0.0) * 0.75 + 0.35 * (N.y * 0.5 + 0.5);
  vec3 c = bikeColor * lit + glowColor * glowAmount;
  outColor = vec4(c, 1.0);
}`;
