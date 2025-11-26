// volume_density.wgsl
// 3D Volume Density Field Computation
// Metaball Evaluation and SDF Operations

struct Metaball {
    position: vec3<f32>,
    radius: f32,
    strength: f32,
    _padding: array<f32, 3>,
}

struct VolumeParams {
    volumeDim: vec3<u32>,
    _padding1: u32,
    volumeMin: vec3<f32>,
    volumeMax: vec3<f32>,
    cellSize: f32,
    threshold: f32,
    metaballCount: u32,
    blendMode: u32, // 0=Add, 1=Max, 2=SmoothMin
    smoothFactor: f32,
    falloffPower: f32,
}

struct VolumeCell {
    density: f32,
    gradient: vec3<f32>,
}

@group(0) @binding(0) var<storage, read> metaballs: array<Metaball>;
@group(0) @binding(1) var<storage, read_write> volumeData: array<VolumeCell>;
@group(0) @binding(2) var<uniform> params: VolumeParams;

fn index3D(x: u32, y: u32, z: u32) -> u32 {
    return x + y * params.volumeDim.x + z * params.volumeDim.x * params.volumeDim.y;
}

// Metaball field contribution
fn metaballField(position: vec3<f32>, ball: Metaball) -> f32 {
    let diff = position - ball.position;
    let dist = length(diff);

    if (dist >= ball.radius) {
        return 0.0;
    }

    // Wyvill falloff function (smooth)
    let r = dist / ball.radius;
    let r2 = r * r;
    let r4 = r2 * r2;
    let r6 = r4 * r2;

    let falloff = pow(1.0 - r2, params.falloffPower);
    return ball.strength * falloff;
}

// Smooth minimum for blending
fn smoothMin(a: f32, b: f32, k: f32) -> f32 {
    let h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

// Smooth maximum for blending
fn smoothMax(a: f32, b: f32, k: f32) -> f32 {
    return -smoothMin(-a, -b, k);
}

// Sphere SDF
fn sphereSDF(position: vec3<f32>, center: vec3<f32>, radius: f32) -> f32 {
    return length(position - center) - radius;
}

// Box SDF
fn boxSDF(position: vec3<f32>, center: vec3<f32>, size: vec3<f32>) -> f32 {
    let q = abs(position - center) - size;
    return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Torus SDF
fn torusSDF(position: vec3<f32>, center: vec3<f32>, majorRadius: f32, minorRadius: f32) -> f32 {
    let p = position - center;
    let q = vec2<f32>(length(p.xz) - majorRadius, p.y);
    return length(q) - minorRadius;
}

// Union operation (min)
fn sdfUnion(d1: f32, d2: f32) -> f32 {
    return min(d1, d2);
}

// Subtraction operation
fn sdfSubtract(d1: f32, d2: f32) -> f32 {
    return max(d1, -d2);
}

// Intersection operation
fn sdfIntersect(d1: f32, d2: f32) -> f32 {
    return max(d1, d2);
}

// Smooth union
fn sdfSmoothUnion(d1: f32, d2: f32, k: f32) -> f32 {
    return smoothMin(d1, d2, k);
}

// Compute density field
@compute @workgroup_size(8, 8, 8)
fn computeDensity(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;
    let z = globalId.z;

    if (x >= params.volumeDim.x || y >= params.volumeDim.y || z >= params.volumeDim.z) {
        return;
    }

    // Calculate world position of this voxel
    let normalizedPos = vec3<f32>(f32(x), f32(y), f32(z)) / vec3<f32>(params.volumeDim);
    let worldPos = mix(params.volumeMin, params.volumeMax, normalizedPos);

    var density = 0.0;

    // Evaluate all metaballs
    for (var i = 0u; i < params.metaballCount; i++) {
        let ball = metaballs[i];
        let contribution = metaballField(worldPos, ball);

        // Blend based on mode
        switch (params.blendMode) {
            case 0u: { // Add
                density += contribution;
            }
            case 1u: { // Max
                density = max(density, contribution);
            }
            case 2u: { // Smooth Min (for SDF)
                if (i == 0u) {
                    density = contribution;
                } else {
                    density = smoothMin(density, contribution, params.smoothFactor);
                }
            }
            default: {
                density += contribution;
            }
        }
    }

    let idx = index3D(x, y, z);
    volumeData[idx].density = density;
}

// Compute gradient (for normal calculation)
@compute @workgroup_size(8, 8, 8)
fn computeGradient(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;
    let z = globalId.z;

    if (x >= params.volumeDim.x || y >= params.volumeDim.y || z >= params.volumeDim.z) {
        return;
    }

    let idx = index3D(x, y, z);

    // Sample neighboring cells for gradient calculation
    var gradient = vec3<f32>(0.0);

    // X gradient
    if (x > 0u && x < params.volumeDim.x - 1u) {
        let idxPrev = index3D(x - 1u, y, z);
        let idxNext = index3D(x + 1u, y, z);
        gradient.x = (volumeData[idxNext].density - volumeData[idxPrev].density) / (2.0 * params.cellSize);
    }

    // Y gradient
    if (y > 0u && y < params.volumeDim.y - 1u) {
        let idxPrev = index3D(x, y - 1u, z);
        let idxNext = index3D(x, y + 1u, z);
        gradient.y = (volumeData[idxNext].density - volumeData[idxPrev].density) / (2.0 * params.cellSize);
    }

    // Z gradient
    if (z > 0u && z < params.volumeDim.z - 1u) {
        let idxPrev = index3D(x, y, z - 1u);
        let idxNext = index3D(x, y, z + 1u);
        gradient.z = (volumeData[idxNext].density - volumeData[idxPrev].density) / (2.0 * params.cellSize);
    }

    volumeData[idx].gradient = gradient;
}

// Clear volume data
@compute @workgroup_size(8, 8, 8)
fn clearVolume(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;
    let z = globalId.z;

    if (x >= params.volumeDim.x || y >= params.volumeDim.y || z >= params.volumeDim.z) {
        return;
    }

    let idx = index3D(x, y, z);
    volumeData[idx].density = 0.0;
    volumeData[idx].gradient = vec3<f32>(0.0);
}

// SDF-based density computation (alternative approach)
@compute @workgroup_size(8, 8, 8)
fn computeSDFDensity(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;
    let z = globalId.z;

    if (x >= params.volumeDim.x || y >= params.volumeDim.y || z >= params.volumeDim.z) {
        return;
    }

    let normalizedPos = vec3<f32>(f32(x), f32(y), f32(z)) / vec3<f32>(params.volumeDim);
    let worldPos = mix(params.volumeMin, params.volumeMax, normalizedPos);

    var sdf = 1e10;

    // Evaluate all metaballs as spheres
    for (var i = 0u; i < params.metaballCount; i++) {
        let ball = metaballs[i];
        let sphereDist = sphereSDF(worldPos, ball.position, ball.radius);

        // Combine SDFs
        if (i == 0u) {
            sdf = sphereDist;
        } else {
            sdf = sdfSmoothUnion(sdf, sphereDist, params.smoothFactor);
        }
    }

    // Convert SDF to density (negative inside, positive outside)
    let density = -sdf;

    let idx = index3D(x, y, z);
    volumeData[idx].density = density;
}
