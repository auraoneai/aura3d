/**
 * `brdf` chunk (PRD-01 §8.3) — PhysicalMaterial + r185 GGX multiscatter.
 *
 * Ports three.js r185 `lights_physical_fragment`/`lights_physical_pars_fragment`
 * per the PRD: IOR-derived F0, Lambert default (Burley behind DIFFUSE_BURLEY),
 * specular AA behind SPECULAR_AA, verbatim `BRDF_GGX_Multiscatter`, and the
 * dielectric/metallic indirect split. `u_dfgLut` is a renderer-owned r185
 * DFGLUTData 16x16 RG16F texture, always bound for lit generated programs and
 * sampled at (roughness, dotNV) — opposite of the legacy Aura lookup.
 */

export const BRDF_CHUNK_GLSL = /* glsl */ `
struct PhysicalMaterial {
  vec3 diffuseContribution;   // baseColor * (1 - metallic)
  vec3 baseColor; float metallic; float roughness;
  vec3 specularColor;         // dielectric F0 (IBL dielectric path)
  vec3 specularColorBlended;  // mix(F0, baseColor, metallic) (direct light; IBL metallic path uses baseColor)
  float specularF90; float ior; float specularIntensity;
};

PhysicalMaterial a3dMakeMaterial(vec3 baseColor, float metallic, float roughness, float ior,
                                 float specularIntensity, vec3 specularColorFactor, vec3 geometryNormal) {
  PhysicalMaterial m;
  m.baseColor = baseColor; m.metallic = metallic;
  m.diffuseContribution = baseColor * (1.0 - metallic);
#ifdef SPECULAR_AA
  vec3 dxy = max(abs(dFdx(geometryNormal)), abs(dFdy(geometryNormal)));   // non-normal-mapped normal
  float geometryRoughness = max(max(dxy.x, dxy.y), dxy.z);
  m.roughness = min(max(roughness, 0.0525) + geometryRoughness, 1.0);
#else
  m.roughness = clamp(roughness, 0.0525, 1.0);
#endif
  m.specularColor = min(vec3(pow2((ior - 1.0) / (ior + 1.0))) * specularColorFactor, vec3(1.0)) * specularIntensity;
  m.specularColorBlended = mix(m.specularColor, baseColor, metallic);
  m.specularF90 = mix(specularIntensity, 1.0, metallic);
  m.ior = ior; m.specularIntensity = specularIntensity;
  return m;
}

vec3 F_Schlick(vec3 f0, float f90, float dotVH) { float f = pow(1.0 - dotVH, 5.0); return f0 * (1.0 - f) + f90 * f; }

float V_GGX_SmithCorrelated(float a, float dotNL, float dotNV) {
  float a2 = pow2(a);
  float gv = dotNL * sqrt(a2 + (1.0 - a2) * pow2(dotNV));
  float gl = dotNV * sqrt(a2 + (1.0 - a2) * pow2(dotNL));
  return 0.5 / max(gv + gl, EPSILON);
}

float D_GGX(float a, float dotNH) { float a2 = pow2(a); float d = pow2(dotNH) * (a2 - 1.0) + 1.0; return RECIPROCAL_PI * a2 / pow2(d); }

uniform sampler2D u_dfgLut; // renderer-owned r185 DFGLUTData (16x16 RG16F, linear, clamp); bound for every lit program
vec2 a3dDFG(float roughness, float dotNV) { return texture(u_dfgLut, vec2(roughness, dotNV)).rg; } // x=roughness, y=dotNV (three r185)

#ifdef DIFFUSE_BURLEY
// Disney Burley (normalized form used by three r185 BRDF_Burley).
float a3dBurleyTerm(vec3 N, vec3 V, vec3 L, float roughness) {
  vec3 H = normalize(V + L);
  float dotNL = saturate(dot(N, L));
  float dotNV = saturate(dot(N, V));
  float dotLH = saturate(dot(L, H));
  float fd90 = 0.5 + 2.0 * dotLH * dotLH * roughness;
  float lightScatter = (1.0 + (fd90 - 1.0) * pow(1.0 - dotNL, 5.0));
  float viewScatter = (1.0 + (fd90 - 1.0) * pow(1.0 - dotNV, 5.0));
  return lightScatter * viewScatter;
}
#endif

vec3 a3dDirectSpecular(vec3 L, vec3 V, vec3 N, PhysicalMaterial m) {
  vec3 H = normalize(L + V);
  float dotNL = saturate(dot(N, L));
  float dotNV = saturate(dot(N, V));
  float dotNH = saturate(dot(N, H));
  float dotVH = saturate(dot(V, H));
  float a = pow2(m.roughness);
  vec3 F = F_Schlick(m.specularColorBlended, m.specularF90, dotVH);
  vec3 single = F * (V_GGX_SmithCorrelated(a, dotNL, dotNV) * D_GGX(a, dotNH));
  // Verbatim port of three r185 BRDF_GGX_Multiscatter (lights_physical_pars_fragment.glsl.js:424-460).
  vec2 dfgV = a3dDFG(m.roughness, dotNV);
  vec2 dfgL = a3dDFG(m.roughness, dotNL);
  vec3 FssEss_V = m.specularColorBlended * dfgV.x + m.specularF90 * dfgV.y;
  vec3 FssEss_L = m.specularColorBlended * dfgL.x + m.specularF90 * dfgL.y;
  float Ems_V = 1.0 - (dfgV.x + dfgV.y);
  float Ems_L = 1.0 - (dfgL.x + dfgL.y);
  vec3 Favg = m.specularColorBlended + (1.0 - m.specularColorBlended) * 0.047619;
  vec3 Fms = FssEss_V * FssEss_L * Favg / (1.0 - Ems_V * Ems_L * Favg + EPSILON);
  return single + Fms * (Ems_V * Ems_L);
}

void a3dDirectLight(vec3 L, vec3 radiance, vec3 V, vec3 N, PhysicalMaterial m, inout vec3 diffuseOut, inout vec3 specularOut) {
  float dotNL = saturate(dot(N, L));
  vec3 irradiance = radiance * dotNL;
#ifdef DIFFUSE_BURLEY
  diffuseOut += irradiance * BRDF_Lambert(m.diffuseContribution) * a3dBurleyTerm(N, V, L, m.roughness);
#else
  diffuseOut += irradiance * BRDF_Lambert(m.diffuseContribution);
#endif
  specularOut += irradiance * a3dDirectSpecular(L, V, N, m);
}

// Indirect specular: three r185 RE_IndirectSpecular_Physical — multiscatter is run
// separately with the dielectric specularColor and the metallic base color, mixed
// by metallic. 'radiance' is the env sample (probe normalization is lane 02 C-09).
vec3 a3dIndirectSpecular(vec3 radiance, vec3 V, vec3 N, PhysicalMaterial m) {
  float dotNV = saturate(dot(N, V));
  vec2 dfg = a3dDFG(m.roughness, dotNV);
  vec3 singleDielectric = m.specularColor * dfg.x + m.specularF90 * dfg.y;
  vec3 singleMetallic = m.baseColor * dfg.x + dfg.y;
  vec3 single = mix(singleDielectric, singleMetallic, m.metallic);
  // Multiscatter per r185 computeMultiscattering on both lobes.
  vec3 FavgDielectric = m.specularColor + (1.0 - m.specularColor) * 0.047619;
  vec3 FavgMetallic = m.baseColor + (1.0 - m.baseColor) * 0.047619;
  float Ems = 1.0 - (dfg.x + dfg.y);
  vec3 multiDielectric = singleDielectric * FavgDielectric / (1.0 - Ems * FavgDielectric + EPSILON) * Ems;
  vec3 multiMetallic = singleMetallic * FavgMetallic / (1.0 - Ems * FavgMetallic + EPSILON) * Ems;
  vec3 multi = mix(multiDielectric, multiMetallic, m.metallic);
  return radiance * (single + multi);
}

// Ambient/env diffuse: irradiance is cosine-weighted (RECIPROCAL_PI inside Lambert);
// weighted down by the dielectric specular energy like r185 (single+multi terms).
vec3 a3dIndirectDiffuse(vec3 irradiance, vec3 V, vec3 N, PhysicalMaterial m) {
  float dotNV = saturate(dot(N, V));
  vec2 dfg = a3dDFG(m.roughness, dotNV);
  vec3 singleDielectric = m.specularColor * dfg.x + m.specularF90 * dfg.y;
  vec3 FavgDielectric = m.specularColor + (1.0 - m.specularColor) * 0.047619;
  float Ems = 1.0 - (dfg.x + dfg.y);
  vec3 multiDielectric = singleDielectric * FavgDielectric / (1.0 - Ems * FavgDielectric + EPSILON) * Ems;
  vec3 remaining = m.diffuseContribution * (vec3(1.0) - mix(singleDielectric + multiDielectric, vec3(0.0), m.metallic));
  return irradiance * RECIPROCAL_PI * remaining;
}
`;
