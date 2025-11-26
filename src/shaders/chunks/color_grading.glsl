/**
 * color_grading.glsl - Color Grading and Correction
 *
 * Comprehensive color grading tools:
 * - LUT (Look-Up Table) sampling
 * - Temperature and tint
 * - Contrast, saturation, gamma
 * - Lift, gamma, gain (3-way color correction)
 * - Shadow/midtone/highlight adjustments
 * - Hue, saturation, value per range
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef COLOR_GRADING_LUT_SIZE
#define COLOR_GRADING_LUT_SIZE 32
#endif

// ============================================================================
// LUT Sampling
// ============================================================================

/**
 * Sample 3D LUT texture (unwrapped to 2D)
 * @param lut LUT texture (SIZE x SIZE^2 layout)
 * @param color Input color [0, 1]
 * @param lutSize LUT dimension (typically 16, 32, or 64)
 */
vec3 sampleLUT(sampler2D lut, vec3 color, float lutSize) {
    // Prevent out-of-bounds access
    color = saturate(color) * (lutSize - 1.0) / lutSize;

    // Calculate 3D coordinates
    float sliceSize = 1.0 / lutSize;
    float slicePixelSize = sliceSize / lutSize;
    float sliceInnerSize = slicePixelSize * (lutSize - 1.0);

    float zSlice0 = min(floor(color.b * lutSize), lutSize - 1.0);
    float zSlice1 = min(zSlice0 + 1.0, lutSize - 1.0);

    float xOffset = slicePixelSize * 0.5 + color.r * sliceInnerSize;
    float s0 = xOffset + (zSlice0 * sliceSize);
    float s1 = xOffset + (zSlice1 * sliceSize);

    float yOffset = slicePixelSize * 0.5 + color.g * sliceInnerSize;

    vec3 slice0 = texture(lut, vec2(s0, yOffset)).rgb;
    vec3 slice1 = texture(lut, vec2(s1, yOffset)).rgb;

    float zOffset = mod(color.b * lutSize, 1.0);
    return mix(slice0, slice1, zOffset);
}

/**
 * Sample 3D LUT texture (true 3D texture)
 */
vec3 sampleLUT3D(sampler3D lut, vec3 color) {
    return texture(lut, saturate(color)).rgb;
}

/**
 * Blend between original color and LUT result
 */
vec3 blendLUT(vec3 original, vec3 graded, float intensity) {
    return mix(original, graded, intensity);
}

// ============================================================================
// Temperature and Tint
// ============================================================================

/**
 * Adjust color temperature
 * @param temperature Range: -1 (cool/blue) to 1 (warm/orange)
 */
vec3 adjustTemperature(vec3 color, float temperature) {
    // Simplified temperature adjustment
    vec3 warm = vec3(1.0, 0.9, 0.7);
    vec3 cool = vec3(0.7, 0.9, 1.0);

    vec3 temp = temperature > 0.0 ? warm : cool;
    float amount = abs(temperature);

    return mix(color, color * temp, amount);
}

/**
 * Adjust tint (green-magenta shift)
 * @param tint Range: -1 (green) to 1 (magenta)
 */
vec3 adjustTint(vec3 color, float tint) {
    vec3 shift = vec3(tint, -tint * 0.5, tint);
    return saturate(color + shift * 0.1);
}

/**
 * White balance adjustment (combined temperature and tint)
 */
vec3 adjustWhiteBalance(vec3 color, float temperature, float tint) {
    color = adjustTemperature(color, temperature);
    color = adjustTint(color, tint);
    return color;
}

// ============================================================================
// Basic Adjustments
// ============================================================================

/**
 * Adjust contrast
 * @param contrast Range: 0 (gray) to 2+ (high contrast)
 */
vec3 adjustContrast(vec3 color, float contrast) {
    return saturate((color - 0.5) * contrast + 0.5);
}

/**
 * Adjust saturation
 * @param saturation Range: 0 (grayscale) to 2+ (oversaturated)
 */
vec3 adjustSaturation(vec3 color, float saturation) {
    float luma = luminance(color);
    return mix(vec3(luma), color, saturation);
}

/**
 * Adjust vibrance (smart saturation, affects muted colors more)
 */
vec3 adjustVibrance(vec3 color, float vibrance) {
    float maxChannel = max(color.r, max(color.g, color.b));
    float minChannel = min(color.r, min(color.g, color.b));
    float saturationMask = maxChannel - minChannel;

    // Inverse saturation mask (affects desaturated colors more)
    float mask = 1.0 - saturationMask;

    float luma = luminance(color);
    vec3 saturated = mix(vec3(luma), color, 1.0 + vibrance);

    return mix(color, saturated, mask);
}

/**
 * Adjust gamma
 */
vec3 adjustGamma(vec3 color, float gamma) {
    return pow(max(color, vec3(0.0)), vec3(1.0 / gamma));
}

/**
 * Adjust brightness
 */
vec3 adjustBrightness(vec3 color, float brightness) {
    return saturate(color + brightness);
}

// ============================================================================
// Lift, Gamma, Gain (3-Way Color Correction)
// ============================================================================

/**
 * Lift (shadows)
 * Adds color to dark areas
 */
vec3 applyLift(vec3 color, vec3 lift) {
    return color + lift * (1.0 - color);
}

/**
 * Gamma (midtones)
 * Power function on midtones
 */
vec3 applyGamma(vec3 color, vec3 gamma) {
    return pow(max(color, vec3(0.0)), gamma);
}

/**
 * Gain (highlights)
 * Multiplies bright areas
 */
vec3 applyGain(vec3 color, vec3 gain) {
    return color * gain;
}

/**
 * Full lift-gamma-gain correction
 */
vec3 applyLiftGammaGain(vec3 color, vec3 lift, vec3 gamma, vec3 gain) {
    color = applyLift(color, lift);
    color = applyGamma(color, gamma);
    color = applyGain(color, gain);
    return color;
}

// ============================================================================
// Shadow, Midtone, Highlight Adjustments
// ============================================================================

/**
 * Calculate shadow, midtone, highlight masks
 */
void calculateTonalMasks(vec3 color, out float shadowMask, out float midtoneMask, out float highlightMask) {
    float luma = luminance(color);

    // Shadow mask: strong in darks, fades in mids
    shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);

    // Highlight mask: strong in brights, fades in mids
    highlightMask = smoothstep(0.5, 1.0, luma);

    // Midtone mask: strong in middle, fades at extremes
    midtoneMask = 1.0 - shadowMask - highlightMask;
    midtoneMask = smoothstep(0.0, 1.0, midtoneMask);
}

/**
 * Apply color tint to specific tonal range
 */
vec3 adjustShadows(vec3 color, vec3 shadowTint, float shadowIntensity) {
    float luma = luminance(color);
    float shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);

    return mix(color, color * shadowTint, shadowMask * shadowIntensity);
}

vec3 adjustMidtones(vec3 color, vec3 midtoneTint, float midtoneIntensity) {
    float luma = luminance(color);
    float midtoneMask = 1.0 - abs(luma * 2.0 - 1.0);
    midtoneMask = smoothstep(0.0, 1.0, midtoneMask);

    return mix(color, color * midtoneTint, midtoneMask * midtoneIntensity);
}

vec3 adjustHighlights(vec3 color, vec3 highlightTint, float highlightIntensity) {
    float luma = luminance(color);
    float highlightMask = smoothstep(0.5, 1.0, luma);

    return mix(color, color * highlightTint, highlightMask * highlightIntensity);
}

/**
 * Full shadow-midtone-highlight correction
 */
vec3 applyShadowMidtoneHighlight(vec3 color, vec3 shadowTint, vec3 midtoneTint,
                                 vec3 highlightTint, float intensity) {
    color = adjustShadows(color, shadowTint, intensity);
    color = adjustMidtones(color, midtoneTint, intensity);
    color = adjustHighlights(color, highlightTint, intensity);
    return color;
}

// ============================================================================
// HSV Adjustments
// ============================================================================

/**
 * Adjust hue shift
 */
vec3 adjustHue(vec3 color, float hueShift) {
    vec3 hsv = rgbToHsv(color);
    hsv.x = fract(hsv.x + hueShift);
    return hsvToRgb(hsv);
}

/**
 * Selective color adjustment (adjust specific hue range)
 */
vec3 adjustSelectiveColor(vec3 color, float targetHue, float hueRange,
                          float hueShift, float saturationShift, float valueShift) {
    vec3 hsv = rgbToHsv(color);

    // Calculate how close this color is to target hue
    float hueDiff = abs(hsv.x - targetHue);
    hueDiff = min(hueDiff, 1.0 - hueDiff); // Wrap around
    float mask = 1.0 - smoothstep(0.0, hueRange, hueDiff);

    // Apply adjustments
    hsv.x = fract(hsv.x + hueShift * mask);
    hsv.y = saturate(hsv.y + saturationShift * mask);
    hsv.z = saturate(hsv.z + valueShift * mask);

    return hsvToRgb(hsv);
}

// ============================================================================
// Channel Mixing
// ============================================================================

/**
 * RGB channel mixer
 */
vec3 mixChannels(vec3 color, mat3 mixMatrix) {
    return mixMatrix * color;
}

/**
 * Channel swap
 */
vec3 swapChannels(vec3 color, int mode) {
    if (mode == 1) return color.rbg;      // Swap G and B
    else if (mode == 2) return color.gbr;  // Rotate
    else if (mode == 3) return color.brg;  // Rotate reverse
    else if (mode == 4) return color.bgr;  // Swap R and B
    else if (mode == 5) return color.grb;  // Swap R and G
    return color;
}

// ============================================================================
// Color Balance
// ============================================================================

/**
 * Color balance adjustment (like Photoshop)
 */
vec3 adjustColorBalance(vec3 color, vec3 shadows, vec3 midtones, vec3 highlights) {
    float luma = luminance(color);

    float shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
    float highlightMask = smoothstep(0.5, 1.0, luma);
    float midtoneMask = 1.0 - shadowMask - highlightMask;

    vec3 adjusted = color;
    adjusted += shadows * shadowMask * 0.1;
    adjusted += midtones * midtoneMask * 0.1;
    adjusted += highlights * highlightMask * 0.1;

    return saturate(adjusted);
}

// ============================================================================
// Curves
// ============================================================================

/**
 * Apply S-curve contrast
 */
float applySCurve(float x, float strength) {
    float s = strength;
    return x < 0.5
        ? pow(2.0 * x, 1.0 + s) * 0.5
        : 1.0 - pow(2.0 * (1.0 - x), 1.0 + s) * 0.5;
}

vec3 applySCurve(vec3 color, float strength) {
    return vec3(
        applySCurve(color.r, strength),
        applySCurve(color.g, strength),
        applySCurve(color.b, strength)
    );
}

/**
 * Custom curve (using control points - simplified)
 */
float applyCustomCurve(float x, float blacks, float shadows, float midtones, float highlights, float whites) {
    // Simplified piecewise curve
    if (x < 0.2) {
        return mix(blacks, shadows, x / 0.2);
    } else if (x < 0.5) {
        return mix(shadows, midtones, (x - 0.2) / 0.3);
    } else if (x < 0.8) {
        return mix(midtones, highlights, (x - 0.5) / 0.3);
    } else {
        return mix(highlights, whites, (x - 0.8) / 0.2);
    }
}

// ============================================================================
// Split Toning
// ============================================================================

/**
 * Split toning (different colors for shadows and highlights)
 */
vec3 applySplitToning(vec3 color, vec3 shadowColor, vec3 highlightColor, float balance) {
    float luma = luminance(color);

    float shadowMask = 1.0 - smoothstep(0.0, balance, luma);
    float highlightMask = smoothstep(balance, 1.0, luma);

    vec3 shadows = mix(color, shadowColor, shadowMask * 0.5);
    vec3 highlights = mix(shadows, highlightColor, highlightMask * 0.5);

    return highlights;
}

// ============================================================================
// Complete Color Grading Pipeline
// ============================================================================

/**
 * Apply full color grading
 */
vec3 applyColorGrading(vec3 color, sampler2D lut, float lutIntensity,
                       float temperature, float tint,
                       float contrast, float saturation,
                       vec3 lift, vec3 gamma, vec3 gain) {
    // Temperature and tint
    color = adjustWhiteBalance(color, temperature, tint);

    // Lift, gamma, gain
    color = applyLiftGammaGain(color, lift, gamma, gain);

    // Contrast and saturation
    color = adjustContrast(color, contrast);
    color = adjustSaturation(color, saturation);

    // LUT
    #ifdef COLOR_GRADING_USE_LUT
        vec3 graded = sampleLUT(lut, color, float(COLOR_GRADING_LUT_SIZE));
        color = blendLUT(color, graded, lutIntensity);
    #endif

    return saturate(color);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Clamp color to valid range while preserving hue
 */
vec3 clampColor(vec3 color) {
    float maxComponent = max(color.r, max(color.g, color.b));
    if (maxComponent > 1.0) {
        color /= maxComponent;
    }
    return max(color, vec3(0.0));
}

/**
 * Normalize LUT coordinates
 */
vec3 normalizeLUTCoords(vec3 color, float lutSize) {
    return (color * (lutSize - 1.0) + 0.5) / lutSize;
}
