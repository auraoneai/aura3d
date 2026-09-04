#version 300 es
// @aura3d-shader:pbr-direct
precision highp float;
struct A3DLight {
  vec4 colorIntensity;
  vec4 positionRange;
  vec4 directionKind;
};
vec3 a3dLambert(vec3 normal, vec3 lightDirection, vec3 lightColor, float intensity) {
  float ndotl = max(dot(normalize(normal), normalize(lightDirection)), 0.0);
  return lightColor * intensity * ndotl;
}
const float A3D_PI = 3.14159265359;
const float A3D_INV_PI = 0.31830988618;
const float A3D_EPSILON = 0.00001;
const float A3D_MIN_ROUGHNESS = 0.045;
float a3dSaturate(float value) {
  return clamp(value, 0.0, 1.0);
}
vec3 a3dFresnelSchlick(vec3 f0, float vDotH) {
  float f = pow(a3dSaturate(1.0 - vDotH), 5.0);
  return f0 + (1.0 - f0) * f;
}
vec3 a3dFresnelSchlickSpecular(vec3 f0, float vDotH, float specularFactor) {
  float f = pow(a3dSaturate(1.0 - vDotH), 5.0);
  vec3 f90 = vec3(max(clamp(specularFactor, 0.0, 1.0), max(max(f0.r, f0.g), f0.b)));
  return f0 + (f90 - f0) * f;
}
vec3 a3dFresnelSchlickRoughness(vec3 f0, float nDotV, float roughness) {
  float smoothness = 1.0 - clamp(roughness, 0.0, 1.0);
  return f0 + (max(vec3(smoothness), f0) - f0) * pow(a3dSaturate(1.0 - nDotV), 5.0);
}
vec3 a3dFresnelSchlickRoughnessSpecular(vec3 f0, float nDotV, float roughness, float specularFactor) {
  float smoothness = 1.0 - clamp(roughness, 0.0, 1.0);
  vec3 f90 = vec3(max(clamp(smoothness * specularFactor, 0.0, 1.0), max(max(f0.r, f0.g), f0.b)));
  return f0 + (f90 - f0) * pow(a3dSaturate(1.0 - nDotV), 5.0);
}
float a3dDistributionGGX(float nDotH, float roughness) {
  float alpha = max(roughness, A3D_MIN_ROUGHNESS);
  alpha *= alpha;
  float alpha2 = alpha * alpha;
  float nDotH2 = nDotH * nDotH;
  float denom = nDotH2 * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(A3D_PI * denom * denom, A3D_EPSILON);
}
float a3dGeometrySmithGGXCorrelated(float nDotV, float nDotL, float roughness) {
  float alpha = max(roughness, A3D_MIN_ROUGHNESS);
  alpha *= alpha;
  float alpha2 = alpha * alpha;
  float lambdaV = nDotL * sqrt(max((nDotV - alpha2 * nDotV) * nDotV + alpha2, A3D_EPSILON));
  float lambdaL = nDotV * sqrt(max((nDotL - alpha2 * nDotL) * nDotL + alpha2, A3D_EPSILON));
  return 0.5 / max(lambdaV + lambdaL, A3D_EPSILON);
}
float a3dDiffuseBurley(float nDotV, float nDotL, float lDotH, float roughness) {
  float energyBias = mix(0.0, 0.5, roughness);
  float energyFactor = mix(1.0, 1.0 / 1.51, roughness);
  float fd90 = energyBias + 2.0 * lDotH * lDotH * roughness;
  float lightScatter = 1.0 + (fd90 - 1.0) * pow(a3dSaturate(1.0 - nDotL), 5.0);
  float viewScatter = 1.0 + (fd90 - 1.0) * pow(a3dSaturate(1.0 - nDotV), 5.0);
  return lightScatter * viewScatter * energyFactor;
}
vec3 a3dPbrF0(vec3 albedo, float metallic, float specularFactor, vec3 specularColorFactor) {
  vec3 dielectricF0 = vec3(0.04) * clamp(specularFactor, 0.0, 1.0) * clamp(specularColorFactor, vec3(0.0), vec3(1.0));
  return mix(dielectricF0, clamp(albedo, vec3(0.0), vec3(1.0)), clamp(metallic, 0.0, 1.0));
}
vec3 a3dPbrDirectLight(
  vec3 normal,
  vec3 viewDirection,
  vec3 lightDirection,
  vec3 lightColor,
  float lightIntensity,
  vec3 albedo,
  float metallic,
  float roughness,
  float specularFactor,
  vec3 specularColorFactor
) {
  vec3 N = normalize(normal);
  vec3 V = normalize(viewDirection);
  vec3 L = normalize(lightDirection);
  vec3 H = normalize(V + L);
  float nDotL = a3dSaturate(dot(N, L));
  float nDotV = max(a3dSaturate(dot(N, V)), A3D_EPSILON);
  float nDotH = a3dSaturate(dot(N, H));
  float vDotH = a3dSaturate(dot(V, H));
  float lDotH = a3dSaturate(dot(L, H));
  vec3 f0 = a3dPbrF0(albedo, metallic, specularFactor, specularColorFactor);
  vec3 F = a3dFresnelSchlickSpecular(f0, vDotH, specularFactor);
  float D = a3dDistributionGGX(nDotH, roughness);
  float G = a3dGeometrySmithGGXCorrelated(nDotV, nDotL, roughness);
  vec3 specular = D * G * F;
  vec3 kd = (vec3(1.0) - F) * (1.0 - clamp(metallic, 0.0, 1.0));
  vec3 diffuse = kd * albedo * A3D_INV_PI * a3dDiffuseBurley(nDotV, nDotL, lDotH, clamp(roughness, 0.0, 1.0));
  return (diffuse + specular) * lightColor * lightIntensity * nDotL;
}
vec3 a3dPbrRectAreaLightSample(
  vec3 worldPosition,
  vec3 samplePosition,
  vec3 emitterNormal,
  float range,
  float sampleArea,
  vec3 normal,
  vec3 viewDirection,
  vec3 lightColor,
  float lightIntensity,
  vec3 albedo,
  float metallic,
  float roughness,
  float specularFactor,
  vec3 specularColorFactor
) {
  vec3 toSample = samplePosition - worldPosition;
  float distanceToSample = length(toSample);
  vec3 lightDirection = distanceToSample > A3D_EPSILON ? toSample / distanceToSample : -normalize(emitterNormal);
  float emitterCosine = max(dot(normalize(emitterNormal), -lightDirection), 0.0);
  float rangeFalloff = clamp(1.0 - pow(distanceToSample / max(range, A3D_EPSILON), 4.0), 0.0, 1.0);
  rangeFalloff *= rangeFalloff;
  float irradiance = lightIntensity * sampleArea * emitterCosine * rangeFalloff / max(distanceToSample * distanceToSample, 0.01);
  return a3dPbrDirectLight(
    normal,
    viewDirection,
    lightDirection,
    lightColor,
    irradiance,
    albedo,
    metallic,
    roughness,
    specularFactor,
    specularColorFactor
  );
}
// Two-point Gauss-Legendre quadrature on each rectangle axis integrates the
// finite emitter without reducing it to a point or directional-light proxy.
vec3 a3dPbrRectAreaLight(
  vec3 worldPosition,
  vec3 center,
  vec3 emitterNormal,
  vec3 emitterRight,
  vec3 emitterUp,
  float width,
  float height,
  float range,
  vec3 normal,
  vec3 viewDirection,
  vec3 lightColor,
  float lightIntensity,
  vec3 albedo,
  float metallic,
  float roughness,
  float specularFactor,
  vec3 specularColorFactor
) {
  float quadratureOffset = 0.28867513459;
  vec3 rightOffset = normalize(emitterRight) * width * quadratureOffset;
  vec3 upOffset = normalize(emitterUp) * height * quadratureOffset;
  float sampleArea = width * height * 0.25;
  return
    a3dPbrRectAreaLightSample(worldPosition, center - rightOffset - upOffset, emitterNormal, range, sampleArea, normal, viewDirection, lightColor, lightIntensity, albedo, metallic, roughness, specularFactor, specularColorFactor) +
    a3dPbrRectAreaLightSample(worldPosition, center + rightOffset - upOffset, emitterNormal, range, sampleArea, normal, viewDirection, lightColor, lightIntensity, albedo, metallic, roughness, specularFactor, specularColorFactor) +
    a3dPbrRectAreaLightSample(worldPosition, center - rightOffset + upOffset, emitterNormal, range, sampleArea, normal, viewDirection, lightColor, lightIntensity, albedo, metallic, roughness, specularFactor, specularColorFactor) +
    a3dPbrRectAreaLightSample(worldPosition, center + rightOffset + upOffset, emitterNormal, range, sampleArea, normal, viewDirection, lightColor, lightIntensity, albedo, metallic, roughness, specularFactor, specularColorFactor);
}
vec3 a3dPbrEnvironmentLight(
  vec3 normal,
  vec3 viewDirection,
  vec3 diffuseIrradiance,
  vec3 specularRadiance,
  vec3 albedo,
  float metallic,
  float roughness,
  float specularFactor,
  vec3 specularColorFactor
) {
  float nDotV = max(a3dSaturate(dot(normalize(normal), normalize(viewDirection))), A3D_EPSILON);
  vec3 f0 = a3dPbrF0(albedo, metallic, specularFactor, specularColorFactor);
  vec3 F = a3dFresnelSchlickRoughnessSpecular(f0, nDotV, roughness, specularFactor);
  vec3 kd = (vec3(1.0) - F) * (1.0 - clamp(metallic, 0.0, 1.0));
  vec3 diffuse = kd * albedo * diffuseIrradiance;
  vec3 specular = specularRadiance * F;
  return diffuse + specular;
}
vec3 a3dPbrEnvironmentLightSplitSum(
  vec3 normal,
  vec3 viewDirection,
  vec3 diffuseIrradiance,
  vec3 specularRadiance,
  vec2 environmentBrdf,
  vec3 albedo,
  float metallic,
  float roughness,
  float specularFactor,
  vec3 specularColorFactor
) {
  float nDotV = max(a3dSaturate(dot(normalize(normal), normalize(viewDirection))), A3D_EPSILON);
  vec3 f0 = a3dPbrF0(albedo, metallic, specularFactor, specularColorFactor);
  vec2 brdf = clamp(environmentBrdf, vec2(0.0), vec2(1.0));
  float hasSplitSum = step(0.0001, brdf.x + brdf.y);
  vec3 fallbackFresnel = a3dFresnelSchlickRoughnessSpecular(f0, nDotV, roughness, specularFactor);
  float f90 = mix(clamp(specularFactor, 0.0, 1.0), 1.0, clamp(metallic, 0.0, 1.0));
  vec3 singleScatter = f0 * brdf.x + vec3(f90 * brdf.y);
  float ess = brdf.x + brdf.y;
  float ems = 1.0 - ess;
  vec3 favg = f0 + (vec3(1.0) - f0) * (1.0 / 21.0);
  vec3 multiScatter = singleScatter * favg / max(vec3(1.0) - ems * favg, vec3(A3D_EPSILON)) * ems;
  vec3 scattering = mix(fallbackFresnel, singleScatter + multiScatter, hasSplitSum);
  vec3 kd = (vec3(1.0) - scattering) * (1.0 - clamp(metallic, 0.0, 1.0));
  vec3 diffuse = kd * albedo * diffuseIrradiance;
  vec3 specular = specularRadiance * scattering;
  return diffuse + specular;
}
vec3 a3dApplyMetalRough(vec3 baseColor, float metallic, float roughness) {
  float dielectric = clamp(1.0 - metallic, 0.0, 1.0);
  float energy = mix(0.08, 1.0, dielectric) * (1.0 - clamp(roughness, 0.0, 1.0) * 0.35);
  return baseColor * energy;
}
vec3 a3dApplyAdvancedPbrLobes(
  vec3 baseColor,
  float clearcoatFactor,
  float clearcoatRoughnessFactor,
  float transmissionFactor,
  float diffuseTransmissionFactor,
  vec3 diffuseTransmissionColorFactor,
  float transmissionFallbackEnergy,
  float volumeThicknessFactor,
  float volumeAttenuationDistance,
  vec3 volumeAttenuationColor,
  float ior,
  float specularFactor,
  vec3 specularColorFactor,
  vec3 sheenColorFactor,
  float sheenRoughnessFactor,
  float anisotropyStrength,
  float anisotropyRotation,
  float iridescenceFactor,
  float iridescenceIor,
  float iridescenceThicknessMinimum,
  float iridescenceThicknessMaximum,
  float dispersion
) {
  float clearcoatRoughness = max(clamp(clearcoatRoughnessFactor, 0.0, 1.0), 0.04);
  float clearcoat = clamp(clearcoatFactor, 0.0, 1.0);
  float transmission = clamp(transmissionFactor, 0.0, 1.0);
  float diffuseTransmission = clamp(diffuseTransmissionFactor, 0.0, 1.0) * (1.0 - transmission);
  float volumeThickness = max(volumeThicknessFactor, 0.0);
  float volumeTravel = clamp(volumeThickness / max(volumeAttenuationDistance, 0.0001), 0.0, 16.0);
  vec3 volumeAttenuation = pow(clamp(volumeAttenuationColor, vec3(0.0001), vec3(1.0)), vec3(volumeTravel));
  float iorBoost = clamp((ior - 1.0) / 1.5, 0.0, 1.0);
  float specular = clamp(specularFactor, 0.0, 1.0);
  float sheenRoughness = clamp(sheenRoughnessFactor, 0.0, 1.0);
  float sheen = 1.0 - sheenRoughness;
  vec3 transmitted = mix(baseColor, vec3(dot(baseColor, vec3(0.2126, 0.7152, 0.0722))), transmission * 0.35);
  transmitted = mix(transmitted, clamp(diffuseTransmissionColorFactor, vec3(0.0), vec3(1.0)), diffuseTransmission);
  transmitted = mix(transmitted, transmitted * volumeAttenuation, transmission * step(0.0001, volumeThickness));
  float fallbackEnergy = clamp(transmissionFallbackEnergy, 0.0, 1.0);
  // The WebGL fallback has no scene-color refraction; keep clear glass from turning into a bright white plate.
  float fallbackTransmissionEnergy = mix(1.0, fallbackEnergy, transmission);
  float fallbackSpecularEnergy = mix(1.0, max(fallbackEnergy < 0.079 ? clamp(fallbackEnergy * 8.0, 0.0, 1.0) : fallbackEnergy, 0.18), transmission);
  float thickIorTransmissionLift = mix(1.0, 1.28, iorBoost * transmission * smoothstep(0.45, 1.0, volumeThickness));
  transmitted *= fallbackTransmissionEnergy * thickIorTransmissionLift;
  float iorF0 = pow((max(ior, 1.0) - 1.0) / (max(ior, 1.0) + 1.0), 2.0);
  float specularGloss = pow(1.0 - clearcoatRoughness, 2.0);
  vec3 specularLobe = clamp(specularColorFactor, vec3(0.0), vec3(1.0))
    * specular
    * fallbackSpecularEnergy
    * transmission
    * (0.018 + iorF0 * 0.46 + transmission * 0.04)
    * (0.3 + specularGloss * 0.42);
  float clearcoatGloss = pow(1.0 - clearcoatRoughness, 2.0);
  vec3 clearcoatLobe = vec3(clearcoat * (0.022 + iorBoost * 0.045) * (0.28 + clearcoatGloss * 0.42));
  float sheenGloss = pow(1.0 - sheenRoughness, 2.0);
  vec3 sheenLobe = sheenColorFactor * sheen * (0.05 + sheenGloss * 0.18);
  float anisotropy = clamp(anisotropyStrength, 0.0, 1.0);
  float anisotropyDirection = 0.5 + 0.5 * cos(anisotropyRotation * 2.0);
  vec3 anisotropyLobe = vec3(anisotropy * mix(0.025, 0.085, anisotropyDirection));
  float iridescence = clamp(iridescenceFactor, 0.0, 1.0);
  float iridescenceThickness = clamp((iridescenceThicknessMinimum + iridescenceThicknessMaximum) * 0.5, 0.0, 1200.0);
  float iridescencePhase = clamp((iridescenceThickness - 100.0) / 1100.0, 0.0, 1.0) * 6.2831853;
  float iridescenceIorBoost = clamp((iridescenceIor - 1.0) / 2.0, 0.0, 1.0);
  vec3 iridescenceColor = 0.5 + 0.5 * cos(iridescencePhase + vec3(0.0, 2.0943951, 4.1887902));
  vec3 iridescenceLobe = iridescenceColor * iridescence * (0.04 + iridescenceIorBoost * 0.04);
  float dispersionAmount = clamp(dispersion / 100.0, 0.0, 1.0);
  vec3 dispersionTint = mix(vec3(1.0), vec3(1.04, 0.98, 0.94), dispersionAmount * transmission);
  float sheenEnergy = max(max(sheenLobe.r, sheenLobe.g), sheenLobe.b);
  // Sheen is a grazing-angle lobe. A large constant attenuation here suppresses
  // the rim response before the view-dependent lobe is applied, so retain only
  // the small energy-compensation term needed by this fallback path.
  float layerEnergy = clamp(clearcoat * 0.08 + sheenEnergy * 0.04 + anisotropy * 0.035 + iridescence * 0.03, 0.0, 0.28);
  vec3 layeredBase = transmitted * dispersionTint * (1.0 - layerEnergy);
  return max(vec3(0.0), layeredBase);
}
vec3 a3dPbrIridescenceColor(float minimumThickness, float maximumThickness, float iridescenceIor, float nDotV) {
  float thickness = clamp((minimumThickness + maximumThickness) * 0.5, 0.0, 1200.0);
  float opticalThicknessPhase = clamp((thickness - 100.0) / 1100.0, 0.0, 1.0) * 6.2831853;
  float iorShift = clamp((iridescenceIor - 1.0) / 2.0, 0.0, 1.0) * 0.65;
  // Thin-film path length grows at grazing angles. Making that phase explicit
  // produces the required spectral migration instead of a fixed RGB tint whose
  // brightness alone changes with Fresnel.
  float viewPhase = pow(1.0 - clamp(nDotV, 0.0, 1.0), 1.25) * (3.2 + iridescenceIor * 1.4);
  float phase = opticalThicknessPhase + iorShift + viewPhase;
  return clamp(0.5 + 0.5 * cos(phase + vec3(0.0, 2.0943951, 4.1887902)), vec3(0.0), vec3(1.0));
}
float a3dPbrAnisotropicDistribution(vec3 N, vec3 H, float roughness, float anisotropy, float rotation) {
  float c = cos(rotation);
  float s = sin(rotation);
  vec3 T = normalize(vec3(c, s, 0.0));
  vec3 B = normalize(vec3(-s, c, 0.0));
  vec3 n = normalize(N);
  vec3 h = normalize(H);
  float alpha = max(0.035, roughness * roughness);
  float aspect = sqrt(max(0.08, 1.0 - clamp(anisotropy, 0.0, 0.98) * 0.92));
  float alphaT = max(0.012, alpha / aspect);
  float alphaB = max(0.012, alpha * aspect);
  float tDotH = dot(T, h);
  float bDotH = dot(B, h);
  float nDotH = max(dot(n, h), 0.0);
  float denominator = tDotH * tDotH / (alphaT * alphaT)
    + bDotH * bDotH / (alphaB * alphaB)
    + nDotH * nDotH;
  return 1.0 / max(A3D_PI * alphaT * alphaB * denominator * denominator, A3D_EPSILON);
}
float a3dPbrCharlieSheen(float nDotH, float sheenRoughness) {
  float alpha = max(0.07, sheenRoughness * sheenRoughness);
  float inverseAlpha = 1.0 / alpha;
  float sin2h = max(1.0 - nDotH * nDotH, 0.0078125);
  return (2.0 + inverseAlpha) * pow(sin2h, inverseAlpha * 0.5) / (2.0 * A3D_PI);
}
vec3 a3dPbrExtensionDirectLight(
  vec3 normal,
  vec3 viewDirection,
  vec3 lightDirection,
  vec3 lightColor,
  float lightIntensity,
  float clearcoat,
  float clearcoatRoughness,
  vec3 sheenColor,
  float sheenRoughness,
  float anisotropy,
  float anisotropyRotation,
  float iridescence,
  float iridescenceIor,
  float iridescenceThicknessMinimum,
  float iridescenceThicknessMaximum
) {
  vec3 N = normalize(normal);
  vec3 V = normalize(viewDirection);
  vec3 L = normalize(lightDirection);
  vec3 H = normalize(V + L);
  float nDotL = a3dSaturate(dot(N, L));
  float nDotV = max(a3dSaturate(dot(N, V)), A3D_EPSILON);
  float nDotH = a3dSaturate(dot(N, H));
  float vDotH = a3dSaturate(dot(V, H));
  float clearcoatRough = clamp(clearcoatRoughness, 0.04, 1.0);
  vec3 clearcoatF = a3dFresnelSchlick(vec3(0.04), vDotH);
  float clearcoatD = a3dDistributionGGX(nDotH, clearcoatRough);
  float clearcoatG = a3dGeometrySmithGGXCorrelated(nDotV, nDotL, clearcoatRough);
  vec3 clearcoatLobe = clearcoatF * clearcoatD * clearcoatG * clamp(clearcoat, 0.0, 1.0);
  float sheenDistribution = a3dPbrCharlieSheen(nDotH, sheenRoughness);
  float sheenVisibility = 1.0 / max(4.0 * (nDotV + nDotL - nDotV * nDotL), A3D_EPSILON);
  float sheenGrazing = pow(1.0 - nDotV, 12.0);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0))
    * (sheenDistribution * sheenVisibility * 0.012 + sheenGrazing * 0.18);
  float anisotropicDistribution = a3dPbrAnisotropicDistribution(N, H, clearcoatRough, anisotropy, anisotropyRotation);
  vec3 anisotropyLobe = vec3(clamp(anisotropy, 0.0, 1.0) * anisotropicDistribution * 0.72);
  vec3 iridescenceColor = a3dPbrIridescenceColor(iridescenceThicknessMinimum, iridescenceThicknessMaximum, iridescenceIor, nDotV);
  vec3 iridescenceLobe = iridescenceColor * clamp(iridescence, 0.0, 1.0) * clearcoatF * pow(a3dSaturate(1.0 - nDotV), 2.0) * 0.22;
  return (clearcoatLobe + sheenLobe + anisotropyLobe + iridescenceLobe) * lightColor * lightIntensity * nDotL;
}
vec3 a3dPbrExtensionEnvironmentLight(
  vec3 normal,
  vec3 viewDirection,
  vec3 specularRadiance,
  float clearcoat,
  float clearcoatRoughness,
  vec3 sheenColor,
  float sheenRoughness,
  float anisotropy,
  float anisotropyRotation,
  float iridescence,
  float iridescenceIor,
  float iridescenceThicknessMinimum,
  float iridescenceThicknessMaximum
) {
  float nDotV = max(a3dSaturate(dot(normalize(normal), normalize(viewDirection))), A3D_EPSILON);
  float clearcoatGloss = pow(1.0 - clamp(clearcoatRoughness, 0.04, 1.0), 2.0);
  vec3 clearcoatLobe = specularRadiance * clamp(clearcoat, 0.0, 1.0) * (0.04 + clearcoatGloss * 0.12);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0))
    * pow(a3dSaturate(1.0 - nDotV), 8.0)
    * mix(1.4, 0.75, clamp(sheenRoughness, 0.0, 1.0));
  vec3 N = normalize(normal);
  vec3 V = normalize(viewDirection);
  // A deterministic dominant environment direction gives aggregate environment
  // radiance a half-vector on which tangent-frame rotation can act. Sampled HDR
  // paths still provide the radiance; this term controls only lobe shape.
  vec3 environmentDirection = normalize(vec3(0.42, 0.78, 0.46));
  vec3 environmentHalf = normalize(V + environmentDirection);
  float rotationCos = cos(anisotropyRotation);
  float rotationSin = sin(anisotropyRotation);
  // This procedural primitive path has no authored tangent attribute. Use its
  // stable object/world XY frame instead of a per-fragment view frame: the
  // latter rotates as V changes across a curved surface and erases the visible
  // response to anisotropyRotation. Textured glTF materials use their authored
  // tangent frame in the dedicated path.
  vec3 majorAxis = normalize(vec3(rotationCos, rotationSin, 0.0));
  vec3 minorAxis = normalize(vec3(-rotationSin, rotationCos, 0.0));
  vec3 normalDelta = N - environmentHalf;
  float majorDelta = dot(normalDelta, majorAxis);
  float minorDelta = dot(normalDelta, minorAxis);
  float anisotropyAmount = clamp(anisotropy, 0.0, 1.0);
  float majorWidth = mix(0.09, 0.42, anisotropyAmount);
  float minorWidth = mix(0.09, 0.009, anisotropyAmount);
  float anisotropyShape = exp(-0.5 * (
    majorDelta * majorDelta / max(majorWidth * majorWidth, 0.0001)
    + minorDelta * minorDelta / max(minorWidth * minorWidth, 0.0001)
  ));
  vec3 anisotropyLobe = specularRadiance * anisotropyAmount * anisotropyShape * 6.0;
  vec3 iridescenceColor = a3dPbrIridescenceColor(iridescenceThicknessMinimum, iridescenceThicknessMaximum, iridescenceIor, nDotV);
  vec3 iridescenceLobe = specularRadiance * iridescenceColor * clamp(iridescence, 0.0, 1.0) * pow(a3dSaturate(1.0 - nDotV), 1.5) * 0.1;
  return clearcoatLobe + sheenLobe + anisotropyLobe + iridescenceLobe;
}
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
uniform float u_materialEnvironmentIntensity;
uniform vec3 u_environmentSkyColor;
uniform vec3 u_environmentHorizonColor;
uniform vec3 u_environmentGroundColor;
uniform vec3 u_environmentSpecularColor;
uniform float u_environmentMapIntensity;
uniform float u_environmentSpecularIntensity;
uniform sampler2D u_environmentMapTexture;
uniform samplerCube u_environmentCubeMapTexture;
uniform float u_environmentCubeMapTextureEnabled;
uniform float u_environmentMapTextureEnabled;
uniform float u_environmentMapTextureIntensity;
uniform float u_environmentMapTextureSpecularIntensity;
uniform float u_environmentMapTextureRotation;
uniform float u_environmentMapTextureMipCount;
uniform float u_environmentMapTextureEncoding;
uniform sampler2D u_environmentBrdfLutTexture;
uniform float u_environmentBrdfLutEnabled;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_transmissionFallbackEnergy;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
uniform float u_transmissionParallaxStrength;
uniform vec3 u_transmissionParallaxBoxMin;
uniform vec3 u_transmissionParallaxBoxMax;
uniform float u_transmissionBounceCount;
uniform float u_transmissionCausticStrength;
uniform float u_ior;
uniform float u_specularFactor;
uniform vec3 u_specularColorFactor;
uniform vec3 u_sheenColorFactor;
uniform float u_sheenRoughnessFactor;
uniform float u_anisotropyStrength;
uniform float u_anisotropyRotation;
uniform float u_iridescenceFactor;
uniform float u_iridescenceIor;
uniform float u_iridescenceThicknessMinimum;
uniform float u_iridescenceThicknessMaximum;
uniform float u_dispersion;
uniform float u_lightCount;
uniform vec4 u_lightData[96];
uniform float u_clusteredLightEnabled;
uniform vec2 u_clusterGridSize;
uniform vec2 u_clusterViewportSize;
uniform sampler2D u_clusterLightData;
uniform sampler2D u_clusterLightIndices;
uniform sampler2D u_shadowMapTexture;
uniform float u_shadowMapEnabled;
uniform mat4 u_shadowMapMatrix;
uniform float u_shadowMapStrength;
uniform float u_shadowMapBias;
uniform float u_shadowMapSlopeBias;
uniform vec2 u_shadowMapTexelSize;
uniform float u_shadowPcfSampleCount;
uniform vec4 u_shadowPcfSamples[32];
uniform sampler2D u_pointShadowMapTexture;
uniform float u_pointShadowMapEnabled;
uniform vec3 u_pointShadowLightPosition;
uniform float u_pointShadowRange;
uniform mat4 u_pointShadowFaceMatrices[6];
uniform vec4 u_pointShadowFaceRects[6];
uniform float u_pointShadowStrength;
uniform float u_pointShadowBias;
uniform float u_pointShadowSlopeBias;
uniform vec2 u_pointShadowTexelSize;
uniform float u_pointShadowPcfSampleCount;
uniform vec4 u_pointShadowPcfSamples[32];
uniform float u_outputColorSpace;
uniform vec3 u_cameraPosition;
uniform float u_environmentFogEnabled;
uniform float u_environmentFogMode;
uniform vec3 u_environmentFogColor;
uniform float u_environmentFogNear;
uniform float u_environmentFogFar;
uniform float u_environmentFogDensity;
uniform float u_environmentFogHeightFalloff;
uniform float u_volumetricIntensity;
uniform vec3 u_volumetricLightDirection;
uniform vec3 u_volumetricLightColor;
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec4 v_vertexColor;
out vec4 outColor;
float a3dEnvironmentFogFactor(vec3 worldPosition) {
  if (u_environmentFogEnabled < 0.5) return 0.0;
  float distanceToCamera = length(u_cameraPosition - worldPosition);
  float factor = 0.0;
  if (u_environmentFogMode < 1.5) {
    factor = (distanceToCamera - u_environmentFogNear) / max(u_environmentFogFar - u_environmentFogNear, 0.000001);
  } else if (u_environmentFogMode < 2.5) {
    factor = 1.0 - exp(-max(u_environmentFogDensity, 0.0) * distanceToCamera);
  } else {
    float scaledDensity = max(u_environmentFogDensity, 0.0) * distanceToCamera;
    factor = 1.0 - exp(-(scaledDensity * scaledDensity));
  }
  float heightMultiplier = u_environmentFogHeightFalloff > 0.0
    ? exp(-max(0.0, worldPosition.y - u_environmentFogHeightReference) * u_environmentFogHeightFalloff)
    : 1.0;
  return clamp(factor * heightMultiplier, 0.0, 1.0) * clamp(u_environmentFogMaxOpacity, 0.0, 1.0);
}
vec3 a3dApplyEnvironmentFog(vec3 linearColor, vec3 worldPosition) {
  float fogFactor = a3dEnvironmentFogFactor(worldPosition);
  vec3 fogged = mix(linearColor, u_environmentFogColor, fogFactor);
  // A5 volumetric inscatter (muse3jsparity-PRD): forward-scattering lobe
  // around the dominant light direction, gated by the same height falloff as
  // the fog factor and dithered by one LSB so 8-bit output does not band.
  // u_volumetricIntensity 0 reproduces the legacy path exactly.
  if (u_volumetricIntensity > 0.0) {
    float viewDistance = max(length(u_cameraPosition - worldPosition), 0.000001);
    vec3 viewDirection = (u_cameraPosition - worldPosition) / viewDistance;
    float forwardLobe = pow(max(dot(viewDirection, u_volumetricLightDirection), 0.0), 6.0);
    float heightGate = u_environmentFogHeightFalloff > 0.0
      ? exp(-max(0.0, worldPosition.y - u_environmentFogHeightReference) * u_environmentFogHeightFalloff)
      : 1.0;
    vec3 inscatter = u_volumetricIntensity * heightGate * forwardLobe * u_volumetricLightColor * (0.15 + 0.85 * fogFactor);
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    fogged += inscatter + dither * (1.0 / 255.0);
  }
  return fogged;
}
vec2 a3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 a3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 a3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return a3dPbrDecodeEnvironmentRgbe(encodedSample);
  return a3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec3 a3dPbrBoundHdrTransmissionRadiance(vec3 radiance) {
  vec3 nonNegative = max(radiance, vec3(0.0));
  return nonNegative / (vec3(1.0) + max(nonNegative - vec3(1.0), vec3(0.0)));
}
vec3 a3dPbrBoundHdrSpecularRadiance(vec3 radiance) {
  return clamp(radiance, vec3(0.0), vec3(65504.0));
}
vec3 a3dPbrClampSampledSpecularEdgeEnergy(vec3 radiance, float nDotV, float roughness) {
  return max(radiance, vec3(0.0));
}
vec4 a3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, a3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, a3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 a3dPbrBoxProjectedDirection(vec3 worldPosition, vec3 direction, vec3 boxMin, vec3 boxMax) {
  vec3 safeDirection = normalize(direction);
  vec3 invDirection = 1.0 / max(abs(safeDirection), vec3(0.0001)) * sign(safeDirection);
  vec3 firstPlane = mix(boxMin, boxMax, step(vec3(0.0), safeDirection));
  vec3 distances = (firstPlane - worldPosition) * invDirection;
  float travel = min(min(
    distances.x > 0.0 ? distances.x : 100000.0,
    distances.y > 0.0 ? distances.y : 100000.0
  ), distances.z > 0.0 ? distances.z : 100000.0);
  vec3 hitPosition = worldPosition + safeDirection * travel;
  vec3 boxCenter = (boxMin + boxMax) * 0.5;
  return normalize(hitPosition - boxCenter);
}
float a3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  // Slope-scaled depth bias must be evaluated per PCF sample, not once for the kernel
  // centre. A sample offset N texels away on a receiver sloped relative to the light sees a
  // depth difference proportional to N, so a centre-only bias under-compensates every outer
  // tap and the receiver shadows itself. Scaling by each sample's own texel distance keeps
  // wide kernels acne-free without inflating the constant bias into peter-panning.
  // The depth gradient across one shadow texel is tan(angle between receiver normal and
  // light), not (1 - N.L). The linear form collapses toward zero far faster than the real
  // gradient grows, so it under-biases exactly the grazing angles that need the most
  // compensation. Clamped so a near-perpendicular receiver cannot demand unbounded bias.
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float a3dPointShadowFaceIndex(vec3 direction) {
  vec3 absoluteDirection = abs(direction);
  if (absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z) return direction.x >= 0.0 ? 0.0 : 1.0;
  if (absoluteDirection.y >= absoluteDirection.x && absoluteDirection.y >= absoluteDirection.z) return direction.y >= 0.0 ? 2.0 : 3.0;
  return direction.z >= 0.0 ? 4.0 : 5.0;
}
float a3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  float distanceToLight = length(lightToFragment);
  if (distanceToLight > u_pointShadowRange) return 1.0;
  int faceIndex = int(a3dPointShadowFaceIndex(lightToFragment));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  // Slope-scaled depth bias must be evaluated per PCF sample, not once for the kernel
  // centre. A sample offset N texels away on a receiver sloped relative to the light sees a
  // depth difference proportional to N, so a centre-only bias under-compensates every outer
  // tap and the receiver shadows itself. Scaling by each sample's own texel distance keeps
  // wide kernels acne-free without inflating the constant bias into peter-panning.
  // The depth gradient across one shadow texel is tan(angle between receiver normal and
  // light), not (1 - N.L). The linear form collapses toward zero far faster than the real
  // gradient grows, so it under-biases exactly the grazing angles that need the most
  // compensation. Clamped so a near-perpendicular receiver cannot demand unbounded bias.
  float slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  float slopeTexelBias = slopeTangent * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float projectedDepth = projected.z * 0.5 + 0.5;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_pointShadowTexelSize;
    float storedDepth = texture(u_pointShadowMapTexture, uv + offset).r;
    float sampleTexelDistance = max(1.0, length(sampleData.xy));
    float receiverDepth = projectedDepth - u_pointShadowBias - slopeTexelBias * sampleTexelDistance;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
vec3 a3dLinearToSrgb(vec3 linear) {
  vec3 clamped = max(linear, vec3(0.0));
  vec3 low = clamped * 12.92;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), clamped));
}
vec3 a3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = a3dLinearToSrgb(filmic);
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 materialBase = a3dApplyAdvancedPbrLobes(
    u_baseColor.rgb * v_vertexColor.rgb,
    u_clearcoatFactor,
    u_clearcoatRoughnessFactor,
    u_transmissionFactor,
    u_diffuseTransmissionFactor,
    u_diffuseTransmissionColorFactor,
    u_transmissionFallbackEnergy,
    u_volumeThicknessFactor,
    u_volumeAttenuationDistance,
    u_volumeAttenuationColor,
    u_ior,
    u_specularFactor,
    u_specularColorFactor,
    u_sheenColorFactor,
    u_sheenRoughnessFactor,
    u_anisotropyStrength,
    u_anisotropyRotation,
    u_iridescenceFactor,
    u_iridescenceIor,
    u_iridescenceThicknessMinimum,
    u_iridescenceThicknessMaximum,
    u_dispersion
  );
  float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
  float proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity);
  float skyBlend = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBlend = 1.0 - abs(normal.y);
  vec3 proceduralDiffuse = mix(u_environmentGroundColor, u_environmentSkyColor, skyBlend);
  proceduralDiffuse = mix(proceduralDiffuse, u_environmentHorizonColor, clamp(horizonBlend, 0.0, 1.0) * 0.55);
  // The ambient term must be added to the procedural contribution, not replaced by it. A mix
  // here discarded u_environmentColor * u_environmentIntensity entirely whenever a procedural
  // map was present, which is the normal case: raising ambient intensity from 0.18 to 3.0 on
  // the product-turntable kit produced a byte-identical frame. Ambient and a sky gradient are
  // separate physical contributions, so they sum.
  vec3 environmentDiffuse = ambientEnvironment + proceduralDiffuse * u_environmentMapIntensity * proceduralEnvironmentWeight;
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  environmentDiffuse = mix(environmentDiffuse, ambientEnvironment + sampledDiffuse * u_environmentMapTextureIntensity * u_materialEnvironmentIntensity, sampledEnvironmentWeight);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float roughness = clamp(u_roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, roughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, roughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float environmentLod = roughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = a3dPbrBoundHdrSpecularRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod)));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, roughness)).rg;
  sampledSpecular = a3dPbrClampSampledSpecularEdgeEnergy(sampledSpecular, nDotV, roughness);
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * u_materialEnvironmentIntensity * sampledEnvironmentWeight * mix(1.1, 0.65, roughness);
  float clearcoatEnvironmentRoughness = clamp(u_clearcoatRoughnessFactor, 0.04, 1.0);
  float clearcoatEnvironmentLod = clearcoatEnvironmentRoughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 clearcoatSampledSpecular = a3dPbrBoundHdrSpecularRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(reflectionDirection, clearcoatEnvironmentLod)));
  clearcoatSampledSpecular *= u_environmentMapTextureSpecularIntensity * u_materialEnvironmentIntensity * sampledEnvironmentWeight * mix(1.1, 0.85, clearcoatEnvironmentRoughness);
  vec3 extensionSpecular = proceduralSpecular + mix(sampledSpecular, clearcoatSampledSpecular, clamp(u_clearcoatFactor, 0.0, 1.0));
  vec3 shaded = a3dPbrEnvironmentLightSplitSum(
    normal,
    viewDirection,
    environmentDiffuse,
    extensionSpecular,
    mix(vec2(1.0, 0.0), brdfLut, step(0.0001, u_environmentBrdfLutEnabled)),
    materialBase,
    u_metallic,
    u_roughness,
    u_specularFactor,
    u_specularColorFactor
  ) * mix(1.0, 0.18, clamp(u_anisotropyStrength, 0.0, 1.0)) + u_emissiveColor * u_emissiveStrength;
  shaded += a3dPbrExtensionEnvironmentLight(
    normal,
    viewDirection,
    proceduralSpecular + sampledSpecular,
    u_clearcoatFactor,
    u_clearcoatRoughnessFactor,
    u_sheenColorFactor,
    u_sheenRoughnessFactor,
    u_anisotropyStrength,
    u_anisotropyRotation,
    u_iridescenceFactor,
    u_iridescenceIor,
    u_iridescenceThicknessMinimum,
    u_iridescenceThicknessMaximum
  );
  float transmissionAmount = clamp(max(u_transmissionFactor, u_diffuseTransmissionFactor), 0.0, 1.0);
  if (transmissionAmount > 0.0001 && sampledEnvironmentWeight > 0.0001) {
    vec3 refractionDirection = refract(-viewDirection, normal, 1.0 / max(u_ior, 1.0));
    refractionDirection = length(refractionDirection) > 0.0001 ? normalize(refractionDirection) : -reflectionDirection;
    float parallaxStrength = clamp(u_transmissionParallaxStrength, 0.0, 1.0);
    if (parallaxStrength > 0.0001) {
      vec3 parallaxDirection = a3dPbrBoxProjectedDirection(v_worldPosition, refractionDirection, u_transmissionParallaxBoxMin, u_transmissionParallaxBoxMax);
      refractionDirection = normalize(mix(refractionDirection, parallaxDirection, parallaxStrength));
    }
    float bounceCount = clamp(u_transmissionBounceCount, 0.0, 4.0);
    float refractionLod = clamp(roughness + u_volumeThicknessFactor * 0.12 + bounceCount * 0.04 * parallaxStrength, 0.0, 1.0) * max(u_environmentMapTextureMipCount - 1.0, 0.0);
    vec3 refractedEnvironment = a3dPbrBoundHdrTransmissionRadiance(a3dPbrDecodeEnvironmentSample(a3dPbrEnvironmentSampleRaw(refractionDirection, refractionLod)));
    float volumeTravel = clamp((max(u_volumeThicknessFactor, 0.0) * (1.0 + bounceCount * 0.18 * parallaxStrength)) / max(u_volumeAttenuationDistance, 0.0001), 0.0, 16.0);
    vec3 volumeTint = pow(clamp(u_volumeAttenuationColor, vec3(0.0001), vec3(1.0)), vec3(volumeTravel));
    float causticEnergy = u_transmissionCausticStrength * parallaxStrength * transmissionAmount * pow(1.0 - roughness, 2.0) / (1.0 + bounceCount * 0.35);
    float roughVolumeIorLift = mix(1.0, 1.45, clamp((u_ior - 1.0) / 1.5, 0.0, 1.0) * smoothstep(0.35, 0.95, roughness + u_volumeThicknessFactor * 0.2));
    float fallbackEnvironmentTransmissionEnergy = mix(1.0, clamp(u_transmissionFallbackEnergy, 0.0, 1.0), transmissionAmount);
    vec3 refractionRadiance = (refractedEnvironment + vec3(causticEnergy)) * volumeTint * u_environmentMapTextureIntensity * transmissionAmount * fallbackEnvironmentTransmissionEnergy * mix(0.9, 0.55, roughness) * roughVolumeIorLift;
    shaded = mix(shaded, shaded * 0.72 + refractionRadiance, transmissionAmount * mix(0.08, 0.58, fallbackEnvironmentTransmissionEnergy));
  }
  ivec2 clusterTile = clamp(ivec2(floor(gl_FragCoord.xy / max(u_clusterViewportSize / u_clusterGridSize, vec2(1.0)))), ivec2(0), ivec2(u_clusterGridSize) - ivec2(1));
  int clusterIndex = clusterTile.y * int(u_clusterGridSize.x) + clusterTile.x;
  int count = u_clusteredLightEnabled > 0.5 ? min(int(texelFetch(u_clusterLightIndices, ivec2(0, clusterIndex), 0).g), 64) : min(int(u_lightCount), 16);
  for (int i = 0; i < 64; ++i) {
    if (i >= count) break;
    int lightIndex = u_clusteredLightEnabled > 0.5 ? int(texelFetch(u_clusterLightIndices, ivec2(i, clusterIndex), 0).r) : i;
    int baseIndex = lightIndex * 6;
    vec4 colorIntensity = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(0, lightIndex), 0) : u_lightData[baseIndex];
    vec4 positionRange = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0) : u_lightData[baseIndex + 1];
    vec4 directionKind = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0) : u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0) : u_lightData[baseIndex + 3];
    vec4 areaRight = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0) : u_lightData[baseIndex + 4];
    vec4 areaUp = u_clusteredLightEnabled > 0.5 ? texelFetch(u_clusterLightData, ivec2(5, lightIndex), 0) : u_lightData[baseIndex + 5];
    float kind = directionKind.w;
    if (kind > 2.5) {
      shaded += a3dPbrRectAreaLight(
        v_worldPosition, positionRange.xyz, directionKind.xyz, areaRight.xyz, areaUp.xyz,
        spotShadowLayer.x, spotShadowLayer.y, positionRange.w,
        normal, viewDirection, colorIntensity.rgb, colorIntensity.a,
        materialBase, u_metallic, u_roughness, u_specularFactor, u_specularColorFactor
      );
      continue;
    }
    vec3 lightDirection = -directionKind.xyz;
    float attenuation = 1.0;
    if (kind > 0.5) {
      vec3 toLight = positionRange.xyz - v_worldPosition;
      float distanceToLight = length(toLight);
      lightDirection = distanceToLight > 0.0001 ? toLight / distanceToLight : -directionKind.xyz;
      float range = max(positionRange.w, 0.0001);
      float rangeFalloff = clamp(1.0 - pow(distanceToLight / range, 4.0), 0.0, 1.0);
      rangeFalloff *= rangeFalloff;
      attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    float directLightIntensity = colorIntensity.a * attenuation * mix(1.0, kind > 0.5 && kind < 1.5 ? a3dPointShadowFactor(v_worldPosition, normal, lightDirection) : a3dForwardShadowFactor(v_worldPosition, normal, lightDirection), step(0.5, spotShadowLayer.z));
    shaded += a3dPbrDirectLight(
      normal,
      viewDirection,
      lightDirection,
      colorIntensity.rgb,
      directLightIntensity,
      materialBase,
      u_metallic,
      u_roughness,
      u_specularFactor,
      u_specularColorFactor
    ) * mix(1.0, 0.18, clamp(u_anisotropyStrength, 0.0, 1.0));
    shaded += a3dPbrExtensionDirectLight(
      normal,
      viewDirection,
      lightDirection,
      colorIntensity.rgb,
      directLightIntensity,
      u_clearcoatFactor,
      u_clearcoatRoughnessFactor,
      u_sheenColorFactor,
      u_sheenRoughnessFactor,
      u_anisotropyStrength,
      u_anisotropyRotation,
      u_iridescenceFactor,
      u_iridescenceIor,
      u_iridescenceThicknessMinimum,
      u_iridescenceThicknessMaximum
    );
  }
  float alpha = u_baseColor.a * v_vertexColor.a;
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = a3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(a3dPbrEncodeOutput(fogged), alpha);
}