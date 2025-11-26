// gpu_culling.wgsl
// PRD Section 6.4.5 - GPU Culling with Frustum and Hi-Z Occlusion Testing
// Performance Target: 1M instances < 1ms

struct Instance {
    transform: mat4x4<f32>,
    boundingSphere: vec4<f32>, // xyz = center, w = radius
    boundingBoxMin: vec3<f32>,
    _padding1: f32,
    boundingBoxMax: vec3<f32>,
    _padding2: f32,
}

struct FrustumPlane {
    normal: vec3<f32>,
    distance: f32,
}

struct CullParams {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    cameraPosition: vec3<f32>,
    instanceCount: u32,
    frustumPlanes: array<FrustumPlane, 6>,
    enableFrustumCull: u32,
    enableOcclusionCull: u32,
    hizWidth: u32,
    hizHeight: u32,
    hizLevels: u32,
}

struct IndirectDrawCommand {
    indexCount: u32,
    instanceCount: atomic<u32>,
    firstIndex: u32,
    vertexOffset: i32,
    firstInstance: u32,
}

@group(0) @binding(0) var<storage, read> instances: array<Instance>;
@group(0) @binding(1) var<uniform> params: CullParams;
@group(0) @binding(2) var<storage, read_write> indirectDraw: IndirectDrawCommand;
@group(0) @binding(3) var<storage, read_write> visibleIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> visibleCount: atomic<u32>;
@group(0) @binding(5) var hizTexture: texture_2d<f32>;
@group(0) @binding(6) var hizSampler: sampler;

// Frustum-Sphere test
fn frustumSphereTest(center: vec3<f32>, radius: f32) -> bool {
    for (var i = 0; i < 6; i++) {
        let plane = params.frustumPlanes[i];
        let distance = dot(plane.normal, center) + plane.distance;
        if (distance < -radius) {
            return false; // Outside frustum
        }
    }
    return true; // Inside or intersecting frustum
}

// Frustum-AABB test
fn frustumAABBTest(minBounds: vec3<f32>, maxBounds: vec3<f32>) -> bool {
    for (var i = 0; i < 6; i++) {
        let plane = params.frustumPlanes[i];

        // Find the positive vertex (furthest along plane normal)
        var pVertex = minBounds;
        if (plane.normal.x >= 0.0) { pVertex.x = maxBounds.x; }
        if (plane.normal.y >= 0.0) { pVertex.y = maxBounds.y; }
        if (plane.normal.z >= 0.0) { pVertex.z = maxBounds.z; }

        // If positive vertex is outside, AABB is outside
        if (dot(plane.normal, pVertex) + plane.distance < 0.0) {
            return false;
        }
    }
    return true;
}

// Project AABB to screen space and get min/max depth
fn projectAABB(minBounds: vec3<f32>, maxBounds: vec3<f32>) -> vec4<f32> {
    // Get all 8 corners of AABB
    var corners: array<vec3<f32>, 8>;
    corners[0] = vec3<f32>(minBounds.x, minBounds.y, minBounds.z);
    corners[1] = vec3<f32>(maxBounds.x, minBounds.y, minBounds.z);
    corners[2] = vec3<f32>(minBounds.x, maxBounds.y, minBounds.z);
    corners[3] = vec3<f32>(maxBounds.x, maxBounds.y, minBounds.z);
    corners[4] = vec3<f32>(minBounds.x, minBounds.y, maxBounds.z);
    corners[5] = vec3<f32>(maxBounds.x, minBounds.y, maxBounds.z);
    corners[6] = vec3<f32>(minBounds.x, maxBounds.y, maxBounds.z);
    corners[7] = vec3<f32>(maxBounds.x, maxBounds.y, maxBounds.z);

    var minScreen = vec2<f32>(1e10);
    var maxScreen = vec2<f32>(-1e10);
    var minDepth = 1.0;
    var maxDepth = 0.0;

    for (var i = 0; i < 8; i++) {
        let clipPos = params.viewProjection * vec4<f32>(corners[i], 1.0);

        // Perspective divide
        if (clipPos.w > 0.0) {
            let ndcPos = clipPos.xyz / clipPos.w;

            // Convert to screen space [0, 1]
            let screenPos = ndcPos.xy * 0.5 + 0.5;
            minScreen = min(minScreen, screenPos);
            maxScreen = max(maxScreen, screenPos);

            // Track depth range
            minDepth = min(minDepth, ndcPos.z);
            maxDepth = max(maxDepth, ndcPos.z);
        }
    }

    return vec4<f32>(minScreen, maxScreen);
}

// Hi-Z occlusion test
fn hiZOcclusionTest(minBounds: vec3<f32>, maxBounds: vec3<f32>) -> bool {
    // Project AABB to screen space
    let screenBounds = projectAABB(minBounds, maxBounds);
    let minScreen = screenBounds.xy;
    let maxScreen = screenBounds.zw;

    // Clamp to screen
    let clampedMin = clamp(minScreen, vec2<f32>(0.0), vec2<f32>(1.0));
    let clampedMax = clamp(maxScreen, vec2<f32>(0.0), vec2<f32>(1.0));

    // Calculate screen area in pixels
    let screenSize = vec2<f32>(f32(params.hizWidth), f32(params.hizHeight));
    let pixelMin = clampedMin * screenSize;
    let pixelMax = clampedMax * screenSize;
    let pixelSize = pixelMax - pixelMin;

    // Calculate appropriate mip level
    let maxDim = max(pixelSize.x, pixelSize.y);
    let mipLevel = u32(clamp(log2(maxDim), 0.0, f32(params.hizLevels - 1u)));

    // Sample Hi-Z buffer at calculated mip level
    let uvMin = clampedMin;
    let uvMax = clampedMax;
    let uvCenter = (uvMin + uvMax) * 0.5;

    let hizDepth = textureSampleLevel(hizTexture, hizSampler, uvCenter, f32(mipLevel)).r;

    // Get closest depth of AABB
    let viewPos = params.view * vec4<f32>((minBounds + maxBounds) * 0.5, 1.0);
    let projPos = params.projection * viewPos;
    let ndcDepth = projPos.z / projPos.w;
    let linearDepth = ndcDepth * 0.5 + 0.5; // Convert to [0, 1]

    // If AABB is behind Hi-Z depth, it's occluded
    return linearDepth <= hizDepth + 0.001; // Small bias for precision
}

// Main culling compute shader
@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;

    if (index >= params.instanceCount) {
        return;
    }

    let instance = instances[index];

    // Transform bounding sphere center to world space
    let worldCenter = (instance.transform * vec4<f32>(instance.boundingSphere.xyz, 1.0)).xyz;
    let radius = instance.boundingSphere.w;

    // Transform AABB to world space
    let worldMin = (instance.transform * vec4<f32>(instance.boundingBoxMin, 1.0)).xyz;
    let worldMax = (instance.transform * vec4<f32>(instance.boundingBoxMax, 1.0)).xyz;

    var visible = true;

    // Frustum culling
    if (params.enableFrustumCull != 0u) {
        // First test sphere (faster)
        if (!frustumSphereTest(worldCenter, radius)) {
            visible = false;
        } else {
            // If sphere passes, test AABB (more accurate)
            visible = frustumAABBTest(worldMin, worldMax);
        }
    }

    // Occlusion culling (Hi-Z)
    if (visible && params.enableOcclusionCull != 0u) {
        visible = hiZOcclusionTest(worldMin, worldMax);
    }

    // If visible, add to visible list
    if (visible) {
        let visibleIndex = atomicAdd(&visibleCount, 1u);
        visibleIndices[visibleIndex] = index;
        atomicAdd(&indirectDraw.instanceCount, 1u);
    }
}

// Reset pass - clear counters before culling
@compute @workgroup_size(1, 1, 1)
fn reset() {
    atomicStore(&visibleCount, 0u);
    atomicStore(&indirectDraw.instanceCount, 0u);
    indirectDraw.indexCount = 36u; // Cube mesh (12 triangles)
    indirectDraw.firstIndex = 0u;
    indirectDraw.vertexOffset = 0;
    indirectDraw.firstInstance = 0u;
}

// Two-phase culling: broad phase (sphere) + narrow phase (AABB)
@compute @workgroup_size(256, 1, 1)
fn broadPhaseCull(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;

    if (index >= params.instanceCount) {
        return;
    }

    let instance = instances[index];
    let worldCenter = (instance.transform * vec4<f32>(instance.boundingSphere.xyz, 1.0)).xyz;
    let radius = instance.boundingSphere.w;

    // Quick sphere test
    if (frustumSphereTest(worldCenter, radius)) {
        let visibleIndex = atomicAdd(&visibleCount, 1u);
        visibleIndices[visibleIndex] = index;
    }
}

@compute @workgroup_size(256, 1, 1)
fn narrowPhaseCull(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let broadPhaseCount = atomicLoad(&visibleCount);

    if (index >= broadPhaseCount) {
        return;
    }

    let instanceIndex = visibleIndices[index];
    let instance = instances[instanceIndex];

    let worldMin = (instance.transform * vec4<f32>(instance.boundingBoxMin, 1.0)).xyz;
    let worldMax = (instance.transform * vec4<f32>(instance.boundingBoxMax, 1.0)).xyz;

    // Accurate AABB test
    var visible = frustumAABBTest(worldMin, worldMax);

    // Occlusion test
    if (visible && params.enableOcclusionCull != 0u) {
        visible = hiZOcclusionTest(worldMin, worldMax);
    }

    if (visible) {
        atomicAdd(&indirectDraw.instanceCount, 1u);
    }
}
