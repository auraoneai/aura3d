/**
 * motion_blur.glsl - Motion Blur Post-Processing
 *
 * Implements camera and per-object motion blur:
 * - Velocity tile max
 * - Directional blur
 * - Max velocity clamping
 * - Variable sample count
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef MOTION_BLUR_SAMPLES
#define MOTION_BLUR_SAMPLES 16
#endif

#ifndef MOTION_BLUR_MAX_VELOCITY
#define MOTION_BLUR_MAX_VELOCITY 0.1
#endif

#ifndef MOTION_BLUR_TILE_SIZE
#define MOTION_BLUR_TILE_SIZE 20
#endif

// ============================================================================
// Velocity Tile Max
// ============================================================================

/**
 * Find maximum velocity in a tile (for optimization)
 */
vec2 findTileMaxVelocity(sampler2D velocityBuffer, vec2 tileCoord, int tileSize) {
    vec2 texelSize = 1.0 / vec2(textureSize(velocityBuffer, 0));
    vec2 maxVelocity = vec2(0.0);
    float maxLength = 0.0;

    vec2 tileStart = tileCoord * float(tileSize) * texelSize;

    for (int x = 0; x < tileSize; x++) {
        for (int y = 0; y < tileSize; y++) {
            vec2 sampleCoord = tileStart + vec2(float(x), float(y)) * texelSize;
            vec2 velocity = texture(velocityBuffer, sampleCoord).xy;
            float len = length(velocity);

            if (len > maxLength) {
                maxVelocity = velocity;
                maxLength = len;
            }
        }
    }

    return maxVelocity;
}

/**
 * Create velocity tile max buffer (downsampled max velocity)
 */
vec2 createVelocityTileMax(sampler2D velocityBuffer, vec2 texCoord) {
    vec2 maxVelocity = vec2(0.0);
    float maxLength = 0.0;

    vec2 texelSize = 1.0 / vec2(textureSize(velocityBuffer, 0));

    // Sample 3x3 neighborhood
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize * float(MOTION_BLUR_TILE_SIZE);
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
// Velocity Neighborhood Max
// ============================================================================

/**
 * Find maximum velocity in neighborhood (for better coverage)
 */
vec2 findNeighborhoodMaxVelocity(sampler2D velocityBuffer, vec2 texCoord, int radius) {
    vec2 texelSize = 1.0 / vec2(textureSize(velocityBuffer, 0));
    vec2 maxVelocity = texture(velocityBuffer, texCoord).xy;
    float maxLength = length(maxVelocity);

    for (int x = -radius; x <= radius; x++) {
        for (int y = -radius; y <= radius; y++) {
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
// Motion Blur Sampling
// ============================================================================

/**
 * Simple directional motion blur
 */
vec3 applyMotionBlur(sampler2D colorBuffer, sampler2D velocityBuffer,
                     vec2 texCoord, int numSamples) {
    vec2 velocity = texture(velocityBuffer, texCoord).xy;

    // Clamp velocity
    float velocityLength = length(velocity);
    if (velocityLength > MOTION_BLUR_MAX_VELOCITY) {
        velocity = normalize(velocity) * MOTION_BLUR_MAX_VELOCITY;
    }

    // Early exit if velocity is negligible
    if (velocityLength < 0.001) {
        return texture(colorBuffer, texCoord).rgb;
    }

    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    // Sample along velocity vector
    for (int i = 0; i < numSamples; i++) {
        float t = (float(i) / float(numSamples - 1)) - 0.5;
        vec2 offset = velocity * t;
        vec2 sampleCoord = texCoord + offset;

        // Check bounds
        if (sampleCoord.x < 0.0 || sampleCoord.x > 1.0 ||
            sampleCoord.y < 0.0 || sampleCoord.y > 1.0) {
            continue;
        }

        vec3 sample = texture(colorBuffer, sampleCoord).rgb;
        float weight = 1.0;

        color += sample * weight;
        totalWeight += weight;
    }

    return color / max(totalWeight, EPSILON);
}

/**
 * Advanced motion blur with depth comparison
 */
vec3 applyMotionBlurDepthAware(sampler2D colorBuffer, sampler2D velocityBuffer,
                               sampler2D depthBuffer, vec2 texCoord, int numSamples) {
    vec2 velocity = texture(velocityBuffer, texCoord).xy;
    float centerDepth = texture(depthBuffer, texCoord).r;

    // Clamp velocity
    float velocityLength = length(velocity);
    if (velocityLength > MOTION_BLUR_MAX_VELOCITY) {
        velocity = normalize(velocity) * MOTION_BLUR_MAX_VELOCITY;
    }

    if (velocityLength < 0.001) {
        return texture(colorBuffer, texCoord).rgb;
    }

    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < numSamples; i++) {
        float t = (float(i) / float(numSamples - 1)) - 0.5;
        vec2 offset = velocity * t;
        vec2 sampleCoord = texCoord + offset;

        if (sampleCoord.x < 0.0 || sampleCoord.x > 1.0 ||
            sampleCoord.y < 0.0 || sampleCoord.y > 1.0) {
            continue;
        }

        vec3 sample = texture(colorBuffer, sampleCoord).rgb;
        float sampleDepth = texture(depthBuffer, sampleCoord).r;

        // Reduce weight for samples at different depths (avoid bleeding)
        float depthDiff = abs(centerDepth - sampleDepth);
        float depthWeight = exp(-depthDiff * 100.0);

        float weight = depthWeight;

        color += sample * weight;
        totalWeight += weight;
    }

    return color / max(totalWeight, EPSILON);
}

// ============================================================================
// Reconstruction Filter
// ============================================================================

/**
 * Gather-based reconstruction (better quality)
 */
vec3 reconstructMotionBlur(sampler2D colorBuffer, sampler2D velocityBuffer,
                           sampler2D tileMaxBuffer, vec2 texCoord, int numSamples) {
    vec2 texelSize = 1.0 / vec2(textureSize(colorBuffer, 0));

    // Get tile max velocity for this pixel
    vec2 tileCoord = texCoord * vec2(textureSize(colorBuffer, 0)) / float(MOTION_BLUR_TILE_SIZE);
    vec2 maxVelocity = texture(tileMaxBuffer, tileCoord * texelSize * float(MOTION_BLUR_TILE_SIZE)).xy;

    float maxVelocityLength = length(maxVelocity);
    if (maxVelocityLength < 0.001) {
        return texture(colorBuffer, texCoord).rgb;
    }

    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    // Sample along max velocity direction
    for (int i = 0; i < numSamples; i++) {
        float t = (float(i) / float(numSamples - 1)) - 0.5;
        vec2 offset = maxVelocity * t;
        vec2 sampleCoord = texCoord + offset;

        if (sampleCoord.x < 0.0 || sampleCoord.x > 1.0 ||
            sampleCoord.y < 0.0 || sampleCoord.y > 1.0) {
            continue;
        }

        vec3 sample = texture(colorBuffer, sampleCoord).rgb;
        vec2 sampleVelocity = texture(velocityBuffer, sampleCoord).xy;

        // Check if sample contributes to current pixel
        float along = dot(sampleVelocity, maxVelocity) / max(maxVelocityLength * maxVelocityLength, EPSILON);
        float weight = saturate(1.0 - abs(t - along));

        color += sample * weight;
        totalWeight += weight;
    }

    return color / max(totalWeight, EPSILON);
}

// ============================================================================
// Variable Sample Count
// ============================================================================

/**
 * Adaptive sample count based on velocity magnitude
 */
int calculateAdaptiveSamples(vec2 velocity, int minSamples, int maxSamples) {
    float velocityLength = length(velocity);
    float t = saturate(velocityLength / MOTION_BLUR_MAX_VELOCITY);
    return int(mix(float(minSamples), float(maxSamples), t));
}

/**
 * Motion blur with adaptive sampling
 */
vec3 applyMotionBlurAdaptive(sampler2D colorBuffer, sampler2D velocityBuffer,
                             vec2 texCoord, int minSamples, int maxSamples) {
    vec2 velocity = texture(velocityBuffer, texCoord).xy;
    int numSamples = calculateAdaptiveSamples(velocity, minSamples, maxSamples);

    return applyMotionBlur(colorBuffer, velocityBuffer, texCoord, numSamples);
}

// ============================================================================
// Camera Motion Blur
// ============================================================================

/**
 * Calculate camera motion velocity from matrices
 */
vec2 calculateCameraVelocity(vec3 worldPos, mat4 currentViewProj, mat4 prevViewProj) {
    // Current frame screen position
    vec4 currentClip = currentViewProj * vec4(worldPos, 1.0);
    vec2 currentScreen = (currentClip.xy / currentClip.w) * 0.5 + 0.5;

    // Previous frame screen position
    vec4 prevClip = prevViewProj * vec4(worldPos, 1.0);
    vec2 prevScreen = (prevClip.xy / prevClip.w) * 0.5 + 0.5;

    return currentScreen - prevScreen;
}

/**
 * Camera-only motion blur (no per-object motion)
 */
vec3 applyCameraMotionBlur(sampler2D colorBuffer, sampler2D depthBuffer,
                           vec2 texCoord, mat4 invViewProj,
                           mat4 currentViewProj, mat4 prevViewProj,
                           int numSamples) {
    // Reconstruct world position
    float depth = texture(depthBuffer, texCoord).r;
    vec3 worldPos = reconstructWorldPosition(texCoord, depth, invViewProj);

    // Calculate camera velocity
    vec2 velocity = calculateCameraVelocity(worldPos, currentViewProj, prevViewProj);

    // Apply motion blur
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < numSamples; i++) {
        float t = (float(i) / float(numSamples - 1)) - 0.5;
        vec2 offset = velocity * t;
        vec2 sampleCoord = texCoord + offset;

        if (sampleCoord.x < 0.0 || sampleCoord.x > 1.0 ||
            sampleCoord.y < 0.0 || sampleCoord.y > 1.0) {
            continue;
        }

        vec3 sample = texture(colorBuffer, sampleCoord).rgb;
        color += sample;
        totalWeight += 1.0;
    }

    return color / max(totalWeight, EPSILON);
}

// ============================================================================
// Soft Z-Extent
// ============================================================================

/**
 * Calculate soft depth extent for motion blur
 */
float calculateSoftZExtent(float centerDepth, float sampleDepth, vec2 velocity) {
    float velocityLength = length(velocity);
    float depthDiff = abs(centerDepth - sampleDepth);

    // Allow more depth variation for faster-moving objects
    float threshold = 0.01 * (1.0 + velocityLength * 10.0);

    return saturate(1.0 - depthDiff / threshold);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Clamp velocity to maximum length
 */
vec2 clampVelocity(vec2 velocity, float maxLength) {
    float len = length(velocity);
    if (len > maxLength) {
        return normalize(velocity) * maxLength;
    }
    return velocity;
}

/**
 * Visualize velocity for debugging
 */
vec3 visualizeVelocity(vec2 velocity, float scale) {
    vec2 normalized = velocity * scale;
    return vec3(abs(normalized.x), abs(normalized.y), 0.0);
}

/**
 * Calculate jitter for random sampling
 */
float getMotionBlurJitter(vec2 texCoord, int frame) {
    return hash(texCoord.x + texCoord.y + float(frame));
}

/**
 * Randomized motion blur samples (reduces banding)
 */
vec3 applyMotionBlurRandomized(sampler2D colorBuffer, sampler2D velocityBuffer,
                               vec2 texCoord, int numSamples, int frame) {
    vec2 velocity = texture(velocityBuffer, texCoord).xy;

    if (length(velocity) < 0.001) {
        return texture(colorBuffer, texCoord).rgb;
    }

    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    float jitter = getMotionBlurJitter(texCoord, frame);

    for (int i = 0; i < numSamples; i++) {
        float t = (float(i) / float(numSamples - 1)) - 0.5;
        t += (hash(float(i) + jitter) - 0.5) * (1.0 / float(numSamples)); // Add noise

        vec2 offset = velocity * t;
        vec2 sampleCoord = texCoord + offset;

        if (sampleCoord.x < 0.0 || sampleCoord.x > 1.0 ||
            sampleCoord.y < 0.0 || sampleCoord.y > 1.0) {
            continue;
        }

        vec3 sample = texture(colorBuffer, sampleCoord).rgb;
        color += sample;
        totalWeight += 1.0;
    }

    return color / max(totalWeight, EPSILON);
}
