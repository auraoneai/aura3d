export const SHADER_CHUNKS_THREE_COMPAT = {
  colorManagement: "vec3 linearToOutput(vec3 color) { return pow(color, vec3(1.0 / 2.2)); }",
  pbrLighting: "vec3 applyPbrLight(vec3 baseColor, float roughness) { return baseColor * (1.0 - roughness * 0.35); }",
  fog: "vec3 applyFog(vec3 color, float depth) { return mix(color, vec3(0.02, 0.03, 0.05), clamp(depth, 0.0, 1.0)); }",
  screenUv: "vec2 getScreenUv(vec2 fragCoord, vec2 resolution) { return fragCoord / resolution; }"
} as const;
