// GLSL for the harbor fireworks scene. All colours are authored in display (sRGB-like) space and squared in the
// shader to get linear light, because custom shaders write linear light and the app runs with tone mapping "none".

export const SHELL_COUNT = 7;

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Shared by sky and water: burst intensity over time. P = (x, y, z, burstTime). */
const BURST_FN = /* glsl */ `
float burstI(vec4 P) {
  float a = uClock - P.w;
  if (a < 0.0 || a > 4.0) return 0.0;
  return exp(-a * 1.5) * smoothstep(0.0, 0.05, a) * (1.0 + 1.6 * exp(-a * 12.0));
}
`;

const SKY_BASE_FN = /* glsl */ `
vec3 skyBase(vec3 dir) {
  float t = clamp(dir.y, 0.0, 1.0);
  vec3 horizon = vec3(0.080, 0.110, 0.200);
  vec3 mid = vec3(0.032, 0.048, 0.100);
  vec3 zenith = vec3(0.012, 0.018, 0.046);
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.30, t));
  c = mix(c, zenith, smoothstep(0.20, 0.95, t));
  return c * c;
}
`;

const HASH_FN = /* glsl */ `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Sky dome: gradient, star dust, faint galaxy band, distant hills, and glow from the active bursts.
// ---------------------------------------------------------------------------------------------------------------
export const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${HASH_FN}
${SKY_BASE_FN}
${BURST_FN}

vec3 stars(vec3 dir) {
  vec3 p = dir * 96.0;
  vec3 c = floor(p);
  vec3 f = fract(p);
  float h = hash13(c);
  if (h < 0.90) return vec3(0.0);
  vec3 off = vec3(hash13(c + 7.1), hash13(c + 13.7), hash13(c + 29.3)) * 0.6 + 0.2;
  float d = length(f - off);
  float core = smoothstep(0.24, 0.0, d);
  float mag = hash13(c + 51.0);
  float bright = 0.18 + 0.55 * mag * mag + (mag > 0.93 ? 0.8 : 0.0);
  float tw = 0.8 + 0.2 * sin(uClock * (1.5 + 3.0 * mag) + h * 90.0);
  vec3 tint = mix(vec3(0.70, 0.82, 1.00), vec3(1.00, 0.90, 0.75), hash13(c + 3.3));
  return tint * core * bright * tw;
}

vec3 glowSky(vec4 P, vec4 C, vec3 dir) {
  float I = burstI(P);
  if (I <= 0.0) return vec3(0.0);
  vec3 d = normalize(P.xyz - cameraPosition);
  float c = dot(dir, d);
  float g = exp((c - 1.0) * 55.0) * 0.55 + exp((c - 1.0) * 7.0) * 0.10;
  vec3 col = C.rgb * C.rgb;
  return col * (0.20 * I * g);
}

void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float az = (abs(dir.x) + abs(dir.z) > 0.00001) ? atan(dir.x, -dir.z) : 0.0;
  float ridge = 0.026 + 0.012 * sin(az * 5.0 + 1.3) + 0.008 * sin(az * 13.0 + 4.0) + 0.004 * sin(az * 29.0 + 0.7);
  vec3 col = skyBase(dir);

  // faint warm town glow hugging the horizon
  col += vec3(0.012, 0.006, 0.0025) * exp(-clamp(dir.y, 0.0, 1.0) * 16.0);

  // galaxy band
  vec3 axis = normalize(vec3(0.55, 0.30, -0.78));
  float b = dot(dir, axis);
  float band = exp(-b * b * 26.0);
  float cloud = vnoise(dir * 7.0) * 0.6 + vnoise(dir * 19.0) * 0.4;
  col += vec3(0.010, 0.012, 0.022) * band * (0.25 + cloud);

  float above = smoothstep(ridge, ridge + 0.10, dir.y);
  col += stars(dir) * above;

  ${range(SHELL_COUNT).map((k) => `col += glowSky(uP${k}, uC${k}, dir);`).join("\n  ")}

  // distant hills (dark silhouette, slightly lifted by the burst glow)
  float hill = smoothstep(ridge + 0.0025, ridge - 0.0025, dir.y);
  vec3 hillCol = vec3(0.0030, 0.0042, 0.0095);
  ${range(SHELL_COUNT).map((k) => `hillCol += glowSky(uP${k}, uC${k}, dir) * 0.08;`).join("\n  ")}
  col = mix(col, hillCol, hill);

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------
// Water: dark rippled surface, sky sheen by fresnel, glitter and pooled light from the bursts.
// ---------------------------------------------------------------------------------------------------------------
export const WATER_VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const WATER_FRAGMENT = /* glsl */ `
in vec3 vW;
out vec4 outColor;
${SKY_BASE_FN}
${BURST_FN}

vec3 waterLight(vec4 P, vec4 C, vec3 r, float fres) {
  float I = burstI(P);
  if (I <= 0.001) return vec3(0.0);
  vec3 L = normalize(P.xyz - vW);
  float d = max(dot(r, L), 0.0);
  float glint = exp((d - 1.0) * 160.0);
  vec2 dd = vW.xz - P.xz;
  float pool = exp(-dot(dd, dd) / 2800.0);
  vec3 col = C.rgb * C.rgb;
  return col * I * (glint * (0.30 + 1.2 * fres) * 1.6 + pool * (0.020 + 0.10 * fres));
}

void main() {
  vec3 toCam = cameraPosition - vW;
  float dist = max(length(toCam), 0.001);
  vec3 v = toCam / dist;
  vec2 p = vW.xz;
  float t = uClock;
  float amp = 0.13 / (1.0 + dist * 0.010);
  vec2 sl = vec2(0.0);
  sl += vec2(0.80, 0.60) * cos(dot(p, vec2(0.80, 0.60)) * 0.9 + t * 1.3);
  sl += vec2(-0.50, 0.86) * cos(dot(p, vec2(-0.50, 0.86)) * 1.7 + t * 1.9) * 0.6;
  sl += vec2(0.20, -0.98) * cos(dot(p, vec2(0.20, -0.98)) * 3.1 + t * 2.6) * 0.35;
  sl += vec2(-0.90, -0.40) * cos(dot(p, vec2(-0.90, -0.40)) * 5.3 + t * 3.3) * 0.2;
  vec3 n = normalize(vec3(-sl.x * amp, 1.0, -sl.y * amp));

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);

  vec3 deep = vec3(0.020, 0.036, 0.070);
  deep = deep * deep;
  vec3 col = deep + skyBase(r) * fres * 0.75;

  ${range(SHELL_COUNT).map((k) => `col += waterLight(uP${k}, uC${k}, r, fres);`).join("\n  ")}

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------
// Flat dark silhouettes and warm lights.
// ---------------------------------------------------------------------------------------------------------------
export const SILHOUETTE_FRAGMENT = /* glsl */ `
out vec4 outColor;
void main() {
  vec3 c = vec3(0.020, 0.026, 0.045);
  outColor = vec4(c * c, 1.0);
}`;

export const WARM_FRAGMENT = /* glsl */ `
out vec4 outColor;
void main() {
  vec3 c = vec3(1.0, 0.66, 0.26);
  outColor = vec4(c * c * 2.2, 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------
// Fireworks shell: rocket ribbon, burst flash and spark ribbons, all simulated analytically from uniforms.
// Every vertex carries: position = unit direction (sparks), uv = (along, side), pRnd, pInfo.
// pInfo.x kind (0 rocket, 1 spark, 2 flash), pInfo.y mirror flag (reflection in the water), pInfo.z colour mix.
// ---------------------------------------------------------------------------------------------------------------
export const SHELL_VERTEX = /* glsl */ `
in vec4 pRnd;
in vec4 pInfo;
out vec4 vCol;
out vec2 vUV;
out float vKind;

const float GRAV = 7.5;
const float DRAG = 1.7;

mat3 rotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

vec3 rocketPos(float tr) {
  float F = max(uBurst.w, 0.1);
  float s = clamp(tr / F, 0.0, 1.0);
  float e = 1.0 - (1.0 - s) * (1.0 - s);
  float h = 0.5 * s + 0.5 * e;
  vec3 p = vec3(mix(uLaunch.x, uBurst.x, h), mix(uLaunch.y, uBurst.y, e), mix(uLaunch.z, uBurst.z, h));
  p.x += sin(tr * 10.0 + uLaunch.x) * 0.18 * s;
  return p;
}

vec3 sparkAt(vec3 d, float spd, float a) {
  float e = (1.0 - exp(-DRAG * a)) / DRAG;
  vec3 p = uBurst.xyz + d * (spd * e);
  p.y -= 0.5 * GRAV * a * a;
  return p;
}

vec3 mirrorP(vec3 p, float m) {
  if (m > 0.5) {
    p.y = -p.y;
    p.x += sin(p.y * 0.8 + uClock * 2.4) * 0.5 + sin(p.y * 2.3 - uClock * 3.7) * 0.2;
  }
  return p;
}

vec3 ribbonPos(vec3 p0, vec3 p1, float side, float hw) {
  vec3 viewDir = normalize(cameraPosition - p0);
  vec3 tang = p1 - p0;
  float tl = length(tang);
  vec3 sideV = vec3(1.0, 0.0, 0.0);
  if (tl > 0.00001) {
    vec3 cr = cross(tang / tl, viewDir);
    float cl = length(cr);
    if (cl > 0.001) sideV = cr / cl;
  }
  return p0 + sideV * (side * hw);
}

void main() {
  float kind = pInfo.x;
  float mir = pInfo.y;
  float s = uv.x;
  float side = uv.y;
  float mk = mir > 0.5 ? 0.30 : 1.0;
  float F = max(uBurst.w, 0.1);
  float tL = uClock - uLaunch.w;
  float age = tL - F;

  bool alive = false;
  vec3 pw = vec3(0.0);
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (kind < 0.5) {
    // rocket with a short glowing trail
    if (tL >= 0.0 && tL < F + 0.4) {
      float trailT = 0.5;
      float th = min(tL, F);
      float tp0 = max(th - s * trailT, 0.0);
      float tp1 = max(th - (s + 0.0667) * trailT, 0.0);
      vec3 p0 = mirrorP(rocketPos(tp0), mir);
      vec3 p1 = mirrorP(rocketPos(tp1), mir);
      float hw = 0.24 * (1.0 - 0.6 * s);
      pw = ribbonPos(p0, p1, side, hw);
      float fade = 1.0 - clamp((tL - F) / 0.4, 0.0, 1.0);
      alpha = pow(1.0 - s, 1.3) * fade * mk * smoothstep(0.0, 1.5, p0.y * (mir > 0.5 ? -1.0 : 1.0) + 0.5);
      vec3 base = vec3(1.0, 0.72, 0.35);
      col = base * base * mix(2.6, 0.7, s);
      alive = true;
    }
  } else if (kind < 1.5) {
    float life = uParams.x * (0.62 + 0.38 * pRnd.x);
    if (age >= 0.0 && age < life) {
      float T = uParams.y;
      float spd = uParams.z * pRnd.y;
      mat3 R = rotX(uRot.x) * rotY(uRot.y);
      vec3 d = R * position;
      float a0 = max(age - s * T, 0.0);
      float a1 = max(age - (s + 0.2) * T, 0.0);
      vec3 q0 = sparkAt(d, spd, a0);
      vec3 q1 = sparkAt(d, spd, a1);
      float aboveWater = smoothstep(0.0, 1.5, q0.y);
      vec3 p0 = mirrorP(q0, mir);
      vec3 p1 = mirrorP(q1, mir);
      float t01 = age / life;
      float fade = 1.0 - smoothstep(0.25, 1.0, t01);
      float tw = mix(1.0, 0.55 + 0.45 * sin(uClock * 45.0 + pRnd.z * 40.0), smoothstep(0.45, 0.85, t01));
      float hot = exp(-age * 4.5);
      vec3 baseC = mix(uColA.rgb, uColB.rgb, pInfo.z);
      baseC = baseC * baseC;
      vec3 ember = mix(vec3(1.0), vec3(1.0, 0.45, 0.2), smoothstep(0.5, 1.0, t01));
      col = mix(baseC * ember * 2.0, vec3(1.0, 0.95, 0.85) * 2.6, hot * 0.7);
      float hw = uParams.w * (0.65 + 0.7 * pRnd.w) * mix(1.0, 0.4, s) * mix(1.0, 0.6, t01);
      pw = ribbonPos(p0, p1, side, hw);
      alpha = pow(1.0 - s, 1.4) * fade * max(tw, 0.0) * mk * aboveWater;
      alive = true;
    }
  } else {
    float fa = age;
    if (fa >= 0.0 && fa < 0.45) {
      vec3 c = mirrorP(uBurst.xyz, mir);
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float rad = 9.0 * (0.35 + 0.65 * smoothstep(0.0, 0.12, fa));
      pw = c + right * ((s * 2.0 - 1.0) * rad) + upv * (side * rad);
      float k = 1.0 - fa / 0.45;
      alpha = k * k * 0.9 * mk;
      vec3 baseC = uColA.rgb;
      baseC = baseC * baseC;
      col = mix(baseC, vec3(1.0, 0.95, 0.85), 0.55) * 2.2;
      alive = true;
    }
  }

  vKind = kind;
  vUV = vec2(s, side);
  if (!alive) {
    vCol = vec4(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vCol = vec4(col, alpha);
  gl_Position = modelViewProjectionMatrix * vec4(pw, 1.0);
}`;

export const SHELL_FRAGMENT = /* glsl */ `
in vec4 vCol;
in vec2 vUV;
in float vKind;
out vec4 outColor;
void main() {
  float a = vCol.a;
  if (a <= 0.002) discard;
  float shape;
  if (vKind > 1.5) {
    vec2 q = vec2(vUV.x * 2.0 - 1.0, vUV.y);
    shape = exp(-dot(q, q) * 5.0);
  } else {
    shape = exp(-vUV.y * vUV.y * 3.2);
  }
  outColor = vec4(vCol.rgb, a * shape);
}`;
