#version 300 es
// @galileo3d-shader:pbr-direct-v1
precision highp float;
struct G3DLight {
  vec4 colorIntensity;
  vec4 positionRange;
  vec4 directionKind;
};
vec3 g3dLambert(vec3 normal, vec3 lightDirection, vec3 lightColor, float intensity) {
  float ndotl = max(dot(normalize(normal), normalize(lightDirection)), 0.0);
  return lightColor * intensity * ndotl;
}
const float G3D_PI = 3.14159265359;
const float G3D_INV_PI = 0.31830988618;
const float G3D_EPSILON = 0.00001;
const float G3D_MIN_ROUGHNESS = 0.045;
float g3dSaturate(float value) {
  return clamp(value, 0.0, 1.0);
}
vec3 g3dFresnelSchlick(vec3 f0, float vDotH) {
  float f = pow(g3dSaturate(1.0 - vDotH), 5.0);
  return f0 + (1.0 - f0) * f;
}
vec3 g3dFresnelSchlickRoughness(vec3 f0, float nDotV, float roughness) {
  float smoothness = 1.0 - clamp(roughness, 0.0, 1.0);
  return f0 + (max(vec3(smoothness), f0) - f0) * pow(g3dSaturate(1.0 - nDotV), 5.0);
}
float g3dDistributionGGX(float nDotH, float roughness) {
  float alpha = max(roughness, G3D_MIN_ROUGHNESS);
  alpha *= alpha;
  float alpha2 = alpha * alpha;
  float nDotH2 = nDotH * nDotH;
  float denom = nDotH2 * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(G3D_PI * denom * denom, G3D_EPSILON);
}
float g3dGeometrySmithGGXCorrelated(float nDotV, float nDotL, float roughness) {
  float alpha = max(roughness, G3D_MIN_ROUGHNESS);
  alpha *= alpha;
  float alpha2 = alpha * alpha;
  float lambdaV = nDotL * sqrt(max((nDotV - alpha2 * nDotV) * nDotV + alpha2, G3D_EPSILON));
  float lambdaL = nDotV * sqrt(max((nDotL - alpha2 * nDotL) * nDotL + alpha2, G3D_EPSILON));
  return 0.5 / max(lambdaV + lambdaL, G3D_EPSILON);
}
float g3dDiffuseBurley(float nDotV, float nDotL, float lDotH, float roughness) {
  float energyBias = mix(0.0, 0.5, roughness);
  float energyFactor = mix(1.0, 1.0 / 1.51, roughness);
  float fd90 = energyBias + 2.0 * lDotH * lDotH * roughness;
  float lightScatter = 1.0 + (fd90 - 1.0) * pow(g3dSaturate(1.0 - nDotL), 5.0);
  float viewScatter = 1.0 + (fd90 - 1.0) * pow(g3dSaturate(1.0 - nDotV), 5.0);
  return lightScatter * viewScatter * energyFactor;
}
vec3 g3dPbrF0(vec3 albedo, float metallic, float specularFactor, vec3 specularColorFactor) {
  vec3 dielectricF0 = vec3(0.04) * clamp(specularFactor, 0.0, 1.0) * clamp(specularColorFactor, vec3(0.0), vec3(1.0));
  return mix(dielectricF0, clamp(albedo, vec3(0.0), vec3(1.0)), clamp(metallic, 0.0, 1.0));
}
vec3 g3dPbrDirectLight(
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
  float nDotL = g3dSaturate(dot(N, L));
  float nDotV = max(g3dSaturate(dot(N, V)), G3D_EPSILON);
  float nDotH = g3dSaturate(dot(N, H));
  float vDotH = g3dSaturate(dot(V, H));
  float lDotH = g3dSaturate(dot(L, H));
  vec3 f0 = g3dPbrF0(albedo, metallic, specularFactor, specularColorFactor);
  vec3 F = g3dFresnelSchlick(f0, vDotH);
  float D = g3dDistributionGGX(nDotH, roughness);
  float G = g3dGeometrySmithGGXCorrelated(nDotV, nDotL, roughness);
  vec3 specular = D * G * F;
  vec3 kd = (vec3(1.0) - F) * (1.0 - clamp(metallic, 0.0, 1.0));
  vec3 diffuse = kd * albedo * G3D_INV_PI * g3dDiffuseBurley(nDotV, nDotL, lDotH, clamp(roughness, 0.0, 1.0));
  return (diffuse + specular) * lightColor * lightIntensity * nDotL;
}
vec3 g3dPbrEnvironmentLight(
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
  float nDotV = max(g3dSaturate(dot(normalize(normal), normalize(viewDirection))), G3D_EPSILON);
  vec3 f0 = g3dPbrF0(albedo, metallic, specularFactor, specularColorFactor);
  vec3 F = g3dFresnelSchlickRoughness(f0, nDotV, roughness);
  vec3 kd = (vec3(1.0) - F) * (1.0 - clamp(metallic, 0.0, 1.0));
  vec3 diffuse = kd * albedo * diffuseIrradiance;
  vec3 specular = specularRadiance * F;
  return diffuse + specular;
}
vec3 g3dPbrEnvironmentLightSplitSum(
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
  float nDotV = max(g3dSaturate(dot(normalize(normal), normalize(viewDirection))), G3D_EPSILON);
  vec3 f0 = g3dPbrF0(albedo, metallic, specularFactor, specularColorFactor);
  vec3 F = g3dFresnelSchlickRoughness(f0, nDotV, roughness);
  vec3 kd = (vec3(1.0) - F) * (1.0 - clamp(metallic, 0.0, 1.0));
  vec3 diffuse = kd * albedo * diffuseIrradiance;
  vec2 brdf = clamp(environmentBrdf, vec2(0.0), vec2(1.0));
  float hasSplitSum = step(0.0001, brdf.x + brdf.y);
  vec3 splitSumFresnel = F * brdf.x + vec3(brdf.y);
  vec3 specular = specularRadiance * mix(F, splitSumFresnel, hasSplitSum);
  return diffuse + specular;
}
vec3 g3dApplyMetalRough(vec3 baseColor, float metallic, float roughness) {
  float dielectric = clamp(1.0 - metallic, 0.0, 1.0);
  float energy = mix(0.08, 1.0, dielectric) * (1.0 - clamp(roughness, 0.0, 1.0) * 0.35);
  return baseColor * energy;
}
vec3 g3dApplyAdvancedPbrLobes(
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
  float layerEnergy = clamp(clearcoat * 0.08 + sheenEnergy * 0.26 + anisotropy * 0.035 + iridescence * 0.03, 0.0, 0.28);
  vec3 layeredBase = transmitted * dispersionTint * (1.0 - layerEnergy);
  return max(vec3(0.0), layeredBase);
}
vec3 g3dPbrIridescenceColor(float minimumThickness, float maximumThickness, float iridescenceIor) {
  float thickness = clamp((minimumThickness + maximumThickness) * 0.5, 0.0, 1200.0);
  float phase = clamp((thickness - 100.0) / 1100.0, 0.0, 1.0) * 6.2831853;
  float iorShift = clamp((iridescenceIor - 1.0) / 2.0, 0.0, 1.0) * 0.65;
  return clamp(0.5 + 0.5 * cos(phase + iorShift + vec3(0.0, 2.0943951, 4.1887902)), vec3(0.0), vec3(1.0));
}
vec3 g3dPbrExtensionDirectLight(
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
  float nDotL = g3dSaturate(dot(N, L));
  float nDotV = max(g3dSaturate(dot(N, V)), G3D_EPSILON);
  float nDotH = g3dSaturate(dot(N, H));
  float vDotH = g3dSaturate(dot(V, H));
  float clearcoatRough = clamp(clearcoatRoughness, 0.18, 1.0);
  vec3 clearcoatF = g3dFresnelSchlick(vec3(0.04), vDotH);
  float clearcoatD = g3dDistributionGGX(nDotH, clearcoatRough);
  float clearcoatG = g3dGeometrySmithGGXCorrelated(nDotV, nDotL, clearcoatRough);
  vec3 clearcoatLobe = clearcoatF * clearcoatD * clearcoatG * clamp(clearcoat, 0.0, 1.0) * 0.12;
  float sheenStrength = (1.0 - clamp(sheenRoughness, 0.0, 1.0)) * pow(g3dSaturate(1.0 - vDotH), 5.0);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0)) * sheenStrength * 0.18;
  vec3 anisotropyAxis = normalize(vec3(cos(anisotropyRotation), 0.0, sin(anisotropyRotation)));
  float anisotropyBand = pow(abs(dot(H, anisotropyAxis)), mix(28.0, 6.0, clearcoatRough));
  vec3 anisotropyLobe = vec3(clamp(anisotropy, 0.0, 1.0) * anisotropyBand * 0.055);
  vec3 iridescenceColor = g3dPbrIridescenceColor(iridescenceThicknessMinimum, iridescenceThicknessMaximum, iridescenceIor);
  vec3 iridescenceLobe = iridescenceColor * clamp(iridescence, 0.0, 1.0) * clearcoatF * pow(g3dSaturate(1.0 - nDotV), 2.0) * 0.22;
  return (clearcoatLobe + sheenLobe + anisotropyLobe + iridescenceLobe) * lightColor * lightIntensity * nDotL;
}
vec3 g3dPbrExtensionEnvironmentLight(
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
  float nDotV = max(g3dSaturate(dot(normalize(normal), normalize(viewDirection))), G3D_EPSILON);
  float clearcoatGloss = pow(1.0 - clamp(clearcoatRoughness, 0.18, 1.0), 2.0);
  vec3 clearcoatLobe = specularRadiance * clamp(clearcoat, 0.0, 1.0) * (0.018 + clearcoatGloss * 0.055);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0)) * (1.0 - clamp(sheenRoughness, 0.0, 1.0)) * pow(g3dSaturate(1.0 - nDotV), 5.0) * 0.12;
  float anisotropyBand = 0.5 + 0.5 * cos(anisotropyRotation * 2.0);
  vec3 anisotropyLobe = specularRadiance * clamp(anisotropy, 0.0, 1.0) * mix(0.025, 0.07, anisotropyBand);
  vec3 iridescenceColor = g3dPbrIridescenceColor(iridescenceThicknessMinimum, iridescenceThicknessMaximum, iridescenceIor);
  vec3 iridescenceLobe = specularRadiance * iridescenceColor * clamp(iridescence, 0.0, 1.0) * pow(g3dSaturate(1.0 - nDotV), 1.5) * 0.1;
  return clearcoatLobe + sheenLobe + anisotropyLobe + iridescenceLobe;
}
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
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
uniform vec4 u_lightData[64];
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
uniform float u_environmentFogHeightReference;
uniform float u_environmentFogMaxOpacity;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec4 v_vertexColor;
out vec4 outColor;
float g3dEnvironmentFogFactor(vec3 worldPosition) {
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
vec3 g3dApplyEnvironmentFog(vec3 linearColor, vec3 worldPosition) {
  float fogFactor = g3dEnvironmentFogFactor(worldPosition);
  return mix(linearColor, u_environmentFogColor, fogFactor);
}
vec2 g3dEnvironmentEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 g3dEnvironmentCubeDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 g3dPbrDecodeEnvironmentSrgb(vec3 encodedColor) {
  return max(encodedColor, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 g3dPbrDecodeEnvironmentSample(vec4 encodedSample) {
  if (u_environmentMapTextureEncoding > 1.5) return max(encodedSample.rgb, vec3(0.0));
  if (u_environmentMapTextureEncoding > 0.5) return g3dPbrDecodeEnvironmentRgbe(encodedSample);
  return g3dPbrDecodeEnvironmentSrgb(encodedSample.rgb);
}
vec4 g3dPbrEnvironmentSampleRaw(vec3 direction, float lod) {
  vec4 equirectSample = textureLod(u_environmentMapTexture, g3dEnvironmentEquirectUv(direction, u_environmentMapTextureRotation), lod);
  vec4 cubeSample = textureLod(u_environmentCubeMapTexture, g3dEnvironmentCubeDirection(direction, u_environmentMapTextureRotation), lod);
  return mix(equirectSample, cubeSample, step(0.5, u_environmentCubeMapTextureEnabled));
}
vec3 g3dPbrBoxProjectedDirection(vec3 worldPosition, vec3 direction, vec3 boxMin, vec3 boxMax) {
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
float g3dForwardShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_shadowMapEnabled < 0.5) return 1.0;
  vec4 lightPosition = u_shadowMapMatrix * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 uv = projected.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_shadowMapSlopeBias * max(u_shadowMapTexelSize.x, u_shadowMapTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_shadowMapBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_shadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_shadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_shadowMapTexelSize;
    float storedDepth = texture(u_shadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_shadowMapStrength, 0.0, 1.0));
}
float g3dPointShadowFaceIndex(vec3 direction) {
  vec3 absoluteDirection = abs(direction);
  if (absoluteDirection.x >= absoluteDirection.y && absoluteDirection.x >= absoluteDirection.z) return direction.x >= 0.0 ? 0.0 : 1.0;
  if (absoluteDirection.y >= absoluteDirection.x && absoluteDirection.y >= absoluteDirection.z) return direction.y >= 0.0 ? 2.0 : 3.0;
  return direction.z >= 0.0 ? 4.0 : 5.0;
}
float g3dPointShadowFactor(vec3 worldPosition, vec3 normal, vec3 lightDirection) {
  if (u_pointShadowMapEnabled < 0.5) return 1.0;
  vec3 lightToFragment = worldPosition - u_pointShadowLightPosition;
  float distanceToLight = length(lightToFragment);
  if (distanceToLight > u_pointShadowRange) return 1.0;
  int faceIndex = int(g3dPointShadowFaceIndex(lightToFragment));
  vec4 lightPosition = u_pointShadowFaceMatrices[faceIndex] * vec4(worldPosition, 1.0);
  vec3 projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  vec2 localUv = projected.xy * 0.5 + 0.5;
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0) return 1.0;
  vec4 rect = u_pointShadowFaceRects[faceIndex];
  vec2 uv = rect.xy + localUv * rect.zw;
  vec3 receiverNormal = normalize(normal);
  vec3 receiverLightDirection = lightDirection / max(length(lightDirection), 0.0001);
  float normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  float slopeReceiverBias = (1.0 - normalDotLight) * u_pointShadowSlopeBias * max(u_pointShadowTexelSize.x, u_pointShadowTexelSize.y);
  float receiverDepth = projected.z * 0.5 + 0.5 - u_pointShadowBias - slopeReceiverBias;
  float shadowed = 0.0;
  float totalWeight = 0.0;
  int sampleCount = clamp(int(u_pointShadowPcfSampleCount), 1, 32);
  for (int i = 0; i < 32; ++i) {
    if (i >= sampleCount) break;
    vec4 sampleData = u_pointShadowPcfSamples[i];
    float weight = max(sampleData.z, 0.0);
    vec2 offset = sampleData.xy * u_pointShadowTexelSize;
    float storedDepth = texture(u_pointShadowMapTexture, uv + offset).r;
    shadowed += (receiverDepth > storedDepth ? 1.0 : 0.0) * weight;
    totalWeight += weight;
  }
  float occlusion = totalWeight > 0.0 ? shadowed / totalWeight : 0.0;
  return mix(1.0, 1.0 - occlusion, clamp(u_pointShadowStrength, 0.0, 1.0));
}
vec3 g3dPbrEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = pow(filmic, vec3(1.0 / 2.2));
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 viewDirection = normalize(u_cameraPosition - v_worldPosition);
  vec3 materialBase = g3dApplyAdvancedPbrLobes(
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
  vec3 environmentDiffuse = mix(ambientEnvironment, proceduralDiffuse * u_environmentMapIntensity, proceduralEnvironmentWeight);
  float sampledEnvironmentWeight = step(0.0001, u_environmentMapTextureEnabled * u_environmentMapTextureIntensity);
  float diffuseEnvironmentLod = max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledDiffuse = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(normal, diffuseEnvironmentLod));
  environmentDiffuse = mix(environmentDiffuse, environmentDiffuse * 0.18 + sampledDiffuse * u_environmentMapTextureIntensity * 0.92, sampledEnvironmentWeight);
  vec3 reflectionDirection = reflect(-viewDirection, normal);
  float roughness = clamp(u_roughness, 0.0, 1.0);
  float reflectionBand = pow(clamp(reflectionDirection.y * 0.5 + 0.5, 0.0, 1.0), mix(18.0, 2.0, roughness));
  float roughEnvironmentFloor = mix(0.04, 0.38, roughness);
  float proceduralSpecularResponse = max(reflectionBand, roughEnvironmentFloor);
  vec3 proceduralSpecular = u_environmentSpecularColor * u_environmentSpecularIntensity * proceduralSpecularResponse * proceduralEnvironmentWeight;
  float environmentLod = roughness * max(u_environmentMapTextureMipCount - 1.0, 0.0);
  vec3 sampledSpecular = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(reflectionDirection, environmentLod));
  float nDotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
  vec2 brdfLut = texture(u_environmentBrdfLutTexture, vec2(nDotV, roughness)).rg;
  sampledSpecular *= u_environmentMapTextureSpecularIntensity * sampledEnvironmentWeight * mix(1.1, 0.85, roughness);
  vec3 shaded = g3dPbrEnvironmentLightSplitSum(
    normal,
    viewDirection,
    environmentDiffuse,
    proceduralSpecular + sampledSpecular,
    mix(vec2(1.0, 0.0), brdfLut, step(0.0001, u_environmentBrdfLutEnabled)),
    materialBase,
    u_metallic,
    u_roughness,
    u_specularFactor,
    u_specularColorFactor
  ) + u_emissiveColor * u_emissiveStrength;
  shaded += g3dPbrExtensionEnvironmentLight(
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
      vec3 parallaxDirection = g3dPbrBoxProjectedDirection(v_worldPosition, refractionDirection, u_transmissionParallaxBoxMin, u_transmissionParallaxBoxMax);
      refractionDirection = normalize(mix(refractionDirection, parallaxDirection, parallaxStrength));
    }
    float bounceCount = clamp(u_transmissionBounceCount, 0.0, 4.0);
    float refractionLod = clamp(roughness + u_volumeThicknessFactor * 0.12 + bounceCount * 0.04 * parallaxStrength, 0.0, 1.0) * max(u_environmentMapTextureMipCount - 1.0, 0.0);
    vec3 refractedEnvironment = g3dPbrDecodeEnvironmentSample(g3dPbrEnvironmentSampleRaw(refractionDirection, refractionLod));
    float volumeTravel = clamp((max(u_volumeThicknessFactor, 0.0) * (1.0 + bounceCount * 0.18 * parallaxStrength)) / max(u_volumeAttenuationDistance, 0.0001), 0.0, 16.0);
    vec3 volumeTint = pow(clamp(u_volumeAttenuationColor, vec3(0.0001), vec3(1.0)), vec3(volumeTravel));
    float causticEnergy = u_transmissionCausticStrength * parallaxStrength * transmissionAmount * pow(1.0 - roughness, 2.0) / (1.0 + bounceCount * 0.35);
    float roughVolumeIorLift = mix(1.0, 1.45, clamp((u_ior - 1.0) / 1.5, 0.0, 1.0) * smoothstep(0.35, 0.95, roughness + u_volumeThicknessFactor * 0.2));
    float fallbackEnvironmentTransmissionEnergy = mix(1.0, clamp(u_transmissionFallbackEnergy, 0.0, 1.0), transmissionAmount);
    vec3 refractionRadiance = (refractedEnvironment + vec3(causticEnergy)) * volumeTint * u_environmentMapTextureIntensity * transmissionAmount * fallbackEnvironmentTransmissionEnergy * mix(0.9, 0.55, roughness) * roughVolumeIorLift;
    shaded = mix(shaded, shaded * 0.72 + refractionRadiance, transmissionAmount * mix(0.08, 0.58, fallbackEnvironmentTransmissionEnergy));
  }
  int count = min(int(u_lightCount), 16);
  for (int i = 0; i < count; ++i) {
    int baseIndex = i * 4;
    vec4 colorIntensity = u_lightData[baseIndex];
    vec4 positionRange = u_lightData[baseIndex + 1];
    vec4 directionKind = u_lightData[baseIndex + 2];
    vec4 spotShadowLayer = u_lightData[baseIndex + 3];
    float kind = directionKind.w;
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
    float directLightIntensity = colorIntensity.a * attenuation * mix(1.0, kind > 0.5 && kind < 1.5 ? g3dPointShadowFactor(v_worldPosition, normal, lightDirection) : g3dForwardShadowFactor(v_worldPosition, normal, lightDirection), step(0.5, spotShadowLayer.z));
    shaded += g3dPbrDirectLight(
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
    );
    shaded += g3dPbrExtensionDirectLight(
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
  float transmissionAlpha = clamp(max(u_transmissionFactor, u_diffuseTransmissionFactor), 0.0, 1.0);
  float transmissionCoverage = mix(0.34, 0.08, clamp(u_transmissionFallbackEnergy, 0.0, 1.0));
  alpha = mix(alpha, alpha * transmissionCoverage, transmissionAlpha);
  if (alpha < u_alphaCutoff) discard;
  vec3 fogged = g3dApplyEnvironmentFog(max(shaded, vec3(0.0)), v_worldPosition);
  outColor = vec4(g3dPbrEncodeOutput(fogged), alpha);
}
