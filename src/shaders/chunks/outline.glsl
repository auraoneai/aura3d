/**
 * outline.glsl - Outline Rendering
 *
 * Provides various outline techniques:
 * - Edge detection (Sobel, Roberts, Prewitt)
 * - Jump Flood Algorithm for smooth outlines
 * - Depth and normal-based outlines
 * - Stylized outlines
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef OUTLINE_THICKNESS
#define OUTLINE_THICKNESS 1.0
#endif

#ifndef OUTLINE_COLOR
#define OUTLINE_COLOR vec3(0.0, 0.0, 0.0)
#endif

#ifndef OUTLINE_DEPTH_THRESHOLD
#define OUTLINE_DEPTH_THRESHOLD 0.01
#endif

#ifndef OUTLINE_NORMAL_THRESHOLD
#define OUTLINE_NORMAL_THRESHOLD 0.5
#endif

// ============================================================================
// Edge Detection - Sobel
// ============================================================================

/**
 * Sobel edge detection
 */
float sobelEdgeDetection(sampler2D tex, vec2 texCoord, vec2 texelSize) {
    // Sobel kernels
    mat3 Gx = mat3(
        -1.0, 0.0, 1.0,
        -2.0, 0.0, 2.0,
        -1.0, 0.0, 1.0
    );

    mat3 Gy = mat3(
        -1.0, -2.0, -1.0,
         0.0,  0.0,  0.0,
         1.0,  2.0,  1.0
    );

    float gx = 0.0;
    float gy = 0.0;

    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec2 offset = vec2(float(i), float(j)) * texelSize;
            float sample = luminance(texture(tex, texCoord + offset).rgb);

            gx += sample * Gx[i + 1][j + 1];
            gy += sample * Gy[i + 1][j + 1];
        }
    }

    return sqrt(gx * gx + gy * gy);
}

// ============================================================================
// Edge Detection - Roberts Cross
// ============================================================================

/**
 * Roberts cross edge detection (faster, less accurate)
 */
float robertsEdgeDetection(sampler2D tex, vec2 texCoord, vec2 texelSize) {
    float tl = luminance(texture(tex, texCoord + vec2(-1.0, -1.0) * texelSize).rgb);
    float tr = luminance(texture(tex, texCoord + vec2(1.0, -1.0) * texelSize).rgb);
    float bl = luminance(texture(tex, texCoord + vec2(-1.0, 1.0) * texelSize).rgb);
    float br = luminance(texture(tex, texCoord + vec2(1.0, 1.0) * texelSize).rgb);

    float gx = abs(tl - br);
    float gy = abs(tr - bl);

    return sqrt(gx * gx + gy * gy);
}

// ============================================================================
// Depth-Based Outline
// ============================================================================

/**
 * Detect depth discontinuities for outlines
 */
float depthEdgeDetection(sampler2D depthBuffer, vec2 texCoord, vec2 texelSize, float threshold) {
    float centerDepth = texture(depthBuffer, texCoord).r;

    float maxDiff = 0.0;

    // Sample neighbors
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;

            vec2 offset = vec2(float(x), float(y)) * texelSize * OUTLINE_THICKNESS;
            float sampleDepth = texture(depthBuffer, texCoord + offset).r;

            float diff = abs(centerDepth - sampleDepth);
            maxDiff = max(maxDiff, diff);
        }
    }

    return step(threshold, maxDiff);
}

// ============================================================================
// Normal-Based Outline
// ============================================================================

/**
 * Detect normal discontinuities for outlines
 */
float normalEdgeDetection(sampler2D normalBuffer, vec2 texCoord, vec2 texelSize, float threshold) {
    vec3 centerNormal = decodeOctahedron(texture(normalBuffer, texCoord).rg);

    float minDot = 1.0;

    // Sample neighbors
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;

            vec2 offset = vec2(float(x), float(y)) * texelSize * OUTLINE_THICKNESS;
            vec3 sampleNormal = decodeOctahedron(texture(normalBuffer, texCoord + offset).rg);

            float ndot = dot(centerNormal, sampleNormal);
            minDot = min(minDot, ndot);
        }
    }

    return step(minDot, threshold) * (1.0 - minDot);
}

// ============================================================================
// Combined Depth and Normal Outline
// ============================================================================

/**
 * Combine depth and normal edge detection
 */
float combinedEdgeDetection(sampler2D depthBuffer, sampler2D normalBuffer,
                            vec2 texCoord, vec2 texelSize) {
    float depthEdge = depthEdgeDetection(depthBuffer, texCoord, texelSize, OUTLINE_DEPTH_THRESHOLD);
    float normalEdge = normalEdgeDetection(normalBuffer, texCoord, texelSize, OUTLINE_NORMAL_THRESHOLD);

    return max(depthEdge, normalEdge);
}

// ============================================================================
// Jump Flood Algorithm
// ============================================================================

/**
 * Jump Flood pass
 * @param seedBuffer Buffer containing seed positions (or invalid positions)
 * @param texCoord Current texel coordinate
 * @param stepSize Jump distance
 */
vec2 jumpFloodPass(sampler2D seedBuffer, vec2 texCoord, vec2 texelSize, int stepSize) {
    vec2 closestSeed = texture(seedBuffer, texCoord).xy;
    float closestDist = closestSeed.x < 0.0 ? 1e6 : length(texCoord - closestSeed);

    // Sample 8 neighbors at step distance
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;

            vec2 offset = vec2(float(x * stepSize), float(y * stepSize)) * texelSize;
            vec2 sampleSeed = texture(seedBuffer, texCoord + offset).xy;

            if (sampleSeed.x >= 0.0) {
                float dist = length(texCoord - sampleSeed);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestSeed = sampleSeed;
                }
            }
        }
    }

    return closestSeed;
}

/**
 * Initialize seeds for Jump Flood (mark edge pixels)
 */
vec2 initializeJumpFloodSeeds(sampler2D edgeBuffer, vec2 texCoord) {
    float edge = texture(edgeBuffer, texCoord).r;
    return edge > 0.5 ? texCoord : vec2(-1.0);
}

/**
 * Calculate outline from Jump Flood distance field
 */
float calculateJumpFloodOutline(sampler2D distanceField, vec2 texCoord,
                                vec2 texelSize, float thickness) {
    vec2 closestEdge = texture(distanceField, texCoord).xy;

    if (closestEdge.x < 0.0) {
        return 0.0;
    }

    float dist = length((texCoord - closestEdge) / texelSize);
    return smoothstep(thickness + 1.0, thickness, dist);
}

// ============================================================================
// Stylized Outlines
// ============================================================================

/**
 * Toon/cel-shaded outline
 */
float toonOutline(sampler2D depthBuffer, sampler2D normalBuffer,
                  vec2 texCoord, vec2 texelSize) {
    float depthEdge = depthEdgeDetection(depthBuffer, texCoord, texelSize, 0.005);
    float normalEdge = normalEdgeDetection(normalBuffer, texCoord, texelSize, 0.7);

    return max(depthEdge, normalEdge);
}

/**
 * Sketch-style outline with varying thickness
 */
float sketchOutline(sampler2D depthBuffer, sampler2D normalBuffer, sampler2D noiseTexture,
                    vec2 texCoord, vec2 texelSize) {
    float edge = combinedEdgeDetection(depthBuffer, normalBuffer, texCoord, texelSize);

    // Add thickness variation using noise
    vec2 noiseUV = texCoord * 10.0;
    float noise = texture(noiseTexture, noiseUV).r;

    float thickness = OUTLINE_THICKNESS * (0.5 + noise * 0.5);
    return edge * thickness;
}

// ============================================================================
// Object ID Outline
// ============================================================================

/**
 * Detect outline between different objects
 */
float objectIDOutline(sampler2D objectIDBuffer, vec2 texCoord, vec2 texelSize) {
    float centerID = texture(objectIDBuffer, texCoord).r;

    // Check neighbors for different IDs
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;

            vec2 offset = vec2(float(x), float(y)) * texelSize * OUTLINE_THICKNESS;
            float sampleID = texture(objectIDBuffer, texCoord + offset).r;

            if (abs(sampleID - centerID) > 0.01) {
                return 1.0;
            }
        }
    }

    return 0.0;
}

// ============================================================================
// Outline Application
// ============================================================================

/**
 * Apply outline to scene color
 */
vec3 applyOutline(vec3 sceneColor, float outline, vec3 outlineColor) {
    return mix(sceneColor, outlineColor, outline);
}

/**
 * Soft outline blend
 */
vec3 applyOutlineSoft(vec3 sceneColor, float outline, vec3 outlineColor, float softness) {
    float smoothOutline = smoothstep(0.0, softness, outline);
    return mix(sceneColor, outlineColor, smoothOutline);
}

/**
 * Outline with depth fade
 */
vec3 applyOutlineDepthFade(vec3 sceneColor, float outline, vec3 outlineColor,
                           float depth, float fadeStart, float fadeEnd) {
    float fadeFactor = 1.0 - smoothstep(fadeStart, fadeEnd, depth);
    return mix(sceneColor, outlineColor, outline * fadeFactor);
}

// ============================================================================
// Advanced Outline Effects
// ============================================================================

/**
 * Colored outline based on surface normal
 */
vec3 normalColoredOutline(sampler2D normalBuffer, vec2 texCoord,
                          vec2 texelSize, float edge) {
    if (edge < 0.01) {
        return vec3(0.0);
    }

    vec3 normal = decodeOctahedron(texture(normalBuffer, texCoord).rg);
    vec3 color = normal * 0.5 + 0.5; // Map to [0, 1]

    return color * edge;
}

/**
 * Depth-modulated outline thickness
 */
float depthModulatedOutline(sampler2D depthBuffer, sampler2D normalBuffer,
                            vec2 texCoord, vec2 texelSize) {
    float depth = texture(depthBuffer, texCoord).r;
    float linearDepth = linearizeDepth(depth, 0.1, 100.0);

    // Thicker outlines for closer objects
    float thicknessMod = 1.0 / (linearDepth * 0.1 + 1.0);

    float edge = combinedEdgeDetection(depthBuffer, normalBuffer, texCoord, texelSize);

    return edge * thicknessMod;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate outline only on object edges (exclude screen edges)
 */
float excludeScreenEdges(float outline, vec2 texCoord, float margin) {
    vec2 edgeDist = min(texCoord, 1.0 - texCoord);
    float minDist = min(edgeDist.x, edgeDist.y);

    if (minDist < margin) {
        return 0.0;
    }

    return outline;
}

/**
 * Adaptive outline thickness based on screen resolution
 */
float calculateAdaptiveThickness(vec2 resolution) {
    float referenceHeight = 1080.0;
    return OUTLINE_THICKNESS * (resolution.y / referenceHeight);
}

/**
 * Debug visualize outline edges
 */
vec3 debugVisualizeOutline(float outline) {
    return vec3(outline);
}
