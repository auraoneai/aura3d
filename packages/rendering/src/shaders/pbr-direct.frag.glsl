#version 300 es
// @galileo3d-shader:pbr-direct-v1
precision highp float;
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
uniform float u_transmissionFactor;
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
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
uniform vec4 u_lightData[32];
in vec3 v_normal;
in vec3 v_worldPosition;
in vec4 v_vertexColor;
out vec4 outColor;
vec3 g3dLambert(vec3 normal, vec3 lightDirection, vec3 lightColor, float intensity) {
  float ndotl = max(dot(normalize(normal), normalize(lightDirection)), 0.0);
  return lightColor * intensity * ndotl;
}
vec3 g3dApplyAdvancedPbrLobes(vec3 baseColor) {
  float clearcoat = clamp(u_clearcoatFactor, 0.0, 1.0) * (1.0 - clamp(u_clearcoatRoughnessFactor, 0.0, 1.0));
  float transmission = clamp(u_transmissionFactor, 0.0, 1.0);
  float diffuseTransmission = clamp(u_diffuseTransmissionFactor, 0.0, 1.0) * (1.0 - transmission);
  float volumeThickness = max(u_volumeThicknessFactor, 0.0);
  float volumeTravel = clamp(volumeThickness / max(u_volumeAttenuationDistance, 0.0001), 0.0, 1.0);
  vec3 volumeAttenuation = mix(vec3(1.0), clamp(u_volumeAttenuationColor, vec3(0.0), vec3(1.0)), volumeTravel);
  float iorBoost = clamp((u_ior - 1.0) / 1.5, 0.0, 1.0);
  float specular = clamp(u_specularFactor, 0.0, 1.0);
  float sheen = 1.0 - clamp(u_sheenRoughnessFactor, 0.0, 1.0);
  vec3 transmitted = mix(baseColor, vec3(dot(baseColor, vec3(0.2126, 0.7152, 0.0722))), transmission * 0.35);
  transmitted = mix(transmitted, clamp(u_diffuseTransmissionColorFactor, vec3(0.0), vec3(1.0)), diffuseTransmission);
  transmitted = mix(transmitted, transmitted * volumeAttenuation, transmission * clamp(volumeThickness, 0.0, 1.0));
  vec3 specularLobe = u_specularColorFactor * specular * (0.08 + iorBoost * 0.08);
  vec3 sheenLobe = u_sheenColorFactor * sheen * 0.15;
  vec3 clearcoatLobe = vec3(clearcoat * (0.08 + iorBoost * 0.05));
  float anisotropy = clamp(u_anisotropyStrength, 0.0, 1.0);
  vec3 anisotropyLobe = vec3(anisotropy * (0.04 + 0.02 * cos(u_anisotropyRotation)));
  float iridescence = clamp(u_iridescenceFactor, 0.0, 1.0);
  float iridescenceThickness = clamp((u_iridescenceThicknessMinimum + u_iridescenceThicknessMaximum) * 0.5, 0.0, 1200.0);
  float iridescencePhase = clamp((iridescenceThickness - 100.0) / 1100.0, 0.0, 1.0) * 6.2831853;
  float iridescenceIorBoost = clamp((u_iridescenceIor - 1.0) / 2.0, 0.0, 1.0);
  vec3 iridescenceColor = 0.5 + 0.5 * cos(iridescencePhase + vec3(0.0, 2.0943951, 4.1887902));
  vec3 iridescenceLobe = iridescenceColor * iridescence * (0.04 + iridescenceIorBoost * 0.04);
  float dispersionAmount = clamp(u_dispersion / 100.0, 0.0, 1.0);
  vec3 dispersionTint = mix(vec3(1.0), vec3(1.04, 0.98, 0.94), dispersionAmount * transmission);
  return max(vec3(0.0), transmitted * dispersionTint + specularLobe + sheenLobe + clearcoatLobe + anisotropyLobe + iridescenceLobe);
}
void main() {
  vec3 shaded = u_emissiveColor * u_emissiveStrength;
  int count = min(int(u_lightCount), 8);
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
      attenuation = clamp(1.0 - distanceToLight / range, 0.0, 1.0);
      attenuation *= attenuation;
    }
    if (kind > 1.5) {
      vec3 lightToFragment = normalize(v_worldPosition - positionRange.xyz);
      float cone = dot(normalize(directionKind.xyz), lightToFragment);
      float outer = cos(spotShadowLayer.x);
      float inner = cos(spotShadowLayer.x * max(1.0 - spotShadowLayer.y, 0.001));
      attenuation *= smoothstep(outer, inner, cone);
    }
    shaded += g3dLambert(v_normal, lightDirection, colorIntensity.rgb, colorIntensity.a * attenuation);
  }
  vec3 base = u_baseColor.rgb * v_vertexColor.rgb * mix(1.0, 0.9, clamp(u_metallic, 0.0, 1.0)) * (1.0 - clamp(u_roughness, 0.0, 1.0) * 0.35);
  base = g3dApplyAdvancedPbrLobes(base);
  float alpha = u_baseColor.a * v_vertexColor.a;
  if (alpha < u_alphaCutoff) discard;
  outColor = vec4(base * max(shaded, vec3(0.04)), alpha);
}
