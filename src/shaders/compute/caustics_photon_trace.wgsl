// caustics_photon_trace.wgsl
// Water Caustics Photon Tracing
// Refraction through Surface and Photon Accumulation

struct Photon {
    position: vec3<f32>,
    energy: f32,
    direction: vec3<f32>,
    wavelength: f32,
    isActive: u32,
    bounceCount: u32,
    _padding: array<u32, 2>,
}

struct WaterSurface {
    heightmap: vec2<f32>, // Grid position
    height: f32,
    normal: vec3<f32>,
}

struct CausticsParams {
    photonCount: u32,
    maxBounces: u32,
    lightPosition: vec3<f32>,
    lightDirection: vec3<f32>,
    lightIntensity: f32,
    waterIOR: f32, // Index of refraction (typically 1.33)
    airIOR: f32,   // Index of refraction (typically 1.0)
    waterSurfaceY: f32,
    receiverY: f32, // Ground plane Y
    gridMin: vec2<f32>,
    gridMax: vec2<f32>,
    gridResolution: vec2<u32>,
    waveAmplitude: f32,
    waveFrequency: f32,
    time: f32,
    dispersionStrength: f32,
}

struct PhotonMap {
    position: vec3<f32>,
    energy: f32,
}

@group(0) @binding(0) var<storage, read_write> photons: array<Photon>;
@group(0) @binding(1) var<storage, read_write> photonMap: array<atomic<u32>>; // Fixed-point energy accumulation
@group(0) @binding(2) var<uniform> params: CausticsParams;
@group(0) @binding(3) var waterNormalMap: texture_2d<f32>;
@group(0) @binding(4) var waterSampler: sampler;

const PI: f32 = 3.14159265359;
const FIXED_POINT_SCALE: f32 = 1000.0;

// Random number generation
fn pcgHash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn randomFloat(seed: ptr<function, u32>) -> f32 {
    *seed = pcgHash(*seed);
    return f32(*seed) / 4294967295.0;
}

// Water surface height using Gerstner waves
fn getWaterHeight(pos: vec2<f32>, time: f32) -> f32 {
    var height = 0.0;

    // Sum multiple waves
    let numWaves = 3;
    for (var i = 0; i < numWaves; i++) {
        let fi = f32(i);
        let freq = params.waveFrequency * (1.0 + fi * 0.3);
        let amp = params.waveAmplitude * (1.0 - fi * 0.2);
        let phase = time * (1.0 + fi * 0.5);

        let waveDir = vec2<f32>(cos(fi * 2.1), sin(fi * 2.1));
        let k = freq * 2.0 * PI;
        let x = dot(waveDir, pos) * k + phase;

        height += amp * sin(x);
    }

    return params.waterSurfaceY + height;
}

// Calculate water surface normal
fn getWaterNormal(pos: vec2<f32>, time: f32) -> vec3<f32> {
    let epsilon = 0.01;

    let h = getWaterHeight(pos, time);
    let hx = getWaterHeight(pos + vec2<f32>(epsilon, 0.0), time);
    let hz = getWaterHeight(pos + vec2<f32>(0.0, epsilon), time);

    let tangentX = normalize(vec3<f32>(epsilon, hx - h, 0.0));
    let tangentZ = normalize(vec3<f32>(0.0, hz - h, epsilon));

    return normalize(cross(tangentZ, tangentX));
}

// Snell's law refraction
fn refract(incident: vec3<f32>, normal: vec3<f32>, eta: f32) -> vec3<f32> {
    let cosi = dot(incident, normal);
    let k = 1.0 - eta * eta * (1.0 - cosi * cosi);

    if (k < 0.0) {
        // Total internal reflection
        return reflect(incident, normal);
    }

    return eta * incident - (eta * cosi + sqrt(k)) * normal;
}

// Fresnel reflectance (Schlick's approximation)
fn fresnel(cosTheta: f32, F0: f32) -> f32 {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// Ray-plane intersection
fn rayPlaneIntersect(rayOrigin: vec3<f32>, rayDir: vec3<f32>, planeY: f32) -> vec3<f32> {
    let t = (planeY - rayOrigin.y) / rayDir.y;
    return rayOrigin + rayDir * t;
}

// Convert world position to grid index
fn worldToGrid(worldPos: vec3<f32>) -> vec2<u32> {
    let pos2D = worldPos.xz;
    let normalized = (pos2D - params.gridMin) / (params.gridMax - params.gridMin);
    let gridPos = normalized * vec2<f32>(params.gridResolution);

    return vec2<u32>(
        clamp(u32(gridPos.x), 0u, params.gridResolution.x - 1u),
        clamp(u32(gridPos.y), 0u, params.gridResolution.y - 1u)
    );
}

fn gridToIndex(gridPos: vec2<u32>) -> u32 {
    return gridPos.x + gridPos.y * params.gridResolution.x;
}

// Trace photons
@compute @workgroup_size(256, 1, 1)
fn tracePhotons(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let photonIdx = globalId.x;

    if (photonIdx >= params.photonCount) {
        return;
    }

    var photon = photons[photonIdx];

    if (photon.isActive == 0u) {
        return;
    }

    // Initialize random seed
    var seed = photonIdx * 12345u + u32(params.time * 1000.0);

    // Find intersection with water surface
    let surfaceHit = rayPlaneIntersect(photon.position, photon.direction, params.waterSurfaceY);
    let surfacePos2D = surfaceHit.xz;

    // Get water surface properties at hit point
    let waterHeight = getWaterHeight(surfacePos2D, params.time);
    let waterNormal = getWaterNormal(surfacePos2D, params.time);

    // Update photon position to water surface
    photon.position = vec3<f32>(surfacePos2D.x, waterHeight, surfacePos2D.y);

    // Calculate refraction
    let eta = params.airIOR / params.waterIOR;
    let refractedDir = refract(photon.direction, waterNormal, eta);

    // Calculate Fresnel reflectance
    let cosTheta = abs(dot(photon.direction, waterNormal));
    let F0 = pow((params.waterIOR - params.airIOR) / (params.waterIOR + params.airIOR), 2.0);
    let reflectance = fresnel(cosTheta, F0);

    // Probabilistic reflection/refraction
    let rnd = randomFloat(&seed);
    var newDirection: vec3<f32>;

    if (rnd < reflectance) {
        // Reflect (photon bounces back)
        newDirection = reflect(photon.direction, waterNormal);
        photon.energy *= 0.5; // Energy loss on reflection
    } else {
        // Refract (photon enters water)
        newDirection = refractedDir;

        // Chromatic dispersion (wavelength-dependent refraction)
        if (params.dispersionStrength > 0.0) {
            let dispersion = (photon.wavelength - 550.0) / 300.0; // Normalize wavelength
            let etaDispersed = eta * (1.0 + dispersion * params.dispersionStrength);
            newDirection = refract(photon.direction, waterNormal, etaDispersed);
        }
    }

    photon.direction = normalize(newDirection);

    // Trace to receiver plane (ground)
    if (photon.direction.y < 0.0) {
        let receiverHit = rayPlaneIntersect(photon.position, photon.direction, params.receiverY);
        photon.position = receiverHit;

        // Accumulate photon energy in grid
        let gridPos = worldToGrid(receiverHit);
        let gridIdx = gridToIndex(gridPos);

        let energyFixed = u32(photon.energy * FIXED_POINT_SCALE);
        atomicAdd(&photonMap[gridIdx], energyFixed);

        // Deactivate photon after hitting receiver
        photon.isActive = 0u;
    }

    photon.bounceCount += 1u;

    // Deactivate after max bounces
    if (photon.bounceCount >= params.maxBounces) {
        photon.isActive = 0u;
    }

    photons[photonIdx] = photon;
}

// Initialize photons from light source
@compute @workgroup_size(256, 1, 1)
fn initializePhotons(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let photonIdx = globalId.x;

    if (photonIdx >= params.photonCount) {
        return;
    }

    var seed = photonIdx * 12345u;

    var photon: Photon;

    // Emit from light position with some spread
    let theta = randomFloat(&seed) * 2.0 * PI;
    let radius = randomFloat(&seed) * 2.0;
    let offset = vec3<f32>(radius * cos(theta), 0.0, radius * sin(theta));

    photon.position = params.lightPosition + offset;

    // Direction towards water surface (with some variation)
    let dirVariation = vec3<f32>(
        (randomFloat(&seed) - 0.5) * 0.2,
        0.0,
        (randomFloat(&seed) - 0.5) * 0.2
    );
    photon.direction = normalize(params.lightDirection + dirVariation);

    photon.energy = params.lightIntensity / f32(params.photonCount);

    // Assign wavelength for chromatic dispersion (400-700nm visible range)
    photon.wavelength = 400.0 + randomFloat(&seed) * 300.0;

    photon.isActive = 1u;
    photon.bounceCount = 0u;

    photons[photonIdx] = photon;
}
