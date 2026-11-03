import { describe, expect, it } from "vitest";
import { AnimationAction, AnimationClip, AnimationTrack } from "../../../packages/animation/src/index.js";
import { bindSkeleton } from "../../../packages/animation/src/pose/SkeletonBinding.js";
import { createPoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer.js";
import { PoseMixer } from "../../../packages/animation/src/pose/PoseMixer.js";
import { createGLTFSceneAnimationMixer, createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime.js";
import { Scene } from "../../../packages/scene/src/Scene.js";

// Hand-authored numerical fixture: one translation and two markers over one second.
function clip(name = "move", duration = 1): AnimationClip {
  return new AnimationClip({
    name,
    duration,
    tracks: [new AnimationTrack({
      target: "Bone.translation", valueType: "vector3",
      keyframes: duration === 0
        ? [{ time: 0, value: [0, 0, 0] }]
        : [{ time: 0, value: [0, 0, 0] }, { time: duration, value: [duration, 0, 0] }]
    })],
    events: duration > 0 ? [{ name: "early", time: duration * 0.25 }, { name: "late", time: duration * 0.75 }] : []
  });
}

function poseMixer(clips = [clip()]) {
  const skeleton = bindSkeleton({
    joints: [0], jointNames: ["Bone"], parentIndices: [-1],
    resolveNode: () => ({ name: "Bone", position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] })
  });
  const mixer = new PoseMixer({ skeleton });
  for (const entry of clips) mixer.addClip(entry.name, entry);
  const pose = createPoseBuffer(1);
  return { mixer, pose };
}

function eventLabels(events: readonly { name: string; direction: number }[]): string[] {
  return events.map((event) => `${event.name}:${event.direction}`);
}

describe("native compiled-pose and glTF playback", () => {
  it.each(["repeat", "pingpong"] as const)("matches core playback and marker order for %s across signed multi-boundary steps", (mode) => {
    const source = clip();
    const core = new AnimationAction(source).setLoop(mode).play();
    const { mixer, pose } = poseMixer([source]);
    const action = mixer.play(source.name, { loopMode: mode });

    for (const delta of [2.6, -0.45, -1.8, 0.9]) {
      const expected = core.update(delta);
      const actual = mixer.update(delta);
      expect(action.time).toBeCloseTo(core.time, 8);
      expect(eventLabels(actual.map(({ event, direction }) => ({ name: event.name, direction })))).toEqual(eventLabels(expected));
      mixer.evaluate(pose);
      expect(pose.positions[0]).toBeCloseTo(core.time, 6);
    }
  });

  it("delivers every reflected marker in traversal order and reports bounded overflow", () => {
    const { mixer } = poseMixer();
    const action = mixer.play("move", { loopMode: "pingpong" });
    const events = mixer.update(2.6);
    expect(eventLabels(events.map(({ event, direction }) => ({ name: event.name, direction })))).toEqual([
      "early:1", "late:1", "late:-1", "early:-1", "early:1"
    ]);
    action.maxEventCatchUp = 2;
    const bounded = mixer.update(4);
    expect(bounded).toHaveLength(2);
    expect(mixer.lastEventOverflow).toBe(6);
    expect(action.time).toBeCloseTo(0.6, 8);
  });

  it("handles once completion, a held final pose, pause/resume and zero-duration clips", () => {
    const { mixer, pose } = poseMixer([clip(), clip("still", 0)]);
    const action = mixer.play("move", { loopMode: "once", clampWhenFinished: true });
    mixer.update(0.5);
    action.pause();
    expect(mixer.update(0.5)).toEqual([]);
    expect(action.time).toBeCloseTo(0.5);
    action.play();
    const events = mixer.update(1);
    expect(events.map(({ event }) => event.name)).toEqual(["late"]);
    expect(action.paused).toBe(true);
    expect(action.time).toBe(1);
    mixer.evaluate(pose);
    expect(pose.positions[0]).toBe(1);
    action.stop();
    expect(action.time).toBe(0);
    const still = mixer.play("still");
    expect(mixer.update(2)).toEqual([]);
    expect(still.time).toBe(0);
  });

  it("integrates signed warp consistently across large and small steps and keeps sync phases aligned", () => {
    const clips = [clip("one"), clip("two", 2)];
    const large = poseMixer(clips);
    const small = poseMixer(clips);
    for (const { mixer } of [large, small]) {
      const leader = mixer.play("one", { syncGroup: "walk" });
      mixer.play("two", { syncGroup: "walk" });
      leader.warp(1, 2, 1);
    }
    large.mixer.update(-1);
    for (let i = 0; i < 10; i++) small.mixer.update(-0.1);
    const [largeLeader, largeFollower] = large.mixer.activeActions();
    const [smallLeader, smallFollower] = small.mixer.activeActions();
    expect(largeLeader!.time).toBeCloseTo(smallLeader!.time, 7);
    expect(largeFollower!.normalizedPhase).toBeCloseTo(largeLeader!.normalizedPhase, 7);
    expect(smallFollower!.normalizedPhase).toBeCloseTo(smallLeader!.normalizedPhase, 7);
  });

  it("does not erase marker crossings when a warp changes direction within one update", () => {
    const large = poseMixer();
    const small = poseMixer();
    const one = large.mixer.play("move");
    const many = small.mixer.play("move");
    one.time = 0.5;
    many.time = 0.5;
    one.warp(-2, 2, 1);
    many.warp(-2, 2, 1);
    const largeEvents = large.mixer.update(1);
    const smallEvents = Array.from({ length: 10 }, () => small.mixer.update(0.1)).flat();
    const labels = (events: typeof largeEvents) => eventLabels(events.map(({ event, direction }) => ({ name: event.name, direction })));
    expect(labels(largeEvents)).toEqual(["early:-1", "early:1"]);
    expect(labels(largeEvents)).toEqual(labels(smallEvents));
    expect(one.time).toBeCloseTo(many.time, 8);
  });

  it("synchronizes a late joiner to the leader's reflected direction before emitting markers", () => {
    const { mixer } = poseMixer([clip("leader"), clip("follower", 2)]);
    const leader = mixer.play("leader", { loopMode: "pingpong", syncGroup: "walk" });
    mixer.update(1.2);
    const follower = mixer.play("follower", { loopMode: "pingpong", syncGroup: "walk" });
    const events = mixer.update(0.3).filter((event) => event.clipId === "follower");
    expect(leader.time).toBeCloseTo(0.5);
    expect(follower.time).toBeCloseTo(1);
    expect(eventLabels(events.map(({ event, direction }) => ({ name: event.name, direction })))).toEqual(["late:-1"]);
  });

  it("traverses the leader's seam for synchronized actions with a different standalone loop mode", () => {
    const { mixer } = poseMixer([clip("leader"), clip("follower", 2)]);
    const leader = mixer.play("leader", { loopMode: "repeat", syncGroup: "walk" });
    leader.time = 0.6;
    const follower = mixer.play("follower", { loopMode: "pingpong", syncGroup: "walk" });
    const events = mixer.update(0.8).filter((event) => event.clipId === "follower");
    expect(eventLabels(events.map(({ event, direction }) => ({ name: event.name, direction })))).toEqual(["late:1", "early:1"]);
    expect(follower.time).toBeCloseTo(0.8);
    expect(follower.loopMode).toBe("pingpong");
  });

  it("copies reflected direction and playback rate with explicit syncWith", () => {
    const { mixer } = poseMixer([clip("leader"), clip("follower")]);
    const leader = mixer.play("leader", { loopMode: "pingpong", timeScale: 0.5 });
    mixer.update(2.4);
    const follower = mixer.play("follower", { loopMode: "pingpong" });
    follower.syncWith(leader);
    const events = mixer.update(0.6).filter((event) => event.clipId === "follower");
    expect(follower.time).toBeCloseTo(leader.time);
    expect(follower.timeScale).toBe(0.5);
    expect(eventLabels(events.map(({ event, direction }) => ({ name: event.name, direction })))).toEqual(["late:-1"]);
  });

  it("advances fades by elapsed signed mixer time and pauses them with the mixer clock", () => {
    const { mixer } = poseMixer();
    const action = mixer.play("move", { weight: 0.8 });
    action.fadeTo(0.2, 1);
    mixer.update(-0.5);
    expect(action.effectiveWeight).toBeCloseTo(0.5);
    mixer.setEffectiveTimeScale(0);
    mixer.update(2);
    expect(action.effectiveWeight).toBeCloseTo(0.5);
    mixer.setEffectiveTimeScale(-1);
    mixer.update(0.5);
    expect(action.effectiveWeight).toBeCloseTo(0.2);
    expect(action.weight).toBeCloseTo(0.2);
  });

  it("retires a faded action and preserves the replacement's authored weight", () => {
    const { mixer, pose } = poseMixer([clip("old"), clip("new")]);
    const old = mixer.play("old");
    const replacement = mixer.crossFadeTo("new", 0.5, { weight: 0.4, warp: true });
    mixer.update(0.5);
    mixer.evaluate(pose);
    expect(old.playing).toBe(false);
    expect(mixer.activeActions()).toEqual([replacement]);
    expect(replacement.effectiveWeight).toBeCloseTo(0.4);
    expect(pose.positions[0]).toBeCloseTo(0.2);
  });

  it("advances glTF scene bindings with signed deltas and rates, then releases owned runtime state", () => {
    const scene = new Scene();
    const node = scene.createNode("Bone");
    scene.root.addChild(node);
    const binding = createGLTFSceneAnimationMixer({ scene, clips: [clip()] });
    binding.update(0.6);
    expect(node.transform.position[0]).toBeCloseTo(0.6);
    binding.setTimeScale(-1);
    expect(binding.update(0.4).events.map((event) => event.name)).toEqual(["early"]);
    expect(node.transform.position[0]).toBeCloseTo(0.2);
    binding.update(-0.3);
    expect(node.transform.position[0]).toBeCloseTo(0.5);
    binding.pause();
    binding.update(0.2);
    expect(node.transform.position[0]).toBeCloseTo(0.5);
    binding.resume();
    binding.setActionLoop("move", "once", 1);
    binding.update(2);
    expect(binding.getAction("move")?.playing).toBe(false);
    expect(binding.getAction("move")?.time).toBe(0);
    binding.dispose();
    expect(() => binding.update(0)).toThrow(/disposed/);
    expect(() => binding.snapshot()).toThrow(/disposed/);
    expect(() => binding.dispose()).not.toThrow();
  });

  it("writes a reversed compiled pose to the scene through the glTF runtime", () => {
    const scene = new Scene();
    const node = scene.createNode("Bone");
    scene.root.addChild(node);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip()] });
    const action = runtime.mixer().play("move");
    runtime.applyPoseMixer(0.8);
    runtime.applyPoseMixer(-0.35);
    expect(action.time).toBeCloseTo(0.45);
    expect(node.transform.position[0]).toBeCloseTo(0.45, 6);
    runtime.dispose();
    expect(() => runtime.applyPoseMixer(0)).toThrow(/disposed/);
    expect(() => action.play()).toThrow(/disposed/);
  });

  it("retires pose actions and listeners when the glTF scene is reindexed", () => {
    const scene = new Scene();
    const node = scene.createNode("Bone");
    scene.root.addChild(node);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip()] });
    const oldMixer = runtime.mixer();
    const oldAction = oldMixer.play("move");
    let notifications = 0;
    oldMixer.onEvent(() => { notifications++; });
    runtime.reindexScene();
    expect(oldAction.playing).toBe(false);
    expect(() => oldMixer.update(1)).toThrow(/disposed/);
    expect(() => oldAction.play()).toThrow(/disposed/);
    const nextMixer = runtime.mixer();
    nextMixer.play("move");
    nextMixer.update(0.5);
    expect(notifications).toBe(0);
    runtime.dispose();
  });

  it("does not publish an asynchronous retarget after its runtime is disposed", async () => {
    const scene = new Scene();
    const node = scene.createNode("Bone");
    scene.root.addChild(node);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip()] });
    const pending = runtime.addClipsFrom({ skeleton: runtime.skeletons()[0]!, clips: runtime.compiledClips() }, { worker: false });
    runtime.dispose();
    await expect(pending).rejects.toThrow(/disposed/);
  });

  it("rejects wider or mismatched tracks instead of truncating bone transforms", () => {
    const invalid = new AnimationClip({
      name: "invalid", tracks: [new AnimationTrack({
        target: "Bone.translation", valueType: "number-array", valueSize: 5,
        keyframes: [{ time: 0, value: [1, 2, 3, 4, 5] }]
      })]
    });
    const { mixer } = poseMixer([invalid]);
    expect(() => mixer.play("invalid")).toThrow(/POSE_TRACK_TYPE_MISMATCH.*Bone\.translation/);
  });

  it("binds escaped Unicode names through both glTF playback paths", () => {
    const name = "Épaule.[L]";
    const escaped = "Épaule\\.\\[L\\].translation";
    const source = new AnimationClip({ name: "move", duration: 1, tracks: [new AnimationTrack({
      target: escaped, valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] }, { time: 1, value: [2, 0, 0] }
      ]
    })] });
    const scene = new Scene();
    const node = scene.createNode(name);
    scene.root.addChild(node);
    const binding = createGLTFSceneAnimationMixer({ scene, clips: [source] });
    expect(binding.update(0.25).applyResult.missingTargets).toEqual([]);
    expect(node.transform.position[0]).toBeCloseTo(0.5);
    binding.dispose();

    node.transform.setPosition(0, 0, 0);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [source] });
    runtime.mixer().play("move");
    expect(runtime.applyPoseMixer(0.5).missingTargets).toEqual([]);
    expect(node.transform.position[0]).toBeCloseTo(1);
    runtime.dispose();
  });

  it("applies a compiled track to each same-named joint", () => {
    const skeleton = bindSkeleton({
      joints: [0, 1], jointNames: ["Bone", "Bone"], parentIndices: [-1, -1],
      resolveNode: () => ({ name: "Bone", position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] })
    });
    const mixer = new PoseMixer({ skeleton });
    mixer.addClip("move", clip());
    mixer.play("move");
    mixer.update(0.5);
    const pose = createPoseBuffer(2);
    mixer.evaluate(pose);
    expect(pose.positions[0]).toBeCloseTo(0.5);
    expect(pose.positions[3]).toBeCloseTo(0.5);
  });

  it("does not animate duplicate scene nodes through an ambiguous name", () => {
    const scene = new Scene();
    const first = scene.createNode("Bone");
    const second = scene.createNode("Bone");
    first.transform.setScale(2, 2, 2);
    second.transform.setScale(3, 3, 3);
    scene.root.addChild(first);
    scene.root.addChild(second);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip()] });
    expect(runtime.applyClips([{ clipName: "move", time: 0.5 }]).missingTargets).toContain("Bone.translation");
    expect(first.transform.position[0]).toBe(0);
    expect(second.transform.position[0]).toBe(0);
    expect(first.transform.scale).toEqual([2, 2, 2]);
    expect(second.transform.scale).toEqual([3, 3, 3]);
    runtime.mixer().play("move");
    expect(runtime.applyPoseMixer(0.25).missingTargets).toContain("Bone.translation");
    expect(first.transform.position[0]).toBe(0);
    expect(second.transform.position[0]).toBe(0);
    expect(first.transform.scale).toEqual([2, 2, 2]);
    expect(second.transform.scale).toEqual([3, 3, 3]);
    runtime.dispose();
  });

  it("reports omitted marker occurrences from the public glTF mixer", () => {
    const scene = new Scene();
    const node = scene.createNode("Bone");
    scene.root.addChild(node);
    const binding = createGLTFSceneAnimationMixer({ scene, clips: [clip()] });
    binding.getAction("move")!.maxEventCatchUp = 2;
    const result = binding.update(3.5);
    expect(result.events.map((event) => event.name)).toEqual(["early", "late"]);
    expect(result.eventOverflow).toBe(5);
    expect(node.transform.position[0]).toBeCloseTo(0.5);
    binding.dispose();
  });
});
