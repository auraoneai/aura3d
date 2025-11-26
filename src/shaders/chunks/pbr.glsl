/**
 * pbr.glsl - Physically Based Rendering functions
 *
 * Implements PBR BRDF components for metallic-roughness workflow.
 * Based on Disney/Epic's PBR model with Cook-Torrance microfacet BRDF.
 *
 * Features:
 * - GGX Normal Distribution Function
 * - Smith-GGX Geometry Function
 * - Schlick Fresnel Approximation
 * - Diffuse and Specular BRDF
 * - Image-Based Lighting (IBL)
 *
 * Dependencies:
 * - common.glsl for constants and utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef PBR_MIN_ROUGHNESS
#define PBR_MIN_ROUGHNESS 0.045
#endif

#ifndef PBR_DIELECTRIC_SPECULAR
#define PBR_DIELECTRIC_SPECULAR 0.04
#endif

// ============================================================================
// Normal Distribution Function (NDF)
// ============================================================================

/**
 * GGX (Trowbridge-Reitz) Normal Distribution Function
 * @param NdotH Dot product of normal and half vector
 * @param roughness Surface roughness [0, 1]
 * @return Distribution of microfacet normals
 */
float D_GGX(float NdotH, float roughness) {
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;
    float NdotH2 = NdotH * NdotH;

    float denom = NdotH2 * (alpha2 - 1.0) + 1.0;
    denom = PI * denom * denom;

    return alpha2 / max(denom, EPSILON);
}

/**
 * Anisotropic GGX Distribution
 */
float D_GGX_Anisotropic(float NdotH, float HdotX, float HdotY, float roughnessX, float roughnessY) {
    float ax = roughnessX * roughnessX;
    float ay = roughnessY * roughnessY;

    float a2 = ax * ay;
    vec3 v = vec3(ay * HdotX, ax * HdotY, a2 * NdotH);
    float v2 = dot(v, v);

    float w2 = a2 / v2;
    return a2 * w2 * w2 * INV_PI;
}

// ============================================================================
// Geometry Function
// ============================================================================

/**
 * Smith-GGX Geometry Shadowing Function (single direction)
 */
float G_SmithGGX_Single(float NdotV, float roughness) {
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;
    float NdotV2 = NdotV * NdotV;

    float denom = NdotV + sqrt(alpha2 + (1.0 - alpha2) * NdotV2);
    return (2.0 * NdotV) / max(denom, EPSILON);
}

/**
 * Smith-GGX Geometry Function (combined shadowing-masking)
 * @param NdotV Dot product of normal and view direction
 * @param NdotL Dot product of normal and light direction
 * @param roughness Surface roughness [0, 1]
 */
float G_SmithGGX(float NdotV, float NdotL, float roughness) {
    float ggx1 = G_SmithGGX_Single(NdotV, roughness);
    float ggx2 = G_SmithGGX_Single(NdotL, roughness);
    return ggx1 * ggx2;
}

/**
 * Height-correlated Smith-GGX (more accurate)
 */
float G_SmithGGX_Correlated(float NdotV, float NdotL, float roughness) {
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;

    float lambdaV = NdotL * sqrt((NdotV - alpha2 * NdotV) * NdotV + alpha2);
    float lambdaL = NdotV * sqrt((NdotL - alpha2 * NdotL) * NdotL + alpha2);

    return 0.5 / max(lambdaV + lambdaL, EPSILON);
}

// ============================================================================
// Fresnel Function
// ============================================================================

/**
 * Schlick's Fresnel approximation
 * @param F0 Base reflectivity at normal incidence
 * @param VdotH Dot product of view and half vector
 */
vec3 F_Schlick(vec3 F0, float VdotH) {
    float f = pow(1.0 - VdotH, 5.0);
    return F0 + (1.0 - F0) * f;
}

/**
 * Schlick's Fresnel with scalar F0
 */
float F_Schlick(float F0, float VdotH) {
    float f = pow(1.0 - VdotH, 5.0);
    return F0 + (1.0 - F0) * f;
}

/**
 * Fresnel with roughness for IBL
 */
vec3 F_SchlickRoughness(vec3 F0, float VdotN, float roughness) {
    float smoothness = 1.0 - roughness;
    return F0 + (max(vec3(smoothness), F0) - F0) * pow(1.0 - VdotN, 5.0);
}

/**
 * Full Fresnel equation (more accurate, more expensive)
 */
vec3 F_Full(vec3 F0, float VdotH) {
    vec3 n = (1.0 + sqrt(F0)) / (1.0 - sqrt(F0));
    vec3 g = sqrt(n * n + VdotH * VdotH - 1.0);

    vec3 gSubC = g - VdotH;
    vec3 gAddC = g + VdotH;

    vec3 result = 0.5 * (gSubC * gSubC) / (gAddC * gAddC);
    result *= 1.0 + sqr((VdotH * gAddC - 1.0) / (VdotH * gSubC + 1.0));

    return result;
}

// ============================================================================
// BRDF Components
// ============================================================================

/**
 * Cook-Torrance Specular BRDF
 * @param N Surface normal
 * @param V View direction
 * @param L Light direction
 * @param roughness Surface roughness [0, 1]
 * @param F0 Fresnel reflectance at normal incidence
 */
vec3 BRDF_Specular(vec3 N, vec3 V, vec3 L, float roughness, vec3 F0) {
    vec3 H = normalize(V + L);

    float NdotV = max(dot(N, V), EPSILON);
    float NdotL = max(dot(N, L), EPSILON);
    float NdotH = max(dot(N, H), 0.0);
    float VdotH = max(dot(V, H), 0.0);

    // Clamp roughness to avoid artifacts
    roughness = max(roughness, PBR_MIN_ROUGHNESS);

    // Distribution term
    float D = D_GGX(NdotH, roughness);

    // Geometry term
    #ifdef PBR_USE_HEIGHT_CORRELATED_G
        float G = G_SmithGGX_Correlated(NdotV, NdotL, roughness);
    #else
        float G = G_SmithGGX(NdotV, NdotL, roughness);
    #endif

    // Fresnel term
    vec3 F = F_Schlick(F0, VdotH);

    // Cook-Torrance BRDF
    vec3 numerator = D * G * F;
    float denominator = 4.0 * NdotV * NdotL;

    return numerator / max(denominator, EPSILON);
}

/**
 * Lambertian Diffuse BRDF
 */
vec3 BRDF_Diffuse(vec3 albedo) {
    return albedo * INV_PI;
}

/**
 * Disney Diffuse BRDF (more physically accurate)
 */
vec3 BRDF_Diffuse_Disney(vec3 albedo, float NdotV, float NdotL, float VdotH, float roughness) {
    float FD90 = 0.5 + 2.0 * VdotH * VdotH * roughness;
    float FdV = 1.0 + (FD90 - 1.0) * pow(1.0 - NdotV, 5.0);
    float FdL = 1.0 + (FD90 - 1.0) * pow(1.0 - NdotL, 5.0);

    return albedo * INV_PI * FdV * FdL;
}

/**
 * Burley/Disney Diffuse (normalized)
 */
vec3 BRDF_Diffuse_Burley(vec3 albedo, float NdotV, float NdotL, float VdotH, float roughness) {
    float f90 = 0.5 + 2.0 * roughness * VdotH * VdotH;
    float lightScatter = F_Schlick(1.0, f90, NdotL);
    float viewScatter = F_Schlick(1.0, f90, NdotV);

    return albedo * INV_PI * lightScatter * viewScatter;
}

// ============================================================================
// Combined BRDF
// ============================================================================

/**
 * Complete PBR BRDF evaluation
 * @param N Surface normal
 * @param V View direction
 * @param L Light direction
 * @param albedo Base color
 * @param metallic Metallic factor [0, 1]
 * @param roughness Roughness factor [0, 1]
 * @return Combined diffuse + specular contribution
 */
vec3 BRDF_Evaluate(vec3 N, vec3 V, vec3 L, vec3 albedo, float metallic, float roughness) {
    vec3 H = normalize(V + L);

    float NdotV = max(dot(N, V), EPSILON);
    float NdotL = max(dot(N, L), EPSILON);
    float VdotH = max(dot(V, H), 0.0);

    // Calculate F0 (base reflectivity)
    vec3 F0 = mix(vec3(PBR_DIELECTRIC_SPECULAR), albedo, metallic);

    // Specular contribution
    vec3 specular = BRDF_Specular(N, V, L, roughness, F0);

    // Fresnel for energy conservation
    vec3 kS = F_Schlick(F0, VdotH);
    vec3 kD = (1.0 - kS) * (1.0 - metallic);

    // Diffuse contribution
    #ifdef PBR_USE_DISNEY_DIFFUSE
        vec3 diffuse = BRDF_Diffuse_Disney(albedo, NdotV, NdotL, VdotH, roughness);
    #else
        vec3 diffuse = BRDF_Diffuse(albedo);
    #endif

    return kD * diffuse + specular;
}

// ============================================================================
// Image-Based Lighting (IBL)
// ============================================================================

/**
 * Sample pre-filtered environment map for specular IBL
 * @param reflectDir Reflection direction
 * @param roughness Surface roughness
 * @param envMap Pre-filtered environment map
 * @param maxMipLevel Maximum mip level of environment map
 */
#ifdef HAS_IBL_SPECULAR
vec3 samplePrefilteredEnvMap(vec3 reflectDir, float roughness, samplerCube envMap, float maxMipLevel) {
    float lod = roughness * maxMipLevel;
    return textureLod(envMap, reflectDir, lod).rgb;
}
#endif

/**
 * IBL Specular contribution
 * @param N Surface normal
 * @param V View direction
 * @param F0 Base reflectivity
 * @param roughness Surface roughness
 * @param prefilteredMap Pre-filtered environment map
 * @param brdfLUT BRDF integration LUT
 */
#ifdef HAS_IBL_SPECULAR
vec3 IBL_Specular(vec3 N, vec3 V, vec3 F0, float roughness,
                  samplerCube prefilteredMap, sampler2D brdfLUT, float maxMipLevel) {
    float NdotV = max(dot(N, V), 0.0);
    vec3 R = reflect(-V, N);

    // Sample pre-filtered environment map
    vec3 prefilteredColor = samplePrefilteredEnvMap(R, roughness, prefilteredMap, maxMipLevel);

    // Sample BRDF LUT
    vec2 envBRDF = texture(brdfLUT, vec2(NdotV, roughness)).rg;

    // Combine using split-sum approximation
    return prefilteredColor * (F0 * envBRDF.x + envBRDF.y);
}
#endif

/**
 * IBL Diffuse contribution (irradiance)
 * @param N Surface normal
 * @param albedo Base color
 * @param irradianceMap Irradiance environment map
 */
#ifdef HAS_IBL_DIFFUSE
vec3 IBL_Diffuse(vec3 N, vec3 albedo, samplerCube irradianceMap) {
    vec3 irradiance = texture(irradianceMap, N).rgb;
    return irradiance * albedo * INV_PI;
}
#endif

/**
 * Complete IBL evaluation
 */
#if defined(HAS_IBL_SPECULAR) && defined(HAS_IBL_DIFFUSE)
vec3 IBL_Evaluate(vec3 N, vec3 V, vec3 albedo, float metallic, float roughness,
                  samplerCube prefilteredMap, samplerCube irradianceMap,
                  sampler2D brdfLUT, float maxMipLevel) {
    float NdotV = max(dot(N, V), 0.0);

    // Calculate F0
    vec3 F0 = mix(vec3(PBR_DIELECTRIC_SPECULAR), albedo, metallic);

    // Fresnel for IBL
    vec3 kS = F_SchlickRoughness(F0, NdotV, roughness);
    vec3 kD = (1.0 - kS) * (1.0 - metallic);

    // Diffuse IBL
    vec3 diffuse = kD * IBL_Diffuse(N, albedo, irradianceMap);

    // Specular IBL
    vec3 specular = IBL_Specular(N, V, F0, roughness, prefilteredMap, brdfLUT, maxMipLevel);

    return diffuse + specular;
}
#endif

// ============================================================================
// Clear Coat (Multi-layer BRDF)
// ============================================================================

#ifdef PBR_CLEAR_COAT

/**
 * Clear coat BRDF layer
 */
vec3 BRDF_ClearCoat(vec3 N, vec3 V, vec3 L, float clearCoat, float clearCoatRoughness) {
    if (clearCoat < EPSILON) return vec3(0.0);

    vec3 H = normalize(V + L);
    float NdotH = max(dot(N, H), 0.0);
    float VdotH = max(dot(V, H), 0.0);
    float NdotV = max(dot(N, V), EPSILON);
    float NdotL = max(dot(N, L), EPSILON);

    // Use lower IOR for clear coat (1.5 typical for polyurethane)
    float F0_clearcoat = 0.04;

    float D = D_GGX(NdotH, clearCoatRoughness);
    float G = G_SmithGGX(NdotV, NdotL, clearCoatRoughness);
    float F = F_Schlick(F0_clearcoat, VdotH);

    return vec3(D * G * F * clearCoat / (4.0 * NdotV * NdotL));
}

#endif

// ============================================================================
// Sheen (Fabric/Velvet)
// ============================================================================

#ifdef PBR_SHEEN

/**
 * Sheen BRDF for fabric materials
 */
vec3 BRDF_Sheen(vec3 sheenColor, float VdotH) {
    float sheen = pow(1.0 - VdotH, 5.0);
    return sheenColor * sheen;
}

#endif

// ============================================================================
// Energy Conservation Utilities
// ============================================================================

/**
 * Compute metallic F0 from base color
 */
vec3 computeF0(vec3 albedo, float metallic) {
    return mix(vec3(PBR_DIELECTRIC_SPECULAR), albedo, metallic);
}

/**
 * Energy compensation for multi-scattering
 */
vec3 energyCompensation(vec3 specular, vec2 envBRDF, vec3 F0) {
    vec3 Fss = (F0 * envBRDF.x + envBRDF.y);
    float Ess = envBRDF.x + envBRDF.y;
    float Ems = 1.0 - Ess;

    vec3 Favg = F0 + (1.0 - F0) / 21.0;
    vec3 Fms = Fss * Favg / (1.0 - Favg * Ems);

    return specular + Fms * Ems;
}
