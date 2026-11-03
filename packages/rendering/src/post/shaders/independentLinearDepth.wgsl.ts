/**
 * Linear view-distance preparation from a single-sample hardware depth view.
 *
 * The host supplies endpoint coefficients obtained from the active inverse
 * projection. For a perspective projection inverse distance is affine in
 * window depth; for an orthographic projection distance itself is affine.
 * Interpolating endpoint values avoids subtracting nearly equal projection
 * coefficients at the far end of the range.
 *
 * One variant reads a binary coverage attachment. The other requires the
 * caller to establish that the clear encoding cannot also contain geometry.
 * Invalid samples become zero and uncovered samples become the configured
 * sky threshold. This module does not resolve MSAA.
 */
function linearDepthShader(hasCoverage: boolean): string {
  const coverageBinding = hasCoverage ? "@group(0) @binding(2) var depthCoverage: texture_2d<f32>;" : "";
  const classifyCoverage = hasCoverage ? `
  let coverage = textureLoad(depthCoverage, vec2<i32>(position.xy), 0).r;
  if (coverage == 0.0) {
    return vec4<f32>(params.skyDepth, 0.0, 0.0, 1.0);
  }
  if (coverage != 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
` : "";
  const classifyClear = hasCoverage ? "" : `
  if (depth == params.clearDepth) {
    return vec4<f32>(params.skyDepth, 0.0, 0.0, 1.0);
  }
`;
  return /* wgsl */ `
struct LinearDepthParameters {
  nearValue: f32,
  farValue: f32,
  maxGeometryDepth: f32,
  skyDepth: f32,
  clearDepth: f32,
  perspective: u32,
  reversed: u32,
  padding: u32,
};

@group(0) @binding(0) var<uniform> params: LinearDepthParameters;
@group(0) @binding(1) var hardwareDepth: texture_depth_2d;
${coverageBinding}

@fragment
fn fs_linear_depth(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  ${classifyCoverage}
  let depth = textureLoad(hardwareDepth, vec2<i32>(position.xy), 0);
  if (!(depth >= 0.0 && depth <= 1.0)) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  ${classifyClear}

  var nearWeight = 1.0 - depth;
  var farWeight = depth;
  if (params.reversed != 0u) {
    nearWeight = depth;
    farWeight = 1.0 - depth;
  }
  let mixed = nearWeight * params.nearValue + farWeight * params.farValue;
  var metres = mixed;
  if (params.perspective != 0u) {
    if (!(mixed > 0.0)) {
      return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    metres = 1.0 / mixed;
  }

  // These comparisons reject NaN, infinities, subnormal values and values
  // outside the declared scene contract without clamping valid geometry.
  if (!(metres >= 1.1754943508222875e-38 && metres <= params.maxGeometryDepth)) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  return vec4<f32>(metres, 0.0, 0.0, 1.0);
}
`;
}

/** Clear-value route, available only with an explicit noncollision guarantee. */
export const INDEPENDENT_LINEAR_DEPTH_WGSL = linearDepthShader(false);
/** Coverage route; covered clear-depth samples are reconstructed as geometry. */
export const INDEPENDENT_LINEAR_DEPTH_COVERAGE_WGSL = linearDepthShader(true);
