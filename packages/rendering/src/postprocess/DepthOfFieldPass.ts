import { depthOfFieldPixels, type DepthOfFieldOptions, type DepthOfFieldResult } from "../PostProcessPass";
import { createV4DepthBinding } from "./SSAOPass";

export function runV4DepthOfField(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: Omit<DepthOfFieldOptions, "depth"> & Pick<Partial<DepthOfFieldOptions>, "depth"> = {}
): DepthOfFieldResult {
  const focusDepth = options.focusDepth ?? 0.35;
  return depthOfFieldPixels(pixels, width, height, { ...options, focusDepth, depth: options.depth ?? createV4DepthBinding(width, height) });
}
