// caustics_blur.wgsl
// Caustics Blur/Filtering and Temporal Accumulation

struct BlurParams {
    width: u32,
    height: u32,
    blurRadius: u32,
    blurSigma: f32,
    temporalBlend: f32, // 0.0 = full current, 1.0 = full history
    sharpenAmount: f32,
    threshold: f32,
    exposure: f32,
}

@group(0) @binding(0) var<storage, read> inputTexture: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputTexture: array<f32>;
@group(0) @binding(2) var<storage, read> historyTexture: array<f32>;
@group(0) @binding(3) var<storage, read_write> tempBuffer: array<f32>;
@group(0) @binding(4) var<uniform> params: BlurParams;

const PI: f32 = 3.14159265359;

fn index2D(x: u32, y: u32) -> u32 {
    return x + y * params.width;
}

// Gaussian weight function
fn gaussianWeight(x: f32, sigma: f32) -> f32 {
    return exp(-(x * x) / (2.0 * sigma * sigma)) / (sqrt(2.0 * PI) * sigma);
}

// Horizontal Gaussian blur (separable)
@compute @workgroup_size(256, 1, 1)
fn blurHorizontal(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let y = globalId.x;

    if (y >= params.height) {
        return;
    }

    for (var x = 0u; x < params.width; x++) {
        var sum = 0.0;
        var weightSum = 0.0;

        let radius = i32(params.blurRadius);

        for (var i = -radius; i <= radius; i++) {
            let sampleX = i32(x) + i;

            if (sampleX < 0 || sampleX >= i32(params.width)) {
                continue;
            }

            let weight = gaussianWeight(f32(i), params.blurSigma);
            let sampleIdx = index2D(u32(sampleX), y);
            let sampleValue = inputTexture[sampleIdx];

            sum += sampleValue * weight;
            weightSum += weight;
        }

        let blurred = sum / weightSum;
        let outputIdx = index2D(x, y);
        tempBuffer[outputIdx] = blurred;
    }
}

// Vertical Gaussian blur (separable)
@compute @workgroup_size(256, 1, 1)
fn blurVertical(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;

    if (x >= params.width) {
        return;
    }

    for (var y = 0u; y < params.height; y++) {
        var sum = 0.0;
        var weightSum = 0.0;

        let radius = i32(params.blurRadius);

        for (var i = -radius; i <= radius; i++) {
            let sampleY = i32(y) + i;

            if (sampleY < 0 || sampleY >= i32(params.height)) {
                continue;
            }

            let weight = gaussianWeight(f32(i), params.blurSigma);
            let sampleIdx = index2D(x, u32(sampleY));
            let sampleValue = tempBuffer[sampleIdx];

            sum += sampleValue * weight;
            weightSum += weight;
        }

        let blurred = sum / weightSum;
        let outputIdx = index2D(x, y);
        outputTexture[outputIdx] = blurred;
    }
}

// Box blur (faster alternative)
@compute @workgroup_size(16, 16, 1)
fn boxBlur(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    var sum = 0.0;
    var count = 0.0;

    let radius = i32(params.blurRadius);

    for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
            let sampleX = i32(x) + dx;
            let sampleY = i32(y) + dy;

            if (sampleX < 0 || sampleX >= i32(params.width) ||
                sampleY < 0 || sampleY >= i32(params.height)) {
                continue;
            }

            let sampleIdx = index2D(u32(sampleX), u32(sampleY));
            sum += inputTexture[sampleIdx];
            count += 1.0;
        }
    }

    let outputIdx = index2D(x, y);
    outputTexture[outputIdx] = sum / count;
}

// Bilateral blur (edge-preserving)
@compute @workgroup_size(16, 16, 1)
fn bilateralBlur(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let centerIdx = index2D(x, y);
    let centerValue = inputTexture[centerIdx];

    var sum = 0.0;
    var weightSum = 0.0;

    let radius = i32(params.blurRadius);
    let spatialSigma = params.blurSigma;
    let rangeSigma = 0.1; // Intensity difference threshold

    for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
            let sampleX = i32(x) + dx;
            let sampleY = i32(y) + dy;

            if (sampleX < 0 || sampleX >= i32(params.width) ||
                sampleY < 0 || sampleY >= i32(params.height)) {
                continue;
            }

            let sampleIdx = index2D(u32(sampleX), u32(sampleY));
            let sampleValue = inputTexture[sampleIdx];

            // Spatial weight
            let spatialDist = sqrt(f32(dx * dx + dy * dy));
            let spatialWeight = gaussianWeight(spatialDist, spatialSigma);

            // Range weight (based on intensity difference)
            let rangeDiff = abs(sampleValue - centerValue);
            let rangeWeight = gaussianWeight(rangeDiff, rangeSigma);

            let weight = spatialWeight * rangeWeight;

            sum += sampleValue * weight;
            weightSum += weight;
        }
    }

    let outputIdx = index2D(x, y);
    outputTexture[outputIdx] = sum / weightSum;
}

// Temporal accumulation (blend with previous frame)
@compute @workgroup_size(16, 16, 1)
fn temporalAccumulation(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let idx = index2D(x, y);

    let currentValue = inputTexture[idx];
    let historyValue = historyTexture[idx];

    // Exponential moving average
    let blended = mix(currentValue, historyValue, params.temporalBlend);

    outputTexture[idx] = blended;
}

// Sharpen filter (unsharp mask)
@compute @workgroup_size(16, 16, 1)
fn sharpen(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let idx = index2D(x, y);
    let centerValue = inputTexture[idx];

    // 3x3 Laplacian kernel approximation
    var sum = 0.0;
    var count = 0.0;

    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) {
                continue;
            }

            let sampleX = i32(x) + dx;
            let sampleY = i32(y) + dy;

            if (sampleX < 0 || sampleX >= i32(params.width) ||
                sampleY < 0 || sampleY >= i32(params.height)) {
                continue;
            }

            let sampleIdx = index2D(u32(sampleX), u32(sampleY));
            sum += inputTexture[sampleIdx];
            count += 1.0;
        }
    }

    let average = sum / count;
    let detail = centerValue - average;
    let sharpened = centerValue + detail * params.sharpenAmount;

    let outputIdx = index2D(x, y);
    outputTexture[outputIdx] = max(sharpened, 0.0);
}

// Threshold filter (remove low-intensity noise)
@compute @workgroup_size(16, 16, 1)
fn threshold(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let idx = index2D(x, y);
    let value = inputTexture[idx];

    let thresholded = select(0.0, value, value >= params.threshold);

    outputTexture[idx] = thresholded;
}

// Exposure adjustment
@compute @workgroup_size(16, 16, 1)
fn adjustExposure(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let idx = index2D(x, y);
    let value = inputTexture[idx];

    outputTexture[idx] = value * params.exposure;
}

// Combined post-process pass (blur + temporal + sharpen)
@compute @workgroup_size(16, 16, 1)
fn postProcess(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let x = globalId.x;
    let y = globalId.y;

    if (x >= params.width || y >= params.height) {
        return;
    }

    let idx = index2D(x, y);

    // Get current and history values
    var currentValue = inputTexture[idx];
    let historyValue = historyTexture[idx];

    // Temporal blend
    currentValue = mix(currentValue, historyValue, params.temporalBlend);

    // Apply threshold
    if (currentValue < params.threshold) {
        currentValue = 0.0;
    }

    // Apply exposure
    currentValue *= params.exposure;

    // Clamp to valid range
    currentValue = clamp(currentValue, 0.0, 100.0);

    outputTexture[idx] = currentValue;
}

// Copy to history buffer
@compute @workgroup_size(256, 1, 1)
fn copyToHistory(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    let totalPixels = params.width * params.height;

    if (index >= totalPixels) {
        return;
    }

    tempBuffer[index] = outputTexture[index];
}
