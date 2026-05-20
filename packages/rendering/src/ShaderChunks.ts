export interface ShaderChunk {
  readonly name: string;
  readonly source: string;
  readonly includes?: readonly string[];
}

export const SHADER_CHUNKS: readonly ShaderChunk[] = [
  {
    name: "lighting_common",
    source: `
struct G3DLight {
  vec4 colorIntensity;
  vec4 positionRange;
  vec4 directionKind;
};

vec3 g3dLambert(vec3 normal, vec3 lightDirection, vec3 lightColor, float intensity) {
  float ndotl = max(dot(normalize(normal), normalize(lightDirection)), 0.0);
  return lightColor * intensity * ndotl;
}
`
  },
  {
    name: "pbr_common",
    source: `
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
  float clearcoatRoughness = clamp(clearcoatRoughnessFactor, 0.0, 1.0);
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
  float fallbackSpecularEnergy = mix(1.0, max(fallbackEnergy < 0.079 ? clamp(fallbackEnergy * 8.0, 0.0, 1.0) : fallbackEnergy, 0.35), transmission);
  float thickIorTransmissionLift = mix(1.0, 1.28, iorBoost * transmission * smoothstep(0.45, 1.0, volumeThickness));
  transmitted *= fallbackTransmissionEnergy * thickIorTransmissionLift;
  float iorF0 = pow((max(ior, 1.0) - 1.0) / (max(ior, 1.0) + 1.0), 2.0);
  float specularGloss = pow(1.0 - clamp(clearcoatRoughnessFactor, 0.0, 1.0), 2.0);
  vec3 specularLobe = clamp(specularColorFactor, vec3(0.0), vec3(1.0))
    * specular
    * fallbackSpecularEnergy
    * transmission
    * (0.028 + iorF0 * 0.9 + transmission * 0.075)
    * (0.42 + specularGloss * 0.58);
  float clearcoatGloss = pow(1.0 - clearcoatRoughness, 2.0);
  vec3 clearcoatLobe = vec3(clearcoat * (0.04 + iorBoost * 0.08) * (0.35 + clearcoatGloss * 0.65));
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
  float layerEnergy = clamp(clearcoat * 0.22 + sheenEnergy * 0.55 + anisotropy * 0.08 + iridescence * 0.08, 0.0, 0.62);
  vec3 layeredBase = transmitted * dispersionTint * (1.0 - layerEnergy);
  vec3 extensionLobes = specularLobe + sheenLobe + clearcoatLobe + anisotropyLobe + iridescenceLobe;
  return max(vec3(0.0), layeredBase + extensionLobes);
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
  float clearcoatRough = clamp(clearcoatRoughness, 0.02, 1.0);
  vec3 clearcoatF = g3dFresnelSchlick(vec3(0.04), vDotH);
  float clearcoatD = g3dDistributionGGX(nDotH, clearcoatRough);
  float clearcoatG = g3dGeometrySmithGGXCorrelated(nDotV, nDotL, clearcoatRough);
  vec3 clearcoatLobe = clearcoatF * clearcoatD * clearcoatG * clamp(clearcoat, 0.0, 1.0) * 0.28;
  float sheenStrength = (1.0 - clamp(sheenRoughness, 0.0, 1.0)) * pow(g3dSaturate(1.0 - vDotH), 5.0);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0)) * sheenStrength * 0.32;
  vec3 anisotropyAxis = normalize(vec3(cos(anisotropyRotation), 0.0, sin(anisotropyRotation)));
  float anisotropyBand = pow(abs(dot(H, anisotropyAxis)), mix(28.0, 6.0, clearcoatRough));
  vec3 anisotropyLobe = vec3(clamp(anisotropy, 0.0, 1.0) * anisotropyBand * 0.12);
  vec3 iridescenceColor = g3dPbrIridescenceColor(iridescenceThicknessMinimum, iridescenceThicknessMaximum, iridescenceIor);
  vec3 iridescenceLobe = iridescenceColor * clamp(iridescence, 0.0, 1.0) * clearcoatF * pow(g3dSaturate(1.0 - nDotV), 2.0) * 0.65;
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
  float clearcoatGloss = pow(1.0 - clamp(clearcoatRoughness, 0.0, 1.0), 2.0);
  vec3 clearcoatLobe = specularRadiance * clamp(clearcoat, 0.0, 1.0) * (0.025 + clearcoatGloss * 0.11);
  vec3 sheenLobe = clamp(sheenColor, vec3(0.0), vec3(1.0)) * (1.0 - clamp(sheenRoughness, 0.0, 1.0)) * pow(g3dSaturate(1.0 - nDotV), 5.0) * 0.22;
  float anisotropyBand = 0.5 + 0.5 * cos(anisotropyRotation * 2.0);
  vec3 anisotropyLobe = specularRadiance * clamp(anisotropy, 0.0, 1.0) * mix(0.04, 0.14, anisotropyBand);
  vec3 iridescenceColor = g3dPbrIridescenceColor(iridescenceThicknessMinimum, iridescenceThicknessMaximum, iridescenceIor);
  vec3 iridescenceLobe = specularRadiance * iridescenceColor * clamp(iridescence, 0.0, 1.0) * pow(g3dSaturate(1.0 - nDotV), 1.5) * 0.28;
  return clearcoatLobe + sheenLobe + anisotropyLobe + iridescenceLobe;
}
`
  },
  {
    name: "shadow_common",
    source: `
float g3dShadowVisibility(float currentDepth, float shadowDepth, float bias) {
  return currentDepth - bias <= shadowDepth ? 1.0 : 0.0;
}
`
  },
  {
    name: "environment_fog_common",
    source: `
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
