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
