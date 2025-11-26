/**
 * fxaa.glsl - Fast Approximate Anti-Aliasing (FXAA 3.11)
 *
 * Implementation of NVIDIA's FXAA algorithm with quality presets.
 * Performs edge detection and sub-pixel anti-aliasing in a single pass.
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Quality Presets
// ============================================================================

#ifndef FXAA_QUALITY_PRESET
#define FXAA_QUALITY_PRESET 12  // 0-39 (higher = better quality, more samples)
#endif

#ifndef FXAA_SUBPIX_TRIM
#define FXAA_SUBPIX_TRIM 0.25  // [0.0, 1.0] Sub-pixel aliasing removal amount
#endif

#ifndef FXAA_SUBPIX_TRIM_SCALE
#define FXAA_SUBPIX_TRIM_SCALE (1.0 / (1.0 - FXAA_SUBPIX_TRIM))
#endif

#ifndef FXAA_SUBPIX_CAP
#define FXAA_SUBPIX_CAP 0.75  // [0.0, 1.0] Maximum sub-pixel aliasing removal
#endif

#ifndef FXAA_EDGE_THRESHOLD
#define FXAA_EDGE_THRESHOLD 0.166  // [0.063, 0.333] Edge detection threshold
#endif

#ifndef FXAA_EDGE_THRESHOLD_MIN
#define FXAA_EDGE_THRESHOLD_MIN 0.0833  // [0.0312, 0.0833] Minimum edge detection
#endif

// ============================================================================
// Quality Settings
// ============================================================================

#if (FXAA_QUALITY_PRESET == 10)
    #define FXAA_QUALITY_PS 3
    #define FXAA_QUALITY_P0 1.5
    #define FXAA_QUALITY_P1 3.0
    #define FXAA_QUALITY_P2 12.0
#endif

#if (FXAA_QUALITY_PRESET == 11)
    #define FXAA_QUALITY_PS 4
    #define FXAA_QUALITY_P0 1.0
    #define FXAA_QUALITY_P1 1.5
    #define FXAA_QUALITY_P2 3.0
    #define FXAA_QUALITY_P3 12.0
#endif

#if (FXAA_QUALITY_PRESET == 12)
    #define FXAA_QUALITY_PS 5
    #define FXAA_QUALITY_P0 1.0
    #define FXAA_QUALITY_P1 1.5
    #define FXAA_QUALITY_P2 2.0
    #define FXAA_QUALITY_P3 4.0
    #define FXAA_QUALITY_P4 12.0
#endif

#if (FXAA_QUALITY_PRESET == 13)
    #define FXAA_QUALITY_PS 6
    #define FXAA_QUALITY_P0 1.0
    #define FXAA_QUALITY_P1 1.5
    #define FXAA_QUALITY_P2 2.0
    #define FXAA_QUALITY_P3 2.0
    #define FXAA_QUALITY_P4 4.0
    #define FXAA_QUALITY_P5 12.0
#endif

#ifndef FXAA_QUALITY_PS
    #define FXAA_QUALITY_PS 5
    #define FXAA_QUALITY_P0 1.0
    #define FXAA_QUALITY_P1 1.5
    #define FXAA_QUALITY_P2 2.0
    #define FXAA_QUALITY_P3 4.0
    #define FXAA_QUALITY_P4 12.0
#endif

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate luma for FXAA
 */
float FxaaLuma(vec3 rgb) {
    return rgb.y * (0.587 / 0.299) + rgb.x;
}

/**
 * Gather luma values from neighbors
 */
vec4 FxaaTexOff(sampler2D tex, vec2 pos, ivec2 offset, vec2 rcpFrame) {
    return texture(tex, pos + vec2(offset) * rcpFrame);
}

// ============================================================================
// Main FXAA Function
// ============================================================================

/**
 * FXAA 3.11 implementation
 * @param colorTexture Input color texture
 * @param texCoord Screen UV coordinates
 * @param rcpFrame Reciprocal of frame size (1.0 / resolution)
 * @return Anti-aliased color
 */
vec3 applyFXAA(sampler2D colorTexture, vec2 texCoord, vec2 rcpFrame) {
    // Sample center and calculate luma
    vec3 rgbN = FxaaTexOff(colorTexture, texCoord, ivec2(0, -1), rcpFrame).rgb;
    vec3 rgbW = FxaaTexOff(colorTexture, texCoord, ivec2(-1, 0), rcpFrame).rgb;
    vec3 rgbM = texture(colorTexture, texCoord).rgb;
    vec3 rgbE = FxaaTexOff(colorTexture, texCoord, ivec2(1, 0), rcpFrame).rgb;
    vec3 rgbS = FxaaTexOff(colorTexture, texCoord, ivec2(0, 1), rcpFrame).rgb;

    float lumaN = FxaaLuma(rgbN);
    float lumaW = FxaaLuma(rgbW);
    float lumaM = FxaaLuma(rgbM);
    float lumaE = FxaaLuma(rgbE);
    float lumaS = FxaaLuma(rgbS);

    // Find luma range
    float rangeMin = min(lumaM, min(min(lumaN, lumaW), min(lumaS, lumaE)));
    float rangeMax = max(lumaM, max(max(lumaN, lumaW), max(lumaS, lumaE)));
    float range = rangeMax - rangeMin;

    // Early exit if contrast is too low
    if (range < max(FXAA_EDGE_THRESHOLD_MIN, rangeMax * FXAA_EDGE_THRESHOLD)) {
        return rgbM;
    }

    // Sample corners
    vec3 rgbNW = FxaaTexOff(colorTexture, texCoord, ivec2(-1, -1), rcpFrame).rgb;
    vec3 rgbNE = FxaaTexOff(colorTexture, texCoord, ivec2(1, -1), rcpFrame).rgb;
    vec3 rgbSW = FxaaTexOff(colorTexture, texCoord, ivec2(-1, 1), rcpFrame).rgb;
    vec3 rgbSE = FxaaTexOff(colorTexture, texCoord, ivec2(1, 1), rcpFrame).rgb;

    float lumaNW = FxaaLuma(rgbNW);
    float lumaNE = FxaaLuma(rgbNE);
    float lumaSW = FxaaLuma(rgbSW);
    float lumaSE = FxaaLuma(rgbSE);

    // Calculate edge direction
    float edgeVert =
        abs((0.25 * lumaNW) + (-0.5 * lumaN) + (0.25 * lumaNE)) +
        abs((0.50 * lumaW ) + (-1.0 * lumaM) + (0.50 * lumaE )) +
        abs((0.25 * lumaSW) + (-0.5 * lumaS) + (0.25 * lumaSE));

    float edgeHorz =
        abs((0.25 * lumaNW) + (-0.5 * lumaW) + (0.25 * lumaSW)) +
        abs((0.50 * lumaN ) + (-1.0 * lumaM) + (0.50 * lumaS )) +
        abs((0.25 * lumaNE) + (-0.5 * lumaE) + (0.25 * lumaSE));

    bool horzSpan = edgeHorz >= edgeVert;

    // Choose edge normal
    float lengthSign = horzSpan ? -rcpFrame.y : -rcpFrame.x;

    if (!horzSpan) {
        lumaN = lumaW;
        lumaS = lumaE;
    }

    // Calculate gradient
    float gradientN = abs(lumaN - lumaM);
    float gradientS = abs(lumaS - lumaM);
    lumaN = (lumaN + lumaM) * 0.5;
    lumaS = (lumaS + lumaM) * 0.5;

    // Choose steepest gradient
    bool pairN = gradientN >= gradientS;
    if (!pairN) {
        lumaN = lumaS;
        gradientN = gradientS;
        lengthSign *= -1.0;
    }

    // Search along edge
    vec2 posN;
    posN.x = texCoord.x + (horzSpan ? 0.0 : lengthSign * 0.5);
    posN.y = texCoord.y + (horzSpan ? lengthSign * 0.5 : 0.0);

    gradientN *= FXAA_EDGE_THRESHOLD;

    // Edge search
    vec2 posP = posN;
    vec2 offNP = horzSpan ? vec2(rcpFrame.x, 0.0) : vec2(0.0, rcpFrame.y);
    float lumaEndN = lumaN;
    float lumaEndP = lumaN;
    bool doneN = false;
    bool doneP = false;

    #ifdef FXAA_QUALITY_P0
        posN += offNP * vec2(-1.0, -1.0) * FXAA_QUALITY_P0;
        posP += offNP * vec2(1.0, 1.0) * FXAA_QUALITY_P0;
    #endif
    #ifdef FXAA_QUALITY_P1
        if (!doneN) lumaEndN = FxaaLuma(texture(colorTexture, posN.xy).rgb);
        if (!doneP) lumaEndP = FxaaLuma(texture(colorTexture, posP.xy).rgb);
        doneN = abs(lumaEndN - lumaN) >= gradientN;
        doneP = abs(lumaEndP - lumaN) >= gradientN;
        if (!doneN) posN -= offNP * FXAA_QUALITY_P1;
        if (!doneP) posP += offNP * FXAA_QUALITY_P1;
    #endif
    #ifdef FXAA_QUALITY_P2
        if (!doneN) lumaEndN = FxaaLuma(texture(colorTexture, posN.xy).rgb);
        if (!doneP) lumaEndP = FxaaLuma(texture(colorTexture, posP.xy).rgb);
        doneN = abs(lumaEndN - lumaN) >= gradientN;
        doneP = abs(lumaEndP - lumaN) >= gradientN;
        if (!doneN) posN -= offNP * FXAA_QUALITY_P2;
        if (!doneP) posP += offNP * FXAA_QUALITY_P2;
    #endif
    #ifdef FXAA_QUALITY_P3
        if (!doneN) lumaEndN = FxaaLuma(texture(colorTexture, posN.xy).rgb);
        if (!doneP) lumaEndP = FxaaLuma(texture(colorTexture, posP.xy).rgb);
        doneN = abs(lumaEndN - lumaN) >= gradientN;
        doneP = abs(lumaEndP - lumaN) >= gradientN;
        if (!doneN) posN -= offNP * FXAA_QUALITY_P3;
        if (!doneP) posP += offNP * FXAA_QUALITY_P3;
    #endif
    #ifdef FXAA_QUALITY_P4
        if (!doneN) lumaEndN = FxaaLuma(texture(colorTexture, posN.xy).rgb);
        if (!doneP) lumaEndP = FxaaLuma(texture(colorTexture, posP.xy).rgb);
        doneN = abs(lumaEndN - lumaN) >= gradientN;
        doneP = abs(lumaEndP - lumaN) >= gradientN;
        if (!doneN) posN -= offNP * FXAA_QUALITY_P4;
        if (!doneP) posP += offNP * FXAA_QUALITY_P4;
    #endif

    // Calculate distances
    float dstN = horzSpan ? texCoord.x - posN.x : texCoord.y - posN.y;
    float dstP = horzSpan ? posP.x - texCoord.x : posP.y - texCoord.y;

    bool directionN = dstN < dstP;
    lumaEndN = directionN ? lumaEndN : lumaEndP;

    // Check if center is on correct side of edge
    if (((lumaM - lumaN) < 0.0) == ((lumaEndN - lumaN) < 0.0)) {
        lengthSign = 0.0;
    }

    // Calculate sub-pixel offset
    float spanLength = (dstP + dstN);
    dstN = directionN ? dstN : dstP;
    float subPixelOffset = (0.5 + (dstN * (-1.0 / spanLength))) * lengthSign;

    // Sub-pixel aliasing test
    float lumaNN = lumaN + lumaS;
    float subPixelOffsetFinal = subPixelOffset;

    // Apply sub-pixel shift
    vec2 posM;
    posM.x = texCoord.x + (horzSpan ? 0.0 : subPixelOffsetFinal);
    posM.y = texCoord.y + (horzSpan ? subPixelOffsetFinal : 0.0);

    return texture(colorTexture, posM).rgb;
}

/**
 * Simplified FXAA (faster, lower quality)
 */
vec3 applyFXAASimple(sampler2D colorTexture, vec2 texCoord, vec2 rcpFrame) {
    vec3 rgbM = texture(colorTexture, texCoord).rgb;
    vec3 rgbNW = texture(colorTexture, texCoord + vec2(-1.0, -1.0) * rcpFrame).rgb;
    vec3 rgbNE = texture(colorTexture, texCoord + vec2(1.0, -1.0) * rcpFrame).rgb;
    vec3 rgbSW = texture(colorTexture, texCoord + vec2(-1.0, 1.0) * rcpFrame).rgb;
    vec3 rgbSE = texture(colorTexture, texCoord + vec2(1.0, 1.0) * rcpFrame).rgb;

    float lumaM = FxaaLuma(rgbM);
    float lumaNW = FxaaLuma(rgbNW);
    float lumaNE = FxaaLuma(rgbNE);
    float lumaSW = FxaaLuma(rgbSW);
    float lumaSE = FxaaLuma(rgbSE);

    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

    vec2 dir;
    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
    dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));

    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * 0.25), 0.0078125);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);

    dir = min(vec2(8.0, 8.0), max(vec2(-8.0, -8.0), dir * rcpDirMin)) * rcpFrame;

    vec3 rgbA = 0.5 * (
        texture(colorTexture, texCoord + dir * (1.0 / 3.0 - 0.5)).rgb +
        texture(colorTexture, texCoord + dir * (2.0 / 3.0 - 0.5)).rgb
    );

    vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture(colorTexture, texCoord + dir * -0.5).rgb +
        texture(colorTexture, texCoord + dir * 0.5).rgb
    );

    float lumaB = FxaaLuma(rgbB);

    if (lumaB < lumaMin || lumaB > lumaMax) {
        return rgbA;
    } else {
        return rgbB;
    }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get FXAA quality level name
 */
int getFXAAQualityLevel() {
    return FXAA_QUALITY_PRESET;
}

/**
 * Calculate edge detection threshold based on luminance
 */
float calculateAdaptiveThreshold(float avgLuminance) {
    return mix(FXAA_EDGE_THRESHOLD_MIN, FXAA_EDGE_THRESHOLD, avgLuminance);
}
