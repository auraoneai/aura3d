/**
 * volumetric.glsl - Volumetric Lighting and Fog
 *
 * Implements volumetric effects including:
 * - Ray marching through volume
 * - In-scattering and out-scattering
 * - Beer's law for absorption
 * - Froxel-based optimization
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef VOLUMETRIC_SAMPLES
#define VOLUMETRIC_SAMPLES 32
#endif

#ifndef VOLUMETRIC_MAX_DISTANCE
#define VOLUMETRIC_MAX_DISTANCE 100.0
#endif

#ifndef VOLUMETRIC_DENSITY
#define VOLUMETRIC_DENSITY 0.01
#endif

#ifndef VOLUMETRIC_SCATTERING
#define VOLUMETRIC_SCATTERING 0.1
#endif

#ifndef VOLUMETRIC_ABSORPTION
#define VOLUMETRIC_ABSORPTION 0.05
#endif

#ifndef FROXEL_DEPTH_SLICES
#define FROXEL_DEPTH_SLICES 64
#endif

// ============================================================================
// Scattering Phase Functions
// ============================================================================

/**
 * Isotropic phase function (uniform scattering)
 */
float phaseIsotropic() {
    return 1.0 / (4.0 * PI);
}

/**
 * Rayleigh phase function (atmospheric scattering)
 */
float phaseRayleigh(float cosTheta) {
    return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
}

/**
 * Henyey-Greenstein phase function
 * @param cosTheta Cosine of angle between light and view direction
 * @param g Anisotropy factor [-1, 1] (-1 = back scatter, 0 = isotropic, 1 = forward scatter)
 */
float phaseHenyeyGreenstein(float cosTheta, float g) {
    float g2 = g * g;
    float denom = 1.0 + g2 - 2.0 * g * cosTheta;
    return (1.0 - g2) / (4.0 * PI * pow(denom, 1.5));
}

/**
 * Schlick phase function (approximation of Henyey-Greenstein)
 */
float phaseSchlick(float cosTheta, float g) {
    float k = 1.55 * g - 0.55 * g * g * g;
    float denom = 1.0 - k * cosTheta;
    return (1.0 - k * k) / (4.0 * PI * denom * denom);
}

/**
 * Cornette-Shanks phase function (better fit for atmospheric scattering)
 */
float phaseCornetteShanks(float cosTheta, float g) {
    float g2 = g * g;
    float num = 3.0 * (1.0 - g2) * (1.0 + cosTheta * cosTheta);
    float denom = 8.0 * PI * (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
    return num / denom;
}

// ============================================================================
// Beer's Law (Transmittance)
// ============================================================================

/**
 * Beer-Lambert law for transmittance
 * @param density Medium density
 * @param distance Ray travel distance
 */
float beersLaw(float density, float distance) {
    return exp(-density * distance);
}

/**
 * Beer's law with wavelength-dependent absorption
 */
vec3 beersLawColor(vec3 absorption, float distance) {
    return exp(-absorption * distance);
}

/**
 * Powder effect for clouds (energy-conserving darkening)
 */
float powderEffect(float density, float cosTheta) {
    float powder = 1.0 - exp(-density * 2.0);
    return mix(1.0, powder, saturate(-cosTheta * 0.5 + 0.5));
}

// ============================================================================
// Ray Marching
// ============================================================================

/**
 * Basic volumetric ray marching
 * @param rayOrigin Ray origin in world space
 * @param rayDir Ray direction (normalized)
 * @param maxDistance Maximum march distance
 * @param density Volume density
 * @param scattering Scattering coefficient
 * @param absorption Absorption coefficient
 */
vec3 rayMarchVolume(vec3 rayOrigin, vec3 rayDir, float maxDistance,
                    float density, vec3 scattering, vec3 absorption) {
    float stepSize = maxDistance / float(VOLUMETRIC_SAMPLES);
    vec3 currentPos = rayOrigin;

    vec3 transmittance = vec3(1.0);
    vec3 scatteredLight = vec3(0.0);

    for (int i = 0; i < VOLUMETRIC_SAMPLES; i++) {
        currentPos += rayDir * stepSize;

        // Sample density at current position
        float sampleDensity = density; // Could be from 3D texture

        // Calculate extinction
        vec3 extinction = absorption + scattering;

        // Accumulate in-scattering
        vec3 inScatter = scattering * sampleDensity;
        scatteredLight += transmittance * inScatter * stepSize;

        // Update transmittance
        transmittance *= beersLawColor(extinction * sampleDensity, stepSize);

        // Early exit if transmittance is negligible
        if (luminance(transmittance) < EPSILON) {
            break;
        }
    }

    return scatteredLight;
}

/**
 * Volumetric lighting with directional light
 */
vec3 rayMarchVolumetricLight(vec3 rayOrigin, vec3 rayDir, float maxDistance,
                             vec3 lightDir, vec3 lightColor,
                             sampler2D shadowMap, mat4 shadowMatrix) {
    float stepSize = maxDistance / float(VOLUMETRIC_SAMPLES);
    vec3 currentPos = rayOrigin;

    vec3 transmittance = vec3(1.0);
    vec3 scatteredLight = vec3(0.0);

    float cosTheta = dot(rayDir, lightDir);
    float phase = phaseHenyeyGreenstein(cosTheta, 0.3);

    for (int i = 0; i < VOLUMETRIC_SAMPLES; i++) {
        currentPos += rayDir * stepSize;

        // Sample density
        float density = VOLUMETRIC_DENSITY;

        // Sample shadow map for light visibility
        vec4 shadowCoord = shadowMatrix * vec4(currentPos, 1.0);
        shadowCoord.xyz /= shadowCoord.w;
        shadowCoord.xy = shadowCoord.xy * 0.5 + 0.5;

        float visibility = 1.0;
        #ifdef VOLUMETRIC_USE_SHADOWS
            if (shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 &&
                shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0) {
                float shadowDepth = texture(shadowMap, shadowCoord.xy).r;
                visibility = shadowCoord.z <= shadowDepth ? 1.0 : 0.0;
            }
        #endif

        // In-scattering
        vec3 inScatter = lightColor * VOLUMETRIC_SCATTERING * density * phase * visibility;
        scatteredLight += transmittance * inScatter * stepSize;

        // Update transmittance
        float extinction = VOLUMETRIC_ABSORPTION + VOLUMETRIC_SCATTERING;
        transmittance *= exp(-extinction * density * stepSize);

        if (luminance(transmittance) < EPSILON) {
            break;
        }
    }

    return scatteredLight;
}

// ============================================================================
// Froxel-Based Volumetrics
// ============================================================================

/**
 * Calculate froxel depth (exponential distribution)
 */
float getFroxelDepth(int slice, float near, float far) {
    float t = float(slice) / float(FROXEL_DEPTH_SLICES);
    return near * pow(far / near, t);
}

/**
 * Get froxel slice from depth
 */
int getDepthSlice(float depth, float near, float far) {
    float t = log(depth / near) / log(far / near);
    return int(t * float(FROXEL_DEPTH_SLICES));
}

/**
 * Sample froxel volume
 * @param froxelTexture 3D texture containing pre-computed volumetric lighting
 * @param screenUV Screen UV coordinates
 * @param depth View space depth
 * @param near Near plane
 * @param far Far plane
 */
vec3 sampleFroxel(sampler3D froxelTexture, vec2 screenUV, float depth,
                  float near, float far) {
    int slice = getDepthSlice(depth, near, far);
    float w = (float(slice) + 0.5) / float(FROXEL_DEPTH_SLICES);

    return texture(froxelTexture, vec3(screenUV, w)).rgb;
}

/**
 * Inject lighting into froxel
 */
vec4 injectLightIntoFroxel(vec3 worldPos, vec3 lightDir, vec3 lightColor,
                           float density, float g) {
    vec3 scattering = vec3(VOLUMETRIC_SCATTERING);
    vec3 absorption = vec3(VOLUMETRIC_ABSORPTION);

    // Phase function for view direction (approximated)
    float phase = phaseHenyeyGreenstein(0.0, g);

    vec3 inscatter = lightColor * scattering * density * phase;
    float extinction = (VOLUMETRIC_SCATTERING + VOLUMETRIC_ABSORPTION) * density;

    return vec4(inscatter, extinction);
}

// ============================================================================
// Height Fog
// ============================================================================

/**
 * Calculate height-based fog density
 * @param worldPos World position
 * @param fogBase Base height of fog
 * @param fogHeight Height over which fog fades
 */
float getHeightFogDensity(vec3 worldPos, float fogBase, float fogHeight) {
    float heightFactor = saturate((worldPos.y - fogBase) / fogHeight);
    return exp(-heightFactor * 4.0);
}

/**
 * Apply height fog
 */
vec3 applyHeightFog(vec3 color, vec3 rayOrigin, vec3 rayDir, float rayLength,
                    vec3 fogColor, float fogDensity, float fogBase, float fogHeight) {
    vec3 rayEnd = rayOrigin + rayDir * rayLength;

    // Integrate fog along ray
    float avgHeight = (rayOrigin.y + rayEnd.y) * 0.5;
    float heightDensity = getHeightFogDensity(vec3(0.0, avgHeight, 0.0), fogBase, fogHeight);

    float totalDensity = fogDensity * heightDensity;
    float fogAmount = 1.0 - beersLaw(totalDensity, rayLength);

    return mix(color, fogColor, fogAmount);
}

// ============================================================================
// Participating Media
// ============================================================================

/**
 * Sample participating media (fog, smoke, clouds)
 * @param noiseTexture 3D noise texture for density
 * @param worldPos World position
 * @param time Animation time
 */
float sampleParticipatingMedia(sampler3D noiseTexture, vec3 worldPos, float time) {
    // Animate texture coordinates
    vec3 uvw = worldPos * 0.01 + vec3(time * 0.1, 0.0, time * 0.05);

    // Multi-octave sampling
    float density = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;

    for (int i = 0; i < 3; i++) {
        density += texture(noiseTexture, uvw * frequency).r * amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }

    return saturate(density);
}

/**
 * Detail erosion for clouds
 */
float erodeCloud(float baseDensity, sampler3D detailNoise, vec3 worldPos, float erosion) {
    float detail = texture(detailNoise, worldPos * 0.05).r;
    return saturate(remap(baseDensity, detail * erosion, 1.0, 0.0, 1.0));
}

// ============================================================================
// God Rays / Light Shafts
// ============================================================================

/**
 * Radial blur for god rays
 * @param sceneTexture Scene color texture
 * @param texCoord Screen UV
 * @param lightScreenPos Light position in screen space
 * @param numSamples Number of samples
 * @param density Effect density
 * @param weight Effect weight
 * @param decay Light decay factor
 */
vec3 calculateGodRays(sampler2D sceneTexture, vec2 texCoord, vec2 lightScreenPos,
                      int numSamples, float density, float weight, float decay) {
    vec2 deltaTexCoord = (texCoord - lightScreenPos) * density / float(numSamples);

    vec3 color = texture(sceneTexture, texCoord).rgb * 0.5;
    float illuminationDecay = 1.0;

    for (int i = 0; i < numSamples; i++) {
        texCoord -= deltaTexCoord;
        vec3 sample = texture(sceneTexture, texCoord).rgb;

        sample *= illuminationDecay * weight;
        color += sample;

        illuminationDecay *= decay;
    }

    return color;
}

// ============================================================================
// Volumetric Shadows
// ============================================================================

/**
 * Calculate transmittance through volume to light
 */
float calculateVolumetricShadow(vec3 worldPos, vec3 lightDir, float maxDistance,
                                sampler3D densityTexture) {
    float stepSize = maxDistance / 16.0; // Fewer samples for shadow
    vec3 currentPos = worldPos;
    float transmittance = 1.0;

    for (int i = 0; i < 16; i++) {
        currentPos += lightDir * stepSize;

        float density = texture(densityTexture, currentPos * 0.01).r;
        float extinction = (VOLUMETRIC_SCATTERING + VOLUMETRIC_ABSORPTION) * density;

        transmittance *= exp(-extinction * stepSize);

        if (transmittance < EPSILON) {
            break;
        }
    }

    return transmittance;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate aerial perspective (atmospheric scattering)
 */
vec3 calculateAerialPerspective(vec3 color, float distance, vec3 skyColor) {
    float fogAmount = 1.0 - exp(-distance * 0.0001);
    return mix(color, skyColor, fogAmount);
}

/**
 * Apply exponential fog
 */
vec3 applyExponentialFog(vec3 color, float distance, vec3 fogColor, float density) {
    float fogAmount = 1.0 - exp(-distance * density);
    return mix(color, fogColor, fogAmount);
}

/**
 * Apply exponential squared fog (more realistic falloff)
 */
vec3 applyExponentialSquaredFog(vec3 color, float distance, vec3 fogColor, float density) {
    float fogAmount = 1.0 - exp(-distance * distance * density * density);
    return mix(color, fogColor, fogAmount);
}

/**
 * Calculate volumetric lighting contribution
 */
vec3 calculateVolumetricContribution(vec3 rayOrigin, vec3 rayDir, float rayLength,
                                     vec3 lightDir, vec3 lightColor, float g) {
    float cosTheta = dot(rayDir, -lightDir);
    float phase = phaseHenyeyGreenstein(cosTheta, g);

    vec3 scattering = vec3(VOLUMETRIC_SCATTERING);
    vec3 absorption = vec3(VOLUMETRIC_ABSORPTION);

    return rayMarchVolume(rayOrigin, rayDir, rayLength, VOLUMETRIC_DENSITY,
                         scattering * lightColor * phase, absorption);
}
