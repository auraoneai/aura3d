/**
 * GU47 TT-P2: long-lens DOF (f/4, 120 mm, focus 34 m) authored on the World Tour chain; the engine's tier resolution runs
 * it at High / Ultra only. Blur measurements (far-stand Laplacian, far athlete, frame time) are phase 2.
 */
import { describe, expect, it } from "vitest";
import { BROADCAST_DOF, CAMERA_V2, CUT_DOF_FSTOP, dofSharpRange } from "../../../examples/aura-slam/view/camera";
import { BASELINE_Z } from "../../../examples/aura-slam/view/constants";
import { postEffects } from "../../../examples/aura-slam/view/lighting";

const fromEye = (z: number, y = 1) => Math.hypot(CAMERA_V2.eye[1] - y, CAMERA_V2.eye[2] - z);

describe("GU47 TT-P2: broadcast depth of field", () => {
  it("both athletes sit inside the sharp range; the far stands (z <= -11.7) fall outside it", () => {
    const r = dofSharpRange(BROADCAST_DOF.focusDistance, BROADCAST_DOF.fStop, BROADCAST_DOF.focalLength);
    for (const z of [BASELINE_Z * 1.1, BASELINE_Z * 0.5, -BASELINE_Z * 0.5, -BASELINE_Z * 1.1]) {
      const d = fromEye(z);
      expect(d, `athlete at z ${z}`).toBeGreaterThanOrEqual(r.near);
      expect(d, `athlete at z ${z}`).toBeLessThanOrEqual(r.far);
    }
    expect(fromEye(-14, 4)).toBeGreaterThan(r.far);
    expect(BROADCAST_DOF.fStop).toBe(4);
    expect(CUT_DOF_FSTOP).toBe(8);
  });

  it("the World Tour chain authors one depth-of-field node with the metric fields", () => {
    const nodes = JSON.parse(JSON.stringify(postEffects("hard"))) as Record<string, unknown>[];
    const dof = nodes.filter((n) => n.effect === "depth-of-field");
    expect(dof).toHaveLength(1);
    expect(dof[0]).toMatchObject({ focusDistance: 34, fStop: 4, focalLength: 120 });
    expect(dof[0]!.postAuthored).toEqual(["focusDistance", "fStop", "focalLength"]);
  });

});
