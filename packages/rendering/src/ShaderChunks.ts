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
  float clearcoat = clamp(clearcoatFactor, 0.0, 1.0) * (1.0 - clamp(clearcoatRoughnessFactor, 0.0, 1.0));
  float transmission = clamp(transmissionFactor, 0.0, 1.0);
  float diffuseTransmission = clamp(diffuseTransmissionFactor, 0.0, 1.0) * (1.0 - transmission);
  float volumeThickness = max(volumeThicknessFactor, 0.0);
  float volumeTravel = clamp(volumeThickness / max(volumeAttenuationDistance, 0.0001), 0.0, 1.0);
  vec3 volumeAttenuation = mix(vec3(1.0), clamp(volumeAttenuationColor, vec3(0.0), vec3(1.0)), volumeTravel);
  float iorBoost = clamp((ior - 1.0) / 1.5, 0.0, 1.0);
  float specular = clamp(specularFactor, 0.0, 1.0);
  float sheen = 1.0 - clamp(sheenRoughnessFactor, 0.0, 1.0);
  vec3 transmitted = mix(baseColor, vec3(dot(baseColor, vec3(0.2126, 0.7152, 0.0722))), transmission * 0.35);
  transmitted = mix(transmitted, clamp(diffuseTransmissionColorFactor, vec3(0.0), vec3(1.0)), diffuseTransmission);
  transmitted = mix(transmitted, transmitted * volumeAttenuation, transmission * clamp(volumeThickness, 0.0, 1.0));
  vec3 specularLobe = specularColorFactor * specular * (0.08 + iorBoost * 0.08);
  vec3 sheenLobe = sheenColorFactor * sheen * 0.15;
  vec3 clearcoatLobe = vec3(clearcoat * (0.08 + iorBoost * 0.05));
  float anisotropy = clamp(anisotropyStrength, 0.0, 1.0);
  vec3 anisotropyLobe = vec3(anisotropy * (0.04 + 0.02 * cos(anisotropyRotation)));
  float iridescence = clamp(iridescenceFactor, 0.0, 1.0);
  float iridescenceThickness = clamp((iridescenceThicknessMinimum + iridescenceThicknessMaximum) * 0.5, 0.0, 1200.0);
  float iridescencePhase = clamp((iridescenceThickness - 100.0) / 1100.0, 0.0, 1.0) * 6.2831853;
  float iridescenceIorBoost = clamp((iridescenceIor - 1.0) / 2.0, 0.0, 1.0);
  vec3 iridescenceColor = 0.5 + 0.5 * cos(iridescencePhase + vec3(0.0, 2.0943951, 4.1887902));
  vec3 iridescenceLobe = iridescenceColor * iridescence * (0.04 + iridescenceIorBoost * 0.04);
  float dispersionAmount = clamp(dispersion / 100.0, 0.0, 1.0);
  vec3 dispersionTint = mix(vec3(1.0), vec3(1.04, 0.98, 0.94), dispersionAmount * transmission);
  return max(vec3(0.0), transmitted * dispersionTint + specularLobe + sheenLobe + clearcoatLobe + anisotropyLobe + iridescenceLobe);
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
