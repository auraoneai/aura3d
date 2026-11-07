// Shared GLSL used by the sky dome, the water, the silhouettes and the spark sprites.

export const COMMON = /* glsl */ `
#define NL 6
uniform vec4 uLP[NL];   // xyz = burst light position, w = intensity
uniform vec3 uLC[NL];   // burst light colour
uniform float uTime;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Soft glow in the sky around each active burst, as seen from origin o along direction d.
vec3 burstGlow(vec3 d, vec3 o) {
  vec3 g = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    float I = uLP[i].w;
    if (I > 0.001) {
      vec3 L = normalize(uLP[i].xyz - o);
      float c = max(dot(d, L), 0.0);
      float k = pow(c, 70.0) * 0.20 + pow(c, 14.0) * 0.065 + pow(c, 3.0) * 0.012;
      g += uLC[i] * (I * k);
    }
  }
  return g;
}

float starLayer(vec2 uv, float K, float thr, float rad) {
  vec2 q = uv * K;
  vec2 id = floor(q);
  vec2 f = fract(q);
  float h = hash21(id);
  if (h < thr) return 0.0;
  vec2 c = vec2(hash21(id + 7.1), hash21(id + 13.7)) * 0.6 + 0.2;
  float b = smoothstep(rad, 0.0, length(f - c));
  float h2 = hash21(id + 3.3);
  b *= 0.2 + 0.8 * h2 * h2;
  b *= 0.8 + 0.2 * sin(uTime * (1.5 + h2 * 3.0) + h * 60.0);
  return b;
}

vec3 skyColor(vec3 d, vec3 o) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(vec3(0.026, 0.040, 0.078), vec3(0.0015, 0.003, 0.012), pow(h, 0.42));
  col += vec3(0.040, 0.026, 0.022) * exp(-h * 38.0);
  vec2 uv = vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0)));
  float s = starLayer(uv, 58.0, 0.93, 0.24) * 0.95 + starLayer(uv + 1.7, 140.0, 0.9, 0.3) * 0.35;
  float tint = hash21(floor(uv * 58.0));
  vec3 sc = mix(vec3(0.75, 0.88, 1.0), vec3(1.0, 0.9, 0.72), tint);
  col += sc * s * smoothstep(0.0, 0.10, d.y);
  // faint milky band
  float band = exp(-pow((uv.y - 0.55 - 0.25 * sin(uv.x * 1.3 + 0.4)) * 3.2, 2.0));
  col += vec3(0.010, 0.014, 0.025) * band * (0.6 + 0.4 * sin(uv.x * 9.0 + uv.y * 7.0));
  return col + burstGlow(d, o);
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vWP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SKY_FRAG = /* glsl */ `
varying vec3 vWP;
${COMMON}
void main() {
  vec3 d = normalize(vWP - cameraPosition);
  vec3 c = skyColor(d, cameraPosition);
  c += (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}
`;

export const WATER_FRAG = /* glsl */ `
varying vec3 vWP;
${COMMON}
vec2 waves(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6);   g += d1 * 0.012 * cos(dot(p, d1) * 0.7 + t * 1.1);
  vec2 d2 = vec2(-0.5, 0.87); g += d2 * 0.010 * cos(dot(p, d2) * 1.3 + t * 1.5);
  vec2 d3 = vec2(0.96, -0.28); g += d3 * 0.008 * cos(dot(p, d3) * 2.1 + t * 1.9);
  vec2 d4 = vec2(0.1, 0.99);  g += d4 * 0.006 * cos(dot(p, d4) * 3.4 + t * 2.4);
  return g;
}
void main() {
  vec3 p = vWP;
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 g = waves(p.xz, uTime) / (1.0 + dist * 0.015);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  float F = 0.03 + 0.97 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  vec3 deep = vec3(0.002, 0.006, 0.013);
  vec3 col = deep * (1.0 - F) + skyColor(R, p) * F;
  // gentle wash of burst light on the surface
  for (int i = 0; i < NL; i++) {
    vec2 dd = p.xz - uLP[i].xz;
    col += uLC[i] * uLP[i].w * 0.012 / (1.0 + dot(dd, dd) / 1800.0);
  }
  col += (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

export const SIL_VERT = /* glsl */ `
varying vec3 vWP;
varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SIL_FRAG = /* glsl */ `
varying vec3 vWP;
varying vec3 vN;
uniform vec3 uBase;
${COMMON}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 col = uBase;
  for (int i = 0; i < NL; i++) {
    vec3 L = uLP[i].xyz - vWP;
    float dd = dot(L, L);
    float ndl = max(dot(n, L * inversesqrt(dd)), 0.0);
    col += uLC[i] * uLP[i].w * ndl * 0.14 / (1.0 + dd / 3600.0);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export const GLOW_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uScale;
uniform float uMirror;
uniform float uTime;
varying vec3 vColor;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float shim = 1.0;
  float sz = aSize;
  if (uMirror > 0.5) {
    wp.x += sin(wp.y * 0.9 + uTime * 2.3 + wp.x * 0.35) * 0.35;
    shim = 0.6 + 0.4 * sin(uTime * 6.0 + wp.x * 2.7 + wp.y * 1.3);
    sz *= 1.1;
  }
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float px = sz * uScale / max(-mv.z, 0.1);
  gl_PointSize = clamp(px, 1.0, uMirror > 0.5 ? 34.0 : 64.0);
  vColor = aColor * (uMirror > 0.5 ? 0.5 * shim : 1.0);
}
`;

export const GLOW_FRAG = /* glsl */ `
uniform float uMirror;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (uMirror > 0.5) d.x *= 2.4;   // vertical dashes of reflected light
  float r = length(d) * 2.0;
  if (r >= 1.0) discard;
  float core = exp(-r * r * 20.0);
  float halo = pow(1.0 - r, 2.6) * 0.45;
  vec3 c = mix(vColor, vec3(max(vColor.r, max(vColor.g, vColor.b))), 0.35 * core) * (core * 1.4 + halo);
  gl_FragColor = vec4(c, 1.0);
}
`;
