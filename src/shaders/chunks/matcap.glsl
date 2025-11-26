/**
 * matcap.glsl - MatCap (Material Capture) Shading
 *
 * Implements MatCap lookup for stylized rendering
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

/**
 * Calculate MatCap UV coordinates from view-space normal
 */
vec2 calculateMatCapUV(vec3 viewSpaceNormal) {
    vec2 uv = viewSpaceNormal.xy * 0.5 + 0.5;
    return uv;
}

/**
 * Sample MatCap texture
 */
vec3 sampleMatCap(sampler2D matCapTexture, vec3 normal, mat4 viewMatrix) {
    vec3 viewNormal = normalize((viewMatrix * vec4(normal, 0.0)).xyz);
    vec2 uv = calculateMatCapUV(viewNormal);
    return texture(matCapTexture, uv).rgb;
}

/**
 * Blend MatCap with base color
 */
vec3 blendMatCap(vec3 baseColor, vec3 matCapColor, float intensity) {
    return mix(baseColor, baseColor * matCapColor, intensity);
}

/**
 * Dual MatCap (for rim effects)
 */
vec3 dualMatCap(sampler2D matCap1, sampler2D matCap2, vec3 normal,
                mat4 viewMatrix, float blend) {
    vec3 mc1 = sampleMatCap(matCap1, normal, viewMatrix);
    vec3 mc2 = sampleMatCap(matCap2, normal, viewMatrix);
    return mix(mc1, mc2, blend);
}
