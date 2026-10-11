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

// r185 common.glsl.js F_Schlick: Epic's exp2 fit (SIGGRAPH '13), not pow5 (01-S8).
vec3 F_Schlick(vec3 f0, float f90, float dotVH) { float f = exp2((-5.55473 * dotVH - 6.98316) * dotVH); return f0 * (1.0 - f) + f90 * f; }
// Scalar overload + inverse (r185 bsdfs.glsl.js F_Schlick / Schlick_to_F0) for
// the C-03 iridescence lobe (lane 04 Q-01-5).
float F_Schlick(float f0, float f90, float dotVH) { float f = exp2((-5.55473 * dotVH - 6.98316) * dotVH); return f0 * (1.0 - f) + f90 * f; }
vec3 Schlick_to_F0(vec3 f, float f90, float dotVH) {
  float x = clamp(1.0 - dotVH, 0.0, 1.0);
  float x2 = x * x;
  float x5 = clamp(x * x2 * x2, 0.0, 0.9999);
  return (f - vec3(f90) * x5) / (1.0 - x5);
}

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

// Indirect: verbatim three r185 computeMultiscattering + RE_IndirectSpecular_Physical
// (lights_physical_pars_fragment.glsl.js:392-421, 590-627; no clearcoat/sheen/
// iridescence). Multiscatter runs for the dielectric specularColor and the
// metallic base colour (both with specularF90), mixed by metallic. 'radiance' is
// the prefiltered env sample, 'irradiance' the pi-scaled diffuse irradiance
// (probe normalization is lane 02 C-09).
void a3dMultiscatter(vec3 N, vec3 V, vec3 specularColor, float specularF90, float roughness, inout vec3 singleScatter, inout vec3 multiScatter) {
  vec2 fab = a3dDFG(roughness, saturate(dot(N, V)));
  vec3 FssEss = specularColor * fab.x + specularF90 * fab.y;
  float Ems = 1.0 - (fab.x + fab.y);
  vec3 Favg = specularColor + (1.0 - specularColor) * 0.047619; // 1/21
  vec3 Fms = FssEss * Favg / (1.0 - Ems * Favg);
  singleScatter += FssEss;
  multiScatter += Fms * Ems;
}

vec3 a3dIndirectSpecular(vec3 radiance, vec3 irradiance, vec3 V, vec3 N, PhysicalMaterial m) {
  vec3 singleDielectric = vec3(0.0), multiDielectric = vec3(0.0);
  vec3 singleMetallic = vec3(0.0), multiMetallic = vec3(0.0);
  a3dMultiscatter(N, V, m.specularColor, m.specularF90, m.roughness, singleDielectric, multiDielectric);
  a3dMultiscatter(N, V, m.baseColor, m.specularF90, m.roughness, singleMetallic, multiMetallic);
  vec3 single = mix(singleDielectric, singleMetallic, m.metallic);
  vec3 multi = mix(multiDielectric, multiMetallic, m.metallic);
  return radiance * single + multi * (irradiance * RECIPROCAL_PI);
}

// Indirect diffuse: r185 diffuse energy conservation uses the dielectric path only
// (diffuseContribution is already 0 for metals).
vec3 a3dIndirectDiffuse(vec3 irradiance, vec3 V, vec3 N, PhysicalMaterial m) {
  vec3 singleDielectric = vec3(0.0), multiDielectric = vec3(0.0);
  a3dMultiscatter(N, V, m.specularColor, m.specularF90, m.roughness, singleDielectric, multiDielectric);
  vec3 remaining = m.diffuseContribution * (vec3(1.0) - (singleDielectric + multiDielectric));
  return remaining * (irradiance * RECIPROCAL_PI);
}
`;
