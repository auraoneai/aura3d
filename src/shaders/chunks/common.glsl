/**
 * common.glsl - Common utilities and constants
 *
 * Provides fundamental constants, encoding/decoding functions, and utility operations
 * used across all shader chunks in G3D 5.0.
 *
 * Features:
 * - Mathematical constants (PI, EPSILON, etc.)
 * - Octahedron normal encoding/decoding
 * - Depth encoding/decoding
 * - Utility functions (saturate, luminance, sRGB conversions)
 * - Vector operations
 */

// ============================================================================
// Constants
// ============================================================================

#ifndef PI
#define PI 3.14159265359
#endif

#ifndef TWO_PI
#define TWO_PI 6.28318530718
#endif

#ifndef HALF_PI
#define HALF_PI 1.57079632679
#endif

#ifndef INV_PI
#define INV_PI 0.31830988618
#endif

#ifndef INV_TWO_PI
#define INV_TWO_PI 0.15915494309
#endif

#ifndef EPSILON
#define EPSILON 1e-6
#endif

#ifndef FLT_MAX
#define FLT_MAX 3.402823466e+38
#endif

#ifndef FLT_MIN
#define FLT_MIN 1.175494351e-38
#endif

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clamp value to [0, 1] range
 */
float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

vec2 saturate(vec2 x) {
    return clamp(x, 0.0, 1.0);
}

vec3 saturate(vec3 x) {
    return clamp(x, 0.0, 1.0);
}

vec4 saturate(vec4 x) {
    return clamp(x, 0.0, 1.0);
}

/**
 * Square function
 */
float sqr(float x) {
    return x * x;
}

vec2 sqr(vec2 x) {
    return x * x;
}

vec3 sqr(vec3 x) {
    return x * x;
}

/**
 * Safe division with epsilon
 */
float safeDivide(float a, float b) {
    return a / (b + EPSILON);
}

/**
 * Fast inverse square root approximation
 */
float fastInverseSqrt(float x) {
    return inversesqrt(x);
}

/**
 * Remap value from one range to another
 */
float remap(float value, float fromMin, float fromMax, float toMin, float toMax) {
    return toMin + (value - fromMin) * (toMax - toMin) / (fromMax - fromMin);
}

// ============================================================================
// Luminance Calculation
// ============================================================================

/**
 * Calculate luminance using Rec. 709 coefficients
 */
float luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

/**
 * Calculate luminance using Rec. 601 coefficients
 */
float luminance601(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

// ============================================================================
// sRGB Conversions
// ============================================================================

/**
 * Convert linear RGB to sRGB
 */
float linearToSRGB(float linear) {
    if (linear <= 0.0031308) {
        return linear * 12.92;
    } else {
        return 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
    }
}

vec3 linearToSRGB(vec3 linear) {
    return vec3(
        linearToSRGB(linear.r),
        linearToSRGB(linear.g),
        linearToSRGB(linear.b)
    );
}

vec4 linearToSRGB(vec4 linear) {
    return vec4(linearToSRGB(linear.rgb), linear.a);
}

/**
 * Convert sRGB to linear RGB
 */
float sRGBToLinear(float srgb) {
    if (srgb <= 0.04045) {
        return srgb / 12.92;
    } else {
        return pow((srgb + 0.055) / 1.055, 2.4);
    }
}

vec3 sRGBToLinear(vec3 srgb) {
    return vec3(
        sRGBToLinear(srgb.r),
        sRGBToLinear(srgb.g),
        sRGBToLinear(srgb.b)
    );
}

vec4 sRGBToLinear(vec4 srgb) {
    return vec4(sRGBToLinear(srgb.rgb), srgb.a);
}

/**
 * Fast sRGB approximations (less accurate but faster)
 */
vec3 fastLinearToSRGB(vec3 linear) {
    return pow(linear, vec3(1.0 / 2.2));
}

vec3 fastSRGBToLinear(vec3 srgb) {
    return pow(srgb, vec3(2.2));
}

// ============================================================================
// Octahedron Normal Encoding/Decoding
// ============================================================================

/**
 * Encode a normalized normal vector into octahedron representation
 * Returns: vec2 in range [-1, 1]
 */
vec2 encodeOctahedron(vec3 n) {
    n /= (abs(n.x) + abs(n.y) + abs(n.z));
    vec2 octWrap = (1.0 - abs(n.yx)) * (step(0.0, n.xy) * 2.0 - 1.0);
    return n.z >= 0.0 ? n.xy : octWrap;
}

/**
 * Decode octahedron representation back to normalized normal
 * Input: vec2 in range [-1, 1]
 */
vec3 decodeOctahedron(vec2 oct) {
    vec3 n = vec3(oct.x, oct.y, 1.0 - abs(oct.x) - abs(oct.y));
    float t = saturate(-n.z);
    n.x += n.x >= 0.0 ? -t : t;
    n.y += n.y >= 0.0 ? -t : t;
    return normalize(n);
}

/**
 * Encode normal to unsigned octahedron [0, 1]
 */
vec2 encodeOctahedronUnsigned(vec3 n) {
    return encodeOctahedron(n) * 0.5 + 0.5;
}

/**
 * Decode unsigned octahedron [0, 1] to normal
 */
vec3 decodeOctahedronUnsigned(vec2 oct) {
    return decodeOctahedron(oct * 2.0 - 1.0);
}

// ============================================================================
// Depth Encoding/Decoding
// ============================================================================

/**
 * Linearize depth from depth buffer
 * @param depth Non-linear depth from depth buffer [0, 1]
 * @param near Near plane distance
 * @param far Far plane distance
 */
float linearizeDepth(float depth, float near, float far) {
    float z = depth * 2.0 - 1.0; // Back to NDC
    return (2.0 * near * far) / (far + near - z * (far - near));
}

/**
 * Linearize depth (normalized) [0, 1]
 */
float linearizeDepthNormalized(float depth, float near, float far) {
    return linearizeDepth(depth, near, far) / far;
}

/**
 * Encode linear depth to logarithmic distribution
 */
float encodeDepthLog(float linearDepth, float near, float far) {
    float C = 1.0;
    float FC = 1.0 / log(far * C + 1.0);
    return log(linearDepth * C + 1.0) * FC;
}

/**
 * Decode logarithmic depth back to linear
 */
float decodeDepthLog(float encodedDepth, float near, float far) {
    float C = 1.0;
    float FC = 1.0 / log(far * C + 1.0);
    return (exp(encodedDepth / FC) - 1.0) / C;
}

/**
 * Reconstruct view space position from depth
 */
vec3 reconstructViewPosition(vec2 texCoord, float depth, mat4 invProjection) {
    vec4 clipSpacePosition = vec4(texCoord * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 viewSpacePosition = invProjection * clipSpacePosition;
    return viewSpacePosition.xyz / viewSpacePosition.w;
}

/**
 * Reconstruct world space position from depth
 */
vec3 reconstructWorldPosition(vec2 texCoord, float depth, mat4 invViewProjection) {
    vec4 clipSpacePosition = vec4(texCoord * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 worldSpacePosition = invViewProjection * clipSpacePosition;
    return worldSpacePosition.xyz / worldSpacePosition.w;
}

// ============================================================================
// Color Space Conversions
// ============================================================================

/**
 * RGB to HSV conversion
 */
vec3 rgbToHsv(vec3 rgb) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(rgb.bg, K.wz), vec4(rgb.gb, K.xy), step(rgb.b, rgb.g));
    vec4 q = mix(vec4(p.xyw, rgb.r), vec4(rgb.r, p.yzx), step(p.x, rgb.r));

    float d = q.x - min(q.w, q.y);
    float e = EPSILON;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

/**
 * HSV to RGB conversion
 */
vec3 hsvToRgb(vec3 hsv) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www);
    return hsv.z * mix(K.xxx, saturate(p - K.xxx), hsv.y);
}

// ============================================================================
// Vector Utilities
// ============================================================================

/**
 * Get perpendicular vector
 */
vec3 getPerpendicularVector(vec3 v) {
    vec3 a = abs(v);
    if (a.x <= a.y && a.x <= a.z) {
        return vec3(0.0, -v.z, v.y);
    } else if (a.y <= a.x && a.y <= a.z) {
        return vec3(-v.z, 0.0, v.x);
    } else {
        return vec3(-v.y, v.x, 0.0);
    }
}

/**
 * Build orthonormal basis from normal
 */
void buildOrthonormalBasis(vec3 n, out vec3 tangent, out vec3 bitangent) {
    tangent = normalize(getPerpendicularVector(n));
    bitangent = cross(n, tangent);
}

/**
 * Transform vector from tangent space to world space
 */
vec3 tangentToWorld(vec3 vec, vec3 normal, vec3 tangent, vec3 bitangent) {
    return vec.x * tangent + vec.y * bitangent + vec.z * normal;
}

/**
 * Transform vector from world space to tangent space
 */
vec3 worldToTangent(vec3 vec, vec3 normal, vec3 tangent, vec3 bitangent) {
    return vec3(dot(vec, tangent), dot(vec, bitangent), dot(vec, normal));
}

// ============================================================================
// Hash Functions
// ============================================================================

/**
 * Fast hash function for noise generation
 */
float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}

vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
}

// ============================================================================
// Packing/Unpacking
// ============================================================================

/**
 * Pack two floats into one
 */
float packFloat2(vec2 v) {
    return dot(floor(v * vec2(255.0, 1.0)), vec2(1.0 / 255.0, 1.0));
}

/**
 * Unpack two floats from one
 */
vec2 unpackFloat2(float f) {
    vec2 v;
    v.y = floor(f);
    v.x = fract(f) * 255.0 / 254.0;
    return v;
}

/**
 * Pack RGBA to float (8 bits per channel)
 */
float packRGBA(vec4 color) {
    color = saturate(color);
    return dot(floor(color * 255.0), vec4(1.0, 256.0, 65536.0, 16777216.0)) / 16777216.0;
}

/**
 * Unpack float to RGBA
 */
vec4 unpackRGBA(float f) {
    vec4 color;
    color.a = floor(f / 16777216.0);
    f -= color.a * 16777216.0;
    color.b = floor(f / 65536.0);
    f -= color.b * 65536.0;
    color.g = floor(f / 256.0);
    f -= color.g * 256.0;
    color.r = f;
    return color / 255.0;
}
