/**
 * shadow.glsl - Shadow mapping utilities
 *
 * Provides shadow mapping functions including:
 * - Basic shadow sampling
 * - PCF (Percentage Closer Filtering)
 * - PCSS (Percentage Closer Soft Shadows)
 * - Cascaded shadow maps
 * - Shadow bias calculation
 *
 * Dependencies:
 * - common.glsl for constants and utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef SHADOW_BIAS_CONSTANT
#define SHADOW_BIAS_CONSTANT 0.005
#endif

#ifndef SHADOW_BIAS_SLOPE
#define SHADOW_BIAS_SLOPE 0.01
#endif

#ifndef SHADOW_NORMAL_BIAS
#define SHADOW_NORMAL_BIAS 0.01
#endif

#ifndef SHADOW_PCF_SAMPLES
#define SHADOW_PCF_SAMPLES 16
#endif

#ifndef SHADOW_PCSS_BLOCKER_SAMPLES
#define SHADOW_PCSS_BLOCKER_SAMPLES 16
#endif

#ifndef SHADOW_PCSS_PCF_SAMPLES
#define SHADOW_PCSS_PCF_SAMPLES 16
#endif

#ifndef SHADOW_CASCADE_COUNT
#define SHADOW_CASCADE_COUNT 4
#endif

// ============================================================================
// Poisson Disk Samples for PCF
// ============================================================================

const vec2 POISSON_DISK_16[16] = vec2[](
    vec2(-0.94201624, -0.39906216),
    vec2(0.94558609, -0.76890725),
    vec2(-0.094184101, -0.92938870),
    vec2(0.34495938, 0.29387760),
    vec2(-0.91588581, 0.45771432),
    vec2(-0.81544232, -0.87912464),
    vec2(-0.38277543, 0.27676845),
    vec2(0.97484398, 0.75648379),
    vec2(0.44323325, -0.97511554),
    vec2(0.53742981, -0.47373420),
    vec2(-0.26496911, -0.41893023),
    vec2(0.79197514, 0.19090188),
    vec2(-0.24188840, 0.99706507),
    vec2(-0.81409955, 0.91437590),
    vec2(0.19984126, 0.78641367),
    vec2(0.14383161, -0.14100790)
);

const vec2 POISSON_DISK_32[32] = vec2[](
    vec2(-0.975402, -0.0711386),
    vec2(-0.920347, -0.441282),
    vec2(-0.883908, 0.217872),
    vec2(-0.884518, 0.568041),
    vec2(-0.811945, -0.790709),
    vec2(-0.792474, 0.0130608),
    vec2(-0.644704, -0.569165),
    vec2(-0.634888, 0.682157),
    vec2(-0.624807, -0.238616),
    vec2(-0.590539, 0.327366),
    vec2(-0.504396, -0.863621),
    vec2(-0.454499, 0.875562),
    vec2(-0.416458, -0.0370163),
    vec2(-0.345554, -0.670523),
    vec2(-0.272745, 0.535116),
    vec2(-0.238006, -0.369068),
    vec2(-0.190885, 0.918882),
    vec2(-0.149278, 0.0543955),
    vec2(0.00910668, -0.869337),
    vec2(0.0293372, 0.358103),
    vec2(0.0968844, -0.0888426),
    vec2(0.185344, -0.536082),
    vec2(0.239055, 0.717623),
    vec2(0.301938, -0.281269),
    vec2(0.392248, 0.0857121),
    vec2(0.487048, -0.733963),
    vec2(0.549342, 0.478623),
    vec2(0.625366, -0.0596615),
    vec2(0.688151, -0.462789),
    vec2(0.736279, 0.253616),
    vec2(0.816755, 0.604563),
    vec2(0.897866, -0.192168)
);

// ============================================================================
// Shadow Bias
// ============================================================================

/**
 * Calculate shadow bias based on surface normal and light direction
 * @param N Surface normal
 * @param L Light direction
 */
float calculateShadowBias(vec3 N, vec3 L) {
    float cosTheta = saturate(dot(N, L));
    return SHADOW_BIAS_CONSTANT + SHADOW_BIAS_SLOPE * tan(acos(cosTheta));
}

/**
 * Apply normal offset bias to shadow coordinate
 * @param worldPos World space position
 * @param N Surface normal
 * @param L Light direction
 */
vec3 applyShadowNormalBias(vec3 worldPos, vec3 N, vec3 L) {
    float cosTheta = saturate(dot(N, L));
    return worldPos + N * SHADOW_NORMAL_BIAS * sqrt(1.0 - cosTheta * cosTheta);
}

/**
 * Apply complete shadow bias
 */
float applyShadowBias(float depth, vec3 N, vec3 L) {
    return depth - calculateShadowBias(N, L);
}

// ============================================================================
// Basic Shadow Sampling
// ============================================================================

/**
 * Sample shadow map (hard shadows)
 * @param shadowMap Shadow depth map
 * @param shadowCoord Shadow space coordinate (xyz/w)
 * @return Shadow factor [0 = shadowed, 1 = lit]
 */
float sampleShadowMap(sampler2D shadowMap, vec3 shadowCoord) {
    if (shadowCoord.z > 1.0 || shadowCoord.z < 0.0) {
        return 1.0;
    }

    float shadowDepth = texture(shadowMap, shadowCoord.xy).r;
    return shadowCoord.z <= shadowDepth ? 1.0 : 0.0;
}

/**
 * Sample shadow map with depth comparison sampler
 */
float sampleShadowMapComparison(sampler2DShadow shadowMap, vec3 shadowCoord) {
    if (shadowCoord.z > 1.0 || shadowCoord.z < 0.0) {
        return 1.0;
    }

    return texture(shadowMap, shadowCoord);
}

// ============================================================================
// PCF (Percentage Closer Filtering)
// ============================================================================

/**
 * PCF shadow sampling with fixed sample count
 * @param shadowMap Shadow depth map
 * @param shadowCoord Shadow space coordinate
 * @param filterRadius Filter radius in texel units
 */
float sampleShadowMapPCF(sampler2D shadowMap, vec3 shadowCoord, float filterRadius) {
    if (shadowCoord.z > 1.0 || shadowCoord.z < 0.0) {
        return 1.0;
    }

    vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));
    float shadow = 0.0;

    for (int i = 0; i < SHADOW_PCF_SAMPLES; i++) {
        vec2 offset = POISSON_DISK_16[i] * filterRadius * texelSize;
        float shadowDepth = texture(shadowMap, shadowCoord.xy + offset).r;
        shadow += shadowCoord.z <= shadowDepth ? 1.0 : 0.0;
    }

    return shadow / float(SHADOW_PCF_SAMPLES);
}

/**
 * PCF with comparison sampler (hardware-accelerated)
 */
float sampleShadowMapPCFComparison(sampler2DShadow shadowMap, vec3 shadowCoord, float filterRadius) {
    if (shadowCoord.z > 1.0 || shadowCoord.z < 0.0) {
        return 1.0;
    }

    vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));
    float shadow = 0.0;

    for (int i = 0; i < SHADOW_PCF_SAMPLES; i++) {
        vec2 offset = POISSON_DISK_16[i] * filterRadius * texelSize;
        shadow += texture(shadowMap, vec3(shadowCoord.xy + offset, shadowCoord.z));
    }

    return shadow / float(SHADOW_PCF_SAMPLES);
}

/**
 * Optimized 3x3 PCF
 */
float sampleShadowMapPCF3x3(sampler2DShadow shadowMap, vec3 shadowCoord) {
    if (shadowCoord.z > 1.0 || shadowCoord.z < 0.0) {
        return 1.0;
    }

    vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));
    float shadow = 0.0;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(x, y) * texelSize;
            shadow += texture(shadowMap, vec3(shadowCoord.xy + offset, shadowCoord.z));
        }
    }

    return shadow / 9.0;
}

// ============================================================================
// PCSS (Percentage Closer Soft Shadows)
// ============================================================================

/**
 * Search for blocker depth in PCSS
 */
float findBlockerDepth(sampler2D shadowMap, vec3 shadowCoord, float searchRadius) {
    vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));
    float blockerDepthSum = 0.0;
    float numBlockers = 0.0;

    for (int i = 0; i < SHADOW_PCSS_BLOCKER_SAMPLES; i++) {
        vec2 offset = POISSON_DISK_16[i] * searchRadius * texelSize;
        float shadowDepth = texture(shadowMap, shadowCoord.xy + offset).r;

        if (shadowDepth < shadowCoord.z) {
            blockerDepthSum += shadowDepth;
            numBlockers += 1.0;
        }
    }

    if (numBlockers < 1.0) {
        return -1.0; // No blockers found
    }

    return blockerDepthSum / numBlockers;
}

/**
 * Estimate penumbra width for PCSS
 */
float estimatePenumbraWidth(float receiverDepth, float blockerDepth, float lightSize) {
    return lightSize * (receiverDepth - blockerDepth) / blockerDepth;
}

/**
 * PCSS shadow sampling
 * @param shadowMap Shadow depth map
 * @param shadowCoord Shadow space coordinate
 * @param lightSize Light source size (world units)
 * @param searchRadius Search radius for blocker search
 */
float sampleShadowMapPCSS(sampler2D shadowMap, vec3 shadowCoord, float lightSize, float searchRadius) {
    if (shadowCoord.z > 1.0 || shadowCoord.z < 0.0) {
        return 1.0;
    }

    // Step 1: Blocker search
    float blockerDepth = findBlockerDepth(shadowMap, shadowCoord, searchRadius);

    if (blockerDepth < 0.0) {
        return 1.0; // No blockers, fully lit
    }

    // Step 2: Estimate penumbra width
    float penumbraWidth = estimatePenumbraWidth(shadowCoord.z, blockerDepth, lightSize);
    float filterRadius = penumbraWidth * searchRadius;

    // Step 3: PCF with estimated filter radius
    vec2 texelSize = 1.0 / vec2(textureSize(shadowMap, 0));
    float shadow = 0.0;

    for (int i = 0; i < SHADOW_PCSS_PCF_SAMPLES; i++) {
        vec2 offset = POISSON_DISK_16[i] * filterRadius * texelSize;
        float shadowDepth = texture(shadowMap, shadowCoord.xy + offset).r;
        shadow += shadowCoord.z <= shadowDepth ? 1.0 : 0.0;
    }

    return shadow / float(SHADOW_PCSS_PCF_SAMPLES);
}

// ============================================================================
// Cascaded Shadow Maps
// ============================================================================

/**
 * Select cascade level based on view space depth
 * @param viewSpaceDepth Fragment depth in view space
 * @param cascadeSplits Array of cascade split distances
 * @param cascadeCount Number of cascades
 */
int selectCascade(float viewSpaceDepth, float cascadeSplits[SHADOW_CASCADE_COUNT], int cascadeCount) {
    for (int i = 0; i < cascadeCount - 1; i++) {
        if (viewSpaceDepth < cascadeSplits[i]) {
            return i;
        }
    }
    return cascadeCount - 1;
}

/**
 * Get shadow coordinate for specific cascade
 */
vec3 getShadowCoord(vec3 worldPos, mat4 shadowMatrix) {
    vec4 shadowCoord = shadowMatrix * vec4(worldPos, 1.0);
    shadowCoord.xyz /= shadowCoord.w;
    shadowCoord.xyz = shadowCoord.xyz * 0.5 + 0.5; // [-1, 1] to [0, 1]
    return shadowCoord.xyz;
}

/**
 * Sample cascaded shadow map
 * @param shadowMaps Array of shadow maps (one per cascade)
 * @param worldPos World space position
 * @param viewSpaceDepth View space depth
 * @param shadowMatrices Shadow matrices for each cascade
 * @param cascadeSplits Cascade split distances
 * @param cascadeCount Number of cascades
 */
#ifdef SHADOW_USE_CASCADES
float sampleCascadedShadow(sampler2D shadowMaps[SHADOW_CASCADE_COUNT],
                           vec3 worldPos, float viewSpaceDepth,
                           mat4 shadowMatrices[SHADOW_CASCADE_COUNT],
                           float cascadeSplits[SHADOW_CASCADE_COUNT],
                           int cascadeCount) {
    // Select cascade
    int cascadeIndex = selectCascade(viewSpaceDepth, cascadeSplits, cascadeCount);

    // Get shadow coordinate
    vec3 shadowCoord = getShadowCoord(worldPos, shadowMatrices[cascadeIndex]);

    // Sample shadow map with PCF
    #ifdef SHADOW_USE_PCF
        return sampleShadowMapPCF(shadowMaps[cascadeIndex], shadowCoord, 1.0);
    #else
        return sampleShadowMap(shadowMaps[cascadeIndex], shadowCoord);
    #endif
}
#endif

/**
 * Sample cascaded shadow with blend between cascades
 */
#ifdef SHADOW_USE_CASCADES
float sampleCascadedShadowBlended(sampler2D shadowMaps[SHADOW_CASCADE_COUNT],
                                  vec3 worldPos, float viewSpaceDepth,
                                  mat4 shadowMatrices[SHADOW_CASCADE_COUNT],
                                  float cascadeSplits[SHADOW_CASCADE_COUNT],
                                  int cascadeCount, float blendRange) {
    // Select cascade
    int cascadeIndex = selectCascade(viewSpaceDepth, cascadeSplits, cascadeCount);

    // Get shadow for current cascade
    vec3 shadowCoord = getShadowCoord(worldPos, shadowMatrices[cascadeIndex]);
    float shadow = sampleShadowMapPCF(shadowMaps[cascadeIndex], shadowCoord, 1.0);

    // Blend with next cascade if near transition
    if (cascadeIndex < cascadeCount - 1) {
        float splitDist = cascadeSplits[cascadeIndex];
        float blendStart = splitDist - blendRange;

        if (viewSpaceDepth > blendStart) {
            vec3 nextShadowCoord = getShadowCoord(worldPos, shadowMatrices[cascadeIndex + 1]);
            float nextShadow = sampleShadowMapPCF(shadowMaps[cascadeIndex + 1], nextShadowCoord, 1.0);

            float blendFactor = (viewSpaceDepth - blendStart) / blendRange;
            shadow = mix(shadow, nextShadow, blendFactor);
        }
    }

    return shadow;
}
#endif

// ============================================================================
// Point Light Shadow (Cubemap)
// ============================================================================

/**
 * Sample point light shadow from cubemap
 * @param shadowCubemap Shadow cubemap
 * @param lightPos Light position in world space
 * @param worldPos Fragment position in world space
 * @param farPlane Far plane of shadow projection
 */
float samplePointLightShadow(samplerCube shadowCubemap, vec3 lightPos, vec3 worldPos, float farPlane) {
    vec3 lightToFrag = worldPos - lightPos;
    float currentDepth = length(lightToFrag) / farPlane;
    float shadowDepth = texture(shadowCubemap, lightToFrag).r;

    return currentDepth <= shadowDepth ? 1.0 : 0.0;
}

/**
 * Sample point light shadow with PCF
 */
float samplePointLightShadowPCF(samplerCube shadowCubemap, vec3 lightPos, vec3 worldPos,
                                float farPlane, float filterRadius) {
    vec3 lightToFrag = worldPos - lightPos;
    float currentDepth = length(lightToFrag) / farPlane;

    vec3 sampleOffsets[20] = vec3[](
        vec3(1, 1, 1), vec3(1, -1, 1), vec3(-1, -1, 1), vec3(-1, 1, 1),
        vec3(1, 1, -1), vec3(1, -1, -1), vec3(-1, -1, -1), vec3(-1, 1, -1),
        vec3(1, 1, 0), vec3(1, -1, 0), vec3(-1, -1, 0), vec3(-1, 1, 0),
        vec3(1, 0, 1), vec3(-1, 0, 1), vec3(1, 0, -1), vec3(-1, 0, -1),
        vec3(0, 1, 1), vec3(0, -1, 1), vec3(0, -1, -1), vec3(0, 1, -1)
    );

    float shadow = 0.0;
    float diskRadius = filterRadius / farPlane;

    for (int i = 0; i < 20; i++) {
        vec3 sampleDir = lightToFrag + sampleOffsets[i] * diskRadius;
        float shadowDepth = texture(shadowCubemap, sampleDir).r;
        shadow += currentDepth <= shadowDepth ? 1.0 : 0.0;
    }

    return shadow / 20.0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate cascade debug visualization color
 */
vec3 getCascadeDebugColor(int cascadeIndex) {
    vec3 colors[8] = vec3[](
        vec3(1.0, 0.0, 0.0),  // Red
        vec3(0.0, 1.0, 0.0),  // Green
        vec3(0.0, 0.0, 1.0),  // Blue
        vec3(1.0, 1.0, 0.0),  // Yellow
        vec3(1.0, 0.0, 1.0),  // Magenta
        vec3(0.0, 1.0, 1.0),  // Cyan
        vec3(1.0, 0.5, 0.0),  // Orange
        vec3(0.5, 0.0, 1.0)   // Purple
    );

    return colors[cascadeIndex % 8];
}

/**
 * Check if position is in shadow frustum
 */
bool isInShadowFrustum(vec3 shadowCoord) {
    return shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 &&
           shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 &&
           shadowCoord.z >= 0.0 && shadowCoord.z <= 1.0;
}
