/**
 * bloom.glsl - Bloom/Glow Post-Processing
 *
 * Implements high-quality bloom with:
 * - Threshold extraction
 * - Gaussian blur (separable)
 * - Downscale/upscale pyramid
 * - Lens dirt/starburst effects
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef BLOOM_THRESHOLD
#define BLOOM_THRESHOLD 1.0
#endif

#ifndef BLOOM_SOFT_THRESHOLD
#define BLOOM_SOFT_THRESHOLD 0.5
#endif

#ifndef BLOOM_INTENSITY
#define BLOOM_INTENSITY 1.0
#endif

#ifndef BLOOM_MIP_LEVELS
#define BLOOM_MIP_LEVELS 6
#endif

// ============================================================================
// Threshold Extraction
// ============================================================================

/**
 * Extract bright areas using threshold
 */
vec3 extractBrightness(vec3 color, float threshold, float softThreshold) {
    float brightness = luminance(color);
    float soft = brightness - threshold + softThreshold;
    soft = saturate(soft / (2.0 * softThreshold));
    soft = soft * soft;

    float contribution = max(soft, brightness - threshold);
    contribution /= max(brightness, EPSILON);

    return color * contribution;
}

/**
 * Extract with smooth falloff
 */
vec3 extractBrightnessSoft(vec3 color, float threshold) {
    float brightness = max(color.r, max(color.g, color.b));
    float knee = threshold * BLOOM_SOFT_THRESHOLD;
    float soft = saturate((brightness - threshold + knee) / (2.0 * knee));

    return color * pow(soft, 2.0);
}

/**
 * Extract with adaptive threshold based on scene luminance
 */
vec3 extractBrightnessAdaptive(vec3 color, float avgLuminance) {
    float threshold = BLOOM_THRESHOLD * (1.0 + avgLuminance);
    return extractBrightness(color, threshold, BLOOM_SOFT_THRESHOLD);
}

// ============================================================================
// Gaussian Blur
// ============================================================================

/**
 * 9-tap Gaussian blur
 */
vec3 gaussianBlur9(sampler2D tex, vec2 texCoord, vec2 direction, vec2 texelSize) {
    const float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

    vec3 result = texture(tex, texCoord).rgb * weights[0];

    for (int i = 1; i < 5; i++) {
        vec2 offset = direction * texelSize * float(i);
        result += texture(tex, texCoord + offset).rgb * weights[i];
        result += texture(tex, texCoord - offset).rgb * weights[i];
    }

    return result;
}

/**
 * 13-tap Gaussian blur (higher quality)
 */
vec3 gaussianBlur13(sampler2D tex, vec2 texCoord, vec2 direction, vec2 texelSize) {
    const float weights[7] = float[](
        0.382928,
        0.241732,
        0.060598,
        0.005977,
        0.000229,
        0.000003,
        0.0
    );

    vec3 result = texture(tex, texCoord).rgb * weights[0];

    for (int i = 1; i < 7; i++) {
        vec2 offset = direction * texelSize * float(i);
        result += texture(tex, texCoord + offset).rgb * weights[i];
        result += texture(tex, texCoord - offset).rgb * weights[i];
    }

    return result;
}

/**
 * Optimized 5-tap Gaussian blur using bilinear filtering
 */
vec3 gaussianBlur5Bilinear(sampler2D tex, vec2 texCoord, vec2 direction, vec2 texelSize) {
    vec2 offset1 = direction * texelSize * 1.3846153846;
    vec2 offset2 = direction * texelSize * 3.2307692308;

    vec3 result = texture(tex, texCoord).rgb * 0.2270270270;
    result += texture(tex, texCoord + offset1).rgb * 0.3162162162;
    result += texture(tex, texCoord - offset1).rgb * 0.3162162162;
    result += texture(tex, texCoord + offset2).rgb * 0.0702702703;
    result += texture(tex, texCoord - offset2).rgb * 0.0702702703;

    return result;
}

/**
 * Kawase blur (dual filter)
 */
vec3 kawaseBlurDown(sampler2D tex, vec2 texCoord, vec2 texelSize, float offset) {
    vec3 result = vec3(0.0);

    result += texture(tex, texCoord + vec2(-1.0, -1.0) * texelSize * offset).rgb;
    result += texture(tex, texCoord + vec2(-1.0, 1.0) * texelSize * offset).rgb;
    result += texture(tex, texCoord + vec2(1.0, -1.0) * texelSize * offset).rgb;
    result += texture(tex, texCoord + vec2(1.0, 1.0) * texelSize * offset).rgb;

    return result * 0.25;
}

vec3 kawaseBlurUp(sampler2D tex, vec2 texCoord, vec2 texelSize, float offset) {
    vec3 result = vec3(0.0);

    result += texture(tex, texCoord + vec2(-1.0, -1.0) * texelSize * offset).rgb * 2.0;
    result += texture(tex, texCoord + vec2(-1.0, 1.0) * texelSize * offset).rgb * 2.0;
    result += texture(tex, texCoord + vec2(1.0, -1.0) * texelSize * offset).rgb * 2.0;
    result += texture(tex, texCoord + vec2(1.0, 1.0) * texelSize * offset).rgb * 2.0;

    result += texture(tex, texCoord + vec2(-2.0, 0.0) * texelSize * offset).rgb;
    result += texture(tex, texCoord + vec2(0.0, -2.0) * texelSize * offset).rgb;
    result += texture(tex, texCoord + vec2(2.0, 0.0) * texelSize * offset).rgb;
    result += texture(tex, texCoord + vec2(0.0, 2.0) * texelSize * offset).rgb;

    return result / 12.0;
}

// ============================================================================
// Downscale/Upscale
// ============================================================================

/**
 * Downscale with 13-tap filter (better quality)
 */
vec3 downscale13(sampler2D tex, vec2 texCoord, vec2 texelSize) {
    vec3 result = vec3(0.0);

    // Center
    result += texture(tex, texCoord).rgb * 0.125;

    // Inner ring
    result += texture(tex, texCoord + vec2(-1.0, -1.0) * texelSize).rgb * 0.125;
    result += texture(tex, texCoord + vec2(-1.0, 1.0) * texelSize).rgb * 0.125;
    result += texture(tex, texCoord + vec2(1.0, -1.0) * texelSize).rgb * 0.125;
    result += texture(tex, texCoord + vec2(1.0, 1.0) * texelSize).rgb * 0.125;

    // Outer ring
    result += texture(tex, texCoord + vec2(-2.0, 0.0) * texelSize).rgb * 0.0625;
    result += texture(tex, texCoord + vec2(2.0, 0.0) * texelSize).rgb * 0.0625;
    result += texture(tex, texCoord + vec2(0.0, -2.0) * texelSize).rgb * 0.0625;
    result += texture(tex, texCoord + vec2(0.0, 2.0) * texelSize).rgb * 0.0625;

    result += texture(tex, texCoord + vec2(-1.0, 0.0) * texelSize).rgb * 0.0625;
    result += texture(tex, texCoord + vec2(1.0, 0.0) * texelSize).rgb * 0.0625;
    result += texture(tex, texCoord + vec2(0.0, -1.0) * texelSize).rgb * 0.0625;
    result += texture(tex, texCoord + vec2(0.0, 1.0) * texelSize).rgb * 0.0625;

    return result;
}

/**
 * Box downscale (fast)
 */
vec3 downscaleBox(sampler2D tex, vec2 texCoord, vec2 texelSize) {
    vec3 result = vec3(0.0);

    result += texture(tex, texCoord + vec2(-0.5, -0.5) * texelSize).rgb;
    result += texture(tex, texCoord + vec2(-0.5, 0.5) * texelSize).rgb;
    result += texture(tex, texCoord + vec2(0.5, -0.5) * texelSize).rgb;
    result += texture(tex, texCoord + vec2(0.5, 0.5) * texelSize).rgb;

    return result * 0.25;
}

/**
 * Tent upscale filter
 */
vec3 upscaleTent(sampler2D tex, vec2 texCoord, vec2 texelSize) {
    vec4 d = texelSize.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);

    vec3 result = vec3(0.0);

    result += texture(tex, texCoord + d.xy).rgb;
    result += texture(tex, texCoord + d.zy).rgb * 2.0;
    result += texture(tex, texCoord + d.xw).rgb * 2.0;
    result += texture(tex, texCoord + d.zw).rgb;

    return result * 0.25;
}

// ============================================================================
// Mipmap Pyramid
// ============================================================================

/**
 * Generate bloom mipmap chain (downscale)
 */
vec3 generateBloomMip(sampler2D sourceTex, vec2 texCoord, int mipLevel) {
    vec2 texelSize = 1.0 / vec2(textureSize(sourceTex, mipLevel));

    #ifdef BLOOM_HIGH_QUALITY
        return downscale13(sourceTex, texCoord, texelSize);
    #else
        return downscaleBox(sourceTex, texCoord, texelSize);
    #endif
}

/**
 * Combine bloom mipmap chain (upscale)
 */
vec3 combineBloomMips(sampler2D bloomChain, vec2 texCoord, int baseMip, float intensity) {
    vec3 bloom = vec3(0.0);

    for (int i = 0; i < BLOOM_MIP_LEVELS; i++) {
        int mip = baseMip + i;
        vec2 texelSize = 1.0 / vec2(textureSize(bloomChain, mip));

        vec3 sample = upscaleTent(bloomChain, texCoord, texelSize);
        bloom += sample * intensity;
        intensity *= 0.5; // Reduce contribution of higher mips
    }

    return bloom;
}

// ============================================================================
// Lens Effects
// ============================================================================

/**
 * Lens dirt effect
 */
vec3 applyLensDirt(vec3 bloom, sampler2D lensDirtTex, vec2 texCoord, float intensity) {
    vec3 dirt = texture(lensDirtTex, texCoord).rgb;
    return bloom * (1.0 + dirt * intensity);
}

/**
 * Lens starburst/flare effect
 */
vec3 applyStarburst(vec3 bloom, vec2 texCoord, vec2 center, float intensity, int rays) {
    vec2 delta = texCoord - center;
    float angle = atan(delta.y, delta.x);
    float dist = length(delta);

    float starburst = 0.0;
    for (int i = 0; i < rays; i++) {
        float rayAngle = float(i) * TWO_PI / float(rays);
        float angleDiff = abs(angle - rayAngle);
        angleDiff = min(angleDiff, TWO_PI - angleDiff);
        starburst += exp(-angleDiff * 50.0) * exp(-dist * 2.0);
    }

    return bloom * (1.0 + starburst * intensity);
}

/**
 * Chromatic aberration for bloom
 */
vec3 bloomChromaticAberration(sampler2D bloomTex, vec2 texCoord, vec2 center, float strength) {
    vec2 delta = texCoord - center;
    float dist = length(delta);

    vec2 direction = normalize(delta);
    vec2 offset = direction * dist * strength;

    float r = texture(bloomTex, texCoord - offset * 0.5).r;
    float g = texture(bloomTex, texCoord).g;
    float b = texture(bloomTex, texCoord + offset * 0.5).b;

    return vec3(r, g, b);
}

// ============================================================================
// Bloom Combination
// ============================================================================

/**
 * Additive bloom blend
 */
vec3 blendBloomAdditive(vec3 baseColor, vec3 bloom, float intensity) {
    return baseColor + bloom * intensity;
}

/**
 * Screen blend mode
 */
vec3 blendBloomScreen(vec3 baseColor, vec3 bloom, float intensity) {
    bloom *= intensity;
    return baseColor + bloom - baseColor * bloom;
}

/**
 * Soft light blend
 */
vec3 blendBloomSoftLight(vec3 baseColor, vec3 bloom, float intensity) {
    bloom *= intensity;
    return mix(baseColor, sqrt(baseColor) * (2.0 * bloom - 1.0) + 2.0 * baseColor * (1.0 - bloom), intensity);
}

/**
 * Adaptive bloom based on scene luminance
 */
vec3 blendBloomAdaptive(vec3 baseColor, vec3 bloom, float avgLuminance, float intensity) {
    float adaptiveFactor = 1.0 / (1.0 + avgLuminance);
    return blendBloomAdditive(baseColor, bloom, intensity * adaptiveFactor);
}

// ============================================================================
// Complete Bloom Pipeline
// ============================================================================

/**
 * Full bloom effect
 * @param baseColor Original scene color
 * @param bloomTex Bloom texture (pre-blurred)
 * @param texCoord Screen coordinates
 * @param intensity Bloom intensity
 */
vec3 applyBloom(vec3 baseColor, sampler2D bloomTex, vec2 texCoord, float intensity) {
    vec3 bloom = texture(bloomTex, texCoord).rgb;

    #ifdef BLOOM_USE_SCREEN_BLEND
        return blendBloomScreen(baseColor, bloom, intensity);
    #else
        return blendBloomAdditive(baseColor, bloom, intensity);
    #endif
}

/**
 * Bloom with lens effects
 */
vec3 applyBloomWithLens(vec3 baseColor, sampler2D bloomTex,
                        sampler2D lensDirtTex, vec2 texCoord,
                        float bloomIntensity, float dirtIntensity) {
    vec3 bloom = texture(bloomTex, texCoord).rgb;
    bloom = applyLensDirt(bloom, lensDirtTex, texCoord, dirtIntensity);

    return blendBloomAdditive(baseColor, bloom, bloomIntensity);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate bloom threshold based on exposure
 */
float calculateAdaptiveThreshold(float exposure) {
    return BLOOM_THRESHOLD / max(exposure, 0.1);
}

/**
 * Fireflies suppression (remove very bright single pixels)
 */
vec3 suppressFireflies(sampler2D tex, vec2 texCoord, vec2 texelSize) {
    vec3 center = texture(tex, texCoord).rgb;

    vec3 neighbors = vec3(0.0);
    neighbors += texture(tex, texCoord + vec2(-1.0, 0.0) * texelSize).rgb;
    neighbors += texture(tex, texCoord + vec2(1.0, 0.0) * texelSize).rgb;
    neighbors += texture(tex, texCoord + vec2(0.0, -1.0) * texelSize).rgb;
    neighbors += texture(tex, texCoord + vec2(0.0, 1.0) * texelSize).rgb;
    neighbors *= 0.25;

    float centerLum = luminance(center);
    float neighborsLum = luminance(neighbors);

    // If center is much brighter than neighbors, it's likely a firefly
    if (centerLum > neighborsLum * 4.0) {
        return neighbors;
    }

    return center;
}
