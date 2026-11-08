/**
 * Aura's layered dielectric/metal BRDF.
 *
 * The direct lobe uses a GGX microfacet distribution, Smith masking and
 * Schlick's fifth-power Fresnel approximation. The optional rough diffuse
 * response follows the Oren–Nayar angular model (sigma in radians); a bounded
 * retroreflection control redistributes that diffuse response toward the
 * light/view alignment. Layer budgets are kept in [0, 1].
 *
 * The DFG texture stores the independently integrated split-sum coefficients
 * at (roughness, N dot V). The missing single-scatter energy is returned as a
 * bounded, broad multiple-scatter lobe. This deliberately uses no external
 * renderer implementation or lookup values.
 */
export const BRDF_CHUNK_GLSL = /* glsl */ `
struct PhysicalMaterial {
  vec3 diffuseContribution;
  vec3 baseColor; float metallic; float roughness;
  vec3 specularColor;
  vec3 specularColorBlended;
  float diffuseRoughness;
  float specularF90; float ior; float specularIntensity;
};

uniform sampler2D u_dfgLut;
// Both default to zero in WebGL when omitted. Values outside [0,1] are clamped.
uniform float u_diffuseRoughness;
uniform float u_retroreflection;
// Multiple-scattering colour (program/directMultiscatter.ts): 0 = single mean Fresnel, 1 = Kulla-Conty (direct) and
// Fdez-Aguera (image-based), as three.js computes it.
uniform float u_a3dMultiscatterKullaConty;

float a3dPow5(float x) { float x2 = x * x; return x2 * x2 * x; }
vec3 a3dHalfVector(vec3 a, vec3 b, vec3 fallback) {
  vec3 sum = a + b;
  float lengthSquared = dot(sum, sum);
  return lengthSquared > EPSILON ? sum * inversesqrt(lengthSquared) : fallback;
}

PhysicalMaterial a3dMakeMaterial(vec3 baseColor, float metallic, float roughness, float ior,
                                 float specularIntensity, vec3 specularColorFactor, vec3 geometryNormal) {
  PhysicalMaterial m;
  m.baseColor = max(baseColor, vec3(0.0));
  m.metallic = saturate(metallic);
  m.diffuseContribution = min(m.baseColor, vec3(1.0)) * (1.0 - m.metallic);
  float aa = 0.0;
#ifdef SPECULAR_AA
  vec3 grad = max(abs(dFdx(geometryNormal)), abs(dFdy(geometryNormal)));
  aa = max(grad.x, max(grad.y, grad.z));
#endif
  m.roughness = clamp(roughness + aa, 0.0525, 1.0);
  m.diffuseRoughness = saturate(u_diffuseRoughness);
  m.ior = max(ior, 0.0001);
  m.specularIntensity = saturate(specularIntensity);
  float reflectance = (m.ior - 1.0) / (m.ior + 1.0);
  m.specularColor = saturate(reflectance * reflectance * max(specularColorFactor, vec3(0.0))) * m.specularIntensity;
  m.specularColorBlended = mix(m.specularColor, min(m.baseColor, vec3(1.0)), m.metallic);
  m.specularF90 = mix(m.specularIntensity, 1.0, m.metallic);
  return m;
}

vec3 F_Schlick(vec3 f0, float f90, float cosine) {
  return f0 + (vec3(f90) - f0) * a3dPow5(1.0 - saturate(cosine));
}
float F_Schlick(float f0, float f90, float cosine) {
  return f0 + (f90 - f0) * a3dPow5(1.0 - saturate(cosine));
}
vec3 Schlick_to_F0(vec3 reflected, float f90, float cosine) {
  float grazing = min(a3dPow5(1.0 - saturate(cosine)), 0.9999);
  return clamp((reflected - vec3(f90 * grazing)) / (1.0 - grazing), 0.0, 1.0);
}

float D_GGX(float alpha, float nDotH) {
  float a = max(alpha, 0.0001);
  float c = saturate(nDotH);
  float denominator = 1.0 + c * c * (a * a - 1.0);
  return (a * a * RECIPROCAL_PI) / max(denominator * denominator, 1e-12);
}
float V_GGX_SmithCorrelated(float alpha, float nDotL, float nDotV) {
  float a2 = max(alpha * alpha, 1e-8);
  float nl = saturate(nDotL), nv = saturate(nDotV);
  float lambdaV = nl * sqrt(a2 + (1.0 - a2) * nv * nv);
  float lambdaL = nv * sqrt(a2 + (1.0 - a2) * nl * nl);
  return 0.5 / max(lambdaV + lambdaL, EPSILON);
}
vec2 a3dDFG(float roughness, float nDotV) {
  return clamp(texture(u_dfgLut, vec2(saturate(roughness), saturate(nDotV))).rg, 0.0, 1.0);
}

// Conservative Oren–Nayar angular response. Clamping prevents the diffuse
// layer from borrowing energy from its specular layer at grazing angles.
float a3dRoughDiffuse(vec3 N, vec3 V, vec3 L, float roughness, float retroreflection) {
  float nl = saturate(dot(N, L));
  float nv = saturate(dot(N, V));
  float sinL = sqrt(max(1.0 - nl * nl, 0.0));
  float sinV = sqrt(max(1.0 - nv * nv, 0.0));
  float tangentAlignment = 0.0;
  if (sinL * sinV > EPSILON) {
    tangentAlignment = max(dot(L - N * nl, V - N * nv) / (sinL * sinV), 0.0);
  }
  float sigma = saturate(roughness) * (0.5 * PI);
  float sigma2 = sigma * sigma;
  float a = 1.0 - 0.5 * sigma2 / (sigma2 + 0.33);
  float b = 0.45 * sigma2 / (sigma2 + 0.09);
  float sinAlpha = max(sinL, sinV);
  float tanBeta = min(sinL, sinV) / max(max(nl, nv), EPSILON);
  float diffuse = clamp(a + b * tangentAlignment * sinAlpha * tanBeta, 0.0, 1.0);
  float retro = saturate(retroreflection);
  // Aligned L/V receives the original energy, other directions decrease.
  float alignment = pow(saturate(dot(L, V)), 8.0);
  return diffuse * (1.0 - retro * (1.0 - alignment));
}

#ifdef DIFFUSE_BURLEY
float a3dBurleyTerm(vec3 N, vec3 V, vec3 L, float roughness) {
  vec3 H = a3dHalfVector(V, L, N);
  float grazing = 0.5 + 2.0 * pow2(saturate(dot(L, H))) * saturate(roughness);
  float lightResponse = 1.0 + (grazing - 1.0) * a3dPow5(1.0 - saturate(dot(N, L)));
  float viewResponse = 1.0 + (grazing - 1.0) * a3dPow5(1.0 - saturate(dot(N, V)));
  return clamp(lightResponse * viewResponse, 0.0, 1.0);
}
#endif

vec3 a3dDirectSpecular(vec3 L, vec3 V, vec3 N, PhysicalMaterial m) {
  float nl = saturate(dot(N, L)), nv = saturate(dot(N, V));
  if (nl <= 0.0 || nv <= 0.0) return vec3(0.0);
  vec3 H = a3dHalfVector(L, V, N);
  float alpha = m.roughness * m.roughness;
  vec3 fresnel = F_Schlick(m.specularColorBlended, m.specularF90, dot(V, H));
  vec3 single = fresnel * D_GGX(alpha, dot(N, H)) * V_GGX_SmithCorrelated(alpha, nl, nv);
  // Return part of the single-scatter deficit as a broad energy-bounded lobe.
  vec2 viewLut = a3dDFG(m.roughness, nv);
  vec2 lightLut = a3dDFG(m.roughness, nl);
  float viewMissing = 1.0 - saturate(viewLut.x + viewLut.y);
  float lightMissing = 1.0 - saturate(lightLut.x + lightLut.y);
  vec3 meanFresnel = saturate(m.specularColorBlended + (vec3(m.specularF90) - m.specularColorBlended) / 21.0);
  vec3 lobeFresnel = meanFresnel;
  if (u_a3dMultiscatterKullaConty > 0.5) {
    // Kulla-Conty: light the first bounce misses leaves after at least one more microfacet reflection, so the lobe is
    // coloured by Favg^2 Eavg / (1 - Favg (1 - Eavg)): 1 for metals, about 0.0035 for a 0.04 dielectric (a single mean
    // Fresnel adds ~0.025 linear of white to a roughness-1 dielectric under a lone directional light).
    vec2 averageLut = a3dDFG(m.roughness, 0.7);
    float averageAlbedo = saturate(averageLut.x + averageLut.y);
    lobeFresnel = meanFresnel * meanFresnel * averageAlbedo / max(vec3(1.0) - meanFresnel * (1.0 - averageAlbedo), vec3(EPSILON));
  }
  return single + lobeFresnel * (viewMissing * lightMissing * RECIPROCAL_PI);
}

void a3dDirectLight(vec3 L, vec3 radiance, vec3 V, vec3 N, PhysicalMaterial m, inout vec3 diffuseOut, inout vec3 specularOut) {
  float nl = saturate(dot(N, L)), nv = saturate(dot(N, V));
  if (nl <= 0.0 || nv <= 0.0) return;
  vec3 irradiance = max(radiance, vec3(0.0)) * nl;
  vec3 viewFresnel = F_Schlick(m.specularColorBlended, m.specularF90, nv);
  vec3 lightFresnel = F_Schlick(m.specularColorBlended, m.specularF90, nl);
  vec3 available = vec3(1.0) - saturate(max(viewFresnel, lightFresnel));
  float diffuse = a3dRoughDiffuse(N, V, L, m.diffuseRoughness, u_retroreflection);
#ifdef DIFFUSE_BURLEY
  diffuse *= a3dBurleyTerm(N, V, L, m.roughness);
#endif
  diffuseOut += irradiance * m.diffuseContribution * available * (diffuse * RECIPROCAL_PI);
  specularOut += irradiance * a3dDirectSpecular(L, V, N, m);
}

void a3dMultiscatter(vec3 N, vec3 V, vec3 specularColor, float specularF90, float roughness, inout vec3 singleScatter, inout vec3 multiScatter) {
  vec2 coefficients = a3dDFG(roughness, dot(N, V));
  vec3 single = saturate(specularColor * coefficients.x + specularF90 * coefficients.y);
  float missing = 1.0 - saturate(coefficients.x + coefficients.y);
  vec3 average = saturate(specularColor + (vec3(specularF90) - specularColor) / 21.0);
  // The broad lobe receives at most the energy absent from the first bounce.
  vec3 multiple = min(vec3(1.0) - single, missing * average);
  if (u_a3dMultiscatterKullaConty > 0.5) {
    // Fdez-Aguera: the missing energy leaves after further bounces, each weighted by the mean Fresnel, so a dielectric
    // returns far less of it than a metal (three.js computeMultiscattering).
    multiple = min(vec3(1.0) - single, single * average * missing / max(vec3(1.0) - missing * average, vec3(EPSILON)));
  }
  singleScatter += single;
  multiScatter += multiple;
}
vec3 a3dIndirectSpecular(vec3 radiance, vec3 irradiance, vec3 V, vec3 N, PhysicalMaterial m) {
  vec3 single = vec3(0.0), multiple = vec3(0.0);
  a3dMultiscatter(N, V, m.specularColorBlended, m.specularF90, m.roughness, single, multiple);
  return max(radiance, vec3(0.0)) * single + max(irradiance, vec3(0.0)) * RECIPROCAL_PI * multiple;
}
vec3 a3dIndirectDiffuse(vec3 irradiance, vec3 V, vec3 N, PhysicalMaterial m) {
  vec3 single = vec3(0.0), multiple = vec3(0.0);
  a3dMultiscatter(N, V, m.specularColor, m.specularF90, m.roughness, single, multiple);
  vec3 available = max(vec3(1.0) - single - multiple, vec3(0.0));
  return max(irradiance, vec3(0.0)) * RECIPROCAL_PI * m.diffuseContribution * available;
}
`;
