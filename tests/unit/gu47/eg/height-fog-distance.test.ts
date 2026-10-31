/**
 * GU47 E-G phase 2 (receipt `height-fog`): with the receipt's spec, the
 * height-fog model the C-02 forward programs evaluate (`a3dFogAmount` mode 1,
 * CPU mirror `fogAmount`) fogs the far columns more than the near ground.
 * The receipt's old raw-RGB check compared surfaces of different contrast to
 * the fog colour; the spec now measures fog amount against a solid-fog frame.
 */
import { describe, expect, it } from "vitest";
import { FOG_MODE, fogAmount, packV2, type Prd07FogSpec, type Vec3 } from "../../../../packages/rendering/src/atmosphere/HeightFog";

const SPEC: Prd07FogSpec = { mode: "height", color: "#a9b8c8", density: 0.05, heightDensity: 0.4, heightFalloff: 0.3, heightReference: 0, affectsBackground: true };
const CAMERA: Vec3 = [0, 2, 6];
// Ground under the receipt's nearGround rectangle (rows 0.85..1 of 480x270, camera (0,2,6) -> (0,1.4,-10), fov 55).
const NEAR_GROUND: readonly Vec3[] = [[0, 0, 2.7], [0, 0, 1.4], [-1.5, 0, 2]];
// Column faces under the farColumn rectangle (columns at z -12 and -28).
const FAR_COLUMNS: readonly Vec3[] = [[2, 1.5, -12], [2, 2.9, -12], [-2, 1.5, -28], [-2, 2.9, -28]];

describe("GU47 E-G height fog grows with distance", () => {
  it("far column faces are more fogged than the near ground", () => {
    const near = Math.max(...NEAR_GROUND.map((p) => fogAmount(CAMERA, p, SPEC)));
    const far = Math.min(...FAR_COLUMNS.map((p) => fogAmount(CAMERA, p, SPEC)));
    expect(near).toBeLessThan(0.7);
    expect(far).toBeGreaterThan(0.95);
    expect(far - near).toBeGreaterThan(0.15);
  });

  it("fog amount is monotonic along a ray", () => {
    let previous = 0;
    for (let d = 1; d <= 60; d += 1) {
      const amount = fogAmount(CAMERA, [0, 2 - d * 0.03, 6 - d], SPEC);
      expect(amount).toBeGreaterThanOrEqual(previous);
      previous = amount;
    }
  });

  it("the generator path packs the v2 height mode, not the legacy parity mode", () => {
    const packed = packV2(SPEC, { fogColor: [0.4, 0.48, 0.58], cameraY: 2, parity: false });
    expect(packed.fogMode).toBe(FOG_MODE.height);
    expect(packed.fogA).toEqual([0.05, 0.4, 0.3, 0]);
  });
});
