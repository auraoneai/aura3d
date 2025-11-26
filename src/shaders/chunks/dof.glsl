/**
 * dof.glsl - Depth of Field
 *
 * Implements cinematic depth of field with:
 * - Circle of Confusion calculation
 * - Bokeh shape simulation
 * - Near/far field separation
 * - Gather-based blur
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef DOF_APERTURE
#define DOF_APERTURE 5.6  // f-stop
#endif

#ifndef DOF_FOCAL_LENGTH
#define DOF_FOCAL_LENGTH 50.0  // mm
#endif

#ifndef DOF_FOCUS_DISTANCE
#define DOF_FOCUS_DISTANCE 10.0  // meters
#endif

#ifndef DOF_BOKEH_SAMPLES
#define DOF_BOKEH_SAMPLES 32
#endif

#ifndef DOF_MAX_COC_RADIUS
#define DOF_MAX_COC_RADIUS 20.0  // pixels
#endif

// ============================================================================
// Circle of Confusion (CoC) Calculation
// ============================================================================

/**
 * Calculate Circle of Confusion diameter
 * @param depth Scene depth (linear)
 * @param focusDistance Focus plane distance
 * @param focalLength Lens focal length (mm)
 * @param aperture f-stop number
 * @param filmSize Sensor/film size (mm)
 */
float calculateCoC(float depth, float focusDistance, float focalLength, float aperture, float filmSize) {
    // Calculate CoC using thin lens equation
    float focalDepth = (focalLength * focusDistance) / (focusDistance - focalLength);
    float coc = (focalLength * focalLength * (depth - focusDistance)) /
                (aperture * focusDistance * (depth - focalLength));

    // Normalize to screen space
    return abs(coc) * (filmSize / depth);
}

/**
 * Simplified CoC calculation
 */
float calculateCoCSimple(float depth, float focusDistance, float focalLength, float aperture) {
    float coc = (focalLength / aperture) * abs(depth - focusDistance) / depth;
    return min(coc * 100.0, DOF_MAX_COC_RADIUS); // Scale and clamp
}

/**
 * Physical CoC with aperture blades
 */
float calculatePhysicalCoC(float depth, float focusDistance, float focalLength, float aperture) {
    if (abs(depth - focusDistance) < 0.01) {
        return 0.0;
    }

    float coc = abs((aperture * focalLength * (focusDistance - depth)) /
                    (depth * (focusDistance - focalLength)));

    return min(coc, DOF_MAX_COC_RADIUS);
}

// ============================================================================
// Bokeh Patterns
// ============================================================================

/**
 * Generate disc bokeh pattern
 */
vec2 getBokehDiscSample(int index, int numSamples) {
    float angle = float(index) * (TWO_PI / float(numSamples));
    float radius = sqrt(float(index) / float(numSamples));
    return vec2(cos(angle), sin(angle)) * radius;
}

/**
 * Generate hexagonal bokeh pattern
 */
vec2 getBokehHexagonSample(int index, int numSamples) {
    float angle = float(index) * (TWO_PI / float(numSamples)) + PI / 6.0;
    float radius = sqrt(float(index) / float(numSamples));

    // Hexagon clipping
    vec2 pos = vec2(cos(angle), sin(angle)) * radius;
    float hexAngle = atan(pos.y, pos.x);
    float hexRadius = cos(PI / 6.0) / cos(mod(hexAngle, PI / 3.0) - PI / 6.0);

    return pos * min(1.0, hexRadius);
}

/**
 * Generate octagonal bokeh pattern
 */
vec2 getBokehOctagonSample(int index, int numSamples) {
    float angle = float(index) * (TWO_PI / float(numSamples));
    float radius = sqrt(float(index) / float(numSamples));

    vec2 pos = vec2(cos(angle), sin(angle)) * radius;
    float octAngle = atan(pos.y, pos.x);
    float octRadius = cos(PI / 8.0) / cos(mod(octAngle, PI / 4.0) - PI / 8.0);

    return pos * min(1.0, octRadius);
}

/**
 * Poisson disc sampling for better bokeh
 */
const vec2 POISSON_BOKEH[64] = vec2[](
    vec2(-0.613392, 0.617481), vec2(0.170019, -0.040254), vec2(-0.299417, 0.791925),
    vec2(0.645680, 0.493210), vec2(-0.651784, 0.717887), vec2(0.421003, 0.027070),
    vec2(-0.817194, -0.271096), vec2(-0.705374, -0.668203), vec2(0.977050, -0.108615),
    vec2(0.063326, 0.142369), vec2(0.203528, 0.214331), vec2(-0.667531, 0.326090),
    vec2(-0.098422, -0.295755), vec2(-0.885922, 0.215369), vec2(0.566637, 0.605213),
    vec2(0.039766, -0.396100), vec2(0.751946, 0.453352), vec2(0.078707, -0.715323),
    vec2(-0.075838, -0.529344), vec2(0.724479, -0.580798), vec2(0.222999, -0.215125),
    vec2(-0.467574, -0.405438), vec2(-0.248268, -0.814753), vec2(0.354411, -0.887570),
    vec2(0.175817, 0.382366), vec2(0.487472, -0.063082), vec2(-0.084078, 0.898312),
    vec2(0.488876, -0.783441), vec2(0.470016, 0.217933), vec2(-0.696890, -0.549791),
    vec2(-0.149693, 0.605762), vec2(0.034211, 0.979980), vec2(0.503098, -0.308878),
    vec2(-0.016205, -0.872921), vec2(0.385784, -0.393902), vec2(-0.146886, -0.859249),
    vec2(0.643361, 0.164098), vec2(0.634388, -0.049471), vec2(-0.688894, 0.007843),
    vec2(0.464034, -0.188818), vec2(-0.440840, 0.137486), vec2(0.364483, 0.511704),
    vec2(0.034028, 0.325968), vec2(0.099094, -0.308023), vec2(0.693960, -0.366253),
    vec2(0.678884, -0.204688), vec2(0.001801, 0.780328), vec2(0.145177, -0.898984),
    vec2(0.062655, -0.611866), vec2(0.315226, -0.604297), vec2(-0.780145, 0.486251),
    vec2(-0.371868, 0.882138), vec2(0.200476, 0.494430), vec2(-0.494552, -0.711051),
    vec2(0.612476, 0.705252), vec2(-0.578845, -0.768792), vec2(-0.772454, -0.090976),
    vec2(0.504440, 0.372295), vec2(0.155736, 0.065157), vec2(0.391522, 0.849605),
    vec2(-0.620106, -0.328104), vec2(0.789239, -0.419965), vec2(-0.545396, 0.538133),
    vec2(-0.178564, -0.596057), vec2(0.898654, 0.134806), vec2(0.944062, -0.228800)
);

// ============================================================================
// Gather-based DoF
// ============================================================================

/**
 * Gather DoF blur
 */
vec3 gatherDoF(sampler2D colorBuffer, sampler2D cocBuffer, vec2 texCoord,
               vec2 texelSize, int numSamples) {
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    float centerCoC = texture(cocBuffer, texCoord).r;

    for (int i = 0; i < numSamples && i < 64; i++) {
        #ifdef DOF_BOKEH_HEXAGON
            vec2 offset = getBokehHexagonSample(i, numSamples);
        #elif defined(DOF_BOKEH_OCTAGON)
            vec2 offset = getBokehOctagonSample(i, numSamples);
        #else
            vec2 offset = POISSON_BOKEH[i];
        #endif

        vec2 sampleCoord = texCoord + offset * centerCoC * texelSize;
        vec3 sampleColor = texture(colorBuffer, sampleCoord).rgb;
        float sampleCoC = texture(cocBuffer, sampleCoord).r;

        // Weight by CoC overlap
        float weight = (sampleCoC >= centerCoC * 0.5) ? 1.0 : sampleCoC / (centerCoC + EPSILON);
        weight = saturate(weight);

        color += sampleColor * weight;
        totalWeight += weight;
    }

    return color / max(totalWeight, EPSILON);
}

// ============================================================================
// Scatter-based DoF (faster but less accurate)
// ============================================================================

/**
 * Scatter DoF - spread pixels based on their CoC
 */
vec4 scatterDoF(sampler2D colorBuffer, sampler2D cocBuffer, vec2 texCoord) {
    vec3 color = texture(colorBuffer, texCoord).rgb;
    float coc = texture(cocBuffer, texCoord).r;

    // Return color with CoC as alpha for accumulation
    return vec4(color * coc, coc);
}

// ============================================================================
// Separable DoF (two-pass approximation)
// ============================================================================

/**
 * Horizontal DoF pass
 */
vec3 separableDoFHorizontal(sampler2D colorBuffer, sampler2D cocBuffer,
                            vec2 texCoord, vec2 texelSize) {
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    float centerCoC = texture(cocBuffer, texCoord).r;
    int samples = int(centerCoC);

    for (int i = -samples; i <= samples; i++) {
        vec2 offset = vec2(float(i), 0.0) * texelSize;
        vec3 sampleColor = texture(colorBuffer, texCoord + offset).rgb;
        float sampleCoC = texture(cocBuffer, texCoord + offset).r;

        float weight = 1.0 - abs(float(i)) / float(samples + 1);
        weight *= saturate(sampleCoC);

        color += sampleColor * weight;
        totalWeight += weight;
    }

    return color / max(totalWeight, EPSILON);
}

/**
 * Vertical DoF pass
 */
vec3 separableDoFVertical(sampler2D colorBuffer, sampler2D cocBuffer,
                          vec2 texCoord, vec2 texelSize) {
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;

    float centerCoC = texture(cocBuffer, texCoord).r;
    int samples = int(centerCoC);

    for (int i = -samples; i <= samples; i++) {
        vec2 offset = vec2(0.0, float(i)) * texelSize;
        vec3 sampleColor = texture(colorBuffer, texCoord + offset).rgb;
        float sampleCoC = texture(cocBuffer, texCoord + offset).r;

        float weight = 1.0 - abs(float(i)) / float(samples + 1);
        weight *= saturate(sampleCoC);

        color += sampleColor * weight;
        totalWeight += weight;
    }

    return color / max(totalWeight, EPSILON);
}

// ============================================================================
// Near/Far Field Separation
// ============================================================================

/**
 * Separate near and far fields
 */
vec4 separateNearFar(vec3 color, float coc, float focusDistance, float depth) {
    if (depth < focusDistance) {
        // Near field
        return vec4(color, coc); // Store in near buffer
    } else {
        // Far field
        return vec4(color, coc); // Store in far buffer
    }
}

/**
 * Combine near and far DoF
 */
vec3 combineNearFarDoF(vec3 focusedColor, vec3 nearBlur, vec3 farBlur,
                       float nearCoC, float farCoC) {
    // Far field first (under focused layer)
    vec3 result = mix(focusedColor, farBlur, saturate(farCoC));

    // Near field on top (over focused layer)
    result = mix(result, nearBlur, saturate(nearCoC));

    return result;
}

// ============================================================================
// Advanced Features
// ============================================================================

/**
 * Chromatic aberration for DoF
 */
vec3 dofChromaticAberration(sampler2D colorBuffer, vec2 texCoord,
                            vec2 offset, float strength) {
    float r = texture(colorBuffer, texCoord - offset * strength).r;
    float g = texture(colorBuffer, texCoord).g;
    float b = texture(colorBuffer, texCoord + offset * strength).b;

    return vec3(r, g, b);
}

/**
 * Bokeh highlight boost
 */
vec3 boostBokehHighlights(vec3 color, float threshold, float gain) {
    float brightness = luminance(color);
    float boost = max(0.0, brightness - threshold) * gain;
    return color * (1.0 + boost);
}

/**
 * Anamorphic bokeh (horizontal stretch)
 */
vec2 anamorphicBokeh(vec2 offset, float aspect) {
    return vec2(offset.x * aspect, offset.y);
}

// ============================================================================
// Complete DoF Pipeline
// ============================================================================

/**
 * Full DoF effect with gather sampling
 */
vec3 applyDoF(sampler2D colorBuffer, sampler2D depthBuffer,
              vec2 texCoord, vec2 texelSize,
              float focusDistance, float focalLength, float aperture) {
    // Get depth and calculate CoC
    float depth = texture(depthBuffer, texCoord).r;
    float linearDepth = linearizeDepth(depth, 0.1, 100.0);
    float coc = calculateCoCSimple(linearDepth, focusDistance, focalLength, aperture);

    // If CoC is small, skip blur
    if (coc < 1.0) {
        return texture(colorBuffer, texCoord).rgb;
    }

    // Gather blur
    vec3 blurred = vec3(0.0);
    float totalWeight = 0.0;

    int numSamples = min(DOF_BOKEH_SAMPLES, 64);

    for (int i = 0; i < numSamples; i++) {
        vec2 offset = POISSON_BOKEH[i] * coc * texelSize;
        vec3 sample = texture(colorBuffer, texCoord + offset).rgb;

        // Boost highlights for bokeh effect
        sample = boostBokehHighlights(sample, 1.0, 2.0);

        blurred += sample;
        totalWeight += 1.0;
    }

    return blurred / totalWeight;
}

/**
 * Simplified DoF with CoC buffer
 */
vec3 applyDoFWithCoC(sampler2D colorBuffer, sampler2D cocBuffer,
                     vec2 texCoord, vec2 texelSize) {
    float coc = texture(cocBuffer, texCoord).r;

    if (coc < 1.0) {
        return texture(colorBuffer, texCoord).rgb;
    }

    return gatherDoF(colorBuffer, cocBuffer, texCoord, texelSize, DOF_BOKEH_SAMPLES);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Auto-focus: find focus distance from center depth
 */
float calculateAutoFocus(sampler2D depthBuffer, vec2 centerUV) {
    float depth = texture(depthBuffer, centerUV).r;
    return linearizeDepth(depth, 0.1, 100.0);
}

/**
 * Debug visualize CoC
 */
vec3 debugVisualizeCoC(float coc, float maxCoC) {
    float normalized = coc / maxCoC;
    return vec3(normalized, 0.0, 1.0 - normalized);
}
