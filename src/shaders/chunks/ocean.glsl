/**
 * ocean.glsl - Ocean and Water Rendering
 *
 * Provides ocean simulation and rendering:
 * - Gerstner waves
 * - FFT displacement (sampling)
 * - Foam generation
 * - Underwater fog
 * - Water caustics
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef OCEAN_WAVE_COUNT
#define OCEAN_WAVE_COUNT 4
#endif

#ifndef OCEAN_CHOPPINESS
#define OCEAN_CHOPPINESS 1.0
#endif

#ifndef OCEAN_FOAM_THRESHOLD
#define OCEAN_FOAM_THRESHOLD 0.5
#endif

// ============================================================================
// Gerstner Waves
// ============================================================================

/**
 * Single Gerstner wave
 * @param position World space position
 * @param direction Wave direction (normalized)
 * @param amplitude Wave height
 * @param wavelength Wave length
 * @param speed Wave speed
 * @param time Current time
 * @param steepness Wave steepness (0 = sinusoidal, 1 = sharp peaks)
 */
vec3 gerstnerWave(vec2 position, vec2 direction, float amplitude,
                  float wavelength, float speed, float time, float steepness) {
    float k = TWO_PI / wavelength;
    float c = sqrt(9.8 / k);
    vec2 d = normalize(direction);
    float f = k * (dot(d, position) - c * time * speed);
    float a = steepness / k;

    return vec3(
        d.x * a * cos(f),
        a * sin(f),
        d.y * a * cos(f)
    );
}

/**
 * Multiple Gerstner waves combined
 */
vec3 gerstnerWaves(vec2 position, float time, int waveCount) {
    vec3 totalDisplacement = vec3(0.0);

    // Define wave parameters (could be passed as arrays)
    vec2 directions[4] = vec2[](
        vec2(1.0, 0.0),
        vec2(0.6, 0.8),
        vec2(-0.8, 0.6),
        vec2(-0.2, -1.0)
    );

    float amplitudes[4] = float[](0.3, 0.2, 0.15, 0.1);
    float wavelengths[4] = float[](10.0, 7.0, 4.0, 2.0);
    float speeds[4] = float[](1.0, 1.2, 1.5, 2.0);
    float steepnesses[4] = float[](0.5, 0.6, 0.4, 0.3);

    for (int i = 0; i < waveCount && i < 4; i++) {
        totalDisplacement += gerstnerWave(
            position, directions[i], amplitudes[i],
            wavelengths[i], speeds[i], time, steepnesses[i]
        );
    }

    return totalDisplacement;
}

/**
 * Calculate Gerstner wave normal
 */
vec3 gerstnerWaveNormal(vec2 position, float time, int waveCount) {
    float delta = 0.1;

    vec3 pos0 = gerstnerWaves(position, time, waveCount);
    vec3 posX = gerstnerWaves(position + vec2(delta, 0.0), time, waveCount);
    vec3 posZ = gerstnerWaves(position + vec2(0.0, delta), time, waveCount);

    vec3 tangent = normalize(posX - pos0);
    vec3 bitangent = normalize(posZ - pos0);

    return normalize(cross(tangent, bitangent));
}

// ============================================================================
// FFT Displacement
// ============================================================================

/**
 * Sample FFT displacement texture
 * @param displacementMap RGB = xyz displacement
 */
vec3 sampleFFTDisplacement(sampler2D displacementMap, vec2 position, float scale) {
    vec2 uv = position * scale;
    return texture(displacementMap, uv).rgb;
}

/**
 * Sample FFT displacement with tiling
 */
vec3 sampleFFTDisplacementTiled(sampler2D displacementMap, vec2 position,
                                float scale, float tileSize) {
    vec2 uv = mod(position * scale, tileSize) / tileSize;
    return texture(displacementMap, uv).rgb;
}

/**
 * Calculate normal from heightmap
 */
vec3 calculateNormalFromHeightmap(sampler2D heightmap, vec2 position, float scale, float strength) {
    vec2 texelSize = 1.0 / vec2(textureSize(heightmap, 0));

    float h0 = texture(heightmap, position).r;
    float hX = texture(heightmap, position + vec2(texelSize.x, 0.0)).r;
    float hZ = texture(heightmap, position + vec2(0.0, texelSize.y)).r;

    vec3 tangent = normalize(vec3(scale, (hX - h0) * strength, 0.0));
    vec3 bitangent = normalize(vec3(0.0, (hZ - h0) * strength, scale));

    return normalize(cross(tangent, bitangent));
}

// ============================================================================
// Foam Generation
// ============================================================================

/**
 * Calculate foam based on wave peaks and velocity
 */
float calculateFoam(vec3 displacement, float jacobian, float time, vec2 worldPos) {
    // Foam appears at wave crests
    float crestFoam = saturate(displacement.y * 2.0 - OCEAN_FOAM_THRESHOLD);

    // Foam from wave breaking (jacobian < 0 means folding)
    float breakingFoam = saturate(-jacobian);

    // Animate foam
    float noise = hash(worldPos.x + worldPos.y + time * 0.1);
    float foam = max(crestFoam, breakingFoam) * noise;

    return saturate(foam);
}

/**
 * Foam texture sampling with scrolling
 */
float sampleFoamTexture(sampler2D foamTexture, vec2 worldPos, float time, float scale) {
    vec2 uv1 = worldPos * scale + time * vec2(0.05, 0.03);
    vec2 uv2 = worldPos * scale * 1.3 - time * vec2(0.03, 0.06);

    float foam1 = texture(foamTexture, uv1).r;
    float foam2 = texture(foamTexture, uv2).r;

    return (foam1 + foam2) * 0.5;
}

/**
 * Shore foam (near intersections)
 */
float calculateShoreFoam(float distanceToShore, float waveHeight, float time) {
    // More foam near shore
    float shoreFactor = 1.0 - saturate(distanceToShore / 5.0);

    // Animate
    float pulse = sin(time * 2.0 + distanceToShore) * 0.5 + 0.5;

    return shoreFactor * pulse * (1.0 + waveHeight);
}

// ============================================================================
// Water Surface BRDF
// ============================================================================

/**
 * Fresnel for water (n1=air, n2=water)
 */
float fresnelWater(float VdotN) {
    const float F0 = 0.02; // Water at normal incidence

    float fresnel = F0 + (1.0 - F0) * pow(1.0 - VdotN, 5.0);
    return fresnel;
}

/**
 * Water specular reflection
 */
vec3 waterSpecular(vec3 N, vec3 V, vec3 L, float roughness) {
    vec3 H = normalize(V + L);

    float NdotH = max(dot(N, H), 0.0);
    float NdotV = max(dot(N, V), EPSILON);
    float NdotL = max(dot(N, L), 0.0);

    // GGX distribution
    float D = D_GGX(NdotH, roughness);

    // Geometry term
    float G = G_SmithGGX(NdotV, NdotL, roughness);

    // Fresnel
    float F = fresnelWater(NdotV);

    return vec3(D * G * F / (4.0 * NdotV * NdotL));
}

// ============================================================================
// Underwater Effects
// ============================================================================

/**
 * Underwater fog/scattering
 */
vec3 underwaterFog(vec3 color, vec3 fogColor, float distance, float density) {
    float fogFactor = exp(-distance * density);
    return mix(fogColor, color, fogFactor);
}

/**
 * Underwater caustics (sampled from texture or procedural)
 */
float underwaterCaustics(vec3 worldPos, float time, vec2 lightDir) {
    // Simple animated caustics
    vec2 uv1 = worldPos.xz * 0.1 + time * 0.1 * lightDir;
    vec2 uv2 = worldPos.xz * 0.13 - time * 0.15 * lightDir;

    float caustic1 = hash(uv1.x + uv1.y);
    float caustic2 = hash(uv2.x + uv2.y);

    float caustics = (caustic1 + caustic2) * 0.5;

    // Sharpen
    caustics = pow(caustics, 3.0);

    return caustics;
}

/**
 * Sample caustics from texture
 */
float sampleCausticsTexture(sampler2D causticsTexture, vec3 worldPos, float time) {
    vec2 uv1 = worldPos.xz * 0.1 + time * vec2(0.05, 0.03);
    vec2 uv2 = worldPos.xz * 0.15 - time * vec2(0.03, 0.05);

    float caustic1 = texture(causticsTexture, uv1).r;
    float caustic2 = texture(causticsTexture, uv2).r;

    return max(caustic1, caustic2);
}

/**
 * God rays underwater
 */
float underwaterGodRays(vec3 worldPos, vec3 viewDir, vec3 lightDir, float time) {
    // Simple ray marching for god rays
    float rays = 0.0;
    float steps = 8.0;

    for (float i = 0.0; i < steps; i += 1.0) {
        float t = i / steps;
        vec3 samplePos = worldPos + viewDir * t * 10.0;

        float caustic = underwaterCaustics(samplePos, time, lightDir.xz);
        rays += caustic * (1.0 - t);
    }

    return rays / steps;
}

// ============================================================================
// Refraction
// ============================================================================

/**
 * Calculate refracted view direction
 */
vec3 refractWater(vec3 incident, vec3 normal) {
    const float eta = 1.0 / 1.333; // air to water
    return refract(incident, normal, eta);
}

/**
 * Chromatic dispersion for water
 */
vec3 refractWaterChromatic(vec3 incident, vec3 normal) {
    float etaR = 1.0 / 1.331;
    float etaG = 1.0 / 1.333;
    float etaB = 1.0 / 1.335;

    vec3 refractR = refract(incident, normal, etaR);
    vec3 refractG = refract(incident, normal, etaG);
    vec3 refractB = refract(incident, normal, etaB);

    return vec3(
        length(refractR) > 0.0 ? 1.0 : 0.0,
        length(refractG) > 0.0 ? 1.0 : 0.0,
        length(refractB) > 0.0 ? 1.0 : 0.0
    );
}

// ============================================================================
// Complete Ocean Shading
// ============================================================================

/**
 * Evaluate ocean surface shading
 */
vec3 evaluateOceanShading(vec3 N, vec3 V, vec3 L, vec3 skyColor, vec3 waterColor,
                          float roughness, float foam, vec3 foamColor) {
    float NdotV = abs(dot(N, V));
    float NdotL = max(dot(N, L), 0.0);

    // Fresnel
    float fresnel = fresnelWater(NdotV);

    // Specular reflection
    vec3 specular = waterSpecular(N, V, L, roughness);

    // Reflection
    vec3 R = reflect(-V, N);
    vec3 reflection = skyColor; // Should sample sky/environment

    // Refraction (simplified - should sample underwater scene)
    vec3 refraction = waterColor;

    // Combine
    vec3 water = mix(refraction, reflection, fresnel) + specular * NdotL;

    // Add foam
    water = mix(water, foamColor, foam);

    return water;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate wave height at position
 */
float getWaveHeight(vec2 position, float time, int waveCount) {
    return gerstnerWaves(position, time, waveCount).y;
}

/**
 * Detect wave peaks
 */
bool isWavePeak(vec3 displacement, float threshold) {
    return displacement.y > threshold;
}

/**
 * Calculate water depth color
 */
vec3 calculateDepthColor(vec3 shallowColor, vec3 deepColor, float depth, float maxDepth) {
    float t = saturate(depth / maxDepth);
    return mix(shallowColor, deepColor, t);
}

/**
 * Soft intersection with geometry (for shore foam)
 */
float softIntersection(float sceneDepth, float waterDepth, float softness) {
    float diff = sceneDepth - waterDepth;
    return saturate(diff / softness);
}
