/**
 * Depth preparation for postprocessing. The full-resolution pass uses the
 * actual inverse projection, so off-axis projections and both clip ranges use
 * the same convention as rasterization. Reversed depth is represented by the
 * supplied projection; it must not be inverted a second time. Logarithmic
 * depth stores normalized log view distance and needs finite 0 < near < far.
 *
 * The cleared depth value and unbounded endpoint of an infinite-far projection
 * are represented by the finite sky sentinel 3e38. When no separate coverage
 * attachment is available, a surface exactly on the far clip plane is
 * indistinguishable from the cleared depth value. All other orthographic view
 * distances remain signed, including points behind the view-space origin.
 */

const HEADER = `#version 300 es
precision highp float;
`;

const DEPTH_FUNCTIONS = /* glsl */ `
uniform float u_near;
uniform float u_far;
uniform bool u_ortho;
uniform mat4 u_invProjMatrix;
uniform bool u_clipRangeZeroToOne;
uniform int u_depthMode; // 0 standard, 1 reversed, 2 logarithmic

const float AURA_SKY_DEPTH = 3e38;

float auraNdcDepth(float depth) {
  return u_clipRangeZeroToOne ? depth : depth * 2.0 - 1.0;
}

float auraLinearDepth(vec2 ndcXY, float depth) {
  // Depth textures alone cannot distinguish a fragment at the exact far plane
  // from a clear pixel. The renderer's depth convention determines the clear.
  if ((u_depthMode == 1 && depth <= 0.0) || (u_depthMode != 1 && depth >= 1.0)) return AURA_SKY_DEPTH;
  if (u_depthMode == 2) {
    // The caller must reject an invalid log range; this guard keeps malformed
    // input from introducing NaNs into the rest of the frame.
    if (!(u_near > 0.0) || !(u_far > u_near) || isinf(u_far)) return AURA_SKY_DEPTH;
    return exp(mix(log(u_near), log(u_far), depth));
  }
  vec4 view = u_invProjMatrix * vec4(ndcXY, auraNdcDepth(depth), 1.0);
  if (abs(view.w) < 1e-20 || isnan(view.w) || isnan(view.z)) return AURA_SKY_DEPTH;
  float viewDepth = -view.z / view.w;
  return isnan(viewDepth) || isinf(viewDepth) ? AURA_SKY_DEPTH : viewDepth;
}

// Given a decoded log depth, solve for the actual projective clip z. This
// preserves asymmetric and orthographic projections because x/y participate
// in the homogeneous inverse-projection equation.
float auraLogNdcDepth(vec2 ndcXY, float viewDepth) {
  vec4 q = u_invProjMatrix * vec4(ndcXY, 0.0, 1.0);
  vec4 zColumn = u_invProjMatrix[2];
  float denominator = zColumn.z + viewDepth * zColumn.w;
  if (abs(denominator) < 1e-20) return 0.0;
  return -(q.z + viewDepth * q.w) / denominator;
}
`;

export const DEPTH_LINEARIZE_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_depth;
uniform vec2 u_outputSize;
uniform vec2 u_jitterClip;
out vec4 o_color;

${DEPTH_FUNCTIONS}

void main() {
  vec2 uv = gl_FragCoord.xy / u_outputSize;
  ivec2 size = textureSize(u_depth, 0);
  ivec2 pixel = clamp(ivec2(uv * vec2(size)), ivec2(0), size - ivec2(1));
  // Depth was rasterized with jitter but the inverse projection is physical.
  vec2 ndcXY = uv * 2.0 - 1.0 - u_jitterClip;
  float depth = texelFetch(u_depth, pixel, 0).r;
  o_color = vec4(auraLinearDepth(ndcXY, depth), 0.0, 0.0, 1.0);
}
`;

export const DEPTH_MINMAX_HALF_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_linearDepth;
out vec4 o_color;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  ivec2 last = textureSize(u_linearDepth, 0) - ivec2(1);
  float d00 = texelFetch(u_linearDepth, min(p, last), 0).r;
  float d10 = texelFetch(u_linearDepth, min(p + ivec2(1, 0), last), 0).r;
  float d01 = texelFetch(u_linearDepth, min(p + ivec2(0, 1), last), 0).r;
  float d11 = texelFetch(u_linearDepth, min(p + ivec2(1, 1), last), 0).r;
  o_color = vec4(min(min(d00, d10), min(d01, d11)),
                 max(max(d00, d10), max(d01, d11)), 0.0, 1.0);
}
`;

export const CAMERA_VELOCITY_GLSL = /* glsl */ `${HEADER}
uniform highp sampler2D u_depth;
uniform mat4 u_prevViewProjection;
uniform mat4 u_invUnjitteredViewProjection;
uniform vec2 u_jitterClip;
out vec4 o_color;

${DEPTH_FUNCTIONS}

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_depth, 0));
  // Remove raster jitter before applying the unjittered reprojection matrix.
  vec2 ndcCurr = uv * 2.0 - 1.0 - u_jitterClip;
  float d = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r;
  float linearDepth = auraLinearDepth(ndcCurr, d);
  if (linearDepth >= 2.9e38) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0); return;
  }
  float ndcZ = u_depthMode == 2 ? auraLogNdcDepth(ndcCurr, linearDepth) : auraNdcDepth(d);
  vec4 clipPrev = u_prevViewProjection * u_invUnjitteredViewProjection * vec4(ndcCurr, ndcZ, 1.0);
  if (abs(clipPrev.w) < 1e-20 || isnan(clipPrev.w)) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0); return;
  }
  vec2 velocity = (ndcCurr - clipPrev.xy / clipPrev.w) * 0.5;
  o_color = vec4(velocity, 0.0, 1.0);
}
`;
