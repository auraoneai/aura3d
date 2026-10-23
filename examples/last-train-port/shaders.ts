/**
 * GLSL 300 es for the port's custom materials (sky dome, cloud sea, weather points). Uniform names avoid `time`
 * (it lowers to the prelude's `u_time`); the engine prelude supplies `position`, `modelViewProjectionMatrix`,
 * `modelMatrix`, `cameraPosition`.
 */
const HASH = `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

export const SKY_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Gradient between the two towns' sky colours; night mixes in deep blue and a hashed star field. */
export const SKY_FRAGMENT = /* glsl */ `
in vec3 vDir;
out vec4 outColor;
${HASH}
void main() {
  float h = clamp(vDir.y * 1.4 + 0.12, 0.0, 1.0);
  vec3 day = mix(skyHorizon, skyTop, pow(h, 0.65));
  vec3 night = mix(vec3(0.11, 0.15, 0.32), vec3(0.015, 0.025, 0.09), pow(h, 0.5));
  vec3 col = mix(day, night, nightMix);
  float star = step(0.9965, hash31(floor(vDir * 380.0)));
  col += vec3(star) * nightMix * smoothstep(0.1, 0.5, vDir.y);
  outColor = vec4(col, 1.0);
}`;

export const CLOUD_VERTEX = /* glsl */ `
out vec2 vXZ;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vXZ = world.xz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/** Drifting cloud sea under the islands (day cream, night indigo). */
export const CLOUD_FRAGMENT = /* glsl */ `
in vec2 vXZ;
out vec4 outColor;
${HASH}
void main() {
  vec2 p = vXZ * 0.004 + vec2(cloudPhase * 0.02, cloudPhase * 0.013);
  float n = 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.3 + 4.0) + 0.15 * vnoise(p * 5.1 + 9.0);
  vec3 dayCol = mix(vec3(0.86, 0.9, 0.97), vec3(1.0, 0.97, 0.92), n);
  vec3 nightCol = mix(vec3(0.07, 0.1, 0.22), vec3(0.18, 0.22, 0.4), n);
  outColor = vec4(mix(dayCol, nightCol, nightMix), 1.0);
}`;

export const POINTS_VERTEX = /* glsl */ `
attribute float size;
attribute float fade;
out float vFade;
void main() {
  vFade = fade;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_PointSize = size;
}`;

export const POINTS_FRAGMENT = /* glsl */ `
in float vFade;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  outColor = vec4(weatherTint, smoothstep(1.0, 0.0, d) * vFade);
}`;
