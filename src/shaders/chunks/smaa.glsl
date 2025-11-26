/**
 * smaa.glsl - Enhanced Subpixel Morphological Anti-Aliasing
 *
 * Three-pass anti-aliasing technique:
 * 1. Edge detection
 * 2. Blend weight calculation
 * 3. Neighborhood blending
 *
 * Dependencies:
 * - common.glsl for utilities
 */

#pragma requires(common)

// ============================================================================
// Configuration
// ============================================================================

#ifndef SMAA_THRESHOLD
#define SMAA_THRESHOLD 0.1
#endif

#ifndef SMAA_MAX_SEARCH_STEPS
#define SMAA_MAX_SEARCH_STEPS 16
#endif

#ifndef SMAA_MAX_SEARCH_STEPS_DIAG
#define SMAA_MAX_SEARCH_STEPS_DIAG 8
#endif

#ifndef SMAA_CORNER_ROUNDING
#define SMAA_CORNER_ROUNDING 25
#endif

// ============================================================================
// Pass 1: Edge Detection
// ============================================================================

/**
 * Luma edge detection
 */
vec2 SMAALumaEdgeDetection(sampler2D colorTexture, vec2 texCoord, vec4 offset[3]) {
    // Sample center
    float L = luminance(texture(colorTexture, texCoord).rgb);

    // Sample neighbors
    float Lleft = luminance(texture(colorTexture, offset[0].xy).rgb);
    float Ltop = luminance(texture(colorTexture, offset[0].zw).rgb);
    float Lright = luminance(texture(colorTexture, offset[1].xy).rgb);
    float Lbottom = luminance(texture(colorTexture, offset[1].zw).rgb);

    // Calculate deltas
    vec4 delta;
    delta.x = abs(L - Lleft);
    delta.y = abs(L - Ltop);
    delta.z = abs(L - Lright);
    delta.w = abs(L - Lbottom);

    // Maximum delta
    vec2 edges = step(SMAA_THRESHOLD, delta.xy);

    if (dot(edges, vec2(1.0)) == 0.0) {
        discard;
    }

    return edges;
}

/**
 * Color edge detection (more accurate but slower)
 */
vec2 SMAAColorEdgeDetection(sampler2D colorTexture, vec2 texCoord, vec4 offset[3]) {
    vec3 C = texture(colorTexture, texCoord).rgb;

    vec3 Cleft = texture(colorTexture, offset[0].xy).rgb;
    vec3 Ctop = texture(colorTexture, offset[0].zw).rgb;
    vec3 Cright = texture(colorTexture, offset[1].xy).rgb;
    vec3 Cbottom = texture(colorTexture, offset[1].zw).rgb;

    vec4 delta;
    delta.x = max(max(abs(C.r - Cleft.r), abs(C.g - Cleft.g)), abs(C.b - Cleft.b));
    delta.y = max(max(abs(C.r - Ctop.r), abs(C.g - Ctop.g)), abs(C.b - Ctop.b));
    delta.z = max(max(abs(C.r - Cright.r), abs(C.g - Cright.g)), abs(C.b - Cright.b));
    delta.w = max(max(abs(C.r - Cbottom.r), abs(C.g - Cbottom.g)), abs(C.b - Cbottom.b));

    vec2 edges = step(SMAA_THRESHOLD, delta.xy);

    if (dot(edges, vec2(1.0)) == 0.0) {
        discard;
    }

    return edges;
}

/**
 * Depth edge detection
 */
vec2 SMAADepthEdgeDetection(sampler2D depthTexture, vec2 texCoord, vec4 offset[3]) {
    float D = texture(depthTexture, texCoord).r;

    float Dleft = texture(depthTexture, offset[0].xy).r;
    float Dtop = texture(depthTexture, offset[0].zw).r;
    float Dright = texture(depthTexture, offset[1].xy).r;
    float Dbottom = texture(depthTexture, offset[1].zw).r;

    vec4 delta;
    delta.x = abs(D - Dleft);
    delta.y = abs(D - Dtop);
    delta.z = abs(D - Dright);
    delta.w = abs(D - Dbottom);

    vec2 edges = step(SMAA_THRESHOLD * 0.1, delta.xy);

    if (dot(edges, vec2(1.0)) == 0.0) {
        discard;
    }

    return edges;
}

// ============================================================================
// Pass 2: Blend Weight Calculation
// ============================================================================

/**
 * Search for pattern length
 */
float SMAASearchLength(sampler2D searchTex, vec2 e, float offset) {
    vec2 scale = vec2(66.0, 33.0) / vec2(64.0, 16.0);
    vec2 bias = vec2(33.0, 33.0) / vec2(64.0, 16.0);

    scale.y = -scale.y;

    vec2 coord = vec2(offset, e.y) * scale + bias;
    return texture(searchTex, coord).r;
}

/**
 * Search horizontally
 */
float SMAASearchXLeft(sampler2D edgesTex, sampler2D searchTex, vec2 texCoord, float end) {
    vec2 texelSize = 1.0 / vec2(textureSize(edgesTex, 0));

    vec2 e = vec2(0.0, 1.0);
    for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
        if (e.g <= 0.0 || texCoord.x < end) break;

        e = texture(edgesTex, texCoord).rg;
        texCoord -= vec2(2.0, 0.0) * texelSize;
    }

    float offset = -(255.0 / 127.0) * SMAASearchLength(searchTex, e, 0.0) + 3.25;
    return texelSize.x * offset;
}

/**
 * Search horizontally right
 */
float SMAASearchXRight(sampler2D edgesTex, sampler2D searchTex, vec2 texCoord, float end) {
    vec2 texelSize = 1.0 / vec2(textureSize(edgesTex, 0));

    vec2 e = vec2(0.0, 1.0);
    for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
        if (e.g <= 0.0 || texCoord.x > end) break;

        e = texture(edgesTex, texCoord).rg;
        texCoord += vec2(2.0, 0.0) * texelSize;
    }

    float offset = -(255.0 / 127.0) * SMAASearchLength(searchTex, e, 0.5) + 3.25;
    return -texelSize.x * offset;
}

/**
 * Search vertically up
 */
float SMAASearchYUp(sampler2D edgesTex, sampler2D searchTex, vec2 texCoord, float end) {
    vec2 texelSize = 1.0 / vec2(textureSize(edgesTex, 0));

    vec2 e = vec2(1.0, 0.0);
    for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
        if (e.r <= 0.0 || texCoord.y < end) break;

        e = texture(edgesTex, texCoord).rg;
        texCoord -= vec2(0.0, 2.0) * texelSize;
    }

    float offset = -(255.0 / 127.0) * SMAASearchLength(searchTex, e.gr, 0.0) + 3.25;
    return texelSize.y * offset;
}

/**
 * Search vertically down
 */
float SMAASearchYDown(sampler2D edgesTex, sampler2D searchTex, vec2 texCoord, float end) {
    vec2 texelSize = 1.0 / vec2(textureSize(edgesTex, 0));

    vec2 e = vec2(1.0, 0.0);
    for (int i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
        if (e.r <= 0.0 || texCoord.y > end) break;

        e = texture(edgesTex, texCoord).rg;
        texCoord += vec2(0.0, 2.0) * texelSize;
    }

    float offset = -(255.0 / 127.0) * SMAASearchLength(searchTex, e.gr, 0.5) + 3.25;
    return -texelSize.y * offset;
}

/**
 * Calculate blend weights
 */
vec4 SMAABlendingWeightCalculation(sampler2D edgesTex, sampler2D areaTex,
                                   sampler2D searchTex, vec2 texCoord,
                                   vec4 offset[3]) {
    vec4 weights = vec4(0.0);

    vec2 e = texture(edgesTex, texCoord).rg;

    if (e.g > 0.0) { // Edge at north
        vec2 d;

        // Find left and right edges
        vec2 coords;
        coords.x = SMAASearchXLeft(edgesTex, searchTex, offset[0].xy, offset[2].x);
        coords.y = SMAASearchXRight(edgesTex, searchTex, offset[0].zw, offset[2].y);

        d.x = coords.x;
        d.y = coords.y;

        // Sample area texture
        vec2 texelSize = 1.0 / vec2(textureSize(edgesTex, 0));
        vec4 coords_area = vec4(d.x, 0.0, d.y, e.g) + vec4(-1.0, 0.0, 1.0, 0.0) * texelSize.xyxy;
        weights.rg = texture(areaTex, coords_area.xy).rg;
    }

    if (e.r > 0.0) { // Edge at west
        vec2 d;

        // Find top and bottom edges
        vec2 coords;
        coords.x = SMAASearchYUp(edgesTex, searchTex, offset[1].xy, offset[2].z);
        coords.y = SMAASearchYDown(edgesTex, searchTex, offset[1].zw, offset[2].w);

        d.x = coords.x;
        d.y = coords.y;

        // Sample area texture
        vec2 texelSize = 1.0 / vec2(textureSize(edgesTex, 0));
        vec4 coords_area = vec4(0.0, d.x, e.r, d.y) + vec4(0.0, -1.0, 0.0, 1.0) * texelSize.xyxy;
        weights.ba = texture(areaTex, coords_area.yx).gr;
    }

    return weights;
}

// ============================================================================
// Pass 3: Neighborhood Blending
// ============================================================================

/**
 * Final neighborhood blending
 */
vec4 SMAANeighborhoodBlending(sampler2D colorTexture, sampler2D blendTexture,
                              vec2 texCoord, vec4 offset) {
    vec4 a;
    a.x = texture(blendTexture, offset.xy).a; // Right
    a.y = texture(blendTexture, offset.zw).g; // Top
    a.wz = texture(blendTexture, texCoord).xz; // Left / Bottom

    // Check for edges
    if (dot(a, vec4(1.0)) < EPSILON) {
        return texture(colorTexture, texCoord);
    }

    // Calculate offset
    vec2 texelSize = 1.0 / vec2(textureSize(colorTexture, 0));

    bool h = max(a.x, a.z) > max(a.y, a.w);

    vec4 blendingOffset = vec4(0.0, a.y, 0.0, a.w);
    vec2 blendingWeight = a.yw;

    if (h) {
        blendingOffset = vec4(a.x, 0.0, a.z, 0.0);
        blendingWeight = a.xz;
    }

    blendingOffset *= vec4(texelSize.x, texelSize.y, -texelSize.x, -texelSize.y);

    // Sample neighbors and blend
    vec4 color = texture(colorTexture, texCoord);
    color.rgb += texture(colorTexture, texCoord + blendingOffset.xy).rgb * blendingWeight.x;
    color.rgb += texture(colorTexture, texCoord + blendingOffset.zw).rgb * blendingWeight.y;
    color.rgb /= 1.0 + blendingWeight.x + blendingWeight.y;

    return color;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate SMAA offsets for edge detection
 */
void SMAAEdgeDetectionOffsets(vec2 texCoord, vec2 texelSize, out vec4 offset[3]) {
    offset[0] = texCoord.xyxy + texelSize.xyxy * vec4(-1.0, 0.0, 0.0, -1.0);
    offset[1] = texCoord.xyxy + texelSize.xyxy * vec4(1.0, 0.0, 0.0, 1.0);
    offset[2] = texCoord.xyxy + texelSize.xyxy * vec4(-2.0, 0.0, 0.0, -2.0);
}

/**
 * Calculate SMAA offsets for blending weight calculation
 */
void SMAABlendingWeightOffsets(vec2 texCoord, vec2 texelSize, out vec4 offset[3]) {
    offset[0] = texCoord.xyxy + texelSize.xyxy * vec4(-0.25, -0.125, 1.25, -0.125);
    offset[1] = texCoord.xyxy + texelSize.xyxy * vec4(-0.125, -0.25, -0.125, 1.25);

    // Search limits
    offset[2] = vec4(
        texCoord.x - float(SMAA_MAX_SEARCH_STEPS) * texelSize.x,
        texCoord.x + float(SMAA_MAX_SEARCH_STEPS) * texelSize.x,
        texCoord.y - float(SMAA_MAX_SEARCH_STEPS) * texelSize.y,
        texCoord.y + float(SMAA_MAX_SEARCH_STEPS) * texelSize.y
    );
}

/**
 * Calculate SMAA offsets for neighborhood blending
 */
vec4 SMAANeighborhoodBlendingOffsets(vec2 texCoord, vec2 texelSize) {
    return texCoord.xyxy + texelSize.xyxy * vec4(1.0, 0.0, 0.0, 1.0);
}

// ============================================================================
// Complete SMAA Pipeline
// ============================================================================

/**
 * Execute edge detection pass
 */
vec2 executeSMAAEdgeDetection(sampler2D colorTexture, vec2 texCoord) {
    vec2 texelSize = 1.0 / vec2(textureSize(colorTexture, 0));
    vec4 offset[3];
    SMAAEdgeDetectionOffsets(texCoord, texelSize, offset);

    #ifdef SMAA_USE_COLOR_EDGES
        return SMAAColorEdgeDetection(colorTexture, texCoord, offset);
    #else
        return SMAALumaEdgeDetection(colorTexture, texCoord, offset);
    #endif
}

/**
 * Execute blending weight calculation pass
 */
vec4 executeSMAABlendWeight(sampler2D edgesTex, sampler2D areaTex,
                            sampler2D searchTex, vec2 texCoord) {
    vec2 texelSize = 1.0 / vec2(textureSize(edgesTex, 0));
    vec4 offset[3];
    SMAABlendingWeightOffsets(texCoord, texelSize, offset);

    return SMAABlendingWeightCalculation(edgesTex, areaTex, searchTex, texCoord, offset);
}

/**
 * Execute neighborhood blending pass
 */
vec4 executeSMAABlending(sampler2D colorTexture, sampler2D blendTexture, vec2 texCoord) {
    vec2 texelSize = 1.0 / vec2(textureSize(colorTexture, 0));
    vec4 offset = SMAANeighborhoodBlendingOffsets(texCoord, texelSize);

    return SMAANeighborhoodBlending(colorTexture, blendTexture, texCoord, offset);
}
