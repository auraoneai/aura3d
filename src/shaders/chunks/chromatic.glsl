/**
 * chromatic.glsl - Chromatic Aberration
 *
 * Simulates lens chromatic aberration with:
 * - RGB channel separation
 * - Radial and lateral chromatic aberration
 * - Barrel/pincushion distortion
 * - Lens dispersion effects
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef CHROMATIC_ABERRATION_STRENGTH
#define CHROMATIC_ABERRATION_STRENGTH 0.01
#endif

#ifndef CHROMATIC_ABERRATION_SAMPLES
#define CHROMATIC_ABERRATION_SAMPLES 3
#endif

// ============================================================================
// Radial Chromatic Aberration
// ============================================================================

/**
 * Apply radial chromatic aberration
 * Separates RGB channels radially from screen center
 */
vec3 applyRadialChromaticAberration(sampler2D colorTexture, vec2 texCoord,
                                    vec2 center, float strength) {
    vec2 direction = texCoord - center;
    float distance = length(direction);
    vec2 normalized = direction / max(distance, EPSILON);

    // Sample each channel at different offsets
    float r = texture(colorTexture, texCoord - normalized * strength * distance).r;
    float g = texture(colorTexture, texCoord).g;
    float b = texture(colorTexture, texCoord + normalized * strength * distance).b;

    return vec3(r, g, b);
}

/**
 * Radial chromatic aberration with distance falloff
 */
vec3 applyRadialChromaticAberrationFalloff(sampler2D colorTexture, vec2 texCoord,
                                           vec2 center, float strength, float falloff) {
    vec2 direction = texCoord - center;
    float distance = length(direction);
    vec2 normalized = direction / max(distance, EPSILON);

    // Apply falloff (stronger at edges)
    float distanceFactor = pow(distance * 1.414, falloff); // 1.414 = sqrt(2) for corner normalization

    float offset = strength * distanceFactor;

    float r = texture(colorTexture, texCoord - normalized * offset).r;
    float g = texture(colorTexture, texCoord).g;
    float b = texture(colorTexture, texCoord + normalized * offset).b;

    return vec3(r, g, b);
}

// ============================================================================
// Lateral Chromatic Aberration
// ============================================================================

/**
 * Lateral chromatic aberration (perpendicular to radius)
 */
vec3 applyLateralChromaticAberration(sampler2D colorTexture, vec2 texCoord,
                                     vec2 center, float strength) {
    vec2 direction = texCoord - center;
    vec2 perpendicular = vec2(-direction.y, direction.x);
    float distance = length(direction);

    float offset = strength * distance;

    float r = texture(colorTexture, texCoord - perpendicular * offset).r;
    float g = texture(colorTexture, texCoord).g;
    float b = texture(colorTexture, texCoord + perpendicular * offset).b;

    return vec3(r, g, b);
}

// ============================================================================
// Spectral Dispersion
// ============================================================================

/**
 * Wavelength-based dispersion (rainbow effect)
 */
vec3 applySpectralDispersion(sampler2D colorTexture, vec2 texCoord,
                             vec2 center, float strength, int samples) {
    vec2 direction = texCoord - center;
    float distance = length(direction);
    vec2 normalized = direction / max(distance, EPSILON);

    vec3 color = vec3(0.0);

    // Sample multiple wavelengths
    for (int i = 0; i < samples; i++) {
        float t = float(i) / float(samples - 1);
        float wavelength = 380.0 + t * 400.0; // 380nm to 780nm (visible spectrum)

        // Wavelength-dependent offset (shorter wavelengths refract more)
        float refraction = strength * (1.0 - t * 0.5) * distance;
        vec2 offset = normalized * refraction;

        vec3 sample = texture(colorTexture, texCoord + offset).rgb;

        // Convert wavelength to RGB (simplified)
        vec3 wavelengthColor = wavelengthToRGB(wavelength);

        color += sample * wavelengthColor;
    }

    return color / float(samples);
}

/**
 * Convert wavelength to RGB (approximate)
 */
vec3 wavelengthToRGB(float wavelength) {
    vec3 rgb;

    if (wavelength >= 380.0 && wavelength < 440.0) {
        rgb.r = -(wavelength - 440.0) / (440.0 - 380.0);
        rgb.g = 0.0;
        rgb.b = 1.0;
    } else if (wavelength >= 440.0 && wavelength < 490.0) {
        rgb.r = 0.0;
        rgb.g = (wavelength - 440.0) / (490.0 - 440.0);
        rgb.b = 1.0;
    } else if (wavelength >= 490.0 && wavelength < 510.0) {
        rgb.r = 0.0;
        rgb.g = 1.0;
        rgb.b = -(wavelength - 510.0) / (510.0 - 490.0);
    } else if (wavelength >= 510.0 && wavelength < 580.0) {
        rgb.r = (wavelength - 510.0) / (580.0 - 510.0);
        rgb.g = 1.0;
        rgb.b = 0.0;
    } else if (wavelength >= 580.0 && wavelength < 645.0) {
        rgb.r = 1.0;
        rgb.g = -(wavelength - 645.0) / (645.0 - 580.0);
        rgb.b = 0.0;
    } else if (wavelength >= 645.0 && wavelength <= 780.0) {
        rgb.r = 1.0;
        rgb.g = 0.0;
        rgb.b = 0.0;
    } else {
        rgb = vec3(0.0);
    }

    // Intensity falloff at edges of visible spectrum
    float factor;
    if (wavelength >= 380.0 && wavelength < 420.0) {
        factor = 0.3 + 0.7 * (wavelength - 380.0) / (420.0 - 380.0);
    } else if (wavelength >= 420.0 && wavelength < 701.0) {
        factor = 1.0;
    } else if (wavelength >= 701.0 && wavelength <= 780.0) {
        factor = 0.3 + 0.7 * (780.0 - wavelength) / (780.0 - 701.0);
    } else {
        factor = 0.0;
    }

    return rgb * factor;
}

// ============================================================================
// Lens Distortion
// ============================================================================

/**
 * Barrel distortion
 */
vec2 applyBarrelDistortion(vec2 texCoord, vec2 center, float strength) {
    vec2 delta = texCoord - center;
    float distance = length(delta);
    float distortionFactor = 1.0 + strength * distance * distance;

    return center + delta * distortionFactor;
}

/**
 * Pincushion distortion
 */
vec2 applyPincushionDistortion(vec2 texCoord, vec2 center, float strength) {
    return applyBarrelDistortion(texCoord, center, -strength);
}

/**
 * Brown-Conrady distortion model (more realistic)
 */
vec2 applyBrownConradyDistortion(vec2 texCoord, vec2 center, float k1, float k2, float k3) {
    vec2 delta = texCoord - center;
    float r2 = dot(delta, delta);
    float r4 = r2 * r2;
    float r6 = r4 * r2;

    float radialDistortion = 1.0 + k1 * r2 + k2 * r4 + k3 * r6;

    return center + delta * radialDistortion;
}

// ============================================================================
// Combined Effects
// ============================================================================

/**
 * Chromatic aberration with barrel distortion
 */
vec3 applyChromaticWithDistortion(sampler2D colorTexture, vec2 texCoord,
                                  vec2 center, float chromaticStrength,
                                  float distortionStrength) {
    // Apply different distortion to each channel
    vec2 rCoord = applyBarrelDistortion(texCoord, center, distortionStrength * 1.02);
    vec2 gCoord = applyBarrelDistortion(texCoord, center, distortionStrength);
    vec2 bCoord = applyBarrelDistortion(texCoord, center, distortionStrength * 0.98);

    // Apply chromatic aberration
    vec2 direction = texCoord - center;
    float distance = length(direction);
    vec2 normalized = direction / max(distance, EPSILON);

    float offset = chromaticStrength * distance;

    float r = texture(colorTexture, rCoord - normalized * offset).r;
    float g = texture(colorTexture, gCoord).g;
    float b = texture(colorTexture, bCoord + normalized * offset).b;

    return vec3(r, g, b);
}

/**
 * Anamorphic chromatic aberration (horizontal only)
 */
vec3 applyAnamorphicChromaticAberration(sampler2D colorTexture, vec2 texCoord,
                                        vec2 center, float strength) {
    vec2 direction = texCoord - center;
    float distance = abs(direction.x);

    float offset = strength * distance;

    float r = texture(colorTexture, texCoord - vec2(offset, 0.0)).r;
    float g = texture(colorTexture, texCoord).g;
    float b = texture(colorTexture, texCoord + vec2(offset, 0.0)).b;

    return vec3(r, g, b);
}

// ============================================================================
// High Quality Sampling
// ============================================================================

/**
 * Multi-sample chromatic aberration for smoother results
 */
vec3 applyMultisampleChromaticAberration(sampler2D colorTexture, vec2 texCoord,
                                         vec2 center, float strength, int samples) {
    vec2 direction = texCoord - center;
    float distance = length(direction);
    vec2 normalized = direction / max(distance, EPSILON);

    vec3 color = vec3(0.0);

    for (int i = 0; i < samples; i++) {
        float t = float(i) / float(samples - 1);

        // Interpolate offset for each channel
        float rOffset = -strength * distance * (1.0 + t * 0.2);
        float gOffset = 0.0;
        float bOffset = strength * distance * (1.0 + t * 0.2);

        float r = texture(colorTexture, texCoord + normalized * rOffset).r;
        float g = texture(colorTexture, texCoord + normalized * gOffset).g;
        float b = texture(colorTexture, texCoord + normalized * bOffset).b;

        color += vec3(r, g, b);
    }

    return color / float(samples);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate adaptive chromatic aberration based on brightness
 */
float calculateAdaptiveChromaticStrength(vec3 color, float baseStrength) {
    float brightness = luminance(color);
    // Stronger effect on bright areas (like light sources)
    return baseStrength * (1.0 + brightness * 2.0);
}

/**
 * Screen edge vignette for chromatic aberration
 */
float calculateChromaticVignette(vec2 texCoord, vec2 center) {
    float distance = length(texCoord - center);
    return smoothstep(0.0, 0.7, distance);
}

/**
 * Apply chromatic aberration only to edges
 */
vec3 applyEdgeChromaticAberration(sampler2D colorTexture, vec2 texCoord,
                                  vec2 center, float strength) {
    float vignette = calculateChromaticVignette(texCoord, center);

    if (vignette < 0.01) {
        return texture(colorTexture, texCoord).rgb;
    }

    return applyRadialChromaticAberration(colorTexture, texCoord, center, strength * vignette);
}

/**
 * Debug visualize chromatic offset
 */
vec3 debugVisualizeChromaticOffset(vec2 texCoord, vec2 center, float strength) {
    vec2 direction = texCoord - center;
    float distance = length(direction);
    float offset = strength * distance;

    return vec3(offset * 100.0, 0.0, 0.0);
}
