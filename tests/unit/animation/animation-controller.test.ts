import { describe, expect, it } from "vitest";
import {
  AnimationController,
  type AnimationPose,
  type AuraAnimationImportedRuntimeClipSample,
  type AuraAnimationImportedRuntimeLike
} from "../../../packages/engine/src/agent-api/AnimationController";
import type {
  AuraRuntimeNodeAnimationBindingMetadata,
  AuraRuntimeNodeAnimationPoseBindingMetadata,
  RuntimeNodeHandleLike,
  RuntimeNodeMorphTargetWeights,
  RuntimeNodeVec3
} from "../../../packages/engine/src/agent-api/RuntimeNodeHandle";

type ClipId = "idle" | "walk" | "jab" | "attack" | "ghost";

const poseAt = (x: number, focus = 0): AnimationPose => ({
  bones: {
    root: {
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 }
    }
  },
  morphTargets: { focus },
  rootMotion: {
    translation: { x, y: 0, z: 0 }
  }
});

describe("AnimationController", () => {
  it("plays, loops, crossfades, layers, samples crossed events, scrubs, and captures poses", () => {
    const controller = new AnimationController<ClipId>();
    const loopEvents: string[] = [];
    const sampledEvents: string[] = [];
    const crossfadeEvents: string[] = [];

    controller.on("loop", (event) => loopEvents.push(`${event.clipId}:${event.loopsPassed}`));
    controller.onEvent("hitbox", (event) => sampledEvents.push(`${event.clipId}:${event.event.type ?? "marker"}:${event.event.name}`));
    controller.on("crossFadeStart", (event) => crossfadeEvents.push(`start:${event.fromClipIds.join("+")}->${event.toClipId}`));
    controller.on("crossFadeEnd", (event) => crossfadeEvents.push(`end:${event.fromClipIds.join("+")}->${event.toClipId}`));

    controller.registerClip({ id: "idle", duration: 1, loop: true, sample: () => poseAt(0, 0.1) });
    controller.registerClip({
      id: "walk",
      duration: 1,
      loop: true,
      events: [{ name: "walk-window", type: "hitbox", time: 0.95 }],
      sample: ({ normalizedTime }) => poseAt(normalizedTime, normalizedTime)
    });
    controller.registerClip({
      id: "jab",
      duration: 0.5,
      layer: "upper-body",
      loop: false,
      events: [{ name: "jab-active", type: "hitbox", time: 0.2, once: true, payload: { volume: "jab-fist" } }],
      sample: ({ normalizedTime }) => poseAt(0.25 + normalizedTime * 0.1, 1)
    });

    const idle = controller.play("idle", { id: "idle-main", loop: "loop" });
    expect(idle).toMatchObject({ clipId: "idle", id: "idle-main", status: "playing", weight: 1 });

    controller.update(1.1);
    expect(loopEvents).toEqual(["idle:1"]);
    expect(controller.state("idle")?.localTime).toBeCloseTo(0.1);

    const walk = controller.crossFade("walk", 0.2, { loop: "loop" });
    expect(walk).toMatchObject({ clipId: "walk", weight: 0, targetWeight: 1 });

    controller.update(0.1);
    const halfway = Object.fromEntries(controller.snapshot().clips.map((clip) => [clip.clipId, clip.weight]));
    expect(halfway.idle).toBeCloseTo(0.5);
    expect(halfway.walk).toBeCloseTo(0.5);

    controller.update(0.1);
    const walkPose = controller.capturePose({ emitEvent: false });

    expect(crossfadeEvents).toEqual(["start:idle->walk", "end:idle->walk"]);
    expect(controller.snapshot().clips.map((clip) => clip.clipId)).toEqual(["walk"]);
    expect(walkPose.pose.bones.root?.position?.x).toBeCloseTo(0.2);
    expect(walkPose.pose.morphTargets?.focus).toBeCloseTo(0.2);

    controller.scrub("walk", 0.9, { play: true });
    controller.update(0.1);
    expect(sampledEvents).toEqual(["walk:hitbox:walk-window"]);

    controller.play("jab", { exclusive: false, restart: true, loop: false, layer: "upper-body" });
    controller.setLayerWeight("upper-body", 0.25);
    expect(controller.state("jab")?.effectiveWeight).toBeCloseTo(0.25);

    controller.restart("jab", { exclusive: false, loop: false, layer: "upper-body" });
    controller.update(0.21);

    expect(sampledEvents).toEqual(["walk:hitbox:walk-window", "jab:hitbox:jab-active"]);
    expect(controller.state("jab")?.status).toBe("playing");

    controller.stop("jab");
    const scrubbed = controller.scrub("walk", 0.75);

    expect(controller.state("walk")?.status).toBe("paused");
    expect(scrubbed.pose.bones.root?.position?.x).toBeCloseTo(0.75);

    controller.dispose();
    expect(controller.snapshot()).toMatchObject({ time: expect.any(Number), activeClipId: undefined, clips: [] });
  });

  it("registers embedded GLB clip metadata, reports diagnostics, suppresses root motion, and uses pose-baked fallback", () => {
    const controller = new AnimationController<ClipId>({
      clipRegistry: {
        assetId: "fighter",
        assetName: "Fighter",
        skeleton: {
          rootBone: "root",
          bones: ["root", "spine"]
        },
        suppressRootMotion: true,
        poseBakedFallback: {
          pose: poseAt(0.42, 0.7),
          source: "metadata-bind-pose",
          reason: "headless source fallback"
        },
        clips: [
          {
            id: "attack",
            duration: 0.6,
            events: [{ name: "active", type: "hitbox", time: 0.25 }],
            tracks: [
              { id: "root-x", target: "root.position", property: "translation", keyframes: [{ time: 0, value: { x: 0, y: 0, z: 0 } }, { time: 0.6, value: { x: 1, y: 0, z: 0 } }] }
            ]
          },
          {
            id: "ghost",
            duration: 1,
            requiredBones: ["missingArm"],
            tracks: [{ id: "empty-missing", target: "missingArm.rotation", property: "rotation", keyframes: [] }]
          }
        ]
      },
      requiredClips: ["idle"],
      requiredBones: ["head"]
    });

    expect(controller.clipIds()).toEqual(["attack", "ghost"]);
    expect(controller.embeddedGLBClipRegistryMetadata()).toMatchObject({ assetId: "fighter", assetName: "Fighter" });

    const diagnostics = controller.diagnostics({ requireSkeleton: true });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "ANIMATION_REQUIRED_CLIP_MISSING",
        "ANIMATION_REQUIRED_BONE_MISSING",
        "ANIMATION_BONE_MISSING",
        "ANIMATION_TRACK_EMPTY"
      ])
    );

    controller.play("attack");
    controller.update(0.3);
    const attackPose = controller.capturePose({ emitEvent: false });
    expect(attackPose.pose.rootMotion).toBeUndefined();
    expect(attackPose.pose.metadata?.rootMotionSuppressed).toBe(true);
    expect(attackPose.pose.bones.root?.position?.x).toBeCloseTo(0.5);

    controller.play("ghost");
    const fallbackPose = controller.capturePose({ emitEvent: false });
    expect(fallbackPose.pose.metadata?.poseBakedFallback).toBe(true);
    expect(fallbackPose.pose.bones.root?.position?.x).toBeCloseTo(0.42);
  });

  it("forwards visible clip playback, restart, blend samples, poses, and morph weights to bound runtimes", () => {
    type RuntimeClip = "idle" | "walk" | "jab";
    type ImportedCall =
      | { readonly kind: "applyClip"; readonly clipName: string; readonly time: number }
      | { readonly kind: "applyClips"; readonly samples: readonly AuraAnimationImportedRuntimeClipSample[] };
    const importedCalls: ImportedCall[] = [];
    const importedRuntime: AuraAnimationImportedRuntimeLike = {
      applyClip(clipName, time) {
        importedCalls.push({ kind: "applyClip", clipName, time });
        return {
          clipName,
          time,
          tracksApplied: 2,
          skinningPalettesUpdated: 1,
          morphWeightTracksApplied: 1
        };
      },
      applyClips(samples) {
        importedCalls.push({ kind: "applyClips", samples });
        return {
          clipName: `blend:${samples.map((sample) => sample.clipName).join("+")}`,
          time: Math.max(...samples.map((sample) => sample.time)),
          blendedClipCount: samples.length,
          tracksApplied: samples.length * 2,
          skinningPalettesUpdated: 1,
          morphWeightTracksApplied: 1
        };
      },
      snapshot() {
        return {
          clipCount: 3,
          skinningBindingCount: 1,
          morphTargetNodeCount: 1
        };
      }
    };
    const node = createRuntimeNodeStub("player");
    const controller = new AnimationController<RuntimeClip>({ id: "player-controller" });

    controller.registerClip({
      id: "idle",
      name: "IdleGLB",
      duration: 1,
      loop: true,
      sample: ({ normalizedTime }) => poseAt(normalizedTime, normalizedTime)
    });
    controller.registerClip({
      id: "walk",
      name: "WalkGLB",
      duration: 1,
      loop: true,
      sample: ({ normalizedTime }) => poseAt(1 + normalizedTime, 0.5)
    });
    controller.registerClip({
      id: "jab",
      name: "JabGLB",
      duration: 0.4,
      loop: false,
      attack: true,
      layer: "upper-body",
      restartFromFrameZero: true,
      sample: ({ normalizedTime }) => poseAt(2 + normalizedTime, 1)
    });

    controller.bindRuntimeNode(node, {
      id: "player-binding",
      importedRuntime,
      applyPose: true,
      applyMorphTargets: true
    });

    controller.play("idle", { loop: "loop" });
    controller.update(0.1);
    const idleCall = importedCalls.at(-1);
    expect(idleCall).toMatchObject({ kind: "applyClip", clipName: "IdleGLB" });
    if (idleCall?.kind !== "applyClip") throw new Error("Expected single imported runtime clip application.");
    expect(idleCall.time).toBeCloseTo(0.1);
    expect(node.latestAnimationBinding).toMatchObject({ activeClipId: "idle" });
    expect(node.latestAnimationBinding?.localTime).toBeCloseTo(0.1);
    expect(node.latestAnimationPoseBinding).toMatchObject({ activeClipId: "idle", boneCount: 1, morphTargetCount: 1 });
    expect(node.latestPose?.bones.root?.position?.x).toBeCloseTo(0.1);
    expect(node.latestMorphTargets.focus).toBeCloseTo(0.1);

    controller.crossFade("walk", 0.2, { loop: "loop" });
    controller.update(0.1);
    const blendCall = importedCalls.at(-1);
    expect(blendCall?.kind).toBe("applyClips");
    if (blendCall?.kind !== "applyClips") throw new Error("Expected blended imported runtime application.");
    expect(blendCall.samples.map((sample) => sample.clipName)).toEqual(expect.arrayContaining(["IdleGLB", "WalkGLB"]));
    expect(blendCall.samples.map((sample) => Number((sample.weight ?? 0).toFixed(2)))).toEqual(expect.arrayContaining([0.5]));
    expect(controller.runtimeNodeBindingSnapshots()[0]).toMatchObject({
      id: "player-binding",
      clipSamples: expect.arrayContaining([
        expect.objectContaining({ clipName: "IdleGLB" }),
        expect.objectContaining({ clipName: "WalkGLB" })
      ]),
      importedRuntime: {
        applied: true,
        blended: true,
        sampleCount: 2
      }
    });

    controller.play("jab", { exclusive: false, restart: true, loop: false, layer: "upper-body" });
    const restartCall = importedCalls.at(-1);
    expect(restartCall?.kind).toBe("applyClips");
    if (restartCall?.kind !== "applyClips") throw new Error("Expected imported runtime blend application after attack restart.");
    expect(restartCall.samples).toEqual(expect.arrayContaining([
      expect.objectContaining({ clipName: "JabGLB", time: 0 })
    ]));
    expect(controller.runtimeNodeBindingSnapshots()[0]?.clipSamples).toEqual(expect.arrayContaining([
      expect.objectContaining({ clipName: "JabGLB", localTime: 0, layer: "upper-body" })
    ]));
    expect(node.latestMorphTargets.focus).toBeGreaterThan(0.5);
    expect(node.latestMorphTargets.focus).toBeLessThan(1);
  });
});

function createRuntimeNodeStub(id: string): RuntimeNodeHandleLike & {
  latestAnimationBinding?: AuraRuntimeNodeAnimationBindingMetadata;
  latestAnimationPoseBinding?: AuraRuntimeNodeAnimationPoseBindingMetadata;
  latestPose?: AnimationPose;
  latestMorphTargets: Record<string, number>;
} {
  let node: RuntimeNodeHandleLike & {
    latestAnimation?: unknown;
    latestAnimationBinding?: AuraRuntimeNodeAnimationBindingMetadata;
    latestAnimationPoseBinding?: AuraRuntimeNodeAnimationPoseBindingMetadata;
    latestPose?: AnimationPose;
    latestMorphTargets: Record<string, number>;
  };
  node = {
    id,
    kind: "model",
    tags: ["fighter"],
    position: [0, 0, 0] as RuntimeNodeVec3,
    rotation: [0, 0, 0] as RuntimeNodeVec3,
    scale: 1,
    visible: true,
    latestMorphTargets: {},
    setPosition(x, y, z) {
      node.position = [x, y, z];
      return node;
    },
    translate(x, y, z) {
      node.position = [node.position[0] + x, node.position[1] + y, node.position[2] + z];
      return node;
    },
    setRotation(x, y, z) {
      node.rotation = [x, y, z];
      return node;
    },
    setScale(scale) {
      node.scale = scale;
      return node;
    },
    setVisible(visible) {
      node.visible = visible;
      return node;
    },
    play(clip, options = {}) {
      node.latestAnimation = { clip, ...options };
      return node;
    },
    setAnimation(animation) {
      node.latestAnimation = animation;
      return node;
    },
    setAnimationBinding(binding) {
      node.latestAnimationBinding = binding;
      return node;
    },
    setAnimationPose(pose, metadata) {
      node.latestPose = pose;
      node.latestAnimationPoseBinding = metadata;
      return node;
    },
    setMorphTarget(name, weight) {
      node.latestMorphTargets[name] = weight;
      return node;
    },
    setMorphTargets(weights: RuntimeNodeMorphTargetWeights) {
      node.latestMorphTargets = { ...weights };
      return node;
    },
    morphTargets() {
      return { ...node.latestMorphTargets };
    },
    snapshot() {
      return {
        id: node.id,
        animation: node.latestAnimation,
        animationBinding: node.latestAnimationBinding,
        animationPose: node.latestPose,
        animationPoseBinding: node.latestAnimationPoseBinding,
        morphTargets: node.latestMorphTargets
      };
    }
  } as RuntimeNodeHandleLike & {
    latestAnimation?: unknown;
    latestAnimationBinding?: AuraRuntimeNodeAnimationBindingMetadata;
    latestAnimationPoseBinding?: AuraRuntimeNodeAnimationPoseBindingMetadata;
    latestPose?: AnimationPose;
    latestMorphTargets: Record<string, number>;
  };
  return node;
}
