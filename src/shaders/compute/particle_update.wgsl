// particle_update.wgsl
// PRD Section 6.4.1 - GPU Particle Position/Velocity Update
// Performance Target: 1M particles < 2ms

// Particle structure (64 bytes for alignment)
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

// Simulation parameters
struct SimParams {
    deltaTime: f32,
    gravity: vec3<f32>,
    damping: f32,
    boundsMin: vec3<f32>,
    boundsMax: vec3<f32>,
    restitution: f32,
    integrationMethod: u32, // 0 = Euler, 1 = Verlet
    enableCollision: u32,
    maxParticles: u32,
}

// Buffers
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: SimParams;
@group(0) @binding(2) var<storage, read_write> aliveCount: atomic<u32>;

// Workgroup size optimized for occupancy
const WORKGROUP_SIZE: u32 = 256u;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;

    if (index >= params.maxParticles) {
        return;
    }

    var particle = particles[index];

    // Check if particle is dead
    if (particle.age >= particle.lifetime) {
        return;
    }

    // Update age
    particle.age += params.deltaTime;

    // Kill particle if expired
    if (particle.age >= particle.lifetime) {
        particle.age = particle.lifetime;
        particles[index] = particle;
        return;
    }

    // Accumulate forces
    var totalForce = particle.force;
    totalForce += params.gravity * particle.mass;

    // Integration
    if (params.integrationMethod == 0u) {
        // Euler integration
        let acceleration = totalForce / particle.mass;
        particle.velocity += acceleration * params.deltaTime;
        particle.velocity *= params.damping;
        particle.position += particle.velocity * params.deltaTime;
    } else {
        // Verlet integration (more stable)
        let acceleration = totalForce / particle.mass;
        let oldVelocity = particle.velocity;
        particle.velocity += acceleration * params.deltaTime;
        particle.velocity *= params.damping;
        particle.position += (oldVelocity + particle.velocity) * 0.5 * params.deltaTime;
    }

    // Update rotation
    particle.rotation += particle.angularVel * params.deltaTime;

    // Bounds checking and collision response
    if (params.enableCollision != 0u) {
        // X axis
        if (particle.position.x < params.boundsMin.x) {
            particle.position.x = params.boundsMin.x;
            particle.velocity.x = abs(particle.velocity.x) * params.restitution;
        } else if (particle.position.x > params.boundsMax.x) {
            particle.position.x = params.boundsMax.x;
            particle.velocity.x = -abs(particle.velocity.x) * params.restitution;
        }

        // Y axis
        if (particle.position.y < params.boundsMin.y) {
            particle.position.y = params.boundsMin.y;
            particle.velocity.y = abs(particle.velocity.y) * params.restitution;
        } else if (particle.position.y > params.boundsMax.y) {
            particle.position.y = params.boundsMax.y;
            particle.velocity.y = -abs(particle.velocity.y) * params.restitution;
        }

        // Z axis
        if (particle.position.z < params.boundsMin.z) {
            particle.position.z = params.boundsMin.z;
            particle.velocity.z = abs(particle.velocity.z) * params.restitution;
        } else if (particle.position.z > params.boundsMax.z) {
            particle.position.z = params.boundsMax.z;
            particle.velocity.z = -abs(particle.velocity.z) * params.restitution;
        }
    }

    // Reset force accumulator for next frame
    particle.force = vec3<f32>(0.0);

    // Write back particle data
    particles[index] = particle;

    // Increment alive counter
    atomicAdd(&aliveCount, 1u);
}
