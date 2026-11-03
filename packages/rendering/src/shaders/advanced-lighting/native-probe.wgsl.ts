/** WGSL twin of NATIVE_PROBE_GLSL; the texture requires no sampler. */
export const NATIVE_PROBE_WGSL = /* wgsl */ `
fn a3dNativeProbeLoad(source: texture_2d<f32>, index: vec3i, coefficient: i32, dimensions: vec3i) -> vec3f {
  return textureLoad(source, vec2i(index.x * 9 + coefficient, index.y + index.z * dimensions.y), 0).rgb;
}

fn a3dNativeProbeCoefficient(source: texture_2d<f32>, lo: vec3i, hi: vec3i, f: vec3f, coefficient: i32, dimensions: vec3i) -> vec3f {
  let z0y0 = mix(a3dNativeProbeLoad(source, vec3i(lo.x, lo.y, lo.z), coefficient, dimensions),
                 a3dNativeProbeLoad(source, vec3i(hi.x, lo.y, lo.z), coefficient, dimensions), f.x);
  let z0y1 = mix(a3dNativeProbeLoad(source, vec3i(lo.x, hi.y, lo.z), coefficient, dimensions),
                 a3dNativeProbeLoad(source, vec3i(hi.x, hi.y, lo.z), coefficient, dimensions), f.x);
  let z1y0 = mix(a3dNativeProbeLoad(source, vec3i(lo.x, lo.y, hi.z), coefficient, dimensions),
                 a3dNativeProbeLoad(source, vec3i(hi.x, lo.y, hi.z), coefficient, dimensions), f.x);
  let z1y1 = mix(a3dNativeProbeLoad(source, vec3i(lo.x, hi.y, hi.z), coefficient, dimensions),
                 a3dNativeProbeLoad(source, vec3i(hi.x, hi.y, hi.z), coefficient, dimensions), f.x);
  return mix(mix(z0y0, z0y1, f.y), mix(z1y0, z1y1, f.y), f.z);
}

fn a3dNativeProbeIrradiance(source: texture_2d<f32>, world: vec3f, normal: vec3f,
                             boundsMin: vec3f, boundsMax: vec3f, dimensions: vec3i) -> vec4f {
  if (any(world < boundsMin) || any(world > boundsMax)) { return vec4f(0.0); }
  let length2 = dot(normal, normal);
  if (!(length2 > 1e-20)) { return vec4f(0.0); }
  let n = normal * inverseSqrt(length2);
  let position = clamp((world - boundsMin) / (boundsMax - boundsMin) * vec3f(dimensions - vec3i(1)),
                       vec3f(0.0), vec3f(dimensions - vec3i(1)));
  let lo = vec3i(floor(position));
  let hi = min(lo + vec3i(1), dimensions - vec3i(1));
  let f = position - vec3f(lo);
  var basis = array<f32, 9>(
    0.886226925452758,
    -1.023326707946489 * n.y,
    1.023326707946489 * n.z,
    -1.023326707946489 * n.x,
    0.858085530809783 * n.x * n.y,
    0.858085530809783 * n.y * n.z,
    0.247707956100376 * (3.0 * n.z * n.z - 1.0),
    0.858085530809783 * n.x * n.z,
    0.429042765404892 * (n.x * n.x - n.y * n.y)
  );
  var irradiance = vec3f(0.0);
  for (var k = 0; k < 9; k += 1) {
    irradiance += a3dNativeProbeCoefficient(source, lo, hi, f, k, dimensions) * basis[k];
  }
  return vec4f(max(irradiance, vec3f(0.0)), 1.0);
}
`;
