/**
 * PoseMixer reference cases from hand-authored clips. Expectations are derived
 * from the keyframes, weights, and playback schedules below, without a second
 * animation runtime or external fixture loader.
 */
import { describe, expect, it } from "vitest";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip.js";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack.js";
import type { Quat, Vec3 } from "../../../packages/animation/src/Keyframe.js";
import { bindSkeleton } from "../../../packages/animation/src/pose/SkeletonBinding.js";
import { createPoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer.js";
import { compileClip } from "../../../packages/animation/src/pose/CompiledClip.js";
import { PoseInertializer } from "../../../packages/animation/src/pose/PoseInertializer.js";
import { PoseMixer } from "../../../packages/animation/src/pose/PoseMixer.js";
import { makeClipAdditive } from "../../../packages/animation/src/pose/makeClipAdditive.js";

const identity: Quat = [0, 0, 0, 1];
const quarterTurnX: Quat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

function zRotation(degrees: number): Quat {
  const halfRadians = degrees * Math.PI / 360;
  return [0, 0, Math.sin(halfRadians), Math.cos(halfRadians)];
}

function vectorTrack(target: string, start: Vec3, end: Vec3, duration: number): AnimationTrack<Vec3> {
  return new AnimationTrack({ target, valueType: "vector3", keyframes: [
    { time: 0, value: start }, { time: duration, value: end }
  ] });
}

function rotationTrack(start: Quat, end: Quat, duration: number): AnimationTrack<Quat> {
  return new AnimationTrack({ target: "Root.rotation", valueType: "quaternion", keyframes: [
    { time: 0, value: start }, { time: duration, value: end }
  ] });
}

function movingClip(): AnimationClip {
  return new AnimationClip({ name: "move", duration: 4, tracks: [
    vectorTrack("Root.translation", [2, 4, 6], [10, 12, 14], 4),
    rotationTrack(identity, zRotation(120), 4),
    vectorTrack("Root.scale", [1, 2, 3], [3, 4, 5], 4)
  ] });
}

function constantClip(name: string, position: Vec3, rotation: Quat, scale: Vec3): AnimationClip {
  return new AnimationClip({ name, duration: 4, tracks: [
    vectorTrack("Root.translation", position, position, 4),
    rotationTrack(rotation, rotation, 4),
    vectorTrack("Root.scale", scale, scale, 4)
  ] });
}

function translationClip(name: string, duration: number, from: number, to: number): AnimationClip {
  return new AnimationClip({ name, duration, tracks: [
    vectorTrack("Root.translation", [from, 0, 0], [to, 0, 0], duration)
  ] });
}

function markedClip(name: string, duration: number, from: number, to: number): AnimationClip {
  return new AnimationClip({
    name, duration,
    tracks: [vectorTrack("Root.translation", [from, 0, 0], [to, 0, 0], duration)],
    events: [
      { name: "early", time: duration * 0.25, payload: { foot: "left" } },
      { name: "late", time: duration * 0.75, payload: { foot: "right" } }
    ]
  });
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeRig(clips: readonly AnimationClip[]) {
  const nodes = [
    { name: "Root", position: [1, 2, 3] as Vec3, rotation: identity, scale: [1, 2, 3] as Vec3 },
    { name: "Child", position: [4, 5, 6] as Vec3, rotation: quarterTurnX, scale: [2, 2, 2] as Vec3 }
  ];
  const skeleton = bindSkeleton({ joints: [0, 1], parentIndices: [-1, 0], resolveNode: (index) => nodes[index] });
  const mixer = new PoseMixer({ skeleton });
  for (const clip of clips) mixer.addClip(clip.name, clip);
  return { mixer, out: createPoseBuffer(skeleton.boneCount) };
}

function expectComponents(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 5));
}

function expectRotation(actual: ArrayLike<number>, expected: Quat): void {
  // q and -q describe the same orientation.
  const direct = Math.hypot(...expected.map((value, index) => actual[index]! - value));
  const negated = Math.hypot(...expected.map((value, index) => actual[index]! + value));
  expect(Math.min(direct, negated)).toBeLessThan(1e-5);
}

function advanceTwoSeconds(mixer: PoseMixer): void {
  for (let frame = 0; frame < 120; frame += 1) mixer.update(1 / 60);
}

describe("PoseMixer independently calculated reference poses", () => {
  it("samples a single clip over 120 frames and preserves an unanimated joint", () => {
    const { mixer, out } = makeRig([movingClip()]);
    const action = mixer.play("move");
    advanceTwoSeconds(mixer);
    mixer.evaluate(out);

    expect(action.time).toBeCloseTo(2, 8);
    expectComponents(out.positions, [6, 8, 10, 4, 5, 6]);
    expectRotation(out.rotations.subarray(0, 4), zRotation(60));
    expectRotation(out.rotations.subarray(4, 8), quarterTurnX);
    expectComponents(out.scales, [2, 3, 4, 2, 2, 2]);

    mixer.update(2.5);
    mixer.evaluate(out);
    expect(action.time).toBeCloseTo(0.5, 8);
    expectComponents(out.positions.subarray(0, 3), [3, 5, 7]);
    expectRotation(out.rotations.subarray(0, 4), zRotation(15));
    expectComponents(out.scales.subarray(0, 3), [1.25, 2.25, 3.25]);
  });

  it("fills the unweighted portion from the rest pose at weight 0.3", () => {
    const { mixer, out } = makeRig([movingClip()]);
    mixer.play("move", { weight: 0.3 });
    advanceTwoSeconds(mixer);
    mixer.evaluate(out);

    // At t=2 the animated root is [6, 8, 10], 60 degrees, [2, 3, 4].
    // The other 0.7 of each channel comes from its captured rest transform.
    expectComponents(out.positions, [2.5, 3.8, 5.1, 4, 5, 6]);
    expectRotation(out.rotations.subarray(0, 4), zRotation(18));
    expectComponents(out.scales, [1.3, 2.3, 3.3, 2, 2, 2]);
  });

  it("normalizes three weighted vectors and blends rotations in activation order", () => {
    const qx: Quat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
    const qy: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    const qz: Quat = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const clips = [
      constantClip("x", [2, 4, 6], qx, [1, 2, 3]),
      constantClip("y", [6, 8, 10], qy, [2, 3, 4]),
      constantClip("z", [10, 12, 14], qz, [4, 5, 6])
    ];
    const { mixer, out } = makeRig(clips);
    mixer.play("x", { weight: 0.5 });
    mixer.play("y", { weight: 0.3 });
    mixer.play("z", { weight: 0.4 });
    advanceTwoSeconds(mixer);
    mixer.evaluate(out);

    expectComponents(out.positions.subarray(0, 3), [17 / 3, 23 / 3, 29 / 3]);
    expectComponents(out.scales.subarray(0, 3), [2.25, 3.25, 4.25]);
    // Analytic spherical interpolation: slerp(slerp(qx, qy, 3/8), qz, 1/3).
    // Using distinct axes makes this sensitive to activation order.
    expectRotation(out.rotations.subarray(0, 4), [
      0.36244939327271436, 0.22784521368593424, 0.2716388706703367, 0.8619334776289853
    ]);
  });

  it("samples step and cubic-spline channels at independently calculated times", () => {
    const clip = new AnimationClip({ name: "curves", duration: 2, tracks: [
      new AnimationTrack<Vec3>({ target: "Root.scale", valueType: "vector3", keyframes: [
        { time: 0, value: [1, 1, 1], interpolation: "step" },
        { time: 1, value: [3, 3, 3] },
        { time: 2, value: [5, 5, 5] }
      ] }),
      new AnimationTrack<Vec3>({ target: "Child.translation", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0], interpolation: "cubicspline", outTangent: [4, 0, 0] },
        { time: 2, value: [0, 0, 0], inTangent: [0, 0, 0] }
      ] })
    ] });
    const { mixer, out } = makeRig([clip]);
    mixer.play("curves");
    mixer.update(0.5);
    mixer.evaluate(out);
    expectComponents(out.scales.subarray(0, 3), [1, 1, 1]);
    // Hermite basis h10(1/4) = 9/64, multiplied by duration 2 and tangent 4.
    expectComponents(out.positions.subarray(3, 6), [9 / 8, 0, 0]);
    mixer.update(0.5);
    mixer.evaluate(out);
    expectComponents(out.scales.subarray(0, 3), [3, 3, 3]);
    expectComponents(out.positions.subarray(3, 6), [1, 0, 0]);
  });

  it("crossfades translation, rotation, and scale over the full fade window", () => {
    const a = constantClip("a", [2, 4, 6], identity, [2, 2, 2]);
    const b = constantClip("b", [10, 12, 14], zRotation(120), [4, 4, 4]);
    const { mixer, out } = makeRig([a, b]);
    const old = mixer.play("a");
    mixer.update(0.5);
    const next = mixer.crossFadeTo("b", 0.4);

    for (let step = 1; step <= 4; step += 1) {
      mixer.update(0.1);
      mixer.evaluate(out);
      const fraction = step / 4;
      expectComponents(out.positions.subarray(0, 3), [2 + 8 * fraction, 4 + 8 * fraction, 6 + 8 * fraction]);
      expectRotation(out.rotations.subarray(0, 4), zRotation(120 * fraction));
      expectComponents(out.scales.subarray(0, 3), Array(3).fill(2 + 2 * fraction));
      expect(next.effectiveWeight).toBeCloseTo(fraction);
    }
    // Decimal 0.1 steps can land just below the scheduled 0.9 endpoint.
    mixer.update(1e-12);
    expect(old.playing).toBe(false);
    expect(mixer.activeActions()).toEqual([next]);
  });

  it("integrates crossfade warp for clips with different durations", () => {
    const { mixer, out } = makeRig([
      translationClip("slow", 4, 0, 4),
      translationClip("fast", 2, 10, 14)
    ]);
    const old = mixer.play("slow");
    mixer.update(1);
    const next = mixer.crossFadeTo("fast", 1, { warp: true });

    // During the fade, the old rate is 1+t and the new rate is 0.5+0.5t.
    // Integrating those linear rates gives each playhead; the poses use the
    // linear fade weights t and 1-t, independently of update granularity.
    const references = [
      { oldTime: 1.28125, nextTime: 0.140625, x: 3.53125 },
      { oldTime: 1.625, nextTime: 0.3125, x: 6.125 },
      { oldTime: 2.03125, nextTime: 0.515625, x: 8.78125 },
      { oldTime: null, nextTime: 0.75, x: 11.5 }
    ];
    for (const reference of references) {
      mixer.update(0.25);
      mixer.evaluate(out);
      if (reference.oldTime !== null) expect(old.time).toBeCloseTo(reference.oldTime, 8);
      expect(next.time).toBeCloseTo(reference.nextTime, 8);
      expect(out.positions[0]).toBeCloseTo(reference.x, 5);
    }
    expect(old.playing).toBe(false);
    mixer.update(0.5);
    mixer.evaluate(out);
    expect(next.time).toBeCloseTo(1.25, 8);
    expect(out.positions[0]).toBeCloseTo(12.5, 5);
  });

  it("adds reference-relative translation, rotation, and scale at half weight", () => {
    const gesture = new AnimationClip({ name: "gesture", duration: 4, tracks: [
      vectorTrack("Root.translation", [4, 4, 4], [8, 0, 12], 4),
      rotationTrack(zRotation(30), zRotation(150), 4),
      vectorTrack("Root.scale", [2, 3, 4], [4, 7, 6], 4)
    ] });
    const additive = makeClipAdditive(gesture);
    const base = constantClip("base", [6, 8, 10], quarterTurnX, [2, 3, 4]);
    const { mixer, out } = makeRig([base, additive]);
    mixer.play("base");
    mixer.play(additive.name, { weight: 0.5, additive: true });
    mixer.update(0);
    mixer.evaluate(out);
    expectComponents(out.positions.subarray(0, 3), [6, 8, 10]);
    expectRotation(out.rotations.subarray(0, 4), quarterTurnX);
    expectComponents(out.scales.subarray(0, 3), [2, 3, 4]);

    advanceTwoSeconds(mixer);
    mixer.evaluate(out);
    // At t=2, the gesture's delta from frame 0 is [2,-2,4], 60 degrees,
    // and [1,2,1]; apply half that delta to the independently sampled base.
    // The base rotates about X and the gesture about Z, so their order matters.
    const c = Math.cos(Math.PI / 12) * Math.SQRT1_2;
    const s = Math.sin(Math.PI / 12) * Math.SQRT1_2;
    expectComponents(out.positions.subarray(0, 3), [7, 7, 12]);
    expectRotation(out.rotations.subarray(0, 4), [c, -s, s, c]);
    expectComponents(out.scales.subarray(0, 3), [2.5, 4, 4.5]);
  });

  it("hands sync-group leadership from idle to walk to run after warped fades", () => {
    const { mixer, out } = makeRig([
      translationClip("idle", 2, 0, 2),
      translationClip("walk", 1, 10, 11),
      translationClip("run", 4, 20, 24)
    ]);
    const idle = mixer.play("idle", { syncGroup: "locomotion" });
    mixer.update(0.5);
    const walk = mixer.crossFadeTo("walk", 0.25, { warp: true, syncGroup: "locomotion" });
    mixer.update(0.125);
    mixer.evaluate(out);
    expect(idle.time).toBeCloseTo(0.65625, 8);
    expect(walk.time).toBeCloseTo(0.328125, 8);
    expect(out.positions[0]).toBeCloseTo(5.4921875, 5);
    mixer.update(0.125);
    expect(idle.playing).toBe(false);
    expect(walk.time).toBeCloseTo(0.4375, 8);

    mixer.update(0.125);
    expect(walk.time).toBeCloseTo(0.5625, 8);
    const run = mixer.crossFadeTo("run", 0.25, { warp: true, syncGroup: "locomotion" });
    mixer.update(0.125);
    mixer.evaluate(out);
    expect(walk.time).toBeCloseTo(0.6640625, 8);
    expect(run.time).toBeCloseTo(2.65625, 8);
    expect(out.positions[0]).toBeCloseTo(16.66015625, 5);
    mixer.update(0.125);
    expect(walk.playing).toBe(false);
    expect(run.time).toBeCloseTo(2.875, 8);
    mixer.update(0.5);
    mixer.evaluate(out);
    expect(mixer.activeActions()).toEqual([run]);
    expect(run.time).toBeCloseTo(3.375, 8);
    expect(out.positions[0]).toBeCloseTo(23.375, 5);
  });
});

describe("PoseMixer serialized playback", () => {
  it("continues a reflected ping-pong action instead of restarting its hidden direction", () => {
    const clip = translationClip("move", 4, 0, 4);
    const source = makeRig([clip]);
    const original = source.mixer.play("move", { loopMode: "pingpong", repetitions: 3 });
    source.mixer.update(4.75);
    expect(original.time).toBeCloseTo(3.25);

    // Replaying only the public time/loop settings loses the reflected
    // direction: a superficially identical restart walks the opposite way.
    const restarted = makeRig([clip]);
    const naive = restarted.mixer.play("move", { loopMode: "pingpong", repetitions: 3 });
    naive.time = original.time;
    source.mixer.update(0.5);
    restarted.mixer.update(0.5);
    expect(original.time).toBeCloseTo(2.75);
    expect(naive.time).toBeCloseTo(3.75);

    const snapshot = JSON.parse(JSON.stringify(source.mixer.serialize({ externalTarget: "rebind" })));
    const restored = makeRig([clip]);
    restored.mixer.restore(snapshot);
    source.mixer.update(0.5);
    restored.mixer.update(0.5);
    expect(restored.mixer.activeActions()[0]!.time).toBeCloseTo(original.time);
    source.mixer.evaluate(source.out);
    restored.mixer.evaluate(restored.out);
    expectComponents(restored.out.positions, [...source.out.positions]);
  });

  it("resumes a warped crossfade, sync group, layer replacement, masks and markers after JSON rebind", () => {
    const clips = [
      markedClip("slow", 4, 0, 4),
      markedClip("fast", 2, 10, 14),
      markedClip("wave", 2, 1, 3),
      markedClip("nod", 3, -1, 2)
    ];
    const source = makeRig(clips);
    source.mixer.setEffectiveTimeScale(0.8);
    source.mixer.play("slow", { loopMode: "pingpong", repetitions: 5, syncGroup: "walk", weight: 0.9 });
    source.mixer.update(5.5); // the leader has reflected at least once
    source.mixer.crossFadeTo("fast", 1.5, { warp: true, syncGroup: "walk", weight: 0.65 });
    source.mixer.playLayer("upper", "wave", {
      mask: new Float32Array([0, 1]), weight: 0.8, loopMode: "pingpong"
    });
    source.mixer.update(0.25);
    source.mixer.playLayer("upper", "nod", {
      mask: new Float32Array([0.75, 0]), blendMode: "additive", weight: 0.6, fadeOutPrevious: 1
    }).fadeIn(1);
    source.mixer.update(0.2);
    source.mixer.evaluate(source.out);

    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));
    const restored = makeRig(clips);
    restored.mixer.restore(saved);
    expect(restored.mixer.serialize({ externalTarget: "rebind" })).toEqual(saved);
    restored.mixer.evaluate(restored.out);
    expectComponents(restored.out.positions, [...source.out.positions]);
    expectComponents(restored.out.rotations, [...source.out.rotations]);
    expectComponents(restored.out.scales, [...source.out.scales]);

    for (const delta of [0.1, -0.35, 0.45, 0.75, 2.4]) {
      expect(restored.mixer.update(delta)).toEqual(source.mixer.update(delta));
      restored.mixer.evaluate(restored.out);
      source.mixer.evaluate(source.out);
      expectComponents(restored.out.positions, [...source.out.positions]);
      expectComponents(restored.out.rotations, [...source.out.rotations]);
      expectComponents(restored.out.scales, [...source.out.scales]);
      expect(restored.mixer.serialize({ externalTarget: "rebind" }))
        .toEqual(source.mixer.serialize({ externalTarget: "rebind" }));
    }
  });

  it("preserves shared per-action masks and the latest layer mask by identity", () => {
    const clips = [markedClip("a", 2, 0, 2), markedClip("b", 2, 2, 4)];
    const source = makeRig(clips);
    const shared = new Float32Array([0.25, 1]);
    source.mixer.playLayer("body", "a", { mask: shared });
    source.mixer.update(0.2);
    source.mixer.playLayer("body", "b", { mask: shared, fadeOutPrevious: 1 });
    source.mixer.update(0.2);

    const restored = makeRig(clips);
    restored.mixer.restore(roundTrip(source.mixer.serialize({ externalTarget: "rebind" })));
    const members = restored.mixer.activeActionEntries().filter(entry => entry.layer === "body");
    expect(members).toHaveLength(2);
    expect(members[0]!.action.layerMask).toBe(members[1]!.action.layerMask);
    members[0]!.action.layerMask![0] = 0.5;
    const next = restored.mixer.playLayer("body", "a", { fadeOutPrevious: 1 });
    expect(next.layerMask).toBe(members[0]!.action.layerMask);
    expect(next.layerMask![0]).toBe(0.5);
  });

  it("rebases a separately restored action's fade and warp onto the destination clock", () => {
    const clip = markedClip("move", 4, 0, 4);
    const source = makeRig([clip]);
    const action = source.mixer.play("move", { loopMode: "pingpong", repetitions: 3, weight: 0.8 });
    action.fadeTo(0.2, 2).warp(-1, 2, 2);
    source.mixer.update(0.4);
    const saved = roundTrip(action.serialize());

    const destination = makeRig([clip]);
    destination.mixer.update(3);
    const restored = destination.mixer.play("move", { loopMode: "pingpong", repetitions: 3 });
    restored.restore(saved);
    expect(restored.time).toBe(action.time);
    expect(restored.effectiveWeight).toBe(action.effectiveWeight);
    for (const delta of [0.2, 0.4, 0.75, 0.5]) {
      const originalEvents = source.mixer.update(delta).map(({ event, direction, loopCount }) => [event.name, direction, loopCount]);
      const restoredEvents = destination.mixer.update(delta).map(({ event, direction, loopCount }) => [event.name, direction, loopCount]);
      expect(restoredEvents).toEqual(originalEvents);
      expect(restored.time).toBeCloseTo(action.time, 8);
      expect(restored.effectiveWeight).toBeCloseTo(action.effectiveWeight, 8);
      expect(restored.effectiveTimeScale).toBeCloseTo(action.effectiveTimeScale, 8);
    }
  });

  it("rebinds equivalent skeletons with new node identities and rejects mismatched targets", () => {
    const clip = markedClip("move", 4, 0, 4);
    const source = makeRig([clip]);
    source.mixer.play("move");
    source.mixer.update(0.75);
    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));

    const joints = [
      { name: "Root", position: [1, 2, 3] as Vec3, rotation: identity, scale: [1, 2, 3] as Vec3 },
      { name: "Child", position: [4, 5, 6] as Vec3, rotation: quarterTurnX, scale: [2, 2, 2] as Vec3 }
    ];
    const skeleton = bindSkeleton({
      joints: [7, 21], parentIndices: [-1, 0], resolveNode: index => index === 7 ? joints[0] : joints[1]
    });
    const target = new PoseMixer({ skeleton });
    target.addClip("move", clip).restore(saved);
    target.update(0.5);
    source.mixer.update(0.5);
    expect(target.activeActions()[0]!.time).toBe(source.mixer.activeActions()[0]!.time);

    const wrongRest = makeRig([clip]);
    wrongRest.mixer.skeleton.restPose.positions[0] = 99;
    expect(() => wrongRest.mixer.restore(saved)).toThrow(/skeleton|target/i);
    const wrongAction = wrongRest.mixer.play("move");
    expect(() => wrongAction.restore(saved.actions[0]!.action)).toThrow(/skeleton|target/i);
    const wrongBinding = makeRig([clip]);
    (wrongBinding.mixer.skeleton.jointIndicesByName as Map<string, readonly number[]>).set("Root", [1]);
    expect(() => wrongBinding.mixer.restore(saved)).toThrow(/skeleton|target|binding/i);
  });

  it("rejects clip and compiled-sample mismatches without changing the destination", () => {
    const clip = markedClip("move", 4, 0, 4);
    const source = makeRig([clip]);
    source.mixer.play("move");
    source.mixer.update(1);
    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));

    const different = makeRig([markedClip("move", 4, 0, 8)]);
    const existing = different.mixer.play("move");
    different.mixer.update(0.25);
    const before = different.mixer.serialize({ externalTarget: "rebind" });
    expect(() => different.mixer.restore(saved)).toThrow(/identity|clip/i);
    expect(different.mixer.serialize({ externalTarget: "rebind" })).toEqual(before);
    expect(different.mixer.activeActions()).toEqual([existing]);

    const mutatedCompiled = compileClip(clip);
    mutatedCompiled.tracks[0]!.values[0] = 99;
    const wrongCompiled = makeRig([]);
    wrongCompiled.mixer.addCompiledClip("move", mutatedCompiled, clip);
    expect(() => wrongCompiled.mixer.restore(saved)).toThrow(/compiled.*identity|identity.*compiled/i);
    expect(() => makeRig([]).mixer.restore(saved)).toThrow(/clip|registered/i);
  });

  it("rebinds the complete clip catalog, including inactive aliases and additive defaults", () => {
    const first = markedClip("a", 2, 0, 2);
    const second = markedClip("b", 3, 2, 5);
    const additive = makeClipAdditive(markedClip("gesture", 2, 3, 4));
    const source = makeRig([first, second, additive]);
    source.mixer.addClip("alias", first);
    source.mixer.play("alias");
    source.mixer.update(0.2);
    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));

    const reordered = makeRig([additive, second, first]);
    reordered.mixer.addClip("alias", first);
    reordered.mixer.restore(saved);
    expect(reordered.mixer.activeActions()[0]!.clipName).toBe("alias");
    expect(reordered.mixer.serialize({ externalTarget: "rebind" })).toEqual(saved);
    expect(() => makeRig([first]).mixer.restore(saved)).toThrow(/clip|catalog/i);
    const unmarked = AnimationClip.fromJSON(additive.toJSON());
    const wrongAdditive = makeRig([first, second, unmarked]);
    wrongAdditive.mixer.addClip("alias", first);
    expect(() => wrongAdditive.mixer.restore(saved)).toThrow(/clip|catalog/i);
  });

  it("rejects malformed later actions atomically, retaining action handles and listeners", () => {
    const clips = [markedClip("a", 2, 0, 2), markedClip("b", 2, 2, 4)];
    const source = makeRig(clips);
    source.mixer.play("a");
    source.mixer.playLayer("upper", "b", { mask: new Float32Array([0, 1]) });
    source.mixer.update(0.3);
    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));

    const destination = makeRig(clips);
    const old = destination.mixer.play("a");
    destination.mixer.update(0.1);
    const before = destination.mixer.serialize({ externalTarget: "rebind" });
    let calls = 0;
    const unsubscribe = destination.mixer.onEvent(() => { calls++; });
    const invalid = JSON.parse(JSON.stringify(saved));
    invalid.layers[0].actions[0].action.playback.state.loopsCompleted = -1;
    expect(() => destination.mixer.restore(invalid)).toThrow();
    expect(destination.mixer.activeActions()).toEqual([old]);
    expect(old.playing).toBe(true);
    expect(calls).toBe(0);
    unsubscribe();
    expect(destination.mixer.serialize({ externalTarget: "rebind" })).toEqual(before);
  });

  it("preflights non-writable destination actions before changing any live state", () => {
    const clips = [markedClip("a", 2, 0, 2), markedClip("b", 2, 2, 4)];
    const source = makeRig(clips);
    source.mixer.play("a");
    source.mixer.play("b");
    source.mixer.update(0.5);
    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));

    const destination = makeRig(clips);
    const first = destination.mixer.play("a");
    const second = destination.mixer.play("b");
    destination.mixer.update(0.25);
    const before = destination.mixer.serialize({ externalTarget: "rebind" });
    Object.freeze(second);
    expect(() => destination.mixer.restore(saved)).toThrow(/non-writable/i);
    expect(destination.mixer.activeActions()).toEqual([first, second]);
    expect(first.playing).toBe(true);
    expect(second.playing).toBe(true);
    expect(destination.mixer.serialize({ externalTarget: "rebind" })).toEqual(before);
    expect(() => second.restore(saved.actions[1]!.action)).toThrow(/non-writable/i);
    expect(second.time).toBeCloseTo(0.25);
  });

  it("rejects unsupported versions, bad envelopes and invalid masks without partial restore", () => {
    const clip = markedClip("move", 2, 0, 2);
    const source = makeRig([clip]);
    source.mixer.play("move").warp(-1, 2, 1);
    source.mixer.playLayer("upper", "move", { mask: new Float32Array([0, 1]) });
    source.mixer.update(0.25);
    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));
    const badVersion = JSON.parse(JSON.stringify(saved));
    badVersion.version = 2;
    const badWarp = JSON.parse(JSON.stringify(saved));
    badWarp.actions[0].action.warp.duration = 0;
    const badMask = JSON.parse(JSON.stringify(saved));
    badMask.layers[0].mask = 999;
    const badNumber = JSON.parse(JSON.stringify(saved));
    badNumber.timeScale = NaN;

    for (const invalid of [badVersion, badWarp, badMask, badNumber]) {
      const destination = makeRig([clip]);
      const old = destination.mixer.play("move");
      destination.mixer.update(0.1);
      const before = destination.mixer.serialize({ externalTarget: "rebind" });
      expect(() => destination.mixer.restore(invalid)).toThrow();
      expect(destination.mixer.activeActions()).toEqual([old]);
      expect(destination.mixer.serialize({ externalTarget: "rebind" })).toEqual(before);
    }
  });

  it("preserves paused, clamped and finite-repeat playback with bounded event overflow", () => {
    const clip = markedClip("move", 2, 0, 2);
    const source = makeRig([clip]);
    const repeating = source.mixer.play("move", { loopMode: "pingpong", repetitions: 2, clampWhenFinished: true });
    repeating.maxEventCatchUp = 1;
    source.mixer.update(2.4);
    expect(source.mixer.lastEventOverflow).toBeGreaterThan(0);
    const restored = makeRig([clip]);
    restored.mixer.restore(roundTrip(source.mixer.serialize({ externalTarget: "rebind" })));
    expect(restored.mixer.lastEventOverflow).toBe(source.mixer.lastEventOverflow);
    for (const delta of [0.5, 1, 2]) {
      expect(restored.mixer.update(delta)).toEqual(source.mixer.update(delta));
      expect(restored.mixer.serialize({ externalTarget: "rebind" }))
        .toEqual(source.mixer.serialize({ externalTarget: "rebind" }));
    }
    const held = restored.mixer.activeActions()[0]!;
    expect(held.paused).toBe(true);
    expect(held.clampWhenFinished).toBe(true);
    restored.mixer.evaluate(restored.out);
    source.mixer.evaluate(source.out);
    expectComponents(restored.out.positions, [...source.out.positions]);
  });

  it("round-trips inactive inertializer history and reuses it for a later transition", () => {
    const clips = [markedClip("a", 2, 0, 2), markedClip("b", 2, 2, 4)];
    const rig = makeRig(clips);
    const source = new PoseMixer({ skeleton: rig.mixer.skeleton, inertializer: new PoseInertializer(2) });
    for (const clip of clips) source.addClip(clip.name, clip);
    source.play("a");
    source.update(0.2);
    source.evaluate(rig.out);
    source.update(0.2);
    source.evaluate(rig.out);
    const saved = roundTrip(source.serialize({ externalTarget: "rebind" }));

    const targetRig = makeRig(clips);
    const target = new PoseMixer({ skeleton: targetRig.mixer.skeleton, inertializer: new PoseInertializer(2) });
    for (const clip of clips) target.addClip(clip.name, clip);
    target.restore(saved);
    expect(target.serialize({ externalTarget: "rebind" })).toEqual(saved);
    source.crossFadeTo("b", 0.5, { transition: "inertialize", halfLife: 0.2 });
    target.crossFadeTo("b", 0.5, { transition: "inertialize", halfLife: 0.2 });
    for (const delta of [0, 0.1, 0.3]) {
      source.update(delta);
      target.update(delta);
      source.evaluate(rig.out);
      target.evaluate(targetRig.out);
      expectComponents(targetRig.out.positions, [...rig.out.positions]);
      expectComponents(targetRig.out.rotations, [...rig.out.rotations]);
      expectComponents(targetRig.out.scales, [...rig.out.scales]);
    }
  });

  it("requires explicit target rebind and rejects listeners, callbacks, bad data and unsupported transitions", () => {
    const clip = markedClip("move", 4, 0, 4);
    const source = makeRig([clip]);
    const action = source.mixer.play("move");
    expect(() => source.mixer.serialize()).toThrow(/target.*rebind|rebind.*target/i);
    const unsubscribe = source.mixer.onEvent(() => {});
    expect(() => source.mixer.serialize({ externalTarget: "rebind" })).toThrow(/callback|listener/i);
    unsubscribe();
    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));

    const callbackClip = new AnimationClip({
      name: "callback", duration: 1, tracks: [vectorTrack("Root.translation", [0, 0, 0], [1, 0, 0], 1)],
      events: [{ name: "event", time: 0.5, payload: { callback: () => {} } }]
    });
    const callbacks = makeRig([callbackClip]);
    expect(() => callbacks.mixer.serialize({ externalTarget: "rebind" })).toThrow(/serializ|callback/i);
    callbacks.mixer.play("callback");
    expect(() => callbacks.mixer.serialize({ externalTarget: "rebind" })).toThrow(/serializ|callback/i);

    const malformed = JSON.parse(JSON.stringify(saved));
    let accessorCalled = false;
    Object.defineProperty(malformed.actions[0].action, "callback", {
      enumerable: true, get: () => { accessorCalled = true; return () => {}; }
    });
    expect(() => makeRig([clip]).mixer.restore(malformed)).toThrow(/accessor|callback|unsupported/i);
    expect(accessorCalled).toBe(false);
    action.layerMask = new Float32Array([NaN, 0]);
    expect(() => action.serialize()).toThrow(/finite|serializ/i);
    const modified = makeRig([clip]).mixer.play("move");
    (modified as unknown as { playback: Record<string, unknown> }).playback.callback = () => {};
    expect(() => modified.serialize()).toThrow(/callback|custom/i);

    const inertial = new PoseMixer({ skeleton: source.mixer.skeleton, inertializer: new PoseInertializer(2) });
    inertial.addClip("move", clip).addClip("next", markedClip("next", 4, 4, 8));
    inertial.play("move");
    inertial.update(0.1);
    inertial.evaluate(createPoseBuffer(2));
    inertial.update(0.1);
    inertial.evaluate(createPoseBuffer(2));
    inertial.crossFadeTo("next", 1, { transition: "inertialize" });
    expect(() => inertial.serialize({ externalTarget: "rebind" })).toThrow(/active inertializer/i);
  });

  it("rejects capture and restore during marker dispatch, without firing listeners during restore", () => {
    const clip = markedClip("move", 4, 0, 4);
    const source = makeRig([clip]);
    const action = source.mixer.play("move");
    const saved = roundTrip(source.mixer.serialize({ externalTarget: "rebind" }));
    let calls = 0;
    source.mixer.onEvent(() => {
      calls++;
      expect(() => source.mixer.serialize({ externalTarget: "rebind" })).toThrow(/during an update/i);
      expect(() => source.mixer.restore(saved)).toThrow(/during an update/i);
      expect(() => action.restore(saved.actions[0]!.action)).toThrow(/during an update/i);
    });
    source.mixer.update(1.1);
    expect(calls).toBe(1);
    source.mixer.restore(saved);
    expect(calls).toBe(1);
    expect(action.playing).toBe(false);
    source.mixer.update(1.1);
    expect(calls).toBe(2);
  });
});
