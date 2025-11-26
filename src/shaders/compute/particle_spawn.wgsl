// particle_spawn.wgsl
// Particle Emission from Various Shapes

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

struct EmitterParams {
    emitterPosition: vec3<f32>,
    emitterType: u32, // 0=Point, 1=Sphere, 2=Box, 3=Cone, 4=Disk
    emitterSize: vec3<f32>,
    emitCount: u32,
    velocityMin: vec3<f32>,
    velocityMax: vec3<f32>,
    lifetimeMin: f32,
    lifetimeMax: f32,
    massMin: f32,
    massMax: f32,
    sizeMin: f32,
    sizeMax: f32,
    colorStart: vec4<f32>,
    colorEnd: vec4<f32>,
    coneAngle: f32,
    coneRadius: f32,
    randomSeed: u32,
    burstMode: u32, // 0=Continuous, 1=Burst
    maxParticles: u32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: EmitterParams;
@group(0) @binding(2) var<storage, read_write> nextFreeIndex: atomic<u32>;

// Random number generation using PCG hash
fn pcgHash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn randomFloat(seed: ptr<function, u32>) -> f32 {
    *seed = pcgHash(*seed);
    return f32(*seed) / 4294967295.0;
}

fn randomVec3(seed: ptr<function, u32>) -> vec3<f32> {
    return vec3<f32>(
        randomFloat(seed),
        randomFloat(seed),
        randomFloat(seed)
    );
}

fn randomInSphere(seed: ptr<function, u32>) -> vec3<f32> {
    var pos: vec3<f32>;
    loop {
        pos = randomVec3(seed) * 2.0 - 1.0;
        if (dot(pos, pos) <= 1.0) {
            break;
        }
    }
    return pos;
}

fn randomOnSphere(seed: ptr<function, u32>) -> vec3<f32> {
    let pos = randomInSphere(seed);
    return normalize(pos);
}

fn randomInBox(seed: ptr<function, u32>) -> vec3<f32> {
    return randomVec3(seed) * 2.0 - 1.0;
}

fn randomInCone(seed: ptr<function, u32>, angle: f32) -> vec3<f32> {
    let cosAngle = cos(angle);
    let z = randomFloat(seed) * (1.0 - cosAngle) + cosAngle;
    let phi = randomFloat(seed) * 2.0 * 3.14159265359;
    let sinTheta = sqrt(1.0 - z * z);
    return vec3<f32>(sinTheta * cos(phi), sinTheta * sin(phi), z);
}

fn randomInDisk(seed: ptr<function, u32>) -> vec3<f32> {
    let r = sqrt(randomFloat(seed));
    let theta = randomFloat(seed) * 2.0 * 3.14159265359;
    return vec3<f32>(r * cos(theta), r * sin(theta), 0.0);
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;

    if (index >= params.emitCount) {
        return;
    }

    // Get next free particle slot
    let particleIndex = atomicAdd(&nextFreeIndex, 1u);
    if (particleIndex >= params.maxParticles) {
        return;
    }

    // Initialize random seed
    var seed = params.randomSeed + index;

    var particle: Particle;

    // Generate position based on emitter type
    var localPos: vec3<f32>;
    switch (params.emitterType) {
        case 0u: { // Point
            localPos = vec3<f32>(0.0);
        }
        case 1u: { // Sphere
            localPos = randomInSphere(&seed) * params.emitterSize;
        }
        case 2u: { // Box
            localPos = randomInBox(&seed) * params.emitterSize;
        }
        case 3u: { // Cone
            localPos = randomInCone(&seed, params.coneAngle) * params.coneRadius;
        }
        case 4u: { // Disk
            localPos = randomInDisk(&seed) * params.emitterSize.x;
        }
        default: {
            localPos = vec3<f32>(0.0);
        }
    }

    particle.position = params.emitterPosition + localPos;

    // Generate velocity
    let t = randomVec3(&seed);
    particle.velocity = mix(params.velocityMin, params.velocityMax, t);

    // Generate lifetime
    particle.lifetime = mix(params.lifetimeMin, params.lifetimeMax, randomFloat(&seed));
    particle.age = 0.0;

    // Generate mass
    particle.mass = mix(params.massMin, params.massMax, randomFloat(&seed));

    // Generate size
    particle.size = mix(params.sizeMin, params.sizeMax, randomFloat(&seed));

    // Generate color (interpolate between start and end)
    let colorT = randomFloat(&seed);
    particle.color = mix(params.colorStart, params.colorEnd, colorT);

    // Initialize rotation
    particle.rotation = randomFloat(&seed) * 6.28318530718; // 2*PI
    particle.angularVel = (randomFloat(&seed) - 0.5) * 2.0;

    // Initialize force accumulator
    particle.force = vec3<f32>(0.0);

    // Write particle
    particles[particleIndex] = particle;
}
