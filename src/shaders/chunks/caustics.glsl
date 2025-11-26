/**
 * caustics.glsl - Water Caustics
 *
 * Implements caustic light patterns from water refraction
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

/**
 * Procedural caustics pattern
 */
float proceduralCaustics(vec2 uv, float time) {
    vec2 p = uv * 3.0;

    // Multiple layers
    float c = 0.0;
    c += abs(sin(p.x * 3.0 + time) * cos(p.y * 2.0 - time));
    c += abs(sin(p.x * 2.0 - time) * cos(p.y * 3.0 + time));

    // Sharpen
    c = pow(c, 3.0);

    return c * 0.5;
}

/**
 * Animated caustics with scrolling
 */
float animatedCaustics(vec2 worldPos, float time, vec2 flowDirection) {
    vec2 uv1 = worldPos + time * flowDirection * 0.1;
    vec2 uv2 = worldPos - time * flowDirection * 0.15;

    float c1 = proceduralCaustics(uv1, time);
    float c2 = proceduralCaustics(uv2, time * 1.3);

    return max(c1, c2);
}
