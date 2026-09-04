import { describe, expect, it } from "vitest";
import { createFootIkRig, createHeightFieldGround, createMovingPlatformGround } from "@aura3d/animation";
import { Scene, SceneNode, type Mat4 } from "@aura3d/scene";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src";

/**
 * E2 box 2 (assets half): the foot-planting post-pass solves configured leg chains against a
 * ground raycaster (heightfield, moving-platform adapter) and writes the solved hip/knee/ankle
 * world positions back onto the skeleton. Stance means the foot is within plantThreshold of
 * its ground target (locked); swing passes the clip pose through. Missing leg nodes are
 * reported, never faked.
 */
function buildLegScene(hipY: number, prefix: string, x = 0, seg = 0.33): Scene {
  const scene = new Scene();
  const hip = new SceneNode({ name: `${prefix}Hip` });
  hip.transform.setPosition(x, hipY, 0);
  const knee = new SceneNode({ name: `${prefix}Knee` });
  knee.transform.setPosition(0, -seg, seg * 0.06);
  const ankle = new SceneNode({ name: `${prefix}Ankle` });
  ankle.transform.setPosition(0, -seg, -seg * 0.06);
  hip.addChild(knee);
  knee.addChild(ankle);
  scene.root.addChild(hip);
  return scene;
}

/** Ankle world height. Segment lengths put the ankle 0.66 below the hip. */
function ankleWorldY(scene: Scene, name: string): number {
  const ankle = scene.findByName(name)[0]!;
  scene.updateWorldTransforms();
  return ankle.transform.worldMatrix[13];
}

/** Actor-local ankle position mapped through a column-major worldFromLocal. */
function worldAnkle(scene: Scene, name: string, matrix: Mat4): [number, number, number] {
  const ankle = scene.findByName(name)[0]!;
  scene.updateWorldTransforms();
  const local = ankle.transform.worldMatrix;
  const x = local[12]!;
  const y = local[13]!;
  const z = local[14]!;
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!
  ];
}

const LEFT = { side: "left" as const, hip: "LHip", knee: "LKnee", ankle: "LAnkle" };

describe("GLTFSceneAnimationRuntime foot planting", () => {
  it("locks a stance foot onto flat ground", () => {
    const scene = buildLegScene(0.69, "L");
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.03, 6);
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: { legs: [LEFT], ground: createHeightFieldGround(() => ({ height: 0 })) }
    });

    const result = runtime.applyPose({ bones: {} });

    expect(result.footPlanting?.groundedFeet).toBe(1);
    expect(result.footPlanting?.lockedSides).toEqual(["left"]);
    expect(result.footPlanting?.missingLegNodes).toEqual([]);
    expect(result.footPlanting?.averageTargetError).toBeLessThan(0.05);
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.035, 3);
  });

  it("passes a swing foot through untouched", () => {
    const scene = buildLegScene(1.16, "L");
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.5, 6);
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: { legs: [LEFT], ground: createHeightFieldGround(() => ({ height: 0 })) }
    });

    const result = runtime.applyPose({ bones: {} });

    expect(result.footPlanting?.groundedFeet).toBe(0);
    expect(result.footPlanting?.lockedSides).toEqual([]);
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.5, 6);
  });

  it("plants each foot on its own step of a heightfield", () => {
    const scene = new Scene();
    for (const [hipY, prefix, x] of [[0.69, "L", -0.5], [0.99, "R", 0.5]] as const) {
      const leg = buildLegScene(hipY, prefix, x);
      const hip = leg.findByName(`${prefix}Hip`)[0]!;
      leg.root.removeChild(hip);
      scene.root.addChild(hip);
    }
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: {
        legs: [
          { side: "left", hip: "LHip", knee: "LKnee", ankle: "LAnkle" },
          { side: "right", hip: "RHip", knee: "RKnee", ankle: "RAnkle" }
        ],
        ground: createHeightFieldGround((x) => ({ height: x > 0 ? 0.3 : 0 }))
      }
    });

    const result = runtime.applyPose({ bones: {} });

    expect(result.footPlanting?.groundedFeet).toBe(2);
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.035, 3);
    expect(ankleWorldY(scene, "RAnkle")).toBeCloseTo(0.335, 3);
  });

  it("carries a locked foot up with a rising platform", () => {
    const scene = buildLegScene(1.09, "L");
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.43, 6);
    let platformTop = 0.4;
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: {
        legs: [LEFT],
        ground: createMovingPlatformGround(
          createHeightFieldGround(() => ({ height: 0 })),
          () => platformTop
        )
      }
    });

    const first = runtime.applyPose({ bones: {} });
    expect(first.footPlanting?.lockedSides).toEqual(["left"]);
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.435, 3);

    platformTop = 0.9;
    const second = runtime.applyPose({ bones: {} });
    expect(second.footPlanting?.groundedFeet).toBe(1);
    expect(second.footPlanting?.lockedSides).toEqual(["left"]);
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.935, 3);
  });

  it("releases the lock when the platform leaves from under the foot", () => {
    const scene = buildLegScene(1.09, "L");
    let platformTop: number | undefined = 0.4;
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: {
        legs: [LEFT],
        ground: createMovingPlatformGround(
          createHeightFieldGround(() => ({ height: 0 })),
          () => platformTop
        )
      }
    });

    runtime.applyPose({ bones: {} });
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.435, 3);

    platformTop = undefined;
    const released = runtime.applyPose({ bones: {} });
    expect(released.footPlanting?.groundedFeet).toBe(0);
    expect(released.footPlanting?.lockedSides).toEqual([]);
    // The foot stays where the platform left it instead of snapping to base ground.
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.435, 3);
  });

  it("reports missing leg nodes instead of throwing or faking", () => {
    const scene = buildLegScene(0.69, "L");
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: {
        legs: [{ side: "left", hip: "LHip", knee: "NoKnee", ankle: "LAnkle" }],
        ground: createHeightFieldGround(() => ({ height: 0 }))
      }
    });

    const result = runtime.applyPose({ bones: {} });

    expect(result.footPlanting?.groundedFeet).toBe(0);
    expect(result.footPlanting?.missingLegNodes).toEqual(["left:knee:NoKnee"]);
  });

  it("disables the post-pass when cleared and rejects empty leg lists", () => {
    const scene = buildLegScene(0.69, "L");
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: { legs: [LEFT], ground: createHeightFieldGround(() => ({ height: 0 })) }
    });
    expect(() => runtime.setFootPlanting({ legs: [], ground: createHeightFieldGround(() => ({ height: 0 })) })).toThrow(
      /at least one leg/
    );

    runtime.setFootPlanting(undefined);
    const result = runtime.applyPose({ bones: {} });
    expect(result.footPlanting).toBeUndefined();
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.03, 6);
  });

  it("keeps applying node tracks alongside the post-pass", () => {
    const scene = buildLegScene(0.69, "L");
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: { legs: [LEFT], ground: createHeightFieldGround(() => ({ height: 0 })) }
    });

    const result = runtime.applyPose({ bones: { LHip: { position: [0, 0.69, 0.1] } } });

    expect(result.transformTracksApplied).toBe(1);
    expect(result.footPlanting?.groundedFeet).toBe(1);
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.035, 3);
  });

  it("drops the pelvis when a stance foot is just out of reach", () => {
    // Tall rig (2.4 reach): ankle 0.05 is in stance but 15mm beyond full extension.
    const scene = buildLegScene(2.45, "L", 0, 1.2);
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.05, 6);
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: { legs: [LEFT], ground: createHeightFieldGround(() => ({ height: 0 })) }
    });

    const result = runtime.applyPose({ bones: {} });

    expect(result.footPlanting?.groundedFeet).toBe(1);
    expect(result.footPlanting?.hipOffset).toBeLessThan(0);
    const hip = scene.findByName("LHip")[0]!;
    scene.updateWorldTransforms();
    expect(hip.transform.worldMatrix[13]).toBeLessThan(2.45);
    // The rig re-solves from the dropped pelvis, so the foot lands on its 35mm target
    // instead of floating 15mm above it at full extension — without dislocating the chain.
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(0.035, 2);
  });

  it("plants a centimeter-scale skeleton against meter ground through worldFromLocal", () => {
    // Certified-asset shape: joints in centimeters, ground in meters, engine-normalized
    // model matrix bridging them. Ankle local 3cm -> world 0.03m, target 0.035m (stance).
    const scene = buildLegScene(69, "L", 0, 33);
    const centimeterToMeter: Mat4 = [0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 1];
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: {
        legs: [LEFT],
        ground: createHeightFieldGround(() => ({ height: 0 })),
        worldFromLocal: centimeterToMeter
      }
    });

    const result = runtime.applyPose({ bones: {} });

    expect(result.footPlanting?.groundedFeet).toBe(1);
    expect(result.footPlanting?.lockedSides).toEqual(["left"]);
    // Error is reported in world meters, not import centimeters.
    expect(result.footPlanting?.averageTargetError).toBeLessThan(0.05);
    // Write-back lands in actor-local centimeters (0.035m -> 3.5cm).
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(3.5, 1);
  });

  it("solves through a lift-and-center matrix like a normalized model node", () => {
    // Mirrors the browser proof: model node lifts the cm skeleton onto a platform.
    const scene = buildLegScene(69, "L", 0, 33);
    const lift: Mat4 = [0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 0, 0.42, 0, 1];
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: {
        legs: [LEFT],
        ground: createHeightFieldGround(() => ({ height: 0.45 })),
        worldFromLocal: lift
      }
    });

    const result = runtime.applyPose({ bones: {} });

    // Ankle world 0.45m against a 0.45m top: stance, planted at 0.485m -> local 6.5cm.
    expect(result.footPlanting?.groundedFeet).toBe(1);
    expect(ankleWorldY(scene, "LAnkle")).toBeCloseTo(6.5, 1);
  });

  it("keeps world-space locks across a matrix-only refresh, resets on shape change", () => {
    // Long leg (1.0 reach) so the pre-shift lock stays reachable after a +0.2 model shift.
    const scene = buildLegScene(1.09, "L", 0, 0.5);
    const ground = createMovingPlatformGround(
      createHeightFieldGround(() => ({ height: 0 })),
      () => 0.4
    );
    const identity: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const shifted: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.2, 0, 0, 1];
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: [],
      footPlanting: { legs: [LEFT], ground, worldFromLocal: identity }
    });

    runtime.applyPose({ bones: {} });
    expect(worldAnkle(scene, "LAnkle", identity)[0]).toBeCloseTo(0, 3);

    // Same shape, new matrix (the engine re-sends it every frame): the lock holds the
    // OLD world spot, so the foot's world x stays ~0 instead of following the +0.2 shift.
    runtime.setFootPlanting({ legs: [LEFT], ground, worldFromLocal: shifted });
    const preserved = runtime.applyPose({ bones: {} });
    expect(preserved.footPlanting?.lockedSides).toEqual(["left"]);
    expect(worldAnkle(scene, "LAnkle", shifted)[0]).toBeCloseTo(0, 2);

    // Walk the skeleton +0.2 in x, then change a solve parameter: the rig resets and
    // re-locks under the foot's NEW world spot (~0.2) instead of dragging it back to 0.
    const hip = scene.findByName("LHip")[0]!;
    hip.transform.setPosition(0.2, 1.09, 0);
    runtime.setFootPlanting({ legs: [LEFT], ground, plantThreshold: 0.5, worldFromLocal: shifted });
    const reset = runtime.applyPose({ bones: {} });
    expect(reset.footPlanting?.lockedSides).toEqual(["left"]);
    expect(worldAnkle(scene, "LAnkle", shifted)[0]).toBeCloseTo(0.2, 2);

    // Walk another +0.2 with an unchanged shape: the lock (now at ~0.2) survives the
    // refresh and pulls the foot back from ~0.4 instead of re-locking there.
    hip.transform.setPosition(0.4, 1.09, 0);
    runtime.setFootPlanting({ legs: [LEFT], ground, plantThreshold: 0.5, worldFromLocal: shifted });
    const held = runtime.applyPose({ bones: {} });
    expect(held.footPlanting?.lockedSides).toEqual(["left"]);
    expect(worldAnkle(scene, "LAnkle", shifted)[0]).toBeCloseTo(0.2, 2);
  });

  it("the package FootIk rig it builds on still plants through the same adapter", () => {
    const rig = createFootIkRig({
      legs: [{ side: "left", hip: [0.1, 1.6, 0], knee: [0.1, 0.9, 0.05], ankle: [0.1, 1.04, 0] }],
      raycaster: createMovingPlatformGround(createHeightFieldGround(() => ({ height: 0 })), () => 1)
    });
    const solved = rig.solveFootPlacement();
    expect(solved.feet[0]?.sample.grounded).toBe(true);
    expect(solved.feet[0]?.sample.plantedFoot[1]).toBeCloseTo(1.035, 10);
  });
});
