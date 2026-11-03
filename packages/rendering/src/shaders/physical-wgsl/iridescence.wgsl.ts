/**
 * WGSL companion to Aura's KHR_materials_iridescence implementation.
 * The Airy reflectance is integrated over 41 visible wavelengths using the
 * analytic CIE 1931 fits of Wyman, Sloan & Shirley, JCGT 2013. The substrate
 * index is estimated from RGB F0; complex conductor indices are not modeled.
 */
const wgsl = /* wgsl */ `
fn a3dPrd04IridescenceFresnel0ToIor(f0: vec3f) -> vec3f {
  let root = sqrt(clamp(f0, vec3f(0.0), vec3f(0.9999)));
  return (vec3f(1.0) + root) / (vec3f(1.0) - root);
}

fn a3dPrd04IridescenceIorToFresnel0(transmitted: vec3f, incident: f32) -> vec3f {
  let ratio = (transmitted - vec3f(incident)) / max(transmitted + vec3f(incident), vec3f(1e-6));
  return ratio * ratio;
}

fn a3dPrd04IridescenceIorToFresnel0f(transmitted: f32, incident: f32) -> f32 {
  let ratio = (transmitted - incident) / max(transmitted + incident, 1e-6);
  return ratio * ratio;
}

// Analytic approximation of the CIE 1931 2-degree color matching functions.
fn a3dPrd04CieXyz(wavelength: f32) -> vec3f {
  let x1 = (wavelength - 442.0) * select(0.0374, 0.0624, wavelength < 442.0);
  let x2 = (wavelength - 599.8) * select(0.0323, 0.0264, wavelength < 599.8);
  let x3 = (wavelength - 501.1) * select(0.0382, 0.0490, wavelength < 501.1);
  let y1 = (wavelength - 568.8) * select(0.0247, 0.0213, wavelength < 568.8);
  let y2 = (wavelength - 530.9) * select(0.0322, 0.0613, wavelength < 530.9);
  let z1 = (wavelength - 437.0) * select(0.0278, 0.0845, wavelength < 437.0);
  let z2 = (wavelength - 459.0) * select(0.0725, 0.0385, wavelength < 459.0);
  return vec3f(
    0.362 * exp(-0.5*x1*x1) + 1.056 * exp(-0.5*x2*x2) - 0.065 * exp(-0.5*x3*x3),
    0.821 * exp(-0.5*y1*y1) + 0.286 * exp(-0.5*y2*y2),
    1.217 * exp(-0.5*z1*z1) + 0.681 * exp(-0.5*z2*z2)
  );
}

fn a3dPrd04EvalIridescence(outsideIOR: f32, filmIOR: f32, cosine: f32, thickness: f32, baseF0: vec3f) -> vec3f {
  let n1 = max(outsideIOR, 1e-4);
  let n2 = max(filmIOR, 1e-4);
  let c1 = clamp(cosine, 0.0001, 1.0);
  if (thickness <= 0.0) {
    // Match the fifth-power Schlick term used by Aura's GLSL BRDF.
    let grazing = 1.0 - c1;
    let grazing2 = grazing * grazing;
    return baseF0 + (vec3f(1.0) - baseF0) * (grazing2 * grazing2 * grazing);
  }
  let sin1Squared = max(1.0 - c1*c1, 0.0);
  let c2Squared = 1.0 - (n1*n1/(n2*n2))*sin1Squared;
  if (c2Squared <= 0.0) { return vec3f(1.0); }
  let c2 = sqrt(c2Squared);
  let n3 = n1 * a3dPrd04IridescenceFresnel0ToIor(baseF0);
  let c3 = sqrt(max(vec3f(1.0) - vec3f(n1*n1*sin1Squared)/(n3*n3), vec3f(0.0)));
  let r12s = (n1*c1 - n2*c2) / max(n1*c1 + n2*c2, 1e-6);
  let r12p = (n2*c1 - n1*c2) / max(n2*c1 + n1*c2, 1e-6);
  let r23s = (vec3f(n2*c2) - n3*c3) / max(vec3f(n2*c2) + n3*c3, vec3f(1e-6));
  let r23p = (n3*c2 - n2*c3) / max(n3*c2 + n2*c3, vec3f(1e-6));
  let xyzToRgb = mat3x3f(
    vec3f( 3.2404542, -0.9692660,  0.0556434),
    vec3f(-1.5371385,  1.8760108, -0.2040259),
    vec3f(-0.4985314,  0.0415560,  1.0572252)
  );
  var total = vec3f(0.0);
  var normalization = vec3f(0.0);
  for (var i = 0; i <= 40; i++) {
    let wavelength = 380.0 + 10.0 * f32(i);
    let interference = cos(4.0 * PI * n2 * thickness * c2 / wavelength);
    let ps = r12s * r23s;
    let pp = r12p * r23p;
    let reflectedS = (vec3f(r12s*r12s) + r23s*r23s + 2.0*ps*interference)
      / max(vec3f(1.0) + ps*ps + 2.0*ps*interference, vec3f(1e-6));
    let reflectedP = (vec3f(r12p*r12p) + r23p*r23p + 2.0*pp*interference)
      / max(vec3f(1.0) + pp*pp + 2.0*pp*interference, vec3f(1e-6));
    let weight = xyzToRgb * a3dPrd04CieXyz(wavelength);
    total += weight * 0.5 * (reflectedS + reflectedP);
    normalization += weight;
  }
  return clamp(total / max(normalization, vec3f(1e-6)), vec3f(0.0), vec3f(1.0));
}

fn a3dPrd04IridescenceInit(lobes: ptr<function, A3DPrd04Lobes>, factor: f32, ior: f32, factorTex: vec4f, thicknessTex: vec4f, thicknessMin: f32, thicknessMax: f32, specularColor: vec3f, diffuseColor: vec3f, metalness: f32, dotNV: f32) {
  (*lobes).iridescence = saturate(factor * factorTex.r);
  (*lobes).iridescenceIOR = max(ior, 1e-4);
  (*lobes).iridescenceThickness = mix(thicknessMin, thicknessMax, saturate(thicknessTex.g));
  if ((*lobes).iridescenceThickness <= 0.0) { (*lobes).iridescence = 0.0; }
  if ((*lobes).iridescence > 0.0) {
    let dielectric = a3dPrd04EvalIridescence(1.0, (*lobes).iridescenceIOR, dotNV, (*lobes).iridescenceThickness, specularColor);
    let metallic = a3dPrd04EvalIridescence(1.0, (*lobes).iridescenceIOR, dotNV, (*lobes).iridescenceThickness, diffuseColor);
    (*lobes).iridescenceFresnel = mix(dielectric, metallic, saturate(metalness));
    (*lobes).iridescenceF0 = clamp(Schlick_to_F0((*lobes).iridescenceFresnel, 1.0, dotNV), vec3f(0.0), vec3f(1.0));
  } else {
    (*lobes).iridescenceFresnel = vec3f(0.0);
    (*lobes).iridescenceF0 = vec3f(0.0);
  }
}

fn a3dPrd04IridescenceFresnelMix(fresnel: vec3f, filmFresnel: vec3f, strength: f32) -> vec3f {
  return mix(fresnel, filmFresnel, saturate(strength));
}

// The same bounded DFG energy allocation as Aura's GLSL a3dMultiscatter.
fn a3dPrd04ComputeMultiscatteringIridescence(normal: vec3f, viewDir: vec3f, specularColor: vec3f, specularF90: f32, iridescence: f32, iridescenceF0: vec3f, roughness: f32, singleScatter: ptr<function, vec3f>, multiScatter: ptr<function, vec3f>) {
  let f0 = mix(specularColor, iridescenceF0, saturate(iridescence));
  let coefficients = saturate(a3dDFG(saturate(roughness), saturate(dot(normal, viewDir))));
  let single = saturate(f0 * coefficients.x + vec3f(specularF90 * coefficients.y));
  let missing = 1.0 - saturate(coefficients.x + coefficients.y);
  let average = saturate(f0 + (vec3f(specularF90) - f0) / 21.0);
  let multiple = min(vec3f(1.0) - single, missing * average);
  *singleScatter += single;
  *multiScatter += multiple;
}
`;

export const A3D_PRD04_IRIDESCENCE_WGSL = wgsl;
export default wgsl;
