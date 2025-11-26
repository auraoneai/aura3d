/**
 * film_grain.glsl - Film Grain and Noise Effects
 *
 * Simulates analog film grain with:
 * - Animated noise patterns
 * - Luminance-based intensity
 * - Various grain types (fine, coarse, organic)
 * - Color and monochrome grain
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef FILM_GRAIN_INTENSITY
#define FILM_GRAIN_INTENSITY 0.05
#endif

#ifndef FILM_GRAIN_SIZE
#define FILM_GRAIN_SIZE 1.0
#endif

// ============================================================================
// Noise Functions
// ============================================================================

/**
 * Generate pseudo-random noise
 */
float randomNoise(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

/**
 * Animated noise (changes per frame)
 */
float animatedNoise(vec2 uv, float time) {
    vec2 p = uv + time * 0.1;
    return randomNoise(p);
}

/**
 * Smooth noise (interpolated)
 */
float smoothNoise(vec2 uv) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);

    // Four corners
    float a = randomNoise(i);
    float b = randomNoise(i + vec2(1.0, 0.0));
    float c = randomNoise(i + vec2(0.0, 1.0));
    float d = randomNoise(i + vec2(1.0, 1.0));

    // Smooth interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * Fractal noise (multi-octave)
 */
float fractalNoise(vec2 uv, int octaves) {
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;

    for (int i = 0; i < octaves; i++) {
        value += smoothNoise(uv * frequency) * amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }

    return value;
}

/**
 * Perlin-like noise
 */
float perlinNoise(vec2 uv) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);

    vec2 u = f * f * (3.0 - 2.0 * f);

    float n00 = randomNoise(i + vec2(0.0, 0.0));
    float n10 = randomNoise(i + vec2(1.0, 0.0));
    float n01 = randomNoise(i + vec2(0.0, 1.0));
    float n11 = randomNoise(i + vec2(1.0, 1.0));

    return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

// ============================================================================
// Film Grain Types
// ============================================================================

/**
 * Fine grain (high frequency)
 */
float fineGrain(vec2 uv, float time) {
    vec2 scaledUV = uv * 1000.0 * FILM_GRAIN_SIZE;
    return animatedNoise(scaledUV, time);
}

/**
 * Coarse grain (low frequency)
 */
float coarseGrain(vec2 uv, float time) {
    vec2 scaledUV = uv * 200.0 * FILM_GRAIN_SIZE;
    return smoothNoise(scaledUV + time);
}

/**
 * Organic grain (multi-octave)
 */
float organicGrain(vec2 uv, float time) {
    vec2 scaledUV = uv * 500.0 * FILM_GRAIN_SIZE;
    return fractalNoise(scaledUV + time * 0.1, 3);
}

/**
 * Photographic grain (mixed frequencies)
 */
float photographicGrain(vec2 uv, float time) {
    float fine = fineGrain(uv, time);
    float coarse = coarseGrain(uv, time);

    return mix(fine, coarse, 0.3);
}

// ============================================================================
// Grain Application
// ============================================================================

/**
 * Apply monochrome grain
 */
vec3 applyMonochromeGrain(vec3 color, vec2 uv, float time, float intensity) {
    float grain = fineGrain(uv, time);

    // Center noise around 0.5
    grain = (grain - 0.5) * intensity;

    return saturate(color + grain);
}

/**
 * Apply luminance-based grain (stronger in midtones)
 */
vec3 applyLuminanceGrain(vec3 color, vec2 uv, float time, float intensity) {
    float luma = luminance(color);

    // Grain is stronger in midtones (typical of film)
    float lumaMask = 1.0 - abs(luma * 2.0 - 1.0);
    lumaMask = lumaMask * lumaMask;

    float grain = fineGrain(uv, time);
    grain = (grain - 0.5) * intensity * lumaMask;

    return saturate(color + grain);
}

/**
 * Apply color grain (separate noise per channel)
 */
vec3 applyColorGrain(vec3 color, vec2 uv, float time, float intensity) {
    float grainR = animatedNoise(uv * 1000.0 * FILM_GRAIN_SIZE + vec2(0.0, time), time);
    float grainG = animatedNoise(uv * 1000.0 * FILM_GRAIN_SIZE + vec2(1.0, time), time);
    float grainB = animatedNoise(uv * 1000.0 * FILM_GRAIN_SIZE + vec2(2.0, time), time);

    vec3 grain = vec3(grainR, grainG, grainB) - 0.5;

    return saturate(color + grain * intensity);
}

/**
 * Apply photographic film grain
 */
vec3 applyPhotographicGrain(vec3 color, vec2 uv, float time, float intensity) {
    float luma = luminance(color);

    // Luminance-based grain intensity
    float lumaMask = 1.0 - smoothstep(0.2, 0.8, luma);

    float grain = photographicGrain(uv, time);
    grain = (grain - 0.5) * intensity * (1.0 + lumaMask);

    return saturate(color + grain);
}

// ============================================================================
// Advanced Grain Effects
// ============================================================================

/**
 * Apply ISO-based grain (higher ISO = more grain)
 */
vec3 applyISOGrain(vec3 color, vec2 uv, float time, float iso) {
    // ISO affects grain intensity and size
    float intensity = (iso / 100.0) * 0.02;
    float size = 1.0 / (iso / 400.0);

    vec2 scaledUV = uv * 800.0 * size;
    float grain = animatedNoise(scaledUV, time);

    float luma = luminance(color);
    float lumaMask = 1.0 - abs(luma * 2.0 - 1.0);

    grain = (grain - 0.5) * intensity * lumaMask;

    return saturate(color + grain);
}

/**
 * Apply shadow grain (more grain in dark areas)
 */
vec3 applyShadowGrain(vec3 color, vec2 uv, float time, float intensity) {
    float luma = luminance(color);

    // More grain in shadows
    float shadowMask = 1.0 - smoothstep(0.0, 0.3, luma);

    float grain = fineGrain(uv, time);
    grain = (grain - 0.5) * intensity * shadowMask * 2.0;

    return saturate(color + grain);
}

/**
 * Apply highlight grain (more grain in bright areas)
 */
vec3 applyHighlightGrain(vec3 color, vec2 uv, float time, float intensity) {
    float luma = luminance(color);

    // More grain in highlights
    float highlightMask = smoothstep(0.7, 1.0, luma);

    float grain = fineGrain(uv, time);
    grain = (grain - 0.5) * intensity * highlightMask;

    return saturate(color + grain);
}

// ============================================================================
// Halftone and Dithering
// ============================================================================

/**
 * Apply halftone pattern
 */
float halftonePattern(vec2 uv, float dotSize, float angle) {
    // Rotate UV
    float s = sin(angle);
    float c = cos(angle);
    mat2 rot = mat2(c, -s, s, c);
    vec2 rotUV = rot * uv;

    // Create dot pattern
    vec2 cell = fract(rotUV * dotSize);
    float dist = length(cell - 0.5);

    return smoothstep(0.4, 0.5, dist);
}

/**
 * Apply dithering (ordered dither)
 */
float orderedDither4x4(vec2 uv) {
    const float dither[16] = float[](
        0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
        12.0/16.0, 4.0/16.0, 14.0/16.0, 6.0/16.0,
        3.0/16.0, 11.0/16.0, 1.0/16.0,  9.0/16.0,
        15.0/16.0, 7.0/16.0, 13.0/16.0, 5.0/16.0
    );

    ivec2 pixel = ivec2(mod(uv * vec2(textureSize(uv, 0)), 4.0));
    int index = pixel.y * 4 + pixel.x;

    return dither[index];
}

/**
 * Apply blue noise dithering (if blue noise texture available)
 */
vec3 applyBlueNoiseDither(vec3 color, sampler2D blueNoise, vec2 uv, float intensity) {
    vec2 noiseUV = mod(uv * vec2(textureSize(blueNoise, 0)), 1.0);
    float noise = texture(blueNoise, noiseUV).r;

    vec3 dither = vec3(noise - 0.5) * intensity;

    return saturate(color + dither);
}

// ============================================================================
// Scratch and Damage Effects
// ============================================================================

/**
 * Add film scratches
 */
vec3 addFilmScratches(vec3 color, vec2 uv, float time, float intensity) {
    // Vertical scratches
    float scratch = 0.0;

    for (int i = 0; i < 3; i++) {
        float offset = hash(float(i) + floor(time * 4.0)) * 2.0 - 1.0;
        float x = uv.x + offset;
        float scratchWidth = 0.001 * FILM_GRAIN_SIZE;

        if (abs(fract(x * 100.0) - 0.5) < scratchWidth) {
            scratch = 1.0;
        }
    }

    return mix(color, vec3(1.0), scratch * intensity);
}

/**
 * Add dust particles
 */
vec3 addDustParticles(vec3 color, vec2 uv, float time, float intensity) {
    vec2 particleUV = uv * 50.0 + time * 0.1;

    float dust = 0.0;

    for (int i = 0; i < 10; i++) {
        vec2 particlePos = hash2(vec2(float(i), floor(time * 2.0)));
        float dist = length((uv - particlePos) * vec2(1.0, 1.77)); // Aspect ratio adjustment

        if (dist < 0.002) {
            dust = 1.0 - smoothstep(0.0, 0.002, dist);
        }
    }

    return mix(color, vec3(0.0), dust * intensity);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate grain intensity based on scene brightness
 */
float calculateAdaptiveGrainIntensity(vec3 color, float baseIntensity) {
    float luma = luminance(color);

    // More grain in midtones
    float adaptiveFactor = 1.0 - abs(luma * 2.0 - 1.0);

    return baseIntensity * (1.0 + adaptiveFactor);
}

/**
 * Temporal grain stability (reduce flickering)
 */
float stableGrain(vec2 uv, float time, float stability) {
    float stable = fineGrain(uv, floor(time * stability) / stability);
    float animated = fineGrain(uv, time);

    return mix(animated, stable, stability);
}

/**
 * Apply film grain with all features
 */
vec3 applyFilmGrain(vec3 color, vec2 uv, float time, float intensity,
                    bool colorGrain, bool luminanceBased) {
    if (colorGrain) {
        return applyColorGrain(color, uv, time, intensity);
    } else if (luminanceBased) {
        return applyLuminanceGrain(color, uv, time, intensity);
    } else {
        return applyMonochromeGrain(color, uv, time, intensity);
    }
}
