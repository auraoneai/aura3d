import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { Renderable, Scene } from "@aura3d/scene";
import { createGLTFSceneAnimationMixer, createGLTFSceneAnimationRuntime } from "../../packages/assets/src/GLTFAnimationRuntime";
import type { GLTFAsset } from "../../packages/assets/src/GLTFLoader";

describe("GLTFSceneAnimationRuntime", () => {
  it("applies imported-style TRS tracks to matching scene nodes", () => {
    const scene = new Scene();
    const node = scene.createNode("AnimatedNode");
    scene.root.addChild(node);
    const clip = new AnimationClip({
      name: "move",
      duration: 1,
      tracks: [
        new AnimationTrack({ target: "AnimatedNode.translation", valueType: "vector3", keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [2, 4, 6] }
        ] }),
        new AnimationTrack({ target: "AnimatedNode.scale", valueType: "vector3", keyframes: [
          { time: 0, value: [1, 1, 1] },
          { time: 1, value: [2, 3, 4] }
        ] })
      ]
    });

    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip] });
    const result = runtime.applyClipByName("move", 0.5);

    expect(result.transformTracksApplied).toBe(2);
    expect(result.missingTargets).toEqual([]);
    expect(node.transform.position).toEqual([1, 2, 3]);
    expect(node.transform.scale).toEqual([1.5, 2, 2.5]);
    expect(runtime.snapshot().lastApply?.clipName).toBe("move");
  });

  it("applies imported morph-weight tracks to renderables on the target node", () => {
    const scene = new Scene();
    const node = scene.createNode("AnimatedMorphCube");
    scene.root.addChild(node);
    const renderable = new Renderable({
      geometry: "morph-geometry",
      material: "morph-material",
      morphWeights: [0, 0]
    });
    scene.addRenderable(node, renderable);
    const clip = new AnimationClip({
      name: "Square",
      duration: 1,
      tracks: [new AnimationTrack({ target: "AnimatedMorphCube.weights", valueType: "number-array", keyframes: [
        { time: 0, value: [0, 0] },
        { time: 1, value: [0.25, 0.75] }
      ] })]
    });

    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip] });
    const result = runtime.applyClip(clip, 1);

    expect(result.morphWeightTracksApplied).toBe(1);
    expect(renderable.morphWeights).toEqual([0.25, 0.75]);
    expect(runtime.snapshot().morphTargetNodeCount).toBeGreaterThanOrEqual(1);
  });

  it("drives imported morph targets through a reusable public controller", () => {
    const scene = new Scene();
    const node = scene.createNode("AnimatedMorphCube");
    scene.root.addChild(node);
    const renderable = new Renderable({
      geometry: "morph-geometry",
      material: "morph-material",
      morphWeights: [0, 0, 0]
    });
    scene.addRenderable(node, renderable);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [] });

    const controller = runtime.createMorphTargetController({
      target: "AnimatedMorphCube.weights",
      labels: ["smile", "blink", "jaw"],
      initialWeights: [0.1, 0, 0]
    });
    const result = controller
      .setWeight("smile", 0.4)
      .setWeight(1, 1.4)
      .setWeight("jaw", -0.2)
      .apply(0.25, "manual morph controls");

    expect(result.morphWeightTracksApplied).toBe(1);
    expect(renderable.morphWeights).toEqual([0.4, 1, 0]);
    expect(controller.getWeights()).toEqual([0.4, 1, 0]);
    expect(controller.snapshot()).toMatchObject({
      target: "AnimatedMorphCube.weights",
      labels: ["smile", "blink", "jaw"],
      weights: [0.4, 1, 0],
      lastApply: {
        clipName: "manual morph controls",
        morphWeightTracksApplied: 1
      }
    });
  });

  it("refreshes renderable skinning palettes from animated GLTF joint nodes", () => {
    const scene = new Scene();
    const meshNode = scene.createNode("SkinnedMeshNode");
    const jointNode = scene.createNode("JointA");
    scene.root.addChild(meshNode);
    scene.root.addChild(jointNode);
    const renderable = new Renderable({
      geometry: "skinned-geometry",
      material: "skinned-material",
      skinning: { jointCount: 1, matrices: new Float32Array(identityMat4Fixture()) }
    });
    scene.addRenderable(meshNode, renderable);
    const clip = new AnimationClip({
      name: "joint-move",
      duration: 1,
      tracks: [new AnimationTrack({ target: "JointA.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [0, 2, 0] }
      ] })]
    });
    const asset = {
      meshes: [{ name: "skinned-geometry", skinIndex: 0 }],
      skins: [{
        name: "skin",
        joints: [0],
        jointNames: ["JointA"],
        inverseBindMatrices: [identityMat4Fixture()]
      }]
    } as Pick<GLTFAsset, "meshes" | "skins">;

    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip], asset });
    const result = runtime.applyClip(clip, 1);

    expect(result.skinningPalettesUpdated).toBe(1);
    expect(runtime.snapshot().skinningBindingCount).toBe(1);
    expect(Array.from(renderable.skinning?.matrices ?? [])[13]).toBeCloseTo(2);
  });

  it("updates multiple renderables that share one imported skeleton", () => {
    const scene = new Scene();
    const meshA = scene.createNode("SharedSkinMeshA");
    const meshB = scene.createNode("SharedSkinMeshB");
    const jointNode = scene.createNode("SharedJoint");
    scene.root.addChild(meshA);
    scene.root.addChild(meshB);
    scene.root.addChild(jointNode);
    const renderableA = new Renderable({
      geometry: "shared-skin-geometry-a",
      material: "skinned-material",
      skinning: { jointCount: 1, matrices: new Float32Array(identityMat4Fixture()) }
    });
    const renderableB = new Renderable({
      geometry: "shared-skin-geometry-b",
      material: "skinned-material",
      skinning: { jointCount: 1, matrices: new Float32Array(identityMat4Fixture()) }
    });
    scene.addRenderable(meshA, renderableA);
    scene.addRenderable(meshB, renderableB);
    const clip = new AnimationClip({
      name: "shared-joint-move",
      duration: 1,
      tracks: [new AnimationTrack({ target: "SharedJoint.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [0, 3, 0] }
      ] })]
    });
    const asset = {
      meshes: [
        { name: "shared-skin-geometry-a", skinIndex: 0 },
        { name: "shared-skin-geometry-b", skinIndex: 0 }
      ],
      skins: [{
        name: "shared-skin",
        joints: [0],
        jointNames: ["SharedJoint"],
        inverseBindMatrices: [identityMat4Fixture()]
      }]
    } as Pick<GLTFAsset, "meshes" | "skins">;

    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip], asset });
    const result = runtime.applyClip(clip, 1);

    expect(result.skinningPalettesUpdated).toBe(2);
    expect(runtime.snapshot().skinningBindingCount).toBe(2);
    expect(Array.from(renderableA.skinning?.matrices ?? [])[13]).toBeCloseTo(3);
    expect(Array.from(renderableB.skinning?.matrices ?? [])[13]).toBeCloseTo(3);
  });

  it("blends multiple imported clips and applies additive morph weights without Three.js runtime", () => {
    const scene = new Scene();
    const node = scene.createNode("AnimatedNode");
    const morphNode = scene.createNode("AnimatedMorphCube");
    scene.root.addChild(node);
    scene.root.addChild(morphNode);
    const renderable = new Renderable({
      geometry: "morph-geometry",
      material: "morph-material",
      morphWeights: [0, 0]
    });
    scene.addRenderable(morphNode, renderable);
    const walk = new AnimationClip({
      name: "walk",
      duration: 1,
      tracks: [
        new AnimationTrack({ target: "AnimatedNode.translation", valueType: "vector3", keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [2, 0, 0] }
        ] }),
        new AnimationTrack({ target: "AnimatedMorphCube.weights", valueType: "number-array", keyframes: [
          { time: 0, value: [0, 0] },
          { time: 1, value: [0.2, 0.2] }
        ] })
      ]
    });
    const run = new AnimationClip({
      name: "run",
      duration: 1,
      tracks: [
        new AnimationTrack({ target: "AnimatedNode.translation", valueType: "vector3", keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [6, 0, 0] }
        ] }),
        new AnimationTrack({ target: "AnimatedMorphCube.weights", valueType: "number-array", keyframes: [
          { time: 0, value: [0, 0] },
          { time: 1, value: [0.6, 0.2] }
        ] })
      ]
    });
    const expressionAdditive = new AnimationClip({
      name: "expression-additive",
      duration: 1,
      tracks: [new AnimationTrack({ target: "AnimatedMorphCube.weights", valueType: "number-array", keyframes: [
        { time: 0, value: [0, 0] },
        { time: 1, value: [0.1, 0.3] }
      ] })]
    });

    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [walk, run, expressionAdditive] });
    const result = runtime.applyClips([
      { clipName: "walk", time: 1, weight: 0.25 },
      { clipName: "run", time: 1, weight: 0.75 },
      { clipName: "expression-additive", time: 1, weight: 0.5, additive: true }
    ]);

    expect(result.blendedClipCount).toBe(3);
    expect(result.transformTracksApplied).toBe(1);
    expect(result.morphWeightTracksApplied).toBe(1);
    expect(result.missingTargets).toEqual([]);
    expect(node.transform.position[0]).toBeCloseTo(5);
    expect(renderable.morphWeights[0]).toBeCloseTo(0.55);
    expect(renderable.morphWeights[1]).toBeCloseTo(0.35);
    expect(runtime.snapshot().lastApply?.clipName).toMatch(/^blend:/);
  });

  it("drives imported GLTF scene animation through reusable mixer actions and crossfades", () => {
    const scene = new Scene();
    const node = scene.createNode("CharacterRoot");
    scene.root.addChild(node);
    const walk = new AnimationClip({
      name: "walk",
      duration: 1,
      tracks: [new AnimationTrack({ target: "CharacterRoot.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [1, 0, 0] }
      ] })]
    });
    const run = new AnimationClip({
      name: "run",
      duration: 1,
      tracks: [new AnimationTrack({ target: "CharacterRoot.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [3, 0, 0] }
      ] })]
    });

    const binding = createGLTFSceneAnimationMixer({ scene, clips: [walk, run], autoPlay: "walk" });
    expect(binding.listClips()).toEqual(["walk", "run"]);
    binding.setActionLoop("walk", "repeat");
    binding.setActionTimeScale("walk", 1.25);
    const first = binding.update(0.5);
    expect(first.applyResult.transformTracksApplied).toBe(1);
    expect(node.transform.position[0]).toBeCloseTo(0.625);

    binding.crossFade("walk", "run", 1);
    const blended = binding.update(0.5);

    expect(blended.applyResult.clipName).toBe("gltf-animation-mixer");
    expect(blended.applyResult.missingTargets).toEqual([]);
    expect(node.transform.position[0]).toBeGreaterThan(0.5);
    expect(node.transform.position[0]).toBeLessThan(3);
    expect(binding.getAction("run")?.playing).toBe(true);
    expect(binding.snapshot()).toMatchObject({
      clipCount: 2,
      mixerActionCount: 2,
      pendingValueCount: 1,
      activeClipNames: ["walk", "run"]
    });
  });

  it("applies weighted and additive imported clip samples through the public mixer binding", () => {
    const scene = new Scene();
    const node = scene.createNode("CharacterRoot");
    scene.root.addChild(node);
    const base = new AnimationClip({
      name: "base",
      duration: 1,
      tracks: [new AnimationTrack({ target: "CharacterRoot.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [2, 0, 0] }
      ] })]
    });
    const overlay = new AnimationClip({
      name: "overlay",
      duration: 1,
      tracks: [new AnimationTrack({ target: "CharacterRoot.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [0, 1, 0] }
      ] })]
    });
    const binding = createGLTFSceneAnimationMixer({ scene, clips: [base, overlay], autoPlay: false });

    const result = binding.applyClipSamples([
      { clipName: "base", time: 0.5, weight: 1 },
      { clipName: "overlay", time: 1, weight: 0.25, additive: true }
    ]);

    expect(result.events).toEqual([]);
    expect(result.applyResult.blendedClipCount).toBe(2);
    expect(node.transform.position[0]).toBeCloseTo(1);
    expect(node.transform.position[1]).toBeCloseTo(0.25);
    expect(binding.snapshot().lastApply?.clipName).toMatch(/^blend:/);
  });

  it("exposes public imported clip controls for exclusive play, seek, pause, resume, and stop", () => {
    const scene = new Scene();
    const node = scene.createNode("CharacterRoot");
    scene.root.addChild(node);
    const idle = new AnimationClip({
      name: "idle",
      duration: 2,
      tracks: [new AnimationTrack({ target: "CharacterRoot.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 2, value: [0, 1, 0] }
      ] })]
    });
    const run = new AnimationClip({
      name: "run",
      duration: 1,
      tracks: [new AnimationTrack({ target: "CharacterRoot.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [4, 0, 0] }
      ] })]
    });
    const binding = createGLTFSceneAnimationMixer({ scene, clips: [idle, run], autoPlay: false });

    binding.playExclusive("run", { reset: true, weight: 1, timeScale: 0, loopMode: "repeat" });
    binding.seek("run", 0.25);
    const sampled = binding.update(0);

    expect(sampled.applyResult.transformTracksApplied).toBe(1);
    expect(node.transform.position[0]).toBeCloseTo(1);
    expect(binding.snapshot().activeClipNames).toEqual(["run"]);

    binding.pause("run");
    expect(binding.snapshot().actions.find((action) => action.clipName === "run")?.paused).toBe(true);
    binding.resume("run");
    expect(binding.snapshot().actions.find((action) => action.clipName === "run")?.paused).toBe(false);
    binding.stop();
    expect(binding.snapshot().activeClipNames).toEqual([]);
  });

  it("solves imported glTF skin joints with two-bone IK and refreshes skinning palettes", () => {
    const scene = new Scene();
    const meshNode = scene.createNode("SkinnedMeshNode");
    const root = scene.createNode("UpperArm");
    const mid = scene.createNode("LowerArm");
    const end = scene.createNode("Hand");
    scene.root.addChild(meshNode);
    scene.root.addChild(root);
    root.addChild(mid);
    mid.addChild(end);
    root.transform.setPosition(0, 0, 0);
    mid.transform.setPosition(0, 1, 0);
    end.transform.setPosition(0, 1, 0);
    const renderable = new Renderable({
      geometry: "skinned-arm",
      material: "skinned-material",
      skinning: { jointCount: 3, matrices: new Float32Array(identityMat4Fixture().length * 3) }
    });
    scene.addRenderable(meshNode, renderable);
    const asset = {
      meshes: [{ name: "skinned-arm", skinIndex: 0 }],
      skins: [{
        name: "arm-skin",
        joints: [0, 1, 2],
        jointNames: ["UpperArm", "LowerArm", "Hand"],
        inverseBindMatrices: [identityMat4Fixture(), identityMat4Fixture(), identityMat4Fixture()]
      }]
    } as Pick<GLTFAsset, "meshes" | "skins">;

    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });
    const result = runtime.solveImportedSkeletonTwoBoneIK({
      skinName: "arm-skin",
      jointNames: ["UpperArm", "LowerArm", "Hand"],
      target: [0.8, 1.6, 0],
      pole: [0, 1, 1],
      allowStretch: false
    });

    scene.updateWorldTransforms();
    expect(result.applied).toBe(true);
    expect(result.skinningPalettesUpdated).toBe(1);
    expect(result.missingTargets).toEqual([]);
    expect(result.solution.endDistanceToTarget).toBeLessThan(0.001);
    expect(end.transform.worldMatrix[12]).toBeCloseTo(0.8, 4);
    expect(end.transform.worldMatrix[13]).toBeCloseTo(1.6, 4);
    expect(Array.from(renderable.skinning?.matrices ?? [])[32 + 12]).toBeCloseTo(0.8, 4);
    expect(Array.from(renderable.skinning?.matrices ?? [])[32 + 13]).toBeCloseTo(1.6, 4);
  });

  it("drives imported glTF IK through a reusable public controller", () => {
    const scene = new Scene();
    const meshNode = scene.createNode("SkinnedMeshNode");
    const root = scene.createNode("UpperArm");
    const mid = scene.createNode("LowerArm");
    const end = scene.createNode("Hand");
    scene.root.addChild(meshNode);
    scene.root.addChild(root);
    root.addChild(mid);
    mid.addChild(end);
    root.transform.setPosition(0, 0, 0);
    mid.transform.setPosition(0, 1, 0);
    end.transform.setPosition(0, 1, 0);
    const renderable = new Renderable({
      geometry: "skinned-arm",
      material: "skinned-material",
      skinning: { jointCount: 3, matrices: new Float32Array(identityMat4Fixture().length * 3) }
    });
    scene.addRenderable(meshNode, renderable);
    const asset = {
      meshes: [{ name: "skinned-arm", skinIndex: 0 }],
      skins: [{
        name: "arm-skin",
        joints: [0, 1, 2],
        jointNames: ["UpperArm", "LowerArm", "Hand"],
        inverseBindMatrices: [identityMat4Fixture(), identityMat4Fixture(), identityMat4Fixture()]
      }]
    } as Pick<GLTFAsset, "meshes" | "skins">;

    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });
    const controller = runtime.createTwoBoneIKController({
      skinName: "arm-skin",
      jointNames: ["UpperArm", "LowerArm", "Hand"],
      target: [0.3, 1.7, 0],
      pole: [0, 1, 1],
      weight: 0.5,
      allowStretch: false
    });
    const first = controller.solve();
    const second = controller.solve({ target: [0.8, 1.6, 0], weight: 1 });

    expect(first.applied).toBe(true);
    expect(first.solution.endDistanceToTarget).toBeGreaterThan(second.solution.endDistanceToTarget);
    expect(second.solution.endDistanceToTarget).toBeLessThan(0.001);
    expect(second.skinningPalettesUpdated).toBe(1);
    expect(controller.snapshot()).toMatchObject({
      target: [0.8, 1.6, 0],
      weight: 1,
      skinName: "arm-skin",
      jointNames: ["UpperArm", "LowerArm", "Hand"]
    });
  });

  it("samples multiple imported animation clones through a reusable public clone sampler", () => {
    const scene = new Scene();
    const node = scene.createNode("CharacterRoot");
    scene.root.addChild(node);
    const walk = new AnimationClip({
      name: "walk",
      duration: 1,
      tracks: [new AnimationTrack({ target: "CharacterRoot.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [1, 0, 0] }
      ] })]
    });
    const run = new AnimationClip({
      name: "run",
      duration: 1,
      tracks: [new AnimationTrack({ target: "CharacterRoot.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [3, 0, 0] }
      ] })]
    });
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [walk, run] });
    const sampler = runtime.createCloneSampler();
    const observed: number[] = [];

    const results = sampler.sampleClones([
      { cloneId: "agent-a", clipName: "walk", time: 0.5 },
      { cloneId: "agent-b", clipName: "run", time: 0.5 }
    ], () => {
      observed.push(node.transform.position[0]);
    });

    expect(results.map((result) => result.cloneId)).toEqual(["agent-a", "agent-b"]);
    expect(observed[0]).toBeCloseTo(0.5);
    expect(observed[1]).toBeCloseTo(1.5);
    expect(sampler.snapshot()).toMatchObject({
      cloneCount: 2,
      lastSampleCount: 2
    });
  });
});

function identityMat4Fixture(): [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}
