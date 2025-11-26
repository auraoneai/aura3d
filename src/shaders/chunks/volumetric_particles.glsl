/**
 * volumetric_particles.glsl - Volumetric Particle Rendering
 *
 * Soft particle rendering with depth-based fading
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

/**
 * Soft particle fade based on scene depth
 */
float softParticleFade(float particleDepth, float sceneDepth, float softness) {
    float diff = sceneDepth - particleDepth;
    return saturate(diff / softness);
}

/**
 * Volumetric particle density
 */
float volumetricParticleDensity(vec3 viewPos, vec3 particleCenter, float radius) {
    float dist = length(viewPos - particleCenter);
    return exp(-dist / radius);
}
