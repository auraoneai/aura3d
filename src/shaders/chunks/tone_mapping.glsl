/**
 * tone_mapping.glsl - Tone Mapping Operators
 *
 * Provides various tone mapping curves:
 * - ACES (Academy Color Encoding System)
 * - Reinhard (simple and extended)
 * - Uncharted 2 (Hable/Filmic)
 * - AgX
 * - Neutral (from Blender)
 * - Others (Hill, Uchimura, etc.)
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef TONE_MAPPING_EXPOSURE
#define TONE_MAPPING_EXPOSURE 1.0
#endif

#ifndef TONE_MAPPING_WHITE_POINT
#define TONE_MAPPING_WHITE_POINT 11.2
#endif

// ============================================================================
// ACES Tone Mapping
// ============================================================================

/**
 * ACES Filmic Tone Mapping (approximation)
 * Industry standard, widely used in film and games
 */
vec3 toneMapACES(vec3 color) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;

    color *= TONE_MAPPING_EXPOSURE;
    return saturate((color * (a * color + b)) / (color * (c * color + d) + e));
}

/**
 * ACES Fitted (higher quality)
 */
vec3 toneMapACESFitted(vec3 color) {
    color *= TONE_MAPPING_EXPOSURE;

    // sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
    const mat3 ACESInputMat = mat3(
        0.59719, 0.35458, 0.04823,
        0.07600, 0.90834, 0.01566,
        0.02840, 0.13383, 0.83777
    );

    // ODT_SAT => XYZ => D60_2_D65 => sRGB
    const mat3 ACESOutputMat = mat3(
        1.60475, -0.53108, -0.07367,
        -0.10208,  1.10813, -0.00605,
        -0.00327, -0.07276,  1.07602
    );

    color = ACESInputMat * color;

    // RRT and ODT fit
    vec3 a = color * (color + 0.0245786) - 0.000090537;
    vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
    color = a / b;

    color = ACESOutputMat * color;

    return saturate(color);
}

// ============================================================================
// Reinhard Tone Mapping
// ============================================================================

/**
 * Simple Reinhard tone mapping
 */
vec3 toneMapReinhard(vec3 color) {
    color *= TONE_MAPPING_EXPOSURE;
    return color / (1.0 + color);
}

/**
 * Luminance-based Reinhard
 */
vec3 toneMapReinhardLuminance(vec3 color) {
    color *= TONE_MAPPING_EXPOSURE;

    float luma = luminance(color);
    float toneMappedLuma = luma / (1.0 + luma);

    return color * (toneMappedLuma / max(luma, EPSILON));
}

/**
 * Extended Reinhard with white point
 */
vec3 toneMapReinhardExtended(vec3 color, float whitePoint) {
    color *= TONE_MAPPING_EXPOSURE;

    float luma = luminance(color);
    float numerator = luma * (1.0 + (luma / (whitePoint * whitePoint)));
    float toneMappedLuma = numerator / (1.0 + luma);

    return color * (toneMappedLuma / max(luma, EPSILON));
}

/**
 * Reinhard-Jodie (improved Reinhard variant)
 */
vec3 toneMapReinhardJodie(vec3 color) {
    color *= TONE_MAPPING_EXPOSURE;

    float luma = luminance(color);
    vec3 reinhard = color / (1.0 + color);
    vec3 reinhardLuma = vec3(luma / (1.0 + luma));

    return mix(reinhard, reinhardLuma, luma);
}

// ============================================================================
// Uncharted 2 (Hable/Filmic) Tone Mapping
// ============================================================================

/**
 * Uncharted 2 filmic function
 */
vec3 uncharted2Tonemap(vec3 x) {
    const float A = 0.15; // Shoulder Strength
    const float B = 0.50; // Linear Strength
    const float C = 0.10; // Linear Angle
    const float D = 0.20; // Toe Strength
    const float E = 0.02; // Toe Numerator
    const float F = 0.30; // Toe Denominator

    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

/**
 * Full Uncharted 2 tone mapping
 */
vec3 toneMapUncharted2(vec3 color) {
    const float exposureBias = 2.0;
    color *= TONE_MAPPING_EXPOSURE * exposureBias;

    vec3 curr = uncharted2Tonemap(color);
    vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(TONE_MAPPING_WHITE_POINT));

    return saturate(curr * whiteScale);
}

// ============================================================================
// AgX Tone Mapping
// ============================================================================

/**
 * AgX formation (log space)
 */
vec3 agxDefaultContrastApprox(vec3 x) {
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;

    return + 15.5     * x4 * x2
           - 40.14    * x4 * x
           + 31.96    * x4
           - 6.868    * x2 * x
           + 0.4298   * x2
           + 0.1191   * x
           - 0.00232;
}

/**
 * AgX tone mapping
 */
vec3 toneMapAgX(vec3 color) {
    color *= TONE_MAPPING_EXPOSURE;

    // Input transform (no matrix for simplicity)
    const float minEv = -12.47393;
    const float maxEv = 4.026069;

    // Log2 space encoding
    color = max(color, 1e-10);
    color = log2(color);
    color = (color - minEv) / (maxEv - minEv);

    // Apply sigmoid
    color = agxDefaultContrastApprox(color);

    return color;
}

// ============================================================================
// Neutral Tone Mapping (Blender)
// ============================================================================

/**
 * Neutral tone mapping curve (from Blender)
 */
vec3 toneMapNeutral(vec3 color) {
    color *= TONE_MAPPING_EXPOSURE;

    const float startCompression = 0.8 - 0.04;
    const float desaturation = 0.15;

    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;

    color -= offset;

    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) {
        return color;
    }

    const float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;

    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
}

// ============================================================================
// Other Tone Mapping Operators
// ============================================================================

/**
 * Hill tone mapping (simple S-curve)
 */
vec3 toneMapHill(vec3 color) {
    color *= TONE_MAPPING_EXPOSURE;

    const float a = 0.425;
    const float b = 0.040;
    const float c = 0.001;

    vec3 x = max(vec3(0.0), color - b);
    return (x * (a * x + c)) / (x * (a * x + b) + c);
}

/**
 * Uchimura (Gran Turismo)
 */
vec3 toneMapUchimura(vec3 color) {
    const float P = 1.0;  // Max brightness
    const float a = 1.0;  // Contrast
    const float m = 0.22; // Linear section start
    const float l = 0.4;  // Linear section length
    const float c = 1.33; // Black
    const float b = 0.0;  // Pedestal

    color *= TONE_MAPPING_EXPOSURE;

    float l0 = ((P - m) * l) / a;
    float L0 = m - m / a;
    float L1 = m + (1.0 - m) / a;
    float S0 = m + l0;
    float S1 = m + a * l0;
    float C2 = (a * P) / (P - S1);
    float CP = -C2 / P;

    vec3 w0 = vec3(1.0 - smoothstep(0.0, m, color));
    vec3 w2 = vec3(step(m + l0, color));
    vec3 w1 = vec3(1.0 - w0 - w2);

    vec3 T = vec3(m * pow(color / m, vec3(c)) + b);
    vec3 S = vec3(P - (P - S1) * exp(CP * (color - S0)));
    vec3 L = vec3(m + a * (color - m));

    return T * w0 + L * w1 + S * w2;
}

/**
 * Lottes tone mapping (optimized)
 */
vec3 toneMapLottes(vec3 color) {
    color *= TONE_MAPPING_EXPOSURE;

    const vec3 a = vec3(1.6);
    const vec3 d = vec3(0.977);
    const vec3 hdrMax = vec3(8.0);
    const vec3 midIn = vec3(0.18);
    const vec3 midOut = vec3(0.267);

    const vec3 b =
        (-pow(midIn, a) + pow(hdrMax, a) * midOut) /
        ((pow(hdrMax, a * d) - pow(midIn, a * d)) * midOut);
    const vec3 c =
        (pow(hdrMax, a * d) * pow(midIn, a) - pow(hdrMax, a) * pow(midIn, a * d) * midOut) /
        ((pow(hdrMax, a * d) - pow(midIn, a * d)) * midOut);

    return pow(color, a) / (pow(color, a * d) * b + c);
}

// ============================================================================
// Exposure and White Balance
// ============================================================================

/**
 * Apply exposure adjustment
 */
vec3 applyExposure(vec3 color, float exposure) {
    return color * pow(2.0, exposure);
}

/**
 * Apply white balance (temperature and tint)
 */
vec3 applyWhiteBalance(vec3 color, float temperature, float tint) {
    // Temperature adjustment (blue to orange)
    vec3 tempAdjust = vec3(1.0 + temperature * 0.5, 1.0, 1.0 - temperature * 0.5);

    // Tint adjustment (green to magenta)
    vec3 tintAdjust = vec3(1.0, 1.0 + tint * 0.5, 1.0 - tint * 0.5);

    return color * tempAdjust * tintAdjust;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Select tone mapping operator by enum/define
 */
vec3 applyToneMapping(vec3 color) {
    #if defined(TONE_MAPPING_ACES)
        return toneMapACES(color);
    #elif defined(TONE_MAPPING_ACES_FITTED)
        return toneMapACESFitted(color);
    #elif defined(TONE_MAPPING_REINHARD)
        return toneMapReinhard(color);
    #elif defined(TONE_MAPPING_REINHARD_EXTENDED)
        return toneMapReinhardExtended(color, TONE_MAPPING_WHITE_POINT);
    #elif defined(TONE_MAPPING_UNCHARTED2)
        return toneMapUncharted2(color);
    #elif defined(TONE_MAPPING_AGX)
        return toneMapAgX(color);
    #elif defined(TONE_MAPPING_NEUTRAL)
        return toneMapNeutral(color);
    #elif defined(TONE_MAPPING_UCHIMURA)
        return toneMapUchimura(color);
    #elif defined(TONE_MAPPING_LOTTES)
        return toneMapLottes(color);
    #else
        return toneMapACES(color); // Default
    #endif
}

/**
 * Calculate average scene luminance for auto-exposure
 */
float calculateAverageLuminance(sampler2D luminanceBuffer) {
    return textureLod(luminanceBuffer, vec2(0.5), 10.0).r; // Sample lowest mip
}

/**
 * Calculate auto-exposure value
 */
float calculateAutoExposure(float avgLuminance, float targetLuminance) {
    return targetLuminance / max(avgLuminance, EPSILON);
}

/**
 * Smooth exposure adaptation (temporal)
 */
float adaptExposure(float currentExposure, float targetExposure, float adaptationSpeed, float deltaTime) {
    return mix(currentExposure, targetExposure, 1.0 - exp(-adaptationSpeed * deltaTime));
}
