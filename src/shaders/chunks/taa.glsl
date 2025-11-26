/**
 * taa.glsl - Temporal Anti-Aliasing
 *
 * Implements high-quality TAA with:
 * - History sampling and reprojection
 * - Velocity-based rejection
 * - Neighborhood clamping
 * - Sharpening filter
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef TAA_BLEND_FACTOR_MIN
#define TAA_BLEND_FACTOR_MIN 0.05
#endif

#ifndef TAA_BLEND_FACTOR_MAX
#define TAA_BLEND_FACTOR_MAX 0.2
#endif

#ifndef TAA_SHARPEN_STRENGTH
#define TAA_SHARPEN_STRENGTH 0.25
#endif

#ifndef TAA_VARIANCE_CLAMP_GAMMA
#define TAA_VARIANCE_CLAMP_GAMMA 1.5
#endif

// ============================================================================
// Sampling Patterns
// ============================================================================

/**
 * Halton sequence for jitter pattern
 */
vec2 haltonSequence(int index, int base1, int base2) {
    float f1 = 0.0;
    float f2 = 0.0;
    float inv1 = 1.0 / float(base1);
    float inv2 = 1.0 / float(base2);

    int i = index;
    float frac1 = inv1;
    while (i > 0) {
        f1 += float(i % base1) * frac1;
        i = i / base1;
        frac1 *= inv1;
    }

    i = index;
    float frac2 = inv2;
    while (i > 0) {
        f2 += float(i % base2) * frac2;
        i = i / base2;
        frac2 *= inv2;
    }

    return vec2(f1, f2);
}

/**
 * Get TAA jitter offset for frame
 */
vec2 getTAAJitter(int frame, vec2 texelSize) {
    vec2 jitter = haltonSequence(frame % 16, 2, 3);
    return (jitter - 0.5) * texelSize;
}

// ============================================================================
// Catmull-Rom Filtering
// ============================================================================

/**
 * Catmull-Rom cubic filter for better history sampling
 */
vec4 sampleTextureCatmullRom(sampler2D tex, vec2 uv, vec2 texelSize) {
    vec2 position = uv / texelSize;
    vec2 centerPosition = floor(position - 0.5) + 0.5;
    vec2 f = position - centerPosition;
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;

    vec2 w0 = -0.5 * f3 + f2 - 0.5 * f;
    vec2 w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
    vec2 w2 = -1.5 * f3 + 2.0 * f2 + 0.5 * f;
    vec2 w3 = 0.5 * f3 - 0.5 * f2;

    vec2 w12 = w1 + w2;
    vec2 tc0 = (centerPosition - 1.0) * texelSize;
    vec2 tc12 = (centerPosition + w2 / w12) * texelSize;
    vec2 tc3 = (centerPosition + 2.0) * texelSize;

    vec4 result =
        texture(tex, vec2(tc0.x, tc0.y)) * (w0.x * w0.y) +
        texture(tex, vec2(tc12.x, tc0.y)) * (w12.x * w0.y) +
        texture(tex, vec2(tc3.x, tc0.y)) * (w3.x * w0.y) +
        texture(tex, vec2(tc0.x, tc12.y)) * (w0.x * w12.y) +
        texture(tex, vec2(tc12.x, tc12.y)) * (w12.x * w12.y) +
        texture(tex, vec2(tc3.x, tc12.y)) * (w3.x * w12.y) +
        texture(tex, vec2(tc0.x, tc3.y)) * (w0.x * w3.y) +
        texture(tex, vec2(tc12.x, tc3.y)) * (w12.x * w3.y) +
        texture(tex, vec2(tc3.x, tc3.y)) * (w3.x * w3.y);

    return result;
}

// ============================================================================
// Neighborhood Sampling
// ============================================================================

/**
 * Sample 3x3 neighborhood
 */
void sample3x3Neighborhood(sampler2D tex, vec2 texCoord, vec2 texelSize,
                           out vec3 minColor, out vec3 maxColor,
                           out vec3 moment1, out vec3 moment2) {
    minColor = vec3(FLT_MAX);
    maxColor = vec3(-FLT_MAX);
    moment1 = vec3(0.0);
    moment2 = vec3(0.0);

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            vec3 neighbor = texture(tex, texCoord + offset).rgb;

            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
            moment1 += neighbor;
            moment2 += neighbor * neighbor;
        }
    }

    moment1 /= 9.0;
    moment2 /= 9.0;
}

/**
 * Sample cross neighborhood (5 samples, faster)
 */
void sampleCrossNeighborhood(sampler2D tex, vec2 texCoord, vec2 texelSize,
                            out vec3 minColor, out vec3 maxColor,
                            out vec3 avgColor) {
    vec3 center = texture(tex, texCoord).rgb;
    vec3 left = texture(tex, texCoord + vec2(-1.0, 0.0) * texelSize).rgb;
    vec3 right = texture(tex, texCoord + vec2(1.0, 0.0) * texelSize).rgb;
    vec3 top = texture(tex, texCoord + vec2(0.0, -1.0) * texelSize).rgb;
    vec3 bottom = texture(tex, texCoord + vec2(0.0, 1.0) * texelSize).rgb;

    minColor = min(center, min(min(left, right), min(top, bottom)));
    maxColor = max(center, max(max(left, right), max(top, bottom)));
    avgColor = (center + left + right + top + bottom) / 5.0;
}

// ============================================================================
// Color Clamping
// ============================================================================

/**
 * AABB clamping (axis-aligned bounding box)
 */
vec3 clipAABB(vec3 color, vec3 minColor, vec3 maxColor) {
    vec3 center = 0.5 * (maxColor + minColor);
    vec3 extents = 0.5 * (maxColor - minColor);

    vec3 offset = color - center;
    vec3 ts = abs(extents) / max(abs(offset), vec3(EPSILON));
    float t = min(min(ts.x, ts.y), ts.z);

    return center + offset * saturate(t);
}

/**
 * Variance clipping (more aggressive)
 */
vec3 clipVariance(vec3 color, vec3 moment1, vec3 moment2) {
    vec3 variance = moment2 - moment1 * moment1;
    vec3 sigma = sqrt(max(variance, vec3(0.0)));

    vec3 minColor = moment1 - sigma * TAA_VARIANCE_CLAMP_GAMMA;
    vec3 maxColor = moment1 + sigma * TAA_VARIANCE_CLAMP_GAMMA;

    return clamp(color, minColor, maxColor);
}

/**
 * Rounded clamp (soft clamping)
 */
vec3 clipRounded(vec3 color, vec3 minColor, vec3 maxColor, vec3 avgColor) {
    vec3 clamped = clamp(color, minColor, maxColor);
    vec3 center = avgColor;

    vec3 dir = clamped - color;
    float dist = length(dir);

    if (dist > EPSILON) {
        vec3 toCenter = center - color;
        float centerDist = length(toCenter);

        if (centerDist < dist) {
            return mix(color, center, saturate(centerDist / dist));
        }
    }

    return clamped;
}

// ============================================================================
// Velocity Rejection
// ============================================================================

/**
 * Check if history is valid based on velocity
 */
bool isHistoryValid(vec2 velocity, vec2 historyUV) {
    // Check if reprojected position is within screen bounds
    if (historyUV.x < 0.0 || historyUV.x > 1.0 ||
        historyUV.y < 0.0 || historyUV.y > 1.0) {
        return false;
    }

    // Reject if velocity is too high (disocclusion)
    float velocityLength = length(velocity);
    if (velocityLength > 0.5) {
        return false;
    }

    return true;
}

/**
 * Calculate confidence based on velocity
 */
float calculateTemporalConfidence(vec2 velocity, vec3 currentColor, vec3 historyColor) {
    // Velocity-based confidence
    float velocityLength = length(velocity);
    float velocityConfidence = saturate(1.0 - velocityLength * 2.0);

    // Color difference confidence
    float colorDiff = length(currentColor - historyColor);
    float colorConfidence = saturate(1.0 - colorDiff);

    return velocityConfidence * colorConfidence;
}

// ============================================================================
// Main TAA Function
// ============================================================================

/**
 * Temporal anti-aliasing with variance clipping
 */
vec3 applyTAA(sampler2D currentColor, sampler2D historyColor,
              sampler2D velocityBuffer, vec2 texCoord) {
    vec2 texelSize = 1.0 / vec2(textureSize(currentColor, 0));

    // Sample current color
    vec3 current = texture(currentColor, texCoord).rgb;

    // Sample velocity and calculate history UV
    vec2 velocity = texture(velocityBuffer, texCoord).xy;
    vec2 historyUV = texCoord - velocity;

    // Check history validity
    if (!isHistoryValid(velocity, historyUV)) {
        return current;
    }

    // Sample history with better filtering
    #ifdef TAA_USE_CATMULL_ROM
        vec3 history = sampleTextureCatmullRom(historyColor, historyUV, texelSize).rgb;
    #else
        vec3 history = texture(historyColor, historyUV).rgb;
    #endif

    // Sample neighborhood for clamping
    vec3 minColor, maxColor, moment1, moment2;
    sample3x3Neighborhood(currentColor, texCoord, texelSize, minColor, maxColor, moment1, moment2);

    // Clamp history to reduce ghosting
    #ifdef TAA_USE_VARIANCE_CLIPPING
        history = clipVariance(history, moment1, moment2);
    #else
        history = clipAABB(history, minColor, maxColor);
    #endif

    // Calculate blend factor
    float confidence = calculateTemporalConfidence(velocity, current, history);
    float blendFactor = mix(TAA_BLEND_FACTOR_MAX, TAA_BLEND_FACTOR_MIN, confidence);

    // Blend current and history
    vec3 result = mix(history, current, blendFactor);

    return result;
}

/**
 * TAA with additional sharpening
 */
vec3 applyTAAWithSharpening(sampler2D currentColor, sampler2D historyColor,
                           sampler2D velocityBuffer, vec2 texCoord) {
    // Apply TAA
    vec3 antialiased = applyTAA(currentColor, historyColor, velocityBuffer, texCoord);

    // Apply sharpening to counteract blur
    vec2 texelSize = 1.0 / vec2(textureSize(currentColor, 0));

    vec3 center = antialiased;
    vec3 left = texture(currentColor, texCoord + vec2(-1.0, 0.0) * texelSize).rgb;
    vec3 right = texture(currentColor, texCoord + vec2(1.0, 0.0) * texelSize).rgb;
    vec3 top = texture(currentColor, texCoord + vec2(0.0, -1.0) * texelSize).rgb;
    vec3 bottom = texture(currentColor, texCoord + vec2(0.0, 1.0) * texelSize).rgb;

    vec3 laplacian = 4.0 * center - (left + right + top + bottom);
    vec3 sharpened = center + laplacian * TAA_SHARPEN_STRENGTH;

    return sharpened;
}

// ============================================================================
// Velocity Calculation Helpers
// ============================================================================

/**
 * Calculate velocity from current and previous positions
 */
vec2 calculateVelocity(vec3 worldPos, mat4 currentViewProj, mat4 prevViewProj) {
    // Current frame position
    vec4 currentClip = currentViewProj * vec4(worldPos, 1.0);
    vec2 currentScreen = (currentClip.xy / currentClip.w) * 0.5 + 0.5;

    // Previous frame position
    vec4 prevClip = prevViewProj * vec4(worldPos, 1.0);
    vec2 prevScreen = (prevClip.xy / prevClip.w) * 0.5 + 0.5;

    return currentScreen - prevScreen;
}

/**
 * Dilate velocity buffer for better coverage
 */
vec2 dilateVelocity(sampler2D velocityBuffer, vec2 texCoord, vec2 texelSize) {
    vec2 maxVelocity = texture(velocityBuffer, texCoord).xy;
    float maxLength = length(maxVelocity);

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            vec2 velocity = texture(velocityBuffer, texCoord + offset).xy;
            float len = length(velocity);

            if (len > maxLength) {
                maxVelocity = velocity;
                maxLength = len;
            }
        }
    }

    return maxVelocity;
}

// ============================================================================
// Advanced Features
// ============================================================================

/**
 * YCoCg color space conversion for better clamping
 */
vec3 rgbToYCoCg(vec3 rgb) {
    float Y = dot(rgb, vec3(0.25, 0.5, 0.25));
    float Co = dot(rgb, vec3(0.5, 0.0, -0.5));
    float Cg = dot(rgb, vec3(-0.25, 0.5, -0.25));
    return vec3(Y, Co, Cg);
}

vec3 yCoCgToRgb(vec3 ycocg) {
    float tmp = ycocg.x - ycocg.z;
    return vec3(tmp + ycocg.y, ycocg.x + ycocg.z, tmp - ycocg.y);
}

/**
 * TAA in YCoCg space (better color stability)
 */
vec3 applyTAAYCoCg(sampler2D currentColor, sampler2D historyColor,
                   sampler2D velocityBuffer, vec2 texCoord) {
    vec2 texelSize = 1.0 / vec2(textureSize(currentColor, 0));

    // Sample and convert to YCoCg
    vec3 current = rgbToYCoCg(texture(currentColor, texCoord).rgb);

    vec2 velocity = texture(velocityBuffer, texCoord).xy;
    vec2 historyUV = texCoord - velocity;

    if (!isHistoryValid(velocity, historyUV)) {
        return yCoCgToRgb(current);
    }

    vec3 history = rgbToYCoCg(texture(historyColor, historyUV).rgb);

    // Neighborhood clamping in YCoCg
    vec3 minColor, maxColor, moment1, moment2;
    sample3x3Neighborhood(currentColor, texCoord, texelSize, minColor, maxColor, moment1, moment2);

    minColor = rgbToYCoCg(minColor);
    maxColor = rgbToYCoCg(maxColor);
    moment1 = rgbToYCoCg(moment1);
    moment2 = rgbToYCoCg(moment2 * moment2); // Approximate

    history = clipVariance(history, moment1, moment2);

    float confidence = calculateTemporalConfidence(velocity, current, history);
    float blendFactor = mix(TAA_BLEND_FACTOR_MAX, TAA_BLEND_FACTOR_MIN, confidence);

    vec3 result = mix(history, current, blendFactor);

    return yCoCgToRgb(result);
}
