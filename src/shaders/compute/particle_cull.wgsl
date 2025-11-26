// particle_cull.wgsl
// Particle Frustum Culling and Indirect Draw Buffer Generation

struct Particle {
    position: vec3<f32>,
    lifetime: f32,
    velocity: vec3<f32>,
    age: f32,
    force: vec3<f32>,
    mass: f32,
    color: vec4<f32>,
    size: f32,
    rotation: f32,
    angularVel: f32,
    _padding: f32,
}

struct FrustumPlane {
    normal: vec3<f32>,
    distance: f32,
}

struct CullParams {
    viewProjection: mat4x4<f32>,
    cameraPosition: vec3<f32>,
    maxParticles: u32,
    frustumPlanes: array<FrustumPlane, 6>,
    lodDistances: vec3<f32>, // Near, Mid, Far thresholds
    enableLOD: u32,
    enableFrustumCull: u32,
}

// Indirect draw command structure
struct IndirectDrawCommand {
    vertexCount: u32,
    instanceCount: atomic<u32>,
    firstVertex: u32,
    firstInstance: u32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: CullParams;
@group(0) @binding(2) var<storage, read_write> indirectDraw: IndirectDrawCommand;
@group(0) @binding(3) var<storage, read_write> visibleIndices: array<u32>;
@group(0) @binding(4) var<storage, read_write> visibleCount: atomic<u32>;

// Test if a point is inside the frustum
fn isInFrustum(position: vec3<f32>, radius: f32) -> bool {
    for (var i = 0; i < 6; i++) {
        let plane = params.frustumPlanes[i];
        let distance = dot(plane.normal, position) + plane.distance;
        if (distance < -radius) {
            return false;
        }
    }
    return true;
}

// Calculate LOD level based on distance from camera
fn calculateLOD(position: vec3<f32>) -> u32 {
    let distance = length(position - params.cameraPosition);

    if (distance < params.lodDistances.x) {
        return 0u; // High detail
    } else if (distance < params.lodDistances.y) {
        return 1u; // Medium detail
    } else if (distance < params.lodDistances.z) {
        return 2u; // Low detail
    } else {
        return 3u; // Cull (too far)
    }
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;

    if (index >= params.maxParticles) {
        return;
    }

    let particle = particles[index];

    // Skip dead particles
    if (particle.age >= particle.lifetime) {
        return;
    }

    var visible = true;

    // Frustum culling
    if (params.enableFrustumCull != 0u) {
        visible = isInFrustum(particle.position, particle.size);
    }

    // LOD culling
    if (visible && params.enableLOD != 0u) {
        let lod = calculateLOD(particle.position);
        if (lod >= 3u) {
            visible = false;
        }
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
    indirectDraw.vertexCount = 6u; // Quad particles (2 triangles)
    indirectDraw.firstVertex = 0u;
    indirectDraw.firstInstance = 0u;
}
