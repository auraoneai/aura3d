/**
 * ao.glsl - Ambient Occlusion
 *
 * Implements screen-space ambient occlusion techniques:
 * - HBAO (Horizon-Based Ambient Occlusion)
 * - GTAO (Ground Truth Ambient Occlusion)
 * - Configurable sampling and denoising
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef AO_NUM_DIRECTIONS
#define AO_NUM_DIRECTIONS 8
#endif

#ifndef AO_NUM_STEPS
#define AO_NUM_STEPS 4
#endif

#ifndef AO_RADIUS
#define AO_RADIUS 0.5
#endif

#ifndef AO_BIAS
#define AO_BIAS 0.01
#endif

#ifndef AO_INTENSITY
#define AO_INTENSITY 1.0
#endif

#ifndef AO_BLUR_RADIUS
#define AO_BLUR_RADIUS 4.0
#endif

// ============================================================================
// HBAO (Horizon-Based Ambient Occlusion)
// ============================================================================

/**
 * Calculate horizon angle for a direction
 */
float calculateHorizonAngle(vec3 viewPos, vec3 viewNormal, vec3 samplePos) {
    vec3 horizon = samplePos - viewPos;
    float len = length(horizon);
    horizon /= len;

    float angle = acos(saturate(dot(horizon, viewNormal)));

    // Attenuate with distance
    float attenuation = 1.0 - saturate(len / AO_RADIUS);

    return angle * attenuation;
}

/**
 * HBAO implementation
 * @param viewPos View space position
 * @param viewNormal View space normal
 * @param depthBuffer Depth buffer
 * @param normalBuffer Normal buffer
 * @param projection Projection matrix
 * @param invProjection Inverse projection matrix
 * @param texCoord Screen UV coordinates
 * @param noiseOffset Random rotation offset for temporal variation
 */
float computeHBAO(vec3 viewPos, vec3 viewNormal, sampler2D depthBuffer,
                  mat4 projection, mat4 invProjection, vec2 texCoord,
                  float noiseOffset) {
    vec2 texelSize = 1.0 / vec2(textureSize(depthBuffer, 0));
    float occlusion = 0.0;

    // Random rotation
    float randomAngle = noiseOffset * TWO_PI;
    float cosRot = cos(randomAngle);
    float sinRot = sin(randomAngle);
    mat2 rotation = mat2(cosRot, -sinRot, sinRot, cosRot);

    for (int dir = 0; dir < AO_NUM_DIRECTIONS; dir++) {
        float angle = (float(dir) / float(AO_NUM_DIRECTIONS)) * TWO_PI;
        vec2 direction = vec2(cos(angle), sin(angle));
        direction = rotation * direction;

        float maxHorizonAngle = -PI;

        for (int step = 1; step <= AO_NUM_STEPS; step++) {
            float stepSize = float(step) / float(AO_NUM_STEPS);
            vec2 sampleUV = texCoord + direction * texelSize * AO_RADIUS * stepSize * 100.0;

            // Sample depth
            float sampleDepth = texture(depthBuffer, sampleUV).r;

            // Reconstruct view position
            vec3 sampleViewPos = reconstructViewPosition(sampleUV, sampleDepth, invProjection);

            // Calculate horizon angle
            float horizonAngle = calculateHorizonAngle(viewPos, viewNormal, sampleViewPos);
            maxHorizonAngle = max(maxHorizonAngle, horizonAngle);
        }

        // Accumulate occlusion
        float ao = saturate((HALF_PI - maxHorizonAngle - AO_BIAS) / HALF_PI);
        occlusion += ao;
    }

    occlusion /= float(AO_NUM_DIRECTIONS);
    return 1.0 - saturate(occlusion * AO_INTENSITY);
}

// ============================================================================
// GTAO (Ground Truth Ambient Occlusion)
// ============================================================================

/**
 * Integrate GTAO for a slice
 */
float integrateGTAO(float h1, float h2, float n) {
    float cosN = cos(n);
    float sinN = sin(n);

    // Clamp horizons
    h1 = -acos(clamp(h1, -1.0, 1.0));
    h2 = acos(clamp(h2, -1.0, 1.0));

    float result = 0.25 * (-cos(2.0 * h1 - n) + cosN + 2.0 * h1 * sinN) +
                   0.25 * (cos(2.0 * h2 - n) - cosN + 2.0 * h2 * sinN);

    return result;
}

/**
 * GTAO implementation
 */
float computeGTAO(vec3 viewPos, vec3 viewNormal, sampler2D depthBuffer,
                  mat4 projection, mat4 invProjection, vec2 texCoord,
                  float noiseOffset) {
    vec2 texelSize = 1.0 / vec2(textureSize(depthBuffer, 0));
    float occlusion = 0.0;

    // Random rotation
    float randomAngle = noiseOffset * TWO_PI;
    float cosRot = cos(randomAngle);
    float sinRot = sin(randomAngle);
    mat2 rotation = mat2(cosRot, -sinRot, sinRot, cosRot);

    // Build tangent frame
    vec3 tangent = normalize(getPerpendicularVector(viewNormal));
    vec3 bitangent = cross(viewNormal, tangent);

    for (int dir = 0; dir < AO_NUM_DIRECTIONS; dir++) {
        float angle = (float(dir) / float(AO_NUM_DIRECTIONS)) * PI;
        vec3 sliceDir = cos(angle) * tangent + sin(angle) * bitangent;

        vec2 screenDir = normalize(vec2(
            dot(sliceDir, vec3(1.0, 0.0, 0.0)),
            dot(sliceDir, vec3(0.0, 1.0, 0.0))
        ));
        screenDir = rotation * screenDir;

        // March in both directions
        float h1 = -1.0;
        float h2 = -1.0;

        for (int step = 1; step <= AO_NUM_STEPS; step++) {
            float stepSize = float(step) / float(AO_NUM_STEPS);

            // Positive direction
            vec2 sampleUV1 = texCoord + screenDir * texelSize * AO_RADIUS * stepSize * 100.0;
            float depth1 = texture(depthBuffer, sampleUV1).r;
            vec3 samplePos1 = reconstructViewPosition(sampleUV1, depth1, invProjection);
            vec3 horizon1 = normalize(samplePos1 - viewPos);
            h1 = max(h1, dot(horizon1, viewNormal));

            // Negative direction
            vec2 sampleUV2 = texCoord - screenDir * texelSize * AO_RADIUS * stepSize * 100.0;
            float depth2 = texture(depthBuffer, sampleUV2).r;
            vec3 samplePos2 = reconstructViewPosition(sampleUV2, depth2, invProjection);
            vec3 horizon2 = normalize(samplePos2 - viewPos);
            h2 = max(h2, dot(horizon2, viewNormal));
        }

        // Integrate
        float sliceOcclusion = integrateGTAO(h1, h2, 0.0);
        occlusion += sliceOcclusion;
    }

    occlusion /= float(AO_NUM_DIRECTIONS);
    return saturate(1.0 - occlusion * AO_INTENSITY);
}

// ============================================================================
// Simple SSAO (for comparison/fallback)
// ============================================================================

/**
 * Simple screen-space ambient occlusion
 */
float computeSSAO(vec3 viewPos, vec3 viewNormal, sampler2D depthBuffer,
                  mat4 invProjection, vec2 texCoord, sampler2D noiseTexture,
                  vec3 samples[64], int numSamples) {
    // Get noise for rotation
    vec2 noiseScale = vec2(textureSize(depthBuffer, 0)) / vec2(textureSize(noiseTexture, 0));
    vec3 randomVec = texture(noiseTexture, texCoord * noiseScale).xyz;

    // Create TBN matrix
    vec3 tangent = normalize(randomVec - viewNormal * dot(randomVec, viewNormal));
    vec3 bitangent = cross(viewNormal, tangent);
    mat3 TBN = mat3(tangent, bitangent, viewNormal);

    float occlusion = 0.0;

    for (int i = 0; i < numSamples; i++) {
        // Get sample position
        vec3 samplePos = TBN * samples[i];
        samplePos = viewPos + samplePos * AO_RADIUS;

        // Project to screen space
        vec4 offset = vec4(samplePos, 1.0);
        offset = projection * offset;
        offset.xyz /= offset.w;
        offset.xy = offset.xy * 0.5 + 0.5;

        // Sample depth
        float sampleDepth = texture(depthBuffer, offset.xy).r;
        vec3 sampleViewPos = reconstructViewPosition(offset.xy, sampleDepth, invProjection);

        // Range check and accumulate
        float rangeCheck = smoothstep(0.0, 1.0, AO_RADIUS / abs(viewPos.z - sampleViewPos.z));
        occlusion += (sampleViewPos.z <= samplePos.z - AO_BIAS ? 1.0 : 0.0) * rangeCheck;
    }

    occlusion = 1.0 - (occlusion / float(numSamples));
    return pow(occlusion, AO_INTENSITY);
}

// ============================================================================
// Denoising / Blur
// ============================================================================

/**
 * Bilateral blur for AO
 */
float blurAO(sampler2D aoBuffer, sampler2D depthBuffer, vec2 texCoord,
             vec2 blurDirection) {
    vec2 texelSize = 1.0 / vec2(textureSize(aoBuffer, 0));

    float centerDepth = texture(depthBuffer, texCoord).r;
    float centerAO = texture(aoBuffer, texCoord).r;

    float totalAO = centerAO;
    float totalWeight = 1.0;

    for (float i = 1.0; i <= AO_BLUR_RADIUS; i += 1.0) {
        vec2 offset = blurDirection * texelSize * i;

        // Sample both directions
        for (float dir = -1.0; dir <= 1.0; dir += 2.0) {
            vec2 sampleCoord = texCoord + offset * dir;
            float sampleDepth = texture(depthBuffer, sampleCoord).r;
            float sampleAO = texture(aoBuffer, sampleCoord).r;

            // Depth-aware weight
            float depthDiff = abs(centerDepth - sampleDepth);
            float depthWeight = exp(-depthDiff * 100.0);

            // Spatial weight
            float spatialWeight = exp(-i * i / (2.0 * AO_BLUR_RADIUS * AO_BLUR_RADIUS));

            float weight = depthWeight * spatialWeight;

            totalAO += sampleAO * weight;
            totalWeight += weight;
        }
    }

    return totalAO / totalWeight;
}

/**
 * Two-pass separable blur for AO
 */
float blurAOSeparable(sampler2D aoBuffer, sampler2D depthBuffer,
                      vec2 texCoord, bool horizontal) {
    vec2 direction = horizontal ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    return blurAO(aoBuffer, depthBuffer, texCoord, direction);
}

/**
 * Edge-preserving filter for AO
 */
float filterAO(sampler2D aoBuffer, sampler2D normalBuffer, sampler2D depthBuffer,
               vec2 texCoord) {
    vec2 texelSize = 1.0 / vec2(textureSize(aoBuffer, 0));

    float centerAO = texture(aoBuffer, texCoord).r;
    vec3 centerNormal = decodeOctahedron(texture(normalBuffer, texCoord).rg);
    float centerDepth = texture(depthBuffer, texCoord).r;

    float totalAO = centerAO;
    float totalWeight = 1.0;

    const int kernelSize = 2;

    for (int x = -kernelSize; x <= kernelSize; x++) {
        for (int y = -kernelSize; y <= kernelSize; y++) {
            if (x == 0 && y == 0) continue;

            vec2 offset = vec2(float(x), float(y)) * texelSize;
            vec2 sampleCoord = texCoord + offset;

            float sampleAO = texture(aoBuffer, sampleCoord).r;
            vec3 sampleNormal = decodeOctahedron(texture(normalBuffer, sampleCoord).rg);
            float sampleDepth = texture(depthBuffer, sampleCoord).r;

            // Normal similarity
            float normalWeight = pow(saturate(dot(centerNormal, sampleNormal)), 32.0);

            // Depth similarity
            float depthDiff = abs(centerDepth - sampleDepth);
            float depthWeight = exp(-depthDiff * 100.0);

            // Spatial weight
            float dist = length(vec2(float(x), float(y)));
            float spatialWeight = exp(-dist * dist / (2.0 * float(kernelSize * kernelSize)));

            float weight = normalWeight * depthWeight * spatialWeight;

            totalAO += sampleAO * weight;
            totalWeight += weight;
        }
    }

    return totalAO / totalWeight;
}

// ============================================================================
// Temporal Accumulation
// ============================================================================

/**
 * Temporal accumulation for AO
 */
float temporalAccumulateAO(float currentAO, float historyAO, vec2 velocity,
                           float blendFactor) {
    return mix(historyAO, currentAO, blendFactor);
}

/**
 * Advanced temporal filter with rejection
 */
float temporalFilterAO(sampler2D currentAO, sampler2D historyAO,
                       sampler2D velocityBuffer, vec2 texCoord) {
    vec2 velocity = texture(velocityBuffer, texCoord).xy;
    vec2 historyCoord = texCoord - velocity;

    // Check bounds
    if (historyCoord.x < 0.0 || historyCoord.x > 1.0 ||
        historyCoord.y < 0.0 || historyCoord.y > 1.0) {
        return texture(currentAO, texCoord).r;
    }

    float current = texture(currentAO, texCoord).r;
    float history = texture(historyAO, historyCoord).r;

    // Neighborhood clamping
    vec2 texelSize = 1.0 / vec2(textureSize(currentAO, 0));
    float minAO = 1.0;
    float maxAO = 0.0;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            float neighbor = texture(currentAO, texCoord + offset).r;
            minAO = min(minAO, neighbor);
            maxAO = max(maxAO, neighbor);
        }
    }

    history = clamp(history, minAO, maxAO);

    // Blend
    float blendFactor = 0.1;
    return mix(history, current, blendFactor);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate hemisphere sample kernel for SSAO
 */
vec3 generateHemisphereSample(int index, int totalSamples) {
    float u1 = hash(float(index));
    float u2 = hash(float(index) * 2.0);

    float phi = u1 * TWO_PI;
    float cosTheta = sqrt(u2);
    float sinTheta = sqrt(1.0 - u2);

    vec3 sample = vec3(
        cos(phi) * sinTheta,
        sin(phi) * sinTheta,
        cosTheta
    );

    // Scale samples to distribute more near origin
    float scale = float(index) / float(totalSamples);
    scale = mix(0.1, 1.0, scale * scale);

    return sample * scale;
}

/**
 * Calculate AO contribution from a single sample
 */
float calculateAOContribution(vec3 viewPos, vec3 viewNormal, vec3 samplePos,
                             float radius) {
    vec3 sampleDir = samplePos - viewPos;
    float dist = length(sampleDir);
    sampleDir /= dist;

    float angle = dot(sampleDir, viewNormal);
    float attenuation = 1.0 - saturate(dist / radius);

    return max(0.0, angle - AO_BIAS) * attenuation;
}
