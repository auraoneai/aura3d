/**
 * KHR_materials_iridescence thin-film evaluation.
 *
 * Aura integrates the Airy two-interface reflectance over 41 visible
 * wavelengths using the analytic CIE 1931 fits of Wyman, Sloan & Shirley,
 * JCGT 2013. The effective substrate index is derived from RGB F0; complex
 * conductor indices are outside this approximation. Factors and texture
 * channels follow the Khronos glTF material extension.
 *
 * WGSL companion provenance is tracked separately in physical-wgsl/.
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_IRIDESCENCE_WGSL from "../physical-wgsl/iridescence.wgsl.js";

const glsl = /* glsl */ `
vec3 a3dPrd04IridescenceFresnel0ToIor(vec3 f0) {
  vec3 root = sqrt(clamp(f0, 0.0, 0.9999));
  return (1.0 + root) / (1.0 - root);
}
vec3 a3dPrd04IridescenceIorToFresnel0(vec3 transmitted, float incident) {
  vec3 ratio = (transmitted - incident) / max(transmitted + incident, vec3(1e-6));
  return ratio * ratio;
}
float a3dPrd04IridescenceIorToFresnel0f(float transmitted, float incident) {
  float ratio = (transmitted - incident) / max(transmitted + incident, 1e-6);
  return ratio * ratio;
}

// Analytic approximation of the CIE 1931 2-degree color matching functions.
vec3 a3dPrd04CieXyz(float wavelength) {
  float x1 = (wavelength - 442.0) * (wavelength < 442.0 ? 0.0624 : 0.0374);
  float x2 = (wavelength - 599.8) * (wavelength < 599.8 ? 0.0264 : 0.0323);
  float x3 = (wavelength - 501.1) * (wavelength < 501.1 ? 0.0490 : 0.0382);
  float y1 = (wavelength - 568.8) * (wavelength < 568.8 ? 0.0213 : 0.0247);
  float y2 = (wavelength - 530.9) * (wavelength < 530.9 ? 0.0613 : 0.0322);
  float z1 = (wavelength - 437.0) * (wavelength < 437.0 ? 0.0845 : 0.0278);
  float z2 = (wavelength - 459.0) * (wavelength < 459.0 ? 0.0385 : 0.0725);
  return vec3(
    0.362 * exp(-0.5*x1*x1) + 1.056 * exp(-0.5*x2*x2) - 0.065 * exp(-0.5*x3*x3),
    0.821 * exp(-0.5*y1*y1) + 0.286 * exp(-0.5*y2*y2),
    1.217 * exp(-0.5*z1*z1) + 0.681 * exp(-0.5*z2*z2)
  );
}

vec3 a3dPrd04EvalIridescence(float outsideIOR, float filmIOR, float cosine, float thickness, vec3 baseF0) {
  float n1 = max(outsideIOR, 1e-4);
  float n2 = max(filmIOR, 1e-4);
  float c1 = clamp(cosine, 0.0001, 1.0);
  if (thickness <= 0.0) return F_Schlick(baseF0, 1.0, c1);
  float sin1Squared = max(1.0 - c1*c1, 0.0);
  float c2Squared = 1.0 - (n1*n1/(n2*n2))*sin1Squared;
  if (c2Squared <= 0.0) return vec3(1.0);
  float c2 = sqrt(c2Squared);
  vec3 n3 = n1 * a3dPrd04IridescenceFresnel0ToIor(baseF0);
  vec3 c3 = sqrt(max(vec3(1.0) - (n1*n1*sin1Squared)/(n3*n3), vec3(0.0)));
  float r12s = (n1*c1 - n2*c2) / max(n1*c1 + n2*c2, 1e-6);
  float r12p = (n2*c1 - n1*c2) / max(n2*c1 + n1*c2, 1e-6);
  vec3 r23s = (n2*c2 - n3*c3) / max(n2*c2 + n3*c3, vec3(1e-6));
  vec3 r23p = (n3*c2 - n2*c3) / max(n3*c2 + n2*c3, vec3(1e-6));
  mat3 xyzToRgb = mat3(
     3.2404542, -0.9692660,  0.0556434,
    -1.5371385,  1.8760108, -0.2040259,
    -0.4985314,  0.0415560,  1.0572252
  );
  vec3 total = vec3(0.0), normalization = vec3(0.0);
  for (int i = 0; i <= 40; i++) {
    float wavelength = 380.0 + 10.0 * float(i);
    float interference = cos(4.0 * PI * n2 * thickness * c2 / wavelength);
    vec3 ps = r12s * r23s, pp = r12p * r23p;
    vec3 reflectedS = (r12s*r12s + r23s*r23s + 2.0*ps*interference)
      / max(vec3(1.0) + ps*ps + 2.0*ps*interference, vec3(1e-6));
    vec3 reflectedP = (r12p*r12p + r23p*r23p + 2.0*pp*interference)
      / max(vec3(1.0) + pp*pp + 2.0*pp*interference, vec3(1e-6));
    vec3 weight = xyzToRgb * a3dPrd04CieXyz(wavelength);
    total += weight * 0.5 * (reflectedS + reflectedP);
    normalization += weight;
  }
  return clamp(total / max(normalization, vec3(1e-6)), 0.0, 1.0);
}

void a3dPrd04IridescenceInit(inout A3DPrd04Lobes lobes, float factor, float ior, vec4 factorTex,
  vec4 thicknessTex, float thicknessMin, float thicknessMax, vec3 specularColor,
  vec3 diffuseColor, float metalness, float dotNV) {
  lobes.iridescence = saturate(factor * factorTex.r);
  lobes.iridescenceIOR = max(ior, 1e-4);
  lobes.iridescenceThickness = mix(thicknessMin, thicknessMax, saturate(thicknessTex.g));
  if (lobes.iridescenceThickness <= 0.0) lobes.iridescence = 0.0;
  if (lobes.iridescence > 0.0) {
    vec3 dielectric = a3dPrd04EvalIridescence(1.0, lobes.iridescenceIOR, dotNV, lobes.iridescenceThickness, specularColor);
    vec3 metallic = a3dPrd04EvalIridescence(1.0, lobes.iridescenceIOR, dotNV, lobes.iridescenceThickness, diffuseColor);
    lobes.iridescenceFresnel = mix(dielectric, metallic, saturate(metalness));
    lobes.iridescenceF0 = Schlick_to_F0(lobes.iridescenceFresnel, 1.0, dotNV);
  } else {
    lobes.iridescenceFresnel = vec3(0.0);
    lobes.iridescenceF0 = vec3(0.0);
  }
}
vec3 a3dPrd04IridescenceFresnelMix(vec3 fresnel, vec3 filmFresnel, float strength) {
  return mix(fresnel, filmFresnel, saturate(strength));
}
void a3dPrd04ComputeMultiscatteringIridescence(vec3 normal, vec3 viewDir, vec3 specularColor,
  float specularF90, float iridescence, vec3 iridescenceF0, float roughness,
  inout vec3 singleScatter, inout vec3 multiScatter) {
  vec3 f0 = mix(specularColor, iridescenceF0, saturate(iridescence));
  a3dMultiscatter(normal, viewDir, f0, specularF90, roughness, singleScatter, multiScatter);
}
`;

export const A3D_PRD04_IRIDESCENCE: ShaderChunk = {
  name: "a3d_prd04_iridescence",
  owner: "prd04",
  glsl,
  wgsl: A3D_PRD04_IRIDESCENCE_WGSL,
  stage: "fragment",
  requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
