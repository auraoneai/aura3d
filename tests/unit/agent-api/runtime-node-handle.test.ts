import { describe, expect, it } from "vitest";
import { createAuraApp, createRuntimeNodeImportedAssetEvidence, game, material, primitives, scene } from "../../../packages/engine/src";
import { AnimationController, type AnimationPose } from "../../../packages/engine/src/agent-api/AnimationController";

const poseAt = (x: number, focus = 0): AnimationPose => ({
  bones: {
    root: {
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 }
    }
  },
  morphTargets: { focus }
});

describe("runtime node handle", () => {
  it("mutates transform, visibility, animation, effects, and bounds through the public handle", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(
        primitives
          .box({ name: "fighter hurtbox proxy" })
          .position(1, 1, 1)
          .scale([2, 3, 4])
          .runtime(game.runtimeNode("fighter", { tags: ["fighter", "hurtbox"] }))
      )
    });
    const fighter = app.nodes.require("fighter");

    fighter
      .setPosition(2, 1, 0)
      .translate(0.5, 0, -1)
      .setRotation(0, Math.PI / 2, 0)
      .setScale([1, 2, 3])
      .setVisible(false)
      .setMaterial(material.pbr({ color: "#ff3366", roughness: 0.35 }))
      .play("light-strike", { restart: true, speed: 1.25 })
      .attachEffect({ kind: "hit-spark", position: [2.5, 1, -1], color: "#fff2a8", duration: 0.08 });

    const snapshot = fighter.snapshot();

    expect(snapshot).toMatchObject({
      id: "fighter",
      kind: "primitive",
      name: "fighter hurtbox proxy",
      tags: ["fighter", "hurtbox"],
      position: [2.5, 1, -1],
      rotation: [0, Math.PI / 2, 0],
      scale: [1, 2, 3],
      visible: false,
      animation: { clip: "light-strike", restart: true, speed: 1.25 }
    });
    expect(snapshot.bounds).toMatchObject({
      kind: "aura-runtime-node-bounds",
      center: [2.5, 1, -1],
      size: [1, 2, 3],
      min: [2, 0, -2.5],
      max: [3, 2, 0.5]
    });
    expect(snapshot.bounds?.radius).toBeCloseTo(Math.sqrt(3.5));
    expect(fighter.effects()).toEqual([
      { kind: "hit-spark", position: [2.5, 1, -1], color: "#fff2a8", duration: 0.08 }
    ]);

    app.dispose();
  });

  it("throws authoring guidance for missing mutable nodes", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(primitives.sphere({ name: "static decoration" }))
    });

    expect(app.nodes.all()).toEqual([]);
    expect(() => app.nodes.require("missing-player")).toThrow(/add \.runtime/);

    app.dispose();
  });

  it("stores animation poses and morph targets on runtime node snapshots", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(
        primitives
          .box({ name: "talking fighter proxy" })
          .runtime(game.runtimeNode("fighter", { tags: ["fighter"] }))
      )
    });
    const fighter = app.nodes.require("fighter");

    fighter
      .setMorphTarget("AA", 0.8)
      .setMorphTarget("blink", 2)
      .setAnimationPose(poseAt(0.25, 0.35), {
        kind: "aura-runtime-node-animation-pose",
        controllerId: "manual-controller",
        bindingId: "manual-binding",
        activeClipId: "talk",
        boneCount: 1,
        morphTargetCount: 1
      });

    const snapshot = fighter.snapshot();
    expect(snapshot.animationPose?.bones.root?.position?.x).toBeCloseTo(0.25);
    expect(snapshot.animationPoseBinding).toMatchObject({
      kind: "aura-runtime-node-animation-pose",
      controllerId: "manual-controller",
      activeClipId: "talk",
      boneCount: 1,
      morphTargetCount: 1
    });
    expect(snapshot.morphTargets).toEqual({ AA: 0.8, blink: 1, focus: 0.35 });

    const pose = fighter.animationPose() as unknown as { bones: { root: { position: { x: number } } } };
    const mutablePosition = pose.bones.root.position as { x: number };
    mutablePosition.x = 10;
    expect(fighter.animationPose()?.bones.root?.position?.x).toBeCloseTo(0.25);

    fighter.setMorphTargets({ EE: 0.4, smile: -1 });
    expect(fighter.morphTargets()).toEqual({ EE: 0.4, smile: 0 });

    app.dispose();
  });

  it("applies AnimationController pose and morph targets to bound runtime nodes", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(
        primitives
          .box({ name: "skinned fighter proxy" })
          .runtime(game.runtimeNode("fighter", { tags: ["fighter"] }))
      )
    });
    const fighter = app.nodes.require("fighter");
    const controller = new AnimationController<"idle" | "jab">({
      id: "fighter-animation",
      clips: [
        {
          id: "idle",
          duration: 1,
          loop: true,
          sample: ({ normalizedTime }) => poseAt(normalizedTime, normalizedTime)
        },
        {
          id: "jab",
          duration: 0.5,
          loop: false,
          attack: true,
          restartFromFrameZero: true,
          events: [{ name: "active", type: "hitbox", time: 0.12 }],
          sample: ({ normalizedTime }) => poseAt(0.5 + normalizedTime, 1)
        }
      ]
    });

    controller.bindRuntimeNode(fighter, { id: "fighter-binding" });
    controller.play("idle", { restart: true, loop: "loop" });
    controller.update(0.25);

    const idleSnapshot = fighter.snapshot();
    expect(idleSnapshot.animation).toMatchObject({ clip: "idle", captureTime: 0.25 });
    expect(idleSnapshot.animationBinding).toMatchObject({
      kind: "aura-runtime-node-animation-binding",
      controllerId: "fighter-animation",
      bindingId: "fighter-binding",
      activeClipId: "idle",
      localTime: 0.25
    });
    expect(idleSnapshot.animationPoseBinding).toMatchObject({
      kind: "aura-runtime-node-animation-pose",
      controllerId: "fighter-animation",
      bindingId: "fighter-binding",
      activeClipId: "idle",
      boneCount: 1,
      morphTargetCount: 1
    });
    expect(idleSnapshot.animationPose?.bones.root?.position?.x).toBeCloseTo(0.25);
    expect(idleSnapshot.morphTargets?.focus).toBeCloseTo(0.25);

    controller.restart("jab", { loop: false, layer: "upper-body" });
    controller.update(0.13);

    const jabSnapshot = fighter.snapshot();
    expect(jabSnapshot.animation).toMatchObject({ clip: "jab", startTime: 0, captureTime: 0.13 });
    expect(jabSnapshot.animationPose?.bones.root?.position?.x).toBeCloseTo(0.76);
    expect(jabSnapshot.morphTargets?.focus).toBeCloseTo(1);
    expect(controller.runtimeNodeBindingSnapshots()[0]).toMatchObject({
      id: "fighter-binding",
      nodeId: "fighter",
      appliedClipId: "jab",
      boneCount: 1,
      morphTargetCount: 1
    });

    controller.dispose();
    expect(fighter.snapshot().animationPose).toBeUndefined();

    app.dispose();
  });

  it("exposes imported GLB evidence and structured missing binding diagnostics on runtime nodes", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(
        primitives
          .box({ name: "imported hero proxy" })
          .runtime(game.runtimeNode("hero", { tags: ["character", "imported-glb"] }))
      )
    });
    const hero = app.nodes.require("hero");

    const evidence = createRuntimeNodeImportedAssetEvidence({
      assetId: "assets.hero",
      nodeId: "hero",
      skeletonBones: ["Hips", "Spine", "Head"],
      clips: ["Idle", "Talk"],
      activeClip: "Talk",
      skinningPalette: { jointCount: 3, matrixCount: 3, updated: true },
      morphTargets: ["AA", "Smile"],
      bounds: { position: [0, 1, 0], size: [1, 2, 1] },
      renderItemCount: 4,
      skinnedRenderItemCount: 3,
      morphRenderItemCount: 1,
      requiredClips: ["Idle", "Talk"],
      requiredBones: ["Hips", "Head"],
      requiredMorphTargets: ["AA"]
    });
    hero.setImportedAssetEvidence(evidence);

    expect(hero.snapshot().importedAssetEvidence).toMatchObject({
      kind: "aura-runtime-node-imported-asset-evidence",
      assetId: "assets.hero",
      nodeId: "hero",
      skeleton: { boneCount: 3, boneNames: ["Hips", "Spine", "Head"] },
      clips: ["Idle", "Talk"],
      activeClip: "Talk",
      skinningPalette: { jointCount: 3, matrixCount: 3, updated: true },
      morphTargets: ["AA", "Smile"],
      renderItemCount: 4,
      skinnedRenderItemCount: 3,
      morphRenderItemCount: 1,
      diagnostics: []
    });
    expect(hero.importedAssetEvidence()?.bounds?.size).toEqual([1, 2, 1]);

    const missing = createRuntimeNodeImportedAssetEvidence({
      assetId: "assets.hero",
      clips: ["Idle"],
      skeletonBones: ["Hips"],
      morphTargets: ["Smile"],
      requiredClips: ["Talk"],
      requiredBones: ["Head"],
      requiredMorphTargets: ["AA"]
    });

    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "missing-clip",
      "missing-bone",
      "missing-morph",
      "missing-skinning-palette",
      "missing-render-items"
    ]);

    app.dispose();
  });
});
