export const COMMON = /* glsl */ `
uniform vec3 uSun;
uniform float uK;
uniform float uTime;

vec3 skyBase(vec3 d) {
  float t = max(d.y, 0.0);
  float sunSide = pow(max(dot(normalize(d.xz + vec2(1e-4)), normalize(uSun.xz)), 0.0), 2.0);
  vec3 hor = mix(vec3(0.55, 0.22, 0.40), vec3(1.0, 0.46, 0.20), sunSide);
  vec3 mid = mix(vec3(0.42, 0.18, 0.48), vec3(0.75, 0.25, 0.42), sunSide);
  vec3 upper = vec3(0.09, 0.12, 0.38);
  vec3 zenith = vec3(0.02, 0.04, 0.17);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.14, t));
  c = mix(c, upper, smoothstep(0.08, 0.42, t));
  c = mix(c, zenith, smoothstep(0.35, 0.95, t));
  float sa = max(dot(d, uSun), 0.0);
  c += vec3(1.0, 0.45, 0.18) * pow(sa, 6.0) * 0.5 + vec3(1.0, 0.65, 0.35) * pow(sa, 40.0) * 0.7;
  return c;
}

vec3 tonemap(vec3 c) {
  c *= 1.15;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
${COMMON}
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 c = skyBase(d);
  float sa = dot(d, uSun);
  // streaky high clouds lit from below by the sun
  vec2 p = d.xz / (d.y + 0.12);
  float n = fbm(vec2(p.x * 0.45 + uTime * 0.004, p.y * 1.7));
  float mask = smoothstep(0.52, 0.78, n) * smoothstep(0.03, 0.16, d.y) * (1.0 - smoothstep(0.5, 0.9, d.y));
  float sunSide = pow(max(dot(normalize(d.xz + vec2(1e-4)), normalize(uSun.xz)), 0.0), 2.0);
  vec3 cc = mix(vec3(0.28, 0.13, 0.36), vec3(1.0, 0.45, 0.30), sunSide * (1.0 - smoothstep(0.0, 0.55, d.y)));
  c = mix(c, cc, mask * 0.6);
  // sun disc
  c += vec3(3.0, 1.9, 1.1) * smoothstep(0.99935, 0.9998, sa);
  gl_FragColor = vec4(tonemap(c), 1.0);
}
`;

export const GROUND_VERT = /* glsl */ `
attribute float aShade;
attribute vec3 aCol;
varying vec3 vWorld;
varying vec3 vN;
varying float vShade;
varying vec3 vCol;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = mat3(modelMatrix) * normal;
  vShade = aShade;
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const GROUND_FRAG = /* glsl */ `
${COMMON}
varying vec3 vWorld;
varying vec3 vN;
varying float vShade;
varying vec3 vCol;

float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 pal(float id) {
  float r = h11(id * 1.37 + 3.1);
  vec3 c;
  if (r < 0.2) c = vec3(0.50, 0.20, 0.12);
  else if (r < 0.4) c = vec3(0.74, 0.38, 0.18);
  else if (r < 0.6) c = vec3(0.82, 0.58, 0.36);
  else if (r < 0.8) c = vec3(0.60, 0.28, 0.26);
  else c = vec3(0.86, 0.70, 0.50);
  return lin(c);
}
float wn(vec3 w) {
  return 0.5 * sin(0.21 * w.x + 7.0 * uK * w.z + 1.0)
       + 0.3 * sin(0.13 * w.x - 11.0 * uK * w.z + 2.0)
       + 0.2 * sin(0.37 * w.x + 19.0 * uK * w.z);
}

void main() {
  vec3 N = normalize(vN);
  vec3 w = vWorld;
  vec3 albedo;
#ifdef TERRAIN
  float s = w.y * 0.16 + 0.9 * wn(w);
  float id = floor(s);
  float fr = fract(s);
  vec3 sc = pal(id) * mix(0.78, 1.0, smoothstep(0.0, 0.18, fr));
  float fine = h11(floor(w.y * 0.9 + 1.5 * wn(vec3(w.x * 1.7, w.y, w.z))));
  sc *= 0.82 + 0.3 * fine;
  float streak = 0.5 + 0.5 * sin(w.x * 1.9 + 53.0 * uK * w.z + 2.0 * wn(w));
  sc *= 1.0 - 0.2 * streak * (1.0 - N.y);
  float grain = 0.5 * (sin(w.x * 3.1 + 160.0 * uK * w.z) + sin(w.x * 1.7 - 90.0 * uK * w.z + 1.0));
  vec3 sand = lin(vec3(0.78, 0.60, 0.42));
  vec3 pale = lin(vec3(0.72, 0.64, 0.55));
  float patch = smoothstep(-0.2, 0.5, wn(vec3(w.x * 0.4, 0.0, w.z)));
  sand = mix(sand, pale, patch * 0.7) * (0.93 + 0.07 * grain);
  float sandMix = max(smoothstep(0.7, 0.92, N.y), 1.0 - smoothstep(2.0, 5.5, w.y));
  albedo = mix(sc, sand, sandMix);
#else
  float g = 0.5 + 0.5 * sin(w.x * 7.0 + w.y * 9.0 + 120.0 * uK * w.z);
  albedo = lin(vCol) * (0.85 + 0.25 * g);
#endif

  float ndl = max(dot(N, uSun), 0.0);
  vec3 sunCol = vec3(1.0, 0.50, 0.22) * 2.6;
  vec3 direct = sunCol * ndl * vShade;
  vec3 skyUp = vec3(0.13, 0.14, 0.34);
  vec3 bounce = vec3(0.30, 0.15, 0.09);
  vec3 amb = mix(bounce, skyUp, N.y * 0.5 + 0.5) * 1.15;
  vec3 col = albedo * (direct + amb);

  vec3 V = vWorld - cameraPosition;
  float dist = length(V);
  vec3 vd = V / dist;
  vec3 fogDir = normalize(vec3(vd.x, clamp(vd.y, 0.0, 0.4) * 0.6 + 0.015, vd.z));
  vec3 fogCol = skyBase(fogDir) * 0.92;
  float fa = 1.0 - exp(-dist * 0.0085);
  col = mix(col, fogCol, fa);
  gl_FragColor = vec4(tonemap(col), 1.0);
}
`;
