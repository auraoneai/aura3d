import { createDepthTextureBinding, ssaoPixels, type DepthTextureBinding, type SSAOOptions, type SSAOResult } from "../PostProcessPass";

export function createExternalParityDepthBinding(width: number, height: number, data?: Float32Array): DepthTextureBinding {
  const depth = data ?? defaultDepth(width, height);
  return createDepthTextureBinding({ label: "external-parity-depth", width, height, data: depth });
}

export function runExternalParitySSAO(pixels: Uint8Array, width: number, height: number, options: Omit<SSAOOptions, "depth"> & { readonly depth?: DepthTextureBinding } = {}): SSAOResult {
  return ssaoPixels(pixels, width, height, { ...options, depth: options.depth ?? createExternalParityDepthBinding(width, height) });
}

function defaultDepth(width: number, height: number): Float32Array {
  const depth = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      depth[y * width + x] = x > width * 0.35 && x < width * 0.65 && y > height * 0.35 && y < height * 0.65 ? 0.35 : 0.72;
    }
  }
  return depth;
}
