/**
 * Independent, unwired WGSL sheen candidate. This string depends on the caller
 * declaring A3DPrd04Lobes with the fields in the independent API contract.
 * It has not been compiled as WGSL or validated against renderer output.
 *
 * Mathematical provenance (equations, not shader source):
 * - Conty Estevez and Kulla, "Production Friendly Microfacet Sheen BRDF",
 *   section 2, equation 2: the normalized sinusoidal microfacet distribution.
 *   https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf
 * - Neubelt and Pettineo, "Crafting a Next-Gen Material Pipeline for The
 *   Order: 1886", Cloth Shading, equation 23: the softened visibility divisor.
 *   https://blog.selfshadow.com/publications/s2013-shading-course/rad/s2013_pbs_rad_notes.pdf
 * - Khronos KHR_materials_sheen: perceptual roughness squared, linear decoded
 *   color texture RGB and roughness texture alpha.
 *   https://github.com/KhronosGroup/glTF/blob/59ecbdba704206bb656965ab4e202881806066f1/extensions/2.0/Khronos/KHR_materials_sheen/README.md
 * - Walter et al., "Microfacet Models for Refraction through Rough Surfaces",
 *   section 4, for the reflection half-vector change of variables:
 *   https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf
 *
 * Assumptions/approximations: direction inputs are unit length, color is
 * linear, and an absent texture is supplied as vec4f(1). Distribution
 * roughness is floored at 0.001, and the visibility divisor at 0.0001. The
 * BRDF uses the colored sheen as its angle-independent Fresnel approximation.
 * Direct returns the BRDF, without the caller's cosine or light radiance.
 *
 * Aura-authored real-arithmetic energy bound, independent of shader sources:
 * for p = 1 / max(roughness², .001), the Charlie D is at most (p+2)/(2π),
 * and the visibility times N·L is at most 1/4. Thus the hemispherical
 * reflectance is at most (p+2)/4. A second bound changes variables from L to
 * the half-vector H, whose Jacobian is 4(V·H). If μ=N·H, the integral is at
 * most integral D(H) max(V·H, 0) dωH. Decomposing V into its tangent and
 * normal components bounds it by C*sqrt(1-(N·V)²)+(N·V), where
 * C=(p+2)/sqrt(2π(p+1)). This follows from integrating the positive cosine
 * in azimuth and (1-μ²)^((p+1)/2) <= exp(-(p+1)μ²/2), then extending the
 * resulting Gaussian integral to infinity. Its maximum over N·V is
 * sqrt(1+C²). The smaller of the two bounds applies at every view. Multiplying
 * the BRDF by 0.98/max(1, bound) is reciprocal and bounds each unit-color
 * directional reflectance by 0.98 in exact arithmetic. The 2% reserve is not
 * a measured bound on GPU floating-point or transcendental error.
 *
 * A tighter view-dependent upper bound also uses Jensen's inequality:
 * integral_0^1 x/(nv+(1-nv)x) dx <= 1/(1+nv). It controls conservative
 * substrate compensation. For an energy-bounded substrate, the symmetric
 * direct compensation and sheen preserve the unit directional-energy bound
 * for a uniform unit-radiance incident hemisphere in exact arithmetic.
 *
 * IBL evaluates the same scaled BRDF using 16 x 32 midpoint samples. For
 * nv=N·V, the view-adaptive substitution N·L=(1-nv)t²+nv*t concentrates
 * samples near the horizon for grazing views and becomes uniform in N·L at
 * normal view; its Jacobian is 2(1-nv)t+nv. Per call this
 * is exactly 512 D/pow evaluations, 512 half-vector inverse square roots and
 * up to 1024 sin/cos evaluations, plus 16 radial square roots and scalar
 * setup; no lookup data is used. The sum is clamped to the analytic upper
 * bound. Both the true albedo and estimate are between zero and that bound,
 * so their absolute difference is at most the bound, itself <= 0.98 in exact
 * arithmetic; relative error is unbounded near zero. This worst-case bound is
 * deliberately conservative and does not imply a useful GPU performance or
 * error budget. In exact arithmetic each direct BRDF channel is also below
 * 391,000 under the stated input bounds; a BRDF peak may exceed one even when
 * its integrated energy does not. See the numerical tests for sampled error.
 * Indirect uses irradiance / pi as the incident radiance of a uniform
 * environment; it does not reproduce arbitrary directional environments.
 * Compensation uses the largest sheen color channel and the analytic bound,
 * rather than trusting quadrature as an upper bound. The attenuation can be
 * overly dark; this is not an exact layered-material model.
 * The host must resolve its own color decoding, lobe composition, roughness
 * conventions, shader inclusion, WGSL/f32 validation, and performance budget.
 */
export const A3D_PRD04_SHEEN_WGSL = /* wgsl */ `
fn a3dPrd04SheenInit(lobes: ptr<function, A3DPrd04Lobes>, sheenColorFactor: vec3f, sheenRoughnessFactor: f32, colorTex: vec4f, roughnessTex: vec4f) {
  (*lobes).sheenColor = vec3f(
    clamp(sheenColorFactor.x * colorTex.x, 0.0, 1.0),
    clamp(sheenColorFactor.y * colorTex.y, 0.0, 1.0),
    clamp(sheenColorFactor.z * colorTex.z, 0.0, 1.0)
  );
  (*lobes).sheenRoughness = clamp(sheenRoughnessFactor * roughnessTex.w, 0.0, 1.0);
}

fn a3dPrd04DCharlie(roughness: f32, dotNH: f32) -> f32 {
  let perceptualRoughness = clamp(roughness, 0.0, 1.0);
  let distributionRoughness = max(perceptualRoughness * perceptualRoughness, 0.001);
  let exponent = 1.0 / distributionRoughness;
  let nh = clamp(dotNH, 0.0, 1.0);
  let sinSquared = max(1.0 - nh * nh, 0.0);
  return (2.0 + exponent) * pow(sinSquared, 0.5 * exponent) / (2.0 * 3.141592653589793);
}

fn a3dPrd04VNeubelt(dotNV: f32, dotNL: f32) -> f32 {
  let nv = clamp(dotNV, 0.0, 1.0);
  let nl = clamp(dotNL, 0.0, 1.0);
  let projected = max(nv + nl - nv * nl, 0.0001);
  return 1.0 / (4.0 * projected);
}

fn a3dPrd04SheenEnergyScale(roughness: f32) -> f32 {
  let r = clamp(roughness, 0.0, 1.0);
  let p = 1.0 / max(r * r, 0.001);
  let c = (p + 2.0) * inverseSqrt(2.0 * 3.141592653589793 * (p + 1.0));
  let globalBound = min((p + 2.0) / 4.0, sqrt(1.0 + c * c));
  return 0.98 / max(1.0, globalBound);
}

fn a3dPrd04SheenAlbedoBound(dotNV: f32, roughness: f32) -> f32 {
  let nv = clamp(dotNV, 0.0, 1.0);
  let r = clamp(roughness, 0.0, 1.0);
  let p = 1.0 / max(r * r, 0.001);
  let c = (p + 2.0) * inverseSqrt(2.0 * 3.141592653589793 * (p + 1.0));
  let halfVectorBound = sqrt(max(1.0 - nv * nv, 0.0)) * c + nv;
  let densityBound = (p + 2.0) / (4.0 * (1.0 + nv));
  return clamp(a3dPrd04SheenEnergyScale(roughness) * min(halfVectorBound, densityBound), 0.0, 0.98);
}

fn a3dPrd04SheenDirect(lightDir: vec3f, viewDir: vec3f, normal: vec3f, sheenColor: vec3f, sheenRoughness: f32) -> vec3f {
  let nv = dot(normal, viewDir);
  let nl = dot(normal, lightDir);
  if (nv < 0.0 || nl < 0.0) {
    return vec3f(0.0, 0.0, 0.0);
  }
  let hx = lightDir.x + viewDir.x;
  let hy = lightDir.y + viewDir.y;
  let hz = lightDir.z + viewDir.z;
  let halfLengthSquared = hx * hx + hy * hy + hz * hz;
  if (halfLengthSquared < 0.000000000001) {
    return vec3f(0.0, 0.0, 0.0);
  }
  let nh = clamp((normal.x * hx + normal.y * hy + normal.z * hz) * inverseSqrt(halfLengthSquared), 0.0, 1.0);
  let scale = a3dPrd04SheenEnergyScale(sheenRoughness) * a3dPrd04DCharlie(sheenRoughness, nh) * a3dPrd04VNeubelt(nv, nl);
  return vec3f(
    clamp(sheenColor.x, 0.0, 1.0) * scale,
    clamp(sheenColor.y, 0.0, 1.0) * scale,
    clamp(sheenColor.z, 0.0, 1.0) * scale
  );
}

fn a3dPrd04IBLSheen(dotNV: f32, roughness: f32) -> f32 {
  let nv = clamp(dotNV, 0.0, 1.0);
  let vx = sqrt(max(1.0 - nv * nv, 0.0));
  var sum = 0.0;
  for (var i = 0; i < 16; i = i + 1) {
    let t = (f32(i) + 0.5) / 16.0;
    let nl = (1.0 - nv) * t * t + nv * t;
    let jacobian = 2.0 * (1.0 - nv) * t + nv;
    let radial = sqrt(max(1.0 - nl * nl, 0.0));
    let visibility = a3dPrd04VNeubelt(nv, nl);
    for (var j = 0; j < 32; j = j + 1) {
      let phi = (f32(j) + 0.5) * (2.0 * 3.141592653589793 / 32.0);
      let hx = vx + radial * cos(phi);
      let hy = radial * sin(phi);
      let hz = nv + nl;
      let halfLengthSquared = hx * hx + hy * hy + hz * hz;
      let nh = clamp(hz * inverseSqrt(max(halfLengthSquared, 0.000000000001)), 0.0, 1.0);
      sum = sum + a3dPrd04DCharlie(roughness, nh) * visibility * nl * jacobian;
    }
  }
  let albedo = sum * (2.0 * 3.141592653589793 / 512.0) * a3dPrd04SheenEnergyScale(roughness);
  return clamp(albedo, 0.0, a3dPrd04SheenAlbedoBound(nv, roughness));
}

fn a3dPrd04SheenIndirect(normal: vec3f, viewDir: vec3f, sheenRoughness: f32, sheenColor: vec3f, irradiance: vec3f) -> vec3f {
  let nv = dot(normal, viewDir);
  if (nv < 0.0) {
    return vec3f(0.0, 0.0, 0.0);
  }
  let scale = a3dPrd04IBLSheen(nv, sheenRoughness) / 3.141592653589793;
  return vec3f(
    max(irradiance.x, 0.0) * clamp(sheenColor.x, 0.0, 1.0) * scale,
    max(irradiance.y, 0.0) * clamp(sheenColor.y, 0.0, 1.0) * scale,
    max(irradiance.z, 0.0) * clamp(sheenColor.z, 0.0, 1.0) * scale
  );
}

fn a3dPrd04SheenEnergyCompensation(normal: vec3f, viewDir: vec3f, lightDir: vec3f, sheenColor: vec3f, sheenRoughness: f32) -> f32 {
  let nv = dot(normal, viewDir);
  let nl = dot(normal, lightDir);
  if (nv < 0.0 || nl < 0.0) {
    return 1.0;
  }
  let intensity = clamp(max(sheenColor.x, max(sheenColor.y, sheenColor.z)), 0.0, 1.0);
  let directionalAlbedo = max(a3dPrd04SheenAlbedoBound(nv, sheenRoughness), a3dPrd04SheenAlbedoBound(nl, sheenRoughness));
  return clamp(1.0 - intensity * directionalAlbedo, 0.0, 1.0);
}

fn a3dPrd04SheenEnergyCompensationIndirect(normal: vec3f, viewDir: vec3f, sheenColor: vec3f, sheenRoughness: f32) -> f32 {
  let nv = dot(normal, viewDir);
  if (nv < 0.0) {
    return 1.0;
  }
  let intensity = clamp(max(sheenColor.x, max(sheenColor.y, sheenColor.z)), 0.0, 1.0);
  return clamp(1.0 - intensity * a3dPrd04SheenAlbedoBound(nv, sheenRoughness), 0.0, 1.0);
}
`;

export default A3D_PRD04_SHEEN_WGSL;
