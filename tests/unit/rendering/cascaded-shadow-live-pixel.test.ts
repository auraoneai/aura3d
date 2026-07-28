import { describe, expect, it } from "vitest";
import { CascadedShadowMaps } from "../../../packages/rendering/src";

describe("live cascaded-shadow pixel quality", () => {
  it("reduces diagonal shadow-edge stair stepping at distance versus one full-range map", () => {
    const camera = {
      position: [0, 3, 4] as const,
      target: [0, 1, -20] as const,
      fovYRadians: Math.PI / 3,
      aspect: 16 / 9
    };
    const lightDirection = [0.35, -0.8, -0.48] as const;
    const single = new CascadedShadowMaps({
      cascadeCount: 1,
      near: 0.1,
      far: 80,
      size: 64,
      lambda: 0.6
    });
    const cascaded = new CascadedShadowMaps({
      cascadeCount: 4,
      near: 0.1,
      far: 80,
      size: 64,
      lambda: 0.6
    });

    const singleFit = single.computeStableCameraFits({ camera, lightDirection, casters: [] })[0]!;
    const distance = 24;
    const selectedFit = cascaded.computeStableCameraFits({ camera, lightDirection, casters: [] })
      .find((fit) => distance <= fit.split.far)!;
    const singlePixels = rasterizeQuantizedDiagonal(singleFit.texelSize, 64, 64);
    const cascadePixels = rasterizeQuantizedDiagonal(selectedFit.texelSize, 64, 64);
    const singleEdgeSteps = distinctEdgeColumns(singlePixels, 64, 64);
    const cascadeEdgeSteps = distinctEdgeColumns(cascadePixels, 64, 64);

    expect(selectedFit.split.near).toBeLessThan(distance);
    expect(selectedFit.split.far).toBeGreaterThanOrEqual(distance);
    expect(selectedFit.texelSize).toBeLessThan(singleFit.texelSize);
    expect(cascadeEdgeSteps).toBeGreaterThan(singleEdgeSteps);
    expect(Array.from(cascadePixels)).not.toEqual(Array.from(singlePixels));

    single.dispose();
    cascaded.dispose();
  });
});

function rasterizeQuantizedDiagonal(texelWorldSize: number, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height);
  const worldWidth = 28;
  for (let y = 0; y < height; y += 1) {
    const edgeWorld = -7 + y / (height - 1) * 14;
    const quantizedEdge = Math.round(edgeWorld / texelWorldSize) * texelWorldSize;
    for (let x = 0; x < width; x += 1) {
      const worldX = (x / (width - 1) - 0.5) * worldWidth;
      pixels[y * width + x] = worldX >= quantizedEdge ? 255 : 0;
    }
  }
  return pixels;
}

function distinctEdgeColumns(pixels: Uint8Array, width: number, height: number): number {
  const columns = new Set<number>();
  for (let y = 0; y < height; y += 1) {
    let edge = width;
    for (let x = 0; x < width; x += 1) {
      if (pixels[y * width + x] === 255) {
        edge = x;
        break;
      }
    }
    columns.add(edge);
  }
  return columns.size;
}
