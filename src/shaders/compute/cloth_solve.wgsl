// cloth_solve.wgsl
// PRD Section 6.4.2 - GPU Cloth PBD Solver
// Performance Target: 100k particles @ 60 FPS

struct ClothParticle {
    position: vec3<f32>,
    invMass: f32,
    predictedPosition: vec3<f32>,
    _padding1: f32,
    velocity: vec3<f32>,
    _padding2: f32,
    normal: vec3<f32>,
    isPinned: u32,
}

struct DistanceConstraint {
    particleA: u32,
    particleB: u32,
    restLength: f32,
    stiffness: f32,
}

struct BendingConstraint {
    particleA: u32,
    particleB: u32,
    particleC: u32,
    particleD: u32,
    restAngle: f32,
    stiffness: f32,
    _padding: array<u32, 2>,
}

struct ClothParams {
    deltaTime: f32,
    damping: f32,
    gravity: vec3<f32>,
    numParticles: u32,
    numDistanceConstraints: u32,
    numBendingConstraints: u32,
    iterationCount: u32,
    collisionRadius: f32,
    groundPlaneY: f32,
    windForce: vec3<f32>,
}

@group(0) @binding(0) var<storage, read_write> particles: array<ClothParticle>;
@group(0) @binding(1) var<storage, read> distanceConstraints: array<DistanceConstraint>;
@group(0) @binding(2) var<storage, read> bendingConstraints: array<BendingConstraint>;
@group(0) @binding(3) var<uniform> params: ClothParams;

// Step 1: Apply forces and predict positions
@compute @workgroup_size(256, 1, 1)
fn predictPositions(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.numParticles) {
        return;
    }

    var particle = particles[index];

    if (particle.isPinned != 0u) {
        particle.predictedPosition = particle.position;
        particles[index] = particle;
        return;
    }

    // Apply gravity
    particle.velocity += params.gravity * params.deltaTime;

    // Apply wind force
    particle.velocity += params.windForce * params.deltaTime * particle.invMass;

    // Apply damping
    particle.velocity *= params.damping;

    // Predict position
    particle.predictedPosition = particle.position + particle.velocity * params.deltaTime;

    particles[index] = particle;
}

// Step 2: Solve distance constraints (stretch/compression)
@compute @workgroup_size(256, 1, 1)
fn solveDistanceConstraints(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.numDistanceConstraints) {
        return;
    }

    let constraint = distanceConstraints[index];
    let particleA = particles[constraint.particleA];
    let particleB = particles[constraint.particleB];

    // Skip if both particles are pinned
    if (particleA.isPinned != 0u && particleB.isPinned != 0u) {
        return;
    }

    let delta = particleB.predictedPosition - particleA.predictedPosition;
    let distance = length(delta);

    if (distance < 0.0001) {
        return;
    }

    let diff = (distance - constraint.restLength) / distance;
    let correction = delta * diff * constraint.stiffness;

    let totalInvMass = particleA.invMass + particleB.invMass;
    if (totalInvMass < 0.0001) {
        return;
    }

    // Apply corrections (using atomic operations would be ideal but WGSL has limitations)
    // In practice, this should use multiple iterations or a Gauss-Seidel approach
    if (particleA.isPinned == 0u) {
        var pA = particles[constraint.particleA];
        pA.predictedPosition += correction * (particleA.invMass / totalInvMass);
        particles[constraint.particleA] = pA;
    }

    if (particleB.isPinned == 0u) {
        var pB = particles[constraint.particleB];
        pB.predictedPosition -= correction * (particleB.invMass / totalInvMass);
        particles[constraint.particleB] = pB;
    }
}

// Step 3: Solve bending constraints
@compute @workgroup_size(256, 1, 1)
fn solveBendingConstraints(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.numBendingConstraints) {
        return;
    }

    let constraint = bendingConstraints[index];

    let p1 = particles[constraint.particleA].predictedPosition;
    let p2 = particles[constraint.particleB].predictedPosition;
    let p3 = particles[constraint.particleC].predictedPosition;
    let p4 = particles[constraint.particleD].predictedPosition;

    // Calculate current angle between two triangles
    let n1 = normalize(cross(p2 - p1, p3 - p1));
    let n2 = normalize(cross(p2 - p4, p3 - p4));

    let cosAngle = dot(n1, n2);
    let currentAngle = acos(clamp(cosAngle, -1.0, 1.0));

    // Calculate bending correction
    let angleDiff = currentAngle - constraint.restAngle;
    let correctionScale = angleDiff * constraint.stiffness * 0.25;

    // Apply corrections to all four particles
    let edge = normalize(p3 - p2);
    let correction1 = cross(n1, edge) * correctionScale;
    let correction2 = cross(n2, edge) * correctionScale;

    if (particles[constraint.particleA].isPinned == 0u) {
        var pA = particles[constraint.particleA];
        pA.predictedPosition -= correction1 * pA.invMass;
        particles[constraint.particleA] = pA;
    }

    if (particles[constraint.particleD].isPinned == 0u) {
        var pD = particles[constraint.particleD];
        pD.predictedPosition -= correction2 * pD.invMass;
        particles[constraint.particleD] = pD;
    }
}

// Step 4: Solve collision constraints
@compute @workgroup_size(256, 1, 1)
fn solveCollisions(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.numParticles) {
        return;
    }

    var particle = particles[index];

    if (particle.isPinned != 0u) {
        return;
    }

    // Ground plane collision
    if (particle.predictedPosition.y < params.groundPlaneY + params.collisionRadius) {
        particle.predictedPosition.y = params.groundPlaneY + params.collisionRadius;
    }

    // Self-collision would go here (requires spatial hashing)

    particles[index] = particle;
}

// Step 5: Update velocities and positions
@compute @workgroup_size(256, 1, 1)
fn updateVelocitiesAndPositions(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.numParticles) {
        return;
    }

    var particle = particles[index];

    if (particle.isPinned == 0u) {
        // Update velocity based on position change
        particle.velocity = (particle.predictedPosition - particle.position) / params.deltaTime;

        // Update position
        particle.position = particle.predictedPosition;
    }

    particles[index] = particle;
}

// Step 6: Calculate normals for rendering
@compute @workgroup_size(256, 1, 1)
fn calculateNormals(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= params.numParticles) {
        return;
    }

    // This is a simplified normal calculation
    // In practice, you'd accumulate normals from adjacent triangles
    var particle = particles[index];
    particle.normal = vec3<f32>(0.0, 1.0, 0.0); // Placeholder
    particles[index] = particle;
}
