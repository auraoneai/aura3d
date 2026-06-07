import { describe, expect, it } from "vitest";
import { AnimationController } from "../../../packages/engine/src";
import {
  BehaviorAction,
  BehaviorCondition,
  BehaviorSelector,
  BehaviorSequence,
  BehaviorTree,
  Blackboard
} from "../../../packages/scripting/src";

describe("behavior-tree AI and retarget diagnostics", () => {
  it("drives a fighting-game style AI intent through a blackboard", () => {
    const blackboard = new Blackboard();
    blackboard.set("distance", 1.1);
    blackboard.set("rivalAttacking", false);
    const tree = new BehaviorTree(new BehaviorSelector("rival-ai", [
      new BehaviorSequence("guard-branch", [
        new BehaviorCondition("incoming", ({ blackboard }) => blackboard.get("rivalAttacking") === true),
        new BehaviorAction("guard", ({ blackboard }) => {
          blackboard.set("intent", "guard");
          return "success";
        })
      ]),
      new BehaviorSequence("attack-branch", [
        new BehaviorCondition("in-range", ({ blackboard }) => Number(blackboard.get("distance", 99)) < 1.3),
        new BehaviorAction("heavy", ({ blackboard }) => {
          blackboard.set("intent", "heavy");
          return "success";
        })
      ])
    ]), blackboard);

    const result = tree.tick(1 / 60);

    expect(result.status).toBe("success");
    expect(blackboard.get("intent")).toBe("heavy");
    expect(result.blackboardVersion).toBe(3);
  });

  it("reports missing humanoid retarget metadata before external clips can be claimed ready", () => {
    const controller = new AnimationController<"external-punch">({
      clips: [
        {
          id: "external-punch",
          duration: 1,
          source: "external-humanoid-library",
          retarget: {
            source: "external-humanoid-library",
            restPose: "unknown",
            scale: "source-units",
            externalLibrary: {
              library: "External Humanoid Library",
              sourceClipId: "Punch"
            }
          }
        }
      ]
    });

    const diagnostics = controller.retargetDiagnostics();
    const codes = diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain("ANIMATION_RETARGET_BONE_MAP_MISSING");
    expect(codes).toContain("ANIMATION_RETARGET_CONSTRAINTS_UNDOCUMENTED");
  });
});
