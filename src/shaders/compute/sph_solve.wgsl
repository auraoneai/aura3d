// sph_solve.wgsl
// PRD Section 6.4.3 - SPH Fluid Solver
// Performance Target: 100k particles @ 60 FPS

struct SPHParticle {
    position: vec3<f32>,
    density: f32,
    velocity: vec3<f32>,
    pressure: f32,
    force: vec3<f32>,
    mass: f32,
}

struct SPHParams {
    deltaTime: f32,
    particleCount: u32,
    kernelRadius: f32,
    restDensity: f32,
    gasConstant: f32,
    viscosity: f32,
    surfaceTension: f32,
    gravity: vec3<f32>,
    damping: f32,
    boundsMin: vec3<f32>,
    boundsMax: vec3<f32>,
    gridDim: vec3<u32>,
    cellSize: f32,
}

// Spatial hash grid for neighbor search
struct GridCell {
    particleCount: atomic<u32>,
    particleIndices: array<u32, 32>, // Max 32 particles per cell
}

@group(0) @binding(0) var<storage, read_write> particles: array<SPHParticle>;
@group(0) @binding(1) var<uniform> params: SPHParams;
@group(0) @binding(2) var<storage, read_write> grid: array<GridCell>;

// SPH Kernel functions
const PI: f32 = 3.14159265359;

// Poly6 kernel for density
fn poly6Kernel(r: f32, h: f32) -> f32 {
    if (r >= 0.0 && r <= h) {
        let h2 = h * h;
        let h9 = h2 * h2 * h2 * h2 * h;
        let r2 = r * r;
        return (315.0 / (64.0 * PI * h9)) * pow(h2 - r2, 3.0);
    }
    return 0.0;
}

// Spiky kernel gradient for pressure
fn spikyKernelGradient(r: vec3<f32>, h: f32) -> vec3<f32> {
    let rLen = length(r);
    if (rLen >= 0.0 && rLen <= h && rLen > 0.0001) {
        let h6 = pow(h, 6.0);
        let diff = h - rLen;
        return -(45.0 / (PI * h6)) * diff * diff * (r / rLen);
    }
    return vec3<f32>(0.0);
}

// Viscosity kernel Laplacian
fn viscosityKernelLaplacian(r: f32, h: f32) -> f32 {
    if (r >= 0.0 && r <= h) {
        let h6 = pow(h, 6.0);
        return (45.0 / (PI * h6)) * (h - r);
    }
    return 0.0;
}

// Convert position to grid cell index
fn positionToGridCell(position: vec3<f32>) -> vec3<u32> {
    let normalized = (position - params.boundsMin) / params.cellSize;
    return vec3<u32>(
        clamp(u32(normalized.x), 0u, params.gridDim.x - 1u),
        clamp(u32(normalized.y), 0u, params.gridDim.y - 1u),
        clamp(u32(normalized.z), 0u, params.gridDim.z - 1u)
    );
}

// Convert grid cell to flat index
fn gridCellToIndex(cell: vec3<u32>) -> u32 {
    return cell.x + cell.y * params.gridDim.x + cell.z * params.gridDim.x * params.gridDim.y;
}

// Step 1: Clear grid
@compute @workgroup_size(256, 1, 1)
fn clearGrid(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let totalCells = params.gridDim.x * params.gridDim.y * params.gridDim.z;

    if (index >= totalCells) {
        return;
    }

    atomicStore(&grid[index].particleCount, 0u);
}

// Step 2: Build spatial hash grid
@compute @workgroup_size(256, 1, 1)
fn buildGrid(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.particleCount) {
        return;
    }

    let particle = particles[index];
    let cell = positionToGridCell(particle.position);
    let cellIndex = gridCellToIndex(cell);

    let localIndex = atomicAdd(&grid[cellIndex].particleCount, 1u);
    if (localIndex < 32u) {
        grid[cellIndex].particleIndices[localIndex] = index;
    }
}

// Step 3: Calculate density and pressure
@compute @workgroup_size(256, 1, 1)
fn calculateDensityPressure(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.particleCount) {
        return;
    }

    var particle = particles[index];
    particle.density = 0.0;

    let cell = positionToGridCell(particle.position);

    // Search neighboring cells
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dz = -1; dz <= 1; dz++) {
                let neighborCell = vec3<i32>(i32(cell.x) + dx, i32(cell.y) + dy, i32(cell.z) + dz);

                // Check bounds
                if (neighborCell.x < 0 || neighborCell.x >= i32(params.gridDim.x) ||
                    neighborCell.y < 0 || neighborCell.y >= i32(params.gridDim.y) ||
                    neighborCell.z < 0 || neighborCell.z >= i32(params.gridDim.z)) {
                    continue;
                }

                let neighborCellU = vec3<u32>(neighborCell);
                let cellIndex = gridCellToIndex(neighborCellU);
                let particleCount = atomicLoad(&grid[cellIndex].particleCount);

                // Iterate through particles in cell
                for (var i = 0u; i < min(particleCount, 32u); i++) {
                    let neighborIndex = grid[cellIndex].particleIndices[i];
                    let neighbor = particles[neighborIndex];

                    let r = distance(particle.position, neighbor.position);
                    particle.density += neighbor.mass * poly6Kernel(r, params.kernelRadius);
                }
            }
        }
    }

    // Calculate pressure using ideal gas equation
    particle.pressure = params.gasConstant * (particle.density - params.restDensity);

    particles[index] = particle;
}

// Step 4: Calculate forces (pressure, viscosity, surface tension)
@compute @workgroup_size(256, 1, 1)
fn calculateForces(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.particleCount) {
        return;
    }

    var particle = particles[index];
    var pressureForce = vec3<f32>(0.0);
    var viscosityForce = vec3<f32>(0.0);

    let cell = positionToGridCell(particle.position);

    // Search neighboring cells
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dz = -1; dz <= 1; dz++) {
                let neighborCell = vec3<i32>(i32(cell.x) + dx, i32(cell.y) + dy, i32(cell.z) + dz);

                if (neighborCell.x < 0 || neighborCell.x >= i32(params.gridDim.x) ||
                    neighborCell.y < 0 || neighborCell.y >= i32(params.gridDim.y) ||
                    neighborCell.z < 0 || neighborCell.z >= i32(params.gridDim.z)) {
                    continue;
                }

                let neighborCellU = vec3<u32>(neighborCell);
                let cellIndex = gridCellToIndex(neighborCellU);
                let particleCount = atomicLoad(&grid[cellIndex].particleCount);

                for (var i = 0u; i < min(particleCount, 32u); i++) {
                    let neighborIndex = grid[cellIndex].particleIndices[i];
                    if (neighborIndex == index) {
                        continue;
                    }

                    let neighbor = particles[neighborIndex];
                    let r = particle.position - neighbor.position;
                    let rLen = length(r);

                    if (rLen < params.kernelRadius && rLen > 0.0001) {
                        // Pressure force
                        let pressureAvg = (particle.pressure + neighbor.pressure) / 2.0;
                        pressureForce += -neighbor.mass * pressureAvg / neighbor.density *
                                        spikyKernelGradient(r, params.kernelRadius);

                        // Viscosity force
                        let velocityDiff = neighbor.velocity - particle.velocity;
                        viscosityForce += neighbor.mass * velocityDiff / neighbor.density *
                                         viscosityKernelLaplacian(rLen, params.kernelRadius);
                    }
                }
            }
        }
    }

    viscosityForce *= params.viscosity;

    // Total force
    particle.force = pressureForce + viscosityForce + params.gravity * particle.mass;

    particles[index] = particle;
}

// Step 5: Integrate (update velocity and position)
@compute @workgroup_size(256, 1, 1)
fn integrate(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.particleCount) {
        return;
    }

    var particle = particles[index];

    // Update velocity
    let acceleration = particle.force / particle.mass;
    particle.velocity += acceleration * params.deltaTime;
    particle.velocity *= params.damping;

    // Update position
    particle.position += particle.velocity * params.deltaTime;

    // Boundary conditions
    if (particle.position.x < params.boundsMin.x) {
        particle.position.x = params.boundsMin.x;
        particle.velocity.x *= -0.5;
    } else if (particle.position.x > params.boundsMax.x) {
        particle.position.x = params.boundsMax.x;
        particle.velocity.x *= -0.5;
    }

    if (particle.position.y < params.boundsMin.y) {
        particle.position.y = params.boundsMin.y;
        particle.velocity.y *= -0.5;
    } else if (particle.position.y > params.boundsMax.y) {
        particle.position.y = params.boundsMax.y;
        particle.velocity.y *= -0.5;
    }

    if (particle.position.z < params.boundsMin.z) {
        particle.position.z = params.boundsMin.z;
        particle.velocity.z *= -0.5;
    } else if (particle.position.z > params.boundsMax.z) {
        particle.position.z = params.boundsMax.z;
        particle.velocity.z *= -0.5;
    }

    particles[index] = particle;
}
