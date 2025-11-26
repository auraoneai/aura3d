/**
 * cloth.glsl - Cloth and Fabric Shading
 *
 * Implements realistic fabric rendering with:
 * - Velvet BRDF (micro-cylinder model)
 * - Sheen layer
 * - Subsurface scattering approximation
 * - Anisotropic fabric highlights
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

#ifndef CLOTH_SHEEN_COLOR
#define CLOTH_SHEEN_COLOR vec3(1.0)
#endif

#ifndef CLOTH_SHEEN_ROUGHNESS
#define CLOTH_SHEEN_ROUGHNESS 0.4
#endif

#ifndef CLOTH_SUBSURFACE_COLOR
#define CLOTH_SUBSURFACE_COLOR vec3(1.0, 0.2, 0.2)
#endif

// ============================================================================
// Velvet BRDF (Charlie)
// ============================================================================

/**
 * Charlie distribution (for cloth/velvet)
 * Models micro-fibers sticking out from surface
 */
float D_Charlie(float roughness, float NdotH) {
    float alpha = roughness * roughness;
    float invAlpha = 1.0 / alpha;

    float cos2h = NdotH * NdotH;
    float sin2h = 1.0 - cos2h;

    return (2.0 + invAlpha) * pow(sin2h, invAlpha * 0.5) / (TWO_PI);
}

/**
 * Visibility term for Charlie
 */
float V_Charlie(float NdotV, float NdotL) {
    float lambdaV = NdotV < 0.5 ? exp((-5.26 * NdotV + 11.0) * NdotV) : 0.0;
    float lambdaL = NdotL < 0.5 ? exp((-5.26 * NdotL + 11.0) * NdotL) : 0.0;

    return 1.0 / ((1.0 + lambdaV + lambdaL) * (4.0 * NdotV * NdotL));
}

/**
 * Velvet/cloth BRDF using Charlie distribution
 */
vec3 BRDF_Velvet(vec3 N, vec3 V, vec3 L, vec3 sheenColor, float roughness) {
    vec3 H = normalize(V + L);

    float NdotH = max(dot(N, H), 0.0);
    float NdotV = max(dot(N, V), EPSILON);
    float NdotL = max(dot(N, L), 0.0);

    float D = D_Charlie(roughness, NdotH);
    float Vis = V_Charlie(NdotV, NdotL);

    return sheenColor * D * Vis;
}

// ============================================================================
// Sheen Layer
// ============================================================================

/**
 * Simple sheen approximation (like fabric glow)
 */
vec3 clothSheen(vec3 N, vec3 V, vec3 L, vec3 sheenColor, float sheenRoughness) {
    vec3 H = normalize(V + L);

    float NdotH = max(dot(N, H), 0.0);
    float VdotH = max(dot(V, H), 0.0);

    // Simple power function for sheen highlight
    float sheen = pow(1.0 - VdotH, 5.0) * pow(NdotH, 1.0 / max(sheenRoughness, 0.01));

    return sheenColor * sheen;
}

/**
 * Ashikhmin-Premoze sheen (physically-based)
 */
vec3 sheenAshikhmin(vec3 N, vec3 V, vec3 L, vec3 sheenColor, float roughness) {
    vec3 H = normalize(V + L);

    float NdotH = max(dot(N, H), 0.0);
    float NdotV = max(dot(N, V), EPSILON);
    float NdotL = max(dot(N, L), 0.0);

    float sinThetaH2 = 1.0 - NdotH * NdotH;
    float r = max(roughness, 0.01);

    float sheen = sinThetaH2 / pow(sinThetaH2 + r, 2.0);

    return sheenColor * sheen / (NdotV + NdotL - NdotV * NdotL);
}

// ============================================================================
// Anisotropic Fabric
// ============================================================================

/**
 * Anisotropic fabric highlights (for satin, silk)
 */
vec3 BRDF_AnisotropicFabric(vec3 N, vec3 T, vec3 B, vec3 V, vec3 L,
                            vec3 color, float roughnessX, float roughnessY) {
    vec3 H = normalize(V + L);

    float NdotH = max(dot(N, H), 0.0);
    float NdotV = max(dot(N, V), EPSILON);
    float NdotL = max(dot(N, L), 0.0);
    float HdotX = dot(H, T);
    float HdotY = dot(H, B);

    // Anisotropic GGX
    float D = D_GGX_Anisotropic(NdotH, HdotX, HdotY, roughnessX, roughnessY);

    // Simplified visibility
    float Vis = 1.0 / (4.0 * NdotV * NdotL);

    return color * D * Vis;
}

// ============================================================================
// Subsurface Scattering (Wrap Lighting)
// ============================================================================

/**
 * Wrap lighting approximation for subsurface scattering
 */
vec3 wrapLighting(vec3 N, vec3 L, vec3 albedo, vec3 subsurfaceColor, float wrap) {
    float NdotL = dot(N, L);
    float wrappedNdotL = (NdotL + wrap) / (1.0 + wrap);

    return albedo * max(wrappedNdotL, 0.0) + subsurfaceColor * max(-NdotL, 0.0) * wrap;
}

/**
 * Pre-integrated subsurface scattering for cloth
 */
vec3 clothSubsurface(vec3 N, vec3 V, vec3 L, vec3 albedo, vec3 subsurfaceColor, float thickness) {
    vec3 H = normalize(V + L);

    float VdotH = max(dot(V, H), 0.0);
    float NdotL = dot(N, L);

    // Transmission through thin fabric
    float transmission = pow(saturate(-NdotL + 0.5), 2.0);

    // Modulate by thickness and viewing angle
    transmission *= (1.0 - thickness) * pow(1.0 - VdotH, 3.0);

    return subsurfaceColor * albedo * transmission;
}

// ============================================================================
// Fabric Types
// ============================================================================

/**
 * Cotton/denim shader
 */
vec3 fabricCotton(vec3 N, vec3 V, vec3 L, vec3 albedo, float roughness) {
    float NdotL = max(dot(N, L), 0.0);

    // Diffuse with wrap
    vec3 diffuse = wrapLighting(N, L, albedo, albedo * 0.3, 0.3);

    // Subtle sheen
    vec3 sheen = clothSheen(N, V, L, vec3(0.05), 0.8);

    return diffuse + sheen;
}

/**
 * Velvet shader
 */
vec3 fabricVelvet(vec3 N, vec3 V, vec3 L, vec3 albedo, vec3 sheenColor, float roughness) {
    float NdotL = max(dot(N, L), 0.0);

    // Dark diffuse base
    vec3 diffuse = albedo * NdotL * 0.5;

    // Strong velvet BRDF
    vec3 velvet = BRDF_Velvet(N, V, L, sheenColor, roughness);

    return diffuse + velvet;
}

/**
 * Satin/silk shader (anisotropic)
 */
vec3 fabricSatin(vec3 N, vec3 T, vec3 B, vec3 V, vec3 L, vec3 albedo,
                 float roughnessX, float roughnessY) {
    float NdotL = max(dot(N, L), 0.0);

    // Smooth diffuse
    vec3 diffuse = albedo * NdotL;

    // Anisotropic highlights
    vec3 specular = BRDF_AnisotropicFabric(N, T, B, V, L, vec3(1.0), roughnessX, roughnessY);

    return diffuse + specular * 0.5;
}

/**
 * Leather shader
 */
vec3 fabricLeather(vec3 N, vec3 V, vec3 L, vec3 albedo, float roughness, float metallic) {
    // Use standard PBR with some modifications
    vec3 brdf = BRDF_Evaluate(N, V, L, albedo, metallic, roughness);

    // Add subtle subsurface
    vec3 subsurface = clothSubsurface(N, V, L, albedo, albedo * vec3(0.8, 0.6, 0.5), 0.5);

    return brdf + subsurface * 0.2;
}

// ============================================================================
// Microfiber Detail
// ============================================================================

/**
 * Add microfiber normal perturbation
 */
vec3 perturbNormalMicrofiber(vec3 N, vec2 uv, float strength) {
    // Generate fiber pattern
    float noise1 = hash(uv.x * 100.0 + uv.y * 50.0);
    float noise2 = hash(uv.x * 50.0 + uv.y * 100.0);

    vec3 tangent = normalize(vec3(noise1 - 0.5, 0.0, noise2 - 0.5));
    return normalize(N + tangent * strength);
}

// ============================================================================
// Fuzz/Lint
// ============================================================================

/**
 * Add fuzz/lint effect to fabric edges
 */
float calculateFuzz(vec3 N, vec3 V, float fuzzStrength) {
    float NdotV = abs(dot(N, V));
    float fuzz = pow(1.0 - NdotV, 3.0);

    return fuzz * fuzzStrength;
}

/**
 * Apply fuzz to fabric color
 */
vec3 applyFuzz(vec3 color, vec3 N, vec3 V, vec3 fuzzColor, float fuzzStrength) {
    float fuzz = calculateFuzz(N, V, fuzzStrength);
    return mix(color, fuzzColor, fuzz);
}

// ============================================================================
// Complete Cloth Shading
// ============================================================================

/**
 * Evaluate complete cloth BRDF
 */
vec3 evaluateClothShading(vec3 N, vec3 V, vec3 L, vec3 albedo,
                          float roughness, vec3 sheenColor, float sheenStrength,
                          vec3 subsurfaceColor, float subsurfaceStrength) {
    float NdotL = max(dot(N, L), 0.0);

    // Base diffuse with wrap lighting
    vec3 diffuse = wrapLighting(N, L, albedo, subsurfaceColor, 0.2);

    // Sheen layer
    vec3 sheen = clothSheen(N, V, L, sheenColor, CLOTH_SHEEN_ROUGHNESS) * sheenStrength;

    // Subsurface
    vec3 subsurface = clothSubsurface(N, V, L, albedo, subsurfaceColor, 0.5) * subsurfaceStrength;

    return diffuse + sheen + subsurface;
}

/**
 * Evaluate cloth with velvet model
 */
vec3 evaluateClothVelvet(vec3 N, vec3 V, vec3 L, vec3 albedo,
                         float roughness, vec3 sheenColor) {
    float NdotL = max(dot(N, L), 0.0);

    // Dark diffuse
    vec3 diffuse = albedo * NdotL * 0.3;

    // Velvet BRDF
    vec3 velvet = BRDF_Velvet(N, V, L, sheenColor, roughness);

    // Add rim lighting
    float NdotV = abs(dot(N, V));
    float rim = pow(1.0 - NdotV, 4.0);
    vec3 rimLight = sheenColor * rim * 0.5;

    return diffuse + velvet + rimLight;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Calculate fabric tangent from weave direction
 */
vec3 calculateFabricTangent(vec3 N, vec2 weaveDirection) {
    vec3 up = abs(N.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 T = normalize(cross(up, N));
    vec3 B = cross(N, T);

    float angle = atan(weaveDirection.y, weaveDirection.x);
    return cos(angle) * T + sin(angle) * B;
}

/**
 * Approximate cloth aging/wear
 */
vec3 applyClothWear(vec3 color, float wear, vec2 uv) {
    float wearNoise = hash(uv.x * 50.0 + uv.y * 50.0);
    float wearFactor = mix(1.0, wearNoise, wear);

    // Desaturate and lighten with wear
    float luma = luminance(color);
    vec3 aged = mix(color, vec3(luma * 1.2), wear * 0.5);

    return aged * wearFactor;
}
