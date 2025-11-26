// mpm_p2g.wgsl
// PRD Section 6.4.4 - Material Point Method Particle-to-Grid Transfer
// APIC (Affine Particle-In-Cell) Transfer

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
    mass: atomic<i32>, // Using fixed-point for atomics
    momentum: array<atomic<i32>, 3>, // Using fixed-point for atomics
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
}

@group(0) @binding(0) var<storage, read> particles: array<MPMParticle>;
@group(0) @binding(1) var<storage, read_write> grid: array<GridCell>;
@group(0) @binding(2) var<uniform> params: MPMParams;

// Fixed-point conversion factor for atomic operations
const FIXED_POINT_SCALE: f32 = 1000000.0;

fn floatToFixed(value: f32) -> i32 {
    return i32(value * FIXED_POINT_SCALE);
}

fn fixedToFloat(value: i32) -> f32 {
    return f32(value) / FIXED_POINT_SCALE;
}

// Grid position to index
fn gridPosToIndex(pos: vec3<i32>) -> u32 {
    return u32(pos.x + pos.y * i32(params.gridDim.x) + pos.z * i32(params.gridDim.x * params.gridDim.y));
}

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

// Step 1: Clear grid
@compute @workgroup_size(256, 1, 1)
fn clearGrid(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let totalCells = params.gridDim.x * params.gridDim.y * params.gridDim.z;

    if (index >= totalCells) {
        return;
    }

    atomicStore(&grid[index].mass, 0);
    atomicStore(&grid[index].momentum[0], 0);
    atomicStore(&grid[index].momentum[1], 0);
    atomicStore(&grid[index].momentum[2], 0);
    grid[index].velocity = vec3<f32>(0.0);
    grid[index].force = vec3<f32>(0.0);
}

// Step 2: Particle to grid transfer (P2G)
@compute @workgroup_size(256, 1, 1)
fn particleToGrid(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let pIdx = globalId.x;
    if (pIdx >= params.particleCount) {
        return;
    }

    let particle = particles[pIdx];

    // Convert particle position to grid space
    let gridPos = (particle.position - params.gridOrigin) / params.gridSpacing;
    let baseNode = vec3<i32>(floor(gridPos - 0.5));

    // APIC transfer to 3x3x3 neighborhood
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

                // APIC affine velocity
                let Q = particle.C * diff * params.gridSpacing;
                let weightedVel = (particle.velocity + Q) * w;

                let cellIndex = gridPosToIndex(node);

                // Transfer mass (using atomic for thread safety)
                let weightedMass = particle.mass * w;
                atomicAdd(&grid[cellIndex].mass, floatToFixed(weightedMass));

                // Transfer momentum (using atomic for thread safety)
                let momentum = weightedVel * particle.mass;
                atomicAdd(&grid[cellIndex].momentum[0], floatToFixed(momentum.x));
                atomicAdd(&grid[cellIndex].momentum[1], floatToFixed(momentum.y));
                atomicAdd(&grid[cellIndex].momentum[2], floatToFixed(momentum.z));
            }
        }
    }
}

// Step 3: Compute grid velocities from mass and momentum
@compute @workgroup_size(256, 1, 1)
fn computeGridVelocities(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let totalCells = params.gridDim.x * params.gridDim.y * params.gridDim.z;

    if (index >= totalCells) {
        return;
    }

    let mass = fixedToFloat(atomicLoad(&grid[index].mass));

    if (mass > 0.0001) {
        let momentum = vec3<f32>(
            fixedToFloat(atomicLoad(&grid[index].momentum[0])),
            fixedToFloat(atomicLoad(&grid[index].momentum[1])),
            fixedToFloat(atomicLoad(&grid[index].momentum[2]))
        );

        grid[index].velocity = momentum / mass;
    } else {
        grid[index].velocity = vec3<f32>(0.0);
    }
}
