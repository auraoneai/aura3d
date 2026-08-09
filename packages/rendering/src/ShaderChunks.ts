export interface ShaderChunk {
  readonly name: string;
  readonly source: string;
  readonly includes?: readonly string[];
}

/**
 * Joints addressable through the uniform-array palette path.
 *
 * A mat4 uniform costs four vec4 slots, so 96 joints already consume 384 of the
 * MAX_VERTEX_UNIFORM_VECTORS budget. Rigs above this switch to the data-texture path.
 */
export const MAX_UNIFORM_SKINNING_JOINTS = 96;

export const SHADER_CHUNKS: readonly ShaderChunk[] = [
  {
    name: "lighting_common",
    source: `
struct A3DLight {
  vec4 colorIntensity;
  vec4 positionRange;
  vec4 directionKind;
};

vec3 a3dLambert(vec3 normal, vec3 lightDirection, vec3 lightColor, float intensity) {
  float ndotl = max(dot(normalize(normal), normalize(lightDirection)), 0.0);
  return lightColor * intensity * ndotl;
}
`
  },
  {
    name: "pbr_common",
    source: `
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
  vec3 F = a3dFresnelSchlickRoughnessSpecular(f0, nDotV, roughness, specularFactor);
  vec3 kd = (vec3(1.0) - F) * (1.0 - clamp(metallic, 0.0, 1.0));
  vec3 diffuse = kd * albedo * diffuseIrradiance;
  vec2 brdf = clamp(environmentBrdf, vec2(0.0), vec2(1.0));
  float hasSplitSum = step(0.0001, brdf.x + brdf.y);
  vec3 splitSumFresnel = F * brdf.x + vec3(brdf.y);
  vec3 specular = specularRadiance * mix(F, splitSumFresnel, hasSplitSum);
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
  float clearcoatRoughness = max(clamp(clearcoatRoughnessFactor, 0.0, 1.0), 0.18);
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
  vec3 delta = N - H;
  float amount = clamp(anisotropy, 0.0, 1.0);
  float baseWidth = mix(0.075, 0.24, clamp(roughness, 0.0, 1.0));
  float majorWidth = mix(baseWidth, baseWidth * 2.8, amount);
  float minorWidth = mix(baseWidth, baseWidth * 0.28, amount);
  float majorDelta = dot(delta, T);
  float minorDelta = dot(delta, B);
  return exp(-0.5 * (
    majorDelta * majorDelta / max(majorWidth * majorWidth, 0.0001)
    + minorDelta * minorDelta / max(minorWidth * minorWidth, 0.0001)
  ));
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
  float clearcoatRough = clamp(clearcoatRoughness, 0.18, 1.0);
  vec3 clearcoatF = a3dFresnelSchlick(vec3(0.04), vDotH);
  float clearcoatD = a3dDistributionGGX(nDotH, clearcoatRough);
  float clearcoatG = a3dGeometrySmithGGXCorrelated(nDotV, nDotL, clearcoatRough);
  vec3 clearcoatLobe = clearcoatF * clearcoatD * clearcoatG * clamp(clearcoat, 0.0, 1.0) * 0.12;
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
  float clearcoatGloss = pow(1.0 - clamp(clearcoatRoughness, 0.18, 1.0), 2.0);
  vec3 clearcoatLobe = specularRadiance * clamp(clearcoat, 0.0, 1.0) * (0.018 + clearcoatGloss * 0.055);
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
`
  },
  {
    name: "shadow_common",
    source: `
float a3dShadowVisibility(float currentDepth, float shadowDepth, float bias) {
  return currentDepth - bias <= shadowDepth ? 1.0 : 0.0;
}
`
  },
  {
    name: "environment_fog_common",
    source: `
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
  return mix(linearColor, u_environmentFogColor, fogFactor);
}
`
  },
  {
    name: "skinning_common",
    source: `
// Joint palette source selection.
//
// Uniform-array palettes are fast but bounded by MAX_VERTEX_UNIFORM_VECTORS: a mat4
// costs four vec4 slots, so a 96-joint palette already consumes 384 of them. Rigs
// above that limit upload their palette as a float data texture instead, sampled
// four texels per matrix. u_jointPaletteMode selects the active path so a single
// shader serves both without recompiling per rig.
//
// 0 = uniform array, 1 = data texture.
uniform float u_jointPaletteMode;
uniform mat4 u_jointMatrices[${MAX_UNIFORM_SKINNING_JOINTS}];
uniform float u_jointCount;
uniform highp sampler2D u_jointPaletteTexture;
uniform vec2 u_jointPaletteTextureSize;

mat4 a3dJointMatrixFromTexture(int jointIndex) {
  // Each matrix occupies four consecutive RGBA32F texels (one per column).
  int baseTexel = jointIndex * 4;
  int width = int(u_jointPaletteTextureSize.x);
  int row = baseTexel / width;
  int column = baseTexel - row * width;
  vec4 c0 = texelFetch(u_jointPaletteTexture, ivec2(column, row), 0);
  vec4 c1 = texelFetch(u_jointPaletteTexture, ivec2(column + 1, row), 0);
  vec4 c2 = texelFetch(u_jointPaletteTexture, ivec2(column + 2, row), 0);
  vec4 c3 = texelFetch(u_jointPaletteTexture, ivec2(column + 3, row), 0);
  return mat4(c0, c1, c2, c3);
}

mat4 a3dJointMatrix(float rawJointIndex) {
  float maxJoint = max(u_jointCount - 1.0, 0.0);
  int jointIndex = int(clamp(rawJointIndex, 0.0, maxJoint));
  if (u_jointPaletteMode > 0.5) {
    return a3dJointMatrixFromTexture(jointIndex);
  }
  // Uniform arrays require a constant-safe index bound.
  int clamped = jointIndex < ${MAX_UNIFORM_SKINNING_JOINTS} ? jointIndex : ${MAX_UNIFORM_SKINNING_JOINTS} - 1;
  return u_jointMatrices[clamped];
}

/** Four-influence skin matrix. */
mat4 a3dSkinMatrix4(vec4 joints, vec4 weights) {
  return
    a3dJointMatrix(joints.x) * weights.x +
    a3dJointMatrix(joints.y) * weights.y +
    a3dJointMatrix(joints.z) * weights.z +
    a3dJointMatrix(joints.w) * weights.w;
}

/**
 * Eight-influence skin matrix. glTF allows a second JOINTS_1/WEIGHTS_1 set; without
 * it, vertices weighted to more than four joints lose their remaining influences and
 * deform incorrectly where weighting is dense.
 */
mat4 a3dSkinMatrix8(vec4 joints0, vec4 weights0, vec4 joints1, vec4 weights1) {
  return a3dSkinMatrix4(joints0, weights0) + a3dSkinMatrix4(joints1, weights1);
}
`
  }
];

export function validateShaderChunks(chunks: readonly ShaderChunk[] = SHADER_CHUNKS): void {
  const names = new Set<string>();
  for (const chunk of chunks) {
    if (names.has(chunk.name)) {
      throw new Error(`Duplicate shader chunk: ${chunk.name}`);
    }
    names.add(chunk.name);
  }
  for (const chunk of chunks) {
    for (const include of chunk.includes ?? []) {
      if (!names.has(include)) {
        throw new Error(`Shader chunk ${chunk.name} includes missing chunk ${include}`);
      }
    }
  }
  detectChunkCycles(chunks);
}

function detectChunkCycles(chunks: readonly ShaderChunk[]): void {
  const byName = new Map(chunks.map((chunk) => [chunk.name, chunk]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string): void => {
    if (visited.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      throw new Error(`Shader chunk cycle detected at ${name}`);
    }
    visiting.add(name);
    for (const dependency of byName.get(name)?.includes ?? []) {
      visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
  };
  for (const chunk of chunks) {
    visit(chunk.name);
  }
}
