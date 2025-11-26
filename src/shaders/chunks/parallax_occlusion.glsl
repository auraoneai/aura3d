/**
 * parallax_occlusion.glsl - Parallax Occlusion Mapping
 *
 * Implements POM with self-shadowing for detailed surface displacement
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

#ifndef POM_STEPS
#define POM_STEPS 32
#endif

#ifndef POM_HEIGHT_SCALE
#define POM_HEIGHT_SCALE 0.1
#endif

/**
 * Parallax Occlusion Mapping
 */
vec2 parallaxOcclusionMapping(sampler2D heightMap, vec2 texCoord, vec3 viewDir,
                              vec3 tangent, vec3 bitangent, float heightScale) {
    // Calculate view direction in tangent space
    mat3 TBN = mat3(tangent, bitangent, cross(tangent, bitangent));
    vec3 viewDirTangent = normalize(transpose(TBN) * viewDir);

    // Number of layers
    float numLayers = float(POM_STEPS);
    float layerDepth = 1.0 / numLayers;
    float currentLayerDepth = 0.0;

    // Calculate offset per layer
    vec2 deltaTexCoord = viewDirTangent.xy * heightScale / numLayers;

    vec2 currentTexCoord = texCoord;
    float currentDepthMapValue = texture(heightMap, currentTexCoord).r;

    // Ray marching
    while (currentLayerDepth < currentDepthMapValue) {
        currentTexCoord -= deltaTexCoord;
        currentDepthMapValue = texture(heightMap, currentTexCoord).r;
        currentLayerDepth += layerDepth;
    }

    // Binary search refinement
    vec2 prevTexCoord = currentTexCoord + deltaTexCoord;

    for (int i = 0; i < 5; i++) {
        vec2 midTexCoord = (currentTexCoord + prevTexCoord) * 0.5;
        float midDepthMapValue = texture(heightMap, midTexCoord).r;
        float midLayerDepth = currentLayerDepth - layerDepth * 0.5;

        if (midLayerDepth < midDepthMapValue) {
            currentTexCoord = midTexCoord;
        } else {
            prevTexCoord = midTexCoord;
        }
    }

    return currentTexCoord;
}

/**
 * Self-shadowing for POM
 */
float parallaxSelfShadowing(sampler2D heightMap, vec2 texCoord, vec3 lightDir,
                            vec3 tangent, vec3 bitangent, float heightScale) {
    mat3 TBN = mat3(tangent, bitangent, cross(tangent, bitangent));
    vec3 lightDirTangent = normalize(transpose(TBN) * lightDir);

    float currentHeight = texture(heightMap, texCoord).r;
    vec2 deltaTexCoord = lightDirTangent.xy * heightScale / 10.0;

    float shadow = 1.0;

    for (int i = 0; i < 10; i++) {
        vec2 sampleCoord = texCoord + deltaTexCoord * float(i);
        float sampleHeight = texture(heightMap, sampleCoord).r;

        if (sampleHeight > currentHeight) {
            shadow = 0.0;
            break;
        }
    }

    return shadow;
}
