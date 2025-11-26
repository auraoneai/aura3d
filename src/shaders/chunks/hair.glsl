/**
 * hair.glsl - Hair and Fur Shading
 *
 * Implements realistic hair rendering with:
 * - Kajiya-Kay anisotropic model
 * - Marschner hair BSDF (simplified)
 * - Multiple scattering approximation
 * - Anisotropic highlights
 *
 * Dependencies:
 * - common.glsl for utilities
 * - pbr.glsl for base functions
 */

#pragma requires(common)
#pragma requires(pbr)

// ============================================================================
// Configuration
// ============================================================================

#ifndef HAIR_SPECULAR_SHIFT
#define HAIR_SPECULAR_SHIFT 0.0
#endif

#ifndef HAIR_PRIMARY_SHIFT
#define HAIR_PRIMARY_SHIFT 0.1
#endif

#ifndef HAIR_SECONDARY_SHIFT
#define HAIR_SECONDARY_SHIFT -0.1
#endif

#ifndef HAIR_ROUGHNESS_PRIMARY
#define HAIR_ROUGHNESS_PRIMARY 0.25
#endif

#ifndef HAIR_ROUGHNESS_SECONDARY
#define HAIR_ROUGHNESS_SECONDARY 0.5
#endif

// ============================================================================
// Kajiya-Kay Model
// ============================================================================

/**
 * Kajiya-Kay anisotropic specular term
 * @param T Tangent direction (along hair strand)
 * @param V View direction
 * @param L Light direction
 * @param specPower Specular power (controls highlight width)
 */
float kajiyaKaySpecular(vec3 T, vec3 V, vec3 L, float specPower) {
    vec3 H = normalize(V + L);

    float TdotH = dot(T, H);
    float sinTH = sqrt(1.0 - TdotH * TdotH);

    float dirAtten = smoothstep(-1.0, 0.0, dot(T, H));

    return dirAtten * pow(sinTH, specPower);
}

/**
 * Shifted tangent for multiple highlights
 */
vec3 shiftTangent(vec3 T, vec3 N, float shift) {
    vec3 shiftedT = T + shift * N;
    return normalize(shiftedT);
}

/**
 * Kajiya-Kay with shifted tangents (dual-highlight)
 */
vec3 kajiyaKayDualSpecular(vec3 T, vec3 N, vec3 V, vec3 L,
                           vec3 primaryColor, vec3 secondaryColor,
                           float primaryShift, float secondaryShift,
                           float primaryPower, float secondaryPower) {
    // Primary highlight
    vec3 T1 = shiftTangent(T, N, primaryShift);
    float spec1 = kajiyaKaySpecular(T1, V, L, primaryPower);

    // Secondary highlight
    vec3 T2 = shiftTangent(T, N, secondaryShift);
    float spec2 = kajiyaKaySpecular(T2, V, L, secondaryPower);

    return primaryColor * spec1 + secondaryColor * spec2;
}

/**
 * Kajiya-Kay with shift texture
 */
vec3 kajiyaKayWithShiftMap(vec3 T, vec3 N, vec3 V, vec3 L,
                           vec3 primaryColor, vec3 secondaryColor,
                           float shiftTexture, float primaryPower, float secondaryPower) {
    float primaryShift = HAIR_PRIMARY_SHIFT + shiftTexture;
    float secondaryShift = HAIR_SECONDARY_SHIFT + shiftTexture;

    return kajiyaKayDualSpecular(T, N, V, L, primaryColor, secondaryColor,
                                 primaryShift, secondaryShift,
                                 primaryPower, secondaryPower);
}

// ============================================================================
// Marschner Model (Simplified)
// ============================================================================

/**
 * Longitudinal scattering (M term)
 */
float marschnerM(float TdotH, float roughness, float shift) {
    float sinTH = sqrt(1.0 - TdotH * TdotH);
    float sinTHShifted = sin(asin(sinTH) - shift);

    float variance = roughness * roughness;
    return exp(-sinTHShifted * sinTHShifted / (2.0 * variance)) / sqrt(TWO_PI * variance);
}

/**
 * Azimuthal scattering (N term)
 */
float marschnerN(float phi, float roughness) {
    float variance = roughness * roughness;
    return exp(-phi * phi / (2.0 * variance)) / sqrt(TWO_PI * variance);
}

/**
 * Marschner R lobe (surface reflection)
 */
float marschnerR(vec3 T, vec3 V, vec3 L, vec3 H, float roughness) {
    float TdotH = dot(T, H);
    float m = marschnerM(TdotH, roughness, 0.0);

    // Azimuthal component (simplified)
    float n = 1.0;

    return m * n;
}

/**
 * Marschner TT lobe (transmission through hair)
 */
float marschnerTT(vec3 T, vec3 V, vec3 L, vec3 H, float roughness) {
    float TdotH = dot(T, H);
    float m = marschnerM(TdotH, roughness * 1.5, 0.1);

    return m * 0.5;
}

/**
 * Marschner TRT lobe (transmission-reflection-transmission)
 */
float marschnerTRT(vec3 T, vec3 V, vec3 L, vec3 H, float roughness) {
    float TdotH = dot(T, H);
    float m = marschnerM(TdotH, roughness * 2.0, -0.1);

    return m * 0.3;
}

/**
 * Full Marschner BSDF
 */
vec3 marschnerBSDF(vec3 T, vec3 V, vec3 L, vec3 albedo, float roughness) {
    vec3 H = normalize(V + L);

    // R lobe (surface reflection)
    float R = marschnerR(T, V, L, H, roughness);

    // TT lobe (transmission)
    float TT = marschnerTT(T, V, L, H, roughness);

    // TRT lobe (colored highlight)
    float TRT = marschnerTRT(T, V, L, H, roughness);

    // Combine lobes
    vec3 specular = vec3(R) + albedo * albedo * vec3(TT) + albedo * vec3(TRT);

    return specular;
}

// ============================================================================
// Scattering and Absorption
// ============================================================================

/**
 * Hair forward scattering
 */
float hairForwardScattering(vec3 V, vec3 L) {
    float VdotL = dot(V, L);
    return saturate(VdotL * 0.5 + 0.5);
}

/**
 * Hair backscattering (rim lighting effect)
 */
float hairBackScattering(vec3 V, vec3 L, float power) {
    float VdotL = dot(V, L);
    float backScatter = saturate(-VdotL);
    return pow(backScatter, power);
}

/**
 * Multiple scattering approximation
 */
vec3 hairMultipleScattering(vec3 albedo, float NdotL, float roughness) {
    // Approximate multiple scattering as diffuse-like term
    float scatter = saturate(NdotL);
    scatter = pow(scatter, 1.0 - roughness * 0.5);

    return albedo * scatter * 0.5;
}

// ============================================================================
// Anisotropic Highlights
// ============================================================================

/**
 * Anisotropic GGX for hair (stretched along tangent)
 */
float hairAnisotropicGGX(vec3 T, vec3 H, float roughnessT, float roughnessB) {
    float TdotH = dot(T, H);
    vec3 B = cross(T, vec3(0.0, 1.0, 0.0)); // Approximate bitangent
    float BdotH = dot(B, H);

    float at = roughnessT * roughnessT;
    float ab = roughnessB * roughnessB;

    float a2 = at * ab;
    vec3 v = vec3(ab * TdotH, at * BdotH, a2);
    float v2 = dot(v, v);

    float w2 = a2 / v2;
    return a2 * w2 * w2 * INV_PI;
}

// ============================================================================
// Complete Hair Shading
// ============================================================================

/**
 * Evaluate hair shading
 */
vec3 evaluateHairShading(vec3 T, vec3 N, vec3 V, vec3 L,
                         vec3 albedo, float roughness, float metallic,
                         float shiftTexture) {
    vec3 diffuse = BRDF_Diffuse(albedo) * max(dot(N, L), 0.0);

    // Dual specular highlights
    vec3 primaryColor = vec3(1.0);
    vec3 secondaryColor = albedo;

    float primaryPower = 1.0 / max(HAIR_ROUGHNESS_PRIMARY * roughness, 0.01);
    float secondaryPower = 1.0 / max(HAIR_ROUGHNESS_SECONDARY * roughness, 0.01);

    vec3 specular = kajiyaKayWithShiftMap(T, N, V, L,
                                          primaryColor, secondaryColor,
                                          shiftTexture,
                                          primaryPower, secondaryPower);

    // Transmission/scattering
    float scatter = hairForwardScattering(V, L);
    vec3 transmission = albedo * scatter * 0.3;

    return diffuse + specular + transmission;
}

/**
 * Evaluate hair with Marschner model
 */
vec3 evaluateHairMarschner(vec3 T, vec3 N, vec3 V, vec3 L,
                           vec3 albedo, float roughness) {
    vec3 marschner = marschnerBSDF(T, V, L, albedo, roughness);

    // Add diffuse approximation
    vec3 diffuse = hairMultipleScattering(albedo, dot(N, L), roughness);

    // Add backscattering rim
    float rim = hairBackScattering(V, L, 3.0);
    vec3 rimLight = albedo * rim * 0.5;

    return marschner + diffuse + rimLight;
}

// ============================================================================
// Strand Jittering (for fiber-level detail)
// ============================================================================

/**
 * Jitter tangent for per-fiber variation
 */
vec3 jitterTangent(vec3 T, vec3 N, vec2 uv, float strength) {
    vec2 noise = hash2(uv * 100.0);
    vec3 jitter = (noise.x - 0.5) * N + (noise.y - 0.5) * cross(T, N);

    return normalize(T + jitter * strength);
}

// ============================================================================
// Transparency and Alpha
// ============================================================================

/**
 * Calculate hair opacity based on coverage
 */
float calculateHairOpacity(float coverage, float depth, int layer) {
    // Depth-based transparency for layered hair
    float opacity = coverage;
    opacity *= exp(-float(layer) * 0.3);

    return saturate(opacity);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate tangent from normal and UV direction
 */
vec3 calculateHairTangent(vec3 normal, vec2 uvDirection) {
    vec3 up = abs(normal.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(up, normal));
    vec3 bitangent = cross(normal, tangent);

    // Rotate based on UV
    float angle = atan(uvDirection.y, uvDirection.x);
    return cos(angle) * tangent + sin(angle) * bitangent;
}

/**
 * Hair highlight color from root to tip
 */
vec3 calculateHairHighlightColor(vec3 baseColor, float rootToTip) {
    // Lighter at tips, darker at roots
    return mix(baseColor * 0.7, baseColor * 1.3, rootToTip);
}
