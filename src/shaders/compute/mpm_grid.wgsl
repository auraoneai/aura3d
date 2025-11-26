// mpm_grid.wgsl
// MPM Grid Velocity Update, Boundary Conditions, and Grid Forces

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
    gravity: vec3<f32>,
    boundaryDamping: f32,
    boundaryMin: vec3<f32>,
    boundaryMax: vec3<f32>,
}

@group(0) @binding(0) var<storage, read_write> grid: array<GridCell>;
@group(0) @binding(1) var<uniform> params: MPMParams;

const FIXED_POINT_SCALE: f32 = 1000000.0;

fn fixedToFloat(value: i32) -> f32 {
    return f32(value) / FIXED_POINT_SCALE;
}

// Step 1: Apply grid forces (gravity, external forces)
@compute @workgroup_size(256, 1, 1)
fn applyGridForces(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let totalCells = params.gridDim.x * params.gridDim.y * params.gridDim.z;

    if (index >= totalCells) {
        return;
    }

    let mass = fixedToFloat(atomicLoad(&grid[index].mass));

    if (mass > 0.0001) {
        // Apply gravity
        grid[index].force = params.gravity * mass;

        // Additional external forces can be added here
    } else {
        grid[index].force = vec3<f32>(0.0);
    }
}

// Step 2: Update grid velocities
@compute @workgroup_size(256, 1, 1)
fn updateGridVelocities(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let totalCells = params.gridDim.x * params.gridDim.y * params.gridDim.z;

    if (index >= totalCells) {
        return;
    }

    let mass = fixedToFloat(atomicLoad(&grid[index].mass));

    if (mass > 0.0001) {
        var cell = grid[index];

        // Apply forces to velocity
        let acceleration = cell.force / mass;
        cell.velocity += acceleration * params.deltaTime;

        // Update cell
        grid[index] = cell;
    }
}

// Step 3: Apply boundary conditions
@compute @workgroup_size(256, 1, 1)
fn applyBoundaryConditions(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let totalCells = params.gridDim.x * params.gridDim.y * params.gridDim.z;

    if (index >= totalCells) {
        return;
    }

    let mass = fixedToFloat(atomicLoad(&grid[index].mass));

    if (mass < 0.0001) {
        return;
    }

    // Calculate grid cell position
    let z = index / (params.gridDim.x * params.gridDim.y);
    let y = (index - z * params.gridDim.x * params.gridDim.y) / params.gridDim.x;
    let x = index - z * params.gridDim.x * params.gridDim.y - y * params.gridDim.x;

    let gridPos = vec3<f32>(f32(x), f32(y), f32(z)) * params.gridSpacing + params.gridOrigin;

    var cell = grid[index];
    var velocity = cell.velocity;

    // Sticky boundary conditions (set velocity to zero at boundaries)
    let boundary_threshold = params.gridSpacing * 2.0;

    // X boundaries
    if (gridPos.x < params.boundaryMin.x + boundary_threshold) {
        velocity.x = max(velocity.x, 0.0) * params.boundaryDamping;
    } else if (gridPos.x > params.boundaryMax.x - boundary_threshold) {
        velocity.x = min(velocity.x, 0.0) * params.boundaryDamping;
    }

    // Y boundaries
    if (gridPos.y < params.boundaryMin.y + boundary_threshold) {
        velocity.y = max(velocity.y, 0.0) * params.boundaryDamping;
    } else if (gridPos.y > params.boundaryMax.y - boundary_threshold) {
        velocity.y = min(velocity.y, 0.0) * params.boundaryDamping;
    }

    // Z boundaries
    if (gridPos.z < params.boundaryMin.z + boundary_threshold) {
        velocity.z = max(velocity.z, 0.0) * params.boundaryDamping;
    } else if (gridPos.z > params.boundaryMax.z - boundary_threshold) {
        velocity.z = min(velocity.z, 0.0) * params.boundaryDamping;
    }

    cell.velocity = velocity;
    grid[index] = cell;
}

// Step 4: Grid damping (optional, for numerical stability)
@compute @workgroup_size(256, 1, 1)
fn applyGridDamping(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let totalCells = params.gridDim.x * params.gridDim.y * params.gridDim.z;

    if (index >= totalCells) {
        return;
    }

    let mass = fixedToFloat(atomicLoad(&grid[index].mass));

    if (mass > 0.0001) {
        var cell = grid[index];
        cell.velocity *= 0.999; // Small damping for stability
        grid[index] = cell;
    }
}
