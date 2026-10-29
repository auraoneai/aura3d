/**
 * GLSL 300 es for the port's `material.custom` surfaces. The original draws everything with three's
 * `MeshToonMaterial` under one hemisphere light and two directional lights; the toon ramp below is three's
 * default (no gradient map): `mix(0.7, 1.0, smoothstep(0.7 - fw, 0.7 + fw, dot(N, L) * 0.5 + 0.5))` with
 * `fw = fwidth(coord) * 0.5`. Light intensities carry three's legacy factor of pi, which the Lambert
 * 1/pi cancels, so the effective strengths are 0.55 (hemisphere), 0.65 and 0.25 (directionals).
 * Colours are linear; the engine encodes to sRGB on output.
 */

export const TOON_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const SRGB = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}`;

/** Same as TOON_VERTEX plus a per-vertex `tone` (linear RGB) for the merged batches (gates, splatters, particles, clouds). */
export const TOON_TONE_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
out vec3 vTone;
void main() {
  vUv = uv;
  vTone = tone;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/**
 * P-01: the toon terms add up to about 1.2 on up-facing surfaces, and with tone mapping off that clipped a fifth of the
 * frame (the deck, clouds and gate tops) to pure white. Values up to SHOULDER pass unchanged; above it they roll off
 * towards 1 so the brightest surfaces keep their speckles and edges.
 */
const SHOULDER = /* glsl */ `
vec3 shoulder(vec3 c) {
  const float k = 0.82;
  vec3 over = max(c - k, vec3(0.0));
  return min(c, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}`;

export const toonFragment = (withMap: boolean, withTone = false): string => /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
${withTone ? "in vec3 vTone;" : ""}
out vec4 outColor;
${SRGB}
${SHOULDER}
float ramp(float d) {
  float c = d * 0.5 + 0.5;
  float fw = fwidth(c) * 0.5;
  return mix(0.7, 1.0, smoothstep(0.7 - fw, 0.7 + fw, c));
}
void main() {
  vec3 N = normalize(vNormal);
  if (dot(N, cameraPosition - vWorld) < 0.0) N = -N;
  vec3 base = baseColor;
${withTone ? "base *= vTone;" : ""}
${withMap ? "base *= srgbToLinear(texture(map, vUv).rgb);" : ""}
  vec3 sky = vec3(1.0);
  vec3 ground = vec3(0.1845, 0.2462, 0.4020); // #7788aa
  vec3 hemi = mix(ground, sky, 0.5 * N.y + 0.5) * 0.55;
  vec3 L1 = normalize(vec3(6.0, 12.0, 6.0));
  vec3 L2 = normalize(vec3(-6.0, 8.0, -6.0));
  vec3 fill = vec3(0.3185, 0.4969, 1.0); // #99bbff
  vec3 lit = hemi + vec3(0.65) * ramp(dot(N, L1)) + fill * 0.25 * ramp(dot(N, L2));
  outColor = vec4(shoulder(base * lit) + emissive, alpha);
}`;

/** The original's 2x512 vertical canvas gradient sky, evaluated analytically per view direction. */
export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SRGB}
void main() {
  float y = normalize(vWorld - cameraPosition).y;
  float t = clamp(0.5 - y * 0.5, 0.0, 1.0); // canvas v: top of the sky = 0
  vec3 c0 = srgbToLinear(vec3(0.0902, 0.4510, 0.7529)); // #1773c0
  vec3 c1 = srgbToLinear(vec3(0.2471, 0.6902, 0.9020)); // #3fb0e6
  vec3 c2 = srgbToLinear(vec3(0.4745, 0.8078, 0.9412)); // #79cef0
  vec3 c3 = srgbToLinear(vec3(0.6627, 0.8784, 0.9686)); // #a9e0f7
  vec3 c = mix(c0, c1, smoothstep(0.0, 0.45, t));
  c = mix(c, c2, smoothstep(0.45, 0.75, t));
  c = mix(c, c3, smoothstep(0.75, 1.0, t));
  outColor = vec4(c, 1.0);
}`;

/** Unlit white with an alpha uniform: speed streaks and the shield bubble. */
export const FLAT_VERTEX = /* glsl */ `
void main() { gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`;

export const FLAT_FRAGMENT = /* glsl */ `
out vec4 outColor;
void main() { outColor = vec4(baseColor, alpha); }`;

/** Flat colour times a per-vertex `tone`: the gate and ball colour symbols (white disc, dark mark) and the guide ring. */
export const FLAT_TONE_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vTone;
void main() {
  vTone = tone;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const FLAT_TONE_FRAGMENT = /* glsl */ `
in vec3 vTone;
out vec4 outColor;
void main() { outColor = vec4(baseColor * vTone, alpha); }`;

/** Round shadow with a crisp edge (the original's toon shadow), drawn over a unit quad's uv. */
export const SHADOW_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SHADOW_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = alpha * (1.0 - smoothstep(0.86, 1.0, d));
  outColor = vec4(baseColor, a);
}`;
