/**
 * P-61 (lane-08 review of #173/#276 edits to agent-api/nodes/camera.ts):
 * `camera.rigs` on the node namespace must hand out the real PRD-08 rigs
 * (registry-backed, same as `app.camera.rigs`), not the PR 0a static stubs.
 * Templates call `app.camera.use(camera.rigs.shoulder({ target: "hero" }))`.
 */
import { describe, expect, it } from "vitest";
import { camera } from "@aura3d/engine";
import { stubCameraRigFactories } from "@aura3d/engine/contracts";
import "@aura3d/engine/lanes";
import { ASPECT, NO_PROBE, subjectAt, type V3 } from "./rigTestKit.js";

const previous = { position: [0, 0, 0], target: [0, 0, 1], up: [0, 1, 0], roll: 0, fov: 55, near: 0.05, far: 100 } as const;

function poseAt(rig: ReturnType<typeof camera.rigs.shoulder>, heroAt: V3) {
  const s = subjectAt(heroAt, { forward: [0, 0, -1] });
  return rig.update({
    dt: 1 / 60,
    time: 0,
    aspect: ASPECT,
    previous: { ...previous, position: [...previous.position], target: [...previous.target], up: [...previous.up] },
    subject: (ref) => (ref === "hero" ? s : undefined),
    probe: NO_PROBE
  });
}

describe("P-61 camera.rigs (node namespace)", () => {
  it("shoulder resolves to the real rig and follows the subject", () => {
    const rig = camera.rigs.shoulder({ target: "hero" });
    expect(rig.id).toBe("shoulder");
    const start = poseAt(rig, [0, 0, 0]);
    // The stub returns one fixed pose forever; the real rig tracks the hero.
    let end = start;
    for (let i = 0; i < 600; i++) end = poseAt(rig, [10, 0, 0]);
    expect(end.target[0] - start.target[0]).toBeGreaterThan(9);
    expect(end.position[0] - start.position[0]).toBeGreaterThan(9);
  });

  it("chase resolves to the real rig, not the stub", () => {
    expect(camera.rigs.chase({ target: "hero" }).id).toBe("chase");
    expect(stubCameraRigFactories.chase({ target: "hero" }).id).toBe("chase:hero");
  });

  it("static and fromSpec stay on the namespace stubs", () => {
    expect(camera.rigs.static).toBe(stubCameraRigFactories.static);
    expect(camera.rigs.fromSpec).toBe(stubCameraRigFactories.fromSpec);
  });
});
