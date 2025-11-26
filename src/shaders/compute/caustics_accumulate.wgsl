// caustics_accumulate.wgsl
// Photon Map Accumulation and Density Estimation

struct AccumulationParams {
    gridResolution: vec2<u32>,
    searchRadius: f32,
    maxPhotons: u32,
    normalizationFactor: f32,
    gridMin: vec2<f32>,
    gridMax: vec2<f32>,
    outputWidth: u32,
    outputHeight: u32,
    filterRadius: f32,
    kernelType: u32, // 0=Box, 1=Gaussian, 2=Cone
}

struct PhotonData {
    position: vec3<f32>,
    energy: f32,
    direction: vec3<f32>,
    wavelength: f32,
}

@group(0) @binding(0) var<storage, read> photonMap: array<atomic<u32>>; // Accumulated energy (fixed-point)
@group(0) @binding(1) var<storage, read_write> causticsTexture: array<f32>; // Output caustics intensity
@group(0) @binding(2) var<uniform> params: AccumulationParams;

const FIXED_POINT_SCALE: f32 = 1000.0;
const PI: f32 = 3.14159265359;

fn gridToIndex(gridPos: vec2<u32>) -> u32 {
    return gridPos.x + gridPos.y * params.gridResolution.x;
}

fn outputToIndex(x: u32, y: u32) -> u32 {
    return x + y * params.outputWidth;
}

// Gaussian kernel
fn gaussianKernel(distance: f32, sigma: f32) -> f32 {
    return exp(-(distance * distance) / (2.0 * sigma * sigma)) / (2.0 * PI * sigma * sigma);
}

// Cone kernel (linear falloff)
fn coneKernel(distance: f32, radius: f32) -> f32 {
    if (distance >= radius) {
        return 0.0;
    }
    return 1.0 - (distance / radius);
}

// Box kernel (uniform)
fn boxKernel(distance: f32, radius: f32) -> f32 {
    if (distance >= radius) {
        return 0.0;
    }
    return 1.0;
}

// Density estimation using kernel function
@compute @workgroup_size(16, 16, 1)
fn densityEstimation(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.outputWidth || y >= params.outputHeight) {
        return;
    }

    // Calculate world position for this output pixel
    let pixelPos = vec2<f32>(f32(x), f32(y)) / vec2<f32>(params.outputWidth, params.outputHeight);
    let worldPos = mix(params.gridMin, params.gridMax, pixelPos);

    var totalEnergy = 0.0;
    var totalWeight = 0.0;

    // Search radius in grid cells
    let searchRadiusCells = u32(params.searchRadius);

    // Convert world position to grid position
    let gridPosF = pixelPos * vec2<f32>(params.gridResolution);
    let centerGridPos = vec2<u32>(gridPosF);

    // Search neighboring cells
    let startX = max(i32(centerGridPos.x) - i32(searchRadiusCells), 0);
    let endX = min(i32(centerGridPos.x) + i32(searchRadiusCells), i32(params.gridResolution.x) - 1);
    let startY = max(i32(centerGridPos.y) - i32(searchRadiusCells), 0);
    let endY = min(i32(centerGridPos.y) + i32(searchRadiusCells), i32(params.gridResolution.y) - 1);

    for (var gy = startY; gy <= endY; gy++) {
        for (var gx = startX; gx <= endX; gx++) {
            let gridPos = vec2<u32>(u32(gx), u32(gy));
            let gridIdx = gridToIndex(gridPos);

            // Get photon energy from grid cell
            let energyFixed = atomicLoad(&photonMap[gridIdx]);
            let energy = f32(energyFixed) / FIXED_POINT_SCALE;

            if (energy <= 0.0) {
                continue;
            }

            // Calculate distance to cell center
            let cellCenter = (vec2<f32>(gridPos) + 0.5) / vec2<f32>(params.gridResolution);
            let cellWorldPos = mix(params.gridMin, params.gridMax, cellCenter);
            let distance = length(worldPos - cellWorldPos);

            // Apply kernel function
            var weight = 0.0;
            switch (params.kernelType) {
                case 0u: { // Box
                    weight = boxKernel(distance, params.filterRadius);
                }
                case 1u: { // Gaussian
                    weight = gaussianKernel(distance, params.filterRadius);
                }
                case 2u: { // Cone
                    weight = coneKernel(distance, params.filterRadius);
                }
                default: {
                    weight = boxKernel(distance, params.filterRadius);
                }
            }

            totalEnergy += energy * weight;
            totalWeight += weight;
        }
    }

    // Normalize by total weight
    var intensity = 0.0;
    if (totalWeight > 0.0) {
        intensity = totalEnergy / totalWeight;
    }

    // Apply normalization factor
    intensity *= params.normalizationFactor;

    let outputIdx = outputToIndex(x, y);
    causticsTexture[outputIdx] = intensity;
}

// Direct accumulation (simple grid-to-texture copy with scaling)
@compute @workgroup_size(16, 16, 1)
fn directAccumulation(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.outputWidth || y >= params.outputHeight) {
        return;
    }

    // Map output pixel to grid cell
    let gridX = (x * params.gridResolution.x) / params.outputWidth;
    let gridY = (y * params.gridResolution.y) / params.outputHeight;

    let gridIdx = gridToIndex(vec2<u32>(gridX, gridY));

    // Get photon energy
    let energyFixed = atomicLoad(&photonMap[gridIdx]);
    let energy = f32(energyFixed) / FIXED_POINT_SCALE;

    // Normalize and store
    let intensity = energy * params.normalizationFactor;

    let outputIdx = outputToIndex(x, y);
    causticsTexture[outputIdx] = intensity;
}

// Clear photon map
@compute @workgroup_size(16, 16, 1)
fn clearPhotonMap(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.gridResolution.x || y >= params.gridResolution.y) {
        return;
    }

    let gridIdx = gridToIndex(vec2<u32>(x, y));
    atomicStore(&photonMap[gridIdx], 0u);
}

// Bilinear filtering for higher quality output
@compute @workgroup_size(16, 16, 1)
fn bilinearAccumulation(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.outputWidth || y >= params.outputHeight) {
        return;
    }

    // Calculate grid position (floating point)
    let gridPosF = vec2<f32>(
        f32(x * params.gridResolution.x) / f32(params.outputWidth),
        f32(y * params.gridResolution.y) / f32(params.outputHeight)
    );

    // Bilinear interpolation
    let gridX0 = u32(floor(gridPosF.x));
    let gridY0 = u32(floor(gridPosF.y));
    let gridX1 = min(gridX0 + 1u, params.gridResolution.x - 1u);
    let gridY1 = min(gridY0 + 1u, params.gridResolution.y - 1u);

    let tx = fract(gridPosF.x);
    let ty = fract(gridPosF.y);

    // Sample four corners
    let e00 = f32(atomicLoad(&photonMap[gridToIndex(vec2<u32>(gridX0, gridY0))])) / FIXED_POINT_SCALE;
    let e10 = f32(atomicLoad(&photonMap[gridToIndex(vec2<u32>(gridX1, gridY0))])) / FIXED_POINT_SCALE;
    let e01 = f32(atomicLoad(&photonMap[gridToIndex(vec2<u32>(gridX0, gridY1))])) / FIXED_POINT_SCALE;
    let e11 = f32(atomicLoad(&photonMap[gridToIndex(vec2<u32>(gridX1, gridY1))])) / FIXED_POINT_SCALE;

    // Bilinear interpolation
    let e0 = mix(e00, e10, tx);
    let e1 = mix(e01, e11, tx);
    let energy = mix(e0, e1, ty);

    // Normalize and store
    let intensity = energy * params.normalizationFactor;

    let outputIdx = outputToIndex(x, y);
    causticsTexture[outputIdx] = intensity;
}
