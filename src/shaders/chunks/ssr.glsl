/**
 * ssr.glsl - Screen Space Reflections
 *
 * Implements high-quality screen-space reflections with:
 * - Adaptive ray marching
 * - Roughness-based blur
 * - Temporal reprojection
 * - Importance sampling for rough surfaces
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef SSR_MAX_RAY_STEPS
#define SSR_MAX_RAY_STEPS 32
#endif

#ifndef SSR_BINARY_SEARCH_STEPS
#define SSR_BINARY_SEARCH_STEPS 8
#endif

#ifndef SSR_MAX_RAY_DISTANCE
#define SSR_MAX_RAY_DISTANCE 10.0
#endif

#ifndef SSR_THICKNESS
#define SSR_THICKNESS 0.1
#endif

#ifndef SSR_ROUGHNESS_SAMPLES
#define SSR_ROUGHNESS_SAMPLES 4
#endif

#ifndef SSR_FADE_START
#define SSR_FADE_START 0.7
#endif

#ifndef SSR_FADE_END
#define SSR_FADE_END 1.0
#endif

// ============================================================================
// Ray Marching
// ============================================================================

/**
 * Screen-space ray tracing for reflections
 * @param origin Ray origin in view space
 * @param direction Ray direction in view space (should be reflection vector)
 * @param depthBuffer Scene depth buffer
 * @param projection Projection matrix
 * @return Hit result: xy = UV, z = confidence, w = success
 */
vec4 traceSSR(vec3 origin, vec3 direction, sampler2D depthBuffer, mat4 projection) {
    vec3 rayEnd = origin + direction * SSR_MAX_RAY_DISTANCE;

    // Project start and end to screen space
    vec4 startFrag = projection * vec4(origin, 1.0);
    startFrag.xyz /= startFrag.w;
    startFrag.xy = startFrag.xy * 0.5 + 0.5;

    vec4 endFrag = projection * vec4(rayEnd, 1.0);
    endFrag.xyz /= endFrag.w;
    endFrag.xy = endFrag.xy * 0.5 + 0.5;

    // Calculate screen space deltas
    vec2 screenDelta = endFrag.xy - startFrag.xy;
    float depthDelta = endFrag.z - startFrag.z;

    // Determine primary step direction
    float useX = abs(screenDelta.x) >= abs(screenDelta.y) ? 1.0 : 0.0;
    float delta = mix(abs(screenDelta.y), abs(screenDelta.x), useX) * float(SSR_MAX_RAY_STEPS);

    vec2 screenIncrement = screenDelta / max(delta, 0.001);
    float depthIncrement = depthDelta / max(delta, 0.001);

    // Ray march
    vec2 screenPos = startFrag.xy;
    float rayDepth = startFrag.z;
    float stepSize = 1.0;

    for (int i = 0; i < SSR_MAX_RAY_STEPS; i++) {
        screenPos += screenIncrement * stepSize;
        rayDepth += depthIncrement * stepSize;

        // Check bounds
        if (screenPos.x < 0.0 || screenPos.x > 1.0 ||
            screenPos.y < 0.0 || screenPos.y > 1.0 ||
            rayDepth < 0.0 || rayDepth > 1.0) {
            return vec4(0.0);
        }

        float sceneDepth = texture(depthBuffer, screenPos).r;
        float depthDiff = rayDepth - sceneDepth;

        // Check for intersection
        if (depthDiff > 0.0 && depthDiff < SSR_THICKNESS) {
            // Binary search refinement
            vec2 refinedPos = screenPos;
            float refinedDepth = rayDepth;
            vec2 step = screenIncrement * stepSize;
            float depthStep = depthIncrement * stepSize;

            for (int j = 0; j < SSR_BINARY_SEARCH_STEPS; j++) {
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

            // Calculate confidence based on screen edge distance
            vec2 edgeDist = vec2(
                min(refinedPos.x, 1.0 - refinedPos.x),
                min(refinedPos.y, 1.0 - refinedPos.y)
            );
            float minEdgeDist = min(edgeDist.x, edgeDist.y);
            float edgeFade = smoothstep(0.0, 0.2, minEdgeDist);

            // Depth fade
            float depthFade = 1.0 - smoothstep(SSR_FADE_START, SSR_FADE_END, rayDepth);

            float confidence = edgeFade * depthFade;

            return vec4(refinedPos, confidence, 1.0);
        }

        // Adaptive step size (accelerate when far from surface)
        stepSize = 1.0 + float(i) * 0.1;
    }

    return vec4(0.0);
}

/**
 * Hierarchical Z-buffer ray marching (more efficient)
 */
#ifdef SSR_USE_HIZ
vec4 traceSSRHiZ(vec3 origin, vec3 direction, sampler2D hiZBuffer,
                 mat4 projection, int maxMipLevel) {
    vec3 rayEnd = origin + direction * SSR_MAX_RAY_DISTANCE;

    vec4 startFrag = projection * vec4(origin, 1.0);
    startFrag.xyz /= startFrag.w;
    startFrag.xy = startFrag.xy * 0.5 + 0.5;

    vec4 endFrag = projection * vec4(rayEnd, 1.0);
    endFrag.xyz /= endFrag.w;
    endFrag.xy = endFrag.xy * 0.5 + 0.5;

    vec2 screenDelta = endFrag.xy - startFrag.xy;
    float depthDelta = endFrag.z - startFrag.z;

    float maxDistance = max(abs(screenDelta.x), abs(screenDelta.y));
    vec2 screenIncrement = screenDelta / (maxDistance * float(SSR_MAX_RAY_STEPS));
    float depthIncrement = depthDelta / (maxDistance * float(SSR_MAX_RAY_STEPS));

    vec2 screenPos = startFrag.xy;
    float rayDepth = startFrag.z;
    int currentLevel = maxMipLevel;

    for (int i = 0; i < SSR_MAX_RAY_STEPS; i++) {
        float levelScale = exp2(float(currentLevel));
        vec2 step = screenIncrement * levelScale;

        screenPos += step;
        rayDepth += depthIncrement * levelScale;

        if (screenPos.x < 0.0 || screenPos.x > 1.0 ||
            screenPos.y < 0.0 || screenPos.y > 1.0) {
            break;
        }

        float sceneDepth = textureLod(hiZBuffer, screenPos, float(currentLevel)).r;
        float depthDiff = rayDepth - sceneDepth;

        if (depthDiff > 0.0 && currentLevel == 0) {
            vec2 edgeDist = vec2(
                min(screenPos.x, 1.0 - screenPos.x),
                min(screenPos.y, 1.0 - screenPos.y)
            );
            float confidence = smoothstep(0.0, 0.2, min(edgeDist.x, edgeDist.y));
            return vec4(screenPos, confidence, 1.0);
        } else if (depthDiff > 0.0) {
            screenPos -= step;
            rayDepth -= depthIncrement * levelScale;
            currentLevel = max(0, currentLevel - 1);
        }
    }

    return vec4(0.0);
}
#endif

// ============================================================================
// Importance Sampling for Rough Surfaces
// ============================================================================

/**
 * Sample reflection direction for rough surfaces
 */
vec3 importanceSampleGGX(vec2 u, vec3 N, vec3 V, float roughness) {
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;

    float phi = TWO_PI * u.x;
    float cosTheta = sqrt((1.0 - u.y) / (1.0 + (alpha2 - 1.0) * u.y));
    float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    // Spherical to Cartesian (in tangent space)
    vec3 H;
    H.x = cos(phi) * sinTheta;
    H.y = sin(phi) * sinTheta;
    H.z = cosTheta;

    // Tangent to world space
    vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, N));
    vec3 bitangent = cross(N, tangent);

    vec3 halfVec = tangent * H.x + bitangent * H.y + N * H.z;
    return reflect(-V, halfVec);
}

/**
 * Trace SSR with importance sampling for roughness
 */
vec3 traceSSRRough(vec3 position, vec3 normal, vec3 viewDir,
                   float roughness, sampler2D depthBuffer,
                   sampler2D colorBuffer, mat4 projection, uint frame) {
    if (roughness < 0.01) {
        // Perfect mirror reflection
        vec3 reflectDir = reflect(-viewDir, normal);
        vec4 hit = traceSSR(position, reflectDir, depthBuffer, projection);

        if (hit.w > 0.5) {
            return texture(colorBuffer, hit.xy).rgb * hit.z;
        }
        return vec3(0.0);
    }

    // Multiple samples for rough reflections
    vec3 reflection = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < SSR_ROUGHNESS_SAMPLES; i++) {
        vec2 u = hash2(vec2(float(i) + float(frame), position.x + position.y));
        vec3 sampleDir = importanceSampleGGX(u, normal, viewDir, roughness);

        vec4 hit = traceSSR(position, sampleDir, depthBuffer, projection);

        if (hit.w > 0.5) {
            vec3 hitColor = texture(colorBuffer, hit.xy).rgb;
            float weight = hit.z;
            reflection += hitColor * weight;
            totalWeight += weight;
        }
    }

    return totalWeight > EPSILON ? reflection / totalWeight : vec3(0.0);
}

// ============================================================================
// Temporal Reprojection
// ============================================================================

/**
 * Reproject screen position to previous frame
 */
vec2 reprojectPosition(vec3 worldPos, mat4 prevViewProjection) {
    vec4 prevClipPos = prevViewProjection * vec4(worldPos, 1.0);
    prevClipPos.xyz /= prevClipPos.w;
    return prevClipPos.xy * 0.5 + 0.5;
}

/**
 * Temporal accumulation for SSR
 */
vec3 temporalAccumulateSSR(vec3 currentReflection, vec3 historyReflection,
                          vec2 velocity, float roughness) {
    // Higher blend factor for rougher surfaces (more samples needed)
    float blendFactor = mix(0.05, 0.2, roughness);
    return mix(historyReflection, currentReflection, blendFactor);
}

/**
 * Full temporal reprojection with neighborhood clamping
 */
vec3 temporalReprojectSSR(sampler2D currentSSR, sampler2D historySSR,
                         sampler2D velocityBuffer, vec2 texCoord) {
    vec2 velocity = texture(velocityBuffer, texCoord).xy;
    vec2 historyCoord = texCoord - velocity;

    // Validate history coordinate
    if (historyCoord.x < 0.0 || historyCoord.x > 1.0 ||
        historyCoord.y < 0.0 || historyCoord.y > 1.0) {
        return texture(currentSSR, texCoord).rgb;
    }

    vec3 current = texture(currentSSR, texCoord).rgb;
    vec3 history = texture(historySSR, historyCoord).rgb;

    // Neighborhood clamping
    vec2 texelSize = 1.0 / vec2(textureSize(currentSSR, 0));
    vec3 minColor = vec3(FLT_MAX);
    vec3 maxColor = vec3(-FLT_MAX);
    vec3 moment1 = vec3(0.0);
    vec3 moment2 = vec3(0.0);

    const int radius = 1;
    float sampleCount = 0.0;

    for (int x = -radius; x <= radius; x++) {
        for (int y = -radius; y <= radius; y++) {
            vec2 sampleCoord = texCoord + vec2(x, y) * texelSize;
            vec3 neighbor = texture(currentSSR, sampleCoord).rgb;

            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
            moment1 += neighbor;
            moment2 += neighbor * neighbor;
            sampleCount += 1.0;
        }
    }

    // Variance clipping
    moment1 /= sampleCount;
    moment2 /= sampleCount;

    vec3 variance = moment2 - moment1 * moment1;
    vec3 sigma = sqrt(max(variance, vec3(0.0)));

    vec3 colorMin = moment1 - sigma * 1.5;
    vec3 colorMax = moment1 + sigma * 1.5;

    history = clamp(history, colorMin, colorMax);

    // Blend
    float blendFactor = 0.1;
    return mix(history, current, blendFactor);
}

// ============================================================================
// Roughness Blur
// ============================================================================

/**
 * Blur SSR based on roughness
 * @param ssrBuffer SSR buffer to blur
 * @param roughnessBuffer Surface roughness
 * @param texCoord Current texel coordinate
 */
vec3 blurSSRByRoughness(sampler2D ssrBuffer, sampler2D roughnessBuffer, vec2 texCoord) {
    float roughness = texture(roughnessBuffer, texCoord).r;

    if (roughness < 0.01) {
        return texture(ssrBuffer, texCoord).rgb;
    }

    vec2 texelSize = 1.0 / vec2(textureSize(ssrBuffer, 0));
    float blurRadius = roughness * 8.0; // Scale blur with roughness

    vec3 blurred = vec3(0.0);
    float totalWeight = 0.0;

    for (float x = -blurRadius; x <= blurRadius; x += 1.0) {
        for (float y = -blurRadius; y <= blurRadius; y += 1.0) {
            vec2 offset = vec2(x, y) * texelSize;
            vec2 sampleCoord = texCoord + offset;

            float dist = length(vec2(x, y));
            float weight = exp(-dist * dist / (2.0 * blurRadius * blurRadius));

            blurred += texture(ssrBuffer, sampleCoord).rgb * weight;
            totalWeight += weight;
        }
    }

    return blurred / totalWeight;
}

/**
 * Cone-traced blur for varying roughness
 */
vec3 coneTraceBlurSSR(sampler2D ssrBuffer, vec2 texCoord,
                      vec2 reflectionDir, float roughness, int numSamples) {
    vec2 texelSize = 1.0 / vec2(textureSize(ssrBuffer, 0));
    float coneAngle = roughness * PI * 0.5;

    vec3 blurred = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < numSamples; i++) {
        float t = float(i) / float(numSamples - 1);
        float radius = t * tan(coneAngle);

        vec2 offset = reflectionDir * t * 0.1; // Scale factor
        vec2 perpendicular = vec2(-reflectionDir.y, reflectionDir.x);

        for (int j = 0; j < 8; j++) {
            float angle = float(j) / 8.0 * TWO_PI;
            vec2 sampleOffset = offset + perpendicular * radius * vec2(cos(angle), sin(angle));
            vec2 sampleCoord = texCoord + sampleOffset * texelSize;

            vec3 sample = texture(ssrBuffer, sampleCoord).rgb;
            float weight = 1.0 - t * 0.5;

            blurred += sample * weight;
            totalWeight += weight;
        }
    }

    return blurred / totalWeight;
}

// ============================================================================
// Contact Hardening
// ============================================================================

/**
 * Apply contact hardening to reflections (sharper near contact points)
 */
float calculateContactHardening(vec3 hitPos, vec3 surfacePos, float baseRoughness) {
    float distance = length(hitPos - surfacePos);
    float hardening = exp(-distance * 2.0);
    return mix(baseRoughness, baseRoughness * 0.5, hardening);
}

// ============================================================================
// Falloff and Masking
// ============================================================================

/**
 * Calculate SSR contribution mask based on various factors
 */
float calculateSSRMask(vec3 normal, vec3 viewDir, float roughness, vec2 screenPos) {
    // Fresnel-based contribution
    float NdotV = abs(dot(normal, viewDir));
    float fresnel = pow(1.0 - NdotV, 5.0);

    // Roughness falloff
    float roughnessMask = 1.0 - smoothstep(0.6, 1.0, roughness);

    // Screen edge falloff
    vec2 edgeDist = vec2(
        min(screenPos.x, 1.0 - screenPos.x),
        min(screenPos.y, 1.0 - screenPos.y)
    );
    float edgeMask = smoothstep(0.0, 0.1, min(edgeDist.x, edgeDist.y));

    return fresnel * roughnessMask * edgeMask;
}

/**
 * Calculate fade based on ray march distance
 */
float calculateDistanceFade(float rayDistance, float maxDistance) {
    return 1.0 - smoothstep(maxDistance * SSR_FADE_START, maxDistance * SSR_FADE_END, rayDistance);
}
