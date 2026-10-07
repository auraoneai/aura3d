/**
 * PRD-03 §8.4 / §6.3 — S2 GTAO for the v2 post chain (WebGL2, half-res R8).
 *
 * AO kernel ported from three r185 `examples/jsm/shaders/GTAOShader.js`
 * (MIT): per-slice tangent-frame construction, horizon cosine search and the
 * `nx·nxb + ny·nyb` cosine-weighted arc integral are verbatim. The differences
 * the PRD pins:
 *   - slice directions `AURA_GTAO_DIRECTIONS` ∈ {2, 4} and horizon samples
 *     `AURA_GTAO_STEPS` ∈ {4, 6} are compile-time tier constants (C-27);
 *   - slice rotation comes from a 4×4 interleaved-gradient noise plus the
 *     TAA frame index (`u_frameIndex`), not a noise texture;
 *   - the march is screen-space: `radiusPx = radius · projScale / viewZ`
 *     clamped to 4..96 px, `steps` taps along each direction, sampling the
 *     S1 half-res (min) linear depth;
 *   - distance falloff `saturate((radius − d) / (falloff · radius))`
 *     attenuates the horizon cosine;
 *   - normals are reconstructed from linear depth with the 5-tap
 *     smallest-discontinuity method (Turánszki) — r185
 *     `computeNormalFromDepth` verbatim; no normal MRT.
 *
 * Output: R8 visibility (1 = unoccluded). Sky / far plane writes 1.
 *
 * Uniforms: `u_linearDepthHalf` (S1 RG32F half-res, `.r` = min),
 * `u_projMatrix` (view→clip), `u_invProjMatrix` (clip→view), `u_near`,
 * `u_far`, `u_radius` (metres), `u_intensity`, `u_falloff`,
 * `u_distanceExponent`, `u_thickness`, `u_frameIndex`.
 */

const HEADER = `#version 300 es
precision highp float;
`;

export const GTAO_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_linearDepthHalf;   // S1 RG32F, .r = min viewZ
uniform mat4 u_projMatrix;
uniform mat4 u_invProjMatrix;
uniform float u_near;
uniform float u_far;
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

const float PI = 3.141592653589793;
const float GOLDEN_ANGLE = 2.39996322972865332;

// 4×4 interleaved-gradient noise (same generator as IGN, tiled).
float ign4(vec2 fragCoord) {
  vec2 p = mod(fragCoord, 4.0);
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float fetchViewZ(ivec2 p) {
  return texelFetch(u_linearDepthHalf, clamp(p, ivec2(0), textureSize(u_linearDepthHalf, 0) - 1), 0).r;
}

vec3 getViewPosition(vec2 uv, float viewZ) {
  // Linear viewZ reconstruction: shoot the ndc.xy ray to the far plane,
  // normalize to unit view-depth, scale by viewZ (viewZ is optical-axis
  // depth, positive in front of the camera).
  vec4 view = u_invProjMatrix * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 ray = view.xyz / view.w;
  return ray * (viewZ / -ray.z);
}

// 5-tap smallest-discontinuity normal (three r185 computeNormalFromDepth,
// operating on linear viewZ directly).
vec3 computeNormalFromDepth(ivec2 p, vec2 texel) {
  vec2 size = vec2(textureSize(u_linearDepthHalf, 0));
  float c0 = fetchViewZ(p);
  float l2 = fetchViewZ(p - ivec2(2, 0));
  float l1 = fetchViewZ(p - ivec2(1, 0));
  float r1 = fetchViewZ(p + ivec2(1, 0));
  float r2 = fetchViewZ(p + ivec2(2, 0));
  float b2 = fetchViewZ(p - ivec2(0, 2));
  float b1 = fetchViewZ(p - ivec2(0, 1));
  float t1 = fetchViewZ(p + ivec2(0, 1));
  float t2 = fetchViewZ(p + ivec2(0, 2));
  float dl = abs((2.0 * l1 - l2) - c0);
  float dr = abs((2.0 * r1 - r2) - c0);
  float db = abs((2.0 * b1 - b2) - c0);
  float dt = abs((2.0 * t1 - t2) - c0);
  vec2 uv = vec2(p) * texel;
  vec3 ce = getViewPosition(uv, c0);
  vec3 dpdx = (dl < dr) ? ce - getViewPosition(uv - vec2(texel.x, 0.0), l1)
                        : -ce + getViewPosition(uv + vec2(texel.x, 0.0), r1);
  vec3 dpdy = (db < dt) ? ce - getViewPosition(uv - vec2(0.0, texel.y), b1)
                        : -ce + getViewPosition(uv + vec2(0.0, texel.y), t1);
  return normalize(cross(dpdx, dpdy));
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 size = vec2(textureSize(u_linearDepthHalf, 0));
  vec2 texel = 1.0 / size;
  float viewZ = fetchViewZ(p);
  if (viewZ >= u_far * 0.999) { o_color = vec4(1.0); return; }

  vec2 uv = gl_FragCoord.xy * texel;
  vec3 viewPos = getViewPosition(uv, viewZ);
  vec3 viewNormal = computeNormalFromDepth(p, texel);
  vec3 viewDir = normalize(-viewPos);

  // radius metres → pixels at this depth, clamped to the march budget.
  float projScale = u_projMatrix[1][1] * size.y * 0.5;
  float radiusPx = clamp(u_radius * projScale / viewZ, 4.0, 96.0);

  float jitter = ign4(gl_FragCoord.xy) + float(u_frameIndex) * GOLDEN_ANGLE;
  float ao = 0.0;
  const int DIRECTIONS = AURA_GTAO_DIRECTIONS;
  const int STEPS = AURA_GTAO_STEPS;

  for (int i = 0; i < DIRECTIONS; ++i) {
    float angle = (float(i) + jitter) / float(DIRECTIONS) * PI;
    vec2 dir = vec2(cos(angle), sin(angle));

    // Per-slice tangent frame (r185): screen-space dir → view-space slice,
    // unprojecting the 2D direction by the projection focal scales.
    vec3 sliceDirView = normalize(vec3(dir.x / u_projMatrix[0][0],
                                       dir.y / u_projMatrix[1][1], 0.0));
    vec3 sliceBitangent = normalize(cross(sliceDirView, viewDir));
    vec3 sliceTangent = cross(sliceBitangent, viewDir);
    vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));
    vec3 tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
    vec2 cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice),
                            dot(viewDir, -tangentToNormalInSlice));

    for (int j = 0; j < STEPS; ++j) {
      float t = pow(float(j + 1) / float(STEPS), u_distanceExponent);
      vec2 sampleOffset = dir * radiusPx * t * texel;

      vec2 sampleUvPos = uv + sampleOffset;
      float sampleZ = textureLod(u_linearDepthHalf, sampleUvPos, 0.0).r;
      vec3 viewDelta = getViewPosition(sampleUvPos, sampleZ) - viewPos;
      float d = length(viewDelta);
      if (d < u_radius && abs(viewDelta.z) < u_thickness) {
        float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
        cosHorizons.x = max(cosHorizons.x,
          sampleCosHorizon * clamp((u_radius - d) / (u_falloff * u_radius), 0.0, 1.0));
      }

      vec2 sampleUvNeg = uv - sampleOffset;
      float sampleZ2 = textureLod(u_linearDepthHalf, sampleUvNeg, 0.0).r;
      vec3 viewDelta2 = getViewPosition(sampleUvNeg, sampleZ2) - viewPos;
      float d2 = length(viewDelta2);
      if (d2 < u_radius && abs(viewDelta2.z) < u_thickness) {
        float sampleCosHorizon2 = dot(viewDir, normalize(viewDelta2));
        cosHorizons.y = max(cosHorizons.y,
          sampleCosHorizon2 * clamp((u_radius - d2) / (u_falloff * u_radius), 0.0, 1.0));
      }
    }

    vec2 sinHorizons = sqrt(1.0 - cosHorizons * cosHorizons);
    float nx = dot(normalInSlice, sliceTangent);
    float ny = dot(normalInSlice, viewDir);
    float nxb = 0.5 * (acos(cosHorizons.y) - acos(cosHorizons.x)
                     + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y);
    float nyb = 0.5 * (2.0 - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
    ao += nx * nxb + ny * nyb;
  }

  ao = clamp(ao / float(DIRECTIONS), 0.0, 1.0);
  // visibility → occlusion strength (u_intensity 1 = full AO).
  ao = mix(1.0, ao, clamp(u_intensity, 0.0, 1.0));
  o_color = vec4(ao, 0.0, 0.0, 1.0);
}
`;
