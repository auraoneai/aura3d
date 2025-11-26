// voronoi_compute.wgsl
// Voronoi Diagram Computation using Jump Flood Algorithm (JFA)
// Distance Field Generation

struct SeedPoint {
    position: vec2<f32>,
    id: u32,
    _padding: u32,
}

struct VoronoiCell {
    seedId: u32,
    distance: f32,
    position: vec2<f32>,
}

struct VoronoiParams {
    width: u32,
    height: u32,
    numSeeds: u32,
    jumpStep: u32,
    maxDistance: f32,
    is3D: u32,
    depth: u32,
    _padding: u32,
}

@group(0) @binding(0) var<storage, read> seeds: array<SeedPoint>;
@group(0) @binding(1) var<storage, read_write> voronoiField: array<VoronoiCell>;
@group(0) @binding(2) var<uniform> params: VoronoiParams;

fn index2D(x: u32, y: u32) -> u32 {
    return x + y * params.width;
}

fn index3D(x: u32, y: u32, z: u32) -> u32 {
    return x + y * params.width + z * params.width * params.height;
}

// Step 1: Initialize - seed the field
@compute @workgroup_size(16, 16, 1)
fn initialize(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let idx = index2D(x, y);
    let pixelPos = vec2<f32>(f32(x), f32(y));

    // Find closest seed
    var closestSeedId: u32 = 0xFFFFFFFFu;
    var closestDistance: f32 = params.maxDistance;

    for (var i = 0u; i < params.numSeeds; i++) {
        let seed = seeds[i];
        let dist = distance(pixelPos, seed.position);

        if (dist < closestDistance) {
            closestDistance = dist;
            closestSeedId = seed.id;
        }
    }

    voronoiField[idx].seedId = closestSeedId;
    voronoiField[idx].distance = closestDistance;
    voronoiField[idx].position = pixelPos;
}

// Step 2: Jump Flood Algorithm - propagate
@compute @workgroup_size(16, 16, 1)
fn jumpFlood(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let idx = index2D(x, y);
    let pixelPos = vec2<f32>(f32(x), f32(y));

    var cell = voronoiField[idx];
    var closestSeedId = cell.seedId;
    var closestDistance = cell.distance;

    let step = i32(params.jumpStep);

    // Check 8 neighbors at jump distance
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let nx = i32(x) + dx * step;
            let ny = i32(y) + dy * step;

            // Check bounds
            if (nx < 0 || nx >= i32(params.width) || ny < 0 || ny >= i32(params.height)) {
                continue;
            }

            let neighborIdx = index2D(u32(nx), u32(ny));
            let neighborCell = voronoiField[neighborIdx];

            // Skip invalid cells
            if (neighborCell.seedId == 0xFFFFFFFFu) {
                continue;
            }

            // Find the seed for this neighbor
            var seedPos = vec2<f32>(0.0);
            for (var i = 0u; i < params.numSeeds; i++) {
                if (seeds[i].id == neighborCell.seedId) {
                    seedPos = seeds[i].position;
                    break;
                }
            }

            let dist = distance(pixelPos, seedPos);

            if (dist < closestDistance) {
                closestDistance = dist;
                closestSeedId = neighborCell.seedId;
            }
        }
    }

    cell.seedId = closestSeedId;
    cell.distance = closestDistance;
    voronoiField[idx] = cell;
}

// Step 3: Generate distance field (normalized)
@compute @workgroup_size(16, 16, 1)
fn generateDistanceField(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let idx = index2D(x, y);
    var cell = voronoiField[idx];

    // Normalize distance to [0, 1]
    cell.distance = clamp(cell.distance / params.maxDistance, 0.0, 1.0);

    voronoiField[idx] = cell;
}

// 3D variant - Initialize
@compute @workgroup_size(8, 8, 8)
fn initialize3D(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;
    let z = globalId.z;

    if (x >= params.width || y >= params.height || z >= params.depth) {
        return;
    }

    let idx = index3D(x, y, z);
    let voxelPos = vec3<f32>(f32(x), f32(y), f32(z));

    // Find closest seed (assuming 3D seeds)
    var closestSeedId: u32 = 0xFFFFFFFFu;
    var closestDistance: f32 = params.maxDistance;

    for (var i = 0u; i < params.numSeeds; i++) {
        let seed = seeds[i];
        let seedPos3D = vec3<f32>(seed.position.x, seed.position.y, 0.0); // Extend to 3D
        let dist = distance(voxelPos, seedPos3D);

        if (dist < closestDistance) {
            closestDistance = dist;
            closestSeedId = seed.id;
        }
    }

    voronoiField[idx].seedId = closestSeedId;
    voronoiField[idx].distance = closestDistance;
    voronoiField[idx].position = vec2<f32>(voxelPos.x, voxelPos.y);
}

// 3D variant - Jump Flood
@compute @workgroup_size(8, 8, 8)
fn jumpFlood3D(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;
    let z = globalId.z;

    if (x >= params.width || y >= params.height || z >= params.depth) {
        return;
    }

    let idx = index3D(x, y, z);
    let voxelPos = vec3<f32>(f32(x), f32(y), f32(z));

    var cell = voronoiField[idx];
    var closestSeedId = cell.seedId;
    var closestDistance = cell.distance;

    let step = i32(params.jumpStep);

    // Check 26 neighbors at jump distance
    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0 && dz == 0) {
                    continue;
                }

                let nx = i32(x) + dx * step;
                let ny = i32(y) + dy * step;
                let nz = i32(z) + dz * step;

                // Check bounds
                if (nx < 0 || nx >= i32(params.width) ||
                    ny < 0 || ny >= i32(params.height) ||
                    nz < 0 || nz >= i32(params.depth)) {
                    continue;
                }

                let neighborIdx = index3D(u32(nx), u32(ny), u32(nz));
                let neighborCell = voronoiField[neighborIdx];

                if (neighborCell.seedId == 0xFFFFFFFFu) {
                    continue;
                }

                // Find the seed for this neighbor
                var seedPos = vec3<f32>(0.0);
                for (var i = 0u; i < params.numSeeds; i++) {
                    if (seeds[i].id == neighborCell.seedId) {
                        seedPos = vec3<f32>(seeds[i].position.x, seeds[i].position.y, 0.0);
                        break;
                    }
                }

                let dist = distance(voxelPos, seedPos);

                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestSeedId = neighborCell.seedId;
                }
            }
        }
    }

    cell.seedId = closestSeedId;
    cell.distance = closestDistance;
    voronoiField[idx] = cell;
}
