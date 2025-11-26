/**
 * toon.glsl - Toon/Cel Shading
 *
 * Implements cartoon-style rendering with:
 * - Cel shading bands
 * - Outline rendering
 * - Hatching patterns
 * - Rim lighting
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef TOON_BANDS
#define TOON_BANDS 4
#endif

#ifndef TOON_RIM_THRESHOLD
#define TOON_RIM_THRESHOLD 0.5
#endif

// ============================================================================
// Cel Shading
// ============================================================================

/**
 * Quantize lighting to discrete bands
 */
float celShadingBands(float NdotL, int bands) {
    float bandsFloat = float(bands);
    float intensity = floor(NdotL * bandsFloat) / bandsFloat;
    return saturate(intensity);
}

/**
 * Smooth cel shading with anti-aliasing
 */
float celShadingSmooth(float NdotL, int bands, float smoothness) {
    float bandsFloat = float(bands);
    float stepped = floor(NdotL * bandsFloat) / bandsFloat;
    float nextStep = ceil(NdotL * bandsFloat) / bandsFloat;

    float t = fract(NdotL * bandsFloat);
    t = smoothstep(0.5 - smoothness, 0.5 + smoothness, t);

    return mix(stepped, nextStep, t);
}

/**
 * Ramp-based toon shading
 */
float celShadingRamp(sampler2D rampTexture, float NdotL) {
    return texture(rampTexture, vec2(NdotL, 0.5)).r;
}

// ============================================================================
// Rim Lighting
// ============================================================================

/**
 * Toon rim light
 */
float toonRimLight(vec3 N, vec3 V, float threshold, float smoothness) {
    float rim = 1.0 - abs(dot(N, V));
    rim = smoothstep(threshold - smoothness, threshold + smoothness, rim);
    return rim;
}

/**
 * Colored rim light
 */
vec3 toonRimLightColored(vec3 N, vec3 V, vec3 rimColor, float threshold) {
    float rim = toonRimLight(N, V, threshold, 0.1);
    return rimColor * rim;
}

// ============================================================================
// Specular Highlights
// ============================================================================

/**
 * Toon specular (hard-edged)
 */
float toonSpecular(vec3 N, vec3 V, vec3 L, float shininess, float threshold) {
    vec3 H = normalize(V + L);
    float NdotH = max(dot(N, H), 0.0);
    float spec = pow(NdotH, shininess);

    return step(threshold, spec);
}

/**
 * Anime-style specular (gradient)
 */
float animeSpecular(vec3 N, vec3 V, vec3 L, float shininess) {
    vec3 H = normalize(V + L);
    float NdotH = max(dot(N, H), 0.0);
    return pow(NdotH, shininess);
}

// ============================================================================
// Hatching
// ============================================================================

/**
 * Cross-hatching pattern
 */
float crossHatching(vec2 uv, float density, float angle, float intensity) {
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 rotatedUV = rot * uv * density;

    float hatch1 = step(0.5, fract(rotatedUV.x));
    float hatch2 = step(0.5, fract(rotatedUV.y));

    return mix(1.0, hatch1 * hatch2, intensity);
}

/**
 * Tone-based hatching (multiple layers)
 */
float toneHatching(vec2 uv, float tone) {
    float hatching = 1.0;

    if (tone < 0.8) {
        hatching *= crossHatching(uv, 10.0, 0.0, 1.0);
    }
    if (tone < 0.6) {
        hatching *= crossHatching(uv, 10.0, HALF_PI, 1.0);
    }
    if (tone < 0.4) {
        hatching *= crossHatching(uv, 15.0, PI * 0.25, 1.0);
    }
    if (tone < 0.2) {
        hatching *= crossHatching(uv, 15.0, PI * 0.75, 1.0);
    }

    return hatching;
}

// ============================================================================
// Complete Toon Shading
// ============================================================================

/**
 * Evaluate toon shading
 */
vec3 evaluateToonShading(vec3 N, vec3 V, vec3 L, vec3 albedo,
                         vec3 lightColor, vec3 rimColor) {
    float NdotL = max(dot(N, L), 0.0);

    // Cel shading
    float diffuse = celShadingSmooth(NdotL, TOON_BANDS, 0.05);

    // Specular
    float specular = toonSpecular(N, V, L, 32.0, 0.9);

    // Rim light
    float rim = toonRimLight(N, V, TOON_RIM_THRESHOLD, 0.1);

    // Combine
    vec3 color = albedo * lightColor * diffuse;
    color += vec3(specular);
    color += rimColor * rim;

    return color;
}

/**
 * Anime-style shading
 */
vec3 evaluateAnimeShading(vec3 N, vec3 V, vec3 L, vec3 albedo,
                          vec3 shadowColor, vec3 highlightColor) {
    float NdotL = max(dot(N, L), 0.0);

    // Two-tone shading
    vec3 diffuse = NdotL > 0.5 ? highlightColor : shadowColor;

    // Soft specular
    float specular = animeSpecular(N, V, L, 64.0);

    return albedo * diffuse + vec3(specular * 0.5);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Posterize color
 */
vec3 posterize(vec3 color, int levels) {
    float levelsFloat = float(levels);
    return floor(color * levelsFloat) / levelsFloat;
}

/**
 * Edge detection for outlines (use with outline.glsl)
 */
float toonEdgeDetection(sampler2D depthBuffer, sampler2D normalBuffer,
                        vec2 texCoord, vec2 texelSize) {
    // Combine depth and normal edges
    float depthEdge = 0.0;
    float normalEdge = 0.0;

    float centerDepth = texture(depthBuffer, texCoord).r;
    vec3 centerNormal = texture(normalBuffer, texCoord).rgb;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;

            vec2 offset = vec2(float(x), float(y)) * texelSize;
            float sampleDepth = texture(depthBuffer, texCoord + offset).r;
            vec3 sampleNormal = texture(normalBuffer, texCoord + offset).rgb;

            depthEdge += abs(centerDepth - sampleDepth);
            normalEdge += 1.0 - dot(centerNormal, sampleNormal);
        }
    }

    return saturate(depthEdge * 10.0 + normalEdge);
}
