/**
 * Independent, test-only BRDF candidate. This is not connected to a renderer.
 *
 * Sources: Walter et al., Microfacet Models for Refraction through Rough
 * Surfaces, EGSR 2007, §§3, 5 (GGX and reflection):
 * https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf
 * Heitz, Understanding the Masking-Shadowing Function in Microfacet-Based
 * BRDFs, JCGT 2014, §§3, 6 (correlated Smith masking):
 * https://jcgt.org/published/0003/02/03/paper.pdf
 * Schlick, An Inexpensive BRDF Model for Physically-Based Rendering, 1994
 * (fifth-power Fresnel approximation): https://doi.org/10.1111/1467-8659.1330233
 *
 * Directions are expected to be unit length and point away from the surface;
 * irradiance is already cosine-projected. Roughness is perceptual, so the GGX
 * slope parameter is roughness squared. A 0.001 slope floor regularizes the
 * mirror delta distribution. The inverse Fresnel is indeterminate at exactly
 * grazing incidence and is regularized there rather than claiming an inverse.
 * The generic EPSILON is provisionally 1e-6, a positive floor for the
 * visibility denominator; it is not a claim about the migration contract or
 * a universal tolerance. Other operations have separate, stated safeguards.
 *
 * Aura's generated DFG layout uses coordinates (perceptual roughness, N dot V)
 * and channels (coefficient of F0, coefficient of F90). This candidate samples
 * level zero; filtering and texel-center behavior still require compatibility
 * review. The caller must supply a compatible preintegrated texture. Multiscattering
 * uses an approximate directional energy compensation, not the exact
 * multiple-bounce solution, and needs an independent compatibility review.
 */
export const NATIVE_BRDF_SHIM_CHUNK = {
  name: "brdf",
  owner: "prd04",
  stage: "fragment",
  glsl: /* glsl */ `
uniform sampler2D u_dfgLut;

const float PI = 3.141592653589793;
const float RECIPROCAL_PI = 1.0 / PI;
const float EPSILON = 0.000001;

struct PhysicalMaterial {
  vec3 diffuseColor;
  vec3 diffuseContribution;
  vec3 specularColor;
  vec3 specularColorBlended;
  float roughness;
  float metalness;
  float specularF90;
  float dispersion;
  float clearcoat;
  float clearcoatRoughness;
  vec3 clearcoatF0;
  float clearcoatF90;
  float iridescence;
  float iridescenceIOR;
  float iridescenceThickness;
  vec3 iridescenceFresnel;
  vec3 iridescenceF0;
  vec3 iridescenceFresnelDielectric;
  vec3 iridescenceFresnelMetallic;
  vec3 sheenColor;
  float sheenRoughness;
  float ior;
  float transmission;
  float transmissionAlpha;
  float thickness;
  float attenuationDistance;
  vec3 attenuationColor;
  float anisotropy;
  float alphaT;
  vec3 anisotropyT;
  vec3 anisotropyB;
};

float saturate(const in float a) { return clamp(a, 0.0, 1.0); }
vec3 saturate(const in vec3 a) { return clamp(a, vec3(0.0), vec3(1.0)); }
float pow2(const in float x) { return x * x; }
vec3 pow2(const in vec3 x) { return x * x; }
float pow3(const in float x) { return x * x * x; }
float pow4(const in float x) { return pow2(pow2(x)); }
float max3(const in vec3 v) { return max(max(v.x, v.y), v.z); }
float max4(const in vec4 v) { return max(max(v.x, v.y), max(v.z, v.w)); }

vec3 F_Schlick(const in vec3 f0, const in float f90, const in float dotVH) {
  float m = 1.0 - saturate(dotVH);
  float weight = pow4(m) * m;
  return f0 + (vec3(f90) - f0) * weight;
}
float F_Schlick(const in float f0, const in float f90, const in float dotVH) {
  float m = 1.0 - saturate(dotVH);
  float weight = pow4(m) * m;
  return f0 + (f90 - f0) * weight;
}
vec3 Schlick_to_F0(const in vec3 f, const in float f90, const in float dotVH) {
  float m = 1.0 - saturate(dotVH);
  float weight = pow4(m) * m;
  return (f - vec3(f90) * weight) / max(1.0 - weight, 0.00001);
}
vec3 BRDF_Lambert(const in vec3 diffuseColor) {
  return diffuseColor * RECIPROCAL_PI;
}
vec2 a3dDFG(const in float roughness, const in float dotNX) {
  return textureLod(u_dfgLut, vec2(saturate(roughness), saturate(dotNX)), 0.0).rg;
}
float V_GGX_SmithCorrelated(const in float alpha, const in float dotNL, const in float dotNV) {
  float a = clamp(alpha, 0.001, 1.0);
  float a2 = a * a;
  float nl = saturate(dotNL);
  float nv = saturate(dotNV);
  float left = nl * sqrt(nv * nv * (1.0 - a2) + a2);
  float right = nv * sqrt(nl * nl * (1.0 - a2) + a2);
  return 0.5 / max(left + right, EPSILON);
}
float D_GGX(const in float alpha, const in float dotNH) {
  float a = clamp(alpha, 0.001, 1.0);
  float c = saturate(dotNH);
  float c2 = c * c;
  float denom = (1.0 - c2) + a * a * c2;
  return (a * a) / (PI * denom * denom);
}
vec3 BRDF_GGX(const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal,
  const in vec3 specularColorBlended, const in float specularF90, const in float roughness) {
  vec3 hsum = lightDir + viewDir;
  vec3 h = hsum * inversesqrt(max(dot(hsum, hsum), 0.000000000001));
  float nl = saturate(dot(normal, lightDir));
  float nv = saturate(dot(normal, viewDir));
  float nh = saturate(dot(normal, h));
  float vh = saturate(dot(viewDir, h));
  float a = max(saturate(roughness) * saturate(roughness), 0.001);
  return F_Schlick(specularColorBlended, specularF90, vh) *
    (D_GGX(a, nh) * V_GGX_SmithCorrelated(a, nl, nv) *
     step(0.0000001, nl) * step(0.0000001, nv));
}
vec3 EnvironmentBRDF(const in vec3 normal, const in vec3 viewDir,
  const in vec3 specularColor, const in float specularF90, const in float roughness) {
  vec2 coefficients = a3dDFG(roughness, dot(normal, viewDir));
  return specularColor * coefficients.x + vec3(specularF90 * coefficients.y);
}
vec3 BRDF_GGX_Multiscatter(const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal,
  const in vec3 specularColorBlended, const in float specularF90, const in float roughness) {
  vec2 coefficients = a3dDFG(roughness, dot(normal, viewDir));
  float energy = clamp(coefficients.x + coefficients.y, 0.001, 1.0);
  vec3 averageFresnel = saturate(specularColorBlended +
    (vec3(specularF90) - specularColorBlended) / 21.0);
  vec3 correction = vec3(1.0) + averageFresnel * ((1.0 - energy) / energy);
  return BRDF_GGX(lightDir, viewDir, normal, specularColorBlended, specularF90, roughness) * correction;
}
vec3 a3dDirectSpecular(const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal,
  const in vec3 irradiance, const in vec3 specularColorBlended, const in float specularF90,
  const in float roughness) {
  return irradiance * BRDF_GGX(lightDir, viewDir, normal, specularColorBlended, specularF90, roughness);
}
vec3 a3dDirectLight(const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal,
  const in vec3 irradiance, const in vec3 diffuseContribution, const in vec3 specularColorBlended,
  const in float specularF90, const in float roughness) {
  float nl = saturate(dot(normal, lightDir));
  float nv = saturate(dot(normal, viewDir));
  return irradiance * BRDF_Lambert(diffuseContribution) * step(0.0000001, nl) * step(0.0000001, nv) +
    a3dDirectSpecular(lightDir, viewDir, normal, irradiance, specularColorBlended, specularF90, roughness);
}
`,
} as const;
