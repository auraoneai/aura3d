/**
 * Aura3D depth-horizon ambient occlusion, evaluated on linear view depth.
 *
 * The normal comes from the least-discontinuous adjacent depth samples. Rays
 * march in both directions through the projected radius; each side contributes
 * its strongest normal-facing occluder with a finite world-space falloff. This
 * is a bounded screen-space approximation, not geometry behind the depth layer.
 * The output is visibility (one for sky and unoccluded pixels), ready for the
 * existing bilateral denoise and lighting-composition stages.
 */

export const GTAO_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform highp sampler2D u_linearDepthHalf;
uniform mat4 u_projMatrix;
uniform mat4 u_invProjMatrix;
uniform float u_near;
uniform float u_far;
uniform bool u_ortho;
uniform float u_radius;
uniform float u_intensity;
uniform float u_falloff;
uniform float u_distanceExponent;
uniform float u_thickness;
uniform int u_frameIndex;
out vec4 o_color;

#ifndef AURA_GTAO_DIRECTIONS
#define AURA_GTAO_DIRECTIONS 4
#endif
#ifndef AURA_GTAO_STEPS
#define AURA_GTAO_STEPS 4
#endif

const float AURA_PI = 3.141592653589793;

float auraRotation(ivec2 pixel, int frame) {
  uint bits = uint(pixel.x) * 1103515245u ^ uint(pixel.y) * 2654435761u ^ uint(frame) * 2246822519u;
  bits ^= bits >> 15u;
  bits *= 3266489917u;
  bits ^= bits >> 16u;
  return float(bits & 0x00ffffffu) / 16777216.0;
}

float auraDepth(ivec2 pixel) {
  ivec2 last = textureSize(u_linearDepthHalf, 0) - ivec2(1);
  return texelFetch(u_linearDepthHalf, clamp(pixel, ivec2(0), last), 0).r;
}

vec3 auraViewPosition(vec2 uv, float depth) {
  vec4 h = u_invProjMatrix * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  if (u_ortho) return vec3(h.xy / h.w, -depth);
  // The ratio cancels homogeneous w, including an infinite far plane.
  return vec3(h.xy * (depth / max(-h.z, 1e-6)), -depth);
}

vec3 auraDepthNormal(ivec2 pixel, vec2 texel, vec3 center, float depth) {
  float l = auraDepth(pixel + ivec2(-1, 0));
  float r = auraDepth(pixel + ivec2( 1, 0));
  float b = auraDepth(pixel + ivec2(0, -1));
  float t = auraDepth(pixel + ivec2(0,  1));
  // An uncovered neighbor carries the sky sentinel. Extend the center depth
  // instead of differentiating against the sentinel at silhouettes.
  if (l >= 2.9e38 || (!u_ortho && l <= 0.0)) l = depth;
  if (r >= 2.9e38 || (!u_ortho && r <= 0.0)) r = depth;
  if (b >= 2.9e38 || (!u_ortho && b <= 0.0)) b = depth;
  if (t >= 2.9e38 || (!u_ortho && t <= 0.0)) t = depth;
  vec2 uv = (vec2(pixel) + 0.5) * texel;
  vec3 dx = abs(l - depth) < abs(r - depth)
    ? center - auraViewPosition(uv - vec2(texel.x, 0.0), l)
    : auraViewPosition(uv + vec2(texel.x, 0.0), r) - center;
  vec3 dy = abs(b - depth) < abs(t - depth)
    ? center - auraViewPosition(uv - vec2(0.0, texel.y), b)
    : auraViewPosition(uv + vec2(0.0, texel.y), t) - center;
  vec3 n = cross(dx, dy);
  float magnitude = length(n);
  if (magnitude < 1e-12) return vec3(0.0, 0.0, 1.0);
  n /= magnitude;
  vec3 towardCamera = u_ortho ? vec3(0.0, 0.0, 1.0) : -center;
  return dot(n, towardCamera) < 0.0 ? -n : n;
}

float auraOccluder(vec2 sampleUv, vec2 size, vec3 center, vec3 normal) {
  if (any(lessThan(sampleUv, vec2(0.0))) || any(greaterThanEqual(sampleUv, vec2(1.0)))) return 0.0;
  ivec2 samplePixel = ivec2(sampleUv * size);
  float sampleDepth = auraDepth(samplePixel);
  if (sampleDepth >= 2.9e38 || (!u_ortho && sampleDepth <= 0.0)) return 0.0;
  vec2 sampleCenter = (vec2(samplePixel) + 0.5) / size;
  vec3 delta = auraViewPosition(sampleCenter, sampleDepth) - center;
  float distanceToSample = length(delta);
  if (distanceToSample < 1e-6 || distanceToSample >= u_radius || abs(delta.z) > u_thickness) return 0.0;
  float facing = max(dot(normal, delta / distanceToSample) - 0.02, 0.0);
  float attenuation = pow(clamp(1.0 - distanceToSample / u_radius, 0.0, 1.0), max(u_falloff, 0.0001));
  return facing * attenuation;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec2 size = vec2(textureSize(u_linearDepthHalf, 0));
  vec2 texel = 1.0 / size;
  float depth = auraDepth(pixel);
  if (depth >= 2.9e38 || (!u_ortho && depth <= 0.0) || u_radius <= 0.0 || u_intensity <= 0.0) {
    o_color = vec4(1.0); return;
  }
  vec2 uv = gl_FragCoord.xy * texel;
  vec3 center = auraViewPosition(uv, depth);
  vec3 normal = auraDepthNormal(pixel, texel, center, depth);
  float projectedRadius = u_radius * abs(u_projMatrix[1][1]) * size.y * 0.5;
  float radiusPx = min(projectedRadius / (u_ortho ? 1.0 : max(depth, 1e-6)), 96.0);
  float rotation = auraRotation(pixel, u_frameIndex);
  float sum = 0.0;
  for (int direction = 0; direction < AURA_GTAO_DIRECTIONS; ++direction) {
    float angle = AURA_PI * (float(direction) + rotation) / float(AURA_GTAO_DIRECTIONS);
    vec2 axis = vec2(cos(angle), sin(angle));
    float positive = 0.0;
    float negative = 0.0;
    for (int stepIndex = 0; stepIndex < AURA_GTAO_STEPS; ++stepIndex) {
      float progress = pow(float(stepIndex + 1) / float(AURA_GTAO_STEPS), max(u_distanceExponent, 0.0001));
      vec2 offset = axis * radiusPx * progress * texel;
      positive = max(positive, auraOccluder(uv + offset, size, center, normal));
      negative = max(negative, auraOccluder(uv - offset, size, center, normal));
    }
    sum += positive + negative;
  }
  float occlusion = sum / float(2 * AURA_GTAO_DIRECTIONS);
  float visibility = 1.0 - clamp(u_intensity, 0.0, 1.0) * clamp(occlusion, 0.0, 1.0);
  o_color = vec4(visibility, 0.0, 0.0, 1.0);
}
`;
