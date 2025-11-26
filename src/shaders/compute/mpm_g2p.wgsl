// mpm_g2p.wgsl
// MPM Grid-to-Particle Transfer
// Deformation Gradient Update and Material Model Application

struct MPMParticle {
    position: vec3<f32>,
    mass: f32,
    velocity: vec3<f32>,
    volumeInit: f32,
    C: mat3x3<f32>, // Affine velocity matrix
    deformationGrad: mat3x3<f32>, // Deformation gradient F
    _padding: array<f32, 3>,
}

struct GridCell {
    mass: atomic<i32>,
    momentum: array<atomic<i32>, 3>,
    velocity: vec3<f32>,
    force: vec3<f32>,
    _padding: array<f32, 2>,
}

struct MPMParams {
    deltaTime: f32,
    particleCount: u32,
    gridDim: vec3<u32>,
    gridSpacing: f32,
    gridOrigin: vec3<f32>,
    youngModulus: f32,
    poissonRatio: f32,
    materialDensity: f32,
    materialType: u32, // 0=Elastic, 1=Plastic, 2=Fluid, 3=Snow
    plasticYield: f32,
    criticalCompression: f32,
    criticalStretch: f32,
    hardeningCoeff: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<MPMParticle>;
@group(0) @binding(1) var<storage, read> grid: array<GridCell>;
@group(0) @binding(2) var<uniform> params: MPMParams;

// Quadratic B-spline weight function
fn weight(x: f32) -> f32 {
    let absX = abs(x);
    if (absX < 0.5) {
        return 0.75 - absX * absX;
    } else if (absX < 1.5) {
        let t = 1.5 - absX;
        return 0.5 * t * t;
    }
    return 0.0;
}

// Quadratic B-spline gradient
fn weightGradient(x: f32) -> f32 {
    let absX = abs(x);
    if (absX < 0.5) {
        return -2.0 * x;
    } else if (absX < 1.5) {
        let s = sign(x);
        return s * (1.5 - absX);
    }
    return 0.0;
}

// Grid position to index
fn gridPosToIndex(pos: vec3<i32>) -> u32 {
    return u32(pos.x + pos.y * i32(params.gridDim.x) + pos.z * i32(params.gridDim.x * params.gridDim.y));
}

// Matrix determinant (3x3)
fn det(m: mat3x3<f32>) -> f32 {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
           m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
           m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

// SVD-based polar decomposition (simplified)
fn polarDecomposition(F: mat3x3<f32>) -> mat3x3<f32> {
    // Simplified: return normalized rotation
    // In production, use proper SVD
    let det_F = det(F);
    if (det_F > 0.0) {
        return F / pow(det_F, 1.0 / 3.0);
    }
    return mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );
}

// Apply material model (plasticity for snow/sand)
fn applyPlasticity(F: mat3x3<f32>) -> mat3x3<f32> {
    if (params.materialType != 3u) { // Not snow
        return F;
    }

    // Singular value decomposition would go here
    // For now, clamp deformation
    let J = det(F);

    var F_new = F;
    if (J < params.criticalCompression) {
        F_new = F * pow(params.criticalCompression / J, 1.0 / 3.0);
    } else if (J > params.criticalStretch) {
        F_new = F * pow(params.criticalStretch / J, 1.0 / 3.0);
    }

    return F_new;
}

// Grid to particle transfer (G2P)
@compute @workgroup_size(256, 1, 1)
fn gridToParticle(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let pIdx = globalId.x;
    if (pIdx >= params.particleCount) {
        return;
    }

    var particle = particles[pIdx];

    // Convert particle position to grid space
    let gridPos = (particle.position - params.gridOrigin) / params.gridSpacing;
    let baseNode = vec3<i32>(floor(gridPos - 0.5));

    var newVelocity = vec3<f32>(0.0);
    var C = mat3x3<f32>(
        vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0)
    );
    var gradV = mat3x3<f32>(
        vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0)
    );

    // APIC transfer from 3x3x3 neighborhood
    for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
            for (var k = 0; k < 3; k++) {
                let nodeOffset = vec3<i32>(i, j, k);
                let node = baseNode + nodeOffset;

                // Check bounds
                if (node.x < 0 || node.x >= i32(params.gridDim.x) ||
                    node.y < 0 || node.y >= i32(params.gridDim.y) ||
                    node.z < 0 || node.z >= i32(params.gridDim.z)) {
                    continue;
                }

                // Calculate weight
                let nodePos = vec3<f32>(node) + vec3<f32>(0.5);
                let diff = gridPos - nodePos;
                let w = weight(diff.x) * weight(diff.y) * weight(diff.z);

                if (w < 0.0001) {
                    continue;
                }

                let cellIndex = gridPosToIndex(node);
                let gridVel = grid[cellIndex].velocity;

                // Accumulate velocity
                newVelocity += gridVel * w;

                // Accumulate affine matrix C (APIC)
                C[0] += gridVel * w * diff.x;
                C[1] += gridVel * w * diff.y;
                C[2] += gridVel * w * diff.z;

                // Accumulate velocity gradient for deformation update
                let wGrad = vec3<f32>(
                    weightGradient(diff.x) * weight(diff.y) * weight(diff.z),
                    weight(diff.x) * weightGradient(diff.y) * weight(diff.z),
                    weight(diff.x) * weight(diff.y) * weightGradient(diff.z)
                ) / params.gridSpacing;

                gradV[0] += gridVel * wGrad.x;
                gradV[1] += gridVel * wGrad.y;
                gradV[2] += gridVel * wGrad.z;
            }
        }
    }

    // Update particle velocity
    particle.velocity = newVelocity;

    // Update affine matrix (scale by grid spacing for APIC)
    particle.C = C * (4.0 / (params.gridSpacing * params.gridSpacing));

    // Update deformation gradient F (multiplicative update)
    let I = mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );

    let deltaF = I + gradV * params.deltaTime;
    var F_new = deltaF * particle.deformationGrad;

    // Apply material model (plasticity, etc.)
    F_new = applyPlasticity(F_new);

    particle.deformationGrad = F_new;

    // Update particle position (advection)
    particle.position += particle.velocity * params.deltaTime;

    // Clamp particle position to simulation bounds
    // (Add boundary handling here if needed)

    particles[pIdx] = particle;
}

// Initialize deformation gradients (call once at start)
@compute @workgroup_size(256, 1, 1)
fn initializeDeformationGradients(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let pIdx = globalId.x;
    if (pIdx >= params.particleCount) {
        return;
    }

    var particle = particles[pIdx];

    // Initialize F to identity
    particle.deformationGrad = mat3x3<f32>(
        vec3<f32>(1.0, 0.0, 0.0),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(0.0, 0.0, 1.0)
    );

    // Initialize C to zero
    particle.C = mat3x3<f32>(
        vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0)
    );

    particles[pIdx] = particle;
}
