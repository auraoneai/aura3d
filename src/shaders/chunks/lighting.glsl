/**
 * lighting.glsl - Lighting structures and evaluation functions
 *
 * Provides light source definitions and evaluation functions for:
 * - Directional lights
 * - Point lights
 * - Spot lights
 * - Area lights (sphere and rectangle)
 *
 * Dependencies:
 * - common.glsl for constants and utilities
 * - pbr.glsl for BRDF evaluation
 */

#pragma requires(common)
#pragma requires(pbr)

// ============================================================================
// Light Structures
// ============================================================================

/**
 * Directional Light
 */
struct DirectionalLight {
    vec3 direction;      // Light direction (normalized, pointing away from surface)
    vec3 color;          // Light color (linear RGB)
    float intensity;     // Light intensity multiplier
    #ifdef LIGHTING_USE_SHADOWS
    mat4 shadowMatrix;   // World to shadow space transform
    int shadowMapIndex;  // Index into shadow map array
    #endif
};

/**
 * Point Light
 */
struct PointLight {
    vec3 position;       // Light position in world space
    vec3 color;          // Light color (linear RGB)
    float intensity;     // Light intensity
    float range;         // Maximum influence range
    #ifdef LIGHTING_USE_SHADOWS
    int shadowMapIndex;  // Index into shadow cubemap array
    #endif
};

/**
 * Spot Light
 */
struct SpotLight {
    vec3 position;       // Light position in world space
    vec3 direction;      // Light direction (normalized)
    vec3 color;          // Light color (linear RGB)
    float intensity;     // Light intensity
    float range;         // Maximum influence range
    float innerConeAngle; // Inner cone angle (radians)
    float outerConeAngle; // Outer cone angle (radians)
    #ifdef LIGHTING_USE_SHADOWS
    mat4 shadowMatrix;   // World to shadow space transform
    int shadowMapIndex;  // Index into shadow map array
    #endif
};

/**
 * Area Light - Sphere
 */
struct SphereLight {
    vec3 position;       // Light position in world space
    vec3 color;          // Light color (linear RGB)
    float intensity;     // Light intensity
    float radius;        // Sphere radius
    float range;         // Maximum influence range
};

/**
 * Area Light - Rectangle
 */
struct RectLight {
    vec3 position;       // Center position in world space
    vec3 normal;         // Surface normal (normalized)
    vec3 tangent;        // Tangent direction (normalized)
    vec3 color;          // Light color (linear RGB)
    float intensity;     // Light intensity
    float width;         // Rectangle width
    float height;        // Rectangle height
    bool twoSided;       // Whether light emits from both sides
};

// ============================================================================
// Attenuation Functions
// ============================================================================

/**
 * Distance attenuation with physically accurate inverse square falloff
 * @param distance Distance from light
 * @param range Maximum influence range
 */
float getDistanceAttenuation(float distance, float range) {
    #ifdef LIGHTING_USE_PHYSICAL_ATTENUATION
        // Physically accurate inverse square with smooth cutoff
        float attenuation = 1.0 / (distance * distance + 1.0);
        float windowing = sqr(saturate(1.0 - sqr(sqr(distance / range))));
        return attenuation * windowing;
    #else
        // UE4-style attenuation
        float d = distance / range;
        float d2 = d * d;
        float d4 = d2 * d2;
        float falloff = saturate(1.0 - d4);
        return sqr(falloff) / (distance * distance + 1.0);
    #endif
}

/**
 * Spot light cone attenuation
 * @param lightDir Light direction
 * @param spotDir Spot light direction
 * @param innerCos Cosine of inner cone angle
 * @param outerCos Cosine of outer cone angle
 */
float getSpotAttenuation(vec3 lightDir, vec3 spotDir, float innerCos, float outerCos) {
    float cd = dot(-lightDir, spotDir);
    float attenuation = saturate((cd - outerCos) / (innerCos - outerCos));
    return attenuation * attenuation;
}

/**
 * Angular attenuation for barn door effect
 */
float getAngularAttenuation(vec3 lightDir, vec3 normal, float softness) {
    float angle = dot(lightDir, normal);
    return smoothstep(-softness, softness, angle);
}

// ============================================================================
// Directional Light Evaluation
// ============================================================================

/**
 * Evaluate directional light contribution
 * @param light Directional light
 * @param worldPos Surface position in world space
 * @param N Surface normal
 * @param V View direction
 * @param albedo Base color
 * @param metallic Metallic factor
 * @param roughness Roughness factor
 */
vec3 evaluateDirectionalLight(DirectionalLight light, vec3 worldPos, vec3 N, vec3 V,
                               vec3 albedo, float metallic, float roughness) {
    vec3 L = -light.direction;
    float NdotL = max(dot(N, L), 0.0);

    if (NdotL < EPSILON) {
        return vec3(0.0);
    }

    // Evaluate BRDF
    vec3 brdf = BRDF_Evaluate(N, V, L, albedo, metallic, roughness);

    // Apply light color and intensity
    vec3 radiance = light.color * light.intensity;

    return brdf * radiance * NdotL;
}

// ============================================================================
// Point Light Evaluation
// ============================================================================

/**
 * Evaluate point light contribution
 */
vec3 evaluatePointLight(PointLight light, vec3 worldPos, vec3 N, vec3 V,
                        vec3 albedo, float metallic, float roughness) {
    vec3 L = light.position - worldPos;
    float distance = length(L);
    L = L / distance; // Normalize

    float NdotL = max(dot(N, L), 0.0);

    if (NdotL < EPSILON || distance > light.range) {
        return vec3(0.0);
    }

    // Distance attenuation
    float attenuation = getDistanceAttenuation(distance, light.range);

    if (attenuation < EPSILON) {
        return vec3(0.0);
    }

    // Evaluate BRDF
    vec3 brdf = BRDF_Evaluate(N, V, L, albedo, metallic, roughness);

    // Apply light color, intensity, and attenuation
    vec3 radiance = light.color * light.intensity * attenuation;

    return brdf * radiance * NdotL;
}

// ============================================================================
// Spot Light Evaluation
// ============================================================================

/**
 * Evaluate spot light contribution
 */
vec3 evaluateSpotLight(SpotLight light, vec3 worldPos, vec3 N, vec3 V,
                       vec3 albedo, float metallic, float roughness) {
    vec3 L = light.position - worldPos;
    float distance = length(L);
    L = L / distance; // Normalize

    float NdotL = max(dot(N, L), 0.0);

    if (NdotL < EPSILON || distance > light.range) {
        return vec3(0.0);
    }

    // Distance attenuation
    float distAttenuation = getDistanceAttenuation(distance, light.range);

    if (distAttenuation < EPSILON) {
        return vec3(0.0);
    }

    // Spot cone attenuation
    float innerCos = cos(light.innerConeAngle);
    float outerCos = cos(light.outerConeAngle);
    float spotAttenuation = getSpotAttenuation(L, light.direction, innerCos, outerCos);

    if (spotAttenuation < EPSILON) {
        return vec3(0.0);
    }

    // Evaluate BRDF
    vec3 brdf = BRDF_Evaluate(N, V, L, albedo, metallic, roughness);

    // Apply light color, intensity, and attenuation
    vec3 radiance = light.color * light.intensity * distAttenuation * spotAttenuation;

    return brdf * radiance * NdotL;
}

// ============================================================================
// Area Light Evaluation - Sphere
// ============================================================================

/**
 * Representative point for sphere area light (Karis 2013)
 */
vec3 getSphereLightRepresentativePoint(SphereLight light, vec3 worldPos, vec3 N, vec3 V, float roughness) {
    vec3 L = light.position - worldPos;
    vec3 R = reflect(-V, N);

    // Find closest point on sphere to reflection ray
    vec3 centerToRay = dot(L, R) * R - L;
    vec3 closestPoint = L + centerToRay * saturate(light.radius / length(centerToRay));

    return normalize(closestPoint);
}

/**
 * Evaluate sphere area light contribution
 */
vec3 evaluateSphereLight(SphereLight light, vec3 worldPos, vec3 N, vec3 V,
                         vec3 albedo, float metallic, float roughness) {
    // Get representative point
    vec3 L = getSphereLightRepresentativePoint(light, worldPos, N, V, roughness);

    float distance = length(light.position - worldPos);
    float NdotL = max(dot(N, L), 0.0);

    if (NdotL < EPSILON || distance > light.range) {
        return vec3(0.0);
    }

    // Distance attenuation
    float attenuation = getDistanceAttenuation(distance, light.range);

    if (attenuation < EPSILON) {
        return vec3(0.0);
    }

    // Sphere normalization factor
    float sphereAngle = saturate(light.radius / distance);
    float sphereNormalization = sqr(roughness / saturate(roughness + 0.5 * sphereAngle));

    // Evaluate BRDF with modified roughness
    float modifiedRoughness = saturate(roughness + light.radius / (distance * 2.0));
    vec3 brdf = BRDF_Evaluate(N, V, L, albedo, metallic, modifiedRoughness);

    // Apply light color, intensity, and attenuation
    vec3 radiance = light.color * light.intensity * attenuation * sphereNormalization;

    return brdf * radiance * NdotL;
}

// ============================================================================
// Area Light Evaluation - Rectangle
// ============================================================================

#ifdef LIGHTING_USE_RECT_LIGHTS

/**
 * Rectangle area light using LTC (Linearly Transformed Cosines)
 * Requires LTC lookup tables
 */
vec3 evaluateRectLight(RectLight light, vec3 worldPos, vec3 N, vec3 V,
                       vec3 albedo, float metallic, float roughness,
                       sampler2D ltcMat, sampler2D ltcMag) {
    // Calculate rectangle corners
    vec3 bitangent = cross(light.normal, light.tangent);
    vec3 corners[4];
    corners[0] = light.position - light.tangent * light.width * 0.5 - bitangent * light.height * 0.5;
    corners[1] = light.position + light.tangent * light.width * 0.5 - bitangent * light.height * 0.5;
    corners[2] = light.position + light.tangent * light.width * 0.5 + bitangent * light.height * 0.5;
    corners[3] = light.position - light.tangent * light.width * 0.5 + bitangent * light.height * 0.5;

    // Transform to local space
    vec3 T1 = normalize(V - N * dot(V, N));
    vec3 T2 = cross(N, T1);

    // LTC lookup
    float NdotV = saturate(dot(N, V));
    vec2 uv = vec2(roughness, sqrt(1.0 - NdotV));
    vec4 ltcMatrixData = texture(ltcMat, uv);
    float ltcMagnitude = texture(ltcMag, uv).a;

    // Construct LTC matrix
    mat3 ltcMatrix = mat3(
        vec3(ltcMatrixData.x, 0.0, ltcMatrixData.y),
        vec3(0.0, 1.0, 0.0),
        vec3(ltcMatrixData.z, 0.0, ltcMatrixData.w)
    );

    // Transform corners
    vec3 transformedCorners[4];
    for (int i = 0; i < 4; i++) {
        vec3 localCorner = corners[i] - worldPos;
        transformedCorners[i] = normalize(ltcMatrix * vec3(
            dot(localCorner, T1),
            dot(localCorner, N),
            dot(localCorner, T2)
        ));
    }

    // Integrate over transformed polygon
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        vec3 v1 = transformedCorners[i];
        vec3 v2 = transformedCorners[(i + 1) % 4];
        sum += acos(dot(v1, v2)) * normalize(cross(v1, v2));
    }

    float spec = max(0.0, sum.y) * ltcMagnitude;

    // Calculate F0
    vec3 F0 = mix(vec3(PBR_DIELECTRIC_SPECULAR), albedo, metallic);

    // Fresnel
    vec3 fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    // Diffuse contribution
    float diffuse = max(0.0, dot(light.normal, normalize(worldPos - light.position)));

    vec3 specular = fresnel * spec;
    vec3 diffuseTerm = (1.0 - metallic) * albedo * diffuse * INV_PI;

    return (specular + diffuseTerm) * light.color * light.intensity;
}

#endif

// ============================================================================
// Light List Evaluation
// ============================================================================

#ifdef LIGHTING_USE_LIGHT_ARRAYS

/**
 * Evaluate all directional lights
 */
vec3 evaluateDirectionalLights(DirectionalLight lights[LIGHTING_MAX_DIRECTIONAL_LIGHTS],
                               int numLights, vec3 worldPos, vec3 N, vec3 V,
                               vec3 albedo, float metallic, float roughness) {
    vec3 totalLight = vec3(0.0);

    for (int i = 0; i < numLights && i < LIGHTING_MAX_DIRECTIONAL_LIGHTS; i++) {
        totalLight += evaluateDirectionalLight(lights[i], worldPos, N, V, albedo, metallic, roughness);
    }

    return totalLight;
}

/**
 * Evaluate all point lights
 */
vec3 evaluatePointLights(PointLight lights[LIGHTING_MAX_POINT_LIGHTS],
                         int numLights, vec3 worldPos, vec3 N, vec3 V,
                         vec3 albedo, float metallic, float roughness) {
    vec3 totalLight = vec3(0.0);

    for (int i = 0; i < numLights && i < LIGHTING_MAX_POINT_LIGHTS; i++) {
        totalLight += evaluatePointLight(lights[i], worldPos, N, V, albedo, metallic, roughness);
    }

    return totalLight;
}

/**
 * Evaluate all spot lights
 */
vec3 evaluateSpotLights(SpotLight lights[LIGHTING_MAX_SPOT_LIGHTS],
                        int numLights, vec3 worldPos, vec3 N, vec3 V,
                        vec3 albedo, float metallic, float roughness) {
    vec3 totalLight = vec3(0.0);

    for (int i = 0; i < numLights && i < LIGHTING_MAX_SPOT_LIGHTS; i++) {
        totalLight += evaluateSpotLight(lights[i], worldPos, N, V, albedo, metallic, roughness);
    }

    return totalLight;
}

#endif

// ============================================================================
// Ambient Lighting
// ============================================================================

/**
 * Simple ambient lighting
 */
vec3 evaluateAmbientLight(vec3 albedo, vec3 ambientColor, float ambientIntensity) {
    return albedo * ambientColor * ambientIntensity;
}

/**
 * Hemisphere ambient lighting
 */
vec3 evaluateHemisphereAmbient(vec3 N, vec3 albedo, vec3 skyColor, vec3 groundColor, float intensity) {
    float hemisphereBlend = N.y * 0.5 + 0.5;
    vec3 ambientColor = mix(groundColor, skyColor, hemisphereBlend);
    return albedo * ambientColor * intensity;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate light visibility (for use with shadow mapping)
 */
float getLightVisibility(vec3 worldPos, vec3 N, vec3 L) {
    // This is a placeholder - actual implementation requires shadow.glsl
    return 1.0;
}

/**
 * Get light radiance at a point
 */
vec3 getLightRadiance(vec3 lightColor, float lightIntensity, float attenuation) {
    return lightColor * lightIntensity * attenuation;
}
