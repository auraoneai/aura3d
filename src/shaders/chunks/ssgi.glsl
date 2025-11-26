/**
 * ssgi.glsl - Screen Space Global Illumination
 *
 * Implements screen-space indirect diffuse lighting using ray marching.
 * Features include:
 * - Hi-Z ray marching for performance
 * - Importance sampling
 * - Temporal denoising
 * - Multi-bounce approximation
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef SSGI_RAY_STEPS
#define SSGI_RAY_STEPS 16
#endif

#ifndef SSGI_BINARY_SEARCH_STEPS
#define SSGI_BINARY_SEARCH_STEPS 4
#endif

#ifndef SSGI_MAX_RAY_DISTANCE
#define SSGI_MAX_RAY_DISTANCE 5.0
#endif

#ifndef SSGI_THICKNESS
#define SSGI_THICKNESS 0.5
#endif

#ifndef SSGI_NUM_SAMPLES
#define SSGI_NUM_SAMPLES 4
#endif

#ifndef SSGI_DENOISE_RADIUS
#define SSGI_DENOISE_RADIUS 8.0
#endif

// ============================================================================
// Ray Marching
// ============================================================================

/**
 * Screen-space ray marching with Hi-Z optimization
 * @param startPos Ray start position in view space
 * @param rayDir Ray direction in view space
 * @param depthBuffer Depth buffer
 * @param hiZBuffer Hierarchical Z buffer (optional)
 * @param projection Projection matrix
 * @param maxSteps Maximum ray march steps
 * @param maxDistance Maximum ray distance
 * @return Hit result: xy = screen UV, z = hit distance, w = success (1.0 or 0.0)
 */
vec4 traceScreenSpaceRay(vec3 startPos, vec3 rayDir,
                         sampler2D depthBuffer,
                         mat4 projection,
                         int maxSteps, float maxDistance) {
    vec3 rayEnd = startPos + rayDir * maxDistance;

    // Project to screen space
    vec4 startFrag = projection * vec4(startPos, 1.0);
    startFrag.xyz /= startFrag.w;
    startFrag.xy = startFrag.xy * 0.5 + 0.5;

    vec4 endFrag = projection * vec4(rayEnd, 1.0);
    endFrag.xyz /= endFrag.w;
    endFrag.xy = endFrag.xy * 0.5 + 0.5;

    vec2 fragDelta = endFrag.xy - startFrag.xy;

    // Use shorter screen space distance for step size
    float useX = abs(fragDelta.x) >= abs(fragDelta.y) ? 1.0 : 0.0;
    float delta = mix(abs(fragDelta.y), abs(fragDelta.x), useX);
    vec2 increment = fragDelta / max(delta, 0.001);

    // Ray march in screen space
    vec2 screenPos = startFrag.xy;
    float searchDepth = startFrag.z;
    float searchDepthDelta = (endFrag.z - startFrag.z) / float(maxSteps);

    float stepLength = length(vec3(increment, searchDepthDelta));
    float traveled = 0.0;

    for (int i = 0; i < maxSteps; i++) {
        screenPos += increment;
        searchDepth += searchDepthDelta;
        traveled += stepLength;

        // Check bounds
        if (screenPos.x < 0.0 || screenPos.x > 1.0 ||
            screenPos.y < 0.0 || screenPos.y > 1.0) {
            break;
        }

        // Sample depth buffer
        float sceneDepth = texture(depthBuffer, screenPos).r;

        // Check intersection
        float depthDiff = searchDepth - sceneDepth;

        if (depthDiff > 0.0 && depthDiff < SSGI_THICKNESS) {
            // Refine with binary search
            #if SSGI_BINARY_SEARCH_STEPS > 0
                vec2 refinedPos = screenPos;
                float refinedDepth = searchDepth;
                vec2 step = increment;
                float depthStep = searchDepthDelta;

                for (int j = 0; j < SSGI_BINARY_SEARCH_STEPS; j++) {
                    step *= 0.5;
                    depthStep *= 0.5;

                    sceneDepth = texture(depthBuffer, refinedPos).r;
                    depthDiff = refinedDepth - sceneDepth;

                    if (depthDiff > 0.0) {
                        refinedPos -= step;
                        refinedDepth -= depthStep;
                    } else {
                        refinedPos += step;
                        refinedDepth += depthStep;
                    }
                }

                screenPos = refinedPos;
            #endif

            return vec4(screenPos, traveled, 1.0);
        }
    }

    return vec4(0.0, 0.0, 0.0, 0.0);
}

/**
 * Hi-Z ray marching (more efficient for long rays)
 */
#ifdef SSGI_USE_HIZ
vec4 traceScreenSpaceRayHiZ(vec3 startPos, vec3 rayDir,
                            sampler2D hiZBuffer,
                            mat4 projection,
                            int maxSteps, float maxDistance,
                            int maxMipLevel) {
    vec3 rayEnd = startPos + rayDir * maxDistance;

    // Project to screen space
    vec4 startFrag = projection * vec4(startPos, 1.0);
    startFrag.xyz /= startFrag.w;
    startFrag.xy = startFrag.xy * 0.5 + 0.5;

    vec4 endFrag = projection * vec4(rayEnd, 1.0);
    endFrag.xyz /= endFrag.w;
    endFrag.xy = endFrag.xy * 0.5 + 0.5;

    vec2 fragDelta = endFrag.xy - startFrag.xy;
    float rayLength = length(fragDelta);

    vec2 rayStep = fragDelta / float(maxSteps);
    vec2 screenPos = startFrag.xy;
    float searchDepth = startFrag.z;
    float depthStep = (endFrag.z - startFrag.z) / float(maxSteps);

    int currentMipLevel = 0;

    for (int i = 0; i < maxSteps; i++) {
        // Determine mip level based on step size
        float screenStepLength = length(rayStep * pow(2.0, float(currentMipLevel)));
        currentMipLevel = min(int(log2(screenStepLength * 512.0)), maxMipLevel);

        screenPos += rayStep * pow(2.0, float(currentMipLevel));
        searchDepth += depthStep * pow(2.0, float(currentMipLevel));

        if (screenPos.x < 0.0 || screenPos.x > 1.0 ||
            screenPos.y < 0.0 || screenPos.y > 1.0) {
            break;
        }

        float sceneDepth = textureLod(hiZBuffer, screenPos, float(currentMipLevel)).r;
        float depthDiff = searchDepth - sceneDepth;

        if (depthDiff > 0.0 && currentMipLevel == 0) {
            return vec4(screenPos, length(screenPos - startFrag.xy), 1.0);
        } else if (depthDiff > 0.0 && currentMipLevel > 0) {
            // Step back and decrease mip level
            screenPos -= rayStep * pow(2.0, float(currentMipLevel));
            searchDepth -= depthStep * pow(2.0, float(currentMipLevel));
            currentMipLevel = max(0, currentMipLevel - 1);
        }
    }

    return vec4(0.0, 0.0, 0.0, 0.0);
}
#endif

// ============================================================================
// Importance Sampling
// ============================================================================

/**
 * Cosine-weighted hemisphere sampling
 */
vec3 sampleCosineHemisphere(vec2 u, vec3 normal) {
    float phi = TWO_PI * u.x;
    float cosTheta = sqrt(u.y);
    float sinTheta = sqrt(1.0 - u.y);

    vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

    // Build orthonormal basis
    vec3 up = abs(normal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, normal));
    vec3 bitangent = cross(normal, tangent);

    return normalize(tangent * H.x + bitangent * H.y + normal * H.z);
}

/**
 * GGX importance sampling for glossy reflections
 */
vec3 sampleGGXHemisphere(vec2 u, vec3 normal, float roughness) {
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;

    float phi = TWO_PI * u.x;
    float cosTheta = sqrt((1.0 - u.y) / (1.0 + (alpha2 - 1.0) * u.y));
    float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    vec3 H = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

    // Build orthonormal basis
    vec3 up = abs(normal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, normal));
    vec3 bitangent = cross(normal, tangent);

    return normalize(tangent * H.x + bitangent * H.y + normal * H.z);
}

// ============================================================================
// SSGI Sampling
// ============================================================================

/**
 * Sample indirect diffuse lighting
 * @param position View space position
 * @param normal View space normal
 * @param viewDir View direction
 * @param depthBuffer Depth buffer
 * @param colorBuffer Scene color buffer
 * @param normalBuffer Normal buffer
 * @param projection Projection matrix
 * @param frame Frame counter for temporal variation
 */
vec3 sampleIndirectDiffuse(vec3 position, vec3 normal, vec3 viewDir,
                           sampler2D depthBuffer, sampler2D colorBuffer,
                           sampler2D normalBuffer, mat4 projection,
                           uint frame) {
    vec3 indirectLight = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < SSGI_NUM_SAMPLES; i++) {
        // Generate sample direction with temporal variation
        vec2 u = hash2(vec2(float(i), float(frame)));
        vec3 sampleDir = sampleCosineHemisphere(u, normal);

        // Trace ray
        vec4 hitResult = traceScreenSpaceRay(
            position, sampleDir, depthBuffer, projection,
            SSGI_RAY_STEPS, SSGI_MAX_RAY_DISTANCE
        );

        if (hitResult.w > 0.5) {
            // Sample hit color
            vec3 hitColor = texture(colorBuffer, hitResult.xy).rgb;

            // Sample hit normal for validation
            vec3 hitNormal = decodeOctahedron(texture(normalBuffer, hitResult.xy).rg);

            // Weight by angle between ray and hit surface normal
            float normalWeight = saturate(dot(hitNormal, -sampleDir));

            // Distance falloff
            float distanceWeight = 1.0 - saturate(hitResult.z / SSGI_MAX_RAY_DISTANCE);

            float weight = normalWeight * distanceWeight;
            indirectLight += hitColor * weight;
            totalWeight += weight;
        }
    }

    if (totalWeight > EPSILON) {
        return indirectLight / totalWeight;
    }

    return vec3(0.0);
}

/**
 * Sample indirect diffuse with multi-bounce approximation
 */
vec3 sampleIndirectDiffuseMultiBounce(vec3 position, vec3 normal, vec3 viewDir,
                                      sampler2D depthBuffer, sampler2D colorBuffer,
                                      sampler2D normalBuffer, sampler2D aoBuffer,
                                      mat4 projection, uint frame) {
    vec3 firstBounce = sampleIndirectDiffuse(position, normal, viewDir,
                                             depthBuffer, colorBuffer, normalBuffer,
                                             projection, frame);

    // Approximate second bounce using AO
    #ifdef SSGI_MULTI_BOUNCE
        float ao = 1.0; // Sample from aoBuffer if available
        vec3 secondBounce = firstBounce * firstBounce * ao;
        return firstBounce + secondBounce * 0.5;
    #else
        return firstBounce;
    #endif
}

// ============================================================================
// Denoising
// ============================================================================

/**
 * Spatial bilateral blur for SSGI
 * @param giBuffer Raw GI buffer
 * @param normalBuffer Normal buffer
 * @param depthBuffer Depth buffer
 * @param texCoord Current texel coordinate
 * @param normalThreshold Normal similarity threshold
 * @param depthThreshold Depth similarity threshold
 */
vec3 denoiseSSGI(sampler2D giBuffer, sampler2D normalBuffer,
                 sampler2D depthBuffer, vec2 texCoord,
                 float normalThreshold, float depthThreshold) {
    vec2 texelSize = 1.0 / vec2(textureSize(giBuffer, 0));

    vec3 centerColor = texture(giBuffer, texCoord).rgb;
    vec3 centerNormal = decodeOctahedron(texture(normalBuffer, texCoord).rg);
    float centerDepth = texture(depthBuffer, texCoord).r;

    vec3 blurredColor = centerColor;
    float totalWeight = 1.0;

    // Bilateral blur kernel
    for (float x = -SSGI_DENOISE_RADIUS; x <= SSGI_DENOISE_RADIUS; x += 1.0) {
        for (float y = -SSGI_DENOISE_RADIUS; y <= SSGI_DENOISE_RADIUS; y += 1.0) {
            if (x == 0.0 && y == 0.0) continue;

            vec2 offset = vec2(x, y) * texelSize;
            vec2 sampleCoord = texCoord + offset;

            vec3 sampleColor = texture(giBuffer, sampleCoord).rgb;
            vec3 sampleNormal = decodeOctahedron(texture(normalBuffer, sampleCoord).rg);
            float sampleDepth = texture(depthBuffer, sampleCoord).r;

            // Normal similarity
            float normalSimilarity = saturate(dot(centerNormal, sampleNormal));
            float normalWeight = step(normalThreshold, normalSimilarity);

            // Depth similarity
            float depthDiff = abs(centerDepth - sampleDepth);
            float depthWeight = exp(-depthDiff / depthThreshold);

            // Spatial weight (Gaussian)
            float spatialDist = length(vec2(x, y));
            float spatialWeight = exp(-spatialDist * spatialDist / (2.0 * SSGI_DENOISE_RADIUS * SSGI_DENOISE_RADIUS));

            float weight = normalWeight * depthWeight * spatialWeight;

            blurredColor += sampleColor * weight;
            totalWeight += weight;
        }
    }

    return blurredColor / totalWeight;
}

/**
 * Temporal accumulation for SSGI
 */
vec3 temporalAccumulateSSGI(vec3 currentGI, vec3 historyGI,
                            vec2 velocity, float blendFactor) {
    // Simple exponential moving average
    return mix(historyGI, currentGI, blendFactor);
}

/**
 * Advanced temporal denoising with variance clipping
 */
vec3 temporalDenoiseSSGI(sampler2D currentGI, sampler2D historyGI,
                        sampler2D velocityBuffer, vec2 texCoord) {
    vec2 velocity = texture(velocityBuffer, texCoord).xy;
    vec2 historyCoord = texCoord - velocity;

    // Check if history is valid
    if (historyCoord.x < 0.0 || historyCoord.x > 1.0 ||
        historyCoord.y < 0.0 || historyCoord.y > 1.0) {
        return texture(currentGI, texCoord).rgb;
    }

    vec3 current = texture(currentGI, texCoord).rgb;
    vec3 history = texture(historyGI, historyCoord).rgb;

    // Neighborhood clamping for variance reduction
    vec2 texelSize = 1.0 / vec2(textureSize(currentGI, 0));
    vec3 minColor = vec3(FLT_MAX);
    vec3 maxColor = vec3(-FLT_MAX);

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec3 neighbor = texture(currentGI, texCoord + vec2(x, y) * texelSize).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
        }
    }

    history = clamp(history, minColor, maxColor);

    // Blend
    float blendFactor = 0.1; // Configurable
    return mix(history, current, blendFactor);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate screen space ambient occlusion contribution to GI
 */
float calculateGIAO(vec3 position, vec3 normal, sampler2D depthBuffer,
                    mat4 projection, int numSamples, float radius) {
    float occlusion = 0.0;

    for (int i = 0; i < numSamples; i++) {
        vec2 u = hash2(vec2(float(i), position.x + position.y));
        vec3 sampleDir = sampleCosineHemisphere(u, normal);
        vec3 samplePos = position + sampleDir * radius;

        vec4 clipPos = projection * vec4(samplePos, 1.0);
        clipPos.xyz /= clipPos.w;
        vec2 screenUV = clipPos.xy * 0.5 + 0.5;

        if (screenUV.x >= 0.0 && screenUV.x <= 1.0 &&
            screenUV.y >= 0.0 && screenUV.y <= 1.0) {
            float sampleDepth = texture(depthBuffer, screenUV).r;
            float occluded = clipPos.z > sampleDepth ? 1.0 : 0.0;
            occlusion += occluded;
        }
    }

    return 1.0 - (occlusion / float(numSamples));
}
