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

/* ================================================================== GU47 WP-26 carnival look (`?look=carnival`)
 * The original programs above stay byte-for-byte for `?look=original`. The carnival programs read their light, sky and
 * haze from `cr*` uniforms written from the look table (`look.ts`), so the time of day is a uniform change, not a new
 * program. Linear colours; the engine encodes to sRGB on output (tone mapping stays "none"). */

/** Toon vertex plus the object-space position (`vLocal`) the painted-canvas deck pattern is anchored to. */
export const CARNIVAL_VERTEX = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec2 vUv;
void main() {
  vUv = uv;
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const CARNIVAL_TONE_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec2 vUv;
out vec3 vTone;
void main() {
  vUv = uv;
  vTone = tone;
  vLocal = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

/**
 * CR-AN1 gate program: the tone vertex plus a wobble of the CR-M3 paint drips. `uv` = (phase, weight) on drip vertices and
 * weight 0 on the posts and bar; `crWobble` = (time s, amplitude m, frequency Hz). Amplitude 0 (reduced motion) is the
 * tone vertex exactly. The drips sway sideways and stretch a little as they swing down.
 */
export const CARNIVAL_GATE_VERTEX = /* glsl */ `
in vec3 tone;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out vec2 vUv;
out vec3 vTone;
void main() {
  vUv = uv;
  vTone = tone;
  float w = uv.y * uv.y;
  float s = sin(6.2831853 * (crWobble.z * crWobble.x + uv.x));
  vec3 p = position + vec3(crWobble.y * w * s, -crWobble.y * w * (0.6 + 0.4 * s), 0.0);
  vLocal = p;
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

/** Anti-aliased step: the cel edge stays one pixel wide at any distance. */
const BAND = /* glsl */ `
float band(float d, float edge) {
  float fw = fwidth(d) * 0.5 + 1e-4;
  return smoothstep(edge - fw, edge + fw, d);
}`;

/** CR-S3: exp2 haze towards the painted horizon colour. */
const HAZE = /* glsl */ `
vec3 haze(vec3 c, vec3 world) {
  float d = crFogDensity * length(world - cameraPosition);
  return mix(c, crFogColor, 1.0 - exp(-d * d));
}`;

/**
 * Carnival toon (CR-L1 sun / sky fill / rose bounce, CR-L2 stepped warm rim, CR-M1 stepped wet-paint highlight that dries
 * with the splatter's age, CR-M2 painted-canvas weave and brush streaks, CR-S3 haze).
 * `crDry` = (ball z, road speed m/s, dry seconds); dry seconds 0 means "always wet" (the ball).
 * `crCanvas` = (weave, streak) amplitudes; 0 on every surface but the deck.
 */
export const carnivalToonFragment = (withMap: boolean, withTone = false): string => /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
${withTone ? "in vec3 vTone;" : ""}
out vec4 outColor;
${SRGB}
${SHOULDER}
${BAND}
${HAZE}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 base = baseColor;
${withTone ? "  base *= vTone;" : ""}
${withMap ? "  base *= srgbToLinear(texture(map, vUv).rgb);" : ""}
  if (crCanvas.x + crCanvas.y > 0.0) {
    float weave = sin(vLocal.x * 31.0) * sin(vLocal.z * 29.0);
    float streak = sin(vLocal.x * 2.3 + sin(vLocal.z * 0.61) * 2.4 + vLocal.z * 0.17);
    base *= 1.0 + crCanvas.x * weave + crCanvas.y * streak;
  }
  float d = dot(N, crSunDir);
  float lit = band(d, 0.04) * 0.8 + band(d, 0.5) * 0.2;
  vec3 hemi = mix(crGround, crSkyFill, 0.5 * N.y + 0.5);
  vec3 bounce = crBounce * band(dot(N, normalize(crBounceDir)), 0.1);
  vec3 c = base * (hemi + crSunColor * lit + bounce);
  float fres = 1.0 - max(dot(N, V), 0.0);
  float rimSide = clamp(d + 0.6, 0.0, 1.0);
  c += crRim * band(fres, crRimThreshold) * (0.35 + 0.65 * rimSide);
  float wet = crDry.z > 0.0 ? 1.0 - clamp((vWorld.z - crDry.x) / max(crDry.y * crDry.z, 1e-3), 0.0, 1.0) : 1.0;
  vec3 H = normalize(crSunDir + V);
  float spec = band(pow(max(dot(N, H), 0.0), crShininess), 0.45);
  c += crSunColor * spec * crGloss * wet * 1.6;
  outColor = vec4(haze(shoulder(c), vWorld) + emissive, alpha);
}`;

/** CR-S2 sunset-lit clouds: apricot tops, lilac shadows, two cel steps; hazed like the road. */
export const CARNIVAL_CLOUD_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
${SHOULDER}
${BAND}
${HAZE}
void main() {
  vec3 N = normalize(vNormal);
  float d = dot(N, crSunDir) * 0.7 + N.y * 0.3;
  vec3 c = mix(crCloudShadow, crCloudTop, band(d, 0.08) * 0.75 + band(d, 0.55) * 0.25) * vTone;
  outColor = vec4(haze(shoulder(c), vWorld), alpha);
}`;

/**
 * CR-S1 five-stop sunset dome: lilac cloud sea below the painted horizon, apricot horizon, rose band, dusky upper sky,
 * ink-teal zenith; a 1.6 degree sun disc with a halo, cirrus bands, and a star layer whose opacity follows the time of
 * day. `crHorizonY` is the sin(elevation) of the painted horizon (the camera looks down on the road, so it sits low);
 * `crSunSize` = (disc radius, halo radius) in degrees. The disc is brighter than 1 so the bloom threshold picks it up.
 */
export const CARNIVAL_SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float u = (dir.y - crHorizonY) / (1.0 - crHorizonY);
  vec3 c;
  if (u < 0.0) {
    c = mix(crHorizon, crSea, smoothstep(0.0, 0.12, -u));
  } else {
    c = mix(crHorizon, crRose, smoothstep(0.0, 0.08, u));
    c = mix(c, crUpper, smoothstep(0.08, 0.26, u));
    c = mix(c, crZenith, smoothstep(0.26, 0.7, u));
  }
  float az = atan(dir.x, -dir.z);
  float wave = sin(az * 9.0 + sin(az * 3.0) * 1.4) * sin(u * 46.0 + az * 4.0);
  float cirrus = smoothstep(0.62, 0.95, wave) * smoothstep(0.02, 0.1, u) * (1.0 - smoothstep(0.3, 0.55, u)) * crCirrus;
  c = mix(c, mix(crRose, crHorizon, 0.55) * 1.12, cirrus);
  vec2 cell = vec2(az * 40.0, u * 40.0);
  vec2 id = floor(cell);
  float h = hash12(id);
  vec2 jitter = vec2(hash12(id + 17.0), hash12(id + 31.0)) * 0.6 + 0.2;
  float star = step(0.986, h) * (1.0 - smoothstep(0.05, 0.11, length(fract(cell) - jitter))) * smoothstep(0.15, 0.3, u);
  c += vec3(1.0, 0.94, 0.86) * star * crStars;
  float ang = degrees(acos(clamp(dot(dir, crSunDisc), -1.0, 1.0)));
  c += crSunColor * 0.55 * exp(-2.5 * ang / crSunSize.y);
  float disc = 1.0 - smoothstep(crSunSize.x * 0.82, crSunSize.x, ang);
  c = mix(c, crSunColor * 1.5 + vec3(0.25), disc);
  outColor = vec4(c, 1.0);
}`;

/** CR-S2 scrolling lilac cloud sea under the road: two octaves of soft puffs drifting with the clouds, hazed far out. */
export const CARNIVAL_SEA_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in vec2 vUv;
out vec4 outColor;
${HAZE}
float puff(vec2 p) {
  return 0.5 + 0.25 * sin(p.x) * sin(p.y) + 0.25 * sin(p.x * 2.3 + p.y * 1.7) * sin(p.y * 2.1 - p.x * 0.6);
}
void main() {
  vec2 p = vLocal.xz * 0.045 + vec2(0.0, crScroll);
  float m = puff(p * 3.0) * 0.65 + puff(p * 7.0 + 3.1) * 0.35;
  vec3 c = crSea * (0.86 + 0.24 * smoothstep(0.35, 0.75, m));
  outColor = vec4(haze(c, vWorld), 1.0);
}`;
