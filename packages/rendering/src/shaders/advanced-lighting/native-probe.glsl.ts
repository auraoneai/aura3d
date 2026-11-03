/**
 * Load-only consumer for NativeLightProbeGrid.renderData(). The caller binds
 * an RGBA32F 2D texture and validated grid metadata. RGB is linear incident
 * radiance in the producer's real-SH9 order; alpha is unused. The result is
 * linear cosine-integrated irradiance and a separate spatial influence.
 * Bounds and inputs are world-space; outside the inclusive bounds influence
 * is zero. A singleton axis samples its only probe throughout the bounds.
 *
 * This chunk only supplies shader functions. A renderer must opt in, validate
 * and bind the live resource, and compose the result into its indirect light.
 */
export const NATIVE_PROBE_GLSL = /* glsl */ `
vec3 a3dNativeProbeLoad(sampler2D source, ivec3 index, int coefficient, ivec3 dimensions) {
  return texelFetch(source, ivec2(index.x * 9 + coefficient, index.y + index.z * dimensions.y), 0).rgb;
}

vec3 a3dNativeProbeCoefficient(sampler2D source, ivec3 lo, ivec3 hi, vec3 f, int coefficient, ivec3 dimensions) {
  vec3 z0y0 = mix(a3dNativeProbeLoad(source, ivec3(lo.x, lo.y, lo.z), coefficient, dimensions),
                   a3dNativeProbeLoad(source, ivec3(hi.x, lo.y, lo.z), coefficient, dimensions), f.x);
  vec3 z0y1 = mix(a3dNativeProbeLoad(source, ivec3(lo.x, hi.y, lo.z), coefficient, dimensions),
                   a3dNativeProbeLoad(source, ivec3(hi.x, hi.y, lo.z), coefficient, dimensions), f.x);
  vec3 z1y0 = mix(a3dNativeProbeLoad(source, ivec3(lo.x, lo.y, hi.z), coefficient, dimensions),
                   a3dNativeProbeLoad(source, ivec3(hi.x, lo.y, hi.z), coefficient, dimensions), f.x);
  vec3 z1y1 = mix(a3dNativeProbeLoad(source, ivec3(lo.x, hi.y, hi.z), coefficient, dimensions),
                   a3dNativeProbeLoad(source, ivec3(hi.x, hi.y, hi.z), coefficient, dimensions), f.x);
  return mix(mix(z0y0, z0y1, f.y), mix(z1y0, z1y1, f.y), f.z);
}

vec4 a3dNativeProbeIrradiance(sampler2D source, vec3 world, vec3 normal,
                              vec3 boundsMin, vec3 boundsMax, ivec3 dimensions) {
  if (any(lessThan(world, boundsMin)) || any(greaterThan(world, boundsMax))) return vec4(0.0);
  float length2 = dot(normal, normal);
  if (!(length2 > 1e-20)) return vec4(0.0);
  vec3 n = normal * inversesqrt(length2);
  vec3 position = clamp((world - boundsMin) / (boundsMax - boundsMin) * vec3(dimensions - 1),
                        vec3(0.0), vec3(dimensions - 1));
  ivec3 lo = ivec3(floor(position));
  ivec3 hi = min(lo + ivec3(1), dimensions - 1);
  vec3 f = position - vec3(lo);
  // Y_lm times the Lambertian convolution [pi, 2*pi/3, pi/4].
  float basis[9];
  basis[0] = 0.886226925452758;
  basis[1] = -1.023326707946489 * n.y;
  basis[2] = 1.023326707946489 * n.z;
  basis[3] = -1.023326707946489 * n.x;
  basis[4] = 0.858085530809783 * n.x * n.y;
  basis[5] = 0.858085530809783 * n.y * n.z;
  basis[6] = 0.247707956100376 * (3.0 * n.z * n.z - 1.0);
  basis[7] = 0.858085530809783 * n.x * n.z;
  basis[8] = 0.429042765404892 * (n.x * n.x - n.y * n.y);
  vec3 irradiance = vec3(0.0);
  for (int k = 0; k < 9; k += 1) {
    irradiance += a3dNativeProbeCoefficient(source, lo, hi, f, k, dimensions) * basis[k];
  }
  return vec4(max(irradiance, vec3(0.0)), 1.0);
}
`;
