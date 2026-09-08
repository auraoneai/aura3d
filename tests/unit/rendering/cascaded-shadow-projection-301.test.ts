import { describe, expect, it } from "vitest";
import { CascadedShadowMaps, shadowCameraFitViewProjectionMatrix } from "../../../packages/rendering/src/CascadedShadowMaps";

type V = readonly [number, number, number];
const project = (matrix: Float32Array, p: V): number[] => [0, 1, 2].map(row =>
  matrix[row]! * p[0] + matrix[4 + row]! * p[1] + matrix[8 + row]! * p[2] + matrix[12 + row]!);

describe("cascaded shadow projection signed depth bounds", () => {
  it.each<V>([[0, 7, 10], [120, -43, 210], [-200, 80, -130]])(
    "keeps every fitted frustum corner in clip space at camera %j", (...position) => {
      const maps = new CascadedShadowMaps({ cascadeCount: 4, near: .1, far: 40, size: 512, lambda: .6 });
      try {
        const fits = maps.computeStableCameraFits({
          camera: { position, target: [position[0], position[1] - 7, position[2] - 10], fovYRadians: Math.PI / 4, aspect: 4 / 3 },
          lightDirection: [-4, -8, -5], casters: []
        });
        for (const fit of fits) {
          const matrix = shadowCameraFitViewProjectionMatrix(fit);
          for (const corner of fit.frustumCornersWorld) {
            for (const coordinate of project(matrix, corner)) expect(Math.abs(coordinate)).toBeLessThanOrEqual(1.00001);
          }
          const worldAtLightZ = (z: number): V => {
            const coordinate = (axis: number) => fit.basis.right[axis]! * fit.snappedCenterLightSpace[0]
              + fit.basis.up[axis]! * fit.snappedCenterLightSpace[1]
              + fit.basis.forward[axis]! * z;
            return [coordinate(0), coordinate(1), coordinate(2)];
          };
          expect(project(matrix, worldAtLightZ(fit.orthographic.far))[2]).toBeCloseTo(-1, 5);
          expect(project(matrix, worldAtLightZ(fit.orthographic.near))[2]).toBeCloseTo(1, 5);
          expect(project(matrix, worldAtLightZ((fit.orthographic.near + fit.orthographic.far) / 2))[2]).toBeCloseTo(0, 5);
          // An occluder displaced toward the light must win a less-depth test.
          const receiver: V = [position[0], position[1] - 7, position[2] - 10];
          const occluder: V = [receiver[0] + 4, receiver[1] + 8, receiver[2] + 5];
          expect(project(matrix, occluder)[2]).toBeLessThan(project(matrix, receiver)[2]!);
        }
      } finally { maps.dispose(); }
    }
  );
});
