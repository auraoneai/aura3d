/**
 * GLSL 300 es for the Cloud Runner's custom materials: the sky dome (gradient, sun, lit cumulus, cirrus, hazy ridge
 * layers), the valley floor far below, running water, the star orbs, pooled glow points and particles. Written from
 * scratch for this port. Built-ins used: `position`, `normal`, `uv`, `modelMatrix`, `modelViewMatrix`,
 * `projectionMatrix`, `modelViewProjectionMatrix`, `cameraPosition`.
 */
const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}`;

export const SKY_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT = /* glsl */ `
in vec3 vDir;
out vec4 outColor;
${NOISE}
vec3 ridge(vec3 col, float ang, float h, float base, float amp, float freq, float seed, vec3 tint) {
  float r = base + amp * fbm(vec2(ang * freq + seed, seed * 1.7));
  float m = smoothstep(r + 0.004, r - 0.006, h);
  return mix(col, tint, m);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(skyHorizon, skyMid, smoothstep(0.0, 0.32, h));
  col = mix(col, skyTop, smoothstep(0.22, 0.85, h));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunTint * (pow(sd, 5.0) * 0.22 + pow(sd, 40.0) * 0.45) + vec3(1.0, 0.95, 0.8) * smoothstep(0.9993, 0.9998, sd) * 2.5;
  if (h > -0.02) {
    vec2 uv = d.xz / (max(h, 0.0) + 0.16) * 1.7 + vec2(cloudPhase * 0.012, 0.0);
    float n = fbm(uv * 1.15);
    float n2 = fbm(uv * 1.15 + sunDir.xz * 0.16);
    float dens = smoothstep(0.5, 0.74, n);
    float lit = clamp(0.6 + (n - n2) * 5.0, 0.42, 1.15);
    vec3 cc = mix(cloudShade, cloudLight, lit);
    cc += sunTint * pow(sd, 4.0) * 0.25 * dens;
    float fade = smoothstep(0.0, 0.16, h);
    col = mix(col, cc, dens * fade * 0.96);
    vec2 cu = d.xz / (max(h, 0.0) + 0.4) * vec2(0.7, 3.2) + vec2(cloudPhase * 0.004, 3.0);
    float cirrus = smoothstep(0.56, 0.9, fbm(cu * 2.2));
    col = mix(col, vec3(1.0, 0.98, 0.95), cirrus * 0.3 * smoothstep(0.18, 0.55, h) * (1.0 - dens));
  }
  float ang = atan(d.z, d.x);
  col = ridge(col, ang, h, 0.012, 0.06, 2.2, 3.0, mix(hazeColor, skyHorizon, 0.35));
  col = ridge(col, ang, h, 0.004, 0.045, 3.1, 7.0, mix(hazeColor, vec3(0.42, 0.56, 0.62), 0.5));
  col = ridge(col, ang, h, -0.006, 0.032, 4.6, 11.0, mix(hazeColor, vec3(0.3, 0.46, 0.38), 0.65));
  col = mix(col, hazeColor, smoothstep(-0.02, -0.3, h));
  outColor = vec4(col, 1.0);
}`;

/**
 * GU47 WP-35 CD-05: the post-storm dome. Cobalt zenith over a rain-washed horizon, the sun disc on the look key's direction,
 * fair-weather cumulus, three cumulonimbus towers in the antisolar sky with dark rain bases, lit tops and a silver edge, moving
 * rain curtains under them, and a 40-42 deg primary rainbow (faint 50-53 deg secondary) centred on the antisolar point, drawn
 * over the towers and curtains. Same sphere, same draw.
 */
export const STORM_SKY_FRAGMENT = /* glsl */ `
in vec3 vDir;
out vec4 outColor;
${NOISE}
vec3 ridge(vec3 col, float ang, float h, float base, float amp, float freq, float seed, vec3 tint) {
  float r = base + amp * fbm(vec2(ang * freq + seed, seed * 1.7));
  float m = smoothstep(r + 0.004, r - 0.006, h);
  return mix(col, tint, m);
}
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(skyHorizon, skyMid, smoothstep(0.0, 0.3, h));
  col = mix(col, skyTop, smoothstep(0.2, 0.8, h));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunTint * (pow(sd, 6.0) * 0.2 + pow(sd, 48.0) * 0.4) + vec3(1.0, 0.95, 0.82) * smoothstep(0.9993, 0.9998, sd) * 2.5;
  /* fair-weather cumulus, thinner than the midday sky */
  if (h > -0.02) {
    vec2 uv = d.xz / (max(h, 0.0) + 0.16) * 1.7 + vec2(cloudPhase * 0.012, 0.0);
    float n = fbm(uv * 1.15);
    float n2 = fbm(uv * 1.15 + sunDir.xz * 0.16);
    float dens = smoothstep(0.56, 0.78, n);
    float lit = clamp(0.6 + (n - n2) * 5.0, 0.42, 1.15);
    vec3 cc = mix(cloudShade, cloudLight, lit) + sunTint * pow(sd, 4.0) * 0.25 * dens;
    col = mix(col, cc, dens * smoothstep(0.0, 0.16, h) * 0.9);
  }
  /* antisolar frame: signed azimuth from the antisolar direction */
  vec3 anti = -sunDir;
  vec2 ah = normalize(anti.xz + vec2(1e-5, 0.0));
  vec2 dh = d.xz / max(length(d.xz), 1e-4);
  float rel = atan(dh.x * ah.y - dh.y * ah.x, dot(dh, ah));
  float dark = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float c = i == 0 ? -0.62 : (i == 1 ? 0.06 : 0.66);
    float w = i == 1 ? 0.3 : 0.2;
    float top = i == 1 ? 0.42 : 0.3;
    float bottom = 0.05;
    float x = (rel - c) / w;
    float y = clamp((h - bottom) / (top - bottom), 0.0, 1.2);
    float n = fbm(vec2(rel * 9.0 + fi * 5.3, h * 14.0 + cloudPhase * 0.02));
    float prof = mix(0.55, 1.0, smoothstep(0.0, 0.35, y)) + smoothstep(0.76, 0.95, y) * 0.55;
    float shape = prof * (0.75 + 0.5 * n) - abs(x);
    float cap = top * (0.92 + 0.16 * n) - h;
    float m = smoothstep(0.0, 0.08, shape) * smoothstep(0.0, 0.025, cap) * smoothstep(bottom - 0.04, bottom, h) * towerStrength;
    vec3 body = mix(cloudShade * 0.42, cloudLight, smoothstep(0.08, 0.85, y) * (0.7 + 0.3 * n));
    float edge = (smoothstep(0.0, 0.05, shape) - smoothstep(0.05, 0.16, shape)) * smoothstep(0.0, 0.025, cap) + (smoothstep(0.0, 0.012, cap) - smoothstep(0.012, 0.04, cap)) * step(0.0, shape);
    body += vec3(0.9, 0.93, 0.97) * clamp(edge, 0.0, 1.0) * 0.6 * smoothstep(0.25, 0.7, y + 0.3);
    col = mix(col, body, m);
    dark = max(dark, m * (1.0 - smoothstep(0.2, 0.7, y)));
    /* rain curtain under the tower, streaks falling over time */
    float r = fbm(vec2(rel * 46.0 + h * 6.0 + cloudPhase * 0.04, h * 2.4 - cloudPhase * 0.18 + fi * 3.0));
    float curtain = (1.0 - smoothstep(0.45, 0.95, abs(x))) * smoothstep(bottom + 0.03, bottom - 0.01, h) * smoothstep(-0.05, 0.0, h) * rainStrength;
    float streak = curtain * (0.45 + 0.55 * smoothstep(0.4, 0.75, r));
    col = mix(col, mix(cloudShade * 0.5, skyHorizon * 0.8, 0.35), streak * 0.75);
    dark = max(dark, curtain);
  }
  /* rainbow: primary 40-42 deg (violet inside, red outside), secondary 50-53 deg reversed and fainter */
  float theta = degrees(acos(clamp(dot(d, anti), -1.0, 1.0)));
  float vis = smoothstep(-0.01, 0.03, h) * (0.45 + 0.55 * dark) * rainbowStrength;
  float t = (theta - 40.0) / 2.0;
  float band = smoothstep(-0.2, 0.15, t) * (1.0 - smoothstep(0.85, 1.2, t));
  col += hue(0.78 * (1.0 - clamp(t, 0.0, 1.0))) * band * vis * 0.42;
  col += vec3(0.05, 0.055, 0.06) * smoothstep(40.0, 28.0, theta) * vis;
  float t2 = (theta - 50.0) / 3.0;
  float band2 = smoothstep(-0.2, 0.15, t2) * (1.0 - smoothstep(0.85, 1.2, t2));
  col += hue(0.78 * clamp(t2, 0.0, 1.0)) * band2 * vis * 0.14;
  float ang = atan(d.z, d.x);
  col = ridge(col, ang, h, 0.012, 0.06, 2.2, 3.0, mix(hazeColor, skyHorizon, 0.35));
  col = ridge(col, ang, h, 0.004, 0.045, 3.1, 7.0, mix(hazeColor, vec3(0.42, 0.5, 0.6), 0.5));
  col = ridge(col, ang, h, -0.006, 0.032, 4.6, 11.0, mix(hazeColor, vec3(0.36, 0.3, 0.24), 0.6));
  col = mix(col, hazeColor, smoothstep(-0.02, -0.3, h));
  outColor = vec4(col, 1.0);
}`;

export const VALLEY_VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const VALLEY_FRAGMENT = /* glsl */ `
in vec3 vW;
out vec4 outColor;
${NOISE}
void main() {
  vec2 p = vW.xz * 0.012;
  float n = fbm(p);
  float m = fbm(p * 3.1 + 7.0);
  vec3 canopy = mix(vec3(0.16, 0.34, 0.14), vec3(0.34, 0.5, 0.2), n);
  canopy = mix(canopy, vec3(0.5, 0.52, 0.3), smoothstep(0.6, 0.8, m) * 0.5);
  float cloudShadow = smoothstep(0.55, 0.75, fbm(p * 0.45 + vec2(cloudPhase * 0.01, 0.0)));
  canopy *= 1.0 - 0.28 * cloudShadow;
  float dist = length(vW - cameraPosition);
  float f = 1.0 - exp(-pow(dist * fogDensity, 2.0));
  outColor = vec4(mix(canopy, hazeColor, clamp(f, 0.0, 1.0)), 1.0);
}`;

export const WATER_VERTEX = /* glsl */ `
out vec3 vW;
out vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const WATER_FRAGMENT = /* glsl */ `
in vec3 vW;
in vec2 vUv;
out vec4 outColor;
${NOISE}
void main() {
  vec2 p = vW.xz * 0.35;
  float t = tClock;
  float r1 = vn(p * 1.6 + vec2(0.0, t * 0.9));
  float r2 = vn(p * 3.4 - vec2(t * 0.4, t * 1.3));
  float ripple = r1 * 0.6 + r2 * 0.4;
  vec3 deep = vec3(0.1, 0.42, 0.55), shallow = vec3(0.45, 0.82, 0.86);
  vec3 col = mix(deep, shallow, smoothstep(0.25, 0.8, ripple));
  float glint = smoothstep(0.78, 0.9, r2) * 0.8;
  col += vec3(1.0, 0.97, 0.88) * glint;
  float edge = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
  float foam = (1.0 - edge) * 0.8 + smoothstep(0.72, 0.9, r1) * 0.18;
  col = mix(col, vec3(0.95, 0.99, 1.0), clamp(foam, 0.0, 1.0));
  float dist = length(vW - cameraPosition);
  float f = 1.0 - exp(-pow(dist * fogDensity, 2.0));
  col = mix(col, hazeColor, clamp(f, 0.0, 1.0));
  outColor = vec4(col, 0.9 * smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x));
}`;

export const BALL_VERTEX = /* glsl */ `
out vec3 vL;
out vec3 vN;
out vec3 vV;
void main() {
  vL = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const BALL_FRAGMENT = /* glsl */ `
in vec3 vL;
in vec3 vN;
in vec3 vV;
out vec4 outColor;
float starAt(vec3 l, vec3 axis, float R) {
  vec3 b1 = normalize(cross(axis, vec3(0.0, 1.0, 0.001)));
  vec3 b2 = cross(axis, b1);
  float r = acos(clamp(dot(l, axis), -1.0, 1.0));
  float a = atan(dot(l, b2), dot(l, b1));
  float k = 0.5 + 0.5 * cos(5.0 * a);
  float rad = R * (0.38 + 0.62 * pow(k, 0.7));
  return smoothstep(rad, rad - 0.035, r);
}
void main() {
  vec3 n = normalize(vN);
  float fres = pow(1.0 - clamp(dot(n, normalize(vV)), 0.0, 1.0), 2.4);
  float lam = 0.55 + 0.45 * max(dot(n, normalize(vec3(0.4, 0.8, 0.5))), 0.0);
  vec3 base = mix(vec3(1.0, 0.45, 0.06), vec3(1.0, 0.72, 0.2), smoothstep(-0.8, 0.9, vL.y));
  float stars = 0.0;
  for (int i = 0; i < 7; i++) {
    if (float(i) >= ballStars) break;
    float fi = float(i);
    vec3 axis;
    if (i == 0) axis = vec3(0.0, 0.0, 1.0);
    else {
      float a = 6.2831853 * (fi - 1.0) / max(ballStars - 1.0, 1.0) + 0.4;
      axis = normalize(vec3(cos(a) * 0.62, sin(a) * 0.62, 0.78));
    }
    if (ballStars < 1.5) axis = vec3(0.0, 0.0, 1.0);
    stars = max(stars, starAt(vL, axis, 0.25));
    if (ballStars > 4.5) stars = max(stars, starAt(vL, -axis, 0.25));
  }
  vec3 col = base * lam;
  col = mix(col, vec3(0.78, 0.07, 0.06), stars);
  col += vec3(1.0, 0.82, 0.5) * fres * 0.9;
  col += vec3(1.0, 0.95, 0.8) * pow(max(dot(reflect(-normalize(vV), n), normalize(vec3(0.4, 0.8, 0.5))), 0.0), 40.0) * 0.8;
  col *= ballGlow;
  outColor = vec4(col, 1.0);
}`;

/** Pooled glow points: orbs, sparkles and impact stars share one shader (colour, size and alpha per point). */
export const GLOW_VERTEX = /* glsl */ `
attribute vec3 tone;
attribute float aSize;
attribute float aAlpha;
out vec3 vTone;
out float vAlpha;
void main() {
  vTone = tone;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(pointCap, aSize * pixelRatio * pointScale / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

export const GLOW_FRAGMENT = /* glsl */ `
in vec3 vTone;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float core = smoothstep(0.34, 0.0, d);
  float halo = pow(max(0.0, 1.0 - d), 2.2);
  float spike = max(smoothstep(0.1, 0.0, abs(c.x)) * smoothstep(1.0, 0.1, abs(c.y)), smoothstep(0.1, 0.0, abs(c.y)) * smoothstep(1.0, 0.1, abs(c.x))) * sparkle;
  float a = (core * 0.9 + halo * 0.55 + spike * 0.55) * vAlpha;
  if (a < 0.004) discard;
  outColor = vec4(mix(vTone, vec3(1.0), core * 0.55), a);
}`;

/** Soft puffs (dust, smoke, spray): alpha-blended discs with a lumpy edge. */
export const PUFF_FRAGMENT = /* glsl */ `
in vec3 vTone;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float lump = 0.82 + 0.18 * sin(atan(c.y, c.x) * 5.0 + vTone.r * 13.0);
  float a = smoothstep(lump, lump * 0.35, d) * vAlpha;
  if (a < 0.004) discard;
  outColor = vec4(vTone, a);
}`;

/** Painterly lit scenery: vertex tone x optional tiled map, half-Lambert sun, hemisphere fill, rim and aerial fog. */
export const SCENERY_VERTEX = /* glsl */ `
attribute vec3 tone;
out vec3 vTone;
out vec3 vN;
out vec3 vW;
out vec2 vUv;
void main() {
  vTone = tone;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const SCENERY_FRAGMENT = /* glsl */ `
in vec3 vTone;
in vec3 vN;
in vec3 vW;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vTone;
  if (mapMix > 0.001) albedo *= mix(vec3(1.0), texture(surfaceMap, vUv * mapScale).rgb * 1.9, mapMix);
  float ndl = dot(n, sunDirW);
  float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  float lit = 0.62 * wrap * wrap + 0.38 * max(ndl, 0.0);
  vec3 hemi = mix(groundFill, skyFill, n.y * 0.5 + 0.5);
  vec3 col = albedo * (sunColor * lit * sunStrength + hemi);
  vec3 vdir = normalize(cameraPosition - vW);
  float rim = pow(1.0 - clamp(dot(n, vdir), 0.0, 1.0), 2.6);
  col += rimColor * rim * rimStrength * (0.4 + 0.6 * max(n.y, 0.0));
  float dist = length(vW - cameraPosition);
  float f = 1.0 - exp(-pow(dist * fogDensity, 2.0));
  col = mix(col, hazeColor, clamp(f, 0.0, 1.0));
  outColor = vec4(col, opacity);
}`;

/** GU47 WP-35 CD-02: the scenery program on rows that receive the look key's sun shadow (`receiveShadow`, `a3d_shadow`). */
export const SCENERY_SHADOWED_FRAGMENT = /* glsl */ `
#include <a3d_shadow>
in vec3 vTone;
in vec3 vN;
in vec3 vW;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vTone;
  if (mapMix > 0.001) albedo *= mix(vec3(1.0), texture(surfaceMap, vUv * mapScale).rgb * 1.9, mapMix);
  float ndl = dot(n, sunDirW);
  float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  float lit = 0.62 * wrap * wrap + 0.38 * max(ndl, 0.0);
  lit *= mix(0.32, 1.0, a3dSunShadow(vW, n, sunDirW));
  vec3 hemi = mix(groundFill, skyFill, n.y * 0.5 + 0.5);
  vec3 col = albedo * (sunColor * lit * sunStrength + hemi);
  vec3 vdir = normalize(cameraPosition - vW);
  float rim = pow(1.0 - clamp(dot(n, vdir), 0.0, 1.0), 2.6);
  col += rimColor * rim * rimStrength * (0.4 + 0.6 * max(n.y, 0.0));
  float dist = length(vW - cameraPosition);
  float f = 1.0 - exp(-pow(dist * fogDensity, 2.0));
  col = mix(col, hazeColor, clamp(f, 0.0, 1.0));
  outColor = vec4(col, opacity);
}`;

/** Flat warning decal on the track: pulsing edge glow with hazard stripes. */
export const WARN_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const WARN_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float shape = warnRound > 0.5 ? 1.0 - length(c) : 1.0 - max(abs(c.x), abs(c.y));
  float edge = smoothstep(0.0, 0.18, shape);
  float rim = smoothstep(0.38, 0.0, shape);
  float stripes = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 38.0 - tClock * 5.0);
  float pulse = 0.78 + 0.22 * sin(tClock * 9.0);
  vec3 base = mix(vec3(0.95, 0.2, 0.12), vec3(1.0, 0.82, 0.25), warnGold);
  vec3 col = base * (0.55 + 0.45 * stripes) + vec3(1.0, 0.9, 0.7) * rim * 0.5;
  float a = warnAlpha * edge * (0.45 + 0.4 * rim) * pulse;
  if (a < 0.004) discard;
  outColor = vec4(col, a);
}`;

/** Soft contact shadow under bodies that the custom-lit ground cannot receive from the sun. */
export const SHADOW_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float a = smoothstep(1.0, 0.1, length(c)) * shadowAlpha;
  if (a < 0.004) discard;
  outColor = vec4(0.05, 0.08, 0.04, a);
}`;
